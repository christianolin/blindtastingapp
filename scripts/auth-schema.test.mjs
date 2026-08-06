// Auth tables: shape, and the guarantee that anon/authenticated cannot reach
// them. Env: DB_PASSWORD. Read-only.
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

test("anon and authenticated hold no grants on the auth tables", async () => {
  const { rows } = await client.query(
    `select count(*)::int n
       from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = any($1::text[])
        and grantee in ('anon', 'authenticated')`,
    [TABLES],
  );
  assert.equal(rows[0].n, 0);
});

test("credential email is unique case-insensitively", async () => {
  const { rows } = await client.query(
    `select indexdef from pg_indexes
      where schemaname = 'public' and indexname = 'auth_credentials_email_key'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].indexdef, /UNIQUE.*lower\(email\)/i);
});
