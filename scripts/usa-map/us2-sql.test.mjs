import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave, US2_FILES } from "./us2-wave.mjs";
import { catalogSql } from "./render-us2-sql.mjs";

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
