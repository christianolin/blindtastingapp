# USA on the wine map: phase US-4 (Washington, Oregon and New York AVAs), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything phase US-4 needs, up to but not including its live sitting:

- two legal-record fixes to the tree config, made before any key renders (Candy Mountain keyed under Yakima Valley; no Candy Mountain / Goose Gap overlap), and the four tree reports rebuilt;
- one catalog migration: the 42 AVAs of `data/wine-map/usa-{washington,oregon,new-york}-tree.json` (New York 8, Oregon 18, Washington 16), DRAFT, with the checked neighbour refresh;
- knowledge (article, grapes, styles) for all 42 places, researched and written in session, as one data file and one generated knowledge migration, with six new hybrid grapes;
- the stage script taking `--wave us4` (dry run only here);
- one promote migration (asserts, the cross-state rules, edges, the neighbour-cache refresh);
- three rollback files run through `scripts/usa-map/apply-rollback.mjs`;
- one rolled-back rehearsal, and the sitting runbook.

Nothing is applied, nothing is written live or to Storage, and no tiles run is dispatched.

**Architecture:** US-4 is one wave, `us4`, read from the three committed tree reports and TTB's list by a new pure module, `scripts/usa-map/us4-wave.mjs`, the way US-3 read California's. Its checks are scoped to the three states' keys, so California (live since US-3) is never read or touched. `scripts/usa-map/render-us4-sql.mjs` renders the catalog, the promote and the rollbacks from that wave, and tests prove each committed file equals its render. The promote re-checks the cross-state rules geometrically (each AVA inside its legal states; each state edge at the tree's land share). The stage library learns a list of scope keys; everything else in it is US-3's. `rehearse-us4.mjs` runs the whole chain in one transaction that is always rolled back and writes committed evidence. Knowledge is written by hand into `data/wine-map/place-profiles-usa-us4.json` and checked by US-3's rule plus a US-4 new-grape and shortlist-lead rule.

**Tech Stack:** Node 24 ESM with `node:test`, `pg`, `@supabase/supabase-js` (Storage, only in `--stage`, never run here), PL/pgSQL on live Postgres (read-only or rolled back only), WebSearch/WebFetch for the in-session research.

**Spec:** `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md`. Read all of it. The parts that matter most here: D1–D9, D14–D16, D19–D24; §4, §8 (all), §10, §11, §12, §13, §14 (the Willamette row: "unchanged"), §15 (the wave order, and US-4), §16, §17, §18, §24, §25 and §26. Also read:

- `CLAUDE.md` ("A catalogue write must be followed by a neighbour-cache refresh", World Wine Map Phases 3A–3D, "Wine map performance") and `AGENTS.md` (no Anthropic API use of any kind);
- the US-3 plan and runbooks (`docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md`, `…-us3-core-sitting.md`, `…-us3-rest-sitting.md`): this plan reuses their modules and conventions and does not repeat their reasoning;
- `data/wine-map/review/usa-us0-tree-summary.md`.

This plan touches no Next.js runtime code and no TypeScript. If a step ever reaches Next code, first read the relevant guide under `node_modules/next/dist/docs/`.

**Base commit for the review diff:** `56cdb69` ("data(wine-map): the US-3 rest sitting rehearsal"), the branch's head when this plan was written.

## Global Constraints

- Work only in `C:/Users/Public/repos/blindtastingapp-map`, on branch `usa-map`. Start every shell command with `cd C:/Users/Public/repos/blindtastingapp-map && `, because the shell's cwd resets. Never touch `C:/Users/Public/repos/blindtastingapp`.
- **Never push. Never apply a migration. Never write to the live database or to Storage. Never dispatch a tiles run. Never run `stage-usa-ava.mjs --stage`. Never run a rollback file without `--check` or `--dry`.**
- Allowed live access, all read-only or rolled back:
  - `scripts/wine-map-sources/read-only-client.mjs` (`begin read only` … `rollback`);
  - the owner's applier with `--check` or `--dry` only: `$APPLIER` = `C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`, run from the worktree as `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" <file> --check` (then `--dry`). **Never without a flag.** In a shell step, set it in the same command first: `APPLIER=C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs && …`.
  - `scripts/usa-map/apply-rollback.mjs <file> --check` or `--dry` only;
  - the dry mode of `stage-usa-ava.mjs` (always rolled back);
  - `scripts/usa-map/rehearse-us4.mjs` (always rolled back; no commit path);
  - `gen-place-profiles-migration.mjs --prelude …` (its prelude transaction is always rolled back).
- **Live-lock etiquette.** Every rolled-back run that writes `wine_places` or `wine_place_boundaries` holds `wine_place_neighbours_state`'s row until it rolls back (each refresh is about 65–70 s; the rehearsal holds it for about 9 minutes). Before each such run, run `node --env-file=.env.local scripts/usa-map/activity-check.mjs`: `active`, `writers` and `building` must be empty and `draft_boundaries` 0. Run each such command at most as often as this plan says, and never two at once.
- Never recreate `get_wine_place_context`, `refresh_wine_place_neighbours` or any other shared map function (D21). The friend's `20260925190000_wine_place_context_inherited_profile` is live-only.
- No Anthropic API call of any kind (AGENTS.md). All knowledge research is WebSearch/WebFetch in session; no script generates text.
- Commit with: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` (written below as "commit with the standard prefix").
- **Line endings.** `.gitattributes` already marks `data/wine-map/usa-*`, `data/wine-map/review/usa-*`, `data/wine-map/place-profiles-usa.json` and `data/wine-map/place-profiles-usa-us3-*.json` `-text`. Task 5 adds `data/wine-map/place-profiles-usa-us4.json -text`. Write every new file with LF endings.
- No migration or rollback contains `begin;`, `commit;` or `rollback;` at top level (D24). Every render test asserts this with `topLevelTransactionStatements` from `scripts/migration-preflight.mjs`.
- **Scope.** Every US-4 check, count and rollback reads or writes only keys under `united-states.washington`, `united-states.oregon` and `united-states.new-york` (plus the `united-states` country outline, read as land). No US-4 file names a `united-states.california` key (Task 4, 11 and 12 tests).
- **Constants (read-only checks, 2026-09-30):**
  - Newest live migration `20260930214747` (`usa_us3_rest_promote`). US-0 … US-3 are live: 166 `united-states` places VERIFIED (1 COUNTRY; California 156; Washington, Oregon and New York 3 each: the state and its two umbrella AVAs), 28 US relationships (27 California, plus Columbia Valley → Oregon `ALTERNATE_PARENT`), 11 US outline-only boundaries. 3,475 places in all, 0 DRAFT boundaries, neighbour cache fresh (built 2026-09-30T10:33Z), ACTIVE release `20260930T103519Z`.
  - **US-4 versions (suffix `4747`, D23):** catalog `20260930224747`, knowledge `20260930234747`, promote `20261001004747`. If a newer live version exists on an apply day, change `US4_VERSIONS` (Task 2) and re-render; the applier does not enforce order.
  - **Rollback files** carry no version (§25): `scripts/usa-map/usa_us4_{unstage,remove,unpublish}.sql`.
  - **The Willamette typical wine** (spec §14.2: "unchanged" in US-4): `bab8537e-b0bc-4f7c-8547-242537322f8a` "A typical Willamette Pinot Noir" (sort 90, Willamette Valley AVA, Oregon), home `united-states.oregon.willamette-valley`, placements `united-states.oregon` and `united-states.oregon.willamette-valley`, no curated display point. US-4 changes nothing about it; every check asserts it stays so.
  - **Grapes the catalog has** that US-4 uses (exact names): Aligoté, Albariño, Barbera, Blaufränkisch, Cabernet Franc, Cabernet Sauvignon, Carmenère, Chardonnay, Chenin Blanc, Dolcetto, Gamay, Gewürztraminer, Grenache, Grüner Veltliner, Malbec, Melon de Bourgogne, Merlot, Mourvèdre, Müller-Thurgau, Petit Verdot, Pinot Blanc, Pinot Gris, Pinot Meunier, Pinot Noir, Riesling, Rkatsiteli, Sangiovese, Saperavi, Sauvignon Blanc, Semillon (no accent), Syrah, Tempranillo, Viognier, Zinfandel. **Absent:** Baco Noir, Frontenac, La Crescent, Marquette, Seyval Blanc, Vidal Blanc (added by this plan, decision 8), and Cayuga White, Chambourcin, Traminette, Vignoles, Concord, Niagara, Catawba (not added).
  - **Artifacts and raw files:** US-4 adds no artifact. The Washington, Oregon and New York files (`data/wine-map/usa-{washington,oregon,new-york}-ava.geojson`) are pinned in `usa-measurements.json` `_inputs`; the raw `WA_avas.geojson`, `OR_avas.geojson` and `NY_avas.geojson` are under `.tiles-build/usa/ucd/355f7da3cd6c4020fff736b7517a4a669fed7730/` locally and were uploaded to Storage at the US-2 sitting, so the US-4 `--stage` prints `RAW skip` for all three.
- **Owner answers this plan implements (verbatim):** states **"CA, WA, OR, NY now; others later"**; **"Links now, then likelihood map"**; **"Training room only"**; Columbia Gorge **"Oregon"**; pushes **"Yes, ship phases as they pass"**; and on 2026-09-30 **"ignore my friends changes and just go ahead. no need for my review"**. So there is no owner copy review and no friend-rebase gate; the knowledge file records that waiver as its `owner_approval` (status `APPROVED`), which the stage gate reads. The main session pushes and applies; this plan never does.
- **New user-facing copy is provisional**: every article field, key fact, grape note and new-grape description written in Tasks 6–8. The list is at the end of this plan.

## Measured for this plan (read-only, 2026-09-30)

- **Cross-state land shares on display geometry.** Each US-4 AVA simplified at 0.0002° (as the stage builds it) against the live Natural Earth state and country outlines, unbuffered: Walla Walla Valley in Oregon **0.310176** (tree 0.3101), Columbia Gorge in Washington **0.347881** (tree 0.348); the live Columbia Valley → Oregon share is 0.224056 (tree 0.224). Hence the promote's state-edge check: the tree's share within 0.01, and at least 0.005 (decision 4).
- **State containment**, on land and buffered 0.05° (spec §8.2), against each place's legal states' live outlines: every one of the 42 is ≥ 0.9996 (lowest North Fork of Long Island 0.999684). The Burn of Columbia Valley and Horse Heaven Hills, which the 1:50m line measures 38.2% and 2.3% "in Oregon", are 1.000000 inside Washington buffered.
- **Parent containment on display geometry.** Every nested pair passes its threshold less the promote's 0.001 slack. The largest display-vs-normalized difference is 0.000284 (Elkton Oregon in Umpqua Valley). The tightest measured-basis pair is Red Mountain in Yakima Valley: 0.995035 normalized, 0.995031 display. Candy Mountain in Yakima Valley (the override, decision 2): 0.893096 normalized, 0.893360 display, against a floor of 0.883.
- **Drift.** The largest simplification area drift is 0.00122 (Snipes Mountain), far under 15%.
- **The Rocks District** lies 1.000000 inside Walla Walla Valley (display) and 1.000000 inside the live Columbia Valley outline, and 1.000000 inside Oregon.

## Decisions this plan makes (they go into spec §27 in Task 16)

1. **One wave, `us4`, of 42 places**: every APPELLATION row of the Washington (16), Oregon (18) and New York (8) tree reports, in tree order (the country's sort order puts New York, then Oregon, then Washington). The spec allowed one wave or three; 42 is half of US-3's core batch, and one sitting keeps the DRAFT window and the friend's quiet time to one.
2. **The legal record over the outlines, before the catalog renders** (keys lock at the promote; US-3's review-fix precedent, spec §26):
   - **Candy Mountain is keyed under Yakima Valley** (`united-states.washington.columbia-valley.yakima-valley.candy-mountain`, tier 4) by a `parent_overrides` entry: T.D. TTB-163 (Federal Register document 2020-18741, 2020-09-25) expanded Yakima Valley by about 72 acres "in order to avoid a partial overlap" and determined that Candy Mountain "will remain part of both the established Columbia Valley AVA and the Yakima Valley AVA". UC Davis's `within` names Yakima Valley too, but its Yakima Valley outline (valid from 2020-10-26) leaves 10.7% of Candy Mountain outside (89.31% measured, just under the 90% legal-record arm). The override's floor is 0.883 (the tree's figure less one point, US-3's `overrideMin`). Its `OVERLAPS` edge to Yakima Valley becomes an ancestor overlap (no edge).
   - **Candy Mountain and Goose Gap do not overlap**: a `legal_exclusions` entry. The Goose Gap final rule (Federal Register document 2021-14047, 2021-07-01) says Goose Gap "does not overlap any other existing or proposed AVA", after Candy Mountain was established; the 1.34% the outlines share is a digitizing sliver on their common edge. The pair gets no edge. (The field was written for "does not nest"; it also covers "does not overlap", and the header comment says so.)
   - Result: Washington's edges go from 2 `ALTERNATE_PARENT` + 2 `OVERLAPS` to 2 `ALTERNATE_PARENT`; US-4 stores **4 edges, all `ALTERNATE_PARENT`, no `OVERLAPS`**.
3. **Cross-state AVAs, one place each, under their map state (D6, D14):** Walla Walla Valley under Washington (Columbia Valley), `ALTERNATE_PARENT` → Oregon (31.01% of its land); Columbia Gorge under Oregon (owner override; it is also Oregon-dominant, 65.20%), `ALTERNATE_PARENT` → Washington (34.80%); The Rocks District of Milton-Freewater under Oregon (wholly Oregon), `ALTERNATE_PARENT` → Columbia Valley and → Walla Walla Valley (both keyed under Washington). Columbia Valley's live edge to Oregon (US-2) is untouched. Snake River Valley and Lewis-Clark Valley (Idaho-dominant) and Lake Erie (Ohio-dominant) are not placed; nothing is keyed under a state outside wave 1. The promote asserts each of these.
4. **The state-share edges are re-checked geometrically in the promote**: the source's unbuffered land share in the target state's live outline, against the live country outline, must be within 0.01 of the tree's share and at least 0.005. A containment `ALTERNATE_PARENT` (basis `within`) must lie ≥ 0.899 inside its target, as in US-3.
5. **State containment per place is against the union of its legal (TTB) states' live outlines**, buffered 0.05°, on land (US-2's rule; US-3 had only California). A Washington-only AVA that the 1:50m line measures partly "in Oregon" (The Burn 38.2%, Horse Heaven Hills 2.3%) passes because the buffer absorbs the line (measured 1.000000).
6. **Scope, and no ordering against US-3.** Checks read `united-states.{washington,oregon,new-york}.*` only, and the earlier wave US-4 needs is US-2 (its places under the three states, plus the country). `priorPromote` is the US-2 promote `20260930104747`. The stage library's single `scopeKey` becomes an optional `scopeKeys` list (`scopesOf(wave)`); US-2 and US-3 behave as before.
7. **Knowledge lives in one data file**, `data/wine-map/place-profiles-usa-us4.json` (wave `us4`), checked by US-3's rule (`validateUs3Profiles`: one "Established YYYY (27 CFR 9.N)" fact matching TTB, descriptions ≤ 700 characters, ≤ 8 grapes with ≤ 3 PRINCIPAL, ≥ 2 sources with one CFR or Federal Register source, no copied text) plus a US-4 rule (decisions 8 and 9). Review files are one per state (New York 8, Oregon 18, Washington 16 places), each well under §18's 40.
8. **Six new grapes**, all hybrids named as a place's grape by a listed source: Marquette, Frontenac and La Crescent (the cold-hardy grapes of Champlain Valley and Upper Hudson), Seyval Blanc and Baco Noir (Hudson River Region), Vidal Blanc (Niagara Escarpment). No labrusca (Concord, Niagara, Catawba): spec §10.1 lists Concord "only if the owner wants a labrusca listed", and nobody asked. New grape rows are public reference rows the moment the knowledge migration applies (CLAUDE.md's accepted F9), so every grape picker lists them from then on; the remove rollback keeps them (the knowledge re-applies with `on conflict (name) do nothing`).
9. **Each state's shortlist keeps its signature grape first (§10.3, §25 grape roles):** Washington's top rank includes Cabernet Sauvignon; Oregon's is Pinot Noir alone; New York's is Riesling alone. A pure check on the merged US-2 + US-4 data (`signatureLeadProblems`) and the rehearsal's shortlists both assert it. California's shortlist must not change.
10. **No archetype link migration.** Spec §14.2 names none for US-4 (the Willamette row reads "unchanged"), so the Willamette Pinot Noir keeps its US-2 home and placements; the rehearsal and the live check assert that, and the US-4 unpublish refuses while any typical wine is placed on a US-4 place.
11. **Hudson River Region is the one new outline place** (9,751 km² ≥ 5,000, D15). Rogue Valley (4,639 km²) and Upper Hudson (4,206 km²) fill. US outlines go 11 → 12.
12. **Shard zooms follow the deepest label (D16):** Washington and Oregon go to max zoom 11 (tier-4 labels at z9), New York to 9 (tier-3 labels at z7).

## Review Focus

1. **A key locks where a reader does not expect it.** Candy Mountain sits under Yakima Valley only by the override; The Rocks District sits directly under Oregon, not under Walla Walla Valley; Columbia Gorge sits under Oregon although it spans the river; Walla Walla Valley sits under Washington although a third is in Oregon. Expected: nothing renders a key from anything but the tree, and each case is listed with its figure before the promote. (Task 1: the tree-report tests pin Candy Mountain's key, basis and floor; Task 2: the wave test pins all four keys and the four edges; Task 3: the tree-review test lists them with their percentages.)
2. **A cross-state check measures differently from the tree and refuses mid-sitting** (display vs normalized geometry, buffered vs unbuffered, the live country outline as land), with DRAFT boundaries live. Expected: the promote uses the measured tolerances. (Task 11: the render test asserts the embedded shares 0.3101 and 0.348 and the `<= 0.01` / `>= 0.005` rule, and Candy Mountain's 0.883 floor; Task 15: the rehearsal runs the promote and records each state share in a NOTICE.)
3. **A cross-state AVA placed twice, an Idaho- or Ohio-dominant AVA placed, or a rollback that reaches beyond the three states.** Expected: the promote refuses; a rollback never names a California key and refuses while another place exists under the three states. (Task 2: the wave test; Task 11: the promote's "cross-state AVA is not exactly one place", "a deferred AVA has a place" and "a place under a state outside wave 1" asserts; Task 12: the scope test; Task 15: refusal G with a probe place.)
4. **Wrong or stale knowledge**: an "Established" fact that disagrees with TTB, text copied between AVAs, a labrusca or an unused new grape, a data file edited after its migration was generated. (Task 5: the US-4 validator's tests; Task 9: the "migration is current" test.)
5. **The new AVAs push a state's signature grape down its shortlist** (New York's hybrids, Washington's Merlot), or change California's. Expected: Cabernet Sauvignon, Pinot Noir and Riesling still lead; California is unchanged. (Task 5: `signatureLeadProblems` tests, then run on the committed data once approved; Task 14/15: the rehearsal asserts the live shortlists.)

## File map

| File | Change |
|---|---|
| `data/wine-map/usa-tree-config.json` | Candy Mountain `parent_overrides` entry; Candy Mountain / Goose Gap `legal_exclusions` entry |
| `scripts/wine-map-sources/usa-tree.mjs` | header comment only (an exclusion also covers "does not overlap") |
| `data/wine-map/usa-{california,washington,oregon,new-york}-tree.json`, `data/wine-map/review/usa-us0-tree-summary.md` | re-rendered by `build-usa-tree-reports.mjs` (California: `_inputs.config_sha256` only) |
| `scripts/wine-map-sources/usa-tree.test.mjs`, `usa-tree-reports.test.mjs` | a sibling-exclusion unit case; the US-4 legal-record facts |
| `scripts/usa-map/us4-wave.mjs` + `us4-wave.test.mjs` (new) | the wave, versions, file names, scope, cross-state facts |
| `scripts/usa-map/waves.mjs`, `waves.test.mjs` | `loadWave("us4")` |
| `scripts/usa-map/us4-notes.mjs` + `us4-notes.test.mjs`, `render-us4-notes.mjs` (new) | the fact sheet and the tree review |
| `data/wine-map/review/usa-us4-fact-sheet.md`, `usa-us4-tree-review.md` (new, rendered) | research starting point; the placements the promote locks |
| `scripts/usa-map/render-us4-sql.mjs` + `us4-sql.test.mjs` (new) | catalog, promote, three rollbacks |
| `supabase/migrations/20260930224747_usa_us4_catalog.sql` (new, rendered) | DRAFT places + refresh (NOT applied) |
| `scripts/usa-map/usa-us4-knowledge.mjs` + `usa-us4-knowledge.test.mjs`, `render-usa-us4-review.mjs`, `order-usa-profiles.mjs`, `check-usa-grapes.mjs` (new) | the US-4 content rule, the lead check, review files per state, reordering, grape check |
| `data/wine-map/place-profiles-usa-us4.json` (new) | the 42 places' knowledge and six new grapes |
| `.gitattributes` | `data/wine-map/place-profiles-usa-us4.json -text` |
| `supabase/migrations/20260930234747_usa_us4_knowledge.sql` (new, generated) | knowledge (NOT applied) |
| `scripts/wine-map-sources/usa-stage-lib.mjs` + `usa-stage-lib.test.mjs` | `scopesOf(wave)`: the stray-boundary check over a list of scope keys |
| `scripts/wine-map-sources/stage-usa-ava.mjs` | `--wave us4` (through `WAVES`); the dry-run hint names the right rehearsal |
| `supabase/migrations/20261001004747_usa_us4_promote.sql` (new, rendered) | the promote (NOT applied) |
| `scripts/usa-map/usa_us4_{unstage,remove,unpublish}.sql` (new, rendered) | rollbacks, outside `supabase/migrations/` |
| `scripts/usa-map/us4-checks.mjs` + `us4-checks.test.mjs`, `check-us4-live.mjs`, `rehearse-us4.mjs` (new) | shared checks, the read-only live check, the rehearsal |
| `data/wine-map/review/usa-us4-rehearsal.json`, `usa-us4-expected-boundaries.json`, `usa-us4-{new-york,oregon,washington}-knowledge.md` (new) | evidence and review files |
| `docs/superpowers/plans/2026-09-30-usa-wine-map-us4-sitting.md` (new) | the runbook |
| `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` | new §27 |

---

### Task 1: The legal record over the outlines (Candy Mountain), and the tree reports rebuilt

Keys lock at the promote, so this comes first: every later file renders from the tree reports this task rebuilds.

**Files:**
- Modify: `data/wine-map/usa-tree-config.json`, `scripts/wine-map-sources/usa-tree.mjs` (header comment only)
- Re-render: `data/wine-map/usa-{california,washington,oregon,new-york}-tree.json`, `data/wine-map/review/usa-us0-tree-summary.md`
- Test: `scripts/wine-map-sources/usa-tree.test.mjs`, `scripts/wine-map-sources/usa-tree-reports.test.mjs`

**Interfaces:**
- Consumes: `buildUsaTree` (`usa-tree.mjs`), `build-usa-tree-reports.mjs` (both unchanged in behaviour).
- Produces: the Washington tree report with Candy Mountain at `united-states.washington.columbia-valley.yakima-valley.candy-mountain` (`display_tier` 4, zooms 7/9, `parent_basis: "override"`, `parent_inside: 0.893096`), no `OVERLAPS` edge, `review.parent_overrides` and `review.legal_exclusions` one row each, `review.ancestor_overlaps` Candy Mountain in Yakima Valley 0.8931. Every other place of every state unchanged.

- [ ] **Step 1: Verify the two quotations.** WebFetch `https://www.govinfo.gov/content/pkg/FR-2020-09-25/html/2020-18741.htm` (Candy Mountain, T.D. TTB-163) and `https://www.govinfo.gov/content/pkg/FR-2021-07-01/html/2021-14047.htm` (Goose Gap) and copy, verbatim, the Candy Mountain sentences about the 72-acre Yakima Valley expansion and "will remain part of both …", and the Goose Gap sentence "… does not overlap any other existing or proposed AVA". If a govinfo page is refused, use `https://www.federalregister.gov/d/2020-18741` / `…/2021-14047`. If either rule does **not** say what decision 2 quotes, stop and report: do not add that entry.

- [ ] **Step 2: Write the failing unit case.** Append to `scripts/wine-map-sources/usa-tree.test.mjs`:

