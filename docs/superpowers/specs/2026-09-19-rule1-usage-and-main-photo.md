# Rule 1: catalog usage counts and a poured wine's public record (F2, F3)

- **Date:** 2026-09-19
- **Worktree / branch:** `blindtastingapp-leaks` / `leaks` (off master `8f800ce`)
- **Origin:** `docs/superpowers/specs/2026-09-19-scan-photos.md` §12, findings F2 and F3 (found read-only during the scan-photos review).
- **Migration version:** `20260919213300`. It is free in live `supabase_migrations.schema_migrations`, on `origin/master` and in every worktree.
  - When the spec was written, the newest live version was `20260919183100` and `git ls-remote` gave `8f800ce`.
  - The review round re-checked it. Live's newest version is `20260919203000` (the listing lockdown, applied since), and `origin/master` is `457af90`. The scanfix worktree adds `20260919214700_label_lookups.sql`, a later version.
  - This file depends on neither of them.
- **State of the design:** the migration in §4 was dry-run on live (`DRY-OK 20260919213300 rule1_usage_and_main_photo`). The rolled-back probe in §6 met all 71 EXPECTs (34 before, 36 after, plus "live unchanged"). Both were re-run after the review round reworded one comment inside `catalog_wines_rule1_guard` (D6), with the same result. Nothing was applied, pushed or committed. The owner approves the live apply.

**Rule 1 (CLAUDE.md):** nothing may show a hidden (unrevealed) glass's wine, before its reveal, to anyone who may not already see it. A check that answers differently for different users depending on whether a wine is poured is itself an oracle. Refusals may depend only on the caller's own glasses.

## 1. Summary

**F2.** `catalog_wine_usage(p_id)` is SECURITY DEFINER, with EXECUTE for PUBLIC, `anon`, `authenticated` and `service_role`.

- Its `appearance_count` counts every `wine_answers` row, unrevealed glasses included. Anyone, even with just the anon key, sees a public wine's count go up the moment a host keys it into a glass.
- Its `holders`, `bottles` and `consumption_count` (and the same numbers in `catalog_wine_holdings(uuid[])`) move when D11 draws a bottle down at Start. They move even when the bottle comes from a PRIVATE cellar.

The fix:

- `appearance_count` counts revealed glasses only.
- A bottle poured into a glass that is not revealed yet still counts as in its cellar, and not as drunk, until that reveal.
- EXECUTE is revoked from PUBLIC and `anon`.

**F3.** On the flight path, `fillCatalogWine` runs before the glass exists. It sets `image_url`, `description`, `alcohol_percent` and the blend on a wine the adder created, whenever those are empty. `setCatalogWineImage`, `updateCatalogWine` and a direct PostgREST PATCH (`catalog update` admits the creator) all let the adder change a public wine that sits in their own unrevealed glass. Any such change is public: the photo, the text, the blend, `updated_at`, and a `catalog_wine_edits` row that names the editor.

The fix has two parts:

1. **Database.** Two guard triggers refuse the adder's own client writes to a wine that is not `blind_pending`, using `attach_catalog_wine_photo`'s step 7 predicate. Nobody else is ever refused.
2. **App.** The flight path never fills a public wine and never sets `image_url`. It fills a brand-new, hidden wine only after its answer key exists.

## 2. The leaks, reproduced on live (rolled back)

When the reproduction was written there was no unrevealed glass on live:

- 0 unrevealed `wines` rows;
- 0 `blind_pending` catalog wines;
- 0 `wine_pour_intents` rows.

The review round's read found 1 unrevealed glass, 1 `blind_pending` wine and 0 intents. The dry run and the probe still pass: post-state check 4 skips every wine that has an unrevealed glass.

The reproduction builds its own fixtures inside one transaction and rolls it back:

- `.superpowers/leaks/probes/repro-before.mjs`, then the before-phase of the §6 probe;
- demo people: Marcus (host), Priya (JOINED guest), Isabelle, Diego, Sofia;
- every PRIVATE cellar;
- W: a wine Marcus created that stays public because Isabelle holds a bottle of it.

A final live read shows nothing persisted.

### 2.1 F2: `appearance_count`

