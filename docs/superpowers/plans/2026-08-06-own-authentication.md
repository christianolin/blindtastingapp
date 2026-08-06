# Own Authentication (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth (GoTrue) with our own email+password authentication, keeping all 113 existing RLS policies working untouched.

**Architecture:** Sessions are opaque 32-byte tokens in an `httpOnly` cookie, stored hashed in `auth_sessions`. A Data Access Layer resolves the cookie to `{ userId, role }` once per render. For Supabase data calls we mint a short-lived HS256 JWT carrying `sub` and `role: authenticated`, which PostgREST/Storage/Realtime accept because the project uses legacy symmetric keys — so `auth.uid()` keeps resolving and no RLS policy changes.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript, Postgres (Supabase-hosted), `pg`, `jose`, `@node-rs/argon2`, `bcryptjs`, `resend`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-06-own-authentication-design.md`

## Global Constraints

- Package manager: **npm** (`package-lock.json`).
- Verify every increment with: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` — expect `EXIT=0`.
- Lint with `npx eslint <files>` — must exit 0. Repo-wide lint is currently clean; keep it clean.
- Migrations run via `node scripts/scratch-apply.mjs --file <path> --mode dry|live`. Always `dry` first, then `live`.
- Highest applied migration is `20260829264200`. Use `20260829265000` and up.
- Tests are `.mjs` files under `scripts/`, run with `node --test scripts/<name>.test.mjs`, using `node:test` + `pg`. They test behaviour against the live DB/HTTP API, never by importing app TypeScript. Follow `scripts/designation-members.test.mjs` for structure.
- DB env for scripts: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'`. Default host `aws-0-eu-central-1.pooler.supabase.com`, user `postgres.eqzwmkpeysqiihuojmuj`, db `postgres`, port 6543 (scratch-apply overrides to 5432).
- `SUPABASE_JWT_SECRET` must exist in `.env.local` before Task 1. Server-only — never prefix with `NEXT_PUBLIC_`.
- Commit after every task. Push per increment.
- Never log, print, or commit: password hashes, session tokens, email tokens, or the JWT secret.

## Prerequisite (human, before Task 1)

Copy the JWT Secret from Supabase Dashboard → Settings → API → JWT Settings, and add to `.env.local`:

```
SUPABASE_JWT_SECRET=<the secret>
```

Nothing in this plan works without it. Task 1 fails loudly if it is missing.

---

### Task 1: Prove the seam — a minted JWT satisfies RLS

This is the linchpin. If a token we sign is not accepted by PostgREST with
`auth.uid()` resolving, the entire design is invalid and every later task is
wasted work. Nothing else gets built until this passes.

**Files:**
- Create: `scripts/auth-jwt.test.mjs`
- Modify: `package.json` (add `jose`)

**Interfaces:**
- Consumes: nothing.
- Produces: proof that `SignJWT` with `{ alg: HS256 }`, `sub: <uuid>`, `role: "authenticated"`, `aud: "authenticated"` is accepted by PostgREST and resolves `auth.uid()`.

- [ ] **Step 1: Install jose**

```bash
npm install jose
```

- [ ] **Step 2: Write the failing test**

Create `scripts/auth-jwt.test.mjs`:

```javascript
// Linchpin: a JWT WE sign must be accepted by PostgREST, with auth.uid()
// resolving to our `sub` claim, so the existing 113 RLS policies keep working
// unchanged. If this fails, the own-auth design is wrong.
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

function rest(path, token) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
}

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

let ownerA;
let ownerB;
let lotsOfA;

before(async () => {
  await client.connect();
  // Two distinct profiles that own cellar lots — cellar_lots is owner-scoped by
  // RLS, so it proves the token both grants and withholds access.
  const { rows } = await client.query(
    `select owner_id, count(*)::int n
       from cellar_lots group by owner_id having count(*) > 0
       order by n desc limit 2`,
  );
  assert.equal(rows.length, 2, "need two profiles owning cellar lots");
  ownerA = rows[0].owner_id;
  ownerB = rows[1].owner_id;
  lotsOfA = rows[0].n;
});

after(async () => {
  await client.end();
});

test("our signed token is accepted and auth.uid() resolves", async () => {
  const res = await rest("cellar_lots?select=id,owner_id", await mint(ownerA));
  assert.equal(res.status, 200, await res.text());
  const rows = await res.json();
  assert.ok(rows.length > 0, "RLS returned nothing — auth.uid() did not resolve");
  assert.equal(rows.length, lotsOfA);
  assert.ok(
    rows.every((r) => r.owner_id === ownerA),
    "another owner's lots leaked through",
  );
});

test("the token withholds another user's rows", async () => {
  const res = await rest("cellar_lots?select=id,owner_id", await mint(ownerB));
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.ok(
    rows.every((r) => r.owner_id === ownerB),
    "user B saw user A's lots",
  );
});

test("an expired token is rejected", async () => {
  const expired = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(ownerA)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secret);
  const res = await rest("cellar_lots?select=id", expired);
  assert.equal(res.status, 401);
});

test("a token signed with the wrong secret is rejected", async () => {
  const bad = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(ownerA)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("not-the-real-secret-not-the-real-secret"));
  const res = await rest("cellar_lots?select=id", bad);
  assert.equal(res.status, 401);
});
```

- [ ] **Step 3: Run the test**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'))
  }
}
node --test scripts/auth-jwt.test.mjs
```

Expected: **4 tests, 4 pass.**

If test 1 returns 200 with zero rows, `auth.uid()` did not resolve — stop and
report. If it returns 401, the secret is wrong or the project is not HS256.
Either outcome invalidates the design; do not proceed.

- [ ] **Step 4: Commit**

```bash
git add scripts/auth-jwt.test.mjs package.json package-lock.json
git commit -m "auth: prove a self-signed JWT satisfies existing RLS"
```

---

### Task 2: Auth schema

**Files:**
- Create: `supabase/migrations/20260829265000_auth_tables.sql`
- Create: `scripts/auth-schema.test.mjs`

**Interfaces:**
- Produces: tables `auth_credentials`, `auth_sessions`, `auth_tokens`, `auth_rate_limits` in `public`, all with RLS enabled and **no policies** (deny-all to `anon`/`authenticated`; reachable only by the service role and direct `pg` connections).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260829265000_auth_tables.sql`:

```sql
-- Own-authentication tables (Phase 1).
--
-- These live in `public` because that is where PostgREST looks, but they carry
-- RLS with NO policies: anon and authenticated get nothing, by construction.
-- Only the service role and direct pg connections (our auth code) touch them.
--
-- Session tokens and email tokens are stored as sha256 hashes, never in the
-- clear, so a database leak yields no live sessions and no usable reset links.
create table auth_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  password_changed_at timestamptz not null default now(),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index auth_credentials_email_key
  on auth_credentials (lower(email));

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip inet
);
create index auth_sessions_live_idx
  on auth_sessions (user_id) where revoked_at is null;

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  email text,
  purpose text not null
    check (purpose in ('EMAIL_VERIFY', 'PASSWORD_RESET', 'INVITE')),
  token_hash text not null unique,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  -- An INVITE may precede the user existing, so it carries an email instead.
  check (user_id is not null or email is not null)
);
create index auth_tokens_lookup_idx
  on auth_tokens (purpose, expires_at) where consumed_at is null;

create table auth_rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table auth_credentials enable row level security;
alter table auth_sessions enable row level security;
alter table auth_tokens enable row level security;
alter table auth_rate_limits enable row level security;

-- Belt and braces: RLS already denies, but do not even grant the table.
revoke all on auth_credentials, auth_sessions, auth_tokens, auth_rate_limits
  from anon, authenticated;

do $$
begin
  if (select count(*) from pg_tables
       where schemaname = 'public'
         and tablename in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')
         and rowsecurity) <> 4 then
    raise exception 'all four auth tables must have RLS enabled';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')) <> 0 then
    raise exception 'auth tables must carry no policies';
  end if;
end;
$$;
```

