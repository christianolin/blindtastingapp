# USA on the wine map: phase US-3 (California's AVAs, core batch then rest batch), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything phase US-3 needs for both of its batches, up to but not including each batch's live sitting:

- the two catalog migrations (86 core places, then 64 rest places, DRAFT), keyed exactly as `data/wine-map/usa-california-tree.json`;
- knowledge (article, grapes, styles) for all 150 new places, researched and written in session, as two data files and two generated knowledge migrations;
- the stage script generalised to `--wave us3-core | us3-rest` (dry run only here);
- the two promote migrations (asserts, edges, the neighbour-cache refresh; the rest promote also asserts Central Valley's outline against its promoted members);
- archetype links step 2 (Napa Cabernet Sauvignon to Napa Valley, Sonoma Chardonnay to Sonoma Coast, North Coast and California kept);
- six rollback files run through `scripts/usa-map/apply-rollback.mjs`;
- one rolled-back rehearsal per batch, and a sitting runbook per batch.

Nothing is applied, nothing is written live or to Storage, and no tiles run is dispatched.

**Architecture:** The batches are read from the committed California tree report plus a small committed batch list, and nothing else. `scripts/usa-map/us3-wave.mjs` selects each batch's places (tree order), edges, outline set, parent-containment checks and the Central Valley check. `scripts/usa-map/render-us3-sql.mjs` renders every US-3 migration and rollback from that selection, and tests prove each committed file equals its render. The US-2 stage library is generalised (earlier waves must be live, counts scoped to the wave, parent containment measured), so `stage-usa-ava.mjs` and the rehearsals share one `stageWave`. `rehearse-us3.mjs --batch core|rest` runs a batch's whole chain in one transaction that is always rolled back (for the rest batch it first runs the core chain in the same transaction if the core is not live), and writes committed evidence. Knowledge is written by hand, per region, into two data files that a stricter US-3 validator checks.

**Tech Stack:** Node 24 ESM with `node:test`, `pg`, `@supabase/supabase-js` (Storage, only in `--stage`, never run here), PL/pgSQL on live Postgres (read-only or rolled back only), WebSearch/WebFetch for the in-session research.

**Spec:** `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md`. Read all of it. The parts that matter most here: D3–D9, D15, D16, D19–D24; §4, §8 (all), §10, §11, §12, §13, §14, §15 (the wave order, and US-3), §16, §17, §18, §24 and §25. Also read:

- `CLAUDE.md` ("A catalogue write must be followed by a neighbour-cache refresh", World Wine Map Phases 3A–3D, "Wine map performance") and `AGENTS.md` (no Anthropic API use of any kind);
- the US-2 plan and runbook (`docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md`, `…-us2-sitting.md`): this plan reuses their modules and conventions and does not repeat their reasoning;
- `data/wine-map/review/usa-us0-tree-summary.md`.

This plan touches no Next.js runtime code and no TypeScript. If a step ever reaches Next code, first read the relevant guide under `node_modules/next/dist/docs/`.

## Global Constraints

- Work only in `C:/Users/Public/repos/blindtastingapp-map`, on branch `usa-map`. Start every shell command with `cd C:/Users/Public/repos/blindtastingapp-map && `, because the shell's cwd resets. Never touch `C:/Users/Public/repos/blindtastingapp`.
- **Never push. Never apply a migration. Never write to the live database or to Storage. Never dispatch a tiles run. Never run `stage-usa-ava.mjs --stage`. Never run a rollback file without `--check` or `--dry`.**
- Allowed live access, all read-only or rolled back:
  - `scripts/wine-map-sources/read-only-client.mjs` (`begin read only` … `rollback`);
  - the owner's applier with `--check` or `--dry` only: `$APPLIER` = `C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`, run from the worktree as `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" <file> --check` (then `--dry`). **Never without a flag.** In a shell step, set it in the same command first: `APPLIER=C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs && …`.
  - `scripts/usa-map/apply-rollback.mjs <file> --check` or `--dry` only;
  - the dry mode of `stage-usa-ava.mjs` (always rolled back);
  - `scripts/usa-map/rehearse-us3.mjs` (always rolled back; no commit path);
  - `gen-place-profiles-migration.mjs --prelude …` (its prelude transaction is always rolled back).
- **Live-lock etiquette.** Every rolled-back run that writes `wine_places` or `wine_place_boundaries` holds `wine_place_neighbours_state`'s row until it rolls back (each refresh is about 65–135 s; the rehearsals hold it for about 10 minutes). Before each such run, run `node --env-file=.env.local scripts/usa-map/activity-check.mjs`: `active`, `writers` and `building` must be empty and `draft_boundaries` 0. Run each such command at most as often as this plan says, and never two at once.
- Never recreate `get_wine_place_context`, `refresh_wine_place_neighbours` or any other shared map function (D21). The friend's `20260925190000_wine_place_context_inherited_profile` is live-only.
- No Anthropic API call of any kind (AGENTS.md). All knowledge research is WebSearch/WebFetch in session; no script generates text.
- Commit with: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` (written below as "commit with the standard prefix").
- **Line endings.** `.gitattributes` already marks `data/wine-map/usa-*`, `data/wine-map/review/usa-*` and `data/wine-map/place-profiles-usa.json` `-text`. Task 5 adds `data/wine-map/place-profiles-usa-us3-*.json -text`. Write every new file with LF endings.
- No migration or rollback contains `begin;`, `commit;` or `rollback;` at top level (D24). Every render test asserts this with `topLevelTransactionStatements` from `scripts/migration-preflight.mjs`.
- **Constants (read-only checks, 2026-09-30):**
  - Newest live migration `20260930114747` (`usa_archetype_links_1`). US-2 is live: 16 `united-states` places VERIFIED (1 COUNTRY, 4 REGION, 11 SUBREGION), one `ALTERNATE_PARENT` (Columbia Valley → Oregon), ACTIVE release `20260930T065234Z`, 3,325 places, 0 DRAFT boundaries, neighbour cache fresh (built 2026-09-30T06:49Z).
  - **US-3 versions (suffix `4747`, D23):** core catalog `20260930154747`, core knowledge `20260930164747`, core promote `20260930174747`, archetype links step 2 `20260930184747`; rest catalog `20260930194747`, rest knowledge `20260930204747`, rest promote `20260930214747`. If a newer live version exists on an apply day, change `US3_VERSIONS` (Task 1) and re-render; the applier does not enforce order.
  - **Rollback files** carry no version (§25): `scripts/usa-map/usa_us3_{core,rest}_{unstage,remove,unpublish}.sql`.
  - **Archetypes today** (step 1 is live): `75e4e467-3929-4844-bbc4-ffe8b12523a1` "A typical Napa Cabernet Sauvignon" (sort 88, Napa Valley AVA, California) and `c4ea77f3-5599-43dd-bdc3-4287c1e0ea15` "A typical Sonoma Chardonnay" (sort 89, Sonoma Coast AVA, California): each home `united-states.california.north-coast`, placements `united-states.california` and `united-states.california.north-coast`. R2's display points: 15 archetypes carry one, 0 of them placed; the two above carry none.
  - **Grapes the catalog has** (exact names): Aglianico, Albariño, Alicante Bouschet, Barbera, Cabernet Franc, Cabernet Sauvignon, Carignan, Chardonnay, Chenin Blanc, Cinsault, Counoise, Dolcetto, Falanghina, Fiano, Gewürztraminer, Graciano, Grenache, Grenache Blanc, Grüner Veltliner, Lagrein, Malbec, Marsanne, Merlot, Montepulciano, Moscato, Mourvèdre, Muscat, Nebbiolo, Palomino, Petit Manseng, Petit Verdot, Petite Sirah, Picpoul, Pinot Blanc, Pinot Gris, Pinot Meunier, Pinot Noir, Primitivo, Ribolla Gialla, Riesling, Roussanne, Sangiovese, Sauvignon Blanc, Semillon (no accent), Syrah, Tannat, Tempranillo, Teroldego, Tinta Roriz, Touriga Nacional, Trousseau, Verdelho, Vermentino, Viognier, Zinfandel. **Absent:** Carménère, Charbono, Colombard, Mission (Listán Prieto), Orange Muscat, Valdiguié, Trousseau Gris.
  - **Artifact pins** are US-2's (the California file `data/wine-map/usa-california-ava.geojson` is `CB3F8A08…2E7A` in `usa-measurements.json` `_inputs`); US-3 adds no artifact.
- **Owner answers this plan implements (verbatim):** states **"CA, WA, OR, NY now; others later"**; **"Links now, then likelihood map"**; **"Training room only"**; Columbia Gorge **"Oregon"**; pushes **"Yes, ship phases as they pass"**; and on 2026-09-30 **"ignore my friends changes and just go ahead. no need for my review"**. So there is no owner copy review and no friend-rebase gate; each knowledge file records that waiver as its `owner_approval` (status `APPROVED`), which the stage gate reads. The main session pushes and applies; this plan never does.
- **New user-facing copy is provisional**: every article field, key fact and grape note written in Tasks 6–14, and any new grape description. The list is at the end of this plan.

## Measured for this plan (read-only, 2026-09-30)

- **Parent containment on display geometry.** All 121 California AVA-in-AVA pairs pass their thresholds when both shapes are simplified at 0.0002° as the stage builds them. The tightest is Santa Ynez Valley in Central Coast: 0.995092 on the normalized geometry (the tree's figure), **0.995018** on display geometry. The largest difference between display and normalized ratios is 0.00081. Hence Task 18's promote re-check allows a slack of 0.001 and the stage checks the normalized ratio at the spec's exact thresholds (decision 6 below).
- **Central Valley against its members.** The live derived outline (5,595 km²) against the union of its 11 members built at 0.0002°: symmetric difference 0.023% of its area; members outside it 0.00026%. Hence Task 18's thresholds, 0.1% and 0.01%.

## Decisions this plan makes (they go into spec §26 in Task 25)

1. **Batches.** Core = the §15 US-3 core list (50 named AVAs, with the children of Napa Valley, Paso Robles and Lodi) plus its ancestor closure: **Clear Lake** (parent of Red Hills Lake County), **San Francisco Bay** (of Santa Cruz Mountains and Livermore Valley) and **Gabilan Mountains** (of Chalone and Mt. Harlan). 86 places. Rest = the other 64 California AVAs. Together they are all 150 California APPELLATION rows of the tree.
2. **An edge ships in the batch in which its second endpoint lands.** Core: 24 edges (2 `ALTERNATE_PARENT`, 22 `OVERLAPS`). Rest: 5 `OVERLAPS`, including Wild Horse Valley ↔ Solano County Green Valley (a core place with a rest place).
3. **The tree decides, and it differs from §15's wording in four places** (keys lock at the promote; the tree review file lists each with its ratio):
   - Russian River Valley's relation to Sonoma Coast is `OVERLAPS` (87.95% inside, under the 90% legal-record arm), not `ALTERNATE_PARENT`. The `ALTERNATE_PARENT` to Sonoma Coast belongs to Green Valley of Russian River Valley.
   - **El Dorado** is keyed directly under California (`united-states.california.el-dorado`), with `OVERLAPS` to Sierra Foothills (74.87% inside). §15 grouped it under "Sierra Foothills" by name only. Fair Play, keyed under El Dorado, carries `ALTERNATE_PARENT` to Sierra Foothills.
   - Cole Ranch and High Valley are keyed under North Coast (69.4% inside Mendocino, 75.9% inside Clear Lake).
   - Changing any of these needs a `parent_overrides` entry in `usa-tree-config.json` and re-committed tree reports **before** the catalog renders; this plan does not do that.
4. **Knowledge lives in one data file per batch** (`data/wine-map/place-profiles-usa-us3-core.json`, `…-rest.json`), not appended to `place-profiles-usa.json` (refines D20): the US validator checks a file against exactly one wave, the stage gate reads the approval from the batch's own file, and the generator emits every entry not yet live.
5. **Ordering between batches is enforced, and scoped to California.** The rest catalog needs the core places to exist; the rest stage and promote need the core promote live. Pre- and post-state checks look only at `united-states.california.*`, so a US-4 wave on the other states can run before, between or after them. Rollbacks refuse on other California places outside the known keys (a core remove while rest places exist; a core unpublish while a rest place is live).
6. **Parent containment is checked twice.** The stage measures each nested AVA on the normalized source geometry at the spec's thresholds (≥ 0.995 measured, ≥ 0.90 legal record) and requires the tree report's figure within 1e-4. The promote re-checks on the stored display geometry with a 0.001 slack (measured maximum difference 0.00081).
7. **Edges are re-checked geometrically in the promote:** an `OVERLAPS` edge's display ratio must be within 0.01 of the tree's; an `ALTERNATE_PARENT` source must lie ≥ 0.899 inside its target.
8. **Central Valley's outline is asserted in the rest promote** (§25 "US-3 asserts that the outline equals its promoted members' union"): its member list equals its 11 promoted children, the symmetric difference with their union is < 0.1% of its area, and members outside it < 0.01%. Lodi is a core place but the other ten members are rest, so the core promote cannot.
9. **The generator's `--prelude` may repeat** (the rest knowledge needs the core and rest catalogs first). Default output unchanged; tell the friend (§17.6).
10. **`stageWave` and the gate are generalised,** not copied: earlier waves must be VERIFIED with one current boundary, "already staged" counts only this wave's places, and `sittingGate` gains `priorPromoted`; `usBoundaries` is renamed `waveBoundaries`.
11. **`stage-usa-ava.mjs --wave us3-rest`'s dry run refuses until the core promote is live;** before that, `rehearse-us3.mjs --batch rest` runs the core chain first in its own transaction.
12. **A stricter US-3 knowledge rule:** exactly one key fact "Established YYYY (27 CFR 9.N)" matching TTB's list; descriptions ≤ 700 characters; ≤ 8 grapes with ≤ 3 PRINCIPAL; ≥ 2 sources, one of them the CFR or the Federal Register; no text copied between places.
13. **Comptche's CFR section** comes from TTB's list by name (9.292), because UC Davis carries none; nothing else changes for it.
14. **Placement `sort_order`** stays each archetype's own (88, 89), the US-2 convention (§25).

## Review Focus

1. **A key locks where a reader does not expect it.** The promote locks keys for good, and the tree puts El Dorado under California, Cole Ranch and High Valley under North Coast, and gives Russian River Valley no `ALTERNATE_PARENT`. Expected: nothing renders a key from anything but the tree, and every such case is listed with its ratio before the promote. (Task 1: the wave test pins El Dorado's key, Russian River Valley's `OVERLAPS` and Green Valley's `ALTERNATE_PARENT`. Task 2: the tree-review test asserts El Dorado, Russian River Valley, Cole Ranch and High Valley are listed with their percentages.)
2. **A nested AVA passes on source geometry but fails on display geometry** (Santa Ynez Valley's margin is 1.8e-5), and the promote refuses mid-sitting with DRAFT boundaries live. Expected: the promote allows the measured slack. (Task 18: the render test asserts `parent_min - 0.001`; Tasks 23–24: the rehearsals run the promote.)
3. **Batches out of order**: the rest catalog before the core catalog, the rest stage before the core promote, a core remove while rest places exist, a core unpublish while a rest place is live. Expected: each refuses before changing anything. (Task 16: `sittingGate` refuses without `priorPromoted`. Task 23: refusals R, G and S. Task 24: refusal H.)
4. **Wrong or stale knowledge**: an "Established" fact that disagrees with TTB, text copied between AVAs, or a data file edited after its migration was generated. (Task 5: the US-3 validator's tests. Task 15: the "migration is current" tests per batch.)
5. **Archetype links step 2 applied twice, before the core promote, or left pointing at a DRAFT place after a core unpublish.** (Task 19: pre-state asserts. Task 23: refusals B and F, and the unpublish drill restores step 1.)

## File map

| File | Change |
|---|---|
| `data/wine-map/usa-us3-batches.json` (new) | the core list (§15) and the three "with children" AVAs |
| `scripts/usa-map/us3-wave.mjs` + `us3-wave.test.mjs` (new) | the two batches, versions, file names; tree order; review chunks |
| `scripts/usa-map/waves.mjs` + `waves.test.mjs` (new) | `loadWave("us2" \| "us3-core" \| "us3-rest")` for the stage CLI and the rehearsals |
| `scripts/usa-map/us3-notes.mjs` + `us3-notes.test.mjs`, `render-us3-notes.mjs` (new) | the fact sheet and the tree review |
| `data/wine-map/review/usa-us3-fact-sheet.md`, `usa-us3-tree-review.md` (new, rendered) | research starting point; the placements the promote locks |
| `scripts/usa-map/render-us3-sql.mjs` + `us3-sql.test.mjs` (new) | catalog, promote, links 2, and the six rollbacks |
| `scripts/usa-map/render-us2-sql.mjs` | exports `RM9A_SQL` and `DISPLAY_COLUMNS_LIVE` (output unchanged) |
| `supabase/migrations/20260930154747_usa_us3_core_catalog.sql`, `20260930194747_usa_us3_rest_catalog.sql` (new, rendered) | DRAFT places + refresh (NOT applied) |
| `scripts/wine-map-sources/gen-place-profiles-args.mjs`, `gen-place-profiles-migration.mjs`, `gen-place-profiles-args.test.mjs` | `--prelude` may repeat (`preludes`) |
| `scripts/usa-map/usa-us3-knowledge.mjs` + `usa-us3-knowledge.test.mjs`, `order-us3-profiles.mjs`, `check-us3-grapes.mjs`, `render-usa-us3-review.mjs` (new) | the US-3 content rule, reordering, and the review files |
| `data/wine-map/place-profiles-usa-us3-core.json`, `…-rest.json` (new) | the 86 + 64 places' knowledge |
| `.gitattributes` | `data/wine-map/place-profiles-usa-us3-*.json -text` |
| `supabase/migrations/20260930164747_usa_us3_core_knowledge.sql`, `20260930204747_usa_us3_rest_knowledge.sql` (new, generated) | knowledge (NOT applied) |
| `scripts/wine-map-sources/usa-stage-lib.mjs` + `usa-stage-lib.test.mjs` | earlier waves, wave-scoped counts, parent containment, `priorPromoted` |
| `scripts/wine-map-sources/stage-usa-ava.mjs` | `--wave us2 \| us3-core \| us3-rest` |
| `supabase/migrations/20260930174747_usa_us3_core_promote.sql`, `20260930214747_usa_us3_rest_promote.sql` (new, rendered) | the promotes (NOT applied) |
| `data/wine-map/usa-us3-archetype-links.json`, `supabase/migrations/20260930184747_usa_archetype_links_2.sql` (new) | archetype links step 2 (NOT applied) |
| `scripts/training-room.test.mjs` | the Napa assertion accepts step 2 |
| `scripts/usa-map/usa_us3_{core,rest}_{unstage,remove,unpublish}.sql` (new, rendered) | rollbacks, outside `supabase/migrations/` |
| `scripts/usa-map/us3-checks.mjs` + `us3-checks.test.mjs` (new) | details, relationships, click resolution, batch facts |
| `scripts/usa-map/rehearse-us3.mjs`, `scripts/usa-map/check-us3-live.mjs` (new) | the rehearsals and the read-only live check |
| `data/wine-map/review/usa-us3-{core,rest}-rehearsal.json`, `…-expected-boundaries.json`, `usa-us3-{core,rest}-knowledge-{n}.md` (new) | evidence and review files |
| `docs/superpowers/plans/2026-09-30-usa-wine-map-us3-core-sitting.md`, `…-us3-rest-sitting.md` (new) | the runbooks |
| `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` | new §26 |

---

### Task 1: The two batches, from the tree report

**Files:**
- Create: `data/wine-map/usa-us3-batches.json`
- Create: `scripts/usa-map/us3-wave.mjs`, `scripts/usa-map/waves.mjs`
- Test: `scripts/usa-map/us3-wave.test.mjs`, `scripts/usa-map/waves.test.mjs`

**Interfaces:**
- Consumes (US-2, unchanged): `loadTrees()`, `us2Wave(trees)`, `artifactFor(code)`, `depthOf(key)`, `US2_VERSIONS`, `US2_FILES`, `COUNTRY_KEY` from `scripts/usa-map/us2-wave.mjs`. A tree place row has `key, slug, name, kind, display_tier, min_zoom, label_min_zoom, sort_order, parent_key, parent_basis, parent_inside, breadcrumb, is_appellation, appellation_system, appellation_level, display, navigation_node, map_state, ucd_ava_id, cfr_section, area_km2, legal_states`; an edge row has `type, source_key, target_key, basis, ratio?`.
- Produces:
  - `CA_KEY`, `US3_BATCHES`, `US3_VERSIONS`, `US3_FILES`, `US3_ROLLBACK_FILES`, `US3_KNOWLEDGE`, `PRIOR_PROMOTE`, `BATCHES_PATH`, `TTB_PATH`;
  - `loadBatches()`, `loadTtb()`, `treeOrder(keys, allPlaces, rootKey)`, `reviewChunks(list, max = 40)`;
  - `us3Wave(trees, batches, ttb, batch)` returning `{ name, batch, places, edges, outlineKeys, derived: [], derivedCheck, ucd, parentChecks, closure, states, prior: { verified, present }, priorKeys, after: { caPlaces, caAva, caEdges }, scopeKey, versions, files, rollbackFiles, knowledgeSource, priorPromote }`. `ucd` rows: `{ key, ucd_ava_id, state: "CA", artifact, legal_states, area_km2, cfr_section, established, name }`. `parentChecks` rows: `{ key, parent_key, basis, tree_inside, min, parent_ucd_ava_id }`. `derivedCheck`: `null` or `{ key, members: [{ key, ucd_ava_id }] }`.
  - `loadWave(name)` in `waves.mjs`, for `"us2" | "us3-core" | "us3-rest"`; the US-2 wave gains `name, priorKeys: [], scopeKey: "united-states", prior: { verified: [], present: [] }, versions, files, knowledgeSource, priorPromote: null`.

- [ ] **Step 1: Write the batch list** `data/wine-map/usa-us3-batches.json` (LF):

```json
{
  "_note": "US-3 batches (spec 2026-09-29 §15 US-3). core.named is the spec's core list, as keys of data/wine-map/usa-california-tree.json; core.with_children adds every AVA whose primary parent is one of these (Napa Valley's 15, Paso Robles's 11, Lodi's 7). us3-wave.mjs adds the ancestor closure (the AVA parents a named place needs that US-2 did not create: Clear Lake, San Francisco Bay, Gabilan Mountains). rest is every other California AVA in the tree. Hand-edited; keys lock at each batch's promote.",
  "core": {
    "named": [
      "united-states.california.north-coast.napa-valley",
      "united-states.california.north-coast.los-carneros",
      "united-states.california.north-coast.wild-horse-valley",
      "united-states.california.north-coast.northern-sonoma",
      "united-states.california.north-coast.northern-sonoma.russian-river-valley",
      "united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley",
      "united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill",
      "united-states.california.north-coast.sonoma-coast",
      "united-states.california.north-coast.sonoma-coast.west-sonoma-coast",
      "united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview",
      "united-states.california.north-coast.petaluma-gap",
      "united-states.california.north-coast.northern-sonoma.dry-creek-valley",
      "united-states.california.north-coast.northern-sonoma.alexander-valley",
      "united-states.california.north-coast.northern-sonoma.knights-valley",
      "united-states.california.north-coast.rockpile",
      "united-states.california.north-coast.sonoma-valley",
      "united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county",
      "united-states.california.north-coast.sonoma-valley.sonoma-mountain",
      "united-states.california.north-coast.sonoma-valley.bennett-valley",
      "united-states.california.north-coast.fountaingrove-district",
      "united-states.california.north-coast.pine-mountain-cloverdale-peak",
      "united-states.california.north-coast.mendocino",
      "united-states.california.north-coast.mendocino.anderson-valley",
      "united-states.california.north-coast.mendocino-ridge",
      "united-states.california.north-coast.clear-lake.red-hills-lake-county",
      "united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains",
      "united-states.california.central-coast.san-francisco-bay.livermore-valley",
      "united-states.california.central-coast.monterey",
      "united-states.california.central-coast.monterey.santa-lucia-highlands",
      "united-states.california.central-coast.gabilan-mountains.chalone",
      "united-states.california.central-coast.monterey.arroyo-seco",
      "united-states.california.central-coast.carmel-valley",
      "united-states.california.central-coast.gabilan-mountains.mt-harlan",
      "united-states.california.central-coast.paso-robles",
      "united-states.california.central-coast.san-luis-obispo-coast",
      "united-states.california.central-coast.san-luis-obispo-coast.edna-valley",
      "united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley",
      "united-states.california.central-coast.santa-maria-valley",
      "united-states.california.central-coast.santa-ynez-valley",
      "united-states.california.central-coast.santa-ynez-valley.sta-rita-hills",
      "united-states.california.central-coast.santa-ynez-valley.ballard-canyon",
      "united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara",
      "united-states.california.central-coast.santa-ynez-valley.los-olivos-district",
      "united-states.california.central-coast.alisos-canyon",
      "united-states.california.central-valley.lodi",
      "united-states.california.el-dorado",
      "united-states.california.el-dorado.fair-play",
      "united-states.california.sierra-foothills.california-shenandoah-valley",
      "united-states.california.sierra-foothills.fiddletown",
      "united-states.california.south-coast.temecula-valley"
    ],
    "with_children": [
      "united-states.california.north-coast.napa-valley",
      "united-states.california.central-coast.paso-robles",
      "united-states.california.central-valley.lodi"
    ]
  }
}
```

- [ ] **Step 2: Write the failing test** `scripts/usa-map/us3-wave.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees, us2Wave } from "./us2-wave.mjs";
import {
  CA_KEY, loadBatches, loadTtb, reviewChunks, us3Wave, US3_FILES, US3_ROLLBACK_FILES, US3_VERSIONS,
} from "./us3-wave.mjs";

const trees = await loadTrees();
const batches = await loadBatches();
const ttb = await loadTtb();
const core = us3Wave(trees, batches, ttb, "core");
const rest = us3Wave(trees, batches, ttb, "rest");
const C = `${CA_KEY}.`;
const count = (list, f) => list.reduce((a, x) => ({ ...a, [f(x)]: (a[f(x)] ?? 0) + 1 }), {});
const edge = (w, s, t) => w.edges.find((e) => e.source_key === C + s && e.target_key === C + t);

test("core is §15's list plus its closure; rest is every other California AVA", () => {
  assert.equal(core.places.length, 86);
  assert.equal(rest.places.length, 64);
  assert.deepEqual(core.closure, [
    `${C}central-coast.gabilan-mountains`, `${C}central-coast.san-francisco-bay`, `${C}north-coast.clear-lake`,
  ]);
  const all = new Set([...core.places, ...rest.places].map((p) => p.key));
  assert.equal(all.size, 150, "disjoint");
  const avas = trees.CA.places.filter((p) => p.kind === "APPELLATION").map((p) => p.key);
  assert.deepEqual([...all].sort(), avas.sort());
  for (const p of [...core.places, ...rest.places]) assert.equal(p.kind, "APPELLATION", p.key);
});

test("tree order: every place after its parent", () => {
  for (const w of [core, rest]) {
    const seen = new Set([...w.priorKeys]);
    for (const p of w.places) {
      assert.ok(seen.has(p.parent_key), `${p.key} before its parent`);
      seen.add(p.key);
    }
  }
});

test("tiers and zooms follow spec §4; every label at z10 or below (D16)", () => {
  const zoom = { 2: [6, 6], 3: [6, 7], 4: [7, 9], 5: [8, 10] };
  const tierOf = new Map(trees.CA.places.map((p) => [p.key, p.display_tier]));
  for (const w of [core, rest]) {
    for (const p of w.places) {
      assert.deepEqual([p.min_zoom, p.label_min_zoom], zoom[p.display_tier], p.key);
      const parent = trees.CA.places.find((x) => x.key === p.parent_key);
      const want = parent.kind === "REGION" || parent.navigation_node ? 2 : tierOf.get(p.parent_key) + 1;
      assert.equal(p.display_tier, want, p.key);
    }
  }
  assert.deepEqual(count(core.places, (p) => p.display_tier), { 2: 2, 3: 33, 4: 48, 5: 3 });
  assert.deepEqual(count(rest.places, (p) => p.display_tier), { 2: 27, 3: 19, 4: 14, 5: 4 });
});

test("classification (D4): AVA everywhere; regional directly under the state or Central Valley", () => {
  for (const w of [core, rest]) {
    for (const p of w.places) {
      const parent = trees.CA.places.find((x) => x.key === p.parent_key);
      const regional = parent.kind === "REGION" || parent.navigation_node;
      assert.deepEqual([p.is_appellation, p.appellation_system, p.appellation_level],
        [true, "AVA", regional ? "regional" : "subregional"], p.key);
    }
  }
  assert.deepEqual(core.places.filter((p) => p.appellation_level === "regional").map((p) => p.key),
    [`${C}central-valley.lodi`, `${C}el-dorado`]);
  assert.equal(rest.places.filter((p) => p.appellation_level === "regional").length, 27);
});

