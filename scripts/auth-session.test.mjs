// Session store: opaque tokens hashed at rest, resolve and revoke, and the
// throttled sliding expiry — exercised through the real module, not a copy of
// its SQL, so drift between the two cannot hide here.
//
// Run with:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-session.test.mjs
//
// The extra flags exist because this file imports the real TypeScript modules:
// --experimental-strip-types lets Node load session.ts and db.ts directly, and
// --conditions=react-server resolves their "server-only" import to a usable
// stub. Node prints an ExperimentalWarning about type stripping on stderr.
//
// The modules connect as `postgres`, not through PostgREST: service_role was
// revoked from the auth tables in Task 2 and now gets 42501 on all four.
// Env: DB_PASSWORD. Every row created here is deleted in `after`.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { authPool, query } from "../src/lib/auth/db.ts";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
  randomToken,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  sha256,
} from "../src/lib/auth/session.ts";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

// Tokens are never asserted on by value and never printed: failures report a
// message, so no session token can reach the test log.
let userId;
// revokeAllSessions is a blunt instrument, so it gets a user of its own and
// cannot reach the rows the other tests depend on.
let revokeAllUserId;
const hashes = [];

async function newSession(meta = {}) {
  const token = await createSession(userId, meta);
  hashes.push(sha256(token));
  return token;
}

// The slide is deliberately fire-and-forget, so it can land after
// resolveSession has already returned. Poll instead of guessing a delay.
async function waitFor(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > deadline) return false;
    await sleep(50);
  }
}

before(async () => {
  const profiles = await query("select id from profiles order by id limit 2");
  assert.equal(profiles.length, 2, "need at least two profiles to seed");
  userId = profiles[0].id;
  revokeAllUserId = profiles[1].id;

  const existing = await query(
    "select count(*)::int n from auth_sessions where user_id = any($1::uuid[])",
    [[userId, revokeAllUserId]],
  );
  assert.equal(
    existing[0].n,
    0,
    "seed profiles already carry sessions; a previous run left rows behind",
  );
});

after(async () => {
  if (hashes.length > 0) {
    await query("delete from auth_sessions where token_hash = any($1::text[])", [
      hashes,
    ]);
  }
  await authPool().end();
});