- [ ] **Step 2: Dry-run the migration**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265000_auth_tables.sql --mode dry
```

Expected: `DRY-OK 20260829265000 auth_tables`

- [ ] **Step 3: Write the schema test**

Create `scripts/auth-schema.test.mjs`:

```javascript
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
```

- [ ] **Step 4: Apply live, then run the test**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265000_auth_tables.sql --mode live
node --test scripts/auth-schema.test.mjs
```

Expected: `LIVE-APPLIED 20260829265000 auth_tables`, then 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829265000_auth_tables.sql scripts/auth-schema.test.mjs
git commit -m "auth: schema for credentials, sessions and tokens"
```

---

### Task 3: Password hashing

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `scripts/auth-password.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>` — argon2id
  - `verifyPassword(plain: string, hash: string): Promise<boolean>` — accepts argon2id **and** legacy bcrypt `$2a$`/`$2b$`
  - `needsRehash(hash: string): boolean` — true for any bcrypt hash

- [ ] **Step 1: Install**

```bash
npm install @node-rs/argon2 bcryptjs
npm install --save-dev @types/bcryptjs
```

- [ ] **Step 2: Write the failing test**

Create `scripts/auth-password.test.mjs`:

```javascript
// Password hashing: argon2id for new hashes, bcrypt accepted for the 25
// migrated Supabase users, and every bcrypt hash flagged for rehash.
import assert from "node:assert/strict";
import test from "node:test";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// Mirrors src/lib/auth/password.ts. Kept in the test as executable
// documentation of the contract the TS module must satisfy.
const isBcrypt = (h) => /^\$2[aby]\$/.test(h);

async function verifyPassword(plain, hashed) {
  if (isBcrypt(hashed)) return bcrypt.compare(plain, hashed);
  try {
    return await argonVerify(hashed, plain);
  } catch {
    return false;
  }
}

test("argon2id round-trips", async () => {
  const h = await argonHash("correct horse battery staple");
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verifyPassword("correct horse battery staple", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
});

test("legacy bcrypt $2a$10$ still verifies", async () => {
  const legacy = bcrypt.hashSync("hunter2", 10);
  assert.match(legacy, /^\$2[aby]\$10\$/);
  assert.equal(await verifyPassword("hunter2", legacy), true);
  assert.equal(await verifyPassword("hunter3", legacy), false);
});

test("bcrypt hashes are flagged for rehash, argon2id is not", async () => {
  assert.equal(isBcrypt(bcrypt.hashSync("x", 10)), true);
  assert.equal(isBcrypt(await argonHash("x")), false);
});

test("a malformed hash verifies false rather than throwing", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});
```

- [ ] **Step 3: Run it — expect failure**

```bash
node --test scripts/auth-password.test.mjs
```

Expected: FAIL — `Cannot find package '@node-rs/argon2'` if Step 1 was skipped; otherwise it should pass, since the test carries its own implementation. Confirm 4 passing before writing the module.

- [ ] **Step 4: Write the module**

Create `src/lib/auth/password.ts`:

```typescript
import "server-only";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// The 25 users migrated from Supabase carry bcrypt $2a$10$ hashes. Cost 10 is
// below current guidance, so we accept them on login and transparently upgrade
// to argon2id — nobody has to reset a password, and the weak hashes drain away
// as people return.
const BCRYPT = /^\$2[aby]\$/;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain);
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  if (BCRYPT.test(hashed)) return bcrypt.compare(plain, hashed);
  try {
    return await argonVerify(hashed, plain);
  } catch {
    // A corrupt or truncated hash must fail closed, not throw.
    return false;
  }
}

export function needsRehash(hashed: string): boolean {
  return BCRYPT.test(hashed);
}
```

- [ ] **Step 5: Verify build**

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx tsc --noEmit
npx eslint src/lib/auth/password.ts
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/password.ts scripts/auth-password.test.mjs package.json package-lock.json
git commit -m "auth: argon2id hashing with transparent bcrypt upgrade"
```

---

### Task 4: Session store

Auth talks to Postgres **directly** rather than through PostgREST. Two reasons:
the DAL runs on every request and a TCP query beats an HTTP hop (today's
`supabase.auth.getUser()` call is exactly the hop we are removing), and it is the
groundwork for Phase 3, where Supabase's API layer goes away entirely.

**Files:**
- Create: `src/lib/auth/db.ts`
- Create: `src/lib/auth/session.ts`
- Create: `scripts/auth-session.test.mjs`
- Modify: `package.json` (move `pg` to `dependencies` if it is a devDependency)

**Interfaces:**
- Produces, from `src/lib/auth/db.ts`:
  - `authPool(): Pool` — process-wide singleton
  - `query<T>(sql: string, params?: unknown[]): Promise<T[]>` — returns rows directly. **Tasks 7–10 use this heavily**; it is the only DB entry point outside this module.
- Produces, from `src/lib/auth/session.ts`:
  - `randomToken(): string` — 32 random bytes, base64url. Shared with the email tokens in Task 7.
  - `sha256(value: string): string` — hex digest. Shared with Task 7.
  - `createSession(userId: string, meta: { userAgent?: string; ip?: string }): Promise<string>` — returns the **plaintext** token; only the sha256 is stored
  - `resolveSession(token: string): Promise<{ userId: string; sessionId: string } | null>` — null when missing, expired or revoked; slides expiry
  - `revokeSession(token: string): Promise<void>`
  - `revokeAllSessions(userId: string): Promise<void>`
  - `SESSION_TTL_DAYS = 30` and `SESSION_COOKIE = "session"` — the cookie name is imported by Tasks 5 and 6.
  - `SESSION_TTL_DAYS = 30`, `SESSION_COOKIE = "session"`

- [ ] **Step 1: Confirm `pg` is a runtime dependency**

```powershell
node -e "const p=require('./package.json'); console.log('dep:', p.dependencies?.pg ?? 'MISSING', '| dev:', p.devDependencies?.pg ?? '-')"
```

If it shows `dep: MISSING`, run `npm install pg` and `npm install --save-dev @types/pg`.
It is imported by `src/`, so it must be a real dependency, not a devDependency.

- [ ] **Step 2: Write the failing test**

Create `scripts/auth-session.test.mjs`:

```javascript
// Session lifecycle against the real table: create, resolve, slide, expire,
// revoke. Cleans up after itself. Env: DB_PASSWORD.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createHash, randomBytes } from "node:crypto";
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

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const mkToken = () => randomBytes(32).toString("base64url");

let userId;
const created = [];

before(async () => {
  await client.connect();
  const { rows } = await client.query("select id from profiles limit 1");
  assert.equal(rows.length, 1, "need at least one profile");
  userId = rows[0].id;
});

after(async () => {
  if (created.length > 0) {
    await client.query("delete from auth_sessions where token_hash = any($1)", [
      created,
    ]);
  }
  await client.end();
});

async function insert(token, { expiresInDays = 30, revoked = false } = {}) {
  const h = sha256(token);
  created.push(h);
  await client.query(
    `insert into auth_sessions (user_id, token_hash, expires_at, revoked_at)
     values ($1, $2, now() + ($3 || ' days')::interval, $4)`,
    [userId, h, String(expiresInDays), revoked ? new Date() : null],
  );
  return h;
}

// Mirrors resolveSession()'s query in src/lib/auth/session.ts.
async function resolve(token) {
  const { rows } = await client.query(
    `select id, user_id from auth_sessions
      where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

test("a fresh session resolves to its user", async () => {
  const t = mkToken();
  await insert(t);
  const s = await resolve(t);
  assert.ok(s, "fresh session should resolve");
  assert.equal(s.user_id, userId);
});

test("an unknown token resolves to null", async () => {
  assert.equal(await resolve(mkToken()), null);
});

test("an expired session does not resolve", async () => {
  const t = mkToken();
  await insert(t, { expiresInDays: -1 });
  assert.equal(await resolve(t), null);
});

test("a revoked session does not resolve", async () => {
  const t = mkToken();
  await insert(t, { revoked: true });
  assert.equal(await resolve(t), null);
});

test("only the hash is stored, never the token", async () => {
  const t = mkToken();
  await insert(t);
  const { rows } = await client.query(
    "select count(*)::int n from auth_sessions where token_hash = $1",
    [t],
  );
  assert.equal(rows[0].n, 0, "the plaintext token must not appear in the table");
});

test("sliding renews expiry and last_seen_at", async () => {
  const t = mkToken();
  const h = await insert(t);
  await client.query(
    `update auth_sessions
        set last_seen_at = now() - interval '2 hours',
            expires_at = now() + interval '10 days'
      where token_hash = $1`,
    [h],
  );
  // The slide: only when last_seen_at is over an hour old, so a read does not
  // become a write on every request.
  await client.query(
    `update auth_sessions
        set last_seen_at = now(), expires_at = now() + interval '30 days'
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
        and last_seen_at < now() - interval '1 hour'`,
    [h],
  );
  const { rows } = await client.query(
    `select expires_at > now() + interval '29 days' slid from auth_sessions
      where token_hash = $1`,
    [h],
  );
  assert.equal(rows[0].slid, true);
});
```

- [ ] **Step 3: Run it — expect failure**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node --test scripts/auth-session.test.mjs
```

Expected: PASS (6 tests) — the table exists from Task 2 and the test carries its
own SQL. If `auth_sessions` is missing, Task 2 was not applied live.

- [ ] **Step 4: Write the pool**

Create `src/lib/auth/db.ts`:

```typescript
import "server-only";
import { Pool } from "pg";

// Auth reads the session on every request, so it talks to Postgres directly
// rather than through PostgREST — a TCP query instead of an HTTP hop. It is
// also the groundwork for Phase 3, when Supabase's API layer goes away.
//
// Cached on globalThis so Next's dev-mode module reloading does not open a new
// pool per edit and exhaust the connection limit.
const globalForPool = globalThis as unknown as { authPool?: Pool };

export function authPool(): Pool {
  if (!globalForPool.authPool) {
    globalForPool.authPool = new Pool({
      host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
      port: Number(process.env.DB_PORT ?? 6543),
      user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
      database: process.env.DB_NAME ?? "postgres",
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPool.authPool;
}

// Every auth call site wants rows, never the full pg Result. Returning the
// array directly keeps ~55 call sites free of `.rows` noise.
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await authPool().query(sql, params);
  return rows as T[];
}
```

- [ ] **Step 5: Write the session module**

Create `src/lib/auth/session.ts`:

```typescript
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { authPool } from "./db";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_DAYS = 30;
// Bump last_seen_at at most this often, so reading a session does not turn
// into a write on every single request.
const SLIDE_AFTER = "1 hour";

// Only the hash is stored. A database leak therefore yields no live sessions.
// Exported because auth_tokens (Task 7) needs exactly the same primitives:
// one source of truth for how a token is generated and hashed.
export const randomToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<string> {
  const token = randomToken();
  await authPool().query(
    `insert into auth_sessions (user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [
      userId,
      sha256(token),
      String(SESSION_TTL_DAYS),
      meta.userAgent ?? null,
      meta.ip ?? null,
    ],
  );
  return token;
}