test("Review Focus 1: the placements the promote locks are the tree's", () => {
  const key = (w, slug) => w.places.find((p) => p.slug === slug)?.key;
  assert.equal(key(core, "el-dorado"), `${C}el-dorado`);
  assert.equal(key(core, "fair-play"), `${C}el-dorado.fair-play`);
  assert.equal(key(rest, "cole-ranch"), `${C}north-coast.cole-ranch`);
  assert.equal(key(rest, "high-valley"), `${C}north-coast.high-valley`);
  const rrv = "north-coast.northern-sonoma.russian-river-valley";
  assert.equal(key(core, "russian-river-valley"), C + rrv);
  assert.deepEqual([edge(core, rrv, "north-coast.sonoma-coast")?.type, edge(core, rrv, "north-coast.sonoma-coast")?.ratio], ["OVERLAPS", 0.8795]);
  assert.equal(edge(core, `${rrv}.green-valley-of-russian-river-valley`, "north-coast.sonoma-coast")?.type, "ALTERNATE_PARENT");
  assert.equal(edge(core, "el-dorado.fair-play", "sierra-foothills")?.type, "ALTERNATE_PARENT");
  assert.equal(edge(core, "el-dorado", "sierra-foothills")?.type, "OVERLAPS");
  for (const t of ["napa-valley", "sonoma-coast", "sonoma-valley"]) {
    assert.equal(edge(core, "north-coast.los-carneros", `north-coast.${t}`)?.type, "OVERLAPS", t);
  }
});

test("edges: 24 in core, 5 in rest, each where its second endpoint lands, never to an own ancestor", () => {
  assert.deepEqual(count(core.edges, (e) => e.type), { ALTERNATE_PARENT: 2, OVERLAPS: 22 });
  assert.deepEqual(count(rest.edges, (e) => e.type), { OVERLAPS: 5 });
  assert.ok(edge(rest, "north-coast.wild-horse-valley", "north-coast.solano-county-green-valley"));
  assert.equal(core.edges.length + rest.edges.length, trees.CA.edges.length);
  const parentOf = new Map(trees.CA.places.map((p) => [p.key, p.parent_key]));
  const ancestors = (k) => { const out = []; for (let p = parentOf.get(k); p; p = parentOf.get(p)) out.push(p); return out; };
  for (const e of [...core.edges, ...rest.edges].filter((x) => x.type === "OVERLAPS")) {
    assert.ok(!ancestors(e.source_key).includes(e.target_key) && !ancestors(e.target_key).includes(e.source_key), e.source_key);
  }
});

test("D15: San Francisco Bay is the only new outline place", () => {
  assert.deepEqual(core.outlineKeys, [`${C}central-coast.san-francisco-bay`]);
  assert.deepEqual(rest.outlineKeys, []);
});

test("parent containment checks: thresholds by basis, and the tree's own figures pass them", () => {
  assert.equal(core.parentChecks.length, 84);
  assert.equal(rest.parentChecks.length, 37);
  assert.deepEqual(count(core.parentChecks, (c) => c.basis), { measured: 74, legal_record: 10 });
  assert.deepEqual(count(rest.parentChecks, (c) => c.basis), { measured: 33, legal_record: 4 });
  for (const c of [...core.parentChecks, ...rest.parentChecks]) {
    assert.equal(c.min, c.basis === "measured" ? 0.995 : 0.9, c.key);
    assert.ok(c.tree_inside >= c.min, c.key);
    assert.ok(c.parent_ucd_ava_id, c.key);
  }
});

test("Central Valley is checked in the rest batch, against its 11 members", () => {
  assert.equal(core.derivedCheck, null);
  const cv = rest.derivedCheck;
  assert.equal(cv.key, `${C}central-valley`);
  assert.deepEqual(cv.members.map((m) => m.ucd_ava_id), us2Wave(trees).derived[0].members);
});

test("every AVA has a CFR section and a TTB date; Comptche's comes from TTB by name", () => {
  for (const u of [...core.ucd, ...rest.ucd]) {
    assert.match(u.cfr_section, /^9\.\d+$/, u.key);
    assert.match(u.established, /^\d{4}-\d{2}-\d{2}$/, u.key);
    assert.deepEqual(u.legal_states, ["CA"], u.key);
  }
  const comptche = rest.ucd.find((u) => u.ucd_ava_id === "comptche");
  assert.deepEqual([comptche.cfr_section, comptche.established], ["9.292", "2024-04-08"]);
});

test("prior waves, counts after each batch, versions and files", () => {
  assert.equal(core.priorKeys.length, 16);
  assert.equal(rest.priorKeys.length, 16 + 86);
  assert.deepEqual([core.prior.present.length, rest.prior.present.length], [0, 86]);
  assert.deepEqual(core.after, { caPlaces: 92, caAva: 90, caEdges: 24 });
  assert.deepEqual(rest.after, { caPlaces: 156, caAva: 154, caEdges: 29 });
  for (const v of [...Object.values(US3_VERSIONS.core), ...Object.values(US3_VERSIONS.rest)]) assert.match(v, /^\d{10}4747$/);
  assert.equal(US3_FILES.core.links, "supabase/migrations/20260930184747_usa_archetype_links_2.sql");
  assert.equal(US3_FILES.rest.promote, "supabase/migrations/20260930214747_usa_us3_rest_promote.sql");
  assert.equal(US3_ROLLBACK_FILES.core.unpublish, "scripts/usa-map/usa_us3_core_unpublish.sql");
  assert.equal(core.priorPromote, "20260930104747");
  assert.equal(rest.priorPromote, "20260930174747");
});

test("refuses what it cannot place", () => {
  assert.throws(() => us3Wave(trees, batches, ttb, "middle"), /unknown US-3 batch/);
  const bad = structuredClone(batches);
  bad.core.named.push("united-states.california.north-coast");
  assert.throws(() => us3Wave(trees, bad, ttb, "core"), /is not an AVA in the California tree/);
  const orphan = structuredClone(batches);
  orphan.core.with_children.push("united-states.california.central-coast.san-benito");
  assert.throws(() => us3Wave(trees, orphan, ttb, "core"), /with_children .* is not a named core AVA/);
});

test("review chunks: at most 40, near-equal", () => {
  assert.deepEqual(reviewChunks(core.places).map((c) => c.length), [29, 29, 28]);
  assert.deepEqual(reviewChunks(rest.places).map((c) => c.length), [32, 32]);
});
```

`scripts/usa-map/waves.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadWave, WAVES } from "./waves.mjs";

test("the three stageable waves", async () => {
  assert.deepEqual(WAVES, ["us2", "us3-core", "us3-rest"]);
  const us2 = await loadWave("us2");
  assert.deepEqual([us2.places.length, us2.priorKeys.length, us2.scopeKey, us2.priorPromote], [16, 0, "united-states", null]);
  assert.equal(us2.knowledgeSource, "data/wine-map/place-profiles-usa.json");
  const core = await loadWave("us3-core");
  assert.deepEqual([core.name, core.places.length, core.scopeKey], ["us3-core", 86, "united-states.california"]);
  await assert.rejects(() => loadWave("us4"), /unknown wave us4/);
});
```

- [ ] **Step 3: Run them.** `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/us3-wave.test.mjs scripts/usa-map/waves.test.mjs`. Expected: FAIL, "Cannot find module './us3-wave.mjs'".

- [ ] **Step 4: Implement** `scripts/usa-map/us3-wave.mjs`:

```js
// Phase US-3 of the USA map (spec 2026-09-29 §15 US-3): California's AVAs in
// two batches, core first. Read from the committed California tree report
// (data/wine-map/usa-california-tree.json), the batch list
// (data/wine-map/usa-us3-batches.json) and TTB's list, and nothing else.
// Pure. Every US-3 migration, the stage and the rehearsals take their keys
// from here, so none of them can disagree with the tree report.
import { readFile } from "node:fs/promises";
import { artifactFor, us2Wave, US2_VERSIONS } from "./us2-wave.mjs";

export const CA_KEY = "united-states.california";
export const BATCHES_PATH = "data/wine-map/usa-us3-batches.json";
export const TTB_PATH = "data/wine-map/usa-ava-ttb-list.json";
export const US3_BATCHES = Object.freeze(["core", "rest"]);
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us3-sql.mjs); the applier does not enforce order.
export const US3_VERSIONS = Object.freeze({
  core: Object.freeze({ catalog: "20260930154747", knowledge: "20260930164747", promote: "20260930174747", links: "20260930184747" }),
  rest: Object.freeze({ catalog: "20260930194747", knowledge: "20260930204747", promote: "20260930214747" }),
});
const mig = (v, name) => `supabase/migrations/${v}_${name}.sql`;
export const US3_FILES = Object.freeze({
  core: Object.freeze({
    catalog: mig(US3_VERSIONS.core.catalog, "usa_us3_core_catalog"),
    knowledge: mig(US3_VERSIONS.core.knowledge, "usa_us3_core_knowledge"),
    promote: mig(US3_VERSIONS.core.promote, "usa_us3_core_promote"),
    links: mig(US3_VERSIONS.core.links, "usa_archetype_links_2"),
  }),
  rest: Object.freeze({
    catalog: mig(US3_VERSIONS.rest.catalog, "usa_us3_rest_catalog"),
    knowledge: mig(US3_VERSIONS.rest.knowledge, "usa_us3_rest_knowledge"),
    promote: mig(US3_VERSIONS.rest.promote, "usa_us3_rest_promote"),
  }),
});
// Outside supabase/migrations/ and unversioned (spec §25): run with apply-rollback.mjs.
export const US3_ROLLBACK_FILES = Object.freeze(Object.fromEntries(US3_BATCHES.map((b) => [b, Object.freeze({
  unstage: `scripts/usa-map/usa_us3_${b}_unstage.sql`,
  remove: `scripts/usa-map/usa_us3_${b}_remove.sql`,
  unpublish: `scripts/usa-map/usa_us3_${b}_unpublish.sql`,
})])));
export const US3_KNOWLEDGE = Object.freeze({
  core: "data/wine-map/place-profiles-usa-us3-core.json",
  rest: "data/wine-map/place-profiles-usa-us3-rest.json",
});
export const PRIOR_PROMOTE = Object.freeze({ core: US2_VERSIONS.promote, rest: US3_VERSIONS.core.promote });
// D7: >= 99.5% measured inside, or >= 90% when UC Davis's `within` names the container.
const PARENT_MIN = Object.freeze({ measured: 0.995, legal_record: 0.9 });

export const loadBatches = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(BATCHES_PATH));
export const loadTtb = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(TTB_PATH));

/** The places whose keys are in `keys`, depth first under rootKey, siblings by sort_order then key. */
export function treeOrder(keys, allPlaces, rootKey) {
  const want = new Set(keys);
  const kids = new Map();
  for (const p of allPlaces) {
    if (!p.parent_key) continue;
    if (!kids.has(p.parent_key)) kids.set(p.parent_key, []);
    kids.get(p.parent_key).push(p);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
  const out = [];
  const walk = (key) => {
    for (const c of kids.get(key) ?? []) {
      if (want.has(c.key)) out.push(c);
      walk(c.key);
    }
  };
  walk(rootKey);
  if (out.length !== want.size) throw new Error(`tree order found ${out.length} of ${want.size} places under ${rootKey}`);
  return out;
}

/** ceil(n / max) near-equal chunks (spec §18: at most 40 places per review file). */
export function reviewChunks(list, max = 40) {
  const k = Math.ceil(list.length / max);
  const size = Math.ceil(list.length / k);
  return Array.from({ length: k }, (_, i) => list.slice(i * size, (i + 1) * size));
}

export function us3Wave(trees, batches, ttb, batch) {
  if (!US3_BATCHES.includes(batch)) throw new Error(`unknown US-3 batch ${batch} (use core or rest)`);
  const tree = trees.CA;
  if (!tree || tree.state !== "CA" || tree.state_key !== CA_KEY) throw new Error("no California tree report");
  const us2 = us2Wave(trees);
  const us2Keys = us2.places.map((p) => p.key);
  const us2Set = new Set(us2Keys);
  const byKey = new Map(tree.places.map((p) => [p.key, p]));
  const avas = tree.places.filter((p) => p.kind === "APPELLATION");

  const core = new Set();
  for (const k of batches.core.named) {
    if (byKey.get(k)?.kind !== "APPELLATION") throw new Error(`core: ${k} is not an AVA in the California tree`);
    core.add(k);
  }
  for (const k of batches.core.with_children) {
    if (!core.has(k)) throw new Error(`core: with_children ${k} is not a named core AVA`);
    for (const p of avas) if (p.parent_key === k) core.add(p.key);
  }
  const closure = [];
  for (const k of [...core]) {
    for (let p = byKey.get(k); !us2Set.has(p.parent_key); p = byKey.get(p.parent_key)) {
      const parent = byKey.get(p.parent_key);
      if (!parent) throw new Error(`${k}: its parent chain leaves the tree at ${p.parent_key}`);
      if (!core.has(parent.key)) { core.add(parent.key); closure.push(parent.key); }
    }
  }
  const rest = new Set(avas.filter((p) => !core.has(p.key)).map((p) => p.key));
  const waveSet = batch === "core" ? core : rest;
  const prior = { verified: us2Keys, present: batch === "core" ? [] : treeOrder([...core], tree.places, CA_KEY).map((p) => p.key) };
  const priorSet = new Set([...prior.verified, ...prior.present]);
  for (const k of waveSet) {
    const parent = byKey.get(k).parent_key;
    if (!waveSet.has(parent) && !priorSet.has(parent)) throw new Error(`${k}: parent ${parent} is in no earlier wave and not in this batch`);
  }
  const places = treeOrder([...waveSet], tree.places, CA_KEY);
  const all = new Set([...priorSet, ...waveSet]);

  const ttbOf = (p) => {
    const t = (p.cfr_section && ttb.avas.find((x) => x.cfr_section === p.cfr_section))
      || ttb.avas.find((x) => x.name === p.name && x.states.includes("CA"));
    if (!t) throw new Error(`${p.key}: not in TTB's list`);
    return t;
  };
  const edges = tree.edges
    .filter((e) => all.has(e.source_key) && all.has(e.target_key) && (waveSet.has(e.source_key) || waveSet.has(e.target_key)))
    .sort((a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key) || a.type.localeCompare(b.type));
  const parentChecks = places.filter((p) => p.parent_basis).map((p) => {
    const min = PARENT_MIN[p.parent_basis];
    if (min === undefined) throw new Error(`${p.key}: parent_basis ${p.parent_basis} has no threshold`);
    return { key: p.key, parent_key: p.parent_key, basis: p.parent_basis, tree_inside: p.parent_inside, min,
      parent_ucd_ava_id: byKey.get(p.parent_key).ucd_ava_id };
  });
  const derivedCheck = us2.derived
    .filter((d) => d.state === "CA")
    .map((d) => ({ key: d.key, members: tree.places.filter((x) => x.parent_key === d.key)
      .map((x) => ({ key: x.key, ucd_ava_id: x.ucd_ava_id })).sort((a, b) => a.ucd_ava_id.localeCompare(b.ucd_ava_id)) }))
    .find((d) => d.members.every((m) => all.has(m.key)) && d.members.some((m) => waveSet.has(m.key))) ?? null;
  const ucd = places.map((p) => {
    const t = ttbOf(p);
    return { key: p.key, ucd_ava_id: p.ucd_ava_id, state: "CA", artifact: artifactFor("CA"), legal_states: p.legal_states,
      area_km2: p.area_km2, cfr_section: p.cfr_section ?? t.cfr_section, established: t.established, name: p.name };
  });
  const underCa = (k) => k === CA_KEY || k.startsWith(`${CA_KEY}.`);
  return {
    name: `us3-${batch}`, batch, places, edges,
    outlineKeys: places.filter((p) => p.display === "outline").map((p) => p.key).sort(),
    derived: [], derivedCheck, ucd, parentChecks, closure: closure.sort(),
    states: [{ code: "CA", key: CA_KEY, name: "California" }],
    prior, priorKeys: [...priorSet].sort(),
    after: {
      caPlaces: [...all].filter(underCa).length,
      caAva: tree.places.filter((p) => all.has(p.key) && p.appellation_system === "AVA").length,
      caEdges: tree.edges.filter((e) => all.has(e.source_key) && all.has(e.target_key)).length,
    },
    scopeKey: CA_KEY, versions: US3_VERSIONS[batch], files: US3_FILES[batch], rollbackFiles: US3_ROLLBACK_FILES[batch],
    knowledgeSource: US3_KNOWLEDGE[batch], priorPromote: PRIOR_PROMOTE[batch],
  };
}
```

`scripts/usa-map/waves.mjs`:

```js
// Every wave the stage script and the rehearsals can take, by name.
import { COUNTRY_KEY, loadTrees, us2Wave, US2_FILES, US2_VERSIONS } from "./us2-wave.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

export const WAVES = Object.freeze(["us2", "us3-core", "us3-rest"]);

export async function loadWave(name) {
  if (!WAVES.includes(name)) throw new Error(`unknown wave ${name} (use ${WAVES.join(", ")})`);
  const trees = await loadTrees();
  if (name === "us2") {
    return {
      ...us2Wave(trees), name, priorKeys: [], prior: { verified: [], present: [] }, scopeKey: COUNTRY_KEY,
      versions: US2_VERSIONS, files: US2_FILES, knowledgeSource: "data/wine-map/place-profiles-usa.json", priorPromote: null,
    };
  }
  return us3Wave(trees, await loadBatches(), await loadTtb(), name.slice("us3-".length));
}
```

- [ ] **Step 5: Run them.** Expected: PASS (13 + 1 tests). Also `node --test scripts/usa-map/us2-wave.test.mjs` still passes (nothing in it changed).
- [ ] **Step 6: Commit** the three new modules, the two tests and the batch list: "feat(usa-map): the US-3 batches (core + closure, rest), read from the California tree report", with the standard prefix.

---

### Task 2: The fact sheet and the tree review

The fact sheet is the research starting point for Tasks 6–14 (every figure in it comes from committed files). The tree review is the §15 "tree report is reviewed" evidence: the placements the promote will lock, with their measured ratios.

**Files:**
- Create: `scripts/usa-map/us3-notes.mjs`, `scripts/usa-map/render-us3-notes.mjs`
- Create (rendered): `data/wine-map/review/usa-us3-fact-sheet.md`, `data/wine-map/review/usa-us3-tree-review.md`
- Test: `scripts/usa-map/us3-notes.test.mjs`

**Interfaces:**
- Consumes: `us3Wave`, `loadTrees`, `loadBatches`, `loadTtb` (Task 1); `data/wine-map/usa-california-ava.geojson` feature properties `ava_id, county, within, contains`.
- Produces: `factSheetMarkdown({ waves, tree, props })`, `treeReviewMarkdown({ waves, tree })`, `pct(r)` (e.g. `0.8795 → "87.95%"`).

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us3-notes.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { factSheetMarkdown, pct, treeReviewMarkdown } from "./us3-notes.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const trees = await loadTrees();
const batches = await loadBatches();
const ttb = await loadTtb();
const waves = { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
const art = JSON.parse(await readFile("data/wine-map/usa-california-ava.geojson", "utf8"));
const props = new Map(art.features.map((f) => [f.properties.ava_id, f.properties]));
const lf = (s) => s.replace(/\r\n/g, "\n");

test("pct keeps two decimals", () => {
  assert.equal(pct(0.8795), "87.95%");
  assert.equal(pct(0.7487), "74.87%");
});

test("the fact sheet has one row per AVA with its CFR section, TTB date and counties", () => {
  const md = factSheetMarkdown({ waves, tree: trees.CA, props });
  assert.equal((md.match(/^\| `united-states\.california\./gm) ?? []).length, 150);
  assert.match(md, /\| `united-states\.california\.north-coast\.napa-valley\.oakville` \| Oakville \| 9\.134 \| 1993-07-02 \| Napa \|/);
  assert.match(md, /\| `united-states\.california\.north-coast\.comptche` \| Comptche \| 9\.292 \| 2024-04-08 \| Mendocino \|/);
});

