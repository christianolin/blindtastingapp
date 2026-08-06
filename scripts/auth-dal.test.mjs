// Task 5: the token we mint and the user our data access layer resolves.
//
// Run with:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-dal.test.mjs
//
// The extra flags exist because this file imports the real TypeScript modules:
// --experimental-strip-types lets Node load jwt.ts and user.ts directly, and
// --conditions=react-server resolves their "server-only" import to a usable
// stub. Node prints an ExperimentalWarning about type stripping on stderr.
//
// Why user.ts and not dal.ts: `next` publishes no "exports" map and ships
// headers.js, so Node's ESM resolver cannot load a module that does
// `import { cookies } from "next/headers"`. dal.ts is therefore a three-line
// cookie shim over resolveUserFromToken, and the part worth testing — session
// token in, authorized user out — lives in user.ts where a test can reach it.
//
// Env: DB_PASSWORD, SUPABASE_JWT_SECRET, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY. Every row created here is deleted in `after`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { jwtVerify } from "jose";
import { authPool, query } from "../src/lib/auth/db.ts";
import {
  SESSION_COOKIE,
  createSession,
  sha256,
} from "../src/lib/auth/session.ts";
import { mintSupabaseToken } from "../src/lib/auth/jwt.ts";
import { resolveUserFromToken } from "../src/lib/auth/user.ts";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
assert.ok(process.env.SUPABASE_JWT_SECRET, "SUPABASE_JWT_SECRET is required");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://eqzwmkpeysqiihuojmuj.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required");

// Neither the secret nor any token is ever asserted on by value or printed:
// assertions report booleans, lengths and claim names only.
const rawSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);

const rest = (path, token) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });

// Profiles taken from the descending end of the id order on purpose:
// scripts/auth-session.test.mjs claims `order by id limit 2` and asserts those
// two carry no sessions, and `node --test` runs the suites in parallel.
let verified; // has credentials, email_verified_at set
let unverified; // has credentials, email_verified_at null
let credentialless; // a profile with a session but no auth_credentials row
const seededCredentials = [];
const seededHashes = [];

async function newSession(userId) {
  const token = await createSession(userId);
  seededHashes.push(sha256(token));
  return token;
}

async function seedCredentials(userId, email, verifiedAt) {
  await query(
    `insert into auth_credentials (user_id, email, password_hash, email_verified_at)
     values ($1, $2, $3, $4)`,
    [userId, email, "not-a-real-hash:auth-dal.test", verifiedAt],
  );
  seededCredentials.push(userId);
}

before(async () => {
  const tail = await query(
    "select id, display_name, role, email from profiles order by id desc limit 3",
  );
  assert.equal(tail.length, 3, "need three profiles to seed");
  const head = await query("select id from profiles order by id limit 2");
  const claimed = new Set(head.map((r) => r.id));
  assert.ok(
    tail.every((r) => !claimed.has(r.id)),
    "seed profiles overlap auth-session.test.mjs; the suites would race",
  );
  [verified, unverified, credentialless] = tail;

  const existing = await query(
    "select count(*)::int n from auth_credentials where user_id = any($1::uuid[])",
    [tail.map((r) => r.id)],
  );
  assert.equal(
    existing[0].n,
    0,
    "seed profiles already carry credentials; a previous run left rows behind",
  );

  // The credentials email deliberately differs from profiles.email so that
  // reading the wrong table cannot pass unnoticed.
  await seedCredentials(verified.id, "dal-verified@example.invalid", new Date());
  await seedCredentials(unverified.id, "dal-unverified@example.invalid", null);
  assert.notEqual(
    verified.email,
    "dal-verified@example.invalid",
    "the fixture must not collide with the profile's own email",
  );
});

after(async () => {
  if (seededHashes.length > 0) {
    await query("delete from auth_sessions where token_hash = any($1::text[])", [
      seededHashes,
    ]);
  }
  if (seededCredentials.length > 0) {
    await query("delete from auth_credentials where user_id = any($1::uuid[])", [
      seededCredentials,
    ]);
  }
  await authPool().end();
});

// --- mintSupabaseToken -----------------------------------------------------

test("the minted token carries exactly the claims RLS depends on", async () => {
  const token = await mintSupabaseToken(verified.id);
  const { payload, protectedHeader } = await jwtVerify(token, rawSecret, {
    audience: "authenticated",
    issuer: "supabase",
  });

  assert.equal(protectedHeader.alg, "HS256");
  assert.equal(protectedHeader.typ, "JWT");
  assert.equal(payload.sub, verified.id, "auth.uid() reads sub");
  assert.equal(payload.role, "authenticated");
  assert.equal(payload.aud, "authenticated");
  assert.equal(payload.iss, "supabase");
  assert.equal(typeof payload.iat, "number");
  assert.equal(typeof payload.exp, "number");
});

test("the default lifetime is ten minutes, and a custom ttl is honoured", async () => {
  const fromDefault = await jwtVerify(
    await mintSupabaseToken(verified.id),
    rawSecret,
  );
  assert.equal(fromDefault.payload.exp - fromDefault.payload.iat, 600);

  const fromCustom = await jwtVerify(
    await mintSupabaseToken(verified.id, 60),
    rawSecret,
  );
  assert.equal(fromCustom.payload.exp - fromCustom.payload.iat, 60);
});

