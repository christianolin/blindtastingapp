# Scan photos — design

Date 2026-09-19. Base `master` at `4995d6a` (worktree `blindtastingapp-scanphotos`, branch `scanphotos`). One migration (`20260919183100_catalog_wine_photos.sql`): one table, one RPC, one trigger, one index. No backfill. No Anthropic API call anywhere in this work: agent-side tests use `LABEL_READ_FIXTURE`.

## 1. Goal

Owner, verbatim: "i think if the same wine is scanned multiple times it could be cool to save all of those pictures in the catalog - however only if it doesnt take up too much space".

The owner then approved this plan:

- Shrink new scans to about 1,500 px on the long side.
- Show a photo strip under the main photo on the wine page.
- Never attach scans added to a blind tasting.
- Let whoever took a photo remove it from the strip. The file stays.

So every label scan that lands on a catalog wine becomes one of that wine's photos, as do uploads made on the wine page. Flight scans are the exception. The wine page keeps its one main photo and gains a "More photos" strip.

## 2. Facts (read-only, live, 2026-09-19)

**Storage (`wine-images`, 192 objects, every one with an `owner`).**

| Kind | Objects | Total | Average | Dates |
|---|---|---|---|---|
| Scans, `catalog/staging/<uid>/scan-*.jpg` | 162 | 273.5 MB | 1,688 KB | 2026-08-02 → 2026-09-19 |
| Other staging uploads (by-hand label photos, `<ts>-<rand>.<ext>`) | 15 | 33.0 MB | 2,203 KB | 2026-07-31 → 2026-08-09 |
| Wine-page uploads, `catalog/<wineId>/…` | 12 | 1.0 MB | 82 KB | 2026-07-31 → 2026-08-02 |
| Other | 3 | ~0 | 10 KB | 2026-07-16 |

**The space problem is mostly historical.**

- Commit `805adf0` (2026-09-13) added `downscaleForRead`: `src/components/add-wine/downscale-image.ts`, 1600 px long edge, JPEG 0.85, EXIF orientation respected.
- Every scan from 2026-09-13 on weighs 12–195 KB, most of them 40–90 KB. Scans before that average about 2 MB, up to 3.4 MB.
- Camera captures are video frames. `use-camera.ts` asks `getUserMedia` for no width or height, so the frame arrives at the browser's default stream size, then passes through `downscaleForRead`.
- `label_reads` shows the same break:
  - full-size photos cost 8,711–8,912 input tokens per read;
  - downscaled camera frames cost 4,586–4,687;
  - two larger picks cost 5,863 and 6,129.

  All 33 billed reads are `ok`.
- `ImageUploader` (`src/components/image-uploader.tsx`) still uploads the original file, with no resize. That is the 2.2 MB average in the second row.

**The reader's size.** Claude Sonnet 5 (`claude-sonnet-5`, the reader) accepts up to **2,576 px** on the long edge (claude-api skill, `shared/model-migration.md`, Sonnet 5 section). 1,568 px was the Sonnet 4.6 limit. So 1,568 is not the size the reader "works at". It is a storage choice that keeps reads at the fidelity they have had since 2026-09-13 (≤ 1,600 px, every read `ok`), with slightly fewer image tokens.

**Code.**

- `catalog_wines.image_url` is the one main photo.
- `fillCatalogWine` (`src/lib/wine-identity/server/write.ts:412-438`) fills it from `draft.imageUrl` only when it is blank and the caller created the wine.
- So a scan of someone else's wine is not kept on that wine today. That gap is what this feature fills.

**Policies.**

- `catalog read`: `(NOT blind_pending) OR created_by = auth.uid() OR can_read_blind_pending_catalog_wine(id)`.
- `wine_answers read`, `wines read` and `revealed wines are public` are as in CLAUDE.md.
- `label_reads`: owner-only SELECT and INSERT.
- `profiles read`: `true`.
- `storage.objects` on `wine-images`:
  - SELECT for `public`, the whole bucket;
  - INSERT under `catalog/**` for any authenticated user;
  - INSERT under a `<tastingId>/` folder for host or participant;
  - UPDATE and DELETE the same way ("wine image write update" / "wine image write delete": any authenticated caller, any object under `catalog/**`), until the pending `20260919162300` lockdown removes client UPDATE and DELETE. This feature **requires** that lockdown (§6.7), and the migration refuses to apply before it (§6.1 item 8).
- The `postgres` role has `rolbypassrls` and SELECT on `storage.objects`, so a SECURITY DEFINER function can read object rows. It does not own `storage.objects` (`supabase_storage_admin` does) and is not a member of that role.
- `cellar_lots`' only read policy, "cellar own select", is `(owner_id = auth.uid()) OR can_view_cellar(owner_id)`. `can_view_cellar(uuid)` is SECURITY DEFINER, EXECUTE for `authenticated`: PUBLIC → everyone, FRIENDS → a friendship in either direction, PRIVATE → nobody else. Live, 29 of 33 profiles are PRIVATE, 2 FRIENDS, 2 PUBLIC.
- `wset notes read` admits every signed-in user to any note that names a wine (`num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1`), so a note is already a public trace of its author and time.

**Account deletion (`20260919101300`, live).**

- `scrub_deleted_account` locks the profile FOR UPDATE and deletes `label_reads`.
- It stamps `profiles.deleted_at` last. `profiles_deleted_guard` stops clients from setting or clearing it.
- `profiles` triggers are exactly `profiles_deleted_guard` and `profiles_sync_is_curator`.

**Version `20260919183100` is free.**

- Live, the newest version was `20260919101300` at the first dump; `20260919141700` (profile favourites) has gone live since. The wine-images write lockdown `20260919162300` must go live next, before this file (§6.1 item 8).
- `origin/master` ends at `20260919101300`.
- Worktrees: the main tree has the untracked `20260919162300`, and `blindtastingapp-favs` has `20260919141700`. No worktree has `20260919183100`.

## 3. Decisions

- **D1 Downscale.** One helper module, `src/lib/images/`, is used by the scan upload, the camera capture and `ImageUploader`.
  - Long edge at most **1,568 px**; JPEG quality **0.82**; never upscale.
  - EXIF orientation is applied (`createImageBitmap(…, { imageOrientation: "from-image" })`, as today). Transparency is painted white.
  - Scans are always re-encoded. The reader needs a JPEG, and the path must end `.jpg`. A photo the browser cannot decode stays today's failed row (`"image"`).
  - `ImageUploader` falls back to the original file when it cannot decode. It also keeps an original JPEG that is already within 1,568 px when the re-encode would be no smaller.
  - `ImageUploader` serves both `wine-images` and tasting covers (`tasting-images`), so covers get the helper as well. That is trivially safe: one code path, and covers display well under 1,568 px.
  - `avatar-uploader.tsx` is not touched. It is a separate component that overwrites with `upsert: true`.
- **D2 One table.** `catalog_wine_photos`: one row per (wine, object path).
  - `catalog_wines.image_url` stays the main photo, with unchanged rules.
  - A photo that equals the main photo is attached too, but the strip leaves it out (§8). If a creator later replaces the main photo, the old scan still shows in the strip.
- **D3 Attach points.** A scan attaches only after its add has landed as `catalog`, `cellar` or `note`, and where it landed is stored as the photo's `via`. The rule keys on where the add landed (`AddedWine.destination`, or a note pick), never on the sheet's requested destination, so the header camera's chooser behaves correctly. A flight add never attaches, including the chooser's "Tonight's flight" (§5). A **cellar** scan is read only by its photographer and whoever can already see their cellar (`can_view_cellar`, the gate `cellar_lots` uses), never by everyone (§3.1). A wine-page upload is `via = 'upload'`. Attaching never blocks or undoes an add; a failure is logged.
- **D4 Wine-page uploads attach too.** The creator or a curator still replaces the main photo, as today, and the upload also lands in the strip. Anyone else's upload goes straight to the strip. It used to fail with "Only the wine's creator or a curator can set its photo." (§8.4).
- **D5 Remove.** The photographer can remove their own photo from the wine (DELETE of the row). The storage object is never deleted, moved or rewritten.
- **D6 Account deletion.** An AFTER UPDATE OF `deleted_at` trigger on `profiles` deletes the person's photo rows when `scrub_deleted_account` stamps them. The files stay.
- **D7 Caps.** At most 12 photos per person per wine. An object over 5 MB is refused, which only a fallback original can reach.
- **D8 No backfill.** The 162 existing scans cannot be matched to wines reliably. Only new scans attach.
- **D9 Version** `20260919183100`, verified absent as in §2. The probe's before-phase re-checks it, and so does `scratch-apply --mode dry`. The main session applies live.

