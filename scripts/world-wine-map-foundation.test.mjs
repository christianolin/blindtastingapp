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
      // Database helper, not a React hook.
      // eslint-disable-next-line react-hooks/rules-of-hooks
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
        mutation = client.query("truncate wine_boundary_source_snapshots cascade");
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
  { names: ["Fronsac AOP", "Fronsac"], key: "france.bordeaux.fronsac" },
  { names: ["Canon-Fronsac AOP", "Canon-Fronsac"], key: "france.bordeaux.canon-fronsac" },
  { names: ["Côtes de Bourg AOP", "Côtes de Bourg"], key: "france.bordeaux.cotes-de-bourg" },
  { names: ["Entre-Deux-Mers AOP", "Entre-deux-Mers"], key: "france.bordeaux.entre-deux-mers" },
  { names: ["Vosne-Romanée AOP", "Vosne-Romanée"], key: "france.bourgogne.cote-de-nuits.vosne-romanee" },
  { names: ["Échezeaux AOP", "Échezeaux"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux" },
  { names: ["Grands Échezeaux AOP", "Grands-Échezeaux AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.grands-echezeaux" },
  { names: ["Richebourg AOP", "Richebourg"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.richebourg" },
  { names: ["Romanée-Conti AOP", "Romanée-Conti"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.romanee-conti" },
  { names: ["La Romanée AOP", "La Romanée"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-romanee" },
  { names: ["La Tâche AOP", "La Tâche"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache" },
  { names: ["Romanée-Saint-Vivant AOP", "Romanée-Saint-Vivant"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.romanee-saint-vivant" },
  { names: ["Au-dessus des Malconsorts AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.au-dessus-des-malconsorts" },
  { names: ["Aux Malconsorts AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-malconsorts" },
  { names: ["Aux Raignots AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-raignots" },
  { names: ["Cros Parantoux AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.cros-parantoux" },
  { names: ["En Orveaux AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.en-orveaux" },
  { names: ["La Croix Rameau AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.la-croix-rameau" },
  { names: ["Les Beaux Monts AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-beaux-monts" },
  { names: ["Les Gaudichots AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-gaudichots" },
  { names: ["Les Rouges AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-rouges" },
  { names: ["Les Suchots AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots" },
  { names: ["Marsannay AOP"], key: "france.bourgogne.cote-de-nuits.marsannay" },
  { names: ["Fixin AOP"], key: "france.bourgogne.cote-de-nuits.fixin" },
  { names: ["Gevrey-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin" },
  { names: ["Morey-Saint-Denis AOP"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis" },
  { names: ["Chambolle-Musigny AOP"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny" },
  { names: ["Vougeot AOP"], key: "france.bourgogne.cote-de-nuits.vougeot" },
  { names: ["Nuits-Saint-Georges AOP"], key: "france.bourgogne.cote-de-nuits.nuits-saint-georges" },
  { names: ["Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin" },
  { names: ["Chambertin-Clos de Bèze AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze" },
  { names: ["Chapelle-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chapelle-chambertin" },
  { names: ["Charmes-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.charmes-chambertin" },
  { names: ["Griotte-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.griotte-chambertin" },
  { names: ["Latricieres-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.latricieres-chambertin" },
  { names: ["Mazis-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.mazis-chambertin" },
  { names: ["Mazoyeres-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.mazoyeres-chambertin" },
  { names: ["Ruchottes-Chambertin AOP"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.ruchottes-chambertin" },
  { names: ["Clos de la Roche AOP"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-la-roche" },
  { names: ["Clos Saint-Denis AOP"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-saint-denis" },
  { names: ["Clos des Lambrays AOP"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-des-lambrays" },
  { names: ["Clos de Tart AOP"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-tart" },
  { names: ["Bonnes-Mares AOP"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny.bonnes-mares" },
  { names: ["Musigny AOP"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny.musigny" },
  { names: ["Clos de Vougeot AOP"], key: "france.bourgogne.cote-de-nuits.vougeot.clos-de-vougeot" },
  { names: ["Ladoix AOP"], key: "france.bourgogne.cote-de-beaune.ladoix" },
  { names: ["Aloxe-Corton AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton" },
  { names: ["Pernand-Vergelesses AOP"], key: "france.bourgogne.cote-de-beaune.pernand-vergelesses" },
  { names: ["Savigny-les-Beaune AOP"], key: "france.bourgogne.cote-de-beaune.savigny-les-beaune" },
  { names: ["Chorey-les-Beaune AOP"], key: "france.bourgogne.cote-de-beaune.chorey-les-beaune" },
  { names: ["Beaune AOP"], key: "france.bourgogne.cote-de-beaune.beaune" },
  { names: ["Pommard AOP"], key: "france.bourgogne.cote-de-beaune.pommard" },
  { names: ["Volnay AOP"], key: "france.bourgogne.cote-de-beaune.volnay" },
  { names: ["Monthelie AOP"], key: "france.bourgogne.cote-de-beaune.monthelie" },
  { names: ["Auxey-Duresses AOP"], key: "france.bourgogne.cote-de-beaune.auxey-duresses" },
  { names: ["Saint-Romain AOP"], key: "france.bourgogne.cote-de-beaune.saint-romain" },
  { names: ["Meursault AOP"], key: "france.bourgogne.cote-de-beaune.meursault" },
  { names: ["Puligny-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet" },
  { names: ["Chassagne-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.chassagne-montrachet" },
  { names: ["Saint-Aubin AOP"], key: "france.bourgogne.cote-de-beaune.saint-aubin" },
  { names: ["Santenay AOP"], key: "france.bourgogne.cote-de-beaune.santenay" },
  { names: ["Maranges AOP"], key: "france.bourgogne.cote-de-beaune.maranges" },
  { names: ["Corton AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton" },
  { names: ["Le Corton AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton" },
  { names: ["Corton-Charlemagne AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne" },
  { names: ["Charlemagne AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne" },
  { names: ["Le Charlemagne AOP"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne" },
  { names: ["Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet" },
  { names: ["Chevalier-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet" },
  { names: ["Bâtard-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet" },
  { names: ["Bienvenues-Bâtard-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet" },
  { names: ["Criots-Bâtard-Montrachet AOP"], key: "france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet" },
  { names: ["Chablis AOP"], key: "france.bourgogne.chablis.chablis" },
  { names: ["Petit Chablis AOP"], key: "france.bourgogne.chablis.petit-chablis" },
  { names: ["Chablis Grand Cru"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru" },
  { names: ["Irancy AOP"], key: "france.bourgogne.grand-auxerrois.irancy" },
  { names: ["Saint-Bris AOP"], key: "france.bourgogne.grand-auxerrois.saint-bris" },
  { names: ["Vezelay AOP"], key: "france.bourgogne.grand-auxerrois.vezelay" },
  { names: ["Bouzeron AOP"], key: "france.bourgogne.cote-chalonnaise.bouzeron" },
  { names: ["Rully AOP"], key: "france.bourgogne.cote-chalonnaise.rully" },
  { names: ["Mercurey AOP"], key: "france.bourgogne.cote-chalonnaise.mercurey" },
  { names: ["Givry AOP"], key: "france.bourgogne.cote-chalonnaise.givry" },
  { names: ["Montagny AOP"], key: "france.bourgogne.cote-chalonnaise.montagny" },
  { names: ["Macon AOP"], key: "france.bourgogne.maconnais.macon" },
  { names: ["Vire-Clesse AOP"], key: "france.bourgogne.maconnais.vire-clesse" },
  { names: ["Pouilly-Fuissé AOP"], key: "france.bourgogne.maconnais.pouilly-fuisse" },
  { names: ["Pouilly-Vinzelles AOP"], key: "france.bourgogne.maconnais.pouilly-vinzelles" },
  { names: ["Pouilly-Loche AOP"], key: "france.bourgogne.maconnais.pouilly-loche" },
  { names: ["Saint-Véran AOP"], key: "france.bourgogne.maconnais.saint-veran" },
  { names: ["Listrac-Médoc AOP"], key: "france.bordeaux.haut-medoc.listrac-medoc" },
  { names: ["Montagne-Saint-Emilion AOP"], key: "france.bordeaux.montagne-saint-emilion" },
  { names: ["Lussac-Saint-Emilion AOP"], key: "france.bordeaux.lussac-saint-emilion" },
  { names: ["Puisseguin-Saint-Emilion AOP"], key: "france.bordeaux.puisseguin-saint-emilion" },
  { names: ["Saint-Georges-Saint-Emilion AOP"], key: "france.bordeaux.saint-georges-saint-emilion" },
  { names: ["Lalande-de-Pomerol AOP"], key: "france.bordeaux.lalande-de-pomerol" },
  { names: ["Cadillac AOP"], key: "france.bordeaux.cadillac" },
  { names: ["Cerons AOP"], key: "france.bordeaux.cerons" },
  { names: ["Loupiac AOP"], key: "france.bordeaux.loupiac" },
  { names: ["Sainte-Croix-du-Mont AOP"], key: "france.bordeaux.sainte-croix-du-mont" },
  { names: ["Bougros AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.bougros" },
  { names: ["Preuses AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.preuses" },
  { names: ["Vaudesir AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.vaudesir" },
  { names: ["Grenouilles AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.grenouilles" },
  { names: ["Valmur AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.valmur" },
  { names: ["Les Clos AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.les-clos" },
  { names: ["Blanchot AOP"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.blanchot" },
  { names: ["Beaujolais AOP"], key: "france.beaujolais" },
  { names: ["Beaujolais-Villages AOP"], key: "france.beaujolais.beaujolais-villages" },
  { names: ["Brouilly AOP"], key: "france.beaujolais.brouilly" },
  { names: ["Cote de Brouilly AOP"], key: "france.beaujolais.cote-de-brouilly" },
  { names: ["Chenas AOP"], key: "france.beaujolais.chenas" },
  { names: ["Chiroubles AOP"], key: "france.beaujolais.chiroubles" },
  { names: ["Fleurie AOP"], key: "france.beaujolais.fleurie" },
  { names: ["Julienas AOP"], key: "france.beaujolais.julienas" },
  { names: ["Morgon AOP"], key: "france.beaujolais.morgon" },
  { names: ["Moulin-a-Vent AOP"], key: "france.beaujolais.moulin-a-vent" },
  { names: ["Regnie AOP"], key: "france.beaujolais.regnie" },
  { names: ["Saint-Amour AOP"], key: "france.beaujolais.saint-amour" },
  { names: ["Côte-Rôtie AOP"], key: "france.rhone.cote-rotie" },
  { names: ["Condrieu AOP"], key: "france.rhone.condrieu" },
  { names: ["Chateau-Grillet AOP"], key: "france.rhone.chateau-grillet" },
  { names: ["Saint-Joseph AOP"], key: "france.rhone.saint-joseph" },
  { names: ["Hermitage AOP"], key: "france.rhone.hermitage" },
  { names: ["Crozes-Hermitage AOP"], key: "france.rhone.crozes-hermitage" },
  { names: ["Cornas AOP"], key: "france.rhone.cornas" },
  { names: ["Saint-Peray AOP"], key: "france.rhone.saint-peray" },
];

// Post-review current-boundary set: pinned from the live reviewed state by
// scripts/wine-map-sources/generate-boundary-expectations.mjs. Regenerate
// ONLY after a reviewed flip; the JSON diff is part of the review evidence.
const EXPECTED_BOUNDARIES = JSON.parse(
  await readFile(
    new URL("../data/wine-map/boundary-expectations.json", import.meta.url),
    "utf8",
  ),
);

test("all migrated places have valid reviewed current boundaries", async () => {
  const result = await client.query(
    `select count(*)::int total,
            count(*) filter (where b.quality_status = 'VALIDATED')::int validated,
            count(*) filter (where b.is_current)::int current,
             count(*) filter (where extensions.ST_IsValid(b.display_geometry))::int valid,
             count(*) filter (where extensions.ST_Covers(b.display_geometry, b.label_point))::int labelled,
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
       from wine_place_boundaries b`,
  );
  // After the Phase 3C Task 5a flips: +23 Vosne-subtree dissolve boundaries
  // and +1 DERIVED_FROM_DESCENDANTS district (Côte de Nuits), all validated
  // + current; superseded non-current rows are retained as history.
  // Wave 3D-1 adds 40 Côte de Beaune dissolve boundaries plus 1 derived
  // district footprint (all validated + current); superseded rows retained.
  // Phase 3D complete: all six Burgundy districts, their 23 wave-2/3
  // children, and Bourgogne's own derived outline.
  assert.deepEqual(result.rows[0], {
    // +12 Beaujolais + 9 Vallee du Rhone (8 crus GENERALIZED + 1 region
    // DERIVED_FROM_DESCENDANTS = union of its crus), all validated + current.
    total: 881,
    validated: 881,
    current: 815,
    valid: 881,
    labelled: 881,
    // France + Champagne are the two MANUAL boundaries; Beaujolais + the 8
    // Rhone crus are GENERALIZED; france.rhone is derived from its crus.
    manual: 3,
    generalized: 854,
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
      where b.is_current
      order by p.canonical_key`,
  );
  assert.deepEqual(classifications.rows, EXPECTED_BOUNDARIES);

  // snapshots counts LINKED snapshots, not the table: the CRS-corrected
  // re-stage of the seven Bordeaux boundaries left seven immutable orphan
  // snapshot rows (the snapshot immutability trigger forbids deleting them),
  // so the table holds more rows than there are boundaries. Provenance
  // integrity here means "every boundary resolves to a distinct snapshot and
  // source" — all counts scoped to what boundaries actually reference.
  // Unreferenced source/snapshot rows can exist as permanent history (both
  // are delete-protected): a deleted intermediate DRAFT leaves its evidence
  // rows behind by design, and they are deliberately excluded here.
  const provenance = await client.query(
    `select
       count(distinct s.id)::int sources,
       count(distinct snapshot.id)::int snapshots,
       count(distinct (s.source_namespace, s.source_feature_id))::int identities,
       count(*)::int linked_boundaries
     from wine_place_boundaries b
     join wine_boundary_source_snapshots snapshot
       on snapshot.id = b.source_snapshot_id
     join wine_boundary_sources s on s.id = snapshot.source_id`,
  );
  // Boundary revisions share their place's source identity, so identities
  // tracks sources (== proves nothing dangles) while snapshots/linked grow
  // with retained superseded revisions.
  // Trim revisions REUSE their plot's snapshot (same evidence, corrected
  // generalization), so linked boundaries outnumber distinct snapshots.
  // Source/snapshot totals drift upward when a boundary is re-derived under
  // a fresh slug (each mints a new immutable identity; superseded ones are
  // harmless history). Pin the load-bearing invariants instead: every
  // boundary row carries provenance, and identities never collide. Exact
  // geometry integrity is pinned separately via boundary-expectations.json.
  const prov = provenance.rows[0];
  assert.equal(prov.linked_boundaries, 881);
  assert.equal(prov.sources, prov.identities, "source identities must be unique");
  assert.ok(
    prov.snapshots >= prov.sources,
    `snapshots (${prov.snapshots}) below sources (${prov.sources})`,
  );
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
      where r.map_status = 'VERIFIED'
      order by p.canonical_key`,
  );
  assert.deepEqual(region.rows, [
    { name: "Beaujolais", canonical_key: "france.beaujolais" },
    { name: "Bordeaux", canonical_key: "france.bordeaux" },
    { name: "Bourgogne", canonical_key: "france.bourgogne" },
    { name: "Champagne", canonical_key: "france.champagne" },
    { name: "Rhône", canonical_key: "france.rhone" },
  ]);

  const appellations = await client.query(
    `select a.name, p.canonical_key
       from appellations a
       join regions r on r.id = a.region_id
       join countries c on c.id = r.country_id
       join wine_places p on p.id = a.wine_place_id
      where a.map_status = 'VERIFIED'
       order by a.id`,
  );
  assert.equal(appellations.rows.length, 138);
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
    ["regions", 5],
    ["appellations", 138],
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
                  and map_review_note in (
                    'Phase 1 canonical migration', 'Phase 3A canonical migration',
                    'Phase 3C cote-de-nuits migration',
                    'Phase 3D cote-de-beaune migration: exact name match',
                    'Phase 3D districts migration: exact name match',
                    'Phase 3E bordeaux migration: exact name match',
                    'Phase 3F chablis-climats migration: exact name match',
                    'Champagne region migration: exact name match',
                    'Beaujolais region migration: exact name match',
                    'Rhone region migration: exact name match'
                  )
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

test("classification facts and legal relationship types", async () => {
  const enumValues = await client.query(
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
      where t.typname = 'wine_place_relationship_type'
      order by e.enumsortorder`,
  );
  assert.deepEqual(
    enumValues.rows.map(({ enumlabel }) => enumlabel),
    ["OVERLAPS", "ALTERNATE_PARENT", "RELATED", "REPLACES_WITHIN", "DUAL_LABEL"],
  );

  const facts = await client.query(
    `select count(*) filter (where is_appellation)::int appellations,
            count(*) filter (where is_appellation and appellation_system = 'AOC/AOP')::int aoc,
            count(*) filter (where is_appellation and appellation_level is null)::int missing_level,
            count(*) filter (where not is_appellation and canonical_key = 'france')::int france_plain
       from wine_places`,
  );
  assert.deepEqual(facts.rows[0], {
      // 111 through wave 3D-1 + 23 across Chablis, Grand Auxerrois, Côte
      // Chalonnaise and Mâconnais (16 villages, 1 grand cru, 6 groups),
      // +1 Champagne (region == regional AOC).
      appellations: 808,
      aoc: 808,
    missing_level: 0,
    france_plain: 1,
  });

  // One failing statement per rollback scope: after a rejected statement
  // the (sub)transaction is aborted and a second probe would only see
  // "current transaction is aborted".
  await withRollback(async () => {
    await assert.rejects(
      client.query(
        `update wine_places set is_appellation = true where canonical_key = 'france'`,
      ),
      /classification_coupling/i,
    );
  });
  await withRollback(async () => {
    await assert.rejects(
      client.query(
        `update wine_places set appellation_level = 'village-ish'
          where canonical_key = 'france.bordeaux'`,
      ),
      /appellation_level/i,
    );
  });

  // Phase 3C: premier_cru and grand_cru are accepted after the level migration
  // (accepting statements do not abort the scope, so both share one rollback).
  await withRollback(async () => {
    await client.query(
      `update wine_places set appellation_level = 'grand_cru'
        where canonical_key = 'france.bordeaux'`,
    );
    await client.query(
      `update wine_places set appellation_level = 'premier_cru'
        where canonical_key = 'france.bordeaux'`,
    );
  });
});