```js
test("a legal_exclusions pair of siblings that the law says do not overlap loses its OVERLAPS edge (US-4: Candy Mountain / Goose Gap)", () => {
  const avas = [...AVAS, ava("big", "Big", 500, CA), ava("small", "Small", 40, CA)];
  const pairs = [...PAIRS, pair("small", "big", 0.0134, 0.0011)];
  const without = buildUsaTree({ avas, pairs, config: CONFIG });
  const small = place(without, "Small");
  assert.deepEqual(edgesFrom(without, small.key), [`OVERLAPS>${place(without, "Big").key}`]);
  const config = { ...CONFIG, legal_exclusions: [{ inner: "Small", outer: "Big", rule: "FR 2021-14047: does not overlap any other AVA" }] };
  const t = buildUsaTree({ avas, pairs, config });
  assert.deepEqual(t.edges.filter((e) => [e.source_key, e.target_key].includes(place(t, "Small").key)), []);
  assert.equal(place(t, "Small").parent_key, "united-states.california");
  assert.deepEqual(t.review.legal_exclusions.map((x) => [x.name, x.excluded_from, x.ratio]), [["Small", "Big", 0.0134]]);
});
```

Run `node --test scripts/wine-map-sources/usa-tree.test.mjs`. Expected: PASS already (the exclusion code handles any measured pair); this case pins the behaviour decision 2 relies on. If it fails, stop and report: `usa-tree.mjs` would need a change this plan does not make.

- [ ] **Step 3: Update the reports tests first (they must fail).** In `scripts/wine-map-sources/usa-tree-reports.test.mjs`:

(a) In "no OVERLAPS edge joins a place to its own ancestor; Red Hill's and Contra Costa's are listed for review", rename the test "…; Contra Costa's, Candy Mountain's and Red Hill's are listed for review" and change the expected list to:

```js
  assert.deepEqual(reports.flatMap((r) => r.review.ancestor_overlaps).map((x) => [x.name, x.ancestor, x.ratio]),
    [["Contra Costa", "Central Coast", 0.3367], ["Contra Costa", "San Francisco Bay", 0.3363],
      ["Candy Mountain", "Yakima Valley", 0.8931], ["Red Hill Douglas County, Oregon", "Southern Oregon", 0.6775]]);
```

(b) In "US-3 review fixes 2026-09-30: …", replace the last line (`assert.deepEqual(reports.filter((r) => r.state !== "CA")…, [])`) with:

```js
  assert.deepEqual(reports.filter((r) => !["CA", "WA"].includes(r.state)).flatMap((r) => [...r.review.legal_exclusions, ...r.review.parent_overrides]), []);
```

(c) Change "counts per state after the owner's decisions" to `WA: [19, 2, 0, 2]`.

(d) Append:

```js
test("US-4 plan 2026-09-30: the legal record over the outlines (Candy Mountain in Yakima Valley, not overlapping Goose Gap)", async () => {
  const wa = (await allReports()).find((r) => r.state === "WA");
  const p = (n) => wa.places.find((x) => x.name === n);
  const yv = "united-states.washington.columbia-valley.yakima-valley";
  // T.D. TTB-163: Candy Mountain "will remain part of both the established Columbia Valley AVA and the Yakima Valley AVA".
  assert.equal(p("Candy Mountain").key, `${yv}.candy-mountain`);
  assert.deepEqual([p("Candy Mountain").display_tier, p("Candy Mountain").min_zoom, p("Candy Mountain").label_min_zoom], [4, 7, 9]);
  assert.deepEqual(wa.review.parent_overrides.map((x) => [x.name, x.parent_key, x.parent_basis, x.parent_inside]),
    [["Candy Mountain", yv, "override", 0.893096]]);
  assert.match(wa.review.parent_overrides[0].rule, /T\.D\. TTB-163/);
  // FR 2021-14047: Goose Gap "does not overlap any other existing or proposed AVA".
  assert.deepEqual(wa.review.legal_exclusions.map((x) => [x.name, x.excluded_from, x.ratio]), [["Candy Mountain", "Goose Gap", 0.0134]]);
  assert.deepEqual(wa.edges.filter((e) => e.type === "OVERLAPS"), []);
  assert.deepEqual(wa.edges.map((e) => [e.source_key.split(".").at(-1), e.target_key]).sort(),
    [["columbia-valley", "united-states.oregon"], ["walla-walla-valley", "united-states.oregon"]]);
});

test("US-4 plan 2026-09-30: the rebuild moved nothing in California", async () => {
  const ca = (await allReports()).find((r) => r.state === "CA");
  assert.deepEqual([ca.places.length, ca.edges.length], [157, 27]);
  assert.equal(ca.places.find((x) => x.name === "Contra Costa").key, "united-states.california.central-coast.san-francisco-bay.contra-costa");
});
```

Run `node --test scripts/wine-map-sources/usa-tree-reports.test.mjs`. Expected: FAIL (the committed reports still key Candy Mountain under Columbia Valley, and the committed file is still what the committed config builds, so only the new expectations fail).

- [ ] **Step 4: Edit the config.** In `data/wine-map/usa-tree-config.json`, add to `parent_overrides`, after the `"Contra Costa"` entry (paste Step 1's verbatim quotations where the `"…"` quotes stand):

```json
    "Candy Mountain": {
      "parent": "Yakima Valley",
      "rule": "T.D. TTB-163 (Federal Register document 2020-18741, published 2020-09-25, effective 2020-10-26) established the Candy Mountain AVA and expanded the Yakima Valley AVA \"by approximately 72 acres in order to avoid a partial overlap\"; \"TTB has also determined that the Candy Mountain AVA will remain part of both the established Columbia Valley AVA and the Yakima Valley AVA.\" The UC Davis Yakima Valley outline (valid from 2020-10-26) still leaves about 11% of the Candy Mountain outline outside it (89.31% measured inside, under the 90% legal-record arm).",
      "note": "Keyed under Yakima Valley by the legal record (added 2026-09-30 in the US-4 plan, before the US-4 catalog renders). UC Davis's own `within` for Candy Mountain names Yakima Valley too."
    }
```

and append to `legal_exclusions`:

```json
    {
      "inner": "Candy Mountain",
      "outer": "Goose Gap",
      "rule": "The Goose Gap final rule (Federal Register document 2021-14047, published 2021-07-01, effective 2021-08-02): the Goose Gap AVA \"lies entirely within the established Yakima Valley ... and Columbia Valley ... AVAs and does not overlap any other existing or proposed AVA\". Candy Mountain was established in 2020, before it.",
      "note": "The two outlines share a 1.34% sliver of Candy Mountain along their common edge; the law says they do not overlap, so the pair gets no OVERLAPS edge (added 2026-09-30 in the US-4 plan)."
    }
```

- [ ] **Step 5: The header comment.** In `scripts/wine-map-sources/usa-tree.mjs`, in the paragraph starting "The legal record can also say the opposite of the outlines.", after "…with its measured ratio." insert: "The same entry serves a pair the law says do not overlap although the outlines share a sliver (Candy Mountain and Goose Gap, Federal Register document 2021-14047): no edge either way." Change nothing else in the file.

- [ ] **Step 6: Rebuild the reports.** `cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/build-usa-tree-reports.mjs`. Expected lines: `data/wine-map/usa-washington-tree.json: 19 places, {"ALTERNATE_PARENT":2}, 1 deferred`, Oregon `{"ALTERNATE_PARENT":3}`, New York `{}`, California `{"ALTERNATE_PARENT":2,"OVERLAPS":25}`.
  - `git diff --stat` shows the four reports, the summary and the config only.
  - `git diff data/wine-map/usa-california-tree.json` shows **exactly one changed line**: `"config_sha256"`. The Oregon and New York reports likewise change only that line. If anything else changed in them, stop and report.
  - `git diff data/wine-map/usa-washington-tree.json` shows Candy Mountain's key, tier, zooms, basis and `parent_inside`, the sort orders under Columbia Valley and Yakima Valley, the two edges removed, and the three review lists.

- [ ] **Step 7: Run everything the trees feed.** `node --test scripts/wine-map-sources/usa-tree.test.mjs scripts/wine-map-sources/usa-tree-reports.test.mjs scripts/usa-map/*.test.mjs`. Expected: all PASS (US-2's and US-3's committed files do not change: California's places, the US-2 places and their one edge are what they were).

- [ ] **Step 8: Commit** the config, the comment, the four reports, the summary and both tests: "fix(usa-map): key Candy Mountain under Yakima Valley and drop its Goose Gap overlap, by the legal record, before the US-4 catalog", with the standard prefix. Body: the two rules and "Washington edges 4 -> 2; US-4 stores no OVERLAPS".

---

### Task 2: The US-4 wave, from the three tree reports

**Files:**
- Create: `scripts/usa-map/us4-wave.mjs`
- Modify: `scripts/usa-map/waves.mjs`
- Test: `scripts/usa-map/us4-wave.test.mjs`, `scripts/usa-map/waves.test.mjs`

**Interfaces:**
- Consumes (unchanged): `loadTrees()`, `us2Wave(trees)`, `artifactFor(code)`, `COUNTRY_KEY`, `STATE_SLUGS`, `US2_VERSIONS` from `us2-wave.mjs`; `treeOrder(keys, allPlaces, rootKey)`, `overrideMin(place)`, `TTB_PATH`, `loadTtb()` from `us3-wave.mjs`. A tree place row has `key, slug, name, kind, display_tier, min_zoom, label_min_zoom, sort_order, parent_key, parent_basis, parent_inside, breadcrumb, is_appellation, appellation_system, appellation_level, display, navigation_node, map_state, map_state_source, ucd_ava_id, cfr_section, area_km2, legal_states, state_shares`; an edge row has `type, source_key, target_key, basis, ratio?, share?`.
- Produces:
  - `US4_STATES` (`[{ code, key, name }]`, New York, Oregon, Washington), `SCOPE_KEYS`, `inScope(key)`, `US4_VERSIONS`, `US4_FILES` (`catalog`, `knowledge`, `promote`), `US4_ROLLBACK_FILES` (`unstage`, `remove`, `unpublish`), `US4_KNOWLEDGE`;
  - `us4Wave(trees, ttb)` returning `{ name: "us4", batch: null, places, edges, outlineKeys, derived: [], derivedCheck: null, ucd, parentChecks, states, prior: { verified, present: [] }, priorKeys, crossState, deferred, after: { perState: { NY|OR|WA: { places, ava } }, scopeEdges }, scopeKeys, versions, files, rollbackFiles, knowledgeSource, priorPromote }`. `ucd` rows: `{ key, ucd_ava_id, state, artifact, legal_states, area_km2, cfr_section, established, name }`. `parentChecks` rows: `{ key, parent_key, basis, tree_inside, min, parent_ucd_ava_id }`. `crossState` rows: `{ key, ucd_ava_id, map_state, legal_states, state_edges: [target keys] }`. `deferred`: UC Davis ids.
  - `loadWave("us4")` in `waves.mjs`.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us4-wave.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { inScope, SCOPE_KEYS, us4Wave, US4_FILES, US4_ROLLBACK_FILES, US4_VERSIONS } from "./us4-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";

const trees = await loadTrees();
const wave = us4Wave(trees, await loadTtb());
const W = "united-states.washington.";
const O = "united-states.oregon.";
const N = "united-states.new-york.";
const count = (list, f) => list.reduce((a, x) => ({ ...a, [f(x)]: (a[f(x)] ?? 0) + 1 }), {});
const keyOf = (slug) => wave.places.find((p) => p.slug === slug)?.key;
const edge = (s, t) => wave.edges.find((e) => e.source_key === s && e.target_key === t);

test("the wave is every AVA of the three trees: New York 8, Oregon 18, Washington 16", () => {
  assert.equal(wave.places.length, 42);
  const want = ["NY", "OR", "WA"].flatMap((c) => trees[c].places.filter((p) => p.kind === "APPELLATION").map((p) => p.key));
  assert.deepEqual(wave.places.map((p) => p.key).sort(), want.sort());
  assert.deepEqual(count(wave.places, (p) => p.map_state), { NY: 8, OR: 18, WA: 16 });
  for (const p of wave.places) assert.ok(inScope(p.key), p.key);
  assert.deepEqual(SCOPE_KEYS, ["united-states.new-york", "united-states.oregon", "united-states.washington"]);
});

test("tree order: New York, then Oregon, then Washington; every place after its parent", () => {
  assert.deepEqual([...new Set(wave.places.map((p) => p.map_state))], ["NY", "OR", "WA"]);
  const seen = new Set(wave.priorKeys);
  for (const p of wave.places) {
    assert.ok(seen.has(p.parent_key), `${p.key} before its parent`);
    seen.add(p.key);
  }
});

test("tiers, zooms and classification follow spec §4 and D4", () => {
  const zoom = { 2: [6, 6], 3: [6, 7], 4: [7, 9] };
  for (const p of wave.places) {
    assert.deepEqual([p.min_zoom, p.label_min_zoom], zoom[p.display_tier], p.key);
    const direct = SCOPE_KEYS.includes(p.parent_key);
    assert.deepEqual([p.kind, p.is_appellation, p.appellation_system, p.appellation_level],
      ["APPELLATION", true, "AVA", direct ? "regional" : "subregional"], p.key);
  }
  assert.deepEqual(count(wave.places, (p) => p.display_tier), { 2: 6, 3: 26, 4: 10 });
  assert.deepEqual(wave.places.filter((p) => p.appellation_level === "regional").map((p) => p.key), [
    `${N}champlain-valley-of-new-york`, `${N}hudson-river-region`, `${N}niagara-escarpment`, `${N}upper-hudson`,
    `${O}columbia-gorge`, `${O}the-rocks-district-of-milton-freewater`,
  ]);
});

test("Review Focus 1: the keys the promote locks", () => {
  assert.equal(keyOf("candy-mountain"), `${W}columbia-valley.yakima-valley.candy-mountain`);
  assert.equal(keyOf("walla-walla-valley"), `${W}columbia-valley.walla-walla-valley`);
  assert.equal(keyOf("the-rocks-district-of-milton-freewater"), `${O}the-rocks-district-of-milton-freewater`);
  assert.equal(keyOf("columbia-gorge"), `${O}columbia-gorge`);
  assert.equal(keyOf("mount-pisgah-polk-county-oregon"), `${O}willamette-valley.mount-pisgah-polk-county-oregon`);
  for (const s of ["seneca-lake", "cayuga-lake"]) assert.equal(wave.places.find((p) => p.slug === s).parent_key, `${N}finger-lakes`, s);
  for (const s of ["north-fork-of-long-island", "the-hamptons-long-island"]) assert.equal(wave.places.find((p) => p.slug === s).parent_key, `${N}long-island`, s);
});

test("Review Focus 1 and 3: four edges, all ALTERNATE_PARENT; Columbia Valley's live edge is not in the wave", () => {
  assert.deepEqual(wave.edges.map((e) => [e.type, e.source_key, e.target_key, e.basis, e.share ?? null]), [
    ["ALTERNATE_PARENT", `${O}columbia-gorge`, "united-states.washington", "state_share", 0.348],
    ["ALTERNATE_PARENT", `${O}the-rocks-district-of-milton-freewater`, `${W.slice(0, -1)}.columbia-valley`, "within", null],
    ["ALTERNATE_PARENT", `${O}the-rocks-district-of-milton-freewater`, `${W}columbia-valley.walla-walla-valley`, "within", null],
    ["ALTERNATE_PARENT", `${W}columbia-valley.walla-walla-valley`, "united-states.oregon", "state_share", 0.3101],
  ]);
  assert.equal(edge(`${W}columbia-valley`, "united-states.oregon"), undefined);
  assert.equal(wave.after.scopeEdges, 5);
});

test("Review Focus 3: each cross-state AVA once, under its map state, with its state edges; nothing deferred is placed", () => {
  assert.deepEqual(wave.crossState.map((c) => [c.ucd_ava_id, c.map_state, c.legal_states, c.state_edges]), [
    ["columbia_gorge", "OR", ["OR", "WA"], ["united-states.washington"]],
    ["columbia_valley", "WA", ["OR", "WA"], ["united-states.oregon"]],
    ["walla_walla_valley", "WA", ["OR", "WA"], ["united-states.oregon"]],
  ]);
  const all = Object.values(trees).flatMap((t) => t.places.filter((p) => p.ucd_ava_id));
  for (const c of wave.crossState) assert.equal(all.filter((p) => p.ucd_ava_id === c.ucd_ava_id).length, 1, c.ucd_ava_id);
  assert.deepEqual(wave.deferred, ["lake_erie", "lewis_clark_valley", "snake_river_valley"]);
  for (const id of wave.deferred) assert.equal(all.filter((p) => p.ucd_ava_id === id).length, 0, id);
  for (const p of Object.values(trees).flatMap((t) => t.places)) {
    assert.ok(p.key === "united-states" || ["california", "washington", "oregon", "new-york"].includes(p.key.split(".")[1]), p.key);
  }
});

test("D15: Hudson River Region is the only new outline place", () => {
  assert.deepEqual(wave.outlineKeys, [`${N}hudson-river-region`]);
});

test("parent checks by basis; Candy Mountain's override floor is the tree's figure less one point", () => {
  assert.equal(wave.parentChecks.length, 36);
  assert.deepEqual(count(wave.parentChecks, (c) => c.basis), { measured: 28, legal_record: 7, override: 1 });
  for (const c of wave.parentChecks) {
    assert.ok(c.tree_inside >= c.min, c.key);
    assert.ok(c.parent_ucd_ava_id, c.key);
    if (c.basis !== "override") assert.equal(c.min, c.basis === "measured" ? 0.995 : 0.9, c.key);
  }
  const candy = wave.parentChecks.find((c) => c.key.endsWith(".candy-mountain"));
  assert.deepEqual([candy.basis, candy.tree_inside, candy.min, candy.parent_ucd_ava_id], ["override", 0.893096, 0.883, "yakima_valley"]);
});

test("every AVA has TTB's CFR section and date; Candy Mountain 9.272, 2020", () => {
  for (const u of wave.ucd) {
    assert.match(u.cfr_section, /^9\.\d+$/, u.key);
    assert.match(u.established, /^\d{4}-\d{2}-\d{2}$/, u.key);
    assert.equal(u.artifact, `data/wine-map/usa-${u.key.split(".")[1]}-ava.geojson`, u.key);
  }
  const candy = wave.ucd.find((u) => u.ucd_ava_id === "candy_mountain");
  assert.deepEqual([candy.cfr_section, candy.established], ["9.272", "2020-09-25"]);
});

test("prior places, counts after the promote, versions and files", () => {
  assert.deepEqual(wave.priorKeys, [
    "united-states", "united-states.new-york", "united-states.new-york.finger-lakes", "united-states.new-york.long-island",
    "united-states.oregon", "united-states.oregon.southern-oregon", "united-states.oregon.willamette-valley",
    "united-states.washington", "united-states.washington.columbia-valley", "united-states.washington.puget-sound",
  ]);
  assert.deepEqual(wave.after.perState, { NY: { places: 11, ava: 10 }, OR: { places: 21, ava: 20 }, WA: { places: 19, ava: 18 } });
  for (const v of Object.values(US4_VERSIONS)) assert.match(v, /^\d{10}4747$/);
  assert.equal(US4_FILES.promote, "supabase/migrations/20261001004747_usa_us4_promote.sql");
  assert.equal(US4_ROLLBACK_FILES.unpublish, "scripts/usa-map/usa_us4_unpublish.sql");
  assert.equal(wave.priorPromote, "20260930104747");
  assert.equal(wave.knowledgeSource, "data/wine-map/place-profiles-usa-us4.json");
});

test("refuses a missing or mislabelled tree", () => {
  assert.throws(() => us4Wave({ ...trees, OR: undefined }, { avas: [] }), /no tree report for OR|no Oregon tree report/);
  assert.throws(() => us4Wave({ ...trees, NY: { ...trees.NY, state_key: "united-states.ny" } }, { avas: [] }), /no New York tree report/);
});
```

In `scripts/usa-map/waves.test.mjs`, replace the test with:

```js
test("the four stageable waves", async () => {
  assert.deepEqual(WAVES, ["us2", "us3-core", "us3-rest", "us4"]);
  const us2 = await loadWave("us2");
  assert.deepEqual([us2.places.length, us2.priorKeys.length, us2.scopeKey, us2.priorPromote], [16, 0, "united-states", null]);
  assert.equal(us2.knowledgeSource, "data/wine-map/place-profiles-usa.json");
  const core = await loadWave("us3-core");
  assert.deepEqual([core.name, core.places.length, core.scopeKey], ["us3-core", 86, "united-states.california"]);
  const us4 = await loadWave("us4");
  assert.deepEqual([us4.name, us4.places.length, us4.scopeKeys.length], ["us4", 42, 3]);
  await assert.rejects(() => loadWave("us5"), /unknown wave us5/);
});
```

- [ ] **Step 2: Run them.** `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/us4-wave.test.mjs scripts/usa-map/waves.test.mjs`. Expected: FAIL, "Cannot find module './us4-wave.mjs'".

- [ ] **Step 3: Implement** `scripts/usa-map/us4-wave.mjs`:

```js
// Phase US-4 of the USA map (spec 2026-09-29 §15 US-4): every AVA of
// Washington, Oregon and New York in one wave, read from the three committed
// tree reports (data/wine-map/usa-{washington,oregon,new-york}-tree.json) and
// TTB's list, and nothing else. Pure. Every US-4 migration, the stage and the
// rehearsal take their keys from here, so none of them can disagree with the
// tree reports.
import { artifactFor, COUNTRY_KEY, us2Wave, US2_VERSIONS } from "./us2-wave.mjs";
import { overrideMin, treeOrder } from "./us3-wave.mjs";

// In the country's sort order (New York 20, Oregon 30, Washington 40), which is tree order.
export const US4_STATES = Object.freeze([
  Object.freeze({ code: "NY", key: "united-states.new-york", name: "New York" }),
  Object.freeze({ code: "OR", key: "united-states.oregon", name: "Oregon" }),
  Object.freeze({ code: "WA", key: "united-states.washington", name: "Washington" }),
]);
export const SCOPE_KEYS = Object.freeze(US4_STATES.map((s) => s.key));
export const inScope = (k) => SCOPE_KEYS.some((s) => k === s || k.startsWith(`${s}.`));
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us4-sql.mjs); the applier does not enforce order.
export const US4_VERSIONS = Object.freeze({ catalog: "20260930224747", knowledge: "20260930234747", promote: "20261001004747" });
const mig = (v, name) => `supabase/migrations/${v}_${name}.sql`;
export const US4_FILES = Object.freeze({
  catalog: mig(US4_VERSIONS.catalog, "usa_us4_catalog"),
  knowledge: mig(US4_VERSIONS.knowledge, "usa_us4_knowledge"),
  promote: mig(US4_VERSIONS.promote, "usa_us4_promote"),
});
// Outside supabase/migrations/ and unversioned (spec §25): run with apply-rollback.mjs.
export const US4_ROLLBACK_FILES = Object.freeze({
  unstage: "scripts/usa-map/usa_us4_unstage.sql",
  remove: "scripts/usa-map/usa_us4_remove.sql",
  unpublish: "scripts/usa-map/usa_us4_unpublish.sql",
});
export const US4_KNOWLEDGE = "data/wine-map/place-profiles-usa-us4.json";
// D7: >= 99.5% measured inside, or >= 90% when UC Davis's `within` names the container.
const PARENT_MIN = Object.freeze({ measured: 0.995, legal_record: 0.9 });
const byEdge = (a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key) || a.type.localeCompare(b.type);

export function us4Wave(trees, ttb) {
  for (const s of US4_STATES) {
    const t = trees[s.code];
    if (!t || t.state !== s.code || t.state_key !== s.key) throw new Error(`no ${s.name} tree report`);
  }
  const us2 = us2Wave(trees);
  const country = trees.WA.places.find((p) => p.key === COUNTRY_KEY);
  const own = US4_STATES.flatMap((s) => trees[s.code].places.filter((p) => p.key !== COUNTRY_KEY));
  const allPlaces = [country, ...own];
  const byKey = new Map(allPlaces.map((p) => [p.key, p]));

  const priorKeys = us2.places.map((p) => p.key).filter((k) => k === COUNTRY_KEY || inScope(k)).sort();
  const priorSet = new Set(priorKeys);
  for (const p of own) {
    if (p.kind !== "APPELLATION" && !priorSet.has(p.key)) throw new Error(`${p.key} (${p.kind}) is in no earlier wave`);
  }
  const waveSet = new Set(own.filter((p) => p.kind === "APPELLATION").map((p) => p.key));
  for (const k of waveSet) {
    const parent = byKey.get(k).parent_key;
    if (!waveSet.has(parent) && !priorSet.has(parent)) throw new Error(`${k}: parent ${parent} is in no earlier wave and not in US-4`);
  }
  const places = treeOrder([...waveSet], allPlaces, COUNTRY_KEY);
  const known = new Set([...priorSet, ...waveSet]);

  // An edge ships with the wave its second endpoint lands in (US-3 decision 2).
  const allEdges = Object.values(trees).flatMap((t) => t.edges);
  const edges = allEdges
    .filter((e) => known.has(e.source_key) && known.has(e.target_key) && (waveSet.has(e.source_key) || waveSet.has(e.target_key)))
    .sort(byEdge);

  const ttbOf = (p) => {
    const t = (p.cfr_section && ttb.avas.find((x) => x.cfr_section === p.cfr_section))
      || ttb.avas.find((x) => x.name === p.name && x.states.includes(p.map_state));
    if (!t) throw new Error(`${p.key}: not in TTB's list`);
    return t;
  };
  const parentChecks = places.filter((p) => p.parent_basis).map((p) => {
    const min = p.parent_basis === "override" ? overrideMin(p) : PARENT_MIN[p.parent_basis];
    if (min === undefined) throw new Error(`${p.key}: parent_basis ${p.parent_basis} has no threshold`);
    return { key: p.key, parent_key: p.parent_key, basis: p.parent_basis, tree_inside: p.parent_inside, min,
      parent_ucd_ava_id: byKey.get(p.parent_key).ucd_ava_id };
  });
  const ucd = places.map((p) => {
    const t = ttbOf(p);
    return { key: p.key, ucd_ava_id: p.ucd_ava_id, state: p.map_state, artifact: artifactFor(p.map_state),
      legal_states: p.legal_states, area_km2: p.area_km2, cfr_section: p.cfr_section ?? t.cfr_section,
      established: t.established, name: p.name };
  });
  const crossState = allPlaces
    .filter((p) => known.has(p.key) && (p.legal_states?.length ?? 0) > 1)
    .map((p) => ({
      key: p.key, ucd_ava_id: p.ucd_ava_id, map_state: p.map_state, legal_states: p.legal_states,
      state_edges: allEdges.filter((e) => e.source_key === p.key && e.basis === "state_share").map((e) => e.target_key).sort(),
    }))
    .sort((a, b) => a.ucd_ava_id.localeCompare(b.ucd_ava_id));
  const deferred = [...new Set(US4_STATES.flatMap((s) => (trees[s.code].deferred ?? []).map((d) => d.ucd_ava_id)))].sort();
  const under = (key) => [...known].filter((k) => k === key || k.startsWith(`${key}.`));
  const perState = Object.fromEntries(US4_STATES.map((s) => [s.code, {
    places: under(s.key).length,
    ava: under(s.key).filter((k) => byKey.get(k).appellation_system === "AVA").length,
  }]));

  return {
    name: "us4", batch: null, places, edges,
    outlineKeys: places.filter((p) => p.display === "outline").map((p) => p.key).sort(),
    derived: [], derivedCheck: null, ucd, parentChecks,
    states: US4_STATES.map((s) => ({ ...s })),
    prior: { verified: priorKeys, present: [] }, priorKeys,
    crossState, deferred,
    after: {
      perState,
      scopeEdges: allEdges.filter((e) => known.has(e.source_key) && known.has(e.target_key)
        && (inScope(e.source_key) || inScope(e.target_key))).length,
    },
    scopeKeys: [...SCOPE_KEYS],
    versions: US4_VERSIONS, files: US4_FILES, rollbackFiles: US4_ROLLBACK_FILES,
    knowledgeSource: US4_KNOWLEDGE, priorPromote: US2_VERSIONS.promote,
  };
}
```

In `scripts/usa-map/waves.mjs`, import `us4Wave` from `./us4-wave.mjs`, set `WAVES` to `["us2", "us3-core", "us3-rest", "us4"]`, and add before the final `return`:

```js
  if (name === "us4") return us4Wave(trees, await loadTtb());
```

- [ ] **Step 4: Run them.** Expected: PASS (11 + 1 tests). If a count differs (tiers, parent-check bases), check it against the rebuilt tree reports and fix the **test** to the tree's figure, never the tree; say so in the commit body. Also `node --test scripts/usa-map/us3-wave.test.mjs scripts/usa-map/us2-wave.test.mjs` still PASS.
- [ ] **Step 5: Commit** the module, the two tests and `waves.mjs`: "feat(usa-map): the US-4 wave (Washington, Oregon, New York: 42 AVAs), read from the tree reports", with the standard prefix.

---

### Task 3: The fact sheet and the tree review

The fact sheet is the research starting point for Tasks 6–8. The tree review is the §15 "tree report is reviewed" evidence: the placements and cross-state edges the promote will lock, with their figures.

**Files:**
- Create: `scripts/usa-map/us4-notes.mjs`, `scripts/usa-map/render-us4-notes.mjs`
- Create (rendered): `data/wine-map/review/usa-us4-fact-sheet.md`, `data/wine-map/review/usa-us4-tree-review.md`
- Test: `scripts/usa-map/us4-notes.test.mjs`

**Interfaces:**
- Consumes: `us4Wave`, `US4_STATES` (Task 2); `loadTrees`; `pct` from `us3-notes.mjs`; the three artifacts' feature properties (`ava_id`, `county`).
- Produces: `factSheetMarkdown({ wave, trees, props })`, `treeReviewMarkdown({ wave, trees })`, `loadProps()`.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us4-notes.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { factSheetMarkdown, loadProps, treeReviewMarkdown } from "./us4-notes.mjs";
import { us4Wave } from "./us4-wave.mjs";

const trees = await loadTrees();
const wave = us4Wave(trees, await loadTtb());
const props = await loadProps();
const lf = (s) => s.replace(/\r\n/g, "\n");

test("the fact sheet: one row per AVA with CFR section, TTB date, counties and TTB states", () => {
  const md = factSheetMarkdown({ wave, trees, props });
  assert.equal((md.match(/^\| `united-states\.(washington|oregon|new-york)\./gm) ?? []).length, 42);
  assert.match(md, /## New York \(8 places\)[\s\S]*## Oregon \(18 places\)[\s\S]*## Washington \(16 places\)/);
  assert.match(md, /\| `united-states\.washington\.columbia-valley\.yakima-valley\.red-mountain` \| Red Mountain \| 9\.167 \| 2001-04-10 \| Benton \| WA \|/);
  assert.match(md, /\| `united-states\.washington\.columbia-valley\.walla-walla-valley` \| Walla Walla Valley \| 9\.91 \| 1984-02-06 \| Umatilla, Walla Walla \| OR, WA \|/);
});