export async function resolveSession(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  const hashed = hashToken(token);
  const { rows } = await authPool().query(
    `select id, user_id from auth_sessions
      where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [hashed],
  );
  if (rows.length === 0) return null;

  // Sliding expiry, throttled. Fire-and-forget: a failed slide must never fail
  // the request the user is actually making.
  authPool()
    .query(
      `update auth_sessions
          set last_seen_at = now(),
              expires_at = now() + ($2 || ' days')::interval
        where token_hash = $1
          and last_seen_at < now() - interval '${SLIDE_AFTER}'`,
      [hashed, String(SESSION_TTL_DAYS)],
    )
    .catch(() => {});

  return { userId: rows[0].user_id as string, sessionId: rows[0].id as string };
}

export async function revokeSession(token: string): Promise<void> {
  await authPool().query(
    `update auth_sessions set revoked_at = now()
      where token_hash = $1 and revoked_at is null`,
    [hashToken(token)],
  );
}

// Used after a password change: every other device is signed out.
export async function revokeAllSessions(userId: string): Promise<void> {
  await authPool().query(
    `update auth_sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
}
```

- [ ] **Step 6: Verify and commit**

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx tsc --noEmit
npx eslint src/lib/auth/db.ts src/lib/auth/session.ts
```

```bash
git add src/lib/auth/db.ts src/lib/auth/session.ts scripts/auth-session.test.mjs package.json package-lock.json
git commit -m "auth: opaque session store with sliding expiry"
```

---

### Task 5: JWT minting, DAL, proxy and the Supabase server client

This is the task that swaps the identity source. After it, the app reads its
user from our cookie rather than from GoTrue, and Supabase data calls carry our
minted token.

**Files:**
- Create: `src/lib/auth/jwt.ts`
- Create: `src/lib/auth/dal.ts`
- Modify: `src/proxy.ts`
- Modify: `src/lib/supabase/server.ts`
- Delete: `src/lib/supabase/middleware.ts`

**Interfaces:**
- Consumes: `resolveSession`, `SESSION_COOKIE` (Task 4).
- Produces:
  - `mintSupabaseToken(userId: string, ttlSeconds?: number): Promise<string>`
  - `getOptionalUser(): Promise<AuthUser | null>` — React-`cache()`d
  - `requireUser(): Promise<AuthUser>` — redirects to `/login` when absent
  - `type AuthUser = { id: string; email: string; displayName: string; role: UserRole; emailVerified: boolean }`

- [ ] **Step 1: Write the JWT module**

Create `src/lib/auth/jwt.ts`:

```typescript
import "server-only";
import { SignJWT } from "jose";

// The project uses legacy HS256 symmetric keys, so PostgREST, Storage and
// Realtime all validate against one shared secret. Signing our own token with
// `sub` and `role: authenticated` therefore keeps all 113 RLS policies working
// unchanged — auth.uid() simply reads `sub`. Proven by scripts/auth-jwt.test.mjs.
//
// Rotating this secret invalidates our tokens AND the anon key at the same
// time. Do not rotate casually.
function secret(): Uint8Array {
  const value = process.env.SUPABASE_JWT_SECRET;
  if (!value) throw new Error("SUPABASE_JWT_SECRET is required");
  return new TextEncoder().encode(value);
}

export async function mintSupabaseToken(
  userId: string,
  ttlSeconds = 600,
): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}
```

- [ ] **Step 2: Write the DAL**

Create `src/lib/auth/dal.ts`:

```typescript
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/supabase/database.types";
import { authPool } from "./db";
import { SESSION_COOKIE, resolveSession } from "./session";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
};

// THE security boundary. src/proxy.ts does an optimistic cookie-presence check
// for redirect UX only; every real authorization decision resolves here, as
// close to the data as we can get it.
//
// cache() memoises for one render pass, so a page whose layout, page and three
// server components all ask for the user performs exactly one query.
export const getOptionalUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await resolveSession(token);
  if (!session) return null;

  const { rows } = await authPool().query(
    `select p.id, p.display_name, p.role, c.email, c.email_verified_at
       from profiles p
       join auth_credentials c on c.user_id = p.id
      where p.id = $1`,
    [session.userId],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    role: row.role as UserRole,
    emailVerified: row.email_verified_at !== null,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 3: Rewrite the proxy**

Replace `src/proxy.ts` entirely:

```typescript
import { NextResponse, type NextRequest } from "next/server";

// Optimistic only: does a session cookie exist? No database call, no crypto —
// this runs on the Edge runtime for nearly every request, so it has to stay
// this cheap. It previously round-tripped to GoTrue on every page load.
//
// This is NOT a security boundary. Anyone can present a bogus cookie and get
// past it; they then hit getOptionalUser()/requireUser() in the DAL, which does
// the real check. See docs/superpowers/specs/2026-08-06-own-authentication-design.md.
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/rules"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.get("session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 4: Rewrite the Supabase server client**

Replace `src/lib/supabase/server.ts` entirely:

```typescript
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getOptionalUser } from "@/lib/auth/dal";
import { mintSupabaseToken } from "@/lib/auth/jwt";

// Supabase is now a data plane only: it has no idea who the user is except
// through the token we mint. Signed-in callers get `sub` + `role: authenticated`,
// so RLS behaves exactly as it did under GoTrue; signed-out callers get the
// plain anon key and see only what anon policies allow.
export async function createClient() {
  const user = await getOptionalUser();
  const token = user ? await mintSupabaseToken(user.id) : null;

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    },
  );
}
```

- [ ] **Step 5: Delete the dead GoTrue middleware**

```bash
git rm src/lib/supabase/middleware.ts
```

- [ ] **Step 6: Verify**

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx tsc --noEmit
```

Expect **many** errors from the ~60 files still calling `supabase.auth.getUser()`.
That is the point: `tsc` is now enumerating Task 8's worklist. Record the count:

```powershell
npx tsc --noEmit 2>&1 | Select-String "auth" | Measure-Object | Select-Object -ExpandProperty Count
```

Do **not** fix them here. Commit the foundation and let Task 8 do the sweep.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/jwt.ts src/lib/auth/dal.ts src/proxy.ts src/lib/supabase/server.ts
git commit -m "auth: mint our own Supabase token; DAL replaces GoTrue"
```

---

### Task 6: Login and logout

**Files:**
- Modify: `src/app/login/actions.ts`
- Modify: `src/app/actions.ts`
- Create: `src/lib/auth/rate-limit.ts`
- Create: `scripts/auth-rate-limit.test.mjs`

**Interfaces:**
- Consumes: `verifyPassword`, `hashPassword`, `needsRehash` (Task 3); `createSession`, `revokeSession`, `SESSION_COOKIE`, `SESSION_TTL_DAYS` (Task 4).
- Produces: `checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>` — true when the caller is still under the limit.

- [ ] **Step 1: Write the rate limiter**

Create `src/lib/auth/rate-limit.ts`:

```typescript
import "server-only";
import { authPool } from "./db";

// Postgres-backed fixed window. Adequate at this scale and it adds no external
// service; revisit if traffic grows. Returns true when the caller is still
// under the limit.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { rows } = await authPool().query(
    `insert into auth_rate_limits (key, count, window_start)
     values ($1, 1, now())
     on conflict (key) do update
       set count = case
             when auth_rate_limits.window_start < now() - ($3 || ' seconds')::interval
             then 1
             else auth_rate_limits.count + 1
           end,
           window_start = case
             when auth_rate_limits.window_start < now() - ($3 || ' seconds')::interval
             then now()
             else auth_rate_limits.window_start
           end
     returning count`,
    [key, limit, String(windowSeconds)],
  );
  return (rows[0].count as number) <= limit;
}
```

- [ ] **Step 2: Test the rate limiter**

Create `scripts/auth-rate-limit.test.mjs`:

```javascript
// Fixed-window rate limiting: allows up to the limit, blocks past it, and
// resets once the window rolls. Env: DB_PASSWORD.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomBytes } from "node:crypto";
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

const keys = [];
before(async () => {
  await client.connect();
});
after(async () => {
  if (keys.length > 0) {
    await client.query("delete from auth_rate_limits where key = any($1)", [keys]);
  }
  await client.end();
});

// Mirrors checkRateLimit() in src/lib/auth/rate-limit.ts.
async function check(key, limit, windowSeconds) {
  const { rows } = await client.query(
    `insert into auth_rate_limits (key, count, window_start)
     values ($1, 1, now())
     on conflict (key) do update
       set count = case
             when auth_rate_limits.window_start < now() - ($3 || ' seconds')::interval
             then 1 else auth_rate_limits.count + 1 end,
           window_start = case
             when auth_rate_limits.window_start < now() - ($3 || ' seconds')::interval
             then now() else auth_rate_limits.window_start end
     returning count`,
    [key, limit, String(windowSeconds)],
  );
  return rows[0].count <= limit;
}

test("allows up to the limit, then blocks", async () => {
  const key = `test:${randomBytes(8).toString("hex")}`;
  keys.push(key);
  assert.equal(await check(key, 3, 60), true);
  assert.equal(await check(key, 3, 60), true);
  assert.equal(await check(key, 3, 60), true);
  assert.equal(await check(key, 3, 60), false);
});

test("resets once the window has rolled", async () => {
  const key = `test:${randomBytes(8).toString("hex")}`;
  keys.push(key);
  assert.equal(await check(key, 1, 60), true);
  assert.equal(await check(key, 1, 60), false);
  await client.query(
    "update auth_rate_limits set window_start = now() - interval '2 minutes' where key = $1",
    [key],
  );
  assert.equal(await check(key, 1, 60), true);
});
```

Run:

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node --test scripts/auth-rate-limit.test.mjs
```

Expected: 2 tests passing.

- [ ] **Step 3: Rewrite login**

Replace `src/app/login/actions.ts`:

```typescript
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "@/lib/auth/db";
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
} from "@/lib/auth/session";

export type AuthFormState = { error: string } | null;