### 3.1 Deviations from the brief (rule 1), for the main session to accept or overrule

The brief asked for two things:

- Photos hidden (SELECT) while the wine is linked to any unrevealed glass.
- The RPC to refuse any attach to such a wine.

As written, both leak an unrevealed wine to people who did not add it:

- **The hide is a one-query oracle.** A participant uses a second account to put one photo on every catalog wine the day before. During the tasting, the participant runs `select catalog_wine_id from catalog_wine_photos` from their main account. Every wine whose photo vanished is in someone's unrevealed flight. The same works one wine at a time, by watching a host's cellar-scan photos disappear on the evening they pour them.
- **The general refusal is an oracle too.** Anyone can upload one image on a wine's page (free, no label read) and read whether the attach was refused.

This design instead enforces rule 1 at write time, for the only person who knows the wine:

- **The RPC refuses the glass's own adder** (`unrevealed-glass`) while any unrevealed glass they added links the wine. That means the host for a host-added glass, and the contributor for a bring-your-own bottle. The refusal tells them nothing they do not already know. It is lifted by the reveal.
- **Everyone else's attach behaves the same whether or not the wine is poured anywhere.** Nothing already visible is hidden later, except by the existing `blind_pending` flip, which hides the whole wine page as today.
- **Added:** `flight-photo`, a database backstop for the owner's rule. The RPC refuses a path that is the answer-key photo (`wine_answers.image_url`) of a glass the caller added, revealed or not. It also refuses the `imageUrl` of one of the caller's own `wine_identity_drafts`. The app never sends such a path (D3). This stops a client bug from ever doing so, and it only looks at the caller's own glasses, so it is no oracle either.
- **Probe wording follows.** The brief's "a wine behind an unrevealed glass refused, then allowed after the reveal" now reads: "refused for its adder, then allowed after the reveal; accepted, and indistinguishable from an unpoured wine, for anyone else" (§9 P4).

**Cellar scans follow the cellar's own visibility (review finding, 2026-09-19).** An earlier draft made every photo readable by every signed-in user and accepted the host's pre-glass cellar scan as "the same signal a PUBLIC or FRIENDS cellar already gives". That premise was false:

- 29 of 33 live profiles have a PRIVATE cellar, and a FRIENDS cellar is not visible to everyone.
- The normal host flow is scan into the cellar, then pour from it (D11). Because the host's lot exists, `catalog_wine_mark_blind` never flips the wine to `blind_pending`, so the photo would stay visible all evening.
- Reproduced in a rolled-back transaction: a JOINED guest with `can_view_cellar(host) = false`, 0 visible lots and 0 visible answer-key rows still named tonight's wine with one query, `select catalog_wine_id from catalog_wine_photos where added_by = '<host>' and created_at > now() - interval '1 day'`.

The fix is static, never a glass test (a glass test is the oracle above):

- The table records `via`: `'upload'`, `'catalog'`, `'cellar'` or `'note'`.
- The read policy admits a `'cellar'` row only to its photographer or when `can_view_cellar(added_by)` holds, the very gate of `cellar_lots`' own read policy. A cellar scan therefore tells a reader nothing the lot itself does not already tell them, poured or not.
- The RPC takes `via` from the client for a staging scan (catalog, cellar or note, else `bad-path`) and stores `'upload'` for a wine-page upload whatever it is sent. A client can only choose its own photo's audience.

**Accepted residual (corrected).** The adder's photos from before the glass existed stay visible **to whoever could already see them**:

- A cellar scan: exactly those who can see the photographer's cellar lots, which already name the wine and the lot's time. A PRIVATE cellar's scan is seen by nobody else.
- A note scan: everyone, the same as the note itself (`wset notes read` is public for a note that names a wine). A note pick attaches at pick time, so a pick dropped with "Keep going" leaves the photo without the note (§5).
- A catalog scan or a wine-page upload: everyone. When the wine is new, its catalog row already names its creator. When it already existed, the add used to write nothing and now leaves a public trace, the photographer and a timestamp (§12 R6).

Hiding any of these later would bring back the vanishing oracle above.

## 4. The downscale helper

**`src/lib/images/downscale-math.ts`** is pure, with relative imports only (vitest has no `@/` alias).

```ts
export const PHOTO_MAX_EDGE = 1568;
export const PHOTO_JPEG_QUALITY = 0.82;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // mirrors the RPC's 5 MB refusal

export type Size = { width: number; height: number };

/** The long edge at most `maxEdge`, aspect kept, never upscaled, each side ≥ 1 (Math.round).
    Throws RangeError for a side that is not a finite number > 0. */
export function fitWithin(size: Size, maxEdge = PHOTO_MAX_EDGE): Size & { scaled: boolean };

/** ImageUploader only: upload the original when the decode failed (encodedSize null), or when the
    original is a JPEG that needed no scaling and the re-encode is not smaller. */
export function keepOriginal(o: { type: string; size: number; scaled: boolean; encodedSize: number | null }): boolean;

/** "jpg" for a re-encoded blob; otherwise the original name's extension, lower-cased, [a-z0-9]{1,5}, else "jpg". */
export function uploadExtension(reencoded: boolean, fileName: string): string;
```

**`src/lib/images/downscale.ts`** runs in the browser only. Nothing browser-only runs at module load.

- `export class ImageDecodeError extends Error {}`, moved from `downscale-image.ts`.
- `export async function toScanJpeg(file: Blob): Promise<Blob>`: today's `downscaleForRead` body, with `fitWithin` and the constants above. It throws `ImageDecodeError`.
- `export async function prepareUpload(file: File): Promise<{ blob: Blob; contentType: string; extension: string }>`: tries the same encode and applies `keepOriginal`. It never throws.

**Callers.**

- `add-wine-sheet.tsx:660` calls `toScanJpeg` instead of `downscaleForRead`.
- `use-camera.ts` drops `READ_MAX_SIDE`. `capture` uses `fitWithin(video size)` and `PHOTO_JPEG_QUALITY`.
  - It must import them by the **relative** path `../../lib/images/downscale-math`, not `@/…`.
  - Reason: `use-camera.test.ts` imports `./use-camera`, and vitest has no `@/` alias.
- `ImageUploader` calls `prepareUpload`. It uploads with `{ contentType }`, and the path ends in `uploadExtension(...)`.
- `src/components/add-wine/downscale-image.ts` is deleted. Its only importers are those two add-wine files.

**Tests (`downscale-math.test.ts`), written first.**

- `fitWithin`:
  - {4032, 3024} → {1568, 1176, scaled}; {3024, 4032} → {1176, 1568}.
  - {3000, 2001} → {1568, 1046}.
  - {1568, 1000} is unchanged and unscaled; {800, 600} is unchanged (never upscale).
  - {1569, 1} → {1568, 1}; {10000, 10} → {1568, 2}.
  - `maxEdge` 1600 is honoured.
  - A side of 0, −1, NaN or Infinity throws RangeError.
- `keepOriginal`:
  - `encodedSize` null → true.
  - Scaled → false.
  - Unscaled JPEG with original ≤ encoded → true; unscaled JPEG with encoded smaller → false.
  - Unscaled PNG → false.
- `uploadExtension`:
  - Re-encoded → "jpg".
  - "IMG_1.HEIC" → "heic".
  - "noext" → "jpg"; "a.toolongext" → "jpg".

## 5. Attach points in the add flow

Everything below is in `src/components/add-wine/use-sheet-adds.ts`. It is the adds hook, one of the two places spec G.1 lets branch on where a wine goes.

**Capture the path when the add starts.**

- `AddContext` gains `imagePath: string | null`.
- `contextFor` sets it to `s.items.find((i) => i.id === itemId)?.imagePath ?? null`, where `itemId = addTargetId(s)`.
- It is captured at the start because the reducer may drop or restate the row before the reply lands.
- `handOff`'s `from` becomes `Pick<AddContext, "itemId" | "byHand" | "ticket" | "imagePath">`.

**A new pure module, `src/components/add-wine/scan-photo.ts`, with its test.**

