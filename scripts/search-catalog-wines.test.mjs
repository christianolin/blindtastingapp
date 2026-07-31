// Regression: search_catalog_wines must find wines that have no wine_name
// (nullable). Bug — a NULL wine_name nullified the whole concatenated
// searchable string, so "Stephane Brocard" / "Gevrey" found nothing.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());

async function withRollback(cb) {
  await client.query("begin");
  try {
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

let ids = null;
async function referenceIds() {
  if (ids) return ids;
  const out = {};
  for (const [k, tbl] of [
    ["country", "countries"],
    ["region", "regions"],
    ["appellation", "appellations"],
    ["grape", "grapes"],
    ["profile", "profiles"],
  ]) {
    const r = await client.query(`select id from ${tbl} order by id limit 1`);
    assert.equal(r.rowCount, 1, `${tbl} needs a row`);
    out[k] = r.rows[0].id;
  }
  ids = out;
  return ids;
}

test("search_catalog_wines finds a wine with no wine_name (by producer token)", async () => {
  const r = await referenceIds();
  await withRollback(async () => {
    const token = "Zznull" + Math.random().toString(36).slice(2, 8);
    const prod = await client.query(
      "insert into producers (name) values ($1) returning id",
      [token + " Brocard"],
    );
    await client.query(
      `insert into catalog_wines
        (country_id, region_id, appellation_id, primary_grape_id, producer_id,
         vintage_kind, vintage_year, colour, style, created_by)
       values ($1,$2,$3,$4,$5,'YEAR',2001,'RED','STILL',$6)`,
      [r.country, r.region, r.appellation, r.grape, prod.rows[0].id, r.profile],
    );
    const found = await client.query(
      "select id from search_catalog_wines($1, 20)",
      [token],
    );
    assert.equal(found.rowCount, 1, "null-wine_name wine is searchable by producer");
  });
});
