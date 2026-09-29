import assert from "node:assert/strict";
import test from "node:test";
import { buildUsaTree, COUNTRY_KEY } from "./usa-tree.mjs";

const CONFIG = {
  wave_states: {
    CA: { slug: "california", name: "California" },
    WA: { slug: "washington", name: "Washington" },
    OR: { slug: "oregon", name: "Oregon" },
    NY: { slug: "new-york", name: "New York" },
  },
  umbrellas: { CA: ["North Coast"], WA: ["Columbia Valley"] },
  navigation_nodes: [{ state: "CA", slug: "central-valley", name: "Central Valley", member_rule: "counties", counties: ["Sacramento", "San Joaquin County"] }],
  state_overrides: { "Columbia Gorge": { state: "OR", owner_answer: "Oregon" } },
  parent_overrides: {},
};
// By default an AVA's legal (TTB) states are the states it was measured in,
// and its buffered shares match its measured ones.
const ava = (id, name, area_km2, state_shares, extra = {}) => {
  const states = Object.keys(state_shares).sort();
  return {
    id, name, area_km2, state_shares, land_share: 1,
    buffered_shares: Object.fromEntries(states.map((c) => [c, 1])),
    measured_containment: { states, share: 1 },
    legal_states: states, legal_source: "ttb",
    counties: [], ucd_within: [], ucd_contains: [], ucd_states: states, cfr: null, ...extra,
  };
};
const pair = (a, b, a_in_b, b_in_a) => ({ a, b, a_in_b, b_in_a });
const CA = { CA: 1 };
const AVAS = [
  ava("north_coast", "North Coast", 12000, CA),
  ava("northern_sonoma", "Northern Sonoma", 1400, CA),
  ava("sonoma_coast", "Sonoma Coast", 2000, CA),
  ava("russian_river", "Russian River Valley", 680, CA, {
    ucd_within: ["north_coast", "northern_sonoma", "sonoma_coast"], ucd_contains: ["knights_valley"],
  }),
  ava("green_valley", "Green Valley of Russian River Valley", 80, CA),
  ava("napa", "Napa Valley", 910, CA),
  ava("oakville", "Oakville", 23, CA, { ucd_within: ["Napa Valley", "Bogus Place"] }),
  ava("sonoma_valley", "Sonoma Valley", 450, CA),
  ava("carneros", "Los Carneros", 370, CA),
  ava("knights_valley", "Knights Valley", 150, CA),
  ava("lodi", "Lodi", 2230, CA, { counties: ["Sacramento County", "San Joaquin"] }),
  ava("mokelumne", "Mokelumne River", 350, CA, { counties: ["San Joaquin"] }),
  ava("seiad", "Seiad Valley", 9, CA, { counties: ["Siskiyou"] }),
  ava("columbia_valley", "Columbia Valley", 46000, { WA: 0.9, OR: 0.1 }),
  ava("walla_walla", "Walla Walla Valley", 1300, { WA: 0.62, OR: 0.38 }),
  ava("rocks", "The Rocks District of Milton-Freewater", 15, { OR: 1 }),
  ava("gorge", "Columbia Gorge", 780, { WA: 0.6, OR: 0.4 }),
  ava("chelan", "Lake Chelan", 100, { WA: 0.996, OR: 0.004 }),
  ava("snake", "Snake River Valley", 21000, { ID: 0.8, OR: 0.2 }),
];
const PAIRS = [
  pair("north_coast", "northern_sonoma", 0.1167, 1),
  pair("north_coast", "sonoma_coast", 0.1663, 0.998),
  pair("north_coast", "russian_river", 0.0567, 1),
  pair("north_coast", "green_valley", 0.0067, 1),
  pair("north_coast", "napa", 0.0758, 1),
  pair("north_coast", "oakville", 0.0019, 1),
  pair("north_coast", "sonoma_valley", 0.0375, 1),
  pair("north_coast", "carneros", 0.0308, 1),
  pair("north_coast", "knights_valley", 0.0125, 1),
  pair("northern_sonoma", "sonoma_coast", 0.3, 0.21),
  pair("northern_sonoma", "russian_river", 0.4857, 1),
  pair("northern_sonoma", "green_valley", 0.0571, 1),
  pair("russian_river", "sonoma_coast", 0.999, 0.3397),
  pair("green_valley", "russian_river", 1, 0.1176),
  pair("green_valley", "sonoma_coast", 1, 0.04),
  pair("napa", "oakville", 0.0253, 1),
  pair("carneros", "napa", 0.55, 0.2236),
  pair("carneros", "sonoma_valley", 0.45, 0.37),
  pair("knights_valley", "napa", 0.008, 0.0013),
  pair("lodi", "mokelumne", 0.157, 1),
  pair("columbia_valley", "walla_walla", 0.0283, 1),
  pair("columbia_valley", "rocks", 0.0003, 1),
  pair("columbia_valley", "chelan", 0.0022, 1),
  pair("rocks", "walla_walla", 1, 0.0115),
];
const tree = () => buildUsaTree({ avas: AVAS, pairs: PAIRS, config: CONFIG });
const place = (t, name) => t.places.find((p) => p.name === name);
const edgesFrom = (t, key) => t.edges.filter((e) => e.source_key === key).map((e) => `${e.type}>${e.target_key}`).sort();