```ts
export type ScanPhotoTarget = { catalogWineId: string; imagePath: string; via: ScanVia }; // ScanVia = "catalog" | "cellar" | "note"
/** The catalog wine a scanned bottle's photo joins once its add has landed, or null. An allow-list:
    cellar, catalog and note attach, each as its own `via`; flight and anything added later do not.
    The path must be a staging scan (catalog/staging/<id>/scan-….jpg). */
export function scanPhotoTarget(
  landed: { destination: string; catalogWineId: string | null },
  imagePath: string | null,
): ScanPhotoTarget | null;
```

`via` is `landed.destination`, so a cellar add always reaches the database as a cellar scan, which the read policy keeps as private as the cellar (§3.1).

It is used at exactly two points, as fire-and-forget calls. They are never run through `call()`: they must not take `busy` or block the next add.

```ts
function attachScan(target: ScanPhotoTarget | null): void {
  if (target === null) return;
  void attachCatalogWinePhoto(target)
    .then((r) => { if (!r.ok) console.error("add-wine sheet: scan photo not attached", { status: r.status }); })
    .catch((e) => console.error("add-wine sheet: scan photo not attached", e instanceof Error ? e.message : typeof e));
}
```

1. **`landed(ctx, result)`** (`use-sheet-adds.ts:307`). First line: `attachScan(scanPhotoTarget(result.added, ctx.imagePath))`. `landed` runs for every ok add that `execute` settles:
   - `write()` for **catalog**: the confirm's "Yes, that is the wine" / "Add it", By hand's "Add to the catalog", and Many rows.
   - `write()` for **cellar**: "+1 bottle", when the bottle in hand is a scan.
   - **`lotAdd` and `lotMerge`** (cellar). Their context comes from the lot step, whose `addTargetId` is still the scanned bottle when the step was opened from its confirm or its by-hand save.
   - It fires for a stale-ticket reply too, since the add did happen. It does not fire for a refusal (`fail`).
2. **`handOff(pick, from)`** (`use-sheet-adds.ts:441`), for a **note**. First line: `attachScan(scanPhotoTarget({ destination: "note", catalogWineId: pick.catalogWineId }, from.imagePath))`. This covers:
   - C1/C2 "Start the note" on a matched read;
   - `pickForNote`'s catalog-first write;
   - the by-hand-first chain, whose save re-enters `runAdd`;
   - E1's "Rate it now".

   The photo attaches when the pick is made, even if the pick is then held in the close-ask and later dropped with "Keep going". The photo is still of that wine. `followUpNote` passes `imagePath: null`, because D3's catalog add already attached it.

**Never attached**, by construction (`scanPhotoTarget` returns null or the call is never reached):

- A **flight** add. `addToFlight` lands with `destination: "flight"`: an incomplete glass, an unidentified glass, "Leave it for later" into a flight, and a glass from the header camera's "Tonight's flight" hint.
- `writeSwap` and `saveGlass` (Edit, finish, Swap). They land through `glassSaved`, never `landed`.
- `catalogThenLot`'s intermediate catalog write. Its bottle attaches when the lot step's add lands.
- **"Don't add it"** (`lotSkip`), which writes nothing.
- Any add with no scan in hand: search rows, cellar rows, By hand from scratch, `preselect` routes.
- By-hand **manual** "Label photo" uploads (`catalog/staging/<uid>/<ts>-<rand>.<ext>`, `by-hand-form.tsx:926`). They are not scans, so they are out of scope (§12).

The header camera (`destination` null) follows the same rules: whatever the chooser adopted decides where the add lands.

**Tests (`scan-photo.test.ts`), written first.**

- "flight" with a wine id and a scan path → null.
- "catalog", "cellar" and "note" → the target, with `via` equal to that destination ("cellar" stays "cellar").
- "upload" → null (the wine page's via, never a scan's).
- `catalogWineId` null → null.
- `imagePath` null → null.
- A non-scan path, such as `catalog/staging/u/123-abc.png`, `u/scan-1.jpg` or `https://…`, → null.
- An unknown destination string → null.

## 6. The SQL (`supabase/migrations/20260919183100_catalog_wine_photos.sql`)

Header comment and assert style as in `20260918130500_platform_invites.sql`. Write it against a fresh read-only dump of live, not old migration files. No begin/commit: the applier owns the transaction. `set local lock_timeout = '10s'`.

### 6.1 Pre-state (one `do` block; every check a `raise exception`)

1. **Nothing this file creates exists yet.**
   - No `public.catalog_wine_photos` table.
   - No function named `attach_catalog_wine_photo` or `drop_deleted_account_catalog_wine_photos`, in any signature.
   - No trigger `profiles_drop_catalog_wine_photos`.
   - No index `wine_answers_catalog_wine_id_idx`, and no index whose only key is `wine_answers(catalog_wine_id)`.
   - No `schema_migrations` row `20260919183100`.
2. **Account deletion is applied.**
   - `profiles.deleted_at` is a nullable `timestamptz` with no default.
   - `profiles` has exactly the non-internal triggers `profiles_deleted_guard` and `profiles_sync_is_curator`.
   - `profiles` has `PRIMARY KEY (id)`.
3. **`catalog_wines`.**
   - `id uuid` is the PK; `blind_pending boolean not null`; `merged_into uuid`.
   - Policy `catalog read` exists with exactly the qual in §2. The photo read policy's reasoning (§6.7) depends on it.
4. **The glass tables.**
   - `wine_answers`: `catalog_wine_id uuid`, `image_url text`.
   - `wines`: `tasting_id`, `is_revealed boolean not null`, `added_by_host boolean not null`, `contributor_participant_id uuid`.
   - `tastings.host_id uuid`; `tasting_participants.user_id uuid`.
   - `wine_identity_drafts(owner_id uuid, draft jsonb)`.
5. **`label_reads`.** `id uuid` is the PK; `user_id uuid not null`; `image_path text not null`; `outcome text not null`; `created_at timestamptz not null`.
6. **Storage.**
   - Bucket `wine-images` exists and is public.
   - `storage.objects` has `bucket_id`, `name text`, `owner uuid`, `owner_id text` and `metadata jsonb`.
   - `has_table_privilege(current_user, 'storage.objects', 'SELECT')`. The definer function reads object rows as its owner.
7. **Cellar visibility.**
   - `can_view_cellar(uuid)` exists, is SECURITY DEFINER, returns `boolean` and is executable by `authenticated`.
   - `cellar_lots` has exactly one read policy, "cellar own select", for `{authenticated}`, qual `((owner_id = auth.uid()) OR can_view_cellar(owner_id))`. The photo read policy reuses that gate, so a cellar scan's audience is the lot's.
8. **The wine-images write lockdown (`20260919162300`) is live.** No UPDATE, DELETE or ALL policy on `storage.objects` may mention `wine-images`, and each must be scoped to another bucket by a leading `bucket_id = '…'` conjunct. Otherwise it raises `wine-images still grants client UPDATE/DELETE (<policy names>); apply 20260919162300 first`. Live on 2026-09-19 it raises, naming "wine image write delete" and "wine image write update": **apply `20260919162300` before this file.**

### 6.2 Table, indexes, RLS, grants

```sql
create table public.catalog_wine_photos (
  id uuid primary key default gen_random_uuid(),
  catalog_wine_id uuid not null references public.catalog_wines(id) on delete cascade,
  image_path text not null,               -- the object name in wine-images, never a URL
  via text not null default 'upload',     -- 'upload' (wine page), else where the scan's add landed
  added_by uuid not null references public.profiles(id) on delete cascade,
  label_read_id uuid references public.label_reads(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint catalog_wine_photos_wine_path_key unique (catalog_wine_id, image_path),
  constraint catalog_wine_photos_path_shape
    check (char_length(image_path) <= 300 and image_path ~ '^catalog/[A-Za-z0-9._/-]+$'),
  constraint catalog_wine_photos_via check (via in ('upload', 'catalog', 'cellar', 'note'))
);
create index catalog_wine_photos_wine_created_idx on public.catalog_wine_photos (catalog_wine_id, created_at desc);
create index catalog_wine_photos_added_by_idx on public.catalog_wine_photos (added_by, catalog_wine_id);
create index wine_answers_catalog_wine_id_idx on public.wine_answers (catalog_wine_id);  -- §6.3 steps 6-7

alter table public.catalog_wine_photos enable row level security;

-- A signed-in user sees a wine's photos when the wine is not blind_pending (the subquery runs as the
-- caller under "catalog read", which admits every authenticated caller to a non-blind_pending row),
-- except a cellar scan: that one is seen by its photographer and by whoever can see their cellar
-- (can_view_cellar, the gate of cellar_lots' own read policy), so it tells nobody more than the lot
-- does. No glass linkage test anywhere: see §3.1.
create policy "catalog_wine_photos read" on public.catalog_wine_photos
  for select to authenticated
  using (exists (select 1 from public.catalog_wines cw
                  where cw.id = catalog_wine_photos.catalog_wine_id and not cw.blind_pending)
         and (added_by = auth.uid() or via <> 'cellar' or public.can_view_cellar(added_by)));

-- The photographer unlinks their own photo. The storage object is untouched.
create policy "catalog_wine_photos delete own" on public.catalog_wine_photos
  for delete to authenticated
  using (added_by = auth.uid());

revoke all on public.catalog_wine_photos from public, anon, authenticated;
grant select (id, catalog_wine_id, image_path, via, added_by, created_at) on public.catalog_wine_photos to authenticated;
grant delete on public.catalog_wine_photos to authenticated;
-- No client INSERT or UPDATE: rows are written only by attach_catalog_wine_photo.
-- label_read_id is not client-readable: label_reads is owner-only.
-- service_role keeps Supabase's defaults (the probe's and the main session's fixtures).
```

