# Friend requests — design

Date: 2026-09-24. Owner decisions taken in conversation the same day. Supersedes the
"one-way, no accept/request flow (confirmed with the user)" rule (CLAUDE.md, the
`friendships` migration header, community-redesign spec §"One-way friendships",
platform-invites spec D12/D19 and plan line 69) and the in-app sentence "Adding a
friend is one-way: nobody is asked or notified."

## 1. Decisions

- **D1 Mutual on accept.** A friendship exists only once the other person has
  accepted. Both then list each other and both get every friend benefit: the
  Friends view on /community, the tasting-invite pickers, "by friends" ratings on a
  bottle, and FRIENDS-visibility cellar access through `can_view_cellar`. A pending
  request grants nothing.
- **D2 Existing rows.** Of the 44 live `friendships` rows, the 14 mutual pairs (28
  rows) stay friendships. The 16 one-way rows become pending requests from the
  adder to the person added; those 16 people see a request appear and may accept
  or decline. This closes the unconsented FRIENDS-cellar access a one-way add gave.
- **D3 Where a request is seen and answered.** The header bell (alongside tasting
  invitations, same poll), a **Requests** pill on /community, and the requester's
  own profile header. No email: the app cannot mail an existing member today.
- **D4 Decline is quiet, re-asking allowed.** Declining deletes the request; the
  requester is not told, their button returns to "Add friend", and they may ask
  again. A requester can cancel their own pending request.
- **D5 Invite links stay instant.** Accepting a platform invite (`/invite/<code>`)
  still creates the friendship at once, both ways: the inviter made the link and
  the invitee tapped it. It also clears any pending request between the two.
- **D6 Removal is mutual.** Removing a friend removes the friendship for both, with
  today's two-tap confirm.
- **D7 Storage.** Requests live in a new table, `friend_requests`; `friendships`
  keeps meaning "accepted, mutual", so nothing that reads it today changes meaning.
  (Alternative rejected: a `status` column on `friendships`, which would have made
  every reader and the cellar gate filter on status.)
- **D8 Two-step rollout**, like M9a/M9b: an additive migration and the app deploy
  first, the data move and lockdown second, so a live user's "Add friend" never
  fails mid-rollout.

## 2. Data model

### 2.1 `friend_requests` (new, migration 1)

```sql
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
```

- One pending request per direction. Two opposite pending rows may exist for a
  moment if both people ask at once; the accept RPC deletes both directions.
- RLS: `friend_requests read own` — SELECT to authenticated where
  `requester_id = auth.uid() or recipient_id = auth.uid()`. No INSERT, UPDATE or
  DELETE policy: every write goes through the RPCs below (the table grants to
  `anon`/`authenticated` are revoked to SELECT only, so a client cannot bypass
  them even with a policy mistake later).
- BEFORE INSERT trigger `friend_requests_refuse_deleted_profile` reusing
  `refuse_deleted_profile_link()`'s rule (a variant reading `requester_id`/
  `recipient_id` if the shared function cannot be generalised) — 42501 "that
  account has been deleted".
- `scrub_deleted_account(uuid)` also deletes `friend_requests` where the person is
  requester or recipient.
- `database.types.ts`: Row/Insert/Update with `Relationships: []`; the five
  functions in `Functions`.

### 2.2 `friendships` (unchanged shape; lockdown in migration 2)

- Rows only ever exist in pairs (A→B and B→A) after migration 2. Writers: the
  accept RPC, `accept_platform_invite`, `remove_friend`, `scrub_deleted_account`.
- Migration 2 revokes INSERT, UPDATE and DELETE on `friendships` from `anon` and
  `authenticated` (SELECT stays, with today's `read own` policy) and drops the
  `friendships insert own` and `friendships delete own` policies. Constraint names
  (`friendships_user_id_friend_id_key`, `friendships_check`) are not renamed: the
  platform-invites migration's asserts pin them.
- `can_view_cellar` is **not** changed: with paired rows, "a row in either
  direction" is equivalent to "friends". Its body md5 pins in the rule-1 migrations
  stay valid.

### 2.3 RPCs (migration 1; all `security definer`, `set search_path = public`,
`language plpgsql`; EXECUTE granted to `authenticated` only and explicitly revoked
from `PUBLIC`, `anon` and `service_role`, as `transfer_tasting_host` does; a null
`auth.uid()` raises 42501 "not signed in"; a target equal to the caller raises
22023; a deleted target raises 42501 "that account has been deleted")