| Who, what | `catalog_wine_usage(W)` |
|---|---|
| anon, before any glass | `appearance_count 0` |
| Marcus keys W into an unrevealed glass of his LIVE BLIND tasting | W stays `blind_pending = false` (Isabelle's lot) |
| anon, after | `appearance_count 1` |
| Priya, after (she cannot read the answer key: 0 rows) | `appearance_count 1` |

**What the caller learns.** A guest (or anyone holding the anon key, which is public in the JS bundle) snapshots `appearance_count` for every catalog wine id before the tasting. Signed in, they can list every public id. They snapshot again after the host keys the flight. The wines whose count rose are the flight.

`blind_pending` does not help here. It hides only wines with no lot, no note and no revealed glass. The wines this leaks are exactly the public ones.

For a hidden wine, the RPC also answers by id (probe R4d: `appearance_count 1` for a `blind_pending` wine), but its id is not listable.

### 2.2 F2: cellar numbers through a PRIVATE cellar (D11)

Marcus holds 2 bottles of W in his PRIVATE cellar, and his glass has a `wine_pour_intents` row with `consume_on_start`. Isabelle holds 1.

| Step | Priya's `usage(W)` holders / bottles / consumption_count | Priya's `holdings(W)` |
|---|---|---|
| before Start | 2 / 3 / 0 | 2 / 3 |
| Marcus presses Start (`draw_down_flight_cellar_lots` → `drawn`) | 2 / **2** / **1** | 2 / **2** |
| a second glass poured while running (`pour_cellar_lot_into_glass`) | **1** / **1** / **2** | — |

Priya cannot read Marcus's lot (PRIVATE: 0 rows), and `cellar_consumptions` is owner-only. The aggregate still names the wine drawn down at the moment the tasting started.

### 2.3 F3: the adder changes a public wine they poured

**The write paths, from the code.**

- `insertTastingWineFromIdentity` (`src/app/tastings/[id]/wines/new/tasting-wine-writes.ts:385-410`) calls `upsertCatalogWine`, which calls `fillCatalogWine` (`src/lib/wine-identity/server/write.ts:366-399`, `412-474`), before `insertTastingWineCore`.
- `saveFlightGlassCore` (`:839-910`, used by Edit, finishing an incomplete glass and `swapFlightGlass`) runs the same chain while the glass already exists.
- `fillCatalogWine` touches only a row the caller created. On it, it writes:
  - `image_url` and `description` when blank;
  - `alcohol_percent` when null;
  - the blend (`catalog_wine_grapes`) when the stored rows are still the insert seed.
- `setCatalogWineImage` (`src/app/catalog/[wineId]/actions.ts:8-29`) is a bare UPDATE with no rule-1 check. `updateCatalogWine` (`src/app/catalog/new/actions.ts:280-336`, Manage wine) updates every column, `image_url` included.

**The database side, read on live.**

- `authenticated` holds table-level UPDATE on `catalog_wines` and every privilege on `catalog_wine_grapes`.
- The policies `catalog update` and `cwg write` admit the creator or a curator.
- Nothing refuses an update because of a glass.

**What an observer sees.** Marcus is W's creator; W is public and in his unrevealed glass.

| Marcus, as `authenticated` | Result | What Priya then reads |
|---|---|---|
| `update catalog_wines set image_url = …, description = …` (the fill / `setCatalogWineImage`) | 1 row | the new `image_url` and `description` |
| — | — | W's newest `catalog_wine_edits` row: `editor_id` = Marcus, `after.image_url` = the scan |
| `alcohol_percent`, `wine_name`, a no-op `image_url = image_url` | 1 row each | a new `updated_at` and a new audit row each time, even for the no-op |
| insert / update / delete on `catalog_wine_grapes` for W | 1 row each | the new blend (and, through the recompute, the primary/secondary grape) |

A newly visible photo, description, blend or edit-history line on a public wine while a tasting runs is the same oracle as F2. Worst case, the flight scan's photo appears as the wine's main photo.

### 2.4 What `blind_pending` already covers, and what it does not

- **Covered, while the glass links it.** A brand-new wine created for a flight is `blind_pending` once its answer key is inserted (`catalog_wine_mark_blind`). Guests cannot read it: probe rows 21 and R4b/R4c give 0 rows for Priya.
  - `catalog read` admits a hidden row only for its creator (here, the adder), for curators, and for whoever can already read an answer key naming it.
  - So filling the wine after that point shows nobody a wine they could not already read.
  - That lasts only while an unrevealed glass links the wine. An Edit, Swap or Remove that re-points the glass un-hides the abandoned wine, fill included, while the tasting still runs. That is pre-existing finding F11, §9.
- **Not covered: `catalog_wines_unidentified`.** The "I can't identify this bottle" glass keeps its identity in a separate table, which every signed-in user can read. That is pre-existing finding F10, §9.
- **Not covered: the window.** `find_or_create_catalog_wine`, the fill, the `wines` insert and the `wine_answers` insert are separate PostgREST requests, so separate transactions. Until the last one, the new wine is public (probe row 20: Priya reads it).
  - Today the fill's photo, description and audit row land inside that window.
  - After this change, no fill runs in the window. The identity row itself is still briefly public: finding F5, §9.
- **Not covered: an existing public wine.** A wine with a lot, a note or a revealed glass never becomes `blind_pending` when poured. That is F2 and F3 exactly.
- **An oracle of its own: a public catalog-only wine.** A wine with no lot, note or revealed glass is flipped to `blind_pending` when poured, and it disappears from the catalog, search and its own page (probe R5a/R5b). Its creator reads `blind_pending = true` on their own row (R5c). This is pre-existing and not fixed here: finding F4, §9.

### 2.5 Every caller, and every sibling count checked

| Function | Callers | Glass-dependent before? | After |
|---|---|---|---|
| `catalog_wine_usage(uuid)` | `src/app/catalog/[wineId]/page.tsx:81` (community card "In N cellars · M bottles"; `WineAdminControls` delete gate); `scripts/catalog-manage.test.mjs` (as postgres) | yes: appearance, holders, bottles, consumption | glass-independent; authenticated + service_role |
| `catalog_wine_holdings(uuid[])` | `src/app/catalog/page.tsx:172` (the bottles sort); `src/lib/wine-identity/server/match.ts:85` (the confirm card's "in N cellars") | yes: holders, bottles | glass-independent; authenticated + service_role |
| `catalog_wine_appearances(uuid[])` | `src/app/catalog/page.tsx:171` | no (`w.is_revealed` already) | unchanged |
| `catalog_wine_guess_stats(uuid)` | `fetchWineGuessStats` | no (`w.is_revealed` already) | unchanged |
| `catalog_wine_structure(uuid)`, views `catalog_wine_ratings` / `catalog_wine_descriptors` | wine page | no. They read notes, and a hidden-glass note carries no catalog id until the reveal (M5) | unchanged |
| `delete_catalog_wine(uuid)` | `WineAdminControls` | counts every reference, as it must (FK) | unchanged; see R1 |

Every server caller runs with the signed-in user's session (`createClient()` from `@/lib/supabase/server`, pages redirect to `/login`), so revoking `anon` breaks none of them. The TypeScript signatures do not change (§5.6).

## 3. Decisions

- **D1. `appearance_count` counts revealed glasses.** It counts `wine_answers` rows whose glass has `is_revealed`. The unit stays glasses, so `WineAdminControls`' "Used in blind tastings — can't delete" keeps its meaning. A has-scored-guess (ASYNC IMMEDIATE) guesser's private view does not count; that is the conservative choice.
- **D2. Cellar numbers stay community-wide, but no glass moves them.**
  - `holders`/`bottles` still count every cellar, PRIVATE ones included. A PRIVATE lot adds to an anonymous total and never names its owner.
  - A bottle drawn into a glass that is not revealed yet is found through `wine_pour_intents.cellar_consumption_id` (`catalog_wine_masked_pours`). It is added back to its lot and left out of `consumption_count` until that reveal.
  - **Rejected: viewer-scoped counts** (only cellars the caller may view). That would change what "In N cellars" means on three surfaces. It would also not stop the leak for PUBLIC and FRIENDS cellars, where the lot itself is readable (F8). The glass-correlated change is the leak, not the static total.
  - **Rejected: drawing down at the reveal instead of at Start.** That changes D11's owner decision and two live pour functions. It is offered for F8 instead.
- **D3. `lot_count` and `note_count` are unchanged.** No glass moves them. D11 never creates or deletes a lot. A hidden-glass note has no catalog id until the reveal.
- **D4. EXECUTE.**
  - `catalog_wine_usage` and `catalog_wine_holdings`: `authenticated` and `service_role`. PUBLIC and `anon` are revoked; `service_role` is kept per Supabase's default privileges, since it is server-only and the numbers are glass-independent anyway.
  - The helpers and trigger functions: no client role at all. The guards call them as their owner.
  - The already revealed-only siblings (`catalog_wine_appearances`, `catalog_wine_guess_stats`, `catalog_wine_structure`) keep their grants. They are not replaced here.
- **D5. F3 is closed at the database, for every column, not only `image_url`.** Any client UPDATE of a public wine by the adder of one of its unrevealed glasses is refused. That includes a no-op save, which still stamps `updated_at` and writes an audit row naming the editor. The refusal predicate is `attach_catalog_wine_photo`'s step 7, verbatim (`catalog_wine_in_callers_unrevealed_glass`): the host for an `added_by_host` glass, the contributor for a BYO glass. It consults only the caller's own glasses, so nobody else is ever refused. The creator who did not pour it, a curator, and the host of a BYO glass all stay free (probe rows 16-19).
- **D6. A row hidden before and after is exempt.** If `blind_pending` is true in both OLD and NEW, the guard lets the write through.
  - **Who can read a hidden row.** Live `catalog read` is `not blind_pending or created_by = auth.uid() or can_read_blind_pending_catalog_wine(id)`, and that helper starts with an `is_curator` test. So a hidden row is readable by three kinds of reader:
    - its creator;
    - every curator;
    - whoever can already read an answer key naming the wine. The helper is SECURITY INVOKER, so this goes through the caller's own `wine_answers read`.
  - Each of them can read the hidden row itself, so a change to it shows none of them a wine they could not already read. The glass's guests cannot read it at all (probe row 21).
  - This is what lets the flight fill a brand-new wine. The adder is its creator, and the fill writes only the caller's own rows (`created_by = userId`).
  - **Creator is not the adder (accepted, R10).** A curator who is also the adder can edit a hidden wine someone else created, and that creator sees the edit. Example: Sofia's pour hides Isabelle's catalog-only C (F4). Sofia's UPDATE of C's description is allowed, and Isabelle reads the new text (`.superpowers/leaks/probes/review-probe.mjs` part 3). The fill never does this; it takes a curator's own manual edit. Isabelle already reads C, and she already sees it go hidden when poured (F4). The edit adds no wine she could not read, and at most hints whose flight holds C.
  - **Where the exemption ends.** Un-hiding (`blind_pending` true → false) by the adder is refused (probe row 23). The unmark on unlink runs at trigger depth 2 (D7), so it is not judged. That is how a corrective Edit or Swap un-hides the abandoned wine mid-tasting (F11).
- **D7. Only a client's own statement is judged.** That means trigger depth 1 with `auth.uid()` set.
  - Writes made by other triggers run at depth ≥ 2 and are never refused: `blind_pending`'s mark and unmark (at the answer insert, the reveal and an unlink), the blend seed and the blend recompute.
  - `service_role` and scripts (`auth.uid()` null) are not judged.
  - **Rejected: a SECURITY INVOKER guard testing `current_user`.** It would need client EXECUTE on the helper. The depth test also still judges `merge_catalog_wines`' own UPDATE, which the guard never refuses in practice, because the merge moves the loser's answer keys first (probe row 33).
- **D8. The blend gets the same guard.** It covers `catalog_wine_grapes` INSERT, UPDATE and DELETE, since the blend is read through `catalog read`. That closes the fill's blend replace, Manage wine's `replaceBlend` and a direct write. The recompute that follows a permitted write runs at depth ≥ 2.
- **D9. The app never fills a public wine from a flight, and never sets `image_url` from a flight** (owner rule).
  - Flight writes skip the fill inside `upsertCatalogWine` and run `fillFlightCatalogWine` after the answer key is written. By then a brand-new wine is `blind_pending`, so `catalog read` admits it only for its creator (the adder), curators and whoever can already read that answer key (D6).
  - That holds only while an unrevealed glass links the wine. A corrective Edit or Swap re-points the glass and un-hides the abandoned wine, with its fill, while the tasting still runs. So does a Remove followed by a re-add. This is pre-existing: before this change the fill and the identity row were public from the start (F5). It is recorded as F11 and not fixed here.
  - That fill writes `description`, `alcohol_percent` and the blend only while the wine is hidden, or when the glass is itself revealed (an OPEN board, where nothing is hidden).
  - The flight scan stays on the glass's `wine_answers.image_url` and shows after the reveal. This covers every flight write: add, finish, Edit and Swap.
  - The rule is pure (`catalogFillPlan`, vitest-covered) and enforced on the server. D5 is the backstop.
- **D10. No new client-callable RPC.** `setCatalogWineImage` and `updateCatalogWine` rely on the guard, which runs inside their own UPDATE, on the server, and cannot be skipped. They map its 42501 to copy. An "am I the adder" RPC would add surface for nothing.
- **D11. One message.** The guard raises 42501 with "This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal." The app pins that exact text with a test that reads the migration file. `setCatalogWineImage` shows the photo copy the wine page already uses for `unrevealed-glass`.
- **D12. Out of scope.** Pre-existing findings F4-F11 (§9) are left to separate tasks. `attach_catalog_wine_photo` (live, scan-photos) is not changed.

## 4. Migration `supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`

Copy this file verbatim. It is dry-run-clean on live.

The post-state pins the six new bodies by `md5(replace(prosrc, chr(13), ''))`:

| Function | md5 |
|---|---|
| `catalog_wine_usage` | `8544e9af…` |
| `catalog_wine_holdings` | `af3b6c87…` |
| `catalog_wine_masked_pours` | `7e2054d9…` |
| `catalog_wine_in_callers_unrevealed_glass` | `f33fbd7f…` |
| `catalog_wines_rule1_guard` | `d7ab319e…` (was `89afa83a…` before the review round reworded its D6 comment) |
| `catalog_wine_grapes_rule1_guard` | `03f00cf6…` |

A CRLF checkout does not change them. If any byte inside a function body changes, recompute the pins with `.superpowers/leaks/probes/md5s.mjs <file>`, which applies the file up to its post-state and rolls back.

The pre-state pins the two replaced bodies. It also pins every body the design relies on:

- `attach_catalog_wine_photo`, whose step 7 the guard mirrors;
- the D11 pour pair, for the masking;
- mark and unmark, the seed, and the recompute, which run at trigger depth ≥ 2;
- `merge_catalog_wines`.

It also asserts the live EXECUTE grants and the exact trigger lists.

```sql
-- rule1_usage_and_main_photo: two pre-existing rule-1 leaks found during the
-- scan-photos review (docs/superpowers/specs/2026-09-19-scan-photos.md §12
-- F2, F3), closed at the database.
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md (§4
-- is the SQL design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19):
-- * 20260919183100 (catalog_wine_photos) was the newest live version; no row
--   for 20260919213300 (live, origin/master or any worktree; the listing
--   worktree's 20260919203000 is independent of this file); none of the
--   functions or triggers this file creates.
-- * catalog_wine_usage(uuid) and catalog_wine_holdings(uuid[]) are SECURITY
--   DEFINER, EXECUTE for PUBLIC, anon, authenticated and service_role.
--   usage.appearance_count counts every wine_answers row (unrevealed glasses
--   included); usage.holders/bottles/consumption_count and holdings count
--   every cellar lot and consumption, so the D11 draw-down at Start
--   (draw_down_flight_cellar_lots / pour_cellar_lot_into_glass: lot -1, a
--   DRANK consumption +1, linked from wine_pour_intents.cellar_consumption_id)
--   shows in them even from a PRIVATE cellar.
-- * catalog_wines: authenticated holds table-level UPDATE; "catalog update"
--   admits the creator or a curator; triggers are exactly catalog_wines_audit
--   (AFTER UPDATE: a catalog_wine_edits row with editor, before and after),
--   catalog_wines_seed_grapes (AFTER INSERT) and catalog_wines_set_updated_at
--   (BEFORE UPDATE). catalog_wine_grapes: authenticated holds every privilege;
--   "cwg write" admits the wine's creator or a curator; one trigger,
--   catalog_wine_grapes_recompute (AFTER, rewrites primary/secondary).
--
-- What this migration does:
-- F2. catalog_wine_usage and catalog_wine_holdings return numbers no
--     unrevealed glass moves: appearance_count counts revealed glasses only,
--     and a bottle poured from a cellar lot into a glass that is not revealed
--     yet (catalog_wine_masked_pours) still counts as in that cellar and not
--     as drunk. EXECUTE is revoked from PUBLIC and anon.
-- F3. A signed-in client's own UPDATE of catalog_wines, or INSERT, UPDATE or
--     DELETE of catalog_wine_grapes, on a wine that is not blind_pending is
--     refused (42501) when the caller added a still-unrevealed glass of that
--     wine (attach_catalog_wine_photo's step 7). Writes made by other
--     triggers (blind_pending bookkeeping, the blend recompute, the seed) run
--     at trigger depth > 1 and are never judged; service_role and scripts
--     (no auth.uid()) are never judged.
--
-- Rule 1: every refusal depends only on the caller's own glasses; every
-- count is the same for every caller.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The scan-photos migration (whose step 7 the guard mirrors) is live.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919183100') then
    raise exception '20260919183100 (catalog_wine_photos) is not applied; apply it first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('catalog_wine_masked_pours', 'catalog_wine_in_callers_unrevealed_glass',
                      'catalog_wines_rule1_guard', 'catalog_wine_grapes_rule1_guard');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(format('%s.%s', t.tgrelid::regclass::text, t.tgname), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('catalog_wines_rule1_guard', 'catalog_wine_grapes_rule1_guard');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 3. The two bodies replaced, and every body this file relies on, are the
  --    live ones (md5 of prosrc with any CR stripped):
  --    * usage/holdings: replaced here;
  --    * attach_catalog_wine_photo: its step 7 is the predicate mirrored;
  --    * draw_down_flight_cellar_lots / pour_cellar_lot_into_glass: one
  --      consumption per intent, linked by cellar_consumption_id (masking);
  --    * mark/unmark blind_pending, the seed and the blend recompute: they
  --      write catalog_wines / catalog_wine_grapes from inside a trigger, the
  --      depth the guards exempt;
  --    * merge_catalog_wines: moves the loser's answer keys before it sets
  --      merged_into, so the guard never refuses it.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.catalog_wine_usage(uuid)', 'a797b959a9806a853f6f1a15d87befcb'),
    ('public.catalog_wine_holdings(uuid[])', '52205058c105fb22a193c09f82f853f8'),
    ('public.attach_catalog_wine_photo(uuid,text,text)', 'e287a2a46c54937870951a9c297683c9'),
    ('public.draw_down_flight_cellar_lots(uuid)', '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.pour_cellar_lot_into_glass(uuid)', '558e60723fa745ead80dd0dc75871411'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d'),
    ('public.catalog_wine_unmark_blind()', 'f9e3bf5208ceddd18a9b334c585965cc'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.tg_seed_catalog_wine_grapes()', '0b492539fd7d4f0c22ceda7168462ddd'),
    ('public.tg_recompute_catalog_wine_grapes()', 'ca6c3c1f3e46a8f779743eba8a92713a'),
    ('public.recompute_catalog_wine_grapes(uuid)', 'd21ce2d57f0f5710ad4bdff46f4f35a0'),
    ('public.merge_catalog_wines(uuid,uuid)', '82c43b99a3f136acd5d772bd16f4e2d6')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. usage/holdings: SECURITY DEFINER, stable, sql, search_path=public,
  --    EXECUTE for PUBLIC, anon, authenticated, service_role (the ACL the
  --    revokes below narrow).
  select string_agg(format('%s %s %s %s %s', p.oid::regprocedure::text, p.prosecdef, p.provolatile,
                           p.proconfig::text,
                           (select string_agg(x.g, ',' order by x.g collate "C")
                              from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                                         when a.grantee = p.proowner then 'OWNER'
                                                         else pg_get_userbyid(a.grantee)::text end as g
                                      from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x)),
                    '; ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.catalog_wine_usage(uuid)'), to_regprocedure('public.catalog_wine_holdings(uuid[])'));
  if v_text is distinct from
       'catalog_wine_holdings(uuid[]) t s {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role; '
       || 'catalog_wine_usage(uuid) t s {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'usage/holdings attributes or EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The triggers on the two guarded tables are exactly the live ones.
  select string_agg(format('%s.%s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.catalog_wines'::regclass, 'public.catalog_wine_grapes'::regclass) and not t.tgisinternal;
  if v_text is distinct from
       'catalog_wine_grapes.catalog_wine_grapes_recompute 29 tg_recompute_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_audit 17 audit_catalog_wine_edit(); '
       || 'catalog_wines.catalog_wines_seed_grapes 5 tg_seed_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_set_updated_at 19 set_updated_at()' then
    raise exception 'catalog_wines / catalog_wine_grapes triggers differ from live: %', v_text;
  end if;

  -- 6. The columns the new bodies read.
  select string_agg(s.col, ', ') into v_text
  from (values
    ('cellar_lots', 'catalog_wine_id'), ('cellar_lots', 'owner_id'), ('cellar_lots', 'quantity'),
    ('cellar_consumptions', 'lot_id'), ('cellar_consumptions', 'catalog_wine_id'), ('cellar_consumptions', 'quantity'),
    ('wine_pour_intents', 'wine_id'), ('wine_pour_intents', 'cellar_consumption_id'),
    ('wines', 'is_revealed'), ('wines', 'added_by_host'), ('wines', 'contributor_participant_id'), ('wines', 'tasting_id'),
    ('wine_answers', 'catalog_wine_id'), ('tastings', 'host_id'), ('tasting_participants', 'user_id'),
    ('catalog_wines', 'blind_pending'), ('catalog_wine_grapes', 'catalog_wine_id')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §4 SQL
-- ===========================================================================

-- F2 ------------------------------------------------------------------------

-- A bottle drawn from a cellar lot into a glass (D11: draw_down_flight_cellar_lots
-- at Start, pour_cellar_lot_into_glass while running) whose glass is not revealed
-- yet. Every shared count reads it as still in its cellar, and not drunk, until
-- that reveal. Internal: no client EXECUTE.
create function catalog_wine_masked_pours(p_ids uuid[])
returns table (consumption_id uuid, lot_id uuid, catalog_wine_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.lot_id, c.catalog_wine_id, c.quantity
    from cellar_consumptions c
   where c.catalog_wine_id = any(p_ids)
     and exists (select 1
                   from wine_pour_intents i
                   join wines w on w.id = i.wine_id
                  where i.cellar_consumption_id = c.id
                    and not w.is_revealed);
$$;

create or replace function catalog_wine_usage(p_id uuid)
returns table (
  holders int,
  bottles int,
  lot_count int,
  note_count int,
  appearance_count int,
  consumption_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with masked as (
    select m.consumption_id, m.lot_id, m.quantity from catalog_wine_masked_pours(array[p_id]) m
  ),
  counted as (
    select l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = p_id
  )
  select
    (select count(distinct owner_id)::int from counted where quantity > 0),
    (select coalesce(sum(quantity), 0)::int from counted where quantity > 0),
    (select count(*)::int from cellar_lots where catalog_wine_id = p_id),
    (select count(*)::int from wset_notes where catalog_wine_id = p_id),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

create or replace function catalog_wine_holdings(p_ids uuid[])
returns table (catalog_wine_id uuid, holders integer, bottles integer)
language sql
stable
security definer
set search_path = public
as $$
  with masked as (
    select m.lot_id, m.quantity from catalog_wine_masked_pours(p_ids) m
  ),
  counted as (
    select l.catalog_wine_id, l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = any(p_ids)
  )
  select counted.catalog_wine_id,
         count(distinct counted.owner_id)::int as holders,
         coalesce(sum(counted.quantity), 0)::int as bottles
    from counted
   where counted.quantity > 0
   group by counted.catalog_wine_id;
$$;

revoke execute on function catalog_wine_usage(uuid) from public, anon;
revoke execute on function catalog_wine_holdings(uuid[]) from public, anon;
grant execute on function catalog_wine_usage(uuid) to authenticated, service_role;
grant execute on function catalog_wine_holdings(uuid[]) to authenticated, service_role;
revoke execute on function catalog_wine_masked_pours(uuid[]) from public, anon, authenticated, service_role;

-- F3 ------------------------------------------------------------------------

-- attach_catalog_wine_photo's step 7 (20260919183100): the caller added a glass
-- of this wine that is not revealed yet — the host for a host-added glass, the
-- contributor for a bring-your-own glass. Only the caller's own glasses are
-- ever consulted. Internal: no client EXECUTE (the guards run as its owner).
create function catalog_wine_in_callers_unrevealed_glass(p_catalog_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from wine_answers wa
      join wines w on w.id = wa.wine_id
      join tastings t on t.id = w.tasting_id
      left join tasting_participants tp on tp.id = w.contributor_participant_id
     where wa.catalog_wine_id = p_catalog_wine_id
       and not w.is_revealed
       and case when w.added_by_host then t.host_id = auth.uid() else tp.user_id = auth.uid() end
  );
$$;

-- A signed-in client's own UPDATE of a catalog wine that is public, or becomes
-- public, while the caller has it in a glass they added that is not revealed
-- yet: refused. Any such change (a main photo, a description, a name, even a
-- no-op save, which still stamps updated_at and an edit-audit row naming the
-- editor) would show everyone which wine that glass holds.
create function catalog_wines_rule1_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a statement the client issued itself: blind_pending's mark/unmark,
  -- the blend recompute and every other trigger's write run deeper.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
  -- Hidden before and after: "catalog read" admits only its creator, a
  -- curator, and whoever can already read an answer key naming it. Each of
  -- them can read the hidden row anyway, so the change shows no one a wine
  -- they could not already read (spec D6).
  if old.blind_pending and new.blind_pending then
    return new;
  end if;
  if catalog_wine_in_callers_unrevealed_glass(old.id)
     or (new.id is distinct from old.id and catalog_wine_in_callers_unrevealed_glass(new.id)) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change it after the reveal.';
  end if;
  return new;
end $$;

-- The same rule for the wine's blend (catalog_wine_grapes is read through
-- "catalog read"): a public wine's blend is not written by the adder of one of
-- its unrevealed glasses.
create function catalog_wine_grapes_rule1_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_ids := v_ids || old.catalog_wine_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_ids := v_ids || new.catalog_wine_id;
  end if;
  if exists (select 1 from catalog_wines cw
              where cw.id = any(v_ids)
                and not cw.blind_pending
                and catalog_wine_in_callers_unrevealed_glass(cw.id)) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change it after the reveal.';
  end if;
  return coalesce(new, old);
end $$;

create trigger catalog_wines_rule1_guard
  before update on catalog_wines
  for each row execute function catalog_wines_rule1_guard();

create trigger catalog_wine_grapes_rule1_guard
  before insert or update or delete on catalog_wine_grapes
  for each row execute function catalog_wine_grapes_rule1_guard();

revoke execute on function catalog_wine_in_callers_unrevealed_glass(uuid) from public, anon, authenticated, service_role;
revoke execute on function catalog_wines_rule1_guard() from public, anon, authenticated, service_role;
revoke execute on function catalog_wine_grapes_rule1_guard() from public, anon, authenticated, service_role;

-- ===========================================================================
-- END SPEC §4 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_n int;
begin
  -- 1. The six functions: security, search_path, volatility, language, return
  --    type, set-returning, arguments, body (md5 of prosrc, CR stripped) and
  --    the roles holding EXECUTE ("OWNER" is the function owner).
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.catalog_wine_usage(uuid)', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_id uuid', '8544e9afe31d30c26d516e68b19fca23', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_holdings(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', 'af3b6c87fcbfbbbf46c210d84f3b5b00', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_masked_pours(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', '7e2054d9001878a17672aedd11d7bfcb', 'OWNER'),
      ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', true, '{search_path=public}', 's', 'sql', 'boolean', false,
       'p_catalog_wine_id uuid', 'f33fbd7f4e283cb0ed682469aa6ea2c2', 'OWNER'),
      ('public.catalog_wines_rule1_guard()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'd7ab319ef77e4516f32f8d22ff531833', 'OWNER'),
      ('public.catalog_wine_grapes_rule1_guard()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '03f00cf6346e62794a89c2cd938e4ea9', 'OWNER')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;

  -- 2. What each role can call: the two counts for authenticated and
  --    service_role only; the helpers and the guards for nobody.
  if not has_function_privilege('authenticated', 'public.catalog_wine_usage(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.catalog_wine_holdings(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_usage(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_holdings(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_masked_pours(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_masked_pours(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE is not: usage/holdings authenticated + service_role; helpers nobody';
  end if;

  -- 3. The guards: row-level BEFORE triggers, enabled, exactly these events,
  --    and the full trigger lists of both tables.
  select string_agg(format('%s.%s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.catalog_wines'::regclass, 'public.catalog_wine_grapes'::regclass) and not t.tgisinternal;
  if v_text is distinct from
       'catalog_wine_grapes.catalog_wine_grapes_recompute 29 O tg_recompute_catalog_wine_grapes(); '
       || 'catalog_wine_grapes.catalog_wine_grapes_rule1_guard 31 O catalog_wine_grapes_rule1_guard(); '
       || 'catalog_wines.catalog_wines_audit 17 O audit_catalog_wine_edit(); '
       || 'catalog_wines.catalog_wines_rule1_guard 19 O catalog_wines_rule1_guard(); '
       || 'catalog_wines.catalog_wines_seed_grapes 5 O tg_seed_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_set_updated_at 19 O set_updated_at()' then
    raise exception 'catalog_wines / catalog_wine_grapes triggers post-migration are %', v_text;
  end if;

  -- 4. No live number moves where no glass is hidden: for every catalog wine
  --    with no unrevealed glass and no masked pour, the new usage and holdings
  --    equal the formulas they replace.
  select count(*) into v_n
  from catalog_wines cw
  cross join lateral catalog_wine_usage(cw.id) u
  where not exists (select 1 from wine_answers wa join wines w on w.id = wa.wine_id
                    where wa.catalog_wine_id = cw.id and not w.is_revealed)
    and not exists (select 1 from catalog_wine_masked_pours(array[cw.id]))
    and (u.holders, u.bottles, u.lot_count, u.note_count, u.appearance_count, u.consumption_count)
        is distinct from (
          (select count(distinct owner_id)::int from cellar_lots where catalog_wine_id = cw.id and quantity > 0),
          (select coalesce(sum(quantity), 0)::int from cellar_lots where catalog_wine_id = cw.id and quantity > 0),
          (select count(*)::int from cellar_lots where catalog_wine_id = cw.id),
          (select count(*)::int from wset_notes where catalog_wine_id = cw.id),
          (select count(*)::int from wine_answers where catalog_wine_id = cw.id),
          (select count(*)::int from cellar_consumptions where catalog_wine_id = cw.id));
  if v_n > 0 then
    raise exception 'catalog_wine_usage changed % live wines that hold no hidden glass', v_n;
  end if;
  with n as (
    select h.catalog_wine_id, h.holders, h.bottles
      from catalog_wine_holdings(array(select id from catalog_wines)) h
     where not exists (select 1 from catalog_wine_masked_pours(array[h.catalog_wine_id]))
  ),
  o as (
    select l.catalog_wine_id, count(distinct l.owner_id)::int as holders, coalesce(sum(l.quantity), 0)::int as bottles
      from cellar_lots l
     where l.quantity > 0
       and not exists (select 1 from catalog_wine_masked_pours(array[l.catalog_wine_id]))
     group by l.catalog_wine_id
  )
  select count(*) into v_n
  from ((select * from n except select * from o) union all (select * from o except select * from n)) d;
  if v_n > 0 then
    raise exception 'catalog_wine_holdings changed % live wines that hold no masked pour', v_n;
  end if;

  raise notice 'rule1 usage/main photo: usage acl %; holdings acl %',
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_usage(uuid)')),
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_holdings(uuid[])'));
end $$;
```

## 5. App changes

### 5.1 New pure module `src/lib/wine-identity/fill-rule.ts` (D9)

It imports only relative paths, so vitest loads it.

```ts
// The fill rule behind fillCatalogWine (spec 2026-09-19-rule1-usage-and-main-photo §5.1, D9).
// Pure: relative imports only, so vitest can load it.

export type CatalogFillRow = {
  createdBy: string | null;
  blindPending: boolean;
  imageUrl: string | null;
  description: string | null;
  /** numeric arrives as a string through PostgREST; only null matters here. */
  alcoholPercent: number | string | null;
};

export type CatalogFillSource = { imageUrl: string | null; description: string | null; alcohol: number | null };

/** Where the identity is being written: the caller's catalog, cellar or note (`catalog`), or a
    glass's answer key (`flight`: add, finish, Edit, Swap). `glassRevealed` is true only on an OPEN
    board, whose glasses are inserted revealed. */
export type CatalogFillContext = { kind: "catalog" } | { kind: "flight"; glassRevealed: boolean };

export type CatalogFillPlan = {
  patch: { image_url?: string; description?: string; alcohol_percent?: number };
  /** The UPDATE also filters `blind_pending = true`, so a wine that turned public since the read is left alone. */
  onlyWhileHidden: boolean;
};

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** null: write nothing, the blend included. Otherwise the blank-only patch (maybe empty), and the
    blend may be replaced (still only when blendNeedsReplace says so). */
export function catalogFillPlan(
  row: CatalogFillRow,
  source: CatalogFillSource,
  userId: string,
  context: CatalogFillContext,
): CatalogFillPlan | null {
  if (row.createdBy !== userId) return null;
  const flight = context.kind === "flight";
  // Rule 1: a flight never changes a wine others can already read, unless the glass itself is public.
  if (flight && !row.blindPending && !context.glassRevealed) return null;
  const patch: CatalogFillPlan["patch"] = {};
  // Owner rule: a flight scan never becomes a catalog wine's main photo; it stays on the answer key.
  if (!flight && source.imageUrl && isBlank(row.imageUrl)) patch.image_url = source.imageUrl;
  if (source.description && isBlank(row.description)) patch.description = source.description;
  if (source.alcohol !== null && row.alcoholPercent === null) patch.alcohol_percent = source.alcohol;
  return { patch, onlyWhileHidden: flight && !context.glassRevealed };
}
```

### 5.2 `src/lib/wine-identity/server/write.ts`

- **`upsertCatalogWine(supabase, userId, wine, options: { fill?: boolean } = {})`.** Step 3 (the fill) runs only when `options.fill !== false`. Its doc comment says flight callers pass `{ fill: false }` and call `fillFlightCatalogWine` after the answer key is written.
- **`fillCatalogWine(supabase, userId, catalogWineId, wine, context: CatalogFillContext = { kind: "catalog" })`.**
  - The read adds `blind_pending`: `select created_by, blind_pending, image_url, description, alcohol_percent, primary_grape_id, secondary_grape_id`.
  - Then `const plan = catalogFillPlan({ createdBy: row.created_by, blindPending: row.blind_pending, imageUrl: row.image_url, description: row.description, alcoholPercent: row.alcohol_percent }, { imageUrl: wine.imageUrl, description: wine.description, alcohol: wine.alcohol }, userId, context)`. It returns when `plan` is null.
  - A non-empty `plan.patch` is one UPDATE `.eq("id", catalogWineId).eq("created_by", userId)`, plus `.eq("blind_pending", true)` when `plan.onlyWhileHidden`.
  - The blend step is unchanged. In the tiny race where the wine turns public between the read and the blend write, the D8 guard refuses the adder, and the throw is logged by the caller.
  - The module comment's fill rule gains: "Never from a flight onto a wine others can read, and never `image_url` from a flight (spec 2026-09-19-rule1-usage-and-main-photo D9)."
- **New export `fillFlightCatalogWine(supabase, userId, catalogWineId, wine, glassRevealed: boolean): Promise<void>`.** It is `fillCatalogWine(..., { kind: "flight", glassRevealed })` in a try/catch that logs `"fillFlightCatalogWine failed", { catalogWineId, message }`. It never throws, so a failed fill never refuses a glass (the same contract as today's step 3). Its doc comment says who reads a hidden wine's fill: its creator (the adder), curators, and whoever can read the answer key (D6). It also says this holds only while the glass links the wine (F11).

### 5.3 `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts`

- **`insertTastingWineFromIdentity`.** `upsertCatalogWine(supabase, userId, prepared.wine, { fill: false })`. After `insertTastingWineCore` succeeds:
  ```ts
  // After the answer key: a brand-new wine is blind_pending by now (catalog_wine_mark_blind), so its
  // fill is read only by its creator (the caller), a curator and whoever can already read that answer
  // key, for as long as the glass links it (spec 2026-09-19-rule1-usage-and-main-photo D9, F11); a
  // public wine is never filled from a flight.
  await fillFlightCatalogWine(supabase, userId, catalog.catalogWineId, prepared.wine, adder.tasting.revealMode === "OPEN");
  ```
- **`saveFlightGlassCore`** (Edit, finish, and `swapFlightGlass` through it). `upsertCatalogWine(supabase, userId, prepared.wine, { fill: false })`. After `writeAnswer` succeeds: `await fillFlightCatalogWine(supabase, userId, catalog.catalogWineId, prepared.wine, state.isRevealed)`. The edit guard refuses a revealed glass, so this is `false` in practice; it is passed for honesty.
- **Unchanged:**
  - `insertTastingWineFromCatalogRow` and `insertTastingWineFromLot`: no identity write, no fill.
  - `insertTastingWineUnidentified` and the unidentified branch of `saveFlightGlassCore` (`saveUnidentifiedRow`) write no catalog wine and no fill. They do write the glass's identity to `catalog_wines_unidentified`, and every signed-in user can read that table. That is pre-existing finding F10 (§9), left to a separate task.
  - The cellar (`addToCellar`, `src/app/cellar/new/actions.ts:65`), catalog (`addToCatalog`, `createCatalogWine`) and note paths keep the default `{ kind: "catalog" }` fill. When their caller is the adder of an unrevealed glass of that wine, the D5 guard refuses the fill's UPDATE. The fill logs "fillCatalogWine failed" and the add itself succeeds, consistent with `attach_catalog_wine_photo`'s `unrevealed-glass`.

### 5.4 New pure module `src/lib/catalog/rule1-guard.ts` (D11)

```ts
// The rule-1 guards' refusal (supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql:
// catalog_wines_rule1_guard, catalog_wine_grapes_rule1_guard). Pure, so vitest can load it.

/** The exact message both guards raise; rule1-guard.test.ts pins it to the migration file. */
export const UNREVEALED_GLASS_EDIT =
  "This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.";

/** The guards' refusal of the caller's own write: 42501 with exactly that message. RLS's own
    42501s ("new row violates row-level security policy …") are not this. */
export function isUnrevealedGlassRefusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return error?.code === "42501" && error?.message === UNREVEALED_GLASS_EDIT;
}
```

### 5.5 The two catalog actions (D10)

**`src/app/catalog/[wineId]/actions.ts` `setCatalogWineImage`.** On `error`:

```ts
// Rule 1: the database refuses the adder of a still-unrevealed glass of this wine
// (catalog_wines_rule1_guard, attach_catalog_wine_photo's step 7); nobody else is refused for linkage.
if (isUnrevealedGlassRefusal(error)) return { error: UNREVEALED_GLASS_PHOTO };
return { error: error.message };
```

- `UNREVEALED_GLASS_PHOTO` is `attachNotice("unrevealed-glass")`, the wine page's existing line: "This wine is in one of your flights that hasn't been revealed yet. Add photos after the reveal." It is resolved once, as a module-level `const` in a plain module (for example `rule1-guard.ts` re-exporting it). A `"use server"` file exports only async functions, but it may import constants.
- The "0 rows → Only the wine's creator or a curator can set its photo." branch stays as it is.
- The wine page's UI path still never reaches this call for an adder, because `mayBecomeMainPhoto` gates it (scan-photos §8.4). This guard covers a direct POST of the action, and any future caller.

**`src/app/catalog/new/actions.ts` `updateCatalogWine`** (Manage wine). `if (isUnrevealedGlassRefusal(error)) return { error: UNREVEALED_GLASS_EDIT };` comes before `logFailure`: it is an expected refusal, not a failure. `new-wine-form.tsx:178` already shows `result.error`. `replaceBlend` runs only after the catalog UPDATE succeeded, so it needs no mapping.

`fillPrice` is unchanged. A refusal is logged, as today.

### 5.6 Comments only

- **`src/lib/catalog-photos/strip.ts` `mayBecomeMainPhoto`.** The doc line "setCatalogWineImage has none of its own — so it fails closed" becomes "and the database refuses it too (`catalog_wines_rule1_guard`, 20260919213300)". CLAUDE.md's Scan photos bullet says the same thing and gets the same change (§10).
- **`src/app/catalog/[wineId]/wine-admin-controls.tsx`, above `deletable`.** Add: "`appearance_count` counts revealed glasses only (rule 1). A wine linked only by an unrevealed glass can read as deletable here and still be refused by `delete_catalog_wine` (spec 2026-09-19-rule1-usage-and-main-photo R1)."

`src/lib/supabase/database.types.ts` is unchanged. `catalog_wine_usage` and `catalog_wine_holdings` keep their argument and return types. The four new functions are not client-callable (no EXECUTE), so they get no entries.

## 6. The rolled-back probe

**Files.**

- The probe: `.superpowers/leaks/probes/20260919213300-rule1-probe.mjs` (gitignored; source in Appendix B).
- The migration draft it runs by default: `.superpowers/leaks/probes/draft/20260919213300_rule1_usage_and_main_photo.sql`. `--file supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql` runs the copied file instead.
- The md5 helper: `.superpowers/leaks/probes/md5s.mjs`.
- The first reproduction: `.superpowers/leaks/probes/repro-before.mjs`.

**Shape.** It uses one `pg` client via `pgConfig()`. There are two phases, each one transaction ending in ROLLBACK:

- **before:** live as it is;
- **after:** the migration file executed inside the transaction first.

Fixtures are built as postgres on the demo people. Sofia is made ADMIN (curator) inside the transaction only. Client calls run in savepoints under `set local role authenticated|anon|service_role` with `request.jwt.claims`.

**The final line** re-reads live and must match the pre-run read: the counts of `catalog_wines`, `catalog_wine_grapes`, `wines`, `wine_answers`, `cellar_lots`, `cellar_consumptions`, `wine_pour_intents`, `catalog_wine_edits`, `tastings` and `tasting_participants`; an md5 over the catalog's id, image, description and `blind_pending`; an md5 over every public function's body and ACL; and the trigger count.

**After the owner's live apply**, `--applied` runs only the after-phase against live, without executing the file.

**Last run:** 71/71 `ok`, "ALL EXPECTS MET" (Appendix A).

- It ran in the review round, with `--file` on the copied migration. The draft is byte-identical.
- It differs from the first run only in the live fingerprint. Live gained a glass and an answer key (17 → 18) between the runs, and each run compares live before and after itself.

**The review round's two extra probes** are rolled back, and each leaves live unchanged:

- `review-probe.mjs`: permitted blend writes; the real flight path, then an Edit re-point (F11); D6 seen by a creator who is not the adder (R10).
- `review2-probe.mjs`: the unidentified row (F10); a PostgREST-style upsert against the guard, refused.

**The EXPECT table.** Written before the first run. "guard" means `42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.` Fixtures:

- W: created by Marcus; public through Isabelle's lot; in Marcus's unrevealed glass of his LIVE BLIND tasting T; Marcus also holds a 2-bottle PRIVATE lot of it.
- T: Priya is JOINED.

| # | Scenario | Before (leak) | After (closed) |
|---|---|---|---|
| 1 | anon `catalog_wine_usage(W)` | full row, `appearance_count 1` | `42501 permission denied for function catalog_wine_usage` |
| 2 | anon `catalog_wine_holdings([W])` | `{2, 3}` | `42501 permission denied for function catalog_wine_holdings` |
| 3 | `appearance_count` before the glass → after, as Priya, Diego (outsider), Marcus | `0 → 1, 1, 1` | `0 → 0, 0, 0` |
| 4 | Priya, Diego and Marcus get the identical row | true | true |
| 5 | Start: `draw_down_flight_cellar_lots` as Marcus | `drawn` | `drawn` |
| 6 | Priya `usage(W)` after Start: holders, bottles, consumption_count | `2, 2, 1` | `2, 3, 0` |
| 7 | Priya `holdings(W)` after Start | `{2, 2}` | `{2, 3}` |
| 8 | Marcus reads his own lot quantity / Priya reads it (PRIVATE) | `1 / 0 rows` | `1 / 0 rows` (the owner's truth is untouched) |
| 9 | second glass of W poured while running (`pour_cellar_lot_into_glass`): poured; Priya holders, bottles, consumption | `true, 1, 1, 2` | `true, 2, 3, 0` |
| 10 | Marcus sets W's main photo (the `setCatalogWineImage` / `fillCatalogWine` statement) | 1 row | guard |
| 11 | Marcus clears W's main photo | 1 row | guard |
| 12 | Marcus writes description / alcohol / wine_name | 1, 1, 1 | guard ×3 |
| 13 | Marcus's no-op `image_url = image_url` | 1 row (new `updated_at` + audit row) | guard |
| 14 | Marcus writes W's blend: insert / update / delete | 1, 1, 1 | guard ×3 |
| 15 | W after rows 10-14: photo, text, alcohol, name, `updated_at`, audit-row count | all changed | all unchanged |
| 16 | Priya (not the creator) edits W, before the glass / now | 0 rows / 0 rows | 0 rows / 0 rows |
| 17 | Sofia (curator, not the adder) edits W, before the glass / now | 1 / 1 | 1 / 1 |
| 18 | Isabelle (W5's creator, not the adder) edits W5, before / after Marcus pours W5 | 1 / 1 | 1 / 1 |
| 19 | BYO tasting of Marcus's: Diego (contributor) edits his D6 / Marcus (host, not the adder) edits M7, which Diego brought | 1 / 1 | guard / 1 |
| 20 | Priya reads brand-new W3 between its creation and its answer insert | 1 row | 1 row (F5, unchanged) |
| 21 | W3 after its answer insert: `blind_pending`; Priya reads it | `true`; 0 rows | `true`; 0 rows |
| 22 | Marcus fills hidden W3 (description + alcohol); writes its blend (upsert); the recompute moved the primary grape | 1, 1, true | 1, 1, true |
| 23 | Marcus un-hides W3 (`blind_pending = false`) | 1 row | guard |
| 24 | postgres (no claims) and `service_role` edit W | 1, 1 | 1, 1 |
| 25 | `reveal_wine` as Marcus on both W glasses (unmark runs at depth 2) | revealed, revealed | revealed, revealed |
| 26 | Priya `usage(W)` after the reveals: appearance, holders, bottles, consumption | `2, 1, 1, 2` | `2, 1, 1, 2` |
| 27 | Marcus edits W after both reveals | 1 | 1 |
| 28 | OPEN board: a glass inserted revealed and poured at once. Priya sees appearance, bottles, consumption at once; Marcus edits W9 | `1, 1, 1, 1` | `1, 1, 1, 1` |
| 29 | a quantity-0 lot (the `catalog-manage.test.mjs` case) | holders 0, bottles 0, lot_count 1 | same |
| 30 | Marcus edits his own unpoured public M8 | 1 | 1 |
| 31 | CLOSED tasting, glass never revealed: Marcus edits M10 | 1 | guard (R2) |
| 32 | `find_or_create_catalog_wine` inserts a new wine as Marcus (the seed writes the blend at depth 2) | ok | ok |
| 33 | `merge_catalog_wines` by the loser's creator (Isabelle) | merged | merged |
| 34 | EXECUTE ACL on usage / holdings | `=X, postgres, anon, authenticated, service_role` | `postgres, authenticated, service_role` |
| 35 | the post-state block: as applied; after `grant … to anon`; after dropping the `catalog_wine_grapes` guard; after replacing the helper body | — | passes; raises "EXECUTE is held by OWNER,anon,…"; raises "triggers post-migration are …"; raises "body is not the one …" |
| 36 | the pre-state block run again | — | raises "a function this migration creates already exists" |
| end | live unchanged after both phases | ok | ok |

**How the rows prove the rule.**

- **Leaks close:** 1-3, 6-7, 9 and 10-15.
- **Legitimate callers keep working:** 8, 16-18, 22, 24-30, 32 and 33.
- **Refusals depend only on the caller's own glasses:**
  - rows 16-18 give each non-adder the same answer before and after someone else pours the wine;
  - row 19 refuses the contributor but not the host of a BYO glass;
  - row 4 gives every caller the same numbers.

**`repro-before.mjs` (before only) also recorded:**

- R4d: anon `usage` of a hidden W3 gives `appearance_count 1`. After the fix: permission denied, and 0 if called as authenticated.
- R5a-R5c: a public catalog-only wine vanishes for Priya when poured, and its creator reads `blind_pending = true` (F4).
- R5d: that creator can PATCH `blind_pending = false` (F6).

## 7. Tests to write first (red, then implement)

**T1. `src/lib/wine-identity/fill-rule.test.ts`** (`catalogFillPlan`).

- `catalog` context, the caller's wine: blank `image_url`/`description` and null alcohol are filled. Filled values are never overwritten, and whitespace counts as blank.
- The wine is someone else's (`createdBy !== userId`) → null, in every context.
- `flight`, public wine (`blindPending false`), glass not revealed → null. Nothing is written, not even the blend.
- `flight`, hidden wine → description and alcohol are filled, `image_url` never (even when blank and a scan exists), and `onlyWhileHidden: true`.
- `flight`, OPEN (`glassRevealed: true`), public wine → description and alcohol, never `image_url`, and `onlyWhileHidden: false`.
- A loop over every row/context combination: no `flight` plan ever carries `image_url`.
- A `catalog` plan never sets `onlyWhileHidden`.

**T2. `src/lib/catalog/rule1-guard.test.ts`.**

- `isUnrevealedGlassRefusal` is true only for `{ code: "42501", message: UNREVEALED_GLASS_EDIT }`. It is false for:
  - RLS's `42501 new row violates row-level security policy for table "catalog_wine_grapes"`;
  - `P0001` with the same message;
  - `null` and `undefined`.
- A pin, in the pattern of `supabase-template-doc.test.ts`: it reads `supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql` (CRLF normalised) and expects the SQL-quoted message, `message = '` + `UNREVEALED_GLASS_EDIT.replaceAll("'", "''")` + `'`, exactly twice, once per guard.
- The photo copy equals `attachNotice("unrevealed-glass")`.

**Existing suites that stay green without edits:** `src/lib/catalog-photos/strip.test.ts` (the photo copy and `mayBecomeMainPhoto`) and `src/lib/wine-identity/blend-sync.test.ts`.

**Post-apply live regressions (optional, by hand).** `scripts/catalog-manage.test.mjs` (node:test, rolled back) can gain three cases once the owner has applied the file live. Before that they fail by design.

- `appearance_count` ignores an unrevealed glass and counts it once revealed.
- A masked pour leaves `bottles`/`consumption_count` unchanged until the reveal.
- anon lacks EXECUTE.

## 8. Verification (the implementation run)

1. Write T1 and T2, and see them fail. Implement §5 and see them pass.
2. Run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. On the untouched tree (`8f800ce`, this worktree) tsc exits 0, lint exits 0, and vitest passes 135 files / 3052 tests.
3. Copy the §4 file to `supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`, then run `node --env-file=.env.local scripts/scratch-apply.mjs --file supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql --mode dry`. Expected: `DRY-OK 20260919213300 rule1_usage_and_main_photo`.
4. Run `node --env-file=.env.local .superpowers/leaks/probes/20260919213300-rule1-probe.mjs --file supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`. Expected: ALL EXPECTS MET, and live unchanged.
5. **Never `--mode live` and never push.** The owner approves the live apply. After it, `… --applied` checks live.

**Order.** The migration and the app change are each safe alone, and both are needed.

- **Migration first.** Refusals, counts and grants are closed at once. But the old app's flight add still fills before the glass exists, when the guard sees no glass yet, so F3's flight-fill path closes only with the app deploy.
  - The old app's Edit-path fill is refused and logged.
  - The old `setCatalogWineImage` shows the raw guard message.
- **App first.** The flight fill is safe, but direct PATCH, Manage wine and `setCatalogWineImage` stay open until the migration.

Recommended: apply the migration, then deploy the app, as close together as practical.

## 9. Residuals and findings

**Accepted residuals of this design**

- **R1. Delete.** `appearance_count` is revealed-only, but `delete_catalog_wine` must still refuse a wine any glass references (FK RESTRICT). A manager can therefore see Delete enabled on a public wine whose only reference is an unrevealed glass, and be refused ("still in use"). That needs a wine that was public through a lot deleted after it was poured. It affects curators only, and the probe is destructive: an unreferenced wine is actually deleted. It cannot close while deletion respects references.
- **R2. A CLOSED tasting with a never-revealed glass.** Its adder can never edit that wine again. This matches `attach_catalog_wine_photo`'s R2 and `blind_pending`.
- **R3. Masking lifts without a reveal when the glass stops holding the wine.** That happens on Remove (the intent cascades), Swap (`swapFlightGlass` deletes the old intent) and tasting deletion. The wine's counts then move while the tasting may still be running.
  - **Accepted:** a deleted tasting, or a Remove with nothing added back. The wine that left is in no hidden glass any more.
  - **Not harmless:** a Swap, or a Remove followed by a re-add. The wine that left is often a near-duplicate of the glass's new wine (the host swapped to the right vintage), so its counts moving mid-tasting can name the glass.
  - That part has the same shape as the unlink un-hide and is recorded with it as F11. This change makes it no worse: before it, the same counts moved already at Start.
- **R4. The host's own page is out of step.** At Start their cellar strip shows the bottle gone, while the community card on the same wine page still counts it until the reveal.
- **R5. No main photo from a flight, ever.** A wine first created in a flight gets its main photo from its page after the reveal, or from a later catalog or cellar scan. The flight scan still shows on the glass's reveal and record through `wine_answers.image_url`. A flight add of an already-public wine no longer fills its blank description, alcohol or blend.
- **R6. The adder is refused every client edit of that wine until the reveal.** That includes Manage wine, the main photo and the blend, and applies to a curator who is the adder too.
- **R7. `service_role` and scripts are not judged.** A maintenance script run mid-tasting could still change a poured wine. That is owner-controlled.
- **R8. The depth exemption.** A future trigger that writes `catalog_wines` or `catalog_wine_grapes` on a client's behalf is not judged. It must apply rule 1 itself (the CLAUDE.md bullet says so).
- **R9. ASYNC IMMEDIATE.** A self-scored ASYNC IMMEDIATE glass counts only at its global reveal.
- **R10. A curator-adder can edit a hidden wine someone else created** (D6's exemption). The creator reads the change (`.superpowers/leaks/probes/review-probe.mjs` part 3). The automatic fill never does this: it writes only the caller's own rows. The creator already reads the hidden row and saw it go hidden (F4), so the edit shows them no wine they could not already read.

**Pre-existing findings, not fixed here. Suggest separate tasks.**

- **F4. A public catalog-only wine vanishes when poured.**
  - The problem: `catalog_wine_mark_blind` hides a wine that was already public, because it has no lot, note or revealed glass. It disappears from the list and search, and its page 404s; its creator reads `blind_pending = true` on their own row. Anyone watching the catalog sees tonight's wine vanish.
  - The direction, "born hidden": on the flight path `find_or_create_catalog_wine` inserts `blind_pending = true` when it creates the row, and the mark trigger never hides a row that already existed. This also closes F5.
- **F5. A brand-new flight wine is public for one request round-trip.** That is the window between `find_or_create_catalog_wine` and the answer insert (probe row 20). The direction is born hidden, or one RPC that finds or creates the wine and inserts the glass and answer key in a single transaction.
- **F6. `catalog_wines` system columns are client-writable.**
  - The problem: `authenticated` holds table-level UPDATE and INSERT on `catalog_wines`, including `blind_pending`, `merged_into`, `created_by`, `created_at`, `id` and `updated_at`. A creator can un-hide a wine someone else poured (repro R5d). After this migration the adder cannot.
  - The direction is a column-grant lockdown (the profiles/wines pattern), limited to what `updateCatalogWine`, the fill and `fillPrice` write.
- **F7. `merge_catalog_wines` rewrites other people's answer keys.**
  - The problem: it is EXECUTE for PUBLIC and anon, and admits the loser's creator or a curator. It re-points every `wine_answers` row of the loser, other people's unrevealed glasses included, then sets `merged_into`. A catalog-only wine's creator can move a host's hidden answer key to another wine and watch that wine flip `blind_pending`. That is an integrity hole and an oracle.
  - The direction: refuse while the loser is linked by an unrevealed glass the caller did not add, or make merging curator-only.
- **F8. A PUBLIC or FRIENDS cellar's draw-down is directly visible.**
  - The problem: `cellar lots read` is own OR `can_view_cellar(owner)`, and at Start the lot's `quantity` and `updated_at` change. This spec masks the aggregates; the lot row is not masked. `wines.added_via = 'CELLAR'` also tells participants that the glass came from the adder's cellar.
  - The direction: draw down at the reveal instead of at Start (an owner decision; it changes D11), or read other people's lots through a view that hides a pending pour.
- **F9. New reference rows from a flight add are public at once.**
  - The problem: `find_or_create_producer`, `findOrCreateGrapeFolded`, and an inline appellation or region the host creates while keying a glass all appear immediately. They name the producer or grape of the glass being keyed.
  - The direction is an owner decision: accept it, or defer creation until the reveal.
- **F10. An unidentified flight glass's identity is readable by every signed-in user** (`catalog_wines_unidentified`; found in the review round).
  - **The write.** The "I can't identify this bottle" glass writes the glass's identity into `catalog_wines_unidentified`. Two paths do it: `insertTastingWineUnidentified`, and `saveFlightGlassCore`'s unidentified branch through `saveUnidentifiedRow` (`src/app/tastings/[id]/wines/new/tasting-wine-writes.ts`).
    - The row carries country, region, appellation, primary and secondary grape, producer, type designation, vintage, colour, style and wine name, with `created_by` set to the adder.
    - The unrevealed glass's `wine_answers.unidentified_wine_id` links it.
  - **The read.** The live `unidentified read` policy (from `20260829210000_wine_name_and_unidentified.sql`) is `true` for `authenticated`, and nothing like `blind_pending` gates it.
  - **Repro** (`.superpowers/leaks/probes/review2-probe.mjs`, rolled back, live unchanged). Marcus hosts an IN_PROGRESS LIVE BLIND tasting, and Priya is JOINED.
    - Priya reads 0 rows of the glass's answer key.
    - She does read the unidentified row: `wine_name` "Secret cuvee", vintage 2011, producer and grape equal to the answer key.
    - She finds it just by filtering `created_by` = Marcus.
  - Not caused by F2/F3, and not covered by F9.
  - **The direction** (owner decision), either of:
    - gate `unidentified read` the way `blind_pending` gates `catalog_wines`. A row linked from an unrevealed glass's answer key would then be readable only by its creator, or by whoever can read that answer key (a SECURITY INVOKER helper over `wine_answers read`, like `can_read_blind_pending_catalog_wine`);
    - stop the flight path writing identity into the shared table before the reveal.
- **F11. An abandoned flight wine is un-hidden while its glass is still unrevealed** (found in the review round).
  - **The trigger.** A corrective Edit calls `find_or_create_catalog_wine` on the edited identity. Changing any identity field yields another row, N2, and `writeAnswer` re-points the glass to it. The UPDATE of `wine_answers.catalog_wine_id` fires `catalog_wine_unmark_blind_on_unlink` (`20260912104000`) at trigger depth 2, which D7 does not judge. It sets `blind_pending = false` on the old brand-new wine N as soon as no unrevealed glass links it. Swap does the same, and so does a Remove followed by a re-add.
  - **What a guest sees.** N becomes public with everything the hidden flight fill wrote (description, alcohol, blend). An Edit usually corrects one field (vintage, name, appellation), so N is typically a near-duplicate of the wine now in the glass.
  - **Repro** (`.superpowers/leaks/probes/review-probe.mjs` part 2, rolled back, live unchanged). Marcus adds brand-new N to his flight; it is hidden and filled. He Edits one field. Result: N `blind_pending` false, N2 true, and Priya reads N with description "flight fill".
  - **The counts, the same shape.** R3's count-unmask on Swap, or on Remove plus a re-add, moves the pre-swap wine's numbers mid-tasting.
  - **Not a regression.** Before this change the fill and the identity row were public from the start (F5).
  - **The direction** (owner decision), any of:
    - keep a wine created for a flight hidden until that tasting's reveal or close, even after unlink, while it has no lot, note or revealed glass;
    - delete the orphaned brand-new row instead of un-hiding it;
    - have a corrective Edit update the glass's own brand-new row in place.
    - For the counts: keep a pour masked until the tasting ends, not just while its glass holds it.
- **F1** (scan-photos, the storage listing of `catalog/staging/`) was handled in the listing worktree and is live now (`20260919203000_wine_images_listing_lockdown`).

## 10. CLAUDE.md changes (the main session makes them)

**1. The existing Scan photos bullet: one clause.** Once the guard exists, its claim that `setCatalogWineImage` has no rule-1 check is false. The same change was made to the `strip.ts` comment (§5.6). Replace:

> … — the statuses returned after that unrevealed-glass check — since `setCatalogWineImage` has no rule-1 check of its own. A `via = 'cellar'` photo …

with:

> … — the statuses returned after that unrevealed-glass check; the database refuses it too (`catalog_wines_rule1_guard`, 20260919213300). A `via = 'cellar'` photo …

**2. A new bullet under Domain rules:**

> - **Rule 1 on catalog counts and a poured wine's record** (migration `20260919213300_rule1_usage_and_main_photo.sql`; spec `docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md`). `catalog_wine_usage` and `catalog_wine_holdings` (EXECUTE `authenticated` + `service_role` only; PUBLIC and `anon` revoked) return numbers no unrevealed glass moves. `appearance_count` counts revealed glasses only. A bottle drawn from a cellar lot into a glass that is not revealed yet (D11's Start draw-down or a running pour, found through `wine_pour_intents.cellar_consumption_id` by the internal `catalog_wine_masked_pours`) still counts as in its cellar, and not drunk, until that reveal. Before this, the counts ticking up at Start named the wine, even from a PRIVATE cellar. Any new shared count over `wine_answers`, `cellar_lots` or `cellar_consumptions` must follow the same rule. The adder of a still-unrevealed glass (the host for `added_by_host`, the contributor for BYO: `attach_catalog_wine_photo`'s step 7, as `catalog_wine_in_callers_unrevealed_glass`) cannot change that wine's public record. `catalog_wines_rule1_guard` (BEFORE UPDATE) and `catalog_wine_grapes_rule1_guard` refuse a signed-in client's own write (trigger depth 1) on a wine not `blind_pending` before and after, with 42501 "This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal." (`src/lib/catalog/rule1-guard.ts`). That covers a main photo, a description, a blend, even a no-op save, which still stamps `updated_at` and an edit-audit row naming the editor. Nobody else is ever refused for linkage. Writes by other triggers (the `blind_pending` mark/unmark, the blend seed and recompute) and by `service_role` are not judged, so a new trigger that writes `catalog_wines` for a client must apply rule 1 itself. The add-wine write path never fills a public wine from a flight. Flight adds, finishes, Edits and Swaps call `upsertCatalogWine(..., { fill: false })`, then `fillFlightCatalogWine` after the answer key is written. It fills description, alcohol and blend only while the wine is `blind_pending` (or the glass is itself revealed, on an OPEN board), and never `image_url`: a flight scan stays on the glass's `wine_answers.image_url` (`catalogFillPlan`, `src/lib/wine-identity/fill-rule.ts`). A hidden row is readable by its creator, every curator (`can_read_blind_pending_catalog_wine`'s `is_curator` test) and whoever can read an answer key naming it, so the guards let a write through while `blind_pending` stays true; that is why a curator-adder can still edit a hidden wine someone else created (spec R10). Pre-existing, still open: a catalog-only public wine vanishing when poured (F4), the new-wine window (F5), client-writable `blind_pending` (F6), `merge_catalog_wines` (F7), PUBLIC-cellar draw-downs (F8), new reference rows (F9), an unidentified glass's identity in the all-readable `catalog_wines_unidentified` (F10), and an Edit, Swap or Remove plus re-add un-hiding the abandoned brand-new wine, with its flight fill, and unmasking its counts while the glass is still unrevealed (F11).

## 11. File plan

**New**

- `supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`: §4, verbatim.
- `src/lib/wine-identity/fill-rule.ts`, `fill-rule.test.ts`: §5.1, T1.
- `src/lib/catalog/rule1-guard.ts`, `rule1-guard.test.ts`: §5.4, T2 (and the `UNREVEALED_GLASS_PHOTO` constant).

**Changed**

- `src/lib/wine-identity/server/write.ts`: §5.2.
- `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts`: §5.3.
- `src/app/catalog/[wineId]/actions.ts` and `src/app/catalog/new/actions.ts`: §5.5.
- `src/lib/catalog-photos/strip.ts` and `src/app/catalog/[wineId]/wine-admin-controls.tsx`: comments only (§5.6).
- `CLAUDE.md`, by the main session (§10): the Scan photos bullet's `setCatalogWineImage` clause, and the new bullet.

**Unchanged:** `src/lib/supabase/database.types.ts` and every caller of `catalog_wine_usage`/`catalog_wine_holdings`.

**Gitignored, already written:** everything under `.superpowers/leaks/probes/`: the probe, the draft, `md5s.mjs`, `repro-before.mjs`, `ro.mjs` (a read-only query runner), and the review round's `review-probe.mjs` and `review2-probe.mjs` (F10, F11, R10).

## Appendix A. The last probe run (review round, `--file supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`, 2026-09-19)

```text
ok   before.1    anon usage(W) with W in Marcus's unrevealed glass => {"holders":2,"bottles":3,"lot_count":2,"note_count":0,"appearance_count":1,"consumption_count":0}
ok   before.2    anon holdings(W) => {"holders":2,"bottles":3}
ok   before.3    appearance_count before -> after the glass (Priya, Diego, Marcus) => [0,1,1,1]
ok   before.4    every caller gets one answer (Priya = Diego = Marcus) => true
ok   before.5    Marcus draws the flight down (Start) => ["drawn"]
ok   before.6    Priya usage(W) after Start (holders, bottles, consumption_count) => [2,2,1]
ok   before.7    Priya holdings(W) after Start => {"holders":2,"bottles":2}
ok   before.8    Marcus reads his own lot (the owner's truth) / Priya reads it (PRIVATE) => [1,0]
ok   before.9    running pour_cellar_lot_into_glass: poured / Priya (holders, bottles, consumption_count) => [true,1,1,2]
ok   before.10   Marcus sets W's main photo (setCatalogWineImage / fillCatalogWine) => 1
ok   before.11   Marcus clears W's main photo => 1
ok   before.12   Marcus fills description / alcohol / renames => [1,1,1]
ok   before.13   Marcus's no-op save (still stamps updated_at + an audit row) => 1
ok   before.14   Marcus writes W's blend: insert / update / delete => [1,1,1]
ok   before.15   after 10-14 W is unchanged (photo, text, alcohol, name, updated_at, audit rows) => true
ok   before.16   Priya (not the creator) edits W: before the glass / now => [0,0]
ok   before.17   Sofia (curator, not the adder) edits W: before the glass / now => [1,1]
ok   before.18   Isabelle (W5's creator, not the adder) edits W5: before / after Marcus pours it => [1,1]
ok   before.19   BYO: Diego (contributor) edits D6 / Marcus (host, not the adder) edits M7 => [1,1]
ok   before.20   Priya reads a brand-new W3 before its answer insert (pre-existing window, F5) => 1
ok   before.21   W3 after its answer insert: blind_pending / Priya reads it => [true,0]
ok   before.22   Marcus fills hidden W3 (description, alcohol) and its blend (the flight fill after the answer insert) => [1,1,true]
ok   before.23   Marcus un-hides W3 (blind_pending = false) => 1
ok   before.24   postgres and service_role (no auth.uid()) edit W => [1,1]
ok   before.25   reveal_wine (unmark_blind runs at depth 2) as Marcus, both glasses of W => [true,true]
ok   before.26   Priya usage(W) after the reveal (appearance, holders, bottles, consumption) => [2,1,1,2]
ok   before.27   Marcus edits W after both reveals => 1
ok   before.28   OPEN glass poured: Priya sees (appearance, bottles, consumption) at once; Marcus edits W9 => [1,1,1,1]
ok   before.29   a quantity-0 lot: holders 0, bottles 0, lot_count 1 (catalog-manage.test parity) => {"holders":0,"bottles":0,"lot_count":1,"note_count":0,"appearance_count":0,"consumption_count":0}
ok   before.30   Marcus edits his own unpoured public wine M8 => 1
ok   before.31   CLOSED tasting, glass never revealed: Marcus still refused on M10 (R2) => [false,1]
ok   before.32   find_or_create_catalog_wine inserts a new wine (the seed writes the blend at depth 2) => {"ok":true}
ok   before.33   merge_catalog_wines by the loser's creator => true
ok   before.34   EXECUTE acl on usage/holdings => ["{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"]
ok   after.1    anon usage(W) with W in Marcus's unrevealed glass => {"error":"42501 permission denied for function catalog_wine_usage"}
ok   after.2    anon holdings(W) => {"error":"42501 permission denied for function catalog_wine_holdings"}
ok   after.3    appearance_count before -> after the glass (Priya, Diego, Marcus) => [0,0,0,0]
ok   after.4    every caller gets one answer (Priya = Diego = Marcus) => true
ok   after.5    Marcus draws the flight down (Start) => ["drawn"]
ok   after.6    Priya usage(W) after Start (holders, bottles, consumption_count) => [2,3,0]
ok   after.7    Priya holdings(W) after Start => {"holders":2,"bottles":3}
ok   after.8    Marcus reads his own lot (the owner's truth) / Priya reads it (PRIVATE) => [1,0]
ok   after.9    running pour_cellar_lot_into_glass: poured / Priya (holders, bottles, consumption_count) => [true,2,3,0]
ok   after.10   Marcus sets W's main photo (setCatalogWineImage / fillCatalogWine) => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   after.11   Marcus clears W's main photo => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   after.12   Marcus fills description / alcohol / renames => [{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}]
ok   after.13   Marcus's no-op save (still stamps updated_at + an audit row) => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   after.14   Marcus writes W's blend: insert / update / delete => [{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}]
ok   after.15   after 10-14 W is unchanged (photo, text, alcohol, name, updated_at, audit rows) => true
ok   after.16   Priya (not the creator) edits W: before the glass / now => [0,0]
ok   after.17   Sofia (curator, not the adder) edits W: before the glass / now => [1,1]
ok   after.18   Isabelle (W5's creator, not the adder) edits W5: before / after Marcus pours it => [1,1]
ok   after.19   BYO: Diego (contributor) edits D6 / Marcus (host, not the adder) edits M7 => [{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},1]
ok   after.20   Priya reads a brand-new W3 before its answer insert (pre-existing window, F5) => 1
ok   after.21   W3 after its answer insert: blind_pending / Priya reads it => [true,0]
ok   after.22   Marcus fills hidden W3 (description, alcohol) and its blend (the flight fill after the answer insert) => [1,1,true]
ok   after.23   Marcus un-hides W3 (blind_pending = false) => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   after.24   postgres and service_role (no auth.uid()) edit W => [1,1]
ok   after.25   reveal_wine (unmark_blind runs at depth 2) as Marcus, both glasses of W => [true,true]
ok   after.26   Priya usage(W) after the reveal (appearance, holders, bottles, consumption) => [2,1,1,2]
ok   after.27   Marcus edits W after both reveals => 1
ok   after.28   OPEN glass poured: Priya sees (appearance, bottles, consumption) at once; Marcus edits W9 => [1,1,1,1]
ok   after.29   a quantity-0 lot: holders 0, bottles 0, lot_count 1 (catalog-manage.test parity) => {"holders":0,"bottles":0,"lot_count":1,"note_count":0,"appearance_count":0,"consumption_count":0}
ok   after.30   Marcus edits his own unpoured public wine M8 => 1
ok   after.31   CLOSED tasting, glass never revealed: Marcus still refused on M10 (R2) => [false,{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}]
ok   after.32   find_or_create_catalog_wine inserts a new wine (the seed writes the blend at depth 2) => {"ok":true}
ok   after.33   merge_catalog_wines by the loser's creator => true
ok   after.34   EXECUTE acl on usage/holdings => ["{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"]
      35 messages: ["passed","public.catalog_wine_usage(uuid) EXECUTE is held by OWNER,anon,authenticated,service_role, expected OWNER,authenticated,service_role","catalog_wines / catalog_wine_grapes triggers post-migration are catalog_wine_grapes.catalog_wine_grapes_recompute 29 O tg_recompute_catalog_wine_grapes(); catalog_wines.catalog_wines_audit 17 O audit_catalog_wine_edit(); catalog_wines.catalog_wines_rule1_guard 19 O catalog_wines_rule1_guard(); catalog_wines.catalog_wines_seed_grapes 5 O tg_seed_catalog_wine_grapes(); catalog_wines.catalog_wines_set_updated_at 19 O set_updated_at()","public.catalog_wine_in_callers_unrevealed_glass(uuid) body is not the one this migration was written with (md5 3ab0d7f01cf01c94c66d65befa4bd505)"]
ok   after.35   post-state passes as applied / raises on anon EXECUTE / on a dropped guard / on a changed helper body => ["passed",true,true,true]
ok   after.36   pre-state refuses a second apply => "a function this migration creates already exists"
ok   live unchanged after both phases: {"cw":121,"cwg":195,"w":18,"wa":18,"l":90,"c":8,"i":0,"e":586,"t":7,"tp":22,"cwmd5":"1112cfd48cfa4e7140ae275a1d7c21e0","procs":"ab793a5f8332453b6c34adc73f4c7609","triggers":58}
ALL EXPECTS MET
```

## Appendix B. The probe source (`.superpowers/leaks/probes/20260919213300-rule1-probe.mjs`)

```js
// Probe for 20260919213300_rule1_usage_and_main_photo (spec
// docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md §6).
//   node --env-file=.env.local .superpowers/leaks/probes/20260919213300-rule1-probe.mjs [--file <migration.sql>] [--applied]
// --applied: after the owner has applied the file live, run only the after-phase against live as it
// is (the file is not executed again; rows 35-36 then check live itself).
// Two phases, each ONE transaction that ends in ROLLBACK:
//   before — the leaks reproduce on live as it is;
//   after  — the migration file is executed inside the transaction, then the same fixtures.
// Fixtures are built as postgres on the seeded demo.*@blindr.invalid people; client calls run in
// savepoints under `set local role authenticated|anon|service_role` with request.jwt.claims. A final
// live read shows nothing persisted. Every EXPECT is written before the run; a mismatch exits 1.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { pgConfig } from "../../../scripts/wine-map-tiles/lib.mjs";

const fileArg = process.argv.indexOf("--file");
const MIGRATION =
  fileArg >= 0 ? process.argv[fileArg + 1] : ".superpowers/leaks/probes/draft/20260919213300_rule1_usage_and_main_photo.sql";
const APPLIED = process.argv.includes("--applied");
const GUARD = "42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.";

const client = new pg.Client({ ...pgConfig(), port: Number(process.env.DB_PORT ?? 5432) });
await client.connect();
const q = (sql, params) => client.query(sql, params);
const rows = async (sql, params) => (await q(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params)).rows[0] ?? null;

let sp = 0;
async function as(who, fn) {
  const name = "s" + ++sp;
  await q("savepoint " + name);
  try {
    if (who === "anon") {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await q("set local role anon");
    } else if (who === "service_role") {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await q("set local role service_role");
    } else if (who === "postgres") {
      await q("select set_config('request.jwt.claims', '', true)");
    } else {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
      await q("set local role authenticated");
    }
    const out = await fn();
    await q("reset role");
    await q("select set_config('request.jwt.claims', '', true)");
    await q("release savepoint " + name);
    return out;
  } catch (e) {
    await q("rollback to savepoint " + name);
    await q("reset role");
    return { error: e.code + " " + e.message };
  }
}

let failures = 0;
function check(phase, id, what, got, expect) {
  const g = JSON.stringify(got);
  const e = JSON.stringify(expect);
  const ok = expect === undefined || g === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${phase}.${id.padEnd(4)} ${what} => ${g}${ok ? "" : "   EXPECTED " + e}`);
}

const liveSnapshot = async () =>
  one(`select (select count(*) from catalog_wines)::int cw, (select count(*) from catalog_wine_grapes)::int cwg,
              (select count(*) from wines)::int w, (select count(*) from wine_answers)::int wa,
              (select count(*) from cellar_lots)::int l, (select count(*) from cellar_consumptions)::int c,
              (select count(*) from wine_pour_intents)::int i, (select count(*) from catalog_wine_edits)::int e,
              (select count(*) from tastings)::int t, (select count(*) from tasting_participants)::int tp,
              (select md5(string_agg(id::text || coalesce(image_url,'') || coalesce(description,'') || blind_pending::text, ',' order by id)) from catalog_wines) cwmd5,
              (select md5(string_agg(p.oid::text || md5(p.prosrc) || coalesce(p.proacl::text,''), ',' order by p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace) procs,
              (select count(*) from pg_trigger where not tgisinternal)::int triggers`);

async function phase(name, applyMigration) {
  const P = name === "after";
  await q("begin");
  try {
    if (applyMigration) await q(await readFile(MIGRATION, "utf8"));

    const ppl = Object.fromEntries(
      (await rows("select u.email, u.id from auth.users u where u.email like 'demo.%@blindr.invalid'")).map((r) => [
        r.email.split(".")[1].split("@")[0],
        r.id,
      ]),
    );
    const { marcus, priya, isabelle, diego, sofia } = ppl;
    assert.ok(marcus && priya && isabelle && diego && sofia, "demo people present");
    // Sofia is a curator for this transaction only (profiles_sync_is_curator derives is_curator from role).
    await q("update profiles set role = 'ADMIN' where id = $1", [sofia]);
    assert.equal((await one("select is_curator from profiles where id = $1", [sofia])).is_curator, true);

    const ref = await one(
      "select country_id, region_id, appellation_id, primary_grape_id, producer_id from catalog_wines where merged_into is null limit 1",
    );
    const otherGrape = (await one("select id from grapes where id <> $1 limit 1", [ref.primary_grape_id])).id;
    const newWine = async (createdBy, tag) =>
      (
        await one(
          `insert into catalog_wines (country_id, region_id, appellation_id, primary_grape_id, producer_id,
             vintage_kind, vintage_year, colour, style, wine_name, created_by)
           values ($1,$2,$3,$4,$5,'YEAR',2016,'RED','STILL','Rule1 probe ' || $7 || ' ' || gen_random_uuid()::text, $6) returning id`,
          [ref.country_id, ref.region_id, ref.appellation_id, ref.primary_grape_id, ref.producer_id, createdBy, tag],
        )
      ).id;
    const lot = async (owner, wine, qty) =>
      (await one("insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1,$2,$3,greatest($3,1)) returning id", [owner, wine, qty])).id;
    const tasting = async (host, { source = "HOST_PROVIDES", mode = "BLIND", status = "DRAFT" } = {}) =>
      (
        await one(
          `insert into tastings (name, host_id, timing_mode, wine_source, status, reveal_mode)
           values ('Rule1 probe', $1, 'LIVE', $2, $3, $4) returning id`,
          [host, source, status, mode],
        )
      ).id;
    const join = async (t, user) =>
      (await one("insert into tasting_participants (tasting_id, user_id, status) values ($1,$2,'JOINED') returning id", [t, user])).id;
    let pos = 100;
    const glass = async (t, wineId, { contributor = null, revealed = false } = {}) => {
      const w = (
        await one(
          "insert into wines (tasting_id, position, is_revealed, contributor_participant_id, added_by_host) values ($1,$2,$3,$4,$5) returning id",
          [t, ++pos, revealed, contributor, contributor === null],
        )
      ).id;
      await q(
        `insert into wine_answers (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
         values ($1,$2,$3,$4,$5,$6,'YEAR',2016,$7)`,
        [w, ref.country_id, ref.region_id, ref.appellation_id, ref.primary_grape_id, ref.producer_id, wineId],
      );
      return w;
    };
    const usage = (who, id) => as(who, () => one("select * from catalog_wine_usage($1)", [id]));
    const holdings = (who, id) => as(who, async () => (await rows("select holders, bottles from catalog_wine_holdings(array[$1]::uuid[])", [id]))[0] ?? null);
    const patch = (who, id, set) => as(who, async () => (await q(`update catalog_wines set ${set} where id = $1`, [id])).rowCount);
    const state = (id) =>
      one(
        `select image_url, description, alcohol_percent::text alc, wine_name like 'Rule1 probe%' name_kept, blind_pending, updated_at::text upd,
                (select count(*)::int from catalog_wine_edits e where e.catalog_wine_id = cw.id) edits
           from catalog_wines cw where id = $1`,
        [id],
      );
    const readable = (who, id) => as(who, async () => (await rows("select id from catalog_wines where id = $1", [id])).length);

    // ---- Fixtures ----------------------------------------------------------------
    // W: created by Marcus, public (Isabelle holds a bottle: pouring never flips blind_pending), an old
    // main photo so a clear is a real change. Marcus holds 2 bottles in his PRIVATE cellar.
    const W = await newWine(marcus, "W");
    await q("update catalog_wines set image_url = 'https://example.invalid/old.jpg' where id = $1", [W]);
    await lot(isabelle, W, 1);
    const marcusLot = await lot(marcus, W, 2);
    const T = await tasting(marcus);
    await join(T, marcus);
    await join(T, priya);

    const baseline = {
      priya: await usage(priya, W),
      diego: await usage(diego, W),
      marcus: await usage(marcus, W),
      priyaHold: await holdings(priya, W),
    };
    const priyaPatchBefore = await patch(priya, W, "description = 'guest edit'");
    const sofiaPatchBefore = await patch(sofia, W, "alcohol_percent = 12.5");
    // Isabelle's own public wine W5, before Marcus pours it.
    const W5 = await newWine(isabelle, "W5");
    await lot(isabelle, W5, 1);
    const isabellePatchBefore = await patch(isabelle, W5, "description = 'before pour'");

    // ---- F2: appearance_count (B1/A1-A3) ------------------------------------------
    const g1 = await glass(T, W);
    const after = { priya: await usage(priya, W), diego: await usage(diego, W), marcus: await usage(marcus, W) };
    check(name, "1", "anon usage(W) with W in Marcus's unrevealed glass",
      await usage("anon", W),
      P ? { error: "42501 permission denied for function catalog_wine_usage" }
        : { holders: 2, bottles: 3, lot_count: 2, note_count: 0, appearance_count: 1, consumption_count: 0 });
    check(name, "2", "anon holdings(W)",
      await holdings("anon", W),
      P ? { error: "42501 permission denied for function catalog_wine_holdings" } : { holders: 2, bottles: 3 });
    check(name, "3", "appearance_count before -> after the glass (Priya, Diego, Marcus)",
      [baseline.priya.appearance_count, after.priya.appearance_count, after.diego.appearance_count, after.marcus.appearance_count],
      P ? [0, 0, 0, 0] : [0, 1, 1, 1]);
    check(name, "4", "every caller gets one answer (Priya = Diego = Marcus)",
      JSON.stringify(after.priya) === JSON.stringify(after.diego) && JSON.stringify(after.diego) === JSON.stringify(after.marcus), true);

    // ---- F2: PRIVATE-cellar pour at Start (B5/A5-A8) ---------------------------------
    await q("insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1,$2,$3,true)", [g1, marcus, marcusLot]);
    await q("update tastings set status = 'IN_PROGRESS' where id = $1", [T]);
    check(name, "5", "Marcus draws the flight down (Start)",
      (await as(marcus, () => rows("select outcome from draw_down_flight_cellar_lots($1)", [T]))).map?.((r) => r.outcome), ["drawn"]);
    const afterStart = await usage(priya, W);
    check(name, "6", "Priya usage(W) after Start (holders, bottles, consumption_count)",
      [afterStart.holders, afterStart.bottles, afterStart.consumption_count], P ? [2, 3, 0] : [2, 2, 1]);
    check(name, "7", "Priya holdings(W) after Start", await holdings(priya, W), P ? { holders: 2, bottles: 3 } : { holders: 2, bottles: 2 });
    check(name, "8", "Marcus reads his own lot (the owner's truth) / Priya reads it (PRIVATE)",
      [(await as(marcus, () => one("select quantity from cellar_lots where id=$1", [marcusLot]))).quantity,
       await as(priya, async () => (await rows("select id from cellar_lots where id=$1", [marcusLot])).length)], [1, 0]);

    // Running pour: a second glass of W added while IN_PROGRESS, poured at once.
    const g2 = await glass(T, W);
    await q("insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1,$2,$3,false)", [g2, marcus, marcusLot]);
    const pour2 = await as(marcus, () => one("select pour_cellar_lot_into_glass($1) is not null as poured", [g2]));
    const afterPour = await usage(priya, W);
    check(name, "9", "running pour_cellar_lot_into_glass: poured / Priya (holders, bottles, consumption_count)",
      [pour2.poured, afterPour.holders, afterPour.bottles, afterPour.consumption_count],
      P ? [true, 2, 3, 0] : [true, 1, 1, 2]);

    // ---- F3: the adder's writes on a public wine (B10/A10-A14) -------------------------
    const s0 = await state(W);
    check(name, "10", "Marcus sets W's main photo (setCatalogWineImage / fillCatalogWine)",
      await patch(marcus, W, "image_url = 'https://example.invalid/flight-scan.jpg'"), P ? { error: GUARD } : 1);
    check(name, "11", "Marcus clears W's main photo", await patch(marcus, W, "image_url = null"), P ? { error: GUARD } : 1);
    check(name, "12", "Marcus fills description / alcohol / renames",
      [await patch(marcus, W, "description = 'Label reader text'"), await patch(marcus, W, "alcohol_percent = 14"),
       await patch(marcus, W, "wine_name = 'Renamed'")],
      P ? [{ error: GUARD }, { error: GUARD }, { error: GUARD }] : [1, 1, 1]);
    check(name, "13", "Marcus's no-op save (still stamps updated_at + an audit row)",
      await patch(marcus, W, "image_url = image_url"), P ? { error: GUARD } : 1);
    check(name, "14", "Marcus writes W's blend: insert / update / delete",
      [await as(marcus, async () => (await q("insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order) values ($1,$2,20,5)", [W, otherGrape])).rowCount),
       await as(marcus, async () => (await q("update catalog_wine_grapes set percentage = 80 where catalog_wine_id = $1 and grape_id = $2", [W, ref.primary_grape_id])).rowCount),
       await as(marcus, async () => (await q("delete from catalog_wine_grapes where catalog_wine_id = $1 and grape_id = $2", [W, ref.primary_grape_id])).rowCount)],
      P ? [{ error: GUARD }, { error: GUARD }, { error: GUARD }] : [1, 1, 1]);
    const s1 = await state(W);
    check(name, "15", "after 10-14 W is unchanged (photo, text, alcohol, name, updated_at, audit rows)",
      P ? JSON.stringify(s0) === JSON.stringify(s1) : JSON.stringify(s0) !== JSON.stringify(s1), true);

    // ---- Refusals depend only on the caller's own glasses (A16-A19) -----------------
    check(name, "16", "Priya (not the creator) edits W: before the glass / now",
      [priyaPatchBefore, await patch(priya, W, "description = 'guest edit'")], [0, 0]);
    check(name, "17", "Sofia (curator, not the adder) edits W: before the glass / now",
      [sofiaPatchBefore, await patch(sofia, W, "alcohol_percent = 12.5")], [1, 1]);
    await glass(T, W5); // Marcus pours Isabelle's W5
    check(name, "18", "Isabelle (W5's creator, not the adder) edits W5: before / after Marcus pours it",
      [isabellePatchBefore, await patch(isabelle, W5, "description = 'after pour'")], [1, 1]);
    // BYO: Diego brings D6 (his, public) and M7 (created by Marcus) into Marcus's BYO tasting.
    const T2 = await tasting(marcus, { source: "PARTICIPANT_CONTRIBUTED", status: "IN_PROGRESS" });
    await join(T2, marcus);
    const diegoSeat = await join(T2, diego);
    const D6 = await newWine(diego, "D6");
    await lot(isabelle, D6, 1);
    const M7 = await newWine(marcus, "M7");
    await lot(isabelle, M7, 1);
    await glass(T2, D6, { contributor: diegoSeat });
    await glass(T2, M7, { contributor: diegoSeat });
    check(name, "19", "BYO: Diego (contributor) edits D6 / Marcus (host, not the adder) edits M7",
      [await patch(diego, D6, "description = 'mine'"), await patch(marcus, M7, "description = 'host edit'")],
      P ? [{ error: GUARD }, 1] : [1, 1]);

    // ---- Hidden wines and bookkeeping (A20-A24) ---------------------------------------
    const W3 = await newWine(marcus, "W3");
    check(name, "20", "Priya reads a brand-new W3 before its answer insert (pre-existing window, F5)", await readable(priya, W3), 1);
    await glass(T, W3);
    check(name, "21", "W3 after its answer insert: blind_pending / Priya reads it",
      [(await one("select blind_pending from catalog_wines where id=$1", [W3])).blind_pending, await readable(priya, W3)], [true, 0]);
    check(name, "22", "Marcus fills hidden W3 (description, alcohol) and its blend (the flight fill after the answer insert)",
      [await patch(marcus, W3, "description = 'hidden fill', alcohol_percent = 13"),
       await as(marcus, async () => (await q("insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order) values ($1,$2,60,0) on conflict (catalog_wine_id, grape_id) do update set percentage = excluded.percentage", [W3, otherGrape])).rowCount),
       (await one("select primary_grape_id = $2 as recomputed from catalog_wines where id = $1", [W3, otherGrape])).recomputed],
      [1, 1, true]);
    check(name, "23", "Marcus un-hides W3 (blind_pending = false)",
      await patch(marcus, W3, "blind_pending = false"), P ? { error: GUARD } : 1);
    check(name, "24", "postgres and service_role (no auth.uid()) edit W",
      [await patch("postgres", W, "description = 'maintenance'"), await patch("service_role", W, "description = 'admin client'")], [1, 1]);

    // ---- Reveal and after (A25-A27) -----------------------------------------------------
    const revealed = await as(marcus, async () => {
      await q("select reveal_wine($1)", [g1]);
      await q("select reveal_wine($1)", [g2]);
      return (await rows("select is_revealed from wines where id in ($1,$2)", [g1, g2])).map((r) => r.is_revealed);
    });
    check(name, "25", "reveal_wine (unmark_blind runs at depth 2) as Marcus, both glasses of W", revealed, [true, true]);
    const afterReveal = await usage(priya, W);
    check(name, "26", "Priya usage(W) after the reveal (appearance, holders, bottles, consumption)",
      [afterReveal.appearance_count, afterReveal.holders, afterReveal.bottles, afterReveal.consumption_count], [2, 1, 1, 2]);
    check(name, "27", "Marcus edits W after both reveals", await patch(marcus, W, "description = 'after the reveal'"), 1);

    // ---- OPEN board: nothing hidden, nothing masked (A28) ----------------------------------
    const W9 = await newWine(marcus, "W9");
    const lot9 = await lot(marcus, W9, 2);
    const T3 = await tasting(marcus, { mode: "OPEN", status: "IN_PROGRESS" });
    await join(T3, marcus);
    const g9 = await glass(T3, W9, { revealed: true });
    await q("insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1,$2,$3,false)", [g9, marcus, lot9]);
    await as(marcus, () => one("select pour_cellar_lot_into_glass($1)", [g9]));
    const u9 = await usage(priya, W9);
    check(name, "28", "OPEN glass poured: Priya sees (appearance, bottles, consumption) at once; Marcus edits W9",
      [u9.appearance_count, u9.bottles, u9.consumption_count, await patch(marcus, W9, "description = 'open board'")], [1, 1, 1, 1]);

    // ---- Non-regression (A29-A33) -------------------------------------------------------------
    const Z = await newWine(isabelle, "Z");
    await lot(priya, Z, 0);
    check(name, "29", "a quantity-0 lot: holders 0, bottles 0, lot_count 1 (catalog-manage.test parity)",
      await usage(priya, Z), { holders: 0, bottles: 0, lot_count: 1, note_count: 0, appearance_count: 0, consumption_count: 0 });
    const M8 = await newWine(marcus, "M8");
    check(name, "30", "Marcus edits his own unpoured public wine M8", await patch(marcus, M8, "description = 'not poured'"), 1);
    const T4 = await tasting(marcus, { status: "IN_PROGRESS" });
    await join(T4, marcus);
    const M10 = await newWine(marcus, "M10");
    await lot(isabelle, M10, 1);
    const g10 = await glass(T4, M10);
    await q("update tastings set status = 'CLOSED' where id = $1", [T4]);
    check(name, "31", "CLOSED tasting, glass never revealed: Marcus still refused on M10 (R2)",
      [(await one("select is_revealed from wines where id=$1", [g10])).is_revealed, await patch(marcus, M10, "description = 'closed'")],
      P ? [false, { error: GUARD }] : [false, 1]);
    const fresh = await as(marcus, () =>
      one("select find_or_create_catalog_wine($1::jsonb) is not null as ok", [
        JSON.stringify({
          country_id: ref.country_id, region_id: ref.region_id, appellation_id: ref.appellation_id,
          primary_grape_id: ref.primary_grape_id, producer_id: ref.producer_id, vintage_kind: "YEAR", vintage_year: 1999,
          colour: "RED", style: "STILL", wine_name: "Rule1 probe fresh " + Date.now(),
        }),
      ]),
    );
    check(name, "32", "find_or_create_catalog_wine inserts a new wine (the seed writes the blend at depth 2)", fresh, { ok: true });
    const L = await newWine(isabelle, "L");
    const merged = await as(isabelle, async () => {
      await q("select merge_catalog_wines($1, $2)", [L, W5]);
      return (await one("select merged_into = $2 as ok from catalog_wines where id = $1", [L, W5])).ok;
    });
    check(name, "33", "merge_catalog_wines by the loser's creator", merged, true);

    // ---- Grants (A34) -------------------------------------------------------------------------
    check(name, "34", "EXECUTE acl on usage/holdings",
      (await rows("select p.proname, p.proacl::text acl from pg_proc p where p.proname in ('catalog_wine_usage','catalog_wine_holdings') order by 1")).map((r) => r.acl),
      P ? ["{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"]
        : ["{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}", "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"]);

    // ---- The file's own guards bite (A35-A36, after only) ----------------------------------------
    if (P) {
      const sql = await readFile(MIGRATION, "utf8");
      const pre = sql.slice(sql.indexOf("do $$"), sql.indexOf("-- ====="));
      const post = sql.slice(sql.indexOf("do $$", sql.indexOf("-- Post-state, same transaction")));
      const bite = async (setup) => {
        await q("savepoint bite");
        try {
          if (setup) await q(setup);
          await q(post);
          return "passed";
        } catch (e) {
          return e.message.split(":")[0];
        } finally {
          await q("rollback to savepoint bite");
        }
      };
      const bites = [await bite(null),
         await bite("grant execute on function catalog_wine_usage(uuid) to anon"),
         await bite("drop trigger catalog_wine_grapes_rule1_guard on catalog_wine_grapes"),
         await bite("create or replace function catalog_wine_in_callers_unrevealed_glass(p_catalog_wine_id uuid) returns boolean language sql stable security definer set search_path = public as $x$ select false $x$")];
      console.log("      35 messages:", JSON.stringify(bites));
      check(name, "35", "post-state passes as applied / raises on anon EXECUTE / on a dropped guard / on a changed helper body",
        [bites[0], bites[1].includes("EXECUTE is held by OWNER,anon,authenticated,service_role"),
         bites[2].startsWith("catalog_wines / catalog_wine_grapes triggers post-migration are"),
         bites[3].includes("catalog_wine_in_callers_unrevealed_glass(uuid) body is not the one")],
        ["passed", true, true, true]);
      await q("savepoint rerun");
      let rerun;
      try {
        await q(pre);
        rerun = "passed";
      } catch (e) {
        rerun = e.message.split(":")[0];
      } finally {
        await q("rollback to savepoint rerun");
      }
      check(name, "36", "pre-state refuses a second apply", rerun, "a function this migration creates already exists");
    }
  } finally {
    await q("rollback");
  }
}

const live0 = await liveSnapshot();
try {
  if (APPLIED) {
    await phase("after", false);
  } else {
    await phase("before", false);
    await phase("after", true);
  }
} catch (e) {
  failures++;
  console.error("PROBE ERROR", e.message);
  await q("rollback").catch(() => {});
} finally {
  const live1 = await liveSnapshot();
  const same = JSON.stringify(live0) === JSON.stringify(live1);
  console.log(`${same ? "ok  " : "FAIL"} live unchanged after both phases: ${JSON.stringify(live1)}`);
  if (!same) failures++;
  await client.end();
  console.log(failures === 0 ? "ALL EXPECTS MET" : `${failures} EXPECT(S) NOT MET`);
  process.exitCode = failures === 0 ? 0 : 1;
}
```
