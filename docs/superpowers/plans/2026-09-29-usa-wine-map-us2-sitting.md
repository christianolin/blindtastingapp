# USA on the wine map, phase US-2: the sitting runbook

Written by Task 16 of `docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md`. The section below
is that plan's "Ship instructions for the sitting", copied verbatim; the lines in *italics* are the
numbers the rolled-back rehearsal of 2026-09-30 measured
(`data/wine-map/review/usa-us2-rehearsal.json`), added after the step they belong to.

`$APPLIER` is the owner's applier:
`C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`.
Run every command from the repository root (it loads `scripts/migration-preflight.mjs` from the
cwd). The activity check is `node scripts/usa-map/activity-check.mjs`.

## Measured in the rehearsal (2026-09-30, one transaction, rolled back)

| Step | Seconds | Note |
|---|---|---|
| Catalog | 65.8 | refresh 15,217 rows in 65.6 s |
| Knowledge | 0.2 | no `wine_places` write, no refresh |
| Stage (`stageWave`) | 5.0 | 16 DRAFT boundaries |
| Promote | 73.1 | refresh 15,232 rows in 71.8 s |
| Archetype links | 0.2 | no refresh |
| Unstage drill | 64.0 | refresh 63.9 s |
| Remove drill | 66.4 | refresh 66.2 s |
| Unpublish drill | 64.4 | refresh 64.2 s |
| Whole rehearsal | 344 | |

Shard GeoJSON bytes (a proxy for the archive sizes checked at step 9): california 248,822;
new-york 174,996; oregon 482,576; washington 261,041.

## Ship instructions

**Release captain:** the main session, alone, for the whole window. The friend (GitHub Birchenz) is told the time 24 hours ahead, and again at the start. They run no catalogue batch and dispatch no tiles run from the start message until the "done" message. The window is about 30–45 minutes.

**Before the sitting (separate days are fine):**

1. **Owner.** The owner reads `data/wine-map/review/usa-us2-knowledge.md`, answers OK or gives corrections, and answers the three questions.
   - Apply any corrections to the data file.
   - Set `_provenance.owner_approval` to `{"answer":"OK","date":"YYYY-MM-DD"}` and `status` to `"APPROVED"`.
   - Re-render the review file.
   - If the copy changed: once the catalog is live (step 4), regenerate the knowledge migration without `--prelude` (same version and name), and re-run `node --test scripts/usa-map/usa-knowledge.test.mjs`.
2. **Friend (hard gate, §17.2).** Confirm in writing that their working branch contains the US-0 merge (`7526963` or later master). Show them the `--prelude` flag and the article-text change in `gen-place-profiles-migration.mjs`.
3. **Merge `usa-map` to master.** Rebase onto master first. This is a staged push per memory; the only runtime-adjacent change is a vitest file. Master's checks must be green.
4. **Catalog, at a quiet hour with the friend quiet.**
   - Run the activity check (Task 2 Step 5).
   - `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930084747_usa_us2_catalog.sql --check`, then `--dry`, then no flag. Expected: `APPLIED`, and the refresh notice under 300 s.
   - *Rehearsal (2026-09-30): the catalog took 65.8 s, its refresh 15,217 rows in 65.6 s (the 2026-09-29 `--dry`: 64.3 s). The applier drops NOTICEs: add `--import ./scripts/usa-map/print-notices.mjs` after `--env-file=.env.local` to see the refresh line. The activity check's `active`, `writers` and `building` must all be empty.*
   - Then `node --env-file=.env.local scripts/usa-map/check-us2-live.mjs`. Expected: 16 DRAFT places, cache fresh.
5. **Knowledge**, only after the owner's OK: `--check`, `--dry`, then apply `supabase/migrations/20260930094747_usa_us2_knowledge.sql`. It writes no `wine_places` row, so it needs no refresh and no tiles run.

**The sitting, in order:**

1. **Announce the start** to the friend. Wait for their "quiet". Note the ACTIVE release version (for reference only; the manifest is never rolled back).
2. `git pull`. Then `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs`, which must be green.
3. **Rehearse.** `node --env-file=.env.local scripts/usa-map/rehearse-us2.mjs` → `REHEARSAL OK`. With the catalog and knowledge live, it applies only the stage, the promote and the links in-transaction.
   *Rehearsal (2026-09-30, with nothing live): 344 s in all, five in-transaction refreshes of about 64-72 s each. With the catalog live it is about 70 s shorter. It writes the two evidence files again: commit them only if they changed.*