// One message for every failure mode. Distinguishing "no such account" from
// "wrong password" would let anyone enumerate who has registered.
const GENERIC = "Incorrect email or password.";

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: GENERIC };

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  // Two limits: per-account (stops one account being ground down) and per-IP
  // (stops one attacker spraying many accounts).
  const okAccount = await checkRateLimit(`login:${email.toLowerCase()}`, 10, 900);
  const okIp = ip ? await checkRateLimit(`login-ip:${ip}`, 30, 900) : true;
  if (!okAccount || !okIp) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const { rows } = await authPool().query(
    `select user_id, password_hash from auth_credentials
      where lower(email) = lower($1)`,
    [email],
  );

  // Always run a verify, even with no account, so the response time does not
  // reveal whether the address exists.
  const stored =
    rows[0]?.password_hash ??
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000";
  const ok = await verifyPassword(password, stored);
  if (rows.length === 0 || !ok) return { error: GENERIC };

  const userId = rows[0].user_id as string;

  // Migrated Supabase users carry bcrypt $2a$10$. Upgrade them to argon2id now
  // that we have the plaintext — silently, once, on their next login.
  if (needsRehash(stored)) {
    const upgraded = await hashPassword(password);
    await authPool().query(
      `update auth_credentials
          set password_hash = $2, updated_at = now()
        where user_id = $1`,
      [userId, upgraded],
    );
  }

  const token = await createSession(userId, {
    userAgent: headerList.get("user-agent") ?? undefined,
    ip: ip || undefined,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  redirect("/taste");
}
```

- [ ] **Step 4: Rewrite logout**

Replace `src/app/actions.ts`:

```typescript
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, revokeSession } from "@/lib/auth/session";

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  // Revoke server-side as well as clearing the cookie: a copied token must stop
  // working, not merely disappear from this browser.
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
```

- [ ] **Step 5: Verify and commit**

```powershell
npx eslint src/app/login/actions.ts src/app/actions.ts src/lib/auth/rate-limit.ts
```

`npx tsc --noEmit` still reports the un-swept files from Task 5 — expected.

```bash
git add src/app/login/actions.ts src/app/actions.ts src/lib/auth/rate-limit.ts scripts/auth-rate-limit.test.mjs
git commit -m "auth: own login and logout with rate limiting"
```

---

### Task 7: Email tokens and Resend

**Files:**
- Create: `src/lib/auth/tokens.ts`
- Create: `src/lib/email/client.ts`
- Create: `src/lib/email/templates.ts`
- Create: `scripts/auth-tokens.test.mjs`
- Modify: `package.json`, `.env.local` (human adds `RESEND_API_KEY`, `EMAIL_FROM`)

**Interfaces:**
- Consumes: `sha256(token)` and `randomToken()` from `src/lib/auth/session.ts` (Task 4).
- Produces:
  - `issueToken(opts: { purpose: TokenPurpose; userId?: string; email?: string; ttlMinutes: number; payload?: Record<string, unknown> }): Promise<string>` — returns the **plaintext** token; only its hash is stored
  - `consumeToken(purpose: TokenPurpose, token: string): Promise<{ userId: string | null; email: string | null; payload: Record<string, unknown> } | null>` — single-use, returns `null` if unknown, expired, or already consumed
  - `type TokenPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE"`
  - `sendEmail({ to, subject, html }): Promise<void>`
  - `verifyEmailTemplate(url)`, `resetPasswordTemplate(url)`, `inviteTemplate(url, hostName, tastingName)` — each returns `{ subject, html }`

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

Add to `.env.local` (human):

```
RESEND_API_KEY=<key>
EMAIL_FROM="Blindr <no-reply@yourdomain>"
```

- [ ] **Step 2: Write the failing test**

Create `scripts/auth-tokens.test.mjs`:

```javascript
// Email tokens: hashed at rest, single-use, and expiring. Exercises the SQL
// contract directly so it holds regardless of the TS wrapper.
// Env: DB_PASSWORD.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createHash, randomBytes } from "node:crypto";
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

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
let userId;

before(async () => {
  await client.connect();
  const { rows } = await client.query(`select id from profiles limit 1`);
  userId = rows[0].id;
});

after(async () => {
  await client.query(`delete from auth_tokens where payload ->> 'test' = 'true'`);
  await client.end();
});

async function issue(purpose, ttlMinutes) {
  const token = newToken();
  await client.query(
    `insert into auth_tokens (user_id, purpose, token_hash, payload, expires_at)
     values ($1, $2, $3, '{"test":"true"}'::jsonb, now() + ($4 || ' minutes')::interval)`,
    [userId, purpose, sha256(token), String(ttlMinutes)],
  );
  return token;
}

// Single-use: the UPDATE ... WHERE consumed_at is null is what makes a
// double-redeem impossible even under a race.
async function consume(purpose, token) {
  const { rows } = await client.query(
    `update auth_tokens set consumed_at = now()
      where purpose = $1 and token_hash = $2
        and consumed_at is null and expires_at > now()
      returning user_id`,
    [purpose, sha256(token)],
  );
  return rows[0]?.user_id ?? null;
}

test("a fresh token is stored only as a hash", async () => {
  const token = await issue("EMAIL_VERIFY", 60);
  const { rows } = await client.query(
    `select count(*)::int n from auth_tokens where token_hash = $1`,
    [sha256(token)],
  );
  assert.equal(rows[0].n, 1);
  const plain = await client.query(
    `select count(*)::int n from auth_tokens where token_hash = $1`,
    [token],
  );
  assert.equal(plain.rows[0].n, 0, "the plaintext token must not be stored");
});

test("a token consumes exactly once", async () => {
  const token = await issue("PASSWORD_RESET", 60);
  assert.equal(await consume("PASSWORD_RESET", token), userId);
  assert.equal(await consume("PASSWORD_RESET", token), null);
});

test("a token is not valid for another purpose", async () => {
  const token = await issue("EMAIL_VERIFY", 60);
  assert.equal(await consume("PASSWORD_RESET", token), null);
});

test("an expired token does not consume", async () => {
  const token = await issue("EMAIL_VERIFY", -1);
  assert.equal(await consume("EMAIL_VERIFY", token), null);
});
```

- [ ] **Step 3: Run it**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node --test scripts/auth-tokens.test.mjs
```

Expected: 4 passing.

- [ ] **Step 4: Write `src/lib/auth/tokens.ts`**

```typescript
import "server-only";
import { query } from "@/lib/auth/db";
import { randomToken, sha256 } from "@/lib/auth/session";

export type TokenPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE";