test("createSession stores the hash and never the token itself", async () => {
  const token = await newSession();
  const rows = await query(
    "select user_id, token_hash from auth_sessions where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(rows.length, 1, "the session row should exist");
  assert.equal(rows[0].user_id, userId);
  assert.ok(
    /^[0-9a-f]{64}$/.test(rows[0].token_hash),
    "stored token_hash must be lowercase sha256 hex",
  );

  const plaintext = await query(
    "select count(*)::int n from auth_sessions where token_hash = $1",
    [token],
  );
  assert.equal(
    plaintext[0].n,
    0,
    "the plaintext token must not appear in the table",
  );
});

test("a new session expires SESSION_TTL_DAYS out", async () => {
  const token = await newSession();
  const rows = await query(
    `select expires_at between now() + ($2 || ' days')::interval - interval '1 minute'
                           and now() + ($2 || ' days')::interval + interval '1 minute' as ok
       from auth_sessions where token_hash = $1`,
    [sha256(token), String(SESSION_TTL_DAYS)],
  );
  assert.equal(rows[0].ok, true, "expires_at should be SESSION_TTL_DAYS ahead");
});

test("a fresh session resolves to its user and session id", async () => {
  const token = await newSession();
  const resolved = await resolveSession(token);
  assert.ok(resolved, "a fresh session should resolve");
  assert.equal(resolved.userId, userId);

  const rows = await query(
    "select id from auth_sessions where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(resolved.sessionId, rows[0].id, "sessionId should be the row id");
});

test("a session resolves to its own user, not merely to some user", async () => {
  const mine = await newSession();
  const theirs = await createSession(revokeAllUserId, {});
  hashes.push(sha256(theirs));

  assert.equal((await resolveSession(mine)).userId, userId);
  assert.equal((await resolveSession(theirs)).userId, revokeAllUserId);
  assert.ok(userId !== revokeAllUserId, "the two seed users must differ");
});

test("an unknown token resolves to null", async () => {
  assert.equal(await resolveSession(randomToken()), null);
});

test("an expired session does not resolve", async () => {
  const token = await newSession();
  await query(
    "update auth_sessions set expires_at = now() - interval '1 second' where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(await resolveSession(token), null);
});

test("revokeSession kills exactly one session", async () => {
  const doomed = await newSession();
  const spared = await newSession();

  await revokeSession(doomed);
  assert.equal(await resolveSession(doomed), null, "revoked must not resolve");
  assert.ok(
    await resolveSession(spared),
    "revoking one session must not touch another",
  );

  const rows = await query(
    "select revoked_at is not null as revoked from auth_sessions where token_hash = $1",
    [sha256(doomed)],
  );
  assert.equal(rows[0].revoked, true, "the row should be marked revoked");
});

test("revokeAllSessions signs out every device for that user only", async () => {
  const first = await createSession(revokeAllUserId, {});
  const second = await createSession(revokeAllUserId, {});
  hashes.push(sha256(first), sha256(second));
  const other = await newSession();

  await revokeAllSessions(revokeAllUserId);
  assert.equal(await resolveSession(first), null);
  assert.equal(await resolveSession(second), null);
  assert.ok(
    await resolveSession(other),
    "another user's session must survive a mass revoke",
  );
});

test("user agent and ip are recorded, and default to null", async () => {
  const withMeta = await newSession({
    userAgent: "Mozilla/5.0 (auth-session.test)",
    ip: "203.0.113.7",
  });
  const meta = await query(
    "select user_agent, host(ip) as ip from auth_sessions where token_hash = $1",
    [sha256(withMeta)],
  );
  assert.equal(meta[0].user_agent, "Mozilla/5.0 (auth-session.test)");
  assert.equal(meta[0].ip, "203.0.113.7");

  const bare = await newSession();
  const none = await query(
    "select user_agent, ip from auth_sessions where token_hash = $1",
    [sha256(bare)],
  );
  assert.equal(none[0].user_agent, null);
  assert.equal(none[0].ip, null);
});

test("resolving an hour-stale session slides its expiry", async () => {
  const token = await newSession();
  const hash = sha256(token);
  await query(
    `update auth_sessions
        set last_seen_at = now() - interval '2 hours',
            expires_at = now() + interval '10 days'
      where token_hash = $1`,
    [hash],
  );

  assert.ok(await resolveSession(token), "a stale session should still resolve");
  const slid = await waitFor(async () => {
    const rows = await query(
      `select expires_at > now() + interval '29 days' as slid,
              last_seen_at > now() - interval '1 minute' as seen
         from auth_sessions where token_hash = $1`,
      [hash],
    );
    return rows[0].slid && rows[0].seen;
  });
  assert.ok(slid, "expires_at and last_seen_at should both have been renewed");
});

test("a session seen minutes ago is not slid again", async () => {
  const token = await newSession();
  const hash = sha256(token);
  await query(
    `update auth_sessions
        set last_seen_at = now() - interval '5 minutes',
            expires_at = now() + interval '10 days'
      where token_hash = $1`,
    [hash],
  );

  assert.ok(await resolveSession(token));
  // No polling to do here: give the fire-and-forget update time to land if it
  // were going to, then confirm it did not.
  await sleep(1000);
  const rows = await query(
    `select expires_at < now() + interval '11 days' as held,
            last_seen_at < now() - interval '4 minutes' as untouched
       from auth_sessions where token_hash = $1`,
    [hash],
  );
  assert.equal(rows[0].held, true, "reading a session must not become a write");
  assert.equal(rows[0].untouched, true, "last_seen_at should not have moved");
});

test("a revoked session is never slid back to life", async () => {
  const token = await newSession();
  const hash = sha256(token);
  await query(
    `update auth_sessions
        set last_seen_at = now() - interval '2 hours',
            expires_at = now() + interval '10 days',
            revoked_at = now()
      where token_hash = $1`,
    [hash],
  );

  assert.equal(await resolveSession(token), null);
  await sleep(1000);
  const rows = await query(
    "select expires_at < now() + interval '11 days' as held from auth_sessions where token_hash = $1",
    [hash],
  );
  assert.equal(rows[0].held, true, "a revoked session must not have its expiry renewed");
});

test("randomToken is 32 unguessable bytes of base64url", () => {
  const first = randomToken();
  const second = randomToken();
  assert.ok(first !== second, "randomToken must not repeat");
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.ok(
    /^[A-Za-z0-9_-]{43}$/.test(first),
    "token must be unpadded base64url",
  );
});

test("sha256 is lowercase hex, and the token_hash CHECK accepts it", async () => {
  // A fixed vector, so swapping the digest for another algorithm fails here.
  assert.equal(
    sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );

  // The accepting half of the constraint: a constraint that rejected every
  // value would satisfy a rejection-only test.
  const token = await newSession();
  const rows = await query(
    "select count(*)::int n from auth_sessions where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(rows[0].n, 1, "a real digest must be accepted by the CHECK");

  // And the rejecting half. Recorded for cleanup first, in case it is accepted.
  const upper = sha256(randomToken()).toUpperCase();
  hashes.push(upper);
  await assert.rejects(
    () =>
      query(
        `insert into auth_sessions (user_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 day')`,
        [userId, upper],
      ),
    (error) => error.code === "23514",
    "an uppercase digest should violate auth_sessions_token_hash_is_sha256",
  );
});

test("query returns rows directly and passes parameters through", async () => {
  assert.deepEqual(await query("select $1::int as a, $2::text as b", [7, "x"]), [
    { a: 7, b: "x" },
  ]);
  assert.deepEqual(await query("select 1 where false"), []);
});

test("authPool hands back one pool, not a new one per call", () => {
  assert.ok(authPool() === authPool(), "authPool must be a singleton");
});

test("the constants tasks 5 and 6 import are unchanged", () => {
  assert.equal(SESSION_COOKIE, "session");
  assert.equal(SESSION_TTL_DAYS, 30);
});
