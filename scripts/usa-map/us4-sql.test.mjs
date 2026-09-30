import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { rollbackRefusal } from "./apply-rollback.mjs";
import { catalogSql, loadUs4Wave, promoteSql, renderAll } from "./render-us4-sql.mjs";

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
  // A containment edge must lie >= 0.899 inside its target (the promote refuses `not (... >= 0.899)`).
  assert.match(sql, /\/ extensions\.ST_Area\(a\.g\) >= 0\.899, false\)\)/);
  assert.match(sql, /'\{united-states\.oregon,united-states\.washington\}'/, "Walla Walla Valley and Columbia Gorge are held to both legal states");
});

test("Review Focus 1: Candy Mountain's override floor is the tree's figure less one point", () => {
  assert.ok(promoteSql(wave).includes("('united-states.washington.columbia-valley.yakima-valley.candy-mountain', 'candy_mountain', false, 'united-states.washington.columbia-valley.yakima-valley', 0.883, '{united-states.washington}',"));
});

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
