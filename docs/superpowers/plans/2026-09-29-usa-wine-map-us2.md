# USA on the wine map: phase US-2 (country, four states, umbrella AVAs, Central Valley), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything phase US-2 needs, up to but not including the live staging sitting:

- the catalog migration (16 DRAFT places);
- the owner's knowledge for all 16 places, as a data file, an owner-review markdown and a generated knowledge migration;
- the stage script, run in dry mode only;
- the promote migration (DRAFT to VALIDATED + VERIFIED, with its asserts and the neighbour-cache refresh);
- archetype links step 1 and the training-room test change;
- the rollback files and the boundary-expectations tooling (united-states only);
- the tile preview checks (outlines, shard zooms);
- one rolled-back rehearsal of the whole chain against live;
- exact ship instructions for the one announced sitting.

Nothing is applied, nothing is written live or to Storage, and no tiles run is dispatched.

**Architecture:** The wave is read from the committed tree reports and nothing else. The pure module `scripts/usa-map/us2-wave.mjs` selects the 16 places, the one edge, the ten outline places and Central Valley's eleven members. The renderer `scripts/usa-map/render-us2-sql.mjs` writes these migrations from that selection:

- catalog, promote and archetype links;
- the three rollback files.

Tests prove that each committed file equals its render. `stage-usa-ava.mjs` builds the boundaries in one transaction through a shared library, which the rehearsal also imports. `rehearse-us2.mjs` then runs, in one transaction that is always rolled back:

- catalog → knowledge → stage → promote → links;
- the refusal cases and all three rollbacks;
- the read-only checks as a signed-in reader.

It writes its measurements to a committed evidence file. The owner-review markdown is rendered from the knowledge data file plus that evidence.

**Tech Stack:** Node 24 ESM with `node:test`, `pg`, `@supabase/supabase-js` (Storage, used only by `--stage`), PL/pgSQL on live Postgres (read-only or rolled back only), and TypeScript/vitest for one test file.

**Spec:** `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md`. Read all of it. The parts that matter most here: D1–D4, D9–D12, D15, D16, D19–D22, D24, D25; §4, §5.2, §8 (all), §10, §11, §12, §13, §14, §15 (the wave order and US-2), §16, §17 and §18. Also read:

- `CLAUDE.md`, especially "A catalogue write must be followed by a neighbour-cache refresh", World Wine Map Phases 3A–3D and "Wine map performance";
- `AGENTS.md` (no Anthropic API use of any kind);
- the US-0 and US-1 plans (`docs/superpowers/plans/2026-09-29-usa-wine-map-us0.md` and `…-us1.md`), for the conventions reused here;
- `data/wine-map/review/usa-us0-tree-summary.md`.

This plan touches one TypeScript file, a vitest test (`src/lib/wine-map/shard-layer-specs.test.ts`), and no Next.js runtime code. If any step does reach Next code, first read the relevant guide under `node_modules/next/dist/docs/`.

## Global Constraints

- Work only in `C:/Users/Public/repos/blindtastingapp-map`, on branch `usa-map`. Start every shell command with `cd C:/Users/Public/repos/blindtastingapp-map && `, because the shell's cwd resets. Never touch `C:/Users/Public/repos/blindtastingapp`.
- **Never push.**
- **Never apply a migration.**
- **Never write to the live database or to Storage.**
- **Never dispatch a tiles run.**
- **Never run `stage-usa-ava.mjs --stage`.**
- Allowed live access. All of it is read-only or rolled back:
  - `scripts/wine-map-sources/read-only-client.mjs` (`begin read only` … `rollback`);
  - the owner's applier with `--check` or `--dry` only. It lives at `C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`, written below as `$APPLIER`. Run it from the worktree (it loads `scripts/migration-preflight.mjs` from the cwd): `node --env-file=.env.local "$APPLIER" <file> --check`, then `--dry`. **Never run it without a flag.**
  - the dry mode of `stage-usa-ava.mjs` (always rolled back);
  - `scripts/usa-map/rehearse-us2.mjs` (always rolled back; it has no commit path);
  - `gen-place-profiles-migration.mjs --prelude …` (its prelude transaction is always rolled back).
- **Live-lock etiquette.** Any rolled-back run that writes `wine_places` or `wine_place_boundaries` holds `wine_place_neighbours_state`'s row until it rolls back. The runs that do this are the catalog `--dry`, the stage dry run, the generator's `--prelude` and the rehearsal. A refresh inside one of them takes about 65–135 s. While it runs, the friend's catalogue writes queue behind it. So:
  - before each such run, run the activity check in Task 2 Step 5;
  - run each at most the number of times this plan says;
  - never run two at once.
