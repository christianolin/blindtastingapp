# USA on the wine map: the owner's US-0 decisions and phase US-1 (scoring-reference clean-up), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part A applies the owner's two tree decisions from the US-0 review (legal-record nesting, and two AVAs moved out of Central Valley) to the pure tree logic, its tests, the four committed tree reports, the owner summary and the spec. Part B builds US-1: the one data migration that cleans the United States scoring rows exactly as `data/usa-reference/us1-copy-list.md` lists them, plus its pre-image, a reverse migration, a rolled-back rehearsal against live, the researched producer states, the fixture hand-edit, the script guard and the wine-identity cases. Nothing is applied and nothing is written live.

**Architecture:** Every decision is made by a pure, fixture-tested Node module. `usa-tree.mjs` gains a second nesting arm; the committed reports are rebuilt offline and a test proves the rebuild. For US-1, a read-only builder turns the approved draft, the producer research and a live read into one committed spec (`us1-spec.json`) and a pre-image. A renderer splices those into two SQL templates, and a test proves the committed SQL equals the render. The SQL does no guessing of its own. In live mode it asserts the exact pre-state (ids, counts, every reference row, every foreign key onto the two tables), applies the operations by id, and asserts the exact post-state. A rehearsal script then runs forward, replay mode, two refusal cases and the revert inside one transaction that is always rolled back, and it requires the revert to restore the snapshot exactly.

**Tech Stack:** Node 24 ESM with `node:test`, `pg`, PL/pgSQL on live Postgres (read-only or rolled back only), TypeScript with vitest for the wine-identity cases.

**Spec:** `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md`. Read all of it, and especially D6, D7, D13, D14, D24, D25, §3, §4, §6, §8.2, §8.3, §15 (US-1) and §16. Also read `CLAUDE.md`, `AGENTS.md`, the approved `data/usa-reference/us1-copy-list.md`, `data/wine-map/review/usa-us0-tree-summary.md`, and the US-0 plan `docs/superpowers/plans/2026-09-29-usa-wine-map-us0.md` (Tasks 19-22 wrote the code this plan changes). This plan touches no Next.js code; the only TypeScript is a vitest file. If any step does reach Next code, first read the relevant guide under `node_modules/next/dist/docs/`.

## Global Constraints

- Work only in `C:/Users/Public/repos/blindtastingapp-map`, on branch `usa-map`. Start every shell command with `cd C:/Users/Public/repos/blindtastingapp-map && `, because the shell's cwd resets. Never touch `C:/Users/Public/repos/blindtastingapp`.
- Never push. Never apply a migration. Never write to the live database or to Storage.
  - Live reads go through `scripts/wine-map-sources/read-only-client.mjs` (`begin read only` … `rollback`).
  - Two exceptions are allowed, and both are rolled back:
    - `scripts/usa-reference/rehearse-us1.mjs` (Task 12) opens a normal transaction and always ends it with `rollback`;
    - the owner's applier may run with `--check` and `--dry` only. It lives at `C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs`, below written as `$APPLIER`. Run it from the worktree (it loads `scripts/migration-preflight.mjs` from the cwd): `node --env-file=.env.local "$APPLIER" <file> --check`, then `--dry`. **Never run it without a flag.**
