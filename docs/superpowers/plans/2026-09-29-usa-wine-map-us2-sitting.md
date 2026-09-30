# USA on the wine map, phase US-2: the sitting runbook

Written by Task 16 of `docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md`, from that plan's
"Ship instructions for the sitting", and revised by the review round of 2026-09-30 (spec §25). Where
the two differ, this runbook is the one to follow. The lines in *italics* are the numbers the
rolled-back rehearsal of 2026-09-30 measured (`data/wine-map/review/usa-us2-rehearsal.json`), added
after the step they belong to.

`$APPLIER` is the owner's migration applier:
`C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`.
It records each file's version and refuses a version already recorded, so it is only for the four
files under `supabase/migrations/`.

`$ROLLBACK` is `scripts/usa-map/apply-rollback.mjs`, the runner for the three rollback files. It
takes the same `--check` / `--dry` / no-flag steps, prints the NOTICEs, runs the file in one
transaction and records **no** history row. A rollback can therefore be run again (a second unstage
after a re-stage), and none leaves a remote-only version behind (§17.1). Never apply a rollback file
with `$APPLIER`: it refuses them anyway (no 14-digit version).

Run every command from the repository root (both load `scripts/migration-preflight.mjs` from the
cwd). The activity check is `node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

## Measured in the rehearsal (2026-09-30, one transaction, rolled back)

| Step | Seconds | Note |
|---|---|---|
| Catalog | 63.4 | refresh 15217 rows in 63.3 s |
| Knowledge | 0.2 | no `wine_places` write, no refresh |
| Stage (`stageWave`) | 5.7 | 16 DRAFT boundaries |
| Unstage drill | 70.9 | refresh 70.8 s |
| Re-stage (drill) | 5.8 | snapshots reused |
| Second unstage (drill) | 64.5 | refresh 64.2 s; nothing recorded, so a second run works |
| Remove drill | 63.7 | refresh 63.3 s |
| Catalog re-applied after the remove (drill) | 64.1 | with its refresh |
| Knowledge re-applied after the remove (drill) | 0.4 | over the kept Petite Sirah row |
| Promote | 65.1 | refresh 15232 rows in 64.2 s |
| Archetype links | 0.2 | no refresh |
| Unpublish drill | 64.3 | refresh 64.1 s |
| Whole rehearsal | 473.4 |  |

Shard GeoJSON bytes (a proxy for the archive sizes checked at step 9): california 248,826 B, new-york 175,000 B, oregon 482,580 B, washington 261,045 B.

## Ship instructions

**Release captain:** the main session, alone, for the whole window. The friend (GitHub Birchenz) is told the time 24 hours ahead, and again at the start. They run no catalogue batch and dispatch no tiles run from the start message until the "done" message. The window is about 30–45 minutes.

**Before the sitting (separate days are fine):**

1. **Owner.** The owner reads `data/wine-map/review/usa-us2-knowledge.md`, answers OK or gives corrections, and answers its five questions. Two of them were added by the review round: whether each place's split into signature grapes and "accessory" grapes is right, and whether the Napa Cabernet and the Sonoma Chardonnay are linked to North Coast at the sitting or only in US-3 (the file's "Typical wines on the training-room map" section shows how far the dots move). Record that last answer next to step 11 below.
   - Apply any corrections to the data file.
   - Set `_provenance.owner_approval` to `{"answer":"OK","date":"YYYY-MM-DD"}` and `status` to `"APPROVED"`.
   - Re-render the review file (`node scripts/usa-map/render-usa-us2-review.mjs`). It is rendered from the pre-sitting evidence, `usa-us2-rehearsal.json`, which nothing on the sitting day rewrites.
   - If the copy, a role or a style changed: once the catalog is live (step 4), regenerate the knowledge migration without `--prelude` (same version and name), and re-run `node --test scripts/usa-map/usa-knowledge.test.mjs`. That test compares every article string, each style at its position and each grape with its role, so a stale file fails it.
2. **Friend (hard gate, §17.2).** Confirm in writing that their working branch contains the US-0 merge (`7526963` or later master). Show them the `--prelude` flag, the article-text change and the grape `role` in `gen-place-profiles-migration.mjs` (default output unchanged; `--bare` output inserts a new grape with `on conflict (name) do nothing`).
3. **Merge `usa-map` to master.** Rebase onto master first. This is a staged push per memory; the only runtime-adjacent change is a vitest file. Master's checks must be green.
4. **Catalog, at a quiet hour with the friend quiet.**
   - Run the activity check (Task 2 Step 5).
   - `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930084747_usa_us2_catalog.sql --check`, then `--dry`, then no flag. Expected: `APPLIED`, and the refresh notice under 300 s.
   - *Rehearsal: the catalog took 63.4 s, its refresh 15217 rows in 63.3 s. The applier drops NOTICEs: add `--import ./scripts/usa-map/print-notices.mjs` after `--env-file=.env.local` to see the refresh line. The activity check's `active`, `writers` and `building` must all be empty.*
   - Then `node --env-file=.env.local scripts/usa-map/check-us2-live.mjs`. Expected: 16 DRAFT places, cache fresh.
5. **Knowledge**, only after the owner's OK: `--check`, `--dry`, then apply `supabase/migrations/20260930094747_usa_us2_knowledge.sql`. It writes no `wine_places` row, so it needs no refresh and no tiles run.

**The sitting, in order:**

1. **Announce the start** to the friend. Wait for their "quiet". Note the ACTIVE release version (for reference only; the manifest is never rolled back).
2. `git pull`. Then `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs`, which must be green.
3. **Rehearse.** `node --env-file=.env.local scripts/usa-map/rehearse-us2.mjs --sitting` → `REHEARSAL OK`. With the catalog and knowledge live, it applies only the stage, the promote and the links in-transaction (plus the drills).
   - `--sitting` writes `data/wine-map/review/usa-us2-rehearsal-sitting.json` and nothing else. It never touches `usa-us2-rehearsal.json` or `usa-us2-expected-boundaries.json`, so the owner-approved review file (rendered from the first) and its test stay as they are. Commit the sitting file on its own after the sitting (step 12).
   - It fails (`REHEARSAL FAILED: the expected boundaries differ …`) unless the boundaries it stages equal the committed `usa-us2-expected-boundaries.json` byte for byte, which steps 7 and 8 check live against. If it fails, stop the sitting.
   - *Rehearsal (with nothing live): 473.4 s in all, 7 in-transaction refreshes of 63.3-70.8 s each. With the catalog live it is about a minute shorter (the catalog's own refresh).*
4. **Stage, dry.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2` → `DONE (dry): 16 boundaries …`.
5. **Stage, for real.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage`. Expected:
   - `RAW upload|skip` for the four UC Davis files under `storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/`;
   - `STAGE COMPLETE: 16 DRAFT boundaries committed`;
   - *Rehearsal: the stage itself took 5.7 s (16 boundaries; Long Island's share 0.99995, every other AVA-based share 1; every drift <= 0.00023).*
   - the stale-cache banner.

   From here until step 6, master's map-data job and `wine-place-context.test.mjs` are red for both people (§12). Keep the gap to minutes.
6. **Promote.** `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930104747_usa_us2_promote.sql --check`, then `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice.
   *Rehearsal: the promote took 65.1 s, its refresh 15232 rows in 64.2 s (limit 300 s). Refusal A (the promote before the stage) and refusal E (remove after the promote) both matched.*
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
   - Commit ("data(wine-map): pin the US-2 boundaries (united-states hunk only)"), and push master as a staged push. From here, an unpublish must take this hunk back out (rollback table).
