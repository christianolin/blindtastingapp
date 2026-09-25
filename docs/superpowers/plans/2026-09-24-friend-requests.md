# Friend Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-way "Add friend" with mutual friendships that need the other person's yes: a `friend_requests` table, five SECURITY DEFINER RPCs, request states on every friend button, a Requests pill on /community, requests in the header bell, and a two-step live rollout that ends with every `friendships` row in a pair.

**Architecture:** Migration 1 (`20260925003000_friend_requests.sql`) is purely additive: the table, its read-own RLS, the deleted-profile guard, the five RPCs, and `accept_platform_invite` / `scrub_deleted_account` recreated with one line each. The app then moves every friend write onto the RPCs and derives each surface's control from one pure `relationship()` value. Migration 2 (`20260925004000_friend_requests_lockdown.sql`), applied only after that app is live, turns the 16 one-way rows into pending requests and revokes client writes on `friendships`. `can_view_cellar` is untouched: once rows come in pairs, "a row in either direction" means "friends".

**Tech Stack:** Next.js 16 App Router (server components, `"use server"` actions, `revalidatePath`), React 19, TypeScript, Supabase Postgres (RLS, SECURITY DEFINER plpgsql), `@supabase/ssr`, Tailwind + shadcn/ui on `@base-ui/react`, vitest 3 (node env, pure modules only), `node:test` + `pg` for the database suite.

**Spec:** `docs/superpowers/specs/2026-09-24-friend-requests-design.md`

## Global Constraints

- Work only in the worktree `C:\Users\Public\repos\blindtastingapp-friends`, branch `friend-requests`. Start EVERY shell command with `cd /c/Users/Public/repos/blindtastingapp-friends && ...`: the shell's working directory resets after each call. Never touch `C:\Users\Public\repos\blindtastingapp` (the owner's checkout).
- Production is live (Vercel, daily users). No implementer task connects to a database. Every live-database step (dry runs included), every push and every smoke test is in Tasks 13 and 14, which the main session runs itself.
- `scripts/apply-migration.mjs` is an untracked file the main session keeps in this worktree. Never commit it. Never use `git add -A`, `git add .` or `git commit -a`: add exactly the files your task names.
- Commit with the repository identity: prefix every `git commit` with `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com` and end every message with `-m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"` (use the Co-Authored-By line your own session's attribution instructions name, if they name a different one).
- Create and change files with the Write and Edit tools only, never with shell heredocs or `sed -i`: in this environment the Bash tool delivers `\\` as `\`, so file text sent through a heredoc loses backslashes, and the SQL and the regexes below contain them. `sed -i` also rewrites a CRLF file's line endings.
- Line endings: this checkout has `core.autocrlf=true`, so existing files are CRLF on disk. Write/Edit handle that; git stores LF. Every test here that reads a file strips `\r` first, and every md5 check in the SQL strips `chr(13)`.
- A `"use server"` file exports only async functions: not a type, not a constant, not a re-export (CLAUDE.md). The friend types live in `src/lib/friends/types.ts`, the bell's in `src/lib/notification-items.ts`, and both are imported with `import type` or plain imports.
- `src/lib/supabase/database.types.ts` is hand-written. Every table needs `Row`/`Insert`/`Update` and `Relationships: []`, and every RPC an entry in `Functions`. It changes in the same commit as the migration that needs it.
- Never edit an applied migration file. New SQL goes only into the two new files.
- Copy (spec §4), exact characters. New strings: "Requested" · "Tap again to cancel" · "Accept" · "Decline" · "Sending…" · "Cancelling…" · "Accepting…" · "Declining…" · "Requests" (the pill, and "Requests N" when N > 0) · "No requests right now." · "{Name} wants to be friends" · the Friends empty body "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept." Kept: "Add friend", "Friends", "Tap again to remove", "Removing…". The ellipsis is the single character `…` (U+2026), and the apostrophes are straight `'`.
- Two strings this plan adds that spec §4 does not list (flagged for the owner in Task 13): the delete-account item "Your friends list, friend requests and invite links" (spec §5 asks for "friend requests" there), and the database refusal "you cannot be your own friend" (spec §2.3 gives the code 22023 and no text; no screen can trigger it). A Requests search that matches nobody reuses the existing "Nobody matches “x”". Add no other user-visible string.
- Tests: `npx vitest run <path>` for one file, `npx vitest run` for all (178 files / 3,653 tests pass at the base commit). Types: `npx tsc --noEmit`. Lint: `npx eslint <files>`. The database suite (`scripts/*.test.mjs`) connects to production and is run by the main session only.
- No Anthropic API calls anywhere in this work (AGENTS.md cost rules).
- This is Next.js 16. Before using an API you have not seen in this repo, read its page under `node_modules/next/dist/docs/` (for example `01-app/03-api-reference/04-functions/revalidatePath.md`).

## Review Focus

- **Two people tap "Add friend" on each other at about the same moment.** Expected: they end as friends, with no pair of crossed pending requests left behind and no error on either screen. The RPCs take a per-pair advisory lock. Pinned in Task 3 ("asking someone who already asked you makes you friends at once" covers the `'accepted'` path and one accept clearing two crossed rows) and Task 13 Step 9 (the stale-page tap).
- **A stale screen.** The request was cancelled, or already answered in another tab, before you tap Accept or Decline; or you tap "Add friend" on someone who asked you after your page loaded. Expected: a refused Accept shows "no request to accept" under the buttons and never crashes, and the stale "Add friend" lands on "Friends". Pinned in Task 3 (the refusals test) and Task 13 Step 9.
- **A bell poll that left before an inline Accept/Decline landed.** Expected: the answered row does not come back. Pinned in Task 9 (`visibleNotifications` keeps an answered requester hidden for `SETTLED_HIDE_MS`) and wired in Task 10.
- **An account deleted while a request is pending, either side.** Expected: its requests vanish (the scrub), no new request or friendship can name it, and neither the bell nor the Requests pill lists a deleted requester. Pinned in Task 3 (the deleted-account and account-deletion tests). The reads in Tasks 8 and 10 keep `.is("deleted_at", null)`.
- **The rollout window.** Legacy one-way rows exist between the app deploy and migration 2, including a person who was added one-way and has since asked back through the new app. Expected: migration 2 moves every one-way row without error, keeps its date, and one Accept then settles both crossed requests. Pinned in Task 3 ("20260925004000 turns one-way rows into requests and keeps pairs", run in Task 13's dry run and again in Task 14's).

---

## File Structure

New:
- `supabase/migrations/20260925003000_friend_requests.sql`: migration 1 (additive).
- `supabase/migrations/20260925004000_friend_requests_lockdown.sql`: migration 2 (data move + lockdown).
- `src/lib/friends/friend-requests-migration.test.ts`: pins both migrations' text (function-body md5s, the "one addition" rule, grants, order).
- `scripts/friend-requests.test.mjs`: the live database suite (rolled back; main session only).
- `src/lib/friends/types.ts`: `FriendResult`, `SendOutcome`, `SendFriendResult`.
- `src/lib/friends/relationship.ts` (+ `.test.ts`): `Relationship`, `relationship()`, `sendOutcome()`.
- `src/lib/notification-items.ts` (+ `.test.ts`): the bell's `PendingNotification` union and pure list rules.

Modified:
- `src/lib/supabase/database.types.ts`: `friend_requests`, five `Functions` entries.
- `scripts/cellar-social.test.mjs`: its one-way friendship becomes a pair.
- `src/lib/community/community-math.ts` (+ test): `friendButtonLabel`, Friends empty body, the Requests view (`CommunityView`, parse/href, `filterLabel`, `emptyCopy`, `communityPageLine`, `orderByIds`).
- `src/app/friends/actions.ts`: five actions over the RPCs; `addFriend` retired.
- `src/components/friend-button.tsx`: the four relationship states.
- `src/app/community/community-list.tsx`, `src/app/community/page.tsx`: relationship per row; the Requests pill.
- `src/app/u/[id]/page.tsx`: reads the relationship both ways.
- `src/lib/notifications.ts`, `src/components/notifications-bell.tsx`, `src/components/app-header.tsx`: friend requests in the bell.
- `src/lib/account/delete-copy.ts` (+ test).
- `CLAUDE.md`.

Deliberately unchanged, and confirmed in Task 6 Step 3: the tasting-invite friend pickers (`src/app/tastings/new/page.tsx`, `src/components/new-tasting-sheet.tsx`, `src/app/tastings/[id]/settings-actions.ts`) and the cellar lot sheet's "by friends" line (`src/lib/cellar/lot-sheet.ts`). Each reads the viewer's own `friendships` rows, which from migration 2 are accepted friends only (spec §3.7). The platform-invite UI and `src/lib/invites/copy.ts` are unchanged too: only the RPC changes (spec §3.8). `invite-route.test.ts` and `copy.test.ts` need no edit.

## Interface Contracts (shared across tasks)

```ts
// src/lib/friends/types.ts                                         (Task 4)
export type FriendResult = { error: string } | { ok: true };
export type SendOutcome = "requested" | "accepted" | "friends";
export type SendFriendResult = { error: string } | { ok: true; outcome: SendOutcome };

// src/lib/friends/relationship.ts                                  (Task 4)
export type Relationship = "none" | "requested" | "incoming" | "friends";
export function relationship(input: { friend: boolean; outgoing: boolean; incoming: boolean }): Relationship;
export function sendOutcome(value: unknown): SendOutcome;

// src/lib/community/community-math.ts                              (Tasks 5, 8)
export function friendButtonLabel(s: {
  relationship: "none" | "requested" | "incoming" | "friends";
  pending: boolean; armed: boolean; control?: "accept" | "decline";
}): string;
export type CommunityView = "everyone" | "friends" | "requests";             // Task 8
export function communityPageLine(page: number, per: number, total: number, sort: CommunitySort | null): string; // Task 8
export function orderByIds<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[];            // Task 8
export function filterLabel(view: CommunityView, count: number): string;    // "Requests" / "Requests 3"
export function emptyCopy(view: CommunityView, q: string, counts: { friends: number; requests: number }):
  { title: string; body: string | null; actions: ("clear" | "everyone" | "invite")[] };                          // Task 8

// src/app/friends/actions.ts ("use server")                        (Task 6)
export async function sendFriendRequest(to: string): Promise<SendFriendResult>;
export async function cancelFriendRequest(to: string): Promise<FriendResult>;
export async function acceptFriendRequest(from: string): Promise<FriendResult>;
export async function declineFriendRequest(from: string): Promise<FriendResult>;
export async function removeFriend(other: string): Promise<FriendResult>;

// src/components/friend-button.tsx                                 (Task 7)
export function FriendButton(props: {
  personId: string; relationship: Relationship; variant?: "row" | "header";
  className?: string; onDone?: () => void;
}): JSX.Element;

// src/lib/notification-items.ts                                    (Task 9)
export type TastingInviteNotification = { kind: "tasting"; tastingId: string; tastingName: string; hostName: string };
export type FriendRequestNotification = { kind: "friend"; requesterId: string; requesterName: string; avatarUrl: string | null; createdAt: string };
export type PendingNotification = TastingInviteNotification | FriendRequestNotification;
export function mergeNotifications(tastings: readonly TastingInviteNotification[], friends: readonly FriendRequestNotification[]): PendingNotification[];
export function friendRequestLine(name: string): string;
export function notificationKey(n: PendingNotification): string;
export function withoutFriendRequest(list: readonly PendingNotification[], requesterId: string): PendingNotification[];
export const SETTLED_HIDE_MS = 60_000;
export function visibleNotifications(list: readonly PendingNotification[], settled: ReadonlyMap<string, number>, nowMs: number): PendingNotification[];

// src/lib/notifications.ts ("use server")                          (Task 10)
export async function getPendingInvites(): Promise<PendingNotification[]>;
// src/components/notifications-bell.tsx: prop renamed `invites` -> `notifications: PendingNotification[]`
```

SQL (Task 1), all `security definer`, `set search_path = public`, plpgsql, EXECUTE for `authenticated` only:

```sql
send_friend_request(p_to uuid) returns text        -- 'requested' | 'accepted' | 'friends'
cancel_friend_request(p_to uuid) returns void
accept_friend_request(p_from uuid) returns void    -- 42501 'no request to accept'
decline_friend_request(p_from uuid) returns void
remove_friend(p_other uuid) returns void
-- every one: 42501 'not signed in'; 22023 'you cannot be your own friend' (self or null);
--            42501 'that account has been deleted'
```

---

## Phase 1: database (no live effect; nothing here is applied by an implementer)

### Task 1: Migration 1, `friend_requests` and the five RPCs, with its types

**Files:**
- Create: `supabase/migrations/20260925003000_friend_requests.sql`
- Create: `src/lib/friends/friend-requests-migration.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (after the `friendships` entry, about line 403; the `accept_platform_invite` entry, about line 2114)

**Interfaces:**
- Consumes: the migrations `20260918130500_platform_invites.sql` and `20260919101300_account_deletion.sql`, read (never edited) by the test.
- Produces: the SQL objects in the Interface Contracts, the `friend_requests` table type, and five `Functions` entries (`send_friend_request` returns `string`; the other four return `undefined`). The body md5s pinned here are what Task 2's pre-state and test re-check:
  `send_friend_request 8efbf4536f08f335934d517ca5007238`, `cancel_friend_request 55dc3b3361bb035bdd9ad2a95d70e13d`, `accept_friend_request 8c473e36e07123e4a4ab2ee5b211b454`, `decline_friend_request a7bac3015636524f65fd3c27155a3398`, `remove_friend 1e1a84871e2e2c68ef899b845bc96506`, `accept_platform_invite 9b3e4a89a84d2eb482c312eba87c4d37`, `scrub_deleted_account 5a08d60e3af617b6368d3a85cbe05f94`, `refuse_deleted_profile_link d78758de09e1e9f49e0d6b5f288650df`.

Do not run this SQL anywhere. The main session dry-runs and applies it in Task 13. Your check is the text test below. It pins every function body by md5, the same md5 the migration's own post-state asserts against the live database, so a single changed character in a body fails here first. Copy the SQL exactly.

- [ ] **Step 1: Write the failing test.**

Create `src/lib/friends/friend-requests-migration.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pins the friend-request migrations (spec
// docs/superpowers/specs/2026-09-24-friend-requests-design.md §2) to what the
// plan reviewed: every function body's md5, the same md5 the migration's own
// post-state asserts against the database (md5 of prosrc with any CR
// stripped), and the "one addition" rule for the three functions recreated
// from earlier migrations. Normalised so a CRLF checkout (Windows autocrlf)
// reads the same text.

const M1 = "supabase/migrations/20260925003000_friend_requests.sql";
const PLATFORM_INVITES = "supabase/migrations/20260918130500_platform_invites.sql";
const ACCOUNT_DELETION = "supabase/migrations/20260919101300_account_deletion.sql";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r/g, "");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");

/** What Postgres stores as prosrc: the text between `as $$` and the closing `$$`. */
function body(sql: string, name: string): string {
  const at = sql.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`));
  if (at < 0) throw new Error(`no function ${name}`);
  const open = sql.indexOf(" as $$", at) + " as $$".length;
  return sql.slice(open, sql.indexOf("$$", open));
}

const FIVE = [
  "send_friend_request",
  "cancel_friend_request",
  "accept_friend_request",
  "decline_friend_request",
  "remove_friend",
] as const;

const PINS: Record<string, string> = {
  send_friend_request: "8efbf4536f08f335934d517ca5007238",
  cancel_friend_request: "55dc3b3361bb035bdd9ad2a95d70e13d",
  accept_friend_request: "8c473e36e07123e4a4ab2ee5b211b454",
  decline_friend_request: "a7bac3015636524f65fd3c27155a3398",
  remove_friend: "1e1a84871e2e2c68ef899b845bc96506",
  accept_platform_invite: "9b3e4a89a84d2eb482c312eba87c4d37",
  scrub_deleted_account: "5a08d60e3af617b6368d3a85cbe05f94",
  refuse_deleted_profile_link: "d78758de09e1e9f49e0d6b5f288650df",
};

describe("20260925003000_friend_requests.sql", () => {
  const sql = read(M1);

  it("has exactly the function bodies the plan pinned", () => {
    const actual = Object.fromEntries(Object.keys(PINS).map((name) => [name, md5(body(sql, name))]));
    expect(actual).toEqual(PINS);
  });

  it("asserts each of those md5s in its own post-state", () => {
    for (const [name, hash] of Object.entries(PINS)) {
      expect(sql).toMatch(
        new RegExp(`\\('public\\.${name}\\([a-z]*\\)', +'[a-z]+', +'[a-z_ ]*', +'${hash}'`),
      );
    }
  });

  it("recreates accept_platform_invite with one addition: the friend_requests delete", () => {
    const before = body(read(PLATFORM_INVITES), "accept_platform_invite");
    expect(md5(before)).toBe("b47d41eab50acac6ca48c213d5503c63");
    const added =
      "  -- Friend requests (20260925003000, D5): the invite settles a pending request either way.\n" +
      "  delete from friend_requests\n" +
      "   where (requester_id = v_uid and recipient_id = v_invite.inviter_id)\n" +
      "      or (requester_id = v_invite.inviter_id and recipient_id = v_uid);\n";
    const now = body(sql, "accept_platform_invite");
    expect(now).toContain(added);
    expect(now.replace(added, "")).toBe(before);
  });

  it("recreates scrub_deleted_account with one addition, before the friendships delete", () => {
    const before = body(read(ACCOUNT_DELETION), "scrub_deleted_account");
    expect(md5(before)).toBe("bad163a7d72fcab774936383dc1b6f2a");
    const added =
      "  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;\n";
    const now = body(sql, "scrub_deleted_account");
    expect(now).toContain(
      added + "  delete from friendships where user_id = p_user_id or friend_id = p_user_id;\n",
    );
    expect(now.replace(added, "")).toBe(before);
  });

  it("widens refuse_deleted_profile_link to the two friend_requests columns and nothing else", () => {
    const before = body(read(ACCOUNT_DELETION), "refuse_deleted_profile_link");
    expect(md5(before)).toBe("288dd03195cd529a7c5bc995cac78035");
    const now = body(sql, "refuse_deleted_profile_link");
    expect(
      now.replace(
        "to_jsonb(new) ->> 'friend_id',\n" +
          "                                  to_jsonb(new) ->> 'requester_id', to_jsonb(new) ->> 'recipient_id')",
        "to_jsonb(new) ->> 'friend_id')",
      ),
    ).toBe(before);
  });

  it("gives the five RPCs to authenticated alone", () => {
    for (const fn of FIVE) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) +from public, anon, service_role;`),
      );
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) +to authenticated;`));
    }
  });

  it("raises the refusals the app shows verbatim", () => {
    for (const line of [
      "not signed in",
      "you cannot be your own friend",
      "that account has been deleted",
      "no request to accept",
    ]) {
      expect(sql).toContain(`'${line}'`);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/friend-requests-migration.test.ts`
Expected: FAIL. The file fails to load with `Error: ENOENT: no such file or directory, open '...supabase\migrations\20260925003000_friend_requests.sql'` and `Tests  no tests`.