test("Review Focus 1: the tree review lists every lock a reader may not expect, with its ratio", () => {
  const md = treeReviewMarkdown({ waves, tree: trees.CA });
  for (const line of [
    /El Dorado.*Sierra Foothills.*OVERLAPS, 74\.87% inside/,
    /Russian River Valley.*Sonoma Coast.*OVERLAPS, 87\.95% inside/,
    /Cole Ranch.*Mendocino.*OVERLAPS, 69\.40% inside/,
    /High Valley.*Clear Lake.*OVERLAPS, 75\.91% inside/,
  ]) assert.match(md, line);
  assert.match(md, /## Core batch \(86 places\)/);
  assert.match(md, /## Rest batch \(64 places\)/);
});

test("the committed files are the renders", async () => {
  assert.equal(lf(await readFile("data/wine-map/review/usa-us3-fact-sheet.md", "utf8")), factSheetMarkdown({ waves, tree: trees.CA, props }));
  assert.equal(lf(await readFile("data/wine-map/review/usa-us3-tree-review.md", "utf8")), treeReviewMarkdown({ waves, tree: trees.CA }));
});
```

- [ ] **Step 2: Run it.** `node --test scripts/usa-map/us3-notes.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/us3-notes.mjs`:

```js
// The US-3 research fact sheet and tree review (spec §15 US-3 "the tree
// report is reviewed"), rendered from committed files only.
export const pct = (r) => `${(Number(r) * 100).toFixed(2)}%`;
const short = (k) => k.replace(/^united-states\.california\./, "");

export function factSheetMarkdown({ waves, tree, props }) {
  const L = ["# US-3 fact sheet: California's AVAs", "",
    "Rendered by `scripts/usa-map/render-us3-notes.mjs` from the California tree report, UC Davis's county field and TTB's list. The starting point for the knowledge research (plan Tasks 6–14): every key fact \"Established YYYY (27 CFR 9.N)\" must match this sheet. Areas are the UC Davis digitization's, not a legal figure.", ""];
  for (const [label, w] of [["Core batch", waves.core], ["Rest batch", waves.rest]]) {
    L.push(`## ${label} (${w.places.length} places)`, "",
      "| Key | Name | CFR | Established | Counties | Area km² | Parent (basis, inside) | Edges |", "|---|---|---|---|---|---|---|---|");
    for (const p of w.places) {
      const u = w.ucd.find((x) => x.key === p.key);
      const c = w.parentChecks.find((x) => x.key === p.key);
      const parent = `${short(p.parent_key)}${c ? ` (${c.basis}, ${pct(c.tree_inside)})` : ""}`;
      const edges = tree.edges.filter((e) => e.source_key === p.key || e.target_key === p.key)
        .map((e) => `${e.type} ${short(e.source_key === p.key ? e.target_key : e.source_key)}${e.ratio != null ? ` ${pct(e.ratio)}` : ""}`).join("; ");
      L.push(`| \`${p.key}\` | ${p.name} | ${u.cfr_section} | ${u.established} | ${(props.get(p.ucd_ava_id)?.county ?? "").split("|").join(", ")} | ${Math.round(p.area_km2)} | ${parent} | ${edges || "none"} |`);
    }
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

export function treeReviewMarkdown({ waves, tree }) {
  const byName = new Map(tree.places.map((p) => [p.name, p]));
  const L = ["# US-3 tree review: what the promotes lock", "",
    "Rendered by `scripts/usa-map/render-us3-notes.mjs` from `data/wine-map/usa-california-tree.json`. Keys lock at each batch's promote (spec §8.3). The tree decides (spec D7): a place nests in an AVA only when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA. Each case below is where UC Davis names a container the tree does not nest the place in; it gets an `OVERLAPS` edge instead when more than 1% overlaps. Changing one needs a `parent_overrides` entry in `usa-tree-config.json` and re-committed tree reports before that batch's catalog renders.", ""];
  for (const [label, w] of [["Core batch", waves.core], ["Rest batch", waves.rest]]) {
    const keys = new Set(w.places.map((p) => p.key));
    L.push(`## ${label} (${w.places.length} places)`, "");
    L.push("### Containers UC Davis names that the tree does not nest in", "");
    for (const d of tree.review.within_disagreements.filter((x) => keys.has(x.key) && x.ucd_within_not_computed.length)) {
      for (const name of d.ucd_within_not_computed) {
        const target = byName.get(name);
        const e = target && tree.edges.find((x) => x.source_key === d.key && x.target_key === target.key);
        const what = !target ? "no California place of that name"
          : e ? `${e.type}${e.ratio != null ? `, ${pct(e.ratio)} inside` : ""}` : "under 1% overlap, no edge";
        L.push(`- ${d.name} (\`${short(d.key)}\`, keyed under ${short(tree.places.find((p) => p.key === d.key).parent_key)}): UC Davis says within ${name}; ${what}.`);
      }
    }
    L.push("", "### Nested by the legal record (90% to 99.5% inside)", "");
    for (const c of w.parentChecks.filter((x) => x.basis === "legal_record")) L.push(`- \`${short(c.key)}\` in \`${short(c.parent_key)}\`: ${pct(c.tree_inside)} inside.`);
    L.push("", "### Edges this batch stores", "", "| Type | Source | Target | Ratio |", "|---|---|---|---|");
    for (const e of w.edges) L.push(`| ${e.type} | \`${short(e.source_key)}\` | \`${short(e.target_key)}\` | ${e.ratio != null ? pct(e.ratio) : e.basis} |`);
    L.push("");
    const omissions = tree.review.within_disagreements.filter((x) => keys.has(x.key) && (x.computed_not_in_ucd_within.length || x.unresolved_tokens.length));
    if (omissions.length) {
      L.push("### Where the tree nests more than UC Davis's text says (information only)", "");
      for (const d of omissions) {
        const parts = [];
        if (d.computed_not_in_ucd_within.length) parts.push(`measured inside ${d.computed_not_in_ucd_within.join(", ")}`);
        if (d.unresolved_tokens.length) parts.push(`UC Davis text not matched: ${d.unresolved_tokens.join(", ")}`);
        L.push(`- ${d.name}: ${parts.join("; ")}.`);
      }
      L.push("");
    }
  }
  return `${L.join("\n")}\n`;
}
```

`scripts/usa-map/render-us3-notes.mjs`:

```js
// node scripts/usa-map/render-us3-notes.mjs — writes the fact sheet and the tree review.
import { readFile, writeFile } from "node:fs/promises";
import { loadTrees } from "./us2-wave.mjs";
import { factSheetMarkdown, treeReviewMarkdown } from "./us3-notes.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const trees = await loadTrees();
const batches = await loadBatches();
const ttb = await loadTtb();
const waves = { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
const art = JSON.parse(await readFile("data/wine-map/usa-california-ava.geojson", "utf8"));
const props = new Map(art.features.map((f) => [f.properties.ava_id, f.properties]));
await writeFile("data/wine-map/review/usa-us3-fact-sheet.md", factSheetMarkdown({ waves, tree: trees.CA, props }));
await writeFile("data/wine-map/review/usa-us3-tree-review.md", treeReviewMarkdown({ waves, tree: trees.CA }));
console.log("wrote data/wine-map/review/usa-us3-fact-sheet.md and usa-us3-tree-review.md");
```

- [ ] **Step 4: Render and run.** `node scripts/usa-map/render-us3-notes.mjs`, then `node --test scripts/usa-map/us3-notes.test.mjs`. Expected: PASS (4 tests). If the Cole Ranch or High Valley percentage differs in the second decimal from the test (the tree stores 0.694 and 0.7591), fix the test to the tree's value, never the tree.
- [ ] **Step 5: Read** `usa-us3-tree-review.md` end to end. Every "UC Davis says within" line must name a ratio or "under 1% overlap". Note in the commit body the four locks of Review Focus 1.
- [ ] **Step 6: Commit** the module, CLI, test and the two rendered files: "docs(usa-map): US-3 fact sheet and tree review (the placements the promotes lock)".

---

### Task 3: The two catalog migrations (DRAFT places, with the refresh)

**Files:**
- Create: `scripts/usa-map/render-us3-sql.mjs`, `scripts/usa-map/us3-sql.test.mjs`
- Modify: `scripts/usa-map/render-us2-sql.mjs` (export two constants; its output is unchanged)
- Create (rendered): `supabase/migrations/20260930154747_usa_us3_core_catalog.sql`, `supabase/migrations/20260930194747_usa_us3_rest_catalog.sql`

**Interfaces:**
- Consumes: `us3Wave`, `CA_KEY` (Task 1); `sq`, `REFRESH_BLOCK` from `render-us2-sql.mjs`; `depthOf` from `us2-wave.mjs`.
- Produces: `catalogSql(wave) → string`; the CLI `node scripts/usa-map/render-us3-sql.mjs`, which writes every US-3 rendered file (later tasks add `promoteSql`, `links2Sql`, `unstageSql`, `removeSql`, `unpublishSql` and extend `renderAll`). `loadUs3Waves() → { core, rest }`.

- [ ] **Step 1: Export two constants from `render-us2-sql.mjs`.** Change `const DISPLAY_COLUMNS_LIVE =` to `export const DISPLAY_COLUMNS_LIVE =` and `const RM9A_SQL =` to `export const RM9A_SQL =`. Nothing else. Run `node --test scripts/usa-map/us2-sql.test.mjs`: still PASS (the committed US-2 files still equal their render).

- [ ] **Step 2: Write the failing test** `scripts/usa-map/us3-sql.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { catalogSql, loadUs3Waves } from "./render-us3-sql.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");
const waves = await loadUs3Waves();

for (const batch of ["core", "rest"]) {
  const wave = waves[batch];
  test(`${batch}: the committed catalog migration is exactly the render`, async () => {
    assert.equal(lf(await readFile(wave.files.catalog, "utf8")), catalogSql(wave));
  });

  test(`${batch} catalog: no transaction statements, DRAFT inserts, earlier waves asserted, checked refresh last`, () => {
    const sql = catalogSql(wave);
    assert.deepEqual(topLevelTransactionStatements(sql), []);
    assert.equal((sql.match(/^ {2}\('united-states\.california\.[^']+', '[a-z0-9-]+', /gm) ?? []).length, wave.places.length);
    assert.ok(!/set publication_status = 'VERIFIED'/.test(sql));
    assert.equal((sql.match(/'DRAFT', v\.sort_order, p\.id/g) ?? []).length, new Set(wave.places.map((p) => p.key.split(".").length)).size);
    assert.match(sql, /its places already exist/);
    assert.match(sql, /an earlier wave is missing or not VERIFIED/);
    const tail = sql.slice(sql.lastIndexOf("do $$"));
    assert.match(tail, /refresh_wine_place_neighbours\(\)/);
    assert.match(tail, /if v_rows < 0 then/);
  });
}

test("the rest catalog needs the core places to exist, not to be VERIFIED", () => {
  const sql = catalogSql(waves.rest);
  assert.match(sql, /\('united-states\.california\.north-coast\.napa-valley', false\)/);
  assert.match(sql, /\('united-states\.california', true\)/);
});
```

- [ ] **Step 3: Run it.** `node --test scripts/usa-map/us3-sql.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement** `scripts/usa-map/render-us3-sql.mjs` (this task writes the header, helpers, `catalogSql`, `loadUs3Waves`, `renderAll` and `main`; later tasks insert their functions above `renderAll` and add their files to it):

```js
// Renders the US-3 SQL (catalog, promote, archetype links step 2, rollbacks)
// from the two batches (us3-wave.mjs). The committed files must equal this
// render (us3-sql.test.mjs). No file contains begin/commit/rollback: the
// applier, or apply-rollback.mjs, owns the transaction (spec D24).
//
// Usage: node scripts/usa-map/render-us3-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DISPLAY_COLUMNS_LIVE, REFRESH_BLOCK, RM9A_SQL, sq } from "./render-us2-sql.mjs";
import { depthOf, loadTrees } from "./us2-wave.mjs";
import { CA_KEY, loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
const CA_WHERE = (alias) => `(${alias}.canonical_key = '${CA_KEY}' or ${alias}.canonical_key like '${CA_KEY}.%')`;
const PLAN = "docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md";

export async function loadUs3Waves() {
  const trees = await loadTrees();
  const batches = await loadBatches();
  const ttb = await loadTtb();
  return { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
}

export function catalogSql(wave) {
  const tag = `US-3 ${wave.batch} catalog`;
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const prior = [
    ...wave.prior.verified.map((k) => `  (${sq(k)}, true)`),
    ...wave.prior.present.map((k) => `  (${sq(k)}, false)`),
  ].join(",\n");
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => a - b);
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perTier = valuesOf(countBy(wave.places, (p) => String(p.display_tier)));
  const perParent = valuesOf(countBy(wave.places, (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  const needs = wave.batch === "core"
    ? "every US-2 place VERIFIED (the US-2 promote is live)"
    : "every US-2 place VERIFIED and every core place present (the core catalog applied; the core promote need not be live yet)";
  return `-- USA on the wine map, phase US-3 ${wave.batch} batch: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-3;
-- plan ${PLAN} Task 3).
--
-- Inserts the ${wave.places.length} California AVAs of the US-3 ${wave.batch} batch DRAFT
-- (APPELLATION, AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-california-tree.json. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; us3-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs ${needs}.
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us3-${wave.batch} and flip in ${wave.versions.promote}.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us3_catalog, pg_temp._us3_prior;
create temp table _us3_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us3_catalog values
${rows};
create temp table _us3_prior (key text primary key, must_be_verified boolean not null) on commit drop;
insert into _us3_prior values
${prior};

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception '${tag}: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or (e.must_be_verified and p.publication_status <> 'VERIFIED');
  if v_text is not null then
    raise exception '${tag}: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

${depths.map(insertAt).join("\n")}
do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v
    left join public.wine_places p on p.canonical_key = v.key
    left join public.wine_places pp on pp.id = p.primary_parent_id
   where p.id is null
      or p.kind::text <> v.kind or p.name <> v.name or p.slug <> v.slug
      or p.display_tier <> v.tier or p.min_zoom <> v.min_zoom or p.label_min_zoom <> v.label_min_zoom
      or p.is_appellation <> v.is_app
      or p.appellation_system is distinct from v.system
      or p.appellation_level is distinct from v.level
      or p.sort_order <> v.sort_order
      or p.publication_status <> 'DRAFT'
      or pp.canonical_key is distinct from v.parent_key;
  if v_text is not null then raise exception '${tag}: rows differ from the tree report: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perTier}) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

// (Tasks 18-20 insert promoteSql, links2Sql and the rollback renderers here.)

/** Every rendered file, path -> text. */
export function renderAll(waves) {
  return {
    [waves.core.files.catalog]: catalogSql(waves.core),
    [waves.rest.files.catalog]: catalogSql(waves.rest),
  };
}

async function main() {
  const waves = await loadUs3Waves();
  for (const [path, text] of Object.entries(renderAll(waves))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

Unused imports (`readFile`, `DISPLAY_COLUMNS_LIVE`, `RM9A_SQL`, `CA_WHERE`) are used by Tasks 18–20; keep them so those tasks only add functions.

- [ ] **Step 5: Render and test.** `node scripts/usa-map/render-us3-sql.mjs` then `node --test scripts/usa-map/us3-sql.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 6: Dry-run the core catalog against live, and prove the rest catalog refuses.** Run the activity check first (Global Constraints). Then:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && APPLIER=C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs && node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930154747_usa_us3_core_catalog.sql --check && node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930154747_usa_us3_core_catalog.sql --dry
```

Expected: `PREFLIGHT OK`, then a NOTICE `US-3 core catalog: neighbour refresh N rows in S s` with S under 300, then `DRY RUN OK`. Record S for the runbook. Then, with the core catalog absent:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && APPLIER=C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs && node --env-file=.env.local "$APPLIER" supabase/migrations/20260930194747_usa_us3_rest_catalog.sql --dry
```

Expected: FAILED (rolled back) with `US-3 rest catalog: an earlier wave is missing or not VERIFIED (apply it first): united-states.california.central-coast.alisos-canyon, …`. This is the order guard of Review Focus 3.

- [ ] **Step 7: Commit** the renderer, the test, the US-2 export change and the two migrations: "feat(usa-map): US-3 catalog migrations, core (86) and rest (64), DRAFT with refresh (not applied)". Put the measured refresh seconds in the body.

---

### Task 4: The generator's `--prelude` may repeat

The rest knowledge migration is generated before any US-3 place is live, so its prelude must create the core places and then the rest places: two files. This is the friend's script (§17.6): default output stays byte-identical; tell them in the sitting announcement.

**Files:**
- Modify: `scripts/wine-map-sources/gen-place-profiles-args.mjs`, `scripts/wine-map-sources/gen-place-profiles-migration.mjs`
- Test: `scripts/wine-map-sources/gen-place-profiles-args.test.mjs`

**Interfaces:**
- Produces: `genArgs(...)` returns a new field `preludes: string[]` (every `--prelude` value, in order); `prelude` stays the first one or `null`.

- [ ] **Step 1: Update the tests.** In `gen-place-profiles-args.test.mjs`, add `preludes: [],` after `prelude: null,` in the defaults `deepEqual`, and append:

```js
test("--prelude may repeat; preludes keeps every file in order", () => {
  const args = genArgs(["--prelude", "a.sql", "--bare", "--prelude", "b.sql"], {}, "C:/r");
  assert.equal(args.prelude, "a.sql");
  assert.deepEqual(args.preludes, ["a.sql", "b.sql"]);
  assert.throws(() => genArgs(["--prelude", "a.sql", "--prelude"], {}, "C:/r"), /--prelude needs a value/);
});
```

- [ ] **Step 2: Run.** `node --test scripts/wine-map-sources/gen-place-profiles-args.test.mjs`. Expected: FAIL (no `preludes`).
- [ ] **Step 3: Implement.** In `gen-place-profiles-args.mjs`, add below `arg`:

```js
  const all = (flag) => argv.flatMap((a, i) => {
    if (a !== flag) return [];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    return [value];
  });
```

and add `preludes: all("--prelude"),` after `prelude: arg("--prelude", null),`. Extend the header comment: "`--prelude` may repeat (US-3's rest knowledge needs the core and the rest catalog first); the files run in order inside the one rolled-back transaction."

In `gen-place-profiles-migration.mjs`, destructure `preludes: PRELUDES` next to `prelude: PRELUDE`, and replace the prelude block and its rollback:

```js
if (PRELUDES.length) {
  await client.query("begin");
  for (const file of PRELUDES) {
    await client.query(await readFile(`${REPO}/${file}`, "utf8"));
    console.log(`prelude ${file} applied inside a transaction that is rolled back`);
  }
}
```

```js
if (PRELUDES.length) await client.query("rollback");
```

Remove the now-unused `prelude: PRELUDE` from the destructuring.
- [ ] **Step 4: Run.** `node --test scripts/wine-map-sources/gen-place-profiles-args.test.mjs scripts/wine-map-sources/gen-place-profiles-sql.test.mjs`. Expected: PASS. Then prove the default output is unchanged: `node --env-file=.env.local scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa.json --bare` (check mode, read-only in effect: no `--write`, no prelude). Expected: "16 places already live, skipped" and "nothing left to do".
- [ ] **Step 5: Commit** "feat(wine-map-sources): gen-place-profiles --prelude may repeat (default output unchanged)".

---

### Task 5: The US-3 knowledge rule, the ordering tool, the grape check and the review renderer

**Files:**
- Create: `scripts/usa-map/usa-us3-knowledge.mjs`, `scripts/usa-map/order-us3-profiles.mjs`, `scripts/usa-map/check-us3-grapes.mjs`, `scripts/usa-map/render-usa-us3-review.mjs`
- Create: `data/wine-map/place-profiles-usa-us3-core.json`, `data/wine-map/place-profiles-usa-us3-rest.json` (skeletons)
- Modify: `.gitattributes` (add `data/wine-map/place-profiles-usa-us3-*.json -text`)
- Test: `scripts/usa-map/usa-us3-knowledge.test.mjs`

**Interfaces:**
- Consumes: `validateUsaProfiles`, `panelGrapes`, `shortlistRanks`, `shortlistSurfaces`, `shortlistDemotions`, `STYLE_LABELS`, `BY_HAND_CHIPS` from `usa-knowledge.mjs` (unchanged); `loadWave` (Task 1); `reviewChunks`, `CA_KEY`, `US3_KNOWLEDGE` (Task 1).
- Produces: `validateUs3Profiles(source, wave) → string[]`, `sortToWaveOrder(source, wave)`, `mergeSources(...sources)`, `us3ReviewMarkdown({ source, wave, keys, part, parts, allSource, rehearsal })`, `ESTABLISHED`, `LEGAL_SOURCE`.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/usa-us3-knowledge.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reviewChunks } from "./us3-wave.mjs";
import { mergeSources, sortToWaveOrder, us3ReviewMarkdown, validateUs3Profiles } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";

const waves = { core: await loadWave("us3-core"), rest: await loadWave("us3-rest") };
const long = (s) => `${s}: a plain factual sentence long enough to pass the floor.`;
const entry = (w, key, i) => {
  const u = w.ucd.find((x) => x.key === key);
  return {
    article: {
      description: long(`Description ${i}`), climate: long(`Climate ${i}`), soils: long(`Soils ${i}`),
      grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: [`Established ${u.established.slice(0, 4)} (27 CFR ${u.cfr_section})`, "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Cabernet Sauvignon" }],
    sources: [
      { title: `27 CFR ${u.cfr_section}`, url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-${u.cfr_section}` },
      { title: "TTB, established AVAs", url: "https://www.ttb.gov/wine/established-avas" },
    ],
  };
};
const valid = (w) => ({
  _provenance: { wave: w.name, status: "DRAFT", owner_approval: null },
  new_grapes: [],
  places: Object.fromEntries(w.places.map((p, i) => [p.key, entry(w, p.key, i)])),
});
const OAK = "united-states.california.north-coast.napa-valley.oakville";
const RUT = "united-states.california.north-coast.napa-valley.rutherford";

test("complete files validate", () => {
  assert.deepEqual(validateUs3Profiles(valid(waves.core), waves.core), []);
  assert.deepEqual(validateUs3Profiles(valid(waves.rest), waves.rest), []);
});

test("Review Focus 4: the Established fact must be TTB's year and CFR section, exactly once", () => {
  const s = valid(waves.core);
  s.places[OAK].article.key_facts[0] = "Established 1994 (27 CFR 9.134)";
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /oakville: "Established 1994 \(27 CFR 9\.134\)" disagrees with TTB \(1993, 27 CFR 9\.134\)/);
  s.places[OAK].article.key_facts[0] = "First planted in the 1870s";
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /oakville: exactly one key fact "Established YYYY/);
});

test("Review Focus 4: no text copied between places", () => {
  const s = valid(waves.core);
  s.places[RUT].article.climate = s.places[OAK].article.climate;
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /rutherford: article\.climate repeats .*oakville climate/);
});

test("limits: description, grapes, signature grapes, sources, the wave name", () => {
  const s = valid(waves.core);
  const p = s.places[OAK];
  p.article.description = "x".repeat(701);
  p.grapes = ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot", "Malbec", "Zinfandel", "Syrah", "Chardonnay", "Sauvignon Blanc"].map((name) => ({ name }));
  s.places[RUT].sources = [{ title: "Winery page", url: "https://example.org/rutherford" }];
  s._provenance.wave = "us3-rest";
  const out = validateUs3Profiles(s, waves.core).join("\n");
  assert.match(out, /oakville: description over 700 characters/);
  assert.match(out, /oakville: more than 8 grapes/);
  assert.match(out, /oakville: more than 3 signature grapes/);
  assert.match(out, /rutherford: at least two sources/);
  assert.match(out, /rutherford: no CFR or Federal Register source/);
  assert.match(out, /_provenance\.wave must be us3-core/);
});

test("sortToWaveOrder restores wave order and keeps the top-level fields first", () => {
  const s = valid(waves.core);
  const reversed = { ...s, places: Object.fromEntries(Object.entries(s.places).reverse()) };
  const sorted = sortToWaveOrder(reversed, waves.core);
  assert.deepEqual(Object.keys(sorted.places), waves.core.places.map((p) => p.key));
  assert.deepEqual(Object.keys(sorted), ["_provenance", "new_grapes", "places"]);
});

test("mergeSources joins places", () => {
  assert.equal(Object.keys(mergeSources(valid(waves.core), valid(waves.rest)).places).length, 150);
});

test("a review part: one section per place, the shortlist only in the last part", () => {
  const s = valid(waves.core);
  const chunks = reviewChunks(waves.core.places);
  const md = us3ReviewMarkdown({ source: s, wave: waves.core, keys: chunks[0].map((p) => p.key), part: 1, parts: 3, allSource: s, rehearsal: null });
  assert.equal((md.match(/^## United States › /gm) ?? []).length, 29);
  assert.ok(!md.includes("## Grape shortlist change"));
});

for (const batch of ["core", "rest"]) {
  test(`the committed ${batch} knowledge file: the places written so far meet the US-3 rule`, async (t) => {
    const w = waves[batch];
    const source = JSON.parse(await readFile(w.knowledgeSource, "utf8"));
    const written = { ...w, places: w.places.filter((p) => source.places[p.key]) };
    if (!written.places.length) { t.skip("no place written yet"); return; }
    assert.deepEqual(validateUs3Profiles(source, written), []);
    if (source._provenance.status === "APPROVED") {
      assert.equal(Object.keys(source.places).length, w.places.length, "an approved file holds every place");
      assert.match(source._provenance.owner_approval.answer, /no need for my review/);
    }
  });
}
```

- [ ] **Step 2: Run.** `node --test scripts/usa-map/usa-us3-knowledge.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/usa-us3-knowledge.mjs`:

```js
// US-3 knowledge (spec §10, §18): validateUsaProfiles plus the stricter US-3
// rule (plan 2026-09-30 decision 12), the wave-order helper, and the review
// file renderer (one part per at most 40 places, §18).
import { CA_KEY } from "./us3-wave.mjs";
import {
  BY_HAND_CHIPS, panelGrapes, shortlistDemotions, shortlistRanks, shortlistSurfaces, STYLE_LABELS, validateUsaProfiles,
} from "./usa-knowledge.mjs";

export const ESTABLISHED = /^Established (\d{4}) \(27 CFR (9\.\d+)\)$/;
export const LEGAL_SOURCE = /(ecfr\.gov|law\.cornell\.edu\/cfr|federalregister\.gov|govinfo\.gov|regulations\.gov)/;
const MAX_DESCRIPTION = 700;
const MAX_GRAPES = 8;
const MAX_PRINCIPAL = 3;

export function validateUs3Profiles(source, wave) {
  const problems = validateUsaProfiles(source, wave);
  if (source?._provenance?.wave !== wave.name) problems.push(`_provenance.wave must be ${wave.name}`);
  const ucd = new Map(wave.ucd.map((u) => [u.key, u]));
  const seen = new Map();
  for (const place of wave.places) {
    const p = source?.places?.[place.key];
    if (!p) continue;
    const k = place.key;
    const a = p.article ?? {};
    const u = ucd.get(k);
    const est = (a.key_facts ?? []).map((f) => ESTABLISHED.exec(f)).filter(Boolean);
    if (est.length !== 1) problems.push(`${k}: exactly one key fact "Established YYYY (27 CFR 9.N)"`);
    else if (est[0][1] !== u.established.slice(0, 4) || est[0][2] !== u.cfr_section) {
      problems.push(`${k}: "${est[0][0]}" disagrees with TTB (${u.established.slice(0, 4)}, 27 CFR ${u.cfr_section})`);
    }
    if ((a.description ?? "").length > MAX_DESCRIPTION) problems.push(`${k}: description over ${MAX_DESCRIPTION} characters`);
    const grapes = p.grapes ?? [];
    if (grapes.length > MAX_GRAPES) problems.push(`${k}: more than ${MAX_GRAPES} grapes`);
    if (grapes.filter((g) => (g.role ?? "PRINCIPAL") === "PRINCIPAL").length > MAX_PRINCIPAL) {
      problems.push(`${k}: more than ${MAX_PRINCIPAL} signature grapes`);
    }
    const sources = p.sources ?? [];
    if (sources.length < 2) problems.push(`${k}: at least two sources`);
    if (!sources.some((s) => LEGAL_SOURCE.test(s.url ?? ""))) problems.push(`${k}: no CFR or Federal Register source`);
    for (const f of ["description", "climate", "soils"]) {
      const t = (a[f] ?? "").trim();
      if (!t) continue;
      if (seen.has(t)) problems.push(`${k}: article.${f} repeats ${seen.get(t)}`);
      else seen.set(t, `${k} ${f}`);
    }
  }
  return problems;
}

/** The same file with its places in wave order; places not in the wave go last (the validator names them). */
export function sortToWaveOrder(source, wave) {
  const order = wave.places.map((p) => p.key);
  const keys = Object.keys(source.places);
  const sorted = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  return { ...source, places: Object.fromEntries(sorted.map((k) => [k, source.places[k]])) };
}

export const mergeSources = (...sources) => ({ places: Object.assign({}, ...sources.map((s) => s.places)) });

export function us3ReviewMarkdown({ source, wave, keys, part, parts, allSource, rehearsal }) {
  const L = [];
  const approved = source._provenance?.status === "APPROVED";
  L.push(`# United States, US-3 ${wave.batch} batch, part ${part} of ${parts}: knowledge`, "");
  L.push(approved
    ? "**Status: APPROVED under the owner's waiver of 2026-09-30** (\"no need for my review\"). This file is the readable record of what the knowledge migration applies; the copy is provisional until the main session's live check."
    : "**Status: DRAFT, provisional copy.** Nothing here is live.", "");
  L.push(`Places in this part: ${keys.length} of ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  for (const key of keys) {
    const place = wave.places.find((p) => p.key === key);
    const p = source.places[key];
    const a = p.article;
    L.push(`## ${place.breadcrumb}`, "");
    L.push(`Name: **${place.name}** · key \`${place.key}\` · AVA`, "");
    L.push(`**Description.** ${a.description}`, "", `**Climate.** ${a.climate}`, "", `**Soils.** ${a.soils}`, "");
    L.push(`**Grape varieties (text).** ${a.grape_varieties}`, "", `**Wine styles (text).** ${a.wine_styles}`, "");
    L.push("**Key facts**", "");
    for (const f of a.key_facts) L.push(`- ${f}`);
    L.push("", "**Grapes**, as the details panel lists them (signature grapes first, then the ones it tags \"accessory\"; each group alphabetically):", "");
    for (const g of panelGrapes(p.grapes)) {
      L.push(`- ${g.name}${g.note ? ` (${g.note})` : ""}${(g.role ?? "PRINCIPAL") === "ACCESSORY" ? " · accessory" : ""}`);
    }
    L.push("", `**Styles:** ${p.styles.map((s) => STYLE_LABELS[s]).join(", ")}`, "", "**Sources**", "");
    for (const s of p.sources) L.push(`- ${s.title}: ${s.url}`);
    L.push("");
  }
  if (part !== parts) return `${L.join("\n")}\n`;
  const s = rehearsal?.shortlist?.California;
  if (s) {
    L.push("## Grape shortlist change for California (spec §10.3)", "");
    L.push(`Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. "Before" is the live list before this batch; "after" includes it. After a grape: the number of California places that list it as a signature grape ("accessory" when it is one nowhere). The by-hand form shows at most ${BY_HAND_CHIPS} chips.`, "");
    const ranks = shortlistRanks(allSource, CA_KEY);
    const rankOf = (g) => ranks.get(g);
    const label = (g) => { const r = rankOf(g); return r ? `${g} (${r.count}${r.bucket === "accessory" ? ", accessory" : ""})` : g; };
    const after = shortlistSurfaces(s.after, s.colours ?? {}, rankOf);
    const before = shortlistSurfaces(s.before, s.colours ?? {}, null);
    const row = (x) => `${x.shown.join(", ") || "none"}${x.tiedAtCut.length ? `; the last chip is one of ${x.tiedAtCut.join(", ")} (tied)` : ""}`;
    L.push("| Surface | Before | After |", "|---|---|---|");
    L.push(`| Guess ladder (the whole list) | ${s.before.join(", ")} | ${s.after.map(label).join(", ")} |`);
    L.push(`| By-hand chips, no colour yet | ${row(before.none)} | ${row(after.none)} |`);
    L.push(`| By-hand chips, red | ${row(before.red)} | ${row(after.red)} |`);
    L.push(`| By-hand chips, white | ${row(before.white)} | ${row(after.white)} |`, "");
    const own = allSource.places[CA_KEY].grapes;
    const d = shortlistDemotions(own, s.after, rankOf);
    L.push(`Against California's own list (its first three: ${own.slice(0, 3).map((g) => g.name).join(", ")}): ${d.length ? `${d.join("; ")}.` : "none moves down or drops."}`, "");
  }
  if (rehearsal?.nearby) {
    L.push("## Nearby chips (spec §8.7)", "", "The details panel's five nearby chips for these places, as a signed-in reader, after the promote. Containers and overlapping AVAs score distance 0; the main session accepts or defers (§20).", "");
    for (const [key, list] of Object.entries(rehearsal.nearby)) L.push(`- \`${key}\`: ${list.join(", ") || "none"}`);
    L.push("");
  }
  const dots = rehearsal?.archetypes?.dots;
  if (dots?.length) {
    L.push("## Typical wines on the training-room map", "", "| Typical wine | Linked to | Dot before | Dot after | Moves |", "|---|---|---|---|---|");
    const pt = (x) => (x && x[0] != null ? `${x[0]}, ${x[1]}` : "none");
    for (const x of dots) L.push(`| ${x.name} | \`${x.home}\` | ${pt(x.before)} | ${pt(x.after)} | ${x.moved_km != null ? `${x.moved_km} km` : "n/a"} |`);
    L.push("");
  }
  return `${L.join("\n")}\n`;
}
```

`scripts/usa-map/order-us3-profiles.mjs`:

```js
// node scripts/usa-map/order-us3-profiles.mjs --batch core|rest
// Rewrites the batch's knowledge file with its places in wave order (a pure reorder).
import { readFile, writeFile } from "node:fs/promises";
import { sortToWaveOrder } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";

const batch = process.argv[process.argv.indexOf("--batch") + 1];
if (!["core", "rest"].includes(batch)) { console.error("usage: order-us3-profiles.mjs --batch core|rest"); process.exit(2); }
const wave = await loadWave(`us3-${batch}`);
const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
await writeFile(wave.knowledgeSource, `${JSON.stringify(sortToWaveOrder(source, wave), null, 2)}\n`);
console.log(`ordered ${Object.keys(source.places).length} places in ${wave.knowledgeSource}`);
```

`scripts/usa-map/check-us3-grapes.mjs`:

```js
// Read-only: every grape a batch's knowledge names resolves in the live catalog
// (or is one of the file's new_grapes). node scripts/usa-map/check-us3-grapes.mjs --batch core|rest
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { US3_KNOWLEDGE } from "./us3-wave.mjs";

const batch = process.argv[process.argv.indexOf("--batch") + 1];
if (!US3_KNOWLEDGE[batch]) { console.error("usage: check-us3-grapes.mjs --batch core|rest"); process.exit(2); }
const s = JSON.parse(await readFile(US3_KNOWLEDGE[batch], "utf8"));
const names = [...new Set(Object.values(s.places).flatMap((p) => (p.grapes ?? []).map((g) => g.name)))];
const missing = await withReadOnly(async (c) => {
  const { rows } = await c.query("select name from public.grapes where name = any($1::text[])", [names]);
  const have = new Set(rows.map((r) => r.name));
  return names.filter((n) => !have.has(n) && !(s.new_grapes ?? []).some((g) => g.name === n));
});
console.log(JSON.stringify({ grapes: names.length, missing }));
if (missing.length) process.exitCode = 1;
```

`scripts/usa-map/render-usa-us3-review.mjs`:

```js
// node scripts/usa-map/render-usa-us3-review.mjs --batch core|rest
// Writes data/wine-map/review/usa-us3-<batch>-knowledge-<n>.md (at most 40
// places each, §18) from the batch's knowledge file, and, when the batch's
// rehearsal evidence exists, its shortlist, nearby and dots sections.
import { readFile, writeFile } from "node:fs/promises";
import { reviewChunks, US3_KNOWLEDGE } from "./us3-wave.mjs";
import { mergeSources, us3ReviewMarkdown } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";

export const reviewPath = (batch, n) => `data/wine-map/review/usa-us3-${batch}-knowledge-${n}.md`;
export const rehearsalPath = (batch) => `data/wine-map/review/usa-us3-${batch}-rehearsal.json`;
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const maybe = async (p) => { try { return await json(p); } catch { return null; } };

export async function renderReview(batch) {
  const wave = await loadWave(`us3-${batch}`);
  const source = await json(wave.knowledgeSource);
  const us2 = await json("data/wine-map/place-profiles-usa.json");
  const core = batch === "core" ? source : await json(US3_KNOWLEDGE.core);
  const allSource = mergeSources(us2, core, ...(batch === "rest" ? [source] : []));
  const rehearsal = await maybe(rehearsalPath(batch));
  const chunks = reviewChunks(wave.places);
  return chunks.map((chunk, i) => [reviewPath(batch, i + 1), us3ReviewMarkdown({
    source, wave, keys: chunk.map((p) => p.key), part: i + 1, parts: chunks.length, allSource, rehearsal,
  })]);
}

if (process.argv[1]?.endsWith("render-usa-us3-review.mjs")) {
  const batch = process.argv[process.argv.indexOf("--batch") + 1];
  if (!["core", "rest"].includes(batch)) { console.error("usage: render-usa-us3-review.mjs --batch core|rest"); process.exit(2); }
  for (const [path, text] of await renderReview(batch)) { await writeFile(path, text); console.log(`wrote ${path}`); }
}
```

Add to the test file (the import at the top, the tests at the end):

```js
import { renderReview } from "./render-usa-us3-review.mjs";

for (const batch of ["core", "rest"]) {
  test(`the committed ${batch} review files are the render (once written)`, async (t) => {
    const parts = await renderReview(batch);
    for (const [path, text] of parts) {
      let committed;
      try { committed = (await readFile(path, "utf8")).replace(/\r\n/g, "\n"); } catch { t.skip(`${path} not rendered yet`); return; }
      assert.equal(committed, text, path);
    }
  });
}
```

- [ ] **Step 4: The skeletons.** Add `data/wine-map/place-profiles-usa-us3-*.json -text` to `.gitattributes` (after the `place-profiles-usa.json` line). Write `data/wine-map/place-profiles-usa-us3-core.json` (LF):

```json
{
  "_provenance": {
    "what": "Details-panel knowledge for the United States wine map, US-3 core batch: 86 California AVAs (spec docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §10; plan docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md). Turned into supabase/migrations/20260930164747_usa_us3_core_knowledge.sql by scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa-us3-core.json --bare.",
    "wave": "us3-core",
    "status": "DRAFT",
    "owner_approval": null,
    "written_in_session": "From 2026-09-30, from public sources only (listed under each place); no API batch (AGENTS.md).",
    "rules": "Plain English, no praise words, figures only where a listed source publishes them, never 'official boundary' (spec §18). Exactly one key fact 'Established YYYY (27 CFR 9.N)', as TTB lists it. Descriptions of 2-4 sentences, at most 700 characters. At most 8 grapes; the 1-3 signature grapes are PRINCIPAL and the rest ACCESSORY. At least two sources per place, one of them the CFR section or the Federal Register final rule. share_pct is left out."
  },
  "new_grapes": [],
  "places": {}
}
```

and `data/wine-map/place-profiles-usa-us3-rest.json` the same with "US-3 rest batch: 64 California AVAs", `20260930204747_usa_us3_rest_knowledge.sql`, `place-profiles-usa-us3-rest.json` and `"wave": "us3-rest"`.

- [ ] **Step 5: Run.** `node --test scripts/usa-map/usa-us3-knowledge.test.mjs`. Expected: PASS; the two "committed … file" tests and the two review tests skip. `node --test scripts/usa-map/usa-knowledge.test.mjs` still passes (US-2 untouched).
- [ ] **Step 6: Commit** the modules, CLIs, test, skeletons and `.gitattributes`: "feat(usa-map): the US-3 knowledge rule (Established fact, limits, no copied text), ordering, grape check, review renderer".

---

## Knowledge conventions (Tasks 6–14)

Every knowledge task follows these, and its places' briefs. This is writing work done in session: WebSearch/WebFetch for sources, then your own prose. **No script generates text, and nothing calls the Anthropic API.**

**Per place, write** into the batch's data file under `places["<key>"]`:

- `article.description`: 2–4 sentences, at most 700 characters: where it is, what distinguishes it, and why a taster would care. Name the AVA as its legal name. For an AVA keyed under something a reader may not expect (the tree review's list), say plainly where it lies (e.g. El Dorado: "…in the Sierra Nevada foothills…") without mentioning keys or the map.
- `article.climate` and `article.soils`: each ≥ 40 characters, from the final rule's "distinguishing features" (climate, soils, topography) wherever it has them.
- `article.grape_varieties` and `article.wine_styles`: one or two plain sentences each, ≥ 40 characters.
- `article.key_facts`: 3–6, each 10–200 characters. **Exactly one** is `Established YYYY (27 CFR 9.N)`, with the year and section from `data/wine-map/review/usa-us3-fact-sheet.md`. Others: the counties (from the fact sheet), an elevation or distance rule written into the CFR text, a published acreage, a name history — each supported by a listed source.
- `grapes`: 1–8, each a catalog name exactly as in Global Constraints. The 1–3 signature grapes have no `role` (PRINCIPAL); every other has `"role": "ACCESSORY"`. Only grapes a listed source names for this AVA. No `share_pct`.
- `styles`: from `RED`, `WHITE`, `ROSE`, `SPARKLING`, `SWEET`, `FORTIFIED`, most important first; only what a source supports.
- `sources`: ≥ 2 `{ "title", "url" }` with https URLs. One must be the eCFR section (`https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-9.N`) or the Federal Register final rule that established or last revised the AVA (federalregister.gov / govinfo.gov). Fetch each page and check every fact against it.

**Where to look, in this order:** the final rule in the Federal Register ("Establishment of the … Viticultural Area", TTB T.D. number; its "Distinguishing Features" and "Name Evidence" sections are authoritative for climate, soils, topography and history); the eCFR section (boundary text, elevation lines); TTB's established-AVA list; the regional association (Napa Valley Vintners napavintners.com, Sonoma County Winegrowers sonomawinegrape.org / sonomawine.com, Mendocino Winegrape & Wine Commission mendowine.com, Lake County Winegrape Commission, Santa Cruz Mountains Winegrowers, Livermore Valley Winegrowers lvwine.org, Monterey County Vintners & Growers montereywines.org, Paso Robles Wine Country Alliance pasowine.com, San Luis Obispo Coast Wine slocoastwine.com, Santa Barbara Vintners sbcountywines.com, Lodi Winegrape Commission lodiwine.com, El Dorado Winery Association, Amador Vintners, Temecula Valley Winegrowers, Wine Institute discovercaliforniawines.com); UC Davis's AVA files (`boundary_description`). The Oxford Companion, Jancis Robinson and WSET material may confirm a fact, but cite a fetchable page for each.

**Copy rules (§18):** plain English; no praise or hype (the validator's list); facts the sources support; "generalized digitization", never "official/legal boundary"; no figure without a published source.

**The briefs.** Each task lists its places with a starting hypothesis: signature grapes (PRINCIPAL) · accessory grapes | styles | facts to verify and use if a source confirms them. The hypothesis is the plan's decision unless a source contradicts it: change it only with a cited reason, and say so in the commit body. Drop a fact no source confirms. A row marked **(thin)** has little published material: take the grapes and styles only from what the final rule or the petition (regulations.gov docket) names as planted; the PRINCIPAL grape is the most-planted one named.

**Stop rule.** If after the final rule, the eCFR text, the petition and one regional source no grape is named for a place, do not guess: add the key to `_provenance.research_gaps` (an array of `{ key, searched: [urls] }`) and report it in your final message. The batch cannot promote until the main session resolves it (the promote's coverage assert refuses a place with no grape).

**Every knowledge task ends with the same steps:**

1. `node scripts/usa-map/order-us3-profiles.mjs --batch <batch>` (places back in wave order);
2. `node --test scripts/usa-map/usa-us3-knowledge.test.mjs` → PASS (the "places written so far" test runs on every place written so far; fix the content, never the rule);
3. `node scripts/usa-map/check-us3-grapes.mjs --batch <batch>` (read-only) → `"missing":[]`;
4. commit the data file: "data(usa-map): US-3 <batch> knowledge, <group> (<n> places, provisional copy)".

---

### Task 6: Knowledge, core group 1: Napa Valley and its 15 sub-AVAs (16 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-core.json`. Test: the Knowledge-conventions steps.

Keys are under `united-states.california.north-coast.`; sub-AVAs under `…napa-valley.`. Every sub-AVA: say in `grape_varieties` or a key fact that a wine labelled with it must also name Napa Valley (conjunctive labelling: find the section of the California Business and Professions Code that requires it, fetch its text, and cite it in Napa Valley's sources and in each sub-AVA's).

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `napa-valley` | Cabernet Sauvignon · Merlot, Chardonnay, Sauvignon Blanc, Cabernet Franc, Zinfandel, Pinot Noir | RED, WHITE, SPARKLING | California's first AVA; between the Mayacamas and Vaca ranges; the nested AVAs (count them from TTB); Napa Valley Vintners' published share of California's crop; conjunctive labelling |
| `napa-valley.atlas-peak` | Cabernet Sauvignon · Chardonnay, Merlot, Sangiovese | RED, WHITE | a bowl in the Vaca Range above the valley floor; elevation from the CFR text; volcanic soils; less fog |
| `napa-valley.calistoga` | Cabernet Sauvignon · Zinfandel, Petite Sirah, Syrah, Cabernet Franc | RED, WHITE | the valley's northern end below Mount St. Helena; the final rule's name-use (grandfather) provision; volcanic soils |
| `napa-valley.chiles-valley` | Cabernet Sauvignon · Zinfandel, Merlot, Sauvignon Blanc | RED, WHITE | a separate valley in the Vaca Range, higher, cooler nights |
| `napa-valley.coombsville` | Cabernet Sauvignon · Merlot, Chardonnay, Pinot Noir, Syrah | RED, WHITE | southeast of the city of Napa, a crescent of hills; cooled by San Pablo Bay; volcanic tuff |
| `napa-valley.crystal-springs-of-napa-valley` | Cabernet Sauvignon · Merlot, Sauvignon Blanc | RED, WHITE | 2024; the name's source and location as the final rule states them |
| `napa-valley.diamond-mountain-district` | Cabernet Sauvignon · Cabernet Franc, Merlot, Petit Verdot | RED | Mayacamas slopes southwest of Calistoga; volcanic soils |
| `napa-valley.howell-mountain` | Cabernet Sauvignon · Zinfandel, Merlot, Cabernet Franc | RED, WHITE | the first AVA established inside Napa Valley; its elevation line in the CFR text; volcanic and iron-red soils |
| `napa-valley.mt-veeder` | Cabernet Sauvignon · Zinfandel, Syrah, Malbec, Chardonnay | RED, WHITE | southern Mayacamas; soils as the final rule describes them (marine sedimentary per most sources) |
| `napa-valley.oak-knoll-district-of-napa-valley` | Cabernet Sauvignon · Merlot, Chardonnay, Sauvignon Blanc, Riesling | RED, WHITE | the valley floor's southern end north of Napa; cooler than up-valley; the legal name's "of Napa Valley" |
| `napa-valley.oakville` | Cabernet Sauvignon · Merlot, Cabernet Franc, Sauvignon Blanc | RED, WHITE | valley floor from the Mayacamas to the Vaca foothills; gravelly alluvial fans |
| `napa-valley.rutherford` | Cabernet Sauvignon · Merlot, Cabernet Franc, Sauvignon Blanc | RED, WHITE | benchland alluvial fans; "Rutherford dust" only as a quoted local phrase with a source |
| `napa-valley.spring-mountain-district` | Cabernet Sauvignon · Merlot, Cabernet Franc, Petite Sirah, Chardonnay, Riesling | RED, WHITE | Mayacamas slopes west of St. Helena; elevation from the CFR text |
| `napa-valley.st-helena` | Cabernet Sauvignon · Merlot, Cabernet Franc, Sauvignon Blanc, Zinfandel | RED, WHITE | the valley's narrow middle; warmer |
| `napa-valley.stags-leap-district` | Cabernet Sauvignon · Merlot, Cabernet Franc, Petit Verdot | RED | the rock palisades on its east side; afternoon air from San Pablo Bay; a Stag's Leap Wine Cellars 1973 Cabernet Sauvignon placed first among the reds at the 1976 Paris tasting (cite) |
| `napa-valley.yountville` | Cabernet Sauvignon · Merlot, Chardonnay, Sauvignon Blanc | RED, WHITE | the southern floor around the Yountville hills; cooler |

- [ ] **Step 1:** Research and write the 16 entries. **Step 2–5:** the Knowledge-conventions steps 1–4 (commit "data(usa-map): US-3 core knowledge, Napa Valley (16 places, provisional copy)").

---

### Task 7: Knowledge, core group 2: Los Carneros, Wild Horse Valley and Sonoma (20 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-core.json`.

Keys under `united-states.california.north-coast.`. Sonoma County AVAs: say once where a source supports it that wines labelled with a Sonoma County AVA must also carry "Sonoma County" (California's conjunctive-labelling law for Sonoma County; fetch and cite the statute). Russian River Valley's relation to Sonoma Coast is an overlap, not containment: write "most of it lies within Sonoma Coast too" only if the final rules say so, never "within".

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `los-carneros` | Pinot Noir, Chardonnay · Merlot, Syrah | RED, WHITE, SPARKLING | spans Napa and Sonoma counties at San Pablo Bay; shallow clay-loam soils; wind and fog from the bay; sparkling production |
| `wild-horse-valley` | Pinot Noir, Chardonnay | RED, WHITE | spans Napa and Solano counties; volcanic; cool and elevated (final rule) |
| `northern-sonoma` | Cabernet Sauvignon, Chardonnay, Zinfandel · Pinot Noir, Sauvignon Blanc, Merlot | RED, WHITE | the umbrella over Alexander, Dry Creek, Knights and Russian River valleys; its petitioner (final rule) |
| `northern-sonoma.alexander-valley` | Cabernet Sauvignon · Merlot, Chardonnay, Zinfandel, Sauvignon Blanc | RED, WHITE | the upper Russian River valley, warm, the Mayacamas to the east |
| `northern-sonoma.dry-creek-valley` | Zinfandel · Cabernet Sauvignon, Sauvignon Blanc, Petite Sirah, Merlot | RED, WHITE | a narrow valley; gravel benchlands; old-vine Zinfandel and Italian field blends (Dry Creek Valley winegrowers) |
| `northern-sonoma.knights-valley` | Cabernet Sauvignon · Sauvignon Blanc, Merlot, Cabernet Franc | RED, WHITE | below Mount St. Helena, east of Alexander Valley; volcanic; the county's warmest (source) |
| `northern-sonoma.russian-river-valley` | Pinot Noir, Chardonnay · Zinfandel, Sauvignon Blanc, Syrah | RED, WHITE, SPARKLING | fog through the Petaluma Gap and the river; Goldridge sandy loam; boundary revisions (dates from the rules) |
| `northern-sonoma.russian-river-valley.chalk-hill` | Chardonnay · Sauvignon Blanc, Cabernet Sauvignon, Merlot | WHITE, RED | the pale soil is volcanic, not chalk (cite); warmer than most of the Russian River Valley |
| `northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley` | Pinot Noir, Chardonnay | RED, WHITE, SPARKLING | the name change from "Sonoma County Green Valley" (rule and year); among the valley's coolest, foggiest parts; Goldridge soil |
| `sonoma-coast` | Pinot Noir, Chardonnay · Syrah, Zinfandel | RED, WHITE, SPARKLING | the county's largest AVA, from the Pacific toward San Pablo Bay (CFR text); marine influence |
| `sonoma-coast.west-sonoma-coast` | Pinot Noir, Chardonnay · Syrah | RED, WHITE | 2022; the coastal ridges nearest the ocean; the final rule's distinguishing features |
| `sonoma-coast.west-sonoma-coast.fort-ross-seaview` | Pinot Noir, Chardonnay · Syrah, Zinfandel | RED, WHITE | its elevation floor in the CFR text; ridge-top vineyards above the marine layer |
| `petaluma-gap` | Pinot Noir · Chardonnay, Syrah | RED, WHITE | spans Sonoma and Marin; defined by wind through the gap (the final rule's wind data) |
| `rockpile` | Zinfandel · Cabernet Sauvignon, Petite Sirah, Syrah | RED | ridges above Lake Sonoma; its elevation floor in the CFR text |
| `pine-mountain-cloverdale-peak` | Cabernet Sauvignon · Merlot, Cabernet Franc, Malbec | RED | spans Mendocino and Sonoma; its elevation band in the CFR text |
| `fountaingrove-district` | Cabernet Sauvignon · Merlot, Syrah, Zinfandel, Chardonnay | RED, WHITE | Mayacamas slopes east of Santa Rosa; the name's history (final rule) |
| `sonoma-valley` | Cabernet Sauvignon, Chardonnay, Zinfandel · Merlot, Pinot Noir, Syrah | RED, WHITE | between the Mayacamas and Sonoma mountains; cooler south, warmer north; its 19th-century history as the final rule or the county tells it |
| `sonoma-valley.bennett-valley` | Merlot, Pinot Noir, Chardonnay · Syrah, Sauvignon Blanc | RED, WHITE | ringed by Bennett Peak, Sonoma Mountain and Taylor Mountain; cool air through a gap (final rule) |
| `sonoma-valley.moon-mountain-district-sonoma-county` | Cabernet Sauvignon, Zinfandel · Merlot, Syrah | RED | western Mayacamas slopes above Sonoma Valley; volcanic; elevation (final rule) |
| `sonoma-valley.sonoma-mountain` | Cabernet Sauvignon · Pinot Noir, Chardonnay, Zinfandel | RED, WHITE | slopes above the valley's fog (the final rule's thermal belt) |

- [ ] **Step 1:** Research and write the 20 entries. **Steps 2–5:** the Knowledge-conventions steps (commit "…, Los Carneros, Wild Horse Valley and Sonoma (20 places, …)").

---

### Task 8: Knowledge, core group 3: Mendocino and Lake, the Bay Area, Monterey (15 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-core.json`.

Keys under `united-states.california.`.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `north-coast.mendocino` | Chardonnay, Pinot Noir, Zinfandel · Cabernet Sauvignon, Sauvignon Blanc, Petite Sirah, Carignan | RED, WHITE, SPARKLING | the county's inland valleys plus Anderson Valley; old-vine Carignan; organic acreage only with a published figure |
| `north-coast.mendocino.anderson-valley` | Pinot Noir, Chardonnay · Gewürztraminer, Riesling, Pinot Gris | RED, WHITE, SPARKLING | the Navarro River corridor to the Pacific; fog; sparkling wine |
| `north-coast.mendocino-ridge` | Zinfandel · Pinot Noir, Syrah | RED | only land above an elevation line (CFR text), so non-contiguous; the first such AVA if the final rule says so |
| `north-coast.clear-lake` | Cabernet Sauvignon, Sauvignon Blanc · Zinfandel, Petite Sirah, Merlot | RED, WHITE | around Clear Lake (its size as a source gives it); elevation |
| `north-coast.clear-lake.red-hills-lake-county` | Cabernet Sauvignon · Zinfandel, Petite Sirah, Syrah, Merlot | RED | the flanks of Mount Konocti; volcanic red soils with obsidian |
| `central-coast.san-francisco-bay` | Cabernet Sauvignon, Chardonnay · Petite Sirah, Zinfandel, Pinot Noir | RED, WHITE | its counties (fact sheet); holds Livermore Valley, Santa Cruz Mountains and Santa Clara Valley; bay and ocean influence |
| `central-coast.san-francisco-bay.livermore-valley` | Cabernet Sauvignon, Chardonnay · Sauvignon Blanc, Semillon, Petite Sirah, Zinfandel | RED, WHITE | an east–west valley open to bay air; gravel soils; 19th-century plantings and the Wente Chardonnay selection (cite) |
| `central-coast.san-francisco-bay.santa-cruz-mountains` | Pinot Noir, Cabernet Sauvignon, Chardonnay · Merlot, Zinfandel | RED, WHITE | defined by elevation lines on the mountains (CFR text); a Ridge Monte Bello Cabernet Sauvignon at the 1976 Paris tasting (cite) |
| `central-coast.monterey` | Chardonnay, Pinot Noir · Cabernet Sauvignon, Merlot, Riesling, Sauvignon Blanc, Syrah | RED, WHITE | the Salinas Valley funnels wind from Monterey Bay; low rainfall and irrigation |
| `central-coast.monterey.arroyo-seco` | Chardonnay, Riesling · Pinot Noir, Cabernet Sauvignon, Sauvignon Blanc | WHITE, RED | the Arroyo Seco's gorge and fan; cobbled soils |
| `central-coast.monterey.santa-lucia-highlands` | Pinot Noir, Chardonnay · Syrah | RED, WHITE | benches on the Santa Lucia Range's east slope above the Salinas Valley; afternoon wind |
| `central-coast.carmel-valley` | Cabernet Sauvignon, Merlot · Chardonnay, Pinot Noir | RED, WHITE | a sheltered valley inland from Carmel, higher and warmer than the coast |
| `central-coast.gabilan-mountains` | Pinot Noir, Chardonnay | RED, WHITE | **(thin)** 2022; spans Monterey and San Benito; holds Chalone and Mt. Harlan; the final rule's features |
| `central-coast.gabilan-mountains.chalone` | Chardonnay, Pinot Noir · Chenin Blanc, Pinot Blanc | WHITE, RED | limestone and granite on the Gabilan Range; dry and high |
| `central-coast.gabilan-mountains.mt-harlan` | Pinot Noir · Chardonnay, Viognier | RED, WHITE | limestone; elevation (CFR text); Calera's petition (final rule) |

- [ ] **Step 1:** Research and write the 15 entries. **Steps 2–5:** the Knowledge-conventions steps (commit "…, Mendocino and Lake, the Bay Area and Monterey (15 places, …)").

---

### Task 9: Knowledge, core group 4: San Luis Obispo County (15 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-core.json`.

Keys under `united-states.california.central-coast.`. The eleven Paso Robles districts share one 2014 final rule: fetch it once, and use each district's own section of its "Distinguishing Features". Their grapes come from that rule and pasowine.com's district pages. Every district: the conjunctive-labelling rule for Paso Robles if a source states it (cite it).

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `paso-robles` | Cabernet Sauvignon, Zinfandel · Syrah, Grenache, Mourvèdre, Petite Sirah, Merlot, Viognier | RED, WHITE, ROSE | wide day-to-night temperature swings (a figure only if published); calcareous soils in the west; divided into eleven districts in 2014 |
| `paso-robles.adelaida-district` | Cabernet Sauvignon, Syrah · Grenache, Mourvèdre, Zinfandel, Roussanne | RED, WHITE | west side; calcareous soils; higher and cooler |
| `paso-robles.creston-district` | Cabernet Sauvignon · Syrah, Zinfandel, Merlot | RED | southeast; elevation (2014 rule) |
| `paso-robles.el-pomar-district` | Cabernet Sauvignon · Zinfandel, Syrah, Merlot | RED | central; marine air from the Templeton Gap (2014 rule) |
| `paso-robles.paso-robles-estrella-district` | Cabernet Sauvignon · Syrah, Zinfandel, Merlot | RED | the Estrella River plain, northeast |
| `paso-robles.paso-robles-geneseo-district` | Cabernet Sauvignon · Syrah, Zinfandel | RED | east; benchland (2014 rule) |
| `paso-robles.paso-robles-highlands-district` | Cabernet Sauvignon · Syrah, Zinfandel, Grenache | RED | southeast; highest elevations and widest swings (2014 rule) |
| `paso-robles.paso-robles-willow-creek-district` | Syrah, Grenache, Zinfandel · Mourvèdre, Cabernet Sauvignon | RED, WHITE, ROSE | west; calcareous soils; marine air |
| `paso-robles.san-juan-creek` | Cabernet Sauvignon · Syrah, Zinfandel | RED | the far east; warm and dry |
| `paso-robles.san-miguel-district` | Cabernet Sauvignon · Syrah, Zinfandel, Petite Sirah | RED | the north, along the Salinas River |
| `paso-robles.santa-margarita-ranch` | Cabernet Sauvignon · Syrah | RED | **(thin)** the southern end; a single ranch (2014 rule) |
| `paso-robles.templeton-gap-district` | Zinfandel, Cabernet Sauvignon · Syrah, Merlot | RED | the gap in the Santa Lucia Range that admits marine air |
| `san-luis-obispo-coast` | Chardonnay, Pinot Noir · Syrah, Albariño | RED, WHITE | 2022; the coastal strip (distance rule in the CFR text); marine influence |
| `san-luis-obispo-coast.edna-valley` | Chardonnay, Pinot Noir · Syrah, Albariño | RED, WHITE | open to Morro Bay air; the volcanic Morros (source) |
| `san-luis-obispo-coast.arroyo-grande-valley` | Pinot Noir, Chardonnay · Zinfandel, Syrah | RED, WHITE, SPARKLING | cool at the coast end, warmer inland; sparkling wine (source) |

- [ ] **Step 1:** Research and write the 15 entries. **Steps 2–5:** the Knowledge-conventions steps (commit "…, San Luis Obispo County (15 places, …)").

---

### Task 10: Knowledge, core group 5: Santa Barbara, Lodi, the Sierra Foothills AVAs, Temecula Valley (20 places), and the core approval

**Files:** Modify `data/wine-map/place-profiles-usa-us3-core.json`.

Keys under `united-states.california.`. Lodi's seven: lodiwine.com has a page per AVA; the 2006 final rule covers all seven.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `central-coast.santa-maria-valley` | Chardonnay, Pinot Noir · Syrah | RED, WHITE | an east–west valley open to the Pacific (transverse ranges); among the first AVAs (1981) |
| `central-coast.santa-ynez-valley` | Chardonnay, Pinot Noir, Syrah · Sauvignon Blanc, Cabernet Sauvignon, Grenache | RED, WHITE, ROSE | cool in the west to warm in the east; holds four AVAs |
| `central-coast.santa-ynez-valley.sta-rita-hills` | Pinot Noir, Chardonnay · Syrah | RED, WHITE | renamed from "Santa Rita Hills" to "Sta. Rita Hills" after an objection by Viña Santa Rita (cite TTB or the Federal Register); marine air along the Santa Ynez River |
| `central-coast.santa-ynez-valley.ballard-canyon` | Syrah · Grenache, Mourvèdre, Roussanne | RED, WHITE | a north–south canyon between the cooler west and warmer east; the growers' Syrah focus (source) |
| `central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara` | Cabernet Sauvignon, Sauvignon Blanc · Merlot, Cabernet Franc, Syrah | RED, WHITE | the Santa Ynez Valley's warmest part; serpentine soils if the rule says so |
| `central-coast.santa-ynez-valley.los-olivos-district` | Sauvignon Blanc, Syrah, Cabernet Sauvignon · Grenache, Merlot | RED, WHITE | an alluvial terrace (2016 rule) |
| `central-coast.alisos-canyon` | Syrah · Grenache, Mourvèdre | RED | **(thin)** 2020; the final rule's features |
| `central-valley.lodi` | Zinfandel · Cabernet Sauvignon, Chardonnay, Petite Sirah, Merlot, Syrah | RED, WHITE, ROSE | Delta breezes; sandy soils in the west; old vines; the Lodi Rules sustainability programme; a Zinfandel share only if published |
| `central-valley.lodi.alta-mesa` | Zinfandel · Cabernet Sauvignon | RED | (lodiwine.com; 2006 rule) |
| `central-valley.lodi.borden-ranch` | Zinfandel, Cabernet Sauvignon | RED | foothill terraces (2006 rule) |
| `central-valley.lodi.clements-hills` | Zinfandel, Cabernet Sauvignon | RED | rolling hills in the east (2006 rule) |
| `central-valley.lodi.cosumnes-river` | Zinfandel · Chardonnay, Cabernet Sauvignon | RED, WHITE | nearest the Delta; cooler (2006 rule) |
| `central-valley.lodi.jahant` | Zinfandel · Cabernet Sauvignon | RED | (2006 rule) |
| `central-valley.lodi.mokelumne-river` | Zinfandel · Cinsault, Carignan, Cabernet Sauvignon, Chardonnay, Petite Sirah | RED, WHITE | sandy soils; ungrafted old vines (source) |
| `central-valley.lodi.sloughhouse` | Zinfandel · Cabernet Sauvignon, Syrah | RED | (2006 rule) |
| `el-dorado` | Zinfandel, Syrah · Barbera, Cabernet Sauvignon, Grenache, Viognier | RED, WHITE | in the Sierra Nevada foothills; its elevation band (CFR text); granite and volcanic soils; Gold Rush history if a source links it |
| `el-dorado.fair-play` | Zinfandel, Syrah · Barbera, Grenache | RED, WHITE | the higher part of El Dorado County; elevation band (CFR text) |
| `sierra-foothills.california-shenandoah-valley` | Zinfandel · Barbera, Syrah, Sangiovese | RED | spans Amador and El Dorado; old-vine Zinfandel (a named vineyard only with a source) |
| `sierra-foothills.fiddletown` | Zinfandel · Barbera, Syrah | RED | Amador; higher than Shenandoah Valley |
| `south-coast.temecula-valley` | Cabernet Sauvignon, Syrah · Sangiovese, Tempranillo, Viognier, Chardonnay | RED, WHITE, ROSE | Pacific air through the Rainbow Gap; decomposed granite; the name change from "Temecula" if the rule records it |

- [ ] **Step 1:** Research and write the 20 entries.
- [ ] **Step 2: Record the approval.** With all 86 places written and the file green, set `_provenance.status` to `"APPROVED"` and `_provenance.owner_approval` to:

```json
{ "answer": "Owner waived the copy review on 2026-09-30 (\"ignore my friends changes and just go ahead. no need for my review\"). Written in session from the sources listed under each place; read by the main session in data/wine-map/review/usa-us3-core-knowledge-*.md.", "date": "2026-09-30" }
```

- [ ] **Steps 3–6:** the Knowledge-conventions steps. The "committed core knowledge file" test now also asserts 86 places and the waiver text. Commit "data(usa-map): US-3 core knowledge, Santa Barbara, Lodi, Sierra Foothills, Temecula (20 places); core file complete, approved under the owner's waiver".

---

### Task 11: Knowledge, rest group 1: North Coast (16 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-rest.json`.

Keys under `united-states.california.north-coast.`. Cole Ranch and High Valley are keyed under North Coast (tree review): describe where they lie, never "within Mendocino"/"within Clear Lake".

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `benmore-valley` | Chardonnay | WHITE | **(thin)** a high Lake County valley (CFR elevation) |
| `clear-lake.big-valley-district-lake-county` | Sauvignon Blanc · Cabernet Sauvignon, Zinfandel | WHITE, RED | the flat south of Clear Lake; lake influence (2013 rule) |
| `clear-lake.kelsey-bench-lake-county` | Cabernet Sauvignon · Sauvignon Blanc, Zinfandel | RED, WHITE | benches west of Kelseyville (2013 rule) |
| `clear-lake.upper-lake-valley` | Sauvignon Blanc, Cabernet Sauvignon | WHITE, RED | **(thin)** north of Clear Lake (2022 rule) |
| `cole-ranch` | Cabernet Sauvignon, Riesling · Chardonnay | RED, WHITE | its size (TTB or the rule; often called the smallest AVA — only with a source); a single ranch in the hills between Ukiah and Boonville |
| `comptche` | Pinot Noir, Chardonnay | RED, WHITE | **(thin)** 2024; coastal Mendocino (rule) |
| `eagle-peak-mendocino-county` | Pinot Noir | RED | **(thin)** 2014 rule |
| `guenoc-valley` | Cabernet Sauvignon, Petite Sirah · Sauvignon Blanc | RED, WHITE | a single-owner AVA; Lillie Langtry's 19th-century ranch (source) |
| `high-valley` | Sauvignon Blanc, Cabernet Sauvignon · Syrah | WHITE, RED | **(thin)** east of Clear Lake; elevation (2005 rule) |
| `long-valley-lake-county` | Cabernet Sauvignon | RED | **(thin)** 2023 rule |
| `mendocino.mcdowell-valley` | Syrah · Grenache | RED, ROSE | old Syrah vines (a planting year only with a source) |
| `mendocino.potter-valley` | Sauvignon Blanc, Pinot Noir · Riesling, Chardonnay | WHITE, RED | a high valley at the Russian River's headwaters; late-harvest Riesling only with a source (then add SWEET) |
| `mendocino.redwood-valley` | Zinfandel, Cabernet Sauvignon · Petite Sirah, Carignan | RED | inland Mendocino; red soils (rule) |
| `mendocino.yorkville-highlands` | Pinot Noir, Sauvignon Blanc · Chardonnay, Syrah | RED, WHITE | rocky, elevated ground between Anderson and Alexander valleys (rule) |
| `solano-county-green-valley` | Cabernet Sauvignon, Chardonnay | RED, WHITE | **(thin)** a small valley in Solano County (1982 rule); not the Sonoma Green Valley |
| `suisun-valley` | Petite Sirah, Cabernet Sauvignon · Syrah, Zinfandel | RED | marine air from Suisun Bay (rule) |

- [ ] **Step 1:** Research and write the 16 entries. **Steps 2–5:** the Knowledge-conventions steps with `--batch rest` (commit "data(usa-map): US-3 rest knowledge, North Coast (16 places, provisional copy)").

---

### Task 12: Knowledge, rest group 2: Central Coast and Contra Costa (15 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-rest.json`.

Keys under `united-states.california.`.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `central-coast.monterey.hames-valley` | Cabernet Sauvignon, Merlot | RED | **(thin)** the southern Salinas Valley (1994 rule) |
| `central-coast.monterey.san-bernabe` | Chardonnay, Cabernet Sauvignon, Merlot | WHITE, RED | **(thin)** a single large vineyard area (2004 rule) |
| `central-coast.monterey.san-lucas` | Cabernet Sauvignon, Chardonnay | RED, WHITE | **(thin)** 1987 rule |
| `central-coast.san-antonio-valley` | Cabernet Sauvignon, Syrah | RED | **(thin)** near Lake San Antonio (2006 rule) |
| `central-coast.san-benito` | Chardonnay, Pinot Noir | WHITE, RED | **(thin)** holds Cienega Valley, Lime Kiln Valley and Paicines |
| `central-coast.san-benito.cienega-valley` | Zinfandel, Cabernet Sauvignon · Pinot Noir, Mourvèdre | RED | the San Andreas Fault runs through it (source); old vineyards |
| `central-coast.san-benito.cienega-valley.lime-kiln-valley` | Zinfandel, Mourvèdre | RED | **(thin)** limestone (rule); old vines only with a source |
| `central-coast.san-benito.paicines` | Chardonnay, Cabernet Sauvignon | WHITE, RED | **(thin)** 1982 rule |
| `central-coast.san-francisco-bay.lamorinda` | Cabernet Sauvignon, Merlot · Pinot Noir, Chardonnay | RED, WHITE | the name from Lafayette, Moraga and Orinda (rule) |
| `central-coast.san-francisco-bay.santa-clara-valley` | Cabernet Sauvignon, Chardonnay · Petite Sirah, Zinfandel | RED, WHITE | the valley south of the bay; 19th-century wineries (source) |
| `central-coast.san-francisco-bay.santa-clara-valley.pacheco-pass` | Zinfandel, Merlot | RED | **(thin)** 1984 rule |
| `central-coast.san-francisco-bay.santa-clara-valley.san-ysidro-district` | Chardonnay, Merlot | WHITE, RED | **(thin)** 1990 rule |
| `central-coast.san-francisco-bay.santa-cruz-mountains.ben-lomond-mountain` | Pinot Noir, Chardonnay · Syrah | RED, WHITE | a ridge above the marine layer, near the ocean (rule) |
| `central-coast.york-mountain` | Pinot Noir, Zinfandel | RED | **(thin)** west of Templeton; a winery founded in the 1880s (source) |
| `contra-costa` | Zinfandel, Mourvèdre · Carignan | RED | 2024; sandy soils around Oakley with old ungrafted vines (rule or source) |

- [ ] **Step 1:** Research and write the 15 entries. **Steps 2–5:** the Knowledge-conventions steps with `--batch rest` (commit "…, Central Coast and Contra Costa (15 places, …)").

---

### Task 13: Knowledge, rest group 3: Central Valley members (11 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us3-rest.json`.

Keys under `united-states.california.central-valley.`. These AVAs are members of the Central Valley grouping on the map; do not call Central Valley an AVA anywhere.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `capay-valley` | Syrah, Tempranillo | RED | **(thin)** Yolo County (2002 rule) |
| `clarksburg` | Chenin Blanc · Petite Sirah, Chardonnay, Pinot Gris | WHITE, RED | the Sacramento River delta; Chenin Blanc's reputation there (source) |
| `clarksburg.merritt-island` | Chenin Blanc | WHITE | **(thin)** an island in the delta (1983 rule) |
| `diablo-grande` | Cabernet Sauvignon | RED | **(thin)** a single development in the Diablo Range (1998 rule) |
| `dunnigan-hills` | Chardonnay, Syrah | WHITE, RED | **(thin)** Yolo County hills (1993 rule) |
| `madera` | Muscat, Zinfandel · Chenin Blanc | WHITE, RED, SWEET, FORTIFIED | dessert and fortified wines only with a source (else drop SWEET/FORTIFIED); Fresno and Madera counties |
| `paulsell-valley` | Cabernet Sauvignon | RED | **(thin)** 2022 rule |
| `river-junction` | Chardonnay | WHITE | **(thin)** where the San Joaquin and Stanislaus rivers meet (2001 rule) |
| `salado-creek` | Cabernet Sauvignon | RED | **(thin)** 2004 rule |
| `tracy-hills` | Cabernet Sauvignon | RED | **(thin)** 2006 rule |
| `winters-highlands` | Cabernet Sauvignon | RED | **(thin)** 2023 rule |

- [ ] **Step 1:** Research and write the 11 entries (a (thin) hypothesis is replaced by whatever the rule names). **Steps 2–5:** the Knowledge-conventions steps with `--batch rest` (commit "…, Central Valley members (11 places, …)").

---

### Task 14: Knowledge, rest group 4: Southern California, the far north, and the Sierra (22 places), and the rest approval

**Files:** Modify `data/wine-map/place-profiles-usa-us3-rest.json`.

Keys under `united-states.california.`. Most are **(thin)**: grapes and styles only from the final rule, petition or the AVA's growers.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `antelope-valley-of-the-california-high-desert` | Cabernet Sauvignon, Zinfandel, Syrah | RED | **(thin)** high desert, Kern and Los Angeles (2011 rule) |
| `covelo` | Pinot Noir | RED | **(thin)** Mendocino (2006 rule) |
| `cucamonga-valley` | Zinfandel · Grenache | RED | the area's 19th-/20th-century vineyard history (source); old vines |
| `dos-rios` | Zinfandel | RED | **(thin)** 2005 rule |
| `inwood-valley` | Cabernet Sauvignon | RED | **(thin)** Shasta County (2012 rule) |
| `leona-valley` | Cabernet Sauvignon | RED | **(thin)** Los Angeles County (2008 rule) |
| `malibu-coast` | Cabernet Sauvignon, Syrah | RED | **(thin)** Los Angeles and Ventura (2014 rule) |
| `malibu-coast.malibu-newton-canyon` | Cabernet Sauvignon | RED | **(thin)** 1996 rule |
| `malibu-coast.saddle-rock-malibu` | Cabernet Sauvignon | RED | **(thin)** 2006 rule |
| `manton-valley` | Cabernet Sauvignon | RED | **(thin)** Shasta and Tehama (2014 rule) |
| `palos-verdes-peninsula` | Cabernet Sauvignon | RED | **(thin)** 2021 rule |
| `seiad-valley` | Cabernet Sauvignon | RED | **(thin)** Siskiyou County (1994 rule) |
| `sierra-foothills.north-yuba` | Cabernet Sauvignon | RED | **(thin)** 1985 rule |
| `sierra-pelona-valley` | Cabernet Sauvignon | RED | **(thin)** 2010 rule |
| `south-coast.ramona-valley` | Cabernet Sauvignon, Syrah | RED | **(thin)** San Diego County (2005 rule) |
| `south-coast.san-luis-rey` | Cabernet Sauvignon | RED | **(thin)** 2024 rule |
| `south-coast.san-pasqual-valley` | Cabernet Sauvignon | RED | **(thin)** 1981 rule |
| `squaw-valley-miramonte` | Cabernet Sauvignon, Syrah | RED | **(thin)** Fresno County, in the Sierra foothills (2015 rule) |
| `tehachapi-mountains` | Cabernet Sauvignon | RED | **(thin)** Kern County (2020 rule) |
| `trinity-lakes` | Pinot Noir | RED | **(thin)** 2005 rule |
| `willow-creek` | Pinot Noir | RED | **(thin)** Humboldt and Trinity (1983 rule) |
| `yucaipa-valley` | Cabernet Sauvignon | RED | **(thin)** 2024 rule |

- [ ] **Step 1:** Research and write the 22 entries.
- [ ] **Step 2: Record the approval** exactly as Task 10 Step 2, with "…read by the main session in data/wine-map/review/usa-us3-rest-knowledge-*.md." and status `"APPROVED"`. If `_provenance.research_gaps` is non-empty, **do not approve**: leave it DRAFT and report the gaps.
- [ ] **Steps 3–6:** the Knowledge-conventions steps with `--batch rest`. Commit "data(usa-map): US-3 rest knowledge, the south and the far north (22 places); rest file complete, approved under the owner's waiver".

---

### Task 15: Generate the two knowledge migrations

**Files:**
- Create (generated): `supabase/migrations/20260930164747_usa_us3_core_knowledge.sql`, `supabase/migrations/20260930204747_usa_us3_rest_knowledge.sql`
- Test: `scripts/usa-map/usa-us3-knowledge.test.mjs` (two tests added)

**Interfaces:**
- Consumes: the approved data files (Tasks 10 and 14), the catalog migrations (Task 3), the generator with repeatable `--prelude` (Task 4), `migrationIsCurrent` from `usa-knowledge.mjs`.

- [ ] **Step 1: Add the failing tests** to `usa-us3-knowledge.test.mjs` (the two imports go at the top of the file, the tests at the end):

```js
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { migrationIsCurrent } from "./usa-knowledge.mjs";

for (const batch of ["core", "rest"]) {
  test(`Review Focus 4: the ${batch} knowledge migration carries the data file exactly`, async () => {
    const w = waves[batch];
    const source = JSON.parse(await readFile(w.knowledgeSource, "utf8"));
    const sql = (await readFile(w.files.knowledge, "utf8")).replace(/\r\n/g, "\n");
    assert.deepEqual(migrationIsCurrent(source, sql), []);
    assert.deepEqual(topLevelTransactionStatements(sql), []);
    assert.equal((sql.match(/^insert into public\.wine_place_articles /gm) ?? []).length, w.places.length);
  });
}
```

- [ ] **Step 2: Run.** `node --test scripts/usa-map/usa-us3-knowledge.test.mjs`. Expected: FAIL, ENOENT on the knowledge migrations.
- [ ] **Step 3: Generate the core file.** Activity check first. Then:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa-us3-core.json --bare --prelude supabase/migrations/20260930154747_usa_us3_core_catalog.sql --write --version 20260930164747 --name usa_us3_core_knowledge
```

Expected: "prelude … applied inside a transaction that is rolled back", "86 places to write (united-states 86)", then the style/grape/article counts with "86 articles", and "wrote …/20260930164747_usa_us3_core_knowledge.sql". A "grape not in the catalog" refusal means a data-file name is wrong: fix the data file (Task 5's grape check should have caught it).
- [ ] **Step 4: Generate the rest file** (activity check first; two preludes, core then rest):

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa-us3-rest.json --bare --prelude supabase/migrations/20260930154747_usa_us3_core_catalog.sql --prelude supabase/migrations/20260930194747_usa_us3_rest_catalog.sql --write --version 20260930204747 --name usa_us3_rest_knowledge
```

Expected: two prelude lines, "64 places to write (united-states 64)", "64 articles".
- [ ] **Step 5: Run the tests.** Expected: PASS. Also `node --test scripts/usa-map/*.test.mjs` all green.
- [ ] **Step 6: Commit** both migrations and the test: "feat(usa-map): US-3 knowledge migrations, core (86) and rest (64), generated --bare (not applied)".

If a data file changes later (a correction), regenerate its migration with the same version and name (after the catalogs are live, drop the preludes), and re-run this task's test: it fails on any text, style position, role or count the migration does not carry.

---

### Task 16: The stage library, generalised for waves after US-2

**Files:**
- Modify: `scripts/wine-map-sources/usa-stage-lib.mjs`
- Test: `scripts/wine-map-sources/usa-stage-lib.test.mjs`

**Interfaces:**
- Consumes: a wave from `loadWave` (Task 1): `places`, `ucd`, `derived`, `outlineKeys`, and the new optional fields `priorKeys` (default `[]`), `scopeKey` (default `"united-states"`), `parentChecks` (default `[]`).
- Produces: `sittingGate(f)` with `f.waveBoundaries` (renamed from `usBoundaries`), `f.priorPromote`, `f.priorPromoted`; `readGateFacts(client, { versions, ownerApproval, treeMatches, waveKeys, priorPromote })`; `PARENT_SQL`; `stageWave(client, ctx)` whose report rows gain `parent_inside` (null where not checked). For US-2 (no prior keys, no parent checks) behaviour is unchanged.

- [ ] **Step 1: Update the gate test.** In `usa-stage-lib.test.mjs`'s "Review Focus 1 and 2: the sitting gate", replace `usBoundaries: 0` with `waveBoundaries: 0` and `usBoundaries: 16` with `waveBoundaries: 16`. Import `PARENT_SQL` alongside the existing imports, and append:

```js
test("Review Focus 3: after US-2, the previous wave's promote must be live; 'staged' means this wave's places", () => {
  const ok = {
    versions: { catalog: "c", knowledge: "k" }, catalogRecorded: true, knowledgeRecorded: true, promoteRecorded: false,
    ownerApproval: { answer: "waived", date: "2026-09-30" }, treeMatches: true,
    waveBoundaries: 0, otherDraftBoundaries: 0, buildingReleases: 0,
    priorPromote: "20260930174747", priorPromoted: true,
  };
  assert.deepEqual(sittingGate(ok), []);
  assert.deepEqual(sittingGate({ ...ok, priorPromoted: false }), ["the previous wave's promote 20260930174747 is not recorded live"]);
  assert.match(sittingGate({ ...ok, waveBoundaries: 86 }).join("\n"), /86 boundaries already exist on this wave's places/);
  assert.deepEqual(sittingGate({ ...ok, priorPromote: null, priorPromoted: false }), [], "US-2 has no previous wave");
});

test("parent containment is measured on the normalized source geometry, one row per place", () => {
  assert.match(PARENT_SQL, /jsonb_array_elements\(\$1::jsonb\)/);
  assert.match(PARENT_SQL, /ST_Area\(extensions\.ST_Intersection\(c, p\)\) \/ nullif\(extensions\.ST_Area\(c\), 0\) inside/);
  assert.doesNotMatch(PARENT_SQL, /Simplify/, "never the simplified shape: the tree measured the normalized one");
});
```

- [ ] **Step 2: Run.** `node --test scripts/wine-map-sources/usa-stage-lib.test.mjs`. Expected: FAIL (no `PARENT_SQL`; `waveBoundaries` ignored).

- [ ] **Step 3: Implement.** In `usa-stage-lib.mjs`:

(a) In `sittingGate`, replace the `usBoundaries` line with these two, the first placed right after the `treeMatches` line:

```js
  if (f.priorPromote && !f.priorPromoted) r.push(`the previous wave's promote ${f.priorPromote} is not recorded live`);
  if (f.waveBoundaries > 0) r.push(`${f.waveBoundaries} boundaries already exist on this wave's places (promote, or run the unstage file, first)`);
```

and change the `otherDraftBoundaries` message to `` `${f.otherDraftBoundaries} DRAFT boundaries outside this wave: someone else is mid-batch` ``.

(b) Add, after `CONTAINMENT_SQL`:

```js
// $1 jsonb [{key, child, parent}]: the normalized artifact geometries, exactly
// as the tree report measured them (spec D7, §8.2): never the simplified shape.
export const PARENT_SQL = `
with x as (select e->>'key' key, ${GEOM("(e->'child')::text")} c, ${GEOM("(e->'parent')::text")} p
             from jsonb_array_elements($1::jsonb) e)
select key, extensions.ST_Area(extensions.ST_Intersection(c, p)) / nullif(extensions.ST_Area(c), 0) inside
  from x order by key`;
```

(c) In `stageWave`, replace step 1 and step 2 (from `// 1. Nothing staged yet.` down to and including `if (differ.length) throw …;`) with:

```js
  const waveKeys = wave.places.map((p) => p.key);
  const priorKeys = wave.priorKeys ?? [];
  const scope = wave.scopeKey ?? "united-states";

  // 1. Nothing staged on this wave's places; every earlier wave live; no other
  //    boundary under the wave's scope (a half-staged neighbour batch).
  const existing = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where p.canonical_key = any($1::text[])`, [waveKeys]);
  if (existing.rows[0].n > 0) throw new Error(`${existing.rows[0].n} united-states boundaries already exist on this wave's places`);
  if (priorKeys.length) {
    const { rows } = await client.query(
      `select k.key, p.publication_status::text status,
              (select count(*)::int from public.wine_place_boundaries b
                where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') cur
         from unnest($1::text[]) k(key) left join public.wine_places p on p.canonical_key = k.key`, [priorKeys]);
    const notLive = rows.filter((r) => r.status !== "VERIFIED" || r.cur !== 1).map((r) => r.key);
    if (notLive.length) throw new Error(`an earlier wave is not live (VERIFIED with one current boundary): ${notLive.join(", ")}`);
  }
  const stray = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where (p.canonical_key = $1 or p.canonical_key like $1 || '.%')
        and not (p.canonical_key = any($2::text[]) or p.canonical_key = any($3::text[]))`, [scope, waveKeys, priorKeys]);
  if (stray.rows[0].n > 0) throw new Error(`${stray.rows[0].n} boundaries on other places under ${scope}`);

  // 2. Catalog fidelity, for this wave's places.
  const { rows: live } = await client.query(
    `select p.canonical_key key, p.kind::text kind, p.name, p.slug, p.display_tier, p.min_zoom, p.label_min_zoom,
            p.sort_order, p.is_appellation, p.appellation_system, p.appellation_level, p.publication_status::text status,
            pp.canonical_key parent_key
       from public.wine_places p left join public.wine_places pp on pp.id = p.primary_parent_id
      where p.canonical_key = any($1::text[])`, [waveKeys]);
  const liveByKey = new Map(live.map((r) => [r.key, r]));
  const differ = [];
  for (const p of wave.places) {
    const r = liveByKey.get(p.key);
    if (!r || r.kind !== p.kind || r.name !== p.name || r.slug !== p.slug || r.display_tier !== p.display_tier
      || Number(r.min_zoom) !== Number(p.min_zoom) || Number(r.label_min_zoom) !== Number(p.label_min_zoom)
      || r.sort_order !== p.sort_order || r.is_appellation !== p.is_appellation
      || r.appellation_system !== p.appellation_system || r.appellation_level !== p.appellation_level
      || r.parent_key !== p.parent_key || r.status !== "DRAFT") differ.push(p.key);
  }
  if (differ.length) throw new Error(`catalog differs from the wave: ${differ.join(", ")}`);
```

(d) In the build loop, the `row` literal gains `parent_inside: null,` after `datum_m: null,`.

(e) After the build loop and before `// 6. Containment`, insert:

```js
  // 5b. Parent containment (§8.2, D7), on the normalized source geometry, at
  //     the spec's thresholds, and equal to the tree report's measurement.
  const checks = wave.parentChecks ?? [];
  if (checks.length) {
    const input = checks.map((c) => {
      const u = ucdByKey.get(c.key);
      return { key: c.key, child: avaFeature(u.state, u.ucd_ava_id).geometry, parent: avaFeature(u.state, c.parent_ucd_ava_id).geometry };
    });
    const { rows } = await client.query(PARENT_SQL, [JSON.stringify(input)]);
    if (rows.length !== checks.length) throw new Error(`parent containment measured ${rows.length} of ${checks.length} places`);
    for (const r of rows) {
      const c = checks.find((x) => x.key === r.key);
      const b = built.find((x) => x.key === r.key);
      b.parent_inside = round(r.inside, 6);
      if (!(Number(r.inside) >= c.min)) throw new Error(`${r.key}: only ${b.parent_inside} inside its parent ${c.parent_key} (needs ${c.min}, ${c.basis})`);
      if (Math.abs(Number(r.inside) - c.tree_inside) > 1e-4) throw new Error(`${r.key}: parent share ${b.parent_inside} is not the tree report's ${c.tree_inside}`);
    }
  }
```

(f) In the insert loop's `log(...)`, append `` ` parent ${b.parent_inside ?? "-"}` `` to the message.

(g) Replace step 8's query and message with the wave's keys:

```js
  const final = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where p.canonical_key = any($1::text[]) and b.quality_status = 'DRAFT' and not b.is_current`, [waveKeys]);
  if (final.rows[0].n !== wave.places.length) {
    throw new Error(`expected ${wave.places.length} DRAFT, non-current boundaries on this wave's places, found ${final.rows[0].n}`);
  }
```

(h) Replace `readGateFacts` with:

```js
/** Read the live facts sittingGate needs. Reads only; safe inside a read-only transaction. */
export async function readGateFacts(client, { versions, ownerApproval, treeMatches, waveKeys, priorPromote = null }) {
  const recorded = async (v) => (await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const n = async (sql, params = []) => (await client.query(sql, params)).rows[0].n;
  return {
    versions,
    catalogRecorded: await recorded(versions.catalog),
    knowledgeRecorded: await recorded(versions.knowledge),
    promoteRecorded: await recorded(versions.promote),
    ownerApproval,
    treeMatches,
    priorPromote,
    priorPromoted: priorPromote ? await recorded(priorPromote) : true,
    waveBoundaries: await n(`select count(*)::int n from public.wine_place_boundaries b
      join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])`, [waveKeys]),
    otherDraftBoundaries: await n(`select count(*)::int n from public.wine_place_boundaries b
      join public.wine_places p on p.id = b.wine_place_id
      where not (p.canonical_key = any($1::text[])) and b.quality_status = 'DRAFT'`, [waveKeys]),
    buildingReleases: await n(`select count(*)::int n from public.wine_map_releases
      where status = 'BUILDING' and created_at > now() - interval '1 hour'`),
  };
}
```

`US_PLACES` stays for nothing else; delete it if unused (eslint).

- [ ] **Step 4: Run.** `node --test scripts/wine-map-sources/usa-stage-lib.test.mjs`. Expected: PASS. Then `npx eslint scripts/wine-map-sources/usa-stage-lib.mjs` → clean.
- [ ] **Step 5: Commit** "feat(wine-map-sources): stageWave after US-2: earlier waves live, wave-scoped counts, parent containment; the gate's priorPromoted".

---

### Task 17: `stage-usa-ava.mjs --wave`, and the core dry run

**Files:**
- Modify: `scripts/wine-map-sources/stage-usa-ava.mjs`

**Interfaces:**
- Consumes: `loadWave`, `WAVES` (Task 1); `readGateFacts`, `sittingGate`, `stageWave` (Task 16).
- Produces: the CLI `stage-usa-ava.mjs --wave us2|us3-core|us3-rest [--check-gate | --stage]`.

- [ ] **Step 1: Replace the file** with (the parts not shown as changed are US-2's, verbatim):

```js
// Stage a US wave's DRAFT boundaries (spec 2026-09-29 §8.2). Modelled on
// stage-germany-weinbau.mjs, with one transaction for the whole wave.
//
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave <us2|us3-core|us3-rest>
//     DEFAULT, dry: begin; the wave's catalog and knowledge migrations applied
//     inside the transaction if they are not recorded live yet; every boundary
//     built and asserted; rollback. Writes nothing, and never touches Storage.
//     A wave whose previous wave's promote is not live refuses (rehearse it
//     with scripts/usa-map/rehearse-us3.mjs instead).
//   ... --check-gate
//     Read-only: prints every reason --stage would refuse right now, and exits
//     1 if there is any. Never uploads, never writes.
//   ... --stage
//     THE SITTING ONLY (main session): refuses unless sittingGate() is empty;
//     uploads the raw UC Davis files the wave needs (idempotent by sha256);
//     begin; stageWave; commit; warns that the neighbour cache is stale until
//     the promote's refresh.
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { attributionKeyFor, releaseVersion, sha256hex, SUPABASE_URL } from "../wine-map-tiles/lib.mjs";
import { buildReports, loadInputs, reportPath, STATE_FILES } from "./build-usa-tree-reports.mjs";
import { warnIfNeighbourCacheStale } from "./neighbour-cache.mjs";
import { buildUsaTree } from "./usa-tree.mjs";
import {
  loadStageInputs, NE_NAMESPACE, readGateFacts, sittingGate, stageWave, UCD_NAMESPACE, uploadDecision,
} from "./usa-stage-lib.mjs";
import { loadWave, WAVES } from "../usa-map/waves.mjs";

const argv = process.argv.slice(2);
const waveArg = argv.includes("--wave") ? argv[argv.indexOf("--wave") + 1] : undefined;
if (!WAVES.includes(waveArg)) {
  console.error(`usage: stage-usa-ava.mjs --wave <${WAVES.join("|")}> [--check-gate | --stage]`);
  process.exit(2);
}
const STAGE = argv.includes("--stage");
const CHECK_GATE = argv.includes("--check-gate");
if (STAGE && CHECK_GATE) { console.error("--stage and --check-gate are exclusive"); process.exit(2); }
const lf = (s) => s.replace(/\r\n/g, "\n");

// 2. A namespace with no registry entry must fail here, not in a tiles run.
attributionKeyFor(UCD_NAMESPACE);
attributionKeyFor(NE_NAMESPACE);

// 3. The wave.
const wave = await loadWave(waveArg);
const waveKeys = wave.places.map((p) => p.key);
```

Keep US-2's steps 4–7 (tree equality, pinned inputs, connect) unchanged, except the log line becomes `` `wave ${wave.name}: ${wave.places.length} places; inputs pinned; raw files … match their pins` ``. Then:

```js
const ownerApproval = JSON.parse(await readFile(wave.knowledgeSource, "utf8"))._provenance?.owner_approval ?? null;
const recordedIn = async (v) => (await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
const gateFacts = async () => {
  await client.query("begin read only");
  try {
    return await readGateFacts(client, { versions: wave.versions, ownerApproval, treeMatches, waveKeys, priorPromote: wave.priorPromote });
  } finally {
    await client.query("rollback");
  }
};
```

Step 8 (the gate and the uploads) is US-2's, verbatim. Steps 9–12 become:

```js
  // 9. One transaction for the whole wave.
  await client.query("begin");
  await client.query("set local statement_timeout = 1800000");

  // 10. Dry: the previous wave must be live; this wave's catalog and knowledge
  //     are applied inside the transaction if they are not recorded yet.
  if (!STAGE) {
    if (wave.priorPromote && !(await recordedIn(wave.priorPromote))) {
      throw new Error(`the previous wave's promote ${wave.priorPromote} is not live: rehearse ${wave.name} with scripts/usa-map/rehearse-us3.mjs --batch ${wave.batch} instead`);
    }
    for (const what of ["catalog", "knowledge"]) {
      if (await recordedIn(wave.versions[what])) continue;
      let sql;
      try {
        sql = await readFile(wave.files[what], "utf8");
      } catch {
        throw new Error(`generate the ${what} migration ${wave.files[what]} first`);
      }
      await client.query(sql);
      console.log(`applied ${wave.files[what]} in-transaction`);
    }
  }

  // 11. Stage.
  const report = await stageWave(client, {
    wave, ...stageInputs,
    revision: releaseVersion(),
    importer: `scripts/wine-map-sources/stage-usa-ava.mjs@${execSync("git rev-parse HEAD").toString().trim()}`,
    label: STAGE ? "STAGED" : "STAGED-DRY",
  });

  // 12. Finish.
  if (!STAGE) {
    await client.query("rollback");
    console.log(`DONE (dry): ${report.length} boundaries built and asserted for ${wave.name}, persisted nothing.`);
  } else {
    await client.query("commit");
    await warnIfNeighbourCacheStale(client);
    console.log(`STAGE COMPLETE: ${report.length} DRAFT boundaries committed for ${wave.name}; apply ${wave.files.promote} next`);
  }
```

(the surrounding `try/catch/finally` is US-2's).

- [ ] **Step 2: Read-only proofs, no transaction write.**
  - `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us3-core --check-gate`. Expected: exit 1, `REFUSED` with exactly "catalog migration 20260930154747 is not recorded live" and "knowledge migration 20260930164747 is not recorded live" (the owner approval is present, the US-2 promote is live).
  - `… --wave us3-rest --check-gate`. Expected: REFUSED, including "the previous wave's promote 20260930174747 is not recorded live".
  - `… --wave us2 --check-gate`. Expected: REFUSED with "the promote is already recorded" (US-2 is live).
  - `… --wave us4`. Expected: exit 2, the usage line.
- [ ] **Step 3: The core dry run** (activity check first; it applies the core catalog and knowledge in-transaction, so one refresh, about 1–2 minutes):
  `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us3-core`.
  Expected: two "applied … in-transaction" lines; 86 `STAGED-DRY united-states.california.… ucd …` lines, each with `share 1` (or ≥ 0.995), a `drift` under 0.15 and `parent` ≥ its threshold (lodi and el-dorado show `parent -`); then `DONE (dry): 86 boundaries built and asserted for us3-core, persisted nothing.` Record the lowest `parent` value and its key (expected Santa Ynez Valley, 0.995092) for the runbook.
- [ ] **Step 4: The rest dry run refuses before the core promote:** `… --wave us3-rest`. Expected: an error "the previous wave's promote 20260930174747 is not live: rehearse us3-rest with scripts/usa-map/rehearse-us3.mjs --batch rest instead", before any write.
- [ ] **Step 5: Commit** "feat(wine-map-sources): stage-usa-ava.mjs --wave us2|us3-core|us3-rest; the core dry run (86 boundaries, persisted nothing)". Put the measured numbers in the body.

---

### Task 18: The two promote migrations

**Files:**
- Modify: `scripts/usa-map/render-us3-sql.mjs` (add `promoteSql`; `renderAll` gains the promotes)
- Create (rendered): `supabase/migrations/20260930174747_usa_us3_core_promote.sql`, `supabase/migrations/20260930214747_usa_us3_rest_promote.sql`
- Test: `scripts/usa-map/us3-sql.test.mjs`

**Interfaces:**
- Consumes: the wave's `places`, `parentChecks`, `outlineKeys`, `edges`, `priorKeys`, `derivedCheck`, `after`, `name` (Task 1); `STATE_WINDOWS` from `usa-stage-lib.mjs`.
- Produces: `promoteSql(wave) → string`.

- [ ] **Step 1: Add the failing tests** to `us3-sql.test.mjs` (extend the import with `promoteSql`):

```js
for (const batch of ["core", "rest"]) {
  const wave = waves[batch];
  test(`${batch}: the committed promote migration is exactly the render`, async () => {
    assert.equal(lf(await readFile(wave.files.promote, "utf8")), promoteSql(wave));
  });

  test(`${batch} promote: shape, asserts, order`, () => {
    const sql = promoteSql(wave);
    assert.deepEqual(topLevelTransactionStatements(sql), []);
    assert.equal((sql.match(/^ {2}\('united-states\.california\.[^']+', '[a-z0-9_-]+', (true|false), /gm) ?? []).length, wave.places.length);
    assert.equal((sql.match(/^ {2}\('united-states\.california\.[^']+', '[a-z0-9_-]+', true, /gm) ?? []).length, wave.outlineKeys.length);
    assert.equal((sql.match(/^ {2}\('united-states\.california\.[^']+', 'united-states\.california[^']*', '(OVERLAPS|ALTERNATE_PARENT)'/gm) ?? []).length, wave.edges.length);
    for (const phrase of [
      "an earlier wave is not live", "expected exactly one DRAFT, non-current boundary per place",
      "boundaries on other California places", "provenance does not match the stage", "outline set is not D15",
      "not inside California", "not inside its parent AVA", "x.inside < x.parent_min - 0.001",
      "an edge does not match the geometry", "has no complete article", "refresh_wine_place_neighbours refused",
      "not VERIFIED, locked and current", `expected ${wave.after.caPlaces}`, `expected ${wave.after.caEdges}`,
      "edges not stored exactly once",
    ]) assert.ok(sql.includes(phrase), phrase);
    const coverage = sql.indexOf("has no complete article");
    const flip = sql.indexOf("set quality_status = 'VALIDATED'");
    const refresh = sql.lastIndexOf("refresh_wine_place_neighbours()");
    assert.ok(coverage < flip && flip < refresh, "asserts, then flip, then refresh");
  });
}

test("Review Focus 2 and decision 8: only the rest promote asserts Central Valley's outline", () => {
  assert.ok(!promoteSql(waves.core).includes("Central Valley's outline"));
  const sql = promoteSql(waves.rest);
  assert.match(sql, /Central Valley''s outline is not its members'' union/);
  assert.match(sql, /v_sym >= 0\.001 or v_out >= 0\.0001/);
  assert.match(sql, /'capay_valley', 'clarksburg', 'diablo_grande', 'dunnigan_hills', 'lodi', 'madera', 'paulsell_valley', 'river_junction', 'salado_creek', 'tracy_hills', 'winters_highlands'/);
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`promoteSql` not exported).

- [ ] **Step 3: Implement.** Add `import { STATE_WINDOWS } from "../wine-map-sources/usa-stage-lib.mjs";` to `render-us3-sql.mjs`, and above `renderAll`:

```js
export function promoteSql(wave) {
  const tag = `US-3 ${wave.batch} promote`;
  const n = wave.places.length;
  const W = STATE_WINDOWS.CA;
  const checks = new Map(wave.parentChecks.map((c) => [c.key, c]));
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.ucd_ava_id), bool(wave.outlineKeys.includes(p.key)), sq(p.parent_key),
    checks.has(p.key) ? num(checks.get(p.key).min) : "null",
  ].join(", ")})`).join(",\n");
  const prior = wave.priorKeys.map((k) => `  (${sq(k)})`).join(",\n");
  const edges = wave.edges.map((e) => `  (${[
    sq(e.source_key), sq(e.target_key), sq(e.type), e.ratio != null ? num(e.ratio) : "null",
    sq(`US-3 ${wave.batch}, California tree report: basis ${e.basis}${e.ratio != null ? `, ratio ${e.ratio}` : ""}`),
  ].join(", ")})`).join(",\n");
  const outlineCount = wave.outlineKeys.length;
  const cv = wave.derivedCheck;
  const cvBlock = !cv ? "" : `
-- 3b. Central Valley's derived outline equals its promoted members' union
--     (spec §25; plan decision 8; measured 2026-09-30: 0.023% and 0.00026%).
do $$
declare v_cv extensions.geometry; v_gp jsonb; v_members extensions.geometry; n int;
        v_sym double precision; v_out double precision;
begin
  select b.display_geometry, b.generation_parameters into v_cv, v_gp
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.canonical_key = ${sq(cv.key)};
  if v_cv is null then raise exception '${tag}: ${cv.key} has no current boundary'; end if;
  if array(select jsonb_array_elements_text(v_gp->'members') order by 1)
     <> array[${cv.members.map((m) => sq(m.ucd_ava_id)).join(", ")}]::text[] then
    raise exception '${tag}: Central Valley''s member list is not its ${cv.members.length} children';
  end if;
  select count(*), extensions.ST_Union(g) into n, v_members
    from _us3_geom where key in (${cv.members.map((m) => sq(m.key)).join(", ")});
  if n <> ${cv.members.length} then raise exception '${tag}: % of ${cv.members.length} Central Valley members have a geometry', n; end if;
  v_sym := extensions.ST_Area(extensions.ST_SymDifference(v_cv, v_members)) / extensions.ST_Area(v_cv);
  v_out := extensions.ST_Area(extensions.ST_Difference(v_members, v_cv)) / extensions.ST_Area(v_cv);
  if v_sym >= 0.001 or v_out >= 0.0001 then
    raise exception '${tag}: Central Valley''s outline is not its members'' union (symmetric difference %, members outside %)',
      round(v_sym::numeric, 6), round(v_out::numeric, 6);
  end if;
  raise notice '${tag}: Central Valley against its members: symmetric difference %, members outside %',
    round(v_sym::numeric, 6), round(v_out::numeric, 6);
end $$;
`;
  return `-- USA on the wine map, phase US-3 ${wave.batch} batch: the promote (spec §8.4, §15 US-3;
-- plan ${PLAN} Task 18).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the ${n}
-- California AVAs of the ${wave.batch} batch to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the batch's ${wave.edges.length} edges (§8.3; an edge ships
-- with the batch its second endpoint lands in). Checks read only
-- united-states.california.*, so another state's wave can run in any order.
-- Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: ${wave.priorPromote} (the previous wave's promote) is live;
-- stage-usa-ava.mjs --wave ${wave.name} --stage has committed one DRAFT,
-- non-current boundary per place; ${wave.versions.catalog} and ${wave.versions.knowledge} are applied.
-- Rendered by scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_promote, pg_temp._us3_prior, pg_temp._us3_edges, pg_temp._us3_staged, pg_temp._us3_geom;
create temp table _us3_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision
) on commit drop;
insert into _us3_promote values
${rows};
create temp table _us3_prior (key text primary key) on commit drop;
insert into _us3_prior values
${prior};
create temp table _us3_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, ratio double precision, note text not null
) on commit drop;
insert into _us3_edges values
${edges};

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception '${tag}: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception '${tag}: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave ${wave.name} --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${CA_WHERE("p")}
     and p.canonical_key not in (select key from _us3_promote union all select key from _us3_prior);
  if v_text is not null then raise exception '${tag}: boundaries on other California places: %', v_text; end if;
end $$;

create temp table _us3_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us3_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this batch's staged boundary, else an earlier wave's current one.
create temp table _us3_geom on commit drop as
select key, g from _us3_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us3_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_state extensions.geometry; v_land extensions.geometry;
begin
  select count(*) into n from _us3_staged;
  if n <> ${n} then raise exception '${tag}: % staged rows, expected ${n}', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception '${tag}: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between ${W.minLon} and ${W.maxLon}
      or extensions.ST_Y(label_point) not between ${W.minLat} and ${W.maxLat};
  if v_text is not null then raise exception '${tag}: invalid geometry or label outside California''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception '${tag}: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us3_staged where gp->>'display' = 'outline';
  if n <> ${outlineCount} then raise exception '${tag}: % outline places, expected ${outlineCount}', n; end if;

  -- §8.2 state containment, on land and buffered, against the live outlines.
  select extensions.ST_Buffer(g, 0.05) into v_state from _us3_geom where key = '${CA_KEY}';
  select extensions.ST_Buffer(g, 0.05) into v_land from _us3_geom where key = 'united-states';
  if v_state is null or v_land is null then raise exception '${tag}: the California or United States outline is not live'; end if;
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key, extensions.ST_Area(extensions.ST_Intersection(s.g, v_state))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us3_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception '${tag}: not inside California (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with the measured
  -- simplification slack (plan decision 6: max difference 0.00081).
  select count(*) into n from _us3_staged s
   where s.parent_min is not null and not exists (select 1 from _us3_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception '${tag}: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us3_staged s join _us3_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception '${tag}: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 7).
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
    left join _us3_geom a on a.key = e.source_key
    left join _us3_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) > 0.01)
      or (e.type = 'ALTERNATE_PARENT'
          and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) < 0.899);
  if v_text is not null then raise exception '${tag}: an edge does not match the geometry: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where not exists (select 1 from public.wine_place_articles a where a.wine_place_id = p.id
                       and a.editorial_status = 'PUBLISHED'
                       and length(trim(coalesce(a.description, ''))) >= 40
                       and length(trim(coalesce(a.climate, ''))) >= 40
                       and length(trim(coalesce(a.soils, ''))) >= 40
                       and length(trim(coalesce(a.grape_varieties, ''))) >= 40
                       and length(trim(coalesce(a.wine_styles, ''))) >= 40
                       and cardinality(a.key_facts) >= 3)
      or not exists (select 1 from public.wine_place_styles s where s.wine_place_id = p.id and s.editorial_status = 'PUBLISHED')
      or not exists (select 1 from public.wine_place_grapes g where g.wine_place_id = p.id and g.editorial_status = 'PUBLISHED');
  if v_text is not null then
    raise exception '${tag}: has no complete article, style and grape (apply the knowledge migration first): %', v_text;
  end if;
end $$;
${cvBlock}
-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us3_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us3_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us3_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK(tag)}
-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED, locked and current: %', v_text; end if;
  select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${CA_WHERE("p")} and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> ${wave.after.caPlaces} then raise exception '${tag}: % live California places, expected ${wave.after.caPlaces}', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where ${CA_WHERE("p")} and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception '${tag}: % DRAFT California boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where ${CA_WHERE("p")} and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
  if n <> ${wave.after.caAva} then raise exception '${tag}: % VERIFIED California AVA places, expected ${wave.after.caAva}', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where ${CA_WHERE("s")} or ${CA_WHERE("t")};
  if n <> ${wave.after.caEdges} then raise exception '${tag}: % California relationships, expected ${wave.after.caEdges}', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
   where (select count(*) from public.wine_place_relationships r
            join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and r.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception '${tag}: edges not stored exactly once: %', v_text; end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception '${tag}: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
`;
}
```

Replace `renderAll` with:

```js
export function renderAll(waves) {
  return {
    [waves.core.files.catalog]: catalogSql(waves.core),
    [waves.rest.files.catalog]: catalogSql(waves.rest),
    [waves.core.files.promote]: promoteSql(waves.core),
    [waves.rest.files.promote]: promoteSql(waves.rest),
  };
}
```

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us3-sql.mjs`, then `node --test scripts/usa-map/us3-sql.test.mjs`. Expected: PASS. `git diff --stat` shows the two catalog files unchanged.
- [ ] **Step 5: Pre-flight only.** `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930174747_usa_us3_core_promote.sql --check` and the same for the rest promote → `PREFLIGHT OK` each. (The promotes are exercised against live only inside the rehearsals, Tasks 23–24.)
- [ ] **Step 6: Commit** "feat(usa-map): US-3 promote migrations (asserts, parent and edge re-checks, Central Valley in rest, refresh) (not applied)".

---

### Task 19: Archetype links step 2, and the training-room test

**Files:**
- Create: `data/wine-map/usa-us3-archetype-links.json`
- Modify: `scripts/usa-map/render-us3-sql.mjs` (add `LINKS2_PATH`, `loadLinks2`, `links2Sql`; `renderAll(waves, links)`, `main`)
- Create (rendered): `supabase/migrations/20260930184747_usa_archetype_links_2.sql`
- Modify: `scripts/training-room.test.mjs` (the Napa assertion accepts step 2)
- Test: `scripts/usa-map/us3-sql.test.mjs`

**Interfaces:**
- Produces: `loadLinks2() → links[]`, each `{ archetype_id, name, sort_order, appellation, region, from: { home, placements }, home, placements }`, the shape `archetypeFacts`/`archetypeProblems` (`us2-checks.mjs`) already read (`home`, `placements` are the step-2 targets). `links2Sql(links) → string`.

- [ ] **Step 1: The data file** `data/wine-map/usa-us3-archetype-links.json` (LF):

```json
{
  "_note": "US typical wines linked to the map, step 2 (spec 2026-09-29 D22, §14.2): the two California wines move from North Coast to their AVAs and keep North Coast and California as placements (the §14.2 table; California is the REGION placement the training-room drift guard RM9a needs). The Sonoma Chardonnay's scoring appellation is Sonoma Coast AVA, so Sonoma Coast is its home; it is also placed on Russian River Valley (§14.2). Matched by live id AND name; the pre-state must be step 1 exactly (20260930114747). Placement sort_order is the archetype's own (§25). Apply after the US-3 core promote.",
  "links": [
    { "archetype_id": "75e4e467-3929-4844-bbc4-ffe8b12523a1", "name": "A typical Napa Cabernet Sauvignon", "sort_order": 88,
      "appellation": "Napa Valley AVA", "region": "California",
      "from": { "home": "united-states.california.north-coast",
                "placements": ["united-states.california", "united-states.california.north-coast"] },
      "home": "united-states.california.north-coast.napa-valley",
      "placements": ["united-states.california", "united-states.california.north-coast",
                     "united-states.california.north-coast.napa-valley"] },
    { "archetype_id": "c4ea77f3-5599-43dd-bdc3-4287c1e0ea15", "name": "A typical Sonoma Chardonnay", "sort_order": 89,
      "appellation": "Sonoma Coast AVA", "region": "California",
      "from": { "home": "united-states.california.north-coast",
                "placements": ["united-states.california", "united-states.california.north-coast"] },
      "home": "united-states.california.north-coast.sonoma-coast",
      "placements": ["united-states.california", "united-states.california.north-coast",
                     "united-states.california.north-coast.northern-sonoma.russian-river-valley",
                     "united-states.california.north-coast.sonoma-coast"] }
  ]
}
```

- [ ] **Step 2: Add the failing tests** to `us3-sql.test.mjs` (import `links2Sql`, `loadLinks2`):

```js
const links = await loadLinks2();

test("links 2: committed = render; homes and new placements are core places; step 1 is kept", async () => {
  assert.equal(lf(await readFile(waves.core.files.links, "utf8")), links2Sql(links));
  const core = new Set(waves.core.places.map((p) => p.key));
  for (const l of links) {
    assert.ok(core.has(l.home), l.name);
    for (const k of l.placements.filter((x) => !l.from.placements.includes(x))) assert.ok(core.has(k), `${l.name}: ${k}`);
    for (const k of l.from.placements) assert.ok(l.placements.includes(k), `${l.name} keeps ${k}`);
    assert.ok(l.placements.includes("united-states.california"), "RM9a: the REGION placement");
  }
  const sql = links2Sql(links);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  for (const phrase of ["pre-state is not step 1", "apply after the US-3 core promote", "carries a curated display point",
    "placed archetypes without a placement at their REGION ancestor"]) assert.ok(sql.includes(phrase), phrase);
  assert.ok(!/refresh_wine_place_neighbours/.test(sql), "no catalogue write, no refresh");
  assert.ok(!/delete from public\.wine_archetype_placements/.test(sql), "step 2 only adds placements");
});

test("links 2 refuses a data file that drops a step-1 placement", () => {
  const bad = structuredClone(links);
  bad[0].placements = bad[0].placements.filter((k) => k !== "united-states.california.north-coast");
  assert.throws(() => links2Sql(bad), /must keep united-states\.california\.north-coast/);
});
```

- [ ] **Step 3: Run.** Expected: FAIL.

- [ ] **Step 4: Implement** in `render-us3-sql.mjs`, above `renderAll`:

```js
export const LINKS2_PATH = "data/wine-map/usa-us3-archetype-links.json";
export const loadLinks2 = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(LINKS2_PATH)).links;

function checkLinks2(links) {
  if (!Array.isArray(links) || links.length === 0) throw new Error("no archetype links");
  for (const l of links) {
    if (!/^[0-9a-f-]{36}$/.test(l.archetype_id)) throw new Error(`${l.name}: bad archetype id`);
    if (!Number.isInteger(l.sort_order)) throw new Error(`${l.name}: sort_order must be an integer`);
    if (!l.placements.includes(l.home) || !l.from.placements.includes(l.from.home)) {
      throw new Error(`${l.name}: a home must be one of its placements`);
    }
    for (const k of l.from.placements) if (!l.placements.includes(k)) throw new Error(`${l.name}: step 2 must keep ${k} (spec §14.2)`);
  }
}

/** Archetype links step 2 (spec D22, §14.2). */
export function links2Sql(links) {
  checkLinks2(links);
  const rows = links.flatMap((l) => l.placements.map((k) => `  (${[
    `${sq(l.archetype_id)}::uuid`, sq(l.name), l.sort_order, sq(l.appellation), sq(l.region), sq(l.from.home), sq(l.home), sq(k),
  ].join(", ")})`)).join(",\n");
  const fromRows = links.flatMap((l) => l.from.placements.map((k) => `  (${sq(l.archetype_id)}::uuid, ${sq(k)})`)).join(",\n");
  return `-- USA on the wine map, archetype links step 2 (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md D22, §14.2; plan
-- ${PLAN} Task 19).
--
-- Moves the ${links.length} California typical wines from North Coast (step 1,
-- 20260930114747) to their AVAs: Napa Cabernet Sauvignon to Napa Valley, Sonoma
-- Chardonnay to Sonoma Coast (also placed on Russian River Valley). North Coast
-- and California stay as placements. Only adds placements; the pre-state must
-- be step 1 exactly, so a second run refuses. Writes wine_archetypes and
-- wine_archetype_placements only: no refresh, no tiles run. The core unpublish
-- rollback puts step 1 back. Rendered by scripts/usa-map/render-us3-sql.mjs from
-- ${LINKS2_PATH}; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

drop table if exists pg_temp._us3_links, pg_temp._us3_from;
create temp table _us3_links (
  archetype_id uuid not null, name text not null, sort_order int not null,
  appellation text not null, region text not null, from_home text not null, home_key text not null, place_key text not null,
  primary key (archetype_id, place_key)
) on commit drop;
insert into _us3_links values
${rows};
create temp table _us3_from (archetype_id uuid not null, place_key text not null, primary key (archetype_id, place_key)) on commit drop;
insert into _us3_from values
${fromRows};

-- Pre-state: step 1 exactly, no curated point, and the new places live.
do $$
declare v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, sort_order, appellation, region, from_home from _us3_links) l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places h on h.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where a.id is null or a.name <> l.name or a.sort_order <> l.sort_order
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or h.canonical_key is distinct from l.from_home
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(f.place_key order by f.place_key) from _us3_from f where f.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: pre-state is not step 1 for % (applied twice, or step 1 is not live)', v_text;
  end if;

  select string_agg(distinct l.place_key, ', ') into v_text
    from _us3_links l left join public.wine_places p on p.canonical_key = l.place_key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v_text is not null then
    raise exception 'US archetype links step 2: % is not VERIFIED with a current boundary (apply after the US-3 core promote)', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$select string_agg(a.name, ', ') from public.wine_archetypes a
                 where a.id in (select archetype_id from _us3_links) and a.display_lon is not null$q$ into v_text;
    if v_text is not null then
      raise exception 'US archetype links step 2: % carries a curated display point', v_text;
    end if;
  end if;
end $$;

update public.wine_archetypes a
   set wine_place_id = p.id
  from (select distinct archetype_id, home_key from _us3_links) l
  join public.wine_places p on p.canonical_key = l.home_key
 where a.id = l.archetype_id;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _us3_links l join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- Post-state, same transaction.
do $$
declare n int; v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, home_key, appellation, region from _us3_links) l
    join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where p.canonical_key is distinct from l.home_key
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(k.place_key order by k.place_key) from _us3_links k where k.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: home, placements or scoring fields wrong for %', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$select count(*)::int from public.wine_archetypes
                where display_lon is not null and wine_place_id is not null$q$ into n;
    if n <> 0 then raise exception 'US archetype links step 2: % placed archetypes carry a curated display point', n; end if;
  end if;

${RM9A_SQL}
  if v_text is not null then
    raise exception 'US archetype links step 2: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
end $$;
`;
}
```

Replace `renderAll` and `main` with:

```js
export function renderAll(waves, links) {
  return {
    [waves.core.files.catalog]: catalogSql(waves.core),
    [waves.rest.files.catalog]: catalogSql(waves.rest),
    [waves.core.files.promote]: promoteSql(waves.core),
    [waves.rest.files.promote]: promoteSql(waves.rest),
    [waves.core.files.links]: links2Sql(links),
  };
}

async function main() {
  const waves = await loadUs3Waves();
  for (const [path, text] of Object.entries(renderAll(waves, await loadLinks2()))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
```

- [ ] **Step 5: The training-room test.** In `scripts/training-room.test.mjs`, replace the Napa `if/else` (the block starting `if (napa.place === null) {`) with:

```js
    // Step 2 (usa-wine-map spec §14.2, 20260930184747): once US-3's core is
    // promoted and linked, Napa lives on Napa Valley, still placed on North
    // Coast and California.
    if (napa.place === null) {
      assert.deepEqual(napa, { place: null, placements: null }, "an archetype without a map place stays off the map");
    } else if (napa.place === "united-states.california.north-coast") {
      assert.deepEqual(napa.placements, ["united-states.california", "united-states.california.north-coast"]);
    } else {
      assert.deepEqual(napa, {
        place: "united-states.california.north-coast.napa-valley",
        placements: ["united-states.california", "united-states.california.north-coast",
          "united-states.california.north-coast.napa-valley"],
      });
    }
```

and update the comment above `const napa` to mention both steps. Do **not** run `training-room.test.mjs` here (it reads live state and belongs to the sitting); run `node --check scripts/training-room.test.mjs` only.
- [ ] **Step 6: Render and test.** `node scripts/usa-map/render-us3-sql.mjs`; `node --test scripts/usa-map/us3-sql.test.mjs` → PASS; `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930184747_usa_archetype_links_2.sql --check` → `PREFLIGHT OK`.
- [ ] **Step 7: Commit** "feat(usa-map): archetype links step 2 (Napa to Napa Valley, Sonoma to Sonoma Coast; North Coast and California kept) (not applied)".

---

### Task 20: The six rollback files

**Files:**
- Modify: `scripts/usa-map/render-us3-sql.mjs` (add `unstageSql`, `removeSql`, `unpublishSql`; final `renderAll`)
- Create (rendered): `scripts/usa-map/usa_us3_core_unstage.sql`, `usa_us3_core_remove.sql`, `usa_us3_core_unpublish.sql`, `usa_us3_rest_unstage.sql`, `usa_us3_rest_remove.sql`, `usa_us3_rest_unpublish.sql`
- Test: `scripts/usa-map/us3-sql.test.mjs`

**Interfaces:**
- Consumes: `rollbackRefusal` from `apply-rollback.mjs`; the waves and `links` (Tasks 1, 19).
- Produces: `unstageSql(wave)`, `removeSql(wave)`, `unpublishSql(wave, links | null)`.

- [ ] **Step 1: Add the failing tests** to `us3-sql.test.mjs` (import the three and `renderAll`, and `rollbackRefusal` from `./apply-rollback.mjs`):

```js
for (const batch of ["core", "rest"]) {
  const wave = waves[batch];
  test(`${batch} rollbacks: committed = render, no transaction statements, own pre-state, refresh last`, async () => {
    const all = renderAll(waves, links);
    for (const [what, path] of Object.entries(wave.rollbackFiles)) {
      assert.equal(rollbackRefusal(path), null, `${path} is a US rollback file name`);
      assert.equal(lf(await readFile(path, "utf8")), all[path], path);
      assert.deepEqual(topLevelTransactionStatements(all[path]), [], path);
      const tail = all[path].slice(all[path].lastIndexOf("do $$"));
      assert.match(tail, /refresh_wine_place_neighbours\(\)/, `${what}: refresh last`);
    }
    const [un, rm, up] = ["unstage", "remove", "unpublish"].map((w) => all[wave.rollbackFiles[w]]);
    assert.match(un, /missing or not DRAFT \(after the promote, use the unpublish file\)/);
    assert.match(rm, /keys are locked \(the promote ran\)/);
    assert.match(rm, /other California places exist \(remove the later batch first\)/);
    assert.ok(rm.includes(`delete from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}')`));
    assert.ok(rm.indexOf("keys are locked") < rm.indexOf("other California places exist"), "the lock message comes first");
    assert.match(up, /a later batch is live \(unpublish it first\)/);
    assert.match(up, /an archetype not in the links file is placed on this batch/);
  });
}

test("only the core unpublish puts archetype links step 1 back", () => {
  const all = renderAll(waves, links);
  assert.match(all[waves.core.rollbackFiles.unpublish], /back to step 1/);
  assert.ok(!all[waves.rest.rollbackFiles.unpublish].includes("_us3_back"));
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** in `render-us3-sql.mjs`, above `renderAll`:

```js
// --- Rollbacks (spec §16, §25). scripts/usa-map/, unversioned, run with
// apply-rollback.mjs (--check, --dry, then no flag); re-appliable, each asserts
// its own pre-state. They work on exactly one batch's keys.
const underCa = (k) => k === CA_KEY || k.startsWith(`${CA_KEY}.`);

function rbPrelude(wave) {
  const rows = wave.places.map((p) => `  (${sq(p.key)}, ${depthOf(p.key)})`).join(",\n");
  const known = [...wave.priorKeys.filter(underCa), ...wave.places.map((p) => p.key)].map((k) => `  (${sq(k)})`).join(",\n");
  return `set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_rb, pg_temp._us3_known;
create temp table _us3_rb (key text primary key, depth int not null) on commit drop;
insert into _us3_rb values
${rows};
-- Every California key this batch knows about (earlier waves and itself).
create temp table _us3_known (key text primary key) on commit drop;
insert into _us3_known values
${known};
`;
}

const rbHeader = (wave, title, body) => `-- USA on the wine map, phase US-3 ${wave.batch} batch ROLLBACK: ${title} (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- ${PLAN} Task 20).
--
${body.trim().split("\n").map((l) => (l ? `-- ${l}` : "--")).join("\n")}
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

`;

export function unstageSql(wave) {
  const tag = `US-3 ${wave.batch} unstage`;
  const n = wave.places.length;
  return `${rbHeader(wave, "unstage (after --stage, before the promote)", `
Removes the ${n} DRAFT, non-current boundaries stage-usa-ava.mjs --wave ${wave.name}
--stage committed, and nothing else: the places, their knowledge and the
source snapshots stay (snapshots are immutable; a re-stage reuses them). Ends
with the checked neighbour refresh, which brings the cache and master's
map-data checks back to green.`)}${rbPrelude(wave)}
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT (after the promote, use the unpublish file): %', v_text; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and (b.is_current or b.quality_status <> 'DRAFT');
  if n <> 0 then raise exception '${tag}: % boundaries on this batch are current or not DRAFT', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> ${n} then raise exception '${tag}: % DRAFT non-current boundaries on this batch, expected ${n}', n; end if;
end $$;

delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb)
   and b.quality_status = 'DRAFT' and not b.is_current;

do $$
declare n int;
begin
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % boundaries left on this batch', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.publication_status = 'DRAFT';
  if n <> ${n} then raise exception '${tag}: % DRAFT places, expected ${n}', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function removeSql(wave) {
  const tag = `US-3 ${wave.batch} remove`;
  const n = wave.places.length;
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => b - a);
  const deletes = depths.map((d) => `delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = ${d};`).join("\n");
  return `${rbHeader(wave, "remove (abandon the batch before its promote)", `
Deletes the ${n} places of the ${wave.batch} batch (deepest first), their
relationships, boundaries and knowledge (articles, styles and grapes cascade),
and the catalog (${wave.versions.catalog}) and knowledge (${wave.versions.knowledge})
history rows, so both apply again as committed. Refuses once the promote has
run (keys lock for good; use the unpublish file), and while any other
California place outside the earlier waves and this batch exists (remove the
later batch first). Keeps the source snapshots (immutable; a re-stage reuses them).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  -- The lock check first, so after a promote this is always the message.
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join _us3_rb e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if v_text is not null then
    raise exception '${tag}: keys are locked (the promote ran): use the unpublish file instead (%)', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${CA_WHERE("p")} and p.canonical_key not in (select key from _us3_known);
  if v_text is not null then raise exception '${tag}: other California places exist (remove the later batch first): %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
end $$;

delete from public.wine_place_relationships r
 using public.wine_places p
 where p.canonical_key in (select key from _us3_rb)
   and (r.source_place_id = p.id or r.target_place_id = p.id);
delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb);
${deletes}
delete from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}');

do $$
declare n int;
begin
  select count(*) into n from public.wine_places where canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % places of this batch left', n; end if;
  select (select count(*) from public.wine_place_articles a where not exists (select 1 from public.wine_places p where p.id = a.wine_place_id))
       + (select count(*) from public.wine_place_styles s where not exists (select 1 from public.wine_places p where p.id = s.wine_place_id))
       + (select count(*) from public.wine_place_grapes g where not exists (select 1 from public.wine_places p where p.id = g.wine_place_id))
    into n;
  if n <> 0 then raise exception '${tag}: % orphan knowledge rows', n; end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}')) then
    raise exception '${tag}: history rows left';
  end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function unpublishSql(wave, links) {
  const tag = `US-3 ${wave.batch} unpublish`;
  const n = wave.places.length;
  const back = links ? links.flatMap((l) => l.from.placements.map((k) =>
    `  (${sq(l.archetype_id)}::uuid, ${sq(l.from.home)}, ${sq(k)}, ${l.sort_order})`)).join(",\n") : null;
  const linkSteps = !links ? "" : `
-- Archetype links first, back to step 1, so no typical wine points at a DRAFT place.
drop table if exists pg_temp._us3_back;
create temp table _us3_back (archetype_id uuid not null, from_home text not null, place_key text not null,
  sort_order int not null, primary key (archetype_id, place_key)) on commit drop;
insert into _us3_back values
${back};
delete from public.wine_archetype_placements x
 using public.wine_places p
 where p.id = x.wine_place_id and p.canonical_key in (select key from _us3_rb)
   and x.archetype_id in (select archetype_id from _us3_back);
update public.wine_archetypes a
   set wine_place_id = h.id
  from (select distinct archetype_id, from_home from _us3_back) b
  join public.wine_places h on h.canonical_key = b.from_home
 where a.id = b.archetype_id
   and a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us3_rb));
insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select b.archetype_id, p.id, b.sort_order from _us3_back b join public.wine_places p on p.canonical_key = b.place_key
on conflict (archetype_id, wine_place_id) do nothing;
`;
  // Archetypes the links file restores are exempt; for the rest batch (no links) none is.
  const notLinked = links ? `a.id not in (${links.map((l) => `${sq(l.archetype_id)}::uuid`).join(", ")}) and ` : "";
  return `${rbHeader(wave, "unpublish (a roll forward after the promote)", `
Takes the ${n} places of the ${wave.batch} batch off the map without touching
their locked keys: ${links ? "the archetype links go back to step 1 first (homes on North Coast,\nplacements on North Coast and California), then " : ""}every boundary of the batch
non-current and every place DRAFT, then the checked refresh. Boundaries,
relationships and knowledge stay, for a later re-promote. Refuses while a
later batch is live (unpublish it first).
THEN, on master: splice-boundary-expectations.mjs --write (it keeps only the
current united-states rows, so this batch's rows leave the hunk); git diff must
show only removed united-states rows; commit and push it as a staged push.
THEN DISPATCH A NEW TILES RELEASE FROM MASTER (promote=true), and never roll
back the manifest (§17.3).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED with one current boundary: %', v_text; end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${CA_WHERE("p")} and p.canonical_key not in (select key from _us3_known)
     and (p.publication_status = 'VERIFIED'
          or exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current));
  if v_text is not null then raise exception '${tag}: a later batch is live (unpublish it first): %', v_text; end if;
  select string_agg(a.name, ', ' order by a.name) into v_text
    from public.wine_archetypes a
   where ${notLinked}(a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us3_rb))
          or exists (select 1 from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
                      where x.archetype_id = a.id and p.canonical_key in (select key from _us3_rb)));
  if v_text is not null then
    raise exception '${tag}: an archetype not in the links file is placed on this batch (re-point it first): %', v_text;
  end if;
end $$;
${linkSteps}
update public.wine_place_boundaries b
   set is_current = false
  from public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb) and b.is_current;
update public.wine_places p
   set publication_status = 'DRAFT', updated_at = now()
 where p.canonical_key in (select key from _us3_rb);

do $$
declare n int;
begin
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.publication_status = 'VERIFIED';
  if n <> 0 then raise exception '${tag}: % VERIFIED places of this batch left', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and b.is_current;
  if n <> 0 then raise exception '${tag}: % current boundaries left', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.canonical_key_locked_at is not null;
  if n <> ${n} then raise exception '${tag}: % of ${n} keys still locked (they never unlock)', n; end if;
  select count(*) into n from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % archetype placements on this batch left', n; end if;
  select count(*) into n from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % archetypes still at home on this batch', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}
```

The core unpublish header contains the words "back to step 1" through the `linkSteps` comment. Replace `renderAll` with the final version:

```js
export function renderAll(waves, links) {
  return {
    [waves.core.files.catalog]: catalogSql(waves.core),
    [waves.rest.files.catalog]: catalogSql(waves.rest),
    [waves.core.files.promote]: promoteSql(waves.core),
    [waves.rest.files.promote]: promoteSql(waves.rest),
    [waves.core.files.links]: links2Sql(links),
    [waves.core.rollbackFiles.unstage]: unstageSql(waves.core),
    [waves.core.rollbackFiles.remove]: removeSql(waves.core),
    [waves.core.rollbackFiles.unpublish]: unpublishSql(waves.core, links),
    [waves.rest.rollbackFiles.unstage]: unstageSql(waves.rest),
    [waves.rest.rollbackFiles.remove]: removeSql(waves.rest),
    [waves.rest.rollbackFiles.unpublish]: unpublishSql(waves.rest, null),
  };
}
```

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us3-sql.mjs`; `node --test scripts/usa-map/us3-sql.test.mjs` → PASS; `git diff --stat` shows the five earlier rendered files unchanged.
- [ ] **Step 5: Pre-flight each rollback, and prove two refusals against live** (no catalogue write happens before either refuses, so no lock is held):

```bash
cd C:/Users/Public/repos/blindtastingapp-map && for f in scripts/usa-map/usa_us3_*.sql; do node scripts/usa-map/apply-rollback.mjs "$f" --check || exit 1; done && node --env-file=.env.local scripts/usa-map/apply-rollback.mjs scripts/usa-map/usa_us3_core_unstage.sql --dry; node --env-file=.env.local scripts/usa-map/apply-rollback.mjs scripts/usa-map/usa_us3_core_unpublish.sql --dry
```

Expected: six `PREFLIGHT OK`; then `FAILED (rolled back): US-3 core unstage: missing or not DRAFT (after the promote, use the unpublish file): …` and `FAILED (rolled back): US-3 core unpublish: not VERIFIED with one current boundary: …` (no US-3 place exists yet).
- [ ] **Step 6: Commit** "feat(usa-map): US-3 rollback files per batch (unstage, remove, unpublish; unversioned, re-appliable)".

---

### Task 21: The US-3 checks, and the read-only live check

**Files:**
- Create: `scripts/usa-map/us3-checks.mjs`, `scripts/usa-map/check-us3-live.mjs`
- Test: `scripts/usa-map/us3-checks.test.mjs`

**Interfaces:**
- Consumes: `asAuthenticated`, `archetypeFacts`, `archetypeProblems`, `expectationRows`, `shortlists` (`us2-checks.mjs`); `compareHunk` (`splice-boundary-expectations.mjs`); `withReadOnly`; `loadWave`, `loadLinks2`.
- Produces: `NEARBY_KEYS`, `CLICK_KEYS`, `CHILDREN`, `EXPECTED_EDGES` (per batch); `placeDetails(client, keys)`, `caRelationships(client)`, `clickResolution(client, keys)`, `batchFacts(client, wave)`; the CLI `check-us3-live.mjs --batch core|rest`.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us3-checks.test.mjs` (pure: every key the checks name is a real place of the right batch):

```js
import assert from "node:assert/strict";
import test from "node:test";
import { CHILDREN, CLICK_KEYS, EXPECTED_EDGES, NEARBY_KEYS } from "./us3-checks.mjs";
import { loadWave } from "./waves.mjs";

const waves = { core: await loadWave("us3-core"), rest: await loadWave("us3-rest") };

test("every key a check names is a place of that batch (or an earlier one), and every expected edge is in the batch", () => {
  for (const batch of ["core", "rest"]) {
    const w = waves[batch];
    const known = new Set([...w.priorKeys, ...w.places.map((p) => p.key)]);
    for (const k of [...NEARBY_KEYS[batch], ...CLICK_KEYS[batch], ...Object.keys(CHILDREN[batch])]) assert.ok(known.has(k), `${batch}: ${k}`);
    for (const e of EXPECTED_EDGES[batch]) {
      assert.ok(w.edges.some((x) => x.type === e.type && x.source_key === e.source && x.target_key === e.target), `${batch}: ${JSON.stringify(e)}`);
    }
    for (const [k, n] of Object.entries(CHILDREN[batch])) {
      const tree = [...waves.core.places, ...waves.rest.places];
      const children = [...known].filter((x) => tree.find((p) => p.key === x)?.parent_key === k).length;
      assert.equal(children, n, `${batch}: children of ${k}`);
    }
  }
});
```

- [ ] **Step 2: Run.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/us3-checks.mjs`:

```js
// The checks rehearse-us3.mjs (one rolled-back transaction) and
// check-us3-live.mjs (read only) share, so each sitting checks exactly what
// its rehearsal proved. Every function writes nothing.
import { asAuthenticated } from "./us2-checks.mjs";
import { CA_KEY } from "./us3-wave.mjs";

const C = `${CA_KEY}.`;
const k = (tail) => C + tail;
const CA = (a) => `(${a}.canonical_key = '${CA_KEY}' or ${a}.canonical_key like '${CA_KEY}.%')`;

// §8.7: the nearby lists the main session accepts, per batch.
export const NEARBY_KEYS = Object.freeze({
  core: ["north-coast.northern-sonoma.russian-river-valley", "north-coast.los-carneros", "north-coast.napa-valley.oakville",
    "north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley",
    "central-coast.santa-ynez-valley.sta-rita-hills", "central-coast.paso-robles.paso-robles-willow-creek-district",
    "central-coast.monterey.santa-lucia-highlands", "central-valley.lodi"].map(k),
  rest: ["north-coast.cole-ranch", "central-coast.san-benito.cienega-valley", "central-valley.clarksburg", "cucamonga-valley"].map(k),
});
// §15 US-3: a click on these selects them, not a container (smallest area wins).
export const CLICK_KEYS = Object.freeze({
  core: ["north-coast.napa-valley.oakville", "north-coast.napa-valley.rutherford",
    "north-coast.napa-valley.stags-leap-district", "north-coast.los-carneros"].map(k),
  rest: ["north-coast.cole-ranch", "central-coast.san-benito.cienega-valley.lime-kiln-valley"].map(k),
});
// Children the details panel lists (VERIFIED only) after each batch.
export const CHILDREN = Object.freeze({
  core: { [k("north-coast")]: 13, [k("north-coast.napa-valley")]: 15, [k("central-coast.paso-robles")]: 11,
    [k("central-valley.lodi")]: 7, [k("central-coast.santa-ynez-valley")]: 4, [k("central-valley")]: 1 },
  rest: { [k("north-coast")]: 22, [k("central-valley")]: 11, [k("central-coast.monterey")]: 5, [k("central-valley.clarksburg")]: 1 },
});
// The relationships §15 US-3 names (plan decision 3 for Russian River Valley).
export const EXPECTED_EDGES = Object.freeze({
  core: [
    { type: "OVERLAPS", source: k("north-coast.northern-sonoma.russian-river-valley"), target: k("north-coast.sonoma-coast") },
    { type: "ALTERNATE_PARENT", source: k("north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley"), target: k("north-coast.sonoma-coast") },
    { type: "ALTERNATE_PARENT", source: k("el-dorado.fair-play"), target: k("sierra-foothills") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.napa-valley") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.sonoma-coast") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.sonoma-valley") },
  ],
  rest: [
    { type: "OVERLAPS", source: k("north-coast.wild-horse-valley"), target: k("north-coast.solano-county-green-valley") },
  ],
});

/** get_wine_place_context per key, as a signed-in reader. */
export async function placeDetails(client, keys) {
  return asAuthenticated(client, async () => {
    const out = {};
    for (const key of keys) {
      const ctx = (await client.query("select public.get_wine_place_context($1) ctx", [key])).rows[0].ctx;
      out[key] = ctx === null ? null : {
        article: Boolean(ctx.article && ctx.article.description),
        grapes: (ctx.grapes ?? []).length,
        styles: (ctx.styles ?? []).length,
        children: (ctx.children ?? []).length,
        ancestors: (ctx.ancestors ?? []).map((a) => a.key),
        nearby: (ctx.nearby ?? []).map((x) => x.key),
      };
    }
    return out;
  });
}

/** Every relationship with an endpoint under California. */
export async function caRelationships(client) {
  return (await client.query(
    `select r.relationship_type::text type, s.canonical_key source, t.canonical_key target
       from public.wine_place_relationships r
       join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${CA("s")} or ${CA("t")} order by 2, 3, 1`)).rows;
}

/** For each key: the smallest-area current VERIFIED shape covering its label point (the map's click rule). */
export async function clickResolution(client, keys) {
  return (await client.query(
    `select k.key,
            (select p2.canonical_key from public.wine_places p2
               join public.wine_place_boundaries b2 on b2.wine_place_id = p2.id and b2.is_current
              where p2.publication_status = 'VERIFIED' and extensions.ST_Covers(b2.display_geometry, b.label_point)
              order by extensions.ST_Area(b2.display_geometry) limit 1) resolved
       from unnest($1::text[]) k(key)
       join public.wine_places p on p.canonical_key = k.key
       join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
      order by k.key`, [keys])).rows;
}

/** The batch's state, and California's. */
export async function batchFacts(client, wave) {
  const keys = wave.places.map((p) => p.key);
  const n = async (sql, params = []) => Number((await client.query(sql, params)).rows[0].n);
  const onKeys = "from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])";
  return {
    places: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[])", [keys]),
    verified: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and publication_status = 'VERIFIED'", [keys]),
    locked: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and canonical_key_locked_at is not null", [keys]),
    current_validated: await n(`select count(*) n ${onKeys} and b.is_current and b.quality_status = 'VALIDATED'`, [keys]),
    draft_boundaries: await n(`select count(*) n ${onKeys} and b.quality_status = 'DRAFT'`, [keys]),
    ca_live: await n(`select count(*) n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
      where ${CA("p")} and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED'`),
    ca_relationships: await n(`select count(*) n from public.wine_place_relationships r
      join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${CA("s")} or ${CA("t")}`),
    us_outline: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
        and b.is_current and b.generation_parameters->>'display' = 'outline'`),
    fresh: (await client.query("select fresh from public.wine_place_neighbours_state")).rows[0].fresh,
  };
}

/** The promoted state each batch must reach (rehearsal and live check alike). */
export const promotedFacts = (wave) => ({
  places: wave.places.length, verified: wave.places.length, locked: wave.places.length,
  current_validated: wave.places.length, draft_boundaries: 0,
  ca_live: wave.after.caPlaces, ca_relationships: wave.after.caEdges, us_outline: 11, fresh: true,
});
```

`scripts/usa-map/check-us3-live.mjs`:

```js
// The read-only US-3 check for each sitting (plan 2026-09-30-usa-wine-map-us3
// Task 21). One `begin read only` ... `rollback` transaction; writes nothing.
// It says which state live is in: not started; catalog applied (DRAFT, maybe
// staged); promoted, where it runs the rehearsal's checks against live.
//
//   node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core|rest
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { loadLinks2 } from "./render-us3-sql.mjs";
import { compareHunk } from "./splice-boundary-expectations.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, shortlists } from "./us2-checks.mjs";
import { batchFacts, CHILDREN, CLICK_KEYS, EXPECTED_EDGES, caRelationships, clickResolution, placeDetails, promotedFacts } from "./us3-checks.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const batch = argv.includes("--batch") ? argv[argv.indexOf("--batch") + 1] : null;
if (!["core", "rest"].includes(batch)) { console.error("usage: check-us3-live.mjs --batch core|rest"); process.exit(2); }
const wave = await loadWave(`us3-${batch}`);
const EXPECTED_PATH = `data/wine-map/review/usa-us3-${batch}-expected-boundaries.json`;
const links = batch === "core" ? await loadLinks2() : null;
const problems = [];
let promoted = false;

await withReadOnly(async (c) => {
  const recorded = async (v) => (await c.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const versions = {};
  for (const [what, v] of Object.entries(wave.versions)) versions[what] = await recorded(v);
  const f = await batchFacts(c, wave);
  console.log(`recorded: ${JSON.stringify(versions)}`);
  console.log(`facts: ${JSON.stringify(f)}`);
  if (f.places === 0) {
    if (versions.catalog) problems.push("the catalog is recorded but no place of this batch exists");
    console.log(`US-3 ${batch}: not started`);
    return;
  }
  if (f.verified === 0) {
    if (f.places !== wave.places.length) problems.push(`${f.places} places, expected ${wave.places.length}`);
    if (!versions.catalog) problems.push("places exist but the catalog is not recorded");
    if (f.draft_boundaries === 0 && !f.fresh) problems.push("the neighbour cache is stale with nothing staged");
    console.log(`US-3 ${batch}: ${f.places} DRAFT places; staged boundaries ${f.draft_boundaries}; knowledge recorded ${versions.knowledge} (not promoted yet)`);
    return;
  }
  promoted = true;
  for (const [key, v] of Object.entries(promotedFacts(wave))) if (f[key] !== v) problems.push(`${key} = ${f[key]}, expected ${v}`);
  if (!versions.promote) problems.push("places are VERIFIED but the promote is not recorded");

  const details = await placeDetails(c, wave.places.map((p) => p.key));
  for (const [key, d] of Object.entries(details)) if (!d || !d.article || d.grapes === 0 || d.styles === 0) problems.push(`${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(c, Object.keys(CHILDREN[batch]));
  for (const [key, want] of Object.entries(CHILDREN[batch])) if (kids[key]?.children !== want) problems.push(`${key} has ${kids[key]?.children} children, expected ${want}`);
  const rels = await caRelationships(c);
  for (const e of EXPECTED_EDGES[batch]) if (!rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target)) problems.push(`missing ${JSON.stringify(e)}`);
  for (const r of await clickResolution(c, CLICK_KEYS[batch])) if (r.resolved !== r.key) problems.push(`a click on ${r.key} selects ${r.resolved}`);
  const sl = await shortlists(c);
  if (sl.California.source !== "map") problems.push(`California's shortlist comes from ${sl.California.source}`);
  console.log(`California shortlist: ${sl.California.grapes.join(", ")}`);

  const expected = JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  const off = compareHunk(expected, await expectationRows(c));
  if (off.length) problems.push(`boundary expectations differ from ${EXPECTED_PATH}: ${off.join(", ")}`);

  if (links && versions.links) {
    problems.push(...archetypeProblems(await archetypeFacts(c, links), links));
  } else if (links) {
    console.log("archetype links step 2: not recorded yet (sitting step 11)");
  }
});

