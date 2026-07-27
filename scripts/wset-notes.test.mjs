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

// ---- Task 2: wset_notes + wset_note_aromas + hue trigger ----

// Two distinct profiles for cross-author RLS probes. referenceIds().profile
// is the first by id, so pair[1] is a different author.
let cachedProfilePair = null;
async function profilePair() {
  if (cachedProfilePair) return cachedProfilePair;
  const result = await client.query("select id from profiles order by id limit 2");
  assert.equal(result.rowCount, 2, "need at least two profiles");
  cachedProfilePair = [result.rows[0].id, result.rows[1].id];
  return cachedProfilePair;
}

async function insertCatalog(ids) {
  const result = await client.query(`${CATALOG_INSERT} returning id`, catalogParams(ids));
  return result.rows[0].id;
}

// RLS write probes need the authenticated role AND a JWT sub so auth.uid()
// resolves (set_config pattern from scripts/progressive-reveal.test.mjs).
// Both are transaction-local, so withRollback undoes them.
async function actAsAuthenticated(userId) {
  await client.query(
    "select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: userId })],
  );
  await client.query("set local role authenticated");
}

test("authenticated taster can insert their own note; defaults apply", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    await actAsAuthenticated(ids.profile);
    const note = await client.query(
      `insert into wset_notes (catalog_wine_id, author_id)
       values ($1, $2)
       returning taster_notes, observations::text[] as observations,
                 faults::text[] as faults, tasted_on, quality_score`,
      [catalogWineId, ids.profile],
    );
    assert.equal(note.rowCount, 1);
    assert.equal(note.rows[0].taster_notes, "");
    assert.deepEqual(note.rows[0].observations, []);
    assert.deepEqual(note.rows[0].faults, []);
    assert.ok(note.rows[0].tasted_on instanceof Date);
    assert.equal(note.rows[0].quality_score, null);
  });
});

test("insert with another profile's author_id is rejected by RLS", async () => {
  const ids = await referenceIds();
  const [selfId, otherId] = await profilePair();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    await actAsAuthenticated(selfId);
    await assert.rejects(
      client.query(
        "insert into wset_notes (catalog_wine_id, author_id) values ($1, $2)",
        [catalogWineId, otherId],
      ),
      (error) => {
        assert.equal(error.code, "42501");
        assert.match(error.message, /row-level security/);
        return true;
      },
    );
  });
});

test("another author's note is visible under authenticated (public read)", async () => {
  const ids = await referenceIds();
  const [selfId, otherId] = await profilePair();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    // Seeded as the pooled owner role, which bypasses RLS.
    const note = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1, $2) returning id",
      [catalogWineId, otherId],
    );
    await actAsAuthenticated(selfId);
    const visible = await client.query(
      "select author_id from wset_notes where id = $1",
      [note.rows[0].id],
    );
    assert.equal(visible.rowCount, 1);
    assert.equal(visible.rows[0].author_id, otherId);
  });
});

test("updating another author's note affects 0 rows, leaves it unchanged", async () => {
  const ids = await referenceIds();
  const [selfId, otherId] = await profilePair();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    const note = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1, $2) returning id",
      [catalogWineId, otherId],
    );
    const noteId = note.rows[0].id;
    await actAsAuthenticated(selfId);
    // Default-deny RLS: the update policy's using() hides the row, so the
    // statement matches nothing rather than erroring (same shape as the
    // catalog immutability test above).
    const updated = await client.query(
      "update wset_notes set taster_notes = 'not mine' where id = $1",
      [noteId],
    );
    assert.equal(updated.rowCount, 0);
    await client.query("reset role");
    const after = await client.query(
      "select taster_notes from wset_notes where id = $1",
      [noteId],
    );
    assert.equal(after.rows[0].taster_notes, "");
  });
});

