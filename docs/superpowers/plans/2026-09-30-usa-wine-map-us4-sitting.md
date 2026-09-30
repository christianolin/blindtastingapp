# USA on the wine map, phase US-4 (42 Washington, Oregon and New York AVAs): the sitting runbook

Written by Task 16 of `docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md`, from that plan's
"Ship instructions: the US-4 sitting", verbatim. The lines in *italics* are the numbers the
rolled-back rehearsal of 2026-09-30 measured (`data/wine-map/review/usa-us4-rehearsal.json`),
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

US-4 needs only US-2 live (its promote `20260930104747`), which it is; it does not depend on US-3
and reads no California key. The versions are `20260930224747` (catalog), `20260930234747`
(knowledge) and `20261001004747` (promote); if a newer live version exists on the apply day,
change `US4_VERSIONS` in `scripts/usa-map/us4-wave.mjs` and re-render
(`node scripts/usa-map/render-us4-sql.mjs`, then regenerate the knowledge migration).

## Ship instructions

**Release captain:** the main session, alone, for the whole window (about 30–40 minutes). Tell the friend (GitHub Birchenz) the time ahead and at the start; they run no catalogue batch and dispatch no tiles run until "done". `$APPLIER` records a version and refuses one already recorded; `$ROLLBACK` (`scripts/usa-map/apply-rollback.mjs`) records nothing. Run every command from the repository root. Activity check: `node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

**Before the sitting (separate days are fine):**

1. **Merge `usa-map` to master**, rebased, as a staged push. The runtime-adjacent changes are none (scripts, data, migrations not applied). Master's checks must be green. Tell the friend: `usa-stage-lib.mjs`'s `stageWave` now takes a list of scope keys (`scopesOf`); `usa-tree-config.json` gained a Candy Mountain override and a Candy Mountain / Goose Gap exclusion (Washington only).
2. **Catalog, at a quiet hour.** Activity check; then `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930224747_usa_us4_catalog.sql --check`, `--dry`, then no flag. Expected `APPLIED`, and the refresh notice under 300 s. Then `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs` → 42 DRAFT places, cache fresh.
   - *Rehearsal: the catalog took 67.3 s, its refresh 15711 rows in 67.2 s (the pre-sitting `--dry` of 2026-09-30: 15711 rows in 69.8 s).*
3. **Knowledge:** `--check`, `--dry`, then apply `supabase/migrations/20260930234747_usa_us4_knowledge.sql` (no `wine_places` write, no refresh, no tiles). From here the six new grapes (Marquette, Frontenac, La Crescent, Seyval Blanc, Vidal Blanc, Baco Noir) are in every grape picker; the places stay invisible until the promote.
   - *Rehearsal: 0.2 s; 81 style rows, 173 grape rows, 42 articles, 6 new grapes.*

**The sitting, in order:**

1. Announce the start; wait for the friend's "quiet". Note the ACTIVE release (reference only).
2. `git pull`; `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs` → green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us4.mjs --sitting` → `REHEARSAL OK`. It writes only `usa-us4-rehearsal-sitting.json` and fails unless the boundaries it stages equal the committed `usa-us4-expected-boundaries.json` byte for byte. If it fails, stop.
   - *Pre-sitting rehearsal of 2026-09-30: REHEARSAL OK in 543.2 s (seven in-transaction refreshes of 66–73 s each).*
4. **Stage, dry:** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us4` → `DONE (dry): 42 boundaries …`.
   - *The pre-sitting dry run took 98 s wall (catalog and knowledge applied in-transaction); lowest state share 0.99965 (North Fork of Long Island), highest drift 0.00122 (Snipes Mountain), lowest measured-basis parent 0.995035 (Red Mountain), lowest legal-record parent 0.957193 (Lake Chelan), Candy Mountain override 0.893096 against its floor 0.883.*
5. **Gate:** `… --wave us4 --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us4 --stage`. Expected: `RAW skip storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/NY_avas.geojson`, the same for `OR_avas.geojson` and `WA_avas.geojson` (uploaded at US-2), `STAGE COMPLETE: 42 DRAFT boundaries committed for us4`, and the stale-cache banner. From here until step 7 master's map-data job is red for both people: keep the gap to minutes.
   - *Rehearsal: the stage itself took 23 s.*
7. **Promote:** `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20261001004747_usa_us4_promote.sql --check`, `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice and the two state-share NOTICEs.
   - *Rehearsal: 67.5 s; refresh 15783 rows in 66.1 s; state shares Columbia Gorge in Washington 0.3479 (tree 0.348), Walla Walla Valley in Oregon 0.3102 (tree 0.3101).*
