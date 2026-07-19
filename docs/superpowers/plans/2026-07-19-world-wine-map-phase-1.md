# World Wine Map Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the canonical world-wine-place foundation, provenance and reviewed-boundary storage, reference-link review state, and a lossless migration of the existing 14-node France/Bordeaux catalog without changing the current map experience.

**Architecture:** New canonical tables are added beside `wine_map_nodes`; the current `/knowledge/map` continues reading the old table until the Phase 2 tile UI passes parity. PostGIS stores reviewed display geometries for curation and future offline tile builds, while existing scoring reference UUIDs and scoring behavior remain unchanged.

**Tech Stack:** Supabase Postgres 17, PostGIS 3.3, SQL migrations, Node.js ESM, `pg`, Node's built-in test runner, hand-written TypeScript Supabase types.

**Spec:** `docs/superpowers/specs/2026-07-19-world-wine-map-architecture-design.md`

## Global Constraints

- Implement Phase 1 only. Do not add PMTiles, tile hosting, a map API, a feature flag, or change the current map components/query.
- Keep `wine_map_nodes` and all 14 current rows unchanged and active throughout Phase 1.
- Preserve every existing map-node UUID when copying into `wine_places`.
- Preserve all `countries`, `regions`, `appellations`, `wine_answers`, and `guesses` IDs and scoring behavior.
- Every reference row receives a non-null map-review status; only the exact current France, Bordeaux, and 12 mapped Bordeaux appellation rows become `VERIFIED` in this phase.
- Never establish canonical links through fuzzy or accent-folded matching. Phase 1 links use exact country/region/name scopes and abort if expected counts differ.
- Install PostGIS in the `extensions` schema. PostGIS is for validation/curation and later offline export, not request-time tile generation.
- Classify the 13 parcel-derived Bordeaux geometries as `GENERALIZED_FROM_OFFICIAL_SOURCE`, not as legal `OFFICIAL` boundaries. Classify the France approximation as `MANUAL`.
- Do not commit a database password. Migration/test scripts read `DB_PASSWORD` from the process environment and use the explicit Supabase pooler fields.
- Update `src/lib/supabase/database.types.ts` in the same phase as the migrations; every table keeps `Relationships: []` and the schema keeps `Views`.
- Test both migrations in rollback-only transactions and review the committed
  files before applying them live. Once a migration version is recorded, never
  edit that file; use a new timestamped corrective migration.
- Work directly on `master`, commit verified tasks separately, and push to `origin/master` only after final review and atomic live application.
- Required final verification: database integration tests, existing boundary tests, `npx tsc --noEmit`, targeted ESLint, `npm run build`, and `git diff --check`.

---

## File Structure

- `supabase/migrations/20260727090000_world_wine_map_foundation.sql`
  - Enables PostGIS; defines enums, canonical/source/snapshot/release tables, hierarchy safeguards, RLS, indexes, and reference review columns/grants.
- `supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql`
  - Copies the 14 current map nodes/articles/boundaries with identical IDs and creates the exact 14 scoring-reference links.
- `scripts/world-wine-map-foundation.test.mjs`
  - Rollback-only pre-apply integration contract plus a self-cleaning post-apply
    two-connection hierarchy test.
- `src/lib/supabase/database.types.ts`
  - Hand-written Row/Insert/Update types for the new schema and expanded reference rows.
- `src/lib/supabase/world-wine-map-database.type-test.ts`
  - Compile-time assertions that lock the public TypeScript contract.
- `CLAUDE.md`
  - Records the canonical foundation, transition rule, review statuses, and provenance semantics.

---

### Task 1: Canonical Foundation Schema And Security

**Files:**
- Create: `scripts/world-wine-map-foundation.test.mjs`
- Create: `supabase/migrations/20260727090000_world_wine_map_foundation.sql`

**Interfaces:**
- Produces Postgres enums: `wine_place_kind`, `wine_place_publication_status`, `wine_place_relationship_type`, `wine_article_status`, `wine_reference_map_status`, `wine_boundary_method`, `wine_boundary_quality_status`, and `wine_map_release_status`.
- Produces tables: `wine_places`, `wine_place_aliases`, `wine_place_relationships`, `wine_place_articles`, `wine_boundary_sources`, `wine_boundary_source_snapshots`, `wine_place_boundaries`, and `wine_map_releases`.
- Adds the same seven mapping fields to `countries`, `regions`, and `appellations`: `wine_place_id`, `map_status`, `map_match_method`, `map_match_confidence`, `map_reviewed_by`, `map_reviewed_at`, and `map_review_note`.
- Leaves all new canonical tables empty; Task 2 supplies data.

- [ ] **Step 1: Write the failing schema integration tests**

Create `scripts/world-wine-map-foundation.test.mjs`. Use the existing explicit pooler connection pattern and never embed a password:

```js
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, delimiter } from "node:path";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const migrationPaths = (process.env.WORLD_WINE_MAP_MIGRATIONS ?? "")
  .split(delimiter)
  .filter(Boolean);
const isMigrationDryRun = migrationPaths.length > 0;
const referenceNameMode =
  process.env.WORLD_WINE_MAP_REFERENCE_NAMES ?? "CURRENT";
assert.ok(
  ["CURRENT", "REPLAY"].includes(referenceNameMode),
  "WORLD_WINE_MAP_REFERENCE_NAMES must be CURRENT or REPLAY",
);
assert.ok(
  isMigrationDryRun || referenceNameMode === "CURRENT",
  "REPLAY mode is only valid inside a rollback-only migration run",
);

const connectionConfig = {
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};
const client = new pg.Client(connectionConfig);

const REPLAY_APPELLATION_NAMES = [
  ["Barsac AOP", "Barsac"],
  ["Graves AOP", "Graves"],
  ["Haut-Médoc AOP", "Haut-Médoc"],
  ["Margaux AOP", "Margaux"],
  ["Médoc AOP", "Médoc"],
  ["Pauillac AOP", "Pauillac"],
  ["Pessac-Léognan AOP", "Pessac-Léognan"],
  ["Pomerol AOP", "Pomerol"],
  ["Saint-Estèphe AOP", "Saint-Estèphe"],
  ["Saint-Émilion AOP", "Saint-Émilion"],
  ["Saint-Julien AOP", "Saint-Julien"],
  ["Sauternes AOP", "Sauternes"],
];
const REFERENCE_ID_TABLES = [
  ["countries", "id"],
  ["regions", "id"],
  ["appellations", "id"],
  ["wine_answers", "wine_id"],
  ["guesses", "id"],
];
const FOUNDATION_TABLES = [
  "wine_boundary_source_snapshots",
  "wine_boundary_sources",
  "wine_map_releases",
  "wine_place_aliases",
  "wine_place_articles",
  "wine_place_boundaries",
  "wine_place_relationships",
  "wine_places",
];
let safetyBaseline;
let foundationBaseline;
let savepointSequence = 0;

async function readSafetySnapshot() {
  const references = {};
  for (const [table, key] of REFERENCE_ID_TABLES) {
    const result = await client.query(
      `select count(*)::int count,
              md5(coalesce(
                string_agg(${key}::text, ',' order by ${key}),
                ''
              )) digest
         from ${table}`,
    );
    references[table] = result.rows[0];
  }
  const scoringFunctions = await client.query(
    `select count(*)::int count,
            md5(coalesce(string_agg(
              pg_get_functiondef(p.oid), E'\n'
              order by p.proname, pg_get_function_identity_arguments(p.oid)
            ), '')) digest
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any(array[
          'has_scored_guess', 'reveal_wine', 'score_own_guess'
        ])`,
  );
  return { references, scoringFunctions: scoringFunctions.rows[0] };
}

async function readFoundationFootprint() {
  const result = await client.query(
    `select
       coalesce((
         select n.nspname
         from pg_extension e
         join pg_namespace n on n.oid = e.extnamespace
         where e.extname = 'postgis'
       ), '') postgis_schema,
       (select count(*)::int
          from information_schema.tables
         where table_schema = 'public'
           and table_name = any($1::text[])) foundation_tables`,
    [FOUNDATION_TABLES],
  );
  return result.rows[0];
}

async function useReplayAppellationNames() {
  for (const [currentName, replayName] of REPLAY_APPELLATION_NAMES) {
    const result = await client.query(
      `update appellations a
          set name = $2
         from regions r
         join countries c on c.id = r.country_id
        where a.region_id = r.id
          and c.name = 'France'
          and r.name = 'Bordeaux'
          and a.name = $1`,
      [currentName, replayName],
    );
    assert.equal(result.rowCount, 1, currentName);
  }
}

async function applyMigrationInCurrentTransaction(migrationPath) {
  const match = /^(\d+)_([^/\\]+)\.sql$/.exec(basename(migrationPath));
  assert.ok(match, `Invalid migration filename: ${migrationPath}`);
  const [, version, name] = match;
  const existing = await client.query(
    `select name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  assert.equal(existing.rowCount, 0, `Migration version ${version} already exists`);
  const sql = await readFile(migrationPath, "utf8");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations
       (version, name, statements)
     values ($1, $2, $3)`,
    [version, name, [sql]],
  );
}

async function withRollback(callback) {
  if (!isMigrationDryRun) {
    await client.query("begin");
    try {
      return await callback();
    } finally {
      await client.query("rollback");
    }
  }

  const savepoint = `world_wine_map_test_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    return await callback();
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

async function waitForAdvisoryLockWait(pid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `select exists (
         select 1 from pg_locks
          where pid = $1 and locktype = 'advisory' and not granted
       ) waiting`,
      [pid],
    );
    if (result.rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Backend ${pid} did not wait for the hierarchy advisory lock`);
}

before(async () => {
  await client.connect();
  safetyBaseline = await readSafetySnapshot();
  foundationBaseline = await readFoundationFootprint();
  if (!isMigrationDryRun) return;

  await client.query("begin");
  for (const migrationPath of migrationPaths) {
    if (
      referenceNameMode === "REPLAY" &&
      basename(migrationPath).includes("world_wine_map_bordeaux_seed")
    ) {
      await useReplayAppellationNames();
    }
    await applyMigrationInCurrentTransaction(migrationPath);
  }
});

after(async () => {
  try {
    if (isMigrationDryRun) {
      await client.query("rollback");
      assert.deepEqual(await readFoundationFootprint(), foundationBaseline);
    }
  } finally {
    await client.end();
  }
});

test("world wine map foundation schema is installed", async () => {
  const extension = await client.query(
    `select n.nspname as schema
       from pg_extension e
       join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'postgis'`,
  );
  assert.deepEqual(extension.rows, [{ schema: "extensions" }]);

  const tables = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name`,
    [FOUNDATION_TABLES],
  );
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    FOUNDATION_TABLES,
  );

  const referenceColumns = await client.query(
    `select table_name,
            array_agg(column_name::text order by column_name::text)::text[] columns
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any(array['countries', 'regions', 'appellations'])
        and column_name = any($1::text[])
      group by table_name
      order by table_name`,
    [[
      "map_match_confidence",
      "map_match_method",
      "map_review_note",
      "map_reviewed_at",
      "map_reviewed_by",
      "map_status",
      "wine_place_id",
    ]],
  );
  const expectedColumns = [
    "map_match_confidence",
    "map_match_method",
    "map_review_note",
    "map_reviewed_at",
    "map_reviewed_by",
    "map_status",
    "wine_place_id",
  ];
  assert.equal(referenceColumns.rows.length, 3);
  for (const row of referenceColumns.rows) {
    assert.deepEqual(row.columns, expectedColumns, row.table_name);
  }

  const rls = await client.query(
    `select c.relname table_name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any($1::text[])
        and c.relrowsecurity
      order by c.relname`,
    [FOUNDATION_TABLES],
  );
  assert.deepEqual(
    rls.rows.map(({ table_name }) => table_name),
    FOUNDATION_TABLES,
  );

  const policies = await client.query(
    `select tablename from pg_policies
      where schemaname = 'public'
        and tablename = any($1::text[])
      group by tablename
      order by tablename`,
    [FOUNDATION_TABLES],
  );
  assert.deepEqual(
    policies.rows.map(({ tablename }) => tablename),
    FOUNDATION_TABLES,
  );
});