test("quality_score outside 50..100 is rejected by the check constraint", async () => {
  const ids = await referenceIds();
  // One rollback block per bad value: the failed insert aborts the
  // transaction, so nothing can follow it inside the same block.
  for (const badScore of [49, 101]) {
    await withRollback(async () => {
      const catalogWineId = await insertCatalog(ids);
      await assert.rejects(
        client.query(
          `insert into wset_notes (catalog_wine_id, author_id, quality_score)
           values ($1, $2, $3)`,
          [catalogWineId, ids.profile, badScore],
        ),
        (error) => {
          assert.equal(error.code, "23514");
          assert.match(error.message, /wset_notes_quality_score_range/);
          return true;
        },
      );
    });
  }
});

test("hue trigger: RUBY passes on a RED wine, PINK raises", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids); // CATALOG_INSERT is a RED wine
    const ok = await client.query(
      `insert into wset_notes (catalog_wine_id, author_id, colour_hue)
       values ($1, $2, 'RUBY') returning colour_hue`,
      [catalogWineId, ids.profile],
    );
    assert.equal(ok.rows[0].colour_hue, "RUBY");
    await assert.rejects(
      client.query(
        `insert into wset_notes (catalog_wine_id, author_id, colour_hue)
         values ($1, $2, 'PINK')`,
        [catalogWineId, ids.profile],
      ),
      (error) => {
        assert.equal(error.code, "23514");
        assert.match(error.message, /colour_hue PINK not valid for RED wine/);
        return true;
      },
    );
  });
});

test("note-aroma with neither nose nor palate sensed is rejected", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    const note = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1, $2) returning id",
      [catalogWineId, ids.profile],
    );
    // term_id has no FK until the terms table lands in 20260829195000, so a
    // random uuid is enough to probe the check constraint.
    await assert.rejects(
      client.query(
        "insert into wset_note_aromas (note_id, term_id) values ($1, gen_random_uuid())",
        [note.rows[0].id],
      ),
      (error) => {
        assert.equal(error.code, "23514");
        assert.match(error.message, /wset_note_aromas_sensed_somewhere/);
        return true;
      },
    );
  });
});

// ---- Task 3: wset_aroma_terms lexicon (89-term seed) ----

test("aroma lexicon holds exactly 89 terms", async () => {
  const result = await client.query(
    "select count(*)::int as n from wset_aroma_terms",
  );
  assert.equal(result.rows[0].n, 89);
});

test("per-family term counts match the WSET sheet", async () => {
  const result = await client.query(
    "select family::text, count(*)::int as n from wset_aroma_terms group by family",
  );
  const counts = Object.fromEntries(result.rows.map((r) => [r.family, r.n]));
  assert.deepEqual(counts, {
    FRUIT: 28,
    FLORAL: 5,
    SPICE: 9,
    VEGETAL_OAK: 23,
    OTHER: 24,
  });
});

test("terms span 21 distinct groups", async () => {
  const result = await client.query(
    "select count(distinct group_name)::int as n from wset_aroma_terms",
  );
  assert.equal(result.rows[0].n, 21);
});

test("duplicate term is rejected by the unique constraint", async () => {
  await withRollback(async () => {
    await client.query("set local role authenticated");
    await assert.rejects(
      client.query(
        `insert into wset_aroma_terms (family, group_name, term, sort_order)
         values ('FRUIT', 'Citrus', 'lemon', 90)`,
      ),
      (error) => {
        assert.equal(error.code, "23505");
        assert.match(error.message, /wset_aroma_terms_term_key/);
        return true;
      },
    );
  });
});

test("note-aroma row inserts with a real term id, sensed on the nose", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const catalogWineId = await insertCatalog(ids);
    const note = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1, $2) returning id",
      [catalogWineId, ids.profile],
    );
    const term = await client.query(
      "select id from wset_aroma_terms where term = 'lemon'",
    );
    assert.equal(term.rowCount, 1);
    const inserted = await client.query(
      `insert into wset_note_aromas (note_id, term_id, sensed_on_nose)
       values ($1, $2, true) returning sensed_on_nose, sensed_on_palate`,
      [note.rows[0].id, term.rows[0].id],
    );
    assert.equal(inserted.rows[0].sensed_on_nose, true);
    assert.equal(inserted.rows[0].sensed_on_palate, false);
  });
});
