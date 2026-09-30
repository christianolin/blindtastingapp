import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { catalogSql, loadUs4Wave } from "./render-us4-sql.mjs";

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