### 6.3 `attach_catalog_wine_photo(p_catalog_wine_id uuid, p_image_path text, p_via text) returns text`

`language plpgsql volatile security definer set search_path = public`. It returns one status word and never raises for a refusal. `p_via` is where a scan's add landed (`catalog`, `cellar` or `note`; anything else, null included, is `bad-path` for a scan). A `catalog/<wineId>/` upload is stored as `'upload'` whatever `p_via` says. Checks, in order:

```sql
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
  v_via text;
  v_meta jsonb;
  v_wine record;
  v_suffix text;
  v_read uuid;
  v_id uuid;
begin
  -- 1. Signed in.
  if v_uid is null then return 'signed-out'; end if;
  if p_catalog_wine_id is null then return 'no-wine'; end if;

  -- 2. A live account. The lock serialises with scrub_deleted_account (FOR UPDATE, D6) and with this
  --    person's other attaches (so the cap in step 9 holds).
  select deleted_at into v_deleted_at from profiles where id = v_uid for no key update;
  if not found or v_deleted_at is not null then return 'deleted-account'; end if;

  -- 3. The path: the caller's own label scan, which names where its add landed (catalog, cellar or
  --    note; a cellar scan is then read only by who can read that cellar), or an upload into this
  --    wine's own folder, which is always 'upload' whatever p_via says.
  if p_image_path is null or char_length(p_image_path) > 300 then
    return 'bad-path';
  elsif p_image_path ~ ('^catalog/staging/' || v_uid::text || '/scan-[A-Za-z0-9._-]+\.jpg$') then
    if p_via is null or p_via not in ('catalog', 'cellar', 'note') then return 'bad-path'; end if;
    v_via := p_via;
  elsif p_image_path ~ ('^catalog/' || p_catalog_wine_id::text || '/[A-Za-z0-9._-]+$') then
    v_via := 'upload';
  else
    return 'bad-path';
  end if;

  -- 4. The object: in wine-images, uploaded by the caller, an image, at most 5 MB.
  select o.metadata into v_meta from storage.objects o
   where o.bucket_id = 'wine-images' and o.name = p_image_path
     and coalesce(o.owner_id, o.owner::text) = v_uid::text;
  if not found or v_meta is null then return 'no-object'; end if;
  if coalesce(v_meta->>'mimetype', '') not like 'image/%' then return 'not-an-image'; end if;
  if coalesce(v_meta->>'size', '') !~ '^[0-9]+$' or (v_meta->>'size')::bigint > 5242880 then
    return 'too-large';
  end if;

  -- 5. The wine: exists, not merged away, not blind_pending. "catalog read" admits every caller to such
  --    a row, so this is "readable". One answer for all three cases: a blind_pending id cannot be told
  --    from a missing one.
  select cw.blind_pending, cw.merged_into into v_wine
    from catalog_wines cw where cw.id = p_catalog_wine_id for key share;
  if not found or v_wine.blind_pending or v_wine.merged_into is not null then return 'no-wine'; end if;

  -- 6. Never a photo of one of the caller's own glasses (the owner's rule), revealed or not, keyed or
  --    still a draft. Only the caller's own glasses are consulted.
  v_suffix := '/storage/v1/object/public/wine-images/' || p_image_path;
  if exists (select 1 from wine_answers wa
               join wines w on w.id = wa.wine_id
               join tastings t on t.id = w.tasting_id
               left join tasting_participants tp on tp.id = w.contributor_participant_id
              where right(split_part(wa.image_url, '?', 1), char_length(v_suffix)) = v_suffix
                and case when w.added_by_host then t.host_id = v_uid else tp.user_id = v_uid end)
     or exists (select 1 from wine_identity_drafts d
                 where d.owner_id = v_uid
                   and right(split_part(d.draft->>'imageUrl', '?', 1), char_length(v_suffix)) = v_suffix) then
    return 'flight-photo';
  end if;

  -- 7. Not while the caller has this wine in a glass they added that is not yet revealed (§3.1).
  --    Nobody else is ever refused for linkage.
  if exists (select 1 from wine_answers wa
               join wines w on w.id = wa.wine_id
               join tastings t on t.id = w.tasting_id
               left join tasting_participants tp on tp.id = w.contributor_participant_id
              where wa.catalog_wine_id = p_catalog_wine_id and not w.is_revealed
                and case when w.added_by_host then t.host_id = v_uid else tp.user_id = v_uid end) then
    return 'unrevealed-glass';
  end if;

  -- 8. Idempotent. Checked before the cap, so a retry at 12 never reads as 'limit'.
  if exists (select 1 from catalog_wine_photos
              where catalog_wine_id = p_catalog_wine_id and image_path = p_image_path) then
    return 'already-attached';
  end if;

  -- 9. At most 12 per person per wine (D7).
  if (select count(*) from catalog_wine_photos
       where catalog_wine_id = p_catalog_wine_id and added_by = v_uid) >= 12 then
    return 'limit';
  end if;

  -- 10. The read that produced it, when there was one. It is derived here: the client never names it.
  select lr.id into v_read from label_reads lr
   where lr.user_id = v_uid and lr.image_path = p_image_path
   order by (lr.outcome = 'ok') desc, lr.created_at desc limit 1;

  insert into catalog_wine_photos (catalog_wine_id, image_path, via, added_by, label_read_id)
  values (p_catalog_wine_id, p_image_path, v_via, v_uid, v_read)
  on conflict (catalog_wine_id, image_path) do nothing
  returning id into v_id;
  return case when v_id is null then 'already-attached' else 'attached' end;
end
```

EXECUTE: `revoke all … from public, anon, service_role; grant execute … to authenticated`. `auth.uid()` is null for `service_role`, as in the `transfer_tasting_host` OD-1 precedent.

The status words are the `AttachPhotoStatus` union (§7): `attached`, `already-attached`, `signed-out`, `deleted-account`, `bad-path`, `no-object`, `not-an-image`, `too-large`, `no-wine`, `flight-photo`, `unrevealed-glass`, `limit`.

### 6.4 Account deletion (D6)

```sql
create function public.drop_deleted_account_catalog_wine_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from catalog_wine_photos where added_by = new.id;
  return null;
end $$;
revoke all on function public.drop_deleted_account_catalog_wine_photos() from public, anon, authenticated, service_role;

create trigger profiles_drop_catalog_wine_photos
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_account_catalog_wine_photos();
```

The trigger is used instead of editing `scrub_deleted_account` step 6, so that freshly shipped function stays byte-identical. It fires once, when the scrub stamps `deleted_at`. A leftover token cannot write afterwards: step 2 refuses a deleted caller, and its row lock orders it against the scrub either way. A hard delete of a profile cascades through the FK.

### 6.5 Post-state (same transaction; every check a `raise exception`)

- **Table shape.** Columns, types and nullability are exactly §6.2's. Constraints are exactly:
  - the pkey;
  - three FKs with `ON DELETE CASCADE` / `CASCADE` / `SET NULL`;
  - `catalog_wine_photos_wine_path_key`;
  - `catalog_wine_photos_path_shape`;
  - `catalog_wine_photos_via`, `CHECK ((via = ANY (ARRAY['upload'::text, 'catalog'::text, 'cellar'::text, 'note'::text])))`.

  The three new indexes exist.
