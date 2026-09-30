# USA on the wine map, phase US-3 rest batch (64 California AVAs): the sitting runbook

Written by Task 25 of `docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md`, from that plan's
"Ship instructions: the rest sitting", verbatim. The lines in *italics* are the numbers the
rolled-back rehearsal of 2026-09-30 measured (re-run after the US-3 review fixes) (`data/wine-map/review/usa-us3-rest-rehearsal.json`),
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

**The core sitting must be complete first** (its promote `20260930174747` recorded live). Until it
is, `stage-usa-ava.mjs --wave us3-rest` refuses and `rehearse-us3.mjs --batch rest` prepends the core chain.

## Ship instructions

Same captain, announcement and conventions as the core sitting. **The core sitting must be complete first** (its promote recorded; the gate and the rest catalog check it).

**Before the sitting:**

1. The core sitting is done and `check-us3-live.mjs --batch core` says OK.
2. **Catalog, at a quiet hour:** activity check; `$APPLIER supabase/migrations/20260930194747_usa_us3_rest_catalog.sql --check`, `--dry`, apply; refresh under 300 s. `check-us3-live.mjs --batch rest` → 64 DRAFT places, cache fresh.
   - *Rehearsal: the catalog took 66.6 s, its refresh 15566 rows in 66.3 s.*
3. **Knowledge:** `--check`, `--dry`, apply `supabase/migrations/20260930204747_usa_us3_rest_knowledge.sql`.
   - *Rehearsal: 0.4 s; 107 style rows, 251 grape rows, 64 articles, no new grape.*

**The sitting, in order:**

1. Announce; wait for "quiet".
2. `git pull`; the unit tests green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch rest --sitting` → `REHEARSAL OK` (with the core live it prepends nothing; it fails unless the staged boundaries equal the committed `usa-us3-rest-expected-boundaries.json`).
   - *Pre-sitting rehearsal of 2026-09-30 (core chain prepended, since the core was not live): REHEARSAL OK in 666.2 s.*
4. **Stage, dry:** `stage-usa-ava.mjs --wave us3-rest` → `DONE (dry): 64 boundaries …`.
   - *Lowest parent shares in the rehearsal's stage: central-coast.san-francisco-bay.contra-costa 0.336329 (basis `override`, T.D. TTB-191; checked at ≥ 0.3263, spec §26), north-coast.suisun-valley 0.920777, north-coast.mendocino.potter-valley 0.933381, central-coast.san-francisco-bay.santa-clara-valley 0.981974, north-coast.mendocino.mcdowell-valley 0.983698, north-coast.solano-county-green-valley 0.998355. Highest drift: north-coast.cole-ranch 0.00781, south-coast.san-pasqual-valley 0.00372.*
5. **Gate:** `… --wave us3-rest --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us3-rest --stage` → `RAW skip …CA_avas.geojson`, `STAGE COMPLETE: 64 …`, the banner.
   - *Rehearsal: stageWave took 11.9 s for the 64 boundaries.*
7. **Promote:** `"$APPLIER" supabase/migrations/20260930214747_usa_us3_rest_promote.sql` `--check`, `--dry`, apply. Record the refresh notice and the "Central Valley against its members" NOTICE.
   - *Rehearsal: the promote took 66.7 s, its refresh 15711 rows in 65.7 s. US-3 rest promote: Central Valley against its members: symmetric difference 0.000230, members outside 0.000003*
8. **Check:** `check-us3-live.mjs --batch rest` → `US-3 rest LIVE CHECK OK` (64 VERIFIED, 156 live California places, 27 relationships, 11 outlines; Cole Ranch and Lime Kiln Valley resolve to themselves; the hunk equals the committed file).
   - *Rehearsal: 64/64/64/64 and 0 DRAFT, 156 live California places, 27 relationships, 11 outlines, cache fresh; Cole Ranch and Lime Kiln Valley resolve to themselves.*
9. **Tests and the hunk:** as the core sitting's step 9 with `usa-us3-rest-expected-boundaries.json`; `git diff --stat` shows only 64 added `united-states.california.*` rows; commit "data(wine-map): pin the US-3 rest boundaries (united-states hunk only)", staged push.
10. **Tiles:** as the core's step 10; `california` ≤ 3 MB.
   - *Rehearsal preview: the California shard holds 156 keys at max zoom 12, 1,980,496 bytes of GeoJSON (a proxy, not the archive size).*
11. **Map checks** (desktop, iPhone Chrome, iPhone Safari): Cole Ranch (about 0.8 km²) is selectable by tap at phone zoom; "Antelope Valley of the California High Desert" wraps cleanly at 375 px; Central Valley's outline still frames its eleven members; North Coast's child pills (21) are usable at 375 px; Comptche's breadcrumb reads United States › California › Comptche (27 CFR 9.292 keeps it out of North Coast, although North Coast's outline still covers it) and Contra Costa's reads … › Central Coast › San Francisco Bay › Contra Costa (T.D. TTB-191), with San Francisco Bay's child pills (5) including it — its eastern two thirds lie outside the drawn San Francisco Bay and Central Coast outlines until a later boundary cycle (spec §20), and a tap there selects Contra Costa; each new panel shows an article, grapes and styles; the four §8.7 nearby lists match the rehearsal's; the California grape shortlist matches the rehearsal's `shortlist.California.after` (accept it).
12. Tell the friend it is done; commit `usa-us3-rest-rehearsal-sitting.json` on its own.

**Rollback:** as the core table, with the `usa_us3_rest_*` files. The rest remove and unpublish touch only the 64 rest places; the core stays live.