9. **Tiles.** Run `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, then `gh run watch`. The log's "Release version" must be a release this run built.
   - Check that the release is ACTIVE.
   - Fetch the manifest (`…/wine-map-tiles/tiles/manifest.json`) and check: `california` ≤ 3 MB; `washington`, `oregon` and `new-york` ≤ 1.5 MB each; world ≤ 400 KB (§13.2). The states now reach the world archive from its z1 tiles (min_zoom 1.5), so check world's size in particular.
   - *Rehearsal preview (GeoJSON of the places, a proxy, not the archive): california 248,826 B, new-york 175,000 B, oregon 482,580 B, washington 261,045 B; each shard max zoom 7; the ten outline places as planned; no label outside its country's box.*
   - If a target is exceeded, the fix is a higher simplification tolerance for the largest shapes: a new DRAFT boundary cycle, not a code change. Leave the release in place and plan it.
10. **Map checks** on production, on desktop, iPhone Chrome and iPhone Safari:
    - the "United States" chip is reachable in the chip row and frames California to New York;
    - on the phone, where the chip lands at about z1.9, the four states show as coloured washes with their labels (not one grey country wash), and tapping a state selects it and drills in;
    - the states are coloured, in light and dark mode;
    - the umbrella AVAs and Central Valley draw as outlines, and Long Island fills;
    - Central Valley's article says it is a grouping;
    - there is no empty "Classification" legend heading;
    - the california shard loads on a throttled 4G profile;
    - tapping open Central Coast land selects Central Coast;
    - the North Coast and Central Coast child pills are usable at 375 px;
    - long names and breadcrumbs wrap or truncate at 375 px;
    - a place's Grapes section lists its signature grapes first and tags the rest "accessory".
11. **Archetype links**, as the owner answered before the sitting (Before the sitting, step 1). Owner's answer: ________ (date ________). If the answer was to wait for US-3, skip this step: nothing else depends on it, R2's hand-placed dots stay, and US-3 ships the links. Otherwise: `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930114747_usa_archetype_links_1.sql --check`, `--dry`, then apply. Then:
    - `node --env-file=.env.local --test scripts/training-room.test.mjs` → green, on the linked Napa branch;
    - *R2's display points: the links clear the three US wines' curated points (the room's R2 check in `training-room.test.mjs` on master expects 15 points and none on a placed wine; before the links it reads 18). The unpublish file restores them. Rehearsal: after the links 15 points, 0 on a placed wine; after the unpublish drill 18.*
    - *Where the dots go (rehearsal): A typical Napa Cabernet Sauvignon: -122.4, 38.43 → -122.974, 38.762 (62 km); A typical Sonoma Chardonnay: -122.82, 38.4 → -122.974, 38.762 (42 km); A typical Willamette Pinot Noir: -123.03, 45.28 → -123.143, 44.672 (68 km).*
    - `check-us2-live.mjs` again → the archetype section is OK;
    - on the map, "Typical wine" lists Napa and Sonoma on North Coast (and California's page), and Willamette on Willamette Valley (and Oregon's).
12. **Tell the friend it is done.** The promote ran the one refresh. Nothing else refreshes. Then commit `data/wine-map/review/usa-us2-rehearsal-sitting.json` on its own ("data(wine-map): the US-2 sitting rehearsal").

**Rollback at each point.** Every rollback file runs through `$ROLLBACK` (`--check`, `--dry`, then no flag), never `$APPLIER`. None is recorded, so any of them can be run again whenever its pre-state holds; a run in the wrong state refuses and rolls back.

| Failure | Action |
|---|---|
| Step 5 fails | Nothing is committed: one transaction. Uploaded raw objects are harmless, identical bytes. Fix, then resume at step 4. |
| Step 6 dry run or apply fails (DRAFT boundaries are live) | `node --env-file=.env.local scripts/usa-map/apply-rollback.mjs scripts/usa-map/usa_us2_unstage.sql --check`, then `--dry`, then no flag. That removes the DRAFT boundaries and refreshes, and master goes green again. Investigate, then re-sit from step 3. If the promote fails again at the re-sit, run the same unstage again: it records nothing, so a second (or third) run works exactly like the first. *Rehearsal: unstage, re-stage and a second unstage: 70.9 s, 5.8 s and 64.5 s, each unstage leaving 0 US boundaries, 16 DRAFT places and a fresh cache.* |
| The wave must be abandoned before the promote | `$ROLLBACK scripts/usa-map/usa_us2_remove.sql` (`--check`, `--dry`, no flag). It deletes the places, the knowledge and the catalog and knowledge history rows, and refreshes. It keeps the Petite Sirah grape and the source snapshots. To try again later, apply the catalog and then the knowledge migration as committed, with `$APPLIER`: the knowledge file inserts Petite Sirah with `on conflict (name) do nothing`, so it applies over the kept row. *Rehearsal: remove, then the catalog and the knowledge re-applied on top: 16 DRAFT places, 1 Petite Sirah row, 16 articles, 95 grape links.* |
| After the promote (keys are locked for good) | Roll forward: `$ROLLBACK scripts/usa-map/usa_us2_unpublish.sql` (`--check`, `--dry`, no flag). It clears the archetype links first (restoring R2's points), flips to DRAFT and non-current, and refreshes. Then, if step 8 already committed the united-states hunk: `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --write` (no `--check`: with no US boundary current it drops the hunk); `git diff` must show only removed `united-states.*` rows; `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green; commit ("data(wine-map): unpin the US-2 boundaries after the unpublish") and push master as a staged push. Skipping this leaves `boundary-expectations.test.mjs` red on every PR, the friend's included. Then dispatch a new tiles release from master with `promote=true`. **Never roll back the manifest**: that removes the friend's newer places (§17.3). The unpublish records nothing, so after a later re-promote (a new forward migration) it can run again. |
| Tiles run fails | Its release is FAILED and never promoted, and the old ACTIVE release stays. Meanwhile the US places are VERIFIED, so the text tree shows them without shapes. Fix and re-dispatch, or unpublish if the fix is not quick. |
| Archetype links wrong | A forward data migration re-points them. The unpublish file also clears them. |
