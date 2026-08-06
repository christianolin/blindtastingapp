// Linchpin: a JWT WE sign must be accepted by PostgREST, with auth.uid()
// resolving to our `sub` claim, so the existing 113 RLS policies keep working
// unchanged. If this fails, the own-auth design is wrong.
//
// The table under test must have a PURE `= auth.uid()` policy. `friendships`
// qualifies: `(user_id = auth.uid())`, no disjunction. `cellar_lots` looks like
// the obvious choice and is not — its policy is
// `(owner_id = auth.uid()) OR can_view_cellar(owner_id)`, so a user also sees
// other people's shared cellars and any row-count assertion is meaningless.
//
// Env: DB_PASSWORD, SUPABASE_JWT_SECRET, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY. Read-only.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { SignJWT } from "jose";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
assert.ok(process.env.SUPABASE_JWT_SECRET, "SUPABASE_JWT_SECRET is required");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://eqzwmkpeysqiihuojmuj.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required");

const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);

async function mint(userId, ttlSeconds = 600) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

const rest = (path, token) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

let userA;
let userB;
let countA;
let countB;

before(async () => {
  await client.connect();

  // Fail loudly if the chosen table stops being purely owner-scoped — that
  // would silently turn the assertions below into no-ops.
  const { rows: pol } = await client.query(
    `select qual from pg_policies
      where schemaname = 'public' and tablename = 'friendships'
        and cmd = 'SELECT'`,
  );
  assert.equal(pol.length, 1, "expected exactly one SELECT policy on friendships");
  assert.equal(
    pol[0].qual.replace(/\s+/g, " ").trim(),
    "(user_id = auth.uid())",
    "friendships is no longer purely owner-scoped; pick another table",
  );

  const { rows } = await client.query(
    `select user_id, count(*)::int n from friendships
      group by user_id order by n desc limit 2`,
  );
  assert.equal(rows.length, 2, "need two users owning friendship rows");
  [userA, userB] = rows.map((r) => r.user_id);
  [countA, countB] = rows.map((r) => r.n);
  assert.notEqual(userA, userB);
});

after(async () => {
  await client.end();
});

test("our signed token is accepted and auth.uid() resolves", async () => {
  const res = await rest("friendships?select=user_id", await mint(userA));
  // Read the body ONCE: assert's message argument is evaluated eagerly, so
  // `await res.text()` inline would consume the stream even when it passes.
  const body = await res.text();
  assert.equal(res.status, 200, body);
  const rows = JSON.parse(body);
  assert.ok(rows.length > 0, "RLS returned nothing — auth.uid() did not resolve");
  assert.equal(rows.length, countA, "row count does not match this user's own rows");
  assert.ok(
    rows.every((r) => r.user_id === userA),
    "a row belonging to somebody else came back",
  );
});

test("a different subject sees its own rows, not the first user's", async () => {
  const res = await rest("friendships?select=user_id", await mint(userB));
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.equal(rows.length, countB);
  assert.ok(
    rows.every((r) => r.user_id === userB),
    "user B saw user A's rows — RLS is not scoping by our sub",
  );
});

test("an unauthenticated request sees nothing", async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/friendships?select=user_id`, {
    headers: { apikey: ANON_KEY },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [], "anon must see no friendships");
});

test("an expired token is rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userA)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt(now - 3600)
    .setExpirationTime(now - 60)
    .sign(secret);
  assert.equal((await rest("friendships?select=user_id", expired)).status, 401);
});

test("a token signed with the wrong secret is rejected", async () => {
  const bad = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userA)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("not-the-real-secret-not-the-real-secret"));
  assert.equal((await rest("friendships?select=user_id", bad)).status, 401);
});