- Never recreate `get_wine_place_context`, `refresh_wine_place_neighbours` or any other shared map function (D21). The friend's live-only `20260925190000` is not in the repo. US-1 writes no `wine_places` row, so no neighbour refresh is involved.
- No Anthropic API call of any kind (AGENTS.md). The producer research (Task 7) is done in-session with WebSearch/WebFetch.
- Never run a script that writes live. The builder, the draft script, capture and check are read-only. The rehearsal rolls back.
- Commit with this prefix, and end every message with the co-author line:
  `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- `.gitattributes` already marks `data/usa-reference/**`, `data/wine-map/usa-*` and `data/wine-map/review/usa-*` `-text`. Write every new file with LF line endings.
- **Owner answers this plan implements (2026-09-29, verbatim):**
  - nesting: **"Legal record + >=90% inside"**;
  - Central Valley: **"Move those two under California"** (Tehachapi Mountains, Squaw Valley-Miramonte);
  - US-1 renames: **"Approve as listed"** (the copy list is binding, including "Mount Pisgah, Polk County, Oregon AVA");
  - Columbia Gorge: **"Oregon"** (already a `state_override`);
  - pushes: **"Yes, ship phases as they pass"**. The main session pushes and applies; this plan never does.
- Constants:
  - `within` ≥ 0.995; the new legal-record arm `withinLegalRecord` ≥ 0.9, and only when UC Davis's `within` names the container; `nearWithinReview` 0.9 stays a review threshold.
  - US-1 forward version `20260929214747` (suffix `4747`, D23; later than the newest live version `20260929141000`). Revert version `20260929224747`. Checked read-only: neither is recorded live.
  - Live anchor: `ef4ebc71-aadf-4792-abae-300698f7b09f` (California › "California AVA"). Country `United States` = `fb8c582b-3bd2-4571-ac7f-834d79af6bb5`.
  - Pre-state (read-only, 2026-09-29): 28 US regions, 240 US appellations, 210 ending " AVA".
  - Post-state: 26 regions, 282 appellations, 233 ending " AVA". Per wave state: California 175, Washington 22, Oregon 22, New York 11. Every other state's count is unchanged.
- **New user-facing copy.** US-1 adds none beyond the owner-approved row names in `us1-copy-list.md`. The owner-facing text in `data/wine-map/review/usa-us0-tree-summary.md` (Task 4) is provisional. List it in the handoff.

## Review Focus

These five failure modes follow from the spec, but no happy-path test exercises them. Each has a pinning test in the task that owns the code:

1. **Apply-day drift.** Between the build and the apply, someone saves a wine, an archetype, a draft or a label lookup that points at a row US-1 merges, moves or retires. The forward migration must refuse before changing anything and name the table. The builder must refuse the same state. (Task 8: `buildUs1Spec` throws; Task 12: the rehearsal's drift case expects `pre-state: wine_archetypes references`.)
2. **Replay mode.** On a fresh replay with no anchor row, every step must apply by name where its rows exist and skip otherwise, never fail on a count. (Task 12: the forward runs in replay mode on live data inside a savepoint, and the result must equal live mode row for row.)
3. **Reverting after use.** Once a new AVA row carries a wine, the revert must refuse rather than delete it or leave a dangling id. (Task 12: the in-use case expects `is in use`.)
4. **A cross-state label read after US-1.** A label that prints "The Rocks District of Milton-Freewater" or "Columbia Gorge" while the reader guessed "Washington" must resolve to the one Oregon row with region Oregon. Otherwise `write.ts` refuses with "The appellation is not in the chosen region." (Task 13, vitest.)
5. **Legal-record nesting across states, and cycles.** A ≥ 90% container that UC Davis names but that is keyed in another state must become an `ALTERNATE_PARENT`, never the primary parent. Two AVAs that UC Davis puts "within" each other must stop the build. (Task 1.)

## File map

| File | Change |
|---|---|
| `scripts/wine-map-sources/usa-tree.mjs` | legal-record nesting arm, `parent_basis`/`parent_inside`, `review.legal_record_nests`, navigation-node `exclude`, ancestor-overlap drop and `review.ancestor_overlaps` |
| `scripts/wine-map-sources/usa-tree.test.mjs` | tests for all of the above; the old almost-within test rewritten |
| `data/wine-map/usa-tree-config.json` | `withinLegalRecord: 0.9`; Central Valley `exclude` |
| `scripts/wine-map-sources/build-usa-tree-reports.mjs` | summary sections for the new review lists |
| `scripts/wine-map-sources/usa-tree-reports.test.mjs` | acceptance of the owner's decisions against the committed reports |
| `data/wine-map/usa-{california,washington,oregon,new-york}-tree.json`, `data/wine-map/review/usa-us0-tree-summary.md` | regenerated |
| `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` | D7, D25, §4, §6.2, §6.4, §8.2, §8.3, §15, §21, new §24 |
| `data/usa-reference/us1-producer-states.json` (new) | 45 researched producer states, one cited source each |
| `scripts/usa-reference/us1-producer-states.test.mjs` (new) | shape and coverage of the research file |
| `scripts/usa-reference/us1-queries.mjs` (new) | the reference-set queries, shared by builder, SQL and rehearsal |
| `scripts/usa-reference/us1-spec-lib.mjs` + `.test.mjs` (new) | pure spec builder, STOP rules, post-state |
| `scripts/usa-reference/build-us1-spec.mjs` (new) | read-only live read; writes `us1-spec.json` and the pre-image; `--check` |
| `data/usa-reference/us1-spec.json`, `data/usa-reference/preimage-20260929214747.json` (new) | built |
| `scripts/usa-reference/us1-cleanup.sql.template`, `us1-cleanup-revert.sql.template` (new) | the PL/pgSQL |
| `scripts/usa-reference/render-us1-sql.mjs` + `us1-sql.test.mjs` (new) | renderer; test that the committed SQL equals the render |
| `supabase/migrations/20260929214747_usa_reference_cleanup.sql` (new, rendered) | the forward migration (NOT applied) |
| `scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql` (new, rendered) | the revert, deliberately outside `supabase/migrations/` |
| `scripts/usa-reference/rehearse-us1.mjs` (new) | one rolled-back transaction: drift, replay, forward, in-use, revert |
| `scripts/usa-reference/us-country-guard.mjs` + `.test.mjs` (new), `scripts/add-appellation-designations.mjs` | the rerun guard and the historical header |
| `src/lib/wine-identity/__fixtures__/reference-snapshot.json` | one hand-edited name |
| `src/lib/wine-identity/resolve.test.ts` | two US cross-state cases |
| `scripts/usa-reference/us1-scoring-snapshot.mjs`, `capture-us1-scoring.mjs`, `check-us1-live.mjs` (new) | read-only before/after checks for the main session |

---

# Part A: the owner's US-0 decisions

### Task 1: Legal-record nesting in the pure tree

**Files:**
- Modify: `scripts/wine-map-sources/usa-tree.mjs`
- Test: `scripts/wine-map-sources/usa-tree.test.mjs`

**Interfaces:**
- Consumes: `buildUsaTree({ avas, pairs, config })` as it is (US-0 Task 19); each AVA's `ucd_within` tokens; `foldAvaName`.
- Produces:
  - `DEFAULT_THRESHOLDS.withinLegalRecord = 0.9`;
  - on every place, `parent_basis: "measured" | "legal_record" | null` and `parent_inside: number | null` (the place's measured ratio inside its primary parent AVA; `null` when the parent is a state or a navigation node);
  - `review.legal_record_nests: { key, name, container, container_key, ratio, primary }[]`;
  - `ALTERNATE_PARENT` edges from a legal-record container carry `basis: "within_legal_record"` and `ratio`; measured ones keep `basis: "within"` with no ratio;
  - `review.near_within` now lists only pairs from 0.9 up to (but not including) `within` that did **not** nest, so UC Davis is silent on each of them.

- [ ] **Step 1: Write the failing tests.** Replace the test named `an almost-within pair is listed for review and still placed as not within` with the tests below. Rename `UC Davis within/contains are compared, never used` to `UC Davis within decides only with >= 90% inside; contains is compared, never used` (its body is unchanged). Append the other tests at the end of the file.

```js
test("owner rule 2026-09-29: UC Davis 'within' plus at least 90% inside nests; either alone does not", () => {
  const avas = AVAS.map((a) => (a.id === "seiad" ? { ...a, ucd_within: ["North Coast"] } : a)).concat([
    ava("potter", "Potter Valley", 110, CA),
    ava("far", "Far Hills", 50, CA, { ucd_within: ["North Coast"] }),
  ]);
  const pairs = [...PAIRS,
    pair("north_coast", "seiad", 0.0007, 0.97),
    pair("north_coast", "potter", 0.001, 0.93),
    pair("north_coast", "far", 0.0004, 0.85)];
  const t = buildUsaTree({ avas, pairs, config: CONFIG });
  const seiad = place(t, "Seiad Valley");
  assert.equal(seiad.key, "united-states.california.north-coast.seiad-valley");
  assert.equal(seiad.parent_key, "united-states.california.north-coast");
  assert.equal(seiad.appellation_level, "subregional");
  assert.deepEqual([seiad.display_tier, seiad.min_zoom, seiad.label_min_zoom], [3, 6, 7]);
  assert.deepEqual([seiad.parent_basis, seiad.parent_inside], ["legal_record", 0.97]);
  assert.ok(!t.edges.some((e) => e.source_key === seiad.key && e.type === "OVERLAPS"));
  assert.equal(place(t, "Potter Valley").parent_key, "united-states.california", "93% but UC Davis silent");
  assert.equal(place(t, "Far Hills").parent_key, "united-states.california", "UC Davis says within but only 85%");
  assert.deepEqual(t.review.legal_record_nests, [{
    key: "united-states.california.north-coast.seiad-valley", name: "Seiad Valley",
    container: "North Coast", container_key: "united-states.california.north-coast", ratio: 0.97, primary: true,
  }]);
  assert.deepEqual(t.review.near_within.map((r) => [r.name, r.container, r.ucd_says_within]), [["Potter Valley", "North Coast", false]]);
  const oak = place(t, "Oakville");
  assert.deepEqual([oak.parent_basis, oak.parent_inside], ["measured", 1]);
  assert.deepEqual([place(t, "Napa Valley").parent_basis, place(t, "Napa Valley").parent_inside], ["measured", 1]);
  assert.deepEqual([place(t, "North Coast").parent_basis, place(t, "North Coast").parent_inside], [null, null]);
});

test("a legal-record container in another state is an ALTERNATE_PARENT, never the primary parent", () => {
  const avas = [...AVAS, ava("bench", "Milton Bench", 20, { OR: 1 }, { ucd_within: ["Walla Walla Valley"] })];
  const t = buildUsaTree({ avas, pairs: [...PAIRS, pair("bench", "walla_walla", 0.93, 0.01)], config: CONFIG });
  const p = place(t, "Milton Bench");
  assert.equal(p.parent_key, "united-states.oregon");
  assert.deepEqual([p.parent_basis, p.parent_inside], [null, null]);
  assert.deepEqual(t.edges.filter((e) => e.source_key === p.key), [{
    type: "ALTERNATE_PARENT", source_key: p.key,
    target_key: "united-states.washington.columbia-valley.walla-walla-valley",
    basis: "within_legal_record", ratio: 0.93,
  }]);
  assert.deepEqual(t.review.legal_record_nests.filter((r) => r.name === "Milton Bench").map((r) => r.primary), [false]);
});

test("two AVAs that UC Davis puts within each other, both at >= 90%, stop the build", () => {
  const avas = AVAS.map((a) => (a.id === "napa" ? { ...a, ucd_within: ["Sonoma Valley"] }
    : a.id === "sonoma_valley" ? { ...a, ucd_within: ["Napa Valley"] } : a));
  assert.throws(() => buildUsaTree({ avas, pairs: [...PAIRS, pair("napa", "sonoma_valley", 0.95, 0.92)], config: CONFIG }), /contain each other/);
});
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree.test.mjs`
Expected: FAIL. Seiad Valley's parent is `united-states.california`, `parent_basis` is `undefined`, and `legal_record_nests` is `undefined`.

- [ ] **Step 3: Implement.** In `usa-tree.mjs`:

  1. In `DEFAULT_THRESHOLDS`, add after `within: 0.995,`:
     ```js
       // Owner decision 2026-09-29 ("Legal record + >=90% inside"): an AVA also
       // nests in a container UC Davis's `within` names when at least this much
       // of it measures inside; a digitizing sliver no longer overrules the law.
       withinLegalRecord: 0.9,
     ```
  2. In `emptyPlace()`, add `parent_basis: null, parent_inside: null,` after `parent_key: null,`.
  3. Move the `resolveToken` definition from section 9 up to just before `// 2. Containment and partial overlap (§8.3).`. Delete it from section 9, since section 9 then reuses it. Add below it:
     ```js
       const ucdSaysWithin = (inner, outer) => byId.get(inner).ucd_within.some((token) => resolveToken(token) === outer);
       // "measured" (>= within), "legal_record" (>= withinLegalRecord and UC Davis
       // names the container), or null (not within).
       const nestBasis = (inner, outer, ratio) => {
         if (ratio >= t.within) return "measured";
         if (ratio >= t.withinLegalRecord && ucdSaysWithin(inner, outer)) return "legal_record";
         return null;
       };
       const containBasis = new Map(); // `${inner}>${outer}` -> { basis, ratio }
     ```
  4. Replace the body of the `for (const p of pairs)` loop, from `const aInB` through the end of the `else` branch, with:
     ```js
         const aBasis = nestBasis(a.id, b.id, p.a_in_b);
         const bBasis = nestBasis(b.id, a.id, p.b_in_a);
         for (const [inner, outer, ratio, basis] of [[a.id, b.id, p.a_in_b, aBasis], [b.id, a.id, p.b_in_a, bBasis]]) {
           if (basis === null && ratio >= t.nearWithinReview) nearWithin.push({ inner, outer, ratio });
         }
         if (aBasis && bBasis) {
           throw new Error(`${a.name} and ${b.name} contain each other (${p.a_in_b}, ${p.b_in_a}); nearly identical outlines need an owner decision`);
         }
         if (aBasis) {
           containers.get(a.id).push(b.id);
           containBasis.set(`${a.id}>${b.id}`, { basis: aBasis, ratio: p.a_in_b });
         } else if (bBasis) {
           containers.get(b.id).push(a.id);
           containBasis.set(`${b.id}>${a.id}`, { basis: bBasis, ratio: p.b_in_a });
         } else {
           const aSmaller = a.area_km2 < b.area_km2 || (a.area_km2 === b.area_km2 && a.name < b.name);
           const ratio = aSmaller ? p.a_in_b : p.b_in_a;
           if (ratio > t.overlapMin) overlaps.push({ source: aSmaller ? a.id : b.id, target: aSmaller ? b.id : a.id, ratio });
         }
     ```
  5. In section 5's AVA `places.push({...})`, add after `parent_key: r.parentKey,`:
     ```js
           parent_basis: primary.get(a.id).type === "ava" ? containBasis.get(`${a.id}>${primary.get(a.id).id}`).basis : null,
           parent_inside: primary.get(a.id).type === "ava" ? containBasis.get(`${a.id}>${primary.get(a.id).id}`).ratio : null,
     ```
  6. In section 8, replace the `ALTERNATE_PARENT` push inside `for (const c of containers.get(a.id))` with:
     ```js
           const cb = containBasis.get(`${a.id}>${c}`);
           const extra = cb.basis === "legal_record" ? { basis: "within_legal_record", ratio: round4(cb.ratio) } : { basis: "within" };
           if (inWave(c)) edges.push({ type: "ALTERNATE_PARENT", source_key: keyOf(a.id), target_key: keyOf(c), ...extra });
     ```
     Keep the `else deferredEdges.push(...)` line unchanged.
  7. In section 9's `review` object, add after `near_within`:
     ```js
         legal_record_nests: [...containBasis.entries()]
           .filter(([k, v]) => v.basis === "legal_record" && inWave(k.split(">")[0]))
           .map(([k, v]) => {
             const [inner, outer] = k.split(">");
             const p = primary.get(inner);
             return {
               key: keyOf(inner), name: nameOf(inner), container: nameOf(outer),
               container_key: inWave(outer) ? keyOf(outer) : null, ratio: round4(v.ratio),
               primary: p.type === "ava" && p.id === outer,
             };
           })
           .sort((x, y) => x.key.localeCompare(y.key) || x.container.localeCompare(y.container)),
     ```
     A UC Davis `ava_id` never contains `>`; the snake_case ids hold only `[a-z0-9_]`.
  8. Update the file's header comment. After the "Legal states" paragraph, add:
     ```js
     // Nesting (owner, 2026-09-29, "Legal record + >=90% inside"): a is within b
     // when a measures >= `within` (99.5%) inside b, or when UC Davis's `within`
     // names b and a measures >= `withinLegalRecord` (90%) inside it. The second
     // arm is the only place UC Davis's text decides anything; `contains` is only
     // compared.
     ```

- [ ] **Step 4: Run the file's tests.**

Run: `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree.test.mjs`
Expected: PASS, every test. No existing assertion changes, because no existing fixture pair sits between 0.9 and 0.995 with a UC Davis `within`.

- [ ] **Step 5: Commit** (the reports are regenerated in Task 4, so `usa-tree-reports.test.mjs` is expected to fail until then; do not run it here).

```bash
cd C:/Users/Public/repos/blindtastingapp-map && git add scripts/wine-map-sources/usa-tree.mjs scripts/wine-map-sources/usa-tree.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map-sources): nest a US AVA on the legal record plus 90% inside" -m "Owner decision 2026-09-29 (\"Legal record + >=90% inside\"). Reports are regenerated in a later commit." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Navigation-node exclusions (Central Valley)

**Files:**
- Modify: `scripts/wine-map-sources/usa-tree.mjs`, `data/wine-map/usa-tree-config.json`
- Test: `scripts/wine-map-sources/usa-tree.test.mjs`

**Interfaces:**
- Produces: a navigation node may carry `exclude: string[]` (legal AVA names). An excluded AVA is never a member by the county rule; it falls through to the state. An unknown name throws `navigation_nodes[<slug>].exclude: no AVA named "<name>"`.

- [ ] **Step 1: Write the failing test** (append):

```js
test("a navigation node's exclude list keeps a county match out (owner 2026-09-29)", () => {
  const node = { ...CONFIG.navigation_nodes[0], counties: [...CONFIG.navigation_nodes[0].counties, "Kern"], exclude: ["Tehachapi Mountains"] };
  const config = { ...CONFIG, navigation_nodes: [node] };
  const avas = [...AVAS,
    ava("teha", "Tehachapi Mountains", 235, CA, { counties: ["Kern"] }),
    ava("kern_flats", "Kern Flats", 40, CA, { counties: ["Kern"] })];
  const t = buildUsaTree({ avas, pairs: PAIRS, config });
  assert.equal(place(t, "Tehachapi Mountains").parent_key, "united-states.california");
  assert.equal(place(t, "Tehachapi Mountains").key, "united-states.california.tehachapi-mountains");
  assert.equal(place(t, "Kern Flats").parent_key, "united-states.california.central-valley");
  assert.throws(() => buildUsaTree({ avas, pairs: PAIRS, config: { ...config, navigation_nodes: [{ ...node, exclude: ["Nowhere"] }] } }),
    /navigation_nodes\[central-valley\]\.exclude: no AVA named "Nowhere"/);
});
```

- [ ] **Step 2: Run it and watch it fail.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree.test.mjs`. Expected: FAIL. Tehachapi Mountains' parent is `…central-valley`.

- [ ] **Step 3: Implement.**
  1. In `usa-tree.mjs`, change the `navOf` predicate's first line to:
     ```js
       const navOf = (a, state) => navNodes.find((n) => n.state === state && n.member_rule === "counties"
         && !(n.exclude ?? []).includes(a.name)
     ```
     Leave the next two lines (`&& a.counties.length > 0` and `&& a.counties.every(...)`) unchanged.
  2. Right after `const navNodes = config.navigation_nodes ?? [];`, add:
     ```js
       for (const n of navNodes) for (const name of n.exclude ?? []) idForName(name, `navigation_nodes[${n.slug}].exclude`);
     ```
  3. In `data/wine-map/usa-tree-config.json`, in the Central Valley node:
     - replace its `note` with `"A grouping on this map, not an AVA (D25). Members: AVAs in no umbrella AVA whose every listed county is below, minus \`exclude\`."`;
     - after `counties`, add
       ```json
       "exclude": ["Tehachapi Mountains", "Squaw Valley-Miramonte"],
       "exclude_owner_answer": "Move those two under California (2026-09-29)"
       ```
     Also add `"withinLegalRecord": 0.9,` after `"within": 0.995,` in `thresholds`.

- [ ] **Step 4: Run.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(map-sources): Central Valley leaves out Tehachapi Mountains and Squaw Valley-Miramonte`, with the body `Owner 2026-09-29: "Move those two under California".`, staging both files.

### Task 3: No OVERLAPS edge to a place's own ancestor

The legal-record arm makes one pair contradictory. Red Hill Douglas County, Oregon measures 100% inside Umpqua Valley, which now nests in Southern Oregon, but only 67.8% inside Southern Oregon itself. The old rule would store `OVERLAPS(Red Hill → Southern Oregon)`, an overlap with its own grandparent. (The same thing happened in US-0 with Happy Canyon ↔ Central Coast, and the new arm resolves that one.) This is a plan-level decision, not the owner's: the edge is dropped and listed for review, so the owner sees it in the summary.

**Files:** Modify `scripts/wine-map-sources/usa-tree.mjs`; Test `scripts/wine-map-sources/usa-tree.test.mjs`.

**Interfaces:** Produces `review.ancestor_overlaps: { key, name, ancestor, ancestor_key, ratio }[]`.

- [ ] **Step 1: Failing test** (append):

```js
test("an OVERLAPS edge to the place's own primary ancestor is dropped and listed for review", () => {
  const OR = { OR: 1 };
  const config = { ...CONFIG, umbrellas: { ...CONFIG.umbrellas, OR: ["Southern Oregon"] } };
  const avas = [...AVAS,
    ava("so", "Southern Oregon", 8000, OR),
    ava("umpqua", "Umpqua Valley", 3000, OR, { ucd_within: ["Southern Oregon"] }),
    ava("red_hill", "Red Hill Douglas County, Oregon", 20, OR, { ucd_within: ["Southern Oregon", "Umpqua Valley"] })];
  const pairs = [...PAIRS, pair("umpqua", "so", 0.9827, 0.36), pair("red_hill", "umpqua", 1, 0.008), pair("red_hill", "so", 0.6775, 0.0019)];
  const t = buildUsaTree({ avas, pairs, config });
  const rh = place(t, "Red Hill Douglas County, Oregon");
  assert.equal(rh.key, "united-states.oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon");
  assert.deepEqual(t.edges.filter((e) => e.source_key === rh.key), []);
  assert.deepEqual(t.review.ancestor_overlaps, [{
    key: rh.key, name: "Red Hill Douglas County, Oregon", ancestor: "Southern Oregon",
    ancestor_key: "united-states.oregon.southern-oregon", ratio: 0.6775,
  }]);
  assert.deepEqual(tree().review.ancestor_overlaps, []);
});
```

- [ ] **Step 2: Run it and watch it fail.** Expected: an `OVERLAPS` edge from Red Hill exists, and `ancestor_overlaps` is `undefined`.

- [ ] **Step 3: Implement.** In section 8, replace the `for (const o of overlaps)` loop with:

```js
  const ancestorOverlaps = [];
  for (const o of overlaps) {
    if (inWave(o.source) && inWave(o.target)) {
      const onChain = resolved.get(o.source).chain.includes(o.target) || resolved.get(o.target).chain.includes(o.source);
      if (onChain) {
        const [inner, outer] = resolved.get(o.source).chain.includes(o.target) ? [o.source, o.target] : [o.target, o.source];
        ancestorOverlaps.push({ key: keyOf(inner), name: nameOf(inner), ancestor: nameOf(outer), ancestor_key: keyOf(outer), ratio: round4(o.ratio) });
        continue;
      }
      edges.push({ type: "OVERLAPS", source_key: keyOf(o.source), target_key: keyOf(o.target), basis: "partial_overlap", ratio: round4(o.ratio) });
    } else {
      deferredEdges.push({ type: "OVERLAPS", source: nameOf(o.source), target: nameOf(o.target), ratio: round4(o.ratio), reason: "one side is outside wave 1" });
    }
  }
```

Then add to `review`: `ancestor_overlaps: ancestorOverlaps.sort((x, y) => x.key.localeCompare(y.key)),`.

- [ ] **Step 4: Run.** `node --test scripts/wine-map-sources/usa-tree.test.mjs` → PASS.
- [ ] **Step 5: Commit** `feat(map-sources): drop an OVERLAPS edge to a place's own ancestor, list it for review`.

### Task 4: Regenerate the four tree reports and the owner summary

**Files:**
- Modify: `scripts/wine-map-sources/build-usa-tree-reports.mjs` (`summaryMarkdown`)
- Modify: `scripts/wine-map-sources/usa-tree-reports.test.mjs`
- Regenerate: `data/wine-map/usa-california-tree.json`, `usa-washington-tree.json`, `usa-oregon-tree.json`, `usa-new-york-tree.json`, `data/wine-map/review/usa-us0-tree-summary.md`

**Interfaces:** Consumes Tasks 1-3. `buildReports` already filters every `review` list by `key`, and the two new lists carry `key`, so they reach the per-state reports with no change there.

- [ ] **Step 1: Write the failing acceptance tests** (append to `usa-tree-reports.test.mjs`):

```js
const allReports = async () => Promise.all(Object.values(STATE_FILES).map(async (s) => JSON.parse(await readFile(reportPath(s), "utf8"))));

test("owner 2026-09-29: the 25 legal-record pairs nest; nothing is left almost-within", async () => {
  const reports = await allReports();
  const nests = reports.flatMap((r) => r.review.legal_record_nests);
  assert.equal(nests.length, 25);
  assert.deepEqual(reports.flatMap((r) => r.review.near_within), []);
  const places = reports.flatMap((r) => r.places);
  const keyOf = (n) => places.find((p) => p.name === n)?.key;
  assert.equal(keyOf("Sta. Rita Hills"), "united-states.california.central-coast.santa-ynez-valley.sta-rita-hills");
  assert.equal(keyOf("Creston District"), "united-states.california.central-coast.paso-robles.creston-district");
  assert.equal(keyOf("McMinnville"), "united-states.oregon.willamette-valley.mcminnville");
  assert.equal(keyOf("Suisun Valley"), "united-states.california.north-coast.suisun-valley");
  assert.equal(keyOf("San Francisco Bay"), "united-states.california.central-coast.san-francisco-bay");
  assert.equal(keyOf("Santa Clara Valley"), "united-states.california.central-coast.san-francisco-bay.santa-clara-valley");
  assert.equal(keyOf("Lake Chelan"), "united-states.washington.columbia-valley.lake-chelan");
  assert.equal(keyOf("Elkton Oregon"), "united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon");
  for (const p of places.filter((x) => x.parent_basis === "legal_record")) {
    assert.ok(p.parent_inside >= 0.9 && p.parent_inside < 0.995, `${p.key} ${p.parent_inside}`);
  }
  for (const p of places.filter((x) => x.parent_basis === "measured")) assert.ok(p.parent_inside >= 0.995, p.key);
  assert.equal(places.filter((x) => x.parent_basis === "legal_record").length, 21);
});

test("owner 2026-09-29: Central Valley holds 11 members; Tehachapi Mountains and Squaw Valley-Miramonte sit under California", async () => {
  const ca = JSON.parse(await readFile(reportPath("california"), "utf8"));
  const members = ca.places.filter((p) => p.parent_key === "united-states.california.central-valley").map((p) => p.name).sort();
  assert.deepEqual(members, ["Capay Valley", "Clarksburg", "Diablo Grande", "Dunnigan Hills", "Lodi", "Madera",
    "Paulsell Valley", "River Junction", "Salado Creek", "Tracy Hills", "Winters Highlands"]);
  for (const n of ["Tehachapi Mountains", "Squaw Valley-Miramonte"]) {
    assert.equal(ca.places.find((p) => p.name === n).parent_key, "united-states.california", n);
  }
});

test("no OVERLAPS edge joins a place to its own ancestor; Red Hill's is listed for review", async () => {
  const reports = await allReports();
  for (const r of reports) {
    const byKey = new Map(r.places.map((p) => [p.key, p]));
    const ancestors = (k) => { const out = []; let p = byKey.get(k); while (p?.parent_key) { out.push(p.parent_key); p = byKey.get(p.parent_key); } return out; };
    for (const e of r.edges.filter((x) => x.type === "OVERLAPS")) {
      assert.ok(!ancestors(e.source_key).includes(e.target_key) && !ancestors(e.target_key).includes(e.source_key), `${e.source_key} ~ ${e.target_key}`);
    }
  }
  assert.deepEqual(reports.flatMap((r) => r.review.ancestor_overlaps).map((x) => [x.name, x.ancestor, x.ratio]),
    [["Red Hill Douglas County, Oregon", "Southern Oregon", 0.6775]]);
});

test("counts per state after the owner's decisions", async () => {
  const got = Object.fromEntries((await allReports()).map((r) => [r.state, [r.counts.places, r.counts.edges.ALTERNATE_PARENT ?? 0, r.counts.edges.OVERLAPS ?? 0, r.counts.outline]]));
  assert.deepEqual(got, { CA: [156, 2, 27, 6], WA: [19, 2, 2, 2], OR: [21, 3, 0, 2], NY: [11, 0, 0, 2] });
});
```

- [ ] **Step 2: Run and watch them fail.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree-reports.test.mjs`. Expected: FAIL. `legal_record_nests` is missing from the committed reports, and "the committed reports are exactly what the committed inputs build" fails.

- [ ] **Step 3: Rewrite the summary's review sections.** In `summaryMarkdown`, replace everything from the `## Almost within` push (line ~169) up to, but not including, `L.push("", "## For review", "");` with:

```js
  L.push("", `## Nested by the legal record (UC Davis "within" and at least ${pct(tree.thresholds.withinLegalRecord)} inside)`, "");
  L.push("Owner decision 2026-09-29 (\"Legal record + >=90% inside\"): an AVA nests in a container UC Davis's `within` names when at least 90% of it measures inside, so a digitizing sliver no longer overrules the law. \"Primary\" means the container is the place's parent; otherwise it is a higher ancestor or an ALTERNATE_PARENT.", "");
  if (tree.review.legal_record_nests.length === 0) L.push("- none");
  else {
    L.push("| AVA | Now at | Container | Measured inside | Primary |", "|---|---|---|---:|---|");
    for (const r of tree.review.legal_record_nests) {
      L.push(`| ${r.name} | \`${r.key}\` | ${r.container} | ${(r.ratio * 100).toFixed(2)}% | ${r.primary ? "yes" : "no"} |`);
    }
  }
  L.push("", `## Almost within (${pct(tree.thresholds.nearWithinReview)} to ${pct(tree.thresholds.within)}), UC Davis silent: placed as NOT within`, "");
  L.push("A pair here got an OVERLAPS edge, not a parent: UC Davis's `within` does not name the container, so the legal-record rule does not apply.", "");
  if (tree.review.near_within.length === 0) L.push("- none");
  else {
    L.push("| AVA | Placed at | Container | Measured inside |", "|---|---|---|---:|");
    for (const r of tree.review.near_within) L.push(`| ${r.name} | \`${r.key}\` | ${r.container} | ${(r.ratio * 100).toFixed(2)}% |`);
  }
  L.push("", "## Overlaps with a place's own ancestor (no edge stored)", "");
  L.push("The tree already nests the place under this ancestor through a smaller AVA, so an OVERLAPS edge would contradict it. Listed so the digitizing gap is visible.", "");
  L.push(...listOrNone(tree.review.ancestor_overlaps.map((r) => `- ${r.name} in ${r.ancestor}: ${(r.ratio * 100).toFixed(2)}% measured inside (\`${r.key}\`)`)));
```

In the `## For review` block, change the `within`/`contains` line to:

```js
  L.push(`- UC Davis \`within\`/\`contains\` disagreements: ${tree.review.within_disagreements.length} (listed in each state's report; \`within\` decides only with at least ${pct(tree.thresholds.withinLegalRecord)} measured inside)`);
```

- [ ] **Step 4: Regenerate and run everything.**

Run:
```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/wine-map-sources/build-usa-tree-reports.mjs && node --test scripts/wine-map-sources/usa-tree.test.mjs scripts/wine-map-sources/usa-tree-reports.test.mjs
```
Expected log lines, with CA `156 places, {"ALTERNATE_PARENT":2,"OVERLAPS":27}`, WA `19 places, {"ALTERNATE_PARENT":2,"OVERLAPS":2}`, OR `21 places, {"ALTERNATE_PARENT":3}` and NY `11 places, {}` (the deferred counts are unchanged). Every test must PASS.

Then check the summary by eye:
- "Central Valley" lists 11 names, without Tehachapi Mountains, Squaw Valley-Miramonte or Suisun Valley.
- The new legal-record table has 25 rows (the 24 old "almost within" rows plus Happy Canyon of Santa Barbara | Central Coast | 98.80% | no).
- "Almost within" reads `- none`.
- "Overlaps with a place's own ancestor" lists Red Hill Douglas County, Oregon in Southern Oregon at 67.75%.
- The three breadcrumbs (Walla Walla Valley, The Rocks District, Columbia Gorge) are byte-identical to before (`git diff` shows no change on those lines).

If any count differs from the numbers above, stop and report the diff; do not adjust the tests to fit.

- [ ] **Step 5: Commit** `data(map): US tree reports and summary after the owner's nesting and Central Valley decisions`, staging the builder, the test, the four reports and the summary.

### Task 5: The spec records the owner's decisions

**Files:** Modify `docs/superpowers/specs/2026-09-29-usa-wine-map-design.md`. Use the Edit tool with the exact old text; keep the file's line endings.

- [ ] **Step 1: D7.** Replace the line `- **D7 Primary parent = the smallest AVA that contains the place geometrically AND is keyed under` and the line after it (`  the same state.**`) with:

```
- **D7 Primary parent = the smallest AVA that contains the place AND is keyed under the same
  state.**
  - "Contains" (owner decision 2026-09-29, **"Legal record + >=90% inside"**): the place measures
    ≥ 99.5% inside the container, **or** UC Davis's `within` names the container and ≥ 90% of the
    place measures inside it. The second arm lets the legal record overrule a digitizing sliver. It
    nested all 24 "almost within" pairs of the US-0 summary, plus Happy Canyon of Santa Barbara in
    Central Coast: for example Sta. Rita Hills under Santa Ynez Valley, Creston District under Paso
    Robles, McMinnville under Willamette Valley, Suisun Valley under North Coast, and San Francisco
    Bay under Central Coast. The tree report records `parent_basis` (`measured` or `legal_record`)
    and `parent_inside` for every AVA whose parent is an AVA.
```

Then replace the D7 sub-bullet that starts `  - UC Davis \`within\`/\`contains\` are **not trusted**` (two lines) with:

```
  - UC Davis `within`/`contains` never decide on their own: the Russian River file lists Alexander
    Valley under `contains`. Containment is recomputed in PostGIS; `within` counts only together
    with ≥ 90% measured inside, and `contains` is only cross-checked.
```

- [ ] **Step 2: D25.** After the D25 bullet `  - Its article says in its first sentence that it is a grouping on this map, not an AVA.`, add:

```
  - Members (owner decision 2026-09-29, **"Move those two under California"**): the AVAs in no
    umbrella AVA whose every county is a Central Valley county, minus Tehachapi Mountains and
    Squaw Valley-Miramonte, which sit directly under California (`exclude` in
    `usa-tree-config.json`). With D7's legal-record arm, Suisun Valley nests under North Coast. The
    node holds 11 members: Capay Valley, Clarksburg, Diablo Grande, Dunnigan Hills, Lodi, Madera,
    Paulsell Valley, River Junction, Salado Creek, Tracy Hills, Winters Highlands.
```

- [ ] **Step 3: §4.** Replace `  Lakes, Seiad Valley) sit directly under California.` with `  Lakes, Seiad Valley, and by the owner's decision Tehachapi Mountains and Squaw Valley-Miramonte)\n  sit directly under California.` Written out, the `\n` is a real line break with two leading spaces.

- [ ] **Step 4: §6.2.**
  - Heading: replace `### 6.2 Operations (one migration, \`…4747_usa_reference_cleanup.sql\`)` with `### 6.2 Operations (one migration, \`20260929214747_usa_reference_cleanup.sql\`, rendered from \`data/usa-reference/us1-spec.json\`)`.
  - Step 4: replace `   - Mt. Pisgah Polk County Oregon AVA → Mt. Pisgah, Polk County, Oregon AVA;` with `   - Mt. Pisgah Polk County Oregon AVA → Mount Pisgah, Polk County, Oregon AVA (UC Davis's name field and 27 CFR 9.284's heading; approved in the copy list);`.
  - Step 5: replace the Lake Erie sub-bullet's two lines, exactly `   - **Lake Erie:** if New York is dominant, the Ohio row is **moved by id** to New York. Otherwise` and `     it is left alone for Ohio's wave. No new Lake Erie row is ever created.`, with `   - **Lake Erie:** US-0 found Ohio dominant (OH 75.3%, NY 17.5%, PA 7.2%), so the Ohio row is left\n     alone for Ohio's wave. No new Lake Erie row is ever created.`
  - Step 6: after the step-6 heading line `6. **Columbia Gorge is an owner decision before US-1.**`, insert `   - **Answered 2026-09-29: "Oregon"** (option (a), a \`state_override\`). All three rows merge into\n     Oregon's \`c367f0ce-…\`, and the Phelps Creek wine and record keep reading Oregon.`
  - Step 7: after the sub-bullet ending `   whose state is unsure gets \`region_id = null\`. The list is committed in the migration's spec\n     block.`, add `   - The research is committed as \`data/usa-reference/us1-producer-states.json\`, with one cited source\n     (winery address) per producer, and reaches the migration through \`us1-spec.json\`.`

- [ ] **Step 5: §6.4.** Replace the sentence `The reverse migration\n  \`…4747_usa_reference_cleanup_revert.sql\` is written and \`--dry\`-rehearsed before the forward\n  migration applies.` with:

```
The reverse migration
  `scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql` lives outside
  `supabase/migrations/`, because a replay would otherwise undo US-1 right after applying it. It
  deletes US-1's history row when it runs. `scripts/usa-reference/rehearse-us1.mjs` rehearses it
  together with the forward migration in one rolled-back transaction, before the forward migration
  applies.
```

- [ ] **Step 6: §8.2 and §8.3.**
  - §8.2: replace `- Every AVA is ≥ 99.5% inside its primary parent AVA. Nested AVAs are wholly contained in law; the\n  0.5% absorbs digitizing slivers.` with `- Every AVA is ≥ 99.5% inside its primary parent AVA, or ≥ 90% when its \`parent_basis\` is\n  \`legal_record\` (D7). Nested AVAs are wholly contained in law; the margin absorbs digitizing slivers.`
  - §8.3: replace `- **\`within(a, b)\`** = area(a ∩ b) ≥ 99.5% of area(a).` with `- **\`within(a, b)\`** = area(a ∩ b) ≥ 99.5% of area(a), or ≥ 90% when UC Davis's \`within\` for a\n  names b (D7).`
  - §8.3: after the `OVERLAPS(a, b)` bullet's last line (`  gets no edge.`), add `- An OVERLAPS pair where one side is the other's primary ancestor stores no edge. It is listed\n  under \`review.ancestor_overlaps\` (US-0 after the owner's decisions: Red Hill Douglas County,\n  Oregon in Southern Oregon, 67.75%).`

- [ ] **Step 7: §15, §21, §24.**
  - §15 US-1: replace `- **Gate:** the owner has answered the Columbia Gorge question (§6.2 step 6) and accepted the\n  visible renames (§18).` with `- **Gate (met 2026-09-29):** Columbia Gorge = Oregon; the renames were approved as listed.`
  - §21: replace `- **Trusting UC Davis \`within\`/\`contains\`**: shown wrong for Russian River Valley.` with `- **Trusting UC Davis \`within\`/\`contains\` on their own**: shown wrong for Russian River Valley.\n  (\`within\` now decides only together with ≥ 90% measured inside, D7.)`
  - Append at the end of the file:

```

## 24. Owner decisions after US-0 (2026-09-29)

| Question | Answer (verbatim) | Where it lands |
|---|---|---|
| Nesting of "almost within" pairs | "Legal record + >=90% inside" | D7, §8.2, §8.3; `usa-tree.mjs` `withinLegalRecord` |
| Tehachapi Mountains and Squaw Valley-Miramonte in Central Valley | "Move those two under California" | D25, §4; `usa-tree-config.json` `exclude` |
| US-1 renames, merges and additions | "Approve as listed" | §6.2; `data/usa-reference/us1-copy-list.md` is binding |
| Columbia Gorge's state | "Oregon" | §6.2 step 6; `state_overrides` |
| Pushes | "Yes, ship phases as they pass" | the main session pushes and applies |

A consequence the plan settled, not the owner: an OVERLAPS edge between a place and its own primary
ancestor is not stored (§8.3).
```

- [ ] **Step 8: Check and commit.** Run `cd C:/Users/Public/repos/blindtastingapp-map && git diff --stat docs/superpowers/specs/2026-09-29-usa-wine-map-design.md` and expect one file changed. Commit `docs(spec): the owner's US-0 decisions (nesting, Central Valley) and US-1 details`.

### Task 6: Re-derive `data/usa-reference/` from the regenerated trees

`scripts/usa-reference/draft-us1-cleanup.mjs` reads each cross-state AVA's map state from the tree reports (`mapStateOf`). It reads no parent. The owner's decisions change parents and keys only, so the draft must come out the same.

- [ ] **Step 1: Rerun, read-only.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node scripts/usa-reference/draft-us1-cleanup.mjs`. Expected: `steps: 1_state_suffix=6 2_county_suffix=15 3_merges=4 4_legal_names=5 5_cross_state=6 6_columbia_gorge=5 7_pseudo_regions=2 8_missing_avas=50` and `flags: 0`.
- [ ] **Step 2: Diff.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && git diff --stat data/usa-reference && git diff data/usa-reference | grep '^[-+] ' | grep -v read_at`. Expected: `us1-copy-list.md` unchanged, and the second command prints nothing, so only the two `read_at` lines changed.
- [ ] **Step 3:** If only `read_at` changed, restore the files (`git checkout -- data/usa-reference/us1-cleanup-draft.json data/usa-reference/preimage-draft.json`); there is nothing to commit. If anything else changed (live drift, or a map state moved), **stop** and report the diff to the main session. The copy list the owner approved must not change silently.

---

# Part B: US-1, the scoring-reference clean-up

### Task 7: Research the 45 Walla Walla Valley producers' winery states

**Files:**
- Create: `data/usa-reference/us1-producer-states.json`
- Test: `scripts/usa-reference/us1-producer-states.test.mjs`

**Interfaces:** Produces the research file below. Task 8 reads it through `PRODUCER_STATES_PATH`.

```json
{
  "_note": "US-1 (spec §6.2 step 7): each producer now on the retired Walla Walla Valley pseudo-region is re-linked by id to the state of its winery address. One cited source per producer. Researched in-session, no API.",
  "rule": "The state of the winery's own production address, as the winery or a trade body publishes it. A Milton-Freewater, OR winery is OR even if it pours in Walla Walla, WA. A tasting room alone does not count. Unsure, closed without a findable address, or an unidentifiable name: null, with a note.",
  "researched_at": "2026-09-29",
  "producers": [
    { "id": "4934de22-61b4-4aef-9393-3dac941d1ece", "name": "1841 Cellars", "state": "WA", "winery_address": "<street>, Walla Walla, WA 99362", "source_url": "https://…", "source": "<publisher>, <page title>", "note": null }
  ]
}
```

(The example row shows the shape only. Every value comes from the research. Do not commit a `<…>` or `…` anywhere; the test forbids it.)

- [ ] **Step 1: Write the test first.**

```js
// scripts/usa-reference/us1-producer-states.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = async (p) => JSON.parse(await readFile(p, "utf8"));

test("the research covers exactly the 45 Walla Walla Valley producers, by id and name", async () => {
  const draft = await load("data/usa-reference/us1-cleanup-draft.json");
  const expected = draft.steps["7_pseudo_regions"]["Walla Walla Valley"].producers.map((p) => [p.id, p.name]).sort();
  const file = await load("data/usa-reference/us1-producer-states.json");
  assert.equal(expected.length, 45);
  assert.deepEqual(file.producers.map((p) => [p.id, p.name]).sort(), expected);
});

test("each producer has a state (WA, OR or null) and one citable source", async () => {
  const { producers } = await load("data/usa-reference/us1-producer-states.json");
  for (const p of producers) {
    assert.ok(["WA", "OR", null].includes(p.state), `${p.name}: state ${p.state}`);
    assert.match(p.source_url ?? "", /^https:\/\/(?!www\.google\.|google\.|bing\.com|duckduckgo\.com)/, `${p.name}: a real https source, not a search page`);
    assert.ok(typeof p.source === "string" && p.source.length > 5, `${p.name}: source`);
    if (p.state === "WA") assert.match(p.winery_address, /\bWA\s+99\d{3}\b/, `${p.name}: a WA address`);
    if (p.state === "OR") assert.match(p.winery_address, /\bOR\s+97\d{3}\b/, `${p.name}: an OR address`);
    if (p.state === null) assert.ok(typeof p.note === "string" && p.note.length > 10, `${p.name}: why null`);
    assert.ok(!/[<>…]/.test(JSON.stringify(p)), `${p.name}: placeholder text`);
  }
});
```

- [ ] **Step 2:** Run `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-reference/us1-producer-states.test.mjs`. Expected: FAIL (ENOENT).

- [ ] **Step 3: Research, one producer at a time.** The 45 ids and names are in `data/usa-reference/us1-cleanup-draft.json` → `steps["7_pseudo_regions"]["Walla Walla Valley"].producers`. For each producer:
  1. `WebSearch` for `"<name>" winery Walla Walla address`, or `"<name>" Milton-Freewater`.
  2. `WebFetch` the best source, and confirm that the page states the **winery (production) address**. Sources in order of preference:
     - the winery's own Visit/Contact page;
     - the Walla Walla Valley Wine Alliance member page (`wallawallawine.com`);
     - the Washington State Wine or Oregon Wine Board directory;
     - reputable press naming the winery's town.
  3. Record the street address as published, `state`, `source_url` (the fetched page, never a search URL), and `source` (publisher and page title).
  4. When the brand pours in Walla Walla but produces in Milton-Freewater (or the reverse), the production address decides. Put the other address in `note`.
  5. If you cannot identify the producer (short or ambiguous names such as "MTR Productions", "Dave Harvey", "Proper", "Rulo"), or its sources disagree on the state, set `state: null` and explain in `note`. Under-labelling beats mislabelling (CLAUDE.md, producer backfill).

  Expect most producers to be in Walla Walla, WA (ZIP 99362), and a few on the Oregon side (Milton-Freewater, OR 97862). Do not assume either: the address decides. Write the file sorted by `name`, with LF line endings.

- [ ] **Step 4:** Run the test and expect PASS. Then print the tally (`node -e "const p=require('./data/usa-reference/us1-producer-states.json').producers;console.log(p.reduce((a,x)=>(a[x.state]=(a[x.state]??0)+1,a),{}))"`) and put it in the commit body.
- [ ] **Step 5: Commit** `data(usa-reference): winery state for the 45 Walla Walla Valley producers, one source each`, with the tally in the body.

### Task 8: The shared reference queries and the pure US-1 spec builder

**Files:**
- Create: `scripts/usa-reference/us1-queries.mjs`
- Create: `scripts/usa-reference/us1-spec-lib.mjs`
- Test: `scripts/usa-reference/us1-spec-lib.test.mjs`

**Interfaces:**
- `us1-queries.mjs` exports:
  - `REF_QUERIES: [table: string, sql: string][]`. Every query takes `$1` = region ids (uuid[]) and `$2` = appellation ids (uuid[]), and returns one row with one jsonb column `refs`.
  - `REF_SORT: Record<string, string[]>`.
  - `plpgsqlRefArray(): string`, the PL/pgSQL `array[...]` literal of the same queries, used by the renderer.
- `us1-spec-lib.mjs` exports:
  - `US1_VERSION`, `US1_REVERT_VERSION`, `FORWARD_PATH`, `REVERT_PATH`, `SPEC_PATH`, `PREIMAGE_PATH`, `PRODUCER_STATES_PATH`;
  - `buildUs1Spec({ draft, producerStates, mapStates, live, ttbNames, existingSpec, newId }) → { spec, preimage }`;
  - `applyToReferences(references, { merges, moves }) → references`.

- [ ] **Step 1: `us1-queries.mjs`** (complete file):

```js
// The reference sets US-1 asserts before and after (spec §6.3). One source for
// the read-only builder, the rendered SQL and the rehearsal, so they cannot
// drift. $1 = region ids (uuid[]), $2 = appellation ids (uuid[]); one jsonb
// column "refs". History payloads (label_reads, catalog_wine_edits) are not
// references: they keep old ids on purpose.
const agg = (fields, order) => `coalesce(jsonb_agg(jsonb_build_object(${fields}) order by ${order}), '[]'::jsonb) as refs`;
const FK3 = "'id', id, 'region_id', region_id, 'appellation_id', appellation_id";

export const REF_QUERIES = [
  ["catalog_wines", `select ${agg(FK3, "id")} from catalog_wines where region_id = any ($1) or appellation_id = any ($2)`],
  ["catalog_wines_unidentified", `select ${agg(FK3, "id")} from catalog_wines_unidentified where region_id = any ($1) or appellation_id = any ($2)`],
  ["wine_answers", `select ${agg("'wine_id', wine_id, 'region_id', region_id, 'appellation_id', appellation_id", "wine_id")} from wine_answers where region_id = any ($1) or appellation_id = any ($2)`],
  ["guesses", `select ${agg(`${FK3}, 'total_points', total_points`, "id")} from guesses where region_id = any ($1) or appellation_id = any ($2)`],
  ["wine_archetypes", `select ${agg(FK3, "id")} from wine_archetypes where region_id = any ($1) or appellation_id = any ($2)`],
  ["label_lookups", `select ${agg(FK3, "id")} from label_lookups where region_id = any ($1) or appellation_id = any ($2)`],
  ["profile_favourite_regions", `select ${agg("'profile_id', profile_id, 'region_id', region_id", "profile_id, region_id")} from profile_favourite_regions where region_id = any ($1)`],
  ["training_attempts", `select ${agg("'id', id, 'picked_region_id', picked_region_id", "id")} from training_attempts where picked_region_id = any ($1)`],
  ["type_designations", `select ${agg("'id', id, 'region_id', region_id", "id")} from type_designations where region_id = any ($1)`],
  ["wine_identity_drafts", `select ${agg("'wine_id', wine_id, 'region_id', draft ->> 'regionId', 'appellation_id', draft ->> 'appellationId'", "wine_id")} from wine_identity_drafts where draft ->> 'regionId' = any ($1::text[]) or draft ->> 'appellationId' = any ($2::text[])`],
];

export const REF_SORT = {
  catalog_wines: ["id"], catalog_wines_unidentified: ["id"], wine_answers: ["wine_id"], guesses: ["id"],
  wine_archetypes: ["id"], label_lookups: ["id"], profile_favourite_regions: ["profile_id", "region_id"],
  training_attempts: ["id"], type_designations: ["id"], wine_identity_drafts: ["wine_id"],
};

export function plpgsqlRefArray() {
  for (const [, q] of REF_QUERIES) if (q.includes("$q$")) throw new Error("a reference query contains $q$");
  return `array[\n${REF_QUERIES.map(([t, q]) => `    '${t}', $q$${q}$q$`).join(",\n")}\n  ]`;
}
```

- [ ] **Step 2: Write the failing tests** (complete file):

```js
// scripts/usa-reference/us1-spec-lib.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { applyToReferences, buildUs1Spec } from "./us1-spec-lib.mjs";

const EMPTY_REFS = {
  catalog_wines: [], catalog_wines_unidentified: [], wine_answers: [], guesses: [], wine_archetypes: [],
  label_lookups: [], profile_favourite_regions: [], training_attempts: [], type_designations: [], wine_identity_drafts: [],
};
const app = (id, name, region_id) => ({ id, name, region_id, map_status: "PENDING", wine_place_id: null });
const reg = (id, name) => ({ id, name, country_id: "c-us", map_status: "PENDING", wine_place_id: null });
const live = (patch = {}) => ({
  country_id: "c-us",
  regions: [reg("r-ca", "California"), reg("r-cg", "Columbia Gorge"), reg("r-or", "Oregon"), reg("r-wa", "Washington"), reg("r-wwv", "Walla Walla Valley")],
  appellations: [
    app("a-ca-self", "California AVA", "r-ca"), app("a-cg", "Columbia Gorge AVA", "r-or"), app("a-cg-p", "Columbia Gorge AVA", "r-cg"),
    app("a-cg-wa", "Columbia Gorge AVA", "r-wa"), app("a-cv-or", "Columbia Valley AVA", "r-or"), app("a-cv-wa", "Columbia Valley AVA", "r-wa"),
    app("a-napa", "Napa Valley AVA", "r-ca"), app("a-sb", "San Benito County AVA", "r-ca"), app("a-sbt", "Santa Benito County AVA", "r-ca"),
    app("a-wwv", "Walla Walla Valley AVA", "r-wwv"), app("a-wwv-wa", "Walla Walla Valley", "r-wa"),
  ],
  producers: [{ id: "p1", name: "Alpha Cellars", region_id: "r-wwv" }, { id: "p2", name: "Beta Wines", region_id: "r-wwv" }],
  region_grapes: [
    { region_id: "r-wa", grape_id: "g-cab", role: "PRINCIPAL" }, { region_id: "r-wa", grape_id: "g-ries", role: "ACCESSORY" },
    { region_id: "r-wwv", grape_id: "g-cab", role: "PRINCIPAL" },
  ],
  references: { ...EMPTY_REFS, catalog_wines: [{ id: "w1", region_id: "r-or", appellation_id: "a-cg" }],
    guesses: [{ id: "g1", region_id: "r-ca", appellation_id: "a-napa", total_points: 20 }] },
  fk_catalogue: [{ table: "appellations", column: "region_id", ref: "regions" }, { table: "guesses", column: "appellation_id", ref: "appellations" }],
  ...patch,
});
const draft = () => ({
  counts: { regions: 5, appellations: 11, ava_suffixed: 10 },
  flags: [],
  steps: {
    "1_state_suffix": [{ id: "a-ca-self", region: "California", old: "California AVA", new: "California" }],
    "2_county_suffix": [{ id: "a-sb", region: "California", old: "San Benito County AVA", new: "San Benito County" }],
    "3_merges": [
      { loser: { id: "a-sbt", region: "California", name: "Santa Benito County AVA" }, kept: { id: "a-sb", region: "California", name: "San Benito County AVA" }, why: "a typo" },
      { loser: { id: "a-wwv-wa", region: "Washington", name: "Walla Walla Valley" }, kept: { id: "a-wwv", region: "Walla Walla Valley", name: "Walla Walla Valley AVA" }, why: "one row per AVA" },
    ],
    "4_legal_names": [],
    "5_cross_state": [
      { ava: "Columbia Valley", map_state: "WA", kept: "a-cv-wa", losers: ["a-cv-or"] },
      { ava: "Walla Walla Valley", map_state: "WA", move: "a-wwv", to_region: "Washington", to_region_id: "r-wa" },
      { ava: "Lake Erie", map_state: "OH", action: "left for Ohio's wave (not moved)" },
    ],
    "6_columbia_gorge": { ava: "Columbia Gorge", map_state: "OR", kept: "a-cg", losers: ["a-cg-wa", "a-cg-p"] },
    "7_pseudo_regions": {
      "Walla Walla Valley": { region_id: "r-wwv", producers: [], region_grapes: [] },
      "Columbia Gorge": { region_id: "r-cg", producers: [], region_grapes: [] },
    },
    "8_missing_avas": [{ name: "Yakima Valley AVA", region: "Washington", cfr: "9.69" }],
  },
});
const producerStates = () => ({ producers: [
  { id: "p1", name: "Alpha Cellars", state: "WA", winery_address: "1 Main St, Walla Walla, WA 99362", source_url: "https://alpha.example", source: "Alpha, Visit", note: null },
  { id: "p2", name: "Beta Wines", state: "OR", winery_address: "2 Bench Rd, Milton-Freewater, OR 97862", source_url: "https://beta.example", source: "Beta, Contact", note: null },
] });
const mapStates = { "Columbia Valley": "WA", "Walla Walla Valley": "WA", "Columbia Gorge": "OR" };
const ttbNames = ["Napa Valley", "Columbia Valley", "Walla Walla Valley", "Columbia Gorge", "Yakima Valley"];
let n = 0;
const build = (over = {}) => buildUs1Spec({ draft: draft(), producerStates: producerStates(), mapStates, live: live(), ttbNames, existingSpec: null, newId: () => `new-${++n}`, ...over });

test("the post-state: merges, a move, renames, retired pseudo-regions, new rows", () => {
  n = 0;
  const { spec, preimage } = build();
  assert.deepEqual(spec.moves.map((m) => [m.id, m.from_region_id, m.to_region_id]), [["a-wwv", "r-wwv", "r-wa"]]);
  assert.deepEqual(spec.merges.map((m) => [m.loser_id, m.kept_id, m.kept_region_id, m.cross_region]), [
    ["a-sbt", "a-sb", "r-ca", false], ["a-wwv-wa", "a-wwv", "r-wa", false],
    ["a-cv-or", "a-cv-wa", "r-wa", true], ["a-cg-wa", "a-cg", "r-or", true], ["a-cg-p", "a-cg", "r-or", true],
  ]);
  assert.deepEqual(spec.renames.map((r) => [r.id, r.new]), [["a-ca-self", "California"], ["a-sb", "San Benito County"]]);
  assert.deepEqual(spec.pseudo_regions.map((p) => [p.id, p.grapes_into_region_id, p.producers.map((x) => [x.id, x.to_region_id])]), [
    ["r-wwv", "r-wa", [["p1", "r-wa"], ["p2", "r-or"]]], ["r-cg", "r-or", []],
  ]);
  assert.deepEqual(spec.new_rows, [{ id: "new-1", name: "Yakima Valley AVA", region: "Washington", region_id: "r-wa", cfr: "9.69" }]);
  assert.deepEqual(spec.post.region_ids, ["r-ca", "r-or", "r-wa"]);
  assert.deepEqual([spec.post.appellation_count, spec.post.ava_suffixed], [7, 5]);
  assert.deepEqual(spec.post.per_region, { "r-ca": 3, "r-or": 1, "r-wa": 3 });
  assert.deepEqual(spec.post.ava_names, ["Columbia Gorge AVA", "Columbia Valley AVA", "Napa Valley AVA", "Walla Walla Valley AVA", "Yakima Valley AVA"]);
  assert.deepEqual(spec.post.producers, [{ id: "p1", region_id: "r-wa" }, { id: "p2", region_id: "r-or" }]);
  assert.deepEqual(spec.post.region_grapes, [
    { region_id: "r-wa", grape_id: "g-cab", role: "PRINCIPAL" }, { region_id: "r-wa", grape_id: "g-ries", role: "ACCESSORY" },
  ]);
  assert.deepEqual(spec.post.references, spec.pre.references);
  assert.equal(preimage.appellations.length, 11);
  assert.deepEqual(preimage.producers, [{ id: "p1", region_id: "r-wwv" }, { id: "p2", region_id: "r-wwv" }]);
});

test("guesses never move: a guess on a merging row stops the build (§6.3)", () => {
  const l = live();
  l.references.guesses.push({ id: "g2", region_id: "r-ca", appellation_id: "a-sbt", total_points: 0 });
  assert.throws(() => build({ live: l }), /STOP \(§6\.3\)/);
});

test("a wine on a row that changes state stops for the owner; a same-state merge re-points it", () => {
  const cross = live();
  cross.references.catalog_wines.push({ id: "w2", region_id: "r-or", appellation_id: "a-cv-or" });
  assert.throws(() => build({ live: cross }), /STOP for the owner \(§6\.2 step 6\)/);
  const same = live();
  same.references.wine_archetypes.push({ id: "arch", region_id: "r-ca", appellation_id: "a-sbt" });
  const { spec } = build({ live: same });
  assert.deepEqual(spec.post.references.wine_archetypes, [{ id: "arch", region_id: "r-ca", appellation_id: "a-sb" }]);
});

test("anything still naming a pseudo-region stops the build", () => {
  const l = live();
  l.references.profile_favourite_regions.push({ profile_id: "u1", region_id: "r-wwv" });
  assert.throws(() => build({ live: l }), /still names pseudo-region Walla Walla Valley/);
});

test("the producer research must cover exactly the pseudo-region's producers, with a valid state", () => {
  const missing = producerStates(); missing.producers.pop();
  assert.throws(() => build({ producerStates: missing }), /producer states must cover exactly/);
  const idaho = producerStates(); idaho.producers[0].state = "ID";
  assert.throws(() => build({ producerStates: idaho }), /state must be WA, OR or null/);
});

test("a post-state ' AVA' name TTB does not list, a duplicate (region, name), or live drift stops the build", () => {
  const d = draft(); d.steps["8_missing_avas"].push({ name: "Bogus Hills AVA", region: "Washington", cfr: "9.999" });
  assert.throws(() => build({ draft: d }), /not a TTB legal name: Bogus Hills AVA/);
  const dup = draft(); dup.steps["8_missing_avas"].push({ name: "Columbia Valley AVA", region: "Washington", cfr: "9.74" });
  assert.throws(() => build({ draft: dup }), /duplicate \(region, name\)/);
  const moved = draft(); moved.counts.appellations = 12;
  assert.throws(() => build({ draft: moved }), /live moved since the draft/);
  const wrongState = { ...mapStates, "Columbia Valley": "OR" };
  assert.throws(() => build({ mapStates: wrongState }), /Columbia Valley: the tree keys it under OR/);
});

test("new-row ids are stable across rebuilds", () => {
  const first = build().spec;
  const again = build({ existingSpec: first, newId: () => { throw new Error("must reuse"); } }).spec;
  assert.deepEqual(again.new_rows, first.new_rows);
});

test("applyToReferences re-points a merged or moved appellation, and never a guess", () => {
  const refs = { ...EMPTY_REFS, wine_archetypes: [{ id: "x", region_id: "r-wwv", appellation_id: "a-wwv" }] };
  const out = applyToReferences(refs, { merges: [], moves: [{ id: "a-wwv", to_region_id: "r-wa" }] });
  assert.deepEqual(out.wine_archetypes, [{ id: "x", region_id: "r-wa", appellation_id: "a-wwv" }]);
});
```

- [ ] **Step 3:** Run `cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/usa-reference/us1-spec-lib.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement `us1-spec-lib.mjs`** (complete file):

```js
// Pure core of US-1, the United States scoring-reference clean-up (spec
// docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §6). No network, no
// database: build-us1-spec.mjs reads live (read-only) and hands the rows here.
// It refuses whatever the migration would refuse, so a bad state is caught
// before any SQL is rendered.
import { foldAvaName } from "../wine-map-sources/usa-ava-lib.mjs";
import { REF_SORT } from "./us1-queries.mjs";

export const US1_VERSION = "20260929214747";
export const US1_REVERT_VERSION = "20260929224747";
export const FORWARD_PATH = `supabase/migrations/${US1_VERSION}_usa_reference_cleanup.sql`;
export const REVERT_PATH = `scripts/usa-reference/${US1_REVERT_VERSION}_usa_reference_cleanup_revert.sql`;
export const SPEC_PATH = "data/usa-reference/us1-spec.json";
export const PREIMAGE_PATH = `data/usa-reference/preimage-${US1_VERSION}.json`;
export const PRODUCER_STATES_PATH = "data/usa-reference/us1-producer-states.json";
export const ANCHOR_ID = "ef4ebc71-aadf-4792-abae-300698f7b09f";
const STATE_REGION = { WA: "Washington", OR: "Oregon" };

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const sortBy = (keys) => (x, y) => keys.reduce((acc, k) => acc || cmp(String(x[k]), String(y[k])), 0);

export function applyToReferences(references, { merges, moves }) {
  const merged = new Map(merges.map((m) => [m.loser_id, m]));
  const moved = new Map(moves.map((m) => [m.id, m]));
  const out = {};
  for (const [table, rows] of Object.entries(references)) {
    out[table] = rows.map((row) => {
      if (!("appellation_id" in row)) return row;
      const m = merged.get(row.appellation_id);
      if (m) {
        if (table === "guesses") throw new Error(`STOP (§6.3): guess ${row.id} names ${m.loser_name}, which merges; guesses never move`);
        return { ...row, appellation_id: m.kept_id, region_id: m.kept_region_id };
      }
      const mv = moved.get(row.appellation_id);
      if (mv) {
        if (table === "guesses") throw new Error(`STOP (§6.3): guess ${row.id} names a row that moves state; guesses never move`);
        return { ...row, region_id: mv.to_region_id };
      }
      return row;
    }).sort(sortBy(REF_SORT[table]));
  }
  return out;
}

export function buildUs1Spec({ draft, producerStates, mapStates, live, ttbNames, existingSpec = null, newId }) {
  if (draft.flags.length) throw new Error(`the draft has flags: ${draft.flags.join("; ")}`);
  const s = draft.steps;
  const regionById = new Map(live.regions.map((r) => [r.id, r]));
  const regionIdByName = new Map(live.regions.map((r) => [r.name, r.id]));
  const appById = new Map(live.appellations.map((a) => [a.id, a]));
  const suffixed = live.appellations.filter((a) => a.name.endsWith(" AVA")).length;
  if (live.regions.length !== draft.counts.regions || live.appellations.length !== draft.counts.appellations || suffixed !== draft.counts.ava_suffixed) {
    throw new Error(`live moved since the draft: ${live.regions.length}/${live.appellations.length}/${suffixed} vs ${draft.counts.regions}/${draft.counts.appellations}/${draft.counts.ava_suffixed}; re-run draft-us1-cleanup.mjs`);
  }
  for (const x of [...live.regions, ...live.appellations]) {
    if (x.map_status !== "PENDING" || x.wine_place_id !== null) throw new Error(`${x.name} is ${x.map_status}/${x.wine_place_id}; every US row must stay PENDING and unlinked (D13)`);
  }
  const need = (id, what) => {
    const a = appById.get(id);
    if (!a) throw new Error(`${what}: appellation ${id} is not live`);
    return a;
  };
  const regionName = (id) => regionById.get(id).name;

  // Map states must agree with the regenerated tree reports.
  const checkState = (ava, code) => {
    if (mapStates[ava] !== code) throw new Error(`${ava}: the tree keys it under ${mapStates[ava]}, the draft under ${code}`);
  };

  // 1. Moves.
  const moves = s["5_cross_state"].filter((x) => x.move).map((x) => {
    checkState(x.ava, x.map_state);
    const a = need(x.move, `move ${x.ava}`);
    return { id: a.id, name: a.name, from_region: regionName(a.region_id), from_region_id: a.region_id, to_region: x.to_region, to_region_id: x.to_region_id };
  });
  const regionAfterMove = (a) => moves.find((m) => m.id === a.id)?.to_region_id ?? a.region_id;

  // 2. Merges: step 3, then the cross-state rows, then Columbia Gorge.
  const mergePairs = [
    ...s["3_merges"].map((m) => [m.loser.id, m.kept.id, m.why]),
    ...s["5_cross_state"].filter((x) => x.kept).flatMap((x) => { checkState(x.ava, x.map_state); return x.losers.map((l) => [l, x.kept, `one row per AVA, under ${x.map_state}`]); }),
  ];
  checkState(s["6_columbia_gorge"].ava, s["6_columbia_gorge"].map_state);
  mergePairs.push(...s["6_columbia_gorge"].losers.map((l) => [l, s["6_columbia_gorge"].kept, "one row per AVA, under OR (owner: Oregon)"]));
  const merges = mergePairs.map(([loserId, keptId, why]) => {
    const loser = need(loserId, "merge loser");
    const kept = need(keptId, "merge kept");
    const keptRegion = regionAfterMove(kept);
    return {
      loser_id: loser.id, loser_name: loser.name, loser_region: regionName(loser.region_id), loser_region_id: loser.region_id,
      kept_id: kept.id, kept_name: kept.name, kept_region: regionName(keptRegion), kept_region_id: keptRegion,
      cross_region: loser.region_id !== keptRegion, why,
    };
  });

  // 3. Renames.
  const renames = [["1_state_suffix", s["1_state_suffix"]], ["2_county_suffix", s["2_county_suffix"]], ["4_legal_names", s["4_legal_names"]]]
    .flatMap(([step, list]) => list.map((r) => {
      const a = need(r.id, `rename ${r.old}`);
      if (a.name !== r.old) throw new Error(`rename: ${r.id} is "${a.name}", not "${r.old}"`);
      return { step, id: a.id, region: regionName(a.region_id), region_id: a.region_id, old: r.old, new: r.new };
    }));

  // 4. Pseudo-regions and the producer research.
  const research = new Map(producerStates.producers.map((p) => [p.id, p]));
  const pseudoIds = new Set();
  const pseudo_regions = Object.entries(s["7_pseudo_regions"]).map(([name, v]) => {
    pseudoIds.add(v.region_id);
    const into = name === "Columbia Gorge" ? "OR" : mapStates[name];
    if (!STATE_REGION[into]) throw new Error(`${name}: grapes have no wave state to join (${into})`);
    const onRegion = live.producers.filter((p) => p.region_id === v.region_id);
    return {
      id: v.region_id, name,
      grapes_into_region: STATE_REGION[into], grapes_into_region_id: regionIdByName.get(STATE_REGION[into]),
      producers: onRegion.map((p) => {
        const r = research.get(p.id);
        if (!r) throw new Error(`producer states must cover exactly the pseudo-regions' producers: ${p.name} (${p.id}) is missing`);
        if (!["WA", "OR", null].includes(r.state)) throw new Error(`${p.name}: state must be WA, OR or null, not ${r.state}`);
        return { id: p.id, name: p.name, state: r.state, to_region_id: r.state ? regionIdByName.get(STATE_REGION[r.state]) : null };
      }).sort(sortBy(["id"])),
    };
  });
  const covered = new Set(pseudo_regions.flatMap((p) => p.producers.map((x) => x.id)));
  for (const id of research.keys()) if (!covered.has(id)) throw new Error(`producer states must cover exactly the pseudo-regions' producers: ${id} is not on one`);

  // 5. STOP rules (§6.2 step 6, §6.3).
  const crossIds = new Set([...moves.map((m) => m.id), ...merges.filter((m) => m.cross_region).map((m) => m.loser_id)]);
  for (const table of ["catalog_wines", "wine_answers"]) {
    for (const row of live.references[table]) {
      if (crossIds.has(row.appellation_id)) throw new Error(`STOP for the owner (§6.2 step 6): ${table} ${row.id ?? row.wine_id} names ${appById.get(row.appellation_id).name}, which changes state`);
    }
  }
  for (const [table, rows] of Object.entries(live.references)) {
    for (const row of rows) {
      const rid = row.region_id ?? row.picked_region_id;
      if (pseudoIds.has(rid)) throw new Error(`${table} still names pseudo-region ${regionName(rid)}`);
    }
  }
  const postReferences = applyToReferences(live.references, { merges, moves });

  // 6. New rows (ids stable across rebuilds).
  const oldIds = new Map((existingSpec?.new_rows ?? []).map((r) => [`${r.region}|${r.name}`, r.id]));
  const new_rows = s["8_missing_avas"].map((x) => ({
    id: oldIds.get(`${x.region}|${x.name}`) ?? newId(), name: x.name, region: x.region, region_id: regionIdByName.get(x.region), cfr: x.cfr,
  }));

  // 7. The post-state appellations.
  const loserIds = new Set(merges.map((m) => m.loser_id));
  const renamed = new Map(renames.map((r) => [r.id, r.new]));
  const post = live.appellations.filter((a) => !loserIds.has(a.id))
    .map((a) => ({ id: a.id, name: renamed.get(a.id) ?? a.name, region_id: regionAfterMove(a) }))
    .concat(new_rows.map((r) => ({ id: r.id, name: r.name, region_id: r.region_id })));
  const seen = new Set();
  for (const a of post) {
    const k = `${a.region_id}|${a.name}`;
    if (seen.has(k)) throw new Error(`duplicate (region, name) after US-1: ${regionName(a.region_id)} › ${a.name}`);
    seen.add(k);
    if (pseudoIds.has(a.region_id)) throw new Error(`${a.name} is still on pseudo-region ${regionName(a.region_id)}`);
  }
  const ttb = new Set(ttbNames.map(foldAvaName));
  for (const a of post) if (a.name.endsWith(" AVA") && !ttb.has(foldAvaName(a.name))) throw new Error(`not a TTB legal name: ${a.name}`);
  const postRegionIds = live.regions.map((r) => r.id).filter((id) => !pseudoIds.has(id)).sort(cmp);
  // Regions with no appellation are left out, as the SQL's jsonb_object_agg leaves them out.
  const per_region = Object.fromEntries(postRegionIds.map((id) => [id, post.filter((a) => a.region_id === id).length]).filter(([, count]) => count > 0));

  const pushGrapes = new Map(pseudo_regions.map((p) => [p.id, p.grapes_into_region_id]));
  const grapeKey = (g) => `${g.region_id}|${g.grape_id}`;
  const keptGrapes = live.region_grapes.filter((g) => !pseudoIds.has(g.region_id));
  const have = new Set(keptGrapes.map(grapeKey));
  const postGrapes = [...keptGrapes];
  for (const g of live.region_grapes.filter((x) => pseudoIds.has(x.region_id))) {
    const moved = { ...g, region_id: pushGrapes.get(g.region_id) };
    if (!have.has(grapeKey(moved))) { postGrapes.push(moved); have.add(grapeKey(moved)); }
  }

  const rows = [...new Map([...renames.map((r) => r.id), ...merges.flatMap((m) => [m.loser_id, m.kept_id]), ...moves.map((m) => m.id)]
    .map((id) => [id, appById.get(id)])).values()].map((a) => ({ id: a.id, region_id: a.region_id, name: a.name })).sort(sortBy(["id"]));
  const spec = {
    _note: "US-1 (spec §6). Built by scripts/usa-reference/build-us1-spec.mjs from the approved draft, the producer research and a read-only live read. Rendered into the migration by render-us1-sql.mjs.",
    version: US1_VERSION, revert_version: US1_REVERT_VERSION, anchor_id: ANCHOR_ID, country_id: live.country_id,
    fk_catalogue: [...live.fk_catalogue].sort(sortBy(["ref", "table", "column"])),
    pre: {
      region_ids: live.regions.map((r) => r.id).sort(cmp), appellation_count: live.appellations.length, ava_suffixed: suffixed,
      rows, references: live.references, region_grapes: [...live.region_grapes].sort(sortBy(["region_id", "grape_id"])),
    },
    moves, merges, renames, pseudo_regions, new_rows,
    post: {
      region_ids: postRegionIds, appellation_count: post.length, ava_suffixed: post.filter((a) => a.name.endsWith(" AVA")).length,
      per_region, ava_names: post.filter((a) => a.name.endsWith(" AVA")).map((a) => a.name).sort(cmp),
      references: postReferences,
      producers: pseudo_regions.flatMap((p) => p.producers.map((x) => ({ id: x.id, region_id: x.to_region_id }))).sort(sortBy(["id"])),
      region_grapes: postGrapes.sort(sortBy(["region_id", "grape_id"])),
    },
  };
  const preimage = {
    _note: "US-1 pre-image (spec §6.4): ids and FK columns only, no content. The revert restores exactly this.",
    version: US1_VERSION,
    regions: live.regions.map(({ id, name, country_id }) => ({ id, name, country_id })).sort(sortBy(["id"])),
    appellations: live.appellations.map(({ id, name, region_id }) => ({ id, name, region_id })).sort(sortBy(["id"])),
    producers: live.producers.map(({ id, region_id }) => ({ id, region_id })).sort(sortBy(["id"])),
    region_grapes: spec.pre.region_grapes,
    references: live.references,
  };
  return { spec, preimage };
}
```

Notes for the implementer:
- `sortBy` compares strings. Postgres orders a `uuid` by its bytes, which is the same order as its lowercase hex text, so the builder's order matches the SQL's `order by id`.
- `post.per_region` covers every post-state US region, not only the four wave states.
- The fixture's first test depends on the merge order: step 3, then cross-state, then Columbia Gorge.

- [ ] **Step 5:** Run `node --test scripts/usa-reference/us1-spec-lib.test.mjs` and expect every test to PASS.
- [ ] **Step 6: Commit** `feat(usa-reference): pure US-1 spec builder with the §6.3 STOP rules`.

### Task 9: Build `us1-spec.json` and the pre-image from a read-only live read

**Files:**
- Create: `scripts/usa-reference/build-us1-spec.mjs`
- Create (generated): `data/usa-reference/us1-spec.json`, `data/usa-reference/preimage-20260929214747.json`

**Interfaces:** Consumes `buildUs1Spec`, `REF_QUERIES`, `withReadOnly`, the draft, the producer research, the four tree reports and the TTB list. `--check` rebuilds the spec and pre-image and compares them with the committed files (ignoring `read_at`). It exits 1 on any difference, and the main session runs it on the apply day.

- [ ] **Step 1: Write the script** (complete file):

```js
// READ-ONLY. Builds data/usa-reference/us1-spec.json and the pre-image from
// the owner-approved draft, the producer research, the regenerated tree
// reports and one `begin read only` read of live. Nothing is written live.
// Usage: node scripts/usa-reference/build-us1-spec.mjs [--check]
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { buildUs1Spec, PREIMAGE_PATH, PRODUCER_STATES_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

const check = process.argv.includes("--check");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const draft = await json("data/usa-reference/us1-cleanup-draft.json");
const producerStates = await json(PRODUCER_STATES_PATH);
const ttbNames = (await json("data/wine-map/usa-ava-ttb-list.json")).avas.map((t) => t.name);
const mapStates = {};
for (const s of ["california", "washington", "oregon", "new-york"]) {
  const r = await json(`data/wine-map/usa-${s}-tree.json`);
  for (const p of r.places.filter((x) => x.ucd_ava_id)) mapStates[p.name] = p.map_state;
  for (const d of r.deferred) mapStates[d.name] = d.map_state;
}
let existingSpec = null;
try { existingSpec = await json(SPEC_PATH); } catch { /* first build */ }