| Function | Effect |
|---|---|
| `send_friend_request(p_to uuid) returns text` | If a friendship row caller→p_to exists: returns `'friends'`. Else if a request p_to→caller exists: performs the accept (below) and returns `'accepted'`. Else inserts (caller, p_to) `on conflict do nothing` and returns `'requested'`. |
| `cancel_friend_request(p_to uuid) returns void` | Deletes (caller, p_to). No-op when absent. |
| `accept_friend_request(p_from uuid) returns void` | Requires a request p_from→caller (else 42501 "no request to accept"). Deletes every request between the two in both directions, then inserts caller→p_from and p_from→caller `on conflict do nothing`. One transaction. |
| `decline_friend_request(p_from uuid) returns void` | Deletes (p_from, caller). No-op when absent. Writes nothing else (D4). |
| `remove_friend(p_other uuid) returns void` | Deletes both friendship rows between caller and p_other. No-op when absent. |

`accept_platform_invite(p_code)` is recreated in migration 1 with one addition: it
deletes any `friend_requests` between caller and inviter (both directions) before
writing the two friendship rows. Its other behaviour and its returned `inviter_id`
are unchanged.

### 2.4 Migration 2 — data move and lockdown

In one transaction, after the app deploy that uses the RPCs is live:

1. Pre-state asserts: `friend_requests` and the five RPCs exist; the app deploy is
   the operator's responsibility (header comment names the commit).
2. Data move: for every `friendships` row (a, b) with no row (b, a), insert
   `friend_requests(requester_id = a, recipient_id = b, created_at = f.created_at)`
   `on conflict do nothing`, skipping any where either profile is deleted, then
   delete those one-way rows. Expected on live: 16 moved (assert the moved count
   equals the one-way count read at the start of the transaction).
3. Post-state asserts: no `friendships` row lacks its reverse; the revokes and the
   dropped policies are in place; `friend_requests` count = moved count.
4. Revoke client INSERT/UPDATE/DELETE on `friendships`; drop the two write policies.

Nothing here touches `can_view_cellar`, `shared_cellar_lots`, `catalog_wine_photos`
or `tasting_participants`.

## 3. App behaviour

### 3.1 Server actions (`src/app/friends/actions.ts`, `"use server"`)

`sendFriendRequest(to)`, `cancelFriendRequest(to)`, `acceptFriendRequest(from)`,
`declineFriendRequest(from)`, `removeFriend(other)` — thin wrappers over the RPCs,
each revalidating `/community`, `/u/<other>` and (for accept/decline) the header.
`addFriend` is retired. Shared types live in a plain module
(`src/lib/friends/types.ts`), never re-exported from the `"use server"` file.

### 3.2 Relationship state (pure, tested: `src/lib/friends/relationship.ts`)

```ts
type Relationship = "none" | "requested" | "incoming" | "friends";
function relationship(input: { friend: boolean; outgoing: boolean; incoming: boolean }): Relationship
```
`friends` wins, then `incoming`, then `requested`, else `none`. Every surface
derives its buttons from this one value.

### 3.3 FriendButton states (row, header and card variants)