test("authenticated reference inserts cannot set map-review columns", async () => {
  for (const [table, allowed] of [
    ["countries", ["name"]],
    ["regions", ["country_id", "name"]],
    ["appellations", ["name", "region_id"]],
  ]) {
    for (const column of allowed) {
      const result = await client.query(
        `select has_column_privilege('authenticated', $1, $2, 'INSERT') allowed`,
        [`public.${table}`, column],
      );
      assert.equal(result.rows[0].allowed, true, `${table}.${column}`);
    }
    for (const column of [
      "wine_place_id",
      "map_status",
      "map_match_method",
      "map_match_confidence",
      "map_reviewed_by",
      "map_reviewed_at",
      "map_review_note",
    ]) {
      const denied = await client.query(
        `select has_column_privilege('authenticated', $1, $2, 'INSERT') allowed`,
        [`public.${table}`, column],
      );
      assert.equal(denied.rows[0].allowed, false, `${table}.${column}`);
    }
  }
});

test("authenticated inline reference creation still works", async () => {
  await withRollback(async () => {
    await client.query("set local role authenticated");
    const country = await client.query(
      `insert into countries (name)
       values ('Phase 1 Test Country')
       returning id, map_status, wine_place_id`,
    );
    assert.deepEqual(
      {
        map_status: country.rows[0].map_status,
        wine_place_id: country.rows[0].wine_place_id,
      },
      { map_status: "PENDING", wine_place_id: null },
    );
    const region = await client.query(
      `insert into regions (country_id, name)
       values ($1, 'Phase 1 Test Region') returning id`,
      [country.rows[0].id],
    );
    await client.query(
      `insert into appellations (region_id, name)
       values ($1, 'Phase 1 Test Appellation')`,
      [region.rows[0].id],
    );
  });
});

test("authenticated users can only read published foundation rows", async () => {
  await withRollback(async () => {
    await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values
         ('COUNTRY', 'rls-verified', 'RLS Verified', 'rls-verified', 0, 0, 0,
          'VERIFIED'),
         ('COUNTRY', 'rls-draft', 'RLS Draft', 'rls-draft', 0, 0, 0,
          'DRAFT')`,
    );

    await client.query("set local role authenticated");
    const visible = await client.query(
      `select canonical_key from wine_places
        where canonical_key like 'rls-%'
        order by canonical_key`,
    );
    assert.deepEqual(visible.rows, [{ canonical_key: "rls-verified" }]);
    await assert.rejects(
      client.query(
        `insert into wine_places
           (kind, canonical_key, name, slug, display_tier, min_zoom,
            label_min_zoom, publication_status)
         values ('COUNTRY', 'rls-write', 'RLS Write', 'rls-write', 0, 0, 0,
                 'DRAFT')`,
      ),
      /permission denied|row-level security/i,
    );
  });
});

test("boundary source snapshots are immutable", async () => {
  for (const operation of ["update", "delete", "truncate"]) {
    await withRollback(async () => {
      const source = await client.query(
        `insert into wine_boundary_sources
           (source_namespace, source_feature_id, authority, jurisdiction)
         values ('test', $1, 'Test', 'Test')
         returning id`,
        [`snapshot-${operation}`],
      );
      const snapshot = await client.query(
        `insert into wine_boundary_source_snapshots
           (source_id, source_revision, licence, normalized_artifact_uri,
            normalized_checksum_sha256, provenance_note, importer_version)
         values ($1, 'v1', 'Test', 'test://normalized', $2,
                 'Legacy test artifact', 'test')
         returning id`,
        [source.rows[0].id, "A".repeat(64)],
      );
      let mutation;
      if (operation === "update") {
        mutation = client.query(
          "update wine_boundary_source_snapshots set source_revision = 'v2' where id = $1",
          [snapshot.rows[0].id],
        );
      } else if (operation === "delete") {
        mutation = client.query(
          "delete from wine_boundary_source_snapshots where id = $1",
          [snapshot.rows[0].id],
        );
      } else {
        mutation = client.query("truncate wine_boundary_source_snapshots");
      }
      await assert.rejects(mutation, /source snapshots are immutable/i);
    });
  }

  for (const [index, rawUri, rawChecksum, note] of [
    ["uri-only", "test://raw", null, null],
    ["checksum-only", null, "B".repeat(64), "Raw artifact unavailable"],
  ]) {
    await withRollback(async () => {
      const source = await client.query(
        `insert into wine_boundary_sources
           (source_namespace, source_feature_id, authority, jurisdiction)
         values ('test', $1, 'Test', 'Test') returning id`,
        [`incomplete-${index}`],
      );
      await assert.rejects(
        client.query(
          `insert into wine_boundary_source_snapshots
             (source_id, source_revision, licence, raw_snapshot_uri,
              raw_checksum_sha256, normalized_artifact_uri,
              normalized_checksum_sha256, provenance_note, importer_version)
           values ($1, 'v1', 'Test', $2, $3, 'test://normalized', $4, $5,
                   'test')`,
          [source.rows[0].id, rawUri, rawChecksum, "A".repeat(64), note],
        ),
        /check constraint/i,
      );
    });
  }
});

test("boundary source identity keys are immutable", async () => {
  await withRollback(async () => {
    const source = await client.query(
      `insert into wine_boundary_sources
         (source_namespace, source_feature_id, authority, jurisdiction)
       values ('test', 'stable-source', 'Test', 'Test')
       returning id`,
    );
    await assert.rejects(
      client.query(
        "update wine_boundary_sources set source_feature_id = 'changed' where id = $1",
        [source.rows[0].id],
      ),
      /source identity is immutable/i,
    );
  });
});

test("wine place hierarchy rejects cycles and invalid display tiers", async () => {
  await withRollback(async () => {
    const parent = await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values ('COUNTRY', 'test-parent', 'Test Parent', 'test-parent', 0, 0, 0,
               'DRAFT')
       returning id`,
    );
    const parentId = parent.rows[0].id;
    const child = await client.query(
      `insert into wine_places
         (primary_parent_id, kind, canonical_key, name, slug, display_tier,
          min_zoom, label_min_zoom, publication_status)
       values ($1, 'REGION', 'test-child', 'Test Child', 'test-child', 1, 4, 4,
               'DRAFT')
       returning id`,
      [parentId],
    );
    const childId = child.rows[0].id;

    await assert.rejects(
      client.query(
        "update wine_places set primary_parent_id = $1 where id = $2",
        [childId, parentId],
      ),
      /cycle/i,
    );
  });

  await withRollback(async () => {
    const secondParent = await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values ('COUNTRY', 'test-tier-parent', 'Test Tier Parent',
                'test-tier-parent', 1, 0, 0, 'DRAFT')
       returning id`,
    );
    await assert.rejects(
      client.query(
        `insert into wine_places
           (primary_parent_id, kind, canonical_key, name, slug, display_tier,
            min_zoom, label_min_zoom, publication_status)
         values ($1, 'REGION', 'test-tier', 'Test Tier', 'test-tier', 0, 4, 4,
                 'DRAFT')`,
        [secondParent.rows[0].id],
      ),
      /display tier/i,
    );
  });

  await withRollback(async () => {
    const equalTierParent = await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values ('COUNTRY', 'equal-tier-parent', 'Equal Tier Parent',
               'equal-tier-parent', 1, 0, 0, 'DRAFT')
       returning id`,
    );
    await client.query(
      `insert into wine_places
         (primary_parent_id, kind, canonical_key, name, slug, display_tier,
          min_zoom, label_min_zoom, publication_status)
       values ($1, 'REGION', 'equal-tier-child', 'Equal Tier Child',
               'equal-tier-child', 1, 4, 4, 'DRAFT')`,
      [equalTierParent.rows[0].id],
    );
  });
});