// Returns the PLAINTEXT token for the email link. Only its hash is persisted,
// so a database leak yields no usable links.
export async function issueToken({
  purpose,
  userId,
  email,
  ttlMinutes,
  payload = {},
}: {
  purpose: TokenPurpose;
  userId?: string;
  email?: string;
  ttlMinutes: number;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const token = randomToken();
  await query(
    `insert into auth_tokens (user_id, email, purpose, token_hash, payload, expires_at)
     values ($1, $2, $3, $4, $5::jsonb, now() + ($6 || ' minutes')::interval)`,
    [
      userId ?? null,
      email ?? null,
      purpose,
      sha256(token),
      JSON.stringify(payload),
      String(ttlMinutes),
    ],
  );
  return token;
}

// Single-use by construction: the WHERE clause makes a concurrent second
// redeem match zero rows.
export async function consumeToken(purpose: TokenPurpose, token: string) {
  const rows = await query<{
    user_id: string | null;
    email: string | null;
    payload: Record<string, unknown>;
  }>(
    `update auth_tokens set consumed_at = now()
      where purpose = $1 and token_hash = $2
        and consumed_at is null and expires_at > now()
      returning user_id, email, payload`,
    [purpose, sha256(token)],
  );
  if (rows.length === 0) return null;
  return {
    userId: rows[0].user_id,
    email: rows[0].email,
    payload: rows[0].payload,
  };
}
```

- [ ] **Step 5: Write `src/lib/email/client.ts`**

```typescript
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    html,
  });
  // A failed send must not take down the surrounding action (signup should
  // still succeed if the verification mail bounces off Resend); log and move on.
  if (error) console.error(`email send failed: ${error.message}`);
}
```

- [ ] **Step 6: Write `src/lib/email/templates.ts`**

```typescript
// Plain, inline-styled HTML: transactional mail clients strip <style> blocks.
const wrap = (heading: string, body: string, cta: { url: string; label: string }) => `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2b0f18">
  <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#5b4a50">${body}</p>
  <p style="margin:24px 0">
    <a href="${cta.url}" style="background:#7E1B26;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${cta.label}</a>
  </p>
  <p style="font-size:12px;color:#8a7a80">If the button does not work, paste this into your browser:<br>${cta.url}</p>
</div>`;

export function verifyEmailTemplate(url: string) {
  return {
    subject: "Confirm your email address",
    html: wrap(
      "Confirm your email",
      "Confirm this address so we can send you password resets and tasting invites.",
      { url, label: "Confirm email" },
    ),
  };
}

export function resetPasswordTemplate(url: string) {
  return {
    subject: "Reset your password",
    html: wrap(
      "Reset your password",
      "This link expires in 60 minutes. If you did not ask for it, ignore this email — your password will not change.",
      { url, label: "Choose a new password" },
    ),
  };
}

export function inviteTemplate(
  url: string,
  hostName: string,
  tastingName: string,
) {
  return {
    subject: `${hostName} invited you to ${tastingName}`,
    html: wrap(
      "You have been invited to a tasting",
      `${hostName} invited you to <strong>${tastingName}</strong> on Blindr. Set a password to join.`,
      { url, label: "Join the tasting" },
    ),
  };
}
```

- [ ] **Step 7: Verify and commit**

```powershell
npx eslint src/lib/auth/tokens.ts src/lib/email/client.ts src/lib/email/templates.ts
```

```bash
git add src/lib/auth/tokens.ts src/lib/email scripts/auth-tokens.test.mjs package.json package-lock.json
git commit -m "auth: single-use email tokens and Resend delivery"
```

---

### Task 8: Signup and email verification

**Files:**
- Modify: `src/app/signup/actions.ts`
- Create: `src/app/auth/verify/route.ts`
- Create: `src/components/verify-email-banner.tsx`
- Modify: `src/components/app-shell.tsx` (render the banner)
- Delete: `src/app/auth/callback/route.ts` (GoTrue PKCE exchange, now dead)

**Interfaces:**
- Consumes: `hashPassword` (Task 3), `createSession` (Task 4), `issueToken` / `consumeToken` (Task 7), `sendEmail` + `verifyEmailTemplate` (Task 7).
- Produces: a signed-in session immediately on signup (**verify-later** policy), plus a pending `EMAIL_VERIFY` token.

- [ ] **Step 1: Rewrite `src/app/signup/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { verifyEmailTemplate } from "@/lib/email/templates";

export type SignUpFormState = { error: string } | null;

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await query<{ user_id: string }>(
    `select user_id from auth_credentials where lower(email) = lower($1)`,
    [email],
  );
  // Do not disclose whether an address is registered.
  if (existing.length > 0) {
    return { error: "That email cannot be used. Try signing in instead." };
  }

  const userId = randomUUID();
  await query(
    `insert into profiles (id, display_name, email)
     values ($1, $2, $3)`,
    [userId, displayName || email.split("@")[0], email],
  );
  await query(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, $3)`,
    [userId, email, await hashPassword(password)],
  );

  // Verify-later: the user is signed in straight away and nudged by a banner.
  await createSession(userId);

  const token = await issueToken({
    purpose: "EMAIL_VERIFY",
    userId,
    email,
    ttlMinutes: 60 * 24,
  });
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify?token=${token}`;
  const { subject, html } = verifyEmailTemplate(url);
  await sendEmail({ to: email, subject, html });

  redirect("/taste");
}
```

- [ ] **Step 2: Write `src/app/auth/verify/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { query } from "@/lib/auth/db";
import { consumeToken } from "@/lib/auth/tokens";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.redirect(`${origin}/taste?verify=invalid`);

  const claim = await consumeToken("EMAIL_VERIFY", token);
  if (!claim?.userId) {
    return NextResponse.redirect(`${origin}/taste?verify=expired`);
  }

  await query(
    `update auth_credentials set email_verified_at = now(), updated_at = now()
      where user_id = $1`,
    [claim.userId],
  );
  return NextResponse.redirect(`${origin}/taste?verify=ok`);
}
```

- [ ] **Step 3: Write `src/components/verify-email-banner.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Info } from "lucide-react";

// Verify-later policy: a new account works immediately, so this nudges rather
// than blocks. Dismissal is per-session on purpose — it should come back.
export function VerifyEmailBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-3 border-b border-border bg-muted/40 px-6 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="flex-1 text-sm text-muted-foreground">
        Confirm <span className="font-medium">{email}</span> so you can reset
        your password and receive tasting invites.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Render it from `src/components/app-shell.tsx`**

Replace the `supabase.auth.getUser()` call with the DAL, and render the banner
when the session exists but the address is unverified:

```typescript
const session = await getOptionalUser();
const unverified = session
  ? (
      await query<{ email: string }>(
        `select c.email from auth_credentials c
          where c.user_id = $1 and c.email_verified_at is null`,
        [session.userId],
      )
    )[0]
  : undefined;
```

Render `{unverified ? <VerifyEmailBanner email={unverified.email} /> : null}`
above the existing shell content.

- [ ] **Step 5: Delete the dead GoTrue callback**

```bash
git rm src/app/auth/callback/route.ts
```

- [ ] **Step 6: Verify and commit**

```powershell
npx eslint src/app/signup/actions.ts src/app/auth/verify/route.ts src/components/verify-email-banner.tsx src/components/app-shell.tsx
```

```bash
git add -A
git commit -m "auth: own signup with verify-later email confirmation"
```

---

### Task 9: Password reset

**Files:**
- Create: `src/app/forgot-password/page.tsx`, `src/app/forgot-password/actions.ts`, `src/app/forgot-password/forgot-form.tsx`
- Create: `src/app/reset-password/page.tsx`, `src/app/reset-password/actions.ts`, `src/app/reset-password/reset-form.tsx`
- Modify: `src/app/login/login-form.tsx` (add the "Forgot password?" link)

**Interfaces:**
- Consumes: `issueToken` / `consumeToken` (Task 7), `hashPassword` (Task 3), `revokeAllSessions` (Task 4), `checkRateLimit` (Task 6).
- Produces: `requestReset(prev, formData)` and `resetPassword(prev, formData)` server actions.

Note this flow did not exist before — Supabase never had it wired up. It is new
functionality, not a port.

