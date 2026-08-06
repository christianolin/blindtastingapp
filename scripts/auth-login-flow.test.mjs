// The login path's security-critical behaviour, exercised against the real
// modules: a migrated Supabase user (bcrypt $2a$10$) can sign in with their old
// password, and that login transparently upgrades them to argon2id.
//
// Seeds its own credential row. auth_credentials is empty until the Task 13
// backfill runs, so this cannot rely on migrated users existing yet.
//
// Env: DB_PASSWORD. Run with:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-login-flow.test.mjs
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../src/lib/auth/password.ts";
import { createSession, resolveSession } from "../src/lib/auth/session.ts";
import { authPool, query } from "../src/lib/auth/db.ts";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const PASSWORD = "correct horse battery staple";
const EMAIL = `login-flow-${Date.now()}@blindr.invalid`;
let userId;

before(async () => {
  // Attach to a real profile: auth_credentials.user_id is NOT NULL and FKs to
  // profiles, and Postgres checks both before any CHECK constraint.
  const profiles = await query("select id from profiles limit 1");
  assert.equal(profiles.length, 1, "need at least one profile to attach to");
  userId = profiles[0].id;

  // Exactly what the Supabase backfill will produce: bcrypt at cost 10.
  await query(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, $3)
     on conflict (user_id) do update
       set email = excluded.email, password_hash = excluded.password_hash`,
    [userId, EMAIL, bcrypt.hashSync(PASSWORD, 10)],
  );
});

after(async () => {
  if (userId) {
    await query("delete from auth_sessions where user_id = $1", [userId]);
    await query("delete from auth_credentials where user_id = $1", [userId]);
  }
  await authPool().end();
});

const storedHash = async () =>
  (
    await query("select password_hash from auth_credentials where user_id = $1", [
      userId,
    ])
  )[0]?.password_hash;

test("a migrated user starts on bcrypt, and it is flagged for rehash", async () => {
  const hash = await storedHash();
  assert.match(hash, /^\$2[aby]\$10\$/);
  assert.equal(needsRehash(hash), true);
});

test("the credential lookup is case-insensitive", async () => {
  const rows = await query(
    "select user_id from auth_credentials where lower(email) = lower($1)",
    [EMAIL.toUpperCase()],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, userId);
});

test("the old password verifies against the bcrypt hash", async () => {
  assert.equal(await verifyPassword(PASSWORD, await storedHash()), true);
  assert.equal(await verifyPassword("wrong password", await storedHash()), false);
});

test("the transparent upgrade replaces bcrypt with argon2id, and is idempotent", async () => {
  // Reproduces signIn's upgrade branch: verify, then rehash while we still hold
  // the plaintext.
  const before = await storedHash();
  assert.equal(needsRehash(before), true);

  await query(
    "update auth_credentials set password_hash = $2, updated_at = now() where user_id = $1",
    [userId, await hashPassword(PASSWORD)],
  );

  const after = await storedHash();
  assert.match(after, /^\$argon2id\$/);
  assert.equal(needsRehash(after), false, "an upgraded hash must not re-upgrade");
  // The upgrade must not lock the user out of their own password.
  assert.equal(await verifyPassword(PASSWORD, after), true);
  assert.equal(await verifyPassword("wrong password", after), false);
});

test("a session issued at login resolves back to that user", async () => {
  const token = await createSession(userId, { userAgent: "test", ip: "127.0.0.1" });
  const resolved = await resolveSession(token);
  assert.ok(resolved, "the freshly issued session must resolve");
  assert.equal(resolved.userId, userId);

  // And the token is not recoverable from the row.
  const rows = await query(
    "select count(*)::int n from auth_sessions where token_hash = $1",
    [token],
  );
  assert.equal(rows[0].n, 0, "the raw token must never appear in token_hash");
});