test("country, states and umbrellas", () => {
  const t = tree();
  assert.deepEqual(
    [COUNTRY_KEY, 0, 1.5, 2, 140, "COUNTRY"],
    ((p) => [p.key, p.display_tier, p.min_zoom, p.label_min_zoom, p.sort_order, p.kind])(t.places[0]),
  );
  const ca = place(t, "California");
  assert.deepEqual([ca.key, ca.kind, ca.display_tier, ca.min_zoom, ca.display], ["united-states.california", "REGION", 1, 4, null]);
  const nc = place(t, "North Coast");
  assert.deepEqual(
    [nc.key, nc.kind, nc.display_tier, nc.min_zoom, nc.label_min_zoom, nc.appellation_level, nc.display],
    ["united-states.california.north-coast", "SUBREGION", 2, 5, 5, "regional", "outline"],
  );
});

test("Russian River Valley sits in three containers: primary Northern Sonoma, alternate Sonoma Coast", () => {
  const t = tree();
  const rrv = place(t, "Russian River Valley");
  assert.equal(rrv.key, "united-states.california.north-coast.northern-sonoma.russian-river-valley");
  assert.deepEqual([rrv.display_tier, rrv.min_zoom, rrv.label_min_zoom, rrv.appellation_level], [4, 7, 9, "subregional"]);
  assert.equal(rrv.breadcrumb, "United States › California › North Coast › Northern Sonoma › Russian River Valley");
  assert.deepEqual(edgesFrom(t, rrv.key), ["ALTERNATE_PARENT>united-states.california.north-coast.sonoma-coast"]);
  const gv = place(t, "Green Valley of Russian River Valley");
  assert.equal(gv.key, `${rrv.key}.green-valley-of-russian-river-valley`);
  assert.deepEqual([gv.display_tier, gv.min_zoom, gv.label_min_zoom], [5, 8, 10]);
  assert.deepEqual(edgesFrom(t, gv.key), ["ALTERNATE_PARENT>united-states.california.north-coast.sonoma-coast"]);
  assert.deepEqual(edgesFrom(t, "united-states.california.north-coast.northern-sonoma"),
    ["OVERLAPS>united-states.california.north-coast.sonoma-coast"]);
});

test("Los Carneros straddles Napa Valley and Sonoma Valley: parent North Coast, two OVERLAPS", () => {
  const t = tree();
  const lc = place(t, "Los Carneros");
  assert.equal(lc.parent_key, "united-states.california.north-coast");
  assert.deepEqual(edgesFrom(t, lc.key), [
    "OVERLAPS>united-states.california.north-coast.napa-valley",
    "OVERLAPS>united-states.california.north-coast.sonoma-valley",
  ]);
  assert.equal(place(t, "Oakville").key, "united-states.california.north-coast.napa-valley.oakville");
  assert.equal(place(t, "Napa Valley").display, null);
});