const live = await withReadOnly(async (c) => {
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  const [{ id: country_id }] = await q("select id from countries where name = 'United States'");
  const regions = await q("select id, name, country_id, map_status::text as map_status, wine_place_id from regions where country_id = $1 order by id", [country_id]);
  const regionIds = regions.map((r) => r.id);
  const appellations = await q("select id, name, region_id, map_status::text as map_status, wine_place_id from appellations where region_id = any ($1) order by id", [regionIds]);
  const appIds = appellations.map((a) => a.id);
  const pseudoIds = Object.values(draft.steps["7_pseudo_regions"]).map((v) => v.region_id);
  const references = {};
  for (const [table, sql] of REF_QUERIES) references[table] = (await c.query(sql, [regionIds, appIds])).rows[0].refs;
  return {
    country_id, regions, appellations, references,
    producers: await q("select id, name, region_id from producers where region_id = any ($1) order by id", [pseudoIds]),
    region_grapes: await q("select region_id, grape_id, role from region_grapes where region_id = any ($1) order by region_id, grape_id", [regionIds]),
    fk_catalogue: await q(`select c.conrelid::regclass::text as "table", a.attname::text as "column", c.confrelid::regclass::text as ref
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid in ('public.appellations'::regclass, 'public.regions'::regclass)`),
  };
});