test("the secret is used as raw utf-8, not base64-decoded", async () => {
  // Base64-decoding the secret first is the plausible-looking mistake, and it
  // 401s against PostgREST. Pin the encoding here so the failure surfaces as a
  // signature mismatch rather than as a mysterious 401 in production.
  const token = await mintSupabaseToken(verified.id);
  const decoded = Buffer.from(process.env.SUPABASE_JWT_SECRET, "base64");
  await assert.rejects(
    () => jwtVerify(token, new Uint8Array(decoded)),
    "a base64 decode of the secret must not verify our token",
  );
});

test("minting without a configured secret throws rather than signing", async () => {
  const saved = process.env.SUPABASE_JWT_SECRET;
  delete process.env.SUPABASE_JWT_SECRET;
  try {
    await assert.rejects(
      () => mintSupabaseToken(verified.id),
      /SUPABASE_JWT_SECRET/,
      "a missing secret must fail loudly",
    );
  } finally {
    process.env.SUPABASE_JWT_SECRET = saved;
  }
  // And minting works again once it is restored, so the guard is not sticky.
  assert.ok((await mintSupabaseToken(verified.id)).length > 0);
});

test("PostgREST accepts the minted token and scopes RLS to its subject", async () => {
  // friendships has a pure `(user_id = auth.uid())` SELECT policy, so a row
  // count is meaningful. auth-jwt.test.mjs asserts that invariant still holds.
  const owners = await query(
    `select user_id, count(*)::int n from friendships
      group by user_id order by n desc limit 2`,
  );
  assert.equal(owners.length, 2, "need two users owning friendship rows");
  assert.notEqual(owners[0].user_id, owners[1].user_id);

  for (const { user_id: owner, n } of owners) {
    const res = await rest(
      "friendships?select=user_id",
      await mintSupabaseToken(owner),
    );
    // Read the body once: assert's message argument is evaluated eagerly.
    const body = await res.text();
    assert.equal(res.status, 200, body);
    const rows = JSON.parse(body);
    assert.ok(rows.length > 0, "RLS returned nothing — auth.uid() did not resolve");
    assert.equal(rows.length, n, "row count does not match this user's own rows");
    assert.ok(
      rows.every((r) => r.user_id === owner),
      "a row belonging to somebody else came back",
    );
  }
});

// --- resolveUserFromToken --------------------------------------------------

test("a live session token resolves to that user", async () => {
  const user = await resolveUserFromToken(await newSession(verified.id));
  assert.ok(user, "a live session should resolve to a user");
  assert.equal(user.id, verified.id);
  assert.equal(user.displayName, verified.display_name);
  assert.equal(user.role, verified.role);
  assert.equal(
    user.email,
    "dal-verified@example.invalid",
    "email must come from auth_credentials, not profiles",
  );
});

test("two users' tokens resolve to their own identities", async () => {
  // The test that fails if the resolver ever hardcodes or caches a user.
  const mine = await resolveUserFromToken(await newSession(verified.id));
  const theirs = await resolveUserFromToken(await newSession(unverified.id));
  assert.equal(mine.id, verified.id);
  assert.equal(theirs.id, unverified.id);
  assert.notEqual(mine.id, theirs.id);
  assert.notEqual(mine.email, theirs.email);
});

test("emailVerified reflects email_verified_at", async () => {
  const yes = await resolveUserFromToken(await newSession(verified.id));
  assert.equal(yes.emailVerified, true);

  const no = await resolveUserFromToken(await newSession(unverified.id));
  assert.equal(no.emailVerified, false, "a null timestamp means unverified");
});

test("the role comes through unchanged for every role in use", async () => {
  const user = await resolveUserFromToken(await newSession(verified.id));
  assert.ok(
    ["ADMIN", "CONTRIBUTOR", "MEMBER"].includes(user.role),
    "role must be one of the UserRole values",
  );
  assert.equal(user.role, verified.role);
});

test("an unknown token resolves to null", async () => {
  // A well-formed token that was never issued: 32 random bytes, base64url.
  const stranger = await createSession(verified.id);
  await query("delete from auth_sessions where token_hash = $1", [
    sha256(stranger),
  ]);
  assert.equal(await resolveUserFromToken(stranger), null);
});

test("a revoked session resolves to null", async () => {
  const token = await newSession(verified.id);
  assert.ok(await resolveUserFromToken(token), "precondition: it resolves");
  await query(
    "update auth_sessions set revoked_at = now() where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(await resolveUserFromToken(token), null);
});

test("an expired session resolves to null", async () => {
  const token = await newSession(verified.id);
  await query(
    "update auth_sessions set expires_at = now() - interval '1 second' where token_hash = $1",
    [sha256(token)],
  );
  assert.equal(await resolveUserFromToken(token), null);
});

test("the proxy reads the cookie that SESSION_COOKIE names", async () => {
  // src/proxy.ts cannot import session.ts: that module pulls in node:crypto and
  // pg, and the proxy runs on the Edge runtime. The name is therefore written
  // out there by hand, and if the two ever drift every signed-in user is
  // redirected to /login forever. Pin the pair.
  assert.equal(SESSION_COOKIE, "session");
  const source = await readFile(
    new URL("../src/proxy.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.includes(`request.cookies.get("${SESSION_COOKIE}")`),
    "src/proxy.ts must check the cookie named by SESSION_COOKIE",
  );
});

test("a session whose user has no credentials resolves to null", async () => {
  // A profile still exists, but nothing in auth_credentials — the state every
  // not-yet-migrated Supabase user is in. It must not authenticate.
  const token = await newSession(credentialless.id);
  const rows = await query(
    "select count(*)::int n from auth_credentials where user_id = $1",
    [credentialless.id],
  );
  assert.equal(rows[0].n, 0, "precondition: no credentials row");
  assert.equal(await resolveUserFromToken(token), null);
});