- Never recreate `get_wine_place_context`, `refresh_wine_place_neighbours` or any other shared map function (D21). The friend's `20260925190000_wine_place_context_inherited_profile` is recorded live (checked 2026-09-29) and is still not in the repo. Nothing in this plan changes a function.
- No Anthropic API call of any kind (AGENTS.md). The knowledge research (Task 5) is done in-session with WebSearch and WebFetch. Do not script any content generation.
- Commit with this prefix, and end every message with the co-author line:
  `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- **Line endings.** `.gitattributes` marks `data/wine-map/usa-*`, `data/wine-map/united-states-*`, `data/wine-map/review/usa-*` and `data/usa-reference/**` `-text`. Task 5 adds `data/wine-map/place-profiles-usa.json`. Write every new file with LF line endings.
- No migration contains `begin;`, `commit;` or `rollback;` at top level (D24). Each render test asserts this with `topLevelTransactionStatements` from `scripts/migration-preflight.mjs`.
- **Constants (read-only checks, 2026-09-29):**
  - **Newest live migration:** `20260929214747` (US-1). `20260929224747` is reserved for US-1's revert.
  - **US-2 versions (suffix `4747`, D23):** catalog `20260930084747`, knowledge `20260930094747`, promote `20260930104747`, archetype links `20260930114747`.
  - **Rollback versions** (these files live outside `supabase/migrations/`): unstage `20260930124747`, remove `20260930134747`, unpublish `20260930144747`.
  - **If a newer live version exists on the apply day,** change `US2_VERSIONS` in one place (Task 1) and re-render. The applier does not enforce ordering.
  - **Live catalogue:**
    - 3,309 places, all VERIFIED;
    - no `united-states` key;
    - 0 DRAFT boundaries;
    - ACTIVE release `20260916T213650Z`.
  - **The neighbour cache is currently STALE:** `fresh = false`, `built_at` 2026-09-20T13:39Z. The spec's §3 said fresh. See Task 2's stop rule.
  - **Archetypes** (id, name, sort_order; each `wine_place_id` null with 0 placements):
    - `75e4e467-3929-4844-bbc4-ffe8b12523a1` "A typical Napa Cabernet Sauvignon", 88;
    - `c4ea77f3-5599-43dd-bdc3-4287c1e0ea15` "A typical Sonoma Chardonnay", 89;
    - `bab8537e-b0bc-4f7c-8547-242537322f8a` "A typical Willamette Pinot Noir", 90.
  - **Scoring regions:** California `18d52236-681f-4a5a-ba98-cd0639210fb3`, New York `0a35f1d4-2baa-4b32-9815-231ce6bf79dd`, Oregon `8a6c9c90-31af-455f-ab0f-ca02c3d1bda4`, Washington `1e5608bb-976a-4007-b575-33e0ee391154`.
  - **Their `region_grapes` today** (the shortlist "before"):
    - California: Cabernet Sauvignon, Chardonnay, Zinfandel;
    - New York: Cabernet Franc, Riesling;
    - Oregon: Pinot Gris, Pinot Noir;
    - Washington: Cabernet Sauvignon, Merlot, Riesling, Syrah.
  - **Grapes the catalog already has:** Cabernet Sauvignon, Cabernet Franc, Merlot, Malbec, Petit Verdot, Chardonnay, Pinot Noir, Pinot Gris, Pinot Blanc, Pinot Meunier, Zinfandel, Primitivo, Syrah, Grenache, Grenache Blanc, Mourvèdre, Viognier, Roussanne, Marsanne, Sauvignon Blanc, Semillon (no accent), Riesling, Gewürztraminer, Müller-Thurgau, Grüner Veltliner, Blaufränkisch, Tempranillo, Barbera, Sangiovese, Nebbiolo, Chenin Blanc, Albariño, Vermentino, Muscat, Moscato, Teroldego, Tannat, Petit Manseng.
  - **Grapes the catalog lacks:** Petite Sirah, Madeleine Angevine, Siegerrebe, Concord, Seyval Blanc, Vidal.
  - **Artifact pins.** From `data/wine-map/usa-measurements.json` `_inputs` (uppercase sha256):
    - California `CB3F8A08A6FF5E814CC701007C96F13FA8354A0591829D7BD7610446C4BF2E7A`;
    - Washington `0D55D546E37CC1288DD24AEEC5DC1F303D295F72BC7A0DC6F213BB6F2DA22297`;
    - Oregon `BF05463C00EB9D62EFFBF8A3608B10FFA798B0F84DC2B34699C49AB30863C732`;
    - New York `4CF1BA9413468D7825A2E3B2EAC10D5DB2C09037718A87422C5E10D79205DBB1`;
    - states `C651A0E44CD9561A4AF642B7E7C46C599A5F9C2EECC78159DA92646FFD87F218`.

    The country artifact `data/wine-map/united-states-lower48-ne50m.geojson` is `CF02FF8E8B44CE08745CA75A1BE72F4F0654F81E7B5553502560E80E603BB0D4`. The raw UC Davis files are pinned in `data/wine-map/usa-sources.json`, commit `355f7da3cd6c4020fff736b7517a4a669fed7730`, and exist locally under `.tiles-build/usa/ucd/…`.
- **Owner answers this plan implements (verbatim):**
  - states: **"CA, WA, OR, NY now; others later"**;
  - **"Links now, then likelihood map"**;
  - **"Training room only"**;
  - Columbia Gorge: **"Oregon"**;
  - pushes: **"Yes, ship phases as they pass"**. The main session pushes and applies; this plan never does.
- **New user-facing copy is provisional.** Every article, key fact and grape note, and the Petite Sirah description, stays provisional until the owner answers "OK" on `data/wine-map/review/usa-us2-knowledge.md`. The full list is at the end of this plan.

## Review Focus

These five failure modes follow from the spec, but no happy-path test exercises them. Each has a pinning test in the task that owns the code:

1. **Someone else is mid-batch, or a tiles run is in flight, when `--stage` runs.** A release the friend builds during the DRAFT window would export no US place. That is harmless. But their `build-germany-einzellagen.mjs` commits place by place, and the promote's refresh then runs across their half-written batch. `--stage` must refuse on any DRAFT boundary outside `united-states`, and on any release `BUILDING` in the last hour. (Task 7: `sittingGate` unit tests.)
2. **`--stage` run twice.** A second stage must refuse, and must never add a second DRAFT row per place. (Task 7: `sittingGate` refuses on `usBoundaries > 0`. Task 8: `stageWave` asserts no US boundary exists. Task 14: the rehearsal runs `stageWave` a second time and expects "already exist".)
3. **The knowledge data file edited after its migration was generated.** The owner's corrections land in the JSON, but the migration still carries the old text. (Task 6: the "knowledge migration is current" test fails when any article string or grape/style count in the data file is not in the migration.)
4. **Out-of-order apply.** Four cases must each refuse before changing anything:
   - the promote before `--stage`;
   - the archetype links before the promote;
   - the "remove wave" rollback after the promote (keys are locked by then);
   - the unpublish before the promote.

   (Task 14: four refusal cases inside savepoints, each matched on its message.)
5. **A Storage object already exists with different bytes.** `--stage` uploads the four raw UC Davis files. An object left from a different attempt must never be overwritten, and the same bytes must be skipped, not re-uploaded. (Task 7: `uploadDecision` returns `upload`, returns `skip`, or throws.)

## File map

| File | Change |
|---|---|
| `scripts/usa-map/us2-wave.mjs` + `us2-wave.test.mjs` (new) | the wave: 16 places, the edge, the outline set, Central Valley's members, the versions and file names |
| `scripts/usa-map/render-us2-sql.mjs` + `us2-sql.test.mjs` (new) | renders catalog, promote, links, unstage, remove and unpublish; the tests prove the committed files equal the render |
| `supabase/migrations/20260930084747_usa_us2_catalog.sql` (new, rendered) | 16 DRAFT places and the refresh (NOT applied) |
| `scripts/wine-map-sources/gen-place-profiles-sql.mjs` (new), `gen-place-profiles-args.mjs`, `gen-place-profiles-migration.mjs`, `gen-place-profiles-args.test.mjs`, `gen-place-profiles-sql.test.mjs` (new) | `--prelude`, and the optional article `grape_varieties`/`wine_styles` columns |
| `scripts/usa-map/usa-knowledge.mjs` + `usa-knowledge.test.mjs` (new) | the US content validator and the review-markdown renderer |
| `data/wine-map/place-profiles-usa.json` (new) | the 16 places' knowledge (DRAFT, owner copy) and `new_grapes` (Petite Sirah) |
| `.gitattributes` | `data/wine-map/place-profiles-usa.json -text` |
| `supabase/migrations/20260930094747_usa_us2_knowledge.sql` (new, generated) | knowledge (NOT applied) |
| `scripts/wine-map-sources/usa-stage-lib.mjs` + `usa-stage-lib.test.mjs` (new) | pure stage rules plus `stageWave(client, …)` |
| `scripts/wine-map-sources/stage-usa-ava.mjs` (new) | the CLI: dry by default; `--stage` is gated |
| `supabase/migrations/20260930104747_usa_us2_promote.sql` (new, rendered) | the promote (NOT applied) |
| `data/wine-map/usa-us2-archetype-links.json` (new), `supabase/migrations/20260930114747_usa_archetype_links_1.sql` (new, rendered) | archetype links step 1 (NOT applied) |
| `scripts/training-room.test.mjs` | the batch-1 Napa assertion reads either state |
| `scripts/usa-map/20260930124747_usa_us2_unstage.sql`, `20260930134747_usa_us2_remove.sql`, `20260930144747_usa_us2_unpublish.sql` (new, rendered) | rollbacks, deliberately outside `supabase/migrations/` |
| `scripts/usa-map/export-preview.mjs` + `export-preview.test.mjs` (new) | the tile preview of US rows through `lib.mjs`, and a drift guard on `export.mjs`'s SQL |
| `src/lib/wine-map/shard-layer-specs.test.ts` | `SHARD_COUNTRY` gains the four US shards |
| `scripts/usa-map/shortlist-mirror.mjs` + `shortlist-mirror.test.mjs` (new) | the §10.3 comparison, mirroring `src/lib/grape-shortlist.ts` |
| `scripts/usa-map/splice-boundary-expectations.mjs` + `boundary-expectations-splice.test.mjs` (new) | the united-states hunk only |
| `scripts/usa-map/us2-checks.mjs` (new), `scripts/usa-map/rehearse-us2.mjs` (new), `scripts/usa-map/check-us2-live.mjs` (new) | the checks shared by the rehearsal and the live check; the rehearsal; the read-only post-promote check |
| `data/wine-map/review/usa-us2-rehearsal.json`, `data/wine-map/review/usa-us2-expected-boundaries.json` (new, written by the rehearsal) | evidence |
| `scripts/usa-map/render-usa-us2-review.mjs` (new), `data/wine-map/review/usa-us2-knowledge.md` (new, rendered) | the owner review file |
| `docs/superpowers/plans/2026-09-29-usa-wine-map-us2-sitting.md` (new) | the sitting runbook, with the rehearsal's measured numbers filled in |
| `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` | new §25, the US-2 plan decisions (the deviations below) |

---

### Task 1: The wave, from the tree reports

**Files:**
- Create: `scripts/usa-map/us2-wave.mjs`
- Test: `scripts/usa-map/us2-wave.test.mjs`

**Interfaces:**
- Consumes: the four committed `data/wine-map/usa-{california,washington,oregon,new-york}-tree.json` reports. Each is `{ state, state_key, places[], edges[], … }`. A place row has `key, slug, name, kind, display_tier, min_zoom, label_min_zoom, sort_order, parent_key, breadcrumb, is_appellation, appellation_system, appellation_level, display, navigation_node, map_state, ucd_ava_id, cfr_section, area_km2, legal_states`.
- Produces:
  - `STATE_SLUGS`, `COUNTRY_KEY = "united-states"`, `US2_VERSIONS`, `US2_FILES`, `US2_ROLLBACK_FILES`;
  - `artifactFor(code) → path`, `depthOf(key) → 0|1|2`;
  - `loadTrees() → Promise<{CA,WA,OR,NY}>`;
  - `us2Wave(trees)`, which returns:
    - `places` (16 rows, in tree order: the country, then each state by `sort_order` followed by its SUBREGIONs by `sort_order`);
    - `edges` (`[{type, source_key, target_key, basis, share}]`);
    - `outlineKeys` (sorted);
    - `derived` (`[{key, state, members: string[]}]`);
    - `ucd` (`[{key, ucd_ava_id, state, artifact, legal_states, area_km2, cfr_section, name}]`);
    - `states` (`[{code, key, name}]`).

- [ ] **Step 1: Write the failing test** (`scripts/usa-map/us2-wave.test.mjs`):

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees, us2Wave, depthOf, US2_VERSIONS, US2_FILES, US2_ROLLBACK_FILES } from "./us2-wave.mjs";

const KEYS = [
  "united-states",
  "united-states.california",
  "united-states.california.central-coast",
  "united-states.california.central-valley",
  "united-states.california.north-coast",
  "united-states.california.sierra-foothills",
  "united-states.california.south-coast",
  "united-states.new-york",
  "united-states.new-york.finger-lakes",
  "united-states.new-york.long-island",
  "united-states.oregon",
  "united-states.oregon.southern-oregon",
  "united-states.oregon.willamette-valley",
  "united-states.washington",
  "united-states.washington.columbia-valley",
  "united-states.washington.puget-sound",
];

test("US-2 is the country, the four states, their umbrella AVAs and Central Valley", async () => {
  const w = us2Wave(await loadTrees());
  assert.deepEqual(w.places.map((p) => p.key), KEYS);
  assert.deepEqual(w.places.map((p) => p.kind).reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {}),
    { COUNTRY: 1, REGION: 4, SUBREGION: 11 });
  assert.deepEqual(w.states.map((s) => s.code), ["CA", "NY", "OR", "WA"]);
});

test("zooms and tiers follow spec §4", async () => {
  const w = us2Wave(await loadTrees());
  for (const p of w.places) {
    const want = p.kind === "COUNTRY" ? [0, 1.5, 2] : p.kind === "REGION" ? [1, 4, 4] : [2, 5, 5];
    assert.deepEqual([p.display_tier, p.min_zoom, p.label_min_zoom], want, p.key);
    assert.ok(p.label_min_zoom <= 10, `${p.key}: D16`);
    assert.equal(depthOf(p.key), p.kind === "COUNTRY" ? 0 : p.kind === "REGION" ? 1 : 2, p.key);
  }
  assert.equal(w.places[0].sort_order, 140);
});

test("classification: umbrella AVAs are AVA/regional, Central Valley and the states are not appellations", async () => {
  const w = us2Wave(await loadTrees());
  for (const p of w.places) {
    if (p.kind === "SUBREGION" && !p.navigation_node) {
      assert.deepEqual([p.is_appellation, p.appellation_system, p.appellation_level], [true, "AVA", "regional"], p.key);
    } else {
      assert.deepEqual([p.is_appellation, p.appellation_system, p.appellation_level], [false, null, null], p.key);
    }
  }
});

test("the one edge, the outline set (D15), Central Valley's members (D25)", async () => {
  const w = us2Wave(await loadTrees());
  assert.deepEqual(w.edges, [{
    type: "ALTERNATE_PARENT", source_key: "united-states.washington.columbia-valley",
    target_key: "united-states.oregon", basis: "state_share", share: 0.224,
  }]);
  assert.deepEqual(w.outlineKeys, [
    "united-states.california.central-coast", "united-states.california.central-valley",
    "united-states.california.north-coast", "united-states.california.sierra-foothills",
    "united-states.california.south-coast", "united-states.new-york.finger-lakes",
    "united-states.oregon.southern-oregon", "united-states.oregon.willamette-valley",
    "united-states.washington.columbia-valley", "united-states.washington.puget-sound",
  ]);
  assert.ok(!w.outlineKeys.includes("united-states.new-york.long-island"), "Long Island (~3,147 km²) keeps its fill");
  assert.deepEqual(w.derived, [{
    key: "united-states.california.central-valley", state: "CA",
    members: ["capay_valley", "clarksburg", "diablo_grande", "dunnigan_hills", "lodi", "madera",
      "paulsell_valley", "river_junction", "salado_creek", "tracy_hills", "winters_highlands"],
  }]);
  assert.equal(w.ucd.length, 10);
  const cv = w.ucd.find((u) => u.ucd_ava_id === "columbia_valley");
  assert.deepEqual([cv.state, cv.artifact, cv.legal_states], ["WA", "data/wine-map/usa-washington-ava.geojson", ["OR", "WA"]]);
});

test("refuses reports it cannot place", async () => {
  const trees = await loadTrees();
  assert.throws(() => us2Wave({ ...trees, CA: undefined }), /no tree report for CA/);
  const bad = structuredClone(trees);
  bad.NY.places.find((p) => p.kind === "COUNTRY").sort_order = 999;
  assert.throws(() => us2Wave(bad), /disagree on the country row/);
  const orphan = structuredClone(trees);
  orphan.OR.places.push({ ...orphan.OR.places.find((p) => p.kind === "SUBREGION"), key: "united-states.oregon.x.y", parent_key: "united-states.oregon.x" });
  assert.throws(() => us2Wave(orphan), /is in no wave slot/);
});

test("versions end in 4747 and file names follow them", () => {
  for (const v of Object.values(US2_VERSIONS)) assert.match(v, /^\d{10}4747$/);
  assert.equal(US2_FILES.catalog, "supabase/migrations/20260930084747_usa_us2_catalog.sql");
  assert.equal(US2_FILES.promote, "supabase/migrations/20260930104747_usa_us2_promote.sql");
  assert.equal(US2_ROLLBACK_FILES.unpublish, "scripts/usa-map/20260930144747_usa_us2_unpublish.sql");
});
```

- [ ] **Step 2: Run it.** `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/us2-wave.test.mjs`. Expected: FAIL, "Cannot find module './us2-wave.mjs'".

- [ ] **Step 3: Implement** `scripts/usa-map/us2-wave.mjs`:

```js
// Phase US-2 of the USA map (spec 2026-09-29 §15): the country, the four wave
// states, their umbrella AVAs and the Central Valley navigation node, read from
// the committed tree reports (§8.3) and from nothing else. Pure. Every US-2
// migration, the stage and the rehearsal take their keys from here, so none of
// them can disagree with the reports the owner reviewed.
import { readFile } from "node:fs/promises";

export const STATE_SLUGS = Object.freeze({ CA: "california", WA: "washington", OR: "oregon", NY: "new-york" });
export const COUNTRY_KEY = "united-states";
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us2-sql.mjs); the applier does not enforce order.
export const US2_VERSIONS = Object.freeze({
  catalog: "20260930084747",
  knowledge: "20260930094747",
  promote: "20260930104747",
  links: "20260930114747",
  unstage: "20260930124747",
  remove: "20260930134747",
  unpublish: "20260930144747",
});
export const US2_FILES = Object.freeze({
  catalog: `supabase/migrations/${US2_VERSIONS.catalog}_usa_us2_catalog.sql`,
  knowledge: `supabase/migrations/${US2_VERSIONS.knowledge}_usa_us2_knowledge.sql`,
  promote: `supabase/migrations/${US2_VERSIONS.promote}_usa_us2_promote.sql`,
  links: `supabase/migrations/${US2_VERSIONS.links}_usa_archetype_links_1.sql`,
});
// Outside supabase/migrations/ on purpose: a replay must never run a rollback.
export const US2_ROLLBACK_FILES = Object.freeze({
  unstage: `scripts/usa-map/${US2_VERSIONS.unstage}_usa_us2_unstage.sql`,
  remove: `scripts/usa-map/${US2_VERSIONS.remove}_usa_us2_remove.sql`,
  unpublish: `scripts/usa-map/${US2_VERSIONS.unpublish}_usa_us2_unpublish.sql`,
});
const WAVE_KINDS = new Set(["COUNTRY", "REGION", "SUBREGION"]);

export const artifactFor = (code) => `data/wine-map/usa-${STATE_SLUGS[code]}-ava.geojson`;
export const depthOf = (key) => key.split(".").length - 1;
const bySort = (a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key);

export async function loadTrees(read = (p) => readFile(p, "utf8")) {
  const trees = {};
  for (const [code, slug] of Object.entries(STATE_SLUGS)) {
    trees[code] = JSON.parse(await read(`data/wine-map/usa-${slug}-tree.json`));
  }
  return trees;
}

export function us2Wave(trees) {
  const codes = Object.keys(STATE_SLUGS);
  for (const code of codes) {
    if (!trees[code]) throw new Error(`no tree report for ${code}`);
    if (trees[code].state !== code) throw new Error(`the ${code} report says state ${trees[code].state}`);
  }
  const countries = codes.map((code) => trees[code].places.filter((p) => p.kind === "COUNTRY"));
  for (const list of countries) if (list.length !== 1) throw new Error("each report must carry exactly one COUNTRY row");
  const country = countries[0][0];
  for (const [row] of countries) {
    if (JSON.stringify(row) !== JSON.stringify(country)) throw new Error("the four reports disagree on the country row");
  }
  if (country.key !== COUNTRY_KEY) throw new Error(`country key is ${country.key}`);

  const states = codes.map((code) => {
    const regions = trees[code].places.filter((p) => p.kind === "REGION");
    if (regions.length !== 1 || regions[0].key !== trees[code].state_key) {
      throw new Error(`${code}: expected exactly its REGION ${trees[code].state_key}`);
    }
    return regions[0];
  }).sort(bySort);

  const places = [country];
  for (const state of states) {
    places.push(state);
    places.push(...trees[state.map_state].places
      .filter((p) => p.kind === "SUBREGION" && p.parent_key === state.key)
      .sort(bySort));
  }
  const keys = new Set(places.map((p) => p.key));
  for (const code of codes) {
    for (const p of trees[code].places) {
      if (WAVE_KINDS.has(p.kind) && !keys.has(p.key)) throw new Error(`${p.key} (${p.kind}) is in no wave slot`);
    }
  }

  const edges = codes.flatMap((code) => trees[code].edges)
    .filter((e) => keys.has(e.source_key) && keys.has(e.target_key))
    .sort((a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key));
  const outlineKeys = places.filter((p) => p.display === "outline").map((p) => p.key).sort();
  const derived = places.filter((p) => p.navigation_node).map((p) => ({
    key: p.key,
    state: p.map_state,
    members: trees[p.map_state].places
      .filter((x) => x.parent_key === p.key && x.ucd_ava_id)
      .map((x) => x.ucd_ava_id)
      .sort(),
  }));
  const ucd = places.filter((p) => p.ucd_ava_id).map((p) => ({
    key: p.key, ucd_ava_id: p.ucd_ava_id, state: p.map_state, artifact: artifactFor(p.map_state),
    legal_states: p.legal_states, area_km2: p.area_km2, cfr_section: p.cfr_section, name: p.name,
  }));
  return {
    places, edges, outlineKeys, derived, ucd,
    states: states.map((s) => ({ code: s.map_state, key: s.key, name: s.name })),
  };
}
```

- [ ] **Step 4: Run it.** Expected: PASS (6 tests).
- [ ] **Step 5: Commit.** `git add scripts/usa-map/us2-wave.mjs scripts/usa-map/us2-wave.test.mjs`, then commit "feat(usa-map): the US-2 wave, read from the committed tree reports" with the prefix and co-author line from Global Constraints.

---

### Task 2: The catalog migration (16 DRAFT places, with the refresh)

**Files:**
- Create: `scripts/usa-map/render-us2-sql.mjs`, `scripts/usa-map/us2-sql.test.mjs`
- Create (rendered): `supabase/migrations/20260930084747_usa_us2_catalog.sql`

**Interfaces:**
- Consumes: `us2Wave`, `loadTrees`, `depthOf`, `US2_FILES` (Task 1).
- Produces: `sq(v)`, `catalogSql(wave) → string`, and the CLI `node scripts/usa-map/render-us2-sql.mjs`, which writes every rendered file. Later tasks add `promoteSql`, `linksSql`, `unstageSql`, `removeSql` and `unpublishSql` to this module.

- [ ] **Step 1: Write the failing test** (`scripts/usa-map/us2-sql.test.mjs`):

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave, US2_FILES } from "./us2-wave.mjs";
import { catalogSql } from "./render-us2-sql.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");
const wave = us2Wave(await loadTrees());

test("the committed catalog migration is exactly the render", async () => {
  assert.equal(lf(await readFile(US2_FILES.catalog, "utf8")), catalogSql(wave));
});

test("catalog: no transaction statements, DRAFT only, ends with the checked refresh", () => {
  const sql = catalogSql(wave);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  assert.equal((sql.match(/^ {2}\('united-states/gm) ?? []).length, 16, "16 value rows");
  assert.ok(!/'VERIFIED'/.test(sql), "the catalog never writes VERIFIED");
  const tail = sql.slice(sql.lastIndexOf("do $$"));
  assert.match(tail, /refresh_wine_place_neighbours\(\)/);
  assert.match(tail, /if v_rows < 0 then/);
  assert.match(sql, /united-states places already exist/);
});
```

- [ ] **Step 2: Run it.** `node --test scripts/usa-map/us2-sql.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `scripts/usa-map/render-us2-sql.mjs` (catalog part and CLI):

```js
// Renders the US-2 SQL from the wave (us2-wave.mjs). The committed files must
// equal this render (us2-sql.test.mjs), so a hand-edit shows up as a test
// failure, never as silent drift. No file contains begin/commit/rollback: the
// owner's applier owns the transaction (spec D24).
//
// Usage: node scripts/usa-map/render-us2-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { depthOf, loadTrees, us2Wave, US2_FILES, US2_ROLLBACK_FILES, US2_VERSIONS } from "./us2-wave.mjs";

export const sq = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
const US_WHERE = "canonical_key = 'united-states' or canonical_key like 'united-states.%'";

const refreshBlock = (label) => `do $$
declare
  t0 timestamptz := clock_timestamp();
  v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice '${label}: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
`;

export function catalogSql(wave) {
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perParent = valuesOf(countBy(wave.places.filter((p) => p.parent_key), (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us2_catalog v
  left join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  return `-- USA on the wine map, phase US-2: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 2).
--
-- Inserts the ${wave.places.length} US-2 places DRAFT: the united-states COUNTRY, the four wave
-- states (REGION, tier 1, one tile shard each), their umbrella AVAs (SUBREGION,
-- AVA/regional) and Central Valley, a navigation node that is not an AVA (D25).
-- Every row is rendered from the committed tree reports
-- (data/wine-map/usa-*-tree.json) by scripts/usa-map/render-us2-sql.mjs, and
-- us2-sql.test.mjs proves this file equals that render. Do not hand-edit.
--
-- DRAFT places are invisible to the app ("wine places verified read") and to
-- the tiles export (VERIFIED only). Boundaries are staged by
-- scripts/wine-map-sources/stage-usa-ava.mjs and everything flips at once in
-- ${US2_VERSIONS.promote}_usa_us2_promote.sql (D11, D12).
--
-- A migration that writes wine_places ends with the neighbour refresh in the
-- same transaction (CLAUDE.md standing rule). DRAFT places have no current
-- boundary, so they are never a neighbour and the cache comes back fresh.
--
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us2_catalog;
create temp table _us2_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text, depth int not null
) on commit drop;
insert into _us2_catalog values
${rows};

do $$
begin
  if exists (select 1 from public.wine_places where ${US_WHERE}) then
    raise exception 'US-2 catalog: united-states places already exist';
  end if;
end $$;

${insertAt(0)}
${insertAt(1)}
${insertAt(2)}
do $$
declare
  n int;
  v_text text;
begin
  select count(*) into n from public.wine_places where ${US_WHERE};
  if n <> ${wave.places.length} then
    raise exception 'US-2 catalog: expected ${wave.places.length} united-states places, got %', n;
  end if;

  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us2_catalog v
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
  if v_text is not null then
    raise exception 'US-2 catalog: rows differ from the tree reports: %', v_text;
  end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select kind::text as kind, count(*)::int as n from public.wine_places
                where ${US_WHERE} group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: kind counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key as parent, count(*)::int as n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                where p.canonical_key like 'united-states.%' group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: children per parent off: %', v_text; end if;
end $$;

${refreshBlock("US-2 catalog")}`;
}

async function main() {
  const wave = us2Wave(await loadTrees());
  const out = { [US2_FILES.catalog]: catalogSql(wave) };
  for (const [path, text] of Object.entries(out)) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

(`readFile` and `US2_ROLLBACK_FILES` are used by the later tasks' additions. Leave the imports in place; eslint's `no-unused-vars` must still pass, so if it complains now, add them in the task that uses them.)

- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us2-sql.mjs && node --test scripts/usa-map/us2-sql.test.mjs`. Expected: `wrote supabase/migrations/20260930084747_usa_us2_catalog.sql`, then 2 passing tests.

- [ ] **Step 5: Activity check** (read-only). Run this before this task's `--dry` and before every later run that writes the catalogue inside a rolled-back transaction:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node -e '
import("./scripts/wine-map-sources/read-only-client.mjs").then(({ withReadOnly }) => withReadOnly(async (c) => {
  const a = await c.query(`select pid, state, now() - query_start as for, left(query, 120) q from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid() and state <> $1 and query ~* $2`, ["idle", "wine_place|wine_boundary|refresh_wine_place"]);
  const r = await c.query(`select version, status, created_at from wine_map_releases where status = $1 and created_at > now() - interval $2`, ["BUILDING", "1 hour"]);
  const d = await c.query(`select count(*)::int n from wine_place_boundaries where quality_status = $1`, ["DRAFT"]);
  console.log(JSON.stringify({ active: a.rows, building: r.rows, draft_boundaries: d.rows[0].n }));
}))'
```

Expected: `{"active":[],"building":[],"draft_boundaries":0}`. If it is not, stop, wait, and re-check. Never run a rolled-back catalogue write while another session is writing the catalogue.

- [ ] **Step 6: Pre-flight and dry run.**
  - `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930084747_usa_us2_catalog.sql --check`. Expected: `PREFLIGHT OK`.
  - Then `--dry`. Expected: `DRY RUN OK`, plus a notice `US-2 catalog: neighbour refresh N rows in S s`.
  - Record N and S in the commit message.
  - **STOP RULE.** If the dry run fails with "refresh_wine_place_neighbours refused to publish the cache" (the live cache has been stale since 2026-09-20, cause unknown), stop the whole plan. Report the warning text and the output of this read-only query to the main session. The friend's live-only context function may be returning a non-VERIFIED neighbour. Nothing in US-2 can pass its asserts until that is fixed, and fixing it is not this plan's work (D21).

    ```sql
    select count(*) from wine_place_neighbours n
     where not exists (select 1 from wine_places p where p.id = n.neighbour_place_id and p.publication_status = 'VERIFIED')
    ```
  - If S exceeds 300, stop and report as well (spec §11).
- [ ] **Step 7: Commit** the renderer, the test and the rendered migration. Subject: "feat(usa-map): US-2 catalog migration, rendered from the tree reports (not applied)".

---

### Task 3: Generator extensions (friend's script: `--prelude`, and the article's grape and style texts)

**Files:**
- Create: `scripts/wine-map-sources/gen-place-profiles-sql.mjs`, `scripts/wine-map-sources/gen-place-profiles-sql.test.mjs`
- Modify: `scripts/wine-map-sources/gen-place-profiles-args.mjs` (add `prelude`), `scripts/wine-map-sources/gen-place-profiles-args.test.mjs`, `scripts/wine-map-sources/gen-place-profiles-migration.mjs`

**Interfaces:**
- Produces:
  - `genArgs(argv)` now also returns `prelude: string | null`.
  - `articleInsertLines(key, article) → string[]`. For an article without `grape_varieties` and `wine_styles`, it returns exactly the three lines the generator emits today. For one with either field, it returns the seven-column insert.
  - `--prelude <file>`: the generator opens a transaction, runs the file, does all its checks against that state, and **always** rolls back.

Why: the task asks for articles with all six fields, and `wine_place_articles.grape_varieties`/`wine_styles` exist and are read by `get_wine_place_context`. The generator could not emit them. `--prelude` lets the knowledge migration be generated and checked before the catalog is live (its check 1 needs the keys to exist). Default output is unchanged, so the friend's runs are unaffected. Tell them in the handoff (spec §17.6).

- [ ] **Step 1: Write the failing tests.** Append to `gen-place-profiles-args.test.mjs`:

```js
test("--prelude takes a file and defaults to null", () => {
  assert.equal(genArgs([], {}, "C:/r").prelude, null);
  assert.equal(genArgs(["--prelude", "supabase/migrations/x.sql"], {}, "C:/r").prelude, "supabase/migrations/x.sql");
  assert.throws(() => genArgs(["--prelude"], {}, "C:/r"), /--prelude needs a value/);
});
```

Create `gen-place-profiles-sql.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { articleInsertLines } from "./gen-place-profiles-sql.mjs";

const base = { description: "D's text", climate: "C", soils: "S", key_facts: ["a", "b's", "c"] };

test("an article without the two texts renders exactly as before", () => {
  assert.deepEqual(articleInsertLines("germany.ahr", base), [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)",
    "select id, 'D''s text', 'C', 'S', array['a', 'b''s', 'c']::text[], 'PUBLISHED'",
    "  from public.wine_places where canonical_key = 'germany.ahr';",
  ]);
});

test("grape_varieties and wine_styles add their columns", () => {
  assert.deepEqual(articleInsertLines("united-states", { ...base, grape_varieties: "G", wine_styles: "W" }), [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, grape_varieties, wine_styles, key_facts, editorial_status)",
    "select id, 'D''s text', 'C', 'S', 'G', 'W', array['a', 'b''s', 'c']::text[], 'PUBLISHED'",
    "  from public.wine_places where canonical_key = 'united-states';",
  ]);
});
```

- [ ] **Step 2: Run them.** `node --test scripts/wine-map-sources/gen-place-profiles-args.test.mjs scripts/wine-map-sources/gen-place-profiles-sql.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `gen-place-profiles-args.mjs`'s returned object, add `prelude: arg("--prelude", null),`. Add to the header comment: "--prelude <file> runs that SQL inside a transaction the generator always rolls back, so a knowledge migration can be generated for places a not-yet-applied catalog migration creates. Default unchanged."
  - Create `gen-place-profiles-sql.mjs`:

```js
// The generator's article insert, pure so it can be tested. An article that
// carries grape_varieties / wine_styles (the explorer shows them only when a
// place has no structured grape/style rows) gets those columns; any other
// article renders exactly as the generator always has.
export const sq = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);

export function articleInsertLines(key, a) {
  const facts = a.key_facts.map((f) => sq(f)).join(", ");
  if (a.grape_varieties === undefined && a.wine_styles === undefined) {
    return [
      "insert into public.wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)",
      `select id, ${sq(a.description)}, ${sq(a.climate)}, ${sq(a.soils)}, array[${facts}]::text[], 'PUBLISHED'`,
      `  from public.wine_places where canonical_key = ${sq(key)};`,
    ];
  }
  return [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, grape_varieties, wine_styles, key_facts, editorial_status)",
    `select id, ${sq(a.description)}, ${sq(a.climate)}, ${sq(a.soils)}, ${sq(a.grape_varieties ?? null)}, ${sq(a.wine_styles ?? null)}, array[${facts}]::text[], 'PUBLISHED'`,
    `  from public.wine_places where canonical_key = ${sq(key)};`,
  ];
}
```

  - In `gen-place-profiles-migration.mjs`:
    1. Destructure `prelude: PRELUDE` from `genArgs`.
    2. Import `articleInsertLines` from `./gen-place-profiles-sql.mjs`.
    3. After `await client.connect();`, insert:

       ```js
       if (PRELUDE) {
         await client.query("begin");
         await client.query(await readFile(`${REPO}/${PRELUDE}`, "utf8"));
         console.log(`prelude ${PRELUDE} applied inside a transaction that is rolled back`);
       }
       ```
    4. Replace the bare `await client.end();` (after step 4) with `if (PRELUDE) await client.query("rollback"); await client.end();`.
    5. In check 3, after the `description/climate/soils` loop, add:

       ```js
       for (const f of ["grape_varieties", "wine_styles"]) {
         if (a[f] !== undefined && (!a[f] || a[f].trim().length < 40)) problems.push(`${key}: article.${f} too short`);
       }
       ```
    6. Replace the three article `lines.push(...)` lines with `lines.push(...articleInsertLines(key, p.article));`.
    7. Add `[--prelude <file>]` to the usage comment.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then prove the default output is unchanged for the friend's data file: `node --env-file=.env.local scripts/wine-map-sources/gen-place-profiles-migration.mjs`. Expected: it ends "nothing left to do", or lists the same counts as before the change. Check-only, no write.
- [ ] **Step 5: Commit.** Subject: "feat(wine-map-sources): gen-place-profiles --prelude and article grape/style texts (default output unchanged)".

---

### Task 4: The US knowledge validator and the review-markdown renderer

**Files:**
- Create: `scripts/usa-map/usa-knowledge.mjs`, `scripts/usa-map/usa-knowledge.test.mjs`

**Interfaces:**
- Consumes: `us2Wave` (Task 1).
- Produces:
  - `validateUsaProfiles(source, wave) → string[]` (problems; empty means valid);
  - `reviewMarkdown({ source, wave, rehearsal }) → string`;
  - `migrationIsCurrent(source, migrationSql) → string[]`;
  - constants `ARTICLE_FIELDS`, `STYLE_LABELS`, `HYPE`, `BOUNDARY_CLAIM`.

**Data file shape** (`data/wine-map/place-profiles-usa.json`), for the generator and for these checks:

```json
{
  "_provenance": {
    "what": "…", "wave": "us2", "status": "DRAFT",
    "owner_approval": null,
    "written_in_session": "2026-09-29, from public sources only; no API batch (AGENTS.md)"
  },
  "_owner_questions": ["…"],
  "new_grapes": [{ "name": "Petite Sirah", "color": "RED", "description": "…", "skin_color": "…" }],
  "places": {
    "united-states": {
      "article": { "description": "…", "climate": "…", "soils": "…", "grape_varieties": "…", "wine_styles": "…", "key_facts": ["…", "…", "…"] },
      "styles": ["RED", "WHITE"],
      "grapes": [{ "name": "Cabernet Sauvignon" }, { "name": "Blaufränkisch", "note": "Sold as Lemberger" }],
      "sources": [{ "title": "27 CFR 4.25, Appellation of origin", "url": "https://www.ecfr.gov/…" }]
    }
  }
}
```

`sources` and `_owner_questions` are ignored by the generator and shown in the review file. When the owner answers OK, the main session sets `owner_approval` to `{ "answer": "OK", "date": "YYYY-MM-DD" }`.

- [ ] **Step 1: Write the failing tests** (`scripts/usa-map/usa-knowledge.test.mjs`). The fixture is a minimal valid file for the 16 keys, built in the test:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees, us2Wave } from "./us2-wave.mjs";
import { validateUsaProfiles, reviewMarkdown, migrationIsCurrent } from "./usa-knowledge.mjs";

const wave = us2Wave(await loadTrees());
const long = (s) => `${s} — a plain factual sentence long enough to pass the floor.`;
const valid = () => ({
  _provenance: { wave: "us2", status: "DRAFT", owner_approval: null },
  _owner_questions: [],
  new_grapes: [],
  places: Object.fromEntries(wave.places.map((p) => [p.key, {
    article: {
      description: p.navigation_node
        ? "Central Valley is a grouping on this map, not an AVA. " + long("It gathers eleven valley-floor AVAs")
        : long(p.name),
      climate: long("Climate"), soils: long("Soils"), grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: ["Fact one here", "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Cabernet Sauvignon" }],
    sources: [{ title: "27 CFR Part 9", url: "https://www.ecfr.gov/current/title-27/part-9" }],
  }])),
});

test("a complete file validates", () => assert.deepEqual(validateUsaProfiles(valid(), wave), []));

test("every wave place, in wave order, and nothing else", () => {
  const s = valid();
  delete s.places["united-states.oregon"];
  s.places["united-states.texas"] = s.places["united-states"];
  const p = validateUsaProfiles(s, wave);
  assert.ok(p.some((x) => /missing: united-states.oregon/.test(x)));
  assert.ok(p.some((x) => /not in the wave: united-states.texas/.test(x)));
});

test("all six article fields, 3-6 facts, grapes and styles and sources on every place", () => {
  const s = valid();
  s.places["united-states"].article.wine_styles = "short";
  s.places["united-states.california"].article.key_facts = ["one", "two"];
  s.places["united-states.oregon"].grapes = [];
  s.places["united-states.new-york"].styles = ["RED", "RED"];
  s.places["united-states.washington"].sources = [];
  const p = validateUsaProfiles(s, wave).join("\n");
  assert.match(p, /united-states: article.wine_styles missing or under 40/);
  assert.match(p, /united-states.california: 3-6 key facts/);
  assert.match(p, /united-states.oregon: at least one grape/);
  assert.match(p, /united-states.new-york: duplicate style/);
  assert.match(p, /united-states.washington: at least one source/);
});

test("copy rules: no hype, no boundary claims, no unsourced share", () => {
  const s = valid();
  s.places["united-states.california.north-coast"].article.description = long("A world-class region");
  s.places["united-states.oregon.willamette-valley"].article.soils = long("The official boundary follows");
  s.places["united-states.washington"].grapes = [{ name: "Merlot", share_pct: 20 }];
  const p = validateUsaProfiles(s, wave).join("\n");
  assert.match(p, /north-coast: hype word "world-class"/);
  assert.match(p, /willamette-valley: boundary claim/);
  assert.match(p, /united-states.washington: share_pct for Merlot needs share_source/);
});

test("Central Valley's first sentence says it is a grouping, not an AVA (D25)", () => {
  const s = valid();
  s.places["united-states.california.central-valley"].article.description = long("The Central Valley AVA is large");
  assert.match(validateUsaProfiles(s, wave).join("\n"), /central-valley: the first sentence must say it is a grouping on this map, not an AVA/);
});

test("the review file has one section per place in wave order, and the answer instructions", () => {
  const md = reviewMarkdown({ source: valid(), wave, rehearsal: null });
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads.slice(0, 16), wave.places.map((p) => p.breadcrumb));
  assert.match(md, /Reply \*\*OK\*\*/);
  assert.match(md, /Status: DRAFT, provisional copy/);
});