const { spec, preimage } = buildUs1Spec({ draft, producerStates, mapStates, live, ttbNames, existingSpec, newId: randomUUID });
const readAt = new Date().toISOString();
const out = { spec: { ...spec, built_at: readAt }, preimage: { ...preimage, read_at: readAt } };
if (check) {
  const strip = (x) => JSON.stringify({ ...x, built_at: undefined, read_at: undefined });
  const same = strip(out.spec) === strip(existingSpec) && strip(out.preimage) === strip(await json(PREIMAGE_PATH));
  console.log(same ? "US-1 spec and pre-image match live" : "US-1 spec or pre-image DIFFER from live: rebuild, re-render, re-rehearse");
  process.exit(same ? 0 : 1);
}
await writeFile(SPEC_PATH, `${JSON.stringify(out.spec, null, 2)}\n`);
await writeFile(PREIMAGE_PATH, `${JSON.stringify(out.preimage, null, 2)}\n`);
console.log(`pre ${spec.pre.region_ids.length} regions / ${spec.pre.appellation_count} appellations / ${spec.pre.ava_suffixed} " AVA"; post ${spec.post.region_ids.length} / ${spec.post.appellation_count} / ${spec.post.ava_suffixed}`);
console.log(`moves ${spec.moves.length}, merges ${spec.merges.length}, renames ${spec.renames.length}, pseudo-regions ${spec.pseudo_regions.length}, new rows ${spec.new_rows.length}`);
```

- [ ] **Step 2: Run it.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node scripts/usa-reference/build-us1-spec.mjs`
Expected, exactly:
```
pre 28 regions / 240 appellations / 210 " AVA"; post 26 / 282 / 233
moves 1, merges 8, renames 26, pseudo-regions 2, new rows 50
```
Then check the numbers:
```bash
cd C:/Users/Public/repos/blindtastingapp-map && node -e "const s=require('./data/usa-reference/us1-spec.json');console.log(s.post.per_region['18d52236-681f-4a5a-ba98-cd0639210fb3'],s.post.per_region['1e5608bb-976a-4007-b575-33e0ee391154'],s.post.per_region['8a6c9c90-31af-455f-ab0f-ca02c3d1bda4'],s.post.per_region['0a35f1d4-2baa-4b32-9815-231ce6bf79dd'],s.fk_catalogue.length,s.pre.references.catalog_wines.length,s.pre.references.wine_answers.length,s.pre.references.guesses.length,s.pre.references.wine_archetypes.length)"
```
Expected: `175 22 22 11 16 5 2 4 3`. The 16 is 5 foreign keys onto `appellations` plus 11 onto `regions`, as the live read found on 2026-09-29.