| State | Control | Tap |
|---|---|---|
| none | "Add friend" (primary on the header, revealed-on-hover in the laptop table as today) | `sendFriendRequest` → "Requested" (or straight to "Friends" when the other person had already asked — the RPC's `'accepted'` result) |
| requested | "Requested" (outline, Clock glyph) | first tap arms "Tap again to cancel" for `TWO_TAP_WINDOW_MS`, second cancels → "Add friend" |
| incoming | two buttons: "Accept" (primary) · "Decline" (quiet) | accept → "Friends"; decline → "Add friend" |
| friends | "Friends" (Check glyph) | two-tap "Tap again to remove" → `removeFriend` → "Add friend" |

Pending labels: "Sending…", "Cancelling…", "Accepting…", "Declining…", "Removing…".
All labels come from `friendButtonLabel` (extended) and are pinned by tests. Row
actions keep the community-redesign rules: the steady state ("Requested",
"Friends") is always visible; only "Add friend" fades in on hover on a fine pointer;
the incoming pair is always visible (it is an action waiting on you). 44 px targets
below `md`.

### 3.4 /community

- Reads, as the viewer: accepted friends (own `friendships` rows), outgoing requests
  (`requester_id = me`) and incoming requests (`recipient_id = me`), one query each.
- A new **Requests** pill after Friends: `?tab=requests`, count shown on the pill
  when > 0 ("Requests 3"). It lists the requesters (newest first) with the incoming
  Accept/Decline pair on each row/card; empty state "No requests right now." with a
  "Show everyone" link. Sorting, search and paging behave as the Friends view.
- The Friends empty state loses its one-way sentence; new body: "Tap Add friend on
  anyone under Everyone. They'll be asked, and you're friends once they accept."
- The band stays "N people · K friends · M active this week" (K = accepted).
- The `?tab=` contract gains `requests`; `/friends` and `/people` redirects are unchanged.

### 3.5 /u/[id]

Reads the relationship in both directions (friend row, outgoing, incoming) plus
`can_view_cellar` as today, and renders the header FriendButton from
`relationship()`. The "Cellar" button rule is unchanged.

### 3.6 Notifications

`getPendingInvites()` (the bell's `"use server"` action) returns
`PendingNotification[]`:

```ts
type PendingNotification =
  | { kind: "tasting"; tastingId: string; tastingName: string; hostName: string }
  | { kind: "friend"; requesterId: string; requesterName: string; avatarUrl: string | null; createdAt: string };
```
Friend items come from `friend_requests` where `recipient_id = me`, joined to
`profiles` (deleted profiles filtered). The bell badge counts both kinds; the
dropdown shows tasting invitations first, then "{Name} wants to be friends" rows
with Accept / Decline inline (they call the actions and remove the row on success).
Polling cadence is unchanged (`invitePollIntervalMs` over the total count). The
Overview invitation card and /taste's InvitationsBand stay tasting-only.

### 3.7 Who counts as a friend elsewhere

Accepted only: tasting-invite friend chips and the Manage-invitations combobox, the
cellar lot sheet's "by friends" line, the Friends pill and band. No change to those
files beyond confirming they read `friendships` (they do).

### 3.8 Platform invites

Unchanged UX. The landing's "Add {inviter} as a friend" and the accept route keep
calling `accept_platform_invite`, now also clearing pending requests (D5).

## 4. Copy (owner approval needed on the new strings)

"Requested" · "Tap again to cancel" · "Accept" · "Decline" · "Sending…" ·
"Cancelling…" · "Accepting…" · "Declining…" · "Requests" (pill) · "No requests right
now." · "{Name} wants to be friends" (bell) · Friends empty body: "Tap Add friend on
anyone under Everyone. They'll be asked, and you're friends once they accept."
Existing strings kept: "Add friend", "Friends", "Tap again to remove", "Removing…".

## 5. Tests

- Pure: `relationship()`, `friendButtonLabel` (all states and pending labels), the
  Requests filter/empty-copy branches in `community-math`, the notification list
  merge order.
- Database (`scripts/friend-requests.test.mjs`, pg via `pgConfig()`, following
  `scripts/cellar-social.test.mjs`): request → accept writes a pair; request →
  decline writes nothing; mutual simultaneous requests accept cleanly; `remove_friend`
  deletes both; a pending request grants no FRIENDS-cellar access
  (`can_view_cellar` false) and acceptance grants it; deleted profiles are refused;
  `anon` and `service_role` cannot execute the RPCs; after migration 2 a direct
  client insert on `friendships` is refused. `scripts/cellar-social.test.mjs`'s
  one-way-row case is rewritten to insert a pair (it inserted a single row as the
  owner role).
- Existing tests to update: `community-math.test.ts` (the one-way sentence and
  labels), `invite-route.test.ts`/`copy.test.ts` if wording moves,
  `delete-copy.test.ts` (adds "and friend requests").

## 6. Rollout

1. Migration 1 (additive) live: table, RLS, trigger, five RPCs, recreated
   `accept_platform_invite`, scrub extension. Old app keeps inserting directly —
   still allowed.
2. App deploy (push to master): actions, button states, Requests pill, bell, copy.
   Smoke: send/cancel/accept/decline/remove between two demo accounts on the live
   site; bell shows a request.
3. Migration 2 live: data move (16 rows), revokes, policy drops, asserts. Smoke:
   the 16 requests appear for their recipients; "Add friend" still works through
   the RPC.
4. CLAUDE.md: "Reversed (spec 2026-09-24-friend-requests-design.md)" on the
   one-way bullet; new bullet for the table, RPCs, the pair invariant, the
   two-step rollout and the copy; amend the community-redesign line about the
   mutual count (the other direction is now readable through `friend_requests`,
   not `friendships`; the "no mutual-friends count" statement still holds).

## 7. Out of scope

Email or push for requests (needs the Resend branch); blocking; friends-of-friends
limits or rate limits (the directory is open by design; revisit if abuse appears);
a mutual-friends count; Realtime for `friend_requests` (the bell polls).

## 8. Rule 1

Nothing here reads or exposes wines, answer keys or guesses. A request reveals only
what the open directory already shows (display name, avatar).
