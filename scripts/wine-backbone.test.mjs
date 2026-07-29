// Wine backbone DB suite. Harness mirrors scripts/wset-notes.test.mjs: a pooled
// pg client (bypasses RLS as owner), withRollback for negative RLS probes, and
// actAs() to become `authenticated` with a JWT sub so auth.uid() resolves.
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
  ]) {
    const r = await client.query(`select id from ${table} order by id limit 1`);
    assert.equal(r.rowCount, 1, `${table} needs a row`);
    ids[key] = r.rows[0].id;
  }
  cachedIds = ids;
  return ids;
}

async function profilePair() {
  const r = await client.query("select id from profiles order by id limit 2");
  assert.equal(r.rowCount, 2, "need two profiles");
  return [r.rows[0].id, r.rows[1].id];
}

async function actAs(userId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

async function insertCatalog(ids, createdBy, opts = {}) {
  const colour = opts.colour === undefined ? "RED" : opts.colour;
  const style = opts.style === undefined ? "STILL" : opts.style;
  const producer = opts.producer === undefined ? ids.producer : opts.producer;
  const r = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year, colour, style, created_by)
     values ($1,$2,$3,$4,$5,'YEAR',2019,$6,$7,$8) returning id`,
    [ids.country, ids.region, ids.appellation, ids.grape, producer, colour, style, createdBy],
  );
  return r.rows[0].id;
}

// ---- Task 1: catalog curation ----

test("colour and style accept null (a blind-born catalog wine)", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me, { colour: null, style: null });
    const r = await client.query("select colour, style from catalog_wines where id=$1", [id]);
    assert.equal(r.rows[0].colour, null);
    assert.equal(r.rows[0].style, null);
  });
});

test("creator can update their own catalog wine", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(me);
    const upd = await client.query("update catalog_wines set cuvee='mine' where id=$1", [id]);
    assert.equal(upd.rowCount, 1);
  });
});

test("non-creator non-curator update affects 0 rows", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(other);
    const upd = await client.query("update catalog_wines set cuvee='hax' where id=$1", [id]);
    assert.equal(upd.rowCount, 0);
  });
});

test("a curator can update another author's catalog wine", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await client.query("update profiles set is_curator=true where id=$1", [other]);
    await actAs(other);
    const upd = await client.query("update catalog_wines set cuvee='curated' where id=$1", [id]);
    assert.equal(upd.rowCount, 1);
  });
});

test("an update writes exactly one catalog_wine_edits audit row", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(me);
    await client.query("update catalog_wines set cuvee='audited' where id=$1", [id]);
    await client.query("reset role");
    const r = await client.query(
      "select editor_id, after->>'cuvee' as cuvee from catalog_wine_edits where catalog_wine_id=$1",
      [id],
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].editor_id, me);
    assert.equal(r.rows[0].cuvee, "audited");
  });
});
