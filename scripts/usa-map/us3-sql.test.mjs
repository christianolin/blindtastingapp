import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { catalogSql, loadUs3Waves, promoteSql, links2Sql, loadLinks2, renderAll } from "./render-us3-sql.mjs";
import { rollbackRefusal } from "./apply-rollback.mjs";

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