- [ ] **Step 3: Write the migration.**

Create `supabase/migrations/20260925003000_friend_requests.sql`:

```sql
-- friend_requests: a friendship now needs the other person's yes. A request
-- lives in its own table; friendships keeps meaning "accepted, mutual".
--
-- Spec: docs/superpowers/specs/2026-09-24-friend-requests-design.md (§2.1,
-- §2.3, D1-D8). Plan: docs/superpowers/plans/2026-09-24-friend-requests.md,
-- Task 1. Migration 1 of 2 (D8, the M9a/M9b pattern): additive only. The
-- deployed app keeps inserting and deleting its own friendships rows
-- directly ("friendships insert own" / "friendships delete own") until
-- 20260925004000_friend_requests_lockdown.sql, which is applied only once the
-- app that calls the RPCs below is live.
--
-- Written against the LIVE state (read-only, 2026-09-24), never an older
-- migration file alone:
-- * friendships: 44 rows (14 mutual pairs = 28 rows, 16 one-way rows);
--   constraints friendships_check, friendships_friend_id_fkey,
--   friendships_pkey, friendships_user_id_fkey,
--   friendships_user_id_friend_id_key (pinned by 20260918130500, never
--   renamed); RLS on with "friendships read own", "friendships insert own"
--   and "friendships delete own" (authenticated, user_id = auth.uid()); one
--   trigger, friendships_refuse_deleted_profile (BEFORE INSERT) ->
--   refuse_deleted_profile_link(). None of it changes here.
-- * refuse_deleted_profile_link() md5 288dd03195cd529a7c5bc995cac78035,
--   scrub_deleted_account(uuid) md5 bad163a7d72fcab774936383dc1b6f2a and
--   accept_platform_invite(text) md5 b47d41eab50acac6ca48c213d5503c63 (md5 of
--   prosrc with any CR stripped): each recreated below with one addition.
-- * can_view_cellar(uuid) md5 3af2e51e338dc43cc48b58f061049ec2: NOT changed
--   (spec §2.2). Once friendships rows come in pairs (20260925004000), "a row
--   in either direction" is the same as "friends"; the rule-1 migrations'
--   pins of that md5 stay valid.
-- * No friend_requests table; no function named send_friend_request,
--   cancel_friend_request, accept_friend_request, decline_friend_request or
--   remove_friend, in any signature.
-- * Supabase's default privileges grant anon, authenticated and service_role
--   every privilege on a new table and EXECUTE on a new function (plus
--   PUBLIC): the revokes below undo that, and the post-state asserts the
--   result, not the default.
--
-- What this migration does:
-- 1. friend_requests (spec §2.1, verbatim): one pending request per
--    direction; both FKs cascade from profiles; an index on recipient_id.
--    RLS "friend_requests read own": the requester and the recipient read it.
--    No INSERT, UPDATE or DELETE policy, and the table grants are cut to
--    SELECT for authenticated (anon and PUBLIC nothing), so no client writes
--    it even through a later policy mistake; service_role keeps the defaults.
-- 2. refuse_deleted_profile_link() also reads requester_id and recipient_id
--    (to_jsonb(new) ->> a key the row lacks is null, so friendships and
--    tasting_participants behave exactly as before), and a BEFORE INSERT
--    trigger friend_requests_refuse_deleted_profile runs it: no request names
--    a deleted profile ("that account has been deleted", 42501).
-- 3. The five RPCs of spec §2.3 (SECURITY DEFINER, search_path public,
--    plpgsql; EXECUTE for authenticated only).
-- 4. accept_platform_invite(text) recreated with one addition: it deletes any
--    friend_requests row between the caller and the inviter, both ways,
--    before writing the two friendships rows (D5). `create or replace` keeps
--    its ACL (owner + authenticated).
-- 5. scrub_deleted_account(uuid) recreated with one addition: it deletes the
--    person's friend_requests, as requester or recipient, on every call.
--    `create or replace` keeps its ACL (owner only).
--
-- Lock order: every writer touches friend_requests before friendships (the
-- RPCs, accept_platform_invite, the scrub), so two of them never deadlock on
-- the pair of tables; 20260925004000 locks them in the same order.
--
-- Rule 1: nothing here reads or exposes wines, answer keys or guesses. A
-- request tells its recipient only what the open directory already shows.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.friend_requests') is not null then
    raise exception 'public.friend_requests already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('send_friend_request', 'cancel_friend_request', 'accept_friend_request',
                      'decline_friend_request', 'remove_friend');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;

  -- 2. friendships: the constraint set, the three own policies, the one trigger.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.friendships'::regclass;
  if v_text is distinct from
       'friendships_check CHECK ((user_id <> friend_id)); '
       || 'friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friendships_pkey PRIMARY KEY (id); '
       || 'friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friendships_user_id_friend_id_key UNIQUE (user_id, friend_id)' then
    raise exception 'friendships constraints differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.friendships'::regclass;
  if v_text is distinct from
       'friendships delete own d permissive {authenticated} (user_id = auth.uid()) -; '
       || 'friendships insert own a permissive {authenticated} - (user_id = auth.uid()); '
       || 'friendships read own r permissive {authenticated} (user_id = auth.uid()) -' then
    raise exception 'friendships policies differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.friendships'::regclass and not t.tgisinternal;
  if v_text is distinct from 'friendships_refuse_deleted_profile 7 refuse_deleted_profile_link()' then
    raise exception 'friendships triggers differ from the live state this file was written against: %', v_text;
  end if;

  -- 3. The bodies recreated below, and can_view_cellar (not changed; spec §2.2).
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.refuse_deleted_profile_link()', '288dd03195cd529a7c5bc995cac78035'),
    ('public.scrub_deleted_account(uuid)',   'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.accept_platform_invite(text)',  'b47d41eab50acac6ca48c213d5503c63'),
    ('public.can_view_cellar(uuid)',         '3af2e51e338dc43cc48b58f061049ec2')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 4. profiles: the key both foreign keys reference, and deleted_at.
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.profiles'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)')
     or not exists (select 1 from pg_attribute a
                    where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at'
                      and not a.attisdropped and a.atttypid = 'timestamptz'::regtype) then
    raise exception 'profiles has no PRIMARY KEY (id) or no deleted_at timestamptz';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. friend_requests (spec §2.1, verbatim).
-- ---------------------------------------------------------------------------
create table public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);
create index friend_requests_recipient_idx on public.friend_requests (recipient_id);
alter table public.friend_requests enable row level security;
create policy "friend_requests read own" on public.friend_requests
  for select to authenticated using (requester_id = auth.uid() or recipient_id = auth.uid());
revoke all on table public.friend_requests from public, anon, authenticated;
grant select on public.friend_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. No request names a deleted profile. The shared guard also reads the two
--    friend_requests columns; a key a row lacks reads as null, which never
--    matches, so friendships and tasting_participants keep today's rule.
--    `create or replace` keeps its ACL (owner only).
-- ---------------------------------------------------------------------------
create or replace function public.refuse_deleted_profile_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles p
             where p.deleted_at is not null
               and p.id::text in (to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'friend_id',
                                  to_jsonb(new) ->> 'requester_id', to_jsonb(new) ->> 'recipient_id')) then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege'; -- (spec copy)
  end if;
  return new;
end $$;
create trigger friend_requests_refuse_deleted_profile before insert on public.friend_requests
  for each row execute function public.refuse_deleted_profile_link();

-- ---------------------------------------------------------------------------
-- 4. The five RPCs (spec §2.3): the only way a client writes friend_requests
--    or (after 20260925004000) friendships. Each one, in order: signed in;
--    not yourself; the other person's profile read FOR KEY SHARE, which waits
--    out an account-deletion scrub in flight (it holds that row FOR UPDATE)
--    and then reads the committed deleted_at; then a transaction-scoped
--    advisory lock on the pair, so two people asking each other at the same
--    moment end as friends, not as two crossed requests.
-- ---------------------------------------------------------------------------
create function public.send_friend_request(p_to uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_to is null or p_to = v_uid then
    raise exception 'you cannot be your own friend' using errcode = 'invalid_parameter_value';
  end if;
  select p.deleted_at into v_deleted_at from profiles p where p.id = p_to for key share;
  if v_deleted_at is not null then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'friend-pair:' || least(v_uid, p_to)::text || ':' || greatest(v_uid, p_to)::text, 0));
  if exists (select 1 from friendships f where f.user_id = v_uid and f.friend_id = p_to) then
    return 'friends';
  end if;
  if exists (select 1 from friend_requests r where r.requester_id = p_to and r.recipient_id = v_uid) then
    delete from friend_requests r
     where (r.requester_id = v_uid and r.recipient_id = p_to)
        or (r.requester_id = p_to and r.recipient_id = v_uid);
    insert into friendships (user_id, friend_id) values (v_uid, p_to), (p_to, v_uid)
      on conflict (user_id, friend_id) do nothing;
    return 'accepted';
  end if;
  insert into friend_requests (requester_id, recipient_id) values (v_uid, p_to)
    on conflict (requester_id, recipient_id) do nothing;
  return 'requested';
end $$;

create function public.cancel_friend_request(p_to uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_to is null or p_to = v_uid then
    raise exception 'you cannot be your own friend' using errcode = 'invalid_parameter_value';
  end if;
  select p.deleted_at into v_deleted_at from profiles p where p.id = p_to for key share;
  if v_deleted_at is not null then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'friend-pair:' || least(v_uid, p_to)::text || ':' || greatest(v_uid, p_to)::text, 0));
  delete from friend_requests r where r.requester_id = v_uid and r.recipient_id = p_to;
end $$;

create function public.accept_friend_request(p_from uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_from = v_uid then
    raise exception 'you cannot be your own friend' using errcode = 'invalid_parameter_value';
  end if;
  select p.deleted_at into v_deleted_at from profiles p where p.id = p_from for key share;
  if v_deleted_at is not null then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'friend-pair:' || least(v_uid, p_from)::text || ':' || greatest(v_uid, p_from)::text, 0));
  if not exists (select 1 from friend_requests r where r.requester_id = p_from and r.recipient_id = v_uid) then
    raise exception 'no request to accept' using errcode = 'insufficient_privilege';
  end if;
  delete from friend_requests r
   where (r.requester_id = v_uid and r.recipient_id = p_from)
      or (r.requester_id = p_from and r.recipient_id = v_uid);
  insert into friendships (user_id, friend_id) values (v_uid, p_from), (p_from, v_uid)
    on conflict (user_id, friend_id) do nothing;
end $$;

create function public.decline_friend_request(p_from uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_from = v_uid then
    raise exception 'you cannot be your own friend' using errcode = 'invalid_parameter_value';
  end if;
  select p.deleted_at into v_deleted_at from profiles p where p.id = p_from for key share;
  if v_deleted_at is not null then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'friend-pair:' || least(v_uid, p_from)::text || ':' || greatest(v_uid, p_from)::text, 0));
  delete from friend_requests r where r.requester_id = p_from and r.recipient_id = v_uid;
end $$;

create function public.remove_friend(p_other uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_other is null or p_other = v_uid then
    raise exception 'you cannot be your own friend' using errcode = 'invalid_parameter_value';
  end if;
  select p.deleted_at into v_deleted_at from profiles p where p.id = p_other for key share;
  if v_deleted_at is not null then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'friend-pair:' || least(v_uid, p_other)::text || ':' || greatest(v_uid, p_other)::text, 0));
  delete from friendships f
   where (f.user_id = v_uid and f.friend_id = p_other)
      or (f.user_id = p_other and f.friend_id = v_uid);
end $$;

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. auth.uid() is null for anon and
-- service_role, so they lose it too (the transfer_tasting_host OD-1 precedent).
revoke all on function public.send_friend_request(uuid)    from public, anon, service_role;
revoke all on function public.cancel_friend_request(uuid)  from public, anon, service_role;
revoke all on function public.accept_friend_request(uuid)  from public, anon, service_role;
revoke all on function public.decline_friend_request(uuid) from public, anon, service_role;
revoke all on function public.remove_friend(uuid)          from public, anon, service_role;
grant execute on function public.send_friend_request(uuid)    to authenticated;
grant execute on function public.cancel_friend_request(uuid)  to authenticated;
grant execute on function public.accept_friend_request(uuid)  to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid)          to authenticated;

-- ---------------------------------------------------------------------------
-- 5. accept_platform_invite: 20260918130500's body with one addition, the
--    delete between the expiry check and the friendship writes (D5). An
--    invite link still makes two people friends at once, and settles any
--    pending request between them, either way.
-- ---------------------------------------------------------------------------
create or replace function public.accept_platform_invite(p_code text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite platform_invites%rowtype;
begin
  if v_uid is null then raise exception 'not signed in'; end if; -- (plan copy)
  select * into v_invite from platform_invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'no invite has that code'; end if; -- (plan copy)
  if v_invite.inviter_id = v_uid then raise exception 'that is your own invite link'; end if; -- (plan copy)
  if v_invite.expires_at <= now() then raise exception 'that invite link has expired'; end if; -- (plan copy)
  -- Friend requests (20260925003000, D5): the invite settles a pending request either way.
  delete from friend_requests
   where (requester_id = v_uid and recipient_id = v_invite.inviter_id)
      or (requester_id = v_invite.inviter_id and recipient_id = v_uid);
  -- Already accepted by this account (or the invitee had added the inviter
  -- by hand): make it mutual, count nothing, and never read as used up.
  if exists (select 1 from friendships f where f.user_id = v_uid and f.friend_id = v_invite.inviter_id) then
    insert into friendships (user_id, friend_id) values (v_invite.inviter_id, v_uid)
      on conflict (user_id, friend_id) do nothing;
    return v_invite.inviter_id;
  end if;
  if v_invite.uses >= v_invite.max_uses then raise exception 'that invite link has been used up'; end if; -- (plan copy)
  insert into friendships (user_id, friend_id) values (v_uid, v_invite.inviter_id)
    on conflict (user_id, friend_id) do nothing;
  insert into friendships (user_id, friend_id) values (v_invite.inviter_id, v_uid)
    on conflict (user_id, friend_id) do nothing;
  update platform_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.inviter_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. scrub_deleted_account: 20260919101300's body with one addition, the
--    friend_requests delete in step 6 (every call), placed before the
--    friendships delete to keep the lock order above.
-- ---------------------------------------------------------------------------
create or replace function public.scrub_deleted_account(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
  v_tasting uuid;
  v_gone int;
begin
  -- 0. Serialise on the profile. No profile: nothing of theirs is in public.
  select deleted_at into v_deleted_at from profiles where id = p_user_id for update;
  if not found then
    return;
  end if;

  if v_deleted_at is null then
    -- 1. Hosted, never started, nobody else JOINED or INVITED: nothing is recorded yet (D6a).
    delete from tastings t
     where t.host_id = p_user_id and t.status = 'DRAFT' and t.started_at is null
       and not exists (select 1 from tasting_participants p
                        where p.tasting_id = t.id and p.user_id <> p_user_id
                          and p.status in ('JOINED', 'INVITED'));
    -- 2. Every other hosted tasting that is not finished: finish it, reveal nothing (D6b).
    update tastings set status = 'CLOSED' where host_id = p_user_id and status <> 'CLOSED';
    -- 3. Their places (D6c).
    delete from tasting_places tp using tastings t
     where tp.tasting_id = t.id and t.host_id = p_user_id;
    -- 4. Seats in other people's never-started tastings: their glasses, then the seat (D7a).
    for v_tasting in
      select tp.tasting_id from tasting_participants tp join tastings t on t.id = tp.tasting_id
       where tp.user_id = p_user_id and t.host_id <> p_user_id
         and t.status = 'DRAFT' and t.started_at is null
    loop
      perform 1 from wines where tasting_id = v_tasting for update;
      delete from wines w using tasting_participants tp
       where w.tasting_id = v_tasting and w.contributor_participant_id = tp.id
         and tp.tasting_id = v_tasting and tp.user_id = p_user_id;
      get diagnostics v_gone = row_count;
      if v_gone > 0 then
        -- remove_flight_glass's two statements, so (tasting_id, position) never collides.
        with ordered as (select id, row_number() over (order by position) as ord
                           from wines where tasting_id = v_tasting)
        update wines w set position = -o.ord from ordered o where w.id = o.id;
        update wines set position = -position where tasting_id = v_tasting and position < 0;
      end if;
      delete from tasting_participants where tasting_id = v_tasting and user_id = p_user_id;
    end loop;
    -- 5. Started, unfinished tastings of others: an unanswered seat nothing points at (D7b).
    delete from tasting_participants tp using tastings t
     where tp.tasting_id = t.id and tp.user_id = p_user_id and t.host_id <> p_user_id
       and t.status <> 'CLOSED' and tp.status <> 'JOINED'
       and not exists (select 1 from guesses g where g.participant_id = tp.id)
       and not exists (select 1 from wines w where w.contributor_participant_id = tp.id);
  end if;

  -- 6. Only theirs; every call, so a later call sweeps what a leftover token wrote (D8, D12).
  delete from wset_notes where author_id = p_user_id;
  delete from cellar_consumptions where owner_id = p_user_id;
  delete from cellar_lots where owner_id = p_user_id;
  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;
  delete from friendships where user_id = p_user_id or friend_id = p_user_id;
  delete from platform_invites where inviter_id = p_user_id;
  delete from wine_pour_intents where owner_id = p_user_id;
  delete from wine_identity_drafts where owner_id = p_user_id;
  delete from label_reads where user_id = p_user_id;
  if to_regclass('public.auth_sessions') is not null then
    execute 'delete from public.auth_sessions where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_tokens') is not null then
    execute 'delete from public.auth_tokens where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_credentials') is not null then
    execute 'delete from public.auth_credentials where user_id = $1' using p_user_id;
  end if;

  -- 7. Scrub and stamp last: deleted_at marks a completed run (D5).
  if v_deleted_at is null then
    update profiles
       set display_name = 'Deleted user',
           email = 'deleted+' || p_user_id::text || '@blindr.invalid',
           avatar_url = null, bio = null, location = null, phone = null,
           favorite_wine_type = null, last_seen_at = null,
           role = 'MEMBER', cellar_visibility = 'PRIVATE', preferred_currency = 'DKK',
           deleted_at = now()
     where id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. friend_requests: the four columns of spec §2.1, in order.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.friend_requests'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), requester_id uuid not null, '
       || 'recipient_id uuid not null, created_at timestamptz not null default now()' then
    raise exception 'friend_requests columns differ from spec §2.1: %', v_text;
  end if;

  -- 2. Its constraints (the names Postgres gives spec §2.1's unnamed ones) and the index.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.friend_requests'::regclass;
  if v_text is distinct from
       'friend_requests_check CHECK ((requester_id <> recipient_id)); '
       || 'friend_requests_pkey PRIMARY KEY (id); '
       || 'friend_requests_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friend_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friend_requests_requester_id_recipient_id_key UNIQUE (requester_id, recipient_id)' then
    raise exception 'friend_requests constraints differ from spec §2.1: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i
                 where i.schemaname = 'public' and i.tablename = 'friend_requests'
                   and i.indexname = 'friend_requests_recipient_idx'
                   and i.indexdef like '% USING btree (recipient_id)') then
    raise exception 'friend_requests_recipient_idx is missing or is not a btree on recipient_id';
  end if;

  -- 3. RLS on (not forced); exactly the one read policy; the one trigger.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.friend_requests'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'friend_requests row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.friend_requests'::regclass;
  if v_text is distinct from
       'friend_requests read own r permissive {authenticated} ((requester_id = auth.uid()) OR (recipient_id = auth.uid())) -' then
    raise exception 'friend_requests policies differ from spec §2.1: %', v_text;
  end if;
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.friend_requests'::regclass and not t.tgisinternal;
  if v_text is distinct from 'friend_requests_refuse_deleted_profile 7 refuse_deleted_profile_link()' then
    raise exception 'friend_requests triggers are %, expected the deleted-profile guard alone', v_text;
  end if;

  -- 4. Table privileges: anon and PUBLIC hold nothing; authenticated holds
  --    SELECT alone; nobody holds a column grant; service_role keeps the
  --    defaults (the DB test's owner-role fixtures do not need it, but a
  --    maintenance script may).
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.friend_requests'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on friend_requests';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.friend_requests'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on friend_requests are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.friend_requests'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'friend_requests carries a column-level grant';
  end if;
  if has_any_column_privilege('authenticated', 'public.friend_requests', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.friend_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.friend_requests', 'DELETE')
     or has_any_column_privilege('anon', 'public.friend_requests', 'SELECT')
     or not has_table_privilege('service_role', 'public.friend_requests', 'SELECT')
     or not has_table_privilege('service_role', 'public.friend_requests', 'INSERT')
     or not has_table_privilege('service_role', 'public.friend_requests', 'DELETE') then
    raise exception 'friend_requests privileges are not: authenticated SELECT only; anon nothing; service_role the defaults';
  end if;

  -- 5. Every function this file creates or recreates: security, search_path,
  --    volatility, language, return type, arguments, body (md5 of prosrc with
  --    any CR stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.rettype, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.send_friend_request(uuid)',    'text',    'p_to uuid',      '8efbf4536f08f335934d517ca5007238',    'OWNER,authenticated'),
      ('public.cancel_friend_request(uuid)',  'void',    'p_to uuid',      '55dc3b3361bb035bdd9ad2a95d70e13d',  'OWNER,authenticated'),
      ('public.accept_friend_request(uuid)',  'void',    'p_from uuid',    '8c473e36e07123e4a4ab2ee5b211b454',  'OWNER,authenticated'),
      ('public.decline_friend_request(uuid)', 'void',    'p_from uuid',    'a7bac3015636524f65fd3c27155a3398', 'OWNER,authenticated'),
      ('public.remove_friend(uuid)',          'void',    'p_other uuid',   '1e1a84871e2e2c68ef899b845bc96506',  'OWNER,authenticated'),
      ('public.accept_platform_invite(text)', 'uuid',    'p_code text',    '9b3e4a89a84d2eb482c312eba87c4d37',  'OWNER,authenticated'),
      ('public.scrub_deleted_account(uuid)',  'void',    'p_user_id uuid', '5a08d60e3af617b6368d3a85cbe05f94',   'OWNER'),
      ('public.refuse_deleted_profile_link()', 'trigger', '',              'd78758de09e1e9f49e0d6b5f288650df',  'OWNER')
    ) as s (sig, rettype, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if not v_fn.prosecdef
       or v_fn.config_now is distinct from '{search_path=public}'
       or v_fn.volatile_now is distinct from 'v'
       or v_fn.lanname is distinct from 'plpgsql'
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.send_friend_request(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.send_friend_request(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.remove_friend(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.remove_friend(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.accept_friend_request(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE on the friend-request functions is not authenticated-only';
  end if;

  -- 6. What this file relies on without changing it: friendships' constraint
  --    set, its three policies and its one trigger (the deployed app still
  --    writes through the insert/delete policies until 20260925004000), and
  --    can_view_cellar's body.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.friendships'::regclass;
  if v_text is distinct from
       'friendships_check CHECK ((user_id <> friend_id)); '
       || 'friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friendships_pkey PRIMARY KEY (id); '
       || 'friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'friendships_user_id_friend_id_key UNIQUE (user_id, friend_id)' then
    raise exception 'friendships constraints changed: %', v_text;
  end if;
  if (select count(*) from pg_policy p where p.polrelid = 'public.friendships'::regclass) <> 3
     or not has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or not has_table_privilege('authenticated', 'public.friendships', 'DELETE') then
    raise exception 'friendships lost a policy or a client grant the deployed app still uses';
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
       where p.oid = to_regprocedure('public.can_view_cellar(uuid)')) is distinct from '3af2e51e338dc43cc48b58f061049ec2' then
    raise exception 'can_view_cellar changed; spec §2.2 keeps it';
  end if;

  raise notice 'friend requests: table acl %; friendships rows %',
    (select c.relacl::text from pg_class c where c.oid = 'public.friend_requests'::regclass),
    (select count(*) from friendships);
end $$;
```

