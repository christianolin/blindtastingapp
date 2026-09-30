# USA on the wine map, phase US-3 core batch (86 California AVAs): the sitting runbook

Written by Task 25 of `docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md`, from that plan's
"Ship instructions: the core sitting", verbatim. The lines in *italics* are the numbers the
rolled-back rehearsal of 2026-09-30 measured (`data/wine-map/review/usa-us3-core-rehearsal.json`),
added after the step they belong to.

`$APPLIER` is the owner's migration applier:
`C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`.
It records each file's version and refuses a version already recorded, so it is only for the
files under `supabase/migrations/`.

`$ROLLBACK` is `scripts/usa-map/apply-rollback.mjs`, the runner for the rollback files. It
takes the same `--check` / `--dry` / no-flag steps, prints the NOTICEs, runs the file in one
transaction and records **no** history row. A rollback can therefore be run again (a second unstage
after a re-stage), and none leaves a remote-only version behind (§17.1). Never apply a rollback file
with `$APPLIER`: it refuses them anyway (no 14-digit version).

Run every command from the repository root. The activity check is
`node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

**Tell the friend at the start announcement** (§17.6): `gen-place-profiles-migration.mjs --prelude`
may now repeat (default output unchanged), and `usa-stage-lib.mjs`'s gate field `usBoundaries` is
now `waveBoundaries`.

## Ship instructions

**Release captain:** the main session, alone, for the whole window (about 30–45 minutes). Tell the friend (GitHub Birchenz) the time ahead and at the start; they run no catalogue batch and dispatch no tiles run until "done". `$APPLIER` records a version and refuses one already recorded; `$ROLLBACK` (`scripts/usa-map/apply-rollback.mjs`) records nothing. Run every command from the repository root. Activity check: `node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

**Before the sitting (separate days are fine):**

1. **Merge `usa-map` to master**, rebased, as a staged push. The runtime-adjacent changes are none (scripts, data, migrations not applied). Master's checks must be green. Tell the friend: `gen-place-profiles-migration.mjs --prelude` may now repeat (default output unchanged), and `usa-stage-lib.mjs`'s gate field `usBoundaries` is now `waveBoundaries`.
2. **Catalog, at a quiet hour.** Activity check; then `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930154747_usa_us3_core_catalog.sql --check`, `--dry`, then no flag. Expected `APPLIED`, and the refresh notice under 300 s. Then `node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core` → 86 DRAFT places, cache fresh.
   - *Rehearsal: the catalog took 65.9 s, its refresh 15232 rows in 65.7 s. The --dry run of 2026-09-30 took 67.5 s (refresh 15232 rows in 67.0 s). The applier drops NOTICEs unless print-notices.mjs is imported, as shown.*
3. **Knowledge:** `--check`, `--dry`, then apply `supabase/migrations/20260930164747_usa_us3_core_knowledge.sql` (no `wine_places` write, no refresh, no tiles).
   - *Rehearsal: 0.3 s; 164 style rows, 417 grape rows, 86 articles, no new grape.*

**The sitting, in order:**

1. Announce the start; wait for the friend's "quiet". Note the ACTIVE release (reference only).
2. `git pull`; `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs` → green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch core --sitting` → `REHEARSAL OK`. It writes only `usa-us3-core-rehearsal-sitting.json` and fails unless the boundaries it stages equal the committed `usa-us3-core-expected-boundaries.json` byte for byte. If it fails, stop.
   - *Pre-sitting rehearsal of 2026-09-30: REHEARSAL OK in 595.5 s (about 10 minutes, holding the neighbour-cache lock); every refresh between 64.5 and 69.9 s.*
4. **Stage, dry:** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us3-core` → `DONE (dry): 86 boundaries …`.
   - *The dry run of 2026-09-30 built and asserted all 86 and persisted nothing. Lowest parent shares: central-coast.santa-ynez-valley.sta-rita-hills 0.956965, central-coast.san-francisco-bay 0.966103, north-coast.sonoma-valley.bennett-valley 0.972982, central-coast.paso-robles.templeton-gap-district 0.982184, north-coast.northern-sonoma.alexander-valley 0.985012 (legal record, threshold 0.90); on the measured basis Santa Ynez Valley 0.995092 (threshold 0.995). Highest drift: north-coast.napa-valley.chiles-valley 0.00207, north-coast.mendocino-ridge 0.00206.*
5. **Gate:** `… --wave us3-core --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us3-core --stage`. Expected: `RAW skip storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/CA_avas.geojson` (uploaded at US-2), `STAGE COMPLETE: 86 DRAFT boundaries committed for us3-core`, and the stale-cache banner. From here until step 7 master's map-data job is red for both people: keep the gap to minutes.
   - *Rehearsal: stageWave took 21.1 s for the 86 boundaries.*