test("migrationIsCurrent flags text the migration does not carry", () => {
  const s = valid();
  const sql = "insert … 'Old text' …";
  assert.ok(migrationIsCurrent(s, sql).length > 0);
});
```

- [ ] **Step 2: Run.** `node --test scripts/usa-map/usa-knowledge.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** `scripts/usa-map/usa-knowledge.mjs`:

```js
// US knowledge (spec 2026-09-29 §10, §18): the rules place-profiles-usa.json
// must meet before its migration is generated, and the owner-review file. The
// US rule is stricter than gen-place-profiles-migration.mjs's: all six article
// fields, and grapes AND styles on every place (§8.4 step 3).
import { sq } from "../wine-map-sources/gen-place-profiles-sql.mjs";

export const ARTICLE_FIELDS = ["description", "climate", "soils", "grape_varieties", "wine_styles"];
export const STYLE_LABELS = Object.freeze({
  RED: "Red", WHITE: "White", ROSE: "Rosé", SPARKLING: "Sparkling", SWEET: "Sweet", FORTIFIED: "Fortified",
});
// §18 copy rules: plain English, no praise words, never "official boundary".
export const HYPE = /\b(stunning|world[- ]class|iconic|legendary|breathtaking|spectacular|superb|exceptional|famed|prestigious|finest|greatest|renowned|premier|unrivall?ed|unparalleled|best)\b/i;
export const BOUNDARY_CLAIM = /\b(official|legal) (boundary|boundaries|outline|outlines|border)\b/i;

const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/) ?? [s])[0];

export function validateUsaProfiles(source, wave) {
  const problems = [];
  const places = source?.places ?? {};
  const want = wave.places.map((p) => p.key);
  for (const k of want) if (!places[k]) problems.push(`missing: ${k}`);
  for (const k of Object.keys(places)) if (!want.includes(k)) problems.push(`not in the wave: ${k}`);
  const order = Object.keys(places).filter((k) => want.includes(k));
  if (order.join() !== want.filter((k) => places[k]).join()) problems.push("places are not in wave order");
  if (!["DRAFT", "APPROVED"].includes(source?._provenance?.status)) problems.push("_provenance.status must be DRAFT or APPROVED");
  const approval = source?._provenance?.owner_approval;
  if (approval !== null && !(approval?.answer && /^\d{4}-\d{2}-\d{2}$/.test(approval?.date ?? ""))) {
    problems.push("_provenance.owner_approval must be null or {answer, date}");
  }
  for (const g of source?.new_grapes ?? []) {
    if (!g.name || !["RED", "WHITE"].includes(g.color) || !g.description || g.description.length < 40) {
      problems.push(`new grape ${g.name}: name, color RED/WHITE and a 40+ character description`);
    }
  }
  for (const place of wave.places) {
    const p = places[place.key];
    if (!p) continue;
    const k = place.key;
    const a = p.article ?? {};
    for (const f of ARTICLE_FIELDS) {
      if (typeof a[f] !== "string" || a[f].trim().length < 40) problems.push(`${k}: article.${f} missing or under 40 characters`);
    }
    if (!Array.isArray(a.key_facts) || a.key_facts.length < 3 || a.key_facts.length > 6) problems.push(`${k}: 3-6 key facts`);
    for (const f of a.key_facts ?? []) if (typeof f !== "string" || f.length < 10 || f.length > 200) problems.push(`${k}: a key fact must be 10-200 characters`);
    const styles = p.styles ?? [];
    if (styles.length === 0) problems.push(`${k}: at least one style`);
    for (const s of styles) if (!STYLE_LABELS[s]) problems.push(`${k}: bad style ${s}`);
    if (new Set(styles).size !== styles.length) problems.push(`${k}: duplicate style`);
    const grapes = p.grapes ?? [];
    if (grapes.length === 0) problems.push(`${k}: at least one grape`);
    if (new Set(grapes.map((g) => g.name)).size !== grapes.length) problems.push(`${k}: duplicate grape`);
    for (const g of grapes) {
      if (g.share_pct != null && !g.share_source) problems.push(`${k}: share_pct for ${g.name} needs share_source`);
    }
    if (!Array.isArray(p.sources) || p.sources.length === 0) problems.push(`${k}: at least one source`);
    for (const s of p.sources ?? []) if (!s.title || !/^https:\/\//.test(s.url ?? "")) problems.push(`${k}: a source needs a title and an https url`);
    const texts = [...ARTICLE_FIELDS.map((f) => a[f] ?? ""), ...(a.key_facts ?? []), ...grapes.map((g) => g.note ?? "")];
    for (const t of texts) {
      const hype = t.match(HYPE);
      if (hype) problems.push(`${k}: hype word "${hype[0]}"`);
      if (BOUNDARY_CLAIM.test(t)) problems.push(`${k}: boundary claim ("${t.match(BOUNDARY_CLAIM)[0]}")`);
    }
    if (place.navigation_node) {
      const first = firstSentence(a.description ?? "");
      if (!/not an AVA/i.test(first) || !/grouping/i.test(first)) {
        problems.push(`${k}: the first sentence must say it is a grouping on this map, not an AVA`);
      }
    }
  }
  return problems;
}

/** Every article string and every place's grape/style count must be in the migration. */
export function migrationIsCurrent(source, sql) {
  const out = [];
  for (const [key, p] of Object.entries(source.places ?? {})) {
    for (const f of ARTICLE_FIELDS) if (p.article?.[f] && !sql.includes(sq(p.article[f]))) out.push(`${key}: article.${f} is not in the migration`);
    for (const fact of p.article?.key_facts ?? []) if (!sql.includes(sq(fact))) out.push(`${key}: a key fact is not in the migration`);
    const tuple = `(${sq(key)}, ${(p.styles ?? []).length}, ${(p.grapes ?? []).length}, 1)`;
    if (!sql.includes(tuple)) out.push(`${key}: expected counts ${tuple} not in the migration`);
    for (const g of p.grapes ?? []) if (!sql.includes(`where p.canonical_key = ${sq(key)} and g.name = ${sq(g.name)};`)) out.push(`${key}: grape ${g.name} not in the migration`);
  }
  for (const g of source.new_grapes ?? []) if (!sql.includes(sq(g.description))) out.push(`new grape ${g.name}: description not in the migration`);
  return out;
}

export function reviewMarkdown({ source, wave, rehearsal }) {
  const L = [];
  L.push("# United States, wave US-2: knowledge for the owner's review", "");
  L.push("**Status: DRAFT, provisional copy.** Nothing here is live. The places are DRAFT until the US-2 promote, and this text applies only after your OK (spec D19).", "");
  L.push("Reply **OK**, or quote a section heading and give the line-level correction. Corrections go into `data/wine-map/place-profiles-usa.json`, and the knowledge migration is regenerated from it.", "");
  L.push(`Places: ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  if ((source._owner_questions ?? []).length) {
    L.push("## Questions for you", "");
    for (const q of source._owner_questions) L.push(`- ${q}`);
    L.push("");
  }
  for (const place of wave.places) {
    const p = source.places[place.key];
    const a = p.article;
    const role = place.navigation_node ? "a grouping on this map, not an AVA" : place.is_appellation ? "AVA" : place.kind.toLowerCase();
    L.push(`## ${place.breadcrumb}`, "");
    L.push(`Name: **${place.name}** · key \`${place.key}\` · ${role}`, "");
    L.push(`**Description.** ${a.description}`, "");
    L.push(`**Climate.** ${a.climate}`, "");
    L.push(`**Soils.** ${a.soils}`, "");
    L.push(`**Grape varieties (text).** ${a.grape_varieties}`, "");
    L.push(`**Wine styles (text).** ${a.wine_styles}`, "");
    L.push("**Key facts**", "");
    for (const f of a.key_facts) L.push(`- ${f}`);
    L.push("", "**Grapes, in order**", "");
    p.grapes.forEach((g, i) => L.push(`${i + 1}. ${g.name}${g.note ? ` (${g.note})` : ""}${g.share_pct != null ? `, ${g.share_pct}% (${g.share_source})` : ""}`));
    L.push("", `**Styles:** ${p.styles.map((s) => STYLE_LABELS[s]).join(", ")}`, "");
    L.push("**Sources**", "");
    for (const s of p.sources) L.push(`- ${s.title}: ${s.url}`);
    L.push("");
  }
  if ((source.new_grapes ?? []).length) {
    L.push("## New grapes for the catalog", "");
    for (const g of source.new_grapes) L.push(`- **${g.name}** (${g.color.toLowerCase()}; skin ${g.skin_color ?? "n/a"}): ${g.description}`);
    L.push("");
  }
  if (rehearsal?.shortlist) {
    L.push("## Grape shortlist change (spec §10.3)", "");
    L.push(`The guess ladder and the answer-key form both call \`shortlistGrapesForRegion\`. From the promote on, a state's list comes from the map (the state plus every place beneath it, most-linked first) instead of \`region_grapes\`. Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. Ties keep the database's row order in the app, and are shown alphabetically here.`, "");
    L.push("| State | Before (`region_grapes`) | After (the map) |", "|---|---|---|");
    for (const [state, s] of Object.entries(rehearsal.shortlist)) {
      L.push(`| ${state} | ${s.before.join(", ")} | ${s.after.join(", ")} |`);
    }
    L.push("");
  }
  return `${L.join("\n")}\n`;
}
```

- [ ] **Step 4: Run.** Expected: PASS (7 tests).
- [ ] **Step 5: Commit.** Subject: "feat(usa-map): US knowledge validator and owner-review renderer".

---

### Task 5: Write the knowledge (in-session research; DRAFT owner copy)

**Files:**
- Create: `data/wine-map/place-profiles-usa.json`
- Modify: `.gitattributes` (add the line `data/wine-map/place-profiles-usa.json -text`)
- Test: `usa-knowledge.test.mjs` gains a test that validates the real file.

This is writing work, done by you in this session: WebSearch/WebFetch for sources, then your own prose. **No script generates text, and nothing calls the Anthropic API** (AGENTS.md).

Copy rules (§18):
- plain English, no hype and no praise words (the validator enforces a list);
- only facts a cited source supports;
- a figure only where it is published (cite it in `sources`);
- never "official/legal boundary";
- descriptions of 2–4 sentences, like Portugal's sub-regions ("what distinguishes it, and why you would care");
- `grape_varieties` and `wine_styles` are one or two plain sentences each;
- 3–5 key facts.

**Primary sources to use and cite** (fetch each and check every fact against it):
- TTB's established AVA list, https://www.ttb.gov/wine/established-avas;
- the eCFR text of each AVA's 27 CFR Part 9 section (URL form `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-9.30`);
- 27 CFR 4.25 (appellation of origin) and 4.23 (varietal labelling);
- the California Department of Food and Agriculture / USDA NASS California Grape Acreage Report and Grape Crush Report;
- Wine Institute;
- Washington State Wine Commission;
- Oregon Wine Board and the Oregon Vineyard and Winery Report (plus OAR 845-010-0915 for Oregon's 90% varietal rule);
- New York Wine & Grape Foundation;
- the Lodi Winegrape Commission;
- the Finger Lakes Wine Alliance and Long Island Wine Council;
- the UC Davis AVA files' own descriptions.

The Oxford Companion and WSET material may confirm a fact, but cite a fetchable page for each figure.

**Per-place brief.** The grapes (in this order unless a source says otherwise) and styles are the plan's decision; change them only with a cited reason, and note it in the commit. The "cover" column lists facts to check and use if a source confirms them. Drop any that no source confirms.

| Key | Grapes, in order (note) | Styles | Cover (verify each) |
|---|---|---|---|
| `united-states` | Cabernet Sauvignon, Chardonnay, Pinot Noir, Zinfandel, Merlot, Riesling, Syrah, Sauvignon Blanc | RED, WHITE, ROSE, SPARKLING, SWEET | Wine is made in all 50 states. The AVA system dates from 1980 (the first AVA, Augusta in Missouri, June 1980). TTB counts 280 established AVAs. An AVA name needs ≥85% of the grapes from the AVA; a state or county name needs 75% (4.25). A varietal label needs 75% (4.23). California makes most of the country's wine. |
| `united-states.california` | Cabernet Sauvignon, Chardonnay, Pinot Noir, Zinfandel, Merlot, Sauvignon Blanc, Syrah, Petite Sirah | RED, WHITE, ROSE, SPARKLING | Bearing acreage (CDFA 2024). The most-planted red and white. A Mediterranean climate cooled by the Pacific and fog, with valleys open to the ocean. A "California" appellation requires 100% California grapes by state law. The 1976 Paris tasting. |
| `…california.north-coast` | Cabernet Sauvignon, Chardonnay, Pinot Noir, Zinfandel, Merlot, Sauvignon Blanc | RED, WHITE, SPARKLING | Established 1983 (27 CFR 9.30). Parts of Lake, Marin, Mendocino, Napa, Solano and Sonoma counties. Holds Napa Valley and Sonoma's AVAs. Area about 13,300 km² (tree report; use a CFR or TTB acreage figure if one is published). |
| `…california.central-coast` | Chardonnay, Pinot Noir, Cabernet Sauvignon, Syrah, Zinfandel, Grenache | RED, WHITE, ROSE, SPARKLING | Established 1985 (9.75). From the San Francisco Bay area south to Santa Barbara County. Santa Barbara's east–west transverse ranges channel ocean air. Holds Paso Robles, Santa Lucia Highlands and Sta. Rita Hills. |
| `…california.central-valley` | Zinfandel, Cabernet Sauvignon, Chardonnay, Petite Sirah, Chenin Blanc (Clarksburg), Muscat (Madera dessert wines) | RED, WHITE, SWEET, FORTIFIED | **The first sentence says it is a grouping on this map, not an AVA** (D25). The eleven member AVAs (Lodi, Clarksburg, Madera and the others in the Task 1 list). Most of California's grape tonnage comes from the valley (cite the Crush Report). Lodi's old-vine Zinfandel. Drop FORTIFIED/SWEET if no source supports Madera's dessert wines. |
| `…california.sierra-foothills` | Zinfandel, Barbera, Syrah, Petite Sirah | RED, WHITE | Established 1987 (9.120). The Gold Rush history. Old-vine Zinfandel in Amador. Elevation, and granite and volcanic soils. Holds El Dorado and California Shenandoah Valley. |
| `…california.south-coast` | Cabernet Sauvignon, Syrah, Chardonnay, Sauvignon Blanc | RED, WHITE, ROSE | Established 1985 (9.104). Its counties (per the CFR). Temecula Valley. Pacific air through gaps in the coastal ranges. |
| `united-states.new-york` | Riesling, Chardonnay, Cabernet Franc, Merlot, Pinot Noir, Gewürztraminer, Blaufränkisch (sold as Lemberger) | WHITE, RED, SPARKLING, SWEET, ROSE | Concord and other native and hybrid grapes dominate acreage, largely for juice (**mention it in the text only**; see the owner questions). Konstantin Frank's vinifera plantings in the Finger Lakes (1950s–60s). TTB's AVA count for New York. |
| `…new-york.finger-lakes` | Riesling, Cabernet Franc, Pinot Noir, Gewürztraminer, Chardonnay, Blaufränkisch (Lemberger) | WHITE, RED, SPARKLING, SWEET, ROSE | Established 1982 (9.34). Deep glacial lakes (Seneca, Cayuga, Keuka) moderate the cold. Shale and glacial till. Riesling is the flagship. Holds Seneca Lake and Cayuga Lake. |
| `…new-york.long-island` | Merlot, Cabernet Franc, Chardonnay, Sauvignon Blanc, Cabernet Sauvignon | RED, WHITE, ROSE, SPARKLING | Established 2001 (9.170). Holds North Fork of Long Island (1986) and The Hamptons, Long Island (1985). A maritime climate between Long Island Sound and the Atlantic. Sandy glacial outwash soils. The first commercial vineyard in 1973. |
| `united-states.oregon` | Pinot Noir, Pinot Gris, Chardonnay, Riesling, Syrah, Cabernet Sauvignon, Tempranillo | RED, WHITE, ROSE, SPARKLING | Planted acreage (Oregon Vineyard and Winery Report). Pinot Noir's share of plantings. David Lett's Pinot Noir in the Dundee Hills, 1965–66. Oregon's 90% varietal rule. |
| `…oregon.willamette-valley` | Pinot Noir, Pinot Gris, Chardonnay, Pinot Blanc, Riesling | RED, WHITE, ROSE, SPARKLING | Established 1983 (9.90). The Coast Range rain shadow and the Van Duzer Corridor. Volcanic Jory, marine-sedimentary Willakenzie and wind-blown Laurelwood soils. Its nested AVAs (TTB count). |
| `…oregon.southern-oregon` | Pinot Noir, Syrah, Tempranillo, Cabernet Sauvignon, Merlot, Chardonnay, Viognier | RED, WHITE, ROSE | Established 2004 (9.179). The Umpqua and Rogue valleys, warmer and drier than the Willamette. Tempranillo planted there from the 1990s (cite a source). |
| `united-states.washington` | Cabernet Sauvignon, Merlot, Chardonnay, Riesling, Syrah, Cabernet Franc, Sauvignon Blanc | RED, WHITE, ROSE, SWEET | Acreage (Washington State Wine Commission). Ranks second among the states for wine production (cite). The Cascade rain shadow and irrigated desert. Long summer days near 46°N. Many own-rooted vines in sandy soils (cite). TTB's AVA count. |
| `…washington.columbia-valley` | Cabernet Sauvignon, Merlot, Chardonnay, Riesling, Syrah | RED, WHITE, ROSE, SWEET | Established 1984 (9.74). Spans Washington and Oregon; say in the text that it also covers part of Oregon, since it is keyed under Washington. The Missoula floods' silt and sand over basalt. Holds Yakima Valley, Red Mountain and Walla Walla Valley. |
| `…washington.puget-sound` | Müller-Thurgau, Pinot Gris, Pinot Noir | WHITE, RED, SPARKLING | Established 1995 (9.151). Cool and maritime, west of the Cascades. Small plantings. Madeleine Angevine and Siegerrebe named in the text only; see the owner questions. |

**New grape:** Petite Sirah, in `new_grapes` with `color` "RED", `skin_color` "thick, blue-black", and a 2–3 sentence description (it is Durif, a Syrah × Peloursin cross; deep colour and firm tannin; its California history; cite).

**Owner questions** (`_owner_questions`), exactly these three:
1. "New York: list Concord (and other native or hybrid grapes such as Niagara and Seyval Blanc) as grapes? They dominate New York's acreage but mostly go to juice. Today the articles mention them in text only, and no catalog row is added (spec §10.1: Concord only if you want it)."
2. "Puget Sound: add Madeleine Angevine and Siegerrebe to the grape catalog and list them? They are the region's signature whites; today they are named in the text only."
3. "Central Valley: its styles include Sweet and Fortified for Madera's dessert wines. Keep them, or keep the grouping to Red and White?"

- [ ] **Step 1:** Add the `.gitattributes` line. Then write the file with LF endings, in wave order (the Task 1 key list), with `_provenance.status "DRAFT"` and `owner_approval null`.
- [ ] **Step 2: Add a test** to `usa-knowledge.test.mjs`:

```js
test("the committed US knowledge file meets the US rule", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  assert.deepEqual(validateUsaProfiles(source, wave), []);
  assert.deepEqual(source.new_grapes.map((g) => g.name), ["Petite Sirah"]);
});
```

(add `import { readFile } from "node:fs/promises";` at the top).
- [ ] **Step 3: Run it.** `node --test scripts/usa-map/usa-knowledge.test.mjs`. Expected: PASS. Fix the content, not the rules, until it passes.
- [ ] **Step 4: Resolve grape names against live** (read-only):

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node -e '
import("./scripts/wine-map-sources/read-only-client.mjs").then(({ withReadOnly }) => withReadOnly(async (c) => {
  const s = JSON.parse(require("node:fs").readFileSync("data/wine-map/place-profiles-usa.json", "utf8"));
  const names = [...new Set(Object.values(s.places).flatMap((p) => p.grapes.map((g) => g.name)))];
  const { rows } = await c.query("select name from grapes where name = any($1::text[])", [names]);
  const have = new Set(rows.map((r) => r.name));
  console.log(JSON.stringify({ missing: names.filter((n) => !have.has(n) && !s.new_grapes.some((g) => g.name === n)) }));
}))'
```

