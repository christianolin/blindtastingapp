// Cellar drink+notes DB suite. Harness mirrors scripts/cellar.test.mjs.
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
async function twoProfiles() {
  const r = await client.query("select id from profiles order by id limit 2");
  assert.equal(r.rowCount, 2, "need 2 profiles");
  return [r.rows[0].id, r.rows[1].id];
}
async function addLot(qty) {
  const pick = async (t) =>
    (await client.query(`select id from ${t} order by id limit 1`)).rows[0].id;
  const p = {
    country_id: await pick("countries"),
    region_id: await pick("regions"),
    appellation_id: await pick("appellations"),
    primary_grape_id: await pick("grapes"),
    producer_id: await pick("producers"),
    vintage_kind: "YEAR",
    vintage_year: 2019,
    colour: "RED",
    style: "STILL",
    wine_name: "ConsumeTest " + Math.random(),
    quantity: qty,
  };
  return (
    await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)])
  ).rows[0].id;
}

test("consume decrements the lot and logs a consumption", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const lot = await addLot(6);
    const cid = (
      await client.query("select consume_cellar_lot($1::jsonb) id", [
        JSON.stringify({ lot_id: lot, quantity: 2 }),
      ])
    ).rows[0].id;
    const q = (await client.query("select quantity from cellar_lots where id=$1", [lot]))
      .rows[0].quantity;
    assert.equal(q, 4);
    const c = (await client.query("select * from cellar_consumptions where id=$1", [cid]))
      .rows[0];
    assert.equal(c.owner_id, a);
    assert.equal(c.lot_id, lot);
    assert.equal(c.quantity, 2);
    assert.equal(c.reason, "DRANK");
    assert.ok(c.catalog_wine_id);
  });
});

test("cannot consume more than the lot holds", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const lot = await addLot(1);
    await assert.rejects(
      client.query("select consume_cellar_lot($1::jsonb)", [
        JSON.stringify({ lot_id: lot, quantity: 3 }),
      ]),
      /only 1 left/,
    );
  });
});

test("another user cannot consume or see your lot", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot(3);
    const cid = (
      await client.query("select consume_cellar_lot($1::jsonb) id", [
        JSON.stringify({ lot_id: lot, quantity: 1 }),
      ])
    ).rows[0].id;
    await client.query("reset role");
    await asUser(b);
    // Plain SELECT first: a raised error would abort the tx for later queries.
    assert.equal(
      (await client.query("select count(*)::int n from cellar_consumptions where id=$1", [cid]))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      client.query("select consume_cellar_lot($1::jsonb)", [
        JSON.stringify({ lot_id: lot, quantity: 1 }),
      ]),
      /lot not found/,
    );
  });
});

test("history survives lot deletion (lot_id set null, wine kept)", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const lot = await addLot(2);
    const cid = (
      await client.query("select consume_cellar_lot($1::jsonb) id", [
        JSON.stringify({ lot_id: lot, quantity: 1 }),
      ])
    ).rows[0].id;
    await client.query("delete from cellar_lots where id=$1", [lot]);
    const c = (
      await client.query(
        "select lot_id, catalog_wine_id from cellar_consumptions where id=$1",
        [cid],
      )
    ).rows[0];
    assert.equal(c.lot_id, null);
    assert.ok(c.catalog_wine_id);
  });
});