test("Review Focus 1: the tree review lists every lock a reader may not expect, with its figure", () => {
  const md = treeReviewMarkdown({ wave, trees });
  for (const line of [
    /\| Walla Walla Valley \| `washington\.columbia-valley\.walla-walla-valley` \(dominant\) \| OR, WA \| OR 31\.01%, WA 68\.99% \| oregon \| US-4 \|/,
    /\| Columbia Gorge \| `oregon\.columbia-gorge` \(override\) \| OR, WA \| OR 65\.20%, WA 34\.80% \| washington \| US-4 \|/,
    /\| Columbia Valley \| `washington\.columbia-valley` \(dominant\) \| OR, WA \| OR 22\.40%, WA 77\.60% \| oregon \| US-2 \|/,
    /\| ALTERNATE_PARENT \| `oregon\.the-rocks-district-of-milton-freewater` \| `washington\.columbia-valley\.walla-walla-valley` \| within \|/,
    /Candy Mountain keyed under `washington\.columbia-valley\.yakima-valley` \(override, 89\.31% measured inside\): T\.D\. TTB-163/,
    /Candy Mountain and Goose Gap: no containment and no edge \(legal exclusion, 1\.34% measured inside\)/,
    /The Burn of Columbia Valley: OR 38\.21% \(TTB lists WA\)/,
    /Lake Erie: dominant state OH is outside wave 1/,
    /Snake River Valley: dominant state ID is outside wave 1/,
    /Columbia Hills \(WA; 27 CFR 9\.301; established 2026-08-17\)/,
  ]) assert.match(md, line);
});

test("the committed files are the renders", async () => {
  assert.equal(lf(await readFile("data/wine-map/review/usa-us4-fact-sheet.md", "utf8")), factSheetMarkdown({ wave, trees, props }));
  assert.equal(lf(await readFile("data/wine-map/review/usa-us4-tree-review.md", "utf8")), treeReviewMarkdown({ wave, trees }));
});
```

- [ ] **Step 2: Run it.** `node --test scripts/usa-map/us4-notes.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/us4-notes.mjs`:

```js
// The US-4 research fact sheet and tree review (spec §15 US-4 "as US-3": the
// tree report is reviewed), rendered from committed files only.
import { readFile } from "node:fs/promises";
import { pct } from "./us3-notes.mjs";
import { US4_STATES } from "./us4-wave.mjs";

const short = (k) => k.replace(/^united-states\./, "");
const shares = (s) => Object.entries(s).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => `${c} ${pct(v)}`).join(", ");

export async function loadProps() {
  const props = new Map();
  for (const slug of ["washington", "oregon", "new-york"]) {
    const fc = JSON.parse(await readFile(`data/wine-map/usa-${slug}-ava.geojson`, "utf8"));
    for (const f of fc.features) props.set(f.properties.ava_id, f.properties);
  }
  return props;
}