If the builder throws, or any number differs, **stop**. Report the message and the live read to the main session. Never edit the spec by hand.

- [ ] **Step 3: `--check` agrees with itself.** Run `node scripts/usa-reference/build-us1-spec.mjs --check` → `US-1 spec and pre-image match live`, exit 0.
- [ ] **Step 4: Commit** `data(usa-reference): US-1 spec and pre-image (read-only live read)`, staging the script and both JSON files.

### Task 10: The forward migration template, renderer and render test

**Files:**
- Create: `scripts/usa-reference/us1-cleanup.sql.template`
- Create: `scripts/usa-reference/render-us1-sql.mjs`
- Test: `scripts/usa-reference/us1-sql.test.mjs`
- Create (rendered): `supabase/migrations/20260929214747_usa_reference_cleanup.sql`

**Interfaces:**
- `render-us1-sql.mjs` exports `renderUs1Sql({ template, spec, preimage }) → string` and, when run directly, writes `FORWARD_PATH` and `REVERT_PATH`.
- Template placeholders: `__US1_SPEC__`, `__US1_PREIMAGE__` (revert only), `__US1_REF_QUERIES__`.

- [ ] **Step 1: The failing render test** (complete file; Task 11 adds the revert case to it):

```js
// scripts/usa-reference/us1-sql.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { renderUs1Sql } from "./render-us1-sql.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { FORWARD_PATH, PREIMAGE_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));

test("the committed forward migration is exactly the render of the committed spec", async () => {
  const want = renderUs1Sql({ template: await readFile("scripts/usa-reference/us1-cleanup.sql.template", "utf8"), spec: await json(SPEC_PATH), preimage: await json(PREIMAGE_PATH) });
  assert.equal(lf(await readFile(FORWARD_PATH, "utf8")), want);
});

test("the forward migration has no transaction statement (D24), carries every reference query, and no leftover placeholder", async () => {
  const sql = await readFile(FORWARD_PATH, "utf8");
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  for (const [, q] of REF_QUERIES) assert.ok(sql.includes(q), q.slice(0, 60));
  assert.ok(!/__US1_[A-Z_]+__/.test(sql));
  assert.equal(sql.split('"anchor_id": "ef4ebc71-aadf-4792-abae-300698f7b09f"').length, 2, "the anchor appears once");
});

test("a spec that contains its own dollar-quote tag is refused", () => {
  assert.throws(() => renderUs1Sql({ template: "x __US1_SPEC__", spec: { a: "$spec$" }, preimage: {} }), /\$spec\$/);
});
```