- **RLS.** Row security is on. The policy set is exactly the two above, with their roles, commands and quals. The read qual, as `pg_get_expr` prints it: `((EXISTS ( SELECT 1 FROM catalog_wines cw WHERE ((cw.id = catalog_wine_photos.catalog_wine_id) AND (NOT cw.blind_pending)))) AND ((added_by = auth.uid()) OR (via <> 'cellar'::text) OR can_view_cellar(added_by)))`.
- **Grants.**
  - `authenticated` has SELECT on exactly the six columns `id, catalog_wine_id, image_path, via, added_by, created_at`, not `label_read_id`, and DELETE. It has no INSERT, UPDATE, TRUNCATE, REFERENCES or TRIGGER.
  - `anon` and PUBLIC hold nothing.

  Use `has_table_privilege` and `has_column_privilege`.
- **`attach_catalog_wine_photo(uuid, text, text)`.**
  - `prosecdef`, `proconfig = {search_path=public}`, volatile, returns `text`, plpgsql, arguments `p_catalog_wine_id uuid, p_image_path text, p_via text`, body md5 pinned.
  - EXECUTE: `authenticated` true; `anon`, `service_role` and PUBLIC false.
- **The trigger function.** `prosecdef`; no EXECUTE for `anon`, `authenticated` or `service_role`.
- **The trigger.** `profiles_drop_catalog_wine_photos` is row-level, AFTER, UPDATE OF `deleted_at` only. `pg_get_triggerdef` contains `WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL)))`. `profiles` now has exactly three non-internal triggers.

### 6.6 Types (`src/lib/supabase/database.types.ts`, by hand)

- `catalog_wine_photos`:
  - Row: `id`, `catalog_wine_id`, `image_path`, `via`, `added_by`, `label_read_id: string | null`, `created_at`.
  - Insert and Update: all optional except `catalog_wine_id`, `image_path` and `added_by` on Insert.
  - `Relationships: []`. The file uses no FK names anywhere. Names are read with a second query (§8.2), not an embed.
- `Functions.attach_catalog_wine_photo`: `{ Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string }; Returns: string }`.
- `src/lib/catalog-photos/types.ts`: `PhotoVia = "upload" | "catalog" | "cellar" | "note"`, `ScanVia = Exclude<PhotoVia, "upload">`.
- A comment above the table: "rows are written only by attach_catalog_wine_photo; label_read_id is not client-readable".

### 6.7 Security reasoning

