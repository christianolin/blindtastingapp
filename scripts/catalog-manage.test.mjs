// catalog_wine_usage + delete_catalog_wine (migration 20260829252000).
// Harness shape copied from scripts/wset-notes.test.mjs: pg Client on pgConfig,
// withRollback for probes, `set local role authenticated` + a JWT sub so
// auth.uid() resolves inside the SECURITY DEFINER functions.
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

let cachedIds = null;
async function referenceIds() {
  if (cachedIds) return cachedIds;
  const ids = {};
  for (const [key, table] of [
    ["country", "countries"],
    ["region", "regions"],
    ["appellation", "appellations"],
    ["grape", "grapes"],
    ["producer", "producers"],
    ["profile", "profiles"],
  ]) {
    const r = await client.query(`select id from ${table} order by id limit 1`);
    assert.equal(r.rowCount, 1, `${table} needs a row`);
    ids[key] = r.rows[0].id;
  }
  cachedIds = ids;
  return ids;
}

let cachedPair = null;
async function profilePair() {
  if (cachedPair) return cachedPair;
  const r = await client.query("select id from profiles order by id limit 2");
  assert.equal(r.rowCount, 2, "need two profiles");
  cachedPair = [r.rows[0].id, r.rows[1].id];
  return cachedPair;
}

const CATALOG_INSERT = `
  insert into catalog_wines
    (country_id, region_id, appellation_id, primary_grape_id, producer_id,
     vintage_kind, vintage_year, colour, style, wine_name, created_by)
  values ($1,$2,$3,$4,$5,'YEAR',2019,'RED','STILL','Test '||gen_random_uuid()::text,$6)`;

async function insertCatalog(ids) {
  const r = await client.query(`${CATALOG_INSERT} returning id`, [
    ids.country, ids.region, ids.appellation, ids.grape, ids.producer, ids.profile,
  ]);
  return r.rows[0].id;
}

async function insertLot(ownerId, wineId, qty) {
  await client.query(
    `insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity)
     values ($1,$2,$3, greatest($3,1))`,
    [ownerId, wineId, qty],
  );
}

async function actAsAuthenticated(userId) {
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

async function usage(wineId) {
  const r = await client.query("select * from catalog_wine_usage($1)", [wineId]);
  return r.rows[0];
}

test("catalog_wine_usage counts distinct holders, bottles and references", async () => {
  const ids = await referenceIds();
  const [a, b] = await profilePair();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await insertLot(a, wineId, 3);
    await insertLot(b, wineId, 2);
    await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2)",
      [wineId, a],
    );
    const u = await usage(wineId);
    assert.equal(u.holders, 2, "two distinct owners");
    assert.equal(u.bottles, 5, "3 + 2 bottles");
    assert.equal(u.lot_count, 2);
    assert.equal(u.note_count, 1);
    assert.equal(u.appearance_count, 0);
    assert.equal(u.consumption_count, 0);
  });
});

test("a quantity-0 lot is a reference but not a holder", async () => {
  const ids = await referenceIds();
  const [a] = await profilePair();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await insertLot(a, wineId, 0);
    const u = await usage(wineId);
    assert.equal(u.holders, 0);
    assert.equal(u.bottles, 0);
    assert.equal(u.lot_count, 1, "still blocks a delete");
  });
});

test("delete_catalog_wine removes a truly-unreferenced wine for a curator", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await client.query("update profiles set is_curator = true where id = $1", [ids.profile]);
    await actAsAuthenticated(ids.profile);
    await client.query("select delete_catalog_wine($1)", [wineId]);
    await client.query("reset role");
    const r = await client.query("select 1 from catalog_wines where id = $1", [wineId]);
    assert.equal(r.rowCount, 0, "wine is gone");
  });
});

test("delete_catalog_wine is blocked while the wine is in a cellar", async () => {
  const ids = await referenceIds();
  const [a] = await profilePair();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await insertLot(a, wineId, 1);
    await client.query("update profiles set is_curator = true where id = $1", [ids.profile]);
    await actAsAuthenticated(ids.profile);
    await assert.rejects(
      () => client.query("select delete_catalog_wine($1)", [wineId]),
      (e) => {
        assert.equal(e.code, "P0001");
        assert.match(e.message, /still in use/);
        return true;
      },
    );
  });
});

test("delete_catalog_wine is blocked while a tasting note exists", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2)",
      [wineId, ids.profile],
    );
    await client.query("update profiles set is_curator = true where id = $1", [ids.profile]);
    await actAsAuthenticated(ids.profile);
    await assert.rejects(
      () => client.query("select delete_catalog_wine($1)", [wineId]),
      (e) => {
        assert.equal(e.code, "P0001");
        return true;
      },
    );
  });
});

test("delete_catalog_wine denies a non-curator", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await client.query("update profiles set is_curator = false where id = $1", [ids.profile]);
    await actAsAuthenticated(ids.profile);
    await assert.rejects(
      () => client.query("select delete_catalog_wine($1)", [wineId]),
      (e) => {
        assert.equal(e.code, "42501");
        assert.match(e.message, /curators/);
        return true;
      },
    );
  });
});