- [ ] **Step 2:** Run `node --test scripts/usa-reference/us1-sql.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 3: The renderer** (complete file):

```js
// Renders the US-1 forward and revert SQL from their templates and the
// committed spec and pre-image. Pure renderUs1Sql; running the file writes both.
// Usage: node scripts/usa-reference/render-us1-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { plpgsqlRefArray } from "./us1-queries.mjs";
import { FORWARD_PATH, PREIMAGE_PATH, REVERT_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

export function renderUs1Sql({ template, spec, preimage }) {
  const specJson = JSON.stringify(spec, null, 2);
  const preJson = JSON.stringify(preimage, null, 2);
  if (specJson.includes("$spec$")) throw new Error("the spec contains $spec$");
  if (preJson.includes("$pre$")) throw new Error("the pre-image contains $pre$");
  // Function replacers: a "$" in the JSON must never act as a replacement pattern.
  return template
    .replace("__US1_REF_QUERIES__", () => plpgsqlRefArray())
    .replace("__US1_SPEC__", () => specJson)
    .replace("__US1_PREIMAGE__", () => preJson);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  const preimage = JSON.parse(await readFile(PREIMAGE_PATH, "utf8"));
  for (const [tpl, out] of [["scripts/usa-reference/us1-cleanup.sql.template", FORWARD_PATH], ["scripts/usa-reference/us1-cleanup-revert.sql.template", REVERT_PATH]]) {
    let template;
    try { template = await readFile(tpl, "utf8"); } catch { console.log(`skip ${out} (no ${tpl} yet)`); continue; }
    await writeFile(out, renderUs1Sql({ template: template.replace(/\r\n/g, "\n"), spec, preimage }));
    console.log(`wrote ${out}`);
  }
}
```

- [ ] **Step 4: The forward template** (complete file, `scripts/usa-reference/us1-cleanup.sql.template`, LF):

```sql
-- US-1: the United States scoring-reference clean-up
-- (docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §6, D13, D14).
-- The owner approved data/usa-reference/us1-copy-list.md as listed (2026-09-29).
--
-- GENERATED by scripts/usa-reference/render-us1-sql.mjs from
-- data/usa-reference/us1-spec.json. Do not hand-edit: change the spec, re-render.
--
-- One transaction, owned by the applier: this file has no begin/commit (D24).
--   1. Moves "Walla Walla Valley AVA" off the Walla Walla Valley pseudo-region
--      to Washington, the state the map keys it under.
--   2. Merges 8 duplicate rows into their kept row. Every reference is
--      re-pointed first (catalog_wines, catalog_wines_unidentified,
--      wine_answers, wine_archetypes, label_lookups, wine_identity_drafts),
--      then the emptied row is deleted. Guesses never move: a guess on a
--      merging or moving row stops the migration. So does a wine or answer key
--      whose state would change (spec §6.2 step 6: that is the owner's call).
--   3. Renames 26 rows in place, by id. Ids never change.
--   4. Retires the Walla Walla Valley and Columbia Gorge pseudo-regions. Each
--      producer is re-linked by id to the state of its winery
--      (data/usa-reference/us1-producer-states.json, one cited source each);
--      grapes join the state's set without duplicates.
--   5. Adds 50 AVA rows under TTB's legal names, with fixed ids.
-- History payloads keep old ids: the jsonb in label_reads and
-- catalog_wine_edits is history and is not re-pointed. Every US row stays
-- map_status PENDING and unlinked (D13).
-- Live mode (the anchor row exists) asserts the exact pre- and post-state,
-- including every foreign key onto appellations and regions. Replay mode (a
-- fresh replay of the seed migrations) applies each step by name where its
-- rows exist and asserts no counts.
-- Rollback: scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql.
-- Apply at a quiet hour: a client still holding a retired region id fails its
-- next save with a foreign-key error (no live row references one today).

set local lock_timeout = '10s';

do $us1$
declare
  v_spec constant jsonb := $spec$__US1_SPEC__$spec$::jsonb;
  v_refq constant text[] := __US1_REF_QUERIES__;
  v_live boolean;
  v_us uuid;
  v_regions uuid[];
  v_apps uuid[];
  v_x jsonb;
  v_p jsonb;
  v_got jsonb;
  v_n int;
  v_m int;
  v_i int;
  v_id uuid;
  v_to uuid;
  v_loser uuid;
  v_kept uuid;
  v_kept_region uuid;
  v_region uuid;
  v_into uuid;
begin
  select id into v_us from countries where name = 'United States';
  if v_us is null then
    raise notice 'usa_reference_cleanup: no United States row; nothing to do';
    return;
  end if;
  v_live := exists (select 1 from appellations where id = (v_spec ->> 'anchor_id')::uuid);
  raise notice 'usa_reference_cleanup: % mode', case when v_live then 'live' else 'replay' end;

  -- A. Pre-state, live mode only.
  if v_live then
    -- A1. The foreign keys onto appellations and regions are exactly the
    --     catalogue the spec was built against.
    select count(*) into v_n from (
      (select c.conrelid::regclass::text, a.attname::text, c.confrelid::regclass::text
         from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.confrelid in ('public.appellations'::regclass, 'public.regions'::regclass)
       except
       select x.v ->> 'table', x.v ->> 'column', x.v ->> 'ref' from jsonb_array_elements(v_spec -> 'fk_catalogue') as x(v))
      union all
      (select x.v ->> 'table', x.v ->> 'column', x.v ->> 'ref' from jsonb_array_elements(v_spec -> 'fk_catalogue') as x(v)
       except
       select c.conrelid::regclass::text, a.attname::text, c.confrelid::regclass::text
         from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.confrelid in ('public.appellations'::regclass, 'public.regions'::regclass))
    ) d;
    if v_n <> 0 then
      raise exception 'usa_reference_cleanup: pre-state: the foreign keys onto appellations/regions differ from the spec''s catalogue by %; re-run build-us1-spec.mjs', v_n;
    end if;
    -- A2. Regions, counts, every named row, D13.
    select array_agg(id order by id) into v_regions from regions where country_id = v_us;
    if to_jsonb(v_regions) is distinct from v_spec -> 'pre' -> 'region_ids' then
      raise exception 'usa_reference_cleanup: pre-state: the US regions are %, not %', to_jsonb(v_regions), v_spec -> 'pre' -> 'region_ids';
    end if;
    select array_agg(id order by id), count(*) filter (where name like '% AVA') into v_apps, v_m
      from appellations where region_id = any (v_regions);
    if cardinality(v_apps) <> (v_spec -> 'pre' ->> 'appellation_count')::int or v_m <> (v_spec -> 'pre' ->> 'ava_suffixed')::int then
      raise exception 'usa_reference_cleanup: pre-state: % US appellations (% ending " AVA"), expected % (%)',
        cardinality(v_apps), v_m, v_spec -> 'pre' ->> 'appellation_count', v_spec -> 'pre' ->> 'ava_suffixed';
    end if;
    for v_x in select x.v from jsonb_array_elements(v_spec -> 'pre' -> 'rows') as x(v) loop
      if not exists (select 1 from appellations where id = (v_x ->> 'id')::uuid and region_id = (v_x ->> 'region_id')::uuid and name = v_x ->> 'name') then
        raise exception 'usa_reference_cleanup: pre-state: % is not "%" in region %', v_x ->> 'id', v_x ->> 'name', v_x ->> 'region_id';
      end if;
    end loop;
    select (select count(*) from appellations where region_id = any (v_regions) and (map_status <> 'PENDING' or wine_place_id is not null))
         + (select count(*) from regions where id = any (v_regions) and (map_status <> 'PENDING' or wine_place_id is not null)) into v_n;
    if v_n <> 0 then
      raise exception 'usa_reference_cleanup: pre-state: % US row(s) are not PENDING and unlinked (D13)', v_n;
    end if;
    -- A3. Every reference to a US row, exactly as the spec was built.
    for v_i in 1 .. array_length(v_refq, 1) by 2 loop
      execute v_refq[v_i + 1] into v_got using v_regions, v_apps;
      if v_got is distinct from v_spec -> 'pre' -> 'references' -> v_refq[v_i] then
        raise exception 'usa_reference_cleanup: pre-state: % references to US rows changed since the spec was built: live %, spec %; re-run build-us1-spec.mjs',
          v_refq[v_i], v_got, v_spec -> 'pre' -> 'references' -> v_refq[v_i];
      end if;
    end loop;
    -- A4. The pseudo-regions' producers and every US region's grapes, exactly.
    for v_x in select x.v from jsonb_array_elements(v_spec -> 'pseudo_regions') as x(v) loop
      select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into v_got from producers where region_id = (v_x ->> 'id')::uuid;
      if v_got is distinct from (select coalesce(jsonb_agg(p.v -> 'id' order by (p.v ->> 'id')::uuid), '[]'::jsonb) from jsonb_array_elements(v_x -> 'producers') as p(v)) then
        raise exception 'usa_reference_cleanup: pre-state: the producers on % are %, not the researched list', v_x ->> 'name', v_got;
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('region_id', region_id, 'grape_id', grape_id, 'role', role) order by region_id, grape_id), '[]'::jsonb)
      into v_got from region_grapes where region_id = any (v_regions);
    if v_got is distinct from v_spec -> 'pre' -> 'region_grapes' then
      raise exception 'usa_reference_cleanup: pre-state: US region grapes changed since the spec was built';
    end if;
  end if;

  -- B. Moves (before the merges, so a merge into a moved row stays in one state).
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'moves') as x(v) loop
    if v_live then
      v_id := (v_x ->> 'id')::uuid;
      v_to := (v_x ->> 'to_region_id')::uuid;
    else
      select a.id into v_id from appellations a join regions g on g.id = a.region_id
       where g.country_id = v_us and g.name = v_x ->> 'from_region' and a.name = v_x ->> 'name';
      select id into v_to from regions where country_id = v_us and name = v_x ->> 'to_region';
      if v_id is null or v_to is null then
        raise notice 'usa_reference_cleanup: replay: move of "%" skipped (not present)', v_x ->> 'name';
        continue;
      end if;
    end if;
    select count(*) into v_n from guesses where appellation_id = v_id;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: STOP (spec §6.3): % guess(es) name "%", which would change state; guesses never move', v_n, v_x ->> 'name';
    end if;
    select (select count(*) from catalog_wines where appellation_id = v_id) + (select count(*) from wine_answers where appellation_id = v_id) into v_n;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: STOP for the owner (spec §6.2 step 6): % wine(s) or answer key(s) name "%", and the move would change their state', v_n, v_x ->> 'name';
    end if;
    update appellations set region_id = v_to where id = v_id;
    update catalog_wines_unidentified set region_id = v_to where appellation_id = v_id;
    update wine_archetypes set region_id = v_to where appellation_id = v_id;
    update label_lookups set region_id = v_to where appellation_id = v_id;
    update wine_identity_drafts set draft = draft || jsonb_build_object('regionId', v_to::text) where draft ->> 'appellationId' = v_id::text;
    raise notice 'usa_reference_cleanup: moved "%" to %', v_x ->> 'name', v_x ->> 'to_region';
  end loop;

  -- C. Merges: re-point every reference, then delete the emptied row.
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'merges') as x(v) loop
    if v_live then
      v_loser := (v_x ->> 'loser_id')::uuid;
      v_kept := (v_x ->> 'kept_id')::uuid;
    else
      select a.id into v_loser from appellations a join regions g on g.id = a.region_id
       where g.country_id = v_us and g.name = v_x ->> 'loser_region' and a.name = v_x ->> 'loser_name';
      select a.id into v_kept from appellations a join regions g on g.id = a.region_id
       where g.country_id = v_us and g.name = v_x ->> 'kept_region' and a.name = v_x ->> 'kept_name';
      if v_loser is null or v_kept is null then
        raise notice 'usa_reference_cleanup: replay: merge of "%" into "%" skipped (not present)', v_x ->> 'loser_name', v_x ->> 'kept_name';
        continue;
      end if;
    end if;
    select region_id into v_kept_region from appellations where id = v_kept;
    select count(*) into v_n from guesses where appellation_id = v_loser;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: STOP (spec §6.3): % guess(es) name "%", which would merge into "%"; guesses never move', v_n, v_x ->> 'loser_name', v_x ->> 'kept_name';
    end if;
    if (select region_id from appellations where id = v_loser) is distinct from v_kept_region then
      select (select count(*) from catalog_wines where appellation_id = v_loser) + (select count(*) from wine_answers where appellation_id = v_loser) into v_n;
      if v_n > 0 then
        raise exception 'usa_reference_cleanup: STOP for the owner (spec §6.2 step 6): % wine(s) or answer key(s) name "%" (%), and merging into % would change their state',
          v_n, v_x ->> 'loser_name', v_x ->> 'loser_region', v_x ->> 'kept_region';
      end if;
    end if;
    select count(*) into v_n
      from catalog_wines a join catalog_wines b
        on b.appellation_id = v_kept and b.merged_into is null
       and a.producer_id = b.producer_id
       and coalesce(lower(btrim(a.wine_name)), '') = coalesce(lower(btrim(b.wine_name)), '')
       and a.colour = b.colour and a.vintage_kind = b.vintage_kind
       and coalesce(a.vintage_year, -1) = coalesce(b.vintage_year, -1)
       and coalesce(a.vintage_tawny_years, -1) = coalesce(b.vintage_tawny_years, -1)
     where a.appellation_id = v_loser and a.merged_into is null;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: merging "%" into "%" would collide % catalog wine(s) on catalog_wines_identity_key', v_x ->> 'loser_name', v_x ->> 'kept_name', v_n;
    end if;
    update catalog_wines set appellation_id = v_kept, region_id = v_kept_region where appellation_id = v_loser;
    update catalog_wines_unidentified set appellation_id = v_kept, region_id = v_kept_region where appellation_id = v_loser;
    update wine_answers set appellation_id = v_kept, region_id = v_kept_region where appellation_id = v_loser;
    update wine_archetypes set appellation_id = v_kept, region_id = v_kept_region where appellation_id = v_loser;
    update label_lookups set appellation_id = v_kept, region_id = v_kept_region where appellation_id = v_loser;
    update wine_identity_drafts set draft = draft || jsonb_build_object('appellationId', v_kept::text, 'regionId', v_kept_region::text)
     where draft ->> 'appellationId' = v_loser::text;
    delete from appellations where id = v_loser;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'usa_reference_cleanup: deleting "%" removed % rows', v_x ->> 'loser_name', v_n;
    end if;
    if exists (select 1 from label_lookups where appellation_id = v_loser)
       or exists (select 1 from wine_identity_drafts where draft ->> 'appellationId' = v_loser::text) then
      raise exception 'usa_reference_cleanup: "%" is still named after its merge', v_x ->> 'loser_name';
    end if;
    raise notice 'usa_reference_cleanup: merged "%" (%) into "%" (%)', v_x ->> 'loser_name', v_x ->> 'loser_region', v_x ->> 'kept_name', v_x ->> 'kept_region';
  end loop;

  -- D. Renames, in place, by id.
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'renames') as x(v) loop
    if v_live then
      update appellations set name = v_x ->> 'new' where id = (v_x ->> 'id')::uuid and name = v_x ->> 'old';
      get diagnostics v_n = row_count;
      if v_n <> 1 then
        raise exception 'usa_reference_cleanup: renaming "%" to "%" touched % rows, expected 1', v_x ->> 'old', v_x ->> 'new', v_n;
      end if;
    else
      select id into v_region from regions where country_id = v_us and name = v_x ->> 'region';
      if v_region is null then continue; end if;
      if exists (select 1 from appellations where region_id = v_region and name = v_x ->> 'old')
         and exists (select 1 from appellations where region_id = v_region and name = v_x ->> 'new') then
        raise exception 'usa_reference_cleanup: replay: % has both "%" and "%" (a merge, not a rename)', v_x ->> 'region', v_x ->> 'old', v_x ->> 'new';
      end if;
      update appellations set name = v_x ->> 'new' where region_id = v_region and name = v_x ->> 'old';
    end if;
  end loop;

  -- E. Retire the pseudo-regions.
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'pseudo_regions') as x(v) loop
    if v_live then
      v_region := (v_x ->> 'id')::uuid;
    else
      select id into v_region from regions where country_id = v_us and name = v_x ->> 'name';
      if v_region is null then
        raise notice 'usa_reference_cleanup: replay: pseudo-region % not present', v_x ->> 'name';
        continue;
      end if;
    end if;
    select id into v_into from regions where country_id = v_us and name = v_x ->> 'grapes_into_region';
    if exists (select 1 from appellations where region_id = v_region) then
      raise exception 'usa_reference_cleanup: pseudo-region % still holds appellations', v_x ->> 'name';
    end if;
    for v_p in select p.v from jsonb_array_elements(v_x -> 'producers') as p(v) loop
      v_to := case v_p ->> 'state'
                when 'WA' then (select id from regions where country_id = v_us and name = 'Washington')
                when 'OR' then (select id from regions where country_id = v_us and name = 'Oregon')
              end;
      if v_live then
        update producers set region_id = v_to where id = (v_p ->> 'id')::uuid and region_id = v_region;
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'usa_reference_cleanup: producer "%" (%) is not on %', v_p ->> 'name', v_p ->> 'id', v_x ->> 'name';
        end if;
      else
        update producers set region_id = v_to where name = v_p ->> 'name' and region_id = v_region;
      end if;
    end loop;
    select count(*) into v_n from producers where region_id = v_region;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: % producer(s) still on pseudo-region %; research them into us1-producer-states.json', v_n, v_x ->> 'name';
    end if;
    insert into region_grapes (region_id, grape_id, role)
      select v_into, grape_id, role from region_grapes where region_id = v_region
      on conflict (region_id, grape_id) do nothing;
    get diagnostics v_n = row_count;
    raise notice 'usa_reference_cleanup: % grape row(s) of % joined %', v_n, v_x ->> 'name', v_x ->> 'grapes_into_region';
    for v_p in select f.v from jsonb_array_elements(v_spec -> 'fk_catalogue') as f(v) loop
      continue when v_p ->> 'ref' <> 'regions' or v_p ->> 'table' in ('appellations', 'producers', 'region_grapes');
      execute format('select count(*) from %s where %I = $1', v_p ->> 'table', v_p ->> 'column') into v_n using v_region;
      if v_n > 0 then
        raise exception 'usa_reference_cleanup: % row(s) of %.% still name pseudo-region %', v_n, v_p ->> 'table', v_p ->> 'column', v_x ->> 'name';
      end if;
    end loop;
    select (select count(*) from label_lookups where region_id = v_region)
         + (select count(*) from wine_identity_drafts where draft ->> 'regionId' = v_region::text) into v_n;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup: % label lookup(s) or draft(s) still name pseudo-region %', v_n, v_x ->> 'name';
    end if;
    delete from regions where id = v_region;
    raise notice 'usa_reference_cleanup: retired pseudo-region %', v_x ->> 'name';
  end loop;

  -- F. New AVA rows, with fixed ids.
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'new_rows') as x(v) loop
    select id into v_region from regions where country_id = v_us and name = v_x ->> 'region';
    if v_region is null then
      raise notice 'usa_reference_cleanup: replay: region % not present; "%" skipped', v_x ->> 'region', v_x ->> 'name';
      continue;
    end if;
    if v_live and v_region <> (v_x ->> 'region_id')::uuid then
      raise exception 'usa_reference_cleanup: region % is %, not %', v_x ->> 'region', v_region, v_x ->> 'region_id';
    end if;
    insert into appellations (id, region_id, name) values ((v_x ->> 'id')::uuid, v_region, v_x ->> 'name') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_live and v_n <> 1 then
      raise exception 'usa_reference_cleanup: new row "%" (%) already exists', v_x ->> 'name', v_x ->> 'id';
    end if;
  end loop;

  -- G. Post-state, live mode only.
  if v_live then
    select array_agg(id order by id) into v_regions from regions where country_id = v_us;
    if to_jsonb(v_regions) is distinct from v_spec -> 'post' -> 'region_ids' then
      raise exception 'usa_reference_cleanup: post-state: the US regions are %, not %', to_jsonb(v_regions), v_spec -> 'post' -> 'region_ids';
    end if;
    select array_agg(id order by id), count(*) filter (where name like '% AVA') into v_apps, v_m
      from appellations where region_id = any (v_regions);
    if cardinality(v_apps) <> (v_spec -> 'post' ->> 'appellation_count')::int or v_m <> (v_spec -> 'post' ->> 'ava_suffixed')::int then
      raise exception 'usa_reference_cleanup: post-state: % US appellations (% ending " AVA"), expected % (%)',
        cardinality(v_apps), v_m, v_spec -> 'post' ->> 'appellation_count', v_spec -> 'post' ->> 'ava_suffixed';
    end if;
    select jsonb_object_agg(region_id::text, n) into v_got
      from (select region_id, count(*) as n from appellations where region_id = any (v_regions) group by region_id) s;
    if v_got is distinct from v_spec -> 'post' -> 'per_region' then
      raise exception 'usa_reference_cleanup: post-state: per-region counts %, expected %', v_got, v_spec -> 'post' -> 'per_region';
    end if;
    select count(*) into v_n from (
      (select name from appellations where region_id = any (v_regions) and name like '% AVA'
       except select t.v from jsonb_array_elements_text(v_spec -> 'post' -> 'ava_names') as t(v))
      union all
      (select t.v from jsonb_array_elements_text(v_spec -> 'post' -> 'ava_names') as t(v)
       except select name from appellations where region_id = any (v_regions) and name like '% AVA')
    ) d;
    if v_n <> 0 then
      raise exception 'usa_reference_cleanup: post-state: the US " AVA" names differ from the TTB-checked list by %', v_n;
    end if;
    select count(*) into v_n from appellations a join jsonb_array_elements(v_spec -> 'renames') as x(v)
      on a.id = (x.v ->> 'id')::uuid and a.name = x.v ->> 'new';
    if v_n <> jsonb_array_length(v_spec -> 'renames') then
      raise exception 'usa_reference_cleanup: post-state: % of % renamed rows carry their new name', v_n, jsonb_array_length(v_spec -> 'renames');
    end if;
    select count(*) into v_n from appellations where id in (select (x.v ->> 'loser_id')::uuid from jsonb_array_elements(v_spec -> 'merges') as x(v));
    if v_n <> 0 then
      raise exception 'usa_reference_cleanup: post-state: % merged-away row(s) remain', v_n;
    end if;
    for v_i in 1 .. array_length(v_refq, 1) by 2 loop
      execute v_refq[v_i + 1] into v_got using v_regions, v_apps;
      if v_got is distinct from v_spec -> 'post' -> 'references' -> v_refq[v_i] then
        raise exception 'usa_reference_cleanup: post-state: % references are %, expected %', v_refq[v_i], v_got, v_spec -> 'post' -> 'references' -> v_refq[v_i];
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'region_id', p.region_id) order by p.id), '[]'::jsonb) into v_got
      from producers p where p.id in (select (x.v ->> 'id')::uuid from jsonb_array_elements(v_spec -> 'post' -> 'producers') as x(v));
    if v_got is distinct from v_spec -> 'post' -> 'producers' then
      raise exception 'usa_reference_cleanup: post-state: the re-linked producers are %, expected %', v_got, v_spec -> 'post' -> 'producers';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('region_id', region_id, 'grape_id', grape_id, 'role', role) order by region_id, grape_id), '[]'::jsonb)
      into v_got from region_grapes where region_id = any (v_regions);
    if v_got is distinct from v_spec -> 'post' -> 'region_grapes' then
      raise exception 'usa_reference_cleanup: post-state: US region grapes are %, expected %', v_got, v_spec -> 'post' -> 'region_grapes';
    end if;
    select (select count(*) from appellations where region_id = any (v_regions) and (map_status <> 'PENDING' or wine_place_id is not null))
         + (select count(*) from regions where id = any (v_regions) and (map_status <> 'PENDING' or wine_place_id is not null)) into v_n;
    if v_n <> 0 then
      raise exception 'usa_reference_cleanup: post-state: % US row(s) are not PENDING and unlinked (D13)', v_n;
    end if;
    raise notice 'usa_reference_cleanup: done: % regions, % appellations (% ending " AVA")', cardinality(v_regions), cardinality(v_apps), v_m;
  end if;
end
$us1$;
```

- [ ] **Step 5: Render and test.**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node scripts/usa-reference/render-us1-sql.mjs && node --test scripts/usa-reference/us1-sql.test.mjs
```
Expected: `wrote supabase/migrations/20260929214747_usa_reference_cleanup.sql` and `skip scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql (no … template yet)`, then PASS ×3.

- [ ] **Step 6: The applier's pre-flight, then a rolled-back dry run against live.**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && APPLIER="C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs" && node --env-file=.env.local "$APPLIER" supabase/migrations/20260929214747_usa_reference_cleanup.sql --check && node --env-file=.env.local "$APPLIER" supabase/migrations/20260929214747_usa_reference_cleanup.sql --dry
```
Expected: `PREFLIGHT OK: 20260929214747_usa_reference_cleanup`, then `DRY RUN OK: 20260929214747_usa_reference_cleanup ran in … ms and was rolled back`.

If the run fails, fix the **template**, re-render, re-run the test and the dry run. Never edit the rendered file by hand. A PL/pgSQL syntax error names a position; map it back to the template.

- [ ] **Step 7: Commit** `feat(usa-reference): US-1 forward migration, rendered from the spec (not applied)`, staging the template, the renderer, the test and the rendered migration.

### Task 11: The revert template

**Files:**
- Create: `scripts/usa-reference/us1-cleanup-revert.sql.template`
- Create (rendered): `scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql`
- Modify: `scripts/usa-reference/us1-sql.test.mjs`

- [ ] **Step 1: Failing tests** (append to `us1-sql.test.mjs`, and add `REVERT_PATH` to its import from `./us1-spec-lib.mjs`):

```js
test("the committed revert is exactly the render, lives outside supabase/migrations, and has no transaction statement", async () => {
  const want = renderUs1Sql({ template: await readFile("scripts/usa-reference/us1-cleanup-revert.sql.template", "utf8"), spec: await json(SPEC_PATH), preimage: await json(PREIMAGE_PATH) });
  const got = lf(await readFile(REVERT_PATH, "utf8"));
  assert.equal(got, want);
  assert.ok(!REVERT_PATH.startsWith("supabase/"), REVERT_PATH);
  assert.deepEqual(topLevelTransactionStatements(got), []);
  assert.ok(got.includes("delete from supabase_migrations.schema_migrations where version = v_spec ->> 'version'"));
});
```

- [ ] **Step 2:** Run the test; it fails with ENOENT.

- [ ] **Step 3: The template** (complete file, LF):

```sql
-- Reverse of 20260929214747_usa_reference_cleanup (spec §6.4, §16).
-- NEVER under supabase/migrations: a replay would undo US-1 right after it.
-- GENERATED by scripts/usa-reference/render-us1-sql.mjs from
-- data/usa-reference/us1-spec.json and preimage-20260929214747.json.
-- Do not hand-edit.
--
-- Run it with the owner's applier from the worktree: --check, then --dry. The
-- dry run refuses, changing nothing, unless US-1 is applied. Then apply.
-- It restores every renamed, merged, moved and retired row with its original
-- id, re-points each reference to its pre-image columns, re-links the
-- producers, and deletes US-1's history row. The applier records this file's
-- own version, 20260929224747.
-- It refuses, changing nothing, if any of the 50 new AVA rows is in use, or if
-- the US rows or their references changed after US-1.

