// catalog_wine_structure RPC — migration 20260829251000.
//
// Averages the ordinal SAT fields over the notes for a catalog wine the
// caller may read, mapping each enum value to its 1-based position. Proves:
// the average index is correct, max_index reflects the enum size, no-data
// dimensions are omitted, and it aggregates across authors who share their
// notes. SECURITY INVOKER since 20260927140000 (sharing defaults S9): an
// Only-me or held note leaves others' averages — scripts/sharing-defaults.test.mjs
// pins that. The authors here are throwaway profiles made inside the
// rolled-back transaction, so no real person's setting decides a result.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

// Dry run before the sharing-defaults migrations are live:
// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
// every file but M2 (20260927150000, the cellar flip) inside its own
// rolled-back transaction first.
const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));

const client = new pg.Client(pgConfig());

async function withRollback(callback) {
  await client.query("begin");
  try {
    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
    return await callback();
  } finally {
    await client.query("rollback");
  }
}

async function actAsAuthenticated(userId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

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
    assert.equal(r.rowCount, 1, `${table} needs at least one row`);
    ids[key] = r.rows[0].id;
  }
  cachedIds = ids;
  return ids;
}

// Two throwaway authors inside the current transaction (owner role): a
// real person's notes setting or deletion must never decide a result.
async function profilePair() {
  const ids = [];
  for (const name of ["Structure test A", "Structure test B"]) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'structure-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [name],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

const CATALOG_INSERT = `
  insert into catalog_wines
    (country_id, region_id, appellation_id, primary_grape_id, producer_id,
     vintage_kind, vintage_year, colour, style, wine_name, created_by)
  values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL',
          'Test ' || gen_random_uuid()::text, $6)
  returning id`;
async function insertCatalog(ids) {
  const r = await client.query(CATALOG_INSERT, [
    ids.country, ids.region, ids.appellation, ids.grape, ids.producer, ids.profile,
  ]);
  return r.rows[0].id;
}

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

test("averages ordinal SAT levels across authors; omits no-data dimensions", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const [authorA, authorB] = await profilePair();
    const wineId = await insertCatalog(ids);
    // Seeded as the pooled owner (bypasses RLS). Two authors, both sharing
    // with everyone (the default), so the aggregate sees both notes.
    // acidity MEDIUM(3)+HIGH(5) -> 4; body MEDIUM(3)+FULL(5) -> 4;
    // finish SHORT(1)+LONG(5) -> 3; sweetness left null -> omitted.
    await client.query(
      "insert into wset_notes (catalog_wine_id, author_id, acidity, body, finish) values ($1,$2,'MEDIUM','MEDIUM','SHORT')",
      [wineId, authorA],
    );
    await client.query(
      "insert into wset_notes (catalog_wine_id, author_id, acidity, body, finish) values ($1,$2,'HIGH','FULL','LONG')",
      [wineId, authorB],
    );
    await actAsAuthenticated(authorA);
    const res = await client.query(
      "select dimension, avg_index, max_index, n from catalog_wine_structure($1)",
      [wineId],
    );
    const by = Object.fromEntries(res.rows.map((r) => [r.dimension, r]));
    assert.equal(by.acidity.n, 2, "sees both authors' notes");
    assert.equal(Number(by.acidity.avg_index), 4);
    assert.equal(by.acidity.max_index, 5);
    assert.equal(Number(by.body.avg_index), 4);
    assert.equal(Number(by.finish.avg_index), 3);
    assert.equal(by.sweetness, undefined, "no-data dimensions are omitted");
    assert.equal(by.tannin, undefined);
  });
});

test("a wine with no notes returns zero rows but the call succeeds", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await actAsAuthenticated(ids.profile);
    const res = await client.query("select * from catalog_wine_structure($1)", [wineId]);
    assert.equal(res.rowCount, 0);
  });
});
