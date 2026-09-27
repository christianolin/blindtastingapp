# Sharing defaults: cellars and tasting notes visible to everyone — design

- **Date:** 2026-09-27
- **Worktree / branch:** `blindtastingapp-training` / `sharing-defaults` (= production master `2193035`)
- **Status:** design only. Nothing applied, pushed or committed. The owner approves every live apply and all copy.
- **Migrations proposed:** `20260927140000_sharing_defaults.sql` (M1) and `20260927150000_sharing_defaults_flip.sql` (M2). Newest live version is `20260927100000` (training_region_guess, live but still only on the `training-region-guess` branch). Before writing either file, the plan re-checks that both versions are absent from live `supabase_migrations.schema_migrations`, from `origin/master` and from every worktree's `supabase/migrations`.

## 0. The owner's words (2026-09-27, binding)

- **S1 Cellar:** "change the default cellar privacy setting to everyone can see". The owner chose "Flip everyone on private".
- **S2 Notes:** "everyone can see all tasting notes per default unless you change".
- **S3 Where others' notes show:** "Wine page + profile".
- **S4 One-time notice:** "Yes, one-time card".

## 1. Decisions

### Given by the owner (not reopened)

- **S1 Cellar.** Every existing non-deleted profile whose `cellar_visibility` is `PRIVATE` becomes `PUBLIC`. `FRIENDS` stays `FRIENDS`. The column default becomes `PUBLIC`, so new accounts start public. Live today: 34 PRIVATE, 2 FRIENDS, 2 PUBLIC of 38; 0 deleted.
- **S2 Notes.** New per-person setting "Who can see your tasting notes": Everyone / Friends / Only me. It defaults to Everyone for every account, existing and new, and it governs every note the person writes.
- **S3 Surfaces.** A catalog wine's page lists other people's notes on that wine. A person's public profile `/u/[id]` lists their notes.
- **S4 Notice.** A one-time card on `/overview` for the people this change affects: a cellar flipped PRIVATE→PUBLIC, or at least one note that becomes visible. It says their cellar and tasting notes are now visible to everyone. It links to settings and can be dismissed. Dismissal is stored server-side, so it shows once across devices. New accounts never see it. Copy in §7.5; the owner approves it.

### Made here

- **S5 Storage of the notes setting.** Add `profiles.notes_visibility`, typed with the existing enum `cellar_visibility` (`PRIVATE | FRIENDS | PUBLIC`), `not null default 'PUBLIC'`.
  - Why: it has the same three audiences and the same friend rule as the cellar. One enum gives one TS type (`CellarVisibility`, aliased as `SharingAudience`), one control and two helpers that cannot drift apart.
  - Renaming the enum was rejected: it would touch the live column, every body that casts to it, and `database.types.ts`.
- **S6 One vocabulary.** Both settings show **Everyone / Friends / Only me** (`PUBLIC / FRIENDS / PRIVATE`) everywhere, including the `/cellar` control, which today says Public/Friends/Private.
  - Why: these are the owner's words, and the two settings sit on one card.
- **S7 `can_view_notes(p_author)`.** Its Friends clause is `can_view_cellar`'s, byte for byte (§4.1). It adds one clause: a deleted author's notes are refused.
  - Why: "Friends" must mean the same thing for cellars and notes. A leftover session token can still write a note for up to an hour after deletion, and that note must not show up.
- **S8 The read policy.** Anyone who is not the author reads a note only when all three hold:
  - it names a catalog wine the reader can read, through the existing "catalog read" gate;
  - `can_view_notes(author)` is true;
  - the note is not held (Rule 1, §5).

  So a note on an unidentified wine becomes author-only. It has no public identity and no page, and 0 exist live. Identity-less notes stay author-only, as today.
- **S9 Community figures follow the reader.** Anything computed over notes, as someone else sees it, uses only notes that person may read:
  - The views `catalog_wine_ratings` and `catalog_wine_descriptors` are already `security_invoker`, so they follow the policy with no change.
  - `catalog_wine_structure` becomes SECURITY INVOKER.
  - `catalog_wine_usage.note_count` leaves out held notes.

  Why: a private note's score or structure must not reach others through an average of one. A held note must not move any count that others see.
- **S10 Rule 1, the hold.** A note that gains a catalog identity while its author is the adder of an unrevealed glass keyed to that wine is held until that glass is revealed. Held means no one but the author can read it. "Gains an identity" means an INSERT with `catalog_wine_id` set, or an UPDATE of `catalog_wine_id` from null to a value.
  - The hold is written at write time, from the writer's own glasses (§5.1).
- **S11 Rule 1, the pour link.** A note linked through its author's own `cellar_consumptions.wset_note_id` to a pour that `catalog_wine_masked_pours` still masks is hidden from others for as long as the pour is masked (§5.2).
- **S12 Rule 1, the guard.** While the author is the adder of an unrevealed glass of wine W, two writes by the author are refused with 42501:
  - an UPDATE or DELETE of a note on W that others can already see (identified, not held);
  - moving any note onto W.

  This mirrors `catalog_wines_rule1_guard` (§5.3).
- **S13 Shared cellars stop carrying the owner-only lot fields.** When anyone but the owner calls `shared_cellar_lots(owner)`, it returns `lot_note`, `price_per_bottle` and `purchase_source` as null.
  - Why: the UI labels `lot_note` "Private note", and D4 renders price only on the owner's own lot sheet. Today the readOnly page selects all three and serializes them into the viewer's browser (`CellarBottles` is a client component).
  - S1 would hand that text to every member. Live, 3 PRIVATE lots carry a note.
- **S14 The notice gets its own owner-only table, `sharing_notices`,** not columns on `profiles`.
  - Why: every member can read `profiles` ("profiles read" is `true`), so a flag there would publish who used to have a private cellar.
  - The rows also record exactly whom M2 flipped, which the rollback needs (§10.3).
- **S15 Notice behaviour.**
  - It is the first element of `/overview`'s `<main>` at every width.
  - Its wording comes from the current settings. It never claims a setting the row no longer holds, the same rule as `CellarVisibilityControl`.
  - "Got it" and the settings link both dismiss it, through a server action.
  - A failed dismissal keeps it hidden for that visit only.