- [ ] **Step 4: Add the types.**

In `src/lib/supabase/database.types.ts`:

Replace
```ts
        Update: Partial<Database["public"]["Tables"]["friendships"]["Insert"]>;
        Relationships: [];
      };
```
with
```ts
        Update: Partial<Database["public"]["Tables"]["friendships"]["Insert"]>;
        Relationships: [];
      };
      // 20260925003000 (friend-requests spec §2.1): a pending friend
      // request, at most one per direction. The requester and the recipient
      // read it (RLS); no client inserts, updates or deletes it — every write
      // is one of the five friend-request RPCs below. friendships keeps
      // meaning "accepted, mutual" (rows in pairs once 20260925004000 runs).
      friend_requests: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          recipient_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friend_requests"]["Insert"]>;
        Relationships: [];
      };
```

Replace
```ts
      // 20260918130500 (platform-invites spec §4, D10): the signed-in caller
      // becomes the inviter's friend both ways (two friendships rows,
      // idempotent), one use is counted per account, and the inviter id is
      // returned.
```
with
```ts
      // 20260918130500 (platform-invites spec §4, D10): the signed-in caller
      // becomes the inviter's friend both ways (two friendships rows,
      // idempotent), one use is counted per account, and the inviter id is
      // returned. Since 20260925003000 it also deletes any pending friend
      // request between the two, either way (friend-requests spec D5).
```

Replace
```ts
      accept_platform_invite: {
        Args: { p_code: string };
        Returns: string;
      };
```
with
```ts
      accept_platform_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      // 20260925003000 (friend-requests spec §2.3): the only client path to
      // friend_requests and friendships. SECURITY DEFINER; EXECUTE for
      // authenticated only (revoked from PUBLIC, anon and service_role).
      // Refusals, verbatim: "not signed in" (42501), "you cannot be your own
      // friend" (22023), "that account has been deleted" (42501); accept
      // also "no request to accept" (42501). send returns 'requested',
      // 'accepted' (the other person had already asked: now friends) or
      // 'friends' (already friends). cancel, decline and remove are no-ops
      // when there is nothing to remove.
      send_friend_request: {
        Args: { p_to: string };
        Returns: string;
      };
      cancel_friend_request: {
        Args: { p_to: string };
        Returns: undefined;
      };
      accept_friend_request: {
        Args: { p_from: string };
        Returns: undefined;
      };
      decline_friend_request: {
        Args: { p_from: string };
        Returns: undefined;
      };
      remove_friend: {
        Args: { p_other: string };
        Returns: undefined;
      };
```

- [ ] **Step 5: Run the test and the type check.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/friend-requests-migration.test.ts && npx tsc --noEmit`
Expected: `7 passed`; tsc prints nothing. If "has exactly the function bodies the plan pinned" fails, the diff names the function whose body differs from this plan by a character: fix the SQL to match the plan, never the md5.

- [ ] **Step 6: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add supabase/migrations/20260925003000_friend_requests.sql src/lib/friends/friend-requests-migration.test.ts src/lib/supabase/database.types.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(db): friend_requests table and RPCs (migration 1 of 2, not applied)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migration 2, the data move and the `friendships` lockdown

**Files:**
- Create: `supabase/migrations/20260925004000_friend_requests_lockdown.sql`
- Modify: `src/lib/friends/friend-requests-migration.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's migration file and its test helpers (`read`, `md5`, `body`, `FIVE`, `M1`).
- Produces: the lockdown migration. Its header names the app commit it must follow: `"feat(friends): every friend button goes through the request RPCs"` (Task 6's exact commit title). No `database.types.ts` change: `friendships` keeps its types, only the client grants change.

Do not run this SQL anywhere (Task 14 applies it).

- [ ] **Step 1: Write the failing test.**

In `src/lib/friends/friend-requests-migration.test.ts`:

Append at the very end of the file:
```ts

const M2 = "supabase/migrations/20260925004000_friend_requests_lockdown.sql";

describe("20260925004000_friend_requests_lockdown.sql", () => {
  const m1 = read(M1);
  const sql = read(M2);

  it("pre-asserts the bodies 20260925003000 installs", () => {
    for (const name of [...FIVE, "accept_platform_invite", "scrub_deleted_account"]) {
      expect(sql).toMatch(new RegExp(`'public\\.${name}\\([a-z]*\\)', +'${md5(body(m1, name))}'`));
    }
  });

  it("names the app deploy it must follow", () => {
    expect(sql).toContain('"feat(friends): every friend button goes through the request RPCs"');
  });

  it("locks, moves the one-way rows, then drops the client writes", () => {
    const lock = sql.indexOf("lock table public.friend_requests, public.friendships in share row exclusive mode;");
    const move = sql.indexOf("create temporary table friendships_one_way on commit drop as");
    const gone = sql.indexOf("delete from friendships f using friendships_one_way o where f.id = o.id;");
    const drop = sql.indexOf('drop policy "friendships insert own" on public.friendships;');
    expect(lock).toBeGreaterThan(0);
    expect(move).toBeGreaterThan(lock);
    expect(gone).toBeGreaterThan(move);
    expect(drop).toBeGreaterThan(gone);
    expect(sql).toContain('drop policy "friendships delete own" on public.friendships;');
    expect(sql).toContain("revoke insert, update, delete on table public.friendships from anon, authenticated;");
    expect(sql).not.toContain('drop policy "friendships read own"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/friend-requests-migration.test.ts`
Expected: FAIL. The whole file fails to load with `Error: ENOENT: ... 20260925004000_friend_requests_lockdown.sql` (the new describe block reads it at collection), so no test runs, Task 1's included.

- [ ] **Step 3: Write the migration.**

Create `supabase/migrations/20260925004000_friend_requests_lockdown.sql`:

```sql
-- friend_requests lockdown: the one-way friendships rows become pending
-- requests, and no client writes friendships directly any more.
--
-- Spec: docs/superpowers/specs/2026-09-24-friend-requests-design.md (§2.2,
-- §2.4, D2, D8). Plan: docs/superpowers/plans/2026-09-24-friend-requests.md,
-- Task 2. Migration 2 of 2 (the M9b half of D8).
--
-- APPLY ONLY AFTER the app deploy whose commit is titled
-- "feat(friends): every friend button goes through the request RPCs" is live
-- on production. That deploy is the first one that never writes friendships
-- directly (sendFriendRequest, cancelFriendRequest, acceptFriendRequest,
-- declineFriendRequest and removeFriend call the RPCs of 20260925003000). An
-- older deploy still inserts and deletes friendships rows through the two
-- policies this file drops, and its "Add friend" would fail here. Nothing in
-- the database can see which app is deployed: that check is the operator's.
--
-- Written against the state 20260925003000 leaves (pinned below). On live
-- 2026-09-24 friendships held 44 rows: 14 mutual pairs (28 rows) and 16
-- one-way rows. The count is read again inside this transaction; the
-- constant 16 is not assumed.
--
-- What this migration does, in one transaction:
-- 1. Pre-state: friend_requests and the five RPCs exist, by body; friendships
--    still has its three own policies and its client INSERT/DELETE grants.
-- 2. Locks friend_requests, then friendships, SHARE ROW EXCLUSIVE: every
--    writer waits until this commits (readers do not), in the same table
--    order every writer uses, so no write lands between the move and the
--    revokes.
-- 3. Data move (D2): each friendships row (a, b) with no row (b, a) becomes
--    friend_requests (requester a, recipient b, its created_at), ON CONFLICT
--    DO NOTHING (b may already have a request pending from a, sent after the
--    app deploy), skipping any row where either profile is deleted; then
--    every one of those one-way rows is deleted. Asserts: rows deleted =
--    one-way rows counted at the start; every moved row whose two profiles
--    are live now has its pending request; friend_requests count = count
--    before + rows inserted. (The spec's "friend_requests count = moved
--    count" holds only if no request was sent between the app deploy and
--    this file; this is the same check without that assumption.)
-- 4. Lockdown (spec §2.2): drops "friendships insert own" and "friendships
--    delete own"; revokes INSERT, UPDATE and DELETE on friendships from anon
--    and authenticated. SELECT and "friendships read own" stay. Constraint
--    names are not touched (20260918130500's asserts pin them).
-- 5. Post-state: no friendships row lacks its reverse; the policies and the
--    grants are as step 4 leaves them; the trigger, the constraints and
--    can_view_cellar are unchanged.
--
-- Nothing here touches can_view_cellar, shared_cellar_lots,
-- catalog_wine_photos or tasting_participants. From here a FRIENDS cellar is
-- readable only by an accepted friend: every friendships row has its pair.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Pre-state.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  if to_regclass('public.friend_requests') is null then
    raise exception 'friend_requests does not exist: apply 20260925003000 first';
  end if;
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.send_friend_request(uuid)',    '8efbf4536f08f335934d517ca5007238'),
    ('public.cancel_friend_request(uuid)',  '55dc3b3361bb035bdd9ad2a95d70e13d'),
    ('public.accept_friend_request(uuid)',  '8c473e36e07123e4a4ab2ee5b211b454'),
    ('public.decline_friend_request(uuid)', 'a7bac3015636524f65fd3c27155a3398'),
    ('public.remove_friend(uuid)',          '1e1a84871e2e2c68ef899b845bc96506'),
    ('public.accept_platform_invite(text)', '9b3e4a89a84d2eb482c312eba87c4d37'),
    ('public.scrub_deleted_account(uuid)',  '5a08d60e3af617b6368d3a85cbe05f94'),
    ('public.can_view_cellar(uuid)',        '3af2e51e338dc43cc48b58f061049ec2')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the ones 20260925003000 installs: %', v_text;
  end if;
  select string_agg(p.polname::text, ', ' order by p.polname::text collate "C") into v_text
  from pg_policy p
  where p.polrelid = 'public.friendships'::regclass;
  if v_text is distinct from 'friendships delete own, friendships insert own, friendships read own' then
    raise exception 'friendships policies are %, expected the three own policies', v_text;
  end if;
  if not has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or not has_table_privilege('authenticated', 'public.friendships', 'DELETE') then
    raise exception 'authenticated no longer holds INSERT/DELETE on friendships: re-read live before applying';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Writers wait; readers do not. The same table order every writer uses.
-- ---------------------------------------------------------------------------
lock table public.friend_requests, public.friendships in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 3. The data move (D2).
-- ---------------------------------------------------------------------------
do $$
declare
  v_before int;
  v_one_way int;
  v_inserted int;
  v_deleted int;
  v_missing int;
  v_after int;
begin
  select count(*) into v_before from friend_requests;
  create temporary table friendships_one_way on commit drop as
    select f.id, f.user_id, f.friend_id, f.created_at
      from friendships f
     where not exists (select 1 from friendships r
                        where r.user_id = f.friend_id and r.friend_id = f.user_id);
  select count(*) into v_one_way from friendships_one_way;

  insert into friend_requests (requester_id, recipient_id, created_at)
  select o.user_id, o.friend_id, o.created_at
    from friendships_one_way o
   where not exists (select 1 from profiles p
                      where p.id in (o.user_id, o.friend_id) and p.deleted_at is not null)
  on conflict (requester_id, recipient_id) do nothing;
  get diagnostics v_inserted = row_count;

  delete from friendships f using friendships_one_way o where f.id = o.id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_one_way then
    raise exception 'deleted % one-way friendships rows, but % were one-way at the start', v_deleted, v_one_way;
  end if;
  select count(*) into v_missing
    from friendships_one_way o
   where not exists (select 1 from profiles p
                      where p.id in (o.user_id, o.friend_id) and p.deleted_at is not null)
     and not exists (select 1 from friend_requests r
                      where r.requester_id = o.user_id and r.recipient_id = o.friend_id);
  if v_missing <> 0 then
    raise exception '% one-way friendships rows did not become a pending request', v_missing;
  end if;
  select count(*) into v_after from friend_requests;
  if v_after <> v_before + v_inserted then
    raise exception 'friend_requests holds % rows, expected % before + % moved', v_after, v_before, v_inserted;
  end if;
  raise notice 'friend requests: % one-way friendships rows moved, % new pending requests, % requests before, % after',
    v_one_way, v_inserted, v_before, v_after;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lockdown (spec §2.2).
-- ---------------------------------------------------------------------------
drop policy "friendships insert own" on public.friendships;
drop policy "friendships delete own" on public.friendships;
revoke insert, update, delete on table public.friendships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_orphans int;
begin
  -- 1. The pair invariant.
  select count(*) into v_orphans
    from friendships f
   where not exists (select 1 from friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id);
  if v_orphans <> 0 then
    raise exception '% friendships rows have no reverse row', v_orphans;
  end if;

  -- 2. Exactly the read policy is left.
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.friendships'::regclass;
  if v_text is distinct from 'friendships read own r permissive {authenticated} (user_id = auth.uid()) -' then
    raise exception 'friendships policies are %, expected "friendships read own" alone', v_text;
  end if;

  -- 3. No client role writes friendships; authenticated still reads it;
  --    service_role keeps the defaults.
  if has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or has_table_privilege('authenticated', 'public.friendships', 'UPDATE')
     or has_table_privilege('authenticated', 'public.friendships', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.friendships', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.friendships', 'UPDATE')
     or has_table_privilege('anon', 'public.friendships', 'INSERT')
     or has_table_privilege('anon', 'public.friendships', 'UPDATE')
     or has_table_privilege('anon', 'public.friendships', 'DELETE')
     or has_any_column_privilege('anon', 'public.friendships', 'INSERT')
     or has_any_column_privilege('anon', 'public.friendships', 'UPDATE') then
    raise exception 'a client role can still write friendships';
  end if;
  if not has_table_privilege('authenticated', 'public.friendships', 'SELECT') then
    raise exception 'authenticated lost SELECT on friendships';
  end if;
  if not has_table_privilege('service_role', 'public.friendships', 'INSERT')
     or not has_table_privilege('service_role', 'public.friendships', 'DELETE') then
    raise exception 'service_role lost its default privileges on friendships';
  end if;

  -- 4. Unchanged: the trigger, the constraint set, can_view_cellar.
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.friendships'::regclass and not t.tgisinternal;
  if v_text is distinct from 'friendships_refuse_deleted_profile 7 refuse_deleted_profile_link()' then
    raise exception 'friendships triggers changed: %', v_text;
  end if;
  select string_agg(k.conname::text, ', ' order by k.conname::text collate "C") into v_text
  from pg_constraint k
  where k.conrelid = 'public.friendships'::regclass;
  if v_text is distinct from
       'friendships_check, friendships_friend_id_fkey, friendships_pkey, friendships_user_id_fkey, friendships_user_id_friend_id_key' then
    raise exception 'friendships constraints changed: %', v_text;
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
       where p.oid = to_regprocedure('public.can_view_cellar(uuid)')) is distinct from '3af2e51e338dc43cc48b58f061049ec2' then
    raise exception 'can_view_cellar changed; spec §2.2 keeps it';
  end if;

  raise notice 'friendships lockdown: % rows (% pairs), % pending requests',
    (select count(*) from friendships), (select count(*) / 2 from friendships), (select count(*) from friend_requests);
end $$;
```

- [ ] **Step 4: Run the test.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/friend-requests-migration.test.ts`
Expected: `10 passed`.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add supabase/migrations/20260925004000_friend_requests_lockdown.sql src/lib/friends/friend-requests-migration.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(db): friend requests lockdown migration (2 of 2, not applied)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The database suite, and `cellar-social`'s friendship becomes a pair

**Files:**
- Create: `scripts/friend-requests.test.mjs`
- Modify: `scripts/cellar-social.test.mjs` (the "FRIENDS cellar visible to a friend" case, about line 116)

**Interfaces:**
- Consumes: `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`; Tasks 1 and 2's migration files (read when `FRIEND_REQUESTS_APPLY` names them).
- Produces: `node --env-file=.env.local --test scripts/friend-requests.test.mjs`, 13 tests. Without `FRIEND_REQUESTS_APPLY` on a database where only migration 1 is live: 11 pass, 2 skip. With `FRIEND_REQUESTS_APPLY=<m1>,<m2>` before either is live: 13 pass. After migration 2 is live, with no variable: 12 pass, 1 skip.

This suite connects to production. Implementers write it and check its syntax only. The main session runs it in Tasks 13 and 14. Every test runs in a transaction that always rolls back, on throwaway profiles created inside it: live `profiles` has no foreign key to `auth.users` (20260829265003), so a profile row stands alone.

- [ ] **Step 1: Write the suite.**

Create `scripts/friend-requests.test.mjs`:

```js
// Friend requests DB suite (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md
// §5): the five RPCs of 20260925003000, the recreated accept_platform_invite
// and scrub_deleted_account, and, once 20260925004000 is applied, the
// friendships lockdown and its data move.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles created inside that transaction (live
// profiles has no foreign key to auth.users since 20260829265003): no real
// person's row decides a result or is written.
//
//   node --env-file=.env.local --test scripts/friend-requests.test.mjs
//
// Dry run before a migration is live: FRIEND_REQUESTS_APPLY lists migration
// files (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   FRIEND_REQUESTS_APPLY=supabase/migrations/20260925003000_friend_requests.sql \
//     node --env-file=.env.local --test scripts/friend-requests.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const LOCKDOWN = "20260925004000_friend_requests_lockdown.sql";
const APPLY = (process.env.FRIEND_REQUESTS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const FIVE = [
  "send_friend_request",
  "cancel_friend_request",
  "accept_friend_request",
  "decline_friend_request",
  "remove_friend",
];

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb, { holdLockdown = false } = {}) {
  await client.query("begin");
  try {
    for (const file of APPLY) {
      if (holdLockdown && file.endsWith(LOCKDOWN)) continue;
      await client.query(readFileSync(file, "utf8"));
    }
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

async function asOwner() {
  await client.query("reset role");
}
// A signed-in caller; `null` is a request with no user (auth.uid() is null).
async function asUser(id) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(id ? { sub: id, role: "authenticated" } : { role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'friend-requests-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Friend requests test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function call(fn, arg) {
  return (await client.query(`select public.${fn}($1::uuid) as r`, [arg])).rows[0].r;
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed
// with `code` (and `message`, when given).
async function expectError(fn, code, message) {
  await client.query("savepoint expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  assert.ok(error, `expected SQLSTATE ${code}, but it succeeded`);
  assert.equal(error.code, code, error.message);
  if (message !== undefined) assert.equal(error.message, message);
}

// Owner-role read of everything between a and b.
async function pair(a, b) {
  await asOwner();
  const f = await client.query(
    `select user_id from friendships
      where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)`,
    [a, b],
  );
  const r = await client.query(
    `select requester_id from friend_requests
      where (requester_id = $1 and recipient_id = $2) or (requester_id = $2 and recipient_id = $1)`,
    [a, b],
  );
  return {
    aToB: f.rows.some((x) => x.user_id === a),
    bToA: f.rows.some((x) => x.user_id === b),
    requests: r.rows.map((x) => (x.requester_id === a ? "a->b" : "b->a")).sort(),
  };
}
const FRIENDS = { aToB: true, bToA: true, requests: [] };
const NOTHING = { aToB: false, bToA: false, requests: [] };

test("a request, then its acceptance, writes the pair and clears the request", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
    assert.equal(await call("send_friend_request", b), "requested", "asking twice changes nothing");
    assert.deepEqual(await pair(a, b), { aToB: false, bToA: false, requests: ["a->b"] });

    const seenBy = async (who) => {
      await asUser(who);
      return (
        await client.query(
          "select count(*)::int n from friend_requests where requester_id = $1 and recipient_id = $2",
          [a, b],
        )
      ).rows[0].n;
    };
    assert.equal(await seenBy(a), 1, "the requester reads it");
    assert.equal(await seenBy(b), 1, "the recipient reads it");
    assert.equal(await seenBy(c), 0, "nobody else does");

    await asUser(b);
    await call("accept_friend_request", a);
    assert.deepEqual(await pair(a, b), FRIENDS);
  });
});

test("a decline writes nothing, and the requester may ask again", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await asUser(b);
    await call("decline_friend_request", a);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(b);
    await call("decline_friend_request", a); // nothing pending: a no-op
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
  });
});

