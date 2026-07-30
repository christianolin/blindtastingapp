// Cellar import DB suite: import_cellar_lot / import_cellar_lots name resolution.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb) {
  await client.query("begin");
  try {
    return await cb();
  } finally {
    await client.query("rollback");
  }
}
async function asUser(id) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function oneProfile() {
  return (await client.query("select id from profiles order by id limit 1")).rows[0].id;
}
async function importRows(rows) {
  return (
    await client.query("select import_cellar_lots($1::jsonb) r", [JSON.stringify(rows)])
  ).rows[0].r;
}

test("import_cellar_lots imports name-based rows into lots", async () => {
  await withRollback(async () => {
    const a = await oneProfile();
    await asUser(a);
    const tag = "Imp" + Math.random().toString(36).slice(2, 8);
    const res = await importRows([
      {
        producer: `${tag} Chateau A`,
        country: `${tag}land`,
        region: `${tag} North`,
        appellation: `${tag} AOC`,
        grape: "Merlot",
        colour: "RED",
        style: "STILL",
        vintage_kind: "YEAR",
        vintage_year: 2018,
        quantity: 6,
        bottle_size_ml: 750,
        price_per_bottle: 20,
        currency: "EUR",
      },
      {
        producer: `${tag} Chateau B`,
        country: `${tag}land`,
        region: `${tag} South`,
        grape: "Syrah",
        colour: "RED",
        style: "STILL",
        vintage_kind: "NV",
        quantity: 3,
      },
    ]);
    assert.equal(res.imported, 2);
    assert.equal(res.failed, 0);
    const q = await client.query(
      "select cl.quantity from cellar_lots cl join catalog_wines cw on cw.id = cl.catalog_wine_id " +
        "join producers pr on pr.id = cw.producer_id where cl.owner_id = $1 and pr.name like $2 order by cl.quantity",
      [a, `${tag}%`],
    );
    assert.equal(q.rowCount, 2);
    assert.equal(q.rows[1].quantity, 6);
  });
});

test("importing the same identity twice reuses one catalog wine", async () => {
  await withRollback(async () => {
    const a = await oneProfile();
    await asUser(a);
    const tag = "Dup" + Math.random().toString(36).slice(2, 8);
    const row = {
      producer: `${tag} Dom`,
      country: `${tag}land`,
      region: `${tag} R`,
      appellation: `${tag} A`,
      grape: "Pinot",
      colour: "RED",
      style: "STILL",
      vintage_kind: "YEAR",
      vintage_year: 2019,
      quantity: 1,
    };
    const res = await importRows([row, row]);
    assert.equal(res.imported, 2);
    const w = await client.query(
      "select count(distinct cl.catalog_wine_id)::int n, count(*)::int lots from cellar_lots cl " +
        "join catalog_wines cw on cw.id = cl.catalog_wine_id join producers pr on pr.id = cw.producer_id " +
        "where cl.owner_id = $1 and pr.name like $2",
      [a, `${tag}%`],
    );
    assert.equal(w.rows[0].n, 1);
    assert.equal(w.rows[0].lots, 2);
  });
});

test("a bad row fails without sinking the batch", async () => {
  await withRollback(async () => {
    const a = await oneProfile();
    await asUser(a);
    const tag = "Bad" + Math.random().toString(36).slice(2, 8);
    const res = await importRows([
      { producer: `${tag} Good`, country: `${tag}land`, region: `${tag} R`, grape: "Merlot", quantity: 2 },
      { country: `${tag}land`, grape: "Merlot", quantity: 1 },
    ]);
    assert.equal(res.imported, 1);
    assert.equal(res.failed, 1);
    assert.match(JSON.stringify(res.errors), /producer is required/);
  });
});

test("sparse row imports via fallbacks", async () => {
  await withRollback(async () => {
    const a = await oneProfile();
    await asUser(a);
    const tag = "Spa" + Math.random().toString(36).slice(2, 8);
    const res = await importRows([{ producer: `${tag} P`, country: `${tag}land`, quantity: 1 }]);
    assert.equal(res.imported, 1);
    assert.equal(res.failed, 0);
  });
});