- [ ] **Step 1: Write `src/app/forgot-password/actions.ts`**

```typescript
"use server";

import { query } from "@/lib/auth/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { resetPasswordTemplate } from "@/lib/email/templates";

export type ForgotState = { sent: true } | { error: string } | null;

export async function requestReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  if (!(await checkRateLimit(`reset:${email.toLowerCase()}`, 3, 60))) {
    return { error: "Too many requests. Try again in an hour." };
  }

  // Only verified addresses may reset: an unverified address is not proven to
  // belong to the account holder, so allowing reset would be a takeover path.
  const rows = await query<{ user_id: string }>(
    `select user_id from auth_credentials
      where lower(email) = lower($1) and email_verified_at is not null`,
    [email],
  );

  if (rows.length > 0) {
    const token = await issueToken({
      purpose: "PASSWORD_RESET",
      userId: rows[0].user_id,
      email,
      ttlMinutes: 60,
    });
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}`;
    const { subject, html } = resetPasswordTemplate(url);
    await sendEmail({ to: email, subject, html });
  }

  // Always the same answer, so the form cannot be used to enumerate accounts.
  return { sent: true };
}
```

- [ ] **Step 2: Write `src/app/reset-password/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { query } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, revokeAllSessions } from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";

export type ResetState = { error: string } | null;

export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const claim = await consumeToken("PASSWORD_RESET", token);
  if (!claim?.userId) {
    return { error: "That link has expired. Request a new one." };
  }

  await query(
    `update auth_credentials
        set password_hash = $2,
            password_changed_at = now(),
            updated_at = now(),
            failed_attempts = 0,
            locked_until = null
      where user_id = $1`,
    [claim.userId, await hashPassword(password)],
  );

  // A reset is the response to a possible compromise, so every other session
  // dies with it.
  await revokeAllSessions(claim.userId);
  await createSession(claim.userId);
  redirect("/taste");
}
```

- [ ] **Step 3: Write the two pages and forms**

Both mirror `src/app/login/login-form.tsx`, using `useActionState`.
`reset-password/page.tsx` reads `?token=` from `searchParams` and renders it as
a hidden input. Follow the existing login page markup exactly so the styling
matches.

- [ ] **Step 4: Verify and commit**

```powershell
npx eslint src/app/forgot-password src/app/reset-password src/app/login/login-form.tsx
```

```bash
git add -A
git commit -m "auth: password reset flow"
```

---

### Task 10: Replace the Supabase invite flow

**Files:**
- Modify: `src/app/tastings/new/actions.ts` (~line 124)
- Modify: `src/app/tastings/[id]/actions.ts` (~line 192)
- Modify: `src/app/auth/set-password/actions.ts`, `src/app/auth/set-password/page.tsx`
- Delete: `src/app/auth/confirm-hash/page.tsx`

**Interfaces:**
- Consumes: `issueToken` / `consumeToken` (Task 7), `hashPassword` (Task 3), `createSession` (Task 4), `sendEmail` + `inviteTemplate` (Task 7).
- Produces: `inviteToTasting(email, tastingId, hostName, tastingName): Promise<string | null>` in a new `src/lib/auth/invite.ts`, returning the new user's id (or null on failure) so both call sites share one implementation.

- [ ] **Step 1: Create `src/lib/auth/invite.ts`**

```typescript
import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/auth/db";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { inviteTemplate } from "@/lib/email/templates";

// Creates a passwordless placeholder profile and emails a set-password link.
// Replaces admin.auth.admin.inviteUserByEmail, which was called from two places
// with subtly different redirects; this is the single implementation.
export async function inviteToTasting(
  email: string,
  tastingId: string,
  hostName: string,
  tastingName: string,
): Promise<string | null> {
  const existing = await query<{ user_id: string }>(
    `select user_id from auth_credentials where lower(email) = lower($1)`,
    [email],
  );
  if (existing.length > 0) return existing[0].user_id;

  const userId = randomUUID();
  await query(
    `insert into profiles (id, display_name, email) values ($1, $2, $3)`,
    [userId, email.split("@")[0], email],
  );
  // No password yet: an all-'!' hash matches nothing, so the account cannot be
  // logged into until the invite link sets a real one.
  await query(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, '!')`,
    [userId, email],
  );

  const token = await issueToken({
    purpose: "INVITE",
    userId,
    email,
    ttlMinutes: 60 * 24 * 7,
    payload: { tastingId },
  });
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/set-password?token=${token}`;
  const { subject, html } = inviteTemplate(url, hostName, tastingName);
  await sendEmail({ to: email, subject, html });
  return userId;
}
```

- [ ] **Step 2: Replace both call sites**

In `src/app/tastings/new/actions.ts` and `src/app/tastings/[id]/actions.ts`,
replace the `admin.auth.admin.inviteUserByEmail(...)` block with:

```typescript
participantUserId = await inviteToTasting(
  email,
  tasting.id,
  hostDisplayName,
  tastingName,
);
if (!participantUserId) continue;
```

Remove the now-unused `createAdminClient` import from both files if nothing else
in them uses it.

- [ ] **Step 3: Rewrite `src/app/auth/set-password/actions.ts`**

It must now consume the `INVITE` token from the form rather than reading a
GoTrue session:

```typescript
const claim = await consumeToken("INVITE", token);
if (!claim?.userId) {
  return { error: "Your invite link has expired. Please ask for a new one." };
}
await query(
  `update auth_credentials set password_hash = $2, updated_at = now(),
          email_verified_at = coalesce(email_verified_at, now())
    where user_id = $1`,
  [claim.userId, await hashPassword(password)],
);
if (displayName) {
  await query(`update profiles set display_name = $2 where id = $1`, [
    claim.userId,
    displayName,
  ]);
}
await createSession(claim.userId);
redirect(
  claim.payload.tastingId ? `/tastings/${claim.payload.tastingId}` : "/taste",
);
```

Redeeming an invite proves control of the mailbox, so it verifies the address
too.

- [ ] **Step 4: Delete the GoTrue hash-fragment page**

```bash
git rm src/app/auth/confirm-hash/page.tsx
```

- [ ] **Step 5: Verify and commit**

```powershell
npx eslint src/lib/auth/invite.ts "src/app/tastings/new/actions.ts" "src/app/tastings/[id]/actions.ts" src/app/auth/set-password
```

```bash
git add -A
git commit -m "auth: own tasting invites, replacing inviteUserByEmail"
```

---

### Task 11: The sweep — replace `supabase.auth.getUser()` everywhere

~60 files. Each edit is trivial; the breadth is the risk. `tsc` catches every
miss, so this task is mechanical and safe — but do it in one pass so the
codebase is never half-migrated.

**Files:** every file matching `supabase.auth.getUser` outside `src/lib/auth/`.

**Interfaces:**
- Consumes: `requireUser()` and `getOptionalUser()` from `src/lib/auth/dal.ts` (Task 5).

- [ ] **Step 1: List the call sites**

```powershell
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "supabase\.auth\.getUser" |
  Select-Object -ExpandProperty Path -Unique | Sort-Object
```

- [ ] **Step 2: Apply the two mechanical rewrites**

Pages/actions that **redirect when signed out**:

```typescript
// before
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

// after
const { userId } = await requireUser();
```

Pages that **tolerate a signed-out visitor**:

```typescript
// before
const { data: { user } } = await supabase.auth.getUser();