test("the requester can cancel; cancel, decline and remove are no-ops when nothing is there", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await call("cancel_friend_request", b);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(a);
    await call("cancel_friend_request", b);
    await call("remove_friend", b);
    await asUser(b);
    await call("decline_friend_request", a);
    assert.deepEqual(await pair(a, b), NOTHING);
  });
});

test("asking someone who already asked you makes you friends at once", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
    await asUser(b);
    assert.equal(await call("send_friend_request", a), "accepted");
    assert.deepEqual(await pair(a, b), FRIENDS);

    // Two crossed requests (what two simultaneous taps could leave without the
    // pair lock): one accept clears both directions.
    await asOwner();
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $1)",
      [b, c],
    );
    await asUser(b);
    await call("accept_friend_request", c);
    assert.deepEqual(await pair(b, c), FRIENDS);
  });
});

test("asking a friend says 'friends'; removing deletes both rows", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await asUser(b);
    await call("accept_friend_request", a);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "friends");
    await asUser(b);
    assert.equal(await call("send_friend_request", a), "friends");
    await call("remove_friend", a);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(b);
    await call("remove_friend", a); // already gone: a no-op
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
  });
});

test("refusals: not signed in, yourself, nothing to accept", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(null);
    for (const fn of FIVE) {
      await expectError(() => call(fn, b), "42501", "not signed in");
    }
    await asUser(a);
    for (const fn of FIVE) {
      await expectError(() => call(fn, a), "22023", "you cannot be your own friend");
      await expectError(() => call(fn, null), "22023", "you cannot be your own friend");
    }
    await expectError(() => call("accept_friend_request", b), "42501", "no request to accept");
  });
});

test("a deleted account can neither be asked nor answered, and no row may name it", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await client.query("update profiles set deleted_at = now() where id = $1", [b]);
    await asUser(a);
    for (const fn of FIVE) {
      await expectError(() => call(fn, b), "42501", "that account has been deleted");
    }
    await asOwner();
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, b]),
      "42501",
      "that account has been deleted",
    );
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [b, a]),
      "42501",
      "that account has been deleted",
    );
    await expectError(
      () => client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [a, b]),
      "42501",
      "that account has been deleted",
    );
  });
});

test("account deletion takes a person's requests with them, both ways", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $3)",
      [a, c, b],
    );
    await client.query("select public.scrub_deleted_account($1)", [c]);
    const left = (
      await client.query(
        "select count(*)::int n from friend_requests where requester_id = $1 or recipient_id = $1",
        [c],
      )
    ).rows[0].n;
    assert.equal(left, 0);
    const deleted = (await client.query("select deleted_at from profiles where id = $1", [c])).rows[0];
    assert.ok(deleted.deleted_at, "the scrub still stamps deleted_at");
  });
});

test("a pending request opens no FRIENDS cellar; accepting does; removing closes it", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await client.query("update profiles set cellar_visibility = 'FRIENDS' where id = $1", [a]);
    const bSeesA = async () => {
      await asUser(b);
      return (await client.query("select public.can_view_cellar($1) as ok", [a])).rows[0].ok;
    };

    await asUser(b);
    await call("send_friend_request", a);
    assert.equal(await bSeesA(), false, "b asked a: nothing opens");
    await asUser(b);
    await call("cancel_friend_request", a);

    await asUser(a);
    await call("send_friend_request", b);
    assert.equal(await bSeesA(), false, "a asked b: nothing opens until b says yes");

    await asUser(b);
    await call("accept_friend_request", a);
    assert.equal(await bSeesA(), true, "friends: the FRIENDS cellar opens");

    await asUser(b);
    await call("remove_friend", a);
    assert.equal(await bSeesA(), false, "removed: it closes again");
  });
});

test("an invite link settles a pending request either way and makes the pair", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const code = (
      await client.query("insert into platform_invites (inviter_id) values ($1) returning code", [a])
    ).rows[0].code;
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $1)",
      [a, b],
    );
    await asUser(b);
    const inviter = (await client.query("select public.accept_platform_invite($1) as id", [code])).rows[0].id;
    assert.equal(inviter, a);
    assert.deepEqual(await pair(a, b), FRIENDS);
  });
});