- **S16 What shows to others.**
  - Contexts: OPEN, BLIND (only after its glass is revealed, since an unrevealed one has no identity) and TRAINING (after the room's reveal). BLIND and TRAINING carry the existing badges.
  - Content: only notes with something in them (§7.1). The empty "Save all to ratings" rows are left out.
  - Order: `tasted_on desc, created_at desc, id desc`.
  - Amount: 50 rows at most are fetched. 5 show, then "Show all" expands in place.
- **S17 The note route is read-only for non-authors.** `/catalog/[wineId]/notes/[noteId]` keeps the editor for the author.
  - Anyone else the policy admits gets a server-rendered read view, built from the note's composed prose (`composeLiveNote`). The WSET sheet has no read-only mode, and `sheet-markup.test.tsx` pins its markup.
  - A note the policy hides returns `notFound()`, the same answer as an id that does not exist.
- **S18 Settings.** A new "Sharing" card on `/profile/edit` (`id="sharing"`) holds both selects. `/cellar` keeps its own select, and both use one component.
- **S19 The author is told when a note is held.** `wset_my_held_notes(uuid[])` returns the caller's own held note ids.
  - The author's rows then carry a quiet "Hidden from others" tag, on the wine page's "Your notes" and on their own profile.
  - Why: otherwise a host's note looks shared when it is not.
- **S20 Account deletion.** `scrub_deleted_account` is not recreated (§8).
- **S21 Two migrations, with the app deploy between them.**
  - M1 adds the schema and helpers and narrows the read policy; the app deployed today tolerates it (§10.1).
  - The new app deploys next.
  - M2 then flips the cellars, changes the default and writes the notices.
  - Why: the part people cannot quietly take back, 34 cellars going public, lands only after the app that explains it has been checked on prod.
- **S22 Copy the change makes false is updated in the same app deploy:**
  - the first-run tour's cellar and community sentences (`src/lib/first-run/tour.ts`, pinned by `tour.test.ts`);
  - the `/cellar` control labels;
  - code comments that say "the notes read policy is public" (`notes-data.ts`, `note-modal.tsx`, `open-board.tsx`, `lot-sheet.ts`, `play-experience.tsx`).
- **S23 Indexes.** `wset_notes` has only its primary key live. The new surfaces read by author and by wine, and the helpers read consumptions by note. M1 adds three indexes (§3.1 step 5).

## 2. Live facts this was written against (read-only, 2026-09-27)

- **`"wset notes read"`:** SELECT, `authenticated`, `((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid()))`. The insert, update and delete policies are the ones in `20260914094500` (§3.1 pre-state pins their exact text).
  - RLS is on and not forced.
  - `anon` holds table grants but has no policy.
- **`wset_notes` triggers:** `wset_notes_glass_move_guard`, `wset_notes_glass_resolve_on_write`, `wset_notes_hue_matches_colour`, `wset_notes_set_updated_at`.
- **`wset_notes_one_identity`:** the TRAINING-branch text from `20260925120000`.
- **Live notes:** 16.
  - 10 OPEN, all naming a catalog wine.
  - 5 BLIND, identified. 2 are empty "Save all" placeholders.
  - 1 TRAINING, identity-less.
  - 0 on an unidentified wine, 0 on a `blind_pending` wine.
  - 5 authors with identified notes: 3 PRIVATE cellars, 1 FRIENDS, 1 PUBLIC.
- **Tastings and glasses:** 0 unrevealed glasses, 0 `flight_holds` rows, 0 OPEN-mode tastings.
- **`can_view_cellar(uuid)`** (md5 `3af2e51e338dc43cc48b58f061049ec2`, SECURITY DEFINER, EXECUTE for PUBLIC/anon/authenticated/service_role):
  - PUBLIC → true;
  - FRIENDS → true when a `friendships` row exists in **either direction**: `(user_id = owner and friend_id = auth.uid()) or (user_id = auth.uid() and friend_id = owner)`;
  - PRIVATE → false, including the owner, since callers handle the owner themselves.
- **Friendships are pairs.** The brief says "one-way, no accept flow", but that is out of date (friend requests, 2026-09-24).
  - Live: 32 rows, 0 without a reverse row, 18 pending `friend_requests`.
  - So "either direction" means an accepted friend, and a pending request grants nothing.
- **Profiles client UPDATE grant: ten columns, not nine.** `tour_seen_at` was added by `20260925010000`. The columns are avatar_url, bio, cellar_visibility, display_name, favorite_wine_type, last_seen_at, location, phone, preferred_currency, tour_seen_at.
- **New accounts:** `handle_new_user()` (md5 `f18c8dc309331e2b2cf7d40bad8d55fa`) inserts only `(id, display_name, email)`, so column defaults decide a new account's settings.
- **The notice audience under M2's rule is 36 of 38:** 34 flipped (3 of them also have notes) and 2 notes-only (the FRIENDS and the PUBLIC author).
- **Views:** `catalog_wine_ratings` and `catalog_wine_descriptors` are `security_invoker=true`. `"wset note aromas read"` is `EXISTS (SELECT 1 FROM wset_notes n WHERE n.id = wset_note_aromas.note_id)`, so it narrows with the notes policy.
- **Function bodies (md5 of `replace(prosrc, chr(13), '')`):**

  | Function | md5 | Security | What this change does to it |
  |---|---|---|---|
  | `catalog_wine_structure(uuid)` | `e5111f04dc3c14e5d62a82072e70b6be` | DEFINER | switched to INVOKER |
  | `catalog_wine_usage(uuid)` | `8544e9afe31d30c26d516e68b19fca23` | DEFINER | recreated |
  | `shared_cellar_lots(uuid)` | `c3da48f21c077f0a349e5d88e55b0ff7` | DEFINER | recreated |
  | `catalog_wine_masked_pours(uuid[])` | `fea91b152e3565f16c56cc1d15810d29` | DEFINER, owner-only | called |
  | `catalog_wine_in_callers_unrevealed_glass(uuid)` | `f33fbd7f4e283cb0ed682469aa6ea2c2` | DEFINER, owner-only | mirrored |
  | `save_wset_note(jsonb,jsonb)` | `9ac29b18bbda5b08bcd9a12e19beb932` | INVOKER | unchanged |
  | `record_training_attempt(jsonb,jsonb,jsonb)` | `f6a24c83c24aaab34ab568dc6280083f` | DEFINER | unchanged |
  | `wset_notes_resolve_on_reveal()` | `f406623e9d46feb1f1aa0fb8c285529d` | trigger | unchanged |
  | `scrub_deleted_account(uuid)` | `b9aa8d71a00dda3aec526a2ec6950f1d` | DEFINER | unchanged; it deletes the person's notes and sets `cellar_visibility = 'PRIVATE'` |

- **`shared_cellar_lots` returns whole `cellar_lots` rows.** `getCellarBottles` readOnly selects `LOT_SELECT`, which includes `lot_note`, `price_per_bottle`, `purchase_source` and `storage_location`. `storage_location` is shown to others by design (`bottle-list.tsx` "where"); the other three are not.
- **Live lots by cellar setting:** PRIVATE 24 lots (3 with a lot note, 4 with a location); FRIENDS 35; PUBLIC 32 (8 with a price, 23 with a location, 4 with a source).
- **`wset_notes` has only `wset_notes_pkey`.** `cellar_consumptions` has no index on `wset_note_id`.

## 3. Data model and migrations

Both files follow `20260925120000_training_room.sql`:

- The header records the live state the file was written against.
- `set local lock_timeout = '10s'`, and no begin/commit (the applier owns the transaction).
- A pre-state `do` block fails closed.
- A temporary snapshot table (`on commit drop`) holds the "before" numbers.
- A post-state `do` block runs in the same transaction, and every check is a `raise exception`.
- Every function it recreates or relies on is pinned by md5 before, and the ones it creates or recreates are pinned after.

### 3.1 M1 `20260927140000_sharing_defaults.sql` (additive + policy; safe under the deployed app)

**Pre-state:**

- None of these exist yet:
  - `profiles.notes_visibility`;
  - tables `wset_note_holds` and `sharing_notices`;
  - functions `can_view_notes(uuid)`, `wset_note_held(uuid)`, `wset_my_held_notes(uuid[])` and `catalog_wine_unrevealed_glasses_of(uuid,uuid)`;
  - the three trigger functions and triggers below;
  - the three indexes.
- Enum `cellar_visibility` labels are exactly `{PRIVATE,FRIENDS,PUBLIC}`. `profiles.cellar_visibility` defaults to `'PRIVATE'`.
- `wset_notes` has RLS on and not forced, exactly the four policies with the live text (§2), exactly the four triggers, and `wset_notes_one_identity` as live.
- `profiles`:
  - the two policies are unchanged;
  - the client UPDATE grant is exactly the ten columns;
  - there is no table-level UPDATE for anon or authenticated.
- `"catalog read"` on `catalog_wines` is `((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id))`.
- `"wset note aromas read"` is as §2, and both views are `security_invoker=true`.
- The md5 pins of §2 hold, except `handle_new_user`, which M2 pins.
- Snapshot:
  - counts of profiles by (`cellar_visibility`, deleted);
  - the set of (note, glass) pairs the backfill will hold (step 9);
  - counts of notes.

**Body:**

1. **The notes column and its grant.**
   ```sql
   alter table public.profiles add column notes_visibility public.cellar_visibility not null default 'PUBLIC';
   grant update (notes_visibility) on public.profiles to authenticated;
   ```
2. **The hold table** (internal; no client access; `flight_holds` style):
   ```sql
   create table public.wset_note_holds (
     id uuid primary key default gen_random_uuid(),
     note_id uuid not null references public.wset_notes(id) on delete cascade,
     wine_id uuid references public.wines(id) on delete set null,   -- a removed glass keeps its hold (OD4)
     created_at timestamptz not null default now(),
     unique (note_id, wine_id)
   );
   create index wset_note_holds_wine_idx on public.wset_note_holds (wine_id);
   alter table public.wset_note_holds enable row level security;       -- no policies
   revoke all on public.wset_note_holds from public, anon, authenticated;
   ```
3. **Helpers** (§4.2 has the bodies):

   | Function | Security | EXECUTE | Mirrors / role |
   |---|---|---|---|
   | `catalog_wine_unrevealed_glasses_of(p_catalog_wine_id uuid, p_user uuid) returns setof uuid` | DEFINER, STABLE | owner only | `catalog_wine_in_callers_unrevealed_glass`, with `p_user` in place of `auth.uid()`, returning the glass ids |
   | `can_view_notes(p_author uuid) returns boolean` | DEFINER, STABLE | `authenticated`, `service_role`; revoked from PUBLIC and anon | the S7 Friends clause |
   | `wset_note_held(p_note_id uuid) returns boolean` | DEFINER, STABLE | `authenticated` (the policy calls it as the reader); revoked from PUBLIC, anon, service_role | |
   | `wset_my_held_notes(p_note_ids uuid[]) returns setof uuid` | DEFINER, STABLE | `authenticated` only | |

   Every new function explicitly revokes the default grants. Supabase's default privileges would otherwise hand them to PUBLIC, anon and service_role (the `transfer_tasting_host` trap).
4. **Triggers** (§5 has the bodies), each trigger function owner-only EXECUTE:

   | Trigger | Table | When | Does |
   |---|---|---|---|
   | `wset_notes_hold_on_identity` | `wset_notes` | AFTER INSERT OR UPDATE OF catalog_wine_id | writes holds (S10) |
   | `wines_release_note_holds` | `wines` | AFTER UPDATE OF is_revealed, `WHEN (new.is_revealed and not old.is_revealed)` | deletes that glass's holds |
   | `wset_notes_rule1_guard` | `wset_notes` | BEFORE UPDATE OR DELETE | the S12 guard |

5. **Indexes:**
   ```sql
   create index wset_notes_author_tasted_idx on public.wset_notes (author_id, tasted_on desc, created_at desc);
   create index wset_notes_catalog_wine_idx on public.wset_notes (catalog_wine_id, tasted_on desc) where catalog_wine_id is not null;
   create index cellar_consumptions_wset_note_idx on public.cellar_consumptions (wset_note_id) where wset_note_id is not null;
   ```
6. **The read policy** (§4.3).
7. **`alter function public.catalog_wine_structure(uuid) security invoker;`** The body and its md5 are unchanged; only `prosecdef` flips.
8. **`catalog_wine_usage` recreated from its live body, with one line changed:**
   ```sql
   (select count(*)::int from wset_notes n where n.catalog_wine_id = p_id and not wset_note_held(n.id)),
   ```
   `create or replace` keeps its ACL. `delete_catalog_wine` is unchanged and still refuses a wine that has any note, held or not.
9. **Backfill holds** for existing notes whose author is right now the adder of an unrevealed glass keyed to the note's wine. Live today that is 0 rows; the file handles it generally.
   ```sql
   insert into public.wset_note_holds (note_id, wine_id)
   select n.id, g from public.wset_notes n
   cross join lateral public.catalog_wine_unrevealed_glasses_of(n.catalog_wine_id, n.author_id) g
   where n.catalog_wine_id is not null
   on conflict (note_id, wine_id) do nothing;
   ```
   It is a one-off hide of notes the app has never displayed to anyone but their author. `raise notice` reports the count.
10. **`shared_cellar_lots` recreated from its live body, with one extra `||` (S13):**
    ```sql
    || case when p_owner = auth.uid() then '{}'::jsonb
            else jsonb_build_object('lot_note', null, 'price_per_bottle', null, 'purchase_source', null) end
    ```
    It is appended to the `jsonb_build_object('quantity', …, 'updated_at', …)` merge. A null `auth.uid()` takes the blanking branch. Its ACL is kept.
11. **The notice table** (S14), created empty:
    ```sql
    create table public.sharing_notices (
      user_id uuid primary key references public.profiles(id) on delete cascade,
      cellar_flipped boolean not null,   -- M2 turned this person's cellar PRIVATE -> PUBLIC
      notes_shared boolean not null,     -- they had a note with content that others can now read
      created_at timestamptz not null default now(),
      dismissed_at timestamptz,
      constraint sharing_notices_reason check (cellar_flipped or notes_shared)
    );
    alter table public.sharing_notices enable row level security;
    revoke all on public.sharing_notices from public, anon, authenticated;
    grant select on public.sharing_notices to authenticated;
    grant update (dismissed_at) on public.sharing_notices to authenticated;
    create policy "sharing notices read own" on public.sharing_notices for select to authenticated
      using (user_id = auth.uid());
    create policy "sharing notices dismiss own" on public.sharing_notices for update to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    ```
    Plus `profiles_deleted_drop_sharing_notice`, AFTER UPDATE OF deleted_at on `profiles` `WHEN (old.deleted_at is null and new.deleted_at is not null)`. It deletes that person's row. This is the `profiles_deleted_drop_favourites` precedent; its function is owner-only.

**Post-state:**

- **The read policy** has the new text exactly; the plan pins the normalized `pg_get_expr` output after a dry run. The insert, update and delete policies are byte-identical to the pre-state.
- **`wset_notes` triggers** are the four from before plus `wset_notes_hold_on_identity` and `wset_notes_rule1_guard`. `wines` gained `wines_release_note_holds`.
- **Profiles:**
  - `profiles.notes_visibility` is not null with default `'PUBLIC'`, and every row holds `'PUBLIC'`.
  - The client UPDATE grant is exactly eleven columns: the ten plus `notes_visibility`.
  - `cellar_visibility` still defaults to `'PRIVATE'`, and the counts by (visibility, deleted) equal the snapshot. **M1 flips nothing.**
- **ACLs:**
  - `can_view_notes` = {postgres, authenticated, service_role};
  - `wset_note_held` = {postgres, authenticated};
  - `wset_my_held_notes` = {postgres, authenticated};
  - `catalog_wine_unrevealed_glasses_of` and the four new trigger functions = {postgres}.
- **`wset_note_holds`:** RLS on, 0 policies, no privilege for PUBLIC/anon/authenticated. Its rows equal the snapshot's backfill set.
- **`sharing_notices`:** RLS on, exactly the two policies, `authenticated` SELECT plus UPDATE(dismissed_at) only, anon nothing, 0 rows.
- **Functions:**
  - `catalog_wine_structure`: `prosecdef = false`, md5 still `e5111f04…`.
  - `catalog_wine_usage` and `shared_cellar_lots`: the new md5s, recorded by the plan.
  - The helpers: their md5s pinned.
- **The three indexes exist.**

### 3.2 M2 `20260927150000_sharing_defaults_flip.sql` (the flip, the default, the notices)

**Pre-state:**

- M1 is present: its policy text, `sharing_notices` with 0 rows, `notes_visibility`.
- `cellar_visibility` still defaults to `'PRIVATE'`.
- `handle_new_user` md5 is `f18c8dc3…` (it names no visibility column).
- Every deleted profile's cellar is `PRIVATE`.
- Snapshot into a temp table, **before** anything changes:
  - `flipped` = non-deleted profiles with `cellar_visibility = 'PRIVATE'`;
  - `noted` = non-deleted authors who have at least one note that others could now see. Such a note meets all three conditions:
    - `catalog_wine_id is not null`;
    - `not wset_note_held(id)`;
    - it has content:
      ```sql
      num_nonnulls(clarity, appearance_intensity, colour_hue, condition, nose_intensity, development,
                   sweetness, acidity, tannin, alcohol, body, mousse, flavour_intensity, finish,
                   quality_score, price_category, readiness) > 0
      or btrim(taster_notes) <> ''
      or exists (select 1 from wset_note_aromas a where a.note_id = n.id)
      ```
      This is the SQL twin of §7.1's `noteHasContent`.
  - The counts by visibility.

**Body:**

1. ```sql
   insert into sharing_notices (user_id, cellar_flipped, notes_shared)
   select id, id in flipped, id in noted from flipped ∪ noted;
   ```
2. `update profiles set cellar_visibility = 'PUBLIC' where deleted_at is null and cellar_visibility = 'PRIVATE';` It runs as the table owner, so `profiles_deleted_guard` lets it through, and deleted rows are excluded anyway.
3. `alter table profiles alter column cellar_visibility set default 'PUBLIC';`

**Post-state:**

- No non-deleted profile is `PRIVATE`.
- The FRIENDS count equals the snapshot.
- PUBLIC = the snapshot's PUBLIC + |flipped|.
- Every deleted profile is unchanged and `PRIVATE`.
- The column default is `'PUBLIC'`.
- `sharing_notices` has exactly |flipped ∪ noted| rows. Each row's flags match the snapshot sets, and `dismissed_at` is null everywhere.
- `raise notice` reports |flipped|, |noted| and the number of rows. Today that is 34, 5 and 36; new signups before the apply move it.

### 3.3 `src/lib/supabase/database.types.ts` (hand-written; keep it in step with M1)

- **`profiles`:** Row `notes_visibility: CellarVisibility`; Insert and Update `notes_visibility?: CellarVisibility`.
- **`sharing_notices`:**
  - Row: `user_id`, `cellar_flipped`, `notes_shared`, `created_at`, `dismissed_at: string | null`.
  - Insert and Update: Update only `dismissed_at`.
  - `Relationships: []` (CLAUDE.md: every table needs it).
- **Functions:**
  - `can_view_notes: { Args: { p_author: string }; Returns: boolean }`
  - `wset_my_held_notes: { Args: { p_note_ids: string[] }; Returns: string[] }`
- **Not added:** `wset_note_holds`, `wset_note_held` and the internal helper. The app never calls them, as with `flight_holds`.
- **Alias:** `export type SharingAudience = CellarVisibility`.
- The `training-region-guess` branch also edits this file (training_attempts columns), so the plan rebases after it merges.

## 4. RLS and helpers

### 4.1 Who counts as a friend

A Friends note is readable by the author's **accepted friends**: anyone with a `friendships` row to or from the author, in either direction, exactly as `can_view_cellar`.

Since 2026-09-24 every friendship is a pair (A→B and B→A), written only by `accept_friend_request`, `accept_platform_invite` and the scrub. So "either direction" is the same as "accepted".

A pending `friend_requests` row grants nothing. Removing a friend (`remove_friend` deletes both rows) revokes access on the very next read.

### 4.2 Helper bodies

```sql
create function public.can_view_notes(p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_author
      and p.deleted_at is null                                  -- S7: the one addition
      and (
        p.notes_visibility = 'PUBLIC'
        or (
          p.notes_visibility = 'FRIENDS'
          and exists (                                          -- can_view_cellar's clause, verbatim
            select 1 from friendships f
            where (f.user_id = p_author and f.friend_id = auth.uid())
               or (f.user_id = auth.uid() and f.friend_id = p_author)
          )
        )
      )
  );
$$;

create function public.wset_note_held(p_note_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wset_note_holds h where h.note_id = p_note_id)
      or exists (                                               -- S11, the one source of "masked"
        select 1
          from wset_notes n
          join cellar_consumptions c on c.wset_note_id = n.id and c.owner_id = n.author_id
          cross join lateral catalog_wine_masked_pours(array[c.catalog_wine_id]) m
         where n.id = p_note_id and m.consumption_id = c.id);
$$;

create function public.wset_my_held_notes(p_note_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select n.id from wset_notes n
   where n.id = any(p_note_ids) and n.author_id = auth.uid() and wset_note_held(n.id);
$$;
```

- **`c.owner_id = n.author_id` in `wset_note_held`:** without it, anyone with a masked pour could hide another person's note by pointing their own consumption at that note's id.
- **Why `wset_note_held` is safe for anyone to call:**
  - It answers only for a note id.
  - The ids of held notes never reach anyone but their author: `wset_notes` hides them, and `cellar_consumptions` and `training_attempts` are owner-only.
  - A note is never visible first and held afterwards (§5.1).

### 4.3 The policy

```sql
drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes for select to authenticated
using (
  author_id = auth.uid()
  or (
    catalog_wine_id is not null
    and public.can_view_notes(author_id)
    and not public.wset_note_held(id)
    and exists (select 1 from public.catalog_wines cw where cw.id = wset_notes.catalog_wine_id)
  )
);
```

- **The `exists` runs under the reader's "catalog read".** It is the `catalog_wine_edits`/`catalog_wine_grapes` precedent. A note naming a `blind_pending` wine therefore reaches only people who can already read that wine: its creator, a curator, or someone who can read an answer key that names it.
- **No recursion.** "catalog read" → `can_read_blind_pending_catalog_wine` (INVOKER) → `wine_answers read` → definer helpers; nothing on that path reads `wset_notes`.
- **Do not add a `catalog_wines_unidentified` check.** Its policy calls `can_read_unidentified_wine`, which is SECURITY INVOKER and reads `wset_notes`, so the check would recurse. That recursion is why unidentified-wine notes are simply author-only (S8).
- **Unchanged:** the insert, update and delete policies; `"wset note aromas read"`, which narrows through its own `EXISTS`; and the author clause, which keeps every author-filtered reader in §6 identical.

## 5. Rule 1

**Rule 1 (CLAUDE.md, and the rule-1 specs of 2026-09-19):**

- Nothing may show a hidden glass's wine, before its reveal, to anyone who may not already see it.
- A check whose visible outcome depends on whether a wine is poured is itself an oracle for anyone other than the glass's adder.
- Refusals may depend only on the caller's own glasses.
- Nothing already visible is hidden later: a note that disappears at pour time is the "vanish oracle" of `2026-09-19-scan-photos.md` §3.1.

The scenario this change creates: a host writes an OPEN note on the catalog wine they pour tonight. Their profile and that wine's page would now say "noted W today" before the reveal.

### 5.1 The hold (S10): enforced in the database, at write time

```sql
create function public.wset_notes_hold_on_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.catalog_wine_id is null then return null; end if;
  if tg_op = 'UPDATE' and old.catalog_wine_id is not null then return null; end if;  -- a move is not an arrival
  insert into wset_note_holds (note_id, wine_id)
  select new.id, g from catalog_wine_unrevealed_glasses_of(new.catalog_wine_id, new.author_id) g
  on conflict (note_id, wine_id) do nothing;
  return null;
end $$;
```

- **Keyed on the author's glasses, not `auth.uid()`.** So every path is covered:
  - `save_wset_note`;
  - `record_training_attempt`, which is DEFINER;
  - `saveAllToRatings`' insert;
  - `wset_notes_glass_resolve_on_write`, which sets the identity in BEFORE INSERT, so this AFTER trigger sees it;
  - `wset_notes_resolve_on_reveal`, for BLIND notes on another glass of the same wine;
  - `resolve_unidentified_wine`, which is null→catalog.
- **The adder** is the host for an `added_by_host` glass and the contributor for a BYO glass. Only unrevealed glasses count, so an OPEN board's glasses, inserted with `is_revealed = true`, never hold a note.
- **No oracle:**
  - The hold depends only on the writer's own glasses.
  - Nobody else ever saw the note, so nothing vanishes.
  - Every figure others see leaves held notes out (S9).
- **Released only by a reveal.** `wines_release_note_holds` deletes the holds of the glass whose `is_revealed` turned true. A removed glass (`wine_id` set to null), a deleted tasting or a glass left unrevealed in a CLOSED tasting keeps its holds for good. This is the `flight_holds` rule (review round 1, OD4): releasing on removal would publish mid-tasting on Remove + re-add.
- **Rejected: holding existing notes when a glass is keyed.** That is `flight_holds_on_link`'s shape, and it is exactly the vanish oracle: a guest watches the host's older notes disappear at pour time.

### 5.2 The pour link (S11): enforced in `wset_note_held`, so the policy covers it

Suppose a note is linked to a pour of its own author that `catalog_wine_masked_pours` masks: a D11 draw-down at Start, a running pour, or one kept after a Swap. The note is hidden from others while the pour is masked.

- A consumption is masked from the moment it is created (the pour itself) until the reveal. A normal Drink never becomes a pour. So a note is never shown and then hidden.
- The history "Rate" button on tonight's D11 pour is the path this catches. Usually §5.1 has already held the note; §5.2 also covers the pour of a glass that has since been Swapped to another wine, where the author no longer adds a glass keyed to the first wine.

### 5.3 The guard (S12): the `catalog_wines_rule1_guard` analogue

```sql
create function public.wset_notes_rule1_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or old.author_id is distinct from auth.uid() then
    return coalesce(new, old);                       -- scrub, cascades, RI, service_role, a curator's merge
  end if;
  if (old.catalog_wine_id is not null
      and not wset_note_held(old.id)
      and exists (select 1 from catalog_wine_unrevealed_glasses_of(old.catalog_wine_id, old.author_id)))
     or (tg_op = 'UPDATE' and old.catalog_wine_id is not null
         and new.catalog_wine_id is distinct from old.catalog_wine_id and new.catalog_wine_id is not null
         and exists (select 1 from catalog_wine_unrevealed_glasses_of(new.catalog_wine_id, old.author_id))) then
    raise exception using errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change or delete this note after the reveal.';
  end if;
  return coalesce(new, old);
end $$;
```

- **Why refuse rather than hold or allow.**
  - An edit or delete of a note others already see would otherwise either vanish (a hold) or show a fresh change, such as `tasted_on` moved to today, mid-tasting.
  - The refusal is visible only to the adder.
- **What stays allowed:** the author's edits to a held note, since nobody else sees it, and every write by anyone who is not an adder.
- **`save_wset_note` (INVOKER)** runs its UPDATE at trigger depth 1, so it is judged. Its "never overwrite an existing identity" rule stays.
- **Direct client UPDATEs of `catalog_wine_id` are judged too.** `authenticated` holds UPDATE on all 30 `wset_notes` columns.
- **In the app:** the note editor already throws `error.message` for a failed save or delete. A pure `src/lib/notes/rule1-guard.ts` (`NOTE_RULE1_MESSAGE`, `isNoteRule1Refusal(error)`, the `src/lib/catalog/rule1-guard.ts` pattern) lets the sheet show the sentence rather than a generic error.

### 5.4 Hidden and unidentified wines

- **A note naming a `blind_pending` wine reaches only readers of that wine** (§4.3). Others' surfaces also embed `catalog_wines!inner`, so a row whose wine a reader cannot read is dropped a second time.
- **Unidentified-wine notes are author-only** (S8).
- **Unchanged:**
  - identity-less BLIND notes on a hidden glass, and unrevealed TRAINING notes, stay author-only;
  - `/catalog/[wineId]/notes/new` still returns `notFound()` for a `blind_pending` wine.

### 5.5 Figures others see

- **Figures that follow the reader's policy:** `catalog_wine_ratings` (the community rating and note count on the wine page, catalog list, cellar rows, lot sheet and scan-match card), `catalog_wine_descriptors` ("What people find") and `catalog_wine_structure`.
- **`catalog_wine_usage.note_count`** leaves out held notes; private notes still count, since it is a reference count for the delete guard.
- **`get_app_stats().notes_created`** stays a global total of every note. It names no wine, and nothing in `src/` calls it.

### 5.6 Residuals (also in §11)

- **Traces written before the glass stay as visible as they were:**
  - a note written before the glass is keyed, or while the glass is an incomplete D7 draft;
  - a cellar lot or cellar-scan photo added before the pour.

  **S1 multiplies this audience:** 34 of 38 cellars go from nobody else to everyone. The normal host flow is "scan into the cellar, then pour from it" (D11). Every guest who opens the host's cellar now sees tonight's bottle, with its added date, and the scan in the wine's photo strip (`via = 'cellar'` follows `can_view_cellar`). This is not an oracle, but it is a strong hint (owner option O1, §11).
- **A curator merge** that moves a note others can see onto a wine in its author's unrevealed glass is not held: holding it would be a vanish.

## 6. Every reader of `wset_notes`, and what the narrowed policy does to it

"Author filter" means `.eq("author_id", <viewer>)`, or the rows read are the viewer's own. Those readers keep exactly what they read today, because the policy's author clause is unchanged.

| Reader | What it reads | Changes? | Right? |
|---|---|---|---|
| `src/app/catalog/page.tsx:107` | viewer's scored notes | no (author filter) | yes |
| `src/app/catalog/page.tsx:117` `catalog_wine_ratings` | community averages | yes: only notes the viewer may read | yes (S9) |
| `src/app/catalog/[wineId]/page.tsx:70` | "Your notes" | no | yes; gains the held tag (S19) |
| `…/[wineId]/page.tsx` via `fetchCatalogWine` (ratings), `fetchWineDescriptors`, `fetchWineStructure`, `catalog_wine_usage` | community figures | yes (S9) | yes |
| `…/notes/[noteId]/page.tsx:24` | one note | a non-author now gets the read view when the policy admits them (S17) | yes |
| `…/notes/note-editor.tsx:132` | delete own note | the guard may refuse the adder (S12) | yes |
| `src/app/taste/notes/notes-data.ts:118` | archive | no (author filter) | yes; fix its "policy is public" comment |
| `src/app/tastings/[id]/open-board.tsx:76` | every participant's score per glass | yes: an Only-me author's score, or a Friends author's score seen by non-friends, drops out of the board and its average; unidentified glasses show only your own | yes per S2 ("governs every note"); 0 OPEN tastings live |
| `src/app/tastings/[id]/play/play-experience.tsx:295` | own glass notes | no | yes |
| `src/app/tastings/[id]/record/record-view.tsx:493` | own saved-glass ids | no | yes |
| `src/app/tastings/[id]/record-actions.ts:76,116` | own notes; insert | no; the insert gets the hold trigger | yes |
| `src/components/add-wine/actions.ts:345` | own tasted wines | no | yes |
| `src/components/add-wine/actions.ts:421` ratings | community meta | yes (S9) | yes |
| `src/components/new-note-modal.tsx:424` | own note read-back | no | yes |
| `src/components/wset/note-modal.tsx:49` | own note (callers pass own) | no | yes; fix comment |
| `src/lib/cellar/bottles.ts:79` ratings / `:105` own | community / yours | ratings yes (S9) / own no | yes |
| `src/lib/cellar/history.ts:170` | own consumptions' notes | no | yes |
| `src/lib/cellar/lot-sheet.ts:95` ratings / `:115` own / `:154` spread / `:197` own | figures, yours, all scored notes on the wine, consumption notes | ratings and spread: yes, only readable notes; the "by friends" spread now respects each friend's setting | yes |
| `src/lib/overview-data.ts:247,265` | own ratings card | no | yes |
| `src/lib/your-numbers.ts:440` | own notes | no | yes |
| `src/lib/wine-identity/server/match.ts:82` | ratings for the scan-match card | yes (S9) | yes |
| `src/lib/wset/queries.ts:193` `fetchNoteView` | one note (unused today) | becomes the read view's loader; the policy decides | yes |
| `src/lib/wset/queries.ts:279` `fetchHiddenNoteState` | own hidden note | no | yes |
| view `catalog_wine_ratings` / `catalog_wine_descriptors` (INVOKER) | aggregates | follow the policy | yes (S9) |
| policy `"wset note aromas read"` | aroma rows | narrows with the notes | yes |
| `can_read_unidentified_wine` (INVOKER) | "author of a note naming it" | no: its own notes, author clause | yes |
| `catalog_wine_structure` (DEFINER→INVOKER) | structure averages | yes (S9) | yes |
| `catalog_wine_usage` (DEFINER) | note_count | held notes left out | yes (§5.5) |
| `get_app_stats` (DEFINER) | total notes | no | yes (global only) |
| `delete_catalog_wine` (DEFINER) | refs incl. every note | no | yes (server truth) |
| `glass_removal_impact` (DEFINER) | identity-less notes on a glass | no | yes |
| `merge_catalog_wines` (DEFINER) | moves the loser's notes | no; the guard judges only a curator who is also the adder-author, which `catalog_wines_rule1_guard` already refuses | yes |
| `resolve_unidentified_wine` (DEFINER) | unidentified→catalog | null→catalog is an arrival, so it can hold (S10) | yes |
| `record_training_attempt` (DEFINER) | saves the TRAINING note | the first reveal can hold; a re-reveal of an already-shared note is refused for an adder of that wine (edge) | yes |
| `save_wset_note` (INVOKER) | own upsert | guard (S12) and hold (S10) | yes |
| `scrub_deleted_account` (DEFINER, via the auth.users trigger) | deletes own notes | no (trigger depth > 1) | yes |
| `wines_drop_unresolved_notes`, `wset_notes_resolve_on_reveal`, `wset_notes_glass_*` (triggers) | identity-less notes / resolve | resolve can hold; the rest no | yes |

## 7. UI surfaces and copy

All copy below is a draft for the owner to approve. Copy lives in pure modules, never hard-coded in components.

### 7.1 Pure helpers (vitest)

**`src/lib/sharing/visibility.ts`:**

- `AUDIENCE_OPTIONS = [{PUBLIC,"Everyone"},{FRIENDS,"Friends"},{PRIVATE,"Only me"}]`.
- `audienceLabel(v)`.
- `notSavedLine(v)`: "Not saved. Still set to {label}."
- `ownNotesLine(v)`:
  - "Everyone can see these";
  - "Your friends can see these";
  - "Only you can see these".

**`src/lib/sharing/notice.ts`:**

- `sharingNoticeCopy({ cellarFlipped, notesShared, cellar, notes, dismissedAt })` returns `{ title, body, cta } | null`.
- A variant mentions the cellar only if `cellarFlipped && cellar === "PUBLIC"`, and the notes only if `notesShared && notes === "PUBLIC"`.
- It returns null when nothing still holds, or when the notice was dismissed.

**`src/lib/notes/shared-notes-view.ts`:**

- `noteHasContent(row, aromaCount)`: `summarizeNoteRow(...).done > 0 || aromaCount > 0 || taster_notes.trim() !== ""`. It is the twin of M2's SQL.
- `noteSummaryLine({ aromaWords, tasterNotes })`: up to 4 distinct aroma words joined by ", ". Otherwise the free text cut at a word boundary to at most 90 characters plus "…". Otherwise null.
- `orderNotes`: `tasted_on desc, created_at desc, id desc`.
- `NOTES_SHOWN = 5` and `NOTES_FETCHED = 50`.
- `contextBadge(kind)`: "Blind", or "Training" (`TRAINING_COPY.trainingBadge`), or none.

**`src/lib/notes/rule1-guard.ts`:** as §5.3.

### 7.2 Wine page `/catalog/[wineId]`: "Notes from others"

Placed directly after "Your notes". It is hidden when empty.

- **Data:** `src/lib/notes/shared-notes.ts` (server-only), `getOthersNotesForWine(supabase, wineId, viewerId)`:
  ```
  wset_notes where catalog_wine_id = wineId and author_id <> viewerId
  embeds:
    author:profiles!wset_notes_author_id_fkey(id, display_name, avatar_url)
    aromas:wset_note_aromas(term:wset_aroma_terms(term))
  order per §7.1, limit 50, then filter noteHasContent
  ```
- **Row:** two sibling links, never nested.
  - The avatar (32 px, initial fallback as on the Participants card) and the display name link to `/u/{id}`.
  - The rest of the row links to `/catalog/{wineId}/notes/{noteId}`. It holds:
    - the date (`dayMonthYear(tasted_on)`) and the badge;
    - the score, "{n} · {band}" with `scoreWord`, or "Not scored";
    - the summary line.
  - Min height 44 px; tokens only; dark mode.
- **Show all:** "Show all {n} notes" / "Show fewer", in place (client). When 50 were fetched, a footer reads "Showing the 50 most recent notes."
- **"Your notes" rows** gain a muted "Hidden from others" tag for ids returned by `wset_my_held_notes`.

### 7.3 Profile `/u/[id]`: "Tasting notes"

Placed after the tastings list. It renders even when the stats empty state shows, and it does not render for a deleted profile, whose page returns early.

- **Data:** `getProfileNotes(supabase, profileId)`:
  ```
  wset_notes where author_id = profileId and catalog_wine_id is not null
  embeds:
    catalog_wine:catalog_wines!inner(title fields, image_url)
    aromas
  order, limit 50, filter noteHasContent
  ```
- **Row:** one link to the note view, containing:
  - the wine thumbnail (`image_url`, or `HatchThumb`);
  - the wine title (`catalogWineTitle`);
  - the date and badge;
  - the score.
- **Someone else's profile:** the heading is "Tasting notes". With no visible rows the section is hidden, so it never tells "their notes are private" apart from "no notes".
- **Your own profile:**
  - The heading is "Your tasting notes", with `ownNotesLine(notes_visibility)` · "Change" linking to `/profile/edit#sharing`.
  - Held rows carry "Hidden from others".
  - Empty state: "No tasting notes yet."
- **Cap and "Show all":** as §7.2.

### 7.4 Read view `/catalog/[wineId]/notes/[noteId]` for a non-author (S17)

- **Access:** as the viewer, read the note under RLS. `notFound()` when:
  - there is no row;
  - `catalog_wine_id !== wineId`;
  - the wine read fails.

  The author still gets the editor, unchanged.
- **Layout** (`note-read-view.tsx`, server):
  - Eyebrow "Tasting note".
  - h1: the wine title, linking back to `/catalog/{wineId}`.
  - Author line: the avatar and name linking to `/u/{id}`, then " · Tasted {d Mon yyyy}", then the badge.
  - Score block: "{score} · {band}", or "Not scored".
  - The sections from `composeLiveNote(state, termLabels, labelsFor("en"), { ...noteConnectors("en"), band })`, in `NOTE_CAPTIONS` order: Appearance, Nose, Palate, Conclusions, Taster's notes. Each is a caption plus prose, and empty sections are skipped.
  - If every section is empty: "Nothing recorded yet."
- **Never shown:** the tasting, the glass, or any edit, delete or share control.

### 7.5 The notice on `/overview` (S4, S15)

- **Server:**
  - Extend the page's profile select with `cellar_visibility, notes_visibility`.
  - Read `sharing_notices` (`cellar_flipped, notes_shared, dismissed_at`) with `.maybeSingle()`. A read error means no card.
  - Pass the result of `sharingNoticeCopy(...)` to `SharingNotice` (client, `src/app/overview/sharing-notice.tsx`). It is the first child of `<main>`, above the invitation card, at every width.
  - Style: a quiet bordered card with an eyebrow, not the bordeaux banner.
- **Actions:**
  - "Got it" calls `dismissSharingNotice()`. It lives in `src/lib/sharing/actions.ts`, a `"use server"` file that exports async functions only, and it sets `dismissed_at = now()` on the viewer's own row.
  - The primary link dismisses too, then navigates to `/profile/edit#sharing`.
  - The card hides at once. A failed write keeps it hidden for the visit.
- **Copy** (eyebrow "Sharing"):
  - **Cellar and notes:**
    - Title: "Your cellar and tasting notes are now visible to everyone"
    - Body: "Other Blindr members can now see the bottles in your cellar and the notes you write. You choose who sees each one in your settings."
    - Link: "Change who can see them"
  - **Notes only:**
    - Title: "Your tasting notes are now visible to everyone"
    - Body: "Other Blindr members can now see the notes you write. You choose who sees them in your settings."
    - Link: "Change who can see them"
  - **Cellar only** (they already changed the notes setting):
    - Title: "Your cellar is now visible to everyone"
    - Body: "Other Blindr members can now see the bottles in your cellar. You choose who sees it in your settings."
    - Link: "Change who can see it"
  - **Dismiss:** "Got it"

### 7.6 Settings: "Sharing" card on `/profile/edit` (S18)

- **Placement:** a `Card` with `id="sharing"`, placed second: after "Edit profile" and before "Appearance". The page's profile select gains `cellar_visibility, notes_visibility`.
- **Component:** `src/components/sharing/visibility-select.tsx` (client), `VisibilitySelect({ userId, column: "cellar_visibility" | "notes_visibility", current, label, help })`.
  - It generalizes `CellarVisibilityControl`: it writes `profiles.update({ [column]: v })` as the viewer, under the column grant and "profiles update own".
  - On failure it snaps back and shows `notSavedLine`.
- **Rows:**
  - **"Who can see your cellar"**, help: "Your bottles and where you keep them. What you paid, where you bought them and your private notes stay yours." (true after S13)
  - **"Who can see your tasting notes"**, help: "Applies to every note you write. A note on a wine in your own unrevealed flight stays hidden until the reveal."
- **`/cellar`:** `cellar-visibility-control.tsx` becomes a thin use of `VisibilitySelect` (label "Visible to", the new option labels). Today `page.tsx` falls back to `"PRIVATE"` when the profile read fails, which claims a setting the row may not hold. It now renders no control instead.
- **Hash scroll:** `#sharing` must bring the card into view inside the app shell's scroll column. The window never scrolls in this app. If the native hash scroll does not do it, scroll the container. Browser check B2.

### 7.7 Other copy (S22)

The tour copy is owner-approved and pinned in `tour.test.ts`.

- **Tour step "cellar":** "…the catalog is everyone's reference, and other members can see your cellar unless you change it in your profile settings."
- **Tour step "community":** "Find people, {befriend}, share your invite link. You choose who sees your cellar and your notes: everyone, friends or only you."
- **`/u/[id]/cellar`:** "This cellar is private" stays as it is. It is still true for Only me, and for Friends when seen by a non-friend.

## 8. Account deletion

- **`scrub_deleted_account` is not recreated.** Its md5 stays `b9aa8d71…`.
- **Why nothing needs adding to it:**
  - Step 6 already deletes the person's notes, attempts, lots and consumptions.
  - Step 7 already sets `cellar_visibility = 'PRIVATE'`, which is correct under the new default.
  - `notes_visibility` on a scrubbed profile governs nothing. `can_view_notes` refuses a deleted author, which also covers a note written by a leftover session token after the last scrub call.
- **The notice row** is deleted by `profiles_deleted_drop_sharing_notice`, the `profiles_deleted_drop_favourites` precedent.
- **Holds** cascade with the notes.
- **The guard** never judges the scrub: it runs inside the auth.users trigger at depth > 1, and its `auth.uid()` is null.
- **M2 never touches deleted profiles.**

## 9. Tests

### 9.1 Vitest (pure, relative imports)

- **`visibility.test.ts`:** labels, order, `notSavedLine`, `ownNotesLine`.
- **`notice.test.ts`:** all flag × setting combinations; dismissed → null; nothing still true → null; never mentions a setting the row does not hold.
- **`shared-notes-view.test.ts`:**
  - `noteHasContent`: the empty placeholder, aroma-only, free-text-only, score-only;
  - `noteSummaryLine`: dedupe, four-word cap, 90-character word cut;
  - ordering and tie-breaks; the cap arithmetic; badges.
- **`rule1-guard.test.ts`:** message and SQLSTATE detection.
- **`tour.test.ts`:** the new sentences.

### 9.2 DB suite `scripts/sharing-defaults.test.mjs`

- Pattern of `scripts/training-room.test.mjs`: production, every test in a transaction that always rolls back, throwaway profiles, `asUser` via `request.jwt.claims`.
- `SHARING_DEFAULTS_APPLY=<M1>,<M2>` dry-runs both files inside each test.
- Main session only.

1. **`can_view_notes` against `can_view_cellar`.** Set both columns to the same value for PUBLIC, FRIENDS and PRIVATE. For each viewer — self, an accepted pair, a one-way row inserted as owner, a pending request only, a stranger, no user — both helpers answer the same. A deleted author → `can_view_notes` false.
2. **Policy, author:** reads every note of their own, including identity-less, held, Only me and unidentified.
3. **Policy, others:**
   - Everyone → readable.
   - Friends → the friend yes; the stranger and the pending requester no.
   - Only me → nobody.
   - Identity-less BLIND and TRAINING → nobody.
   - Unidentified-wine note → nobody.
   - A note on a `blind_pending` wine → the stranger no, the wine's creator yes.
   - Aromas follow their note.
4. **Figures:**
   - `catalog_wine_ratings`, `catalog_wine_descriptors` and `catalog_wine_structure`, read as a stranger, leave out an Only-me note and a held note; read as the author, they include them.
   - `catalog_wine_usage.note_count` leaves out a held note and counts an Only-me one.
   - `prosecdef` is false for structure.
5. **Hold:**
   - A host with an unrevealed `added_by_host` glass keyed to W inserts an OPEN note on W → the guest cannot read it, the author can.
   - `wset_my_held_notes` returns it to the author and nothing to the guest.
   - The same for a BYO contributor.
   - A guest's own note → not held.
   - A note written before the glass → stays readable after the glass is added (no vanish).
   - Reveal (`reveal_wine`) → readable.
   - Remove the glass before the reveal → still held.
   - Delete the tasting → still held.
   - Identity arrival paths each hold:
     - `wset_notes_resolve_on_reveal` on glass 1 while the author adds an unrevealed glass 2 of the same wine;
     - `record_training_attempt`;
     - `resolve_unidentified_wine`.
   - A merge move L→W → not held.
   - M1's backfill holds an existing adder's note.
6. **Pour link:**
   - The author's masked D11 consumption with `wset_note_id` set → hidden from others; visible after the reveal.
   - Another owner's consumption pointing at my note → does not hide it.
7. **Guard:**
   - The adder's UPDATE, `save_wset_note` and DELETE of a shared note on W → 42501 with the message.
   - Moving a note onto W → 42501.
   - The same writes on a held note → allowed.
   - A non-adder → allowed.
   - After the reveal → allowed.
   - A curator's merge of someone else's note → allowed.
   - The scrub and `service_role` → not judged.
8. **Grants and ACLs:**
   - Profiles UPDATE grant = the eleven columns.
   - `sharing_notices`: SELECT plus UPDATE(dismissed_at) for `authenticated`; own row only; a client cannot update `cellar_flipped` or insert; anon nothing.
   - `wset_note_holds`: no client privilege.
   - The ACLs of §3.1.
9. **`shared_cellar_lots`:** a non-owner gets null `lot_note`, `price_per_bottle` and `purchase_source`, and the real `storage_location` and quantity with masked pours. The owner calling on themselves gets everything.
10. **M2:**
    - Every non-deleted PRIVATE profile → PUBLIC; FRIENDS unchanged; deleted rows unchanged.
    - A new profile inserted like `handle_new_user` → cellar and notes both PUBLIC, and no notice row.
    - Notices = flipped ∪ noted, with the right flags; an empty-placeholder-only author is not "noted".
    - `dismissSharingNotice`'s UPDATE as the user stamps only their own row.
11. **Account deletion:** a soft-delete via the auth path → the notice row is gone, the notes are gone, the guard does not refuse.

### 9.3 Existing suites to update or re-run with the APPLY variable

- **`scripts/tour-seen.test.mjs`:** its "exactly the ten columns" test becomes eleven.
- **`scripts/catalog-wine-structure.test.mjs` and `scripts/wset-notes.test.mjs`** use real profiles (`profilePair()` takes the first two ids). Pin `notes_visibility = 'PUBLIC'` on them inside the rolled-back transaction, or switch to throwaway profiles. Otherwise a real person choosing Only me breaks them. Also fix structure's "via SECURITY DEFINER" comment.
- **Re-run to show they still pass:** `catalog-manage.test.mjs` (usage), `cellar-social.test.mjs` (shared cellar), `friend-requests.test.mjs`, `training-room.test.mjs`, `live-note.test.mjs`.

### 9.4 Browser checklist

Use prod after each step, with demo accounts minted by `.superpowers/demo-session.mjs` and never a typed password. Check a 375 px phone and a laptop, light and dark.

- **B1:** the Sharing card. Both selects save. A failed write snaps back with "Not saved. Still set to …". The `/cellar` select shows the same value.
- **B2:** `/profile/edit#sharing` scrolls the card into view.
- **B3:** the notice for an affected account.
  - "Got it" hides it. A reload and a second browser never show it again.
  - The link dismisses it and lands on the card.
  - An unaffected or new account never sees it.
- **B4:** the wine page's "Notes from others": rows, two links, badges, score, summary, "Show all", empty-hidden, a phone row height ≥ 44 px.
- **B5:** the profile's "Tasting notes": someone else's; your own, with its line and "Change"; empty cases.
- **B6:** the read view for someone else's note, and a hidden note's URL → not found.
- **B7:** a second account sees an Everyone note, does not see Only me, and sees Friends only once the friendship is accepted.
- **B8:** Rule 1 on a throwaway LIVE tasting.
  - The host writes a note on the poured wine. The guest does not see it on the host's profile, on the wine page or in the community figures.
  - The host's own row says "Hidden from others".
  - Editing the host's older note on that wine is refused with the message.
  - After the reveal, everything appears.
- **B9:** someone else's cellar page shows no price and no private note in the RSC payload (`read_network_requests`).

## 10. Rollout and rollback

### 10.1 Why M1 is safe under the deployed app

- **The deployed app reads others' notes only through:**
  - aggregates, which lose only held notes because every author is still Everyone;
  - the lot sheet's spread (the same);
  - the OPEN board, with 0 OPEN tastings.
- **Every other reader is author-filtered.**
- **`shared_cellar_lots`' blanked fields are not rendered in readOnly.**
- **`catalog_wine_structure` is called the same way.**
- **The guard only adds a refusal for adders.** The old editor surfaces the message raw.

### 10.2 Order

Each apply goes through the pg applier (`apply-migration.mjs … --dry` first; `supabase db push` refuses on this project), with the owner's go-ahead.

1. `SHARING_DEFAULTS_APPLY=M1,M2` runs the DB suite and the §9.3 suites as dry runs on prod (all rolled back).
2. Applier `--dry` M1, then apply M1. Smoke the deployed app: wine page, catalog list, a note save, own cellar, someone's cellar, `/taste/notes`.
3. Push the app to prod: `database.types.ts`, §7 and the S22 copy. Smoke B1, B2, B4–B7 and B9. There are no notice rows yet, so no card shows.
4. Applier `--dry` M2 (check the notice numbers), then apply M2 in the same session. Smoke B3 and B8.
5. Add a CLAUDE.md bullet: the settings, the policy, the hold/pour/guard rules, the notice table, "never add a `catalog_wines_unidentified` check to the notes policy", the new grant list and the two new migrations.

**The gap between steps 3 and 4:** notes show on the new surfaces for a few minutes before the notices exist. The window is kept short on purpose; see R9.

### 10.3 Rollback

Keep the SQL at `scripts/sharing-defaults/rollback-m2.sql` and `rollback-m1.sql`, never under `supabase/migrations`, and run each with `--dry` first.

- **The app:** revert the Vercel deploy at any time. It works against M1, and against M1+M2.
- **M2 undo:**
  ```sql
  update profiles p set cellar_visibility = 'PRIVATE'
    from sharing_notices s
   where s.user_id = p.id and s.cellar_flipped and p.cellar_visibility = 'PUBLIC' and p.deleted_at is null;
  alter table profiles alter column cellar_visibility set default 'PRIVATE';
  delete from sharing_notices;
  ```
  This also re-privatizes anyone who deliberately kept PUBLIC after the notice (R10).
- **M1 undo (after the app revert):**
  - Restore the old read policy text exactly: `num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1 or author_id = auth.uid()`.
  - Drop the three triggers and their functions, the four helpers, `wset_note_holds` and `sharing_notices`.
  - `alter function catalog_wine_structure(uuid) security definer`.
  - Recreate `catalog_wine_usage` and `shared_cellar_lots` from the pinned live bodies (md5 `8544e9af…`, `c3da48f2…`).
  - `revoke update (notes_visibility)` and drop the column. People's choices are lost.
  - The indexes may stay.

## 11. Open residuals and owner options

- **R1 / O1.** The pre-glass trace grows with S1 (§5.6): a host's fresh cellar lot and cellar-scan photo of tonight's bottle are now seen by every guest.
  - A possible mitigation, not in scope and for the owner to choose: while you host a tasting that is DRAFT or running, bottles you add to your cellar show to others only after it ends.
  - That depends on the owner's own tastings, not on which wine is poured, so it is no oracle.
  - Or: a one-line hint in the flight add flow.
- **R2.** A held note whose glass is removed, or whose tasting is deleted or closed unrevealed, stays hidden for good (OD4). The author sees "Hidden from others".
- **R3.** A curator merge can move a note others can see onto a wine that is in its author's unrevealed glass (§5.6).
- **R4.** Community figures differ between viewers: a Friends note counts for friends only. This is by design (S9).
- **R5.** The adder cannot edit or delete an older note that others see, on tonight's wine, until the reveal, and never if that glass stays unrevealed in a CLOSED tasting. This is the same trade the owner accepted for `catalog_wines_rule1_guard`.
- **R6.** `get_app_stats().notes_created` counts every note, private and held included. It is global only.
- **R7.** Unidentified-wine notes become author-only (0 live). On an OPEN board, the other participants' scores on such a glass disappear.
- **R8.** The OPEN board and the lot sheet's spread follow each author's setting, so an Only-me taster's score leaves a group board.
- **R9.** The minutes between the app deploy and M2: notes are displayed before the notices exist.
- **R10.** Rolling back M2 re-privatizes flipped cellars that are still PUBLIC, including anyone who chose PUBLIC on purpose after the notice.
- **R11.** `notes_visibility`, like `cellar_visibility`, is readable by every member.
- **R12.** The notice audience is fixed at M2's apply time. A signup between M1 and M2 counts as existing: PRIVATE, so it is flipped and gets a notice.

## 12. Not verified here

- **Supabase's default EXECUTE grants for new functions in this project.** The post-state pins the ACLs whatever they turn out to be.
- **The composed prose for every enum value.** Assumed from `wset-sheet.tsx`'s use of `labelsFor` and `noteConnectors`.
- **Native `#hash` scrolling** inside the app shell's scroll column (B2).
- **The cost of the per-row policy helpers at scale.** Not measured. It is trivial at 16 notes; the new indexes cover the lookups.
- **Pending migrations in other worktrees.** I checked the branch list only: `training-region-guess` recreates `record_training_attempt` and is already live. The plan re-checks before choosing versions.

## 13. Controller rulings (2026-09-27, binding on the plan)

- **C1 O1 is accepted as a residual for now.** No "hide bottles added while hosting" filter in this change. The pre-glass trace already exists through `catalog_wine_holdings` counts; the owner is told plainly and offered the hosting-window filter as a follow-up. Cost if wrong: a guest browsing a host's cellar just before a tasting may guess a wine until the follow-up ships.
- **C2 Go-ahead.** The owner approved the design and the one-time card, and has authorised pushes and applies for this work ("get it all done"). M1, the app and M2 follow §10.2 without a further stop; every apply is dry-run first.
- **C3 Copy.** §7's drafts ship as written; the owner reviews them live and changes follow as copy edits.
- **C4 Order across branches.** `training-region-guess` merges to master first; this branch rebases onto it before implementation (both edit `database.types.ts`: keep both). `levels` lands after this change; its migration version sorts after M2.
