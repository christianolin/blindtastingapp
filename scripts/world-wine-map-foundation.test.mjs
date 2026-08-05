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
  { names: ["Alsace AOP"], key: "france.alsace" },
  { names: ["Altenberg de Bergbieten AOP"], key: "france.alsace.altenberg-de-bergbieten" },
  { names: ["Altenberg de Bergheim AOP"], key: "france.alsace.altenberg-de-bergheim" },
  { names: ["Altenberg de Wolxheim AOP"], key: "france.alsace.altenberg-de-wolxheim" },
  { names: ["Brand AOP"], key: "france.alsace.brand" },
  { names: ["Bruderthal AOP"], key: "france.alsace.bruderthal" },
  { names: ["Eichberg AOP"], key: "france.alsace.eichberg" },
  { names: ["Engelberg AOP"], key: "france.alsace.engelberg" },
  { names: ["Florimont AOP"], key: "france.alsace.florimont" },
  { names: ["Frankstein AOP"], key: "france.alsace.frankstein" },
  { names: ["Froehn AOP"], key: "france.alsace.froehn" },
  { names: ["Furstentum AOP"], key: "france.alsace.furstentum" },
  { names: ["Geisberg AOP"], key: "france.alsace.geisberg" },
  { names: ["Gloeckelberg AOP"], key: "france.alsace.gloeckelberg" },
  { names: ["Goldert AOP"], key: "france.alsace.goldert" },
  { names: ["Hatschbourg AOP"], key: "france.alsace.hatschbourg" },
  { names: ["Hengst AOP"], key: "france.alsace.hengst" },
  { names: ["Kaefferkopf AOP"], key: "france.alsace.kaefferkopf" },
  { names: ["Kanzlerberg AOP"], key: "france.alsace.kanzlerberg" },
  { names: ["Kastelberg AOP"], key: "france.alsace.kastelberg" },
  { names: ["Kessler AOP"], key: "france.alsace.kessler" },
  { names: ["Kirchberg De Barr AOP"], key: "france.alsace.kirchberg-de-barr" },
  { names: ["Kirchberg de Ribeauville AOP"], key: "france.alsace.kirchberg-de-ribeauville" },
  { names: ["Kitterle AOP"], key: "france.alsace.kitterle" },
  { names: ["Mambourg AOP"], key: "france.alsace.mambourg" },
  { names: ["Mandelberg AOP"], key: "france.alsace.mandelberg" },
  { names: ["Marckrain AOP"], key: "france.alsace.marckrain" },
  { names: ["Moenchberg AOP"], key: "france.alsace.moenchberg" },
  { names: ["Muenchberg AOP"], key: "france.alsace.muenchberg" },
  { names: ["Ollwiller AOP"], key: "france.alsace.ollwiller" },
  { names: ["Osterberg AOP"], key: "france.alsace.osterberg" },
  { names: ["Pfersigberg AOP"], key: "france.alsace.pfersigberg" },
  { names: ["Pfingstberg AOP"], key: "france.alsace.pfingstberg" },
  { names: ["Praelatenberg AOP"], key: "france.alsace.praelatenberg" },
  { names: ["Rangen AOP"], key: "france.alsace.rangen" },
  { names: ["Rosacker AOP"], key: "france.alsace.rosacker" },
  { names: ["Saering AOP"], key: "france.alsace.saering" },
  { names: ["Schlossberg AOP"], key: "france.alsace.schlossberg" },
  { names: ["Schoenenbourg AOP"], key: "france.alsace.schoenenbourg" },
  { names: ["Sommerberg AOP"], key: "france.alsace.sommerberg" },
  { names: ["Sonnenglanz AOP"], key: "france.alsace.sonnenglanz" },
  { names: ["Spiegel AOP"], key: "france.alsace.spiegel" },
  { names: ["Sporen AOP"], key: "france.alsace.sporen" },
  { names: ["Steinert AOP"], key: "france.alsace.steinert" },
  { names: ["Steingrubler AOP"], key: "france.alsace.steingrubler" },
  { names: ["Steinklotz AOP"], key: "france.alsace.steinklotz" },
  { names: ["Vorbourg AOP"], key: "france.alsace.vorbourg" },
  { names: ["Wiebelsberg AOP"], key: "france.alsace.wiebelsberg" },
  { names: ["Wineck Schlossberg AOP"], key: "france.alsace.wineck-schlossberg" },
  { names: ["Winzenberg AOP"], key: "france.alsace.winzenberg" },
  { names: ["Zinnkoepfle AOP"], key: "france.alsace.zinnkoepfle" },
  { names: ["Zotzenberg AOP"], key: "france.alsace.zotzenberg" },
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
  { names: ["Entre-Deux-Mers AOP", "Entre-deux-Mers"], key: "france.bordeaux.entre-deux-mers.entre-deux-mers" },
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
  { names: ["Châteauneuf-du-Pape AOP"], key: "france.rhone.chateauneuf-du-pape" },
  { names: ["Gigondas AOP"], key: "france.rhone.gigondas" },
  { names: ["Vinsobres AOP"], key: "france.rhone.vinsobres" },
  { names: ["Cairanne AOP"], key: "france.rhone.cairanne" },
  { names: ["Rasteau AOP"], key: "france.rhone.rasteau" },
  { names: ["Beaumes de Venise AOP"], key: "france.rhone.beaumes-de-venise" },
  { names: ["Lirac AOP"], key: "france.rhone.lirac" },
  { names: ["Tavel AOP"], key: "france.rhone.tavel" },
  { names: ["Cotes du Rhone AOP"], key: "france.rhone.cotes-du-rhone" },
  { names: ["Vacqueyras AOP"], key: "france.rhone.vacqueyras" },
  { names: ["Cotes du Rhone Villages AOP"], key: "france.rhone.cotes-du-rhone-villages" },
  { names: ["Chusclan AOP"], key: "france.rhone.cotes-du-rhone-villages.chusclan" },
  { names: ["Laudun AOP"], key: "france.rhone.cotes-du-rhone-villages.laudun" },
  { names: ["Massif d'Uchaux AOP"], key: "france.rhone.cotes-du-rhone-villages.massif-d-uchaux" },
  { names: ["Plan de Dieu AOP"], key: "france.rhone.cotes-du-rhone-villages.plan-de-dieu" },
  { names: ["Roaix AOP"], key: "france.rhone.cotes-du-rhone-villages.roaix" },
  { names: ["Rochegude AOP"], key: "france.rhone.cotes-du-rhone-villages.rochegude" },
  { names: ["Rousset-les-Vignes AOP"], key: "france.rhone.cotes-du-rhone-villages.rousset-les-vignes" },
  { names: ["Sablet AOP"], key: "france.rhone.cotes-du-rhone-villages.sablet" },
  { names: ["Saint-Gervais AOP"], key: "france.rhone.cotes-du-rhone-villages.saint-gervais" },
  { names: ["Saint-Maurice AOP"], key: "france.rhone.cotes-du-rhone-villages.saint-maurice" },
  { names: ["Sainte-Cecile AOP"], key: "france.rhone.cotes-du-rhone-villages.sainte-cecile" },
  { names: ["Seguret AOP"], key: "france.rhone.cotes-du-rhone-villages.seguret" },
  { names: ["Signargues AOP"], key: "france.rhone.cotes-du-rhone-villages.signargues" },
  { names: ["Suza la Rousse AOP"], key: "france.rhone.cotes-du-rhone-villages.suze-la-rousse" },
  { names: ["Vaison le Romaine AOP"], key: "france.rhone.cotes-du-rhone-villages.vaison-la-romaine" },
  { names: ["Valreas AOP"], key: "france.rhone.cotes-du-rhone-villages.valreas" },
  { names: ["Ventoux AOP"], key: "france.rhone.ventoux" },
  { names: ["Luberon AOP"], key: "france.rhone.luberon" },
  { names: ["Grignan-les-Adhemar AOP"], key: "france.rhone.grignan-les-adhemar" },
  { names: ["Cotes du Vivarais AOP"], key: "france.rhone.cotes-du-vivarais" },
  { names: ["Clairette de Die AOP"], key: "france.rhone.clairette-de-die" },
  { names: ["Cremant de Die AOP"], key: "france.rhone.cremant-de-die" },
  { names: ["Muscat de Beaumes de Venise AOP"], key: "france.rhone.muscat-de-beaumes-de-venise" },
  { names: ["Jura"], key: "france.jura" },
  { names: ["Cotes du Jura AOP"], key: "france.jura" },
  { names: ["Arbois AOP"], key: "france.jura.arbois" },
  { names: ["Arbois Pupillin AOP"], key: "france.jura.arbois-pupillin" },
  { names: ["Château-Chalon AOP"], key: "france.jura.chateau-chalon" },
  { names: ["L'Etoile AOP"], key: "france.jura.l-etoile" },
  { names: ["Savoie AOP"], key: "france.savoie" },
  { names: ["Vin de Savoie AOP"], key: "france.savoie" },
  { names: ["Roussette de Savoie AOP"], key: "france.savoie.roussette-de-savoie" },
  { names: ["Apremont AOP"], key: "france.savoie.apremont" },
  { names: ["Arbin AOP"], key: "france.savoie.arbin" },
  { names: ["Ayze AOP"], key: "france.savoie.ayze" },
  { names: ["Chautagne AOP"], key: "france.savoie.chautagne" },
  { names: ["Chignin AOP"], key: "france.savoie.chignin" },
  { names: ["Chignin-Bergeron AOP"], key: "france.savoie.chignin-bergeron" },
  { names: ["Frangy AOP"], key: "france.savoie.frangy" },
  { names: ["Jongieux AOP"], key: "france.savoie.jongieux" },
  { names: ["Les Abymes AOP"], key: "france.savoie.abymes-ou-les-abymes" },
  { names: ["Monterminod AOP"], key: "france.savoie.monterminod" },
  { names: ["Monthoux AOP"], key: "france.savoie.monthoux" },
  { names: ["Corse AOP"], key: "france.corse" },
  { names: ["Vin de Corse AOP"], key: "france.corse" },
  { names: ["Corse-Calvi AOP"], key: "france.corse.calvi" },
  { names: ["Corse-Coteaux du Cap Corse AOP"], key: "france.corse.coteaux-du-cap-corse" },
  { names: ["Corse-Figari AOP"], key: "france.corse.figari" },
  { names: ["Corse Porto Vecchio AOP"], key: "france.corse.porto-vecchio" },
  { names: ["Corse-Sartene AOP"], key: "france.corse.sartene" },
  { names: ["Ajaccio AOP"], key: "france.corse.ajaccio" },
  { names: ["Patrimonio AOP"], key: "france.corse.patrimonio" },
  { names: ["Muscat de Cap Corse AOP"], key: "france.corse.muscat-du-cap-corse" },
  { names: ["Provence AOP"], key: "france.provence" },
  { names: ["Côtes de Provence AOP"], key: "france.provence.cotes-de-provence" },
  { names: ["Coteaux d'Aix-en-Provence AOP"], key: "france.provence.coteaux-daix-en-provence" },
  { names: ["Coteaux Varois en Provence AOP"], key: "france.provence.coteaux-varois-en-provence" },
  { names: ["Sainte-Victoire AOP"], key: "france.provence.cotes-de-provence-sainte-victoire" },
  { names: ["Bandol AOP"], key: "france.provence.bandol" },
  { names: ["Les Baux-de-Provence AOP"], key: "france.provence.les-baux-de-provence" },
  { names: ["Palette AOP"], key: "france.provence.palette" },
  { names: ["Bergerac AOP"], key: "france.sud-ouest.bergerac" },
  { names: ["Monbazillac AOP"], key: "france.sud-ouest.monbazillac" },
  { names: ["Montravel AOP"], key: "france.sud-ouest.montravel" },
  { names: ["Pecharmant AOP"], key: "france.sud-ouest.pecharmant" },
  { names: ["Saussignac AOP"], key: "france.sud-ouest.saussignac" },
  { names: ["Cotes de Duras AOP"], key: "france.sud-ouest.cotes-de-duras" },
  { names: ["Cotes du Marmandais AOP"], key: "france.sud-ouest.cotes-du-marmandais" },
  { names: ["Cahors AOP"], key: "france.sud-ouest.cahors" },
  { names: ["Gaillac AOP"], key: "france.sud-ouest.gaillac" },
  { names: ["Gaillac Premieres Cotes AOP"], key: "france.sud-ouest.gaillac-premieres-cotes" },
  { names: ["Fronton AOP"], key: "france.sud-ouest.fronton" },
  { names: ["Brulhois AOP"], key: "france.sud-ouest.brulhois" },
  { names: ["Marcillac AOP"], key: "france.sud-ouest.marcillac" },
  { names: ["Madiran AOP"], key: "france.sud-ouest.madiran" },
  { names: ["Pacherenc du Vic-Bilh AOP"], key: "france.sud-ouest.pacherenc-du-vic-bilh" },
  { names: ["Jurancon AOP"], key: "france.sud-ouest.jurancon" },
  { names: ["Irouleguy AOP"], key: "france.sud-ouest.irouleguy" },
  { names: ["Buzet AOP"], key: "france.sud-ouest.buzet" },
  { names: ["Muscadet AOP"], key: "france.loire.muscadet" },
  { names: ["Muscadet Cotes de Grandlieu AOP"], key: "france.loire.muscadet-cotes-de-grandlieu" },
  { names: ["Muscadet Sevre et Maine AOP"], key: "france.loire.muscadet-sevre-et-maine" },
  { names: ["Gros Plant du Pays Nantais AOP"], key: "france.loire.gros-plant-du-pays-nantais" },
  { names: ["Anjou AOP"], key: "france.loire.anjou" },
  { names: ["Anjou Villages AOP"], key: "france.loire.anjou-villages" },
  { names: ["Anjou Villages Brissac AOP"], key: "france.loire.anjou-brissac" },
  { names: ["Savennieres Roche aux Moines AOP"], key: "france.loire.savennieres-roche-aux-moines" },
  { names: ["Coteaux du Layon AOP"], key: "france.loire.coteaux-du-layon" },
  { names: ["Coteaux du Layon Chaume Premier Cru AOP"], key: "france.loire.coteaux-du-layon-premier-cru-chaume" },
  { names: ["Quarts de Chaume AOP"], key: "france.loire.quarts-de-chaume" },
  { names: ["Bonnezeaux AOP"], key: "france.loire.bonnezeaux" },
  { names: ["Coteaux de l'Aubance AOP"], key: "france.loire.coteaux-de-l-aubance" },
  { names: ["Saumur AOP"], key: "france.loire.saumur" },
  { names: ["Saumur-Champigny AOP"], key: "france.loire.saumur-champigny" },
  { names: ["Touraine AOP"], key: "france.loire.touraine" },
  { names: ["Vouvray AOP"], key: "france.loire.vouvray" },
  { names: ["Montlouis-sur-Loire AOP"], key: "france.loire.montlouis-sur-loire" },
  { names: ["Chinon AOP"], key: "france.loire.chinon" },
  { names: ["Bourgueil AOP"], key: "france.loire.bourgueil" },
  { names: ["Saint Nicolas de Bourgueil AOP"], key: "france.loire.saint-nicolas-de-bourgueil" },
  { names: ["Jasnieres AOP"], key: "france.loire.jasnieres" },
  { names: ["Coteaux du Loir AOP"], key: "france.loire.coteaux-du-loir" },
  { names: ["Cheverny AOP"], key: "france.loire.cheverny" },
  { names: ["Cour-Cheverny AOP"], key: "france.loire.cour-cheverny" },
  { names: ["Valencay AOP"], key: "france.loire.valencay" },
  { names: ["Haut-Poitou AOP"], key: "france.loire.haut-poitou" },
  { names: ["Sancerre AOP"], key: "france.loire.sancerre" },
  { names: ["Pouilly-Fumé AOP"], key: "france.loire.pouilly-fume" },
  { names: ["Pouilly sur Loire AOP"], key: "france.loire.pouilly-sur-loire" },
  { names: ["Menetou Salon AOP"], key: "france.loire.menetou-salon" },
  { names: ["Quincy AOP"], key: "france.loire.quincy" },
  { names: ["Reuilly AOP"], key: "france.loire.reuilly" },
  { names: ["Coteaux du Giennois AOP"], key: "france.loire.coteaux-du-giennois" },
  { names: ["Chateaumeillant AOP"], key: "france.loire.chateaumeillant" },
  { names: ["Amboise AOP"], key: "france.loire.touraine-amboise" },
  { names: ["Azay-le Rideau AOP"], key: "france.loire.touraine-azay-le-rideau" },
  { names: ["Chenonceaux AOP"], key: "france.loire.touraine-chenonceaux" },
  { names: ["Mesland AOP"], key: "france.loire.touraine-mesland" },
  { names: ["Oisly AOP"], key: "france.loire.touraine-oisly" },
  { names: ["Clisson AOP"], key: "france.loire.muscadet-sevre-et-maine-clisson" },
  { names: ["Gorges AOP"], key: "france.loire.muscadet-sevre-et-maine-gorges" },
  { names: ["Savennières AOP"], key: "france.loire.savennieres" },
  { names: ["Alsace Grand Cru Rangen"], key: "france.alsace.rangen" },
  { names: ["Alsace Grand Cru Schlossberg"], key: "france.alsace.schlossberg" },
  { names: ["Chablis Premier Cru"], key: "france.bourgogne.chablis.chablis.premier-cru" },
  { names: ["La Grande Rue AOP"], key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue" },
  { names: ["Cremant de Loire AOP"], key: "france.loire.cremant-de-loire" },
  { names: ["Rose de Loire AOP"], key: "france.loire.rose-de-loire" },
  { names: ["Cabernet d'Anjou AOP"], key: "france.loire.cabernet-d-anjou" },
  { names: ["Rose d’Anjou AOP"], key: "france.loire.rose-d-anjou" },
  { names: ["Coteaux de Saumur AOP"], key: "france.loire.coteaux-de-saumur" },
  { names: ["Coteaux du Vendomois AOP"], key: "france.loire.coteaux-du-vendomois" },
  { names: ["Orleans AOP"], key: "france.loire.orleans" },
  { names: ["Orleans-Clery AOP"], key: "france.loire.orleans-clery" },
  { names: ["Cote Roannaise AOP"], key: "france.loire.cote-roannaise" },
  { names: ["Cotes du Forez AOP"], key: "france.loire.cotes-du-forez" },
  { names: ["Saint Pourcain AOP"], key: "france.loire.saint-pourcain" },
  { names: ["Bordeaux AOP"], key: "france.bordeaux" },
  { names: ["Bordeaux Superieur AOP"], key: "france.bordeaux" },
  { names: ["Cremant de Bordeaux AOP"], key: "france.bordeaux" },
  { names: ["Blaye AOP"], key: "france.bordeaux.blaye" },
  { names: ["Cotes de Bordeaux Saint-Macaire AOP"], key: "france.bordeaux.cotes-de-bordeaux-saint-macaire" },
  { names: ["Cotes de Bordeaux AOP"], key: "france.bordeaux.cotes-de-bordeaux" },
  { names: ["Graves de Vayres AOP"], key: "france.bordeaux.graves-de-vayres" },
  { names: ["Graves Superieures AOP"], key: "france.bordeaux.graves.graves-superieures" },
  { names: ["Premieres Cotes de Bordeaux AOP"], key: "france.bordeaux.premieres-cotes-de-bordeaux" },
  { names: ["Saint-Émilion Grand Cru AOP"], key: "france.bordeaux.saint-emilion.saint-emilion-grand-cru" },
  { names: ["Bourgogne AOP"], key: "france.bourgogne" },
  { names: ["Bourgogne Aligote AOP"], key: "france.bourgogne" },
  { names: ["Bourgogne Passe-tout-grains AOP"], key: "france.bourgogne" },
  { names: ["Cremant de Bourgogne AOP"], key: "france.bourgogne" },
  { names: ["Cote de Beaune AOP"], key: "france.bourgogne.cote-de-beaune.cote-de-beaune" },
  { names: ["Cote de Beaune-Villages AOP"], key: "france.bourgogne.cote-de-beaune.cote-de-beaune-villages" },
  { names: ["Macon-Villages AOP"], key: "france.bourgogne.maconnais.macon-villages" },
  { names: ["Cremant de Limoux AOP"], key: "france.languedoc-roussillon.limoux" },
  { names: ["Cremant du Jura AOP"], key: "france.jura" },
  { names: ["Macvin du Jura AOP"], key: "france.jura" },
  { names: ["Pierrevert AOP"], key: "france.provence.pierrevert" },
  { names: ["Cotes de Bergerac AOP"], key: "france.sud-ouest.cotes-de-bergerac" },
  { names: ["Cotes de Montravel AOP"], key: "france.sud-ouest.cotes-de-montravel" },
  { names: ["Haut-Montravel AOP"], key: "france.sud-ouest.haut-montravel" },
  { names: ["Saint-Mont AOP"], key: "france.sud-ouest.saint-mont" },
  { names: ["Tursan AOP"], key: "france.sud-ouest.tursan" },
  { names: ["Languedoc AOP"], key: "france.languedoc-roussillon" },
  { names: ["Roussillon AOP"], key: "france.languedoc-roussillon" },
  { names: ["Gres de Montpellier AOP"], key: "france.languedoc-roussillon.languedoc-gres-de-montpellier" },
  { names: ["Montpeyroux AOP"], key: "france.languedoc-roussillon.languedoc-montpeyroux" },
  { names: ["Terrasses du Larzac AOP"], key: "france.languedoc-roussillon.terrasses-du-larzac" },
  { names: ["Pic Saint Loup AOP"], key: "france.languedoc-roussillon.pic-saint-loup" },
  { names: ["La Clape AOP"], key: "france.languedoc-roussillon.la-clape" },
  { names: ["Picpoul de Pinet AOP"], key: "france.languedoc-roussillon.picpoul-de-pinet" },
  { names: ["Clairette du Languedoc AOP"], key: "france.languedoc-roussillon.clairette-du-languedoc" },
  { names: ["Clairette de Bellegarde AOP"], key: "france.languedoc-roussillon.clairette-de-bellegarde" },
  { names: ["Corbières AOP"], key: "france.languedoc-roussillon.corbieres" },
  { names: ["Minervois AOP"], key: "france.languedoc-roussillon.minervois" },
  { names: ["Saint Chinian AOP"], key: "france.languedoc-roussillon.saint-chinian" },
  { names: ["Faugères AOP"], key: "france.languedoc-roussillon.faugeres" },
  { names: ["Fitou AOP"], key: "france.languedoc-roussillon.fitou" },
  { names: ["Cabardes AOP"], key: "france.languedoc-roussillon.cabardes" },
  { names: ["Malepere AOP"], key: "france.languedoc-roussillon.malepere" },
  { names: ["Limoux AOP"], key: "france.languedoc-roussillon.limoux" },
  { names: ["Costieres de Nimes AOP"], key: "france.languedoc-roussillon.costieres-de-nimes" },
  { names: ["Cotes du Roussillon AOP"], key: "france.languedoc-roussillon.cotes-du-roussillon" },
  { names: ["Cotes du Roussillon-Villages AOP"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages" },
  { names: ["Caramany AOP"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-caramany" },
  { names: ["Lesquerde AOP"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde" },
  { names: ["Tautavel AOP"], key: "france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel" },
  { names: ["Collioure AOP"], key: "france.languedoc-roussillon.collioure" },
  { names: ["Banyuls AOP"], key: "france.languedoc-roussillon.banyuls" },
  { names: ["Banyuls Grand Cru AOP"], key: "france.languedoc-roussillon.banyuls-grand-cru" },
  { names: ["Maury AOP"], key: "france.languedoc-roussillon.maury" },
  { names: ["Maury Sec AOP"], key: "france.languedoc-roussillon.maury" },
  { names: ["Rivesaltes AOP"], key: "france.languedoc-roussillon.rivesaltes" },
  { names: ["Muscat de Rivesaltes AOP"], key: "france.languedoc-roussillon.muscat-de-rivesaltes" },
  { names: ["Muscat de Lunel AOP"], key: "france.languedoc-roussillon.muscat-de-lunel" },
  { names: ["Muscat de Saint Jean de Minervois AOP"], key: "france.languedoc-roussillon.muscat-de-saint-jean-de-minervois" },
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
    total: 1346,
    validated: 1346,
    current: 1241,
    valid: 1346,
    labelled: 1346,
    // MANUAL = France + Champagne region + 2 outer sub-region commune-unions
    // (Sezanne/Bar) + 59 village commune footprints (17 GC + 42 Premier Cru,
    // four of them deleguees) + the retired Ay commune-nouvelle revision.
    // + the France Admin Express outline (its retired NE revision included)
    // + the Vacqueyras 2-commune union (its aire has no INAO parcels)
    // + the 47 Alsace commune footprints.
    manual: 114,
    generalized: 1149,
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
  assert.equal(prov.linked_boundaries, 1346);
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
  assert.deepEqual(facts.rows[0], {
      // 111 through wave 3D-1 + 23 across Chablis, Grand Auxerrois, Côte
      // Chalonnaise and Mâconnais (16 villages, 1 grand cru, 6 groups),
      // +1 Champagne (region == regional AOC), +52 Alsace (dual-role region
      // + 51 grands crus), +2 Rhone (Cotes du Rhone regional + Vacqueyras;
      // the 2 Rhone SUBREGIONs are not appellations).
      appellations: 1107,
      aoc: 1107,
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