set local lock_timeout = '10s';

do $us1r$
declare
  v_spec constant jsonb := $spec$__US1_SPEC__$spec$::jsonb;
  v_pre constant jsonb := $pre$__US1_PREIMAGE__$pre$::jsonb;
  v_refq constant text[] := __US1_REF_QUERIES__;
  v_us uuid;
  v_regions uuid[];
  v_apps uuid[];
  v_pseudo uuid[];
  v_x jsonb;
  v_got jsonb;
  v_n int;
  v_i int;
  v_id uuid;
begin
  select id into strict v_us from countries where name = 'United States';
  if not exists (select 1 from supabase_migrations.schema_migrations where version = v_spec ->> 'version') then
    raise exception 'usa_reference_cleanup_revert: % is not recorded; nothing to revert', v_spec ->> 'version';
  end if;
  select array_agg((x.v ->> 'id')::uuid) into v_pseudo from jsonb_array_elements(v_spec -> 'pseudo_regions') as x(v);

  -- 0. The state is still exactly US-1's post-state.
  select array_agg(id order by id) into v_regions from regions where country_id = v_us;
  if to_jsonb(v_regions) is distinct from v_spec -> 'post' -> 'region_ids' then
    raise exception 'usa_reference_cleanup_revert: the US regions changed after US-1; revert by hand';
  end if;
  select array_agg(id order by id) into v_apps from appellations where region_id = any (v_regions);
  for v_x in select x.v from jsonb_array_elements(v_spec -> 'new_rows') as x(v) loop
    v_id := (v_x ->> 'id')::uuid;
    select (select count(*) from catalog_wines where appellation_id = v_id)
         + (select count(*) from catalog_wines_unidentified where appellation_id = v_id)
         + (select count(*) from wine_answers where appellation_id = v_id)
         + (select count(*) from guesses where appellation_id = v_id)
         + (select count(*) from wine_archetypes where appellation_id = v_id)
         + (select count(*) from label_lookups where appellation_id = v_id)
         + (select count(*) from wine_identity_drafts where draft ->> 'appellationId' = v_id::text) into v_n;
    if v_n > 0 then
      raise exception 'usa_reference_cleanup_revert: "%" (%) is in use by % row(s); revert by hand', v_x ->> 'name', v_id, v_n;
    end if;
  end loop;
  for v_i in 1 .. array_length(v_refq, 1) by 2 loop
    execute v_refq[v_i + 1] into v_got using v_regions, v_apps;
    if v_got is distinct from v_spec -> 'post' -> 'references' -> v_refq[v_i] then
      raise exception 'usa_reference_cleanup_revert: % references changed after US-1; revert by hand', v_refq[v_i];
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'region_id', p.region_id) order by p.id), '[]'::jsonb) into v_got
    from producers p where p.id in (select (x.v ->> 'id')::uuid from jsonb_array_elements(v_spec -> 'post' -> 'producers') as x(v));
  if v_got is distinct from v_spec -> 'post' -> 'producers' then
    raise exception 'usa_reference_cleanup_revert: a re-linked producer was edited after US-1; revert by hand';
  end if;

  -- 1. The new rows go.
  delete from appellations where id in (select (x.v ->> 'id')::uuid from jsonb_array_elements(v_spec -> 'new_rows') as x(v));
  get diagnostics v_n = row_count;
  if v_n <> jsonb_array_length(v_spec -> 'new_rows') then
    raise exception 'usa_reference_cleanup_revert: removed % new rows, expected %', v_n, jsonb_array_length(v_spec -> 'new_rows');
  end if;
  -- 2. The pseudo-regions come back with their original ids and grapes.
  insert into regions (id, country_id, name)
    select (x.v ->> 'id')::uuid, (x.v ->> 'country_id')::uuid, x.v ->> 'name'
      from jsonb_array_elements(v_pre -> 'regions') as x(v) where (x.v ->> 'id')::uuid = any (v_pseudo);
  insert into region_grapes (region_id, grape_id, role)
    select (x.v ->> 'region_id')::uuid, (x.v ->> 'grape_id')::uuid, x.v ->> 'role'
      from jsonb_array_elements(v_pre -> 'region_grapes') as x(v) where (x.v ->> 'region_id')::uuid = any (v_pseudo);
  -- 3. Producers back to their pre-image region.
  update producers p set region_id = (x.v ->> 'region_id')::uuid
    from jsonb_array_elements(v_pre -> 'producers') as x(v) where p.id = (x.v ->> 'id')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> jsonb_array_length(v_pre -> 'producers') then
    raise exception 'usa_reference_cleanup_revert: re-linked % producers back, expected %', v_n, jsonb_array_length(v_pre -> 'producers');
  end if;
  -- 4. Moved rows back.
  update appellations a set region_id = (x.v ->> 'from_region_id')::uuid
    from jsonb_array_elements(v_spec -> 'moves') as x(v) where a.id = (x.v ->> 'id')::uuid;
  -- 5. Merged-away rows back, with their original id, name and region.
  insert into appellations (id, region_id, name)
    select (x.v ->> 'loser_id')::uuid, (x.v ->> 'loser_region_id')::uuid, x.v ->> 'loser_name'
      from jsonb_array_elements(v_spec -> 'merges') as x(v);
  -- 6. Every reference back to its pre-image columns (only rows that differ).
  update catalog_wines w set region_id = (x.v ->> 'region_id')::uuid, appellation_id = (x.v ->> 'appellation_id')::uuid
    from jsonb_array_elements(v_pre -> 'references' -> 'catalog_wines') as x(v)
   where w.id = (x.v ->> 'id')::uuid and (w.region_id, w.appellation_id) is distinct from ((x.v ->> 'region_id')::uuid, (x.v ->> 'appellation_id')::uuid);
  update catalog_wines_unidentified w set region_id = (x.v ->> 'region_id')::uuid, appellation_id = (x.v ->> 'appellation_id')::uuid
    from jsonb_array_elements(v_pre -> 'references' -> 'catalog_wines_unidentified') as x(v)
   where w.id = (x.v ->> 'id')::uuid and (w.region_id, w.appellation_id) is distinct from ((x.v ->> 'region_id')::uuid, (x.v ->> 'appellation_id')::uuid);
  update wine_answers w set region_id = (x.v ->> 'region_id')::uuid, appellation_id = (x.v ->> 'appellation_id')::uuid
    from jsonb_array_elements(v_pre -> 'references' -> 'wine_answers') as x(v)
   where w.wine_id = (x.v ->> 'wine_id')::uuid and (w.region_id, w.appellation_id) is distinct from ((x.v ->> 'region_id')::uuid, (x.v ->> 'appellation_id')::uuid);
  update wine_archetypes w set region_id = (x.v ->> 'region_id')::uuid, appellation_id = (x.v ->> 'appellation_id')::uuid
    from jsonb_array_elements(v_pre -> 'references' -> 'wine_archetypes') as x(v)
   where w.id = (x.v ->> 'id')::uuid and (w.region_id, w.appellation_id) is distinct from ((x.v ->> 'region_id')::uuid, (x.v ->> 'appellation_id')::uuid);
  update label_lookups w set region_id = (x.v ->> 'region_id')::uuid, appellation_id = (x.v ->> 'appellation_id')::uuid
    from jsonb_array_elements(v_pre -> 'references' -> 'label_lookups') as x(v)
   where w.id = (x.v ->> 'id')::uuid and (w.region_id, w.appellation_id) is distinct from ((x.v ->> 'region_id')::uuid, (x.v ->> 'appellation_id')::uuid);
  update wine_identity_drafts d set draft = d.draft || jsonb_build_object('regionId', x.v ->> 'region_id', 'appellationId', x.v ->> 'appellation_id')
    from jsonb_array_elements(v_pre -> 'references' -> 'wine_identity_drafts') as x(v)
   where d.wine_id = (x.v ->> 'wine_id')::uuid
     and (d.draft ->> 'regionId', d.draft ->> 'appellationId') is distinct from (x.v ->> 'region_id', x.v ->> 'appellation_id');
  -- 7. Renames back.
  update appellations a set name = x.v ->> 'old'
    from jsonb_array_elements(v_spec -> 'renames') as x(v) where a.id = (x.v ->> 'id')::uuid and a.name = x.v ->> 'new';
  get diagnostics v_n = row_count;
  if v_n <> jsonb_array_length(v_spec -> 'renames') then
    raise exception 'usa_reference_cleanup_revert: renamed % rows back, expected %', v_n, jsonb_array_length(v_spec -> 'renames');
  end if;

  -- 8. Exactly the pre-image.
  select array_agg(id order by id) into v_regions from regions where country_id = v_us;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'country_id', country_id) order by id), '[]'::jsonb) into v_got
    from regions where country_id = v_us;
  if v_got is distinct from v_pre -> 'regions' then
    raise exception 'usa_reference_cleanup_revert: post: US regions differ from the pre-image';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'region_id', region_id) order by id), '[]'::jsonb), array_agg(id order by id)
    into v_got, v_apps from appellations where region_id = any (v_regions);
  if v_got is distinct from v_pre -> 'appellations' then
    raise exception 'usa_reference_cleanup_revert: post: US appellations differ from the pre-image';
  end if;
  for v_i in 1 .. array_length(v_refq, 1) by 2 loop
    execute v_refq[v_i + 1] into v_got using v_regions, v_apps;
    if v_got is distinct from v_spec -> 'pre' -> 'references' -> v_refq[v_i] then
      raise exception 'usa_reference_cleanup_revert: post: % references differ from the pre-image', v_refq[v_i];
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'region_id', p.region_id) order by p.id), '[]'::jsonb) into v_got
    from producers p where p.id in (select (x.v ->> 'id')::uuid from jsonb_array_elements(v_pre -> 'producers') as x(v));
  if v_got is distinct from v_pre -> 'producers' then
    raise exception 'usa_reference_cleanup_revert: post: producers differ from the pre-image';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('region_id', region_id, 'grape_id', grape_id, 'role', role) order by region_id, grape_id), '[]'::jsonb)
    into v_got from region_grapes where region_id = any (v_regions);
  if v_got is distinct from v_pre -> 'region_grapes' then
    raise exception 'usa_reference_cleanup_revert: post: region grapes differ from the pre-image';
  end if;
  -- 9. US-1 is no longer recorded as applied.
  delete from supabase_migrations.schema_migrations where version = v_spec ->> 'version';
  raise notice 'usa_reference_cleanup_revert: US-1 reverted; history row % removed', v_spec ->> 'version';
end
$us1r$;
```

- [ ] **Step 4: Render and test.** Run `node scripts/usa-reference/render-us1-sql.mjs && node --test scripts/usa-reference/us1-sql.test.mjs` → both files are written and 4 tests PASS. The forward file is byte-identical to Task 10's, so `git diff --stat supabase/` shows nothing.
- [ ] **Step 5: The revert refuses on live today.** Run `--check`, then `--dry`, with `$APPLIER` on `scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql`. Expected: `PREFLIGHT OK`, then `FAILED (rolled back): usa_reference_cleanup_revert: 20260929214747 is not recorded; nothing to revert` (exit 1). That is the correct refusal. The real rehearsal is Task 12.
- [ ] **Step 6: Commit** `feat(usa-reference): US-1 revert, rendered from the spec and pre-image (outside supabase/migrations)`.

### Task 12: The rolled-back rehearsal against live

**Files:** Create `scripts/usa-reference/rehearse-us1.mjs`.

**Interfaces:** Consumes the rendered forward and revert files, `SPEC_PATH`, `REF_QUERIES` and `topLevelTransactionStatements`. When every assertion holds, it prints `REHEARSAL OK`.

- [ ] **Step 1: Write the script** (complete file):

```js
// Rehearses US-1 against live in ONE transaction that is always rolled back
// (spec §6.4, §15 US-1). Nothing is committed: this file never sends COMMIT,
// and its finally block rolls back. Order:
//   drift   - a new reference to a merging row makes the forward refuse;
//   replay  - replay mode on live data gives the same rows as live mode;
//   forward - live mode, then the applier's history row;
//   in use  - the revert refuses while a new AVA row carries a wine;
//   revert  - restores the starting snapshot exactly.
// Usage: node scripts/usa-reference/rehearse-us1.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { FORWARD_PATH, REVERT_PATH, SPEC_PATH, US1_REVERT_VERSION, US1_VERSION } from "./us1-spec-lib.mjs";

const NAPA_ARCHETYPE = "75e4e467-3929-4844-bbc4-ffe8b12523a1"; // "A typical Napa Cabernet Sauvignon"
const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
const forward = await readFile(FORWARD_PATH, "utf8");
const revert = await readFile(REVERT_PATH, "utf8");
for (const [p, sql] of [[FORWARD_PATH, forward], [REVERT_PATH, revert]]) assert.deepEqual(topLevelTransactionStatements(sql), [], p);
const ANCHOR = `"anchor_id": "${spec.anchor_id}"`;
assert.equal(forward.split(ANCHOR).length, 2, "the anchor appears exactly once");
const replayForward = forward.replace(ANCHOR, '"anchor_id": "00000000-0000-4000-8000-000000000000"');
const sloCoastLoser = spec.merges.find((m) => m.loser_name === "SLO Coast AVA").loser_id;

const c = new pg.Client({ connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""), ssl: { rejectUnauthorized: false } });
await c.connect();

async function snapshot() {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const [{ id: us }] = await q("select id from countries where name = 'United States'");
  const regionIds = [...new Set([...spec.pre.region_ids, ...spec.post.region_ids])];
  const appIds = [...new Set([
    ...(await q("select a.id from appellations a join regions r on r.id = a.region_id where r.country_id = $1", [us])).map((r) => r.id),
    ...spec.merges.map((m) => m.loser_id), ...spec.new_rows.map((r) => r.id)])];
  const references = {};
  for (const [t, sql] of REF_QUERIES) references[t] = (await c.query(sql, [regionIds, appIds])).rows[0].refs;
  return {
    regions: await q("select id, name, country_id, map_status::text, wine_place_id from regions where country_id = $1 order by id", [us]),
    appellations: await q("select a.id, a.name, a.region_id, a.map_status::text, a.wine_place_id from appellations a join regions r on r.id = a.region_id where r.country_id = $1 order by a.id", [us]),
    producers: await q("select id, region_id from producers where id = any ($1::uuid[]) order by id", [spec.post.producers.map((p) => p.id)]),
    region_grapes: await q("select region_id, grape_id, role from region_grapes where region_id = any ($1::uuid[]) order by region_id, grape_id", [regionIds]),
    references,
    catalog_wine_edits: (await q("select count(*)::int as n from catalog_wine_edits where catalog_wine_id = any ($1::uuid[])", [spec.pre.references.catalog_wines.map((w) => w.id)]))[0].n,
    history: (await q("select version from supabase_migrations.schema_migrations where version = any ($1) order by version", [[US1_VERSION, US1_REVERT_VERSION]])).map((r) => r.version),
  };
}
const withoutHistory = ({ history, ...rest }) => rest;

try {
  await c.query("begin");
  await c.query("set local statement_timeout = '300s'");
  const s0 = await snapshot();
  assert.equal(s0.regions.length, 28);
  assert.equal(s0.appellations.length, 240);
  assert.deepEqual(s0.history, []);

  await c.query("savepoint drift");
  await c.query("update wine_archetypes set appellation_id = $1 where id = $2", [sloCoastLoser, NAPA_ARCHETYPE]);
  await assert.rejects(c.query(forward), /pre-state: wine_archetypes references/);
  await c.query("rollback to savepoint drift");
  console.log("drift: refused as expected");

  await c.query("savepoint replay");
  await c.query(replayForward);
  const sReplay = await snapshot();
  await c.query("rollback to savepoint replay");

  await c.query(forward);
  await c.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [US1_VERSION, "usa_reference_cleanup", [forward]]);
  const s1 = await snapshot();
  assert.deepEqual(withoutHistory(sReplay), withoutHistory(s1), "replay mode = live mode");
  console.log("replay: same rows as live mode");
  assert.equal(s1.regions.length, spec.post.region_ids.length);
  assert.equal(s1.appellations.length, spec.post.appellation_count);
  assert.equal(s1.appellations.filter((a) => a.name.endsWith(" AVA")).length, spec.post.ava_suffixed);
  assert.equal(s1.catalog_wine_edits, s0.catalog_wine_edits, "no catalog wine moved, so no audit row");
  assert.deepEqual(s1.references.guesses, s0.references.guesses, "guesses never move");
  console.log(`forward: ${s1.regions.length} regions, ${s1.appellations.length} appellations`);

  await c.query("savepoint inuse");
  await c.query("update wine_archetypes set appellation_id = $1 where id = $2", [spec.new_rows.find((r) => r.region === "California").id, NAPA_ARCHETYPE]);
  await assert.rejects(c.query(revert), /is in use/);
  await c.query("rollback to savepoint inuse");
  console.log("in use: refused as expected");

  await c.query(revert);
  await c.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [US1_REVERT_VERSION, "usa_reference_cleanup_revert", [revert]]);
  const s2 = await snapshot();
  assert.deepEqual(withoutHistory(s2), withoutHistory(s0), "the revert restores the snapshot exactly");
  assert.deepEqual(s2.history, [US1_REVERT_VERSION]);
  console.log("REHEARSAL OK: forward, replay, drift, in-use and revert all hold; everything rolled back");
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
```

- [ ] **Step 2: Run it.** Run: `cd C:/Users/Public/repos/blindtastingapp-map && node scripts/usa-reference/rehearse-us1.mjs`.
Expected, in order:
```
drift: refused as expected
replay: same rows as live mode
forward: 26 regions, 282 appellations
in use: refused as expected
REHEARSAL OK: forward, replay, drift, in-use and revert all hold; everything rolled back
```
Then confirm nothing stuck: `node scripts/usa-reference/build-us1-spec.mjs --check` → `match live`.

If an assertion fails:
- **Replay ≠ live:** the diff names the row. Fix the replay branch in the forward template. Replay mode on live data must resolve every name, so a skip notice there is a bug.
- **Revert ≠ snapshot:** fix the revert template.

Re-render, re-test and re-run each time. Never weaken an assertion.

- [ ] **Step 3: Commit** `feat(usa-reference): rolled-back rehearsal of US-1 and its revert against live`. In the body, paste the five output lines and note that everything was rolled back.

### Task 13: Fixture hand-edit, rerun guard, and the wine-identity cases

**Files:**
- Modify: `src/lib/wine-identity/__fixtures__/reference-snapshot.json` (line 1303)
- Modify: `scripts/add-appellation-designations.mjs`
- Create: `scripts/usa-reference/us-country-guard.mjs` + `.test.mjs`
- Modify: `src/lib/wine-identity/resolve.test.ts`

- [ ] **Step 1: The fixture (spec §6.4, F8).** In `reference-snapshot.json`, in the object whose `"id"` is `"ef4ebc71-aadf-4792-abae-300698f7b09f"`, change `"name": "California AVA",` to `"name": "California",`. Change nothing else. The exporter is gitignored and absent, and a full re-export would pull in unrelated drift. Run `cd C:/Users/Public/repos/blindtastingapp-map && npx vitest run src/lib/wine-identity` and expect PASS; `live-replay.test.ts` included.

- [ ] **Step 2: The guard, test first.**

```js
// scripts/usa-reference/us-country-guard.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { isUsCountry } from "./us-country-guard.mjs";