4. **Stage, dry.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2` → `DONE (dry): 16 boundaries …`.
5. **Stage, for real.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage`. Expected:
   - `RAW upload|skip` for the four UC Davis files under `storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/`;
   - `STAGE COMPLETE: 16 DRAFT boundaries committed`;
   - *Rehearsal: the stage itself took 5 s (16 boundaries; Long Island's share 0.99995, every other AVA-based share 1; every drift <= 0.00023).*
   - the stale-cache banner.

   From here until step 6, master's map-data job and `wine-place-context.test.mjs` are red for both people (§12). Keep the gap to minutes.
6. **Promote.** `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930104747_usa_us2_promote.sql --check`, then `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice.
   *Rehearsal: the promote took 73.1 s, its refresh 15,232 rows in 71.8 s (limit 300 s). Refusal A (the promote before the stage) and refusal E (remove after the promote) both matched.*
7. **Check.** `node --env-file=.env.local scripts/usa-map/check-us2-live.mjs` → `US-2 LIVE CHECK OK`. That covers:
   - 16 VERIFIED, 16 current VALIDATED, 1 relationship;
   - `fresh = true`;
   - an article, grapes and styles for the country and each state;
   - the shortlists sourced from the map;
   - the expected-boundaries hunk equal to the committed one.
8. **Tests and the expectations hunk.**
   - `node --env-file=.env.local --test scripts/wine-place-context.test.mjs` → green.
   - `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --check data/wine-map/review/usa-us2-expected-boundaries.json --write` writes `data/wine-map/boundary-expectations.json`.
   - `git diff --stat` must show only added `united-states.*` rows. Report any other-country difference to the friend; never commit it.
   - `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green.
   - Commit ("data(wine-map): pin the US-2 boundaries (united-states hunk only)"), and push master as a staged push.
9. **Tiles.** Run `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, then `gh run watch`. The log's "Release version" must be a release this run built.
   - Check that the release is ACTIVE.
   - Fetch the manifest (`…/wine-map-tiles/tiles/manifest.json`) and check: `california` ≤ 3 MB; `washington`, `oregon` and `new-york` ≤ 1.5 MB each; world ≤ 400 KB (§13.2).
   - *Rehearsal preview (GeoJSON of the places, a proxy, not the archive): california 248,822 B, new-york 174,996 B, oregon 482,576 B, washington 261,041 B; each shard max zoom 7; the ten outline places as planned; no label outside its country's box.*
   - If a target is exceeded, the fix is a higher simplification tolerance for the largest shapes: a new DRAFT boundary cycle, not a code change. Leave the release in place and plan it.
10. **Map checks** on production, on desktop, iPhone Chrome and iPhone Safari:
    - the "United States" chip is reachable in the chip row and frames California to New York;
    - the states are coloured, in light and dark mode;
    - the umbrella AVAs and Central Valley draw as outlines, and Long Island fills;
    - Central Valley's article says it is a grouping;
    - there is no empty "Classification" legend heading;
    - the california shard loads on a throttled 4G profile;
    - tapping open Central Coast land selects Central Coast;
    - the North Coast and Central Coast child pills are usable at 375 px;
    - long names and breadcrumbs wrap or truncate at 375 px.
11. **Archetype links.** `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930114747_usa_archetype_links_1.sql --check`, `--dry`, then apply. Then:
    - `node --env-file=.env.local --test scripts/training-room.test.mjs` → green, on the linked Napa branch;
    - *R2's display points: the links clear the three US wines' curated points (the room's R2 check in `training-room.test.mjs` on master expects 15 points and none on a placed wine; before the links it reads 18). The unpublish file restores them. Rehearsal: after the links 15 points, 0 on a placed wine; after the unpublish drill 18.*
    - `check-us2-live.mjs` again → the archetype section is OK;
    - on the map, "Typical wine" lists Napa and Sonoma on North Coast (and California's page), and Willamette on Willamette Valley (and Oregon's).
12. **Tell the friend it is done.** The promote ran the one refresh. Nothing else refreshes.

**Rollback at each point:**

| Failure | Action |
|---|---|
| Step 5 fails | Nothing is committed: one transaction. Uploaded raw objects are harmless, identical bytes. Fix, then resume at step 4. |
| Step 6 dry run or apply fails (DRAFT boundaries are live) | `--check`/`--dry`/apply `scripts/usa-map/20260930124747_usa_us2_unstage.sql`. That removes the DRAFT boundaries and refreshes, and master goes green again. Investigate, then re-sit. |
| The wave must be abandoned before the promote | Apply `scripts/usa-map/20260930134747_usa_us2_remove.sql`. It deletes the places, knowledge and history rows, and refreshes. |
| After the promote (keys are locked for good) | Roll forward: apply `scripts/usa-map/20260930144747_usa_us2_unpublish.sql` (it clears archetype links first, flips to DRAFT and non-current, and refreshes). Then dispatch a new tiles release from master with `promote=true`. **Never roll back the manifest**: that removes the friend's newer places (§17.3). |
| Tiles run fails | Its release is FAILED and never promoted, and the old ACTIVE release stays. Meanwhile the US places are VERIFIED, so the text tree shows them without shapes. Fix and re-dispatch, or unpublish if the fix is not quick. |
| Archetype links wrong | A forward data migration re-points them. The unpublish file also clears them. |
