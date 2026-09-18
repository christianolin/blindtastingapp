# Platform invites — Implementation Plan

A personal invite link, its landing page, the inviter's share screen, one email template behind a sender seam, and the migration that backs it

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is prompt-ready: give one agent the **Global Constraints**, the **Plan refinements**, the **Working Rules** and **exactly one task**, together with the spec path below.

**Goal:**
- Build the owner's platform invites (spec D1–D5) as the spec settles them (D6–D22): `/invite/<code>` explains Blindr in its own words and brings the invitee in as the inviter's friend both ways; the inviter copies, shares or emails the link; one email template serves the Supabase sender today and a Resend sender later.
- One migration (`20260918130500_platform_invites.sql`), dry-run by an agent, applied live by the main session before any code that calls its RPCs is pushed.
- Nothing leaks: the invitee's email never leaves a server action; a friendship is never written without the signed-in person's own tap or their own browser's join intent (D12).

**Architecture:**
- **Pure modules first.** `src/lib/invites/copy.ts` (copy, validity), `src/lib/invites/links.ts` (every path and URL, `safeNext`-clean) and `src/lib/email/platform-invite.ts` (the template, the mailto builder, the dashboard variant) land test-first, so the actions and the UI build against fixed strings and shapes.
- **Server writes in one action file.** `src/app/invite/actions.ts` (`"use server"`): `createPlatformInvite`, `sendPlatformInvite`, `beginJoin`, `acceptInvite`. The sender seam `src/lib/email/sender.ts` is the only file that imports `createAdminClient` for this feature. The accept route handler `src/app/invite/[code]/accept/route.ts` is the first-sign-in landing.
- **One landing page, six views** named by a pure router (`invite-route.ts`, the `view-route.ts` pattern) and rendered by `invite-landing.tsx`.
- **One dialog, two entry points.** `InvitePeopleDialog` mounts from `/community` and from the viewer's own `/u/[id]`.

**Tech Stack:**
- Next.js 16 App Router. AGENTS.md: read the relevant guide in `node_modules/next/dist/docs/` before writing a route handler, a server action that sets a cookie, or a `redirect()` — the APIs differ from older Next.
- React 19, TypeScript, Tailwind, shadcn/ui on `@base-ui/react` (`Dialog`, `Button`, `Input`, `Label`, `Card`, `Avatar`).
- Supabase: Postgres, RLS, Auth admin (`inviteUserByEmail`). No Realtime, no Storage.
- vitest (node, `src/**/*.test.ts`). No new dependencies (the Resend SDK is NOT added).

**Spec:** `docs/superpowers/specs/2026-09-18-platform-invites-design.md`. Each task cites the sections and decisions it implements; read them.

**Inputs** (all binding):
- The spec above (authoritative; D1–D22 are settled).
- CLAUDE.md "Auth link handling", "Join codes", "Friends", "RLS recursion", "Base UI component gotchas"; AGENTS.md.
- Code models: `src/app/j/[code]/**`, `src/app/signup/**`, `src/app/login/**`, `src/app/auth/callback/route.ts`, `src/app/auth/confirm-hash/page.tsx`, `src/lib/safe-next.ts`, `src/lib/supabase/admin.ts`, `inviteToTasting` in `src/app/tastings/[id]/actions.ts`, `src/app/tastings/new/join-link-row.tsx` (copy), `src/app/tastings/[id]/result/result-view.tsx` (`navigator.share`), `src/components/friend-button.tsx`, `src/app/friends/actions.ts`, `supabase/migrations/20260914093500_join_preview_and_late_join.sql`, `.superpowers/blind-tasting/probes/20260914093500-join-preview.mjs`, `scripts/scratch-apply.mjs`.

**Base:** `master` at `e9fb37c` (2026-09-18). Working tree clean.

**Id conventions:** `PI-Pn` pure modules, `PI-X1` types, `PI-SQL1` migration + probe, `PI-D1` actions, `PI-Un` UI, `PI-DOC1` docs, `PI-Vn` verification.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Precedence and invariants