export function factSheetMarkdown({ wave, trees, props }) {
  const L = ["# US-4 fact sheet: the AVAs of Washington, Oregon and New York", "",
    "Rendered by `scripts/usa-map/render-us4-notes.mjs` from the three tree reports, UC Davis's county field and TTB's list. The starting point for the knowledge research (plan Tasks 6–8): every key fact \"Established YYYY (27 CFR 9.N)\" must match this sheet. Areas are the UC Davis digitization's, not a legal figure.", ""];
  const allEdges = Object.values(trees).flatMap((t) => t.edges);
  for (const s of wave.states) {
    const list = wave.places.filter((p) => p.key.startsWith(`${s.key}.`));
    L.push(`## ${s.name} (${list.length} places)`, "",
      "| Key | Name | CFR | Established | Counties | TTB states | Area km² | Parent (basis, inside) | Edges |",
      "|---|---|---|---|---|---|---|---|---|");
    for (const p of list) {
      const u = wave.ucd.find((x) => x.key === p.key);
      const c = wave.parentChecks.find((x) => x.key === p.key);
      const parent = `${short(p.parent_key)}${c ? ` (${c.basis}, ${pct(c.tree_inside)})` : ""}`;
      const edges = allEdges.filter((e) => e.source_key === p.key || e.target_key === p.key)
        .map((e) => `${e.type} ${short(e.source_key === p.key ? e.target_key : e.source_key)}${e.share != null ? ` (${pct(e.share)} of its land)` : ""}${e.ratio != null ? ` ${pct(e.ratio)}` : ""}`)
        .join("; ");
      L.push(`| \`${p.key}\` | ${p.name} | ${u.cfr_section} | ${u.established} | ${(props.get(p.ucd_ava_id)?.county ?? "").split("|").join(", ")} | ${p.legal_states.join(", ")} | ${Math.round(p.area_km2)} | ${parent} | ${edges || "none"} |`);
    }
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

export function treeReviewMarkdown({ wave, trees }) {
  const places = Object.values(trees).flatMap((t) => t.places);
  const byKey = new Map(places.map((p) => [p.key, p]));
  const reviews = US4_STATES.map((s) => trees[s.code].review);
  const listOrNone = (lines) => (lines.length ? lines : ["- none"]);
  const L = ["# US-4 tree review: what the promote locks", "",
    "Rendered by `scripts/usa-map/render-us4-notes.mjs` from the Washington, Oregon and New York tree reports. Keys lock at the promote (spec §8.3). An AVA is keyed under its map state, the legal (TTB) state holding most of its land, unless the owner overrode it (D6); it nests in an AVA of the same state when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA, or by a `parent_overrides` entry citing the legal record (D7, spec §26). Changing any placement needs a config entry and re-committed tree reports before the catalog renders.", ""];

  L.push("## Cross-state AVAs (TTB lists more than one state)", "",
    "| AVA | Keyed | TTB states | Measured land shares | State edges | Wave |", "|---|---|---|---|---|---|");
  for (const c of wave.crossState) {
    const p = byKey.get(c.key);
    L.push(`| ${p.name} | \`${short(p.key)}\` (${p.map_state_source}) | ${p.legal_states.join(", ")} | ${shares(p.state_shares)} | ${c.state_edges.map((k) => short(k)).join(", ") || "none"} | ${wave.priorKeys.includes(p.key) ? "US-2" : "US-4"} |`);
  }

  L.push("", "## Edges this wave stores", "", "| Type | Source | Target | Basis | Figure |", "|---|---|---|---|---|");
  for (const e of wave.edges) {
    const figure = e.share != null ? `${pct(e.share)} of its land` : e.ratio != null ? pct(e.ratio) : "wholly inside";
    L.push(`| ${e.type} | \`${short(e.source_key)}\` | \`${short(e.target_key)}\` | ${e.basis} | ${figure} |`);
  }

  L.push("", "## The legal record over the outlines (usa-tree-config.json)", "");
  L.push(...listOrNone([
    ...reviews.flatMap((r) => r.parent_overrides).map((o) => `- ${o.name} keyed under \`${short(o.parent_key)}\` (override, ${pct(o.parent_inside)} measured inside): ${o.rule}`),
    ...reviews.flatMap((r) => r.legal_exclusions).map((x) => `- ${x.name} and ${x.excluded_from}: no containment and no edge (legal exclusion, ${pct(x.ratio)} measured inside): ${x.rule}`),
  ]));

  L.push("", "## Nested by the legal record (90% to 99.5% inside)", "");
  L.push(...listOrNone(wave.parentChecks.filter((c) => c.basis === "legal_record")
    .map((c) => `- \`${short(c.key)}\` in \`${short(c.parent_key)}\`: ${pct(c.tree_inside)} inside.`)));

  L.push("", "## Overlaps with a place's own ancestor (no edge stored)", "");
  L.push(...listOrNone(reviews.flatMap((r) => r.ancestor_overlaps).map((r) => `- ${r.name} in ${r.ancestor}: ${pct(r.ratio)} measured inside.`)));

  L.push("", "## State shares that are map artifacts (withheld: no edge, no say in the map state)", "",
    "The Natural Earth 1:50m state line runs several km off the Columbia River, so it measures Oregon land inside Washington-only AVAs. The promote's containment check buffers the state outlines by 0.05° and passes them.", "");
  L.push(...listOrNone(reviews.flatMap((r) => r.state_list_disagreements)
    .filter((r) => r.withheld_states.some((w) => w.share >= 0.005))
    .map((r) => `- ${r.name}: ${r.withheld_states.map((w) => `${w.state} ${pct(w.share)}`).join(", ")} (TTB lists ${r.legal_states.join(", ")}).`)));

  L.push("", "## Not in this wave", "");
  L.push(...listOrNone([
    ...US4_STATES.flatMap((s) => trees[s.code].deferred ?? []).map((d) => `- ${d.name}: ${d.reason} (${shares(d.state_shares)}).`),
    ...US4_STATES.flatMap((s) => trees[s.code].ttb_only_pending ?? [])
      .map((t) => `- ${t.name} (${t.states.join(", ")}; 27 CFR ${t.cfr}; established ${t.established}): no UC Davis outline yet (US-5).`),
  ]));

  const notes = reviews.flatMap((r) => r.within_disagreements);
  L.push("", "## UC Davis text the tree does not follow (information only)", "");
  L.push(...listOrNone(notes.map((d) => {
    const parts = [];
    if (d.ucd_within_not_computed.length) parts.push(`UC Davis says within ${d.ucd_within_not_computed.join(", ")}`);
    if (d.computed_not_in_ucd_within.length) parts.push(`measured inside ${d.computed_not_in_ucd_within.join(", ")}`);
    if (d.ucd_contains_not_computed.length) parts.push(`UC Davis says it contains ${d.ucd_contains_not_computed.join(", ")}`);
    return `- ${d.name} (\`${short(d.key)}\`): ${parts.join("; ")}.`;
  })));
  return `${L.join("\n")}\n`;
}
```

`scripts/usa-map/render-us4-notes.mjs`:

```js
// node scripts/usa-map/render-us4-notes.mjs — writes the US-4 fact sheet and tree review.
import { writeFile } from "node:fs/promises";
import { loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { factSheetMarkdown, loadProps, treeReviewMarkdown } from "./us4-notes.mjs";
import { us4Wave } from "./us4-wave.mjs";

const trees = await loadTrees();
const wave = us4Wave(trees, await loadTtb());
await writeFile("data/wine-map/review/usa-us4-fact-sheet.md", factSheetMarkdown({ wave, trees, props: await loadProps() }));
await writeFile("data/wine-map/review/usa-us4-tree-review.md", treeReviewMarkdown({ wave, trees }));
console.log("wrote data/wine-map/review/usa-us4-fact-sheet.md and usa-us4-tree-review.md");
```

- [ ] **Step 4: Render and run.** `node scripts/usa-map/render-us4-notes.mjs`, then `node --test scripts/usa-map/us4-notes.test.mjs`. Expected: PASS (3 tests). If a percentage differs in the second decimal (the tree stores 0.3101 and 0.348 for the edges, 0.310107 etc. for the land shares), fix the test to the tree's value, never the tree.
- [ ] **Step 5: Read** `usa-us4-tree-review.md` end to end. Every cross-state AVA has its state edges; the Candy Mountain override and exclusion are there with their rules; Red Hill's and Candy Mountain's ancestor overlaps are listed.
- [ ] **Step 6: Commit** the module, the CLI, the test and the two rendered files: "docs(usa-map): US-4 fact sheet and tree review (the placements and cross-state edges the promote locks)".

---
### Task 4: The catalog migration (DRAFT places, with the refresh)

**Files:**
- Create: `scripts/usa-map/render-us4-sql.mjs`, `scripts/usa-map/us4-sql.test.mjs`
- Create (rendered): `supabase/migrations/20260930224747_usa_us4_catalog.sql`

**Interfaces:**
- Consumes: `us4Wave`, `SCOPE_KEYS`, `inScope` (Task 2); `sq`, `REFRESH_BLOCK` from `render-us2-sql.mjs`; `depthOf`, `loadTrees`, `STATE_SLUGS` from `us2-wave.mjs`; `loadTtb` from `us3-wave.mjs`; `STATE_WINDOWS` from `../wine-map-sources/usa-stage-lib.mjs`.
- Produces: `loadUs4Wave()`, `catalogSql(wave) → string`, `SCOPE_WHERE(alias)`, `renderAll(wave)`; the CLI `node scripts/usa-map/render-us4-sql.mjs` writes every US-4 rendered file (Tasks 11 and 12 add `promoteSql`, `unstageSql`, `removeSql`, `unpublishSql` and extend `renderAll`).

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us4-sql.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { catalogSql, loadUs4Wave } from "./render-us4-sql.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");
const wave = await loadUs4Wave();

test("the committed catalog migration is exactly the render", async () => {
  assert.equal(lf(await readFile(wave.files.catalog, "utf8")), catalogSql(wave));
});

test("catalog: no transaction statements, 42 DRAFT inserts, US-2's places asserted VERIFIED, checked refresh last", () => {
  const sql = catalogSql(wave);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  assert.equal((sql.match(/^ {2}\('united-states\.(washington|oregon|new-york)\.[^']+', '[a-z0-9-]+', /gm) ?? []).length, 42);
  assert.ok(!/set publication_status = 'VERIFIED'/.test(sql));
  assert.equal((sql.match(/'DRAFT', v\.sort_order, p\.id/g) ?? []).length, new Set(wave.places.map((p) => p.key.split(".").length)).size);
  assert.match(sql, /US-4 catalog: its places already exist/);
  assert.match(sql, /US-4 catalog: an earlier wave is missing or not VERIFIED/);
  assert.match(sql, /^ {2}\('united-states\.new-york\.finger-lakes'\)/m);
  assert.ok(!sql.includes("united-states.california"), "Scope: nothing about California");
  const tail = sql.slice(sql.lastIndexOf("do $$"));
  assert.match(tail, /refresh_wine_place_neighbours\(\)/);
  assert.match(tail, /if v_rows < 0 then/);
});
```

- [ ] **Step 2: Run it.** `node --test scripts/usa-map/us4-sql.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/render-us4-sql.mjs` (this task writes the header, helpers, `catalogSql`, `renderAll` and `main`; Tasks 11 and 12 insert their functions above `renderAll` and add their files to it):

```js
// Renders the US-4 SQL (catalog, promote, rollbacks) from the US-4 wave
// (us4-wave.mjs). The committed files must equal this render
// (us4-sql.test.mjs). No file contains begin/commit/rollback: the applier, or
// apply-rollback.mjs, owns the transaction (spec D24). Every check and write is
// scoped to Washington, Oregon and New York; nothing here names California.
//
// Usage: node scripts/usa-map/render-us4-sql.mjs
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { REFRESH_BLOCK, sq } from "./render-us2-sql.mjs";
import { depthOf, loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { SCOPE_KEYS, us4Wave } from "./us4-wave.mjs";

const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
export const SCOPE_WHERE = (alias) => `(${SCOPE_KEYS.map((k) => `${alias}.canonical_key = '${k}' or ${alias}.canonical_key like '${k}.%'`).join(" or ")})`;
const PLAN = "docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md";

export async function loadUs4Wave() {
  return us4Wave(await loadTrees(), await loadTtb());
}

export function catalogSql(wave) {
  const tag = "US-4 catalog";
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const prior = wave.prior.verified.map((k) => `  (${sq(k)})`).join(",\n");
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => a - b);
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perTier = valuesOf(countBy(wave.places, (p) => String(p.display_tier)));
  const perParent = valuesOf(countBy(wave.places, (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  return `-- USA on the wine map, phase US-4: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-4;
-- plan ${PLAN} Task 4).
--
-- Inserts the ${wave.places.length} AVAs of Washington, Oregon and New York DRAFT (APPELLATION,
-- AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-{washington,oregon,new-york}-tree.json: one place per
-- cross-state AVA, under its map state (D6). Rendered by
-- scripts/usa-map/render-us4-sql.mjs; us4-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs the US-2 places of the three states VERIFIED (the US-2 promote is live).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us4 and flip in ${wave.versions.promote}.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us4_catalog, pg_temp._us4_prior;
create temp table _us4_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us4_catalog values
${rows};
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
${prior};

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception '${tag}: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED';
  if v_text is not null then
    raise exception '${tag}: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

${depths.map(insertAt).join("\n")}
do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v
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
  if v_text is not null then raise exception '${tag}: rows differ from the tree reports: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perTier}) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

// (Tasks 11 and 12 insert promoteSql and the rollback renderers here.)

/** Every rendered file, path -> text. */
export function renderAll(wave) {
  return {
    [wave.files.catalog]: catalogSql(wave),
  };
}

async function main() {
  const wave = await loadUs4Wave();
  for (const [path, text] of Object.entries(renderAll(wave))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

Tasks 11 and 12 add the imports they need (`STATE_SLUGS`, `inScope`, `STATE_WINDOWS`) with their functions.

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us4-sql.mjs` then `node --test scripts/usa-map/us4-sql.test.mjs`. Expected: PASS (2 tests).

- [ ] **Step 5: Dry-run the catalog against live.** Run the activity check first. Then:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && APPLIER=C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs && node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930224747_usa_us4_catalog.sql --check && node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930224747_usa_us4_catalog.sql --dry
```

Expected: `PREFLIGHT OK`, then a NOTICE `US-4 catalog: neighbour refresh N rows in S s` with S under 300, then `DRY RUN OK`. Record N and S for the runbook.

- [ ] **Step 6: Commit** the renderer, the test and the migration: "feat(usa-map): US-4 catalog migration (42 AVAs of Washington, Oregon and New York), DRAFT with refresh (not applied)". Put the measured refresh seconds in the body.

---

### Task 5: The US-4 knowledge rule, the lead check, the review renderer and two generic tools

**Files:**
- Create: `scripts/usa-map/usa-us4-knowledge.mjs`, `scripts/usa-map/render-usa-us4-review.mjs`, `scripts/usa-map/order-usa-profiles.mjs`, `scripts/usa-map/check-usa-grapes.mjs`
- Create: `data/wine-map/place-profiles-usa-us4.json` (skeleton)
- Modify: `.gitattributes` (add `data/wine-map/place-profiles-usa-us4.json -text`)
- Test: `scripts/usa-map/usa-us4-knowledge.test.mjs`

**Interfaces:**
- Consumes: `validateUs3Profiles`, `sortToWaveOrder`, `mergeSources` from `usa-us3-knowledge.mjs` (unchanged); `shortlistRanks`, `shortlistSurfaces`, `shortlistDemotions`, `panelGrapes`, `STYLE_LABELS`, `BY_HAND_CHIPS` from `usa-knowledge.mjs` (unchanged); `loadWave`, `WAVES` (Task 2).
- Produces: `US4_NEW_GRAPES`, `SIGNATURE_LEADS`, `validateUs4Profiles(source, wave) → string[]`, `shortlistTop(source, stateKey) → string[]`, `signatureLeadProblems(source) → string[]`, `us4ReviewMarkdown({ source, wave, state, allSource, rehearsal }) → string`; `renderReview()`, `reviewPath(state)`, `REHEARSAL_PATH` in `render-usa-us4-review.mjs`; the CLIs `order-usa-profiles.mjs --wave <name>` and `check-usa-grapes.mjs --wave <name>`. The US-3 CLIs (`order-us3-profiles.mjs`, `check-us3-grapes.mjs`) stay as they are.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/usa-us4-knowledge.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSources } from "./usa-us3-knowledge.mjs";
import { shortlistTop, signatureLeadProblems, us4ReviewMarkdown, validateUs4Profiles } from "./usa-us4-knowledge.mjs";
import { loadWave } from "./waves.mjs";

const wave = await loadWave("us4");
const long = (s) => `${s}: a plain factual sentence long enough to pass the floor.`;
const entry = (key, i) => {
  const u = wave.ucd.find((x) => x.key === key);
  return {
    article: {
      description: long(`Description ${i}`), climate: long(`Climate ${i}`), soils: long(`Soils ${i}`),
      grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: [`Established ${u.established.slice(0, 4)} (27 CFR ${u.cfr_section})`, "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Pinot Noir" }],
    sources: [
      { title: `27 CFR ${u.cfr_section}`, url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-${u.cfr_section}` },
      { title: "TTB, established AVAs", url: "https://www.ttb.gov/wine/established-avas" },
    ],
  };
};
const valid = () => ({
  _provenance: { wave: "us4", status: "DRAFT", owner_approval: null },
  new_grapes: [],
  places: Object.fromEntries(wave.places.map((p, i) => [p.key, entry(p.key, i)])),
});
const CANDY = "united-states.washington.columbia-valley.yakima-valley.candy-mountain";
const CHAMPLAIN = "united-states.new-york.champlain-valley-of-new-york";
const grape = (name, color) => ({
  name, color, skin_color: color === "RED" ? "blue-black" : "green", description: long(`${name} is a hybrid grape`),
  sources: [{ title: `${name}, VIVC`, url: "https://www.vivc.de/" }],
});

test("a complete file validates", () => {
  assert.deepEqual(validateUs4Profiles(valid(), wave), []);
});

test("Review Focus 4: the Established fact is TTB's (Candy Mountain: 2020, 27 CFR 9.272)", () => {
  const s = valid();
  s.places[CANDY].article.key_facts[0] = "Established 2021 (27 CFR 9.272)";
  assert.match(validateUs4Profiles(s, wave).join("\n"), /candy-mountain: "Established 2021 \(27 CFR 9\.272\)" disagrees with TTB \(2020, 27 CFR 9\.272\)/);
});

test("Review Focus 4: new grapes are allow-listed hybrids, each used and sourced; never a labrusca", () => {
  const s = valid();
  s.places[CHAMPLAIN].grapes = [{ name: "Marquette" }, { name: "Concord", role: "ACCESSORY" },
    { name: "Chambourcin", role: "ACCESSORY" }, { name: "Frontenac", role: "ACCESSORY" }];
  s.new_grapes = [grape("Marquette", "RED"), grape("Concord", "RED"), grape("Chambourcin", "RED"), grape("La Crescent", "WHITE"),
    { ...grape("Frontenac", "RED"), sources: [] }];
  const out = validateUs4Profiles(s, wave).join("\n");
  assert.match(out, /new grape Concord: a labrusca needs the owner's say/);
  assert.match(out, /new grape Chambourcin: not on the US-4 allow-list/);
  assert.match(out, /new grape La Crescent: no place lists it/);
  assert.match(out, /new grape Frontenac: at least one https source/);
  assert.doesNotMatch(out, /new grape Marquette/);
});

test("Review Focus 5: each state's signature grape leads its shortlist", () => {
  const src = { places: {
    "united-states.oregon": { grapes: [{ name: "Pinot Noir" }] },
    "united-states.oregon.a": { grapes: [{ name: "Pinot Noir" }, { name: "Syrah", role: "ACCESSORY" }] },
    "united-states.washington": { grapes: [{ name: "Cabernet Sauvignon" }, { name: "Merlot" }] },
    "united-states.new-york": { grapes: [{ name: "Riesling" }] },
    "united-states.new-york.a": { grapes: [{ name: "Marquette" }] },
  } };
  assert.deepEqual(shortlistTop(src, "united-states.washington"), ["Cabernet Sauvignon", "Merlot"]);
  assert.deepEqual(signatureLeadProblems(src), ["united-states.new-york: Riesling ties at the top with Marquette"]);
  src.places["united-states.new-york.b"] = { grapes: [{ name: "Riesling" }] };
  assert.deepEqual(signatureLeadProblems(src), []);
  for (const k of ["b", "c", "d"]) src.places[`united-states.oregon.${k}`] = { grapes: [{ name: "Syrah" }] };
  assert.match(signatureLeadProblems(src).join("\n"), /united-states\.oregon: the shortlist leads with Syrah, not Pinot Noir/);
});

test("a state's review file: one section per place of that state, its new grapes, no shortlist without a rehearsal", () => {
  const s = valid();
  s.places[CHAMPLAIN].grapes = [{ name: "Marquette" }];
  s.new_grapes = [grape("Marquette", "RED")];
  const ny = wave.states.find((x) => x.code === "NY");
  const md = us4ReviewMarkdown({ source: s, wave, state: ny, allSource: s, rehearsal: null });
  assert.equal((md.match(/^## United States › New York › /gm) ?? []).length, 8);
  assert.match(md, /## New grapes for the catalog[\s\S]*\*\*Marquette\*\* \(red; skin blue-black\)/);
  assert.ok(!md.includes("## Grape shortlist change"));
});

test("the committed US-4 knowledge file: the places written so far meet the rule; an approved file is complete", async (t) => {
  const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
  const written = { ...wave, places: wave.places.filter((p) => source.places[p.key]) };
  if (!written.places.length) { t.skip("no place written yet"); return; }
  assert.deepEqual(validateUs4Profiles(source, written), []);
  if (source._provenance.status === "APPROVED") {
    assert.equal(Object.keys(source.places).length, wave.places.length, "an approved file holds every place");
    assert.match(source._provenance.owner_approval.answer, /no need for my review/);
    const us2 = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
    assert.deepEqual(signatureLeadProblems(mergeSources(us2, source)), [], "Review Focus 5 on the committed data");
  }
});
```

(`validateUs4Profiles` is run on `written`, a wave narrowed to the places written so far, because US-3's validator reports every missing place as a problem.)

- [ ] **Step 2: Run.** `node --test scripts/usa-map/usa-us4-knowledge.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/usa-us4-knowledge.mjs`:

```js
// US-4 knowledge (spec §10, §18): US-3's rule (validateUs3Profiles) plus the
// new-grape allow-list (plan decision 8), the signature-grape lead check
// (§10.3, decision 9), and one review file per state (each well under §18's 40
// places).
import {
  BY_HAND_CHIPS, panelGrapes, shortlistDemotions, shortlistRanks, shortlistSurfaces, STYLE_LABELS,
} from "./usa-knowledge.mjs";
import { validateUs3Profiles } from "./usa-us3-knowledge.mjs";

// Hybrids a listed source names as a place's grape. Never a labrusca: spec
// §10.1 lists Concord "only if the owner wants a labrusca listed".
export const US4_NEW_GRAPES = Object.freeze(["Baco Noir", "Frontenac", "La Crescent", "Marquette", "Seyval Blanc", "Vidal Blanc"]);
const LABRUSCA = /^(concord|niagara|catawba|delaware|diamond|isabella)$/i;
// §10.3: the state's shortlist still leads with its signature grape (§25 grape roles).
export const SIGNATURE_LEADS = Object.freeze({
  "united-states.washington": Object.freeze({ grape: "Cabernet Sauvignon", alone: false }),
  "united-states.oregon": Object.freeze({ grape: "Pinot Noir", alone: true }),
  "united-states.new-york": Object.freeze({ grape: "Riesling", alone: true }),
});

export function validateUs4Profiles(source, wave) {
  const problems = validateUs3Profiles(source, wave);
  const used = new Set(Object.values(source?.places ?? {}).flatMap((p) => (p.grapes ?? []).map((g) => g.name)));
  for (const g of source?.new_grapes ?? []) {
    if (LABRUSCA.test(g.name)) problems.push(`new grape ${g.name}: a labrusca needs the owner's say (spec §10.1)`);
    else if (!US4_NEW_GRAPES.includes(g.name)) problems.push(`new grape ${g.name}: not on the US-4 allow-list`);
    if (!used.has(g.name)) problems.push(`new grape ${g.name}: no place lists it`);
    if (!g.skin_color) problems.push(`new grape ${g.name}: skin_color`);
    if (!(g.sources ?? []).some((s) => /^https:\/\//.test(s.url ?? ""))) problems.push(`new grape ${g.name}: at least one https source`);
  }
  return problems;
}

/** The grapes tied at the top of a state's shortlist: signature (PRINCIPAL) links first, most-linked first. */
export function shortlistTop(source, stateKey) {
  const ranks = [...shortlistRanks(source, stateKey)].sort(([a, x], [b, y]) =>
    (x.bucket === y.bucket ? y.count - x.count : x.bucket === "principal" ? -1 : 1) || a.localeCompare(b));
  if (!ranks.length) return [];
  const [, lead] = ranks[0];
  return ranks.filter(([, r]) => r.bucket === lead.bucket && r.count === lead.count).map(([g]) => g);
}

export function signatureLeadProblems(source) {
  const out = [];
  for (const [key, want] of Object.entries(SIGNATURE_LEADS)) {
    const top = shortlistTop(source, key);
    if (!top.includes(want.grape)) out.push(`${key}: the shortlist leads with ${top.join(", ") || "nothing"}, not ${want.grape}`);
    else if (want.alone && top.length > 1) out.push(`${key}: ${want.grape} ties at the top with ${top.filter((g) => g !== want.grape).join(", ")}`);
  }
  return out;
}

export function us4ReviewMarkdown({ source, wave, state, allSource, rehearsal }) {
  const places = wave.places.filter((p) => p.key.startsWith(`${state.key}.`));
  const approved = source._provenance?.status === "APPROVED";
  const L = [`# United States, US-4, ${state.name}: knowledge`, ""];
  L.push(approved
    ? "**Status: APPROVED under the owner's waiver of 2026-09-30** (\"no need for my review\"). This file is the readable record of what the knowledge migration applies; the copy is provisional until the main session's live check."
    : "**Status: DRAFT, provisional copy.** Nothing here is live.", "");
  L.push(`Places: ${places.length} of the wave's ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  for (const place of places) {
    const p = source.places[place.key];
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
  const named = new Set(places.flatMap((pl) => source.places[pl.key].grapes.map((g) => g.name)));
  const fresh = (source.new_grapes ?? []).filter((g) => named.has(g.name));
  if (fresh.length) {
    L.push("## New grapes for the catalog", "", "The knowledge migration adds them to the shared grape list; from then on every grape picker offers them (CLAUDE.md, F9).", "");
    for (const g of fresh) L.push(`- **${g.name}** (${g.color.toLowerCase()}; skin ${g.skin_color}): ${g.description}`);
    L.push("");
  }
  const s = rehearsal?.shortlist?.[state.name];
  if (s) {
    L.push(`## Grape shortlist change for ${state.name} (spec §10.3)`, "");
    L.push(`Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. "Before" is the live list before US-4; "after" includes it. After a grape: the number of ${state.name} places that list it as a signature grape ("accessory" when it is one nowhere). The by-hand form shows at most ${BY_HAND_CHIPS} chips.`, "");
    const ranks = shortlistRanks(allSource, state.key);
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
    const own = allSource.places[state.key].grapes;
    const d = shortlistDemotions(own, s.after, rankOf);
    L.push(`Against ${state.name}'s own list (its first three: ${own.slice(0, 3).map((g) => g.name).join(", ")}): ${d.length ? `${d.join("; ")}.` : "none moves down or drops."}`, "");
  }
  const near = Object.entries(rehearsal?.nearby ?? {}).filter(([k]) => k.startsWith(`${state.key}.`));
  if (near.length) {
    L.push("## Nearby chips (spec §8.7)", "", "The details panel's five nearby chips for these places, as a signed-in reader, after the promote. Containers and overlapping AVAs score distance 0; the main session accepts or defers (§20).", "");
    for (const [key, list] of near) L.push(`- \`${key}\`: ${list.join(", ") || "none"}`);
    L.push("");
  }
  const w = rehearsal?.archetypes;
  if (w && w.home?.startsWith(`${state.key}.`)) {
    L.push("## Typical wine", "", `${w.name} stays at home on \`${w.home}\`, placed on ${w.placements.map((k) => `\`${k}\``).join(" and ")}: spec §14.2 names no change for it in US-4.`, "");
  }
  return `${L.join("\n")}\n`;
}
```

`scripts/usa-map/render-usa-us4-review.mjs`:

```js
// node scripts/usa-map/render-usa-us4-review.mjs
// Writes data/wine-map/review/usa-us4-<state>-knowledge.md, one per state,
// from the US-4 knowledge file and, once it exists, the rehearsal evidence
// (shortlists, nearby chips, the Willamette typical wine).
import { readFile, writeFile } from "node:fs/promises";
import { mergeSources } from "./usa-us3-knowledge.mjs";
import { us4ReviewMarkdown } from "./usa-us4-knowledge.mjs";
import { loadWave } from "./waves.mjs";

export const reviewPath = (state) => `data/wine-map/review/usa-us4-${state.key.split(".")[1]}-knowledge.md`;
export const REHEARSAL_PATH = "data/wine-map/review/usa-us4-rehearsal.json";
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const maybe = async (p) => { try { return await json(p); } catch { return null; } };

export async function renderReview() {
  const wave = await loadWave("us4");
  const source = await json(wave.knowledgeSource);
  const allSource = mergeSources(await json("data/wine-map/place-profiles-usa.json"), source);
  const rehearsal = await maybe(REHEARSAL_PATH);
  return wave.states.map((state) => [reviewPath(state), us4ReviewMarkdown({ source, wave, state, allSource, rehearsal })]);
}

if (process.argv[1]?.endsWith("render-usa-us4-review.mjs")) {
  for (const [path, text] of await renderReview()) { await writeFile(path, text); console.log(`wrote ${path}`); }
}
```

`scripts/usa-map/order-usa-profiles.mjs`:

```js
// node scripts/usa-map/order-usa-profiles.mjs --wave <us3-core|us3-rest|us4>
// Rewrites the wave's knowledge file with its places in wave order (a pure reorder).
import { readFile, writeFile } from "node:fs/promises";
import { sortToWaveOrder } from "./usa-us3-knowledge.mjs";
import { loadWave, WAVES } from "./waves.mjs";

const name = process.argv[process.argv.indexOf("--wave") + 1];
const allowed = WAVES.filter((w) => w !== "us2");
if (!allowed.includes(name)) { console.error(`usage: order-usa-profiles.mjs --wave <${allowed.join("|")}>`); process.exit(2); }
const wave = await loadWave(name);
const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
await writeFile(wave.knowledgeSource, `${JSON.stringify(sortToWaveOrder(source, wave), null, 2)}\n`);
console.log(`ordered ${Object.keys(source.places).length} places in ${wave.knowledgeSource}`);
```

`scripts/usa-map/check-usa-grapes.mjs`:

```js
// Read-only: every grape a wave's knowledge names resolves in the live catalog
// (or is one of the file's new_grapes). node scripts/usa-map/check-usa-grapes.mjs --wave <name>
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { loadWave, WAVES } from "./waves.mjs";

const name = process.argv[process.argv.indexOf("--wave") + 1];
if (!WAVES.includes(name)) { console.error(`usage: check-usa-grapes.mjs --wave <${WAVES.join("|")}>`); process.exit(2); }
const s = JSON.parse(await readFile((await loadWave(name)).knowledgeSource, "utf8"));
const names = [...new Set(Object.values(s.places).flatMap((p) => (p.grapes ?? []).map((g) => g.name)))];
const newNames = (s.new_grapes ?? []).map((g) => g.name);
const result = await withReadOnly(async (c) => {
  const { rows } = await c.query("select name from public.grapes where name = any($1::text[])", [names]);
  const have = new Set(rows.map((r) => r.name));
  return { missing: names.filter((n) => !have.has(n) && !newNames.includes(n)), new_but_live: newNames.filter((n) => have.has(n)) };
});
console.log(JSON.stringify({ grapes: names.length, ...result }));
if (result.missing.length) process.exitCode = 1;
```

(`new_but_live` is information, not a failure: the knowledge migration inserts new grapes with `on conflict (name) do nothing`.)

Append to the test file (the import at the top, the test at the end):

```js
import { renderReview } from "./render-usa-us4-review.mjs";

test("the committed review files are the render (once written)", async (t) => {
  for (const [path, text] of await renderReview()) {
    let committed;
    try { committed = (await readFile(path, "utf8")).replace(/\r\n/g, "\n"); } catch { t.skip(`${path} not rendered yet`); return; }
    assert.equal(committed, text, path);
  }
});
```

- [ ] **Step 4: The skeleton.** Add `data/wine-map/place-profiles-usa-us4.json -text` to `.gitattributes` (after the `place-profiles-usa-us3-*.json` line). Write `data/wine-map/place-profiles-usa-us4.json` (LF):

```json
{
  "_provenance": {
    "what": "Details-panel knowledge for the United States wine map, US-4: the 42 AVAs of Washington, Oregon and New York (spec docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §10; plan docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md). Turned into supabase/migrations/20260930234747_usa_us4_knowledge.sql by scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa-us4.json --bare.",
    "wave": "us4",
    "status": "DRAFT",
    "owner_approval": null,
    "written_in_session": "From 2026-09-30, from public sources only (listed under each place); no API batch (AGENTS.md).",
    "rules": "Plain English, no praise words, figures only where a listed source publishes them, never 'official boundary' (spec §18). Exactly one key fact 'Established YYYY (27 CFR 9.N)', as TTB lists it. Descriptions of 2-4 sentences, at most 700 characters. At most 8 grapes; the 1-3 signature grapes are PRINCIPAL and the rest ACCESSORY. At least two sources per place, one of them the CFR section or the Federal Register final rule. share_pct is left out. New grapes only from the US-4 allow-list (hybrids; never a labrusca), each with a source."
  },
  "new_grapes": [],
  "places": {}
}
```

- [ ] **Step 5: Run.** `node --test scripts/usa-map/usa-us4-knowledge.test.mjs`. Expected: PASS; the "committed … file" test and the review test skip. `node --test scripts/usa-map/usa-us3-knowledge.test.mjs scripts/usa-map/usa-knowledge.test.mjs` still pass (US-2 and US-3 untouched).
- [ ] **Step 6: Commit** the modules, CLIs, test, skeleton and `.gitattributes`: "feat(usa-map): the US-4 knowledge rule (new-grape allow-list, signature-grape leads), review files per state, generic order and grape tools".

---
## Knowledge conventions (Tasks 6–8)

Every knowledge task follows these, and its places' briefs. This is writing work done in session: WebSearch/WebFetch for sources, then your own prose. **No script generates text, and nothing calls the Anthropic API.**

**Per place, write** into `data/wine-map/place-profiles-usa-us4.json` under `places["<key>"]`:

- `article.description`: 2–4 sentences, at most 700 characters: where it is, what distinguishes it, and why a taster would care. Name the AVA by its legal name. Never mention keys, shards or the map. Where the tree review lists a cross-state or legal-record fact, say it plainly in legal terms, because the details panel shows no `ALTERNATE_PARENT` edge (spec §8.6):
  - Walla Walla Valley: it spans Washington and Oregon (TTB lists both), and holds The Rocks District of Milton-Freewater.
  - The Rocks District of Milton-Freewater: it lies wholly in Oregon, within the Walla Walla Valley and Columbia Valley AVAs.
  - Columbia Gorge: it lies on both banks of the Columbia River, in Oregon and Washington.
  - Candy Mountain: it lies within the Yakima Valley and Columbia Valley AVAs (T.D. TTB-163 expanded Yakima Valley to take it in whole).
  - Lake Chelan, Rattlesnake Hills, Umpqua Valley, Elkton Oregon, Laurelwood District, Lower Long Tom and McMinnville: "within" their parent, as their CFR text says, never a percentage.
- `article.climate` and `article.soils`: each ≥ 40 characters, from the final rule's "distinguishing features" (climate, soils, topography) wherever it has them.
- `article.grape_varieties` and `article.wine_styles`: one or two plain sentences each, ≥ 40 characters.
- `article.key_facts`: 3–6, each 10–200 characters. **Exactly one** is `Established YYYY (27 CFR 9.N)`, with the year and section from `data/wine-map/review/usa-us4-fact-sheet.md`. Others: the counties (from the fact sheet), an elevation or distance rule written into the CFR text, a published acreage, a name history — each supported by a listed source.
- `grapes`: 1–8, each a catalog name exactly as in Global Constraints, or one of the six new grapes (decision 8). The 1–3 signature grapes have no `role` (PRINCIPAL); every other has `"role": "ACCESSORY"`. Only grapes a listed source names for this AVA. Lemberger is the catalog's `Blaufränkisch` with `"note": "Sold as Lemberger"` (US-2's convention). No `share_pct`.
- `styles`: from `RED`, `WHITE`, `ROSE`, `SPARKLING`, `SWEET`, `FORTIFIED`, most important first; only what a source supports.
- `sources`: ≥ 2 `{ "title", "url" }` with https URLs. One must be the eCFR section (`https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-9.N`) or the Federal Register final rule that established or last revised the AVA (federalregister.gov / govinfo.gov). Fetch each page and check every fact against it. eCFR sometimes redirects fetchers to an "unblock" page: then cite `https://www.law.cornell.edu/cfr/text/27/9.N` (the validator accepts it) or the govinfo copy of the final rule.

**Where to look, in this order:** the final rule in the Federal Register ("Establishment of the … Viticultural Area", its T.D. number; its "Distinguishing Features" and "Name Evidence" sections are authoritative for climate, soils, topography and history); the CFR section (boundary text, elevation lines); TTB's established-AVA list; the regional bodies — Washington State Wine Commission (washingtonwine.org, which publishes an AVA profile per AVA), Walla Walla Valley Wine Alliance, Red Mountain AVA Alliance, Wine Yakima Valley, Lake Chelan Wine Alliance; Oregon Wine Board (oregonwine.org, industry.oregonwine.org), Willamette Valley Wineries Association (willamettewines.com), the Umpqua, Rogue and Applegate valley growers, Columbia Gorge Winegrowers; New York Wine & Grape Foundation (newyorkwines.org), Finger Lakes Wine Alliance, Long Island Wine Council (liwines.com), Cornell's viticulture and enology programme; for the hybrids, the University of Minnesota's grape breeding pages and the Vitis International Variety Catalogue (vivc.de). Cite only a page you actually fetched; the Oxford Companion, Jancis Robinson and WSET material may confirm a fact, but cite a fetchable page for each.

**Copy rules (§18):** plain English; no praise or hype (the validator's list); facts the sources support; "generalized digitization", never "official/legal boundary"; no figure without a published source.

**The briefs.** Each task lists its places with a starting hypothesis: signature grapes (PRINCIPAL) · accessory grapes | styles | facts to verify and use if a source confirms them. The hypothesis is the plan's decision unless a source contradicts it: change it only with a cited reason, and say so in the commit body. Drop a fact no source confirms. A row marked **(thin)** has little published material: take the grapes and styles only from what the final rule or the petition (regulations.gov docket) names as planted; the PRINCIPAL grape is the most-planted one named.

**Stop rule.** If after the final rule, the CFR text, the petition and one regional source no grape is named for a place, do not guess: add the key to `_provenance.research_gaps` (an array of `{ key, searched: [urls] }`) and report it in your final message. The wave cannot promote until the main session resolves it (the promote's coverage assert refuses a place with no grape).

**Every knowledge task ends with the same steps:**

1. `node scripts/usa-map/order-usa-profiles.mjs --wave us4` (places back in wave order);
2. `node --test scripts/usa-map/usa-us4-knowledge.test.mjs` → PASS (the "places written so far" test runs on every place written so far; fix the content, never the rule);
3. `node --env-file=.env.local scripts/usa-map/check-usa-grapes.mjs --wave us4` (read-only) → `"missing":[]`;
4. commit the data file: "data(usa-map): US-4 knowledge, <state> (<n> places, provisional copy)".

---

### Task 6: Knowledge, Washington (16 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us4.json`. Test: the Knowledge-conventions steps.

Keys under `united-states.washington.columbia-valley.`. Washington's signature grapes at state level are Cabernet Sauvignon and Merlot (US-2); keep Cabernet Sauvignon PRINCIPAL wherever a source names it, so the state's shortlist keeps leading with it (decision 9). The Washington State Wine Commission's AVA profiles give each AVA's leading grapes and acreage: use their figures only as they print them, with the page cited.

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `ancient-lakes-of-columbia-valley` | Riesling, Chardonnay · Pinot Gris, Gewürztraminer, Pinot Noir | WHITE, RED | coulees and lakes scoured by the Ice Age (Missoula) floods; soils from the final rule (caliche, basalt, wind-blown sand); the "of Columbia Valley" in the legal name |
| `horse-heaven-hills` | Cabernet Sauvignon · Merlot, Chardonnay, Syrah, Riesling | RED, WHITE | south-facing slopes above the Columbia River; steady wind; the state's plantings there only with a published figure. Wholly in Washington (TTB), though a coarse state line suggests otherwise: say nothing about Oregon |
| `lake-chelan` | Syrah, Riesling · Pinot Noir, Chardonnay, Merlot, Malbec | RED, WHITE | the lake's moderating effect (final rule); sandy soils with quartz and mica; the elevation line in the CFR text; within Columbia Valley |
| `naches-heights` | Syrah · Riesling, Pinot Gris, Tempranillo | RED, WHITE | **(thin)** a plateau west of Yakima; wind-blown loess over andesite (final rule) |
| `rocky-reach` | Cabernet Sauvignon, Merlot · Syrah | RED | **(thin)** 2022; along the Columbia north of Wenatchee; soils as the final rule describes them |
| `royal-slope` | Cabernet Sauvignon, Merlot · Syrah, Chardonnay | RED, WHITE | 2020; the south-facing slope of the Frenchman Hills (final rule) |
| `the-burn-of-columbia-valley` | Cabernet Sauvignon · Merlot, Syrah | RED | **(thin)** 2021; Klickitat County, on a plateau above the Columbia River; the name's origin as the final rule states it; wholly in Washington (TTB) |
| `wahluke-slope` | Cabernet Sauvignon, Merlot, Syrah · Riesling, Chardonnay | RED, WHITE | among the state's warmest and driest areas (final rule); sandy soils; a south-facing slope below the Saddle Mountains |
| `walla-walla-valley` | Cabernet Sauvignon, Merlot, Syrah · Cabernet Franc, Malbec | RED | spans Washington and Oregon (TTB; a share only with a published figure); loess over flood deposits; the Blue Mountains; holds The Rocks District of Milton-Freewater, which lies in Oregon |
| `white-bluffs` | Cabernet Sauvignon · Merlot, Chardonnay | RED, WHITE | **(thin)** 2021; Franklin County; the White Bluffs along the Columbia; the lake-bed sediments the final rule names |
| `yakima-valley` | Cabernet Sauvignon, Merlot, Chardonnay · Riesling, Syrah | RED, WHITE | Washington's first AVA (1983); the Cascade rain shadow; holds Red Mountain, Rattlesnake Hills, Snipes Mountain, Goose Gap and Candy Mountain; its 2020 expansion for Candy Mountain (T.D. TTB-163) |
| `yakima-valley.candy-mountain` | Cabernet Sauvignon · Merlot, Cabernet Franc, Syrah | RED | 2020; its 815 acres (T.D. TTB-163); within Yakima Valley and Columbia Valley (T.D. TTB-163); south-facing slopes on an isolated hill (the petition as the rule summarizes it) |
| `yakima-valley.goose-gap` | Cabernet Sauvignon · Merlot, Syrah, Riesling | RED, WHITE | **(thin)** 2021; a ridge near Red Mountain and Candy Mountain (final rule); within Yakima Valley and Columbia Valley |
| `yakima-valley.rattlesnake-hills` | Cabernet Sauvignon, Merlot · Syrah, Riesling, Chardonnay | RED, WHITE | the hills' elevation floor in the CFR text; above the Yakima River; within Yakima Valley |
| `yakima-valley.red-mountain` | Cabernet Sauvignon · Merlot, Syrah, Cabernet Franc | RED | a southwest-facing slope; among the state's warmest (final rule); calcareous, sandy soils as the rule describes them |
| `yakima-valley.snipes-mountain` | Cabernet Sauvignon, Merlot · Syrah, Riesling | RED, WHITE | **(thin)** an uplift rising from the valley floor; cobbly soils from the ancestral Columbia River (final rule); old plantings only with a source |

- [ ] **Step 1:** Research and write the 16 entries. **Steps 2–5:** the Knowledge-conventions steps (commit "data(usa-map): US-4 knowledge, Washington (16 places, provisional copy)").

---

### Task 7: Knowledge, Oregon (18 places)

**Files:** Modify `data/wine-map/place-profiles-usa-us4.json`.

Keys under `united-states.oregon.`. Pinot Noir is PRINCIPAL wherever a source names it (decision 9). The Willamette sub-AVAs: say where they lie in the valley and what sets them apart (soil series, elevation, wind), from each final rule. The Willamette Valley typical wine is not touched (decision 10).

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `columbia-gorge` | Pinot Noir, Chardonnay · Pinot Gris, Syrah, Gewürztraminer, Riesling, Zinfandel | WHITE, RED, SPARKLING | on both banks of the Columbia River in Oregon and Washington (TTB); rainfall drops steeply from west to east over a short distance (final rule); Hood River |
| `southern-oregon.rogue-valley` | Syrah, Cabernet Sauvignon, Merlot · Chardonnay, Tempranillo, Viognier, Pinot Noir | RED, WHITE | three river valleys (Bear Creek, the Applegate, the Illinois); warmer and drier inland (final rule) |
| `southern-oregon.rogue-valley.applegate-valley` | Syrah, Merlot, Cabernet Sauvignon · Zinfandel, Viognier | RED, WHITE | 2000; within Rogue Valley; soils and climate as the final rule describes them |
| `southern-oregon.umpqua-valley` | Pinot Noir, Tempranillo · Pinot Gris, Syrah, Riesling | RED, WHITE | within Southern Oregon (CFR); the "hundred valleys" phrase only with a source; Richard Sommer's HillCrest Vineyard, planted in 1961, and its Pinot Noir (source) |
| `southern-oregon.umpqua-valley.elkton-oregon` | Pinot Noir · Pinot Gris, Riesling, Gewürztraminer, Chardonnay | RED, WHITE | the Umpqua's coolest part; marine air along the river (final rule); within Umpqua Valley |
| `southern-oregon.umpqua-valley.red-hill-douglas-county-oregon` | Pinot Noir · Chardonnay | RED, WHITE | **(thin)** a single hill; red volcanic soils as the final rule names them |
| `the-rocks-district-of-milton-freewater` | Syrah · Cabernet Sauvignon, Merlot, Grenache, Tempranillo | RED | wholly in Oregon, within the Walla Walla Valley and Columbia Valley AVAs (final rule); the cobblestones of the Walla Walla River's alluvial fan and the soil series the rule names |
| `willamette-valley.chehalem-mountains` | Pinot Noir · Pinot Gris, Chardonnay, Pinot Blanc | RED, WHITE | three soil types: volcanic basalt, marine sediment, wind-blown loess (final rule) |
| `willamette-valley.chehalem-mountains.laurelwood-district` | Pinot Noir · Chardonnay, Pinot Gris | RED, WHITE | 2020; Laurelwood soil, loess over basalt (final rule); within Chehalem Mountains |
| `willamette-valley.chehalem-mountains.ribbon-ridge` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | a ridge of uplifted marine sediment (final rule); its small size |
| `willamette-valley.dundee-hills` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | red volcanic Jory soils; David Lett's Eyrie Vineyards plantings of the 1960s (year only with a source) |
| `willamette-valley.eola-amity-hills` | Pinot Noir · Chardonnay, Pinot Gris, Riesling | RED, WHITE | afternoon wind through the Van Duzer Corridor; volcanic basalt soils (final rule) |
| `willamette-valley.lower-long-tom` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | **(thin)** 2021; the Long Tom River watershed near Eugene; the soils the final rule names |
| `willamette-valley.mcminnville` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | the elevation band in the CFR text; marine sediment over basalt; within Willamette Valley |
| `willamette-valley.mount-pisgah-polk-county-oregon` | Pinot Noir · Chardonnay, Pinot Gris | RED, WHITE | **(thin)** 2022; a single mountain in Polk County (final rule); the long legal name as TTB prints it |
| `willamette-valley.tualatin-hills` | Pinot Noir · Chardonnay, Pinot Gris, Riesling | RED, WHITE | 2020; Laurelwood soils; the valley's northwest corner (final rule) |
| `willamette-valley.van-duzer-corridor` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | a low gap in the Coast Range that lets ocean air in (final rule) |
| `willamette-valley.yamhill-carlton` | Pinot Noir · Pinot Gris, Chardonnay | RED, WHITE | marine sedimentary soils; the elevation band in the CFR text |

- [ ] **Step 1:** Research and write the 18 entries. **Steps 2–5:** the Knowledge-conventions steps (commit "…, Oregon (18 places, …)").

---

### Task 8: Knowledge, New York (8 places), the six new grapes, and the approval

**Files:** Modify `data/wine-map/place-profiles-usa-us4.json`.

Keys under `united-states.new-york.`. Riesling is PRINCIPAL wherever a source names it; the hybrids are PRINCIPAL only where they are the AVA's point (Champlain Valley, Upper Hudson, Hudson River Region's Seyval Blanc), so New York's shortlist keeps leading with Riesling (decision 9).

| Key (tail) | Grapes (signature · accessory) | Styles | Verify and use |
|---|---|---|---|
| `champlain-valley-of-new-york` | Marquette, Frontenac, La Crescent | RED, WHITE | 2016; cold-hardy hybrids (the final rule, or the growers); Lake Champlain's moderating effect; Clinton and Essex counties |
| `finger-lakes.cayuga-lake` | Riesling · Chardonnay, Cabernet Franc, Pinot Noir, Gewürztraminer | WHITE, RED, SPARKLING | 1988; the lake's moderating effect (final rule); within Finger Lakes |
| `finger-lakes.seneca-lake` | Riesling · Cabernet Franc, Pinot Noir, Gewürztraminer, Chardonnay, Blaufränkisch (note "Sold as Lemberger"), Grüner Veltliner | WHITE, RED, SPARKLING, SWEET | the deepest of the Finger Lakes (depth with a source); lake-effect frost protection (final rule); SWEET only with a source for late-harvest or ice wine |
| `hudson-river-region` | Seyval Blanc, Chardonnay, Cabernet Franc · Baco Noir, Riesling, Pinot Noir | WHITE, RED | 1982; among the oldest winegrowing areas in the country (a named winery and year with a source); hybrids alongside vinifera |
| `long-island.north-fork-of-long-island` | Merlot, Cabernet Franc · Chardonnay, Sauvignon Blanc, Cabernet Sauvignon | RED, WHITE, ROSE | between Long Island Sound and Peconic Bay; the first vineyard (Hargrave, 1973) with a source |
| `long-island.the-hamptons-long-island` | Merlot, Chardonnay · Cabernet Franc, Sauvignon Blanc | RED, WHITE, ROSE, SPARKLING | the South Fork; Atlantic influence; the soils the final rule names |
| `niagara-escarpment` | Riesling, Cabernet Franc · Chardonnay, Vidal Blanc | WHITE, RED, SWEET | the limestone escarpment near Lake Ontario (final rule); ice wine only with a source (else drop SWEET and Vidal Blanc) |
| `upper-hudson` | Marquette, Frontenac, La Crescent · Seyval Blanc | RED, WHITE | **(thin)** 2018; seven counties north of the Hudson River Region (CFR); cold-hardy hybrids (final rule or growers) |

**The new grapes** (`new_grapes`, decision 8). For each of the six that a place actually lists, write `{ "name", "color", "description", "skin_color", "sources" }`:

- `color` `RED` or `WHITE`; `skin_color` one of the values the catalog already uses (read-only: `node --env-file=.env.local -e "…"` with `withReadOnly` running `select distinct skin_color from public.grapes order by 1`; US-2's Petite Sirah uses `blue-black`);
- `description` ≥ 40 characters, 2–3 plain factual sentences: parentage, breeder and year, what it is grown for; from the source;
- ≥ 1 source: the breeder's page (the University of Minnesota for Marquette, Frontenac and La Crescent) and/or the VIVC entry (Seyval Blanc, Vidal Blanc, Baco Noir).

Hypotheses to verify: Marquette (red; University of Minnesota, released 2006); Frontenac (red; University of Minnesota, 1996); La Crescent (white; University of Minnesota, 2002); Seyval Blanc (white; a French hybrid from Seyve-Villard); Vidal Blanc (white; a French hybrid, Ugni Blanc crossed with Rayon d'Or); Baco Noir (red; a French hybrid by François Baco). Leave out any new grape no place ends up listing (the validator refuses an unused one).

- [ ] **Step 1:** Research and write the 8 entries and the new grapes.
- [ ] **Step 2: Record the approval.** With all 42 places written, no `_provenance.research_gaps`, and the file green, set `_provenance.status` to `"APPROVED"` and `_provenance.owner_approval` to:

```json
{ "answer": "Owner waived the copy review on 2026-09-30 (\"ignore my friends changes and just go ahead. no need for my review\"). Written in session from the sources listed under each place; read by the main session in data/wine-map/review/usa-us4-*-knowledge.md.", "date": "2026-09-30" }
```

If `_provenance.research_gaps` is non-empty, **do not approve**: leave it DRAFT and report the gaps.
- [ ] **Steps 3–6:** the Knowledge-conventions steps. The "committed US-4 knowledge file" test now also asserts 42 places, the waiver text and `signatureLeadProblems(...) = []`. If the lead check fails, the fix is a grape role (an accessory grape marked PRINCIPAL somewhere it is not the point), never the rule. Commit "data(usa-map): US-4 knowledge, New York (8 places) and six new hybrid grapes; the file complete, approved under the owner's waiver".

---

### Task 9: Generate the knowledge migration

**Files:**
- Create (generated): `supabase/migrations/20260930234747_usa_us4_knowledge.sql`
- Test: `scripts/usa-map/usa-us4-knowledge.test.mjs` (one test added)

**Interfaces:**
- Consumes: the approved data file (Task 8), the catalog migration (Task 4), the generator (`gen-place-profiles-migration.mjs`, with `--source`, `--bare`, a repeatable `--prelude`, `--write --version --name`; unchanged), `migrationIsCurrent` from `usa-knowledge.mjs`.

- [ ] **Step 1: Add the failing test** to `usa-us4-knowledge.test.mjs` (the two imports at the top, the test at the end):

```js
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { migrationIsCurrent } from "./usa-knowledge.mjs";

test("Review Focus 4: the knowledge migration carries the data file exactly", async () => {
  const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
  const sql = (await readFile(wave.files.knowledge, "utf8")).replace(/\r\n/g, "\n");
  assert.deepEqual(migrationIsCurrent(source, sql), []);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  assert.equal((sql.match(/^insert into public\.wine_place_articles /gm) ?? []).length, wave.places.length);
  assert.equal((sql.match(/\non conflict \(name\) do nothing;/g) ?? []).length, source.new_grapes.length);
});
```

- [ ] **Step 2: Run.** `node --test scripts/usa-map/usa-us4-knowledge.test.mjs`. Expected: FAIL, ENOENT on the knowledge migration.
- [ ] **Step 3: Generate.** Activity check first. Then:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa-us4.json --bare --prelude supabase/migrations/20260930224747_usa_us4_catalog.sql --write --version 20260930234747 --name usa_us4_knowledge
```

Expected: "prelude … applied inside a transaction that is rolled back", "42 places to write (united-states 42)", the new-grape count (6 if all six are used), the style/grape/article counts with "42 articles", and "wrote …/20260930234747_usa_us4_knowledge.sql". A "grape not in the catalog" refusal means a data-file name is wrong: fix the data file (Task 5's grape check should have caught it).
- [ ] **Step 4: Run the tests.** Expected: PASS. Also `node --test scripts/usa-map/*.test.mjs` all green.
- [ ] **Step 5: Commit** the migration and the test: "feat(usa-map): US-4 knowledge migration (42 places, six new grapes), generated --bare with the catalog as a rolled-back prelude (not applied)".

If the data file changes later (a correction), regenerate its migration with the same version and name (after the catalog is live, drop the prelude), and re-run this task's test: it fails on any text, style position, role or count the migration does not carry.

---
### Task 10: The stage library over three states, `stage-usa-ava.mjs --wave us4`, and the dry run

**Files:**
- Modify: `scripts/wine-map-sources/usa-stage-lib.mjs`, `scripts/wine-map-sources/stage-usa-ava.mjs`
- Test: `scripts/wine-map-sources/usa-stage-lib.test.mjs`

**Interfaces:**
- Consumes: a wave from `loadWave` (Task 2): `places`, `ucd`, `derived` (empty), `outlineKeys`, `parentChecks`, `priorKeys`, and `scopeKeys` (US-4) or `scopeKey` (US-2, US-3).
- Produces: `scopesOf(wave) → string[]` in `usa-stage-lib.mjs`; `stageWave`'s stray-boundary check over every scope key; the CLI `stage-usa-ava.mjs --wave us2|us3-core|us3-rest|us4 [--check-gate | --stage]` (the wave list comes from `WAVES`, so no other change is needed for `us4` to be accepted). US-2 and US-3 behave as before.

- [ ] **Step 1: Write the failing test.** Append to `scripts/wine-map-sources/usa-stage-lib.test.mjs` (add `scopesOf` to the import from `./usa-stage-lib.mjs`, and `import { loadWave } from "../usa-map/waves.mjs";`):

```js
test("the stray-boundary scope: one key for US-2 and US-3, the three states for US-4 (plan decision 6)", async () => {
  assert.deepEqual(scopesOf(await loadWave("us2")), ["united-states"]);
  assert.deepEqual(scopesOf(await loadWave("us3-core")), ["united-states.california"]);
  assert.deepEqual(scopesOf(await loadWave("us4")), ["united-states.new-york", "united-states.oregon", "united-states.washington"]);
  assert.deepEqual(scopesOf({}), ["united-states"]);
});
```

Run `node --test scripts/wine-map-sources/usa-stage-lib.test.mjs`. Expected: FAIL (`scopesOf` is not exported).

- [ ] **Step 2: Implement.** In `usa-stage-lib.mjs`, add after `sittingGate`:

```js
/** The keys whose subtrees may hold no boundary outside this wave and the earlier ones (US-4 spans three states). */
export function scopesOf(wave) {
  return wave.scopeKeys ?? [wave.scopeKey ?? "united-states"];
}
```

In `stageWave`, replace `const scope = wave.scopeKey ?? "united-states";` with `const scopes = scopesOf(wave);`, and the `stray` query and its throw with:

```js
  const stray = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where exists (select 1 from unnest($1::text[]) s(k) where p.canonical_key = s.k or p.canonical_key like s.k || '.%')
        and not (p.canonical_key = any($2::text[]) or p.canonical_key = any($3::text[]))`, [scopes, waveKeys, priorKeys]);
  if (stray.rows[0].n > 0) throw new Error(`${stray.rows[0].n} boundaries on other places under ${scopes.join(", ")}`);
```

Nothing else in `stageWave` changes: `rowValues` and `loadStageInputs` already take each AVA's artifact and raw file from its own `ucd.state`, so the WA, OR and NY files are read and pinned as they were for US-2.

In `stage-usa-ava.mjs`, change the usage comment's `--wave <us2|us3-core|us3-rest>` to `--wave <us2|us3-core|us3-rest|us4>`, and replace the dry run's previous-wave refusal with:

```js
    if (wave.priorPromote && !(await recordedIn(wave.priorPromote))) {
      const rehearse = wave.name === "us4" ? "scripts/usa-map/rehearse-us4.mjs" : `scripts/usa-map/rehearse-us3.mjs --batch ${wave.batch}`;
      throw new Error(`the previous wave's promote ${wave.priorPromote} is not live: rehearse ${wave.name} with ${rehearse} instead`);
    }
```

- [ ] **Step 3: Run.** `node --test scripts/wine-map-sources/usa-stage-lib.test.mjs` → PASS. `npx eslint scripts/wine-map-sources/usa-stage-lib.mjs scripts/wine-map-sources/stage-usa-ava.mjs` → clean.
- [ ] **Step 4: Read-only proofs.**
  - `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us4 --check-gate`. Expected: exit 1, `REFUSED` with exactly "catalog migration 20260930224747 is not recorded live" and "knowledge migration 20260930234747 is not recorded live" (the owner approval is present, the US-2 promote is live, nothing is staged).
  - `… --wave us5`. Expected: exit 2, the usage line listing `us2|us3-core|us3-rest|us4`.
- [ ] **Step 5: The dry run** (activity check first; it applies the catalog and the knowledge in-transaction, so one refresh, about 1–2 minutes):
  `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us4`.
  Expected: `wave us4: 42 places; inputs pinned; raw files NY_avas.geojson, OR_avas.geojson, WA_avas.geojson match their pins`; two "applied … in-transaction" lines; 42 `STAGED-DRY united-states.… ucd …` lines, each with `share` ≥ 0.9996, a `drift` under 0.002 and `parent` at or above its floor (the six places directly under a state show `parent -`; Candy Mountain shows `parent 0.893096`); then `DONE (dry): 42 boundaries built and asserted for us4, persisted nothing.` Record the lowest measured-basis `parent` (expected Red Mountain, 0.995035) and the highest drift (expected Snipes Mountain, about 0.0012) for the runbook.
- [ ] **Step 6: Commit** "feat(wine-map-sources): stageWave over a list of scope keys; stage-usa-ava.mjs --wave us4; the US-4 dry run (42 boundaries, persisted nothing)". Put the measured numbers in the body.

---

### Task 11: The promote migration

**Files:**
- Modify: `scripts/usa-map/render-us4-sql.mjs` (add `promoteSql`; `renderAll` gains the promote)
- Create (rendered): `supabase/migrations/20261001004747_usa_us4_promote.sql`
- Test: `scripts/usa-map/us4-sql.test.mjs`

**Interfaces:**
- Consumes: the wave (Task 2): `places` (with `legal_states`, `map_state`), `parentChecks`, `outlineKeys`, `edges` (with `basis`, `share`, `ratio`), `priorKeys`, `crossState`, `deferred`, `ucd`, `after`; `STATE_SLUGS` (`us2-wave.mjs`); `STATE_WINDOWS` (`usa-stage-lib.mjs`).
- Produces: `promoteSql(wave) → string`.

- [ ] **Step 1: Add the failing tests** to `us4-sql.test.mjs` (add `promoteSql` to the import):

```js
test("the committed promote migration is exactly the render", async () => {
  assert.equal(lf(await readFile(wave.files.promote, "utf8")), promoteSql(wave));
});

test("promote: shape, asserts, order", () => {
  const sql = promoteSql(wave);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  assert.equal((sql.match(/^ {2}\('united-states\.(washington|oregon|new-york)\.[^']+', '[a-z0-9_]+', (true|false), /gm) ?? []).length, 42);
  assert.equal((sql.match(/^ {2}\('united-states\.(washington|oregon|new-york)\.[^']+', '[a-z0-9_]+', true, /gm) ?? []).length, 1);
  assert.equal((sql.match(/^ {2}\('united-states\.[^']+', 'united-states\.[^']+', 'ALTERNATE_PARENT', /gm) ?? []).length, 4);
  for (const phrase of [
    "an earlier wave is not live", "expected exactly one DRAFT, non-current boundary per place",
    "boundaries on other places under Washington, Oregon or New York", "provenance does not match the stage",
    "outline set is not D15", "not inside its legal states", "not inside its parent AVA", "x.inside < x.parent_min - 0.001",
    "an edge does not match the geometry", "has no complete article", "refresh_wine_place_neighbours refused",
    "not VERIFIED, locked and current", "a cross-state AVA is not exactly one place", "a deferred AVA has a place",
    "a place under a state outside wave 1", "edges not stored exactly once", `expected ${wave.after.scopeEdges}`,
  ]) assert.ok(sql.includes(phrase), phrase);
  const coverage = sql.indexOf("has no complete article");
  const flip = sql.indexOf("set quality_status = 'VALIDATED'");
  const refresh = sql.lastIndexOf("refresh_wine_place_neighbours()");
  assert.ok(coverage < flip && flip < refresh, "asserts, then flip, then refresh");
  assert.ok(!sql.includes("united-states.california"), "Scope: nothing about California");
});

test("Review Focus 2: the state-share edges carry the tree's figure and the 0.01 / 0.005 rule", () => {
  const sql = promoteSql(wave);
  assert.ok(sql.includes("('united-states.washington.columbia-valley.walla-walla-valley', 'united-states.oregon', 'ALTERNATE_PARENT', 'state_share', null, 0.3101,"));
  assert.ok(sql.includes("('united-states.oregon.columbia-gorge', 'united-states.washington', 'ALTERNATE_PARENT', 'state_share', null, 0.348,"));
  assert.ok(sql.includes("('united-states.oregon.the-rocks-district-of-milton-freewater', 'united-states.washington.columbia-valley.walla-walla-valley', 'ALTERNATE_PARENT', 'within', null, null,"));
  assert.match(sql, /- e\.share\) <= 0\.01/);
  assert.match(sql, />= 0\.005/);
  assert.match(sql, /< 0\.899/);
  assert.match(sql, /'\{united-states\.oregon,united-states\.washington\}'/, "Walla Walla Valley and Columbia Gorge are held to both legal states");
});

test("Review Focus 1: Candy Mountain's override floor is the tree's figure less one point", () => {
  assert.ok(promoteSql(wave).includes("('united-states.washington.columbia-valley.yakima-valley.candy-mountain', 'candy_mountain', false, 'united-states.washington.columbia-valley.yakima-valley', 0.883, '{united-states.washington}',"));
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`promoteSql` is not exported).

- [ ] **Step 3: Implement.** In `render-us4-sql.mjs`, add `import { STATE_SLUGS } from "./us2-wave.mjs";` (extend the existing import), `import { STATE_WINDOWS } from "../wine-map-sources/usa-stage-lib.mjs";`, and above `renderAll`:

```js
export function promoteSql(wave) {
  const tag = "US-4 promote";
  const n = wave.places.length;
  const checks = new Map(wave.parentChecks.map((c) => [c.key, c]));
  const stateKeyOf = (code) => {
    if (!STATE_SLUGS[code]) throw new Error(`legal state ${code} is not a wave state`);
    return `united-states.${STATE_SLUGS[code]}`;
  };
  const rows = wave.places.map((p) => {
    const w = STATE_WINDOWS[p.map_state];
    return `  (${[
      sq(p.key), sq(p.ucd_ava_id), bool(wave.outlineKeys.includes(p.key)), sq(p.parent_key),
      checks.has(p.key) ? num(checks.get(p.key).min) : "null", `'{${p.legal_states.map(stateKeyOf).sort().join(",")}}'`,
      num(w.minLon), num(w.minLat), num(w.maxLon), num(w.maxLat),
    ].join(", ")})`;
  }).join(",\n");
  const prior = wave.priorKeys.map((k) => `  (${sq(k)})`).join(",\n");
  const stateName = (k) => wave.states.find((s) => k === s.key || k.startsWith(`${s.key}.`))?.name;
  const edges = wave.edges.map((e) => `  (${[
    sq(e.source_key), sq(e.target_key), sq(e.type), sq(e.basis),
    e.ratio != null ? num(e.ratio) : "null", e.share != null ? num(e.share) : "null",
    sq(`US-4, ${stateName(e.source_key)} tree report: basis ${e.basis}${e.share != null ? `, share ${e.share}` : ""}${e.ratio != null ? `, ratio ${e.ratio}` : ""}`),
  ].join(", ")})`).join(",\n");
  const perState = wave.states.map((s) => `(${sq(s.key)}, ${wave.after.perState[s.code].places}, ${wave.after.perState[s.code].ava})`).join(", ");
  const oneEach = [...new Set([...wave.ucd.map((u) => u.ucd_ava_id), ...wave.crossState.map((c) => c.ucd_ava_id)])].sort().map(sq).join(", ");
  const deferred = wave.deferred.map(sq).join(", ");
  const outlineCount = wave.outlineKeys.length;
  return `-- USA on the wine map, phase US-4: the promote (spec §8.4, §15 US-4;
-- plan ${PLAN} Task 11).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the ${n} AVAs
-- of Washington, Oregon and New York to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the wave's ${wave.edges.length} edges (§8.3). The cross-state
-- rules (D6, D14) are re-checked on the stored geometry: every AVA lies inside
-- its legal states, and every state edge carries the tree's land share. Checks
-- read only the three states' keys, and the country outline as land, so
-- California is never read. Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: the US-2 promote ${wave.priorPromote} is live; stage-usa-ava.mjs
-- --wave us4 --stage has committed one DRAFT, non-current boundary per place;
-- ${wave.versions.catalog} and ${wave.versions.knowledge} are applied.
-- Rendered by scripts/usa-map/render-us4-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us4_promote, pg_temp._us4_prior, pg_temp._us4_edges, pg_temp._us4_staged, pg_temp._us4_geom;
create temp table _us4_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision, legal_keys text[] not null,
  min_lon double precision not null, min_lat double precision not null,
  max_lon double precision not null, max_lat double precision not null
) on commit drop;
insert into _us4_promote values
${rows};
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
${prior};
create temp table _us4_edges (
  source_key text not null, target_key text not null, type public.wine_place_relationship_type not null,
  basis text not null, ratio double precision, share double precision, note text not null
) on commit drop;
insert into _us4_edges values
${edges};

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception '${tag}: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception '${tag}: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave us4 --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${SCOPE_WHERE("p")}
     and p.canonical_key not in (select key from _us4_promote union all select key from _us4_prior);
  if v_text is not null then raise exception '${tag}: boundaries on other places under Washington, Oregon or New York: %', v_text; end if;
end $$;

create temp table _us4_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us4_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this wave's staged boundary, else US-2's current one
-- (the country, the three states and their umbrella AVAs).
create temp table _us4_geom on commit drop as
select key, g from _us4_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us4_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_country extensions.geometry; v_land extensions.geometry; r record;
begin
  select count(*) into n from _us4_staged;
  if n <> ${n} then raise exception '${tag}: % staged rows, expected ${n}', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception '${tag}: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between min_lon and max_lon
      or extensions.ST_Y(label_point) not between min_lat and max_lat;
  if v_text is not null then raise exception '${tag}: invalid geometry or label outside its state''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception '${tag}: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us4_staged where gp->>'display' = 'outline';
  if n <> ${outlineCount} then raise exception '${tag}: % outline places, expected ${outlineCount}', n; end if;

  -- §8.2 state containment, on land and buffered, against each AVA's legal (TTB)
  -- states' live outlines (plan decision 5).
  select g into v_country from _us4_geom where key = 'united-states';
  if v_country is null then raise exception '${tag}: the United States outline is not live'; end if;
  v_land := extensions.ST_Buffer(v_country, 0.05);
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us4_geom st where st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us4_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception '${tag}: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with US-3's
  -- measured simplification slack (US-4 measured at most 0.000284).
  select count(*) into n from _us4_staged s
   where s.parent_min is not null and not exists (select 1 from _us4_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception '${tag}: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us4_staged s join _us4_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception '${tag}: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 4). A state edge: the source's
  -- unbuffered land share in the target state, within 0.01 of the tree's and at
  -- least 0.005. A containment edge: >= 0.899 inside its target.
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
    left join _us4_geom a on a.key = e.source_key
    left join _us4_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and not coalesce(abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) <= 0.01, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis = 'state_share'
          and not coalesce(
            abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) - e.share) <= 0.01
            and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) >= 0.005, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis <> 'state_share'
          and not coalesce(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) >= 0.899, false));
  if v_text is not null then raise exception '${tag}: an edge does not match the geometry: %', v_text; end if;
  for r in select e.source_key, e.target_key, e.share,
                  extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) as measured
             from _us4_edges e join _us4_geom a on a.key = e.source_key join _us4_geom b on b.key = e.target_key
            where e.basis = 'state_share' order by e.source_key loop
    raise notice '${tag}: state share % in % %, tree %', r.source_key, r.target_key, round(r.measured::numeric, 4), r.share;
  end loop;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
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

-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us4_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us4_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us4_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK(tag)}
-- 6. Post-state.
do $$
declare n int; v_text text; r record;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED, locked and current: %', v_text; end if;
  for r in select * from (values ${perState}) e(state_key, live, ava) loop
    select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
    if n <> r.live then raise exception '${tag}: % live places under %, expected %', n, r.state_key, r.live; end if;
    select count(*) into n from public.wine_places p
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
    if n <> r.ava then raise exception '${tag}: % VERIFIED AVA places under %, expected %', n, r.state_key, r.ava; end if;
  end loop;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where ${SCOPE_WHERE("p")} and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception '${tag}: % DRAFT boundaries left under Washington, Oregon or New York', n; end if;
  select count(*) into n from public.wine_place_relationships rel
    join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
   where ${SCOPE_WHERE("s")} or ${SCOPE_WHERE("t")};
  if n <> ${wave.after.scopeEdges} then raise exception '${tag}: % relationships under the three states, expected ${wave.after.scopeEdges}', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
   where (select count(*) from public.wine_place_relationships rel
            join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and rel.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception '${tag}: edges not stored exactly once: %', v_text; end if;

  -- D6/D14: one place per AVA of this wave and per cross-state AVA; nothing
  -- deferred (Idaho, Ohio) placed; no key under a state outside wave 1.
  select string_agg(format('%s=%s', x.id, x.n), ', ') into v_text from (
    select f.id, (select count(*)::int from public.wine_place_boundaries b
                    join public.wine_boundary_source_snapshots ss on ss.id = b.source_snapshot_id
                    join public.wine_boundary_sources so on so.id = ss.source_id
                   where b.is_current and so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = f.id) n
      from unnest(array[${oneEach}]::text[]) f(id)) x
   where x.n <> 1;
  if v_text is not null then raise exception '${tag}: a cross-state AVA is not exactly one place (current UC Davis boundaries per AVA): %', v_text; end if;
  select string_agg(so.source_feature_id, ', ') into v_text
    from public.wine_boundary_sources so
    join public.wine_boundary_source_snapshots ss on ss.source_id = so.id
    join public.wine_place_boundaries b on b.source_snapshot_id = ss.id
   where so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = any(array[${deferred}]::text[]);
  if v_text is not null then raise exception '${tag}: a deferred AVA has a place: %', v_text; end if;
  select string_agg(canonical_key, ', ' order by canonical_key) into v_text from public.wine_places
   where canonical_key like 'united-states.%' and split_part(canonical_key, '.', 2) not in ('california', 'washington', 'oregon', 'new-york');
  if v_text is not null then raise exception '${tag}: a place under a state outside wave 1: %', v_text; end if;

  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception '${tag}: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
`;
}
```

and add `[wave.files.promote]: promoteSql(wave),` to `renderAll`.

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us4-sql.mjs` then `node --test scripts/usa-map/us4-sql.test.mjs`. Expected: PASS (6 tests).
- [ ] **Step 5: Prove the promote refuses before a stage** (activity check first; the catalog and knowledge are not live, so this proves only that the file parses and refuses at the earliest assert): `APPLIER=… && node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20261001004747_usa_us4_promote.sql --check` → `PREFLIGHT OK`; then `--dry` → FAILED (rolled back) with `US-4 promote: missing or not DRAFT: united-states.new-york.champlain-valley-of-new-york, …`. The full promote runs in the rehearsal (Task 15).
- [ ] **Step 6: Commit** the renderer, the test and the migration: "feat(usa-map): US-4 promote (cross-state containment and state-share edges re-checked, one place per AVA, refresh) (not applied)".

---

### Task 12: The three rollback files

**Files:**
- Modify: `scripts/usa-map/render-us4-sql.mjs` (add `unstageSql`, `removeSql`, `unpublishSql`; `renderAll` gains them)
- Create (rendered): `scripts/usa-map/usa_us4_unstage.sql`, `scripts/usa-map/usa_us4_remove.sql`, `scripts/usa-map/usa_us4_unpublish.sql`
- Test: `scripts/usa-map/us4-sql.test.mjs`

**Interfaces:**
- Consumes: the wave (`places`, `priorKeys`, `versions`, `rollbackFiles`); `inScope` (Task 2); `rollbackRefusal` from `apply-rollback.mjs` (unchanged: it accepts `scripts/usa-map/usa_us4_*.sql`).
- Produces: `unstageSql(wave)`, `removeSql(wave)`, `unpublishSql(wave)`.

- [ ] **Step 1: Add the failing test** (add `renderAll` to the import from `./render-us4-sql.mjs`, and `import { rollbackRefusal } from "./apply-rollback.mjs";`):

```js
test("rollbacks: committed = render, no transaction statements, own pre-state, refresh last, scope only", async () => {
  const all = renderAll(wave);
  for (const [what, path] of Object.entries(wave.rollbackFiles)) {
    assert.equal(rollbackRefusal(path), null, `${path} is a US rollback file name`);
    assert.equal(lf(await readFile(path, "utf8")), all[path], path);
    assert.deepEqual(topLevelTransactionStatements(all[path]), [], path);
    assert.ok(!all[path].includes("united-states.california"), `${what}: nothing about California`);
    const tail = all[path].slice(all[path].lastIndexOf("do $$"));
    assert.match(tail, /refresh_wine_place_neighbours\(\)/, `${what}: refresh last`);
  }
  const [un, rm, up] = ["unstage", "remove", "unpublish"].map((w) => all[wave.rollbackFiles[w]]);
  assert.match(un, /US-4 unstage: missing or not DRAFT \(after the promote, use the unpublish file\)/);
  assert.match(rm, /keys are locked \(the promote ran\)/);
  assert.match(rm, /other places under Washington, Oregon or New York exist \(remove the later wave first\)/);
  assert.ok(rm.includes(`delete from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}')`));
  assert.ok(rm.indexOf("keys are locked") < rm.indexOf("other places under"), "the lock message comes first");
  assert.match(up, /a later wave is live under Washington, Oregon or New York \(unpublish it first\)/);
  assert.match(up, /a typical wine is placed on this wave \(re-point it first\)/);
  for (const sql of [un, rm, up]) assert.equal((sql.match(/^ {2}\('united-states\.(washington|oregon|new-york)\.[^']+', \d+\)/gm) ?? []).length, 42);
});
```

- [ ] **Step 2: Run.** Expected: FAIL (no rollback renderers, no files).

- [ ] **Step 3: Implement.** In `render-us4-sql.mjs`, add `inScope` to the import from `./us4-wave.mjs`, and above `renderAll`:

```js
// --- Rollbacks (spec §16, §25). scripts/usa-map/, unversioned, run with
// apply-rollback.mjs (--check, --dry, then no flag); re-appliable, each asserts
// its own pre-state. They work on exactly the wave's 42 keys.
function rbPrelude(wave) {
  const rows = wave.places.map((p) => `  (${sq(p.key)}, ${depthOf(p.key)})`).join(",\n");
  const known = [...wave.priorKeys.filter(inScope), ...wave.places.map((p) => p.key)].map((k) => `  (${sq(k)})`).join(",\n");
  return `set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us4_rb, pg_temp._us4_known;
create temp table _us4_rb (key text primary key, depth int not null) on commit drop;
insert into _us4_rb values
${rows};
-- Every key under the three states this wave knows about (US-2's and its own).
create temp table _us4_known (key text primary key) on commit drop;
insert into _us4_known values
${known};
`;
}

const rbHeader = (title, body) => `-- USA on the wine map, phase US-4 ROLLBACK: ${title} (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- ${PLAN} Task 12).
--
${body.trim().split("\n").map((l) => (l ? `-- ${l}` : "--")).join("\n")}
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Touches only keys under Washington,
-- Oregon and New York. Rendered by scripts/usa-map/render-us4-sql.mjs; do not
-- hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

`;

export function unstageSql(wave) {
  const tag = "US-4 unstage";
  const n = wave.places.length;
  return `${rbHeader("unstage (after --stage, before the promote)", `
Removes the ${n} DRAFT, non-current boundaries stage-usa-ava.mjs --wave us4
--stage committed, and nothing else: the places, their knowledge and the
source snapshots stay (snapshots are immutable; a re-stage reuses them). Ends
with the checked neighbour refresh, which brings the cache and master's
map-data checks back to green.`)}${rbPrelude(wave)}
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT (after the promote, use the unpublish file): %', v_text; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb) and (b.is_current or b.quality_status <> 'DRAFT');
  if n <> 0 then raise exception '${tag}: % boundaries on this wave are current or not DRAFT', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb) and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> ${n} then raise exception '${tag}: % DRAFT non-current boundaries on this wave, expected ${n}', n; end if;
end $$;

delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us4_rb)
   and b.quality_status = 'DRAFT' and not b.is_current;

do $$
declare n int;
begin
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb);
  if n <> 0 then raise exception '${tag}: % boundaries left on this wave', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us4_rb) and p.publication_status = 'DRAFT';
  if n <> ${n} then raise exception '${tag}: % DRAFT places, expected ${n}', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function removeSql(wave) {
  const tag = "US-4 remove";
  const n = wave.places.length;
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => b - a);
  const deletes = depths.map((d) => `delete from public.wine_places p
 using _us4_rb e
 where p.canonical_key = e.key and e.depth = ${d};`).join("\n");
  return `${rbHeader("remove (abandon the wave before its promote)", `
Deletes the ${n} places of the wave (deepest first), their relationships,
boundaries and knowledge (articles, styles and grapes cascade), and the
catalog (${wave.versions.catalog}) and knowledge (${wave.versions.knowledge}) history rows,
so both apply again as committed. Refuses once the promote has run (keys lock
for good; use the unpublish file), and while any other place under Washington,
Oregon or New York exists outside US-2 and this wave (remove the later wave
first). Keeps the source snapshots (immutable; a re-stage reuses them) and the
new grape rows (shared reference rows; the knowledge migration re-applies over
them with on conflict (name) do nothing).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  -- The lock check first, so after a promote this is always the message.
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join _us4_rb e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if v_text is not null then
    raise exception '${tag}: keys are locked (the promote ran): use the unpublish file instead (%)', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${SCOPE_WHERE("p")} and p.canonical_key not in (select key from _us4_known);
  if v_text is not null then raise exception '${tag}: other places under Washington, Oregon or New York exist (remove the later wave first): %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
end $$;

delete from public.wine_place_relationships r
 using public.wine_places p
 where p.canonical_key in (select key from _us4_rb)
   and (r.source_place_id = p.id or r.target_place_id = p.id);
delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us4_rb);
${deletes}
delete from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}');

do $$
declare n int;
begin
  select count(*) into n from public.wine_places where canonical_key in (select key from _us4_rb);
  if n <> 0 then raise exception '${tag}: % places of this wave left', n; end if;
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

export function unpublishSql(wave) {
  const tag = "US-4 unpublish";
  const n = wave.places.length;
  return `${rbHeader("unpublish (a roll forward after the promote)", `
Takes the ${n} places of the wave off the map without touching their locked
keys: every boundary of the wave non-current and every place DRAFT, then the
checked refresh. Boundaries, relationships and knowledge stay. Refuses while a
later wave is live under the three states (unpublish it first), and while any
typical wine is placed on a US-4 place (none is, plan decision 10: re-point it
first).
THEN, on master: splice-boundary-expectations.mjs --write (it keeps only the
current united-states rows, so this wave's rows leave the hunk); git diff must
show only removed united-states rows; commit and push it as a staged push.
THEN DISPATCH A NEW TILES RELEASE FROM MASTER (promote=true), and never roll
back the manifest (§17.3).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED with one current boundary: %', v_text; end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${SCOPE_WHERE("p")} and p.canonical_key not in (select key from _us4_known)
     and (p.publication_status = 'VERIFIED'
          or exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current));
  if v_text is not null then raise exception '${tag}: a later wave is live under Washington, Oregon or New York (unpublish it first): %', v_text; end if;
  select string_agg(a.name, ', ' order by a.name) into v_text
    from public.wine_archetypes a
   where a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us4_rb))
      or exists (select 1 from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
                  where x.archetype_id = a.id and p.canonical_key in (select key from _us4_rb));
  if v_text is not null then
    raise exception '${tag}: a typical wine is placed on this wave (re-point it first): %', v_text;
  end if;
end $$;

update public.wine_place_boundaries b
   set is_current = false
  from public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us4_rb) and b.is_current;
update public.wine_places p
   set publication_status = 'DRAFT', updated_at = now()
 where p.canonical_key in (select key from _us4_rb);

do $$
declare n int;
begin
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us4_rb) and p.publication_status = 'VERIFIED';
  if n <> 0 then raise exception '${tag}: % VERIFIED places of this wave left', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb) and b.is_current;
  if n <> 0 then raise exception '${tag}: % current boundaries left', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us4_rb) and p.canonical_key_locked_at is not null;
  if n <> ${n} then raise exception '${tag}: % of ${n} keys still locked (they never unlock)', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}
```

and extend `renderAll`:

```js
export function renderAll(wave) {
  return {
    [wave.files.catalog]: catalogSql(wave),
    [wave.files.promote]: promoteSql(wave),
    [wave.rollbackFiles.unstage]: unstageSql(wave),
    [wave.rollbackFiles.remove]: removeSql(wave),
    [wave.rollbackFiles.unpublish]: unpublishSql(wave),
  };
}
```

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us4-sql.mjs`; `node --test scripts/usa-map/us4-sql.test.mjs` → PASS (7 tests); `node --test scripts/usa-map/apply-rollback.test.mjs` → PASS.
- [ ] **Step 5: Prove each refuses against today's live state** (read-only in effect: each `--dry` rolls back; activity check first):

```bash
cd C:/Users/Public/repos/blindtastingapp-map && for f in unstage remove unpublish; do node --env-file=.env.local scripts/usa-map/apply-rollback.mjs scripts/usa-map/usa_us4_$f.sql --check && node --env-file=.env.local scripts/usa-map/apply-rollback.mjs scripts/usa-map/usa_us4_$f.sql --dry; done
```

Expected: three `PREFLIGHT OK`; the unstage and the remove FAIL (rolled back) with "missing or not DRAFT" (no US-4 place exists yet); the unpublish FAILS with "not VERIFIED with one current boundary". None reaches a refresh.
- [ ] **Step 6: Commit** the renderer, the test and the three files: "feat(usa-map): US-4 rollback files (unstage, remove, unpublish), scoped to the three states (not applied)".

---
### Task 13: The US-4 checks, and the read-only live check

**Files:**
- Create: `scripts/usa-map/us4-checks.mjs`, `scripts/usa-map/check-us4-live.mjs`
- Test: `scripts/usa-map/us4-checks.test.mjs`

**Interfaces:**
- Consumes: `placeDetails`, `clickResolution` from `us3-checks.mjs` (generic, unchanged); `asAuthenticated`-based `shortlists`, `archetypeFacts`, `archetypeProblems`, `expectationRows` from `us2-checks.mjs`; `compareHunk` from `splice-boundary-expectations.mjs`; `SCOPE_KEYS` (Task 2).
- Produces: `NEARBY_KEYS`, `CLICK_KEYS`, `CHILDREN`, `EXPECTED_EDGES`, `WILLAMETTE_ID`, `willametteLink()`, `scopeRelationships(client)`, `waveFacts(client, wave)`, `promotedFacts(wave)`, and re-exports `placeDetails`, `clickResolution`; the CLI `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs`.

- [ ] **Step 1: Write the failing test** `scripts/usa-map/us4-checks.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { CHILDREN, CLICK_KEYS, EXPECTED_EDGES, NEARBY_KEYS, promotedFacts, willametteLink } from "./us4-checks.mjs";
import { loadWave } from "./waves.mjs";

const wave = await loadWave("us4");
const trees = await loadTrees();
const places = Object.values(trees).flatMap((t) => t.places);
const known = new Set([...wave.priorKeys, ...wave.places.map((p) => p.key)]);

test("every key a check names is a known place; the edges are the wave's four plus Columbia Valley's", () => {
  for (const k of [...NEARBY_KEYS, ...CLICK_KEYS, ...Object.keys(CHILDREN)]) assert.ok(known.has(k), k);
  for (const k of [...NEARBY_KEYS, ...CLICK_KEYS]) assert.ok(wave.places.some((p) => p.key === k), `${k} is a US-4 place`);
  const all = Object.values(trees).flatMap((t) => t.edges);
  for (const e of EXPECTED_EDGES) {
    assert.ok(all.some((x) => x.type === e.type && x.source_key === e.source && x.target_key === e.target), JSON.stringify(e));
  }
  assert.equal(EXPECTED_EDGES.length, wave.after.scopeEdges);
});

test("children counts are the tree's (Finger Lakes and Long Island hold their two sub-AVAs)", () => {
  for (const [k, n] of Object.entries(CHILDREN)) {
    assert.equal([...known].filter((x) => places.find((p) => p.key === x)?.parent_key === k).length, n, k);
  }
  assert.equal(CHILDREN["united-states.new-york.finger-lakes"], 2);
  assert.equal(CHILDREN["united-states.new-york.long-island"], 2);
});

test("the promoted state", () => {
  assert.deepEqual(promotedFacts(wave), {
    places: 42, verified: 42, locked: 42, current_validated: 42, draft_boundaries: 0,
    live: { NY: 11, OR: 21, WA: 19 }, scope_relationships: 5, us_outline: 12,
    cross_state: { columbia_gorge: 1, columbia_valley: 1, walla_walla_valley: 1 }, deferred: 0, other_states: 0, fresh: true,
  });
});

test("decision 10: the Willamette typical wine is US-2's link, unchanged", async () => {
  const l = await willametteLink();
  assert.deepEqual([l.name, l.home, [...l.placements].sort()], ["A typical Willamette Pinot Noir",
    "united-states.oregon.willamette-valley", ["united-states.oregon", "united-states.oregon.willamette-valley"]]);
});
```

- [ ] **Step 2: Run.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/us4-checks.mjs`:

```js
// The checks rehearse-us4.mjs (one rolled-back transaction) and
// check-us4-live.mjs (read only) share, so the sitting checks exactly what the
// rehearsal proved. Every function writes nothing, and reads only the three
// states' keys (plus the whole catalogue for "no key under another state").
import { readFile } from "node:fs/promises";
import { SCOPE_KEYS } from "./us4-wave.mjs";

export { clickResolution, placeDetails } from "./us3-checks.mjs";

const W = "united-states.washington.";
const O = "united-states.oregon.";
const N = "united-states.new-york.";
const SCOPE = (a) => `(${SCOPE_KEYS.map((k) => `${a}.canonical_key = '${k}' or ${a}.canonical_key like '${k}.%'`).join(" or ")})`;

// §8.7: the nearby lists the main session accepts (the spec's US-4 six, plus
// Columbia Gorge and Candy Mountain).
export const NEARBY_KEYS = Object.freeze([
  `${O}willamette-valley.dundee-hills`, `${O}the-rocks-district-of-milton-freewater`, `${O}columbia-gorge`,
  `${W}columbia-valley.walla-walla-valley`, `${W}columbia-valley.yakima-valley.red-mountain`,
  `${W}columbia-valley.yakima-valley.candy-mountain`,
  `${N}finger-lakes.seneca-lake`, `${N}long-island.north-fork-of-long-island`,
]);
// A click on these selects them, not a container (smallest area wins; The Rocks
// District lies inside Walla Walla Valley, which is in another shard).
export const CLICK_KEYS = Object.freeze([
  `${W}columbia-valley.yakima-valley.red-mountain`, `${W}columbia-valley.yakima-valley.candy-mountain`,
  `${W}columbia-valley.yakima-valley.snipes-mountain`,
  `${O}the-rocks-district-of-milton-freewater`, `${O}willamette-valley.chehalem-mountains.ribbon-ridge`,
  `${O}willamette-valley.dundee-hills`,
  `${N}finger-lakes.seneca-lake`, `${N}long-island.north-fork-of-long-island`,
]);
// Children the details panel lists (VERIFIED only) after the promote.
export const CHILDREN = Object.freeze({
  "united-states.washington": 2, [`${W}columbia-valley`]: 11, [`${W}columbia-valley.yakima-valley`]: 5, [`${W}puget-sound`]: 0,
  "united-states.oregon": 4, [`${O}willamette-valley`]: 9, [`${O}willamette-valley.chehalem-mountains`]: 2,
  [`${O}southern-oregon`]: 2, [`${O}southern-oregon.rogue-valley`]: 1, [`${O}southern-oregon.umpqua-valley`]: 2,
  "united-states.new-york": 6, [`${N}finger-lakes`]: 2, [`${N}long-island`]: 2,
});
// Every relationship under the three states after the promote (decision 3).
export const EXPECTED_EDGES = Object.freeze([
  { type: "ALTERNATE_PARENT", source: `${W}columbia-valley`, target: "united-states.oregon" },
  { type: "ALTERNATE_PARENT", source: `${W}columbia-valley.walla-walla-valley`, target: "united-states.oregon" },
  { type: "ALTERNATE_PARENT", source: `${O}columbia-gorge`, target: "united-states.washington" },
  { type: "ALTERNATE_PARENT", source: `${O}the-rocks-district-of-milton-freewater`, target: `${W}columbia-valley` },
  { type: "ALTERNATE_PARENT", source: `${O}the-rocks-district-of-milton-freewater`, target: `${W}columbia-valley.walla-walla-valley` },
]);
// Decision 10: the one US typical wine under the three states keeps US-2's link.
export const LINKS_US2_PATH = "data/wine-map/usa-us2-archetype-links.json";
export const WILLAMETTE_ID = "bab8537e-b0bc-4f7c-8547-242537322f8a";
export async function willametteLink(read = (p) => readFile(p, "utf8")) {
  const link = JSON.parse(await read(LINKS_US2_PATH)).links.find((l) => l.archetype_id === WILLAMETTE_ID);
  if (!link) throw new Error(`${LINKS_US2_PATH} has no Willamette link`);
  return link;
}

/** Every relationship with an endpoint under the three states. */
export async function scopeRelationships(client) {
  return (await client.query(
    `select r.relationship_type::text type, s.canonical_key source, t.canonical_key target
       from public.wine_place_relationships r
       join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${SCOPE("s")} or ${SCOPE("t")} order by 2, 3, 1`)).rows;
}

/** The wave's state, the three states', and the cross-state facts (D6, D14). */
export async function waveFacts(client, wave) {
  const keys = wave.places.map((p) => p.key);
  const n = async (sql, params = []) => Number((await client.query(sql, params)).rows[0].n);
  const onKeys = "from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])";
  const perAva = async (ids) => Object.fromEntries((await client.query(
    `select f.id, (select count(*)::int from public.wine_place_boundaries b
                    join public.wine_boundary_source_snapshots ss on ss.id = b.source_snapshot_id
                    join public.wine_boundary_sources so on so.id = ss.source_id
                   where b.is_current and so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = f.id) n
       from unnest($1::text[]) f(id) order by f.id`, [ids])).rows.map((r) => [r.id, r.n]));
  const live = {};
  for (const s of wave.states) {
    live[s.code] = await n(`select count(*) n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
      where (p.canonical_key = $1 or p.canonical_key like $1 || '.%') and p.publication_status = 'VERIFIED'
        and b.is_current and b.quality_status = 'VALIDATED'`, [s.key]);
  }
  return {
    places: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[])", [keys]),
    verified: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and publication_status = 'VERIFIED'", [keys]),
    locked: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and canonical_key_locked_at is not null", [keys]),
    current_validated: await n(`select count(*) n ${onKeys} and b.is_current and b.quality_status = 'VALIDATED'`, [keys]),
    draft_boundaries: await n(`select count(*) n ${onKeys} and b.quality_status = 'DRAFT'`, [keys]),
    live,
    scope_relationships: await n(`select count(*) n from public.wine_place_relationships r
      join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${SCOPE("s")} or ${SCOPE("t")}`),
    us_outline: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
        and b.is_current and b.generation_parameters->>'display' = 'outline'`),
    cross_state: await perAva(wave.crossState.map((c) => c.ucd_ava_id)),
    deferred: Object.values(await perAva(wave.deferred)).reduce((a, x) => a + x, 0),
    other_states: await n(`select count(*) n from public.wine_places where canonical_key like 'united-states.%'
      and split_part(canonical_key, '.', 2) not in ('california', 'washington', 'oregon', 'new-york')`),
    fresh: (await client.query("select fresh from public.wine_place_neighbours_state")).rows[0].fresh,
  };
}

/** The promoted state US-4 must reach (rehearsal and live check alike). */
export const promotedFacts = (wave) => ({
  places: wave.places.length, verified: wave.places.length, locked: wave.places.length,
  current_validated: wave.places.length, draft_boundaries: 0,
  live: Object.fromEntries(wave.states.map((s) => [s.code, wave.after.perState[s.code].places])),
  scope_relationships: wave.after.scopeEdges, us_outline: 12,
  cross_state: Object.fromEntries(wave.crossState.map((c) => [c.ucd_ava_id, 1])),
  deferred: 0, other_states: 0, fresh: true,
});
```

`scripts/usa-map/check-us4-live.mjs`:

```js
// The read-only US-4 check (plan 2026-09-30-usa-wine-map-us4 Task 13). One
// `begin read only` ... `rollback` transaction; writes nothing. It says which
// state live is in: not started; catalog applied (DRAFT, maybe staged);
// promoted, where it runs the rehearsal's checks against live.
//
//   node --env-file=.env.local scripts/usa-map/check-us4-live.mjs
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { compareHunk } from "./splice-boundary-expectations.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, shortlists } from "./us2-checks.mjs";
import {
  CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, placeDetails, promotedFacts, scopeRelationships, waveFacts, willametteLink,
} from "./us4-checks.mjs";
import { loadWave } from "./waves.mjs";

if (process.argv.length > 2) { console.error("usage: check-us4-live.mjs"); process.exit(2); }
const wave = await loadWave("us4");
const link = await willametteLink();
const EXPECTED_PATH = "data/wine-map/review/usa-us4-expected-boundaries.json";
const LEADS = { Washington: "Cabernet Sauvignon", Oregon: "Pinot Noir", "New York": "Riesling" };
const problems = [];
let promoted = false;

await withReadOnly(async (c) => {
  const recorded = async (v) => (await c.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const versions = {};
  for (const [what, v] of Object.entries(wave.versions)) versions[what] = await recorded(v);
  const f = await waveFacts(c, wave);
  console.log(`recorded: ${JSON.stringify(versions)}`);
  console.log(`facts: ${JSON.stringify(f)}`);
  problems.push(...archetypeProblems(await archetypeFacts(c, [link]), [link]));
  if (f.other_states !== 0 || f.deferred !== 0) problems.push(`other_states ${f.other_states}, deferred ${f.deferred}: expected 0 and 0`);
  if (f.places === 0) {
    if (versions.catalog) problems.push("the catalog is recorded but no place of this wave exists");
    console.log("US-4: not started");
    return;
  }
  if (f.verified === 0) {
    if (f.places !== wave.places.length) problems.push(`${f.places} places, expected ${wave.places.length}`);
    if (!versions.catalog) problems.push("places exist but the catalog is not recorded");
    if (f.draft_boundaries === 0 && !f.fresh) problems.push("the neighbour cache is stale with nothing staged");
    console.log(`US-4: ${f.places} DRAFT places; staged boundaries ${f.draft_boundaries}; knowledge recorded ${versions.knowledge} (not promoted yet)`);
    return;
  }
  promoted = true;
  for (const [key, v] of Object.entries(promotedFacts(wave))) {
    if (!isDeepStrictEqual(f[key], v)) problems.push(`${key} = ${JSON.stringify(f[key])}, expected ${JSON.stringify(v)}`);
  }
  if (!versions.promote) problems.push("places are VERIFIED but the promote is not recorded");

  const details = await placeDetails(c, wave.places.map((p) => p.key));
  for (const [key, d] of Object.entries(details)) if (!d || !d.article || d.grapes === 0 || d.styles === 0) problems.push(`${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(c, Object.keys(CHILDREN));
  for (const [key, want] of Object.entries(CHILDREN)) if (kids[key]?.children !== want) problems.push(`${key} has ${kids[key]?.children} children, expected ${want}`);
  const rels = await scopeRelationships(c);
  if (rels.length !== wave.after.scopeEdges) problems.push(`${rels.length} relationships under the three states, expected ${wave.after.scopeEdges}`);
  for (const e of EXPECTED_EDGES) if (!rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target)) problems.push(`missing ${JSON.stringify(e)}`);
  for (const r of await clickResolution(c, CLICK_KEYS)) if (r.resolved !== r.key) problems.push(`a click on ${r.key} selects ${r.resolved}`);
  const sl = await shortlists(c);
  for (const [state, lead] of Object.entries(LEADS)) {
    if (sl[state].source !== "map") problems.push(`${state}'s shortlist comes from ${sl[state].source}`);
    if (sl[state].grapes[0] !== lead) problems.push(`${state}'s shortlist leads with ${sl[state].grapes[0]}, not ${lead}`);
    console.log(`${state} shortlist: ${sl[state].grapes.join(", ")}`);
  }

  const expected = JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  const off = compareHunk(expected, await expectationRows(c));
  if (off.length) problems.push(`boundary expectations differ from ${EXPECTED_PATH}: ${off.join(", ")}`);
});

if (problems.length) {
  console.error(`US-4 LIVE CHECK FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(promoted ? "US-4 LIVE CHECK OK" : "US-4 LIVE CHECK: not promoted yet; the state above is consistent");
}
```

- [ ] **Step 4: Run.** `node --test scripts/usa-map/us4-checks.test.mjs` → PASS (4 tests). Then the live check read-only: `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs`. Expected: `facts: {"places":0,…,"live":{"NY":3,"OR":3,"WA":3},"scope_relationships":1,"us_outline":11,"cross_state":{"columbia_gorge":0,"columbia_valley":1,"walla_walla_valley":0},"deferred":0,"other_states":0,"fresh":true}`, `US-4: not started`, `US-4 LIVE CHECK: not promoted yet; the state above is consistent` (the Willamette wine reads as US-2 left it).
- [ ] **Step 5: Commit** "feat(usa-map): US-4 checks (children, edges, clicks, cross-state facts, the Willamette wine) and the read-only live check".

---

### Task 14: The rehearsal script

**Files:**
- Create: `scripts/usa-map/rehearse-us4.mjs`

**Interfaces:**
- Consumes: `loadWave` ("us4", "us2"); `loadStageInputs`, `stageWave` (Task 10); `previewRelease` (`export-preview.mjs`); `archetypeFacts`, `archetypeProblems`, `expectationRows`, `exportPreviewRows`, `shortlists` (`us2-checks.mjs`); everything of Task 13.
- Produces: `data/wine-map/review/usa-us4-rehearsal.json` (pre-sitting) or `…-rehearsal-sitting.json` (`--sitting`), and `data/wine-map/review/usa-us4-expected-boundaries.json` (pre-sitting; with `--sitting` it is compared, never written). Fields the review renderer reads: `rehearsed_at`, `shortlist.<state>.{before, after, colours}`, `nearby`, `archetypes.{name, home, placements}`.

- [ ] **Step 1: Write** `scripts/usa-map/rehearse-us4.mjs`:

```js
// US-4's whole chain, rehearsed against live in ONE transaction that is always
// rolled back (plan 2026-09-30-usa-wine-map-us4 Tasks 14-15): catalog ->
// knowledge -> stage -> promote, the refusals, the rollback drills, and the
// read-only checks as a signed-in reader. No commit path: the only terminal
// statement is the rollback in `finally`.
//
// It holds wine_place_neighbours_state's row for its whole run (7 in-transaction
// refreshes, about 9 minutes): run the activity check first, never two at once,
// only as often as the plan says.
//
//   node --env-file=.env.local scripts/usa-map/rehearse-us4.mjs [--sitting]
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { loadStageInputs, stageWave } from "../wine-map-sources/usa-stage-lib.mjs";
import { previewRelease } from "./export-preview.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, exportPreviewRows, shortlists } from "./us2-checks.mjs";
import {
  CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, NEARBY_KEYS, placeDetails, promotedFacts, scopeRelationships,
  waveFacts, willametteLink,
} from "./us4-checks.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const SITTING = argv.includes("--sitting");
if (argv.some((a) => a !== "--sitting")) { console.error("usage: rehearse-us4.mjs [--sitting]"); process.exit(2); }
const wave = await loadWave("us4");
const us2 = await loadWave("us2");
const link = await willametteLink();
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
const head = execSync("git rev-parse HEAD").toString().trim();
const EXPECTED_PATH = "data/wine-map/review/usa-us4-expected-boundaries.json";
const REHEARSAL_PATH = `data/wine-map/review/usa-us4-rehearsal${SITTING ? "-sitting" : ""}.json`;
const REFRESH_LIMIT_S = 300;
const W = "united-states.washington.";
const O = "united-states.oregon.";
// Refusal G's probe: a DRAFT place under New York that no wave knows about.
const PROBE_SQL = `insert into public.wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'us4-rehearsal-probe', 'united-states.new-york.us4-rehearsal-probe', 'US-4 rehearsal probe', 'APPELLATION', 2, 6, 6,
       true, 'AVA', 'regional', 'DRAFT', 999, p.id
  from public.wine_places p where p.canonical_key = 'united-states.new-york'`;

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
const run = async (path) => client.query(await readFile(path, "utf8"));
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
const stage = (label) => stageWave(client, {
  wave, ...stageInputs, revision: releaseVersion(), importer: `scripts/usa-map/rehearse-us4.mjs@${head}`, label, log: () => {},
});
const byName = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

const result = { _generated_by: "scripts/usa-map/rehearse-us4.mjs", wave: "us4", git_head: head };
let expected;
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 2700000");
  result.rehearsed_at = (await q("select now() t"))[0].t.toISOString();

  // 1. Pre-flight.
  assert.ok(await recorded(us2.versions.promote), "the US-2 promote is not live");
  assert.ok(!(await recorded(wave.versions.promote)), "the US-4 promote is already recorded live");
  result.cache_before = (await q("select fresh, built_at from public.wine_place_neighbours_state"))[0];
  result.applied_in_transaction = [];
  const usBefore = (await expectationRows(client)).length;
  assert.equal(usBefore, 166, "166 current united-states boundaries before US-4 (US-0 .. US-3)");
  const before = await step("shortlists_before", () => shortlists(client));
  assert.deepEqual(archetypeProblems(await archetypeFacts(client, [link]), [link]), [], "the Willamette typical wine before US-4");

  // 2. The catalog (a second run refuses) and the knowledge.
  if (!(await recorded(wave.versions.catalog))) {
    await refreshing("catalog", "US-4 catalog", () => run(wave.files.catalog));
    result.applied_in_transaction.push(wave.files.catalog);
  }
  await expectRefusal("P_catalog_twice", /US-4 catalog: its places already exist/, () => run(wave.files.catalog));
  if (!(await recorded(wave.versions.knowledge))) {
    await step("knowledge", () => run(wave.files.knowledge));
    result.applied_in_transaction.push(wave.files.knowledge);
  }
  assert.equal((await waveFacts(client, wave)).places, wave.places.length);

  // 3. Refusals before the stage (Review Focus 3).
  await expectRefusal("G_remove_while_another_place_exists", /other places under Washington, Oregon or New York exist/, async () => {
    await client.query(PROBE_SQL);
    await run(wave.rollbackFiles.remove);
  });
  await expectRefusal("A_promote_before_stage", /expected exactly one DRAFT, non-current boundary per place/, () => run(wave.files.promote));

  // 4. Stage, exactly as the CLI's dry run; a second stage refuses.
  const stageReport = await step("stage", () => stage("STAGED-REHEARSAL"));
  await expectRefusal("C_stage_twice", /united-states boundaries already exist/, () => stage("x"));

  // 5. Drill 1: unstage, re-stage, unstage again (the file is re-appliable).
  const rollbacks = {};
  await client.query("savepoint s1");
  {
    await refreshing("drill_unstage", "US-4 unstage", () => run(wave.rollbackFiles.unstage));
    let f = await waveFacts(client, wave);
    rollbacks.unstage = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage), [0, wave.places.length, true]);
    await step("drill_restage", () => stage("x"));
    await refreshing("drill_unstage_again", "US-4 unstage", () => run(wave.rollbackFiles.unstage));
    f = await waveFacts(client, wave);
    rollbacks.unstage_again = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage_again), [0, wave.places.length, true]);
  }
  await client.query("rollback to savepoint s1");

  // 6. Drill 2: remove, then the catalog and knowledge apply again as committed.
  await client.query("savepoint s2");
  {
    await refreshing("drill_remove", "US-4 remove", () => run(wave.rollbackFiles.remove));
    rollbacks.remove = {
      places: (await waveFacts(client, wave)).places,
      history_rows: (await q("select count(*)::int n from supabase_migrations.schema_migrations where version = any($1)",
        [[wave.versions.catalog, wave.versions.knowledge]]))[0].n,
    };
    assert.deepEqual(Object.values(rollbacks.remove), [0, 0]);
    await refreshing("drill_reapply_catalog", "US-4 catalog", () => run(wave.files.catalog));
    await step("drill_reapply_knowledge", () => run(wave.files.knowledge));
    rollbacks.remove.reapplied_places = (await waveFacts(client, wave)).places;
    assert.equal(rollbacks.remove.reapplied_places, wave.places.length);
  }
  await client.query("rollback to savepoint s2");

  // 7. Refusal D: the unpublish before the promote.
  await expectRefusal("D_unpublish_before_promote", /US-4 unpublish: not VERIFIED with one current boundary/, () => run(wave.rollbackFiles.unpublish));

  // 8. The promote.
  await refreshing("promote", "US-4 promote", () => run(wave.files.promote));
  result.applied_in_transaction.push(wave.files.promote);
  result.state_shares = notices.filter((m) => /^US-4 promote: state share /.test(m));
  assert.equal(result.state_shares.length, 2, "Walla Walla Valley and Columbia Gorge");

  // 9. Refusals after the promote.
  await expectRefusal("E_remove_after_promote", /keys are locked \(the promote ran\)/, () => run(wave.rollbackFiles.remove));
  await expectRefusal("U_unstage_after_promote", /US-4 unstage: missing or not DRAFT/, () => run(wave.rollbackFiles.unstage));

  // 10. The promoted state.
  const facts = await waveFacts(client, wave);
  assert.deepEqual(facts, promotedFacts(wave), JSON.stringify(facts));

  // 11. The expected boundary-expectations hunk (every united-states row).
  expected = await expectationRows(client);
  assert.equal(expected.length, usBefore + wave.places.length);
  for (const p of wave.places) {
    const row = expected.find((r) => r.canonical_key === p.key);
    assert.deepEqual([row?.boundary_method, row?.source_feature_id, row?.documented],
      ["GENERALIZED_FROM_OFFICIAL_SOURCE", p.ucd_ava_id, true], p.key);
  }

  // 12. The tile preview.
  const preview = previewRelease(await step("export_preview", () => exportPreviewRows(client)));
  assert.deepEqual(preview.world, ["united-states", ...us2.states.map((s) => s.key)].sort());
  const shard = (k) => [preview.shards[k].keys.length, preview.shards[k].max_zoom];
  assert.deepEqual(shard("washington"), [wave.after.perState.WA.places, 11]);
  assert.deepEqual(shard("oregon"), [wave.after.perState.OR.places, 11]);
  assert.deepEqual(shard("new-york"), [wave.after.perState.NY.places, 9]);
  assert.deepEqual(shard("california"), [156, 12]);
  assert.equal(preview.outline.length, 12);
  assert.ok(preview.outline.includes("united-states.new-york.hudson-river-region"));
  assert.deepEqual(preview.outside, []);

  // 13. The details panel, as a signed-in reader.
  const details = await step("details", () => placeDetails(client, wave.places.map((p) => p.key)));
  for (const [key, d] of Object.entries(details)) assert.ok(d && d.article && d.grapes > 0 && d.styles > 0, `${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(client, Object.keys(CHILDREN));
  for (const [key, want] of Object.entries(CHILDREN)) assert.equal(kids[key].children, want, `children of ${key}`);
  const rocks = details[`${O}the-rocks-district-of-milton-freewater`].ancestors;
  assert.ok(rocks.includes("united-states.oregon") && !rocks.some((k) => k.startsWith("united-states.washington")), `Rocks breadcrumb ${rocks}`);
  assert.ok(details[`${W}columbia-valley.yakima-valley.candy-mountain`].ancestors.includes(`${W}columbia-valley.yakima-valley`), "Candy Mountain under Yakima Valley");
  const rels = await scopeRelationships(client);
  assert.equal(rels.length, wave.after.scopeEdges);
  for (const e of EXPECTED_EDGES) assert.ok(rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target), JSON.stringify(e));
  const clicks = await clickResolution(client, CLICK_KEYS);
  for (const c of clicks) assert.equal(c.resolved, c.key, `a click on ${c.key}`);
  const nearby = await placeDetails(client, NEARBY_KEYS);

  // 14. The grape shortlists (§10.3, decision 9).
  const after = await step("shortlists_after", () => shortlists(client));
  for (const st of ["Washington", "Oregon", "New York"]) assert.equal(after[st].source, "map", st);
  assert.equal(after.Washington.grapes[0], "Cabernet Sauvignon");
  assert.equal(after.Oregon.grapes[0], "Pinot Noir");
  assert.equal(after["New York"].grapes[0], "Riesling");
  assert.deepEqual(after.California.grapes, before.California.grapes, "California's shortlist is untouched");

  // 15. The Willamette typical wine, unchanged (decision 10).
  const arch = await archetypeFacts(client, [link]);
  assert.deepEqual(archetypeProblems(arch, [link]), []);

  // 16. Drill 3: unpublish.
  await client.query("savepoint s3");
  {
    await refreshing("drill_unpublish", "US-4 unpublish", () => run(wave.rollbackFiles.unpublish));
    const f = await waveFacts(client, wave);
    rollbacks.unpublish = { verified: f.verified, current: f.current_validated, locked: f.locked, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unpublish), [0, 0, wave.places.length, true]);
    assert.deepEqual(archetypeProblems(await archetypeFacts(client, [link]), [link]), [], "the Willamette wine after the unpublish");
  }
  await client.query("rollback to savepoint s3");

  // 17. The evidence (written after the rollback below).
  Object.assign(result, {
    timings_s: byName(timings),
    refreshes: byName(refreshes),
    refusals: byName(refusals),
    rollbacks,
    facts,
    parent_inside_lowest: stageReport.filter((r) => r.parent_inside != null)
      .sort((a, b) => a.parent_inside - b.parent_inside).slice(0, 5).map((r) => ({ key: r.key, parent_inside: r.parent_inside })),
    drift_highest: stageReport.slice().sort((a, b) => b.drift - a.drift).slice(0, 5).map((r) => ({ key: r.key, drift: r.drift })),
    containment_lowest: stageReport.slice().sort((a, b) => a.containment - b.containment).slice(0, 5).map((r) => ({ key: r.key, containment: r.containment })),
    clicks,
    nearby: Object.fromEntries(NEARBY_KEYS.map((key) => [key, nearby[key]?.nearby ?? []])),
    shortlist: Object.fromEntries(Object.keys(before).map((st) => [st, {
      before_source: before[st].source, before: before[st].grapes,
      after_source: after[st].source, after: after[st].grapes, after_place: after[st].placeName,
      colours: byName({ ...before[st].colours, ...after[st].colours }),
    }])),
    export_preview: { world: preview.world, outline: preview.outline,
      shards: Object.fromEntries(Object.entries(preview.shards).map(([key, s]) => [key, { keys: s.keys.length, max_zoom: s.max_zoom, bytes: s.bytes }])) },
    archetypes: { name: link.name, home: arch.archetypes[0].home, placements: arch.archetypes[0].placements },
    stage_report: stageReport,
    notices: notices.filter((m) => /neighbour refresh|US-4/.test(m)),
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

- [ ] **Step 2: Static checks only** (the run is Task 15): `npx eslint scripts/usa-map/rehearse-us4.mjs scripts/usa-map/us4-checks.mjs scripts/usa-map/check-us4-live.mjs` → clean; `node scripts/usa-map/rehearse-us4.mjs --bogus` → exit 2 with the usage line (it exits before connecting).
- [ ] **Step 3: Commit** "feat(usa-map): rehearse-us4.mjs (one rolled-back transaction: chain, refusals P/G/A/C/D/E/U, three drills, checks)".

---

### Task 15: Rehearse (rolled back), and commit the evidence

**Files:** Create (written by the rehearsal): `data/wine-map/review/usa-us4-rehearsal.json`, `data/wine-map/review/usa-us4-expected-boundaries.json`.

- [ ] **Step 1:** Run the activity check. `active`, `writers` and `building` must be empty and `draft_boundaries` 0; if not, wait and re-check, never start over someone.
- [ ] **Step 2: Rehearse.** `cd C:/Users/Public/repos/blindtastingapp-map && node --env-file=.env.local scripts/usa-map/rehearse-us4.mjs` (run in the background; about 9 minutes). Expected, in order: the catalog with its refresh; refusal P; the knowledge; refusals G and A; the stage; refusal C; the three unstage/remove drills; refusal D; the promote with its refresh and two NOTICEs `US-4 promote: state share united-states.oregon.columbia-gorge in united-states.washington 0.34…, tree 0.348` and `… walla-walla-valley in united-states.oregon 0.310…, tree 0.3101`; refusals E and U; the details, relationships, clicks, shortlists; the unpublish drill; `REHEARSAL OK`. Every refresh under 300 s (the script asserts it).
  - If refusal G fails with an error from the probe insert itself (a catalogue trigger refusing the probe row), not from the remove file, change `PROBE_SQL` to a row that trigger accepts (the refusal under test is the remove's), note it in the commit body, and re-run once.
- [ ] **Step 3: Read the evidence** and check by eye:
  - `facts` equals `promotedFacts` (42/42/42/42/0; live NY 11, OR 21, WA 19; 5 relationships; 12 outlines; cross-state one each; deferred 0; fresh);
  - `parent_inside_lowest` includes Candy Mountain near 0.893096 and Lake Chelan near 0.957; the lowest measured-basis entry is Red Mountain near 0.995035;
  - `containment_lowest` all ≥ 0.9996;
  - `export_preview.shards`: `washington`, `oregon`, `new-york` bytes (a GeoJSON proxy for §13.2's 1.5 MB archive target each); if one is above 1,200,000, note it for the runbook's tiles step;
  - `clicks` all resolve to themselves (The Rocks District selects itself, not Walla Walla Valley);
  - `shortlist.Washington/Oregon/New York.after`: note the first five of each; `shortlist.California` equals before and after;
  - `archetypes`: the Willamette wine at home on Willamette Valley, placed on Oregon and Willamette Valley.
  If any assert failed, fix the cause (never the assert), re-run the unit tests, and re-rehearse once.
- [ ] **Step 4: Commit** the two evidence files: "data(usa-map): the US-4 rehearsal (rolled back) and its expected boundaries". Put the refresh seconds, the total and the three shard byte counts in the body.

---

### Task 16: The review files, spec §27, the sitting runbook, and final verification

**Files:**
- Create (rendered): `data/wine-map/review/usa-us4-new-york-knowledge.md`, `…-oregon-knowledge.md`, `…-washington-knowledge.md`
- Modify: `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` (new §27)
- Create: `docs/superpowers/plans/2026-09-30-usa-wine-map-us4-sitting.md`

- [ ] **Step 1: Render the review files.** `node scripts/usa-map/render-usa-us4-review.mjs`. Expected: three files (New York 8, Oregon 18, Washington 16 places); each ends with its state's shortlist table and nearby lists; New York's lists the new grapes; Oregon's names the Willamette typical wine. Then `node --test scripts/usa-map/usa-us4-knowledge.test.mjs` → the review test now runs and PASSES.
- [ ] **Step 2: Spec §27.** Append to the spec a section "## 27. US-4 plan decisions (2026-09-30)", opening with "Settled by the US-4 plan (`docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md`), not by the owner (the owner waived review on 2026-09-30). Each departs from, or sharpens, an earlier section." followed by the twelve decisions of this plan's "Decisions this plan makes", one bullet each, in the same words, with the rehearsal's measured numbers added to decisions 2 (Candy Mountain's stage and display shares), 4 (the two state-share NOTICEs) and 12 (the three shard byte counts). In §15's US-4 acceptance, after "each cross-state AVA has exactly one place, keyed under its map state, and the expected state edges;" append "(Walla Walla Valley and Columbia Valley → Oregon, Columbia Gorge → Washington; §27)"; after "The Rocks District is keyed under Oregon, …" append "(it has `ALTERNATE_PARENT` to both Walla Walla Valley and Columbia Valley, which are keyed under Washington; §27)".
- [ ] **Step 3: The runbook.** Write `docs/superpowers/plans/2026-09-30-usa-wine-map-us4-sitting.md` from the "Ship instructions" section below, verbatim, adding after the step it belongs to, in *italics*, the numbers the rehearsal measured (from `usa-us4-rehearsal.json`: each refresh's seconds and rows, the stage's seconds, the two state shares, the lowest parent and containment shares, the three shard byte counts, the total). Open it with the `$APPLIER`/`$ROLLBACK` definitions exactly as the US-3 rest runbook's (`docs/superpowers/plans/2026-09-30-usa-wine-map-us3-rest-sitting.md`) paragraphs between its title and "## Ship instructions", with US-4's names.
- [ ] **Step 4: Final verification.**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs scripts/wine-map-sources/usa-tree.test.mjs scripts/wine-map-sources/usa-tree-reports.test.mjs scripts/wine-map-sources/gen-place-profiles-args.test.mjs scripts/wine-map-sources/gen-place-profiles-sql.test.mjs && npx eslint scripts/usa-map scripts/wine-map-sources/usa-stage-lib.mjs scripts/wine-map-sources/stage-usa-ava.mjs scripts/wine-map-sources/usa-tree.mjs && node scripts/wine-map-sources/build-usa-tree-reports.mjs && node scripts/usa-map/render-us4-sql.mjs && node scripts/usa-map/render-us4-notes.mjs && node scripts/usa-map/render-us3-sql.mjs && node scripts/usa-map/render-us2-sql.mjs && git status --short
```

Expected: every test green; eslint clean; the renders rewrite nothing (`git status` shows only the files of this step).
- [ ] **Step 5: Commit** the review files, the spec and the runbook: "docs(usa-map): US-4 review files, spec §27, and the sitting runbook".

---

## Ship instructions: the US-4 sitting (main session only)

**Release captain:** the main session, alone, for the whole window (about 30–40 minutes). Tell the friend (GitHub Birchenz) the time ahead and at the start; they run no catalogue batch and dispatch no tiles run until "done". `$APPLIER` records a version and refuses one already recorded; `$ROLLBACK` (`scripts/usa-map/apply-rollback.mjs`) records nothing. Run every command from the repository root. Activity check: `node --env-file=.env.local scripts/usa-map/activity-check.mjs`.

**Before the sitting (separate days are fine):**

1. **Merge `usa-map` to master**, rebased, as a staged push. The runtime-adjacent changes are none (scripts, data, migrations not applied). Master's checks must be green. Tell the friend: `usa-stage-lib.mjs`'s `stageWave` now takes a list of scope keys (`scopesOf`); `usa-tree-config.json` gained a Candy Mountain override and a Candy Mountain / Goose Gap exclusion (Washington only).
2. **Catalog, at a quiet hour.** Activity check; then `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20260930224747_usa_us4_catalog.sql --check`, `--dry`, then no flag. Expected `APPLIED`, and the refresh notice under 300 s. Then `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs` → 42 DRAFT places, cache fresh.
3. **Knowledge:** `--check`, `--dry`, then apply `supabase/migrations/20260930234747_usa_us4_knowledge.sql` (no `wine_places` write, no refresh, no tiles). From here the six new grapes (Marquette, Frontenac, La Crescent, Seyval Blanc, Vidal Blanc, Baco Noir) are in every grape picker; the places stay invisible until the promote.

**The sitting, in order:**

1. Announce the start; wait for the friend's "quiet". Note the ACTIVE release (reference only).
2. `git pull`; `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs` → green.
3. **Rehearse:** `node --env-file=.env.local scripts/usa-map/rehearse-us4.mjs --sitting` → `REHEARSAL OK`. It writes only `usa-us4-rehearsal-sitting.json` and fails unless the boundaries it stages equal the committed `usa-us4-expected-boundaries.json` byte for byte. If it fails, stop.
4. **Stage, dry:** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us4` → `DONE (dry): 42 boundaries …`.
5. **Gate:** `… --wave us4 --check-gate` → `GATE OPEN`.
6. **Stage:** `… --wave us4 --stage`. Expected: `RAW skip storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/NY_avas.geojson`, the same for `OR_avas.geojson` and `WA_avas.geojson` (uploaded at US-2), `STAGE COMPLETE: 42 DRAFT boundaries committed for us4`, and the stale-cache banner. From here until step 7 master's map-data job is red for both people: keep the gap to minutes.
7. **Promote:** `node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" supabase/migrations/20261001004747_usa_us4_promote.sql --check`, `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice and the two state-share NOTICEs.
8. **Check:** `node --env-file=.env.local scripts/usa-map/check-us4-live.mjs` → `US-4 LIVE CHECK OK` (42 VERIFIED/locked/current; New York 11, Oregon 21, Washington 19 live places; 5 relationships under the three states; 12 US outlines; one place each for Columbia Valley, Walla Walla Valley and Columbia Gorge; nothing deferred or under another state; articles, grapes and styles everywhere; children counts; the five edges; the eight click keys resolve to themselves; the three shortlists lead with Cabernet Sauvignon, Pinot Noir and Riesling; the Willamette wine unchanged; the boundary hunk equals the committed file).
9. **Tests and the expectations hunk:** `node --env-file=.env.local --test scripts/wine-place-context.test.mjs` → green; `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs --check data/wine-map/review/usa-us4-expected-boundaries.json --write`; `git diff --stat` shows only 42 added `united-states.{washington,oregon,new-york}.*` rows (report any other country's difference to the friend, never commit it); `node --env-file=.env.local --test scripts/wine-map-sources/boundary-expectations.test.mjs` → green; commit "data(wine-map): pin the US-4 boundaries (united-states hunk only)" and push master as a staged push.
10. **Tiles:** `gh workflow run wine-map-tiles.yml --ref master -f promote=true`, `gh run watch`; the release is ACTIVE; the manifest's `washington`, `oregon` and `new-york` are each ≤ 1.5 MB, `california` unchanged, world ≤ 400 KB (§13.2). If a shard exceeds its target, leave the release in place and plan a new DRAFT boundary cycle with a higher tolerance for the largest shapes (not a code change).
11. **Map checks** on desktop, iPhone Chrome and iPhone Safari:
    - Washington: Columbia Valley's child pills (11) are usable at 375 px; Red Mountain, Snipes Mountain and Candy Mountain (about 3.7 km²) are selectable by tap at phone zoom; Candy Mountain's breadcrumb reads United States › Washington › Columbia Valley › Yakima Valley › Candy Mountain; Walla Walla Valley fills across the state line into Oregon.
    - The Rocks District of Milton-Freewater: a tap at Milton-Freewater, with both the Washington and Oregon shards on screen, selects The Rocks District, not Walla Walla Valley; its breadcrumb reads United States › Oregon › The Rocks District of Milton-Freewater; its panel says it lies within Walla Walla Valley and Columbia Valley.
    - Oregon: Columbia Gorge draws on both banks of the river; "Mount Pisgah, Polk County, Oregon" wraps cleanly at 375 px in the panel title, the breadcrumb and the Willamette Valley child pills (9); Dundee Hills and Ribbon Ridge are selectable by tap.
    - New York: Finger Lakes' child pills show Cayuga Lake and Seneca Lake; Long Island's show North Fork of Long Island and The Hamptons, Long Island; Hudson River Region draws as an outline; Upper Hudson and Champlain Valley of New York fill.
    - Every new panel shows an article, grapes (signature first, the rest tagged "accessory") and styles; the new hybrid grapes show by name; the §8.7 nearby chips for the eight keys match the rehearsal's `nearby` (accept them, or add the function change to §20); the three state shortlists match the rehearsal's `shortlist.<state>.after` (accept them); the Willamette Pinot Noir is still listed on Willamette Valley and Oregon; dark mode.
12. Tell the friend it is done. Commit `data/wine-map/review/usa-us4-rehearsal-sitting.json` on its own ("data(wine-map): the US-4 sitting rehearsal").

**Rollback at each point** (every rollback file through `$ROLLBACK` with `--check`, `--dry`, then no flag):

| Failure | Action |
|---|---|
| Step 6 fails | Nothing is committed (one transaction). Fix, resume at step 4. |
| Step 7 fails (DRAFT boundaries live) | `$ROLLBACK scripts/usa-map/usa_us4_unstage.sql`: removes the 42 DRAFT boundaries and refreshes; master goes green. Investigate, then re-sit from step 3. It records nothing, so it can run again after a re-stage. |
| Abandon the wave before the promote | `$ROLLBACK scripts/usa-map/usa_us4_remove.sql` (refuses while any other place exists under the three states). Deletes the 42 places, their knowledge and the two history rows; keeps the six new grape rows; refreshes. To retry, apply the catalog and knowledge again as committed. |
| After the promote | Roll forward: `$ROLLBACK scripts/usa-map/usa_us4_unpublish.sql` (refuses while a later wave is live under the three states, or a typical wine is placed on a US-4 place). It flips the 42 places to DRAFT and their boundaries non-current, refreshes. Then `splice-boundary-expectations.mjs --write` (without `--check`: it keeps only current US rows), `git diff` shows only removed `united-states.{washington,oregon,new-york}.*` rows, `boundary-expectations.test.mjs` green, commit and staged push; then a new tiles release with `promote=true`. **Never roll back the manifest.** |
| Tiles run fails | The release is FAILED, the old one stays ACTIVE; the places show in the text tree without shapes. Fix and re-dispatch, or unpublish. |

---

## Acceptance checks mapped to tasks

| Requirement (spec §15 US-4, which is "as US-3, plus …", and this run's brief) | Where it is built | Where it is proved |
|---|---|---|
| Every AVA of the regenerated WA/OR/NY tree reports, keyed exactly as the reports | Tasks 1, 2, 4 | Task 2 tests (all 42, tree order, tiers, classification, keys); Task 4 render test and `--dry`; the catalog's own "rows differ from the tree reports" assert |
| Cross-state: one place per cross-state AVA, under its map state, with its `ALTERNATE_PARENT` state edges (Columbia Valley and Walla Walla Valley under Washington; The Rocks District and Columbia Gorge under Oregon) | Tasks 1, 2, 11 | Task 2 tests (keys, four edges, cross-state list, each AVA once); Task 11 render tests (shares 0.3101 / 0.348, the 0.01 / 0.005 rule); the promote's "a cross-state AVA is not exactly one place" assert; Task 15 (two state-share NOTICEs, `EXPECTED_EDGES`, `cross_state` facts); sitting step 8 |
| The Rocks District keyed under Oregon, ≥ 99.5% in Oregon, `ALTERNATE_PARENT` to Walla Walla Valley | Tasks 2, 11 | Task 2 key test; the promote's legal-state containment (Oregon only) and edge re-check (≥ 0.899 inside); Task 15 breadcrumb assert and click; sitting step 11 |
| Nothing Idaho-dominant; Lake Erie deferred | Task 2 | Task 2 test (`deferred`, no key under another state); the promote's "a deferred AVA has a place" and "a place under a state outside wave 1" asserts; `waveFacts.deferred/other_states` in Task 15 and sitting step 8 |
| Finger Lakes contains Seneca Lake and Cayuga Lake; Long Island contains North Fork of Long Island and The Hamptons, Long Island | Tasks 2, 13 | Task 2 test (parents); stage and promote parent containment (measured ≥ 0.9998); `CHILDREN` (2 and 2) in Task 15 and sitting step 8; sitting step 11 (child pills) |
| Knowledge for every new place, in session, same conventions and validator as US-3 | Tasks 5–9 | Task 5 validator (US-3 rule + new-grape rule + leads); Task 9 migration-current test; the promote's coverage assert; Task 15 details for every place |
| The tree report is reviewed (containment, edges, `within` disagreements explained) | Tasks 1, 3 | Task 1 tree-report tests (Candy Mountain); Task 3 tree-review test |
| Staging via `stage-usa-ava.mjs`, one transaction | Task 10 | Task 10 dry run and gate proof; Task 15 (stage, refusal C, re-stage drill) |
| Promote with asserts and the neighbour-cache refresh | Task 11 | Task 11 render tests and `--dry` refusal; Task 15 (refusals A, E, U; refresh < 300 s; post-state facts) |
| Rollback files via `apply-rollback.mjs` | Task 12 | Task 12 tests and `--check`/`--dry` refusals; Task 15 drills (unstage ×2, remove + re-apply, unpublish) and refusals D, E, G, U |
| A rolled-back rehearsal | Task 14 | Task 15 |
| A sitting runbook | Task 16 | — |
| Every place has an article; the promote asserts pass | Tasks 9, 11 | Task 15; sitting step 8 |
| Shards within target (≤ 1.5 MB each) | — | Task 15 preview (keys, max zoom 11/11/9, byte proxy); sitting step 10 (archives) |
| Clicking a nested AVA selects it; small AVAs tappable at phone zoom | Task 13 (`CLICK_KEYS`) | Task 15 click assert; sitting steps 8 and 11 |
| "Mt. Pisgah, Polk County, Oregon" wraps cleanly at 375 px | — | sitting step 11 |
| §8.7 nearby lists and §10.3 shortlist comparison repeated | Tasks 13, 14, 16 | Task 15 evidence (`nearby`, `shortlist`); review files (Task 16); sitting steps 8 and 11 |
| Willamette Valley typical wine: the spec names no refinement, so its placements are kept | Task 13 (`willametteLink`) | Task 13 test; Task 15 before/after/unpublish asserts; the unpublish's typical-wine refusal (Task 12); sitting steps 8 and 11 |

## What the main session does afterwards

1. Review the branch from base commit `56cdb69` (the plan's last commit is Task 16).
2. Follow `docs/superpowers/plans/2026-09-30-usa-wine-map-us4-sitting.md`: merge to master (staged push), apply the catalog and the knowledge at a quiet hour, then the sitting (rehearse `--sitting`, stage, promote, live check, the boundary hunk and a staged push, the tiles release with `promote=true`, the map checks on desktop and both iPhone browsers).
3. Accept the §8.7 nearby lists and the §10.3 Washington, Oregon and New York shortlists from the three review files; anything unacceptable goes to §20 (the function change needs the friend's live-only migration in git first).
4. After US-4: US-5 (Beverly, Washington and Columbia Hills from TTB shapefiles, then the diff re-run) can start; Idaho's wave decides Snake River Valley and Lewis-Clark Valley, Ohio's Lake Erie.

## Provisional copy (new user-facing text)

- Every article field (`description`, `climate`, `soils`, `grape_varieties`, `wine_styles`) and every key fact of the 42 places in `data/wine-map/place-profiles-usa-us4.json`.
- Every grape `note` (for example "Sold as Lemberger") and the six new grapes' names and descriptions (Marquette, Frontenac, La Crescent, Seyval Blanc, Vidal Blanc, Baco Noir), which appear in every grape picker once the knowledge migration applies.
- The review files `data/wine-map/review/usa-us4-*-knowledge.md` (their framing lines).
- Not user-facing: the relationship notes ("US-4, Washington tree report: basis …"), the config rules, the fact sheet and the tree review.

## Execution notes

- Task 1 must land first: every later file renders from the rebuilt tree reports, and Candy Mountain's key locks at the promote.
- Tasks 6–8 are research and writing; they dominate the time. They are independent of each other but all write the same data file: run them one at a time (or have each subagent write a separate scratch JSON of its places, then merge them into the data file and run `order-usa-profiles.mjs --wave us4`). Task 8 closes the file (approval), so it goes last.
- Tasks 2–5 and 10–14 are code with tests and can go before the knowledge is finished, except Task 9 (needs Task 8), Task 10 Step 5 (needs the knowledge migration) and Task 15 (needs everything).
- Every live-touching step is read-only or rolled back; the ones that hold the neighbour-state lock are Task 4 Step 5, Task 9 Step 3, Task 10 Step 5 and Task 15. Run the activity check before each.
