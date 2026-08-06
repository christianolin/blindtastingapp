// Fixed-window rate limiting: allows up to the limit, blocks past it, and
// resets once the window rolls.
//
// Imports the REAL module rather than mirroring its SQL — a test that
// re-implements the thing it tests cannot catch drift in it.
//
// Env: DB_PASSWORD. Run with:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-rate-limit.test.mjs
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { checkRateLimit } from "../src/lib/auth/rate-limit.ts";
import { authPool } from "../src/lib/auth/db.ts";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const keys = [];
const newKey = () => {
  const k = `test:${randomBytes(8).toString("hex")}`;
  keys.push(k);
  return k;
};

before(async () => {
  await client.connect();
});

after(async () => {
  if (keys.length > 0) {
    await client.query("delete from auth_rate_limits where key = any($1)", [keys]);
  }
  await client.end();
  await authPool().end();
});

test("allows exactly up to the limit, then blocks", async () => {
  const key = newKey();
  assert.equal(await checkRateLimit(key, 3, 60), true, "1st");
  assert.equal(await checkRateLimit(key, 3, 60), true, "2nd");
  assert.equal(await checkRateLimit(key, 3, 60), true, "3rd");
  assert.equal(await checkRateLimit(key, 3, 60), false, "4th must be blocked");
  assert.equal(await checkRateLimit(key, 3, 60), false, "and it stays blocked");
});

test("resets once the window has rolled", async () => {
  const key = newKey();
  assert.equal(await checkRateLimit(key, 1, 60), true);
  assert.equal(await checkRateLimit(key, 1, 60), false);

  // Age the window rather than sleeping through it.
  await client.query(
    "update auth_rate_limits set window_start = now() - interval '2 minutes' where key = $1",
    [key],
  );
  assert.equal(await checkRateLimit(key, 1, 60), true, "window should have rolled");
  assert.equal(await checkRateLimit(key, 1, 60), false, "and the new window counts");
});

test("keys are independent of one another", async () => {
  const a = newKey();
  const b = newKey();
  assert.equal(await checkRateLimit(a, 1, 60), true);
  assert.equal(await checkRateLimit(a, 1, 60), false, "a is now blocked");
  assert.equal(await checkRateLimit(b, 1, 60), true, "b must be unaffected by a");
});

test("the row actually persists what the limiter counted", async () => {
  const key = newKey();
  await checkRateLimit(key, 5, 60);
  await checkRateLimit(key, 5, 60);
  const { rows } = await client.query(
    "select count, window_start from auth_rate_limits where key = $1",
    [key],
  );
  assert.equal(rows.length, 1, "the limiter must persist state, not count in memory");
  assert.equal(rows[0].count, 2);
  assert.ok(
    rows[0].window_start instanceof Date,
    "window_start must be set so the window can roll",
  );
});
