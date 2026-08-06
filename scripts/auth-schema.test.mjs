// Auth tables: their shape and shipped constraints, the hash-only invariant on
// token_hash, and who can reach them — no effective privilege for anon,
// authenticated or service_role, full DML for postgres.
// Env: DB_PASSWORD. Read-only.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const TABLES = [
  "auth_credentials",
  "auth_sessions",
  "auth_tokens",
  "auth_rate_limits",
];

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

test("all four auth tables exist with RLS on and no policies", async () => {
  const { rows } = await client.query(
    `select tablename, rowsecurity from pg_tables
      where schemaname = 'public' and tablename = any($1::text[])
      order by tablename`,
    [TABLES],
  );
  assert.deepEqual(
    rows.map((r) => r.tablename),
    [...TABLES].sort(),
  );
  assert.ok(rows.every((r) => r.rowsecurity), "RLS must be on for all");

  const policies = await client.query(
    `select count(*)::int n from pg_policies
      where schemaname = 'public' and tablename = any($1::text[])`,
    [TABLES],
  );
  assert.equal(policies.rows[0].n, 0, "auth tables must carry no policies");
});

// has_table_privilege, not role_table_grants: it resolves PUBLIC grants and
// role membership, so a future `grant select on auth_credentials to public`
// fails this test instead of sliding past a grantee-name filter.
test("no API role holds effective privilege on the auth tables", async () => {
  const { rows } = await client.query(
    `select coalesce(string_agg(t || ':' || r || ':' || p, ', '), '') leaked
       from unnest($1::text[]) t,
            unnest(array['anon','authenticated','service_role']) r,
            unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
      where has_table_privilege(r, 'public.' || t, p)`,
    [TABLES],
  );
  assert.equal(rows[0].leaked, "", "an API role can still reach the auth tables");
});

test("postgres keeps full DML so the auth layer can use its own tables", async () => {
  const { rows } = await client.query(
    `select coalesce(string_agg(t || ':' || p, ', '), '') missing
       from unnest($1::text[]) t,
            unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
      where not has_table_privilege('postgres', 'public.' || t, p)`,
    [TABLES],
  );
  assert.equal(rows[0].missing, "", "postgres lost a privilege it needs");
});

test("token_hash columns reject anything that is not a sha256 hex digest", async () => {
  for (const table of ["auth_sessions", "auth_tokens"]) {
    const { rows } = await client.query(
      `select count(*)::int n from pg_constraint
        where conrelid = $1::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%[0-9a-f]{64}%'`,
      [table],
    );
    assert.equal(rows[0].n, 1, `${table} has no sha256 CHECK on token_hash`);
  }
});

test("credential email is uniquely indexed, case-insensitively, and valid", async () => {
  const { rows } = await client.query(
    `select i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid) def
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
      where c.relname = 'auth_credentials_email_key'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].indisunique, true);
  assert.equal(rows[0].indisvalid, true, "an invalid index enforces nothing");
  assert.match(rows[0].def, /lower\(email\)/i);
});

test("the shipped constraints are present", async () => {
  const { rows } = await client.query(
    `select conrelid::regclass::text tbl, contype, pg_get_constraintdef(oid) def
       from pg_constraint
      where conrelid::regclass::text = any($1::text[])
      order by tbl, def`,
    [TABLES],
  );
  const defs = rows.map((r) => `${r.tbl} ${r.def}`);
  const has = (needle) => defs.some((d) => d.includes(needle));

  // Every auth row dies with its profile.
  for (const t of ["auth_credentials", "auth_sessions", "auth_tokens"]) {
    assert.ok(
      defs.some(
        (d) =>
          d.startsWith(t) &&
          /FOREIGN KEY .*profiles\(id\) ON DELETE CASCADE/.test(d),
      ),
      `${t} is missing its cascading FK to profiles`,
    );
  }
  assert.ok(has("purpose = ANY"), "auth_tokens purpose CHECK missing");
  assert.ok(
    has("user_id IS NOT NULL) OR (email IS NOT NULL"),
    "auth_tokens identity CHECK missing",
  );
  assert.ok(
    defs.some(
      (d) => d.startsWith("auth_sessions") && d.includes("UNIQUE (token_hash)"),
    ),
    "auth_sessions token_hash is not unique",
  );
  assert.ok(
    defs.some(
      (d) => d.startsWith("auth_tokens") && d.includes("UNIQUE (token_hash)"),
    ),
    "auth_tokens token_hash is not unique",
  );
});
