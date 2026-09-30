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
