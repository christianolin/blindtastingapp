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
  references: { ...structuredClone(EMPTY_REFS), catalog_wines: [{ id: "w1", region_id: "r-or", appellation_id: "a-cg" }],
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
