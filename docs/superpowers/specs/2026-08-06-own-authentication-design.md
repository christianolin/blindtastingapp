# Own Authentication — Phase 1

Date: 2026-08-06
Status: Approved design

## Goal

Replace Supabase Auth (GoTrue) with authentication we own, **without touching
authorization**. After this phase Supabase is a dumb data plane — Postgres,
Storage and Realtime — with no role in identity.

This is the first step of leaving Supabase entirely. It is scoped so that it can
ship, be verified, and be reverted on its own.

## Why this is safe: the HS256 seam

The project uses **legacy symmetric keys** (`alg: HS256`; the anon key decodes to
`{"iss":"supabase","role":"anon"}`). PostgREST, Storage and Realtime all validate
tokens against a single shared secret. So we can sign our own token carrying
`sub: <user_id>` and `role: authenticated`, and **every RLS policy keeps working
with no edits**.

Surveyed before designing:

- 140 `auth.uid()` references across 37 migrations
- **zero** uses of `auth.jwt()` or `auth.role()`
- 113 policies across ~25 tables

`auth.uid()` reads the `sub` claim and nothing else, so our token needs exactly
two meaningful claims. Had the codebase leaned on `auth.jwt()` for custom claims,
this seam would not exist and the migration would have to replace identity and
authorization simultaneously.

**Prerequisite:** `SUPABASE_JWT_SECRET` in `.env.local`, copied from Supabase
Dashboard → Settings → API. Server-only — never `NEXT_PUBLIC_`.

## Phasing

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Own auth; RLS untouched; Supabase becomes a data plane | **this spec** |
| 2 | Move browser queries server-side; drop RLS; app-level authorization | later |
| 3 | Leave Supabase: direct Postgres, own storage, own realtime | later |

Each phase is independently shippable and independently revertible. Replacing
identity (Phase 1) and replacing authorization (Phase 2) are separate problems
and are kept separate deliberately.

## Current state

| | |
| --- | --- |
| Users | 25 in `auth.users`, all `email` provider, no OAuth |
| Passwords | all bcrypt `$2a$10$` |
| Sessions | 52 active, all within 30 days |
| Profiles | 20 — 5 users have no profile (drift) |
| Browser clients | 7 components query Supabase directly; RLS is their only guard |
| Email | invites via `admin.auth.admin.inviteUserByEmail`; no email library present |
| Proxy | `src/proxy.ts` → `updateSession` → `supabase.auth.getUser()` on nearly every request |

That last row matters: today every page load makes a network round-trip to
GoTrue. Replacing it with a cookie read is a latency improvement, not only a
migration step.

## Schema

`profiles` becomes the root user table — it already carries `email`,
`display_name` and `role`. We drop its FK to `auth.users` and drop the
`handle_new_user` trigger; `auth.users` then holds inert data we can export and
ignore.

Three new tables in `public`, plus one for rate limiting:

**`auth_credentials`**
`user_id` PK → `profiles(id)` · `email` (unique on `lower(email)`) ·
`password_hash` · `email_verified_at` · `failed_attempts` · `locked_until` ·
`password_changed_at`

**`auth_sessions`**
`id` · `user_id` → `profiles(id)` · `token_hash` (sha256 of the opaque token) ·
`expires_at` · `last_seen_at` · `revoked_at` · `user_agent` · `ip`

**`auth_tokens`**
Single-use tokens for `EMAIL_VERIFY` / `PASSWORD_RESET` / `INVITE`.
`token_hash` · `purpose` · `user_id` (nullable — invites may precede a user) ·
`email` · `expires_at` · `consumed_at`

**`auth_rate_limits`**
Keyed counter with a window, so we add no external rate-limiting service.

We store **only hashes** of session tokens and email tokens. A database leak
therefore yields no live sessions and no usable reset links.

Migrations: `20260829265000` (tables) → `20260829265100` (backfill) →
`20260829265200` (cutover).

## Request flow

1. Browser holds one `session` cookie — 32 random bytes, base64url,
   `httpOnly` + `secure` + `sameSite=lax` + `path=/`.
2. `src/proxy.ts` performs an **optimistic cookie-presence check only** — no DB
   call, no crypto. It runs on the Edge runtime, so it must stay this cheap.
