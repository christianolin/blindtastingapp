// Cellar inventory core DB suite. Harness mirrors scripts/wset-notes.test.mjs:
// pg Client on pgConfig, withRollback for RLS probes, set_config JWT claims +
// `set local role authenticated` so auth.uid() drives owner-only policies.
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
async function identity() {
  const pick = async (t) =>
    (await client.query(`select id from ${t} order by id limit 1`)).rows[0].id;
  return {
    country_id: await pick("countries"),
    region_id: await pick("regions"),
    appellation_id: await pick("appellations"),
    primary_grape_id: await pick("grapes"),
    producer_id: await pick("producers"),
    vintage_kind: "YEAR",
    vintage_year: 2019,
    colour: "RED",
    style: "STILL",
    wine_name: "CellarTest " + Math.random(),
  };
}

test("add_cellar_lot creates lot under caller with profile currency", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await client.query("update profiles set preferred_currency='EUR' where id=$1", [a]);
    await asUser(a);
    const p = { ...(await identity()), quantity: 6, bottle_size_ml: 750 };
    const { rows } = await client.query("select add_cellar_lot($1::jsonb) id", [
      JSON.stringify(p),
    ]);
    const lot = (await client.query("select * from cellar_lots where id=$1", [rows[0].id]))
      .rows[0];
    assert.equal(lot.owner_id, a);
    assert.equal(lot.quantity, 6);
    assert.equal(lot.purchased_quantity, 6);
    assert.equal(lot.bottle_size_ml, 750);
    assert.equal(lot.currency, "EUR");
  });
});

test("owner CRUD; other user cannot see or mutate", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const id = (
      await client.query("select add_cellar_lot($1::jsonb) id", [
        JSON.stringify({ ...(await identity()), quantity: 3 }),
      ])
    ).rows[0].id;
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [id])).rows[0].n,
      1,
    );
    await client.query("reset role");
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [id])).rows[0].n,
      0,
    );
    assert.equal(
      (await client.query("update cellar_lots set quantity=1 where id=$1", [id])).rowCount,
      0,
    );
    assert.equal(
      (await client.query("delete from cellar_lots where id=$1", [id])).rowCount,
      0,
    );
  });
});

test("find_or_create dedups: two lots, one catalog identity", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const p = { ...(await identity()), quantity: 1 };
    const l1 = (await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)]))
      .rows[0].id;
    const l2 = (await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)]))
      .rows[0].id;
    const w = await client.query(
      "select distinct catalog_wine_id from cellar_lots where id = any($1)",
      [[l1, l2]],
    );
    assert.equal(w.rowCount, 1);
  });
});

test("checks reject bad quantity and drink window", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const id = (
      await client.query("select add_cellar_lot($1::jsonb) id", [
        JSON.stringify({ ...(await identity()), quantity: 1 }),
      ])
    ).rows[0].id;
    const cwid = (
      await client.query("select catalog_wine_id from cellar_lots where id=$1", [id])
    ).rows[0].catalog_wine_id;
    await assert.rejects(
      client.query(
        "insert into cellar_lots (owner_id,catalog_wine_id,quantity,purchased_quantity) values ($1,$2,-1,1)",
        [a, cwid],
      ),
    );
    await assert.rejects(
      client.query(
        "insert into cellar_lots (owner_id,catalog_wine_id,quantity,purchased_quantity,drink_from,drink_to) values ($1,$2,1,1,2030,2020)",
        [a, cwid],
      ),
    );
  });
});