7. **Promote:** `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930174747_usa_us3_core_promote.sql --check`, `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice.
   - *Rehearsal: the promote took 66.8 s, its refresh 15566 rows in 65.2 s.*
8. **Check:** `node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core` → `US-3 core LIVE CHECK OK` (86 VERIFIED/locked/current, 92 live California places, 24 relationships, 11 outlines, fresh; articles, grapes and styles everywhere; children counts; the six named edges; Oakville, Rutherford, Stags Leap District and Los Carneros resolve to themselves; the boundary hunk equals the committed file).
   - *Rehearsal: 86/86/86/86 and 0 DRAFT, 92 live California places, 24 relationships, 11 outlines, cache fresh; the four clicks resolve to themselves.*
9. **Tests and the expectations hunk:** `node --env-file=.env.local --test scripts/wine-place-context.test.mjs` → green; `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --check data/wine-map/review/usa-us3-core-expected-boundaries.json --write`; `git diff --stat` shows only 86 added `united-states.california.*` rows (report any other country's difference to the friend, never commit it); `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green; commit "data(wine-map): pin the US-3 core boundaries (united-states hunk only)" and push master as a staged push.
10. **Tiles:** `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, `gh run watch`; the release is ACTIVE; the manifest's `california` ≤ 3 MB, world ≤ 400 KB (§13.2). If `california` exceeds 3 MB, leave the release in place and plan a new DRAFT boundary cycle with a higher tolerance for the largest shapes (not a code change).
   - *Rehearsal preview: the California shard holds 92 keys at max zoom 12, 1,411,354 bytes of GeoJSON (a proxy, not the archive size).*
11. **Map checks** on desktop, iPhone Chrome and iPhone Safari: clicking or tapping Oakville selects Oakville, not Napa Valley or North Coast; Russian River Valley's breadcrumb reads North Coast › Northern Sonoma; "… › Russian River Valley › Green Valley of Russian River Valley" wraps cleanly at 375 px; San Francisco Bay draws as an outline and Napa's sub-AVAs fill; each place's panel shows an article, grapes (signature first, the rest tagged "accessory") and styles; the nearby chips for the eight §8.7 keys match the rehearsal's `nearby` (accept them, or add the function change to §20); dark mode.
12. **Archetype links step 2:** `"$APPLIER" supabase/migrations/20260930184747_usa_archetype_links_2.sql --check`, `--dry`, then apply. Then `node --env-file=.env.local --test scripts/training-room.test.mjs` → green (Napa on Napa Valley); `check-us3-live.mjs --batch core` → OK including the archetype section; on the map "Typical wine" lists the Napa Cabernet Sauvignon on Napa Valley (and North Coast, California) and the Sonoma Chardonnay on Sonoma Coast and Russian River Valley (and North Coast, California).
   - *Rehearsal: links 0.2 s; A typical Napa Cabernet Sauvignon moves 66 km, to -122.314, 38.461; A typical Sonoma Chardonnay moves 36 km, to -122.915, 38.446. A second run refuses (pre-state is not step 1).*
13. Tell the friend it is done. Commit `data/wine-map/review/usa-us3-core-rehearsal-sitting.json` on its own ("data(wine-map): the US-3 core sitting rehearsal").

**Rollback at each point** (every rollback file through `$ROLLBACK` with `--check`, `--dry`, then no flag):

| Failure | Action |
|---|---|
| Step 6 fails | Nothing is committed (one transaction). Fix, resume at step 4. |
| Step 7 fails (DRAFT boundaries live) | `$ROLLBACK scripts/usa-map/usa_us3_core_unstage.sql`: removes the 86 DRAFT boundaries and refreshes; master goes green. Investigate, then re-sit from step 3. It records nothing, so it can run again after a re-stage. |
| Abandon the batch before the promote | `$ROLLBACK scripts/usa-map/usa_us3_core_remove.sql` (refuses while any rest place exists: remove the rest batch first). Deletes the 86 places, their knowledge and the two history rows; refreshes. To retry, apply the catalog and knowledge again as committed. |
| After the promote | Roll forward: `$ROLLBACK scripts/usa-map/usa_us3_core_unpublish.sql` (refuses while a rest place is live: unpublish the rest batch first). It puts the archetype links back to step 1, flips the 86 places to DRAFT and their boundaries non-current, refreshes. Then `splice-boundary-expectations.mjs --write` (without `--check`: it keeps only current US rows), `git diff` shows only removed `united-states.california.*` rows, `boundary-expectations.test.mjs` green, commit and staged push; then a new tiles release with `promote=true`. **Never roll back the manifest.** |
| Tiles run fails | The release is FAILED, the old one stays ACTIVE; the places show in the text tree without shapes. Fix and re-dispatch, or unpublish. |
| Archetype links wrong | A forward data migration re-points them; the core unpublish also puts step 1 back. |
