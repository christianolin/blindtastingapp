// Cellar social DB suite: cellar_visibility + broadened cellar_lots read policy.
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
async function addLot() {
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
    wine_name: "SocialTest " + Math.random(),
    quantity: 3,
  };
  return (
    await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)])
  ).rows[0].id;
}
// Owner-role (RLS-bypassing) setup helper.
async function setVisibility(owner, v) {
  await client.query("reset role");
  await client.query("update profiles set cellar_visibility=$2 where id=$1", [owner, v]);
}

test("PUBLIC cellar is visible to another user", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "PUBLIC");
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [lot]))
        .rows[0].n,
      1,
    );
  });
});

test("PRIVATE cellar is hidden from another user", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "PRIVATE");
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [lot]))
        .rows[0].n,
      0,
    );
  });
});

test("FRIENDS cellar visible to a friend, hidden from a stranger", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "FRIENDS");
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [lot]))
        .rows[0].n,
      0,
    );
    await client.query("reset role");
    await client.query("insert into friendships (user_id, friend_id) values ($1,$2)", [a, b]);
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_lots where id=$1", [lot]))
        .rows[0].n,
      1,
    );
  });
});

test("drink history stays private even when the cellar is public", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    const cid = (
      await client.query("select consume_cellar_lot($1::jsonb) id", [
        JSON.stringify({ lot_id: lot, quantity: 1 }),
      ])
    ).rows[0].id;
    await setVisibility(a, "PUBLIC");
    await asUser(b);
    assert.equal(
      (await client.query("select count(*)::int n from cellar_consumptions where id=$1", [cid]))
        .rows[0].n,
      0,
    );
  });
});