test("The Rocks District lies wholly in Oregon inside a Washington-keyed Walla Walla Valley", () => {
  const t = tree();
  const rocks = place(t, "The Rocks District of Milton-Freewater");
  assert.deepEqual(
    [rocks.key, rocks.parent_key, rocks.display_tier, rocks.appellation_level],
    ["united-states.oregon.the-rocks-district-of-milton-freewater", "united-states.oregon", 2, "regional"],
  );
  assert.deepEqual(edgesFrom(t, rocks.key), [
    "ALTERNATE_PARENT>united-states.washington.columbia-valley",
    "ALTERNATE_PARENT>united-states.washington.columbia-valley.walla-walla-valley",
  ]);
  const wwv = place(t, "Walla Walla Valley");
  assert.equal(wwv.key, "united-states.washington.columbia-valley.walla-walla-valley");
  assert.deepEqual(edgesFrom(t, wwv.key), ["ALTERNATE_PARENT>united-states.oregon"]);
  assert.deepEqual(edgesFrom(t, "united-states.washington.columbia-valley"), ["ALTERNATE_PARENT>united-states.oregon"]);
});

test("a sliver below 1% gets no edge; a 0.4% state share gets no state edge", () => {
  const t = tree();
  assert.deepEqual(edgesFrom(t, place(t, "Knights Valley").key), []);
  assert.deepEqual(edgesFrom(t, place(t, "Lake Chelan").key), []);
});

test("an owner override keys Columbia Gorge under Oregon, with a Washington state edge", () => {
  const t = tree();
  const g = place(t, "Columbia Gorge");
  assert.deepEqual([g.key, g.map_state, g.map_state_source], ["united-states.oregon.columbia-gorge", "OR", "override"]);
  assert.deepEqual(edgesFrom(t, g.key), ["ALTERNATE_PARENT>united-states.washington"]);
});

test("an AVA whose dominant state is outside wave 1 is deferred, not placed", () => {
  const t = tree();
  assert.equal(place(t, "Snake River Valley"), undefined);
  assert.deepEqual(t.deferred.map(({ name, map_state }) => [name, map_state]), [["Snake River Valley", "ID"]]);
});

test("Central Valley groups by county; nested AVAs follow containment; others sit under the state", () => {
  const t = tree();
  const cv = place(t, "Central Valley");
  assert.deepEqual([cv.key, cv.kind, cv.is_appellation, cv.display, cv.navigation_node],
    ["united-states.california.central-valley", "SUBREGION", false, "outline", true]);
  const lodi = place(t, "Lodi");
  assert.deepEqual([lodi.parent_key, lodi.display_tier, lodi.min_zoom, lodi.appellation_level],
    ["united-states.california.central-valley", 2, 6, "regional"]);
  assert.equal(place(t, "Mokelumne River").parent_key, "united-states.california.central-valley.lodi");
  assert.equal(place(t, "Seiad Valley").parent_key, "united-states.california");
});

test("every place's tier is at or below its parent's, and every label reveals by z10", () => {
  const t = tree();
  const byKey = new Map(t.places.map((p) => [p.key, p]));
  for (const p of t.places) {
    assert.ok(p.label_min_zoom <= 10, p.key);
    if (p.parent_key) assert.ok(p.display_tier >= byKey.get(p.parent_key).display_tier, p.key);
  }
  assert.equal(new Set(t.places.map((p) => p.key)).size, t.places.length);
});

test("UC Davis within decides only with >= 90% inside; contains is compared, never used", () => {
  const t = tree();
  const rrv = t.review.within_disagreements.find((r) => r.name === "Russian River Valley");
  assert.deepEqual(rrv.ucd_contains_not_computed, ["Knights Valley"]);
  assert.deepEqual(rrv.ucd_within_not_computed, []);
  const oak = t.review.within_disagreements.find((r) => r.name === "Oakville");
  assert.deepEqual(oak.computed_not_in_ucd_within, ["North Coast"]);
  assert.deepEqual(oak.unresolved_tokens, ["Bogus Place"]);
});

