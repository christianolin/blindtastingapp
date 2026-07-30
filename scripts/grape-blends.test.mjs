// Grape blends DB suite: catalog_wine_grapes source of truth + derived
// primary/secondary columns (the columns blind scoring reads).
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
async function refs() {
  const pick = async (t) =>
    (await client.query(`select id from ${t} order by id limit 1`)).rows[0].id;
  const grapes = (await client.query("select id from grapes order by id limit 3")).rows.map(
    (r) => r.id,
  );
  assert.ok(grapes.length >= 3, "need >=3 grapes");
  return {
    country: await pick("countries"),
    region: await pick("regions"),
    appellation: await pick("appellations"),
    producer: await pick("producers"),
    profile: await pick("profiles"),
    grapes,
  };
}
async function mkWine(r, primary, secondary) {
  return (
    await client.query(
      `insert into catalog_wines
         (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
          producer_id, vintage_kind, vintage_year, colour, style, wine_name, created_by)
       values ($1,$2,$3,$4,$5,$6,'YEAR',2019,'RED','STILL','BlendTest '||gen_random_uuid()::text,$7)
       returning id`,
      [r.country, r.region, r.appellation, primary, secondary, r.producer, r.profile],
    )
  ).rows[0].id;
}
async function derived(id) {
  return (
    await client.query(
      "select primary_grape_id, secondary_grape_id from catalog_wines where id=$1",
      [id],
    )
  ).rows[0];
}

test("new wine seeds blend rows and derives primary/secondary", async () => {
  await withRollback(async () => {
    const r = await refs();
    const w = await mkWine(r, r.grapes[0], r.grapes[1]);
    const rows = await client.query(
      "select grape_id, sort_order from catalog_wine_grapes where catalog_wine_id=$1 order by sort_order",
      [w],
    );
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows[0].grape_id, r.grapes[0]);
    assert.equal(rows.rows[1].grape_id, r.grapes[1]);
    const d = await derived(w);
    assert.equal(d.primary_grape_id, r.grapes[0]);
    assert.equal(d.secondary_grape_id, r.grapes[1]);
  });
});

test("percentage decides the top two regardless of sort_order", async () => {
  await withRollback(async () => {
    const r = await refs();
    const w = await mkWine(r, r.grapes[0], null);
    await client.query(
      "update catalog_wine_grapes set percentage=8 where catalog_wine_id=$1 and grape_id=$2",
      [w, r.grapes[0]],
    );
    await client.query(
      "insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order) values ($1,$2,5,1)",
      [w, r.grapes[1]],
    );
    await client.query(
      "insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order) values ($1,$2,87,2)",
      [w, r.grapes[2]],
    );
    const d = await derived(w);
    assert.equal(d.primary_grape_id, r.grapes[2]);
    assert.equal(d.secondary_grape_id, r.grapes[0]);
  });
});

test("no percentages -> first two by sort_order", async () => {
  await withRollback(async () => {
    const r = await refs();
    const w = await mkWine(r, r.grapes[0], null);
    await client.query(
      "insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order) values ($1,$2,1)",
      [w, r.grapes[1]],
    );
    await client.query(
      "insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order) values ($1,$2,2)",
      [w, r.grapes[2]],
    );
    const d = await derived(w);
    assert.equal(d.primary_grape_id, r.grapes[0]);
    assert.equal(d.secondary_grape_id, r.grapes[1]);
  });
});

test("primary_grape_id never goes null when blend rows are removed", async () => {
  await withRollback(async () => {
    const r = await refs();
    const w = await mkWine(r, r.grapes[0], r.grapes[1]);
    await client.query("delete from catalog_wine_grapes where catalog_wine_id=$1", [w]);
    const d = await derived(w);
    assert.ok(d.primary_grape_id, "primary stays set");
  });
});

test("backfill: every existing wine has a blend row for its primary grape", async () => {
  const miss = await client.query(
    "select count(*)::int n from catalog_wines w where not exists " +
      "(select 1 from catalog_wine_grapes g where g.catalog_wine_id = w.id and g.grape_id = w.primary_grape_id)",
  );
  assert.equal(miss.rows[0].n, 0);
});