Expected: `{"missing":[]}`.
- [ ] **Step 5: Commit** the data file, `.gitattributes` and the test. Subject: "data(usa-map): US-2 knowledge, 16 places (DRAFT copy for the owner)". Say in the body that every text is provisional.

---

### Task 6: Generate the knowledge migration

**Files:**
- Create (generated): `supabase/migrations/20260930094747_usa_us2_knowledge.sql`
- Test: `usa-knowledge.test.mjs`, "the knowledge migration is current"

- [ ] **Step 1:** Run the activity check (Task 2 Step 5).
- [ ] **Step 2: Generate** with the catalog as the rolled-back prelude:

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/gen-place-profiles-migration.mjs --source data/wine-map/place-profiles-usa.json --bare --write --version 20260930094747 --name usa_us2_knowledge --prelude supabase/migrations/20260930084747_usa_us2_catalog.sql
```

Expected:
- `prelude … rolled back`;
- `16 places to write (united-states 16)`;
- a style/grape tally, `16 articles`, `1 new grapes`;
- `wrote …/20260930094747_usa_us2_knowledge.sql`.

The run holds the neighbour state row for the catalog's refresh time (about 1–2 min).
- [ ] **Step 3: Add the currency test:**

```js
test("the knowledge migration is current with the data file (Review Focus 3)", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  const sql = await readFile("supabase/migrations/20260930094747_usa_us2_knowledge.sql", "utf8");
  assert.deepEqual(migrationIsCurrent(source, sql.replace(/\r\n/g, "\n")), []);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
});
```

(import `topLevelTransactionStatements` from `../migration-preflight.mjs`). Then prove it bites: change one word of one description in the JSON, run the test and expect FAIL naming that key's `article.description`, then revert the word.
- [ ] **Step 4:** Run `$APPLIER <knowledge file> --check`. Expected: `PREFLIGHT OK`. There is no standalone `--dry` here: the file needs the catalog's places, so Task 14's rehearsal dry-runs it.
- [ ] **Step 5: Commit.** Subject: "feat(usa-map): US-2 knowledge migration, generated with --bare (not applied)".

---

### Task 7: Stage library, the pure part

**Files:**
- Create: `scripts/wine-map-sources/usa-stage-lib.mjs`, `scripts/wine-map-sources/usa-stage-lib.test.mjs`

**Interfaces:**
- Produces these constants:
  - `SIMPLIFY_TOLERANCE = 0.0002`, `CONTAINMENT_BUFFER_DEG = 0.05`, `CONTAINMENT_MIN = 0.995`, `AREA_DRIFT_MAX = 0.15`, `AREA_MATCH_MAX = 0.001`;
  - `STATE_WINDOWS`, `COUNTRY_WINDOW`;
  - `UCD_NAMESPACE = "UCD_TTB_AVA"`, `NE_NAMESPACE = "NATURAL_EARTH"`;
  - `COUNTRY_ARTIFACT = { path: "data/wine-map/united-states-lower48-ne50m.geojson", sha256: "CF02FF8E8B44CE08745CA75A1BE72F4F0654F81E7B5553502560E80E603BB0D4" }`.
- Produces these functions:
  - `datumCheck(toleranceDeg, northLat) → { metres, required, ok }`;
  - `insideWindow(bbox, window) → boolean`;
  - `rawObjectPath(commit, file) → string`;
  - `uploadDecision(existingSha | null, localSha) → "upload" | "skip"` (throws on a mismatch);
  - `sittingGate(facts) → string[]`.

- [ ] **Step 1: Write the failing test** (`usa-stage-lib.test.mjs`):

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import {
  COUNTRY_ARTIFACT, STATE_WINDOWS, datumCheck, insideWindow, rawObjectPath, sittingGate, uploadDecision,
} from "./usa-stage-lib.mjs";

test("D10: 0.0002° is at least five times the 2 m datum shift at every state's northern edge", () => {
  for (const [code, w] of Object.entries(STATE_WINDOWS)) {
    const r = datumCheck(0.0002, w.maxLat);
    assert.ok(r.ok, `${code}: ${r.metres.toFixed(1)} m`);
    assert.equal(r.required, 10);
  }
  assert.equal(datumCheck(0.0001, 49.1).ok, false, "0.0001° at 49°N is ~7.3 m, under 10 m");
});

test("windows hold the committed state outlines and umbrella AVAs", () => {
  assert.ok(insideWindow([-124.372, 32.533, -114.125, 42.001], STATE_WINDOWS.CA));
  assert.ok(insideWindow([-121.297, 45.218, -117.039, 48.292], STATE_WINDOWS.WA), "Columbia Valley reaches into Oregon");
  assert.ok(insideWindow([-73.767, 40.573, -71.856, 41.292], STATE_WINDOWS.NY), "Long Island");
  assert.equal(insideWindow([2.35, 48.85, 2.36, 48.86], STATE_WINDOWS.NY), false, "Paris");
});

test("raw object paths are pinned by commit and file", () => {
  assert.equal(rawObjectPath("355f7da3cd6c4020fff736b7517a4a669fed7730", "CA_avas.geojson"),
    "UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/CA_avas.geojson");
  assert.throws(() => rawObjectPath("main", "CA_avas.geojson"), /not a commit sha/);
  assert.throws(() => rawObjectPath("355f7da3cd6c4020fff736b7517a4a669fed7730", "../x"), /not a UC Davis state file/);
});

test("Review Focus 5: an existing object is skipped when equal and never overwritten when different", () => {
  assert.equal(uploadDecision(null, "AB"), "upload");
  assert.equal(uploadDecision("ab", "AB"), "skip");
  assert.throws(() => uploadDecision("CD", "AB"), /refusing to overwrite/);
});

test("Review Focus 1 and 2: the sitting gate", () => {
  const ok = {
    versions: { catalog: "c", knowledge: "k" }, catalogRecorded: true, knowledgeRecorded: true,
    promoteRecorded: false, ownerApproval: { answer: "OK", date: "2026-10-01" }, treeMatches: true,
    usBoundaries: 0, otherDraftBoundaries: 0, buildingReleases: 0,
  };
  assert.deepEqual(sittingGate(ok), []);
  const r = sittingGate({ ...ok, catalogRecorded: false, ownerApproval: null, usBoundaries: 16, otherDraftBoundaries: 3, buildingReleases: 1, treeMatches: false });
  assert.equal(r.length, 6);
  assert.ok(r.some((x) => /someone else is mid-batch/.test(x)));
  assert.ok(r.some((x) => /tiles run is in flight/.test(x)));
  assert.ok(r.some((x) => /already exist/.test(x)));
});

test("the country artifact is the pinned one", async () => {
  assert.equal(sha256hex(await readFile(COUNTRY_ARTIFACT.path)), COUNTRY_ARTIFACT.sha256);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the pure part of `usa-stage-lib.mjs`:

```js
// Stage rules for the USA map (spec 2026-09-29 §8.2, D9, D10, D15, D25). The
// pure half is tested in usa-stage-lib.test.mjs; stageWave (Task 8) is the
// database half, shared by stage-usa-ava.mjs and the rehearsal.
export const SIMPLIFY_TOLERANCE = 0.0002;
export const CONTAINMENT_BUFFER_DEG = 0.05;
export const CONTAINMENT_MIN = 0.995;
export const AREA_DRIFT_MAX = 0.15;
export const AREA_MATCH_MAX = 0.001;
export const UCD_NAMESPACE = "UCD_TTB_AVA";
export const NE_NAMESPACE = "NATURAL_EARTH";
const DATUM_SHIFT_M = 2;
const DATUM_FACTOR = 5;
const METRES_PER_DEGREE = 111320;
// Padded around the committed outlines. WA reaches 45.1°N because Columbia
// Valley, keyed under Washington, runs into Oregon.
export const STATE_WINDOWS = Object.freeze({
  CA: Object.freeze({ minLon: -124.6, minLat: 32.4, maxLon: -114.0, maxLat: 42.1 }),
  WA: Object.freeze({ minLon: -124.9, minLat: 45.1, maxLon: -116.8, maxLat: 49.1 }),
  OR: Object.freeze({ minLon: -124.7, minLat: 41.9, maxLon: -116.4, maxLat: 46.4 }),
  NY: Object.freeze({ minLon: -79.9, minLat: 40.4, maxLon: -71.7, maxLat: 45.1 }),
});
export const COUNTRY_WINDOW = Object.freeze({ minLon: -125, minLat: 24, maxLon: -66.5, maxLat: 49.5 });
export const COUNTRY_ARTIFACT = Object.freeze({
  path: "data/wine-map/united-states-lower48-ne50m.geojson",
  sha256: "CF02FF8E8B44CE08745CA75A1BE72F4F0654F81E7B5553502560E80E603BB0D4",
});
export const STATES_ARTIFACT_PATH = "data/wine-map/usa-states-ne50m.geojson";

