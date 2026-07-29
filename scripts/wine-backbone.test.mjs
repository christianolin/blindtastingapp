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

// ---- Task 2: find_or_create_catalog_wine ----

function snapshot(ids, over = {}) {
  return JSON.stringify({
    country_id: ids.country,
    region_id: ids.region,
    appellation_id: ids.appellation,
    primary_grape_id: ids.grape,
    producer_id: ids.producer,
    vintage_kind: "YEAR",
    vintage_year: 2019,
    ...over,
  });
}

test("find_or_create dedups on the identity tuple", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    const b = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    assert.equal(a.rows[0].id, b.rows[0].id, "same identity resolves to one wine");
  });
});

test("find_or_create makes a distinct wine for a different producer", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  const p2r = await client.query(
    "select id from producers where id <> $1 order by id limit 1",
    [ids.producer],
  );
  assert.equal(p2r.rowCount, 1, "need a second producer");
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    const b = await client.query(
      "select find_or_create_catalog_wine($1::jsonb) as id",
      [snapshot(ids, { producer_id: p2r.rows[0].id })],
    );
    assert.notEqual(a.rows[0].id, b.rows[0].id);
  });
});

test("find_or_create sets created_by to the caller", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    await client.query("reset role");
    const r = await client.query("select created_by from catalog_wines where id=$1", [a.rows[0].id]);
    assert.equal(r.rows[0].created_by, me);
  });
});

// ---- Task 3: protected wine_answers.catalog_wine_id ----

async function insertAnswerWine(ids, hostId) {
  const tasting = await client.query(
    "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
    [hostId],
  );
  const wine = await client.query(
    "insert into wines (tasting_id, position) values ($1, 1) returning id",
    [tasting.rows[0].id],
  );
  const catalogId = await insertCatalog(ids, hostId);
  await client.query(
    `insert into wine_answers
       (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
     values ($1,$2,$3,$4,$5,$6,'YEAR',2019,$7)`,
    [wine.rows[0].id, ids.country, ids.region, ids.appellation, ids.grape, ids.producer, catalogId],
  );
  return wine.rows[0].id;
}

test("the catalog link lives on wine_answers, not wines", async () => {
  const onAnswers = await client.query(
    "select 1 from information_schema.columns where table_name='wine_answers' and column_name='catalog_wine_id'",
  );
  const onWines = await client.query(
    "select 1 from information_schema.columns where table_name='wines' and column_name='catalog_wine_id'",
  );
  assert.equal(onAnswers.rowCount, 1, "wine_answers has catalog_wine_id");
  assert.equal(onWines.rowCount, 0, "wines.catalog_wine_id was dropped");
});

test("an answer can hold a catalog id; a bad id fails the FK", async () => {
  const ids = await referenceIds();
  const [host] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    const wineId = await insertAnswerWine(ids, host);
    const upd = await client.query(
      "update wine_answers set catalog_wine_id=$1 where wine_id=$2 returning catalog_wine_id",
      [catalogId, wineId],
    );
    assert.equal(upd.rows[0].catalog_wine_id, catalogId);
    await assert.rejects(
      client.query("update wine_answers set catalog_wine_id=gen_random_uuid() where wine_id=$1", [wineId]),
      (e) => e.code === "23503",
    );
  });
});

test("an outsider cannot read an unrevealed answer (so the link is hidden)", async () => {
  const ids = await referenceIds();
  const [host, outsider] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    const wineId = await insertAnswerWine(ids, host);
    await client.query("update wine_answers set catalog_wine_id=$1 where wine_id=$2", [catalogId, wineId]);
    await actAs(outsider);
    const r = await client.query("select catalog_wine_id from wine_answers where wine_id=$1", [wineId]);
    assert.equal(r.rowCount, 0, "unrevealed answer and its catalog link are invisible to an outsider");
  });
});

// ---- Task 5: backfill + enforce NOT NULL ----

test("wine_answers.catalog_wine_id is NOT NULL after backfill", async () => {
  const r = await client.query(
    "select is_nullable from information_schema.columns where table_name='wine_answers' and column_name='catalog_wine_id'",
  );
  assert.equal(r.rows[0].is_nullable, "NO");
});

test("every wine_answers row is linked to a catalog wine", async () => {
  const r = await client.query(
    "select count(*)::int as n from wine_answers where catalog_wine_id is null",
  );
  assert.equal(r.rows[0].n, 0);
});

test("a new answer without a catalog link is rejected", async () => {
  const ids = await referenceIds();
  const [host] = await profilePair();
  await withRollback(async () => {
    const tasting = await client.query(
      "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
      [host],
    );
    const wine = await client.query(
      "insert into wines (tasting_id, position) values ($1, 1) returning id",
      [tasting.rows[0].id],
    );
    await assert.rejects(
      client.query(
        `insert into wine_answers
           (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, vintage_year)
         values ($1,$2,$3,$4,$5,'YEAR',2019)`,
        [wine.rows[0].id, ids.country, ids.region, ids.grape, ids.producer],
      ),
      (e) => e.code === "23502",
    );
  });
});

// ---- Task 6: wset_notes context ----

test("wset_notes context defaults to OPEN and accepts BLIND + tasting_wine_id", async () => {
  const ids = await referenceIds();
  const [me, host] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, me);
    const openNote = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2) returning context_kind, tasting_wine_id",
      [catalogId, me],
    );
    assert.equal(openNote.rows[0].context_kind, "OPEN");
    assert.equal(openNote.rows[0].tasting_wine_id, null);

    const wineId = await insertAnswerWine(ids, host);
    const blindNote = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id, context_kind, tasting_wine_id) values ($1,$2,'BLIND',$3) returning context_kind, tasting_wine_id",
      [catalogId, me, wineId],
    );
    assert.equal(blindNote.rows[0].context_kind, "BLIND");
    assert.equal(blindNote.rows[0].tasting_wine_id, wineId);
  });
});