- **Precedence:** owner decisions (D1–D5) → the spec's defaults (D6–D22) → this plan's refinements → code on `master`.
- **Invariants you must never plan or build against:**
  - **The invitee's email never leaves the server.** `invitee_email` is selected only inside `src/app/invite/actions.ts` (and typed in `database.types.ts`); no RPC returns it; no component prop, page, email body or log line carries it. The name is used only in the email salutation and as the invited account's `display_name` (D9, D14).
  - **No friendship without intent.** The accept route writes only when the `blindr-invite-intent` cookie matches the code (D12); the landing's button writes only on the signed-in person's own tap (D11). Nothing else ever calls `accept_platform_invite`.
  - **`safeNext` on every `next`.** Every `?next=` this feature builds comes from `links.ts`, and `links.test.ts` proves each round-trips through `safeNext` unchanged. The accept route and the actions re-validate what they read (`/j` and `/auth/callback` do the same).
  - **Service role stays in the seam.** `createAdminClient` is imported by `src/lib/email/sender.ts` only (plus the two existing tasting actions); never by a page, a component, a pure module or `actions.ts` directly.
  - **The provider's error is shown verbatim** (D15). No wrapper text replaces it; the mailto link stays available beneath.
  - **Copy verbatim where the spec quotes it** (§8: the owner's eight strings as typed — ASCII apostrophe in "You're invited" — and the three About lines character for character as `about/page.tsx` has them).
  - **Repo primitives and tokens only;** no raw hex outside `src/lib/email/platform-invite.ts` (D18). Light and dark both render (the `.dark` block keeps bordeaux).
  - **Sizes:** 44 px minimum tap targets on phones (`min-h-11`, `md:pointer-fine:min-h-0` where a laptop control may be tighter); no text below 10 px.
  - **Controlled inputs** on every field (the dialog's name, email, send-to fields).
  - **Migration discipline:** the migration is written against the LIVE definitions the probe dumps, pre-asserts them, and post-asserts its own result fail-closed. Agents run the probe (rollback) and `scratch-apply --mode dry` only; only the main session runs `--mode live`.

### Anthropic API

- **Zero calls.** No agent and no task in this plan calls the Anthropic API. Browser verification (PI-V3) keeps `LABEL_READ_FIXTURE` set in `.env.local`.

### Tests and pure modules

- vitest runs `src/**/*.test.ts` in node with **no `@/` alias**. A module a test loads imports other modules at runtime only by relative path; `import type … from "@/…"` is fine.
- **Pure modules** never import `server-only`, a Supabase client, React, `next/*` or a browser API at module top level: `src/lib/invites/copy.ts`, `src/lib/invites/links.ts`, `src/lib/email/platform-invite.ts`, `src/app/invite/[code]/invite-route.ts`.
- Tests are written first (Working Rule 4). Component files get no unit tests; PI-V3's browser checks cover them.

### CLAUDE.md rules that bind here

- **Auth links:** admin-generated links land on `/auth/confirm-hash?next=…`, never `/auth/callback` (D13). Self-serve signup confirmation goes through `/auth/callback?next=…` as today.
- **Friends are one-way rows;** the RPC writes both directions (D10). Never write `friendships` from the client for this feature (`addFriend` stays for the profile button).
- **Base UI:** `Button render={<Link/>}` needs `nativeButton={false}`; a `Button` passed as another component's `render` keeps the default.
- **`LocalDateTime`** formats the expiry (viewer's zone); never `toLocaleDateString` on the server.
- **No `window.confirm`.**
- **RLS helpers:** the new policies touch only `platform_invites` by `inviter_id = auth.uid()` — no cross-table subquery, so no recursion risk; keep it that way.

### Deploy and push

- The main session pushes straight to `master` (no PR; `gh` is not installed) through the integrate worktree (`.superpowers/queue.md` "Push cadence"), and only a tree where each of these passes with its real exit code captured (never `cmd | tail && next`):
  1. `npx tsc --noEmit`
  2. `npm run lint -- --max-warnings=0`
  3. `npm test`
  4. `node --test scripts/wine-map-tiles/lib.test.mjs`
  5. `npm run build`
- **Order of deploy:** the migration is applied live (main session, after PI-SQL1's DRY-OK and PI-V1) BEFORE any push that contains PI-D1, PI-U1 or PI-U2 — a deployed page calling `get_platform_invite_preview` before it exists 404s every invite link. The dashboard template (PI-DOC1) is pasted before PI-V3's send check.
- The pre-existing `package-lock.json` diff is never committed and the working-tree file is never rewritten.

### Never build

- A list of one's links, a revoke/delete action, `max_uses` or expiry inputs (D21).
- The Resend sender, its SDK or key (D16 shapes the seam only).
- A preview column for `invitee_email`, `invitee_name`, `uses` or `max_uses` (D9).
- A silent accept on a plain GET without the intent cookie (D12).
- A second copy of the three About lines: `copy.ts` is the one place they are typed for this feature (the About page keeps its own).
- A change to `/j/[code]`, the tasting invite actions, `handle_new_user`, `generate_join_code` or `friendships`' policies.

---

## Plan refinements of the spec (binding; they keep the spec's names, copy and data rules)

1. **`copy.ts` owns the state word.** `InviteState = "ok" | "expired" | "exhausted" | "unknown"`; `inviteState({ expiresAt, uses, maxUses }, now)` mirrors the RPC's rule (expired wins) and is what the dialog's footer and the tests use; the page takes the RPC's `state` and maps a missing row to `"unknown"`.
2. **`links.ts` is the only builder of paths.** `acceptPath(code)`, `landingPath(code)`, `inviteUrl(siteUrl, code)`, `signupHref(code)`, `loginHref(code)`, `confirmHashRedirect(siteUrl, code)`, `normaliseCode(raw)` (`upper(trim)`), `isCodeShape(code)` (`^[A-HJ-NP-Z2-9]{10}$`). `siteUrl` is passed in (`process.env.NEXT_PUBLIC_SITE_URL` read by the caller, trailing slash stripped as `tasting-result.ts` does).
3. **The intent cookie** is named `blindr-invite-intent`, `httpOnly`, `sameSite: "lax"`, `secure` outside development, `path: "/invite"`, `maxAge: 60 * 60 * 24`. `beginJoin` sets it only after `get_platform_invite_preview` returned `ok`; the accept route deletes it on every outcome.
4. **The accept route is a route handler** (`route.ts`, GET), not a page: it must read and delete a cookie and redirect, which a server component cannot do. It builds every redirect from `links.ts` and `new URL(path, request.url)`.
5. **`createPlatformInvite` retries a `23505` twice**, then returns the error message. It inserts only `{ inviter_id, invitee_name, invitee_email }` (trimmed; the email lower-cased; blanks as null); defaults do the rest. It returns `{ code, url, expiresAt, maxUses }`.
6. **`sendPlatformInvite(code, email)`** reads the caller's own row through RLS (a foreign code reads as "no such link"), refuses a non-`ok` state with the matching state line, then hands off to the sender. The address is used, not stored (D14).
7. **`acceptInvite(code)`** (the landing's tap) redirects to `/u/<inviterId>` on success and returns `{ error }` on a refusal, mapped through `friendlyAcceptError` (the `/j` `friendlyJoinError` shape: the RPC's short lower-case reasons become sentences).
8. **The dialog's "Share" appears only after mount** (`useEffect` sets `canShare` from `"share" in navigator`), so the server render and the first client render agree.
9. **The email HTML is built by one internal `htmlBody({ inviterName, inviteeName, url }, { escape })`**; `platformInviteEmail` calls it with `escape: true`, `supabaseInviteTemplateHtml()` with `escape: false` and Go placeholders, wrapped in `{{ if .Data.platform_invite_code }}…{{ else }}…{{ end }}`; the `else` branch is the generic invite of the Plan copy table.
10. **The dashboard doc is pinned by a test that reads the file** (`src/lib/email/supabase-template-doc.test.ts`, owned by PI-DOC1): the fenced `html` block in `docs/email/supabase-invite-template.md` must equal `supabaseInviteTemplateHtml()` and the fenced `text` subject block must equal `SUPABASE_INVITE_SUBJECT`.
11. **The landing page's "Sign in" is a form submit too** (posting `beginJoin(code, "login")`), so the intent cookie is set on either path; a plain `/login?next=` link would skip it and cost the emailed invitee's flow nothing, but would make the signup path inconsistent.
12. **The `unknown` view is served signed in or out** with the `/j` `MessageCard` shape; its link is "Back to the overview" in both cases (signed out it bounces through `/login`, which is fine).
13. **`InvitePeopleButton` is a plain client button** ("Invite someone", `variant="outline"`, `min-h-11` on phones) that owns the dialog's `open` state; both entry points render it with only `inviterName` (the name the send and share paths need).
14. **The probe asserts the constraint names** (`platform_invites_code_shape`, `_max_uses_range`, `_uses_range`, `_expiry_window`, `_invitee_name_len`, `_invitee_email_folded`) so a rename shows.

### Plan copy (strings the spec does not supply)

| String | Where | Why |
|---|---|---|
| "Invite someone" | the entry button (PI-U2) | the owner named the screens, not the button |
| "Invite a friend to Blindr" | the dialog title (PI-U2) | |
| "Their name (optional)" · "Their email (optional)" · "Make a link" | dialog step 1 (PI-U2) | |
| "Making a link…" · "Sending…" | pending labels (PI-U2) | the `JoinLinkRow` / `FriendButton` idiom |
| "Sent to {email}" | send success (PI-U2) | |
| "Works until {date} · up to {n} people" | dialog footer (PI-U2, copy in PI-P1 `footerLine`) | D8's defaults, shown not edited |
| "Someone with that address is already on Blindr — send them the link instead." | `existing-account` (PI-D1) | D14 |
| "Email sending through Resend is not set up yet." | the resend stub (PI-D1) | D16 |
| "Couldn't open that invite" | the message card title (PI-U1) | the `/j` "Couldn't join that tasting" shape |
| "No invite has that code — check the link with whoever sent it." | `unknown` (PI-P1) | the `/j` unknown-code shape |
| "This invite link has expired." · "This invite link has been used up." · "Ask {inviter} for a new one." | `expired` / `exhausted` (PI-P1); the second line only when the inviter is known | |
| "This is your own invite link." · "Share it with someone who is not on Blindr yet." | `own-link` (PI-P1) | |
| "Not now" | the landing's secondary link (PI-U1) | |
| "Hi {name}," · "Hi," · "{inviter} invited you to Blindr." · "Join Blindr: {url}" · "If you weren't expecting this, you can ignore it." | the email (PI-P2) | |
| "You've been invited to Blindr" · "You have been invited to Blindr. Follow this link to accept the invite:" · "Accept the invite" | the dashboard template's `else` branch and fallback subject (PI-P2) | tasting invites share the template (D17); the main session compares with the live dashboard text before pasting |
| "not signed in" · "no invite has that code" · "that is your own invite link" · "that invite link has expired" · "that invite link has been used up" | the RPC's raise reasons (PI-SQL1) | the `/j` lower-case reason idiom |
| "Their name can be 80 characters at most." · "That email address doesn't look right." | `createPlatformInvite` refusals (PI-D1) | the ≤80 name bound and the email-shape check |
| "The link didn't work. Ask whoever sent it for a fresh one." | `friendlyAcceptError`'s fallback (PI-D1) | the `/j` `friendlyJoinError` shape |
| "Email address" (visually hidden label) · "name@example.com" (placeholder) | the dialog's revealed email field (PI-U2) | spec §6 names the field, not its label |

Every string above is marked `(plan copy)` in a code comment next to it (SQL: `-- (plan copy)`).

---

## Working Rules

1. **Ownership.** You may create, edit or delete only the files in your task's **OWNS** list. You may read anything. If the task needs a change in a file you do not own, stop and report the exact change to the orchestrator. Never make it yourself.

2. **No git writes by agents.**
   - Agents never change the index or history: no `git add`, `commit`, `stash`, `checkout -- …`, `reset`, `fetch` or `pull`.
   - The main session reviews each finished task and commits exactly its OWNS paths on `master`: `git add -- <paths> && git commit -m "feat(invites): PI-XX — <title>"`, ending the message with the session's attribution line.
   - Files under `.superpowers/` are gitignored and never committed.

3. **No database writes by agents.** PI-SQL1's probe runs inside transactions that always roll back, and `scripts/scratch-apply.mjs` is run with `--mode dry` only. `--mode live`, the dashboard paste and every fixture that persists belong to the main session (PI-V3).

4. **Tests first.** For every file in a task's **Tests** block:
   1. Write the tests.
   2. Run `npx vitest run <file>` and watch it fail for the stated reason.
   3. Implement.
   4. Run it again and watch it pass.

5. **tsc.** A bare `npx tsc --noEmit` must print nothing after your task. Parallel agents share one tree: an error in a file another running task owns is that task's. Note it and move on.

6. **Before reporting done,** run:
   - the task's `npx vitest run …`, or `npm test` if you touched a module other tests import;
   - `npx tsc --noEmit` (must print nothing);
   - `npx eslint <your OWNS source files> --max-warnings=0`;
   - the task's Acceptance commands.

7. **Report:**
   - files changed (a subset of OWNS);
   - tests added and their pass output;
   - tsc and eslint output;
   - every stop-and-report item;
   - every plan-copy string used;
   - the spec sections and decisions closed.

8. **Paths with brackets:** quote them in shell commands, for example `"src/app/invite/[code]/page.tsx"`.

9. **Dev and browser gotchas** (CLAUDE.md):
   - A stale Turbopack 404 renders unstyled: stop the server, `rm -rf .next`, start again.
   - The browser tool sends "Enter", not "Return".
   - Mint demo sessions with `.superpowers/demo-session.mjs`; never type a password. Switching users re-mints (one cookie jar).
   - A hidden Browser pane never hydrates; keep it visible for interactive checks.

## Task Fields

| Field | What it holds |
|---|---|
| **Depends on** | The tasks that must be committed first. |
| **OWNS** | The exhaustive list of files the task may create, modify or delete. |
| **Does** | Concrete bullets, with spec references. |
| **Interfaces** | Consumes: names from earlier tasks. Produces: names later tasks rely on, with signatures. |
| **Tests** | vitest code written first for pure modules and helpers with logic. |
| **Steps** | The ordered checklist. |
| **Acceptance** | Commands and results that prove it is done. |
| **Closes** | Spec sections and decisions. |

## Task Index

| ID | Title | Depends on |
|---|---|---|
| PI-P1 | Invite copy, validity states and links | — |
| PI-P2 | The email template, the mailto builder, the dashboard variant | — |
| PI-X1 | `platform_invites` and the two RPCs in the hand-written types | — |
| PI-SQL1 | Migration `20260918130500_platform_invites` + probe (dry run only) | — |
| PI-D1 | Actions, the sender seam, the accept route | PI-P1, PI-P2, PI-X1 |
| PI-U1 | The landing page `/invite/[code]` | PI-D1 |
| PI-U2 | The inviter's dialog and the Community / profile entry points | PI-D1 |
| PI-DOC1 | The dashboard template doc (pinned) and the CLAUDE.md lines | PI-P2, PI-SQL1 |
| PI-V1 | Integration gate | every task above |
| PI-V2 | Adversarial review | PI-V1 |
| PI-V3 | Live apply, dashboard paste and browser check (main session) | PI-V2 |

---

## File structure

One responsibility per file. "→ PI-xx" is the owning task.

**Created**
- `src/lib/invites/copy.ts`, `copy.test.ts` — the owner's strings, the three About lines, state copy, `inviteState`, `footerLine` → PI-P1
- `src/lib/invites/links.ts`, `links.test.ts` — every path/URL, code normalisation and shape → PI-P1
- `src/lib/email/platform-invite.ts`, `platform-invite.test.ts` — `platformInviteEmail`, `mailtoHref`, `supabaseInviteTemplateHtml`, `SUPABASE_INVITE_SUBJECT` → PI-P2
- `supabase/migrations/20260918130500_platform_invites.sql` → PI-SQL1
- `.superpowers/invites/probes/20260918130500-platform-invites.mjs` (+ `.log`, `.out.json`, `-live-defs.sql`; gitignored) → PI-SQL1
- `src/lib/email/sender.ts` — the seam (`server-only`) → PI-D1
- `src/app/invite/actions.ts` — `"use server"`: `createPlatformInvite`, `sendPlatformInvite`, `beginJoin`, `acceptInvite` → PI-D1
- `src/app/invite/[code]/accept/route.ts` — the first-sign-in landing (D11a, D12) → PI-D1
- `src/app/invite/[code]/invite-route.ts`, `invite-route.test.ts` — `inviteView` → PI-U1
- `src/app/invite/[code]/page.tsx`, `invite-landing.tsx` → PI-U1
- `src/components/invite/invite-people-button.tsx`, `invite-people-dialog.tsx` → PI-U2
- `docs/email/supabase-invite-template.md` → PI-DOC1
- `src/lib/email/supabase-template-doc.test.ts` — pins the doc to the module → PI-DOC1

**Modified**
- `src/lib/supabase/database.types.ts` — the table and the two functions → PI-X1
- `.env.example` — `PLATFORM_EMAIL_PROVIDER` → PI-D1
- `src/app/community/page.tsx` — "Invite someone" in `PageHeader` actions → PI-U2
- `src/app/u/[id]/page.tsx` — "Invite someone" on the own profile → PI-U2
- `CLAUDE.md` — the platform-invites bullet → PI-DOC1

**Unchanged on purpose:** `src/app/j/**`, `src/app/signup/**`, `src/app/login/**`, `src/app/auth/**`, `src/lib/safe-next.ts`, `src/lib/supabase/admin.ts`, `src/app/tastings/**`, `src/app/friends/actions.ts`, `src/components/friend-button.tsx`, `src/proxy.ts`.

---

## Parallelism and Sequencing

### Waves

| Wave | Starts when | Tasks that may run at the same time |
|---|---|---|
| 0 | now | PI-P1 · PI-P2 · PI-X1 · PI-SQL1 |
| 1 | PI-P1, PI-P2, PI-X1 | PI-D1 |
| 2 | PI-D1 (and PI-SQL1 for DOC1) | PI-U1 · PI-U2 · PI-DOC1 |
| 3 | every task above | PI-V1 → PI-V2 → (main session: live apply, dashboard paste) → PI-V3 |

### Two tasks may run together only when all three hold

1. Neither depends on the other, directly or transitively.
2. They are not both in one chain (P1/P2/X1 → D1 → U1/U2).
3. Their OWNS lists are disjoint.

### Files more than one task edits

None. `database.types.ts` (PI-X1), `community/page.tsx` and `u/[id]/page.tsx` (PI-U2), `.env.example` (PI-D1) and `CLAUDE.md` (PI-DOC1) each have one editor.

### Contract dependencies

| Consumer | Provider | Contract |
|---|---|---|
| PI-D1, PI-U1, PI-U2 | PI-P1 | `copy.ts` and `links.ts` exports below |
| PI-D1, PI-U2, PI-DOC1 | PI-P2 | `platformInviteEmail`, `mailtoHref`, `supabaseInviteTemplateHtml`, `SUPABASE_INVITE_SUBJECT`, `PlatformInviteMessage` |
| PI-D1 | PI-X1 | `Database["public"]["Tables"]["platform_invites"]`, `Functions["get_platform_invite_preview"]`, `Functions["accept_platform_invite"]`, `PlatformInviteState` |
| PI-U1, PI-U2 | PI-D1 | `createPlatformInvite`, `sendPlatformInvite`, `beginJoin`, `acceptInvite` and their result types |
| PI-D1 (runtime) | PI-SQL1 | the two RPCs, live before deploy |
| PI-V3 | PI-U1, PI-U2, PI-DOC1 | the screens and the pasted template |

---

## Track PI-P — Pure modules (wave 0, parallel)

New files only. Relative runtime imports, `import type` for anything under `@/`, no `server-only`, no React, no Supabase client, no `next/*`.

---

### PI-P1 — Invite copy, validity states and links

**Depends on:** —

**OWNS**
- create `src/lib/invites/copy.ts`, `src/lib/invites/copy.test.ts`
- create `src/lib/invites/links.ts`, `src/lib/invites/links.test.ts`

**Does** (spec §2 D1, D8, D19; §3; §8; refinements 1, 2)
- `copy.ts`: the owner's strings as constants, the three About lines as a readonly tuple (verbatim from `src/app/about/page.tsx`, §8 order), the state and own-link copy (Plan copy table), `inviteState` and `footerLine`.
- `links.ts`: every path and URL the feature uses; `normaliseCode` and `isCodeShape`. Nothing here reads `process.env`.

**Interfaces — produces**
```ts
// src/lib/invites/copy.ts
import type { PlatformInviteState } from "@/lib/supabase/database.types"; // "ok" | "expired" | "exhausted"
export type InviteState = PlatformInviteState | "unknown";
export const EYEBROW = "You're invited";
export const JOIN_BLINDR = "Join Blindr";
export const COPY_LINK = "Copy link";
export const SHARE = "Share";
export const SEND_BY_EMAIL = "Send by email";
export const OPEN_IN_MAIL_APP = "Open in my mail app";
export const ABOUT_LINES: readonly [string, string, string]; // spec §8, in order
export function invitedTitle(inviter: string): string;      // "{inviter} invited you to Blindr"
export function addFriendLabel(inviter: string): string;    // "Add {inviter} as a friend"
export function inviteState(
  row: { expiresAt: string; uses: number; maxUses: number },
  now: Date,
): PlatformInviteState;                                     // expired wins over exhausted
/** Title + lines for the non-ok views; `inviter` null → no "Ask … for a new one." line. */
export function stateCopy(state: Exclude<InviteState, "ok">, inviter: string | null): { title: string; lines: string[] };
export const OWN_LINK_LINES: readonly [string, string];
export function footerLine(expiryText: string, maxUses: number): string; // "Works until {date} · up to 50 people"

// src/lib/invites/links.ts
export const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{10}$/;
export function normaliseCode(raw: string): string;        // upper(trim)
export function isCodeShape(code: string): boolean;
export function landingPath(code: string): string;         // "/invite/<code>"
export function acceptPath(code: string): string;          // "/invite/<code>/accept"
export function signupHref(code: string): string;          // "/signup?next=" + encodeURIComponent(acceptPath)
export function loginHref(code: string): string;           // "/login?next=" + …
export function inviteUrl(siteUrl: string, code: string): string;          // trailing slash stripped
export function confirmHashRedirect(siteUrl: string, code: string): string; // `${site}/auth/confirm-hash?next=${acceptPath}` (D13; unencoded next, as the tasting actions write it)
export const INVITE_INTENT_COOKIE = "blindr-invite-intent";
```

**Tests (write first)** — `src/lib/invites/copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { ABOUT_LINES, EYEBROW, addFriendLabel, footerLine, inviteState, invitedTitle, stateCopy } from "./copy";

describe("invite copy (spec §8)", () => {
  it("owner strings, verbatim", () => {
    expect(EYEBROW).toBe("You're invited");
    expect(invitedTitle("Isabelle Moreau")).toBe("Isabelle Moreau invited you to Blindr");
    expect(addFriendLabel("Isabelle Moreau")).toBe("Add Isabelle Moreau as a friend");
  });
  it("the three About lines, in order, unchanged", () => {
    expect(ABOUT_LINES).toEqual([
      "Taste with structure, challenge yourself blind, and learn more from every bottle.",
      "We believe wine deserves more than a quick score. By giving people a structured way to observe, describe, compare and learn, Blindr helps curious drinkers develop their palate.",
      "Built for enthusiasts, committed beginners, blind tasters, collectors and professionals who want to learn more from every bottle.",
    ]);
  });
  it("validity: expired wins, then the cap", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(inviteState({ expiresAt: "2026-10-18T12:00:00Z", uses: 0, maxUses: 50 }, now)).toBe("ok");
    expect(inviteState({ expiresAt: "2026-09-18T12:00:00Z", uses: 0, maxUses: 50 }, now)).toBe("expired"); // boundary: <= now
    expect(inviteState({ expiresAt: "2026-10-18T12:00:00Z", uses: 50, maxUses: 50 }, now)).toBe("exhausted");
    expect(inviteState({ expiresAt: "2026-09-01T12:00:00Z", uses: 50, maxUses: 50 }, now)).toBe("expired");
  });
  it("state copy with and without an inviter", () => {
    expect(stateCopy("expired", "Isabelle Moreau").lines).toEqual(["This invite link has expired.", "Ask Isabelle Moreau for a new one."]);
    expect(stateCopy("exhausted", null).lines).toEqual(["This invite link has been used up."]);
    expect(stateCopy("unknown", null)).toEqual({ title: "Couldn't open that invite", lines: ["No invite has that code — check the link with whoever sent it."] });
  });
  it("footer", () => {
    expect(footerLine("18 Oct 2026", 50)).toBe("Works until 18 Oct 2026 · up to 50 people");
    expect(footerLine("18 Oct 2026", 1)).toBe("Works until 18 Oct 2026 · up to 1 person");
  });
});
```
`src/lib/invites/links.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "../safe-next";
import { acceptPath, confirmHashRedirect, inviteUrl, isCodeShape, landingPath, loginHref, normaliseCode, signupHref } from "./links";

const CODE = "NEB7K2QX4M";
describe("invite links (spec §3, D12, D13)", () => {
  it("paths", () => {
    expect(landingPath(CODE)).toBe("/invite/NEB7K2QX4M");
    expect(acceptPath(CODE)).toBe("/invite/NEB7K2QX4M/accept");
    expect(signupHref(CODE)).toBe("/signup?next=%2Finvite%2FNEB7K2QX4M%2Faccept");
    expect(loginHref(CODE)).toBe("/login?next=%2Finvite%2FNEB7K2QX4M%2Faccept");
  });
  it("every next survives safeNext unchanged", () => {
    for (const p of [landingPath(CODE), acceptPath(CODE)]) expect(safeNext(p)).toBe(p);
    expect(safeNext(new URL(signupHref(CODE), "https://x.test").searchParams.get("next"))).toBe(acceptPath(CODE));
  });
  it("absolute urls strip a trailing slash and keep the site", () => {
    expect(inviteUrl("https://blindr.example/", CODE)).toBe("https://blindr.example/invite/NEB7K2QX4M");
    expect(confirmHashRedirect("https://blindr.example", CODE)).toBe("https://blindr.example/auth/confirm-hash?next=/invite/NEB7K2QX4M/accept");
  });
  it("code normalisation and shape", () => {
    expect(normaliseCode("  neb7k2qx4m ")).toBe("NEB7K2QX4M");
    expect(isCodeShape("NEB7K2QX4M")).toBe(true);
    expect(isCodeShape("NEB7K2")).toBe(false);      // a 6-character tasting code is not a platform code
    expect(isCodeShape("NEB7K2QX40")).toBe(false);  // 0 is outside the alphabet
    expect(isCodeShape("../accept")).toBe(false);
  });
});
```

**Steps**
- [ ] Write both tests; run `npx vitest run src/lib/invites` — fail: modules missing.
- [ ] Implement `copy.ts` (copy the three lines from `about/page.tsx` by hand and diff them against the test), then `links.ts`.
- [ ] `npx vitest run src/lib/invites` green; `npx tsc --noEmit`; eslint on the four files.

**Acceptance:** the two test files pass; `rg -n 'from "@/' src/lib/invites` shows only `import type` lines; `rg -n "process\.env|server-only|from \"next|from \"react" src/lib/invites` prints nothing.

**Closes:** spec §8 (owner strings, the three lines), D8 (defaults shown), D19 (states), §3 (paths), refinements 1–2.

---

### PI-P2 — The email template, the mailto builder, the dashboard variant

**Depends on:** —

**OWNS**
- create `src/lib/email/platform-invite.ts`, `src/lib/email/platform-invite.test.ts`

**Does** (spec §2 D3, D17, D18; §7; refinement 9)
- `platformInviteEmail` → subject, preheader, text, html, buttonUrl. HTML: a 560 px single-column table, `#F5EFE3` ground, a `#5C1A2B` button "Join Blindr" (`buttonUrl`), the three lines, the raw URL under the button, the sign-off line; names escaped (`&`, `<`, `>`, `"`). Text: the salutation, the title sentence, the three lines, "Join Blindr: {url}", the sign-off; CRLF-free (`\n`), the mailto builder converts.
- `mailtoHref(to, message)` → `mailto:` + `encodeURIComponent(to)` (empty allowed) + `?subject=` + `&body=` with `\n` → `%0D%0A`.
- `supabaseInviteTemplateHtml()` → the same body with `{{ .Data.platform_inviter_name }}` and `{{ .ConfirmationURL }}` unescaped, wrapped `{{ if .Data.platform_invite_code }} … {{ else }} <generic> {{ end }}`; `SUPABASE_INVITE_SUBJECT` = the Go subject of spec §7.
- The three lines come from `../invites/copy` (`ABOUT_LINES`) — relative import; the module stays pure.

**Interfaces — produces**
```ts
export type PlatformInviteMessage = { subject: string; preheader: string; text: string; html: string; buttonUrl: string };
export function platformInviteEmail(input: { inviterName: string; inviteeName: string | null; url: string }): PlatformInviteMessage;
export function mailtoHref(to: string | null, message: Pick<PlatformInviteMessage, "subject" | "text">): string;
export function supabaseInviteTemplateHtml(): string;
export const SUPABASE_INVITE_SUBJECT: string;
```

**Tests (write first)** — `src/lib/email/platform-invite.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { ABOUT_LINES } from "../invites/copy";
import { SUPABASE_INVITE_SUBJECT, mailtoHref, platformInviteEmail, supabaseInviteTemplateHtml } from "./platform-invite";

const URL = "https://blindr.example/invite/NEB7K2QX4M";
describe("platform invite email (spec §7, D3)", () => {
  const m = platformInviteEmail({ inviterName: "Isabelle Moreau", inviteeName: "Anna", url: URL });
  it("subject and preheader", () => {
    expect(m.subject).toBe("Isabelle Moreau invited you to Blindr");
    expect(m.preheader).toBe(ABOUT_LINES[0]);
    expect(m.buttonUrl).toBe(URL);
  });
  it("text carries the salutation, the inviter, the three lines and the link", () => {
    expect(m.text.startsWith("Hi Anna,")).toBe(true);
    expect(m.text).toContain("Isabelle Moreau invited you to Blindr.");
    for (const line of ABOUT_LINES) expect(m.text).toContain(line);
    expect(m.text).toContain(`Join Blindr: ${URL}`);
    expect(platformInviteEmail({ inviterName: "I", inviteeName: null, url: URL }).text.startsWith("Hi,")).toBe(true);
  });
  it("html carries the same, escaped, with the button", () => {
    const h = platformInviteEmail({ inviterName: "Tom & \"Jerry\" <x>", inviteeName: null, url: URL }).html;
    expect(h).toContain("Tom &amp; &quot;Jerry&quot; &lt;x&gt; invited you to Blindr");
    expect(h).toContain(`href="${URL}"`);
    expect(h).toContain(">Join Blindr<");
    for (const line of ABOUT_LINES) expect(h).toContain(line);
  });
  it("mailto", () => {
    const href = mailtoHref("anna@example.com", m);
    expect(href.startsWith("mailto:anna%40example.com?subject=")).toBe(true);
    expect(href).toContain(encodeURIComponent(m.subject));
    expect(href).toContain("%0D%0A");
    expect(mailtoHref(null, m).startsWith("mailto:?subject=")).toBe(true);
  });
  it("the dashboard variant uses Go placeholders and keeps a generic branch", () => {
    const t = supabaseInviteTemplateHtml();
    expect(t).toContain("{{ if .Data.platform_invite_code }}");
    expect(t).toContain("{{ .Data.platform_inviter_name }} invited you to Blindr");
    expect(t).toContain('href="{{ .ConfirmationURL }}"');
    expect(t).toContain("{{ else }}");
    expect(t).toContain("Accept the invite");
    expect(t.trim().endsWith("{{ end }}")).toBe(true);
    expect(SUPABASE_INVITE_SUBJECT).toBe("{{ if .Data.platform_inviter_name }}{{ .Data.platform_inviter_name }} invited you to Blindr{{ else }}You've been invited to Blindr{{ end }}");
  });
});
```

**Steps**
- [ ] Write the test; run it — fail: module missing.
- [ ] Implement with one internal `htmlBody(parts, { escape })` (refinement 9) and one `textBody`.
- [ ] Test green; tsc; eslint.

**Acceptance:** the test passes; `rg -n "#[0-9a-fA-F]{6}" src/lib/email/platform-invite.ts` shows only `#5C1A2B` and `#F5EFE3` (D18); `rg -n "server-only|from \"next|from \"react|process\.env" src/lib/email/platform-invite.ts` prints nothing.

**Closes:** D3 (the template), D17 (the derived variant), D18, §7 (template, mailto).

---

### PI-X1 — `platform_invites` and the two RPCs in the hand-written types

**Depends on:** —

**OWNS**
- modify `src/lib/supabase/database.types.ts`

**Does** (spec §4; D4, D9)
- Add `PlatformInviteState = "ok" | "expired" | "exhausted"` beside the other string unions.
- Add the table (every table needs `Relationships: []`) and the two functions:
```ts
platform_invites: {
  Row: { id: string; code: string; inviter_id: string; invitee_email: string | null; invitee_name: string | null;
         max_uses: number; uses: number; expires_at: string; created_at: string };
  Insert: { id?: string; code?: string; inviter_id: string; invitee_email?: string | null; invitee_name?: string | null;
            max_uses?: number; uses?: number; expires_at?: string; created_at?: string };
  Update: Partial<Database["public"]["Tables"]["platform_invites"]["Insert"]>;
  Relationships: [];
};
// Functions
get_platform_invite_preview: {
  Args: { p_code: string };
  Returns: { state: PlatformInviteState; inviter_name: string; inviter_avatar_url: string | null;
             inviter_id: string | null /* signed-in callers only */ }[];
};
accept_platform_invite: { Args: { p_code: string }; Returns: string };
```
- A comment on each names the migration (`20260918130500`) and the spec decision, in the file's existing style.

**Steps**
- [ ] Add; `npx tsc --noEmit` prints nothing.

**Acceptance:** `rg -n "platform_invites|get_platform_invite_preview|accept_platform_invite|PlatformInviteState" src/lib/supabase/database.types.ts` shows all four; tsc clean.

**Closes:** D4 (types), D9 (preview shape).

---

### PI-SQL1 — Migration `20260918130500_platform_invites` + probe (dry run only)

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260918130500_platform_invites.sql`
- create `.superpowers/invites/probes/20260918130500-platform-invites.mjs` (+ `.log`, `.out.json`, `20260918130500-live-defs.sql`; gitignored)

**Does** (spec §4; D4, D6, D7, D8, D9, D10; refinement 14)
- Dump live, read-only, into `20260918130500-live-defs.sql`: `pg_get_functiondef` and `md5(prosrc)` + `proacl` of `generate_join_code()`; `friendships`' constraints (`\d`-equivalent via `pg_constraint`); the absence of `platform_invites` and of both new function names; the `schema_migrations` row for `20260918130500` (must be absent). Confirm `git ls-tree -r --name-only origin/master supabase/migrations | rg 20260918` is empty (refetch first is the main session's job; report if not).
- Write the migration: a header in the M4 style (what is live, what this does, security reasoning), a pre-state `do $$` block (the live md5 and ACL of `generate_join_code`, no table, no functions, `friendships_user_id_friend_id_key`-style unique and the `<>` check present — use the live constraint names from the dump), then spec §4's SQL verbatim, then the post-state block of spec §4 with every check a `raise exception`.
- The probe: the synthetic-rollback pattern (`20260914093500-join-preview.mjs`): `pgConfig()` with `DB_PORT` 5432, `set local role` + `request.jwt.claims` impersonation (`as(who, body)`), scenario savepoints (`run`), an EXPECT table written before the first run, before-phase (live) and after-phase (fixtures on `demo.diego` / `demo.isabelle` / `demo.marcus` / `demo.priya` / `demo.sofia`, then the migration file applied in-transaction, then scenarios), both phases ROLLBACK, a final read-only pass showing nothing persisted. Fixtures (owner role, tagged `pi-sql1 probe 130500` in `invitee_name`): `inv_ok` (diego, defaults), `inv_expired` (diego, `created_at` 40 days ago, `expires_at` 10 days ago), `inv_full` (diego, `max_uses 1, uses 1`), `inv_named` (diego, `invitee_name 'Anna'`, `invitee_email 'anna@example.invalid'`); a pre-existing one-way row `priya → diego`.
- Scenarios (spec §11): preview as anon / signed-in / unknown / `' neb…'` padded lower-case (columns exactly four; `inviter_id` null for anon); inserts as isabelle (no `code` → a 10-character code matching `CODE_SHAPE`, `max_uses 50`, `uses 0`, `expires_at ≈ now()+30d`; with `code`/`uses`/`created_at` → `permission denied`; `inviter_id = diego` → RLS refusal; `max_uses 0` and `expires_at now()+2y` → check violations by name); isabelle's `update … set uses = 9` → permission denied; marcus reads diego's rows → 0; accept as anon → permission denied; as `service_role` → permission denied; as diego on `inv_ok` → own link (and on `inv_expired` still own link: D10 checks the inviter before expiry); as isabelle on `inv_expired` → expired; on `inv_full` → used up; as isabelle on `inv_ok` → both rows present, `uses` 1, returns diego; again → unchanged; as priya (one-way row exists) → `diego → priya` added, `uses` still 1; as sofia on `inv_full` after the owner sets `max_uses 2` → `uses` 2 then marcus → used up; the post-state block raises on a copy of the file with `grant execute … to authenticated` on accept flipped to `anon` (in its own savepoint).
- `node scripts/scratch-apply.mjs --file supabase/migrations/20260918130500_platform_invites.sql --mode dry` → `DRY-OK 20260918130500 platform_invites`.

**Interfaces — produces:** the two RPCs and the table exactly as spec §4 (PI-X1 types them; PI-D1 calls them).

**Tests — behavioural probe:** the scenario list above, every row matching its EXPECT.

**Steps**
- [ ] Dump; write the migration; write the probe's EXPECT; run the probe (`node --env-file=.env.local .superpowers/invites/probes/20260918130500-platform-invites.mjs`); fix until every row matches; `scratch-apply --mode dry`.
- [ ] Report the live-defs facts the migration pre-asserts (md5, ACL, constraint names) so the main session can re-check them just before `--mode live`.

**Acceptance:** `DRY-OK 20260918130500 platform_invites`; the probe's `.out.json` shows every row `match: true` in both phases and the final read-only pass unchanged; `rg -n "plan copy" supabase/migrations/20260918130500_platform_invites.sql` shows the five raise reasons.

**Closes:** §4 in full; D4, D6, D7, D8, D9, D10; §11 (probe scenarios).

---

## Track PI-D — Actions and the seam (wave 1)

### PI-D1 — Actions, the sender seam, the accept route

**Depends on:** PI-P1, PI-P2, PI-X1

**OWNS**
- create `src/lib/email/sender.ts`
- create `src/app/invite/actions.ts`
- create `src/app/invite/[code]/accept/route.ts`
- modify `.env.example`

**Does** (spec §2 D2–D3, D7, D10–D16; §3; refinements 3–7)
- `sender.ts` (`import "server-only"`): `emailProvider()` reads `PLATFORM_EMAIL_PROVIDER` (`"supabase"` default; anything else than `"resend"` is `"supabase"`). `sendPlatformInviteEmail(to, message, meta)`: `"resend"` → the stub result (D16, plan copy); `"supabase"` → `createAdminClient().auth.admin.inviteUserByEmail(to, { redirectTo: confirmHashRedirect(siteUrl, meta.code), data: { platform_invite_code, platform_inviter_name, ...(meta.inviteeName ? { display_name } : {}) } })`; any error → `{ ok: false, reason: "provider", message: error.message }` verbatim (D15). A file-top comment records D14 and what changes when Resend lands (D16).
- `actions.ts` (`"use server"`):
  - `createPlatformInvite({ inviteeName, inviteeEmail })` → `{ code, url, expiresAt, maxUses } | { error }`: requires a user (else `redirect("/login")`); trims, lower-cases the email, blanks → null, `inviteeName` ≤ 80 chars, a simple email shape check; inserts `{ inviter_id, invitee_name, invitee_email }` `.select("code, expires_at, max_uses").single()`; retries `23505` twice (refinement 5); `url = inviteUrl(siteUrl, code)`.
  - `sendPlatformInvite(code, email)` → `SendResult`: reads the caller's own row (`code, expires_at, uses, max_uses, invitee_name`) — none → `{ ok: false, reason: "provider", message: stateCopy("unknown", null).lines[0] }`; `inviteState` not `ok` → the matching state line; `profiles.email = email` hit → `existing-account` (D14, plan copy); otherwise the caller's `display_name` → `platformInviteEmail` → the sender.
  - `beginJoin(code, target: "signup" | "login")`: `normaliseCode`, `isCodeShape` (else `redirect(landingPath(code))`), the preview RPC must return `ok` (else `redirect(landingPath(code))`), set the intent cookie (refinement 3), `redirect(signupHref | loginHref)`.
  - `acceptInvite(code)` → `Promise<{ error: string }>`: no user → `redirect(loginHref(code))`; the RPC; error → `{ error: friendlyAcceptError(message) }`; success → `revalidatePath("/community")`, `revalidatePath(\`/u/${inviterId}\`)`, `redirect(\`/u/${inviterId}\`)`.
- `accept/route.ts` (GET): session? else `NextResponse.redirect(new URL(loginHref(code), request.url))`; cookie `INVITE_INTENT_COOKIE` equals `normaliseCode(code)`? else redirect to `landingPath(code)`; the RPC; on either outcome delete the cookie on the response; success → `/overview` (revalidate the two paths); refusal → `landingPath(code)`.
- `.env.example`: `# platform invite emails: "supabase" (Auth's invite mail, default) | "resend" (not wired up yet)` + `PLATFORM_EMAIL_PROVIDER=supabase`.

**Interfaces — produces**
```ts
// src/lib/email/sender.ts
export type EmailProvider = "supabase" | "resend";
export type SendResult = { ok: true } | { ok: false; reason: "existing-account" | "provider"; message: string };
export function emailProvider(): EmailProvider;
export function sendPlatformInviteEmail(to: string, message: PlatformInviteMessage, meta: { code: string; inviterName: string; inviteeName: string | null }): Promise<SendResult>;

// src/app/invite/actions.ts
export type CreatedInvite = { code: string; url: string; expiresAt: string; maxUses: number };
export function createPlatformInvite(input: { inviteeName: string; inviteeEmail: string }): Promise<CreatedInvite | { error: string }>;
export function sendPlatformInvite(code: string, email: string): Promise<SendResult>;
export function beginJoin(code: string, target: "signup" | "login"): Promise<void>; // form action; redirects
export function acceptInvite(code: string): Promise<{ error: string }>;             // redirects on success
```

**Tests:** none as unit tests (every function touches the session or the database); PI-V3 exercises each path. `friendlyAcceptError` stays a private function mirroring `/j`'s.

**Steps**
- [ ] Read `node_modules/next/dist/docs/` on route handlers, `cookies()` in server actions and route handlers, and `redirect()`.
- [ ] `sender.ts`; `actions.ts`; `route.ts`; `.env.example`.
- [ ] tsc; eslint.

**Acceptance:** `rg -n "createAdminClient" src --glob '!src/app/tastings/**'` prints only `src/lib/supabase/admin.ts` and `src/lib/email/sender.ts`; `rg -n "invitee_email" src --glob '!src/lib/supabase/database.types.ts'` prints only lines in `src/app/invite/actions.ts`; `rg -n "accept_platform_invite" src` prints only `actions.ts`, `accept/route.ts` and the types; `rg -n "next=" src/app/invite` prints nothing (every `next` comes from `links.ts`); `rg -n "PLATFORM_EMAIL_PROVIDER" .env.example src/lib/email/sender.ts` shows both.

**Closes:** D2 (the actions behind the screen), D3 (the sender), D7 (retry), D10–D16, §3 (the accept route), refinements 3–7.

---

## Track PI-U — UI (wave 2, parallel)

### PI-U1 — The landing page `/invite/[code]`

**Depends on:** PI-D1

**OWNS**
- create `src/app/invite/[code]/invite-route.ts`, `src/app/invite/[code]/invite-route.test.ts`
- create `src/app/invite/[code]/page.tsx`, `src/app/invite/[code]/invite-landing.tsx`

**Does** (spec §5; D1, D9, D11b, D12, D19; refinements 11–12)
- `invite-route.ts`: pure `inviteView`.
- `page.tsx` (server): `params`, `createClient`, `getUser`, `rpc("get_platform_invite_preview", { p_code: code })`, `view = inviteView({ state: row?.state ?? "unknown", signedIn: !!user, isInviter: !!user && row?.inviter_id === user.id })`; renders `Wordmark` + `InviteLanding`. Nothing else is fetched (D9: no counts, no name).
- `invite-landing.tsx` (client, for the accept button's transition and the two forms): the `Card` of spec §5 per view; `join` → two `<form action={beginJoin.bind(null, code, "signup" | "login")}>` submits; `add-friend` → `acceptInvite(code)` in `useTransition`, error inline; `own-link`, `expired`, `exhausted`, `unknown` → the message card. All strings from `copy.ts`; "Not now", "Couldn't open that invite" (plan copy) inline with their marker.

**Interfaces — produces**
```ts
export type InviteView = "unknown" | "expired" | "exhausted" | "own-link" | "join" | "add-friend";
export function inviteView(input: { state: InviteState; signedIn: boolean; isInviter: boolean }): InviteView;
```

**Tests (write first)** — `src/app/invite/[code]/invite-route.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { inviteView } from "./invite-route";

describe("inviteView (spec D19)", () => {
  it.each([
    [{ state: "unknown", signedIn: false, isInviter: false }, "unknown"],
    [{ state: "unknown", signedIn: true, isInviter: false }, "unknown"],
    [{ state: "expired", signedIn: true, isInviter: true }, "expired"],   // the state beats own-link
    [{ state: "exhausted", signedIn: false, isInviter: false }, "exhausted"],
    [{ state: "ok", signedIn: true, isInviter: true }, "own-link"],
    [{ state: "ok", signedIn: false, isInviter: false }, "join"],
    [{ state: "ok", signedIn: true, isInviter: false }, "add-friend"],
    [{ state: "ok", signedIn: false, isInviter: true }, "join"],          // isInviter is meaningless signed out
  ] as const)("%j → %s", (input, view) => expect(inviteView(input)).toBe(view));
});
```

**Steps**
- [ ] Test first; implement `invite-route.ts`; green.
- [ ] `page.tsx`, `invite-landing.tsx`; tsc; eslint.

**Acceptance:** the test passes; `rg -n "invitee_email|invitee_name|uses|max_uses" "src/app/invite/[code]/page.tsx" "src/app/invite/[code]/invite-landing.tsx"` prints nothing; `rg -n "#[0-9a-fA-F]{6}\b|window\.confirm" "src/app/invite/[code]"` prints nothing.

**Closes:** §5; D1 (landing), D11b, D12 (the two forms), D19; refinements 11–12.

---

### PI-U2 — The inviter's dialog and the Community / profile entry points

**Depends on:** PI-D1

**OWNS**
- create `src/components/invite/invite-people-button.tsx`, `src/components/invite/invite-people-dialog.tsx`
- modify `src/app/community/page.tsx`, `src/app/u/[id]/page.tsx`

**Does** (spec §6; D2, D8, D14, D15, D20; refinements 8, 13)
- `InvitePeopleDialog` (client): step 1 (two controlled `Input`s + `Label`s, "Make a link", the action's error inline), step 2 (the link, the four controls, the result line, the footer line via `LocalDateTime` + `footerLine`). "Share" only when `canShare` (refinement 8); "Send by email" reveals a controlled email field when step 1 had none; the `SendResult.message` rendered verbatim; "Open in my mail app" = `<a href={mailtoHref(email || null, platformInviteEmail({ inviterName, inviteeName, url }))}>` — `inviterName` comes from the entry point as a prop (`me.display_name`, already fetched by both pages).
- `InvitePeopleButton({ inviterName })`: "Invite someone", opens the dialog; resets it on close.
- `/community`: the button in `PageHeader`'s `actions` before the `Tabs`. `/u/[id]`: when `isOwnProfile`, beside "Edit profile".

**Steps**
- [ ] Build the dialog against `createPlatformInvite` / `sendPlatformInvite`; wire both pages; tsc; eslint.

**Acceptance:** `rg -n "InvitePeopleButton" src/app/community/page.tsx "src/app/u/[id]/page.tsx"` shows both; `rg -n "defaultValue" src/components/invite` prints nothing (controlled); `rg -n "navigator\.share" src/components/invite/invite-people-dialog.tsx` is inside a `useEffect`-gated branch (inspect); `rg -n "#[0-9a-fA-F]{6}\b|window\.confirm" src/components/invite` prints nothing; `rg -n "plan copy" src/components/invite` lists the step-1 labels, "Making a link…", "Sending…", "Sent to".

**Closes:** §6; D2, D8 (footer), D15 (verbatim message), D20; refinements 8, 13.

---

## Track PI-DOC — Docs (wave 2)

### PI-DOC1 — The dashboard template doc (pinned) and the CLAUDE.md lines

**Depends on:** PI-P2, PI-SQL1

**OWNS**
- create `docs/email/supabase-invite-template.md`
- create `src/lib/email/supabase-template-doc.test.ts`
- modify `CLAUDE.md`

**Does** (D17; refinement 10)
- The doc: where to paste (Supabase dashboard → Authentication → Email Templates → "Invite user"), the subject in a fenced `text` block (= `SUPABASE_INVITE_SUBJECT`), the body in a fenced `html` block (= `supabaseInviteTemplateHtml()`), the note that the same template serves tasting invites (the `else` branch), the redirect-URL allow-list line (`${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash*`), the built-in SMTP hourly cap and that the UI shows its message verbatim, and how to regenerate (run the test; the module is the source).
- The pin test: reads the doc with `node:fs`, extracts the two fenced blocks, `expect(html).toBe(supabaseInviteTemplateHtml())`, `expect(subject).toBe(SUPABASE_INVITE_SUBJECT)`.
- CLAUDE.md: one bullet after the Friends bullet — the link shape and code source, the intent cookie rule (D12), "invitee_email never leaves `src/app/invite/actions.ts`", the preview/accept RPCs and their EXECUTE, the sender seam and `PLATFORM_EMAIL_PROVIDER`, the shared dashboard template and its doc, the D14 existing-account limit.

**Tests (write first)** — `src/lib/email/supabase-template-doc.test.ts` (fails first because the doc file is missing).

**Steps**
- [ ] Test; doc; CLAUDE.md; `npx vitest run src/lib/email`.

**Acceptance:** the pin test passes; `rg -n "platform invites|platform_invites" CLAUDE.md` matches.

**Closes:** D17; §7 (dashboard); the CLAUDE.md line item of the owner's brief.

---

## Track PI-V — Integration gate, review, verification

### PI-V1 — Integration gate

**Depends on:** every PI task above

**OWNS:** none (read-only; reports in the session)

**Steps**
- [ ] Run, capturing each exit code: `npx tsc --noEmit`; `npm run lint -- --max-warnings=0`; `npm test` (the five new test files — `copy`, `links`, `platform-invite`, `invite-route`, `supabase-template-doc` — appear and pass); `node --test scripts/wine-map-tiles/lib.test.mjs`; `npm run build`.
- [ ] Grep gates. Each prints nothing unless stated:
  1. **Email privacy:** `rg -n "invitee_email" src --glob '!src/lib/supabase/database.types.ts' --glob '!src/app/invite/actions.ts'`
  2. **Service role in the seam only:** `rg -n "createAdminClient|SUPABASE_SERVICE_ROLE_KEY" src --glob '!src/lib/supabase/admin.ts' --glob '!src/lib/email/sender.ts' --glob '!src/app/tastings/**'`
  3. **One accept caller pair:** `rg -ln "accept_platform_invite" src` prints exactly `src/app/invite/actions.ts`, `src/app/invite/[code]/accept/route.ts`, `src/lib/supabase/database.types.ts`.
  4. **Every `next` from links.ts:** `rg -n "next=" src/app/invite src/components/invite`
  5. **Hex only in the email module:** `rg -n "#[0-9a-fA-F]{6}\b" src/app/invite src/components/invite src/lib/invites src/lib/email --glob '!src/lib/email/platform-invite.ts'`
  6. **No `window.confirm`, no uncontrolled inputs:** `rg -n "window\.confirm\(|defaultValue" src/app/invite src/components/invite`
  7. **Pure-module imports** (every hit an `import type`, inspect): `rg -n 'from "@/' src/lib/invites src/lib/email/platform-invite.ts "src/app/invite/[code]/invite-route.ts"`; and `rg -n "server-only|from \"next|from \"react|process\.env" src/lib/invites src/lib/email/platform-invite.ts "src/app/invite/[code]/invite-route.ts"`
  8. **The three lines typed once:** `rg -c "Taste with structure, challenge yourself blind" src` shows `src/lib/invites/copy.ts` and `src/app/about/page.tsx` (and the copy test) only.
  9. **Migration present and alone:** `ls supabase/migrations | rg "^20260918"` prints only `20260918130500_platform_invites.sql`; `git ls-tree -r --name-only origin/master supabase/migrations | rg "^supabase/migrations/20260918"` is empty or names that same file.
  10. **Plan copy marked:** `rg -n "plan copy" src/lib/invites src/lib/email src/app/invite src/components/invite supabase/migrations/20260918130500_platform_invites.sql` — every string in the Plan copy table appears with its comment (inspect).
  11. **Nothing unchanged-on-purpose touched:** `git log --format=%H --grep='^feat(invites)' | xargs -I{} git show --stat --format= {} -- src/app/j src/app/signup src/app/login src/app/auth src/lib/safe-next.ts src/lib/supabase/admin.ts src/app/tastings src/app/friends src/components/friend-button.tsx src/proxy.ts package-lock.json` prints nothing.
- [ ] List every failure as a PI-V2/V3 item, naming its owning task.

**Acceptance:** every command green, or its failures listed with owners.

### PI-V2 — Adversarial review

**Depends on:** PI-V1

**OWNS:** none (read-only)

Four reviewers in parallel; each gets the spec, CLAUDE.md, AGENTS.md, this plan and the `feat(invites)` diffs limited to its scope, and reports `{ file:line, severity, claim broken, reproduction, owning task }`.

1. **Privacy and RLS (D7–D10, D14).** The preview's four columns and nothing more; `invitee_email` never in an RPC, prop, page, log or mail body; column-limited INSERT (no client-chosen code); no UPDATE/DELETE for clients; accept idempotent and use-counting per D10; EXECUTE exactly as §4; the `existing-account` message reveals nothing beyond what `inviteToTasting` already does.
2. **Auth flow and redirects (D11–D13, D22).** signup → `/auth/callback?next` → accept; login → accept; email → confirm-hash → accept; the intent cookie's attributes and lifetime; no accept without it; `safeNext` on every `next`; no open redirect from `request.url`; `proxy.ts` untouched; the accept route deletes the cookie on every branch.
3. **Copy and the D-ledger.** The owner's eight strings and the three lines verbatim; the Plan copy table complete and nothing invented beyond it; the dashboard doc equals the module (the pin test); the `else` branch reads sensibly for a tasting invite; D15's verbatim message; D21's non-goals not built.
4. **Cross-cutting.** Controlled inputs; tokens only (D18's exception); 44 px on every phone control (both forms' submits, the dialog's four controls, the entry button); light and dark; "Share" hidden without `navigator.share` and no hydration mismatch; pure modules load in vitest; `Button render={<Link/>}` with `nativeButton={false}`; the Next 16 route-handler and cookie APIs used as the docs describe.

**Output:** one consolidated list; the main session accepts or rejects each finding, groups the accepted ones by file, runs one fix agent per disjoint group (a failing test first for a pure module), re-runs PI-V1 until green, and commits each group.

### PI-V3 — Live apply, dashboard paste and browser check (main session)

**Depends on:** PI-V2 (fixes committed, PI-V1 green)

**OWNS:** none in the repo (fixtures are live rows the session creates and deletes; the probe's `.superpowers/invites/` outputs)

**Live apply (before any push containing PI-D1/U1/U2)**
- [ ] `git fetch`; confirm `origin/master` holds no `20260918130500` file (or exactly ours); re-run the probe (both phases match); `node scripts/scratch-apply.mjs --file supabase/migrations/20260918130500_platform_invites.sql --mode live` → `LIVE-APPLIED 20260918130500 platform_invites`; a read-only check that the table, the two functions and the grants exist as §4 states.
- [ ] Supabase dashboard: paste `docs/email/supabase-invite-template.md`'s subject and body into "Invite user" (first copy the live text into the session scratchpad and compare with the doc's `else` branch — adjust the doc's generic branch if the live wording is better, re-run the pin test, commit); confirm the redirect allow-list admits `${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash*`.

**Setup**
- The integrate worktree's dev server against the live database; `LABEL_READ_FIXTURE` set; the Browser pane visible. Two viewports for every check — the `mobile` preset (375×812) and a 1280 px desktop — and both themes. No horizontal overflow at 375 px; every phone control ≥ 44 px.
- Sessions via `.superpowers/demo-session.mjs` (`demo.diego` as the inviter; `demo.marcus` as an existing-account invitee; `demo.priya` for the one-way-row case after a service-role insert `priya → diego`).

**Checks** (screenshot each)
- [ ] **Entry points:** "Invite someone" on `/community` (beside the tabs) and on diego's own `/u/<diego>` (beside "Edit profile"); absent on another person's profile.
- [ ] **Dialog step 1 → 2:** name "Anna", no email → "Make a link" → the link `…/invite/<10 chars>`; footer "Works until {30 days} · up to 50 people"; "Copy link" → "Copied"; "Share" absent in the desktop pane (no `navigator.share`), present in the phone emulation only if the pane exposes `navigator.share` (note which); "Send by email" reveals the email field.
- [ ] **Send, existing account:** `demo.marcus@blindr.invalid` → the D14 line verbatim, the mailto link still there (its `href` carries the subject and the three lines).
- [ ] **Send, real address (one send only — the built-in SMTP cap):** the owner's own second mailbox → "Sent to {email}"; the mail arrives with the subject "Diego Fernandez invited you to Blindr", the three lines and the button; its link opens `/auth/confirm-hash?next=/invite/<code>/accept` → signed in → (no intent cookie in this browser) `/invite/<code>` → "Add Diego Fernandez as a friend" → `/u/<diego>` with "Remove friend"; a read-only SQL check shows both friendship rows and `uses = 1`. Then a second send to the same address → the provider's message verbatim (an existing account now — D14's line).
- [ ] **Landing, signed out** (a private window or a signed-out pane): eyebrow, avatar, "Diego Fernandez invited you to Blindr", the three lines, "Join Blindr", "Already have an account? Sign in"; "Join Blindr" → `/signup?next=/invite/<code>/accept` with the intent cookie set (DevTools → Application); complete the signup with a throwaway real mailbox → the confirmation link → `/auth/callback` → `/invite/<code>/accept` → `/overview`; friendship both ways; `uses` +1; the cookie gone.
- [ ] **Landing, signed in as marcus:** "Add Diego Fernandez as a friend" → `/u/<diego>`; both rows; re-opening the link shows the button again and a second tap changes nothing (`uses` unchanged).
- [ ] **Landing, priya (one-way row seeded):** accept → the reverse row appears, `uses` unchanged.
- [ ] **Own link as diego:** "This is your own invite link." / "Share it with someone who is not on Blindr yet."
- [ ] **Expired / used up / unknown:** service-role updates on two throwaway rows (`expires_at` past; `uses = max_uses`) → each state's copy with "Ask Diego Fernandez for a new one."; `/invite/NOTACODE00` → "Couldn't open that invite" + the unknown line; lower-case/padded code in the URL still resolves.
- [ ] **Crafted accept link:** signed in as marcus (friendship rows deleted first), open `/invite/<code>/accept` directly → lands on `/invite/<code>` with the button, no rows written (D12).
- [ ] **Rate limit surface:** if the SMTP cap is hit during the session, the dialog shows Supabase's message verbatim under the button.
- [ ] **Cleanup:** delete the throwaway invites, the test friendships, the signup account (auth admin) and note each in the report.

**Failures:** each becomes a fix in the owning task's files through the PI-V2 procedure; re-run the affected check.

**Report:** pass/fail per check with screenshots, the live-apply output, the dashboard's previous template text, the Plan copy table, refinements 1–14, and any spec item that could not be built as written.

---

## Appendix A — Spec sections and decisions → tasks

| Spec | Tasks |
|---|---|
| D1 landing, link, entry points | PI-P1, PI-U1, PI-U2 |
| D2 inviter's screen | PI-U2, PI-D1 |
| D3 template, sender, mailto, seam | PI-P2, PI-D1, PI-DOC1 |
| D4 migration, RLS, RPCs, probe, types | PI-SQL1, PI-X1 |
| D5 tests | PI-P1, PI-P2, PI-U1, PI-DOC1 |
| D6 version | PI-SQL1, PI-V1 gate 9 |
| D7–D8 code default, bounds | PI-SQL1, PI-D1 (retry) |
| D9 preview shape | PI-SQL1, PI-X1, PI-U1 |
| D10 accept rules | PI-SQL1, PI-D1 (`friendlyAcceptError`) |
| D11–D13 accept paths, intent cookie, email redirect | PI-P1 (`links.ts`), PI-D1, PI-U1 |
| D14–D16 sender rules and seam | PI-D1, PI-U2 |
| D17 dashboard template | PI-P2, PI-DOC1, PI-V3 |
| D18 hex exception | PI-P2, PI-V1 gate 5 |
| D19 views | PI-U1 |
| D20 entry points | PI-U2 |
| D21–D22 non-goals, proxy | Global Constraints "Never build"; PI-V1 gate 11 |
| §4 | PI-SQL1 |
| §5 | PI-U1 |
| §6 | PI-U2 |
| §7 | PI-P2, PI-D1, PI-DOC1 |
| §8 | PI-P1; the Plan copy table |
| §11 | PI-SQL1 (probe), PI-V1, PI-V2, PI-V3 |

## Appendix B — What this plan could not settle from the brief

- **The email's redirect lands on `/invite/<code>/accept`, not `/invite/<code>`** (D13): the owner wrote the landing path; the plan adds the accept segment so signup and email share one first-sign-in route. In a different browser the emailed invitee still taps once on the landing page (no intent cookie). Say if the extra segment is unwanted.
- **The live "Invite user" dashboard template's current text is unknown to this session**; the `else` branch in the Plan copy table is Supabase's default wording. PI-V3 compares before pasting.
- **Go-template conditionals in the dashboard subject field** are expected to work (GoTrue parses subjects as templates); PI-V3 confirms in the dashboard preview and falls back to the plain "You've been invited to Blindr" subject if not.
- **An email-invited account has no password** — the existing tasting-invite gap (`/auth/set-password` is unlinked). Not widened here; a follow-up can send the accept route to `/auth/set-password?next=/overview` once that page honours `next`.
- **`schema_migrations` is only checked by the probe and `scratch-apply`** — this session did not read the live database; D6's version is free on `origin/master` and in the folder.
