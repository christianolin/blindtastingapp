// WSET tasting notes (cellar) DB suite — Task 1: the catalog_wines
// migration. Harness shape copied from scripts/wine-place-context.test.mjs:
// pg Client on pgConfig, before/after hooks, withRollback for negative RLS
// probes (the pooled role owns the tables, so RLS only bites after
// `set local role authenticated` inside a rolled-back transaction).
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());

async function withRollback(callback) {
  await client.query("begin");
  try {
    return await callback();
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

// One existing id per reference table (live reference rows, not pinned
// uuids); created_by needs a real profile. Cached across tests.
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
    const result = await client.query(`select id from ${table} order by id limit 1`);
    assert.equal(result.rowCount, 1, `${table} should have at least one row`);
    ids[key] = result.rows[0].id;
  }
  cachedIds = ids;
  return ids;
}

const CATALOG_INSERT = `
  insert into catalog_wines
    (country_id, region_id, appellation_id, primary_grape_id, producer_id,
     vintage_kind, vintage_year, colour, style, created_by)
  values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL', $6)`;

function catalogParams(ids) {
  return [ids.country, ids.region, ids.appellation, ids.grape, ids.producer, ids.profile];
}

test("catalog insert succeeds; bottle_size_ml defaults to 750", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const inserted = await client.query(
      `${CATALOG_INSERT}
       returning bottle_size_ml, cuvee, secondary_grape_id, type_designation_id, vintage_kind`,
      catalogParams(ids),
    );
    const row = inserted.rows[0];
    assert.equal(row.bottle_size_ml, 750);
    assert.equal(row.cuvee, null);
    assert.equal(row.secondary_grape_id, null);
    assert.equal(row.type_designation_id, null);
    assert.equal(row.vintage_kind, "YEAR");
  });
});

test("catalog rows are immutable for authenticated (no update policy)", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const inserted = await client.query(
      `${CATALOG_INSERT} returning id`,
      catalogParams(ids),
    );
    const insertedId = inserted.rows[0].id;
    await client.query("set local role authenticated");
    // Default-deny RLS: with no update policy, the update sees zero rows
    // (authenticated holds the table-level UPDATE grant, so no error).
    const updated = await client.query("update catalog_wines set cuvee = 'x'");
    assert.equal(updated.rowCount, 0);
    await client.query("reset role");
    const rows = await client.query(
      "select cuvee from catalog_wines where id = $1",
      [insertedId],
    );
    assert.equal(rows.rows[0].cuvee, null);
  });
});

test("bad vintage shape is rejected by the check constraint", async () => {
  const ids = await referenceIds();
  await assert.rejects(
    client.query(
      `insert into catalog_wines
         (country_id, region_id, appellation_id, primary_grape_id, producer_id,
          vintage_kind, vintage_year, colour, style, created_by)
       values ($1, $2, $3, $4, $5, 'YEAR', null, 'RED', 'STILL', $6)`,
      catalogParams(ids),
    ),
    (error) => {
      assert.equal(error.code, "23514");
      assert.match(error.message, /catalog_wines_vintage_shape/);
      return true;
    },
  );
});

test("wines.catalog_wine_id accepts null and a real catalog id", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const catalog = await client.query(
      `${CATALOG_INSERT} returning id`,
      catalogParams(ids),
    );
    const catalogWineId = catalog.rows[0].id;
    const tasting = await client.query(
      `insert into tastings (name, host_id, timing_mode, wine_source)
       values ('wset-notes test', $1, 'LIVE', 'HOST_PROVIDES') returning id`,
      [ids.profile],
    );
    const wine = await client.query(
      `insert into wines (tasting_id, position)
       values ($1, 1) returning id, catalog_wine_id`,
      [tasting.rows[0].id],
    );
    assert.equal(wine.rows[0].catalog_wine_id, null);
    const linked = await client.query(
      "update wines set catalog_wine_id = $1 where id = $2 returning catalog_wine_id",
      [catalogWineId, wine.rows[0].id],
    );
    assert.equal(linked.rows[0].catalog_wine_id, catalogWineId);
  });
});

test("catalog_wines has exactly the read + insert policies", async () => {
  const policies = await client.query(
    `select policyname, cmd from pg_policies
     where schemaname = 'public' and tablename = 'catalog_wines'
     order by policyname`,
  );
  assert.deepEqual(
    policies.rows.map((r) => [r.policyname, r.cmd]),
    [["catalog insert", "INSERT"], ["catalog read", "SELECT"]],
  );
});