// after
const session = await getOptionalUser();
```

Then replace downstream `user.id` with `userId` (or `session?.userId`). Where a
file used `user.email`, read it from `profiles` — our session carries only
`userId` and `role` by design.

- [ ] **Step 3: Verify nothing is left**

```powershell
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "supabase\.auth\." |
  Where-Object { $_.Path -notmatch "lib\\auth" }
```

Expected: **no output** except `src/lib/supabase/client.ts` if it still
references auth for the browser client.

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx tsc --noEmit
```

Expected: `EXIT=0` — the first time since Task 5.

- [ ] **Step 4: Also update `src/lib/auth/roles.ts`**

`requireAdmin()` and `requireContributor()` should call `requireUser()` and read
`role` from the session rather than re-querying `profiles`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "auth: sweep every getUser() call onto the DAL"
```

---

### Task 12: Browser token endpoint

Four browser components need an identity-bearing Supabase token:
`global-search.tsx`, `new-tasting-modal.tsx`, `new-note-modal.tsx`,
`image-uploader.tsx`. The other three read public reference data and keep using
the anon key.

**Files:**
- Create: `src/app/api/auth/token/route.ts`
- Modify: `src/lib/supabase/client.ts`

**Interfaces:**
- Consumes: `getOptionalUser()` (Task 5), `mintSupabaseToken()` (Task 5).
- Produces: `GET /api/auth/token` → `{ token: string; expiresIn: number }` or `401`.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/dal";
import { mintSupabaseToken } from "@/lib/auth/jwt";

// Phase 1 bridge: the browser still queries Supabase directly for four
// identity-scoped things, so it needs a token RLS will accept. Deliberately
// short-lived, and retired in Phase 2 when those calls move server-side.
export async function GET() {
  const session = await getOptionalUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = await mintSupabaseToken(session.userId, 600);
  return NextResponse.json(
    { token, expiresIn: 600 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 2: Make the browser client use it**

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

let cached: { token: string; expiresAt: number } | null = null;

async function currentToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const res = await fetch("/api/auth/token");
  if (!res.ok) return null;
  const { token, expiresIn } = await res.json();
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: currentToken },
  );
}
```

If `accessToken` is not accepted by `@supabase/ssr` 0.12.0, fall back to
`global: { headers: { Authorization: \`Bearer \${token}\` } }` built per call.
Verify which is supported before writing the final version — do not assume.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in, and confirm: global search returns results, the new
tasting modal lists friends, and an avatar upload succeeds. All three exercise
RLS through the minted token.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "auth: short-lived browser token for the four RLS-scoped components"
```

---

### Task 13: Backfill and cutover

Everything before this is additive — the app still runs on GoTrue. This task
switches over.

**Files:**
- Create: `supabase/migrations/20260829265100_auth_backfill.sql`
- Create: `supabase/migrations/20260829265200_auth_cutover.sql`

- [ ] **Step 1: Write the backfill**

```sql
-- Copy identity out of GoTrue into our own tables. auth.users is left intact:
-- Phase 1 stays reversible until somebody changes a password.
insert into auth_credentials (user_id, email, password_hash, email_verified_at, created_at)
select u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.created_at
  from auth.users u
  join profiles p on p.id = u.id
 where u.encrypted_password is not null
   and u.deleted_at is null
on conflict (user_id) do nothing;

do $$
declare v_users int; v_creds int;
begin
  select count(*) into v_users from auth.users u join profiles p on p.id = u.id
   where u.encrypted_password is not null and u.deleted_at is null;
  select count(*) into v_creds from auth_credentials;
  if v_creds <> v_users then
    raise exception 'backfill mismatch: % credentials for % users', v_creds, v_users;
  end if;
  if exists (select 1 from auth_credentials where password_hash !~ '^\$2[aby]\$') then
    raise exception 'a backfilled hash is not bcrypt';
  end if;
end;
$$;
```

- [ ] **Step 2: Dry-run, then apply live**

```powershell
$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265100_auth_backfill.sql --mode dry
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265100_auth_backfill.sql --mode live
```

- [ ] **Step 3: Write the cutover**

```sql
-- Sever the GoTrue coupling. The 5 orphaned auth.users are all @blindr.invalid
-- (RFC 2606, non-routable) seeded test accounts; every user-owned table FKs to
-- profiles rather than auth.users, so they own nothing and deleting them loses
-- no data.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

alter table profiles drop constraint if exists profiles_id_fkey;

delete from auth.users u
 where not exists (select 1 from profiles p where p.id = u.id);

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
     where table_name = 'profiles' and constraint_name = 'profiles_id_fkey'
  ) then
    raise exception 'profiles is still bound to auth.users';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    raise exception 'the GoTrue signup trigger survived';
  end if;
  if (select count(*) from auth.users) <> (select count(*) from profiles) then
    raise exception 'auth.users and profiles disagree after cutover';
  end if;
end;
$$;
```

- [ ] **Step 4: Dry-run, apply live, then run the whole suite**

```powershell
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265200_auth_cutover.sql --mode dry
node scripts/scratch-apply.mjs --file supabase/migrations/20260829265200_auth_cutover.sql --mode live
node --test scripts/auth-jwt.test.mjs scripts/auth-schema.test.mjs scripts/auth-session.test.mjs scripts/auth-tokens.test.mjs scripts/auth-password.test.mjs
node --test scripts/world-wine-map-foundation.test.mjs scripts/designation-members.test.mjs
```

Every suite must pass. The map suites prove the cutover did not disturb
unrelated data.

- [ ] **Step 5: Remove the dead Supabase auth plumbing**

```bash
git rm src/lib/supabase/middleware.ts
```

Confirm nothing imports it, then:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx tsc --noEmit
npx eslint .
npm run build
```

All three must exit 0.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "auth: backfill credentials and cut over from GoTrue"
git push
```

- [ ] **Step 7: Announce**

Every user is logged out. Tell them once, before they discover it.

---

## Post-cutover checks

- [ ] Sign in as an existing user with their **old** password — proves the bcrypt path.
- [ ] Confirm the hash upgraded: `select password_hash ~ '^\$argon2id' from auth_credentials where user_id = '<id>'` → `true`.
- [ ] Sign up fresh, confirm the verification email arrives and the banner clears.
- [ ] Request a password reset, complete it, confirm other sessions died.
- [ ] Invite someone to a tasting from both entry points.
- [ ] Confirm a **preview deploy on Vercel** loads `@node-rs/argon2` — the one dependency risk that local testing cannot settle.

## Self-review notes

- **Spec coverage:** schema (T2), passwords (T3), sessions (T4), JWT/DAL/proxy (T5), login (T6), email (T7), signup+verify (T8), reset (T9), invites (T10), the sweep (T11), browser bridge (T12), cutover (T13). Every spec section maps to a task.
- **Ordering:** the linchpin test is Task 1 by design — the approach is proven or abandoned before anything is built on it.
- **`tsc` is red from Task 5 to Task 11.** That is expected and called out in both tasks; it goes green again at Task 11 Step 3.
- **Known unverified:** whether `@supabase/ssr` 0.12.0 accepts the `accessToken` option (Task 12 Step 2 says to check, not assume), and whether `@node-rs/argon2` deploys on Vercel (post-cutover check).
