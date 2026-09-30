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