test("LWIN's USA and the database's United States are both refused; others pass", () => {
  for (const c of ["USA", "United States", " usa ", "united states"]) assert.equal(isUsCountry(c), true, c);
  for (const c of ["France", "Australia", "NA", "", null, undefined]) assert.equal(isUsCountry(c), false, String(c));
});
```

```js
// scripts/usa-reference/us-country-guard.mjs
// US-1 (spec §6.4): scripts/add-appellation-designations.mjs once appended a
// false " AVA" to 21 US county and state rows. It must never touch a US row
// again. LWIN writes the country "USA"; the database writes "United States".
export function isUsCountry(country) {
  const c = String(country ?? "").trim().toLowerCase();
  return c === "usa" || c === "united states";
}
```

Run `node --test scripts/usa-reference/us-country-guard.test.mjs`: it FAILs before the module exists and PASSes after.

- [ ] **Step 3: Wire the guard.** In `scripts/add-appellation-designations.mjs`:
  - Add a top header paragraph right after the shebang:
    ```js
    // HISTORICAL (US-1, 2026-09-29): this ran once, in July 2026. Its allowlist
    // put a false " AVA" on 21 United States county and state rows, which US-1
    // (supabase/migrations/20260929214747_usa_reference_cleanup.sql) removed. It
    // now skips every United States row, so a rerun cannot put them back.
    ```
  - Add `import { isUsCountry } from "./usa-reference/us-country-guard.mjs";` after the `@supabase/supabase-js` import.
  - Change the `liveRows` filter to:
    ```js
    const liveRows = rows.filter(
      (r) => r.STATUS === "Live" && r.COUNTRY && r.COUNTRY !== "NA" && r.REGION && r.REGION !== "NA" && !isUsCountry(r.COUNTRY),
    );
    console.log(`Skipping ${rows.filter((r) => isUsCountry(r.COUNTRY)).length} United States rows (US-1 guard)`);
    ```
  - Check the syntax **without running it** (it writes live): `node --check scripts/add-appellation-designations.mjs`, and expect no output.

- [ ] **Step 4: The wine-identity cases, test first** (append to `resolve.test.ts`):

```ts
describe("US cross-state AVAs after US-1 (spec §6.4): the region follows the one kept row", () => {
  // The first producer the US-1 research placed in Oregon (Milton-Freewater), or
  // a stand-in when the research placed none there.
  const research = JSON.parse(readFileSync(path.join(process.cwd(), "data/usa-reference/us1-producer-states.json"), "utf8")) as { producers: { name: string; state: string | null }[] };
  const MILTON_FREEWATER_PRODUCER = research.producers.find((p) => p.state === "OR")?.name ?? "Milton Bench Cellars";
  const usa = (): ReferenceSnapshot => ({
    countries: [{ id: "us", name: "United States" }],
    regions: [{ id: "wa", name: "Washington", country_id: "us" }, { id: "or", name: "Oregon", country_id: "us" }],
    appellations: [
      { id: "rocks", name: "The Rocks District of Milton-Freewater AVA", region_id: "or" },
      { id: "gorge", name: "Columbia Gorge AVA", region_id: "or" },
      { id: "wwv", name: "Walla Walla Valley AVA", region_id: "wa" },
      { id: "cv", name: "Columbia Valley AVA", region_id: "wa" },
      { id: "wa-self", name: "Washington", region_id: "wa" },
      { id: "or-self", name: "Oregon", region_id: "or" },
    ],
    none: [],
    grapes: [{ id: "syr", name: "Syrah" }, { id: "pn", name: "Pinot Noir" }],
    type_designations: [],
    producers: [
      { id: "mf", name: MILTON_FREEWATER_PRODUCER, region_id: "or" },
      { id: "pc", name: "Phelps Creek Vineyards", region_id: null },
    ],
  });
  const us = { noGeographicIndication: false, country: "United States", designation: null, wineName: null };
  it("a Rocks District label from a Milton-Freewater producer lands in Oregon, even when the read guessed Washington", async () => {
    const d = await resolve("vin-de-france.json", {
      ...us, producer: MILTON_FREEWATER_PRODUCER, appellation: "The Rocks District of Milton-Freewater", region: "Washington",
      grapes: [{ name: "Syrah", percentage: null }],
      rawText: `${MILTON_FREEWATER_PRODUCER.toUpperCase()} · SYRAH · THE ROCKS DISTRICT OF MILTON-FREEWATER · 2021`,
    }, usa());
    expect([d.countryId, d.regionId, d.appellationId]).toEqual(["us", "or", "rocks"]);
  });
  it("a Columbia Gorge label from a Hood River producer lands in Oregon", async () => {
    const d = await resolve("vin-de-france.json", {
      ...us, producer: "Phelps Creek Vineyards", appellation: "Columbia Gorge", region: "Washington",
      grapes: [{ name: "Pinot Noir", percentage: null }],
      rawText: "PHELPS CREEK VINEYARDS · PINOT NOIR · COLUMBIA GORGE · 2019",
    }, usa());
    expect([d.countryId, d.regionId, d.appellationId]).toEqual(["us", "or", "gorge"]);
  });
});
```

Run: `npx vitest run src/lib/wine-identity/resolve.test.ts`. Expected: PASS. The resolver sets the region from the matched appellation (`resolve.ts` ~line 463), and with a single row per AVA there is nothing for the read's "Washington" to pick.

If either case fails, **do not change `resolve.ts`**. Record the failing draft (`regionId`, `appellationId`, `provenance`) and report it to the main session as a US-1 blocker: the cleanup would then leave cross-state labels refused by `write.ts`.

- [ ] **Step 5: Commit** `test(wine-identity): US cross-state labels resolve to the one Oregon row; fixture and rerun guard for US-1`.

### Task 14: Read-only before/after scoring checks for the apply day

**Files:**
- Create: `scripts/usa-reference/us1-scoring-snapshot.mjs`
- Create: `scripts/usa-reference/capture-us1-scoring.mjs`
- Create: `scripts/usa-reference/check-us1-live.mjs`

**Interfaces:** `scoringSnapshot(client) → { guesses, user_totals, leaderboards, answer_keys, catalog_wines }`. Affected tastings: `83a1a1cc-3275-4472-90c3-a00398eea4cf` (New World Nights), `42e8c830-a545-491c-bec8-1272e8aaba72` (Hornbæk 2026 FREDAG), and `c22c4b09-bf16-4dbe-9973-e2a4f469a99f`. These are the tastings of the 4 US guesses and the 2 US answer keys, all CLOSED.

- [ ] **Step 1: `us1-scoring-snapshot.mjs`** (complete file):

```js
// The scoring outputs US-1 must leave unchanged (spec §15 US-1): every stored
// point on the affected tastings' guesses, each affected user's totals (what
// getProfileStats sums), each tasting's leaderboard as its host sees it, and
// the names the two US answer keys and five US catalog wines display. Runs
// inside a read-only transaction; the leaderboard impersonates the host with
// set local role, which a read-only transaction allows.
export const AFFECTED_TASTINGS = ["83a1a1cc-3275-4472-90c3-a00398eea4cf", "42e8c830-a545-491c-bec8-1272e8aaba72", "c22c4b09-bf16-4dbe-9973-e2a4f469a99f"];
const POINTS = "country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points, total_points";

export async function scoringSnapshot(c) {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const guesses = await q(`select g.id, ${POINTS} from guesses g join wines w on w.id = g.wine_id where w.tasting_id = any ($1::uuid[]) order by g.id`, [AFFECTED_TASTINGS]);
  const user_totals = await q(`select tp.user_id, count(*) filter (where g.scored_at is not null)::int as scored, coalesce(sum(g.total_points), 0)::int as total
      from guesses g join tasting_participants tp on tp.id = g.participant_id
     where tp.user_id in (select user_id from tasting_participants where tasting_id = any ($1::uuid[]))
     group by tp.user_id order by tp.user_id`, [AFFECTED_TASTINGS]);
  const leaderboards = {};
  for (const t of await q("select id, host_id from tastings where id = any ($1::uuid[]) order by id", [AFFECTED_TASTINGS])) {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [t.host_id]);
    await c.query("set local role authenticated");
    leaderboards[t.id] = (await c.query("select * from get_tasting_leaderboard($1) order by participant_id", [t.id])).rows;
    await c.query("reset role");
  }
  const answer_keys = await q(`select wa.wine_id, co.name as country, r.name as region, a.name as appellation
      from wine_answers wa join regions r on r.id = wa.region_id join countries co on co.id = r.country_id left join appellations a on a.id = wa.appellation_id
     where co.name = 'United States' order by wa.wine_id`);
  const catalog_wines = await q(`select w.id, r.name as region, a.name as appellation from catalog_wines w
      join regions r on r.id = w.region_id join appellations a on a.id = w.appellation_id join countries co on co.id = r.country_id
     where co.name = 'United States' order by w.id`);
  return { guesses, user_totals, leaderboards, answer_keys, catalog_wines };
}
```

- [ ] **Step 2: `capture-us1-scoring.mjs`** writes `.superpowers/usa-us1/scoring-before.json`. `.superpowers/` is gitignored because the file holds user ids. It uses `withReadOnly` and `scoringSnapshot`, creates the directory (`mkdir … { recursive: true }`), and prints the number of guesses and users.

- [ ] **Step 3: `check-us1-live.mjs`** (read-only; for the main session after the apply):

```js
// READ-ONLY post-apply check of US-1 (spec §15 US-1). Exit 1 on any failure.
// Usage: node scripts/usa-reference/check-us1-live.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { scoringSnapshot } from "./us1-scoring-snapshot.mjs";
import { SPEC_PATH, US1_VERSION } from "./us1-spec-lib.mjs";

const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
let before = null;
try { before = JSON.parse(await readFile(".superpowers/usa-us1/scoring-before.json", "utf8")); } catch { console.log("WARN: no scoring-before.json; scoring comparison skipped"); }
await withReadOnly(async (c) => {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  assert.equal((await q("select count(*)::int as n from supabase_migrations.schema_migrations where version = $1", [US1_VERSION]))[0].n, 1, "US-1 is recorded");
  const [{ id: us }] = await q("select id from countries where name = 'United States'");
  const regions = (await q("select id from regions where country_id = $1 order by id", [us])).map((r) => r.id);
  assert.deepEqual(regions, spec.post.region_ids, "26 US regions");
  const apps = await q("select id, name, region_id from appellations where region_id = any ($1) order by id", [regions]);
  assert.equal(apps.length, spec.post.appellation_count);
  assert.deepEqual(apps.filter((a) => a.name.endsWith(" AVA")).map((a) => a.name).sort(), [...spec.post.ava_names].sort());
  // The 6 state and 15 county names US-1 stripped of a false " AVA" must not exist any more.
  const forbidden = new Set(spec.renames.filter((r) => r.step !== "4_legal_names").map((r) => r.old));
  assert.deepEqual(apps.filter((a) => forbidden.has(a.name)).map((a) => a.name), [], "no US state or county row ends in \" AVA\"");
  const appIds = apps.map((a) => a.id);
  for (const [t, sql] of REF_QUERIES) assert.deepEqual((await c.query(sql, [regions, appIds])).rows[0].refs, spec.post.references[t], t);
  if (before) assert.deepEqual(await scoringSnapshot(c), before, "scoring outputs unchanged");
  console.log("US-1 LIVE CHECK OK");
});
```

The no-false-suffix assertion checks the exact 21 old names from the spec's `1_state_suffix` and `2_county_suffix` renames. So real AVAs whose legal name contains "County" (Eagle Peak Mendocino County, Red Hills Lake County, Moon Mountain District Sonoma County, Solano County Green Valley) can never trip it.

- [ ] **Step 4: Exercise the capture now (read-only).** Run `node scripts/usa-reference/capture-us1-scoring.mjs`. The printed counts must show at least 4 guesses (the 4 US guesses plus every other guess in those three tastings) and at least 1 user. Open the JSON and confirm it has 3 leaderboards, each with at least one row, 2 answer keys (Napa Valley AVA / California, Columbia Gorge AVA / Oregon) and 5 catalog wines. Then run `node scripts/usa-reference/check-us1-live.mjs` and expect it to **fail** at `US-1 is recorded`, because US-1 is not applied. That is the correct pre-apply result. Then `rm -rf .superpowers/usa-us1`, because the main session captures again on the apply day.
- [ ] **Step 5: Commit** `feat(usa-reference): read-only before/after checks for US-1`.

### Task 15: Final verification

- [ ] **Step 1: Every suite.**

```bash
cd C:/Users/Public/repos/blindtastingapp-map && node --test scripts/wine-map-sources/usa-tree.test.mjs scripts/wine-map-sources/usa-tree-reports.test.mjs scripts/usa-reference/*.test.mjs scripts/wine-map-tiles/lib.test.mjs && npx vitest run && npx tsc --noEmit && npx eslint scripts/usa-reference scripts/wine-map-sources src/lib/wine-identity
```
Expected: all green. (`npx vitest run` runs the whole suite; the wine-identity and live-replay tests must be green in it.)

- [ ] **Step 2: Pre-flight and dry runs one last time.** Run `$APPLIER --check` on both files, then `--dry` on the forward file. Expected: `DRY RUN OK`. Run `node scripts/usa-reference/rehearse-us1.mjs` and expect `REHEARSAL OK`. Run `node scripts/usa-reference/build-us1-spec.mjs --check` and expect `match live`.
- [ ] **Step 3:** `git status` shows a clean tree, and `git log --oneline origin/master..HEAD` lists this plan's commits on top of US-0. Nothing is pushed.

## US-1 acceptance mapped to tasks (spec §15, plus this run's part (a))

| Acceptance | Task |
|---|---|
| Owner's nesting rule in the tree logic, with tests | 1 |
| Tehachapi Mountains and Squaw Valley-Miramonte under California | 2, 4 |
| Four tree reports and the summary regenerated; the 25 pairs nested; nothing left "almost within" | 4 |
| Spec records the decisions | 5 |
| `data/usa-reference/` re-derived from the new map states | 6 (and 9's `checkState`) |
| Walla Walla Valley producers researched, one source each, re-linked by id | 7, 8, 10 |
| Migration with exact pre-state asserts, renames by id, merges re-pointing every reference first, 50 new rows, one row per cross-state AVA (Columbia Gorge under Oregon), pseudo-regions retired | 8, 9, 10 |
| Saved pre-image, rehearsed reverse migration | 9, 11, 12 |
| `--dry` rehearsals of forward and reverse pass all asserts | 10, 11, 12 |
| `live-replay.test.ts` and the wine-identity suite green; the fixture hand-edited | 13, 15 |
| Rerun guard on `add-appellation-designations.mjs` | 13 |
| 26 regions; no state/county row ending " AVA"; the §3 references resolve with the same ids and stored points; each user's totals, profile sums and leaderboards unchanged | 14's scripts, run by the main session after the apply |
| Applied live at a quiet hour; in-app checks | main session (below) |

## Deviations from the spec, stated

- **Mount Pisgah.** The copy list the owner approved names the row "Mount Pisgah, Polk County, Oregon AVA" (UC Davis's name field, 27 CFR 9.284). The spec's first draft had "Mt." and is corrected in Task 5.
- **Revert location.** The revert lives in `scripts/usa-reference/`, not `supabase/migrations/`, and deletes US-1's history row. Keeping it in `supabase/migrations/` would let a replay undo US-1.
- **Ancestor overlaps.** An OVERLAPS edge to a place's own primary ancestor is dropped and listed (Task 3). This is a plan decision that the owner's nesting rule forces; it is shown to the owner in the summary.
- **Region moves of a wine or answer key.** None exist today. The migration refuses them outright ("STOP for the owner") instead of moving them with an audit row, because every such case needs the owner's §6.2 step 6 decision anyway. The audit-row path in §6.3 is therefore unused.

## What the main session must do afterwards

1. **Review:**
   - `git log` of this plan's commits;
   - `data/wine-map/review/usa-us0-tree-summary.md` (provisional owner-facing text): show the owner the new legal-record table, and Red Hill Douglas County, Oregon in "Overlaps with a place's own ancestor";
   - `data/usa-reference/us1-producer-states.json`: tell the owner the WA/OR/null tally, and name every `null` producer and why.
2. **Push/merge** (owner: "Yes, ship phases as they pass"). US-1 changes no runtime code: only scripts, tests, data, the spec and one migration file. Follow the deploy rules in memory (worktree off master, a staged push). Rebase `usa-map` onto master first, since both sides moved. Master's own checks must be green.
3. **Apply day (quiet hour, European night or early morning, with no live tasting open).** Run from the worktree:
   1. `node scripts/usa-reference/build-us1-spec.mjs --check` → `match live`. If it differs, rebuild (Task 9), re-render (10, 11), re-rehearse (12), commit, then continue.
   2. `node scripts/usa-reference/capture-us1-scoring.mjs` (the before-snapshot).
   3. Run `$APPLIER <forward> --check`, then `--dry` → `DRY RUN OK`. Then `node scripts/usa-reference/rehearse-us1.mjs` → `REHEARSAL OK`.
   4. Apply: `node --env-file=.env.local "$APPLIER" supabase/migrations/20260929214747_usa_reference_cleanup.sql` → `APPLIED`. Same-transaction asserts guard it, and it touches no `wine_places` row, so no neighbour refresh is needed.
   5. `node scripts/usa-reference/check-us1-live.mjs` → `US-1 LIVE CHECK OK`. This covers the 26 regions, the " AVA" names, the unchanged references, and scoring that is identical before and after.
   6. **If it fails:** `--check`, then `--dry`, then apply `scripts/usa-reference/20260929224747_usa_reference_cleanup_revert.sql`. It refuses once a new AVA row is in use; after that, roll forward.
4. **In-app checks on production (desktop, then iPhone):**
   - the region picker no longer lists "Walla Walla Valley" or "Columbia Gorge";
   - the by-hand form offers "Just the region" for California, Oregon, Washington and New York;
   - the Phelps Creek record (tasting "Hornbæk 2026 FREDAG", wine `3bd5ecfa-…`) and the catalog wine `64ac81fa-…` read Oregon · Columbia Gorge AVA;
   - one add-wine save and one guess on a Washington AVA succeed. These are live writes: use a throwaway tasting with the seeded demo accounts, and ask the owner if unsure.
5. **CLAUDE.md** (the main session's call). Add a short "US scoring rows (US-1, 2026-09-29)" note:
   - one row per cross-state AVA, under the map's state; Columbia Gorge is under Oregon;
   - the Walla Walla Valley and Columbia Gorge pseudo-regions are gone, and their producers are linked by winery state;
   - `add-appellation-designations.mjs` refuses US rows;
   - the revert lives in `scripts/usa-reference/`.
6. **The friend.** Nothing changes for them. No shared map function or map table is touched. The tree reports changed keys that are not yet live (no US place exists), so nothing locks until US-2's promote.
7. **Next:** US-2 plans the catalog, knowledge, stage and promote from the regenerated reports. Its §10.3 shortlist comparison now runs against clean region rows.