/** D10: the tolerance, in metres of longitude at the northern edge, is >= 5 x the 2 m datum shift. */
export function datumCheck(toleranceDeg, northLat) {
  const metres = toleranceDeg * METRES_PER_DEGREE * Math.cos((northLat * Math.PI) / 180);
  const required = DATUM_SHIFT_M * DATUM_FACTOR;
  return { metres, required, ok: metres >= required };
}

export function insideWindow([minx, miny, maxx, maxy], w) {
  return minx >= w.minLon && miny >= w.minLat && maxx <= w.maxLon && maxy <= w.maxLat;
}

export function rawObjectPath(commit, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a commit sha: ${commit}`);
  if (!/^[A-Z]{2}_avas\.geojson$/.test(file)) throw new Error(`not a UC Davis state file: ${file}`);
  return `${UCD_NAMESPACE}/${commit}/${file}`;
}

/** Storage uploads are not transactional: same bytes skip, other bytes refuse. */
export function uploadDecision(existingSha, localSha) {
  if (existingSha === null) return "upload";
  if (existingSha.toUpperCase() === localSha.toUpperCase()) return "skip";
  throw new Error(`the stored object's sha256 ${existingSha} is not the pinned ${localSha}; refusing to overwrite`);
}

/** §8.2 / §17: every reason --stage must not run now. Empty means go. */
export function sittingGate(f) {
  const r = [];
  if (!f.catalogRecorded) r.push(`catalog migration ${f.versions.catalog} is not recorded live`);
  if (!f.knowledgeRecorded) r.push(`knowledge migration ${f.versions.knowledge} is not recorded live`);
  if (!f.ownerApproval) r.push("place-profiles-usa.json carries no owner approval (_provenance.owner_approval)");
  if (!f.treeMatches) r.push("the recomputed tree differs from the committed tree reports");
  if (f.usBoundaries > 0) r.push(`${f.usBoundaries} united-states boundaries already exist (promote, or run the unstage file, first)`);
  if (f.otherDraftBoundaries > 0) r.push(`${f.otherDraftBoundaries} DRAFT boundaries outside united-states: someone else is mid-batch`);
  if (f.buildingReleases > 0) r.push(`${f.buildingReleases} release(s) BUILDING in the last hour: a tiles run is in flight`);
  if (f.promoteRecorded) r.push("the promote is already recorded");
  return r;
}
```

- [ ] **Step 4: Run.** Expected: PASS (6 tests).
- [ ] **Step 5: Commit.** Subject: "feat(wine-map-sources): USA stage rules (windows, datum, uploads, sitting gate)".

---

### Task 8: `stageWave` and `stage-usa-ava.mjs` (dry run only)

**Files:**
- Modify: `scripts/wine-map-sources/usa-stage-lib.mjs` (add `stageWave`)
- Create: `scripts/wine-map-sources/stage-usa-ava.mjs`

**Interfaces:**
- Consumes: Task 1's `us2Wave`, `loadTrees`, `US2_FILES`, `US2_VERSIONS` and `STATE_SLUGS`; Task 7's constants; from `lib.mjs`, `sha256hex`, `releaseVersion`, `attributionKeyFor` and `SUPABASE_URL`; from `build-usa-tree-reports.mjs`, `loadInputs`, `buildReports` and `reportPath`; from `usa-tree.mjs`, `buildUsaTree`.
- Produces: `stageWave(client, ctx) → report[]`. It runs inside the caller's open transaction and never begins, commits or rolls back. `ctx` is `{ wave, artifacts, statesFc, countryFc, pins, revision, importer, log }`, where:
  - `artifacts` is `Map<path, FeatureCollection>`;
  - `pins` is `{ ucd: Map<fileName, pin>, admin0: pin, admin1: pin }`, from `usa-sources.json`.

  Each report row is `{ key, role, npoints, nparts, km2, raw_km2, drift, containment, datum_m, bbox }`.

**What `stageWave` does, in order.** Each check throws with the key in its message.

1. `select count(*)` of boundaries on `united-states%` places must be 0. Otherwise it throws "united-states boundaries already exist".
2. **Catalog fidelity.** Every wave place exists with the wave's kind, name, slug, tier, zooms, sort order, parent key and classification, and is `DRAFT`. Otherwise it throws "catalog differs from the wave: <keys>".
3. **Build each shape** in SQL:
   - the country: the country artifact geometry as is, with no simplification (NE is already at 4 decimals);
   - each state: that state's feature from `usa-states-ne50m.geojson`, with no simplification;
   - each umbrella AVA: the feature with that `ava_id` in its keyed state's artifact, then `ST_SimplifyPreserveTopology(…, 0.0002)`, `ST_MakeValid` and MultiPolygon;
   - Central Valley: `ST_UnaryUnion` of its 11 members' geometries from the California artifact, simplified at 0.0002, then unioned back with the raw union so no member is ever cut (derive-boundary.mjs's coverage union), and MultiPolygon.
4. **Check each shape.** The shape is valid and not empty, and `ST_Covers(g, ST_PointOnSurface(g))` holds. Its bbox is inside its window: the country's in `COUNTRY_WINDOW`, the others in their state's `STATE_WINDOWS`.
5. **Check the AVA-based shapes.** For the umbrella AVAs and Central Valley:
   - `|km2 − raw_km2| / raw_km2 < AREA_DRIFT_MAX`;
   - `datumCheck(SIMPLIFY_TOLERANCE, window.maxLat).ok`.

   For the umbrella AVAs only, the unsimplified area must match the tree report: `|raw_km2 − ucd.area_km2| / ucd.area_km2 < AREA_MATCH_MAX`, since the report measured the same normalized geometry.
6. **Containment**, the §8.2 land-based, buffered share, for every umbrella AVA and Central Valley:

   `share = area(g ∩ buffer(∪ legal states, 0.05)) / area(g ∩ buffer(∪ all 13 states, 0.05))`

   It uses the whole committed states file, so water counts toward neither side. The legal states are `ucd.legal_states`, or `[state]` for Central Valley. The share must be ≥ `CONTAINMENT_MIN`.
7. **Insert** each place's source, snapshot and boundary in one statement (SQL below). The boundary is `DRAFT` and `is_current = false`. On conflict, an existing snapshot with the same `(source_id, source_revision, normalized_checksum_sha256)` is reused: snapshots are immutable by trigger and cannot be deleted, so a re-stage after an unstage must reuse them.
8. **Final assert:** exactly `wave.places.length` DRAFT, non-current boundaries on `united-states%` places.

**Row values per role.** `sha(p)` is `sha256hex` of the committed file at path `p`. Every snapshot's `importer_version` is `ctx.importer`, and every boundary's `revision` is `ctx.revision`.

- **Country** (`united-states`):
  - **source:** namespace `NATURAL_EARTH`, feature id `ne_50m_admin_0_countries_lakes:USA`, authority "Natural Earth";
  - **snapshot:** source_revision = `pins.admin0.commit`; retrieved_at, source_url and licence from `pins.admin0`; `raw_snapshot_uri` and `raw_checksum_sha256` both null; normalized artifact `COUNTRY_ARTIFACT.path` with `COUNTRY_ARTIFACT.sha256`;
  - **provenance_note:** "Natural Earth 1:50m admin_0_countries_lakes, ADM0_A3=USA, filtered to the lower 48 (components whose outer ring lies fully inside lon [-125,-66.5], lat [24,49.5]; Alaska and Hawaii excluded), rounded to 4 decimals. The raw feature is committed as data/wine-map/united-states-ne50m-raw.geojson.";
  - **boundary:** method `MANUAL`; `source_feature_refs` `{"adm0_a3":"USA"}`; `generation_parameters` `{"engine":"natural-earth-extract","ne_commit":…,"variant":"50m_lakes","coordinate_precision":4,"component_filter":"outer ring fully inside lon [-125,-66.5], lat [24,49.5]"}`.
- **States:**
  - **source:** namespace `NATURAL_EARTH`, feature id `ne_50m_admin_1_states_provinces_lakes:US-<code>`, authority "Natural Earth";
  - **snapshot:** revision `pins.admin1.commit`; raw null/null; normalized artifact `usa-states-ne50m.geojson` with its sha;
  - **provenance_note:** "Natural Earth 1:50m admin_1_states_provinces_lakes, <name>, rounded to 4 decimals (the lakes variant, so the Great Lakes are not painted).";
  - **boundary:** method `MANUAL`; refs `{"postal":code,"name":name}`; gp `{"engine":"natural-earth-extract","ne_commit":…,"variant":"50m_lakes","coordinate_precision":4}`.
- **Umbrella AVA:**
  - **source:** namespace `UCD_TTB_AVA`, feature id = `ucd_ava_id`, authority "UC Davis Library AVA Digitizing Project (after 27 CFR Part 9)";
  - **snapshot:** revision = the UC Davis commit; retrieved_at, url and licence from `pins.ucd.get(<CODE>_avas.geojson)`; raw_snapshot_uri `storage://wine-map-sources/${rawObjectPath(commit, file)}` with the pin's sha256; normalized artifact = the keyed state's artifact path and its sha;
  - **provenance_note:** "UC Davis AVA Digitizing Project, <name> (<cfr_section>), current boundary; normalized in <artifact> (Douglas-Peucker 0.0001°, 5 decimals; see its _provenance). A generalized digitization of 27 CFR Part 9, not TTB's legal boundary (spec D9).";
  - **boundary:** method `GENERALIZED_FROM_OFFICIAL_SOURCE`; refs `{"ucd_ava_id","name","cfr_section"}`; gp `{"engine":"ucd-ava-digitization","ucd_commit":…,"simplify_tolerance":0.0002,"coordinate_precision":6,"crs_in":"EPSG:4269","crs_out":"EPSG:4326","transform":"identity","datum_check_m":<metres rounded to 0.1>,"area_km2":<km2 rounded to 0.001>,"area_drift":<drift rounded to 0.0001>}`, plus `"display":"outline"` when the key is in `wave.outlineKeys`.
- **Central Valley:**
  - **source:** namespace `UCD_TTB_AVA`, feature id `derived:central-valley`, the same authority;
  - **snapshot:** the California raw pin and artifact;
  - **provenance_note:** "Central Valley is a navigation node on this map, not an AVA (spec D25). Its outline is the union of its 11 member AVAs' UC Davis geometries (members in generation_parameters), simplified with a coverage union so no member is cut.";
  - **boundary:** method `DERIVED_FROM_DESCENDANTS`; refs `{"members":[…]}`; gp `{"engine":"ucd-ava-derived-union","members":[…],"simplify_tolerance":0.0002,"coverage_union":true,"coordinate_precision":6,"crs_in":"EPSG:4269","crs_out":"EPSG:4326","transform":"identity","display":"outline"}`.

- [ ] **Step 1: Implement `stageWave`.** Put this SQL in `usa-stage-lib.mjs`. Keep the query shapes exactly as below, because the promote re-checks them.

```js
const GEOM = (p) => `extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(${p}), 4326)), 3)`;
const METRICS = (g) => `extensions.ST_AsGeoJSON(${g}, 6) geojson, extensions.ST_NPoints(${g}) npoints,
  extensions.ST_NumGeometries(${g}) nparts, extensions.ST_IsValid(${g}) valid, extensions.ST_IsEmpty(${g}) is_empty,
  extensions.ST_Covers(${g}, extensions.ST_PointOnSurface(${g})) covers_label,
  extensions.ST_XMin(extensions.Box3D(${g})) minx, extensions.ST_YMin(extensions.Box3D(${g})) miny,
  extensions.ST_XMax(extensions.Box3D(${g})) maxx, extensions.ST_YMax(extensions.Box3D(${g})) maxy,
  extensions.ST_Area(${g}::extensions.geography) / 1e6 km2`;

// $1 geometry json, $2 tolerance (0 = keep as is)
export const BUILD_SQL = `
with raw as (select extensions.ST_Multi(${GEOM("$1")}) g),
built as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(
            case when $2::float8 > 0 then extensions.ST_SimplifyPreserveTopology(raw.g, $2) else raw.g end), 3)) g from raw)
select ${METRICS("built.g")}, extensions.ST_Area(raw.g::extensions.geography) / 1e6 raw_km2 from raw, built`;

// $1 jsonb array of member geometries, $2 tolerance
export const DERIVED_SQL = `
with m as (select ${GEOM("x::text")} g from jsonb_array_elements($1::jsonb) x),
raw as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_UnaryUnion(extensions.ST_Collect(g)), 3)) g from m),
simp as (select extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(raw.g, $2)), 3) g from raw),
built as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_Union(simp.g, raw.g)), 3)) g from simp, raw)
select ${METRICS("built.g")}, extensions.ST_Area(raw.g::extensions.geography) / 1e6 raw_km2 from raw, built`;

// $1 jsonb [{key, legal:[codes], geometry}], $2 jsonb [{code, geometry}] (all 13 states), $3 buffer
export const CONTAINMENT_SQL = `
with a as (select x->>'key' key, x->'legal' legal, ${GEOM("(x->'geometry')::text")} g from jsonb_array_elements($1::jsonb) x),
s as (select f->>'code' code, extensions.ST_Buffer(${GEOM("(f->'geometry')::text")}, $3) bg from jsonb_array_elements($2::jsonb) f),
u as (select extensions.ST_Union(bg) bg from s)
select a.key,
  extensions.ST_Area(extensions.ST_Intersection(a.g,
    (select extensions.ST_Union(s.bg) from s where s.code in (select jsonb_array_elements_text(a.legal)))))
  / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, u.bg)), 0) as share
from a cross join u order by a.key`;

// One place's source + snapshot (reused if identical) + DRAFT boundary.
export const INSERT_SQL = `
with source as (
  insert into public.wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
  values ($1, $2, $3, 'United States')
  on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
  returning id),
ins as (
  insert into public.wine_boundary_source_snapshots (source_id, source_revision, retrieved_at, source_url, licence,
    raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256, provenance_note, importer_version)
  select source.id, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13 from source
  on conflict (source_id, source_revision, normalized_checksum_sha256) do nothing
  returning id),
snapshot as (
  select id from ins
  union all
  select s.id from public.wine_boundary_source_snapshots s, source
   where s.source_id = source.id and s.source_revision = $4 and s.normalized_checksum_sha256 = $11
     and not exists (select 1 from ins)),