test("near-duplicate outlines, slug collisions, bad names and orphan nodes stop the build", () => {
  assert.throws(() => buildUsaTree({ avas: AVAS, pairs: [...PAIRS, pair("napa", "sonoma_valley", 0.999, 0.998)], config: CONFIG }), /contain each other/);
  assert.throws(() => buildUsaTree({ avas: AVAS, pairs: PAIRS, config: { ...CONFIG, umbrellas: { CA: ["Napa Valley"] } } }), /cannot be a SUBREGION/);
  assert.throws(() => buildUsaTree({ avas: [...AVAS, ava("gv1", "Green Valley", 5, CA), ava("gv2", "Green-Valley", 6, CA)], pairs: PAIRS, config: CONFIG }), /duplicate key/);
  assert.throws(() => buildUsaTree({ avas: AVAS, pairs: PAIRS, config: { ...CONFIG, state_overrides: { Nowhere: { state: "OR" } } } }), /no AVA named "Nowhere"/);
  assert.throws(() => buildUsaTree({ avas: [...AVAS, ava("lost", "Lost", 5, {}, { legal_states: ["CA"] })], pairs: PAIRS, config: CONFIG }), /no state share/);
  const noMembers = { ...CONFIG, navigation_nodes: [{ ...CONFIG.navigation_nodes[0], counties: ["Nowhere"] }] };
  assert.throws(() => buildUsaTree({ avas: AVAS, pairs: PAIRS, config: noMembers }), /has no member/);
});

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

test("a measured share in a state TTB does not list is a state-line artifact: no edge, no say in the map state", () => {
  // The Burn of Columbia Valley: TTB and UC Davis list Washington alone, but the
  // 1:50m state line measures 38% Oregon. Here the false share even wins.
  const burn = ava("burn", "The Burn of Columbia Valley", 60, { WA: 0.45, OR: 0.55 }, {
    legal_states: ["WA"], ucd_states: ["WA"], buffered_shares: { WA: 1, OR: 0.9999 },
    measured_containment: { states: ["OR", "WA"], share: 1 },
  });
  const hhh = ava("hhh", "Horse Heaven Hills", 2300, { WA: 0.977, OR: 0.023 }, {
    legal_states: ["WA"], ucd_states: ["WA"], buffered_shares: { WA: 0.998, OR: 0.21 },
  });
  const t = buildUsaTree({ avas: [...AVAS, burn, hhh], pairs: PAIRS, config: CONFIG });
  const b = place(t, "The Burn of Columbia Valley");
  assert.deepEqual([b.key, b.map_state, b.map_state_source, b.legal_states], ["united-states.washington.the-burn-of-columbia-valley", "WA", "dominant", ["WA"]]);
  assert.deepEqual(edgesFrom(t, b.key), []);
  assert.equal(b.containment_share, 1, "one legal state: containment is its buffered share");
  const h = place(t, "Horse Heaven Hills");
  assert.deepEqual(edgesFrom(t, h.key), []);
  assert.equal(h.containment_share, 0.998);
  assert.equal(t.edges.filter((e) => e.target_key === "united-states.oregon" && [b.key, h.key].includes(e.source_key)).length, 0);
  const r = t.review.state_list_disagreements.find((x) => x.name === "The Burn of Columbia Valley");
  assert.deepEqual([r.legal_states, r.withheld_states, r.measured_dominant, r.map_state],
    [["WA"], [{ state: "OR", share: 0.55 }], "OR", "WA"]);
  // A real cross-state AVA keeps its edge.
  assert.deepEqual(edgesFrom(t, place(t, "Walla Walla Valley").key), ["ALTERNATE_PARENT>united-states.oregon"]);
});

test("legal states: an override outside them, no land in them, or a stale multi-state containment stops the build", () => {
  const badOverride = { ...CONFIG, state_overrides: { "Lake Chelan": { state: "OR" } } };
  const chelanWaOnly = AVAS.map((a) => (a.id === "chelan" ? { ...a, legal_states: ["WA"] } : a));
  assert.throws(() => buildUsaTree({ avas: chelanWaOnly, pairs: PAIRS, config: badOverride }), /not one of its legal states/);
  const nowhere = AVAS.map((a) => (a.id === "seiad" ? { ...a, legal_states: ["OR"] } : a));
  assert.throws(() => buildUsaTree({ avas: nowhere, pairs: PAIRS, config: CONFIG }), /no measured land in its legal states/);
  const stale = AVAS.map((a) => (a.id === "walla_walla" ? { ...a, measured_containment: { states: ["WA"], share: 1 } } : a));
  assert.throws(() => buildUsaTree({ avas: stale, pairs: PAIRS, config: CONFIG }), /re-measure/);
  const none = AVAS.map((a) => (a.id === "seiad" ? { ...a, legal_states: [] } : a));
  assert.throws(() => buildUsaTree({ avas: none, pairs: PAIRS, config: CONFIG }), /no legal state list/);
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
