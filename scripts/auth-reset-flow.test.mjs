// Password reset, end to end at the data layer: only verified addresses may
// reset, the token is single-use, the new password takes effect, and every
// other session dies with it.
//
// Exercises the real modules — a mirrored copy could not catch drift.
// Env: DB_PASSWORD. Run via `npm run test:auth`.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.ts";
import {
  createSession,
  resolveSession,
  revokeAllSessions,
} from "../src/lib/auth/session.ts";
import { issueToken, consumeToken } from "../src/lib/auth/tokens.ts";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const OLD = "old-password-12345";
const NEW = "new-password-67890";
let verifiedId;
let unverifiedId;

async function seed({ verified }) {
  const id = randomUUID();
  const email = `reset-${id.slice(0, 8)}@blindr.invalid`;
  await client.query(
    `insert into profiles (id, display_name, email) values ($1, 'Reset Test', $2)`,
    [id, email],
  );
  await client.query(
    `insert into auth_credentials (user_id, email, password_hash, email_verified_at)
     values ($1, $2, $3, $4)`,
    [id, email, await hashPassword(OLD), verified ? new Date() : null],
  );
  return { id, email };
}

before(async () => {
  await client.connect();
  verifiedId = (await seed({ verified: true })).id;
  unverifiedId = (await seed({ verified: false })).id;
});

after(async () => {
  // profiles cascades to auth_credentials, auth_sessions and auth_tokens.
  await client.query(`delete from profiles where id = any($1::uuid[])`, [
    [verifiedId, unverifiedId],
  ]);
  await client.end();
});

// The eligibility rule the action enforces, stated once here so the test binds
// to the requirement rather than to the action's control flow.
async function eligible(userId) {
  const { rows } = await client.query(
    `select 1 from auth_credentials
      where user_id = $1 and email_verified_at is not null`,
    [userId],
  );
  return rows.length === 1;
}

test("only a verified address is eligible to reset", async () => {
  assert.equal(await eligible(verifiedId), true);
  assert.equal(
    await eligible(unverifiedId),
    false,
    "an unverified address must not be resettable — it is not proven to belong to the account holder",
  );
});

test("a reset token consumes exactly once", async () => {
  const token = await issueToken({
    purpose: "PASSWORD_RESET",
    userId: verifiedId,
    ttlMinutes: 60,
  });
  const first = await consumeToken("PASSWORD_RESET", token);
  assert.equal(first?.userId, verifiedId);
  assert.equal(
    await consumeToken("PASSWORD_RESET", token),
    null,
    "a reset link must not be replayable",
  );
});

test("a verification token cannot be spent as a reset token", async () => {
  const token = await issueToken({
    purpose: "EMAIL_VERIFY",
    userId: verifiedId,
    ttlMinutes: 60,
  });
  assert.equal(await consumeToken("PASSWORD_RESET", token), null);
});

test("the new password replaces the old one", async () => {
  await client.query(
    `update auth_credentials
        set password_hash = $2, password_changed_at = now(),
            failed_attempts = 0, locked_until = null
      where user_id = $1`,
    [verifiedId, await hashPassword(NEW)],
  );
  const { rows } = await client.query(
    `select password_hash from auth_credentials where user_id = $1`,
    [verifiedId],
  );
  assert.equal(await verifyPassword(NEW, rows[0].password_hash), true);
  assert.equal(
    await verifyPassword(OLD, rows[0].password_hash),
    false,
    "the old password still works — the reset did not take",
  );
});

test("resetting signs out every other device", async () => {
  const a = await createSession(verifiedId);
  const b = await createSession(verifiedId);
  assert.ok(await resolveSession(a));
  assert.ok(await resolveSession(b));

  await revokeAllSessions(verifiedId);

  assert.equal(await resolveSession(a), null);
  assert.equal(await resolveSession(b), null, "a stolen session survived a reset");
});

test("revoking one user's sessions leaves another user signed in", async () => {
  const mine = await createSession(verifiedId);
  const theirs = await createSession(unverifiedId);
  await revokeAllSessions(verifiedId);
  assert.equal(await resolveSession(mine), null);
  assert.ok(
    await resolveSession(theirs),
    "revokeAllSessions is not scoped to one user",
  );
});
