// Cellar social DB suite: cellar_visibility + the shared cellar read. Since
// 20260919223200 "cellar own select" admits the owner alone; everyone else reads
// a cellar through shared_cellar_lots(owner) (20260919223100), gated by
// can_view_cellar, where a bottle poured into a glass that is not revealed yet
// still counts in its lot (spec 2026-09-19-rule1-older-leaks D10, D11). Passes
// only once 20260919223200 is live.
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
// The current role's direct read of one lot ("cellar own select": the owner alone).
async function directCount(lot) {
  return (await client.query("select count(*)::int n from cellar_lots where id=$1", [lot])).rows[0]
    .n;
}
// The current role's shared view of one lot of `owner`'s cellar.
async function sharedCount(owner, lot) {
  return (
    await client.query("select count(*)::int n from shared_cellar_lots($1::uuid) s where s.id=$2", [
      owner,
      lot,
    ])
  ).rows[0].n;
}
async function sharedQuantity(owner, lot) {
  return (
    await client.query("select quantity from shared_cellar_lots($1::uuid) s where s.id=$2", [owner, lot])
  ).rows.map((r) => r.quantity);
}

test("PUBLIC cellar is visible to another user through shared_cellar_lots only", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "PUBLIC");
    await asUser(b);
    assert.equal(await sharedCount(a, lot), 1);
    assert.equal(await directCount(lot), 0, "a direct read of another person's lot is empty");
    await asUser(a);
    assert.equal(await directCount(lot), 1, "the owner still reads their own lot directly");
    assert.equal(await sharedCount(a, lot), 1, "and through the shared view");
  });
});

test("PRIVATE cellar is hidden from another user", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "PRIVATE");
    await asUser(b);
    assert.equal(await sharedCount(a, lot), 0);
    assert.equal(await directCount(lot), 0);
  });
});

test("FRIENDS cellar visible to a friend, hidden from a stranger", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot();
    await setVisibility(a, "FRIENDS");
    await asUser(b);
    assert.equal(await sharedCount(a, lot), 0);
    assert.equal(await directCount(lot), 0);
    await client.query("reset role");
    await client.query("insert into friendships (user_id, friend_id) values ($1,$2)", [a, b]);
    await asUser(b);
    assert.equal(await sharedCount(a, lot), 1);
    assert.equal(await directCount(lot), 0, "a friend reads the lot only through the shared view");
  });
});

test("a bottle poured into an unrevealed glass stays in the shared view until the reveal", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const lot = await addLot(); // 3 bottles
    await setVisibility(a, "PUBLIC"); // resets role: fixtures below are owner-role
    const wine = (
      await client.query(
        `select cw.id, cw.country_id, cw.region_id, cw.appellation_id, cw.primary_grape_id, cw.producer_id,
                cw.vintage_kind, cw.vintage_year
           from cellar_lots l join catalog_wines cw on cw.id = l.catalog_wine_id where l.id = $1`,
        [lot],
      )
    ).rows[0];
    const tasting = (
      await client.query(
        `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode)
         values ('cellar-social', $1, 'LIVE', 'HOST_PROVIDES', 'BLIND') returning id`,
        [a],
      )
    ).rows[0].id;
    await client.query(
      "insert into tasting_participants (tasting_id, user_id, status) values ($1,$2,'JOINED')",
      [tasting, a],
    );
    const glass = (
      await client.query("insert into wines (tasting_id, position) values ($1, 1) returning id", [tasting])
    ).rows[0].id;
    await client.query(
      `insert into wine_answers
         (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [glass, wine.country_id, wine.region_id, wine.appellation_id, wine.primary_grape_id, wine.producer_id,
        wine.vintage_kind, wine.vintage_year, wine.id],
    );
    await client.query(
      "insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1,$2,$3,true)",
      [glass, a, lot],
    );

    // Start: the D11 draw-down pours the bottle.
    await client.query("update tastings set status='IN_PROGRESS' where id=$1", [tasting]);
    await asUser(a);
    const drawn = await client.query("select outcome from draw_down_flight_cellar_lots($1)", [tasting]);
    assert.deepEqual(drawn.rows.map((r) => r.outcome), ["drawn"]);
    assert.deepEqual(
      (await client.query("select quantity from cellar_lots where id=$1", [lot])).rows.map((r) => r.quantity),
      [2],
      "the owner sees the bottle leave at Start",
    );

    await asUser(b);
    assert.deepEqual(await sharedQuantity(a, lot), [3], "everyone else still sees it in the lot");

    // The glass's reveal unmasks the pour.
    await asUser(a);
    await client.query("select reveal_wine($1)", [glass]);
    await asUser(b);
    assert.deepEqual(await sharedQuantity(a, lot), [2], "after the reveal the shared view drops too");
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