3. A **Data Access Layer** (`verifySession()`, wrapped in React `cache()`) does
   the real lookup once per render and returns `{ userId, role }`. This is the
   security boundary; the proxy is a UX optimisation. This split follows Next.js's
   own authentication guidance.
4. Server-side Supabase calls attach a short-lived minted JWT, so RLS continues
   to apply exactly as it does today.

**Session lifetime: 30 days sliding, revocable.** `last_seen_at` is bumped at
most once an hour so a read does not become a write on every request. Revoking
is a single `UPDATE` — the property a stateless JWT could not give us.

## Passwords

Existing hashes are bcrypt `$2a$10$`, which is portable: nobody has to reset.

Cost 10 is below current guidance. So: verify with bcrypt, and on a successful
login **transparently rehash to argon2id**. Users upgrade silently as they
return. The migration quietly fixes a real weakness rather than carrying it
forward.

## Email — Resend

Three templates: address verification, password reset, tasting invite.

Invites currently call `admin.auth.admin.inviteUserByEmail` in **two** places
(`app/tastings/new/actions.ts`, `app/tastings/[id]/actions.ts`). Both become our
own invite token plus a Resend send.

**Verification policy: verify later.** A new user gets full access immediately;
a dismissible banner nudges until the address is confirmed. Password reset always
requires a verified address, so the unverified state cannot be used to take over
an account.

## The browser-client wrinkle

Seven components talk to Supabase directly from the browser, where RLS is their
only guard. Most read public reference data (countries, regions, grapes,
type designations, aroma terms). Four need identity:

- `global-search.tsx` — `search_all` RPC
- `new-tasting-modal.tsx` — friendships, profiles
- `new-note-modal.tsx` — `consume_cellar_lot` RPC
- `image-uploader.tsx` — Storage upload

Phase 1 keeps them working by exposing a **short-lived (~10 minute) minted token**
through a route handler. Phase 2 moves those calls server-side and retires it.
This avoids rewriting six components while the auth swap is in flight.

## Cutover

1. Backfill `auth_credentials` from `auth.users` (email + `encrypted_password`).
2. Drop the 5 orphaned users. All are `@blindr.invalid` — RFC 2606 reserved and
   non-routable, so seeded test accounts. Every user-owned table FKs to
   `profiles`, not `auth.users`, so they own nothing and deleting them loses no
   data.
3. Drop the `profiles → auth.users` FK and the `on_auth_user_created` trigger.

**All 52 active sessions are invalidated — every user logs out once.** The cookie
formats are incompatible; there is no way around this.

## Codebase impact

**New:** `lib/auth/{dal,session,password,jwt,tokens,rate-limit}.ts`,
`lib/email/*`

**Rewritten:** `src/proxy.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`,
`lib/auth/roles.ts`, `app/login/actions.ts`, `app/signup/actions.ts`,
`app/actions.ts`, `app/auth/*`, both invite actions

**Swept:** ~60 files calling `supabase.auth.getUser()` become `requireUser()` /
`getOptionalUser()`. Each edit is trivial; `tsc` catches every miss. The breadth
is the risk here, not the difficulty.

**New dependencies:** `jose` (JWT, works on Edge and Node), `@node-rs/argon2`,
`bcryptjs` (verify legacy hashes), `resend`

## Risks

1. **JWT secret rotation** would invalidate our tokens *and* the anon key
   simultaneously. Document it; do not rotate casually.
2. **`@node-rs/argon2` on Vercel** ships prebuilt binaries but must be proven in
   a preview deploy before cutover, not assumed. Fallback: bcrypt cost 12.
3. **No rollback once new passwords are set.** Mitigated by keeping `auth.users`
   intact — we only drop the FK — so Phase 1 stays reversible until a user
   changes their password.
4. **Rate limiting is DB-backed**, which is adequate at 25 users and would need
   revisiting at scale.

## Testing

Existing suites connect directly with `DB_PASSWORD` and keep working unchanged.

New tests:

- **Minted JWT satisfies RLS** — proves `auth.uid()` resolves from our token.
  This is the linchpin of the whole design and should be written **first**: if it
  fails, the approach is wrong and everything else is wasted work.
- Session lifecycle: create, slide, expire, revoke
- Password verify + transparent rehash from bcrypt to argon2id
- Token single-use and expiry for all three purposes
- Rate limiting and account lockout