test("verified canonical keys are permanently locked", async () => {
  await withRollback(async () => {
    const inserted = await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values ('COUNTRY', 'locked-key', 'Locked Key', 'locked-key', 0, 0, 0,
               'VERIFIED')
       returning id, canonical_key_locked_at`,
    );
    assert.ok(inserted.rows[0].canonical_key_locked_at);
    const demoted = await client.query(
      `update wine_places set publication_status = 'DRAFT'
        where id = $1 returning canonical_key_locked_at`,
      [inserted.rows[0].id],
    );
    assert.equal(
      demoted.rows[0].canonical_key_locked_at.toISOString(),
      inserted.rows[0].canonical_key_locked_at.toISOString(),
    );
    await assert.rejects(
      client.query(
        "update wine_places set canonical_key = 'changed-key' where id = $1",
        [inserted.rows[0].id],
      ),
      /canonical key is immutable/i,
    );
  });
});

test("reference IDs and scoring functions remain unchanged", async () => {
  assert.deepEqual(await readSafetySnapshot(), safetyBaseline);
});

test(
  "concurrent hierarchy changes cannot create a cycle",
  { skip: isMigrationDryRun },
  async () => {
    const fixturePattern = "phase1-concurrency-test-%";
    await client.query(
      "update wine_places set primary_parent_id = null where canonical_key like $1",
      [fixturePattern],
    );
    await client.query("delete from wine_places where canonical_key like $1", [
      fixturePattern,
    ]);
    const suffix = randomUUID();
    const inserted = await client.query(
      `insert into wine_places
         (kind, canonical_key, name, slug, display_tier, min_zoom,
          label_min_zoom, publication_status)
       values
         ('REGION', $1, 'Concurrent A', $2, 1, 0, 0, 'DRAFT'),
         ('REGION', $3, 'Concurrent B', $4, 1, 0, 0, 'DRAFT')
       returning id`,
      [
        `phase1-concurrency-test-a-${suffix}`,
        `phase1-concurrency-test-a-${suffix}`,
        `phase1-concurrency-test-b-${suffix}`,
        `phase1-concurrency-test-b-${suffix}`,
      ],
    );
    const [a, b] = inserted.rows.map(({ id }) => id);
    const first = new pg.Client(connectionConfig);
    const second = new pg.Client(connectionConfig);
    let competingUpdate;
    try {
      await first.connect();
      await second.connect();
      await first.query("begin");
      await second.query("begin");
      const secondPid = (await second.query("select pg_backend_pid() pid")).rows[0]
        .pid;
      await first.query(
        "update wine_places set primary_parent_id = $1 where id = $2",
        [b, a],
      );
      competingUpdate = second.query(
        "update wine_places set primary_parent_id = $1 where id = $2",
        [a, b],
      );
      void competingUpdate.catch(() => undefined);
      await waitForAdvisoryLockWait(secondPid);
      await first.query("commit");
      await assert.rejects(competingUpdate, /cycle/i);
    } finally {
      await first.query("rollback").catch(() => undefined);
      if (competingUpdate) {
        await competingUpdate.catch(() => undefined);
      }
      await second.query("rollback").catch(() => undefined);
      await first.end().catch(() => undefined);
      await second.end().catch(() => undefined);
      await client.query(
        "update wine_places set primary_parent_id = null where id = any($1::uuid[])",
        [[a, b]],
      );
      await client.query("delete from wine_places where id = any($1::uuid[])", [
        [a, b],
      ]);
      await client.query(
        "delete from wine_places where canonical_key like $1",
        [fixturePattern],
      );
    }
  },
);
```

Keep tests serial because they share one connection and nested savepoints:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
Remove-Item Env:DB_PASSWORD
```

- [ ] **Step 2: Run the schema tests and verify RED**

Run the command above before creating the migration.

Expected: FAIL because `postgis`/`wine_places` do not exist. Confirm the failure is missing foundation schema, not a connection or credential failure.

- [ ] **Step 3: Create the foundation migration**

Create `supabase/migrations/20260727090000_world_wine_map_foundation.sql` with the following complete structure.

Start with PostGIS and enums:

```sql
create schema if not exists extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'postgis';

  if v_schema is not null and v_schema <> 'extensions' then
    raise exception
      'postgis is already installed in schema %, expected extensions; relocate it in a separate reviewed migration',
      v_schema;
  end if;
end;
$$;

create extension if not exists postgis with schema extensions;

create type wine_place_kind as enum (
  'COUNTRY', 'MACRO_REGION', 'REGION', 'SUBREGION',
  'APPELLATION', 'SITE', 'VINEYARD'
);
create type wine_place_publication_status as enum ('DRAFT', 'VERIFIED', 'EXCLUDED');
create type wine_place_relationship_type as enum ('OVERLAPS', 'ALTERNATE_PARENT', 'RELATED');
create type wine_article_status as enum ('PLACEHOLDER', 'DRAFT', 'PUBLISHED');
create type wine_reference_map_status as enum (
  'PENDING', 'VERIFIED', 'SYNTHETIC', 'DUPLICATE', 'INVALID', 'NOT_GEOGRAPHIC'
);
create type wine_boundary_method as enum (
  'OFFICIAL', 'GENERALIZED_FROM_OFFICIAL_SOURCE',
  'DERIVED_FROM_DESCENDANTS', 'MANUAL'
);
create type wine_boundary_quality_status as enum ('DRAFT', 'VALIDATED', 'REJECTED');
create type wine_map_release_status as enum (
  'BUILDING', 'VALIDATED', 'ACTIVE', 'RETIRED', 'FAILED'
);
```

Create canonical and editorial tables:

```sql
create table wine_places (
  id uuid primary key default gen_random_uuid(),
  primary_parent_id uuid references wine_places(id) on delete restrict,
  kind wine_place_kind not null,
  canonical_key text not null unique,
  canonical_key_locked_at timestamptz,
  name text not null,
  slug text not null,
  display_tier smallint not null check (display_tier between 0 and 20),
  min_zoom real not null check (min_zoom between 0 and 24),
  label_min_zoom real not null check (label_min_zoom between 0 and 24),
  publication_status wine_place_publication_status not null default 'DRAFT',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_parent_id is null or primary_parent_id <> id)
);

create unique index wine_places_parent_slug_unique
  on wine_places (coalesce(primary_parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index wine_places_parent_sort_idx on wine_places (primary_parent_id, sort_order, name);
create index wine_places_publication_tier_idx on wine_places (publication_status, display_tier);

create table wine_place_aliases (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  language_code text not null default 'und',
  alias_type text not null check (alias_type in ('ALTERNATE', 'LOCALIZED', 'HISTORICAL', 'SEARCH')),
  created_at timestamptz not null default now(),
  unique (wine_place_id, language_code, normalized_name)
);
create index wine_place_aliases_normalized_name_idx on wine_place_aliases (normalized_name);

create table wine_place_relationships (
  source_place_id uuid not null references wine_places(id) on delete cascade,
  target_place_id uuid not null references wine_places(id) on delete cascade,
  relationship_type wine_place_relationship_type not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (source_place_id, target_place_id, relationship_type),
  check (source_place_id <> target_place_id)
);

create table wine_place_articles (
  wine_place_id uuid primary key references wine_places(id) on delete cascade,
  description text,
  climate text,
  grape_varieties text,
  wine_styles text,
  key_facts text[],
  editorial_status wine_article_status not null default 'PLACEHOLDER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Create provenance, geometry, and release tables:

```sql
create table wine_boundary_sources (
  id uuid primary key default gen_random_uuid(),
  source_namespace text not null,
  source_feature_id text not null,
  authority text not null,
  jurisdiction text not null,
  created_at timestamptz not null default now(),
  unique (source_namespace, source_feature_id)
);

create table wine_boundary_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references wine_boundary_sources(id) on delete restrict,
  source_revision text not null,
  retrieved_at timestamptz,
  source_url text,
  licence text not null,
  raw_snapshot_uri text,
  raw_checksum_sha256 text
    check (raw_checksum_sha256 is null or raw_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  normalized_artifact_uri text not null,
  normalized_checksum_sha256 text not null
    check (normalized_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  provenance_note text,
  importer_version text not null,
  created_at timestamptz not null default now(),
  unique (source_id, source_revision, normalized_checksum_sha256),
  check ((raw_snapshot_uri is null) = (raw_checksum_sha256 is null)),
  check (raw_snapshot_uri is not null or provenance_note is not null)
);

create table wine_place_boundaries (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  source_snapshot_id uuid not null
    references wine_boundary_source_snapshots(id) on delete restrict,
  boundary_method wine_boundary_method not null,
  quality_status wine_boundary_quality_status not null default 'DRAFT',
  display_geometry extensions.geometry(MultiPolygon, 4326) not null,
  label_point extensions.geometry(Point, 4326) not null,
  bbox double precision[] not null check (cardinality(bbox) = 4),
  source_feature_refs jsonb not null default '{}'::jsonb,
  generation_parameters jsonb not null default '{}'::jsonb,
  revision text not null,
  is_current boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (not extensions.ST_IsEmpty(display_geometry)),
  check (extensions.ST_IsValid(display_geometry)),
  check (extensions.ST_SRID(display_geometry) = 4326),
  check (extensions.ST_SRID(label_point) = 4326),
  check (extensions.ST_Covers(display_geometry, label_point))
);
create unique index wine_place_boundaries_one_current_idx
  on wine_place_boundaries (wine_place_id) where is_current;
create index wine_place_boundaries_geometry_idx
  on wine_place_boundaries using gist (display_geometry);

create table wine_map_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status wine_map_release_status not null default 'BUILDING',
  manifest_url text,
  manifest_checksum_sha256 text,
  tile_checksums jsonb not null default '{}'::jsonb,
  feature_counts jsonb not null default '{}'::jsonb,
  build_inputs jsonb not null default '{}'::jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    status <> 'ACTIVE'
    or (manifest_url is not null and manifest_checksum_sha256 is not null)
  )
);
create unique index wine_map_releases_one_active_idx
  on wine_map_releases ((status)) where status = 'ACTIVE';
```

Add hierarchy, provenance, and timestamp triggers:

```sql
create function validate_wine_place_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_tier smallint;
begin
  -- All hierarchy writers take the same transaction lock before reading paths.
  perform pg_catalog.pg_advisory_xact_lock(9132072026072709);

  if new.primary_parent_id is null then
    if exists (
      select 1 from wine_places child
      where child.primary_parent_id = new.id
        and child.display_tier < new.display_tier
    ) then
      raise exception 'child display tier cannot precede parent display tier';
    end if;
    return new;
  end if;

  if new.primary_parent_id = new.id then
    raise exception 'wine place cannot parent itself';
  end if;

  if exists (
    with recursive ancestors as (
      select id, primary_parent_id
      from wine_places where id = new.primary_parent_id
      union all
      select parent.id, parent.primary_parent_id
      from wine_places parent
      join ancestors child on parent.id = child.primary_parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'wine place hierarchy cycle detected';
  end if;

  select display_tier into v_parent_tier
  from wine_places where id = new.primary_parent_id;
  if v_parent_tier is null or new.display_tier < v_parent_tier then
    raise exception 'child display tier cannot precede parent display tier';
  end if;

  if exists (
    select 1 from wine_places child
    where child.primary_parent_id = new.id
      and child.display_tier < new.display_tier
  ) then
    raise exception 'child display tier cannot precede parent display tier';
  end if;

  return new;
end;
$$;

create trigger wine_places_validate_hierarchy
  before insert or update of primary_parent_id, display_tier on wine_places
  for each row execute function validate_wine_place_hierarchy();

create function lock_verified_wine_place_canonical_key()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_status = 'VERIFIED' then
      new.canonical_key_locked_at = coalesce(new.canonical_key_locked_at, now());
    end if;
    return new;
  end if;

  if old.canonical_key_locked_at is not null then
    if new.canonical_key is distinct from old.canonical_key then
      raise exception 'verified wine place canonical key is immutable';
    end if;
    new.canonical_key_locked_at = old.canonical_key_locked_at;
  elsif new.publication_status = 'VERIFIED' then
    new.canonical_key_locked_at = coalesce(new.canonical_key_locked_at, now());
  end if;

  return new;
end;
$$;

create trigger wine_places_lock_canonical_key
  before insert or update of canonical_key, canonical_key_locked_at,
    publication_status on wine_places
  for each row execute function lock_verified_wine_place_canonical_key();

create function lock_wine_boundary_source_identity()
returns trigger
language plpgsql
as $$
begin
  if new.source_namespace is distinct from old.source_namespace
     or new.source_feature_id is distinct from old.source_feature_id then
    raise exception 'wine boundary source identity is immutable';
  end if;
  return new;
end;
$$;

create trigger wine_boundary_sources_lock_identity
  before update of source_namespace, source_feature_id on wine_boundary_sources
  for each row execute function lock_wine_boundary_source_identity();

create function prevent_wine_boundary_source_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wine boundary source snapshots are immutable';
  return null;
end;
$$;

create trigger wine_boundary_source_snapshots_immutable
  before update or delete on wine_boundary_source_snapshots
  for each row execute function prevent_wine_boundary_source_snapshot_mutation();
create trigger wine_boundary_source_snapshots_no_truncate
  before truncate on wine_boundary_source_snapshots
  for each statement execute function prevent_wine_boundary_source_snapshot_mutation();

create trigger wine_places_set_updated_at
  before update on wine_places
  for each row execute function set_updated_at();
create trigger wine_place_articles_set_updated_at
  before update on wine_place_articles
  for each row execute function set_updated_at();
```

Add mapping fields to each scoring reference table:

```sql
alter table countries
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint countries_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index countries_wine_place_id_idx on countries (wine_place_id);
create index countries_map_status_idx on countries (map_status);

alter table regions
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint regions_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index regions_wine_place_id_idx on regions (wine_place_id);
create index regions_map_status_idx on regions (map_status);

alter table appellations
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint appellations_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index appellations_wine_place_id_idx on appellations (wine_place_id);
create index appellations_map_status_idx on appellations (map_status);
```

Protect curation fields from the existing authenticated inline-create policy:

```sql
revoke insert on countries, regions, appellations from authenticated;
grant insert (name) on countries to authenticated;
grant insert (country_id, name) on regions to authenticated;
grant insert (region_id, name) on appellations to authenticated;
```

Enable RLS and add authenticated read-only policies to every new table. Use these predicates:

```sql
alter table wine_places enable row level security;
alter table wine_place_aliases enable row level security;
alter table wine_place_relationships enable row level security;
alter table wine_place_articles enable row level security;
alter table wine_boundary_sources enable row level security;
alter table wine_boundary_source_snapshots enable row level security;
alter table wine_place_boundaries enable row level security;
alter table wine_map_releases enable row level security;

create policy "wine places verified read" on wine_places
  for select to authenticated using (publication_status = 'VERIFIED');
create policy "wine place aliases verified read" on wine_place_aliases
  for select to authenticated using (
    exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine place relationships verified read" on wine_place_relationships
  for select to authenticated using (
    exists (select 1 from wine_places p where p.id = source_place_id and p.publication_status = 'VERIFIED')
    and exists (select 1 from wine_places p where p.id = target_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine place articles published read" on wine_place_articles
  for select to authenticated using (
    editorial_status in ('PLACEHOLDER', 'PUBLISHED')
    and exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine boundary sources read" on wine_boundary_sources
  for select to authenticated using (true);
create policy "wine boundary source snapshots read" on wine_boundary_source_snapshots
  for select to authenticated using (true);
create policy "wine place boundaries validated read" on wine_place_boundaries
  for select to authenticated using (
    is_current and quality_status = 'VALIDATED'
    and exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine map active release read" on wine_map_releases
  for select to authenticated using (status = 'ACTIVE');

grant select on wine_places, wine_place_aliases, wine_place_relationships,
  wine_place_articles, wine_boundary_sources, wine_boundary_source_snapshots,
  wine_place_boundaries, wine_map_releases to authenticated;
```

- [ ] **Step 4: Verify the exact foundation migration inside a rollback-only transaction**

Set the test harness to apply and record the migration only inside its outer
transaction. Every mutating test uses a savepoint; the `after` hook rolls back
the migration, PostGIS installation, grants, and test rows together:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  $env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260727090000_world_wine_map_foundation.sql"
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Foundation transaction test failed." }
} finally {
  Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS -ErrorAction SilentlyContinue
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

Expected: nine tests pass and the cross-connection concurrency test is skipped
because uncommitted DDL is not visible to another connection. The `after` hook
also proves that PostGIS and all foundation tables are absent after rollback.

- [ ] **Step 5: Commit Task 1**

Inspect status, diff, and recent history; stage only the migration and
integration test. Do not apply the migration live yet.

```powershell
git add supabase/migrations/20260727090000_world_wine_map_foundation.sql scripts/world-wine-map-foundation.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add world wine map foundation schema"
if ($LASTEXITCODE -ne 0) { throw "Task 1 commit failed." }
```

---

### Task 2: Lossless Bordeaux Catalog And Boundary Migration

**Files:**
- Modify: `scripts/world-wine-map-foundation.test.mjs`
- Create: `supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql`

**Interfaces:**
- Migrates the 14 current `wine_map_nodes` IDs into `wine_places`.
- Migrates all current article fields into `wine_place_articles`.
- Creates 14 stable source-feature identities, 14 immutable source snapshots,
  and 14 current validated PostGIS boundaries.
- Verifies exact links for France, Bordeaux, and these appellations: Médoc, Haut-Médoc, Margaux, Pauillac, Saint-Julien, Saint-Estèphe, Pessac-Léognan, Graves, Saint-Émilion, Pomerol, Sauternes, and Barsac.

- [ ] **Step 1: Add failing migration-parity tests**

Append these tests and helpers to `scripts/world-wine-map-foundation.test.mjs` before creating/applying the data migration:

```js
const EXPECTED_APPELLATION_LINKS = [
  { names: ["Barsac AOP", "Barsac"], key: "france.bordeaux.sauternes.barsac" },
  { names: ["Graves AOP", "Graves"], key: "france.bordeaux.graves" },
  { names: ["Haut-Médoc AOP", "Haut-Médoc"], key: "france.bordeaux.haut-medoc" },
  { names: ["Margaux AOP", "Margaux"], key: "france.bordeaux.haut-medoc.margaux" },
  { names: ["Médoc AOP", "Médoc"], key: "france.bordeaux.medoc" },
  { names: ["Pauillac AOP", "Pauillac"], key: "france.bordeaux.haut-medoc.pauillac" },
  { names: ["Pessac-Léognan AOP", "Pessac-Léognan"], key: "france.bordeaux.pessac-leognan" },
  { names: ["Pomerol AOP", "Pomerol"], key: "france.bordeaux.pomerol" },
  { names: ["Saint-Estèphe AOP", "Saint-Estèphe"], key: "france.bordeaux.haut-medoc.saint-estephe" },
  { names: ["Saint-Émilion AOP", "Saint-Émilion"], key: "france.bordeaux.saint-emilion" },
  { names: ["Saint-Julien AOP", "Saint-Julien"], key: "france.bordeaux.haut-medoc.saint-julien" },
  { names: ["Sauternes AOP", "Sauternes"], key: "france.bordeaux.sauternes" },
];

const SOURCE_MIGRATION_SHA256 =
  "B197FB23F8D784E77B72BDBE599AFAC6C822DA06423CFBD1EA501E3340833177";
const MANUAL_MIGRATION_SHA256 =
  "C5196565DFB93ABD68F5C398717440C142FCE621A773CABE6CEAEF7BEE9A0D50";
const EXPECTED_BOUNDARIES = [
  ["france", "MANUAL", "legacy-20260724-france-mainland", MANUAL_MIGRATION_SHA256],
  ["france.bordeaux", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-bordeaux", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.graves", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-graves", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.haut-medoc", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-haut-medoc", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.haut-medoc.margaux", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-margaux", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.haut-medoc.pauillac", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-pauillac", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.haut-medoc.saint-estephe", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-saint-estephe", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.haut-medoc.saint-julien", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-saint-julien", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.medoc", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-medoc", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.pessac-leognan", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-pessac-leognan", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.pomerol", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-pomerol", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.saint-emilion", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-saint-emilion", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.sauternes", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-sauternes", SOURCE_MIGRATION_SHA256],
  ["france.bordeaux.sauternes.barsac", "GENERALIZED_FROM_OFFICIAL_SOURCE", "legacy-20260726-barsac", SOURCE_MIGRATION_SHA256],
];

test("canonical catalog is a lossless copy of the current map tree", async () => {
  const parity = await client.query(
    `select count(*)::int total,
            count(*) filter (
              where p.id = n.id
                and p.name = n.name
                 and p.slug = n.slug
                 and p.primary_parent_id is not distinct from n.parent_id
                 and p.kind::text = n.level::text
                 and p.publication_status = 'VERIFIED'
                 and p.canonical_key_locked_at is not null
                 and p.sort_order = n.sort_order
            )::int matching
       from wine_map_nodes n
       left join wine_places p on p.id = n.id`,
  );
  assert.deepEqual(parity.rows[0], { total: 14, matching: 14 });
  const canonicalCount = await client.query(
    "select count(*)::int count from wine_places",
  );
  assert.equal(canonicalCount.rows[0].count, 14);

  const articleParity = await client.query(
    `select count(*)::int total,
            count(*) filter (
              where a.description is not distinct from n.description
                and a.climate is not distinct from n.climate
                and a.grape_varieties is not distinct from n.grape_varieties
                and a.wine_styles is not distinct from n.wine_styles
                and a.key_facts is not distinct from n.key_facts
                and a.editorial_status = 'PUBLISHED'
            )::int matching
       from wine_map_nodes n
       left join wine_place_articles a on a.wine_place_id = n.id`,
  );
  assert.deepEqual(articleParity.rows[0], { total: 14, matching: 14 });
});

test("all migrated places have valid reviewed current boundaries", async () => {
  const result = await client.query(
    `select count(*)::int total,
            count(*) filter (where b.quality_status = 'VALIDATED')::int validated,
            count(*) filter (where b.is_current)::int current,
             count(*) filter (where extensions.ST_IsValid(b.display_geometry))::int valid,
             count(*) filter (where extensions.ST_Covers(b.display_geometry, b.label_point))::int labelled,
             count(*) filter (
               where extensions.ST_Equals(
                 b.display_geometry,
                 extensions.ST_Multi(
                   extensions.ST_SetSRID(
                     extensions.ST_GeomFromGeoJSON(n.boundary_geojson::text),
                     4326
                   )
                 )
               )
             )::int exact_geometry,
             count(*) filter (where b.boundary_method = 'MANUAL')::int manual,
             count(*) filter (
               where b.boundary_method = 'GENERALIZED_FROM_OFFICIAL_SOURCE'
             )::int generalized,
             count(*) filter (
               where b.boundary_method = 'GENERALIZED_FROM_OFFICIAL_SOURCE'
                 and b.generation_parameters @> '{
                   "concaveman_version": "2.0.0",
                   "concavity": 2,
                   "edge_threshold_divisor": 30,
                   "coordinate_precision": 4,
                   "max_edge_diagonal_share": 0.2,
                   "min_component_area_share": 0.02
                 }'::jsonb
             )::int reproducible
       from wine_place_boundaries b
       join wine_map_nodes n on n.id = b.wine_place_id`,
  );
  assert.deepEqual(result.rows[0], {
    total: 14,
    validated: 14,
    current: 14,
    valid: 14,
    labelled: 14,
    exact_geometry: 14,
    manual: 1,
    generalized: 13,
    reproducible: 13,
  });

  const classifications = await client.query(
    `select p.canonical_key, b.boundary_method, s.source_feature_id,
            snapshot.normalized_checksum_sha256,
            snapshot.raw_snapshot_uri,
            snapshot.raw_checksum_sha256,
            snapshot.provenance_note is not null documented
       from wine_place_boundaries b
       join wine_places p on p.id = b.wine_place_id
       join wine_boundary_source_snapshots snapshot
         on snapshot.id = b.source_snapshot_id
       join wine_boundary_sources s on s.id = snapshot.source_id
      order by p.canonical_key`,
  );
  assert.deepEqual(
    classifications.rows,
    EXPECTED_BOUNDARIES.map(([canonical_key, boundary_method,
      source_feature_id, normalized_checksum_sha256]) => ({
      canonical_key,
      boundary_method,
      source_feature_id,
      normalized_checksum_sha256,
      raw_snapshot_uri: null,
      raw_checksum_sha256: null,
      documented: true,
    })),
  );

  const provenance = await client.query(
    `select
       (select count(*)::int from wine_boundary_sources) sources,
       (select count(*)::int from wine_boundary_source_snapshots) snapshots,
       count(distinct (s.source_namespace, s.source_feature_id))::int identities,
       count(*)::int linked_boundaries
     from wine_place_boundaries b
     join wine_boundary_source_snapshots snapshot
       on snapshot.id = b.source_snapshot_id
     join wine_boundary_sources s on s.id = snapshot.source_id`,
  );
  assert.deepEqual(provenance.rows[0], {
    sources: 14,
    snapshots: 14,
    identities: 14,
    linked_boundaries: 14,
  });
});

test("only exact current Bordeaux references are verified", async () => {
  const country = await client.query(
    `select c.name, p.canonical_key
       from countries c join wine_places p on p.id = c.wine_place_id
      where c.map_status = 'VERIFIED'`,
  );
  assert.deepEqual(country.rows, [{ name: "France", canonical_key: "france" }]);

  const region = await client.query(
    `select r.name, p.canonical_key
       from regions r join wine_places p on p.id = r.wine_place_id
      where r.map_status = 'VERIFIED'`,
  );
  assert.deepEqual(region.rows, [{ name: "Bordeaux", canonical_key: "france.bordeaux" }]);

  const appellations = await client.query(
    `select a.name, p.canonical_key
       from appellations a
       join regions r on r.id = a.region_id
       join countries c on c.id = r.country_id
       join wine_places p on p.id = a.wine_place_id
      where a.map_status = 'VERIFIED'
       order by a.id`,
  );
  assert.equal(appellations.rows.length, 12);
  const actualAppellations = new Map(
    appellations.rows.map(({ name, canonical_key }) => [name, canonical_key]),
  );
  assert.equal(actualAppellations.size, EXPECTED_APPELLATION_LINKS.length);
  for (const { names, key } of EXPECTED_APPELLATION_LINKS) {
    const matchedNames = names.filter((name) => actualAppellations.has(name));
    assert.equal(matchedNames.length, 1, names.join(" or "));
    assert.equal(actualAppellations.get(matchedNames[0]), key, matchedNames[0]);
  }

  for (const [table, expectedVerified] of [
    ["countries", 1],
    ["regions", 1],
    ["appellations", 12],
  ]) {
    const statuses = await client.query(
      `select count(*)::int total,
              count(*) filter (where map_status = 'VERIFIED')::int verified,
              count(*) filter (
                where map_status = 'VERIFIED'
                  and wine_place_id is not null
                  and map_match_method = 'MIGRATED_EXACT'
                  and map_match_confidence = 1
                  and map_reviewed_at is not null
                  and map_review_note = 'Phase 1 canonical migration'
              )::int reviewed,
              count(*) filter (
                where map_status = 'PENDING' and wine_place_id is null
              )::int pending
         from ${table}`,
    );
    assert.equal(statuses.rows[0].verified, expectedVerified, table);
    assert.equal(statuses.rows[0].reviewed, expectedVerified, table);
    assert.equal(
      statuses.rows[0].total,
      statuses.rows[0].verified + statuses.rows[0].pending,
      table,
    );
  }
});

test("existing scoring references remain valid", async () => {
  const answers = await client.query(
    `select
       count(*) filter (where c.id is null)::int missing_country,
       count(*) filter (where r.id is null)::int missing_region,
       count(*) filter (where wa.appellation_id is not null and a.id is null)::int missing_appellation
     from wine_answers wa
     left join countries c on c.id = wa.country_id
     left join regions r on r.id = wa.region_id
     left join appellations a on a.id = wa.appellation_id`,
  );
  assert.deepEqual(answers.rows[0], {
    missing_country: 0,
    missing_region: 0,
    missing_appellation: 0,
  });

  const guesses = await client.query(
    `select
       count(*) filter (where g.country_id is not null and c.id is null)::int missing_country,
       count(*) filter (where g.region_id is not null and r.id is null)::int missing_region,
       count(*) filter (where g.appellation_id is not null and a.id is null)::int missing_appellation
     from guesses g
     left join countries c on c.id = g.country_id
     left join regions r on r.id = g.region_id
     left join appellations a on a.id = g.appellation_id`,
  );
  assert.deepEqual(guesses.rows[0], {
    missing_country: 0,
    missing_region: 0,
    missing_appellation: 0,
  });
});

test("Phase 1 migrations are recorded", async () => {
  const result = await client.query(
    `select version, name
       from supabase_migrations.schema_migrations
      where version = any($1::text[])
      order by version`,
    [["20260727090000", "20260727093000"]],
  );
  assert.deepEqual(result.rows, [
    { version: "20260727090000", name: "world_wine_map_foundation" },
    { version: "20260727093000", name: "world_wine_map_bordeaux_seed" },
  ]);
});
```

- [ ] **Step 2: Run the expanded tests and verify RED**

Apply only the foundation migration inside the rollback-only harness:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
$env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260727090000_world_wine_map_foundation.sql"
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS
Remove-Item Env:DB_PASSWORD
```

Expected: foundation tests pass; catalog/article/boundary/reference/history tests
fail because the seed migration is absent. The outer transaction still rolls
back cleanly.

- [ ] **Step 3: Create the Bordeaux seed migration**

Create `supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql`.

Declare the exact legacy source set, validate it before writing, then insert
canonical places with depth-based pilot zooms:

```sql
create temporary table world_wine_expected_nodes (
  slug text primary key,
  parent_slug text,
  level text not null,
  canonical_key text not null unique,
  source_namespace text not null,
  source_feature_id text not null unique,
  boundary_method wine_boundary_method not null
) on commit drop;

insert into world_wine_expected_nodes values
  ('france', null, 'COUNTRY', 'france', 'BLINDR_MANUAL',
   'legacy-20260724-france-mainland', 'MANUAL'),
  ('bordeaux', 'france', 'REGION', 'france.bordeaux',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-bordeaux',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('medoc', 'bordeaux', 'APPELLATION', 'france.bordeaux.medoc',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-medoc',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('haut-medoc', 'bordeaux', 'APPELLATION', 'france.bordeaux.haut-medoc',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-haut-medoc',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('margaux', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.margaux', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-margaux', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pauillac', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.pauillac', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-pauillac', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-julien', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.saint-julien',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-saint-julien',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-estephe', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.saint-estephe',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-saint-estephe',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pessac-leognan', 'bordeaux', 'APPELLATION',
   'france.bordeaux.pessac-leognan', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-pessac-leognan', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('graves', 'bordeaux', 'APPELLATION', 'france.bordeaux.graves',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-graves',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-emilion', 'bordeaux', 'APPELLATION',
   'france.bordeaux.saint-emilion', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-saint-emilion', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pomerol', 'bordeaux', 'APPELLATION', 'france.bordeaux.pomerol',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-pomerol',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('sauternes', 'bordeaux', 'APPELLATION', 'france.bordeaux.sauternes',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-sauternes',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('barsac', 'sauternes', 'APPELLATION',
   'france.bordeaux.sauternes.barsac', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-barsac', 'GENERALIZED_FROM_OFFICIAL_SOURCE');

do $$
begin
  if (select count(*) from wine_map_nodes) <> 14 then
    raise exception 'expected exactly 14 legacy wine map nodes';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    full join wine_map_nodes node on node.slug = expected.slug
    where expected.slug is null or node.id is null
  ) then
    raise exception 'legacy wine map slug set differs from the expected 14';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    join wine_map_nodes node on node.slug = expected.slug
    left join wine_map_nodes parent on parent.id = node.parent_id
    where node.level::text <> expected.level
       or parent.slug is distinct from expected.parent_slug
       or node.boundary_geojson is null
  ) then
    raise exception 'legacy wine map hierarchy, level, or geometry differs from the reviewed source set';
  end if;
end;
$$;

create temporary table world_wine_map_seed on commit drop as
with recursive map_tree as (
  select node.*, expected.canonical_key, 0 depth
  from world_wine_expected_nodes expected
  join wine_map_nodes node on node.slug = expected.slug
  where expected.parent_slug is null

  union all

  select node.*, expected.canonical_key, parent.depth + 1
  from map_tree parent
  join world_wine_expected_nodes expected on expected.parent_slug = parent.slug
  join wine_map_nodes node
    on node.slug = expected.slug and node.parent_id = parent.id
)
select * from map_tree;

do $$
begin
  if (select count(*) from world_wine_map_seed) <> 14 then
    raise exception 'expected the reviewed legacy tree to contain 14 connected nodes';
  end if;
end;
$$;

do $$
declare
  v_depth int;
  v_max_depth int;
begin
  select max(depth) into v_max_depth from world_wine_map_seed;
  for v_depth in 0..v_max_depth loop
    insert into wine_places (
      id, primary_parent_id, kind, canonical_key, name, slug, display_tier,
      min_zoom, label_min_zoom, publication_status, sort_order, created_at,
      updated_at
    )
    select
      id,
      parent_id,
      level::text::wine_place_kind,
      canonical_key,
      name,
      slug,
      depth::smallint,
      case depth when 0 then 1.5 when 1 then 4 when 2 then 7 else 9 end,
      case depth when 0 then 2 when 1 then 4 when 2 then 7 else 9 end,
      'VERIFIED',
      sort_order,
      created_at,
      now()
    from world_wine_map_seed
    where depth = v_depth
    order by sort_order, name;
  end loop;
end;
$$;

insert into wine_place_articles (
  wine_place_id, description, climate, grape_varieties, wine_styles, key_facts,
  editorial_status, created_at, updated_at
)
select id, description, climate, grape_varieties, wine_styles, key_facts,
       'PUBLISHED', created_at, now()
from wine_map_nodes;
```

Create one stable source-feature identity and immutable snapshot per migrated
place. The SHA-256 values come from canonical Git blobs in commit
`1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7`, not platform-dependent
working-copy line endings:

```sql
create temporary table world_wine_boundary_source_seed on commit drop as
select
  expected.slug,
  expected.source_namespace,
  expected.source_feature_id,
  expected.boundary_method,
  case when expected.slug = 'france' then 'Blindr' else 'IGN / INAO' end authority,
  'France'::text jurisdiction,
  case when expected.slug = 'france'
    then null
    else 'https://data.geopf.fr/wfs/ows'
  end source_url,
  case when expected.slug = 'france'
    then 'Blindr project-authored geometry; no external licence'
    else 'Licence Ouverte Etalab'
  end licence,
  case when expected.slug = 'france'
    then '20260724090000'
    else '20260726090000'
  end source_revision,
  null::timestamptz retrieved_at,
  null::text raw_snapshot_uri,
  null::text raw_checksum_sha256,
  case when expected.slug = 'france'
    then 'https://raw.githubusercontent.com/christianolin/blindtastingapp/1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7/supabase/migrations/20260724090000_wine_map_real_boundaries.sql'
    else 'https://raw.githubusercontent.com/christianolin/blindtastingapp/1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7/supabase/migrations/20260726090000_wine_map_inao_boundaries.sql'
  end normalized_artifact_uri,
  case when expected.slug = 'france'
    then 'C5196565DFB93ABD68F5C398717440C142FCE621A773CABE6CEAEF7BEE9A0D50'
    else 'B197FB23F8D784E77B72BDBE599AFAC6C822DA06423CFBD1EA501E3340833177'
  end normalized_checksum_sha256,
  case when expected.slug = 'france'
    then 'Project-authored manual outline; no external raw response or parcel features apply. The pinned Git migration is the original retained artifact.'
    else 'The original raw WFS response, retrieval timestamp, and parcel feature IDs were not retained; the normalized Git blob is the earliest immutable artifact.'
  end provenance_note,
  case when expected.slug = 'france'
    then 'manual-v1'
    else 'legacy-wfs-import-unversioned'
  end importer_version
from world_wine_expected_nodes expected;

insert into wine_boundary_sources (
  source_namespace, source_feature_id, authority, jurisdiction
)
select source_namespace, source_feature_id, authority, jurisdiction
from world_wine_boundary_source_seed;

insert into wine_boundary_source_snapshots (
  source_id, source_revision, retrieved_at, source_url, licence,
  raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
  normalized_checksum_sha256, provenance_note, importer_version
)
select source.id, seed.source_revision, seed.retrieved_at, seed.source_url,
       seed.licence, seed.raw_snapshot_uri, seed.raw_checksum_sha256,
       seed.normalized_artifact_uri, seed.normalized_checksum_sha256,
       seed.provenance_note, seed.importer_version
from world_wine_boundary_source_seed seed
join wine_boundary_sources source
  on source.source_namespace = seed.source_namespace
 and source.source_feature_id = seed.source_feature_id;
```

Convert every current GeoJSON boundary to a reviewed PostGIS `MultiPolygon`:

```sql
with converted as (
  select
    n.*,
    extensions.ST_Multi(
      extensions.ST_SetSRID(
        extensions.ST_GeomFromGeoJSON(n.boundary_geojson::text),
        4326
      )
    )::extensions.geometry(MultiPolygon, 4326) geom
  from wine_map_nodes n
  where n.boundary_geojson is not null
), prepared as (
  select
    converted.*,
    seed.source_feature_id,
    snapshot.id source_snapshot_id,
    seed.boundary_method method
  from converted
  join world_wine_boundary_source_seed seed on seed.slug = converted.slug
  join wine_boundary_sources source
    on source.source_namespace = seed.source_namespace
   and source.source_feature_id = seed.source_feature_id
  join wine_boundary_source_snapshots snapshot
    on snapshot.source_id = source.id
   and snapshot.source_revision = seed.source_revision
   and snapshot.normalized_checksum_sha256 = seed.normalized_checksum_sha256
)
insert into wine_place_boundaries (
  wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs,
  generation_parameters, revision, is_current, reviewed_at
)
select
  id,
  source_snapshot_id,
  method,
  'VALIDATED',
  geom,
  extensions.ST_PointOnSurface(geom),
  array[
    extensions.ST_XMin(extensions.Box3D(geom)),
    extensions.ST_YMin(extensions.Box3D(geom)),
    extensions.ST_XMax(extensions.Box3D(geom)),
    extensions.ST_YMax(extensions.Box3D(geom))
  ]::double precision[],
  jsonb_build_object(
    'wine_map_slug', slug,
    'legacy_internal_source_id', source_feature_id,
    'source_layer', case when slug = 'france' then null else 'AOC-VITICOLES:aire_parcellaire' end,
    'underlying_parcel_ids_retained', case when slug = 'france' then null else false end,
    'legacy_provenance_note', case when slug = 'france'
      then 'Project-authored manual outline; no external raw response or parcel features apply. The pinned Git migration is the original retained artifact.'
      else 'The original raw WFS response, retrieval timestamp, and parcel feature IDs were not retained; the normalized Git blob is the earliest immutable artifact.'
    end
  ),
  jsonb_build_object(
    'display_migration', case
      when slug = 'france' then '20260724090000_wine_map_real_boundaries.sql'
      else '20260726100000_wine_map_concave_boundaries.sql'
    end,
    'display_migration_sha256', case
      when slug = 'france' then 'C5196565DFB93ABD68F5C398717440C142FCE621A773CABE6CEAEF7BEE9A0D50'
      else '0DBC8A73D62C709745AAE739E0DE3FD31A67714B8EFC2C0EA1FF99A21624F0B6'
    end,
    'generator', case when slug = 'france'
      then null
      else 'scripts/generate-wine-map-concave-boundaries.mjs@1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7'
    end,
    'concaveman_version', case when slug = 'france' then null else '2.0.0' end,
    'concavity', case when slug = 'france' then null else 2 end,
    'edge_threshold_divisor', case when slug = 'france' then null else 30 end,
    'coordinate_precision', case when slug = 'france' then null else 4 end,
    'max_edge_diagonal_share', case when slug = 'france' then null else 0.2 end,
    'min_component_area_share', case when slug = 'france' then null else 0.02 end
  ),
  case when slug = 'france' then '20260724090000' else '20260726100000' end,
  true,
  now()
from prepared;

do $$
begin
  if (select count(*) from wine_places) <> 14
     or (select count(*) from wine_place_articles) <> 14
     or (select count(*) from wine_boundary_sources) <> 14
     or (select count(*) from wine_boundary_source_snapshots) <> 14
     or (select count(*) from wine_place_boundaries) <> 14 then
    raise exception 'legacy catalog migration did not create exactly 14 rows in every required table';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    join wine_map_nodes node on node.slug = expected.slug
    left join wine_places place on place.canonical_key = expected.canonical_key
    left join wine_place_articles article on article.wine_place_id = place.id
    left join wine_boundary_sources source
      on source.source_namespace = expected.source_namespace
     and source.source_feature_id = expected.source_feature_id
    left join wine_boundary_source_snapshots snapshot
      on snapshot.source_id = source.id
    left join wine_place_boundaries boundary
      on boundary.wine_place_id = place.id and boundary.is_current
    where place.id is distinct from node.id
       or place.publication_status is distinct from 'VERIFIED'
       or place.canonical_key_locked_at is null
       or article.wine_place_id is null
       or source.id is null
       or snapshot.id is null
       or snapshot.raw_snapshot_uri is not null
       or snapshot.raw_checksum_sha256 is not null
       or snapshot.provenance_note is null
       or boundary.boundary_method is distinct from expected.boundary_method
       or boundary.quality_status is distinct from 'VALIDATED'
       or extensions.ST_Equals(
            boundary.display_geometry,
            extensions.ST_Multi(
              extensions.ST_SetSRID(
                extensions.ST_GeomFromGeoJSON(node.boundary_geojson::text),
                4326
              )
            )
          ) is not true
  ) then
    raise exception 'legacy catalog migration failed per-place parity or provenance checks';
  end if;
end;
$$;
```

Link exact scoring references and abort on unexpected row counts:

```sql
create temporary table world_wine_reference_seed (
  current_name text not null,
  replay_name text not null,
  canonical_key text primary key
) on commit drop;

insert into world_wine_reference_seed values
  ('Barsac AOP', 'Barsac', 'france.bordeaux.sauternes.barsac'),
  ('Graves AOP', 'Graves', 'france.bordeaux.graves'),
  ('Haut-Médoc AOP', 'Haut-Médoc', 'france.bordeaux.haut-medoc'),
  ('Margaux AOP', 'Margaux', 'france.bordeaux.haut-medoc.margaux'),
  ('Médoc AOP', 'Médoc', 'france.bordeaux.medoc'),
  ('Pauillac AOP', 'Pauillac', 'france.bordeaux.haut-medoc.pauillac'),
  ('Pessac-Léognan AOP', 'Pessac-Léognan', 'france.bordeaux.pessac-leognan'),
  ('Pomerol AOP', 'Pomerol', 'france.bordeaux.pomerol'),
  ('Saint-Estèphe AOP', 'Saint-Estèphe', 'france.bordeaux.haut-medoc.saint-estephe'),
  ('Saint-Émilion AOP', 'Saint-Émilion', 'france.bordeaux.saint-emilion'),
  ('Saint-Julien AOP', 'Saint-Julien', 'france.bordeaux.haut-medoc.saint-julien'),
  ('Sauternes AOP', 'Sauternes', 'france.bordeaux.sauternes');

do $$
declare
  v_count int;
begin
  update countries c
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from wine_places p
  where c.name = 'France' and p.canonical_key = 'france';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected 1 France link, got %', v_count; end if;

  update regions r
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from countries c, wine_places p
  where r.country_id = c.id and c.name = 'France' and r.name = 'Bordeaux'
    and p.canonical_key = 'france.bordeaux';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected 1 Bordeaux link, got %', v_count; end if;

  select count(*) into v_count
  from world_wine_reference_seed e
  where (
    select count(*)
    from appellations a
    join regions r on r.id = a.region_id
    join countries c on c.id = r.country_id
    where c.name = 'France'
      and r.name = 'Bordeaux'
      and a.name in (e.current_name, e.replay_name)
  ) = 1;
  if v_count <> 12 then
    raise exception 'expected one exact row for each of 12 Bordeaux appellations, got %', v_count;
  end if;

  update appellations a
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from regions r
  join countries c on c.id = r.country_id
  join world_wine_reference_seed e on true
  join wine_places p on p.canonical_key = e.canonical_key
  where a.region_id = r.id
    and c.name = 'France'
    and r.name = 'Bordeaux'
    and a.name in (e.current_name, e.replay_name);
  get diagnostics v_count = row_count;
  if v_count <> 12 then raise exception 'expected 12 Bordeaux appellation links, got %', v_count; end if;
end;
$$;
```

- [ ] **Step 4: Verify both migrations transactionally against current live names**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  $env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260727090000_world_wine_map_foundation.sql;supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql"
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Current-name transaction test failed." }
} finally {
  Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS -ErrorAction SilentlyContinue
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

- [ ] **Step 5: Verify both migrations transactionally against clean-replay names**

Run the same exact migration files after the harness changes only the 12 scoped
live names to their clean-replay forms inside the outer transaction:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  $env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260727090000_world_wine_map_foundation.sql;supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql"
  $env:WORLD_WINE_MAP_REFERENCE_NAMES = "REPLAY"
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Replay-name transaction test failed." }
} finally {
  Remove-Item Env:WORLD_WINE_MAP_REFERENCE_NAMES -ErrorAction SilentlyContinue
  Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS -ErrorAction SilentlyContinue
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

Expected for both GREEN runs: 14 tests pass, the post-live concurrency test is
skipped, both migration history rows exist inside the test transaction, and the
`after` hook proves the database returns to its exact pre-test footprint.

- [ ] **Step 6: Commit Task 2**

Inspect status/diff/log and stage only the seed migration and extended test. Do
not apply either migration live yet.

```powershell
git add supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql scripts/world-wine-map-foundation.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: migrate Bordeaux into canonical wine places"
if ($LASTEXITCODE -ne 0) { throw "Task 2 commit failed." }
```

---

### Task 3: Hand-Written Database Type Contract

**Files:**
- Create: `src/lib/supabase/world-wine-map-database.type-test.ts`
- Modify: `src/lib/supabase/database.types.ts:12-41,103-138`

**Interfaces:**
- Exports union types matching every new enum.
- Extends country/region/appellation Row/Insert/Update shapes with mapping fields.
- Exposes all eight new tables through `Database["public"]["Tables"]`.
- Keeps PostGIS geometries and JSONB fields typed `unknown` at the database edge.

- [ ] **Step 1: Write the failing compile-time contract**

Create `src/lib/supabase/world-wine-map-database.type-test.ts`:

```ts
import type {
  Database,
  WineArticleStatus,
  WineBoundaryMethod,
  WineBoundaryQualityStatus,
  WineMapReleaseStatus,
  WinePlaceKind,
  WinePlacePublicationStatus,
  WinePlaceRelationshipType,
  WineReferenceMapStatus,
} from "./database.types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

type WinePlace = Database["public"]["Tables"]["wine_places"]["Row"];
type Alias = Database["public"]["Tables"]["wine_place_aliases"]["Row"];
type Relationship =
  Database["public"]["Tables"]["wine_place_relationships"]["Row"];
type Article = Database["public"]["Tables"]["wine_place_articles"]["Row"];
type Source = Database["public"]["Tables"]["wine_boundary_sources"]["Row"];
type Snapshot =
  Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Row"];
type Boundary = Database["public"]["Tables"]["wine_place_boundaries"]["Row"];
type Release = Database["public"]["Tables"]["wine_map_releases"]["Row"];
type Appellation = Database["public"]["Tables"]["appellations"]["Row"];

export type WinePlaceKindContract = Expect<
  Equal<WinePlace["kind"], WinePlaceKind>
>;
export type PublicationStatusContract = Expect<
  Equal<WinePlace["publication_status"], WinePlacePublicationStatus>
>;
export type CanonicalKeyLockContract = Expect<
  Equal<WinePlace["canonical_key_locked_at"], string | null>
>;
export type AliasPlaceContract = Expect<
  Equal<Alias["wine_place_id"], string>
>;
export type RelationshipTypeContract = Expect<
  Equal<Relationship["relationship_type"], WinePlaceRelationshipType>
>;
export type ArticleStatusContract = Expect<
  Equal<Article["editorial_status"], WineArticleStatus>
>;
export type SourceChecksumContract = Expect<
  Equal<Snapshot["normalized_checksum_sha256"], string>
>;
export type SourceFeatureIdentityContract = Expect<
  Equal<Source["source_feature_id"], string>
>;
export type BoundaryMethodContract = Expect<
  Equal<Boundary["boundary_method"], WineBoundaryMethod>
>;
export type BoundaryQualityContract = Expect<
  Equal<Boundary["quality_status"], WineBoundaryQualityStatus>
>;
export type ReleaseStatusContract = Expect<
  Equal<Release["status"], WineMapReleaseStatus>
>;
export type ReferenceStatusContract = Expect<
  Equal<Appellation["map_status"], WineReferenceMapStatus>
>;
export type GeometryAtEdgeContract = Expect<
  Equal<Boundary["display_geometry"], unknown>
>;
export type ReferenceLinkNullableContract = Expect<
  Equal<Appellation["wine_place_id"], string | null>
>;
export type SnapshotInsertContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Insert"]["normalized_artifact_uri"],
    string
  >
>;
export type PlaceUpdateContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_places"]["Update"]["canonical_key"],
    string | undefined
  >
>;
export type FoundationRelationshipsContract = Expect<
  Equal<
    [
      Database["public"]["Tables"]["wine_places"]["Relationships"],
      Database["public"]["Tables"]["wine_place_aliases"]["Relationships"],
      Database["public"]["Tables"]["wine_place_relationships"]["Relationships"],
      Database["public"]["Tables"]["wine_place_articles"]["Relationships"],
      Database["public"]["Tables"]["wine_boundary_sources"]["Relationships"],
      Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Relationships"],
      Database["public"]["Tables"]["wine_place_boundaries"]["Relationships"],
      Database["public"]["Tables"]["wine_map_releases"]["Relationships"],
    ],
    [[], [], [], [], [], [], [], []]
  >
>;
export type ViewsContract = Expect<
  Equal<Database["public"]["Views"], Record<string, never>>
>;
export type BoundaryMethodValuesContract = Expect<
  Equal<
    WineBoundaryMethod,
    | "OFFICIAL"
    | "GENERALIZED_FROM_OFFICIAL_SOURCE"
    | "DERIVED_FROM_DESCENDANTS"
    | "MANUAL"
  >
>;
```

- [ ] **Step 2: Run TypeScript and verify RED**

Run: `npx tsc --noEmit`

Expected: FAIL because the new enum exports/tables/reference fields are absent.

- [ ] **Step 3: Update `database.types.ts`**

Add these exported unions:

```ts
export type WinePlaceKind =
  | "COUNTRY"
  | "MACRO_REGION"
  | "REGION"
  | "SUBREGION"
  | "APPELLATION"
  | "SITE"
  | "VINEYARD";
export type WinePlacePublicationStatus = "DRAFT" | "VERIFIED" | "EXCLUDED";
export type WinePlaceRelationshipType = "OVERLAPS" | "ALTERNATE_PARENT" | "RELATED";
export type WineArticleStatus = "PLACEHOLDER" | "DRAFT" | "PUBLISHED";
export type WineReferenceMapStatus =
  | "PENDING"
  | "VERIFIED"
  | "SYNTHETIC"
  | "DUPLICATE"
  | "INVALID"
  | "NOT_GEOGRAPHIC";
export type WineBoundaryMethod =
  | "OFFICIAL"
  | "GENERALIZED_FROM_OFFICIAL_SOURCE"
  | "DERIVED_FROM_DESCENDANTS"
  | "MANUAL";
export type WineBoundaryQualityStatus = "DRAFT" | "VALIDATED" | "REJECTED";
export type WineMapReleaseStatus =
  | "BUILDING"
  | "VALIDATED"
  | "ACTIVE"
  | "RETIRED"
  | "FAILED";
```

Replace the generic reference helpers with map-aware shapes:

```ts
type ReferenceMapFields = {
  wine_place_id: string | null;
  map_status: WineReferenceMapStatus;
  map_match_method: string | null;
  map_match_confidence: number | null;
  map_reviewed_by: string | null;
  map_reviewed_at: string | null;
  map_review_note: string | null;
};

type ReferenceMapInsertFields = {
  wine_place_id?: string | null;
  map_status?: WineReferenceMapStatus;
  map_match_method?: string | null;
  map_match_confidence?: number | null;
  map_reviewed_by?: string | null;
  map_reviewed_at?: string | null;
  map_review_note?: string | null;
};

type ReferenceTable = {
  Row: { id: string; name: string } & ReferenceMapFields;
  Insert: { id?: string; name: string } & ReferenceMapInsertFields;
  Update: Partial<{ id: string; name: string } & ReferenceMapFields>;
  Relationships: [];
};

type ScopedReferenceTable<ParentKey extends string> = {
  Row: { id: string; name: string } & Record<ParentKey, string> & ReferenceMapFields;
  Insert: { id?: string; name: string } & Record<ParentKey, string> &
    ReferenceMapInsertFields;
  Update: Partial<
    { id: string; name: string } & Record<ParentKey, string> & ReferenceMapFields
  >;
  Relationships: [];
};
```

Add these exact Row/Insert/Update/Relationships entries under
`Database["public"]["Tables"]`:

```ts
wine_places: {
  Row: {
    id: string;
    primary_parent_id: string | null;
    kind: WinePlaceKind;
    canonical_key: string;
    canonical_key_locked_at: string | null;
    name: string;
    slug: string;
    display_tier: number;
    min_zoom: number;
    label_min_zoom: number;
    publication_status: WinePlacePublicationStatus;
    sort_order: number;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    primary_parent_id?: string | null;
    kind: WinePlaceKind;
    canonical_key: string;
    canonical_key_locked_at?: string | null;
    name: string;
    slug: string;
    display_tier: number;
    min_zoom: number;
    label_min_zoom: number;
    publication_status?: WinePlacePublicationStatus;
    sort_order?: number;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["wine_places"]["Insert"]>;
  Relationships: [];
};
wine_place_aliases: {
  Row: {
    id: string;
    wine_place_id: string;
    name: string;
    normalized_name: string;
    language_code: string;
    alias_type: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    wine_place_id: string;
    name: string;
    normalized_name: string;
    language_code?: string;
    alias_type: string;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_place_aliases"]["Insert"]
  >;
  Relationships: [];
};
wine_place_relationships: {
  Row: {
    source_place_id: string;
    target_place_id: string;
    relationship_type: WinePlaceRelationshipType;
    note: string | null;
    created_at: string;
  };
  Insert: {
    source_place_id: string;
    target_place_id: string;
    relationship_type: WinePlaceRelationshipType;
    note?: string | null;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_place_relationships"]["Insert"]
  >;
  Relationships: [];
};
wine_place_articles: {
  Row: {
    wine_place_id: string;
    description: string | null;
    climate: string | null;
    grape_varieties: string | null;
    wine_styles: string | null;
    key_facts: string[] | null;
    editorial_status: WineArticleStatus;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    wine_place_id: string;
    description?: string | null;
    climate?: string | null;
    grape_varieties?: string | null;
    wine_styles?: string | null;
    key_facts?: string[] | null;
    editorial_status?: WineArticleStatus;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_place_articles"]["Insert"]
  >;
  Relationships: [];
};
wine_boundary_sources: {
  Row: {
    id: string;
    source_namespace: string;
    source_feature_id: string;
    authority: string;
    jurisdiction: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    source_namespace: string;
    source_feature_id: string;
    authority: string;
    jurisdiction: string;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_boundary_sources"]["Insert"]
  >;
  Relationships: [];
};
wine_boundary_source_snapshots: {
  Row: {
    id: string;
    source_id: string;
    source_revision: string;
    retrieved_at: string | null;
    source_url: string | null;
    licence: string;
    raw_snapshot_uri: string | null;
    raw_checksum_sha256: string | null;
    normalized_artifact_uri: string;
    normalized_checksum_sha256: string;
    provenance_note: string | null;
    importer_version: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    source_id: string;
    source_revision: string;
    retrieved_at?: string | null;
    source_url?: string | null;
    licence: string;
    raw_snapshot_uri?: string | null;
    raw_checksum_sha256?: string | null;
    normalized_artifact_uri: string;
    normalized_checksum_sha256: string;
    provenance_note?: string | null;
    importer_version: string;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Insert"]
  >;
  Relationships: [];
};
wine_place_boundaries: {
  Row: {
    id: string;
    wine_place_id: string;
    source_snapshot_id: string;
    boundary_method: WineBoundaryMethod;
    quality_status: WineBoundaryQualityStatus;
    display_geometry: unknown;
    label_point: unknown;
    bbox: number[];
    source_feature_refs: unknown;
    generation_parameters: unknown;
    revision: string;
    is_current: boolean;
    reviewed_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    wine_place_id: string;
    source_snapshot_id: string;
    boundary_method: WineBoundaryMethod;
    quality_status?: WineBoundaryQualityStatus;
    display_geometry: unknown;
    label_point: unknown;
    bbox: number[];
    source_feature_refs?: unknown;
    generation_parameters?: unknown;
    revision: string;
    is_current?: boolean;
    reviewed_at?: string | null;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_place_boundaries"]["Insert"]
  >;
  Relationships: [];
};
wine_map_releases: {
  Row: {
    id: string;
    version: string;
    status: WineMapReleaseStatus;
    manifest_url: string | null;
    manifest_checksum_sha256: string | null;
    tile_checksums: unknown;
    feature_counts: unknown;
    build_inputs: unknown;
    validation_report: unknown;
    promoted_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    version: string;
    status?: WineMapReleaseStatus;
    manifest_url?: string | null;
    manifest_checksum_sha256?: string | null;
    tile_checksums?: unknown;
    feature_counts?: unknown;
    build_inputs?: unknown;
    validation_report?: unknown;
    promoted_at?: string | null;
    created_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["wine_map_releases"]["Insert"]
  >;
  Relationships: [];
};
```

- [ ] **Step 4: Run TypeScript and verify GREEN**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed." }
```

Expected: exit 0 with no output.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/lib/supabase/database.types.ts src/lib/supabase/world-wine-map-database.type-test.ts
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "chore: type canonical wine map schema"
if ($LASTEXITCODE -ne 0) { throw "Task 3 commit failed." }
```

---

### Task 4: Domain Documentation And Final Verification

**Files:**
- Modify: `CLAUDE.md` in the Wine Map domain-rule section.
- Scratch, then delete: `scripts/scratch-apply-world-wine-map-migrations.mjs`

**Interfaces:**
- Documents the Phase 1 transition and prevents future work from treating raw reference rows as canonical places or current generalized boundaries as legal geometry.

- [ ] **Step 1: Update the domain rules**

Add this exact paragraph after the existing Wine Map boundary rules:

```markdown
- World Wine Map Phase 1 adds `wine_places` as the canonical future map
  catalog, plus aliases, articles, stable boundary-source identities,
  immutable source snapshots, reviewed PostGIS display geometries, and release
  metadata. New imports must retain genuine raw source artifacts; the migrated
  legacy Bordeaux rows explicitly record that their raw WFS responses,
  retrieval timestamps, and parcel IDs are unavailable and instead pin the
  earliest normalized Git artifacts. `wine_map_nodes` remains the active read
  source during Phase 1 and is retired only after the Phase 2 tile UI passes
  parity; there is no permanent dual-write. Existing
  country/region/appellation UUIDs and scoring behavior are unchanged. Their
  nullable `wine_place_id` and required `map_status` record curation explicitly:
  Phase 1 verifies only exact France, Bordeaux, and the 12 currently mapped
  Bordeaux appellations (accepting the clean-replay name or its live
  `AOP`-suffixed equivalent); every other row remains `PENDING`. PostGIS is the
  reviewed geometry/validation store for later offline tile builds, not a
  request-time tile service. The 13 Bordeaux footprints are
  `GENERALIZED_FROM_OFFICIAL_SOURCE`, while France is `MANUAL`; neither is a
  claim of legal boundary accuracy. PMTiles publication and map UI changes are
  Phase 2 work.
```

- [ ] **Step 2: Re-run both rollback-only database variants**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  $env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260727090000_world_wine_map_foundation.sql;supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql"
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Current-name transaction test failed." }
  $env:WORLD_WINE_MAP_REFERENCE_NAMES = "REPLAY"
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Replay-name transaction test failed." }
} finally {
  Remove-Item Env:WORLD_WINE_MAP_REFERENCE_NAMES -ErrorAction SilentlyContinue
  Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS -ErrorAction SilentlyContinue
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

Expected: both runs report 14 passing tests and one skipped post-live concurrency
test; both outer transactions restore the exact pre-test database footprint.

- [ ] **Step 3: Run repository verification**

```powershell
node --test scripts/generate-wine-map-concave-boundaries.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Boundary tests failed." }
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed." }
npx eslint scripts/world-wine-map-foundation.test.mjs scripts/generate-wine-map-concave-boundaries.mjs scripts/generate-wine-map-concave-boundaries.test.mjs src/lib/supabase/database.types.ts src/lib/supabase/world-wine-map-database.type-test.ts
if ($LASTEXITCODE -ne 0) { throw "ESLint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Working-tree diff check failed." }
```

Expected: every command exits 0; boundary tests report 11/11 passing; the
production build completes all routes.

- [ ] **Step 4: Verify non-regression and migration history**

The rollback-only database tests already prove the 14 IDs/articles/boundaries,
per-place methods and geometry equality, reference-ID/scoring-function digests,
and both migration-history records. Fetch first, then run these exact repository
checks to prove the application code stayed untouched:

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0) { throw "Could not read current branch." }
if ($branch -ne "master") { throw "Expected master, got $branch." }
$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve HEAD." }
$base = git merge-base origin/master HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve merge base." }
$remote = git rev-parse origin/master
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/master." }
if ($base -ne $remote) { throw "origin/master is not the direct reviewed base." }

$mapQuery = git grep -n -F '.from("wine_map_nodes")' -- src/app/knowledge/map/page.tsx
if ($LASTEXITCODE -ne 0 -or -not $mapQuery) {
  throw "Current map no longer reads wine_map_nodes."
}

git diff --exit-code "$base..$head" -- src/app/knowledge/map
if ($LASTEXITCODE -ne 0) { throw "Map application code changed." }
git diff --exit-code "$base..$head" -- src/app/tastings
if ($LASTEXITCODE -ne 0) { throw "Tasting/scoring application code changed." }

$expectedMigrations = @(
  "supabase/migrations/20260727090000_world_wine_map_foundation.sql",
  "supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql"
)
$actualMigrations = @(
  git diff --name-only "$base..$head" -- supabase/migrations
)
if ($LASTEXITCODE -ne 0) { throw "Could not enumerate migration changes." }
$migrationDiff = Compare-Object $expectedMigrations $actualMigrations
if ($migrationDiff) {
  $migrationDiff | Format-Table | Out-String | Write-Error
  throw "Unexpected migration files changed."
}
```

Expected: `git grep` finds the existing query and every diff/compare check exits
without output or error.

- [ ] **Step 5: Commit documentation**

Inspect `git status`, the documentation diff, and recent history; stage only
the intended domain-rule update.

```powershell
git add CLAUDE.md
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "docs: record world wine map foundation"
if ($LASTEXITCODE -ne 0) { throw "Task 4 documentation commit failed." }
```

- [ ] **Step 6: Request final code review**

Fetch again, assert the unpublished range has no remote-only commits, and review
that exact range:

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0) { throw "Could not read current branch." }
if ($branch -ne "master") { throw "Expected master, got $branch." }
$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed." }
if ($status) { throw "Worktree must be clean before final review.`n$status" }
$remote = git rev-parse origin/master
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/master." }
$base = git merge-base origin/master HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve merge base." }
$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve HEAD." }
if ($base -ne $remote) { throw "origin/master is not the direct review base." }
$counts = (git rev-list --left-right --count origin/master...HEAD) -split '\s+'
if ($LASTEXITCODE -ne 0) { throw "Could not calculate branch divergence." }
if ([int]$counts[0] -ne 0) { throw "origin/master has remote-only commits." }
@($remote, $head) | Set-Content -LiteralPath ".git/world-wine-map-reviewed-state" -Encoding ASCII
git diff --stat "$base..$head"
if ($LASTEXITCODE -ne 0) { throw "Could not summarize review range." }
git diff "$base..$head"
if ($LASTEXITCODE -ne 0) { throw "Could not render review range." }
git diff --check "$base..$head"
if ($LASTEXITCODE -ne 0) { throw "Reviewed range has whitespace errors." }
```

Dispatch the reviewer with `$base`, `$head`, this plan, and the approved spec.
Resolve every Critical/Important finding and re-run the covering verification
after fixes. Commit fixes separately, update `$head`, and request re-review if
any production code, migration, or test changed. Re-run this entire step after
every fix so `.git/world-wine-map-reviewed-state` records only the approved
remote and head SHAs.

- [ ] **Step 7: Apply both reviewed migrations atomically**

Create `scripts/scratch-apply-world-wine-map-migrations.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
const migrationPaths = process.argv.slice(2);
assert.equal(migrationPaths.length, 2, "exactly two migration paths are required");
const migrations = await Promise.all(
  migrationPaths.map(async (migrationPath) => {
    const match = /^(\d+)_([^/\\]+)\.sql$/.exec(basename(migrationPath));
    assert.ok(match, `Invalid migration filename: ${migrationPath}`);
    return {
      version: match[1],
      name: match[2],
      sql: await readFile(migrationPath, "utf8"),
    };
  }),
);
assert.deepEqual(
  migrations.map(({ version }) => version),
  ["20260727090000", "20260727093000"],
);

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const versions = migrations.map(({ version }) => version);
  const existing = await client.query(
    `select version, name
       from supabase_migrations.schema_migrations
      where version = any($1::text[])`,
    [versions],
  );
  assert.deepEqual(existing.rows, [], "a Phase 1 migration version already exists");

  await client.query("begin");
  for (const migration of migrations) {
    await client.query(migration.sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations
         (version, name, statements)
       values ($1, $2, $3)`,
      [migration.version, migration.name, [migration.sql]],
    );
  }
  await client.query("commit");
  console.log("Applied both Phase 1 migrations atomically.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
```

Confirm the reviewed migration files match `HEAD`, then apply them in one
transaction:

```powershell
$reviewed = @(Get-Content -LiteralPath ".git/world-wine-map-reviewed-state")
if ($reviewed.Count -ne 2) { throw "Missing approved review state." }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0) { throw "Could not read current branch." }
if ($branch -ne "master") { throw "Expected master, got $branch." }
$currentRemote = git rev-parse origin/master
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/master." }
$currentHead = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve HEAD." }
if ($currentRemote -ne $reviewed[0] -or $currentHead -ne $reviewed[1]) {
  throw "Reviewed Git state changed; run final review again before live apply."
}
$trackedStatus = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { throw "git status failed." }
if ($trackedStatus) { throw "Tracked files changed after review.`n$trackedStatus" }
git diff --exit-code HEAD -- supabase/migrations/20260727090000_world_wine_map_foundation.sql supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql
if ($LASTEXITCODE -ne 0) { throw "Reviewed migration files changed." }
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  node scripts/scratch-apply-world-wine-map-migrations.mjs supabase/migrations/20260727090000_world_wine_map_foundation.sql supabase/migrations/20260727093000_world_wine_map_bordeaux_seed.sql
  if ($LASTEXITCODE -ne 0) { throw "Atomic live migration apply failed." }
} finally {
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

- [ ] **Step 8: Verify the committed live schema and remove the scratch script**

Run without the rollback-only migration environment variables:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
try {
  node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Live database verification failed." }
} finally {
  Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item scripts/scratch-apply-world-wine-map-migrations.mjs -ErrorAction SilentlyContinue
}
```

Expected: all 15 tests pass, including the two-client concurrency test. If any
live test fails, do not edit either recorded migration; stop and create a new
timestamped corrective migration, then repeat transactional tests and review
before applying it.

- [ ] **Step 9: Push directly to master**

Inspect `git status`, the full unpublished diff, and `git log --oneline -10`.
The worktree must be clean before pushing.

```powershell
$reviewed = @(Get-Content -LiteralPath ".git/world-wine-map-reviewed-state")
if ($reviewed.Count -ne 2) { throw "Missing approved review state." }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0) { throw "Could not read current branch." }
if ($branch -ne "master") { throw "Expected master, got $branch." }
$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed." }
if ($status) { throw "Worktree must be clean before push.`n$status" }
$remote = git rev-parse origin/master
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/master." }
$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve HEAD." }
if ($remote -ne $reviewed[0] -or $head -ne $reviewed[1]) {
  throw "Git state changed after review; review again before push."
}
$base = git merge-base origin/master HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve merge base." }
if ($base -ne $remote) { throw "origin/master changed after review; review again." }
$counts = (git rev-list --left-right --count origin/master...HEAD) -split '\s+'
if ($LASTEXITCODE -ne 0) { throw "Could not calculate branch divergence." }
if ([int]$counts[0] -ne 0) { throw "origin/master has remote-only commits." }
git push origin master
if ($LASTEXITCODE -ne 0) { throw "git push failed." }
$local = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not resolve HEAD after push." }
$pushed = git rev-parse origin/master
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/master after push." }
if ($local -ne $pushed) { throw "HEAD and origin/master differ after push." }
Remove-Item ".git/world-wine-map-reviewed-state" -ErrorAction SilentlyContinue
```

Expected: the divergence check reports `0` remote-only commits, push succeeds as `master -> master`, and post-push `HEAD` equals `origin/master`.
