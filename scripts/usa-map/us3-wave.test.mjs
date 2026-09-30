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