if (problems.length) {
  console.error(`US-3 ${batch} LIVE CHECK FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(promoted ? `US-3 ${batch} LIVE CHECK OK` : `US-3 ${batch} LIVE CHECK: not promoted yet; the state above is consistent`);
}
```

- [ ] **Step 4: Run.** `node --test scripts/usa-map/us3-checks.test.mjs` → PASS. Then the live check, read-only: `node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core` → "US-3 core: not started" and "LIVE CHECK: not promoted yet". Same for `--batch rest`.
- [ ] **Step 5: Commit** "feat(usa-map): US-3 checks (details, relationships, click resolution, batch facts) and the read-only live check".

---

### Task 22: The rehearsal script

**Files:**
- Create: `scripts/usa-map/rehearse-us3.mjs`

**Interfaces:**
- Consumes: everything above. Writes `data/wine-map/review/usa-us3-<batch>-rehearsal.json` and `…-expected-boundaries.json` (or, with `--sitting`, `…-rehearsal-sitting.json` and a byte comparison against the committed expected file).

- [ ] **Step 1: Write** `scripts/usa-map/rehearse-us3.mjs`:

```js
// One US-3 batch's whole chain, rehearsed against live in ONE transaction that
// is always rolled back (plan 2026-09-30-usa-wine-map-us3 Tasks 22-24):
// catalog -> knowledge -> stage -> promote (-> archetype links step 2 for
// core), the out-of-order refusals, the rollback drills, and the read-only
// checks as a signed-in reader. For --batch rest while the core is not live,
// the core chain runs first in the same transaction (no drills). No commit
// path: the only terminal statement is the rollback in `finally`.
//
// It holds wine_place_neighbours_state's row for its whole run (8-9
// in-transaction refreshes, about 10 minutes): run the activity check first,
// never two at once, only as often as the plan says.
//
//   node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch core|rest [--sitting]
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { loadStageInputs, stageWave } from "../wine-map-sources/usa-stage-lib.mjs";
import { previewRelease } from "./export-preview.mjs";
import { loadLinks2 } from "./render-us3-sql.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, exportPreviewRows, shortlists } from "./us2-checks.mjs";
import {
  batchFacts, caRelationships, CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, NEARBY_KEYS, placeDetails, promotedFacts,
} from "./us3-checks.mjs";
import { CA_KEY } from "./us3-wave.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const batch = argv.includes("--batch") ? argv[argv.indexOf("--batch") + 1] : null;
const SITTING = argv.includes("--sitting");
if (!["core", "rest"].includes(batch) || argv.some((a) => !["--batch", "core", "rest", "--sitting"].includes(a))) {
  console.error("usage: rehearse-us3.mjs --batch core|rest [--sitting]");
  process.exit(2);
}
const core = await loadWave("us3-core");
const rest = await loadWave("us3-rest");
const us2 = await loadWave("us2");
const wave = batch === "core" ? core : rest;
const links = await loadLinks2();
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
const head = execSync("git rev-parse HEAD").toString().trim();
const EXPECTED_PATH = `data/wine-map/review/usa-us3-${batch}-expected-boundaries.json`;
const REHEARSAL_PATH = `data/wine-map/review/usa-us3-${batch}-rehearsal${SITTING ? "-sitting" : ""}.json`;
const REFRESH_LIMIT_S = 300;
const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
};

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({ connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""), ssl: { rejectUnauthorized: false } });
const notices = [];
client.on("notice", (n) => notices.push(n.message));

const t0 = Date.now();
const timings = {};
const secs = (from) => Math.round((Date.now() - from) / 100) / 10;
const log = (msg) => console.log(`[${secs(t0).toFixed(1)} s] ${msg}`);
async function step(name, fn) {
  const s = Date.now();
  const out = await fn();
  timings[name] = secs(s);
  log(`${name}: ${timings[name]} s`);
  return out;
}
const q = async (sql, params) => (await client.query(sql, params)).rows;
const recorded = async (v) => (await q("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).length > 0;
const file = (path) => readFile(path, "utf8");
const run = async (path) => client.query(await file(path));
function refreshSeconds(label, from) {
  const hit = notices.slice(from).map((m) => new RegExp(`^${label}: neighbour refresh (-?\\d+) rows in ([\\d.]+) s$`).exec(m)).find(Boolean);
  assert.ok(hit, `no refresh notice for ${label}`);
  return { rows: Number(hit[1]), seconds: Number(hit[2]) };
}
const refreshes = {};
async function refreshing(name, label, fn) {
  const from = notices.length;
  const out = await step(name, fn);
  refreshes[name] = refreshSeconds(label, from);
  assert.ok(refreshes[name].rows >= 0 && refreshes[name].seconds < REFRESH_LIMIT_S, `${name}: refresh ${JSON.stringify(refreshes[name])}`);
  return out;
}
const refusals = {};
async function expectRefusal(name, pattern, fn) {
  await client.query(`savepoint refusal_${name}`);
  try {
    await fn();
  } catch (e) {
    assert.match(e.message, pattern, `refusal ${name}: wrong error`);
    refusals[name] = e.message.slice(0, 300);
    log(`refusal ${name}: ${refusals[name]}`);
    return;
  } finally {
    await client.query(`rollback to savepoint refusal_${name}`);
  }
  assert.fail(`refusal ${name}: expected ${pattern}, but it succeeded`);
}
const stage = (w, label) => stageWave(client, {
  wave: w, ...stageInputs, revision: releaseVersion(), importer: `scripts/usa-map/rehearse-us3.mjs@${head}`, label, log: () => {},
});
const byName = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
const tag = `US-3 ${batch}`;

const result = { _generated_by: "scripts/usa-map/rehearse-us3.mjs", batch, git_head: head };
let expected;
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 2700000");
  result.rehearsed_at = (await q("select now() t"))[0].t.toISOString();

  // 1. Pre-flight.
  assert.ok(await recorded(us2.versions.promote), "the US-2 promote is not live");
  assert.ok(!(await recorded(wave.versions.promote)), `the ${batch} promote is already recorded live`);
  if (batch === "core") assert.ok(!(await recorded(core.versions.links)), "archetype links step 2 is already recorded live");
  result.cache_before = (await q("select fresh, built_at from public.wine_place_neighbours_state"))[0];
  result.applied_in_transaction = [];
  result.prepended = [];

  // 2. The rest batch needs the core live: run the core chain first if it is not.
  if (batch === "rest" && !(await recorded(core.versions.promote))) {
    if (!(await recorded(core.versions.catalog))) {
      await refreshing("prepend_core_catalog", "US-3 core catalog", () => run(core.files.catalog));
      result.prepended.push(core.files.catalog);
    }
    if (!(await recorded(core.versions.knowledge))) { await step("prepend_core_knowledge", () => run(core.files.knowledge)); result.prepended.push(core.files.knowledge); }
    await step("prepend_core_stage", () => stage(core, "STAGED-PREPEND"));
    await refreshing("prepend_core_promote", "US-3 core promote", () => run(core.files.promote));
    result.prepended.push("stageWave(us3-core)", core.files.promote);
  }

  const before = await step("shortlists_before", () => shortlists(client));

  // 3. Review Focus 3: the rest catalog refuses before the core catalog exists.
  if (batch === "core" && !(await recorded(core.versions.catalog))) {
    await expectRefusal("R_rest_catalog_before_core", /an earlier wave is missing or not VERIFIED/, () => run(rest.files.catalog));
  }

  // 4. This batch's catalog and knowledge.
  if (!(await recorded(wave.versions.catalog))) {
    await refreshing("catalog", `${tag} catalog`, () => run(wave.files.catalog));
    result.applied_in_transaction.push(wave.files.catalog);
  }
  if (!(await recorded(wave.versions.knowledge))) {
    await step("knowledge", () => run(wave.files.knowledge));
    result.applied_in_transaction.push(wave.files.knowledge);
  }
  assert.equal((await batchFacts(client, wave)).places, wave.places.length);

  // 5. Out-of-order refusals (Review Focus 3 and 5).
  if (batch === "core") {
    await expectRefusal("G_core_remove_while_rest_exists", /other California places exist \(remove the later batch first\)/, async () => {
      await run(rest.files.catalog);
      await run(core.rollbackFiles.remove);
    });
  }
  await expectRefusal("A_promote_before_stage", /expected exactly one DRAFT, non-current boundary per place/, () => run(wave.files.promote));
  if (batch === "core") await expectRefusal("B_links_before_promote", /is not VERIFIED with a current boundary/, () => run(core.files.links));

  // 6. Stage, exactly as the CLI's dry run; a second stage refuses.
  const stageReport = await step("stage", () => stage(wave, "STAGED-REHEARSAL"));
  await expectRefusal("C_stage_twice", /united-states boundaries already exist/, () => stage(wave, "x"));
  if (batch === "core") {
    await expectRefusal("S_rest_stage_before_core_promote", /an earlier wave is not live/, () => stage(rest, "x"));
  }

  // 7. Drill 1: unstage, re-stage, unstage again (the file is re-appliable).
  const rollbacks = {};
  await client.query("savepoint s1");
  {
    await refreshing("drill_unstage", `${tag} unstage`, () => run(wave.rollbackFiles.unstage));
    let f = await batchFacts(client, wave);
    rollbacks.unstage = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage), [0, wave.places.length, true]);
    await step("drill_restage", () => stage(wave, "x"));
    await refreshing("drill_unstage_again", `${tag} unstage`, () => run(wave.rollbackFiles.unstage));
    f = await batchFacts(client, wave);
    rollbacks.unstage_again = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage_again), [0, wave.places.length, true]);
  }
  await client.query("rollback to savepoint s1");

  // 8. Drill 2: remove, then catalog and knowledge apply again as committed.
  await client.query("savepoint s2");
  {
    await refreshing("drill_remove", `${tag} remove`, () => run(wave.rollbackFiles.remove));
    rollbacks.remove = {
      places: (await batchFacts(client, wave)).places,
      history_rows: (await q("select count(*)::int n from supabase_migrations.schema_migrations where version = any($1)",
        [[wave.versions.catalog, wave.versions.knowledge]]))[0].n,
    };
    assert.deepEqual(Object.values(rollbacks.remove), [0, 0]);
    await refreshing("drill_reapply_catalog", `${tag} catalog`, () => run(wave.files.catalog));
    await step("drill_reapply_knowledge", () => run(wave.files.knowledge));
    rollbacks.remove.reapplied_places = (await batchFacts(client, wave)).places;
    assert.equal(rollbacks.remove.reapplied_places, wave.places.length);
  }
  await client.query("rollback to savepoint s2");

  // 9. Refusal D: the unpublish before the promote.
  await expectRefusal("D_unpublish_before_promote", new RegExp(`${tag} unpublish: not VERIFIED with one current boundary`),
    () => run(wave.rollbackFiles.unpublish));

  // 10. The promote.
  await refreshing("promote", `${tag} promote`, () => run(wave.files.promote));
  result.applied_in_transaction.push(wave.files.promote);
  if (batch === "rest") result.central_valley = notices.find((m) => /Central Valley against its members/.test(m)) ?? null;

  // 11. Refusals after the promote.
  await expectRefusal("E_remove_after_promote", /keys are locked \(the promote ran\)/, () => run(wave.rollbackFiles.remove));
  if (batch === "rest") {
    await expectRefusal("H_core_unpublish_while_rest_live", /a later batch is live \(unpublish it first\)/, () => run(core.rollbackFiles.unpublish));
  }

  // 12. The promoted state.
  const facts = await batchFacts(client, wave);
  assert.deepEqual(facts, promotedFacts(wave), JSON.stringify(facts));

  // 13. The expected boundary-expectations hunk (every united-states row).
  expected = await expectationRows(client);
  assert.equal(expected.length, 16 + (batch === "core" ? 86 : 150));
  for (const p of wave.places) {
    const row = expected.find((r) => r.canonical_key === p.key);
    assert.deepEqual([row?.boundary_method, row?.source_feature_id, row?.documented],
      ["GENERALIZED_FROM_OFFICIAL_SOURCE", p.ucd_ava_id, true], p.key);
  }

  // 14. The tile preview.
  const preview = previewRelease(await step("export_preview", () => exportPreviewRows(client)));
  assert.deepEqual(preview.world, ["united-states", ...us2.states.map((s) => s.key)].sort());
  assert.deepEqual([preview.shards.california.keys.length, preview.shards.california.max_zoom], [wave.after.caPlaces, 12]);
  assert.equal(preview.outline.length, 11);
  assert.ok(preview.outline.includes(`${CA_KEY}.central-coast.san-francisco-bay`));
  assert.deepEqual(preview.outside, []);

  // 15. The details panel, as a signed-in reader.
  const details = await step("details", () => placeDetails(client, wave.places.map((p) => p.key)));
  for (const [key, d] of Object.entries(details)) assert.ok(d && d.article && d.grapes > 0 && d.styles > 0, `${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(client, Object.keys(CHILDREN[batch]));
  for (const [key, want] of Object.entries(CHILDREN[batch])) assert.equal(kids[key].children, want, `children of ${key}`);
  if (batch === "core") {
    const rrv = details[`${CA_KEY}.north-coast.northern-sonoma.russian-river-valley`].ancestors;
    assert.ok(rrv.includes(`${CA_KEY}.north-coast`) && rrv.includes(`${CA_KEY}.north-coast.northern-sonoma`), `RRV breadcrumb ${rrv}`);
    assert.ok(!rrv.includes(`${CA_KEY}.north-coast.sonoma-coast`));
  }
  const rels = await caRelationships(client);
  assert.equal(rels.length, wave.after.caEdges);
  for (const e of EXPECTED_EDGES[batch]) assert.ok(rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target), JSON.stringify(e));
  const clicks = await clickResolution(client, CLICK_KEYS[batch]);
  for (const c of clicks) assert.equal(c.resolved, c.key, `a click on ${c.key}`);
  const nearby = await placeDetails(client, NEARBY_KEYS[batch]);

  // 16. The grape shortlists (§10.3).
  const after = await step("shortlists_after", () => shortlists(client));
  assert.equal(after.California.source, "map");

  // 17. Archetype links step 2 (core).
  let arch = null;
  let dots = null;
  if (batch === "core") {
    const pre = await archetypeFacts(client, links);
    await step("links", () => run(core.files.links));
    result.applied_in_transaction.push(core.files.links);
    arch = await archetypeFacts(client, links);
    assert.deepEqual(archetypeProblems(arch, links), []);
    if (arch.points) assert.deepEqual([arch.points.with_point, arch.points.placed_with_point], [15, 0]);
    await expectRefusal("F_links_twice", /pre-state is not step 1/, () => run(core.files.links));
    const point = (facts, id) => {
      const r = facts.room.find((x) => x.archetype_id === id);
      return r && r.point_lon != null ? [r.point_lon, r.point_lat].map((v) => Math.round(v * 1000) / 1000) : null;
    };
    dots = links.map((l) => {
      const was = point(pre, l.archetype_id);
      const now = point(arch, l.archetype_id);
      return { name: l.name, home: l.home, before: was, after: now, moved_km: was && now ? km(was, now) : null };
    });
  }

  // 18. Drill 3: unpublish (core: links back to step 1).
  await client.query("savepoint s3");
  {
    await refreshing("drill_unpublish", `${tag} unpublish`, () => run(wave.rollbackFiles.unpublish));
    const f = await batchFacts(client, wave);
    rollbacks.unpublish = { verified: f.verified, current: f.current_validated, locked: f.locked, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unpublish), [0, 0, wave.places.length, true]);
    if (batch === "core") {
      const back = await archetypeFacts(client, links);
      for (const l of links) {
        const a = back.archetypes.find((x) => x.id === l.archetype_id);
        assert.deepEqual([a.home, a.placements], [l.from.home, [...l.from.placements].sort()], `${l.name} back to step 1`);
      }
      rollbacks.unpublish.links_back_to_step_1 = true;
    }
  }
  await client.query("rollback to savepoint s3");

  // 19. The evidence (written after the rollback below).
  const names = (s) => s.grapes;
  Object.assign(result, {
    timings_s: byName(timings),
    refreshes: byName(refreshes),
    refusals: byName(refusals),
    rollbacks,
    facts,
    parent_inside_lowest: stageReport.filter((r) => r.parent_inside != null)
      .sort((a, b) => a.parent_inside - b.parent_inside).slice(0, 5).map((r) => ({ key: r.key, parent_inside: r.parent_inside })),
    drift_highest: stageReport.slice().sort((a, b) => b.drift - a.drift).slice(0, 5).map((r) => ({ key: r.key, drift: r.drift })),
    clicks,
    nearby: Object.fromEntries(NEARBY_KEYS[batch].map((key) => [key, nearby[key]?.nearby ?? []])),
    shortlist: Object.fromEntries(Object.keys(before).map((st) => [st, {
      before_source: before[st].source, before: names(before[st]),
      after_source: after[st].source, after: names(after[st]), after_place: after[st].placeName,
      colours: byName({ ...before[st].colours, ...after[st].colours }),
    }])),
    export_preview: { world: preview.world, outline: preview.outline,
      shards: Object.fromEntries(Object.entries(preview.shards).map(([key, s]) => [key, { keys: s.keys.length, max_zoom: s.max_zoom, bytes: s.bytes }])) },
    archetypes: arch && { links: arch.archetypes, dots },
    stage_report: stageReport,
    notices: notices.filter((m) => /neighbour refresh|US-3|US archetype|Central Valley/.test(m)),
  });
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

result.total_s = secs(t0);
result.mode = SITTING ? "sitting" : "pre-sitting";
await writeFile(REHEARSAL_PATH, `${JSON.stringify(result, null, 2)}\n`);
const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
if (SITTING) {
  const committed = (await readFile(EXPECTED_PATH, "utf8")).replace(/\r\n/g, "\n");
  log(`wrote ${REHEARSAL_PATH}`);
  if (committed !== expectedText) {
    console.error(`REHEARSAL FAILED: the expected boundaries differ from the committed ${EXPECTED_PATH}; stop the sitting and investigate`);
    process.exit(1);
  }
  log(`the expected boundaries equal the committed ${EXPECTED_PATH}`);
} else {
  await writeFile(EXPECTED_PATH, expectedText);
  log(`wrote ${REHEARSAL_PATH} and ${EXPECTED_PATH}`);
}
console.log("REHEARSAL OK");
```

- [ ] **Step 2: Syntax and lint only** (the rehearsals run in Tasks 23–24): `node --check scripts/usa-map/rehearse-us3.mjs` and `npx eslint scripts/usa-map/rehearse-us3.mjs scripts/usa-map/us3-checks.mjs scripts/usa-map/check-us3-live.mjs` → clean. `node scripts/usa-map/rehearse-us3.mjs --batch middle` → exit 2 with the usage line.
- [ ] **Step 3: Commit** "feat(usa-map): rehearse-us3.mjs, one rolled-back transaction per batch (refusals R, G, A-F, S, H; three drills)".

---

### Task 23: Rehearse the core batch (rolled back), and commit its evidence

**Files:** Create (written by the rehearsal): `data/wine-map/review/usa-us3-core-rehearsal.json`, `data/wine-map/review/usa-us3-core-expected-boundaries.json`.

- [ ] **Step 1:** Run the activity check. `active`, `writers` and `building` must be empty and `draft_boundaries` 0; if not, wait and re-check, never start over someone.
- [ ] **Step 2: Rehearse.** `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch core` (run in the background; about 10 minutes). Expected, in order: refusal R; the catalog with its refresh; the knowledge; refusals G, A, B; the stage; refusals C and S; the three drills; refusal D; the promote with its refresh; refusal E; the details, relationships, clicks, shortlists; the links and refusal F; the unpublish drill; `REHEARSAL OK`. Every refresh under 300 s (the script asserts it).
- [ ] **Step 3: Read the evidence** and check by eye:
  - `facts` equals `promotedFacts` (86/86/86/86/0, ca_live 92, ca_relationships 24, us_outline 11, fresh);
  - `parent_inside_lowest` starts with Santa Ynez Valley near 0.995092;
  - `export_preview.shards.california.bytes`: record it; if it is above 2,500,000 (a GeoJSON proxy nearing §13.2's 3 MB archive target), note it for the runbook's step 9 decision (a higher tolerance for the largest shapes is a new DRAFT cycle, not a code change);
  - `clicks` all resolve to themselves;
  - `shortlist.California.after`: note where Cabernet Sauvignon, Chardonnay and Pinot Noir land;
  - `archetypes.dots`: the two California wines move from North Coast's label point to Napa Valley's and Sonoma Coast's.
  If any assert failed, fix the cause (never the assert), re-run the unit tests, and re-rehearse once.
- [ ] **Step 4: Commit** the two evidence files: "data(usa-map): the US-3 core rehearsal (rolled back) and its expected boundaries". Put the refresh seconds, the total and the shard bytes in the body.

---

### Task 24: Rehearse the rest batch (rolled back, with the core chain first), and commit its evidence

**Files:** Create (written by the rehearsal): `data/wine-map/review/usa-us3-rest-rehearsal.json`, `data/wine-map/review/usa-us3-rest-expected-boundaries.json`.

- [ ] **Step 1:** Activity check, as Task 23.
- [ ] **Step 2: Rehearse.** `node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch rest` (background; about 11 minutes). Expected: the prepended core catalog, knowledge, stage and promote (two refreshes); the rest catalog and knowledge; refusals A and C; the drills; D; the promote (with the NOTICE "Central Valley against its members: symmetric difference 0.000…"); E and H; the checks; the unpublish drill; `REHEARSAL OK`.
- [ ] **Step 3: Read the evidence:** `facts` (64/64/64/64/0, ca_live 156, ca_relationships 29, us_outline 11, fresh); `central_valley` below 0.001 and 0.0001; `prepended` lists the four core items; the California shard bytes; Cole Ranch and Lime Kiln Valley resolve to themselves.
- [ ] **Step 4: Commit** "data(usa-map): the US-3 rest rehearsal (rolled back, core chain prepended) and its expected boundaries".

The rest expected-boundaries file holds every united-states row after both batches. It stays valid after the core sitting, because the core's rows are deterministic (same artifact, same checksums, same snapshot URIs); the rest sitting's `--sitting` rehearsal re-proves it byte for byte.

---

### Task 25: The review files, spec §26, the two sitting runbooks, and final verification

**Files:**
- Create (rendered): `data/wine-map/review/usa-us3-core-knowledge-1.md` … `-3.md`, `data/wine-map/review/usa-us3-rest-knowledge-1.md`, `-2.md`
- Modify: `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` (new §26)
- Create: `docs/superpowers/plans/2026-09-30-usa-wine-map-us3-core-sitting.md`, `docs/superpowers/plans/2026-09-30-usa-wine-map-us3-rest-sitting.md`

- [ ] **Step 1: Render the review files.** `node scripts/usa-map/render-usa-us3-review.mjs --batch core` and `--batch rest`. Expected: three core files (29, 29, 28 places) and two rest files (32, 32); the last of each carries the California shortlist table and the nearby lists, and the core's last also the typical-wine dots. Then `node --test scripts/usa-map/usa-us3-knowledge.test.mjs` → the two review tests now run and PASS.
- [ ] **Step 2: Spec §26.** Append to the spec a section "## 26. US-3 plan decisions (2026-09-30)", opening with "Settled by the US-3 plan (`docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md`), not by the owner (the owner waived review on 2026-09-30). Each departs from, or sharpens, an earlier section." followed by the fourteen decisions of this plan's "Decisions this plan makes", one bullet each, in the same words, with the measured numbers of Tasks 23–24 added to decisions 6 and 8. In §15's US-3 acceptance bullet "Russian River Valley … has `ALTERNATE_PARENT` rows to Sonoma Coast", append "(the tree has an `OVERLAPS` edge, 87.95%; see §26)".
- [ ] **Step 3: The runbooks.** Write each runbook from the matching "Ship instructions" section below, verbatim, adding after the step it belongs to, in *italics*, the numbers the batch's rehearsal measured (from `usa-us3-<batch>-rehearsal.json`: each refresh's seconds, the stage's seconds, the lowest parent share, the shard bytes, the Central Valley figures for rest, the dots for core). Open each with the `$APPLIER`/`$ROLLBACK` definitions exactly as the US-2 runbook's first two paragraphs.
- [ ] **Step 4: Final verification.**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs scripts/wine-map-sources/gen-place-profiles-args.test.mjs scripts/wine-map-sources/gen-place-profiles-sql.test.mjs && npx eslint scripts/usa-map scripts/wine-map-sources/usa-stage-lib.mjs scripts/wine-map-sources/stage-usa-ava.mjs scripts/wine-map-sources/gen-place-profiles-args.mjs scripts/wine-map-sources/gen-place-profiles-migration.mjs && node scripts/usa-map/render-us3-sql.mjs && node scripts/usa-map/render-us3-notes.mjs && git status --short
```

Expected: every test green; eslint clean; the renders rewrite nothing (`git status` shows only the files of this step).
- [ ] **Step 5: Commit** the review files, the spec and the two runbooks: "docs(usa-map): US-3 review files, spec §26, and the core and rest sitting runbooks".

---

## Ship instructions: the core sitting (main session only)

**Release captain:** the main session, alone, for the whole window (about 30–45 minutes). Tell the friend (GitHub Birchenz) the time ahead and at the start; they run no catalogue batch and dispatch no tiles run until "done". `$APPLIER` records a version and refuses one already recorded; `$ROLLBACK` (`scripts/usa-map/apply-rollback.mjs`) records nothing. Run every command from the repository root. Activity check: `node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

**Before the sitting (separate days are fine):**

1. **Merge `usa-map` to master**, rebased, as a staged push. The runtime-adjacent changes are none (scripts, data, migrations not applied). Master's checks must be green. Tell the friend: `gen-place-profiles-migration.mjs --prelude` may now repeat (default output unchanged), and `usa-stage-lib.mjs`'s gate field `usBoundaries` is now `waveBoundaries`.
2. **Catalog, at a quiet hour.** Activity check; then `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930154747_usa_us3_core_catalog.sql --check`, `--dry`, then no flag. Expected `APPLIED`, and the refresh notice under 300 s. Then `node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core` → 86 DRAFT places, cache fresh.
3. **Knowledge:** `--check`, `--dry`, then apply `supabase/migrations/20260930164747_usa_us3_core_knowledge.sql` (no `wine_places` write, no refresh, no tiles).

**The sitting, in order:**

1. Announce the start; wait for the friend's "quiet". Note the ACTIVE release (reference only).
2. `git pull`; `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs` → green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch core --sitting` → `REHEARSAL OK`. It writes only `usa-us3-core-rehearsal-sitting.json` and fails unless the boundaries it stages equal the committed `usa-us3-core-expected-boundaries.json` byte for byte. If it fails, stop.
4. **Stage, dry:** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us3-core` → `DONE (dry): 86 boundaries …`.
5. **Gate:** `… --wave us3-core --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us3-core --stage`. Expected: `RAW skip storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/CA_avas.geojson` (uploaded at US-2), `STAGE COMPLETE: 86 DRAFT boundaries committed for us3-core`, and the stale-cache banner. From here until step 7 master's map-data job is red for both people: keep the gap to minutes.
7. **Promote:** `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930174747_usa_us3_core_promote.sql --check`, `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice.
8. **Check:** `node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core` → `US-3 core LIVE CHECK OK` (86 VERIFIED/locked/current, 92 live California places, 24 relationships, 11 outlines, fresh; articles, grapes and styles everywhere; children counts; the six named edges; Oakville, Rutherford, Stags Leap District and Los Carneros resolve to themselves; the boundary hunk equals the committed file).
9. **Tests and the expectations hunk:** `node --env-file=.env.local --test scripts/wine-place-context.test.mjs` → green; `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --check data/wine-map/review/usa-us3-core-expected-boundaries.json --write`; `git diff --stat` shows only 86 added `united-states.california.*` rows (report any other country's difference to the friend, never commit it); `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green; commit "data(wine-map): pin the US-3 core boundaries (united-states hunk only)" and push master as a staged push.
10. **Tiles:** `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, `gh run watch`; the release is ACTIVE; the manifest's `california` ≤ 3 MB, world ≤ 400 KB (§13.2). If `california` exceeds 3 MB, leave the release in place and plan a new DRAFT boundary cycle with a higher tolerance for the largest shapes (not a code change).
11. **Map checks** on desktop, iPhone Chrome and iPhone Safari: clicking or tapping Oakville selects Oakville, not Napa Valley or North Coast; Russian River Valley's breadcrumb reads North Coast › Northern Sonoma; "… › Russian River Valley › Green Valley of Russian River Valley" wraps cleanly at 375 px; San Francisco Bay draws as an outline and Napa's sub-AVAs fill; each place's panel shows an article, grapes (signature first, the rest tagged "accessory") and styles; the nearby chips for the eight §8.7 keys match the rehearsal's `nearby` (accept them, or add the function change to §20); dark mode.
12. **Archetype links step 2:** `"$APPLIER" supabase/migrations/20260930184747_usa_archetype_links_2.sql --check`, `--dry`, then apply. Then `node --env-file=.env.local --test scripts/training-room.test.mjs` → green (Napa on Napa Valley); `check-us3-live.mjs --batch core` → OK including the archetype section; on the map "Typical wine" lists the Napa Cabernet Sauvignon on Napa Valley (and North Coast, California) and the Sonoma Chardonnay on Sonoma Coast and Russian River Valley (and North Coast, California).
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

## Ship instructions: the rest sitting (main session only)

Same captain, announcement and conventions as the core sitting. **The core sitting must be complete first** (its promote recorded; the gate and the rest catalog check it).

**Before the sitting:**

1. The core sitting is done and `check-us3-live.mjs --batch core` says OK.
2. **Catalog, at a quiet hour:** activity check; `$APPLIER supabase/migrations/20260930194747_usa_us3_rest_catalog.sql --check`, `--dry`, apply; refresh under 300 s. `check-us3-live.mjs --batch rest` → 64 DRAFT places, cache fresh.
3. **Knowledge:** `--check`, `--dry`, apply `supabase/migrations/20260930204747_usa_us3_rest_knowledge.sql`.

**The sitting, in order:**

1. Announce; wait for "quiet".
2. `git pull`; the unit tests green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch rest --sitting` → `REHEARSAL OK` (with the core live it prepends nothing; it fails unless the staged boundaries equal the committed `usa-us3-rest-expected-boundaries.json`).
4. **Stage, dry:** `stage-usa-ava.mjs --wave us3-rest` → `DONE (dry): 64 boundaries …`.
5. **Gate:** `… --wave us3-rest --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us3-rest --stage` → `RAW skip …CA_avas.geojson`, `STAGE COMPLETE: 64 …`, the banner.
7. **Promote:** `"$APPLIER" supabase/migrations/20260930214747_usa_us3_rest_promote.sql` `--check`, `--dry`, apply. Record the refresh notice and the "Central Valley against its members" NOTICE.
8. **Check:** `check-us3-live.mjs --batch rest` → `US-3 rest LIVE CHECK OK` (64 VERIFIED, 156 live California places, 29 relationships, 11 outlines; Cole Ranch and Lime Kiln Valley resolve to themselves; the hunk equals the committed file).
9. **Tests and the hunk:** as the core sitting's step 9 with `usa-us3-rest-expected-boundaries.json`; `git diff --stat` shows only 64 added `united-states.california.*` rows; commit "data(wine-map): pin the US-3 rest boundaries (united-states hunk only)", staged push.
10. **Tiles:** as the core's step 10; `california` ≤ 3 MB.
11. **Map checks** (desktop, iPhone Chrome, iPhone Safari): Cole Ranch (about 0.8 km²) is selectable by tap at phone zoom; "Antelope Valley of the California High Desert" wraps cleanly at 375 px; Central Valley's outline still frames its eleven members; North Coast's child pills (22) are usable at 375 px; each new panel shows an article, grapes and styles; the four §8.7 nearby lists match the rehearsal's; the California grape shortlist matches the rehearsal's `shortlist.California.after` (accept it).
12. Tell the friend it is done; commit `usa-us3-rest-rehearsal-sitting.json` on its own.

**Rollback:** as the core table, with the `usa_us3_rest_*` files. The rest remove and unpublish touch only the 64 rest places; the core stays live.

---

## Acceptance checks mapped to tasks

| Requirement (spec §15 US-3, and this run's brief) | Where it is built | Where it is proved |
|---|---|---|
| Catalog keyed exactly as `usa-california-tree.json` | Tasks 1, 3 | Task 1 tests (tree order, tiers, classification, keys); Task 3 render test and core `--dry`; the catalogs' own "rows differ from the tree report" assert |
| Tile zoom tiers; outline-only ≥ 5,000 km² (D15, D16) | Tasks 1, 18 | Task 1 tests (zooms, San Francisco Bay the only new outline); the promote's D15 assert; Tasks 23–24 preview (11 outlines, shard max zoom 12) |
| Knowledge for every place: article, grapes, styles, from authoritative sources, factual | Tasks 5–15 | Task 5 validator (Established fact vs TTB, limits, no copied text, CFR/Federal Register source); Task 15 migration-current tests; the promotes' coverage assert; Tasks 23–24 details for every place |
| Staging via `stage-usa-ava.mjs`, one transaction per batch | Tasks 16, 17 | Task 16 gate tests; Task 17 core dry run and the rest refusal; rehearsals (stage, refusal C, re-stage drill) |
| Promote with asserts and the neighbour refresh | Task 18 | Task 18 render tests; rehearsals (refusals A, E; refresh < 300 s; post-state facts) |
| Cross-state / `ALTERNATE_PARENT` / `OVERLAPS` edges | Tasks 1, 18 | Task 1 edge tests (24 + 5, where each lands, none to an own ancestor); the promote's geometric edge re-check; rehearsals' `EXPECTED_EDGES`. California has no cross-state AVA, so there is no state edge in US-3 (every AVA's legal states are CA only; Task 1 test) |
| The tree report is reviewed (containment, edges, `within` disagreements explained) | Task 2 | Task 2 test (El Dorado, Russian River Valley, Cole Ranch, High Valley listed with their ratios) |
| Every place has an article; the promote asserts pass | Tasks 15, 18 | rehearsals; sitting step 8 |
| California shard within target | — | rehearsals' shard bytes (proxy); sitting step 10 (archive) |
| Clicking Oakville selects Oakville; Cole Ranch and Oakville tappable at phone zoom | Task 21 (`CLICK_KEYS`) | rehearsals' click assert; live check; sitting step 11 (phone) |
| Russian River Valley: breadcrumb North Coast › Northern Sonoma; its Sonoma Coast relation | Tasks 1, 21 | Task 1 test; core rehearsal's ancestors assert; decision 3 (`OVERLAPS`, not `ALTERNATE_PARENT`) |
| Long names wrap at 375 px | — | sitting step 11 (core: Green Valley; rest: Antelope Valley) |
| §8.7 nearby lists accepted | Task 21 (`NEARBY_KEYS`) | rehearsal evidence; review files (Task 25); sitting step 11 |
| §10.3 shortlist comparison repeated | Task 22 | rehearsal evidence; review files; sitting step 11 (rest) |
| Archetype links step 2 (Napa → Napa Valley; Sonoma → Sonoma Coast; North Coast and California kept) | Task 19 | Task 19 tests; core rehearsal (links, refusal F, unpublish back to step 1); sitting step 12 |
| Rollback files through `apply-rollback.mjs` | Task 20 | Task 20 tests and `--check`/`--dry` refusals; rehearsals' three drills and refusals D, E, G, H |
| A rolled-back rehearsal per batch | Task 22 | Tasks 23, 24 |
| A sitting runbook per batch | Task 25 | — |
| Central Valley's outline equals its promoted members' union (§25) | Task 18 (rest) | rest rehearsal's NOTICE and assert |

## What the main session does afterwards

1. Review the branch (the plan's last commit is Task 25).
2. **Core batch:** follow `docs/superpowers/plans/2026-09-30-usa-wine-map-us3-core-sitting.md`: merge to master (staged push), apply the core catalog and knowledge at a quiet hour, then the sitting (rehearse `--sitting`, stage, promote, live check, the boundary hunk and a staged push, the tiles release with `promote=true`, the map checks on desktop and both iPhone browsers, archetype links step 2, the training-room test).
3. **Rest batch:** only after the core sitting, follow `…-us3-rest-sitting.md` the same way (no archetype links).
4. Accept, per batch, the §8.7 nearby lists and the §10.3 California shortlist from the review files; anything unacceptable goes to §20 (the function change needs the friend's live-only migration in git first).
5. After both: US-4 (Washington, Oregon, New York AVAs) can start; nothing in US-3 blocks it, and US-3's checks read only `united-states.california.*`.

## Provisional copy (new user-facing text)

- Every article field (`description`, `climate`, `soils`, `grape_varieties`, `wine_styles`) and every key fact of the 86 places in `data/wine-map/place-profiles-usa-us3-core.json` and the 64 in `…-us3-rest.json`.
- Every grape `note`, if any is written, and any `new_grapes` description (none is expected).
- The review files `data/wine-map/review/usa-us3-*-knowledge-*.md` (their framing lines).
- Not user-facing: the relationship notes ("US-3 core, California tree report: basis …"), the fact sheet and the tree review.

## Execution notes

- Tasks 6–14 are research and writing; they dominate the time. They are independent of each other within a batch, but all write the same data file: run them one at a time (or have each subagent write a separate scratch JSON of its places, then merge them into the data file and run `order-us3-profiles.mjs`).
- Tasks 1–5 and 16–22 are code with tests and can go before the knowledge is finished, except Task 15 (needs Tasks 10 and 14), Task 17 Step 3 (needs the core knowledge migration) and Tasks 23–24 (need everything).
- Every live-touching step is read-only or rolled back; the ones that hold the neighbour-state lock are Task 3 Step 6, Task 15 Steps 3–4, Task 17 Step 3 and Tasks 23–24. Run the activity check before each.