test("only authenticated runs the RPCs, and no client writes friend_requests", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    for (const fn of FIVE) {
      const sig = `public.${fn}(uuid)`;
      const r = await client.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('service_role', $1, 'EXECUTE') as service,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authed,
                exists (select 1 from pg_proc p, aclexplode(p.proacl) x
                         where p.oid = to_regprocedure($1) and x.grantee = 0) as public`,
        [sig],
      );
      assert.deepEqual(r.rows[0], { anon: false, service: false, authed: true, public: false }, sig);
    }

    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
    await expectError(() => call("send_friend_request", b), "42501");

    await asUser(a);
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, b]),
      "42501",
    );
    await expectError(() => client.query("delete from friend_requests where requester_id = $1", [a]), "42501");
    await expectError(
      () => client.query("update friend_requests set created_at = now() where requester_id = $1", [a]),
      "42501",
    );
  });
});

test("after 20260925004000 no client writes friendships, and every row has its pair", async (t) => {
  await withRollback(async () => {
    await asOwner();
    const open = (
      await client.query("select has_table_privilege('authenticated', 'public.friendships', 'INSERT') as open")
    ).rows[0].open;
    if (open) {
      t.skip("20260925004000 is not applied here");
      return;
    }
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await expectError(
      () => client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [a, b]),
      "42501",
    );
    await expectError(() => client.query("delete from friendships where user_id = $1", [a]), "42501");
    await asOwner();
    const orphans = (
      await client.query(
        `select count(*)::int n from friendships f
          where not exists (select 1 from friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id)`,
      )
    ).rows[0].n;
    assert.equal(orphans, 0);
  });
});

test("20260925004000 turns one-way rows into requests and keeps pairs", async (t) => {
  const lockdown = APPLY.find((f) => f.endsWith(LOCKDOWN));
  if (!lockdown) {
    t.skip("runs only in a dry run whose FRIEND_REQUESTS_APPLY ends with 20260925004000");
    return;
  }
  await withRollback(
    async () => {
      const [a, b, c, d] = await freshProfiles(4);
      // a -> b one-way, as a legacy "Add friend" left it.
      await client.query(
        "insert into friendships (user_id, friend_id, created_at) values ($1, $2, '2026-01-02T03:04:05Z')",
        [a, b],
      );
      // a and c are a pair.
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, c]);
      // d -> a one-way, and a already asked d back through the new app.
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [d, a]);
      await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, d]);

      await client.query(readFileSync(lockdown, "utf8"));

      assert.deepEqual(await pair(a, b), { aToB: false, bToA: false, requests: ["a->b"] });
      const moved = (
        await client.query(
          "select created_at from friend_requests where requester_id = $1 and recipient_id = $2",
          [a, b],
        )
      ).rows[0];
      assert.equal(moved.created_at.toISOString(), "2026-01-02T03:04:05.000Z", "the add date carries over");
      assert.deepEqual(await pair(a, c), FRIENDS, "a pair stays a pair");
      assert.deepEqual(await pair(a, d), { aToB: false, bToA: false, requests: ["a->b", "b->a"] });

      await asUser(d);
      await call("accept_friend_request", a);
      assert.deepEqual(await pair(a, d), FRIENDS, "one accept settles both crossed requests");
    },
    { holdLockdown: true },
  );
});
```

- [ ] **Step 2: Make `cellar-social`'s friendship a pair.**

In `scripts/cellar-social.test.mjs`:

Replace
```js
    await client.query("reset role");
    await client.query("insert into friendships (user_id, friend_id) values ($1,$2)", [a, b]);
```
with
```js
    await client.query("reset role");
    // Friendships come in pairs (friend requests, 20260925004000): a pending
    // request opens nothing — scripts/friend-requests.test.mjs pins that.
    await client.query(
      "insert into friendships (user_id, friend_id) values ($1,$2), ($2,$1) on conflict (user_id, friend_id) do nothing",
      [a, b],
    );
```

- [ ] **Step 3: Check syntax and lint (no database).**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && node --check scripts/friend-requests.test.mjs && node --check scripts/cellar-social.test.mjs && npx eslint scripts/friend-requests.test.mjs scripts/cellar-social.test.mjs`
Expected: no output, exit 0. Do NOT run `node --test` on either file: that connects to production (Task 13 runs them).

- [ ] **Step 4: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add scripts/friend-requests.test.mjs scripts/cellar-social.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "test(db): friend requests suite; cellar-social writes a friendship pair" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase 2: the app

### Task 4: The relationship value and the shared friend types

**Files:**
- Create: `src/lib/friends/types.ts`
- Create: `src/lib/friends/relationship.ts`
- Create: `src/lib/friends/relationship.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FriendResult`, `SendOutcome`, `SendFriendResult`, `Relationship`, `relationship()` and `sendOutcome()`, exactly as in the Interface Contracts.

- [ ] **Step 1: Write the failing test.**

Create `src/lib/friends/relationship.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { relationship, sendOutcome } from "./relationship";

describe("relationship", () => {
  it("is none with nothing between you", () => {
    expect(relationship({ friend: false, outgoing: false, incoming: false })).toBe("none");
  });

  it("is requested when only you asked", () => {
    expect(relationship({ friend: false, outgoing: true, incoming: false })).toBe("requested");
  });

  it("is incoming when they asked, even if you asked too (both pending at once)", () => {
    expect(relationship({ friend: false, outgoing: false, incoming: true })).toBe("incoming");
    expect(relationship({ friend: false, outgoing: true, incoming: true })).toBe("incoming");
  });

  it("is friends whenever a friendship exists, whatever is pending", () => {
    for (const outgoing of [false, true]) {
      for (const incoming of [false, true]) {
        expect(relationship({ friend: true, outgoing, incoming })).toBe("friends");
      }
    }
  });
});

describe("sendOutcome", () => {
  it("keeps the RPC's three words", () => {
    expect(sendOutcome("requested")).toBe("requested");
    expect(sendOutcome("accepted")).toBe("accepted");
    expect(sendOutcome("friends")).toBe("friends");
  });

  it("reads anything else as a sent request", () => {
    expect(sendOutcome(null)).toBe("requested");
    expect(sendOutcome("")).toBe("requested");
    expect(sendOutcome(1)).toBe("requested");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/relationship.test.ts`
Expected: FAIL, `Failed to resolve import "./relationship"`.

- [ ] **Step 3: Write the two modules.**

Create `src/lib/friends/types.ts`:

```ts
// Types shared by the friend server actions and the components that call
// them. They live here, not in src/app/friends/actions.ts: that file is a
// "use server" module, which may export only async functions (CLAUDE.md —
// Next's server-actions loader treats every export of such a module as an
// action).

export type FriendResult = { error: string } | { ok: true };

/** What send_friend_request did: asked; found the other person had already
 *  asked, so you are friends now; or you were friends already. */
export type SendOutcome = "requested" | "accepted" | "friends";

export type SendFriendResult = { error: string } | { ok: true; outcome: SendOutcome };
```

Create `src/lib/friends/relationship.ts`:

```ts
// The one relationship value every friend surface derives its controls from
// (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md §3.2).
// Pure, so vitest loads it directly; the only import is type-only and
// relative (vitest has no `@/` alias).
import type { SendOutcome } from "./types";

export type Relationship = "none" | "requested" | "incoming" | "friends";

/** `friends` wins, then `incoming`, then `requested`, else `none`. */
export function relationship(input: {
  friend: boolean;
  outgoing: boolean;
  incoming: boolean;
}): Relationship {
  if (input.friend) return "friends";
  if (input.incoming) return "incoming";
  if (input.outgoing) return "requested";
  return "none";
}

/** send_friend_request's text result, read defensively: anything but the two
 *  other words means a request was sent. */
export function sendOutcome(value: unknown): SendOutcome {
  return value === "accepted" || value === "friends" ? value : "requested";
}
```

- [ ] **Step 4: Run the test.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/friends/relationship.test.ts && npx tsc --noEmit`
Expected: `6 passed`; tsc prints nothing.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/friends/types.ts src/lib/friends/relationship.ts src/lib/friends/relationship.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(friends): the relationship value and shared friend types" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Friend button labels for every state; the Friends empty state asks, not adds

**Files:**
- Modify: `src/lib/community/community-math.ts` (`friendButtonLabel` and `FRIENDS_EMPTY_BODY`, about lines 219-230)
- Modify: `src/lib/community/community-math.test.ts` (about lines 317-340)
- Modify: `src/components/friend-button.tsx` (one line, about line 63)

**Interfaces:**
- Consumes: nothing (the label function spells the `Relationship` union out, because `community-math.ts` imports nothing on purpose).
- Produces: `friendButtonLabel({ relationship, pending, armed, control? })` (Interface Contracts). `FriendButton` keeps its old props until Task 7. This task only adapts its one label call.

- [ ] **Step 1: Write the failing tests.**

In `src/lib/community/community-math.test.ts`:

Replace
```ts
describe("friendButtonLabel", () => {
  it("every combination", () => {
    expect(friendButtonLabel({ isFriend: false, pending: false, armed: false })).toBe(
      "Add friend",
    );
    expect(friendButtonLabel({ isFriend: false, pending: true, armed: false })).toBe("Adding…");
    expect(friendButtonLabel({ isFriend: true, pending: false, armed: false })).toBe("Friends");
    expect(friendButtonLabel({ isFriend: true, pending: false, armed: true })).toBe(
      "Tap again to remove",
    );
    expect(friendButtonLabel({ isFriend: true, pending: true, armed: true })).toBe("Removing…");
  });
});
```
with
```ts
describe("friendButtonLabel", () => {
  it("none: Add friend, then Sending…", () => {
    expect(friendButtonLabel({ relationship: "none", pending: false, armed: false })).toBe("Add friend");
    expect(friendButtonLabel({ relationship: "none", pending: true, armed: false })).toBe("Sending…");
  });

  it("requested: Requested, a two-tap cancel, then Cancelling…", () => {
    expect(friendButtonLabel({ relationship: "requested", pending: false, armed: false })).toBe(
      "Requested",
    );
    expect(friendButtonLabel({ relationship: "requested", pending: false, armed: true })).toBe(
      "Tap again to cancel",
    );
    expect(friendButtonLabel({ relationship: "requested", pending: true, armed: true })).toBe(
      "Cancelling…",
    );
  });

  it("incoming: the Accept / Decline pair and their pending labels", () => {
    expect(
      friendButtonLabel({ relationship: "incoming", control: "accept", pending: false, armed: false }),
    ).toBe("Accept");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "accept", pending: true, armed: false }),
    ).toBe("Accepting…");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "decline", pending: false, armed: false }),
    ).toBe("Decline");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "decline", pending: true, armed: false }),
    ).toBe("Declining…");
    expect(friendButtonLabel({ relationship: "incoming", pending: false, armed: false })).toBe("Accept");
  });

  it("friends: Friends, a two-tap remove, then Removing…", () => {
    expect(friendButtonLabel({ relationship: "friends", pending: false, armed: false })).toBe("Friends");
    expect(friendButtonLabel({ relationship: "friends", pending: false, armed: true })).toBe(
      "Tap again to remove",
    );
    expect(friendButtonLabel({ relationship: "friends", pending: true, armed: true })).toBe("Removing…");
  });
});
```

Replace
```ts
      body:
        "Tap Add friend on anyone under Everyone to keep them here. Adding a friend is one-way: nobody is asked or notified.",
```
with
```ts
      body:
        "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept.",
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/community/community-math.test.ts`
Expected: FAIL in `friendButtonLabel` (for example `expected 'Add friend' to be 'Friends'`: the old function reads `isFriend`) and in "friends with 0 friends" (the old body).

- [ ] **Step 3: Implement.**

In `src/lib/community/community-math.ts`:

Replace
```ts
export function friendButtonLabel(s: {
  isFriend: boolean;
  pending: boolean;
  armed: boolean;
}): string {
  if (!s.isFriend) return s.pending ? "Adding…" : "Add friend";
  if (s.pending) return "Removing…";
  return s.armed ? "Tap again to remove" : "Friends";
}

const FRIENDS_EMPTY_BODY =
  "Tap Add friend on anyone under Everyone to keep them here. Adding a friend is one-way: nobody is asked or notified.";
```
with
```ts
// Every FriendButton label (friend-requests spec §3.3, copy §4). `relationship`
// is src/lib/friends/relationship.ts's Relationship, spelled out here because
// this module imports nothing. `control` picks one of the incoming pair and is
// ignored in the other states; `armed` is the first tap of a two-tap cancel or
// remove (TWO_TAP_WINDOW_MS).
export function friendButtonLabel(s: {
  relationship: "none" | "requested" | "incoming" | "friends";
  pending: boolean;
  armed: boolean;
  control?: "accept" | "decline";
}): string {
  if (s.relationship === "incoming") {
    if (s.control === "decline") return s.pending ? "Declining…" : "Decline";
    return s.pending ? "Accepting…" : "Accept";
  }
  if (s.relationship === "none") return s.pending ? "Sending…" : "Add friend";
  if (s.relationship === "requested") {
    if (s.pending) return "Cancelling…";
    return s.armed ? "Tap again to cancel" : "Requested";
  }
  if (s.pending) return "Removing…";
  return s.armed ? "Tap again to remove" : "Friends";
}

const FRIENDS_EMPTY_BODY =
  "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept.";
```

In `src/components/friend-button.tsx`:

Replace
```tsx
  const label = friendButtonLabel({ isFriend, pending, armed });
```
with
```tsx
  const label = friendButtonLabel({ relationship: isFriend ? "friends" : "none", pending, armed });
```

- [ ] **Step 4: Run the tests and the type check.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/community/community-math.test.ts && npx tsc --noEmit`
Expected: `55 passed`; tsc prints nothing.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/community/community-math.ts src/lib/community/community-math.test.ts src/components/friend-button.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(friends): button labels for requests; the Friends empty state asks, not adds" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Every friend write goes through the RPCs (`addFriend` retired)

**Files:**
- Modify (overwrite): `src/app/friends/actions.ts`
- Modify: `src/components/friend-button.tsx` (the import, and the one `addFriend` call)

**Interfaces:**
- Consumes: `sendOutcome` (Task 4), `FriendResult`/`SendFriendResult` (Task 4), the RPC types (Task 1).
- Produces: the five actions in the Interface Contracts. `removeFriend` keeps its name and a one-string signature (it now deletes both rows). `FriendResult` is no longer exported from the `"use server"` file. **The commit title of this task is quoted verbatim in migration 2's header** ("feat(friends): every friend button goes through the request RPCs"): keep it character for character.

This task is the rollout gate. From this commit on, no code path writes `friendships` directly, which is what makes migration 2 safe once this commit is live. No unit test can load a `"use server"` module (vitest has no `@/` alias and no Next runtime), so verification is the type check plus Step 3's grep.

- [ ] **Step 1: Rewrite the actions.**

Overwrite the whole file with exactly this content.

Create `src/app/friends/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendOutcome } from "@/lib/friends/relationship";
import type { FriendResult, SendFriendResult } from "@/lib/friends/types";

// Friend requests (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md
// §3.1): thin wrappers over the five SECURITY DEFINER RPCs of
// 20260925003000. No action writes friend_requests or friendships directly —
// after 20260925004000 no client can. A refusal ("that account has been
// deleted", "no request to accept", …) comes back verbatim for the button to
// show. The result types live in src/lib/friends/types.ts: this "use server"
// module exports only async functions.

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

// /community and the other person's profile always change. `header` also
// refreshes every page's server-rendered bell count (AppHeader), for the
// actions that settle a request someone is waiting on.
function refresh(other: string, header: boolean) {
  revalidatePath("/community");
  revalidatePath(`/u/${other}`);
  if (header) revalidatePath("/", "layout");
}

export async function sendFriendRequest(to: string): Promise<SendFriendResult> {
  const supabase = await signedInClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_to: to });
  if (error) return { error: error.message };
  const outcome = sendOutcome(data);
  // "accepted": the other person had asked first, so their request (which
  // may be in this viewer's bell) is gone.
  refresh(to, outcome === "accepted");
  return { ok: true, outcome };
}

export async function cancelFriendRequest(to: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("cancel_friend_request", { p_to: to });
  if (error) return { error: error.message };
  refresh(to, false);
  return { ok: true };
}

export async function acceptFriendRequest(from: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("accept_friend_request", { p_from: from });
  if (error) return { error: error.message };
  refresh(from, true);
  return { ok: true };
}

export async function declineFriendRequest(from: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("decline_friend_request", { p_from: from });
  if (error) return { error: error.message };
  refresh(from, true);
  return { ok: true };
}

export async function removeFriend(other: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("remove_friend", { p_other: other });
  if (error) return { error: error.message };
  refresh(other, false);
  return { ok: true };
}
```

- [ ] **Step 2: Point the button's add path at `sendFriendRequest`.**

In `src/components/friend-button.tsx`:

Replace
```tsx
import { addFriend, removeFriend } from "@/app/friends/actions";
```
with
```tsx
import { removeFriend, sendFriendRequest } from "@/app/friends/actions";
```

Replace
```tsx
      const result = await addFriend(friendId);
```
with
```tsx
      const result = await sendFriendRequest(friendId);
```

- [ ] **Step 3: Verify: types, lint, and no direct friendships write left anywhere.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/app/friends/actions.ts src/components/friend-button.tsx && grep -rn "addFriend\b" src; grep -rn -A4 'from("friendships")' src | grep -E '\.(insert|update|upsert|delete)\('; grep -rn 'from("friendships")' src`
Expected:
- tsc and eslint print nothing.
- The first grep prints only a comment line in `src/components/friend-button.tsx` (`// addFriend/removeFriend actions, ...`), which Task 7 replaces. No code line calls `addFriend`.
- The second grep prints nothing: no insert, update, upsert or delete on `friendships`.
- The third grep prints exactly six read sites, each `.select(...)` filtered by the viewer's own `user_id` (spec §3.7): `src/app/community/page.tsx`, `src/app/tastings/new/page.tsx`, `src/app/tastings/[id]/settings-actions.ts`, `src/app/u/[id]/page.tsx`, `src/components/new-tasting-sheet.tsx`, `src/lib/cellar/lot-sheet.ts`.

- [ ] **Step 4: Commit (exact title: migration 2's header quotes it).**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/app/friends/actions.ts src/components/friend-button.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(friends): every friend button goes through the request RPCs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: FriendButton's four states on Community and on profiles

**Files:**
- Modify (overwrite): `src/components/friend-button.tsx`
- Modify: `src/app/community/community-list.tsx` (the `CommunityRow` type, the REVEAL comment, both `FriendButton` mounts)
- Modify: `src/app/community/page.tsx` (the parallel reads, each row's relationship)
- Modify: `src/app/u/[id]/page.tsx` (the relationship reads, the header mount)

**Interfaces:**
- Consumes: the Task 6 actions, `friendButtonLabel` (Task 5), `relationship()`/`Relationship` (Task 4), `TWO_TAP_WINDOW_MS` from `src/lib/console-copy.ts` (5000 ms).
- Produces: `FriendButton({ personId, relationship, variant?, className?, onDone? })`. The props `friendId` and `isFriend` are gone. `CommunityRow.relationship: Relationship` replaces `isFriend`. Task 10's bell mounts `FriendButton` with `relationship="incoming"` and `onDone`.

Spec §3.3's "card" variant is the phone/tablet card mount in `community-list.tsx`. It already uses `variant="row"` with 44 px targets (`min-h-11` below `md`), so the two variants stay `row | header`. Only "Add friend" gets the fine-pointer REVEAL fade in the laptop table. "Requested", "Friends" and the Accept/Decline pair are always visible.

- [ ] **Step 1: Rewrite the button.**

Overwrite the whole file with exactly this content.

Create `src/components/friend-button.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/app/friends/actions";
import { TWO_TAP_WINDOW_MS } from "@/lib/console-copy";
import { friendButtonLabel } from "@/lib/community/community-math";
import type { Relationship } from "@/lib/friends/relationship";
import type { FriendResult } from "@/lib/friends/types";
import { cn } from "@/lib/utils";

type Control = "single" | "accept" | "decline";

// The friend control for one other person (friend-requests spec §3.3), driven
// by one Relationship value:
// - none: "Add friend" (primary) sends a request;
// - requested: "Requested" (outline, Clock); a first tap arms "Tap again to
//   cancel" for TWO_TAP_WINDOW_MS, the second cancels;
// - incoming: "Accept" (primary) and "Decline" (quiet), both always shown;
// - friends: "Friends" (outline, Check); the same two-tap removes, for both.
// `variant="row"` is the Community table and cards (and the bell);
// `variant="header"` is /u/[id]'s header size. Every action revalidates the
// page, which brings the next relationship back as a prop; `onDone` runs
// after a success for a caller with its own list (the bell drops the row).
// A refusal is shown verbatim under the control.
export function FriendButton({
  personId,
  relationship,
  variant = "row",
  className,
  onDone,
}: {
  personId: string;
  relationship: Relationship;
  variant?: "row" | "header";
  className?: string;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Control | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);

  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  // The timeout above already clears armedAt once the window elapses, so
  // "armed" needs no impure clock read during render.
  const armed = armedAt !== null;

  function run(control: Control, action: () => Promise<FriendResult>) {
    setError(null);
    setBusy(control);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
      else onDone?.();
    });
  }

  const wrapperClass =
    variant === "row" ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1 md:items-end";
  const buttonClass =
    variant === "row" ? "min-h-11 gap-1.5 md:pointer-fine:min-h-8" : "min-h-11 gap-1.5 md:pointer-fine:min-h-9";
  const size = variant === "row" ? "sm" : "default";
  const errorLine = error ? <p className="text-sm text-destructive">{error}</p> : null;

  if (relationship === "incoming") {
    const accepting = pending && busy === "accept";
    const declining = pending && busy === "decline";
    return (
      <div className={wrapperClass}>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size={size}
            variant="default"
            disabled={pending}
            className={cn(buttonClass, className)}
            onClick={() => run("accept", () => acceptFriendRequest(personId))}
          >
            {accepting ? <WineGlassLoader /> : null}
            {friendButtonLabel({ relationship, control: "accept", pending: accepting, armed: false })}
          </Button>
          <Button
            type="button"
            size={size}
            variant="ghost"
            disabled={pending}
            className={cn(buttonClass, className)}
            onClick={() => run("decline", () => declineFriendRequest(personId))}
          >
            {declining ? <WineGlassLoader /> : null}
            {friendButtonLabel({ relationship, control: "decline", pending: declining, armed: false })}
          </Button>
        </div>
        {errorLine}
      </div>
    );
  }

  function handleClick() {
    if (relationship === "none") {
      run("single", () => sendFriendRequest(personId));
      return;
    }
    // Requested and Friends: the first tap only arms; the second, inside
    // TWO_TAP_WINDOW_MS, cancels or removes.
    if (!armed) {
      setArmedAt(Date.now());
      return;
    }
    setArmedAt(null);
    run("single", () =>
      relationship === "requested" ? cancelFriendRequest(personId) : removeFriend(personId),
    );
  }

  const icon = pending ? (
    <WineGlassLoader />
  ) : armed ? null : relationship === "friends" ? (
    <Check />
  ) : relationship === "requested" ? (
    <Clock />
  ) : null;

  return (
    <div className={wrapperClass}>
      <Button
        type="button"
        size={size}
        variant={relationship === "none" ? "default" : armed ? "destructive" : "outline"}
        disabled={pending}
        className={cn(buttonClass, className)}
        onClick={handleClick}
      >
        {icon}
        {friendButtonLabel({ relationship, pending, armed })}
      </Button>
      {errorLine}
    </div>
  );
}
```

- [ ] **Step 2: Community rows carry the relationship.**

In `src/app/community/community-list.tsx`:

Replace
```tsx
import { InvitePeopleButton } from "@/components/invite/invite-people-button";
import { cn } from "@/lib/utils";
```
with
```tsx
import { InvitePeopleButton } from "@/components/invite/invite-people-button";
import type { Relationship } from "@/lib/friends/relationship";
import { cn } from "@/lib/utils";
```

Replace
```tsx
  isMe: boolean;
  isFriend: boolean;
  showCellar: boolean;
```
with
```tsx
  isMe: boolean;
  /** The viewer's relationship to this person ("none" on the viewer's own row). */
  relationship: Relationship;
  showCellar: boolean;
```

Replace
```tsx
// R3: fades a row action in on hover/focus, only on a fine pointer, so a
// touch device at xl width (a tablet in landscape) always sees it. Applied
// to "Add friend" and "Cellar"; "Friends" is a state, not an action, and R1
// keeps it visible at rest.
```
with
```tsx
// R3: fades a row action in on hover/focus, only on a fine pointer, so a
// touch device at xl width (a tablet in landscape) always sees it. Applied
// to "Add friend" and "Cellar"; "Friends" and "Requested" are states, not
// actions, and the Accept / Decline pair is waiting on the viewer, so R1 and
// friend-requests §3.3 keep all three visible at rest.
```

Replace
```tsx
                    <FriendButton friendId={r.id} isFriend={r.isFriend} variant="row" />
```
with
```tsx
                    <FriendButton personId={r.id} relationship={r.relationship} variant="row" />
```

Replace
```tsx
                          <FriendButton
                            friendId={r.id}
                            isFriend={r.isFriend}
                            variant="row"
                            className={r.isFriend ? undefined : REVEAL}
                          />
```
with
```tsx
                          <FriendButton
                            personId={r.id}
                            relationship={r.relationship}
                            variant="row"
                            className={r.relationship === "none" ? REVEAL : undefined}
                          />
```

- [ ] **Step 3: The Community page reads friends, outgoing and incoming.**

In `src/app/community/page.tsx`:

Replace
```tsx
import { getBulkProfileSummaries } from "@/lib/profile-stats";
```
with
```tsx
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { relationship } from "@/lib/friends/relationship";
```

Replace
```tsx
  const [{ data: meRow }, { data: friendRows }, { count: peopleCount }, { count: activeCount }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("friendships").select("friend_id").eq("user_id", user.id),
      supabase.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("last_seen_at", activeSinceIso(now)),
    ]);

  const inviterName = meRow?.display_name ?? user.email ?? "";
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));
```
with
```tsx
  // Friend-requests §3.4: accepted friends (own friendships rows), the
  // requests the viewer sent and the ones waiting on them — one query each,
  // all readable as the viewer ("friend_requests read own"). A failed request
  // read just shows no pending state.
  const [
    { data: meRow },
    { data: friendRows },
    { data: outgoingRows },
    { data: incomingRows },
    { count: peopleCount },
    { count: activeCount },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
    supabase.from("friend_requests").select("recipient_id").eq("requester_id", user.id),
    supabase
      .from("friend_requests")
      .select("requester_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .order("requester_id", { ascending: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("last_seen_at", activeSinceIso(now)),
  ]);

  const inviterName = meRow?.display_name ?? user.email ?? "";
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));
  const outgoingIds = new Set((outgoingRows ?? []).map((r) => r.recipient_id));
  // Newest request first: the Requests view's order.
  const requestOrder = (incomingRows ?? []).map((r) => r.requester_id);
  const incomingIds = new Set(requestOrder);
```

Replace
```tsx
      isMe,
      isFriend: friendIds.has(p.id),
      showCellar: cellarLinkShown(p.cellar_visibility, isMe),
```
with
```tsx
      isMe,
      relationship: isMe
        ? "none"
        : relationship({
            friend: friendIds.has(p.id),
            outgoing: outgoingIds.has(p.id),
            incoming: incomingIds.has(p.id),
          }),
      showCellar: cellarLinkShown(p.cellar_visibility, isMe),
```

- [ ] **Step 4: The profile header reads the relationship both ways.**

In `src/app/u/[id]/page.tsx`:

Replace
```tsx
import { getProfileFavourites } from "@/lib/profile-favourites";
```
with
```tsx
import { getProfileFavourites } from "@/lib/profile-favourites";
import { relationship } from "@/lib/friends/relationship";
```

Replace
```tsx
  // R2/§3 step 4: friendship and the cellar gate are only meaningful for
  // someone else's profile; stats and favourites run either way. All in parallel.
  const [friendshipResult, cellarResult, stats, favourites] = await Promise.all([
    isOwnProfile
      ? Promise.resolve(null)
      : supabase
          .from("friendships")
          .select("id")
          .eq("user_id", user.id)
          .eq("friend_id", profile.id)
          .maybeSingle(),
    isOwnProfile ? Promise.resolve(null) : supabase.rpc("can_view_cellar", { p_owner: profile.id }),
    getProfileStats(profile.id),
    // Null on a failed read: the chips then simply do not render (D11).
    getProfileFavourites(supabase, profile.id),
  ]);
  const isFriend = Boolean(friendshipResult?.data);
```
with
```tsx
  // R2/§3 step 4: the relationship (friend-requests §3.5: the friendship, the
  // request the viewer sent, the request waiting on the viewer) and the
  // cellar gate are only meaningful for someone else's profile; stats and
  // favourites run either way. All in parallel.
  const [friendshipResult, outgoingResult, incomingResult, cellarResult, stats, favourites] =
    await Promise.all([
      isOwnProfile
        ? Promise.resolve(null)
        : supabase
            .from("friendships")
            .select("id")
            .eq("user_id", user.id)
            .eq("friend_id", profile.id)
            .maybeSingle(),
      isOwnProfile
        ? Promise.resolve(null)
        : supabase
            .from("friend_requests")
            .select("id")
            .eq("requester_id", user.id)
            .eq("recipient_id", profile.id)
            .maybeSingle(),
      isOwnProfile
        ? Promise.resolve(null)
        : supabase
            .from("friend_requests")
            .select("id")
            .eq("requester_id", profile.id)
            .eq("recipient_id", user.id)
            .maybeSingle(),
      isOwnProfile ? Promise.resolve(null) : supabase.rpc("can_view_cellar", { p_owner: profile.id }),
      getProfileStats(profile.id),
      // Null on a failed read: the chips then simply do not render (D11).
      getProfileFavourites(supabase, profile.id),
    ]);
  const friendState = relationship({
    friend: Boolean(friendshipResult?.data),
    outgoing: Boolean(outgoingResult?.data),
    incoming: Boolean(incomingResult?.data),
  });
```

Replace
```tsx
      <FriendButton friendId={profile.id} isFriend={isFriend} variant="header" />
```
with
```tsx
      <FriendButton personId={profile.id} relationship={friendState} variant="header" />
```

- [ ] **Step 5: Verify.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/components/friend-button.tsx src/app/community/community-list.tsx src/app/community/page.tsx "src/app/u/[id]/page.tsx" && npx vitest run src/lib/community src/lib/friends && grep -rn "isFriend\|friendId=" src/components/friend-button.tsx src/app/community "src/app/u/[id]/page.tsx"`
Expected: tsc and eslint print nothing; vitest `3 passed` files; the grep prints nothing.

- [ ] **Step 6: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/components/friend-button.tsx src/app/community/community-list.tsx src/app/community/page.tsx "src/app/u/[id]/page.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(friends): FriendButton request states on Community and profiles" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The Requests pill on /community

**Files:**
- Modify: `src/lib/community/community-math.ts`
- Modify: `src/lib/community/community-math.test.ts`
- Modify: `src/app/community/community-list.tsx`
- Modify: `src/app/community/page.tsx`

**Interfaces:**
- Consumes: Task 7's `requestOrder`/`incomingIds` in `page.tsx` and `CommunityRow.relationship` in the list.
- Produces: the Task 8 lines of the Interface Contracts (`CommunityView` gains `"requests"`, `communityPageLine(..., sort | null)`, `orderByIds`, `filterLabel("requests", n)`, `emptyCopy(view, q, { friends, requests })`). The URL contract gains `?tab=requests`. `/friends` and `/people` redirects are unchanged.

Decisions this task implements (spec §3.4):
- The Requests view lists requesters newest request first. That order lives in no profile column, so the view shows no Sort control, `?sort` does not reorder it, and its footer reads "1–3 of 3" without "· sorted by …". Search and paging work as in the Friends view.
- The pill reads "Requests" at zero and "Requests 3" otherwise.
- The view's empty state is "No requests right now." with only "Show everyone". A search that misses every requester reads "Nobody matches “x”" with "Clear search".

- [ ] **Step 1: Write the failing tests.**

In `src/lib/community/community-math.test.ts`:

Replace
```ts
  lastActive,
  pageCount,
```
with
```ts
  lastActive,
  orderByIds,
  pageCount,
```

Replace
```ts
  it("tab", () => {
    expect(parseCommunityParams({ tab: "friends" }).view).toBe("friends");
```
with
```ts
  it("tab", () => {
    expect(parseCommunityParams({ tab: "friends" }).view).toBe("friends");
    expect(parseCommunityParams({ tab: "requests" }).view).toBe("requests");
    expect(parseCommunityParams({ tab: ["requests", "friends"] }).view).toBe("requests");
```

Replace
```ts
  it("DEFAULT_SORT matches", () => {
    expect(DEFAULT_SORT).toEqual({ everyone: "active", friends: "name" });
  });
```
with
```ts
  it("DEFAULT_SORT matches", () => {
    expect(DEFAULT_SORT).toEqual({ everyone: "active", friends: "name", requests: "name" });
  });
```

Replace
```ts
  it("friends with no other params", () => {
    expect(communityHref({ view: "friends" })).toBe("/community?tab=friends");
  });
```
with
```ts
  it("friends with no other params", () => {
    expect(communityHref({ view: "friends" })).toBe("/community?tab=friends");
  });
  it("requests keeps the same parameter order", () => {
    expect(communityHref({ view: "requests" })).toBe("/community?tab=requests");
    expect(communityHref({ view: "requests", q: "anna", page: 2 })).toBe(
      "/community?tab=requests&q=anna&page=2",
    );
  });
```

Replace
```ts
  it("communityPageLine groups large numbers", () => {
```
with
```ts
  it("communityPageLine leaves the sort off for Requests (sort null)", () => {
    expect(communityPageLine(1, 25, 3, null)).toBe("1–3 of 3");
    expect(communityPageLine(2, 25, 30, null)).toBe("26–30 of 30");
  });
  it("communityPageLine groups large numbers", () => {
```

Replace
```ts
describe("filterLabel", () => {
  it("reads Everyone/Friends plus the count", () => {
    expect(filterLabel("everyone", 32)).toBe("Everyone 32");
    expect(filterLabel("friends", 0)).toBe("Friends 0");
  });
});
```
with
```ts
describe("filterLabel", () => {
  it("reads Everyone/Friends plus the count", () => {
    expect(filterLabel("everyone", 32)).toBe("Everyone 32");
    expect(filterLabel("friends", 0)).toBe("Friends 0");
  });
  it("shows the Requests count only when something is waiting", () => {
    expect(filterLabel("requests", 0)).toBe("Requests");
    expect(filterLabel("requests", 3)).toBe("Requests 3");
    expect(filterLabel("requests", 1234)).toBe("Requests 1,234");
  });
});

describe("orderByIds", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("puts rows in the order of ids (newest request first)", () => {
    expect(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("drops a row whose id is not listed, and ignores an id with no row", () => {
    expect(orderByIds(rows, ["b", "x", "a"]).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("keeps the first place of a repeated id", () => {
    expect(orderByIds(rows, ["a", "b", "a", "c"]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("does not change its input", () => {
    const input = [{ id: "b" }, { id: "a" }];
    orderByIds(input, ["a", "b"]);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
```

Replace
```ts
describe("emptyCopy", () => {
  it("friends with 0 friends, regardless of q", () => {
    expect(emptyCopy("friends", "", 0)).toEqual({
      title: "No friends yet",
      body:
        "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept.",
      actions: ["everyone", "invite"],
    });
    expect(emptyCopy("friends", "x", 0).title).toBe("No friends yet");
    expect(emptyCopy("friends", "x", 0).actions).toEqual(["everyone", "invite"]);
  });
  it("friends with a search and some friends", () => {
    expect(emptyCopy("friends", "x", 5)).toEqual({
      title: "None of your friends match “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with a search", () => {
    expect(emptyCopy("everyone", "x", 0)).toEqual({
      title: "Nobody matches “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with no search", () => {
    expect(emptyCopy("everyone", "", 0)).toEqual({
      title: "No one here yet",
      body: null,
      actions: ["invite"],
    });
  });
});
```
with
```ts
describe("emptyCopy", () => {
  const none = { friends: 0, requests: 0 };
  it("friends with 0 friends, regardless of q", () => {
    expect(emptyCopy("friends", "", none)).toEqual({
      title: "No friends yet",
      body:
        "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept.",
      actions: ["everyone", "invite"],
    });
    expect(emptyCopy("friends", "x", none).title).toBe("No friends yet");
    expect(emptyCopy("friends", "x", none).actions).toEqual(["everyone", "invite"]);
  });
  it("friends with a search and some friends", () => {
    expect(emptyCopy("friends", "x", { friends: 5, requests: 0 })).toEqual({
      title: "None of your friends match “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with a search", () => {
    expect(emptyCopy("everyone", "x", none)).toEqual({
      title: "Nobody matches “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with no search", () => {
    expect(emptyCopy("everyone", "", none)).toEqual({
      title: "No one here yet",
      body: null,
      actions: ["invite"],
    });
  });
  it("requests with nothing waiting, regardless of q", () => {
    const expected = { title: "No requests right now.", body: null, actions: ["everyone"] };
    expect(emptyCopy("requests", "", none)).toEqual(expected);
    expect(emptyCopy("requests", "x", none)).toEqual(expected);
  });
  it("requests waiting but none on screen and no search", () => {
    expect(emptyCopy("requests", "  ", { friends: 0, requests: 2 })).toEqual({
      title: "No requests right now.",
      body: null,
      actions: ["everyone"],
    });
  });
  it("requests waiting and a search that misses them all", () => {
    expect(emptyCopy("requests", "x", { friends: 0, requests: 2 })).toEqual({
      title: "Nobody matches “x”",
      body: null,
      actions: ["clear"],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/community/community-math.test.ts`
Expected: FAIL. `orderByIds` is not a function, `parseCommunityParams({ tab: "requests" }).view` is `"everyone"`, `filterLabel("requests", 0)` is `"Friends 0"`, the null-sort page line reads "sorted by undefined", and the Requests empty-state cases fail.

- [ ] **Step 3: Implement the math.**

In `src/lib/community/community-math.ts`:

Replace
```ts
export type CommunityView = "everyone" | "friends";
```
with
```ts
export type CommunityView = "everyone" | "friends" | "requests";
```

Replace
```ts
// R5: each view's own default when `?sort` is absent.
export const DEFAULT_SORT: Record<CommunityView, CommunitySort> = {
  everyone: "active",
  friends: "name",
};
```
with
```ts
// R5: each view's own default when `?sort` is absent. Requests never sorts by
// it: that view lists the newest request first (friend-requests spec §3.4,
// `orderByIds` below), an order no profile column holds, so it shows no Sort
// control; "name" only keeps the query builder's shape.
export const DEFAULT_SORT: Record<CommunityView, CommunitySort> = {
  everyone: "active",
  friends: "name",
  requests: "name",
};
```

Replace
```ts
  const view: CommunityView = firstParam(sp.tab) === "friends" ? "friends" : "everyone";
```
with
```ts
  const tab = firstParam(sp.tab);
  const view: CommunityView = tab === "friends" || tab === "requests" ? tab : "everyone";
```

Replace
```ts
  if (p.view === "friends") sp.set("tab", "friends");
```
with
```ts
  if (p.view !== "everyone") sp.set("tab", p.view);
```

Replace
```ts
export function communityPageLine(
  page: number,
  per: number,
  total: number,
  sort: CommunitySort,
): string {
  const from = (page - 1) * per + 1;
  const to = Math.min(page * per, total);
  return (
    `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ` +
    `${total.toLocaleString("en-US")} · sorted by ${sortedByWord(sort)}`
  );
}
```
with
```ts
// `sort` null (the Requests view, which has no Sort control) leaves the
// "sorted by" part off.
export function communityPageLine(
  page: number,
  per: number,
  total: number,
  sort: CommunitySort | null,
): string {
  const from = (page - 1) * per + 1;
  const to = Math.min(page * per, total);
  const range =
    `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ` +
    `${total.toLocaleString("en-US")}`;
  return sort === null ? range : `${range} · sorted by ${sortedByWord(sort)}`;
}

// The Requests view's order (friend-requests spec §3.4): `ids` is the
// requesters' ids, newest request first; rows come back from a profiles query
// in any order and leave in that one. A row whose id is not in `ids` is
// dropped.
export function orderByIds<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const rank = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  return rows
    .filter((r) => rank.has(r.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
```

Replace
```ts
export function filterLabel(view: CommunityView, count: number): string {
  const word = view === "everyone" ? "Everyone" : "Friends";
  return `${word} ${count.toLocaleString("en-US")}`;
}
```
with
```ts
// Everyone and Friends always show their count; Requests only when there is
// one waiting (friend-requests spec §3.4).
export function filterLabel(view: CommunityView, count: number): string {
  if (view === "requests") {
    return count > 0 ? `Requests ${count.toLocaleString("en-US")}` : "Requests";
  }
  const word = view === "everyone" ? "Everyone" : "Friends";
  return `${word} ${count.toLocaleString("en-US")}`;
}
```

Replace
```ts
export function emptyCopy(
  view: CommunityView,
  q: string,
  friendsCount: number,
): { title: string; body: string | null; actions: ("clear" | "everyone" | "invite")[] } {
  if (view === "friends" && friendsCount === 0) {
    return { title: "No friends yet", body: FRIENDS_EMPTY_BODY, actions: ["everyone", "invite"] };
  }
  const trimmed = q.trim();
```
with
```ts
const REQUESTS_EMPTY_TITLE = "No requests right now.";

// `counts` are the pill counts. Requests: with none waiting, or with no
// search, the empty list is "No requests right now." (a search that misses
// every requester reads like Everyone's miss, "Nobody matches …").
export function emptyCopy(
  view: CommunityView,
  q: string,
  counts: { friends: number; requests: number },
): { title: string; body: string | null; actions: ("clear" | "everyone" | "invite")[] } {
  if (view === "friends" && counts.friends === 0) {
    return { title: "No friends yet", body: FRIENDS_EMPTY_BODY, actions: ["everyone", "invite"] };
  }
  if (view === "requests" && (counts.requests === 0 || !q.trim())) {
    return { title: REQUESTS_EMPTY_TITLE, body: null, actions: ["everyone"] };
  }
  const trimmed = q.trim();
```

- [ ] **Step 4: Run the tests.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/community/community-math.test.ts`
Expected: `65 passed`. (`npx tsc --noEmit` still fails at this point, in `community-list.tsx`'s `emptyCopy` call. Steps 5-6 fix it.)

- [ ] **Step 5: The list: the pill, no Sort control on Requests, the footer, the empty state.**

In `src/app/community/community-list.tsx`:

Replace
```tsx
  counts: { everyone: number; friends: number };
```
with
```tsx
  /** The pill counts; `requests` is the requests waiting on the viewer. */
  counts: { everyone: number; friends: number; requests: number };
```

Replace
```tsx
  const empty = rows.length === 0 && !error ? emptyCopy(view, q, counts.friends) : null;
```
with
```tsx
  const empty = rows.length === 0 && !error ? emptyCopy(view, q, counts) : null;
```

Replace
```tsx
        <div className="flex items-center gap-1.5">
          <label htmlFor="community-sort" className="hidden text-sm text-muted-foreground md:inline">
            Sort
          </label>
          <select
            id="community-sort"
            aria-label="Sort"
            className={selectCls}
            value={sort}
            onChange={(e) => changeSort(e.target.value as CommunitySort)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
```
with
```tsx
        {/* Requests is always newest request first (friend-requests §3.4),
            an order none of the three sorts holds, so it has no Sort control. */}
        {view !== "requests" ? (
          <div className="flex items-center gap-1.5">
            <label htmlFor="community-sort" className="hidden text-sm text-muted-foreground md:inline">
              Sort
            </label>
            <select
              id="community-sort"
              aria-label="Sort"
              className={selectCls}
              value={sort}
              onChange={(e) => changeSort(e.target.value as CommunitySort)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
```

Replace
```tsx
              {filterLabel("friends", counts.friends)}
            </button>
```
with
```tsx
              {filterLabel("friends", counts.friends)}
            </button>
            <button
              type="button"
              aria-pressed={view === "requests"}
              onClick={() => switchView("requests")}
              className={pillCls(view === "requests")}
            >
              {filterLabel("requests", counts.requests)}
            </button>
```

Replace
```tsx
          <span>{communityPageLine(page, COMMUNITY_PAGE, total, sort)}</span>
```
with
```tsx
          <span>
            {communityPageLine(page, COMMUNITY_PAGE, total, view === "requests" ? null : sort)}
          </span>
```

- [ ] **Step 6: The page: the Requests query, newest first, and the count.**

In `src/app/community/page.tsx`:

Replace
```tsx
  lastActive,
  pageCount as computePageCount,
```
with
```tsx
  lastActive,
  orderByIds,
  pageCount as computePageCount,
```

Replace
```tsx
  if (params.view === "friends") {
    listQuery = listQuery.in("id", [...friendIds]);
  }
  const or = peopleSearchOr(params.q);
```
with
```tsx
  if (params.view === "friends") {
    listQuery = listQuery.in("id", [...friendIds]);
  } else if (params.view === "requests") {
    listQuery = listQuery.in("id", requestOrder);
  }
  const or = peopleSearchOr(params.q);
```

Replace
```tsx
  // Friends with no friends at all skips the query outright (§3.3) — an
  // empty `.in("id", [])` isn't wrong, it's just a round trip for a result
  // CommunityList already renders as its own empty state.
  const skipQuery = params.view === "friends" && friendIds.size === 0;
  if (!skipQuery) {
    const { data, count, error } = await listQuery.range(from, to);
```
with
```tsx
  // Friends with no friends at all (or Requests with none waiting) skips the
  // query outright (§3.3) — an empty `.in("id", [])` isn't wrong, it's just a
  // round trip for a result CommunityList already renders as its own empty
  // state.
  const skipQuery =
    (params.view === "friends" && friendIds.size === 0) ||
    (params.view === "requests" && incomingIds.size === 0);
  if (!skipQuery && params.view === "requests") {
    // Newest request first (friend-requests §3.4): an order no profile column
    // holds, so every requester comes back at once and is ordered and paged
    // here. Someone's pending requests are few; the sort above is unused.
    const { data, error } = await listQuery;
    if (error) {
      queryError = error.message;
    } else {
      const ordered = orderByIds(data ?? [], requestOrder);
      total = ordered.length;
      rows = ordered.slice(from, to + 1);
      if (rows.length === 0 && params.page > 1) {
        redirect(communityHref({ view: params.view, q: params.q, sort: params.sort, page: 1 }));
      }
    }
  } else if (!skipQuery) {
    const { data, count, error } = await listQuery.range(from, to);
```

Replace
```tsx
        counts={{ everyone: peopleCount ?? 0, friends: friendIds.size }}
```
with
```tsx
        counts={{ everyone: peopleCount ?? 0, friends: friendIds.size, requests: incomingIds.size }}
```

- [ ] **Step 7: Verify.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/lib/community/community-math.ts src/lib/community/community-math.test.ts src/app/community/community-list.tsx src/app/community/page.tsx && npx vitest run src/lib/community`
Expected: tsc and eslint print nothing; vitest `65 passed`.

- [ ] **Step 8: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/community/community-math.ts src/lib/community/community-math.test.ts src/app/community/community-list.tsx src/app/community/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(community): the Requests pill" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The bell's items and list rules (pure)

**Files:**
- Create: `src/lib/notification-items.ts`
- Create: `src/lib/notification-items.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the Task 9 block of the Interface Contracts. `PendingNotification` is spec §3.6's union, field for field.

- [ ] **Step 1: Write the failing test.**

Create `src/lib/notification-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SETTLED_HIDE_MS,
  friendRequestLine,
  mergeNotifications,
  notificationKey,
  visibleNotifications,
  withoutFriendRequest,
  type FriendRequestNotification,
  type TastingInviteNotification,
} from "./notification-items";

const tasting = (id: string): TastingInviteNotification => ({
  kind: "tasting",
  tastingId: id,
  tastingName: `Tasting ${id}`,
  hostName: "Anna",
});
const friend = (id: string, createdAt: string): FriendRequestNotification => ({
  kind: "friend",
  requesterId: id,
  requesterName: `Person ${id}`,
  avatarUrl: null,
  createdAt,
});

describe("mergeNotifications", () => {
  it("lists tasting invitations first, in their order, then friend requests newest first", () => {
    const merged = mergeNotifications(
      [tasting("t2"), tasting("t1")],
      [friend("a", "2026-09-20T10:00:00+00:00"), friend("b", "2026-09-24T10:00:00.123456+00:00")],
    );
    expect(merged.map(notificationKey)).toEqual(["tasting-t2", "tasting-t1", "friend-b", "friend-a"]);
  });

  it("breaks a created_at tie by requester id", () => {
    const at = "2026-09-24T10:00:00+00:00";
    expect(mergeNotifications([], [friend("z", at), friend("m", at)]).map(notificationKey)).toEqual([
      "friend-m",
      "friend-z",
    ]);
  });

  it("is empty when nothing is pending", () => {
    expect(mergeNotifications([], [])).toEqual([]);
  });
});

describe("friendRequestLine", () => {
  it("reads '{Name} wants to be friends'", () => {
    expect(friendRequestLine("Anna")).toBe("Anna wants to be friends");
  });
});

describe("withoutFriendRequest", () => {
  it("drops that requester's row and nothing else", () => {
    const list = [tasting("a"), friend("a", "2026-09-24T10:00:00+00:00"), friend("b", "2026-09-24T10:00:00+00:00")];
    expect(withoutFriendRequest(list, "a").map(notificationKey)).toEqual(["tasting-a", "friend-b"]);
  });
});

describe("visibleNotifications", () => {
  const list = [tasting("t"), friend("a", "2026-09-24T10:00:00+00:00"), friend("b", "2026-09-24T09:00:00+00:00")];
  const now = 1_000_000;

  it("hides a request answered here until SETTLED_HIDE_MS have passed", () => {
    const settled = new Map([["a", now - 1_000]]);
    expect(visibleNotifications(list, settled, now).map(notificationKey)).toEqual(["tasting-t", "friend-b"]);
    expect(
      visibleNotifications(list, settled, now - 1_000 + SETTLED_HIDE_MS).map(notificationKey),
    ).toEqual(["tasting-t", "friend-a", "friend-b"]);
  });

  it("never hides a tasting invitation, and hides nothing with nothing settled", () => {
    expect(visibleNotifications(list, new Map([["t", now]]), now).map(notificationKey)).toEqual([
      "tasting-t",
      "friend-a",
      "friend-b",
    ]);
    expect(visibleNotifications(list, new Map(), now)).toEqual(list);
  });

  it("is 60 seconds", () => {
    expect(SETTLED_HIDE_MS).toBe(60_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/notification-items.test.ts`
Expected: FAIL, `Failed to resolve import "./notification-items"`.

- [ ] **Step 3: Implement.**

Create `src/lib/notification-items.ts`:

```ts
// The header bell's items and their pure list rules (friend-requests spec
// §3.6). A plain module on purpose: src/lib/notifications.ts is "use server"
// and may export only async functions, so the types the bell and AppHeader
// share live here. No imports: vitest loads it directly.

export type TastingInviteNotification = {
  kind: "tasting";
  tastingId: string;
  tastingName: string;
  hostName: string;
};

export type FriendRequestNotification = {
  kind: "friend";
  requesterId: string;
  requesterName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type PendingNotification = TastingInviteNotification | FriendRequestNotification;

/** Tasting invitations first, in the order given; then friend requests,
 *  newest first (ties by requester id, so the order never flickers). */
export function mergeNotifications(
  tastings: readonly TastingInviteNotification[],
  friends: readonly FriendRequestNotification[],
): PendingNotification[] {
  const newestFirst = [...friends].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      (a.requesterId < b.requesterId ? -1 : a.requesterId > b.requesterId ? 1 : 0),
  );
  return [...tastings, ...newestFirst];
}

export function friendRequestLine(name: string): string {
  return `${name} wants to be friends`;
}

export function notificationKey(n: PendingNotification): string {
  return n.kind === "tasting" ? `tasting-${n.tastingId}` : `friend-${n.requesterId}`;
}

export function withoutFriendRequest(
  list: readonly PendingNotification[],
  requesterId: string,
): PendingNotification[] {
  return list.filter((n) => !(n.kind === "friend" && n.requesterId === requesterId));
}

/** How long a request answered in the bell stays hidden from poll results: a
 *  poll that left before the answer landed must not bring the row back. */
export const SETTLED_HIDE_MS = 60_000;

/** A poll's list minus the friend requests answered here in the last
 *  SETTLED_HIDE_MS (`settled` maps requester id → when it was answered). */
export function visibleNotifications(
  list: readonly PendingNotification[],
  settled: ReadonlyMap<string, number>,
  nowMs: number,
): PendingNotification[] {
  return list.filter((n) => {
    if (n.kind !== "friend") return true;
    const at = settled.get(n.requesterId);
    return at === undefined || nowMs - at >= SETTLED_HIDE_MS;
  });
}
```

- [ ] **Step 4: Run it.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/notification-items.test.ts && npx eslint src/lib/notification-items.ts src/lib/notification-items.test.ts`
Expected: `8 passed`; eslint prints nothing.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/notification-items.ts src/lib/notification-items.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(notifications): bell items for friend requests" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Friend requests in the bell, answered inline

**Files:**
- Modify (overwrite): `src/lib/notifications.ts`
- Modify (overwrite): `src/components/notifications-bell.tsx`
- Modify: `src/components/app-header.tsx` (two lines: the variable and the bell's prop)

**Interfaces:**
- Consumes: Task 9's module; `FriendButton` with `relationship="incoming"` and `onDone` (Task 7); `invitePollIntervalMs` (unchanged: it takes any list, so it now counts both kinds).
- Produces: `getPendingInvites(): Promise<PendingNotification[]>` (tasting invitations, then friend requests newest first, deleted requesters left out); `NotificationsBell({ notifications, className? })`. `InviteNotification` is removed; nothing else imports it (`grep -rn InviteNotification src` is empty after this task).

The polling cadence and its cost rule are unchanged. The friend-request read runs in parallel with the tasting one, so a tick costs one query more and no extra wait. The dropdown keeps its "Invitations" heading and "No pending invitations." line, with tasting invitations first. A friend request row shows the avatar and "{Name} wants to be friends" (linking to their profile), with Accept / Decline underneath. A successful answer removes the row at once and hides it from polls for `SETTLED_HIDE_MS`. The Overview invitation card and /taste's InvitationsBand stay tasting-only (they do not use this action).

- [ ] **Step 1: The server action returns both kinds.**

Overwrite the whole file with exactly this content.

Create `src/lib/notifications.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import {
  mergeNotifications,
  type FriendRequestNotification,
  type PendingNotification,
  type TastingInviteNotification,
} from "@/lib/notification-items";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Everything waiting on the current user, for the header's notifications
// bell: pending tasting invitations, then friend requests (friend-requests
// spec §3.6). A "use server" action (not just a plain helper) so the
// client-side bell can call it directly on a poll interval, not only on the
// initial server render — otherwise a new invite only appeared after a full
// page reload. The item types live in src/lib/notification-items.ts: this
// module exports only async functions.
export async function getPendingInvites(): Promise<PendingNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [tastings, friends] = await Promise.all([
    pendingTastingInvites(supabase, user.id),
    pendingFriendRequests(supabase, user.id),
  ]);
  return mergeNotifications(tastings, friends);
}

// A finished (CLOSED) tasting can no longer be accepted (spec §D.4 #5), so
// its leftover invite is not a notification.
async function pendingTastingInvites(
  supabase: Supabase,
  userId: string,
): Promise<TastingInviteNotification[]> {
  const { data: invitedRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id")
    .eq("user_id", userId)
    .eq("status", "INVITED");
  const invitedIds = (invitedRows ?? []).map((r) => r.tasting_id);
  if (invitedIds.length === 0) return [];

  const { data: tastings } = await supabase
    .from("tastings")
    .select("id, name, host_id, status")
    .in("id", invitedIds);
  const open = (tastings ?? []).filter((t) => t.status !== "CLOSED");
  if (open.length === 0) return [];

  const hostIds = [...new Set(open.map((t) => t.host_id))];
  const { data: hosts } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", hostIds);
  const hostNameById = new Map((hosts ?? []).map((h) => [h.id, h.display_name]));

  return open.map((t) => ({
    kind: "tasting" as const,
    tastingId: t.id,
    tastingName: t.name,
    hostName: hostNameById.get(t.host_id) ?? "Someone",
  }));
}

// Requests waiting on the user ("friend_requests read own"), with the
// requester's directory name and avatar. A deleted requester is left out
// (account deletion removes their requests anyway), and a failed read is an
// empty list, never a broken bell.
async function pendingFriendRequests(
  supabase: Supabase,
  userId: string,
): Promise<FriendRequestNotification[]> {
  const { data: requests } = await supabase
    .from("friend_requests")
    .select("requester_id, created_at")
    .eq("recipient_id", userId);
  if (!requests || requests.length === 0) return [];

  const { data: people } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      requests.map((r) => r.requester_id),
    )
    .is("deleted_at", null);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return requests.flatMap((r) => {
    const person = byId.get(r.requester_id);
    return person
      ? [
          {
            kind: "friend" as const,
            requesterId: person.id,
            requesterName: person.display_name,
            avatarUrl: person.avatar_url,
            createdAt: r.created_at,
          },
        ]
      : [];
  });
}
```

- [ ] **Step 2: The bell.**

Overwrite the whole file with exactly this content.

Create `src/components/notifications-bell.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FriendButton } from "@/components/friend-button";
import { cn } from "@/lib/utils";
import { getPendingInvites } from "@/lib/notifications";
import {
  friendRequestLine,
  notificationKey,
  visibleNotifications,
  withoutFriendRequest,
  type PendingNotification,
} from "@/lib/notification-items";
import { invitePollIntervalMs } from "@/lib/notifications-poll";

// A helper (not an inline Date.now()) keeps the clock read out of the React
// purity lint's reach — the same pattern community/page.tsx's nowMs uses. It
// only ever runs in a poll callback or after an Accept/Decline tap.
function nowMs(): number {
  return Date.now();
}

/**
 * Bell in the app header: pending tasting invitations, then friend requests
 * (friend-requests spec §3.6). Polls getPendingInvites directly (not
 * router.refresh()) while the tab is visible, so a new item shows up on its
 * own instead of only after a manual page reload — and without re-rendering
 * the whole page the way a full refresh would. The count badge counts both
 * kinds and is always rendered (fixed size) so it never shifts layout. A
 * tasting invitation links into the lobby, where you accept or decline; a
 * friend request is answered right here (Accept / Decline) and its row
 * leaves on success.
 *
 * Cadence comes from invitePollIntervalMs: 15s while something is pending,
 * 90s when nothing is. Measured on production 2026-09-20, the old flat 15s
 * tick was the app's biggest background cost — one 575-2,773ms server action
 * every 15s on EVERY page, almost always to be told there is nothing. The
 * slow tick is safe because focus and visibilitychange re-check immediately,
 * which is when an invitation received elsewhere actually has to appear. One
 * request at a time, so a slow response never stacks on the next tick.
 */
export function NotificationsBell({
  notifications: initialNotifications,
  className,
}: {
  notifications: PendingNotification[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  // Friend requests answered in this bell (requester id → when): a poll that
  // left before the answer landed must not bring the row back.
  const settled = useRef(new Map<string, number>());

  const inFlight = useRef(false);
  const check = useCallback(() => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    inFlight.current = true;
    getPendingInvites()
      .then((list) => setNotifications(visibleNotifications(list, settled.current, nowMs())))
      .catch(() => {
        // A transient failure just means the bell doesn't update this tick.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  const intervalMs = invitePollIntervalMs(notifications);
  useEffect(() => {
    const id = setInterval(check, intervalMs);
    const onWake = () => check();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [check, intervalMs]);

  function settle(requesterId: string) {
    settled.current.set(requesterId, nowMs());
    setNotifications((list) => withoutFriendRequest(list, requesterId));
  }

  const count = notifications.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${count ? ` (${count} pending)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className={cn("relative", className)}
      >
        <Bell />
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 top-16 z-50 rounded-xl border border-border bg-popover p-2 shadow-lg md:absolute md:inset-x-auto md:top-auto md:right-0 md:mt-2 md:w-72">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Invitations
            </p>
            {count === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="flex flex-col">
                {notifications.map((n) => (
                  <li key={notificationKey(n)}>
                    {n.kind === "tasting" ? (
                      <Link
                        href={`/tastings/${n.tastingId}`}
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-2 hover:bg-muted"
                      >
                        <span className="text-sm font-medium">{n.tastingName}</span>
                        <span className="text-xs text-muted-foreground">
                          Invited by {n.hostName} — tap to respond
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg px-2 py-2">
                        <Avatar src={n.avatarUrl} name={n.requesterName} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Link
                            href={`/u/${n.requesterId}`}
                            onClick={() => setOpen(false)}
                            className="text-sm font-medium break-words hover:underline"
                          >
                            {friendRequestLine(n.requesterName)}
                          </Link>
                          <FriendButton
                            personId={n.requesterId}
                            relationship="incoming"
                            variant="row"
                            onDone={() => settle(n.requesterId)}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: AppHeader passes the list.**

In `src/components/app-header.tsx`:

Replace
```tsx
  const [invites, active] = await Promise.all([
```
with
```tsx
  const [notifications, active] = await Promise.all([
```

Replace
```tsx
          <NotificationsBell invites={invites} className={ICON_BUTTON} />
```
with
```tsx
          <NotificationsBell notifications={notifications} className={ICON_BUTTON} />
```

- [ ] **Step 4: Verify.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/lib/notifications.ts src/components/notifications-bell.tsx src/components/app-header.tsx && npx vitest run src/lib/notification-items.test.ts src/lib/notifications-poll.test.ts && grep -rnw "InviteNotification" src; grep -rn "NotificationsBell invites" src`
Expected: tsc and eslint print nothing. The bell reads the clock only through its module-level `nowMs()`, because an inline `Date.now()` in `settle` trips the `react-hooks/purity` rule. vitest reports `2 passed` files. Both greps print nothing (`-w`, so `TastingInviteNotification` does not count).

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/notifications.ts src/components/notifications-bell.tsx src/components/app-header.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(notifications): friend requests in the bell, answered inline" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Delete-account copy names friend requests

**Files:**
- Modify: `src/lib/account/delete-copy.ts` (line 20)
- Modify: `src/lib/account/delete-copy.test.ts` (line 42)

**Interfaces:**
- Consumes: nothing. Produces: `DELETED_LIST_ITEMS[3] === "Your friends list, friend requests and invite links"` (the scrub deletes requests both ways since Task 1).

- [ ] **Step 1: Write the failing test.**

In `src/lib/account/delete-copy.test.ts`:

Replace
```ts
      "Your friends list and invite links",
```
with
```ts
      "Your friends list, friend requests and invite links",
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/account/delete-copy.test.ts`
Expected: FAIL in "dialog title and lists, in order" (`"Your friends list and invite links"` vs the new line).

- [ ] **Step 3: Implement.**

In `src/lib/account/delete-copy.ts`:

Replace
```ts
  "Your friends list and invite links",
```
with
```ts
  "Your friends list, friend requests and invite links",
```

- [ ] **Step 4: Run it.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/account`
Expected: every file passes (`delete-copy`, `delete-account`, `account-deletion-migration`).

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/account/delete-copy.ts src/lib/account/delete-copy.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(account): delete-account copy names friend requests" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`: the Community redesign bullet (about lines 349-361), the one-way friends bullet (lines 396-399), the Platform invites bullet (line 424), the Account deletion bullet (line 464) and the notifications bell bullet (lines 1189-1195).

**Interfaces:** documentation only.

- [ ] **Step 1: Apply the edits.**

In `CLAUDE.md`:

Replace
```md
  `src/lib/community/community-math.ts`. The URL contract: `?tab=friends`
  (still the only way to open Friends; `/friends` and `/people` still
  redirect in), `?q`, `?sort` (`active`/`name`/`joined`, each view has its
  own default when absent) and `?page`. A row action's steady state (the
```
with
```md
  `src/lib/community/community-math.ts`. The URL contract: `?tab=friends`
  (still the only way to open Friends; `/friends` and `/people` still
  redirect in), `?tab=requests` (the friend requests waiting on you, newest
  first, no Sort control; 2026-09-24), `?q`, `?sort` (`active`/`name`/`joined`,
  each view has its own default when absent) and `?page`. A row action's steady state (the
```

Replace
```md
  `/u/[id]`'s own remove button stays one-tap. There is still no mutual-
  friends count: `friendships` has exactly one SELECT policy (`user_id =
  auth.uid()`), so a read of someone else's friendships always comes back
  empty — a real count needs a SECURITY DEFINER RPC, out of scope here.
```
with
```md
  `/u/[id]`'s own remove button stays one-tap. There is still no mutual-
  friends count: `friendships` has exactly one SELECT policy (`user_id =
  auth.uid()`), so a read of someone else's friendships always comes back
  empty — a real count needs a SECURITY DEFINER RPC, out of scope here.
  (Since friend requests, 2026-09-24, the other direction of a PENDING
  relationship is readable, through `friend_requests`, where both sides read
  their own request rows; an accepted friendship is still readable only as
  your own `friendships` rows.)
```

Replace
```md
- Friends (`friendships` table) are one-way, no accept/request flow — adding
  a friend is unilateral, like saving a contact (confirmed with the user).
  A user only ever sees/manages rows where they are `user_id`; there's no
  notion of the other side consenting or even being notified.
```
with
```md
- **Reversed** (spec `docs/superpowers/specs/2026-09-24-friend-requests-design.md`,
  owner 2026-09-24): friends are no longer one-way. The old rule (adding a
  friend is unilateral, like saving a contact; nobody is asked or notified)
  is gone; see "Friend requests" below. `friendships` still has exactly one
  SELECT policy (`user_id = auth.uid()`), so a read of it still returns only
  your own rows.
- **Friend requests** (2026-09-24, spec above; migrations
  `20260925003000_friend_requests.sql`, then the app deploy, then
  `20260925004000_friend_requests_lockdown.sql`, the M9a/M9b two-step). A
  friendship exists only once the other person accepts, and it is always a
  PAIR of `friendships` rows (A→B and B→A): the pair invariant, asserted by
  004000's post-state. Every friend benefit needs it: the Friends pill and
  band, the tasting-invite friend pickers, "by friends" ratings on a lot, and
  a FRIENDS cellar through `can_view_cellar`, which was deliberately NOT
  changed (with pairs, "a row in either direction" means "friends"; its md5
  pins in the rule-1 migrations stay valid). A pending request grants
  nothing. Requests live in `friend_requests` (one per direction; the
  requester and the recipient read it, "friend_requests read own";
  `authenticated` holds SELECT only, anon nothing). Every write goes through
  five SECURITY DEFINER RPCs, EXECUTE for `authenticated` only (revoked from
  PUBLIC, anon and service_role): `send_friend_request(p_to)` returns
  `'requested'`, `'accepted'` (the other person had already asked, so it
  accepts) or `'friends'`; `cancel_friend_request(p_to)`;
  `accept_friend_request(p_from)` (deletes both directions, writes the pair;
  "no request to accept"); `decline_friend_request(p_from)` (quiet: deletes,
  tells nobody, and the requester may ask again); `remove_friend(p_other)`
  (deletes both rows). Each takes a transaction advisory lock on the pair and
  reads the other profile FOR KEY SHARE (it waits out an account-deletion
  scrub); refusals "not signed in", "you cannot be your own friend", "that
  account has been deleted". Since 004000 no client role holds
  INSERT/UPDATE/DELETE on `friendships` ("friendships insert own" and
  "friendships delete own" are dropped); only the five RPCs,
  `accept_platform_invite` (still instant and both ways, and it clears any
  pending request between the two) and `scrub_deleted_account` (deletes the
  person's requests both ways, on every call) write it. A new writer must
  keep the pair invariant and touch `friend_requests` before `friendships`
  (the lock order every writer uses). `refuse_deleted_profile_link()` also
  reads `requester_id`/`recipient_id` (trigger
  `friend_requests_refuse_deleted_profile`). App: `src/app/friends/actions.ts`
  (`sendFriendRequest`, `cancelFriendRequest`, `acceptFriendRequest`,
  `declineFriendRequest`, `removeFriend`; `addFriend` is retired; the types
  live in `src/lib/friends/types.ts`), the pure `relationship()`
  (`src/lib/friends/relationship.ts`: friends, then incoming, then requested,
  else none) that every surface derives its control from, and
  `FriendButton({ personId, relationship })`: "Add friend", "Requested"
  (two-tap "Tap again to cancel"), "Accept" · "Decline", "Friends" (two-tap
  "Tap again to remove"), labels from `community-math.ts`'s
  `friendButtonLabel`. A request is seen in the header bell ("{Name} wants to
  be friends", answered inline), in /community's **Requests** pill
  (`?tab=requests`: newest request first, no Sort control, "No requests right
  now.") and on the requester's /u/[id] header. No email: the app cannot mail
  an existing member. `scripts/friend-requests.test.mjs` is the database
  suite (production, always rolled back, on throwaway profiles;
  `FRIEND_REQUESTS_APPLY` dry-runs a migration that is not live yet).
```

Replace
```md
  `service_role` — writes the two `friendships` rows idempotently and counts
  a use). A friendship is never written on a bare page load: opening
```
with
```md
  `service_role` — writes the two `friendships` rows idempotently, deletes
  any pending friend request between the two either way (friend requests,
  2026-09-24: an invite link stays instant) and counts
  a use). A friendship is never written on a bare page load: opening
```

Replace
```md
  and consumptions, friendships both ways, platform invites, drafts, pour
```
with
```md
  and consumptions, friendships and friend requests both ways, platform invites, drafts, pour
```

Replace
```md
  after a full manual page reload. `AppHeader` still calls the same function
  for the initial server-rendered count, so there's one source of truth.
```
with
```md
  after a full manual page reload. `AppHeader` still calls the same function
  for the initial server-rendered count, so there's one source of truth.
  Since friend requests (2026-09-24) it returns `PendingNotification[]`
  (`src/lib/notification-items.ts`, a plain module because the action's file
  is `"use server"`): tasting invitations, then friend requests newest first,
  which the bell answers inline (Accept / Decline through `FriendButton`; an
  answered row stays hidden from polls for `SETTLED_HIDE_MS`). The badge
  counts both; the cadence rule is unchanged.
```

- [ ] **Step 2: Verify.**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && grep -n "one-way, no accept\|Friend requests\*\*\|tab=requests\|friendships and friend requests both ways\|PendingNotification" CLAUDE.md`
Expected: no "one-way, no accept" line. One line for the new "**Friend requests**" bullet. Two for `?tab=requests` (the Community bullet and the new bullet). One for "friendships and friend requests both ways". One for `PendingNotification`.

- [ ] **Step 3: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: friend requests in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase 3: rollout (main session only)

`$SCRATCH` below is `/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad`. Set it in every command block, because shell state does not persist between calls. `$SCRATCH/apply-migration.mjs` (the main session's; a copy sits untracked at `scripts/apply-migration.mjs`) applies one migration file in one transaction and records it in `supabase_migrations.schema_migrations`. With `--dry` it runs the whole file inside BEGIN … ROLLBACK against live. `$SCRATCH/deploy-watch.sh <sha>` polls the Vercel commit status. Every live database step needs the owner's go-ahead first, as every earlier live migration in this repo had.

### Task 13: Migration 1 live, then the app deploy (main session only)

**Files:** no repository changes except the rebase. Evidence goes to `$SCRATCH/fr-*.txt`.

**Interfaces:**
- Consumes: Tasks 1-12.
- Produces: migration 1 live, and the app on production.

An implementer subagent stops before this task.

- [ ] **Step 1: Branch gate.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && git fetch origin && git status --short && git rebase origin/master && git log --oneline origin/master..HEAD && git rev-parse origin/master > "$SCRATCH/fr-pre-deploy.txt" && npx vitest run && npx tsc --noEmit && npx eslint src/app/friends/actions.ts src/components/friend-button.tsx src/components/notifications-bell.tsx src/components/app-header.tsx src/lib/notifications.ts src/lib/notification-items.ts src/lib/friends src/lib/community src/app/community "src/app/u/[id]/page.tsx" src/lib/account/delete-copy.ts scripts/friend-requests.test.mjs scripts/cellar-social.test.mjs && npx next build
```

Expected:
- `git status` shows only `?? scripts/apply-migration.mjs`.
- The rebase replays the branch onto `origin/master`. At plan time that had moved two commits past the branch point (2ddc479, b6812bd; their CLAUDE.md edit is in the banner and console bullets, away from Task 12's).
- `git log` lists the spec commit, the plan commit and Tasks 1-12.
- vitest: 0 failures, 181 files, 3,690 tests (3,653 at base, plus 37 from this plan, plus whatever the rebased commits add).
- tsc and eslint are clean, and `next build` succeeds.

- [ ] **Step 2: Read live, read-only.**

Create `$SCRATCH/fr-live-state.mjs` with the Write tool:

```js
// Read-only snapshot of the friend-request rollout. Run from the worktree root:
//   node --env-file=.env.local "$SCRATCH/fr-live-state.mjs"
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const pg = createRequire(path.join(process.cwd(), "package.json"))("pg");
const { pgConfig } = await import(pathToFileURL(path.join(process.cwd(), "scripts/wine-map-tiles/lib.mjs")).href);
const c = new pg.Client(pgConfig());
await c.connect();
const one = async (sql) => (await c.query(sql)).rows[0];
try {
  await c.query("begin read only");
  console.log(await one(`select count(*)::int as friendships,
      count(*) filter (where not exists (select 1 from friendships r
        where r.user_id = f.friend_id and r.friend_id = f.user_id))::int as one_way
    from friendships f`));
  const t = (await one("select to_regclass('public.friend_requests')::text as t")).t;
  console.log({ friend_requests_table: t });
  if (t) console.log(await one("select count(*)::int as pending_requests from friend_requests"));
  console.log(await one(`select string_agg(p.polname::text, ', ' order by p.polname::text) as friendships_policies
    from pg_policy p where p.polrelid = 'public.friendships'::regclass`));
  console.log(await one(`select has_table_privilege('authenticated', 'public.friendships', 'INSERT') as client_inserts_friendships`));
  console.log((await c.query(`select version from supabase_migrations.schema_migrations
    where version >= '20260920000000' order by version`)).rows.map((r) => r.version));
} finally {
  await c.query("rollback");
  await c.end();
}
```

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local "$SCRATCH/fr-live-state.mjs" | tee "$SCRATCH/fr-state-before-m1.txt"
```

Expected (2026-09-24 reading): `friendships: 44, one_way: 16`, `friend_requests_table: null`, all three friendships policies, `client_inserts_friendships: true`, and no `2026092500*` version. If `one_way` differs, note the new number: it is what migration 2 will move.

- [ ] **Step 3: Dry-run migration 1 and the suite against live (rolled back).**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad && node --env-file=.env.local "$SCRATCH/apply-migration.mjs" supabase/migrations/20260925003000_friend_requests.sql --dry && FRIEND_REQUESTS_APPLY=supabase/migrations/20260925003000_friend_requests.sql node --env-file=.env.local --test scripts/friend-requests.test.mjs && FRIEND_REQUESTS_APPLY=supabase/migrations/20260925003000_friend_requests.sql,supabase/migrations/20260925004000_friend_requests_lockdown.sql node --env-file=.env.local --test scripts/friend-requests.test.mjs && node --env-file=.env.local --test scripts/cellar-social.test.mjs
```

Expected:
- `DRY RUN OK: 20260925003000_friend_requests ...`.
- The first suite run: `pass 11`, `skipped 2`, `fail 0`.
- The second: `pass 13`, `fail 0`.
- cellar-social: `pass 5`.

A failure here changes nothing live. Fix the task that owns the failing code and re-run this step. A pre-state message means live moved since 2026-09-24: re-read it before changing any pinned value.

- [ ] **Step 4: Owner go-ahead, then apply migration 1.**

Tell the owner: the migration is additive (a new table, five new functions, `accept_platform_invite` and the account-deletion scrub each recreated with one line). The deployed app is unaffected. Also name the two strings flagged in Global Constraints. On a yes:

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && npx supabase db push --db-url "$(node --env-file=.env.local -e "process.stdout.write(process.env.DATABASE_URL)")" --dry-run
```

- If it lists exactly `20260925003000_friend_requests.sql`: run the same command without `--dry-run`.
- If it refuses because remote and local histories differ (the reason `apply-migration.mjs` exists) or lists anything else: do not push. Run `SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad && cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local "$SCRATCH/apply-migration.mjs" supabase/migrations/20260925003000_friend_requests.sql` instead.

Expected: `APPLIED: 20260925003000_friend_requests ...` (or the CLI's success line). The post-state ran inside the same transaction, so success means every assert held.

- [ ] **Step 5: Verify migration 1 live.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local "$SCRATCH/fr-live-state.mjs" | tee "$SCRATCH/fr-state-after-m1.txt" && node --env-file=.env.local --test scripts/friend-requests.test.mjs && node --env-file=.env.local --test scripts/cellar-social.test.mjs
```

Expected:
- `friend_requests_table: 'friend_requests'` with `pending_requests: 0`, and friendships unchanged (44 / 16, all three policies, `client_inserts_friendships: true`).
- `20260925003000` is recorded.
- The suite reports `pass 11`, `skipped 2`, and cellar-social `pass 5`.
- The deployed (old) site still adds and removes friends through its direct writes.

- [ ] **Step 6: Deploy the app.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && git fetch origin && test "$(git rev-parse origin/master)" = "$(cat "$SCRATCH/fr-pre-deploy.txt")" && echo "master unchanged since Step 1" && git push origin friend-requests:master && bash "$SCRATCH/deploy-watch.sh" "$(git rev-parse HEAD)"
```

Expected:
- "master unchanged since Step 1".
- The push is a fast-forward.
- `deploy-watch.sh` ends on `success`.

If the test prints nothing, `master` moved: go back to Step 1. Never update the local `master` ref (it is the owner's checkout's branch).

- [ ] **Step 7: Smoke on https://blindrapp.vercel.app with two demo accounts (A and B, two browser sessions minted by magic link as usual).**
  1. A opens /community. B's row shows "Add friend" (on a laptop it fades in on hover). A taps it: "Sending…", then "Requested" with a clock.
  2. A taps "Requested": it reads "Tap again to cancel" in red. A taps again: "Cancelling…", then "Add friend". A sends again: "Requested".
  3. B (focus the tab, or wait at most 90 s): the bell badge goes up by one. The dropdown lists "{A's name} wants to be friends" with Accept / Decline. /community shows "Requests 1". The Requests view lists A newest first with Accept / Decline, with no Sort control and a footer of "1–1 of 1". A's /u page header shows Accept / Decline.
  4. B taps Decline in the bell: "Declining…", then the row leaves and the badge drops. A reloads /u/B: "Add friend".
  5. A sends again. B taps Accept on /u/A: "Friends". Both see each other under Friends, and the band's friends count went up by one. The Requests pill reads "Requests" with no number.
  6. B taps "Friends", then "Tap again to remove": "Add friend", and A's view of B reads "Add friend" after a reload.
  7. Clean up. Read-only: `select count(*) from friend_requests` and the demo pair's `friendships` rows are 0. If not, remove them through the UI.
- The console shows no new error, apart from the known one-off stale "useAddWine must be used within <AddWineProvider>" after a hash login (CLAUDE.md).

- [ ] **Step 8: Only if Step 7 failed: revert the app, keep migration 1.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && git revert --no-commit "$(cat "$SCRATCH/fr-pre-deploy.txt")"..HEAD && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "revert: friend requests app (smoke failed; migration 1 stays, it is additive)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin friend-requests:master
```

Migration 1 needs no rollback: the old app never calls its functions, and `friend_requests` stays empty. Do not apply migration 2 while the reverted app is live.

- [ ] **Step 9: The stale-page path.** B opens /u/A and leaves it open ("Add friend"). A sends B a request. B, without reloading, taps "Add friend": it ends on "Friends" (the RPC's `'accepted'`), and no request is left between them (read-only count 0). Remove the friendship again.

---

### Task 14: Migration 2 live (main session only)

**Files:** none.

**Interfaces:**
- Consumes: Task 13's deploy live.
- Produces: every `friendships` row in a pair, the one-way rows as pending requests, and no client write on `friendships`.

- [ ] **Step 1: Deploy gate.** Confirm production serves a build that contains the commit titled `feat(friends): every friend button goes through the request RPCs`:

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git fetch origin && git log --oneline origin/master | grep -F "feat(friends): every friend button goes through the request RPCs" && gh api "repos/christianolin/blindtastingapp/commits/$(git rev-parse origin/master)/status" --jq '.state'
```

Expected: one matching line, and `success`. If Task 13 Step 8 reverted the app, stop: migration 2 would break the live "Add friend".

- [ ] **Step 2: Read live, and dry-run migration 2 with the suite (rolled back).**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local "$SCRATCH/fr-live-state.mjs" | tee "$SCRATCH/fr-state-before-m2.txt" && node --env-file=.env.local "$SCRATCH/apply-migration.mjs" supabase/migrations/20260925004000_friend_requests_lockdown.sql --dry && FRIEND_REQUESTS_APPLY=supabase/migrations/20260925004000_friend_requests_lockdown.sql node --env-file=.env.local --test scripts/friend-requests.test.mjs
```

Expected:
- `one_way` is the number migration 2 will move (16 on 2026-09-24, unless someone added a friend one-way on the old app between the Step 2 read and the deploy). `pending_requests` is whatever real users have sent since the deploy.
- `DRY RUN OK: 20260925004000_friend_requests_lockdown ...`.
- The suite reports `pass 13`, `fail 0`.

- [ ] **Step 3: Owner go-ahead, then apply migration 2.** Tell the owner the number from Step 2: that many people will see a friend request in their bell (spec D2), and the FRIENDS-cellar access those one-way adds gave now needs a yes. On a yes, run the same two-way command as Task 13 Step 4 with `supabase/migrations/20260925004000_friend_requests_lockdown.sql`: `db push --dry-run` must list exactly that file, otherwise use `apply-migration.mjs` without `--dry`.

Expected: `APPLIED: 20260925004000_friend_requests_lockdown ...`.

- [ ] **Step 4: Verify migration 2 live.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local "$SCRATCH/fr-live-state.mjs" | tee "$SCRATCH/fr-state-after-m2.txt" && node --env-file=.env.local --test scripts/friend-requests.test.mjs && node --env-file=.env.local --test scripts/cellar-social.test.mjs
```

Expected:
- `one_way: 0`.
- `friendships` equals the Step 2 count minus the Step 2 `one_way`.
- `pending_requests` equals Step 2's pending count plus the rows moved: fewer than `one_way` only when some pair already had the same request pending.
- `friendships_policies: 'friendships read own'`, `client_inserts_friendships: false`, and `20260925004000` recorded.
- The suite reports `pass 12`, `skipped 1` (the data-move test runs only in a dry run), and cellar-social `pass 5`.

- [ ] **Step 5: Smoke.** With two demo accounts on the live site: A sends, B accepts (both show "Friends"), and B removes. Everything runs through the RPCs, with no error. If the owner is among the recipients of a moved request, ask them to check that their bell lists it with Accept / Decline. Clean up the demo pair as in Task 13 Step 7.

- [ ] **Step 6: If something goes wrong after migration 2.** Fix forward. Never deploy an app from before Task 6: its "Add friend" inserts into `friendships` directly, and that insert is now refused. Only if the owner decides client writes must come back, write and apply (same Task 13 Step 4 routine) a new migration `20260925005000_friend_requests_unlock.sql` containing exactly:

```sql
set local lock_timeout = '10s';
create policy "friendships insert own" on public.friendships
  for insert to authenticated with check (user_id = auth.uid());
create policy "friendships delete own" on public.friendships
  for delete to authenticated using (user_id = auth.uid());
grant insert, delete on table public.friendships to authenticated;
```

The moved requests stay as requests; people accept or decline them as usual.