- **Rule 1.**
  - **The adder.** Refused while their glass of the wine is unrevealed (step 7). Their own glass photos are refused for good (step 6).
  - **Everyone else.** Attach results do not depend on any glass (steps 1–5 and 8–10 read only the caller's own rows, the object and the wine row). Visibility depends only on `blind_pending`, which already hides the whole wine page, and, for a cellar scan, on the photographer's cellar visibility, which never depends on a glass either.
  - **So there is no oracle,** by attach or by read, beyond the `blind_pending` behaviour that exists today (§12).
  - **`blind_pending`.** Refused as `no-wine` (step 5), indistinguishable from a missing id. Its existing photos are hidden from everyone, the photographer included.
- **Cellar privacy.** A `via = 'cellar'` row is read by its photographer and by whoever `can_view_cellar(added_by)` admits: exactly the audience of that person's `cellar_lots` rows, which already name the wine and when the lot was added. So a host who scans a bottle into a PRIVATE or FRIENDS cellar and pours it from there (D11) leaves no trace for a guest who cannot see that cellar, although the lot keeps the wine off `blind_pending` all evening (§3.1). The gate is static; changing one's cellar visibility moves the lot and the photo together.
- **A client cannot insert or update rows.** It can delete only its own. Its attach can name only an object it uploaded, under its own staging folder or the wine's own folder. It cannot forge `label_read_id` or `created_at`. `via` is client-chosen for a scan, but only for the caller's own photo and only among catalog, cellar and note: the worst a lying client can do is publish its own cellar scan.
- **Storage (review finding, 2026-09-19).** Nothing here writes, moves or deletes `storage.objects`, but the attach-time object checks (the caller owns it, `image/*`, ≤ 5 MB) only mean something if nobody can rewrite the object afterwards. Live still has "wine image write update" and "wine image write delete", which admit every authenticated caller to any object under `catalog/**`. Reproduced in a rolled-back transaction: after Priya attached her staging scan, Diego, as `authenticated` with his own `sub`, updated that object's metadata to `text/html`, 50 MB (rowCount 1), and the row still read "Scanned by Priya". Through the Storage API that is an upsert that replaces the bytes; the delete policy likewise lets anyone delete the file and leave a broken thumbnail; and the owner could re-upload any content after attaching. **The `20260919162300` lockdown is therefore a prerequisite**, and §6.1 item 8 refuses to apply this file until no UPDATE, DELETE or ALL policy on `storage.objects` can reach a wine-images object. With it live, no client can UPDATE or DELETE a wine-images object, and INSERT cannot overwrite (object names are unique per bucket).
- **Deleted accounts.** The trigger removes their rows, and the RPC refuses them.

## 7. Server actions — `src/app/catalog/photo-actions.ts`

`"use server"`, with async functions only. Types live in the plain module `src/lib/catalog-photos/types.ts`, imported with `import type`. This follows CLAUDE.md's "use server" gotcha.

- `attachCatalogWinePhoto(input: { catalogWineId: string; imagePath: string; via: PhotoVia }): Promise<AttachPhotoResult>`
  1. Checks the uuid shape, `imagePath` as a string of at most 300 characters, and `via` as one of `upload`, `catalog`, `cellar`, `note`. Otherwise it returns `{ ok: false, status: "bad-path" }`.
  2. Runs `supabase.rpc("attach_catalog_wine_photo", { p_catalog_wine_id, p_image_path, p_via })`. The add-wine sheet sends the target's `via` (where the add landed); the wine page sends `"upload"`.
  3. Returns `attached` / `already-attached` as `{ ok: true, status }`, and every other word as `{ ok: false, status }`.
  4. On an RPC error, returns `{ ok: false, status: "error" }` and logs name and message only.
- `removeCatalogWinePhoto(photoId: string): Promise<RemovePhotoResult>`
  1. Runs `delete().eq("id", photoId).select("id")`.
  2. Zero rows → `{ ok: false, reason: "not-yours" }`. An error → `{ ok: false, reason: "error" }`. Otherwise `{ ok: true }`.
- **No `revalidatePath` in either.** The wine page is dynamic (cookies), and the sheet must not re-render the page under it mid-flow. The wine page calls `router.refresh()` itself. Read `node_modules/next/dist/docs/` on server actions before writing (AGENTS.md).

`types.ts`:

```ts
export type PhotoVia = "upload" | "catalog" | "cellar" | "note";
export type ScanVia = Exclude<PhotoVia, "upload">;
export type AttachPhotoStatus =
  | "attached" | "already-attached" | "signed-out" | "deleted-account" | "bad-path" | "no-object"
  | "not-an-image" | "too-large" | "no-wine" | "flight-photo" | "unrevealed-glass" | "limit" | "error";
export type AttachPhotoResult =
  | { ok: true; status: "attached" | "already-attached" }
  | { ok: false; status: Exclude<AttachPhotoStatus, "attached" | "already-attached"> };
export type RemovePhotoResult = { ok: true } | { ok: false; reason: "not-yours" | "error" };
export type StripPhoto = {
  id: string; url: string; imagePath: string; addedBy: string; addedByName: string;
  createdAt: string; isScan: boolean;
};
```

## 8. The wine page

### 8.1 Pure helpers — `src/lib/catalog-photos/strip.ts`, with its test

- `STRIP_SHOWN = 8`.
- `pathFromPublicUrl(url, bucket = "wine-images")`:
  - the decoded text after `/storage/v1/object/public/<bucket>/`, with any `?query` dropped;
  - null for null, another bucket, or not a storage URL.
- `isScanPath(path)`: `^catalog/staging/[^/]+/scan-[A-Za-z0-9._-]+\.jpg$`.
- `stripPhotos(rows, mainImageUrl)`:
  - drops the row whose `imagePath` equals `pathFromPublicUrl(mainImageUrl)`;
  - orders the rest newest first (`createdAt` desc, then `id` desc);
  - returns `{ photos, shown: photos.slice(0, 8), more: max(0, n − 8) }`.
- `stripHeading(hasMain)`: "More photos" when the wine has a main photo, else "Photos".
- `photoCaption({ isOwn, name, isScan })`:
  - own scan → "Scanned by you"; own upload → "Added by you";
  - someone else's scan → "Scanned by {name}"; their upload → "Added by {name}".
- `attachNotice(status)`: §8.5's wine-page line for each status, null for none.

Tests cover each function. For `stripPhotos` in particular:

- The main photo is excluded.
- Order holds with equal `createdAt`.
- 8 rows → `more` 0; 12 rows → `more` 4.
- An empty list → `shown` [].
- A null main keeps every row.

### 8.2 Data — `src/lib/catalog-photos/queries.ts` (server)

`fetchWinePhotos(supabase, wineId, viewerId): Promise<StripPhoto[]>`:

1. Selects `id, image_path, added_by, created_at` from `catalog_wine_photos` for the wine, newest first, `limit(200)`. RLS decides what is visible.
2. Reads `profiles(id, display_name)` for the distinct `added_by` ids in one `.in()` query.
3. Builds `url` with `storage.from("wine-images").getPublicUrl(path)`. That call makes no network request.

### 8.3 `page.tsx` changes

- The existing `blindRow` read selects `blind_pending, created_by`. The profile read selects `role, is_curator`.
- `canSetMain = created_by === user.id || is_curator`, which mirrors the `catalog update` policy.
- `fetchWinePhotos` joins the `Promise.all`.
- The image column (`w-full sm:w-48`) renders:
  - `<WineImage wineId initialUrl canSetMain />`;
  - then `<PhotoStrip wineTitle={title} photos={stripPhotos(photos, wine.imageUrl).photos} hasMain={!!wine.imageUrl} viewerId={user.id} />`.

  Nothing else on the page moves.

### 8.4 `wine-image.tsx` and `ImageUploader`

**`ImageUploader` gains two optional props. Every current caller is unchanged.**

- `onUpload?: (u: { url: string; path: string }) => void`. It is called alongside `onChange` after a successful upload.
- `previewUploads?: boolean`, default `true`. When `false`, the preview keeps showing `initialUrl` after an upload.

It also runs `prepareUpload` (D1) before uploading.

**`WineImage({ wineId, initialUrl, canSetMain })`.** On upload:

1. `attachCatalogWinePhoto({ catalogWineId: wineId, imagePath: path })`.
2. If `canSetMain` and the status is not `unrevealed-glass`, `setCatalogWineImage(wineId, url)`, exactly as today. The rule-1 guard on that call is new and applies only in this one UI path. The server-side gap is §12 finding F3.
3. Otherwise the main photo is not touched. The uploader is rendered with `previewUploads={false}`, and the line from `attachNotice(status)` shows under the button.
4. `router.refresh()`.

Non-creators no longer hit "Only the wine's creator or a curator can set its photo." A creator's successful replace shows no notice, as today.

### 8.5 `PhotoStrip` — `src/app/catalog/[wineId]/photo-strip.tsx` (client)

It renders nothing when `photos` is empty.

**Heading.** `Eyebrow` with `stripHeading(hasMain)`, with `mt-3 mb-1.5` under the main photo.

**Thumbnails.**

- `flex flex-wrap gap-1.5`. It wraps, and never scrolls sideways. At 375 px, six thumbnails fit per row inside the page's 24 px padding; in the 192 px `sm` column, three fit.
- Each thumbnail is a real `<button type="button">` wrapping `<BottleThumb src={url} className="h-16 w-12" />`: the same bordered box, lazy, `decoding="async"`, `object-contain` on `bg-card`. The button is 48 × 64, above the 44 px floor.
- Each button has a `focus-visible` ring, and `aria-label="Photo {i} of {n}, {caption}"`.
- At most 8 thumbnails. When `more > 0`, a ninth button of the same box size reads "+{more}" (`text-sm font-medium text-muted-foreground`, `aria-label="Show photo 9 of {n}"`). It opens the dialog on photo 9.

**Dialog.** `Dialog` / `DialogContent` with `showCloseButton={false}`, since the stock close is `icon-sm`, under 44 px. Classes: `max-w-[calc(100%-2rem)] p-3 sm:max-w-2xl`. Top to bottom:

1. **Top row.**
   - The counter "{i} of {n}" (`text-xs text-muted-foreground`, only when n > 1).
   - A Close `Button` (`variant="ghost"`, `className="size-11"`, `XIcon`, `aria-label="Close"`) on the right.
   - `DialogTitle` (sr-only): "Photo {i} of {n} — {wineTitle}".
2. **The photo.** `<img>` eager, `alt=""`, `max-h-[70vh] w-full rounded-md bg-card object-contain`.
3. **The caption.** "{photoCaption} · " + `<LocalDateTime iso={createdAt} />` (`text-sm text-muted-foreground`).
4. **Navigation**, only when n > 1. "Previous photo" and "Next photo" `Button`s (`variant="outline"`, `size-11`, chevron icons, aria-labels as written) at the row's two ends. They wrap around, and ←/→ do the same while the dialog is open.
5. **Remove**, only when `addedBy === viewerId`.
   - A `Button` (`variant="outline"`, `h-11`) reading "Remove from this wine".
   - First tap arms it. Within `TWO_TAP_WINDOW_MS` it reads "Tap again to remove". This reuses `twoTapState` from `src/lib/console-copy.ts`.
   - Second tap: `removeCatalogWinePhoto(id)`. On ok the dialog closes and `router.refresh()` runs. On failure, "Couldn't remove this photo. Please try again." shows in `text-sm text-destructive` under the button.
   - The helper line under it (`text-xs text-muted-foreground`): "Only this wine's page changes. The photo file is kept."

It works in both themes with theme tokens only: `border-border`, `bg-card`, `bg-popover`, `text-muted-foreground`, `text-destructive`. No hex values.

### 8.6 Copy

| Where | Text |
|---|---|
| Strip heading | "More photos" (main photo set) · "Photos" (none) |
| Caption | "Scanned by you" · "Added by you" · "Scanned by {name}" · "Added by {name}", then " · {local date and time}" |
| Overflow tile | "+{n}" |
| Dialog | "{i} of {n}" · "Previous photo" · "Next photo" · "Close" |
| Remove | "Remove from this wine" → "Tap again to remove" · helper "Only this wine's page changes. The photo file is kept." · failure "Couldn't remove this photo. Please try again." |
| Wine-page upload, `attached` (not main) | "Added to More photos." |
| `already-attached` | "That photo is already on this wine." |
| `limit` | "You have added 12 photos to this wine. Remove one to add another." |
| `unrevealed-glass` | "This wine is in one of your flights that hasn't been revealed yet. Add photos after the reveal." |
| `too-large` | "That photo is too large. Try a smaller one." |
| any other refusal or error | "Couldn't add the photo. Please try again." |
| Scan attach failures | none (console only, D3) |

## 9. Probe scenarios

**The probe.** `.superpowers/scan-photos/probes/20260919183100-catalog-wine-photos.mjs` (gitignored), in the pattern of the account-deletion probe:

- One `pg` client via `pgConfig()`.
- **Before-phase:** re-reads §6.1's facts and the free version.
- **After-phase:**
  - applies the migration file inside the transaction;
  - builds fixtures as `postgres` on the seeded `demo.*@blindr.invalid` accounts: Marcus (host), Priya, Diego, Sofia, Isabelle;
  - inserts fake `storage.objects` metadata rows (no file exists or is touched);
  - uses one live public catalog wine W that holds a lot or note, so it cannot flip `blind_pending`. It uses a second, fresh wine W3 for the `blind_pending` case;
  - runs client calls in savepoints with `set local role authenticated` / `anon` plus `request.jwt.claims`.
- **Both phases end in ROLLBACK.** A final live read shows nothing persisted, including the `storage.objects` count and the `wine-images` md5 of names.
- **EXPECT table.** Written before the first run. Agents may run it, since it only rolls back.
- **Two modes, for the lockdown prerequisite (§6.1 item 8).** `postgres` does not own `storage.objects`, so the probe cannot emulate the lockdown by dropping policies.
  - **Default (the lockdown is live).** B1 expects the newest live version `20260919162300` and no UPDATE/DELETE/ALL policy on `storage.objects` reaching wine-images. M1 applies the pristine file. P17 expects another user's, and the owner's, UPDATE of an attached object to touch 0 rows.
  - **`PROBE_PRE_LOCKDOWN=1` (before the main session applies `20260919162300`).** B1 expects the newest live version `20260919141700` and the two live policies. M0 shows the pristine file refuses with the lockdown message. M1 then applies the file with only that gate (item 8) cut out, by an exact single-occurrence match, so every other row can still run. P17 records the open hole (rowCount 1 for Diego's UPDATE of Priya's object), which is why the gate exists.
- **Dry apply.** Before the lockdown is live, `scratch-apply --mode dry` must report `FAILED 20260919183100: wine-images still grants client UPDATE/DELETE (wine image write delete, wine image write update); apply 20260919162300 first`. Once it is live, it must report `DRY-OK 20260919183100 catalog_wine_photos`. The main session applies `20260919162300`, reruns the probe in default mode and the dry apply, then applies this file live.

Unless a row says otherwise, a scan is attached with `via = 'catalog'`.

| # | Scenario | EXPECT |
|---|---|---|
| B1 | **Live versions and the lockdown.** The newest live version; the UPDATE/DELETE/ALL policies on `storage.objects` that can reach wine-images. | Default: `20260919162300`, none. Pre-lockdown: `20260919141700`, "wine image write delete" and "wine image write update". |
| M0 | **The lockdown gate.** The file carries the gate exactly once. | Default: the live gate query finds nothing. Pre-lockdown: the pristine file raises `wine-images still grants client UPDATE/DELETE (wine image write delete, wine image write update); apply 20260919162300 first`. |
| P1 | **Own scan attaches.** Priya owns `catalog/staging/<priya>/scan-p1.jpg` (image/jpeg, 60 KB) and a `label_reads` row for it (outcome ok). She attaches it to W. | `attached`. One row: `added_by` Priya, `label_read_id` that read. Priya and Diego each read it (6 columns). Diego selecting `label_read_id`: 42501. |
| P2 | **Someone else's path.** Diego attaches Priya's scan path to W. Diego attaches `catalog/<W>/p.jpg`, owned by Priya. Diego sends `catalog/staging/<diego>/notscan.jpg`, `<tastingId>/x.jpg`, `https://…/scan-1.jpg`, `catalog/<W3>/d.jpg` (another wine's folder) and a null path. | `bad-path`, `no-object`, then `bad-path` for each of the rest. No row is written. |
| P3 | **The object.** A missing name; an owned object with `mimetype` `application/pdf`; an owned 6 MB image; a row with null metadata. | `no-object`, `not-an-image`, `too-large`, `no-object`. |
| P4 | **Wine behind an unrevealed glass.** Marcus's IN_PROGRESS LIVE tasting has a host-added glass keyed to W, not revealed, and Priya is JOINED. (a) Marcus attaches his scan to W. (b) Priya attaches hers. (c) Marcus's photo on W from before the glass: Priya reads it. (d) `reveal_wine` as Marcus, then Marcus attaches again. (e) BYO: Diego's bottle keyed to W in Marcus's BYO tasting. Diego attaches, then Marcus (host, not the adder) attaches. | (a) `unrevealed-glass`, no row. (b) `attached`, and it returns the same word it returns on an unpoured wine; Priya reads her row. (c) Visible, not hidden. (d) `attached`. (e) Diego `unrevealed-glass`; Marcus `attached`. In every case the glass's `is_revealed`, `reveal_step` and `wine_answers` row are unchanged by the attaches. |
| P5 | **Flight photo.** Marcus's glass `wine_answers.image_url` is the public URL of his `scan-f1.jpg`. Marcus attaches `scan-f1.jpg` to W2, an unrelated public wine, before and after the reveal. Marcus's incomplete glass has a `wine_identity_drafts.draft->>'imageUrl'` for `scan-f2.jpg`, and he attaches that. Priya owns `scan-p9.jpg`, which W's `image_url` points at and which a host glass copied into its answer key. Priya attaches it to W. | `flight-photo` for Marcus each time. Priya: `attached` (another person's glass is never consulted). |
| P6 | **`blind_pending` and merged.** W3 is keyed only to an unrevealed glass, so `blind_pending` is true. Marcus (its creator) and Priya each attach to W3. A row for W3 inserted as postgres: Marcus and Priya read it. A merged wine; a random uuid; a null wine id. | `no-wine` for both attaches. Neither reads the W3 row. `no-wine` for the merged wine, the random uuid and the null id. |
| P7 | **13th photo.** Priya has 11 rows on W (inserted as postgres) plus P1. She attaches a 13th path; she attaches the same new path to W2; she re-sends P1's path at the cap. | `limit`; `attached` (the cap is per wine); `already-attached`. |
| P8 | **Duplicate.** Priya repeats P1 twice. | `already-attached` both times. The row count and row md5 are unchanged. |
| P9 | **Remove.** Diego deletes Priya's row, then Priya deletes it. | Diego: 0 rows deleted and the row still there. Priya: 1 row. The `storage.objects` row for the path is unchanged (md5 before and after). |
| P10 | **Deleted profile.** Sofia has 2 photo rows on W. Delete her with `delete from auth.users where id = …`, as GoTrue does. Then call the RPC with Sofia's JWT claims. | Her photo rows are gone; Priya's and Marcus's rows are unchanged; her objects' `storage.objects` rows are unchanged. The call returns `deleted-account`. |
| P11 | **Anon.** As `anon`: select from the table, call the RPC, delete a row. | 42501 permission denied, each time. |
| P12 | **Client writes and EXECUTE.** As `authenticated` (Priya): a direct INSERT; an UPDATE of `image_path` on her row. As `service_role`: the RPC. As `authenticated` with no claims: the RPC. | 42501; 42501; 42501 permission denied for function; `signed-out`. |
| P13 | **Wine-page upload.** Priya owns `catalog/<W>/u1.jpg` and attaches it to W, sending `via = 'cellar'`. | `attached`, stored as `via = 'upload'`, no label read. |
| P14 | **Post-state bites.** In a savepoint, `grant insert on catalog_wine_photos to authenticated`, then re-run §6.5. | It raises. |
| P15 | **Rule 1 invariants.** Across P1–P13 and P16–P17. | No `wines` or `wine_answers` row changes. The set of `blind_pending` wines is unchanged, apart from W3's fixture. The attach status words for Priya are identical for W while it is poured (P4b) and while it is not (P1). |
| P16 | **Cellar scans follow the cellar (§3.1).** Fixture: Marcus's cellar PRIVATE, Isabelle's PUBLIC, Diego's FRIENDS with a friendship Diego → Priya, and no friendship between Diego and Marcus. Marcus, Isabelle and Diego each attach a cellar scan to W. Then Marcus's IN_PROGRESS LIVE BLIND tasting gets a host glass keyed to W, not revealed, with Priya JOINED. Priya runs `select catalog_wine_id from catalog_wine_photos where added_by = '<marcus>' and created_at > now() - interval '1 day'` before and after the glass. Also: a scan with `via` `upload`, null, `flight` or `CELLAR`; Priya reading `via`; Marcus then attaching a catalog scan. | Three `attached`. W stays not `blind_pending`; `can_view_cellar(marcus)` as Priya is false. Before and after the glass: Priya reads 0 of Marcus's rows, 1 of Isabelle's and 1 of Diego's; Marcus reads his own 1, and 0 of Diego's; Isabelle reads 0 of Marcus's. The four bad vias → `bad-path`. Priya reads Isabelle's row's `via` as `cellar`. Marcus's catalog scan: `attached`, and Priya then reads 1 of Marcus's rows (the documented R6 residual). |
| P17 | **The storage write hole (§6.7).** Priya attaches her scan to W. Diego, as `authenticated` with his own `sub`, runs `update storage.objects set metadata = metadata \|\| '{"mimetype":"text/html","size":52428800}'` on that object; so does Priya on her own. | Default: 0 rows each. Pre-lockdown: 1 row each (the open hole the gate refuses to build on). The photo row still reads `added_by` Priya. |

## 10. File plan

**New**

- `supabase/migrations/20260919183100_catalog_wine_photos.sql`: §6.
- `src/lib/images/downscale-math.ts`, `downscale-math.test.ts`: §4.
- `src/lib/images/downscale.ts`: §4 (browser).
- `src/lib/catalog-photos/types.ts`: §7.
- `src/lib/catalog-photos/strip.ts`, `strip.test.ts`: §8.1.
- `src/lib/catalog-photos/queries.ts`: §8.2.
- `src/app/catalog/photo-actions.ts`: §7.
- `src/app/catalog/[wineId]/photo-strip.tsx`: §8.5.
- `src/components/add-wine/scan-photo.ts`, `scan-photo.test.ts`: §5.
- `.superpowers/scan-photos/probes/20260919183100-catalog-wine-photos.mjs` (gitignored): §9.

**Changed**

- `src/components/add-wine/use-sheet-adds.ts`: `AddContext.imagePath`, `attachScan`, and the two call sites (§5).
- `src/components/add-wine/add-wine-sheet.tsx`: imports `toScanJpeg` and `ImageDecodeError` from `@/lib/images/downscale` (lines 70 and 660).
- `src/components/add-wine/use-camera.ts`: `fitWithin`, `PHOTO_JPEG_QUALITY`.
- `src/components/image-uploader.tsx`: `prepareUpload`, `onUpload`, `previewUploads`.
- `src/app/catalog/[wineId]/wine-image.tsx`: `canSetMain`, attach, notice (§8.4).
- `src/app/catalog/[wineId]/page.tsx`: §8.3.
- `src/lib/supabase/database.types.ts`: §6.6.
- `CLAUDE.md`: §13's bullet.

**Deleted**

- `src/components/add-wine/downscale-image.ts`.

## 11. Tests to write first

These are the three pure files above: `downscale-math.test.ts`, `scan-photo.test.ts` and `strip.test.ts`. Write them red, then implement. Existing suites that must stay green without edits:

- `sheet-state.test.ts` and `matrix.test.ts`. The reducer and matrix are unchanged.
- `use-camera.test.ts`. It imports `./use-camera`, which is why that file's new import must be relative (§4).
- `guards.test.ts`.

The three new pure modules take the same care: `scan-photo.ts`, `strip.ts` and `downscale-math.ts` import only relative paths, with types via `import type`.

## 12. Residuals, findings, non-goals

**Accepted residuals**

- **R1 (corrected after review).** The adder's pre-glass photos stay visible, but only to whoever could already see them (§3.1): a cellar scan to those who can see the photographer's cellar lots, which already name the wine; a note scan to everyone, as the note itself is; a catalog scan or upload to everyone. The earlier claim that a cellar scan was "the same signal a PUBLIC or FRIENDS cellar already gives" was false while every photo was public; the `via = 'cellar'` read gate makes it true.
- **R6.** Adding an already-existing wine to the catalog (or picking it for a note and then dropping the pick) used to write nothing that others could see. With a scan in hand it now leaves a public trace: the photographer and a timestamp on that wine. A host who scans tonight's bottle "into the catalog" shortly before pouring it therefore reveals it to anyone watching their photos. Cellar scans are not affected (gated as above), and a new wine's catalog row already names its creator.
- **R2.** A glass left unrevealed when its tasting closed keeps refusing its adder's attaches to that wine for good. This matches `blind_pending`, which also never clears for such a glass.
- **R3.** `catalog_wine_mark_blind` counts lots and notes as public use, but not photos. A photographed catalog-only wine still flips to `blind_pending` when poured, and its page, photos included, disappears as today. Counting photos there would shrink that existing signal, but it changes a flight-path trigger, so it is left out.
- **R4.** A photo whose wine is later merged away (`merge_catalog_wines`) stays on the merged wine. `merge_catalog_wines` is unchanged.
- **R5.** `catalog/staging/` is not a temporary area. Nothing deletes it today, and any future cleanup job must skip paths referenced by `catalog_wine_photos`, `catalog_wines.image_url`, `wine_answers.image_url` and drafts.

**Pre-existing rule-1 findings, noticed while reading live. Out of scope; suggest separate tasks.**

- **F1.** `storage.objects` policy "wine image public read" is `bucket_id = 'wine-images'` for role `public`. As `anon`, a read-only `select count(*)` returned all 192 objects, including 177 staging uploads and 3 tasting-folder photos.
  - Anyone can therefore list `catalog/staging/<hostId>/` through the Storage list API and open tonight's flight scans by URL.
  - Public-bucket downloads do not need that policy, and `src/` never lists this bucket.
  - The pending `20260919162300` lockdown is the natural place to narrow SELECT, for example to the caller's own objects.
- **F2.** `catalog_wine_usage(p_id)` is SECURITY DEFINER with EXECUTE for `anon` and `authenticated`. Its `appearance_count` counts every `wine_answers` row, unrevealed glasses included, so calling it before and during a tasting names the poured wines.
- **F3.** `fillCatalogWine` runs on the flight path as well (`insertTastingWineFromIdentity` → `upsertCatalogWine`). When the adder created W earlier and W has no `image_url`, a flight scan becomes W's public main photo before the glass is even inserted. `setCatalogWineImage` likewise lets a creator change the main photo of a wine they have poured and not revealed. §8.4 guards only the wine-page UI path.

**Non-goals**

- By-hand manual "Label photo" uploads are not attached.
- No "make this the main photo" action.
- Curators cannot remove other people's photos. That would be moderation; it is an open question for the owner.
- No backfill.
- No image transformation service.
- No change to the camera's stream resolution. See the open question below.

**Open question for the owner.**

- Camera scans are video frames at the browser's default stream size, roughly 0.5 MP judging by billed tokens. They read well, but they will look soft when opened large in the strip.
- Asking the camera for 1,568 px would add roughly 2,000 input tokens per read. That is about $0.004 at Sonnet 5's $2 per million input tokens, or about 30% of today's ~$0.014 per read.
- This is a billed-cost change, so it is the owner's call, not this spec's.

## 13. CLAUDE.md bullet (add under Domain rules)

> - **Scan photos** (`catalog_wine_photos`, migration `20260919183100`; spec `docs/superpowers/specs/2026-09-19-scan-photos.md`). A label scan whose add lands in the catalog, a cellar or a note (never a flight — `scanPhotoTarget` in `src/components/add-wine/scan-photo.ts` is an allow-list keyed on where the add landed) and every wine-page upload become rows of the wine's "More photos" strip (`photo-strip.tsx`); `catalog_wines.image_url` stays the one main photo and the strip leaves it out. Rows are written only by the SECURITY DEFINER `attach_catalog_wine_photo(wine, path, via)` (own staging scan with `via` catalog/cellar/note, or own upload in `catalog/<wineId>/`, stored as `via = 'upload'`; object must exist, ≤ 5 MB, wine not `blind_pending`/merged, never a photo of the caller's own glass, 12 per person per wine, idempotent). Rule 1: the RPC refuses only the ADDER of a still-unrevealed glass of that wine, and reads never depend on glasses — hiding photos while a wine is poured, or refusing everyone, was rejected as an oracle (§3.1). A `via = 'cellar'` photo is read only by its photographer and whoever `can_view_cellar(added_by)` admits (the `cellar_lots` gate): a public cellar photo let a guest name tonight's wine when the host scanned it into a PRIVATE cellar and poured it from there (D11), since the lot keeps the wine off `blind_pending`. Residual: a catalog or note scan of an existing wine is a new public trace (spec §12 R6). The migration requires the wine-images write lockdown `20260919162300` first (it refuses otherwise): without it anyone could replace or delete the file behind someone else's photo. The photographer can unlink their own photo; the storage object is never deleted. Account deletion drops the rows via `profiles_drop_catalog_wine_photos`. All new uploads go through `src/lib/images/` (1,568 px, JPEG 0.82, EXIF-aware); Sonnet 5 itself accepts 2,576 px, so 1,568 is a storage choice, not the reader's limit.

## 14. Verification

- **Checks.** `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`, from the worktree once `node_modules` is installed.
- **Probe.** Every §9 EXPECT row matches in the mode that fits live (§9). Once `20260919162300` is live, the default-mode probe passes and `scratch-apply --mode dry` reports `DRY-OK 20260919183100 catalog_wine_photos`; before that, the dry apply must fail with the lockdown message.
- **Order.** Apply `20260919162300` before `20260919183100`.
- **Dev check, with `LABEL_READ_FIXTURE` set and never the live reader.**
  - Scan into the cellar and then into the catalog: two rows on the wine, `via` cellar and catalog. With a PRIVATE cellar, another account sees only the catalog one.
  - Scan into a flight: no row.
  - Wine-page upload as a non-creator: "Added to More photos.", and the main photo is unchanged.
- **UI in the main session's browser pass.** At 375 px and on desktop, light and dark:
  - the strip wraps without sideways scroll;
  - every tap target is 44 px or more;
  - the dialog's Remove button shows only on your own photo;
  - the strip is absent when a wine has no extra photos.