geom as (select extensions.ST_Multi(${GEOM("$14")}) g)
insert into public.wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
select place.id, snapshot.id, $15::public.wine_boundary_method, 'DRAFT', geom.g, extensions.ST_PointOnSurface(geom.g),
       array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
             extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
       $16::jsonb, $17::jsonb, $18, false, null
  from public.wine_places place, snapshot, geom
 where place.canonical_key = $19
returning id`;
```

`stageWave` is the loop over steps 1–8 above. It uses `client.query(BUILD_SQL, [JSON.stringify(geometry), tolerance])`, and passes each built `geojson` (the display geometry) both to `CONTAINMENT_SQL` and as `$14` to `INSERT_SQL`. Each `INSERT_SQL` must return exactly one row (`assert.equal(rows.length, 1, key)`). Log one line per place: `STAGED-DRY <key> <role> <npoints> pts <nparts> parts <km2> km² drift <d> share <s>`.

- [ ] **Step 2: Implement the CLI**, `scripts/wine-map-sources/stage-usa-ava.mjs`. Its behaviour:

```js
// Stage the US-2 DRAFT boundaries (spec 2026-09-29 §8.2). Modelled on
// stage-germany-weinbau.mjs, with one transaction for the whole wave.
//
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2
//     DEFAULT, dry: begin; the catalog and knowledge migrations applied inside
//     the transaction if they are not recorded live yet; every boundary built
//     and asserted; rollback. Writes nothing, and never touches Storage.
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage
//     THE SITTING ONLY (main session): refuses unless sittingGate() is empty;
//     uploads the four raw UC Davis files (idempotent by sha256); begin;
//     stageWave; commit; warns that the neighbour cache is stale until the
//     promote's refresh.
```

Its steps:
1. Parse `--wave`; it must be `us2`.
2. Call `attributionKeyFor("UCD_TTB_AVA")` and `attributionKeyFor("NATURAL_EARTH")` first, so a missing registry entry fails here and not in a tiles run.
3. Compute the wave.
4. **Tree equality (offline):**
   - `const inputs = await loadInputs(); const rebuilt = buildReports({ tree: buildUsaTree({ avas: inputs.avas, pairs: inputs.pairs, config: inputs.config }), diff: inputs.diff, inputs: inputs.inputs });`
   - `treeMatches` is true when every `JSON.stringify(rebuilt[slug], null, 2) + "\n"` equals the committed report, with CRLF normalized.
   - Also check that every `usa-measurements.json` `_inputs` sha equals the file's current sha.
   - In dry mode a mismatch throws.
5. Load the four AVA artifacts and check each sha against `_inputs`. Load the states file (sha against `_inputs`) and the country file (sha against `COUNTRY_ARTIFACT`).
6. Load the pins from `usa-sources.json`. Every `.tiles-build/usa/ucd/<commit>/<file>` named by a wave AVA's state must exist locally with its pinned sha256. (It is needed only for `--stage`'s upload, but it is checked in the dry run too, so the sitting holds no surprise.)
7. Connect with `DATABASE_URL` from `.env.local` (as `stage-germany-weinbau.mjs` does).
8. **If `--stage`:**
   - Read the gate facts:
     - `schema_migrations` for `US2_VERSIONS.catalog`, `.knowledge` and `.promote`;
     - `owner_approval` from the data file;
     - the US boundary count;
     - `count(*) from wine_place_boundaries where quality_status='DRAFT'` on non-US places;
     - `count(*) from wine_map_releases where status='BUILDING' and created_at > now() - interval '1 hour'`.
   - Refuse, listing every reason, if `sittingGate(facts)` is not empty.
   - For each distinct raw file: build a Storage client for bucket `wine-map-sources` with `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`. Try `download(path)`, where "not found" means `existingSha = null`. Apply `uploadDecision`. On `upload`, call `.upload(path, body, { contentType: "application/geo+json", upsert: false })`. Log `RAW upload|skip <path>`.
9. `begin; set local statement_timeout = 1800000`.
10. **If dry:** for the catalog and then the knowledge, if its version is not in `schema_migrations`, read the migration file and `client.query` it inside the transaction (log `applied <file> in-transaction`). If the knowledge file does not exist yet, stop with "generate the knowledge migration first (plan Task 6)".
11. `const report = await stageWave(client, {…, revision: releaseVersion(), importer: \`scripts/wine-map-sources/stage-usa-ava.mjs@${git rev-parse HEAD}\`})`.
12. Finish:
    - **dry:** `rollback`, then print `DONE (dry): N boundaries built and asserted, persisted nothing.`;
    - **`--stage`:** `commit`, then `await warnIfNeighbourCacheStale(client)`, then print `STAGE COMPLETE: N DRAFT boundaries committed; apply the promote next`.
13. Always `client.end()` in `finally`, and `rollback` on any error.

- [ ] **Step 3:** Run the activity check (Task 2 Step 5).
- [ ] **Step 4: Dry run.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2`. Expected:
  - `applied …catalog.sql in-transaction`, then `…knowledge.sql in-transaction`;
  - 16 `STAGED-DRY` lines, with every umbrella AVA's share ≥ 0.995 and drift < 0.15;
  - `DONE (dry): 16 boundaries built and asserted, persisted nothing.`
  - Fix only code on a failure, never a threshold. A real AVA that fails containment is a stop-and-report to the main session (spec §8.2: "the threshold or the buffer is revisited then").
- [ ] **Step 5: Prove the refusals** without touching live. Run `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage`. Expected: it refuses before any upload or write, listing "catalog migration 20260930084747 is not recorded live", "knowledge migration … is not recorded live" and "… no owner approval". This is safe: the gate runs before anything else.
- [ ] **Step 6: Commit** the lib, the CLI and the test. Subject: "feat(wine-map-sources): stage-usa-ava.mjs, one transaction per wave, dry by default".

---

### Task 9: The promote migration

**Files:**
- Modify: `scripts/usa-map/render-us2-sql.mjs` (add `promoteSql`, and add the promote to the CLI's output)
- Modify: `scripts/usa-map/us2-sql.test.mjs`
- Create (rendered): `supabase/migrations/20260930104747_usa_us2_promote.sql`

**Interfaces:**
- Consumes: the wave, and the staged rows shaped exactly as Task 8 writes them (namespaces, feature ids, engines, `display`).
- Produces: `promoteSql(wave) → string`.

The promote copies `20260916120000`'s kind of assert (§8.4) without its `begin;`/`commit;`. Render it from the wave, and render the promote's value rows with `role` as follows:
- `ne-country` for the COUNTRY;
- `ne-state` for a REGION;
- `derived` for a `navigation_node`;
- `ucd` otherwise.

A place's `legal_keys` are its `legal_states` mapped to state keys, and every legal state must be a wave state (throw otherwise). Central Valley's is `[its state key]`; the country and the states have `{}`. `outline` is membership in `wave.outlineKeys`, and `members` is Central Valley's list.

Row format (the tests count on it):
- each `_us2_promote` row is one line, `  (${sq(key)}, ${sq(kind)}, ${sq(role)}, ${sq(ucd_ava_id)}, '{…}', ${bool(outline)}, ${members ? "'{…}'" : "null"})`;
- the edge row is one line in the same two-space style: `  ('source', 'target', 'ALTERNATE_PARENT', 'note')`.

- [ ] **Step 1: Write the failing tests** (append to `us2-sql.test.mjs`):

```js
import { promoteSql } from "./render-us2-sql.mjs";

test("the committed promote migration is exactly the render", async () => {
  assert.equal(lf(await readFile(US2_FILES.promote, "utf8")), promoteSql(wave));
});

