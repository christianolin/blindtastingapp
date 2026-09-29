import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave, US2_FILES } from "./us2-wave.mjs";
import { catalogSql, promoteSql } from "./render-us2-sql.mjs";

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
