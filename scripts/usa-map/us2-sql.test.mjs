import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave, US2_FILES } from "./us2-wave.mjs";
import { catalogSql, linksSql, loadLinks, promoteSql } from "./render-us2-sql.mjs";

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

const links = await loadLinks();

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

test("links: the three wines, their own sort_order, R2's points cleared and never a place write", () => {
  assert.deepEqual(links.map((l) => [l.name, l.sort_order, l.home]), [
    ["A typical Napa Cabernet Sauvignon", 88, "united-states.california.north-coast"],
    ["A typical Sonoma Chardonnay", 89, "united-states.california.north-coast"],
    ["A typical Willamette Pinot Noir", 90, "united-states.oregon.willamette-valley"],
  ]);
  // R2's curated points (20260929150000), verbatim.
  assert.deepEqual(links.map((l) => l.display_point), [[-122.4, 38.43], [-122.82, 38.4], [-123.03, 45.28]]);
  const sql = linksSql(links);
  for (const phrase of [
    "pre-state differs for",
    "is not VERIFIED with a current boundary (apply after the US-2 promote)",
    "curated display point is neither R2''s nor empty",
    "set display_lon = null, display_lat = null",
    "placed archetypes still carry a curated display point",
    "placed archetypes without a placement at their REGION ancestor",
    "placements on united-states places, expected 6",
  ]) assert.ok(sql.includes(phrase), phrase);
  assert.ok(!/(insert into|update|delete from) public\.wine_place(s|_boundaries)\b/.test(sql), "no catalogue write");
  assert.ok(!/refresh_wine_place_neighbours/.test(sql), "no refresh needed");
  assert.throws(() => linksSql([{ ...links[0], placements: ["united-states.california"] }]), /home must be one of its placements/);
  assert.throws(() => linksSql([{ ...links[0], display_point: [1] }]), /display_point/);
});