test("promote: shape of the file", () => {
  const sql = promoteSql(wave);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  assert.equal((sql.match(/^ {2}\('united-states[^']*', '(COUNTRY|REGION|SUBREGION)'/gm) ?? []).length, 16);
  assert.match(sql, /'united-states\.washington\.columbia-valley', 'united-states\.oregon', 'ALTERNATE_PARENT'/);
  assert.equal((sql.match(/^ {2}\('united-states[^\n]*, true, /gm) ?? []).length, 10, "ten outline rows");
  for (const phrase of [
    "expected exactly one DRAFT, non-current boundary per place",
    "provenance does not match the stage",
    "outline set is not D15",
    "not inside its legal states",
    "has no complete article",
    "must say it is a grouping on this map, not an AVA",
    "refresh_wine_place_neighbours refused",
    "united-states places still DRAFT",
  ]) assert.ok(sql.includes(phrase), phrase);
  const flip = sql.indexOf("set quality_status = 'VALIDATED'");
  const coverage = sql.indexOf("has no complete article");
  const refresh = sql.lastIndexOf("refresh_wine_place_neighbours()");
  assert.ok(coverage < flip && flip < refresh, "asserts, then flip, then refresh");
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `promoteSql`.** It renders this file. `${ROWS}` is the 16 value rows; `${EDGES}` is the one edge row. Its note is rendered from the edge as `'US-2 tree report: basis state_share, share 0.224 (TTB lists OR and WA)'`, using the source place's legal states.

```sql
-- USA on the wine map, phase US-2: the promote (spec §8.4, §15; plan Task 9).
--
-- Re-checks, in SQL, every domain invariant the stage asserted, then flips the
-- 16 US-2 places to VERIFIED and their boundaries to VALIDATED + current in one
-- transaction. The country flips with the states (D12), or every release would
-- fail assertMultiCountryArchive. Stores the one ALTERNATE_PARENT edge (§8.3).
-- Ends with the neighbour refresh (standing rule), which must return >= 0.
--
-- Precondition: scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage
-- has committed exactly one DRAFT, non-current boundary per place, and the
-- catalog (...084747) and knowledge (...094747) migrations are applied.
-- Rendered by scripts/usa-map/render-us2-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us2_promote, pg_temp._us2_edges, pg_temp._us2_staged;
create temp table _us2_promote (
  key text primary key, kind text not null, role text not null, ucd_ava_id text,
  legal_keys text[] not null, outline boolean not null, members text[]
) on commit drop;
insert into _us2_promote values
${ROWS};
create temp table _us2_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, note text not null
) on commit drop;
insert into _us2_edges values
${EDGES};

-- 1. Pre-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where canonical_key = 'united-states' or canonical_key like 'united-states.%';
  if n <> 16 then raise exception 'US-2 promote: expected 16 united-states places, found %', n; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-2 promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-2 promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --stage first): %', v_text;
  end if;
end $$;

create temp table _us2_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us2_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text;
begin
  select count(*) into n from _us2_staged;
  if n <> 16 then raise exception 'US-2 promote: % staged rows, expected 16', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged where not (
       (role = 'ne-country' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id = 'ne_50m_admin_0_countries_lakes:USA' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ne-state' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id like 'ne_50m_admin_1_states_provinces_lakes:US-%' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ucd' and method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA'
        and feature_id = ucd_ava_id and gp->>'engine' = 'ucd-ava-digitization'
        and gp->>'crs_in' = 'EPSG:4269' and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity')
    or (role = 'derived' and method = 'DERIVED_FROM_DESCENDANTS' and ns = 'UCD_TTB_AVA'
        and feature_id = 'derived:' || split_part(key, '.', 3) and gp->>'engine' = 'ucd-ava-derived-union'
        and array(select jsonb_array_elements_text(gp->'members') order by 1) = members));
  if v_text is not null then raise exception 'US-2 promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between -125.5 and -66.5
      or extensions.ST_Y(label_point) not between 24 and 49.5;
  if v_text is not null then raise exception 'US-2 promote: invalid geometry or label outside the United States box: %', v_text; end if;

  -- D15: the outline set is exactly the AVA places of 5,000 km² or more, plus Central Valley.
  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or (role in ('ne-country', 'ne-state') and gp ? 'display')
      or (role = 'ucd' and outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000));
  if v_text is not null then raise exception 'US-2 promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us2_staged where gp->>'display' = 'outline';
  if n <> 10 then raise exception 'US-2 promote: % outline places, expected 10', n; end if;

  -- §8.2 state containment, on land and buffered: the share of each AVA-based
  -- place's land (land = inside the staged lower-48 outline, buffered) that
  -- lies inside its legal states' staged outlines, buffered.
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us2_staged st
               where st.role = 'ne-state' and st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(c.g, 0.05) from _us2_staged c where c.role = 'ne-country'))), 0) as share
      from _us2_staged s where s.role in ('ucd', 'derived')) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-2 promote: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- The states lie in the country outline.
  select string_agg(s.key, ', ') into v_text from _us2_staged s, _us2_staged c
   where s.role = 'ne-state' and c.role = 'ne-country'
     and extensions.ST_Area(extensions.ST_Intersection(s.g, extensions.ST_Buffer(c.g, 0.05))) < 0.995 * extensions.ST_Area(s.g);
  if v_text is not null then raise exception 'US-2 promote: state outside the country outline: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (US rule, §8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
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
  if v_text is not null then raise exception 'US-2 promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text; end if;

  if not exists (select 1 from public.wine_place_articles a join public.wine_places p on p.id = a.wine_place_id
                  where p.canonical_key = 'united-states.california.central-valley'
                    and substring(a.description from '^[^.]*\.') ~* 'not an AVA'
                    and substring(a.description from '^[^.]*\.') ~* 'grouping') then
    raise exception 'US-2 promote: Central Valley''s first sentence must say it is a grouping on this map, not an AVA (D25)';
  end if;
end $$;

-- 4. Flip, and the edge.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us2_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us2_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us2_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK("US-2 promote")}
-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where (canonical_key = 'united-states' or canonical_key like 'united-states.%') and publication_status <> 'VERIFIED';
  if n <> 0 then raise exception 'US-2 promote: % united-states places still DRAFT', n; end if;
  select count(*) into n from public.wine_places p join _us2_promote e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if n <> 16 then raise exception 'US-2 promote: % of 16 keys locked', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'united-states%' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 16 then raise exception 'US-2 promote: % current VALIDATED boundaries, expected 16', n; end if;
  select string_agg(format('%s=%s', k, c), ', ') into v_text from (
    select p.kind::text k, count(*) c from public.wine_places p where p.canonical_key like 'united-states%' group by 1) x
   where (k, c) not in (('COUNTRY', 1), ('REGION', 4), ('SUBREGION', 11));
  if v_text is not null then raise exception 'US-2 promote: kind counts off: %', v_text; end if;
  select count(*) into n from public.wine_places where canonical_key like 'united-states.%' and appellation_system = 'AVA';
  if n <> 10 then raise exception 'US-2 promote: % AVA places, expected 10', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where s.canonical_key like 'united-states%' or t.canonical_key like 'united-states%';
  if n <> (select count(*) from _us2_edges) then raise exception 'US-2 promote: % US relationships, expected %', n, (select count(*) from _us2_edges); end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-2 promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
```

`REFRESH_BLOCK` is the Task 2 `refreshBlock`. Refactor it to be exported and shared. Add `[US2_FILES.promote]: promoteSql(wave)` to the CLI.
- [ ] **Step 4: Render and test.** `node scripts/usa-map/render-us2-sql.mjs && node --test scripts/usa-map/us2-sql.test.mjs`. Expected: PASS. Then run `$APPLIER <promote> --check` and expect `PREFLIGHT OK`. The dry run happens in the rehearsal (Task 14), because the promote needs staged boundaries.
- [ ] **Step 5: Commit.** Subject: "feat(usa-map): US-2 promote migration with same-transaction asserts and refresh (not applied)".

---

### Task 10: Archetype links step 1, and the batch-1 test

**Files:**
- Create: `data/wine-map/usa-us2-archetype-links.json`
- Modify: `scripts/usa-map/render-us2-sql.mjs` (`linksSql`), `scripts/usa-map/us2-sql.test.mjs`
- Create (rendered): `supabase/migrations/20260930114747_usa_archetype_links_1.sql`
- Modify: `scripts/training-room.test.mjs` (the Napa assertion)

**Interfaces:**
- Produces: `linksSql(links) → string`. `links` is the data file's `links` array: `[{ archetype_id, name, sort_order, appellation, region, home, placements: string[] }]`.

Each placement's `sort_order` is the archetype's own `sort_order`: 88, 89 and 90. That is the live convention: the batch generator's home placement, and R1b's check `a.sort_order <> l.sort_order`. It is not "the next free value at each place" (spec §14.2). See Deviations.

- [ ] **Step 1: Write the data file:**

```json
{
  "_note": "US typical wines linked to the map, step 1 (spec 2026-09-29 D22, §14.2): each archetype's home at the deepest US-2 place, plus the REGION placement the training-room drift guard (RM9a) requires. Matched by live id AND name, both asserted. Step 2 (US-3) moves the two California wines to their AVAs.",
  "links": [
    { "archetype_id": "75e4e467-3929-4844-bbc4-ffe8b12523a1", "name": "A typical Napa Cabernet Sauvignon", "sort_order": 88,
      "appellation": "Napa Valley AVA", "region": "California",
      "home": "united-states.california.north-coast",
      "placements": ["united-states.california.north-coast", "united-states.california"] },
    { "archetype_id": "c4ea77f3-5599-43dd-bdc3-4287c1e0ea15", "name": "A typical Sonoma Chardonnay", "sort_order": 89,
      "appellation": "Sonoma Coast AVA", "region": "California",
      "home": "united-states.california.north-coast",
      "placements": ["united-states.california.north-coast", "united-states.california"] },
    { "archetype_id": "bab8537e-b0bc-4f7c-8547-242537322f8a", "name": "A typical Willamette Pinot Noir", "sort_order": 90,
      "appellation": "Willamette Valley AVA", "region": "Oregon",
      "home": "united-states.oregon.willamette-valley",
      "placements": ["united-states.oregon.willamette-valley", "united-states.oregon"] }
  ]
}
```

- [ ] **Step 2: Write the failing tests:**

```js
import { linksSql } from "./render-us2-sql.mjs";
const links = JSON.parse(await readFile("data/wine-map/usa-us2-archetype-links.json", "utf8")).links;

test("links: committed = render, homes and placements are wave places, REGION placement present", async () => {
  assert.equal(lf(await readFile(US2_FILES.links, "utf8")), linksSql(links));
  const keys = new Set(wave.places.map((p) => p.key));
  for (const l of links) {
    assert.ok(keys.has(l.home) && l.placements.includes(l.home), l.name);
    for (const k of l.placements) assert.ok(keys.has(k), k);
    const region = wave.places.find((p) => p.kind === "REGION" && l.home.startsWith(`${p.key}.`));
    assert.ok(l.placements.includes(region.key), `${l.name}: RM9a region placement`);
  }
  assert.deepEqual(topLevelTransactionStatements(linksSql(links)), []);
});
```

- [ ] **Step 3: Implement `linksSql`.** It renders:
  - `set local lock_timeout = '5s';` and the temp table `_us2_links (archetype_id uuid, name text, sort_order int, appellation text, region text, home_key text, place_key text)`, with one row per placement.
  - **Pre-state DO block:**
    - each archetype id exists with exactly that name, `sort_order`, appellation name and region name (joins to `appellations` and `regions`), `wine_place_id is null`, and 0 placements. Otherwise: `US archetype links: pre-state differs for %`;
    - every `place_key` is VERIFIED with a current VALIDATED boundary. Otherwise: `US archetype links: % is not VERIFIED with a current boundary (apply after the US-2 promote)`.
  - `update public.wine_archetypes a set wine_place_id = p.id from (select distinct archetype_id, home_key from _us2_links) l join public.wine_places p on p.canonical_key = l.home_key where a.id = l.archetype_id;`
  - `insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order) select l.archetype_id, p.id, l.sort_order from _us2_links l join public.wine_places p on p.canonical_key = l.place_key on conflict (archetype_id, wine_place_id) do nothing;`
  - **Post-state DO block:**
    - exactly 6 placements on `united-states%` places;
    - each archetype's `wine_place_id` is its home;
    - the scoring FKs are unchanged (the same three appellation names);
    - R1b's RM9a query, verbatim from `20260929141000_training_region_placements.sql`: no placed archetype outside `france.bourgogne` lacks a placement at its REGION ancestor. Otherwise: `US archetype links: placed archetypes without a placement at their REGION ancestor: %`.
  - Add `[US2_FILES.links]: linksSql(links)` to the CLI. Render, test, then run `$APPLIER <links> --check` and expect `PREFLIGHT OK`.
- [ ] **Step 4: Update `scripts/training-room.test.mjs`.** Replace the Napa block (the `const napa = …` query and its `assert.deepEqual(napa, { wine_place_id: null, placements: 0 }, …)`) with:

```js
    // US typical wines, step 1 (usa-wine-map spec §14.2, 20260930114747): once
    // linked, Napa lives on North Coast and also sits on California's page.
    const napa = (
      await client.query(
        `select wp.canonical_key place,
                (select array_agg(pp.canonical_key order by pp.canonical_key) from wine_archetype_placements p
                   join wine_places pp on pp.id = p.wine_place_id where p.archetype_id = a.id) placements
           from wine_archetypes a left join wine_places wp on wp.id = a.wine_place_id
          where a.name = 'A typical Napa Cabernet Sauvignon'`,
      )
    ).rows[0];
    if (napa.place === null) {
      assert.deepEqual(napa, { place: null, placements: null }, "an archetype without a map place stays off the map");
    } else {
      assert.deepEqual(napa, {
        place: "united-states.california.north-coast",
        placements: ["united-states.california", "united-states.california.north-coast"],
      });
    }
```

Then run `node --env-file=.env.local --test scripts/training-room.test.mjs`. Expected: green, taking the unlinked branch (live has no US places). The linked branch is exercised by the rehearsal (Task 14, which runs the same query in-transaction) and by the main session after the sitting.
- [ ] **Step 5: Commit.** Subject: "feat(usa-map): archetype links step 1 (Napa, Sonoma on North Coast; Willamette) and the batch-1 test reads either state".

---

### Task 11: Rollback files (unstage, remove, unpublish)

**Files:**
- Modify: `scripts/usa-map/render-us2-sql.mjs` (`unstageSql`, `removeSql`, `unpublishSql`), `us2-sql.test.mjs`
- Create (rendered): the three `US2_ROLLBACK_FILES`

**Interfaces:**
- Produces: the three render functions, each taking `wave`. Each file starts with a `_us2_rb (key text primary key, depth int)` temp table of the 16 keys, and each refuses if any `united-states%` place is outside that list ("a later US wave exists: write its own rollback").

Wave snapshots are immutable (`wine_boundary_source_snapshots_immutable`) and are never deleted. A re-stage reuses them (Task 8's `INSERT_SQL`). Sources stay too. Every file ends with the checked refresh.

- **`unstage`** (after `--stage`, before the promote):
  - pre: all 16 DRAFT, no current US boundary, exactly 16 DRAFT non-current;
  - `delete from public.wine_place_boundaries b using public.wine_places p where p.id = b.wine_place_id and p.canonical_key in (select key from _us2_rb) and b.quality_status = 'DRAFT' and not b.is_current;`
  - post: 0 US boundaries, 16 DRAFT places;
  - refresh.
- **`remove`** (abandon the wave before the promote):
  - pre: the lock check runs **first**, so that after a promote the refusal is always this message: any of the 16 with `canonical_key_locked_at is not null` raises `US-2 remove: keys are locked (the promote ran): use the unpublish file instead`. Then all 16 must exist and be DRAFT;
  - delete the relationships touching them, then their boundaries;
  - delete the places deepest first (`where depth = 2`, then 1, then 0). Articles, styles and grapes cascade;
  - `delete from supabase_migrations.schema_migrations where version in ('20260930084747', '20260930094747');`, so both can be re-applied;
  - post: 0 US places, 0 orphan knowledge rows;
  - refresh.
  - The `Petite Sirah` grape row stays: it is harmless, and deleting it would need every grape FK checked. The header says so.
- **`unpublish`** (a roll forward after the promote; spec §16):
  - pre: all 16 VERIFIED, each with one current boundary. Otherwise it raises `US-2 unpublish: not VERIFIED with one current boundary: %` (the rehearsal's refusal D matches this);
  - archetype links first: `delete from public.wine_archetype_placements x using public.wine_places p where p.id = x.wine_place_id and p.canonical_key in (select key from _us2_rb);` and `update public.wine_archetypes a set wine_place_id = null from public.wine_places p where p.id = a.wine_place_id and p.canonical_key in (select key from _us2_rb);`
  - set the boundaries `is_current = false`, and the places `publication_status = 'DRAFT'`;
  - post: 0 VERIFIED US places, 0 current US boundaries, 16 keys still locked, no archetype placement on a US place;
  - refresh.
  - The header says: "then dispatch a new tiles release; never roll back the manifest (§17.3)".

- [ ] **Step 1: Tests** (append): each committed file equals its render, and none has transaction statements. Also check the refusal texts:
  - `removeSql` includes "keys are locked (the promote ran)";
  - `unpublishSql` includes "never roll back the manifest";
  - each includes "a later US wave exists".
- [ ] **Step 2: Implement**, render, test, and run `$APPLIER <file> --check` for each. Expected: `PREFLIGHT OK` ×3. They are dry-run in the rehearsal.
- [ ] **Step 3: Commit.** Subject: "feat(usa-map): US-2 rollback files (unstage, remove, unpublish), outside supabase/migrations".

---

### Task 12: Tile preview (outlines, shards, zooms, coverage) and the shard test

**Files:**
- Create: `scripts/usa-map/export-preview.mjs`, `scripts/usa-map/export-preview.test.mjs`
- Modify: `src/lib/wine-map/shard-layer-specs.test.ts` (`SHARD_COUNTRY`)

**Interfaces:**
- Produces:
  - `EXPORT_SQL_COPY` (verbatim copy of `export.mjs`'s `EXPORT_SQL`);
  - `exportSqlFromSource(path?) → Promise<string>`;
  - `previewRelease(rows, country = "united-states") → { world: string[], shards: {[key]: {keys, max_zoom, bytes}}, outline: string[], outside: string[] }`.

`export.mjs` runs its export on import, so its SQL cannot be imported. This copy has a drift test instead. Nothing in `scripts/wine-map-tiles/` changes: the friend's file stays as it is.

- [ ] **Step 1: Write the failing tests:**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { EXPORT_SQL_COPY, exportSqlFromSource, previewRelease } from "./export-preview.mjs";

test("the copy of EXPORT_SQL is verbatim", async () => {
  assert.equal(EXPORT_SQL_COPY, await exportSqlFromSource());
});

const sq = [[[[-120, 37], [-119, 37], [-119, 38], [-120, 38], [-120, 37]]]];
const row = (over) => ({
  id: over.canonical_key, name: "x", kind: "SUBREGION", display_tier: 2, primary_parent_id: null, has_children: false,
  sort_order: 0, source_namespace: "UCD_TTB_AVA", min_zoom: 5, label_min_zoom: 5, area: 1, level: null,
  classification: null, display: null, geometry: JSON.stringify({ type: "MultiPolygon", coordinates: sq }),
  label_lon: -119.5, label_lat: 37.5, ...over,
});
const rows = [
  row({ canonical_key: "france", kind: "COUNTRY", display_tier: 0, source_namespace: "NATURAL_EARTH", label_lon: 2.3, label_lat: 46.6 }),
  row({ canonical_key: "united-states", kind: "COUNTRY", display_tier: 0, source_namespace: "NATURAL_EARTH", min_zoom: 1.5, label_min_zoom: 2, label_lon: -98, label_lat: 39 }),
  row({ canonical_key: "united-states.california", kind: "REGION", display_tier: 1, source_namespace: "NATURAL_EARTH", min_zoom: 4, label_min_zoom: 4 }),
  row({ canonical_key: "united-states.california.north-coast", display: "outline" }),
  row({ canonical_key: "united-states.new-york", kind: "REGION", display_tier: 1, source_namespace: "NATURAL_EARTH", min_zoom: 4, label_min_zoom: 4, label_lon: -75, label_lat: 43 }),
  row({ canonical_key: "united-states.new-york.long-island", label_lon: -72.8, label_lat: 40.9 }),
];

test("US rows: world gets country and states, shards get z7, outline only where display says so", () => {
  const p = previewRelease(rows);
  assert.deepEqual(p.world, ["united-states", "united-states.california", "united-states.new-york"]);
  assert.deepEqual(Object.keys(p.shards).sort(), ["california", "new-york"]);
  assert.equal(p.shards.california.max_zoom, 7);
  assert.deepEqual(p.outline, ["united-states.california.north-coast"]);
  assert.deepEqual(p.outside, []);
});

test("a Paris label on a united-states key is caught", () => {
  const bad = rows.map((r) => (r.canonical_key === "united-states.new-york.long-island" ? { ...r, label_lon: 2.35, label_lat: 48.85 } : r));
  assert.deepEqual(previewRelease(bad).outside, ["united-states.new-york.long-island"]);
});
```

- [ ] **Step 2: Implement:**

```js
// Preview the tiles export for one country's rows without building tiles
// (tippecanoe runs only in the Wine Map Tiles workflow). Routes rows through
// lib.mjs exactly as export.mjs does: archiveForPlace, placeFeature (the
// outline property), the shard max-zoom rule, assertMultiCountryArchive and
// the per-country coverage check (D17).
import { readFile } from "node:fs/promises";
import {
  SHARD_TARGET, archiveForPlace, assertMultiCountryArchive, featureOutsideCoverage, placeFeature,
} from "../wine-map-tiles/lib.mjs";

export const EXPORT_SQL_COPY = `<paste export.mjs's EXPORT_SQL template body here, byte for byte>`;

export async function exportSqlFromSource(path = "scripts/wine-map-tiles/export.mjs") {
  const text = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  const m = /const EXPORT_SQL = `([\s\S]*?)`;/.exec(text);
  if (!m) throw new Error(`EXPORT_SQL not found in ${path}`);
  return m[1];
}

export function previewRelease(rows, country = "united-states") {
  assertMultiCountryArchive(rows);
  const mine = rows.filter((r) => r.canonical_key === country || r.canonical_key.startsWith(`${country}.`));
  const world = [];
  const shards = {};
  for (const r of mine) {
    const { world: inWorld, shard } = archiveForPlace(r);
    if (inWorld) world.push(r.canonical_key);
    if (!shard) continue;
    const s = (shards[shard] ??= { keys: [], maxLabelZoom: 0, bytes: 0 });
    s.keys.push(r.canonical_key);
    s.maxLabelZoom = Math.max(s.maxLabelZoom, Number(r.label_min_zoom));
    s.bytes += JSON.stringify(placeFeature(r)).length;
  }
  for (const s of Object.values(shards)) {
    s.max_zoom = Math.min(SHARD_TARGET.maxZoom, Math.max(SHARD_TARGET.minZoom + 1, Math.ceil(s.maxLabelZoom) + 2));
    delete s.maxLabelZoom;
  }
  const outline = mine.filter((r) => placeFeature(r).properties.outline === true).map((r) => r.canonical_key).sort();
  const release = { expected: rows.map((r) => ({ id: r.id, key: r.canonical_key, label_lon: Number(r.label_lon), label_lat: Number(r.label_lat) })) };
  const outside = featureOutsideCoverage(release).map((e) => e.key);
  return { world: world.sort(), shards, outline, outside };
}
```

- [ ] **Step 3:** In `src/lib/wine-map/shard-layer-specs.test.ts`, add `california: "united-states", "new-york": "united-states", oregon: "united-states", washington: "united-states",` to `SHARD_COUNTRY`, in alphabetical position within the literal. Run `npx vitest run src/lib/wine-map/shard-layer-specs.test.ts` and expect PASS, including test 6 ("every shard of the manifest validates") with the four new keys.
- [ ] **Step 4:** Run `node --test scripts/usa-map/export-preview.test.mjs`. Expected: PASS (3).
- [ ] **Step 5: Commit.** Subject: "feat(usa-map): tile preview of US rows through lib.mjs; the four US shards in the shard-spec test".

---

### Task 13: The shortlist mirror (§10.3) and the boundary-expectations splice (§12)

**Files:**
- Create: `scripts/usa-map/shortlist-mirror.mjs`, `scripts/usa-map/shortlist-mirror.test.mjs`
- Create: `scripts/usa-map/splice-boundary-expectations.mjs`, `scripts/usa-map/boundary-expectations-splice.test.mjs`

**Interfaces:**
- Produces:
  - `shortlistFromRows({ regionName, countryName, places, aliases, childrenOf, links, regionGrapes, grapeName }) → { source: "map" | "region_grapes" | "none", placeName, grapes: string[] }`;
  - `readShortlist(client, regionName) → same`. Run it as `authenticated`; it reads through RLS exactly as the app does;
  - `EXPECTATIONS_SQL`, the exact SELECT of `generate-boundary-expectations.mjs`;
  - `spliceCountry(existing, fresh, country) → { rows, otherCountryDiffs: string[] }`.
  - The CLI `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs [--check <expected.json>] [--write]`. It is read-only against live, and writes only the local JSON when `--write` is passed.

**The mirror** follows `src/lib/grape-shortlist.ts` `compute()` step by step:
1. `fold` = deaccent, lowercase, and non-alphanumerics to a single space.
2. Candidates are places of kind `COUNTRY/MACRO_REGION/REGION/SUBREGION`, excluding COUNTRY, whose folded name equals the region's, plus alias matches.
3. The match is the first candidate whose COUNTRY ancestor's folded name equals the scoring country's.
4. Walk the descendants: the children by name, level by level, depth < 8.
5. Count links per grape for PRINCIPAL and ACCESSORY separately, sorted by count descending. **The mirror breaks ties by grape name; the app keeps row order.** The review file says so.
6. Fall back to `region_grapes` (PRINCIPAL first, then name) when the set is empty, or when there is no match.

- [ ] **Step 1: Tests.**
  - For the mirror, use a fixture: California REGION (country "United States") with two SUBREGION children. Cabernet Sauvignon is linked 3×, Chardonnay 2×, Zinfandel 1× (ACCESSORY). The expected result is `grapes = ["Cabernet Sauvignon", "Chardonnay", "Zinfandel"]` with `source = "map"`.
  - The same data with the links removed gives `source = "region_grapes"` and the `region_grapes` order.
  - A "Washington" place under a COUNTRY named "Australia" is not matched.
  - A COUNTRY place named like the region is never matched.
  - For the splice:
    - existing `[france…, spain…]` plus fresh `[france… (changed), united-states.a, united-states.b]` → `rows = [france (existing, unchanged), spain…, united-states.a, united-states.b]` and `otherCountryDiffs = ["france…"]`;
    - fresh rows that include a US row absent from the expected file make `--check` fail (test the pure `compareHunk(expected, fresh)`, which returns the differing keys).
- [ ] **Step 2: Implement.** The splice keeps every non-US row of the committed file byte for byte, drops any existing `united-states%` rows, and appends the fresh US rows in live order. That order is correct because `united-states` sorts after every existing country prefix in both SQL and JS order. It then writes `JSON.stringify(rows, null, 2) + "\n"`, exactly as the generator does. It reports `otherCountryDiffs`: the friend's live-but-unpinned rows, which are never committed by us (§12).
- [ ] **Step 3: Run the tests** (`node --test scripts/usa-map/shortlist-mirror.test.mjs scripts/usa-map/boundary-expectations-splice.test.mjs`). Then run the splice read-only without `--write`: `node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs`. Expected: `united-states rows: 0; other-country differences: <n>`. Record n. A non-zero n is the friend's drift; tell the main session.
- [ ] **Step 4: Commit.** Subject: "feat(usa-map): grape-shortlist mirror (§10.3) and united-states-only boundary-expectations splice (§12)".

---

### Task 14: The rehearsal (one rolled-back transaction), and the live check

**Files:**
- Create: `scripts/usa-map/us2-checks.mjs`, `scripts/usa-map/rehearse-us2.mjs`, `scripts/usa-map/check-us2-live.mjs`
- Create (written by the rehearsal): `data/wine-map/review/usa-us2-rehearsal.json`, `data/wine-map/review/usa-us2-expected-boundaries.json`

**Interfaces:**
- `us2-checks.mjs` exports these functions. Each takes a client inside an open transaction:
  - `asAuthenticated(client, fn)`: `savepoint as_user`; `set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true)`; `set local role authenticated`; run `fn`; `rollback to savepoint as_user`.
  - `contexts(client, keys)`: as authenticated, returns `{ [key]: { article, grapes, styles, children } }` from `get_wine_place_context(key)`. `article` is a boolean; the others are counts.
  - `shortlists(client)`: as authenticated, returns `{ California|Washington|Oregon|New York: {source, grapes} }` via `readShortlist`.
  - `postPromoteFacts(client)`: owner reads. Returns `{ verified, current_validated, relationships, fresh, locked, outline }`.
  - `expectationRows(client)`: `EXPECTATIONS_SQL`, filtered to `united-states%`.
  - `exportPreviewRows(client)`: `select * from (${EXPORT_SQL_COPY}) x where x.canonical_key like 'united-states%' or x.display_tier = 0`.
  - `archetypeFacts(client)`: the three archetypes' home keys and placement keys, plus `training_archetype_places()` rows for them, as authenticated.
- `rehearse-us2.mjs` has no commit path. Its only terminal statement is `rollback`, in `finally`.

**Rehearsal steps.** Each is logged with its elapsed seconds, and each NOTICE is captured with `client.on("notice")`.

1. Connect (`DATABASE_URL`); `begin`; `set local statement_timeout = 2700000`.
2. **Pre-flight:**
   - the promote and links versions are not recorded;
   - if the catalog is not recorded: no US places;
   - the archetype pre-state (ids, names, null homes).
3. `before = await shortlists(client)`.
4. If the catalog version is not recorded, `client.query(catalog file)`. Capture the refresh notice seconds as `catalog_refresh_s`.
5. If the knowledge version is not recorded, `client.query(knowledge file)`.
6. **Refusal A (Review Focus 4):** `savepoint`; run the promote file; expect an error matching `/expected exactly one DRAFT, non-current boundary per place/`; `rollback to savepoint`.
7. **Refusal B:** `savepoint`; run the links file; expect `/is not VERIFIED with a current boundary/`; `rollback to savepoint`.
8. `report = await stageWave(client, …)`, the same context as the CLI's dry run.
9. **Refusal C (Review Focus 2):** `savepoint`; call `stageWave` again; expect `/united-states boundaries already exist/`; `rollback to savepoint`.
10. **Rollback drill 1:** `savepoint s1`; run the unstage file; assert 0 US boundaries and 16 DRAFT places; `rollback to savepoint s1`.
11. **Rollback drill 2:** `savepoint s2`; run the remove file; assert 0 US places, and `schema_migrations` lacks the catalog and knowledge versions. (If they were recorded live, the delete is inside the savepoint and rolled back.) `rollback to savepoint s2`.
12. **Refusal D:** `savepoint`; run the unpublish file; expect `/US-2 unpublish: .*not VERIFIED/`; `rollback to savepoint`.
13. Run the promote file. Capture `promote_refresh_s` from its notice. **Assert** `catalog_refresh_s < 300` and `promote_refresh_s < 300` (§11 stop rule).
14. **Refusal E (Review Focus 4):** `savepoint`; run the remove file; expect `/keys are locked \(the promote ran\)/`; `rollback to savepoint`.
15. `facts = await postPromoteFacts(client)`. Assert:
    - `verified = 16`, `current_validated = 16`, `relationships = 1`;
    - `fresh = true`, `locked = 16`, `outline = 10`.
16. `expected = await expectationRows(client)`, written to `data/wine-map/review/usa-us2-expected-boundaries.json` as `JSON.stringify(expected, null, 2) + "\n"`. Assert 16 rows, with the method and source_feature_id per key matching the stage's table.
17. `preview = previewRelease(await exportPreviewRows(client))`. Assert:
    - `world` holds the country and the 4 states;
    - the shards are `california` (6 keys), `new-york` (3), `oregon` (3) and `washington` (3), each `max_zoom` 7;
    - `outline` equals `wave.outlineKeys`;
    - `outside` is empty.

    Record the byte counts per shard (a GeoJSON proxy; the real archive sizes are checked at the sitting).
18. `ctx = await contexts(client, ["united-states", "united-states.california", "united-states.washington", "united-states.oregon", "united-states.new-york", "united-states.california.central-valley"])`. Assert each has an article, `grapes > 0` and `styles > 0`. Assert `children` for `united-states` is 4, and for California 5.
19. `after = await shortlists(client)`. Assert each state's `after.source === "map"`.
20. Run the links file. Then `arch = await archetypeFacts(client)` and assert:
    - Napa → `{home: north-coast, placements: [california, north-coast]}`, and likewise Sonoma;
    - Willamette → `{home: willamette-valley, placements: [oregon, willamette-valley]}`;
    - each `training_archetype_places()` row has `place_key = home` and `region_key` = the state.

    Then run `training-room.test.mjs`'s RM9a query and assert it returns no rows.
21. **Rollback drill 3:** `savepoint s3`; run the unpublish file; assert 0 VERIFIED US places, 0 US placements, 3 null homes, `fresh = true`; `rollback to savepoint s3`.
22. `rollback`. Write `data/wine-map/review/usa-us2-rehearsal.json`:
    - `{ _generated_by, rehearsed_at, applied_in_transaction, timings_s, refusals, rollbacks, facts, contexts, shortlist: {State: {before, after, before_source, after_source}}, export_preview, stage_report }`;
    - every list sorted, grapes as names.
23. Print `REHEARSAL OK`.

`check-us2-live.mjs` is the read-only version for the sitting (`withReadOnly`). It runs `postPromoteFacts`, `contexts`, `shortlists`, `expectationRows` against the committed expected hunk (it must equal it) and, after the links, `archetypeFacts`. It prints `US-2 LIVE CHECK OK` or the differences.

- [ ] **Step 1:** Implement the three files.
- [ ] **Step 2:** Run the activity check (Task 2 Step 5).
- [ ] **Step 3: Run** `node --env-file=.env.local scripts/usa-map/rehearse-us2.mjs`. Expected:
  - `REHEARSAL OK`;
  - both refresh times under 300 s;
  - the five refusals matched and the three drills restored;
  - about 5–8 minutes in total.

  Run it at most twice in this plan: now, and once more in Task 16 only if anything after it changed.
  - On a real assert failure, fix the cause (the stage, the promote or the content), re-render, and re-run.
  - **If a refresh returns -1 or exceeds 300 s, stop and report** (Task 2's stop rule).
- [ ] **Step 4:** Run `node --env-file=.env.local scripts/usa-map/check-us2-live.mjs`. Expected: it reports `united-states places: 0 (not promoted yet)` and exits 0. The script must handle the pre-sitting state and say so, not fail.
- [ ] **Step 5: Commit** the three scripts, the rehearsal JSON and the expected-boundaries JSON. Subject: "feat(usa-map): rolled-back rehearsal of the whole US-2 chain, and the read-only live check". Put the measured timings in the body.

---

### Task 15: The owner-review file

**Files:**
- Create: `scripts/usa-map/render-usa-us2-review.mjs`
- Create (rendered): `data/wine-map/review/usa-us2-knowledge.md`
- Test: add to `usa-knowledge.test.mjs`

- [ ] **Step 1:** The CLI reads the data file, the wave and `usa-us2-rehearsal.json`, and writes `reviewMarkdown({ source, wave, rehearsal })` to `data/wine-map/review/usa-us2-knowledge.md`.
- [ ] **Step 2: Test:**

```js
test("the committed review file is the render of the data file and the rehearsal", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  const rehearsal = JSON.parse(await readFile("data/wine-map/review/usa-us2-rehearsal.json", "utf8"));
  const md = (await readFile("data/wine-map/review/usa-us2-knowledge.md", "utf8")).replace(/\r\n/g, "\n");
  assert.equal(md, reviewMarkdown({ source, wave, rehearsal }));
  assert.match(md, /## Grape shortlist change/);
  assert.ok(wave.places.length <= 40, "§18: at most 40 places per review file");
});
```

- [ ] **Step 3:** Render and test. Read the file once as the owner will. Every section should read as plain English, with the questions at the top and the shortlist table at the end.
- [ ] **Step 4: Commit.** Subject: "docs(usa-map): US-2 knowledge review file for the owner (provisional copy)".

---

### Task 16: Spec §25, the sitting runbook, and final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` (append §25)
- Create: `docs/superpowers/plans/2026-09-29-usa-wine-map-us2-sitting.md`

- [ ] **Step 1: Append §25**, "US-2 plan decisions (2026-09-29)". It lists each item of "Deviations from the spec, stated" below, one bullet each, and the observation that the live neighbour cache read stale on 2026-09-29.
- [ ] **Step 2: Write the runbook.** Copy "Ship instructions for the sitting" (below) verbatim into it, then fill in the numbers from `usa-us2-rehearsal.json`: the refresh seconds, the promote seconds and the shard GeoJSON bytes.
- [ ] **Step 3: Every suite:**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs scripts/wine-map-sources/gen-place-profiles-args.test.mjs scripts/wine-map-sources/gen-place-profiles-sql.test.mjs scripts/wine-map-sources/usa-tree.test.mjs scripts/wine-map-sources/usa-tree-reports.test.mjs scripts/wine-map-tiles/lib.test.mjs && npx vitest run && npx tsc --noEmit && npx eslint scripts/usa-map scripts/wine-map-sources scripts/training-room.test.mjs
```

Expected: all green.
- [ ] **Step 4:** Run `$APPLIER --check` on all seven SQL files (four migrations, three rollbacks). Expected: `PREFLIGHT OK` ×7. If anything changed since Task 14, run the rehearsal once more and expect `REHEARSAL OK`, then re-render the review file.
- [ ] **Step 5:** `git status` shows a clean tree. `git log --oneline origin/master..HEAD` lists this plan's commits. Nothing is pushed.
- [ ] **Step 6: Commit.** Subject: "docs(usa-map): spec §25 US-2 plan decisions, and the sitting runbook".

---

## US-2 acceptance mapped to tasks (spec §15)

| Acceptance | Where |
|---|---|
| Catalog migration: 16 DRAFT places from the tree reports, count asserts, refresh | Task 2 (render test, `--dry`) |
| Knowledge for every place (six article fields, grapes and styles everywhere), DRAFT for the owner | Tasks 4, 5, 6, 15 |
| Stage script, dry run, one transaction, every §8.2 check | Tasks 7, 8 |
| Promote: pre-state, domain invariants, outline set with count, coverage, flip, edge, refresh, post-state | Task 9; exercised in Task 14 |
| The promote asserts pass | Task 14 (rehearsal); the sitting, step 6 |
| `fresh = true` afterwards; refresh timed under 300 s | Task 14 (both refreshes timed); the sitting, step 7 |
| `get_wine_place_context` for `united-states` and each state returns an article, grapes and styles | Task 14 (`contexts`); the sitting, step 7 (`check-us2-live.mjs`) |
| §10.3 shortlist comparison accepted by the owner | Tasks 13, 14, 15 (table in the review file); owner |
| The three typical wines listed on north-coast / willamette-valley | Task 10; Task 14 step 20; the sitting, step 11 |
| Outline-only for ≥ 5,000 km² and Central Valley; zooms ≤ 10; shard max zoom 7 | Tasks 1, 8, 9, 12, 14 |
| `boundary-expectations.test.mjs` green on master (united-states hunk only) | Task 13 (splice), Task 14 (expected hunk); the sitting, step 8 |
| `scripts/wine-place-context.test.mjs` green | the sitting, step 8 |
| Tiles run green, 4 new shards within §13.2 targets | Task 12 (preview); the sitting, step 9 |
| Map checks (desktop, iPhone Chrome and Safari) | the sitting, step 10 |
| Rollback before and after the promote | Task 11; drilled in Task 14 |

## Deviations from the spec, stated

- **Central Valley's outline** is derived inside the stage transaction, from its 11 members' committed UC Davis geometry, with a coverage union. It is not produced by `derive-boundary.mjs`. That script reads VERIFIED children (the members only become places in US-3) and commits on its own under the INAO namespace. The method is still `DERIVED_FROM_DESCENDANTS`, and the member list is in `generation_parameters`. US-3 should assert that the outline equals its promoted members' union.
- **Snapshots are immutable** (a trigger refuses update and delete). So the before-promote rollbacks delete boundaries, and places when abandoning, but keep the snapshots. A re-stage reuses them by `(source_id, source_revision, normalized_checksum)`. §16 said "deletes the wave's DRAFT boundaries and snapshots".
- **Placement `sort_order`** is each archetype's own `sort_order` (88/89/90): the live convention used by the batch generator and R1b, whose checks require it. It is not "the next free value at each place" (§14.2).
- **The generator gains `--prelude`,** and optional article `grape_varieties`/`wine_styles` columns. Default output is byte-identical. Both are in the friend's script: tell them (§17.6).
- **The knowledge migration is generated before the catalog is live,** through `--prelude`, so the whole chain can be rehearsed now. §15's order had the catalog applied first. If the owner's corrections change the copy, the main session regenerates it without `--prelude`, once the catalog is live.
- **The promote measures state containment** against the staged Natural Earth outlines, with the country outline as the land denominator. The stage uses the union of all 13 committed states. Both are buffered 0.05°.
- **Articles carry `grape_varieties` and `wine_styles` texts** (the task asked for all six fields). The explorer shows them only when a place has no structured grape or style rows, so today they are a fallback.
- **The rollback files live in `scripts/usa-map/`** with their own versions (`…124747`, `…134747`, `…144747`), so a replay never runs them. The "remove" file deletes the catalog and knowledge history rows, so both can be re-applied.
- **Observation, not a decision:** on 2026-09-29 the live neighbour cache read `fresh = false` (`built_at` 2026-09-20). The spec's §3 said fresh. The catalog migration's refresh fixes that if it returns ≥ 0. If it returns -1, US-2 stops (Task 2's stop rule).

## Provisional user-facing copy (owner approves)

- **The 16 place names,** from the tree reports: United States, California, Washington, Oregon, New York, North Coast, Central Coast, Sierra Foothills, South Coast, Central Valley, Columbia Valley, Puget Sound, Willamette Valley, Southern Oregon, Finger Lakes, Long Island. All are TTB legal names except Central Valley, which is this map's own grouping.
- **Every article field, key fact and grape note** in `data/wine-map/place-profiles-usa.json`. The owner reads them in `data/wine-map/review/usa-us2-knowledge.md`.
- **The Petite Sirah grape description** (shown in the grape library).
- **The three owner questions** (New York's native and hybrid grapes, Puget Sound's whites, Central Valley's sweet and fortified styles).
- **Unchanged from US-0 and still provisional:** the attribution strings (`UCD_TTB_AVA`, `TTB_AVA_MAP`) and the chip label "United States".
- **Not user-facing:** the relationship note and the provenance notes.

## Ship instructions for the sitting (the main session; copied into the runbook by Task 16)

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
   - Then `node --env-file=.env.local scripts/usa-map/check-us2-live.mjs`. Expected: 16 DRAFT places, cache fresh.
5. **Knowledge**, only after the owner's OK: `--check`, `--dry`, then apply `supabase/migrations/20260930094747_usa_us2_knowledge.sql`. It writes no `wine_places` row, so it needs no refresh and no tiles run.

**The sitting, in order:**

1. **Announce the start** to the friend. Wait for their "quiet". Note the ACTIVE release version (for reference only; the manifest is never rolled back).
2. `git pull`. Then `node --test scripts/usa-map/*.test.mjs scripts/wine-map-sources/usa-stage-lib.test.mjs`, which must be green.
3. **Rehearse.** `node --env-file=.env.local scripts/usa-map/rehearse-us2.mjs` → `REHEARSAL OK`. With the catalog and knowledge live, it applies only the stage, the promote and the links in-transaction.
4. **Stage, dry.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2` → `DONE (dry): 16 boundaries …`.
5. **Stage, for real.** `node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage`. Expected:
   - `RAW upload|skip` for the four UC Davis files under `storage://wine-map-sources/UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/`;
   - `STAGE COMPLETE: 16 DRAFT boundaries committed`;
   - the stale-cache banner.

   From here until step 6, master's map-data job and `wine-place-context.test.mjs` are red for both people (§12). Keep the gap to minutes.
6. **Promote.** `node --env-file=.env.local "$APPLIER" supabase/migrations/20260930104747_usa_us2_promote.sql --check`, then `--dry` → `DRY RUN OK`, then apply → `APPLIED`. Record the refresh notice.
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

## What the main session must do afterwards

1. **Review:**
   - this plan's commits;
   - `data/wine-map/review/usa-us2-knowledge.md` (provisional copy);
   - `data/wine-map/review/usa-us2-rehearsal.json` (timings, refusals, shortlist);
   - the runbook `docs/superpowers/plans/2026-09-29-usa-wine-map-us2-sitting.md`.
2. **Send the owner** the review file and its three questions, plus the shortlist table (spec §10.3 acceptance).
3. **Tell the friend:** the US-0 rebase gate, the generator's `--prelude` and article-text change, the stale-cache observation, and the proposed sitting time.
4. **Merge** `usa-map` to master (staged push), then apply the catalog migration at a quiet hour with the friend quiet, then check (runbook "Before the sitting", steps 3–4).
5. **After the owner's OK:** record the approval, regenerate the knowledge migration if the copy changed, and apply it (step 5).
6. **The sitting:** follow the runbook exactly, including the live checks, the expectations hunk, the tiles release, the map checks and the archetype links.
7. **CLAUDE.md** (the main session's call). Add a short "USA on the map (US-2)" note:
   - the four states are REGION shards;
   - umbrella AVAs are SUBREGION `AVA`/`regional`;
   - Central Valley is a navigation node with a derived outline;
   - outline-only places carry `generation_parameters.display = 'outline'`;
   - `stage-usa-ava.mjs` is dry by default, and `--stage` is gated;
   - the rollback files live in `scripts/usa-map/`;
   - US knowledge lives in `place-profiles-usa.json` and is generated with `--bare`;
   - the grape shortlist for the four states now comes from the map.
8. **Next:** US-3 (California AVAs, core batch). It moves the two California typical wines to their AVAs (archetype links step 2), and asserts Central Valley's outline against its promoted members.
