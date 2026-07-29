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

// (Removed: the blind→catalog link moved from wines.catalog_wine_id to the
// protected wine_answers.catalog_wine_id — see scripts/wine-backbone.test.mjs.)

test("catalog_wines has read + insert + curator-update policies", async () => {
  const policies = await client.query(
    `select policyname, cmd from pg_policies
     where schemaname = 'public' and tablename = 'catalog_wines'
     order by policyname`,
  );
  assert.deepEqual(
    policies.rows.map((r) => [r.policyname, r.cmd]),
    [
      ["catalog insert", "INSERT"],
      ["catalog read", "SELECT"],
      ["catalog update", "UPDATE"],
    ],
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

test("aroma lexicon holds exactly 143 terms", async () => {
  const result = await client.query(
    "select count(*)::int as n from wset_aroma_terms",
  );
  assert.equal(result.rows[0].n, 143);
});

test("every term carries a legacy family from the WSET five", async () => {
  const result = await client.query(
    "select distinct family::text as family from wset_aroma_terms order by family",
  );
  // family is legacy (the picker now groups by origin -> cluster); assert the
  // set is intact rather than brittle per-family counts.
  assert.deepEqual(
    result.rows.map((r) => r.family),
    ["FLORAL", "FRUIT", "OTHER", "SPICE", "VEGETAL_OAK"],
  );
});

test("per-origin term counts match the P/S/T mapping", async () => {
  const result = await client.query(
    "select origin::text, count(*)::int as n from wset_aroma_terms group by origin",
  );
  const counts = Object.fromEntries(result.rows.map((r) => [r.origin, r.n]));
  assert.deepEqual(counts, {
    PRIMARY: 68,
    SECONDARY: 25,
    TERTIARY: 50,
  });
});

test("terms span 18 distinct groups", async () => {
  const result = await client.query(
    "select count(distinct group_name)::int as n from wset_aroma_terms",
  );
  assert.equal(result.rows[0].n, 18);
});

test("duplicate (origin, group, term) is rejected by the natural key", async () => {
  await withRollback(async () => {
    await client.query("set local role authenticated");
    // 'lemon' already exists as (PRIMARY, 'Citrus fruit'); a term may now repeat
    // across clusters, but not within one.
    await assert.rejects(
      client.query(
        `insert into wset_aroma_terms (family, origin, group_name, term, sort_order)
         values ('FRUIT', 'PRIMARY', 'Citrus fruit', 'lemon', 200)`,
      ),
      (error) => {
        assert.equal(error.code, "23505");
        assert.match(error.message, /wset_aroma_terms_natural_key/);
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

test("save_wset_note inserts a note with its aromas for the caller", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    const terms = await client.query(
      "select id, term from wset_aroma_terms where term in ('lemon', 'rose')",
    );
    const lemonId = terms.rows.find((r) => r.term === "lemon").id;
    await actAsAuthenticated(ids.profile);
    const saved = await client.query(
      "select save_wset_note($1::jsonb, $2::jsonb) as id",
      [
        JSON.stringify({ catalog_wine_id: wineId, quality_score: 90, clarity: "CLEAR" }),
        JSON.stringify([{ term_id: lemonId, sensed_on_nose: true }]),
      ],
    );
    const noteId = saved.rows[0].id;
    assert.ok(noteId, "returns the new note id");
    const note = await client.query(
      "select author_id, quality_score, clarity from wset_notes where id = $1",
      [noteId],
    );
    assert.equal(note.rows[0].author_id, ids.profile, "author_id set from auth.uid()");
    assert.equal(note.rows[0].quality_score, 90);
    assert.equal(note.rows[0].clarity, "CLEAR");
    const aromas = await client.query(
      "select term_id, sensed_on_nose from wset_note_aromas where note_id = $1",
      [noteId],
    );
    assert.equal(aromas.rowCount, 1);
    assert.equal(aromas.rows[0].term_id, lemonId);
    assert.equal(aromas.rows[0].sensed_on_nose, true);
  });
});

test("save_wset_note updates scalars and REPLACES the aroma set", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    const terms = await client.query(
      "select id, term from wset_aroma_terms where term in ('lemon', 'rose')",
    );
    const lemonId = terms.rows.find((r) => r.term === "lemon").id;
    const roseId = terms.rows.find((r) => r.term === "rose").id;
    await actAsAuthenticated(ids.profile);
    const first = await client.query(
      "select save_wset_note($1::jsonb, $2::jsonb) as id",
      [
        JSON.stringify({ catalog_wine_id: wineId, quality_score: 90 }),
        JSON.stringify([{ term_id: lemonId, sensed_on_nose: true }]),
      ],
    );
    const noteId = first.rows[0].id;
    await client.query("select save_wset_note($1::jsonb, $2::jsonb)", [
      JSON.stringify({ id: noteId, catalog_wine_id: wineId, quality_score: 88 }),
      JSON.stringify([{ term_id: roseId, sensed_on_palate: true }]),
    ]);
    const note = await client.query(
      "select quality_score from wset_notes where id = $1",
      [noteId],
    );
    assert.equal(note.rows[0].quality_score, 88, "same note updated, not duplicated");
    const aromas = await client.query(
      "select term_id, sensed_on_palate from wset_note_aromas where note_id = $1",
      [noteId],
    );
    assert.equal(aromas.rowCount, 1, "old aroma removed, not merged");
    assert.equal(aromas.rows[0].term_id, roseId);
    assert.equal(aromas.rows[0].sensed_on_palate, true);
  });
});

test("save_wset_note persists the tannin_nature array", async () => {
  const ids = await referenceIds();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await actAsAuthenticated(ids.profile);
    const saved = await client.query(
      "select save_wset_note($1::jsonb, '[]'::jsonb) as id",
      [JSON.stringify({ catalog_wine_id: wineId, tannin_nature: ["RIPE", "FINE_GRAINED"] })],
    );
    const note = await client.query(
      "select tannin_nature::text[] as tannin_nature from wset_notes where id = $1",
      [saved.rows[0].id],
    );
    assert.deepEqual(note.rows[0].tannin_nature, ["RIPE", "FINE_GRAINED"]);
  });
});

test("save_wset_note cannot hijack another author's note id", async () => {
  const ids = await referenceIds();
  const [authorA, authorB] = await profilePair();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await actAsAuthenticated(authorA);
    const saved = await client.query(
      "select save_wset_note($1::jsonb, '[]'::jsonb) as id",
      [JSON.stringify({ catalog_wine_id: wineId, quality_score: 90 })],
    );
    const noteId = saved.rows[0].id;
    await client.query("reset role");
    await actAsAuthenticated(authorB);
    await assert.rejects(
      () =>
        client.query("select save_wset_note($1::jsonb, '[]'::jsonb)", [
          JSON.stringify({ id: noteId, catalog_wine_id: wineId, quality_score: 55 }),
        ]),
      // B falls through to the insert branch and collides on A's primary key:
      // pin the unique_violation SQLSTATE so any rejection can't fake a pass.
      (err) => err.code === "23505",
    );
  });
});

test("catalog_wine_ratings averages scored notes across authors and re-tastings", async () => {
  const ids = await referenceIds();
  const [authorA, authorB] = await profilePair();
  await withRollback(async () => {
    const wineId = await insertCatalog(ids);
    await actAsAuthenticated(authorA);
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ catalog_wine_id: wineId, quality_score: 90 }),
    ]);
    await client.query("reset role");
    await actAsAuthenticated(authorB);
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ catalog_wine_id: wineId, quality_score: 80 }),
    ]);
    await client.query("reset role");
    await actAsAuthenticated(authorA);
    // A scoreless note must not move the average...
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ catalog_wine_id: wineId }),
    ]);
    // ...and a re-tasting is its own data point (all history counts).
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ catalog_wine_id: wineId, quality_score: 70 }),
    ]);
    await client.query("reset role");
    const view = await client.query(
      "select avg_score, note_count from catalog_wine_ratings where catalog_wine_id = $1",
      [wineId],
    );
    assert.equal(view.rowCount, 1);
    assert.equal(Number(view.rows[0].avg_score), 80, "(90 + 80 + 70) / 3");
    assert.equal(view.rows[0].note_count, 3, "scoreless note excluded");
  });
});
