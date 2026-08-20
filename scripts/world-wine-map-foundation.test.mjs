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

// [current live name, pre-Phase-1 name]. The left column must track the live
// reference data: 20260829257000 renamed every French appellation's trailing
// " AOP" to " AOC", and useReplayAppellationNames asserts one row per entry.
const REPLAY_APPELLATION_NAMES = [
  ["Barsac AOC", "Barsac"],
  ["Graves AOC", "Graves"],
  ["Haut-Médoc AOC", "Haut-Médoc"],
  ["Margaux AOC", "Margaux"],
  ["Médoc AOC", "Médoc"],
  ["Pauillac AOC", "Pauillac"],
  ["Pessac-Léognan AOC", "Pessac-Léognan"],
  ["Pomerol AOC", "Pomerol"],
  ["Saint-Estèphe AOC", "Saint-Estèphe"],
  ["Saint-Émilion AOC", "Saint-Émilion"],
  ["Saint-Julien AOC", "Saint-Julien"],
  ["Sauternes AOC", "Sauternes"],
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
  { names: ["Alsace AOC"], key: "france.alsace" },
  { names: ["Altenberg de Bergbieten AOC"], key: "france.alsace.altenberg-de-bergbieten" },
  { names: ["Altenberg de Bergheim AOC"], key: "france.alsace.altenberg-de-bergheim" },
  { names: ["Altenberg de Wolxheim AOC"], key: "france.alsace.altenberg-de-wolxheim" },
  { names: ["Brand AOC"], key: "france.alsace.brand" },
  { names: ["Bruderthal AOC"], key: "france.alsace.bruderthal" },
  { names: ["Eichberg AOC"], key: "france.alsace.eichberg" },
  { names: ["Engelberg AOC"], key: "france.alsace.engelberg" },
  { names: ["Florimont AOC"], key: "france.alsace.florimont" },
  { names: ["Frankstein AOC"], key: "france.alsace.frankstein" },
  { names: ["Froehn AOC"], key: "france.alsace.froehn" },
  { names: ["Furstentum AOC"], key: "france.alsace.furstentum" },
  { names: ["Geisberg AOC"], key: "france.alsace.geisberg" },
  { names: ["Gloeckelberg AOC"], key: "france.alsace.gloeckelberg" },
  { names: ["Goldert AOC"], key: "france.alsace.goldert" },
  { names: ["Hatschbourg AOC"], key: "france.alsace.hatschbourg" },
  { names: ["Hengst AOC"], key: "france.alsace.hengst" },
  { names: ["Kaefferkopf AOC"], key: "france.alsace.kaefferkopf" },
  { names: ["Kanzlerberg AOC"], key: "france.alsace.kanzlerberg" },
  { names: ["Kastelberg AOC"], key: "france.alsace.kastelberg" },
  { names: ["Kessler AOC"], key: "france.alsace.kessler" },
  { names: ["Kirchberg De Barr AOC"], key: "france.alsace.kirchberg-de-barr" },
  { names: ["Kirchberg de Ribeauville AOC"], key: "france.alsace.kirchberg-de-ribeauville" },
  { names: ["Kitterle AOC"], key: "france.alsace.kitterle" },
  { names: ["Mambourg AOC"], key: "france.alsace.mambourg" },
  { names: ["Mandelberg AOC"], key: "france.alsace.mandelberg" },
  { names: ["Marckrain AOC"], key: "france.alsace.marckrain" },
  { names: ["Moenchberg AOC"], key: "france.alsace.moenchberg" },
  { names: ["Muenchberg AOC"], key: "france.alsace.muenchberg" },
  { names: ["Ollwiller AOC"], key: "france.alsace.ollwiller" },
  { names: ["Osterberg AOC"], key: "france.alsace.osterberg" },
  { names: ["Pfersigberg AOC"], key: "france.alsace.pfersigberg" },
  { names: ["Pfingstberg AOC"], key: "france.alsace.pfingstberg" },
  { names: ["Praelatenberg AOC"], key: "france.alsace.praelatenberg" },
  { names: ["Rangen AOC"], key: "france.alsace.rangen" },
  { names: ["Rosacker AOC"], key: "france.alsace.rosacker" },
  { names: ["Saering AOC"], key: "france.alsace.saering" },
  { names: ["Schlossberg AOC"], key: "france.alsace.schlossberg" },
  { names: ["Schoenenbourg AOC"], key: "france.alsace.schoenenbourg" },
  { names: ["Sommerberg AOC"], key: "france.alsace.sommerberg" },
  { names: ["Sonnenglanz AOC"], key: "france.alsace.sonnenglanz" },
  { names: ["Spiegel AOC"], key: "france.alsace.spiegel" },
  { names: ["Sporen AOC"], key: "france.alsace.sporen" },
  { names: ["Steinert AOC"], key: "france.alsace.steinert" },
  { names: ["Steingrubler AOC"], key: "france.alsace.steingrubler" },
  { names: ["Steinklotz AOC"], key: "france.alsace.steinklotz" },
  { names: ["Vorbourg AOC"], key: "france.alsace.vorbourg" },
  { names: ["Wiebelsberg AOC"], key: "france.alsace.wiebelsberg" },
  { names: ["Wineck Schlossberg AOC"], key: "france.alsace.wineck-schlossberg" },
  { names: ["Winzenberg AOC"], key: "france.alsace.winzenberg" },
  { names: ["Zinnkoepfle AOC"], key: "france.alsace.zinnkoepfle" },
  { names: ["Zotzenberg AOC"], key: "france.alsace.zotzenberg" },
  { names: ["Barsac AOC", "Barsac"], key: "france.bordeaux.sauternes.barsac" },
  { names: ["Graves AOC", "Graves"], key: "france.bordeaux.graves" },
  { names: ["Haut-Médoc AOC", "Haut-Médoc"], key: "france.bordeaux.haut-medoc" },
  { names: ["Margaux AOC", "Margaux"], key: "france.bordeaux.haut-medoc.margaux" },
  { names: ["Médoc AOC", "Médoc"], key: "france.bordeaux.medoc" },
  { names: ["Pauillac AOC", "Pauillac"], key: "france.bordeaux.haut-medoc.pauillac" },
  { names: ["Pessac-Léognan AOC", "Pessac-Léognan"], key: "france.bordeaux.pessac-leognan" },
  { names: ["Pomerol AOC", "Pomerol"], key: "france.bordeaux.pomerol" },
  { names: ["Saint-Estèphe AOC", "Saint-Estèphe"], key: "france.bordeaux.haut-medoc.saint-estephe" },
  { names: ["Saint-Émilion AOC", "Saint-Émilion"], key: "france.bordeaux.saint-emilion" },
  { names: ["Saint-Julien AOC", "Saint-Julien"], key: "france.bordeaux.haut-medoc.saint-julien" },
  { names: ["Sauternes AOC", "Sauternes"], key: "france.bordeaux.sauternes" },
  { names: ["Fronsac AOC", "Fronsac"], key: "france.bordeaux.fronsac" },
  { names: ["Canon-Fronsac AOC", "Canon-Fronsac"], key: "france.bordeaux.canon-fronsac" },
  { names: ["Côtes de Bourg AOC", "Côtes de Bourg"], key: "france.bordeaux.cotes-de-bourg" },
  { names: ["Entre-Deux-Mers AOC", "Entre-deux-Mers"], key: "france.bordeaux.entre-deux-mers.entre-deux-mers" },
  { names: ["Vosne-Romanée AOC", "Vosne-Romanée"], key: "france.bourgogne.cote-de-nuits.vosne-romanee" },
  { names: ["Échezeaux AOC", "Échezeaux"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux" },
  { names: ["Grands Échezeaux AOC", "Grands-Échezeaux AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.grands-echezeaux" },
  { names: ["Richebourg AOC", "Richebourg"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.richebourg" },
  { names: ["Romanée-Conti AOC", "Romanée-Conti"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.romanee-conti" },
  { names: ["La Romanée AOC", "La Romanée"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-romanee" },
  { names: ["La Tâche AOC", "La Tâche"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache" },
  { names: ["Romanée-Saint-Vivant AOC", "Romanée-Saint-Vivant"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.romanee-saint-vivant" },
  { names: ["Au-dessus des Malconsorts AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.au-dessus-des-malconsorts" },
  { names: ["Aux Malconsorts AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-malconsorts" },
  { names: ["Aux Raignots AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-raignots" },
  { names: ["Cros Parantoux AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.cros-parantoux" },
  { names: ["En Orveaux AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.en-orveaux" },
  { names: ["La Croix Rameau AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.la-croix-rameau" },
  { names: ["Les Beaux Monts AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-beaux-monts" },
  { names: ["Les Gaudichots AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-gaudichots" },
  { names: ["Les Rouges AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-rouges" },
  { names: ["Les Suchots AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots" },
  { names: ["Marsannay AOC"], key: "france.bourgogne.cote-de-nuits.marsannay" },
  { names: ["Fixin AOC"], key: "france.bourgogne.cote-de-nuits.fixin" },
  { names: ["Gevrey-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin" },
  { names: ["Morey-Saint-Denis AOC"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis" },
  { names: ["Chambolle-Musigny AOC"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny" },
  { names: ["Vougeot AOC"], key: "france.bourgogne.cote-de-nuits.vougeot" },
  { names: ["Nuits-Saint-Georges AOC"], key: "france.bourgogne.cote-de-nuits.nuits-saint-georges" },
  { names: ["Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin" },
  { names: ["Chambertin-Clos de Bèze AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze" },
  { names: ["Chapelle-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.chapelle-chambertin" },
  { names: ["Charmes-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.charmes-chambertin" },
  { names: ["Griotte-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.griotte-chambertin" },
  { names: ["Latricieres-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.latricieres-chambertin" },
  { names: ["Mazis-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.mazis-chambertin" },
  { names: ["Mazoyeres-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.mazoyeres-chambertin" },
  { names: ["Ruchottes-Chambertin AOC"], key: "france.bourgogne.cote-de-nuits.gevrey-chambertin.ruchottes-chambertin" },
  { names: ["Clos de la Roche AOC"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-la-roche" },
  { names: ["Clos Saint-Denis AOC"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-saint-denis" },
  { names: ["Clos des Lambrays AOC"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-des-lambrays" },
  { names: ["Clos de Tart AOC"], key: "france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-tart" },
  { names: ["Bonnes-Mares AOC"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny.bonnes-mares" },
  { names: ["Musigny AOC"], key: "france.bourgogne.cote-de-nuits.chambolle-musigny.musigny" },
  { names: ["Clos de Vougeot AOC"], key: "france.bourgogne.cote-de-nuits.vougeot.clos-de-vougeot" },
  { names: ["Ladoix AOC"], key: "france.bourgogne.cote-de-beaune.ladoix" },
  { names: ["Aloxe-Corton AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton" },
  { names: ["Pernand-Vergelesses AOC"], key: "france.bourgogne.cote-de-beaune.pernand-vergelesses" },
  { names: ["Savigny-les-Beaune AOC"], key: "france.bourgogne.cote-de-beaune.savigny-les-beaune" },
  { names: ["Chorey-les-Beaune AOC"], key: "france.bourgogne.cote-de-beaune.chorey-les-beaune" },
  { names: ["Beaune AOC"], key: "france.bourgogne.cote-de-beaune.beaune" },
  { names: ["Pommard AOC"], key: "france.bourgogne.cote-de-beaune.pommard" },
  { names: ["Volnay AOC"], key: "france.bourgogne.cote-de-beaune.volnay" },
  { names: ["Monthelie AOC"], key: "france.bourgogne.cote-de-beaune.monthelie" },
  { names: ["Auxey-Duresses AOC"], key: "france.bourgogne.cote-de-beaune.auxey-duresses" },
  { names: ["Saint-Romain AOC"], key: "france.bourgogne.cote-de-beaune.saint-romain" },
  { names: ["Meursault AOC"], key: "france.bourgogne.cote-de-beaune.meursault" },
  { names: ["Puligny-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet" },
  { names: ["Chassagne-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.chassagne-montrachet" },
  { names: ["Saint-Aubin AOC"], key: "france.bourgogne.cote-de-beaune.saint-aubin" },
  { names: ["Santenay AOC"], key: "france.bourgogne.cote-de-beaune.santenay" },
  { names: ["Maranges AOC"], key: "france.bourgogne.cote-de-beaune.maranges" },
  { names: ["Corton AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton" },
  { names: ["Le Corton AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton" },
  { names: ["Corton-Charlemagne AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne" },
  { names: ["Charlemagne AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne" },
  { names: ["Le Charlemagne AOC"], key: "france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne" },
  { names: ["Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet" },
  { names: ["Chevalier-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet" },
  { names: ["Bâtard-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet" },
  { names: ["Bienvenues-Bâtard-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet" },
  { names: ["Criots-Bâtard-Montrachet AOC"], key: "france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet" },
  { names: ["Chablis AOC"], key: "france.bourgogne.chablis.chablis" },
  { names: ["Petit Chablis AOC"], key: "france.bourgogne.chablis.petit-chablis" },
  { names: ["Chablis Grand Cru"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru" },
  { names: ["Irancy AOC"], key: "france.bourgogne.grand-auxerrois.irancy" },
  { names: ["Saint-Bris AOC"], key: "france.bourgogne.grand-auxerrois.saint-bris" },
  { names: ["Vezelay AOC"], key: "france.bourgogne.grand-auxerrois.vezelay" },
  { names: ["Bouzeron AOC"], key: "france.bourgogne.cote-chalonnaise.bouzeron" },
  { names: ["Rully AOC"], key: "france.bourgogne.cote-chalonnaise.rully" },
  { names: ["Mercurey AOC"], key: "france.bourgogne.cote-chalonnaise.mercurey" },
  { names: ["Givry AOC"], key: "france.bourgogne.cote-chalonnaise.givry" },
  { names: ["Montagny AOC"], key: "france.bourgogne.cote-chalonnaise.montagny" },
  { names: ["Macon AOC"], key: "france.bourgogne.maconnais.macon" },
  { names: ["Vire-Clesse AOC"], key: "france.bourgogne.maconnais.vire-clesse" },
  { names: ["Pouilly-Fuissé AOC"], key: "france.bourgogne.maconnais.pouilly-fuisse" },
  { names: ["Pouilly-Vinzelles AOC"], key: "france.bourgogne.maconnais.pouilly-vinzelles" },
  { names: ["Pouilly-Loche AOC"], key: "france.bourgogne.maconnais.pouilly-loche" },
  { names: ["Saint-Véran AOC"], key: "france.bourgogne.maconnais.saint-veran" },
  { names: ["Listrac-Médoc AOC"], key: "france.bordeaux.haut-medoc.listrac-medoc" },
  { names: ["Montagne-Saint-Emilion AOC"], key: "france.bordeaux.montagne-saint-emilion" },
  { names: ["Lussac-Saint-Emilion AOC"], key: "france.bordeaux.lussac-saint-emilion" },
  { names: ["Puisseguin-Saint-Emilion AOC"], key: "france.bordeaux.puisseguin-saint-emilion" },
  { names: ["Saint-Georges-Saint-Emilion AOC"], key: "france.bordeaux.saint-georges-saint-emilion" },
  { names: ["Lalande-de-Pomerol AOC"], key: "france.bordeaux.lalande-de-pomerol" },
  { names: ["Cadillac AOC"], key: "france.bordeaux.cadillac" },
  { names: ["Cerons AOC"], key: "france.bordeaux.cerons" },
  { names: ["Loupiac AOC"], key: "france.bordeaux.loupiac" },
  { names: ["Sainte-Croix-du-Mont AOC"], key: "france.bordeaux.sainte-croix-du-mont" },
  { names: ["Bougros AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.bougros" },
  { names: ["Preuses AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.preuses" },
  { names: ["Vaudesir AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.vaudesir" },
  { names: ["Grenouilles AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.grenouilles" },
  { names: ["Valmur AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.valmur" },
  { names: ["Les Clos AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.les-clos" },
  { names: ["Blanchot AOC"], key: "france.bourgogne.chablis.chablis.chablis-grand-cru.blanchot" },
  { names: ["Beaujolais AOC"], key: "france.beaujolais" },
  { names: ["Beaujolais-Villages AOC"], key: "france.beaujolais.beaujolais-villages" },
  { names: ["Brouilly AOC"], key: "france.beaujolais.brouilly" },
  { names: ["Cote de Brouilly AOC"], key: "france.beaujolais.cote-de-brouilly" },
  { names: ["Chenas AOC"], key: "france.beaujolais.chenas" },
  { names: ["Chiroubles AOC"], key: "france.beaujolais.chiroubles" },
  { names: ["Fleurie AOC"], key: "france.beaujolais.fleurie" },
  { names: ["Julienas AOC"], key: "france.beaujolais.julienas" },
  { names: ["Morgon AOC"], key: "france.beaujolais.morgon" },
  { names: ["Moulin-a-Vent AOC"], key: "france.beaujolais.moulin-a-vent" },
  { names: ["Regnie AOC"], key: "france.beaujolais.regnie" },
  { names: ["Saint-Amour AOC"], key: "france.beaujolais.saint-amour" },
  { names: ["Côte-Rôtie AOC"], key: "france.rhone.cote-rotie" },
  { names: ["Condrieu AOC"], key: "france.rhone.condrieu" },
  { names: ["Chateau-Grillet AOC"], key: "france.rhone.chateau-grillet" },
  { names: ["Saint-Joseph AOC"], key: "france.rhone.saint-joseph" },
  { names: ["Hermitage AOC"], key: "france.rhone.hermitage" },
  { names: ["Crozes-Hermitage AOC"], key: "france.rhone.crozes-hermitage" },
  { names: ["Cornas AOC"], key: "france.rhone.cornas" },
  { names: ["Saint-Peray AOC"], key: "france.rhone.saint-peray" },
  { names: ["Châteauneuf-du-Pape AOC"], key: "france.rhone.chateauneuf-du-pape" },
  { names: ["Gigondas AOC"], key: "france.rhone.gigondas" },
  { names: ["Vinsobres AOC"], key: "france.rhone.vinsobres" },
  { names: ["Cairanne AOC"], key: "france.rhone.cairanne" },
  { names: ["Rasteau AOC"], key: "france.rhone.rasteau" },
  { names: ["Beaumes de Venise AOC"], key: "france.rhone.beaumes-de-venise" },
  { names: ["Lirac AOC"], key: "france.rhone.lirac" },
  { names: ["Tavel AOC"], key: "france.rhone.tavel" },
  { names: ["Cotes du Rhone AOC"], key: "france.rhone.cotes-du-rhone" },
  { names: ["Vacqueyras AOC"], key: "france.rhone.vacqueyras" },
  { names: ["Cotes du Rhone Villages AOC"], key: "france.rhone.cotes-du-rhone-villages" },
  { names: ["Chusclan AOC"], key: "france.rhone.cotes-du-rhone-villages.chusclan" },
  { names: ["Laudun AOC"], key: "france.rhone.cotes-du-rhone-villages.laudun" },
  { names: ["Massif d'Uchaux AOC"], key: "france.rhone.cotes-du-rhone-villages.massif-d-uchaux" },
  { names: ["Plan de Dieu AOC"], key: "france.rhone.cotes-du-rhone-villages.plan-de-dieu" },
  { names: ["Roaix AOC"], key: "france.rhone.cotes-du-rhone-villages.roaix" },
  { names: ["Rochegude AOC"], key: "france.rhone.cotes-du-rhone-villages.rochegude" },
  { names: ["Rousset-les-Vignes AOC"], key: "france.rhone.cotes-du-rhone-villages.rousset-les-vignes" },
  { names: ["Sablet AOC"], key: "france.rhone.cotes-du-rhone-villages.sablet" },
  { names: ["Saint-Gervais AOC"], key: "france.rhone.cotes-du-rhone-villages.saint-gervais" },
  { names: ["Saint-Maurice AOC"], key: "france.rhone.cotes-du-rhone-villages.saint-maurice" },
  { names: ["Sainte-Cecile AOC"], key: "france.rhone.cotes-du-rhone-villages.sainte-cecile" },
  { names: ["Seguret AOC"], key: "france.rhone.cotes-du-rhone-villages.seguret" },
  { names: ["Signargues AOC"], key: "france.rhone.cotes-du-rhone-villages.signargues" },
  { names: ["Suza la Rousse AOC"], key: "france.rhone.cotes-du-rhone-villages.suze-la-rousse" },
  { names: ["Vaison le Romaine AOC"], key: "france.rhone.cotes-du-rhone-villages.vaison-la-romaine" },
  { names: ["Valreas AOC"], key: "france.rhone.cotes-du-rhone-villages.valreas" },
  { names: ["Ventoux AOC"], key: "france.rhone.ventoux" },
  { names: ["Luberon AOC"], key: "france.rhone.luberon" },
  { names: ["Grignan-les-Adhemar AOC"], key: "france.rhone.grignan-les-adhemar" },
  { names: ["Cotes du Vivarais AOC"], key: "france.rhone.cotes-du-vivarais" },
  { names: ["Clairette de Die AOC"], key: "france.rhone.clairette-de-die" },
  { names: ["Cremant de Die AOC"], key: "france.rhone.cremant-de-die" },
  { names: ["Muscat de Beaumes de Venise AOC"], key: "france.rhone.muscat-de-beaumes-de-venise" },
  { names: ["Jura"], key: "france.jura" },
  { names: ["Cotes du Jura AOC"], key: "france.jura" },
  { names: ["Arbois AOC"], key: "france.jura.arbois" },
  { names: ["Arbois Pupillin AOC"], key: "france.jura.arbois-pupillin" },
  { names: ["Château-Chalon AOC"], key: "france.jura.chateau-chalon" },
  { names: ["L'Etoile AOC"], key: "france.jura.l-etoile" },
  { names: ["Savoie AOC"], key: "france.savoie" },
  { names: ["Vin de Savoie AOC"], key: "france.savoie" },
  { names: ["Roussette de Savoie AOC"], key: "france.savoie.roussette-de-savoie" },
  { names: ["Apremont AOC"], key: "france.savoie.apremont" },
  { names: ["Arbin AOC"], key: "france.savoie.arbin" },
  { names: ["Ayze AOC"], key: "france.savoie.ayze" },
  { names: ["Chautagne AOC"], key: "france.savoie.chautagne" },
  { names: ["Chignin AOC"], key: "france.savoie.chignin" },
  { names: ["Chignin-Bergeron AOC"], key: "france.savoie.chignin-bergeron" },
  { names: ["Frangy AOC"], key: "france.savoie.frangy" },
  { names: ["Jongieux AOC"], key: "france.savoie.jongieux" },
  { names: ["Les Abymes AOC"], key: "france.savoie.abymes-ou-les-abymes" },
  { names: ["Monterminod AOC"], key: "france.savoie.monterminod" },
  { names: ["Monthoux AOC"], key: "france.savoie.monthoux" },
  { names: ["Corse AOC"], key: "france.corse" },
  { names: ["Vin de Corse AOC"], key: "france.corse" },
  { names: ["Corse-Calvi AOC"], key: "france.corse.calvi" },
  { names: ["Corse-Coteaux du Cap Corse AOC"], key: "france.corse.coteaux-du-cap-corse" },
  { names: ["Corse-Figari AOC"], key: "france.corse.figari" },
  { names: ["Corse Porto Vecchio AOC"], key: "france.corse.porto-vecchio" },
  { names: ["Corse-Sartene AOC"], key: "france.corse.sartene" },
  { names: ["Ajaccio AOC"], key: "france.corse.ajaccio" },
  { names: ["Patrimonio AOC"], key: "france.corse.patrimonio" },
  { names: ["Muscat de Cap Corse AOC"], key: "france.corse.muscat-du-cap-corse" },
  { names: ["Provence AOC"], key: "france.provence" },
  { names: ["Côtes de Provence AOC"], key: "france.provence.cotes-de-provence" },
  { names: ["Coteaux d'Aix-en-Provence AOC"], key: "france.provence.coteaux-daix-en-provence" },
  { names: ["Coteaux Varois en Provence AOC"], key: "france.provence.coteaux-varois-en-provence" },
  { names: ["Sainte-Victoire AOC"], key: "france.provence.cotes-de-provence-sainte-victoire" },
  { names: ["Bandol AOC"], key: "france.provence.bandol" },
  { names: ["Les Baux-de-Provence AOC"], key: "france.provence.les-baux-de-provence" },
  { names: ["Palette AOC"], key: "france.provence.palette" },
  { names: ["Bergerac AOC"], key: "france.sud-ouest.bergerac" },
  { names: ["Monbazillac AOC"], key: "france.sud-ouest.monbazillac" },
  { names: ["Montravel AOC"], key: "france.sud-ouest.montravel" },
  { names: ["Pecharmant AOC"], key: "france.sud-ouest.pecharmant" },
  { names: ["Saussignac AOC"], key: "france.sud-ouest.saussignac" },
  { names: ["Cotes de Duras AOC"], key: "france.sud-ouest.cotes-de-duras" },
  { names: ["Cotes du Marmandais AOC"], key: "france.sud-ouest.cotes-du-marmandais" },
  { names: ["Cahors AOC"], key: "france.sud-ouest.cahors" },
  { names: ["Gaillac AOC"], key: "france.sud-ouest.gaillac" },
  { names: ["Gaillac Premieres Cotes AOC"], key: "france.sud-ouest.gaillac-premieres-cotes" },
  { names: ["Fronton AOC"], key: "france.sud-ouest.fronton" },
  { names: ["Brulhois AOC"], key: "france.sud-ouest.brulhois" },
  { names: ["Marcillac AOC"], key: "france.sud-ouest.marcillac" },
  { names: ["Madiran AOC"], key: "france.sud-ouest.madiran" },
  { names: ["Pacherenc du Vic-Bilh AOC"], key: "france.sud-ouest.pacherenc-du-vic-bilh" },
  { names: ["Jurancon AOC"], key: "france.sud-ouest.jurancon" },
  { names: ["Irouleguy AOC"], key: "france.sud-ouest.irouleguy" },
  { names: ["Buzet AOC"], key: "france.sud-ouest.buzet" },
  { names: ["Muscadet AOC"], key: "france.loire.muscadet" },
  { names: ["Muscadet Cotes de Grandlieu AOC"], key: "france.loire.muscadet-cotes-de-grandlieu" },
  { names: ["Muscadet Sevre et Maine AOC"], key: "france.loire.muscadet-sevre-et-maine" },
  { names: ["Gros Plant du Pays Nantais AOC"], key: "france.loire.gros-plant-du-pays-nantais" },
  { names: ["Anjou AOC"], key: "france.loire.anjou" },
  { names: ["Anjou Villages AOC"], key: "france.loire.anjou-villages" },
  { names: ["Anjou Villages Brissac AOC"], key: "france.loire.anjou-brissac" },
  { names: ["Savennieres Roche aux Moines AOC"], key: "france.loire.savennieres-roche-aux-moines" },
  { names: ["Coteaux du Layon AOC"], key: "france.loire.coteaux-du-layon" },
  { names: ["Coteaux du Layon Chaume Premier Cru AOC"], key: "france.loire.coteaux-du-layon-premier-cru-chaume" },
  { names: ["Quarts de Chaume AOC"], key: "france.loire.quarts-de-chaume" },
  { names: ["Bonnezeaux AOC"], key: "france.loire.bonnezeaux" },
  { names: ["Coteaux de l'Aubance AOC"], key: "france.loire.coteaux-de-l-aubance" },
  { names: ["Saumur AOC"], key: "france.loire.saumur" },
  { names: ["Saumur-Champigny AOC"], key: "france.loire.saumur-champigny" },
  { names: ["Touraine AOC"], key: "france.loire.touraine" },
  { names: ["Vouvray AOC"], key: "france.loire.vouvray" },
  { names: ["Montlouis-sur-Loire AOC"], key: "france.loire.montlouis-sur-loire" },
  { names: ["Chinon AOC"], key: "france.loire.chinon" },
  { names: ["Bourgueil AOC"], key: "france.loire.bourgueil" },
  { names: ["Saint Nicolas de Bourgueil AOC"], key: "france.loire.saint-nicolas-de-bourgueil" },
  { names: ["Jasnieres AOC"], key: "france.loire.jasnieres" },
  { names: ["Coteaux du Loir AOC"], key: "france.loire.coteaux-du-loir" },
  { names: ["Cheverny AOC"], key: "france.loire.cheverny" },
  { names: ["Cour-Cheverny AOC"], key: "france.loire.cour-cheverny" },
  { names: ["Valencay AOC"], key: "france.loire.valencay" },
  { names: ["Haut-Poitou AOC"], key: "france.loire.haut-poitou" },
  { names: ["Sancerre AOC"], key: "france.loire.sancerre" },
  { names: ["Pouilly-Fumé AOC"], key: "france.loire.pouilly-fume" },
  { names: ["Pouilly sur Loire AOC"], key: "france.loire.pouilly-sur-loire" },
  { names: ["Menetou Salon AOC"], key: "france.loire.menetou-salon" },
  { names: ["Quincy AOC"], key: "france.loire.quincy" },
  { names: ["Reuilly AOC"], key: "france.loire.reuilly" },
  { names: ["Coteaux du Giennois AOC"], key: "france.loire.coteaux-du-giennois" },
  { names: ["Chateaumeillant AOC"], key: "france.loire.chateaumeillant" },
  { names: ["Amboise AOC"], key: "france.loire.touraine-amboise" },
  { names: ["Azay-le Rideau AOC"], key: "france.loire.touraine-azay-le-rideau" },
  { names: ["Chenonceaux AOC"], key: "france.loire.touraine-chenonceaux" },
  { names: ["Mesland AOC"], key: "france.loire.touraine-mesland" },
  { names: ["Oisly AOC"], key: "france.loire.touraine-oisly" },
  { names: ["Clisson AOC"], key: "france.loire.muscadet-sevre-et-maine-clisson" },
  { names: ["Gorges AOC"], key: "france.loire.muscadet-sevre-et-maine-gorges" },
  { names: ["Savennières AOC"], key: "france.loire.savennieres" },
  { names: ["Alsace Grand Cru Rangen"], key: "france.alsace.rangen" },
  { names: ["Alsace Grand Cru Schlossberg"], key: "france.alsace.schlossberg" },
  { names: ["Chablis Premier Cru"], key: "france.bourgogne.chablis.chablis.premier-cru" },
  { names: ["La Grande Rue AOC"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue" },
  { names: ["Cremant de Loire AOC"], key: "france.loire.cremant-de-loire" },
  { names: ["Rose de Loire AOC"], key: "france.loire.rose-de-loire" },
  { names: ["Cabernet d'Anjou AOC"], key: "france.loire.cabernet-d-anjou" },
  { names: ["Rose d’Anjou AOC"], key: "france.loire.rose-d-anjou" },
  { names: ["Coteaux de Saumur AOC"], key: "france.loire.coteaux-de-saumur" },
  { names: ["Coteaux du Vendomois AOC"], key: "france.loire.coteaux-du-vendomois" },
  { names: ["Orleans AOC"], key: "france.loire.orleans" },
  { names: ["Orleans-Clery AOC"], key: "france.loire.orleans-clery" },
  { names: ["Cote Roannaise AOC"], key: "france.loire.cote-roannaise" },
  { names: ["Cotes du Forez AOC"], key: "france.loire.cotes-du-forez" },
  { names: ["Saint Pourcain AOC"], key: "france.loire.saint-pourcain" },
  { names: ["Bordeaux AOC"], key: "france.bordeaux" },
  { names: ["Bordeaux Superieur AOC"], key: "france.bordeaux" },
  { names: ["Cremant de Bordeaux AOC"], key: "france.bordeaux" },
  { names: ["Blaye AOC"], key: "france.bordeaux.blaye" },
  { names: ["Cotes de Bordeaux Saint-Macaire AOC"], key: "france.bordeaux.cotes-de-bordeaux-saint-macaire" },
  { names: ["Cotes de Bordeaux AOC"], key: "france.bordeaux.cotes-de-bordeaux" },
  { names: ["Graves de Vayres AOC"], key: "france.bordeaux.graves-de-vayres" },
  { names: ["Graves Superieures AOC"], key: "france.bordeaux.graves.graves-superieures" },
  { names: ["Premieres Cotes de Bordeaux AOC"], key: "france.bordeaux.premieres-cotes-de-bordeaux" },
  { names: ["Saint-Émilion Grand Cru AOC"], key: "france.bordeaux.saint-emilion.saint-emilion-grand-cru" },
  { names: ["Bourgogne AOC"], key: "france.bourgogne" },
  { names: ["Bourgogne Aligote AOC"], key: "france.bourgogne" },
  { names: ["Bourgogne Passe-tout-grains AOC"], key: "france.bourgogne" },
  { names: ["Cremant de Bourgogne AOC"], key: "france.bourgogne" },
  { names: ["Cote de Beaune AOC"], key: "france.bourgogne.cote-de-beaune.cote-de-beaune" },
  { names: ["Cote de Beaune-Villages AOC"], key: "france.bourgogne.cote-de-beaune.cote-de-beaune-villages" },
  { names: ["Macon-Villages AOC"], key: "france.bourgogne.maconnais.macon-villages" },
  { names: ["Cremant de Limoux AOC"], key: "france.languedoc-roussillon.limoux" },
  { names: ["Cremant du Jura AOC"], key: "france.jura" },
  { names: ["Macvin du Jura AOC"], key: "france.jura" },
  { names: ["Pierrevert AOC"], key: "france.provence.pierrevert" },
  { names: ["Cotes de Bergerac AOC"], key: "france.sud-ouest.cotes-de-bergerac" },
  { names: ["Cotes de Montravel AOC"], key: "france.sud-ouest.cotes-de-montravel" },
  { names: ["Haut-Montravel AOC"], key: "france.sud-ouest.haut-montravel" },
  { names: ["Saint-Mont AOC"], key: "france.sud-ouest.saint-mont" },
  { names: ["Tursan AOC"], key: "france.sud-ouest.tursan" },
  { names: ["Languedoc AOC"], key: "france.languedoc-roussillon" },
  { names: ["Roussillon AOC"], key: "france.languedoc-roussillon" },
  { names: ["Gres de Montpellier AOC"], key: "france.languedoc-roussillon.languedoc-gres-de-montpellier" },
  { names: ["Montpeyroux AOC"], key: "france.languedoc-roussillon.languedoc-montpeyroux" },
  { names: ["Terrasses du Larzac AOC"], key: "france.languedoc-roussillon.terrasses-du-larzac" },
  { names: ["Pic Saint Loup AOC"], key: "france.languedoc-roussillon.pic-saint-loup" },
  { names: ["La Clape AOC"], key: "france.languedoc-roussillon.la-clape" },
  { names: ["Picpoul de Pinet AOC"], key: "france.languedoc-roussillon.picpoul-de-pinet" },
  { names: ["Clairette du Languedoc AOC"], key: "france.languedoc-roussillon.clairette-du-languedoc" },
  { names: ["Clairette de Bellegarde AOC"], key: "france.languedoc-roussillon.clairette-de-bellegarde" },
  { names: ["Corbières AOC"], key: "france.languedoc-roussillon.corbieres" },
  { names: ["Minervois AOC"], key: "france.languedoc-roussillon.minervois" },
  { names: ["Saint Chinian AOC"], key: "france.languedoc-roussillon.saint-chinian" },
  { names: ["Faugères AOC"], key: "france.languedoc-roussillon.faugeres" },
  { names: ["Fitou AOC"], key: "france.languedoc-roussillon.fitou" },
  { names: ["Cabardes AOC"], key: "france.languedoc-roussillon.cabardes" },
  { names: ["Malepere AOC"], key: "france.languedoc-roussillon.malepere" },
  { names: ["Limoux AOC"], key: "france.languedoc-roussillon.limoux" },
  { names: ["Costieres de Nimes AOC"], key: "france.languedoc-roussillon.costieres-de-nimes" },
  { names: ["Cotes du Roussillon AOC"], key: "france.languedoc-roussillon.cotes-du-roussillon" },
  { names: ["Cotes du Roussillon-Villages AOC"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages" },
  { names: ["Caramany AOC"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-caramany" },
  { names: ["Lesquerde AOC"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde" },
  { names: ["Tautavel AOC"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel" },
  { names: ["Collioure AOC"], key: "france.languedoc-roussillon.collioure" },
  { names: ["Banyuls AOC"], key: "france.languedoc-roussillon.banyuls" },
  { names: ["Banyuls Grand Cru AOC"], key: "france.languedoc-roussillon.banyuls-grand-cru" },
  { names: ["Maury AOC"], key: "france.languedoc-roussillon.maury" },
  { names: ["Maury Sec AOC"], key: "france.languedoc-roussillon.maury" },
  { names: ["Rivesaltes AOC"], key: "france.languedoc-roussillon.rivesaltes" },
  { names: ["Muscat de Rivesaltes AOC"], key: "france.languedoc-roussillon.muscat-de-rivesaltes" },
  { names: ["Muscat de Lunel AOC"], key: "france.languedoc-roussillon.muscat-de-lunel" },
  { names: ["Muscat de Saint Jean de Minervois AOC"], key: "france.languedoc-roussillon.muscat-de-saint-jean-de-minervois" },
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
  // Historical note on how this boundary set was built up, wave by wave:
    // Beaujolais + Vallee du Rhone + Champagne (region + 5 sub-regions + 59
    // GC/1er-cru villages) + Alsace (region + 51 grands crus, concave INAO
    // dissolves) + Jura (region + 4 villages) + Savoie (region + 22
    // children) + Corse (region + 8 villages) + Provence (7 constituents +
    // derived aggregate region) + Sud-Ouest (19 constituents + derived
    // aggregate region) + Loire (59 constituents + derived aggregate
    // region) + Languedoc-Roussillon (dual-role region + 56 constituents)
    // + the Champagne premier-cru completion (4 deleguee villages + the Ay
    // deleguee refinement) + the Rhone restructure (2 derived sub-regions,
    // the Cotes du Rhone regional dissolve, the Vacqueyras commune-union and
    // the meridional + region re-derives). total/validated include retired
    // revisions.
    // Rhone wave 1: +29 dissolves (CdRV + 21 named villages + 6 satellites +
    // Muscat BdV) and the meridional + region re-derive revisions.
    // Loire wave 2: +4 derived sub-region boundaries (Pays Nantais /
    // Anjou-Saumur / Touraine / Centre-Loire).
    // Wave 3a: +1 La Grande Rue dissolve (the missing Vosne grand cru).
    // Loire wave 3b: +11 dissolves (Crémant/Rosé de Loire, Anjou styles,
    // Saumur/Vendômois/Orléans + upper-Loire satellites) and the 3 sub-region
    // + region re-derive revisions.
    // Bordeaux wave 3c: +5 dissolves (Côtes de Bordeaux, Graves de Vayres,
    // Graves Supérieures, Premières Côtes de Bordeaux, Saint-Émilion GC).
    // Wave 3d: +9 dissolves (Sud-Ouest five, Pierrevert, Côte de Beaune
    // AOC + Villages, Mâcon-Villages) and the SO/Provence re-derives.
    // Bordeaux sub-region split: +2 derived outlines (Libournais, Blaye &
    // Bourg).
    // Languedoc/Roussillon + Sud-Ouest sub-region splits: +6 derived
    // outlines.
    // Rhône proper grouping: +3 boundary rows (méridional + region re-derives,
    // new Diois subregion) and +1 current (the new Diois subregion). Bordeaux
    // Entre-Deux-Mers restructure: +1 boundary + place (the subregion outline;
    // the AOC split into a nested node keeping the moved official boundary).
    // Audit coverage re-derives: +9 boundary rows (Savoie / Corse / Languedoc-
    // Roussillon aggregates, Loire + Bourgogne region refreshes, Côte de Beaune,
    // Mâconnais, Montagne de Reims, Côte des Blancs). Current unchanged (all
    // revision replacements); the 3 retired generalized outlines keep generalized.
    // Burgundy premier-cru union polish: +12 DERIVED_FROM_DESCENDANTS revisions
    // (12 village 1er-cru groupings re-derived as generic parcel + named-climat
    // union so each encloses its climat children on drill-down; Givry/Chablis left
    // accurate-but-open — their 1er cru extends past the village and would need a
    // multi-level cascade). Current unchanged (revision replacements); the new rows
    // are validated + valid + labelled but neither manual nor generalized.
    // Alsace communes: +47 commune footprints (IGN Admin Express by INSEE,
    // two of them communes deleguees since the 2016 Kaysersberg Vignoble
    // merger), all validated + current, giving the 51 grands crus a village
    // level to hang off (they moved to tier 3 in the same flip).
  // Assert the PROPERTIES this test is named for, not a census. Every boundary
  // row must be validated, geometrically valid, and carry a label point inside
  // its own polygon — those are the things that would actually be broken.
  //
  // The absolute totals used to be pinned here (1346 before Spain and Italy),
  // which meant every legitimate map wave turned this suite red and the fix was
  // always "bump the number" — noise that hides a real regression. The counts
  // below are ratios and floors instead, so they survive new regions but still
  // fail if a wave lands unvalidated or self-intersecting geometry.
  const b = result.rows[0];
  assert.ok(b.total > 1300, `expected a populated boundary table, got ${b.total}`);
  assert.equal(b.validated, b.total, "every boundary must be VALIDATED");
  assert.equal(b.valid, b.total, "every boundary must be geometrically valid");
  assert.equal(
    b.labelled,
    b.total,
    "every boundary's label_point must sit inside its polygon",
  );
  // Current is a subset of total: superseded revisions are retained as history.
  assert.ok(b.current > 0 && b.current <= b.total);
  assert.equal(b.manual + b.generalized <= b.total, true);

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
  // "Every boundary row carries provenance" is the actual claim, so assert it
  // directly: the join to snapshot+source must lose nothing. Pinning a literal
  // (1346) contradicted the comment above and broke on every map wave.
  const { rows: allRows } = await client.query(
    "select count(*)::int n from wine_place_boundaries",
  );
  assert.equal(
    prov.linked_boundaries,
    allRows[0].n,
    "every boundary must resolve to a snapshot and source",
  );
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
      order by p.canonical_key, r.name`,
  );
  assert.deepEqual(region.rows, [
    { name: "Alsace", canonical_key: "france.alsace" },
    { name: "Beaujolais", canonical_key: "france.beaujolais" },
    { name: "Bordeaux", canonical_key: "france.bordeaux" },
    { name: "Bourgogne", canonical_key: "france.bourgogne" },
    { name: "Champagne", canonical_key: "france.champagne" },
    { name: "Corsica", canonical_key: "france.corse" },
    { name: "Jura", canonical_key: "france.jura" },
    { name: "Languedoc", canonical_key: "france.languedoc-roussillon" },
    { name: "Roussillon", canonical_key: "france.languedoc-roussillon" },
    { name: "Loire", canonical_key: "france.loire" },
    { name: "Provence", canonical_key: "france.provence" },
    { name: "Rhône", canonical_key: "france.rhone" },
    { name: "Savoie", canonical_key: "france.savoie" },
    { name: "Sud Ouest", canonical_key: "france.sud-ouest" },
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
  assert.equal(appellations.rows.length, 397);
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
    ["regions", 14],
    ["appellations", 397],
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
                    'Rhone region migration: exact name match',
                    'Alsace region migration: exact name match',
                    'Jura region migration: exact name match',
                    'Savoie region migration: exact name match',
                    'Corse region migration: exact name match',
                    'Provence region migration: exact name match',
                    'Sud-Ouest region migration: exact name match',
                    'Loire region migration: exact name match',
                    'Languedoc-Roussillon region migration: exact name match'
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
  const f = facts.rows[0];
  // The real invariants: every appellation declares a level (the classification
  // coupling this test exists to guard), France itself is a plain country node,
  // and the French AOC/AOP count is stable because France is complete.
  //
  // `appellations` is deliberately NOT pinned — it grows with every new country
  // (1107 when France was the only one; Spain and Italy have since landed), and
  // pinning it just meant every legitimate wave failed here for no real reason.
  assert.equal(f.missing_level, 0, "every appellation must declare a level");
  assert.equal(f.france_plain, 1, "france is a country node, not an appellation");
  assert.equal(f.aoc, 1107, "France's AOC/AOP set is complete and shouldn't move");
  assert.ok(
    f.appellations >= f.aoc,
    `appellations (${f.appellations}) must include the AOCs (${f.aoc})`,
  );

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
