// Email tokens: hashed at rest, single-use, purpose-bound, and expiring.
//
// Imports the REAL module rather than mirroring its SQL, so the suite fails if
// the implementation drifts. Requires the strip-types + react-server flags:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-tokens.test.mjs
// or just `npm run test:auth`.
//
// Env: DB_PASSWORD. Creates and cleans up its own rows.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createHash } from "node:crypto";
import pg from "pg";
import { issueToken, consumeToken } from "../src/lib/auth/tokens.ts";
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

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
let userId;

before(async () => {
  await client.connect();
  const { rows } = await client.query(`select id from profiles limit 1`);
  assert.ok(rows[0], "need a profile to hang tokens off");
  userId = rows[0].id;
});

after(async () => {
  // Scoped to this suite's marker so a parallel run is never clobbered.
  await client.query(`delete from auth_tokens where payload ->> 'suite' = 'auth-tokens'`);
  await client.end();
  await authPool().end();
});

const issue = (purpose, ttlMinutes, extra = {}) =>
  issueToken({
    purpose,
    userId,
    ttlMinutes,
    payload: { suite: "auth-tokens", ...extra },
  });

test("only the hash is stored, never the token", async () => {
  const token = await issue("EMAIL_VERIFY", 60);

  const byHash = await client.query(
    `select count(*)::int n from auth_tokens where token_hash = $1`,
    [sha256(token)],
  );
  assert.equal(byHash.rows[0].n, 1, "the hash should identify exactly one row");

  const byPlaintext = await client.query(
    `select count(*)::int n from auth_tokens where token_hash = $1`,
    [token],
  );
  assert.equal(byPlaintext.rows[0].n, 0, "the plaintext token must not be stored");
});

test("the stored hash is lowercase sha256 hex, as the CHECK requires", async () => {
  const token = await issue("EMAIL_VERIFY", 60);
  const { rows } = await client.query(
    `select token_hash from auth_tokens where token_hash = $1`,
    [sha256(token)],
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

test("a token consumes exactly once", async () => {
  const token = await issue("PASSWORD_RESET", 60);
  const first = await consumeToken("PASSWORD_RESET", token);
  assert.equal(first?.userId, userId);
  assert.equal(
    await consumeToken("PASSWORD_RESET", token),
    null,
    "a consumed token must not work a second time",
  );
});

test("a token is not valid for a different purpose", async () => {
  const token = await issue("EMAIL_VERIFY", 60);
  assert.equal(
    await consumeToken("PASSWORD_RESET", token),
    null,
    "purpose must be part of the match, or a verify link would reset a password",
  );
  // ...and the failed attempt must not have burned it.
  assert.equal((await consumeToken("EMAIL_VERIFY", token))?.userId, userId);
});

test("an expired token does not consume", async () => {
  const token = await issue("EMAIL_VERIFY", -1);
  assert.equal(await consumeToken("EMAIL_VERIFY", token), null);
});

test("an unknown token consumes to null rather than throwing", async () => {
  assert.equal(await consumeToken("EMAIL_VERIFY", "no-such-token"), null);
});

test("the payload survives the round trip", async () => {
  const token = await issue("INVITE", 60, { tastingId: "abc-123" });
  const claim = await consumeToken("INVITE", token);
  assert.equal(claim?.payload.tastingId, "abc-123");
});

test("two tokens issued back to back are distinct", async () => {
  const a = await issue("EMAIL_VERIFY", 60);
  const b = await issue("EMAIL_VERIFY", 60);
  assert.notEqual(a, b, "tokens must not be guessable from one another");
  assert.ok(a.length >= 43, "expected 32 bytes of base64url");
});