8. **Check:** `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs` → `US-4 LIVE CHECK OK` (42 VERIFIED/locked/current; New York 11, Oregon 21, Washington 19 live places; 5 relationships under the three states; 12 US outlines; one place each for Columbia Valley, Walla Walla Valley and Columbia Gorge; nothing deferred or under another state; articles, grapes and styles everywhere; children counts; the five edges; the eight click keys resolve to themselves; the three shortlists lead with Cabernet Sauvignon, Pinot Noir and Riesling; the Willamette wine unchanged; the boundary hunk equals the committed file).
9. **Tests and the expectations hunk:** `node --env-file=.env.local --test scripts/wine-place-context.test.mjs` → green; `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --check data/wine-map/review/usa-us4-expected-boundaries.json --write`; `git diff --stat` shows only 42 added `united-states.{washington,oregon,new-york}.*` rows (report any other country's difference to the friend, never commit it); `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green; commit "data(wine-map): pin the US-4 boundaries (united-states hunk only)" and push master as a staged push.
10. **Tiles:** `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, `gh run watch`; the release is ACTIVE; the manifest's `washington`, `oregon` and `new-york` are each ≤ 1.5 MB, `california` unchanged, world ≤ 400 KB (§13.2). If a shard exceeds its target, leave the release in place and plan a new DRAFT boundary cycle with a higher tolerance for the largest shapes (not a code change).
   - *Rehearsal export preview (GeoJSON byte proxies): washington 489,416 B (19 keys, z11), oregon 925,664 B (21 keys, z11), new-york 331,401 B (11 keys, z9); california 156 keys, z12, unchanged; 12 US outlines.*
11. **Map checks** on desktop, iPhone Chrome and iPhone Safari:
    - Washington: Columbia Valley's child pills (11) are usable at 375 px; Red Mountain, Snipes Mountain and Candy Mountain (about 3.7 km²) are selectable by tap at phone zoom; Candy Mountain's breadcrumb reads United States › Washington › Columbia Valley › Yakima Valley › Candy Mountain; Walla Walla Valley fills across the state line into Oregon.
    - The Rocks District of Milton-Freewater: a tap at Milton-Freewater, with both the Washington and Oregon shards on screen, selects The Rocks District, not Walla Walla Valley; its breadcrumb reads United States › Oregon › The Rocks District of Milton-Freewater; its panel says it lies within Walla Walla Valley and Columbia Valley.
    - Oregon: Columbia Gorge draws on both banks of the river; "Mount Pisgah, Polk County, Oregon" wraps cleanly at 375 px in the panel title, the breadcrumb and the Willamette Valley child pills (9); Dundee Hills and Ribbon Ridge are selectable by tap.
    - New York: Finger Lakes' child pills show Cayuga Lake and Seneca Lake; Long Island's show North Fork of Long Island and The Hamptons, Long Island; Hudson River Region draws as an outline; Upper Hudson and Champlain Valley of New York fill.
    - Every new panel shows an article, grapes (signature first, the rest tagged "accessory") and styles; the new hybrid grapes show by name; the §8.7 nearby chips for the eight keys match the rehearsal's `nearby` (accept them, or add the function change to §20); the three state shortlists match the rehearsal's `shortlist.<state>.after` (accept them); the Willamette Pinot Noir is still listed on Willamette Valley and Oregon; dark mode.
   - *Rehearsal shortlists (first five): Washington Cabernet Sauvignon, Merlot, Riesling, Chardonnay, Pinot Noir; Oregon Pinot Noir, Syrah, Chardonnay, Pinot Gris, Cabernet Sauvignon; New York Riesling, Cabernet Franc, Chardonnay, Merlot, Frontenac; California unchanged.*
12. Tell the friend it is done. Commit `data/wine-map/review/usa-us4-rehearsal-sitting.json` on its own ("data(wine-map): the US-4 sitting rehearsal").

**Rollback at each point** (every rollback file through `$ROLLBACK` with `--check`, `--dry`, then no flag):

| Failure | Action |
|---|---|
| Step 6 fails | Nothing is committed (one transaction). Fix, resume at step 4. |
| Step 7 fails (DRAFT boundaries live) | `$ROLLBACK scripts/usa-map/usa_us4_unstage.sql`: removes the 42 DRAFT boundaries and refreshes (*rehearsal: refresh 68.5 s, again 69.8 s*); master goes green. Investigate, then re-sit from step 3. It records nothing, so it can run again after a re-stage. |
| Abandon the wave before the promote | `$ROLLBACK scripts/usa-map/usa_us4_remove.sql` (refuses while any other place exists under the three states). Deletes the 42 places, their knowledge and the two history rows; keeps the six new grape rows; refreshes (*rehearsal: 72.7 s*). To retry, apply the catalog and knowledge again as committed. |
| After the promote | Roll forward: `$ROLLBACK scripts/usa-map/usa_us4_unpublish.sql` (refuses while a later wave is live under the three states, or a typical wine is placed on a US-4 place). It flips the 42 places to DRAFT and their boundaries non-current, refreshes (*rehearsal: 66.5 s*). Then `splice-boundary-expectations.mjs --write` (without `--check`: it keeps only current US rows), `git diff` shows only removed `united-states.{washington,oregon,new-york}.*` rows, `boundary-expectations.test.mjs` green, commit and staged push; then a new tiles release with `promote=true`. **Never roll back the manifest.** |
| Tiles run fails | The release is FAILED, the old one stays ACTIVE; the places show in the text tree without shapes. Fix and re-dispatch, or unpublish. |
