# Account deletion — design

Date 2026-09-19. Owner decisions 2026-09-19 (D1–D3 below). Base: branch `account` at `dfe7a2b`. The owner's request: "we need a delete account button in the profile tab. People can delete their own accounts." Also: deleting a user from the Supabase dashboard must stop leaving an orphaned profile (the deleted "niceman" test accounts kept showing in Community, with their friendships).

Every live fact here was read on 2026-09-19 (read-only queries), and §3's SQL was run twice inside rolled-back transactions on the seeded `demo.*@blindr.invalid` accounts (a live read afterwards showed nothing kept: no `deleted_at` column, no new function, one trigger on `auth.users`). Superseded approach, not used: restoring `profiles.id → auth.users(id) on delete cascade` (`.superpowers/account-deletion/superseded-profiles-auth-user-fk.sql` in the main checkout).

## 1. Decisions

Owner (2026-09-19, verbatim choices):

- **D1 Tastings stay.** Tastings the person hosted or joined are KEPT, with the person shown as "Deleted user".
- **D2 Notes and ratings go.** Their tasting notes and ratings are DELETED. Community ratings recalculate (they are views over `wset_notes`: `catalog_wine_ratings`, `catalog_wine_descriptors`).
- **D3 Confirm by typing DELETE.** People confirm by typing `DELETE`.

Defaults added here (no owner question outstanding; D10's grant change fixes a hole, see §7):

- **D4 One database path, and the profile row stays.** Every deletion runs in the database. `auth.users` gets `on_auth_user_deleted` (AFTER DELETE) and `on_auth_user_soft_deleted` (AFTER UPDATE OF `deleted_at`, only when it goes from null to set). Both call `public.handle_deleted_user()`, which calls `public.scrub_deleted_account(uuid)`. That covers the self-service button, the dashboard's "Delete user", and a GoTrue soft delete. The profile row is scrubbed and kept, never deleted, so nothing cascades from `profiles` (the CASCADE foreign keys on `tastings.host_id` and `tasting_participants.user_id` never fire). No foreign key goes back from `profiles` to `auth.users`: live dropped it on purpose in the live-only `20260829265003_profiles_drop_authusers_fk` (branch `auth-phase-1`, whose profiles have no `auth.users` row). If that branch merges, its own deletion path calls `scrub_deleted_account` directly and grants EXECUTE to whatever runs it; the phase-1 tables are cleared through `to_regclass` guards, so this migration works with or without them.
- **D5 What the scrub does to the profile.** `display_name` becomes `Deleted user`. `email` becomes `deleted+<id>@blindr.invalid`: `.invalid` never delivers mail, the value can never equal a real address, and a new signup with the old address gets a new profile (verified, §4 S8). `avatar_url`, `bio`, `location`, `phone`, `favorite_wine_type` and `last_seen_at` become null. `role` becomes `MEMBER`, so `profiles_sync_is_curator` sets `is_curator` false. `cellar_visibility` becomes `PRIVATE`, `preferred_currency` goes back to its default `DKK`, and `deleted_at` is stamped `now()`. `id` and `created_at` stay (`created_at` is shown nowhere for a deleted profile).
- **D6 Tastings they host.**
  - (a) A tasting that never started (`status = 'DRAFT' and started_at is null`) and has no other JOINED or INVITED participant is deleted outright. Nothing is recorded yet.
  - (b) Every other hosted tasting that is not CLOSED becomes CLOSED, and nothing is revealed. This is the same write as `finishTasting`, without its IN_PROGRESS precondition: `tastings_stamp_lifecycle` stamps `finished_at`, and `tastings_pause_follows_status` clears `paused_at`. A DRAFT closed this way keeps `started_at` null, and D20 makes sure the semi-blind candidate list still treats it as never started.
  - (c) The `tasting_places` rows of every tasting they host are deleted. A place can be a home address. A CLOSED record never shows it (`showPlace={false}`), and every hosted tasting is CLOSED from here on, so removing it hides nothing anyone can see.
- **D7 Their seats in other people's tastings.**
  - (a) A tasting that never started: their BYO glasses in it are deleted, the remaining glasses are renumbered the way `remove_flight_glass` does, and then their seat is deleted. For the host this is the same as the contributor pressing Remove and then Leave before Start.
  - (b) A started tasting that is not CLOSED: a seat that is not JOINED and that nothing references (no guesses, no contributed glass) is deleted, because an invite to a deleted account can never be answered. A JOINED seat stays: the leave guard's rule that a started roster is fixed also holds for deletion. Its guesses stay and are scored when the host reveals.
  - (c) A CLOSED tasting: everything stays (D1).
- **D8 What is only theirs is deleted:**
  - `wset_notes`, with `wset_note_aromas` cascading. This includes identity-less hidden-glass notes.
  - `cellar_consumptions` and `cellar_lots`.
  - `friendships` in both directions.
  - `platform_invites`: their links then read "no invite has that code".
  - `wine_pour_intents`, `wine_identity_drafts` and `label_reads`. These cascade from `auth.users` on a hard delete. They are deleted explicitly as well so a soft delete clears them too.
  - The `auth-phase-1` tables `auth_sessions`, `auth_tokens` and `auth_credentials`, when they exist (all empty live).

  This part runs on every call, not only the first (D12's sweep).
- **D9 Kept, pointing at the scrubbed profile:**
  - `catalog_wines.created_by` (12 of 33 real accounts created catalog wines or wrote notes).
  - `catalog_wines_unidentified.created_by`: rows every signed-in user can read, part of the shared catalog.
  - `catalog_wine_edits.editor_id`.
  - `countries`/`regions`/`appellations.map_reviewed_by`.
  - `tastings.host_id`, `tasting_participants.user_id`, `wines`, `wine_answers`, `guesses` and `semi_blind_candidate_keys` of every kept tasting.
  - Tasting names, descriptions and cover photos.
- **D10 The `deleted_at` write guard.**
  - `profiles_deleted_guard` is a BEFORE INSERT OR UPDATE trigger, SECURITY INVOKER on purpose because it reads `current_user`. Once `deleted_at` is set, nobody can change it; un-deleting is never valid, because the auth user is gone. No client (`anon`/`authenticated`) can set it, and no client can write any column of a deleted row, which covers a leftover access token.
  - Client UPDATE on `profiles` is narrowed to the nine columns the app writes: `display_name, bio, avatar_url, location, phone, favorite_wine_type, cellar_visibility, preferred_currency, last_seen_at`. `anon` loses UPDATE entirely; it never had a policy.
  - The narrowing also closes a hole that exists today. A signed-in member can run `update profiles set role = 'ADMIN'` on their own row; rolled back on 2026-09-19, a MEMBER became ADMIN. Role changes already go through the SECURITY DEFINER `admin_set_user_role`.
- **D11 No new links to a deleted profile.** `refuse_deleted_profile_link()` is a BEFORE INSERT trigger on `friendships` (either side) and on `tasting_participants`. It refuses a deleted profile. That covers `addFriend`, `accept_platform_invite`, a host's invite by id or email, and `join_tasting_by_code` under a leftover token.
- **D12 Replay, backfill and sweep.**
  - The migration drops the init schema's `profiles_id_fkey` only if this database still has it. That only happens on a clean replay of the repo: `20260829265003` is not in the repo, and live has no such key.
  - At apply time it scrubs every profile whose `auth.users` row is missing or soft-deleted (0 today). It does this only while the phase-1 tables are absent or empty, so a phase-1 account is never mistaken for an orphan.
  - Calling `scrub_deleted_account(id)` again for a deleted profile re-runs only D8. That is the main session's sweep for rows a leftover token wrote after the delete (§7 R1).
- **D13 Self-service order.** The action:
  1. Reads the session user and re-checks `DELETE` on the server.
  2. Refuses the last ADMIN (D14).
  3. Calls `admin.auth.admin.deleteUser(user.id)`, a hard delete. `shouldSoftDelete` is never passed.
  4. Removes the avatar files, best-effort.
  5. Signs this browser out and redirects to `/login?deleted=1`.

  No password re-entry: the owner chose typing DELETE. A failure in step 3 is shown verbatim and changes nothing, because the trigger runs inside GoTrue's delete, so any raise rolls the whole delete back ("Database error deleting user").
- **D14 The last admin cannot delete themselves in the app.** Live has exactly one ADMIN. Deleting that account would leave nobody able to manage roles in the UI. The action refuses when the caller is ADMIN and is the only profile with `role = 'ADMIN' and deleted_at is null`. The dashboard path is not blocked; the database never refuses a delete.
- **D15 Storage: avatars only.**
  - The action removes every object under `avatars/<user_id>/` (the uploader writes `<user_id>/avatar.<ext>`).
  - Label-scan photos under `wine-images/catalog/staging/<user_id>/` are kept: 97 of the 106 catalog wine image URLs live there, so deleting them would break the shared catalog. Deciding which of those photos are unreferenced is a follow-up (§7).
  - Tasting covers under `tasting-images/<host_id>/` stay with their kept tastings.
  - A dashboard delete runs no app code, so it leaves the avatar object (§7 R5, with the sweep query).
- **D16 A deleted profile's pages.**
  - `/u/<id>` renders a minimal page: "Deleted user", one line, and no avatar, stats, tastings list, joined date, friend button or cellar link.
  - `/u/<id>/cellar` and `/u/<id>/tastings/<tastingId>` give `notFound()`.
  - The tasting Participants card shows a deleted row by name only, with no profile link and no cross-tasting stats line. Other rosters that link to `/u/<id>` land on the minimal page.
- **D17 People listings skip deleted profiles.** Every query that lists, searches or picks people adds `.is("deleted_at", null)` (§5.5). Community is changed by the main session at merge, because another build is rewriting `src/app/community/**`.
- **D18 Types.** `database.types.ts` gets `deleted_at: string | null` in `profiles.Row` only, and not in `Insert` or `Update`. No client writes it, and leaving it out makes such a write a compile error on top of the grant. `scrub_deleted_account` is not added to `Functions`, because no client can call it.
- **D19 Version `20260919101300`**, `supabase/migrations/20260919101300_account_deletion.sql`. The latest live version is `20260918130500`. No `20260919*` version exists live, on `origin/master` (`git ls-tree … origin/master supabase/migrations`, ref at `117b3be`), or in this worktree's folder. The probe's before-phase and `scratch-apply --mode dry` check the live `schema_migrations` row again before any apply.
- **D20 "Started" means actually started, for the semi-blind candidate list** (review fix, 2026-09-19). The live `get_semi_blind_candidates` (`20260914102500`) decides "started" with `v_started := t.status <> 'DRAFT'`. D6(b) closes a never-started SEMI_BLIND DRAFT that others JOINED, so without this change every JOINED guest would get every candidate card of glasses nobody ever saw revealed. That covers producer, wine name, vintage, appellation and grape; in a one-glass flight the single card is that glass's identity. An INVITED guest can get there too: they flip their own seat to JOINED through `participants update own or host`, because the link guard fires on INSERT only. The migration recreates the function with `create or replace`, which keeps its ACL. Its body is `20260914102500`'s byte for byte, except that one test becomes `t.status <> 'DRAFT' and (t.started_at is not null or t.finished_at is null)`. `tastings_stamp_lifecycle` stamps `started_at` on every DRAFT → IN_PROGRESS and `finished_at` on every move to CLOSED. A CLOSED row with `started_at` null and `finished_at` set was therefore closed without ever starting, and it keeps DRAFT visibility: only the caller's own cards, and `pending` only for the host. The new test is the old one plus a clause, so it never widens anything. Live has no SEMI_BLIND tasting (read 2026-09-19), and all 6 live CLOSED tastings have `started_at` set, so no existing row changes behaviour. This also closes the same leak for a host who sets their own DRAFT to CLOSED (F3).

## 2. Table-by-table fate

Rule 1 is the blind-tasting invariant: no identity of an unrevealed glass reaches anyone who may not already see it. Every Rule-1 check below was confirmed against the live policies and functions.

- No policy tests a tasting's status, `started_at` or `finished_at` (live, 2026-09-19).
- Functions that test `CLOSED` only refuse on it: `can_edit_flight_glass`, `move_flight_glass`, `reveal_*` and `join_tasting_by_code`.
- One function did widen a read when a tasting leaves DRAFT. `get_semi_blind_candidates` read "started" as `status <> 'DRAFT'`, so a never-started DRAFT that D6(b) closes would have handed every candidate card to its JOINED guests. D20 recreates it with `status <> 'DRAFT' and (started_at is not null or finished_at is null)`, so that tasting keeps DRAFT visibility.
- Every other function that tests `<> 'DRAFT'` only gates a write: `can_remove_flight_glass`, `can_delete_flight_glass_row`, `move_flight_glass`, `set_flight_glass_added_via`, `draw_down_flight_cellar_lots`, `pour_cellar_lot_into_glass`, `transfer_tasting_host`, `wines_semi_blind_flight_locked`, and the lifecycle, setup-lock and leave-guard triggers.

With D20 in place, closing a tasting never widens what anyone can read.

### 2.1 `public.profiles` (kept, scrubbed)

| Column | Fate | Why |
|---|---|---|
| `id` | kept | Everything D9 keeps points at it |
| `display_name` (not null) | `Deleted user` | D1's display |
| `email` (not null, no unique index) | `deleted+<id>@blindr.invalid` | D5; frees the address for a new signup |
| `created_at` | kept | Not shown for a deleted profile |
| `avatar_url`, `bio`, `location`, `phone`, `favorite_wine_type`, `last_seen_at` | null | Personal |
| `role` | `MEMBER` | No curator/admin powers survive; `is_curator` follows via `profiles_sync_is_curator` |
| `is_curator` | false (synced) | As above |
| `cellar_visibility` | `PRIVATE` | The cellar is deleted anyway; closes `can_view_cellar` |
| `preferred_currency` | `DKK` (default) | Reset to default |
| `deleted_at` (new) | `now()`, write-once | D10 |

Policies are unchanged: `profiles read` (authenticated, `true`) keeps the scrubbed row readable, which is what renders "Deleted user", and `profiles update own` stays. Grants change as D10 describes. Triggers: `profiles_sync_is_curator` stays, and `profiles_deleted_guard` is new.

### 2.2 Everything linked to the account

| Table | Link | Fate | Why | Rule 1 |
|---|---|---|---|---|
| `auth.users` | the account | deleted (hard) by GoTrue, or soft-deleted | The trigger source | — |
| `auth.identities`, `auth.sessions`, `auth.mfa_*`, `auth.one_time_tokens`, `auth.oauth_*`, `auth.webauthn_*` | FK CASCADE to `auth.users` | deleted by the cascade (hard delete) | GoTrue's own | — |
| `auth.scim_users` | FK SET NULL | nulled | GoTrue's own | — |
| `tastings` (host, DRAFT never started, nobody else JOINED/INVITED) | `host_id` | **deleted**; cascades `tasting_participants`, `wines` → `wine_answers`, `guesses`, `semi_blind_candidate_keys`, `wine_identity_drafts`, `wine_pour_intents`, plus `tasting_places` | D6(a) | `trg_catalog_wine_unmark_blind_on_unlink` may make a linked catalog wine readable, but only when no other unrevealed glass links it, and this glass no longer exists. Nobody else was JOINED or INVITED. A DECLINED guest never saw an identity. |
| `tastings` (host, any other not-CLOSED) | `host_id` | **closed** | D6(b) | Nothing is revealed or scored. Host-added answer keys become readable by nobody (the host clause needs `t.host_id = auth.uid()`), which is tighter than before. A BYO contributor still reads only their own. `blind_pending` catalog wines stay hidden. A never-started SEMI_BLIND DRAFT closed here keeps `started_at` null, so `get_semi_blind_candidates` (recreated by D20) still gives each JOINED guest only their own bottles' cards and the host-provided ones to nobody. A started one keeps the list its guests already had. |
| `tastings` (host, CLOSED) | `host_id` | kept | D1 | unchanged |
| `tasting_places` | per tasting | deleted for every tasting they host | D6(c) | — |
| `tasting_participants` (their host seat) | `user_id` | kept (JOINED) | D1; `tasting_participants_leave_guard` refuses a host leaving anyway | — |
| `tasting_participants` (guest, never-started tasting) | `user_id` | deleted, after their glasses | D7(a) | See `wines` |
| `tasting_participants` (guest, started, not CLOSED) | `user_id` | JOINED kept. Other statuses deleted only when no guess or glass references them. | D7(b) | — |
| `tasting_participants` (guest, CLOSED) | `user_id` | kept | D1 | — |
| `wines` (their BYO glass, never-started tasting of someone else) | `contributor_participant_id` | deleted, then renumbered | D7(a) | `wines_drop_unresolved_notes` removes identity-less notes on it; the unmark-on-unlink effect is the same as `remove_flight_glass` in a DRAFT today, and the glass no longer exists |
| `wines` (every other) | via tasting | kept (`is_revealed`, `reveal_step`, `added_by_host` untouched) | D1 | unchanged |
| `wine_answers` | via glass | kept with the glass; deleted only with a glass deleted above | D1 | Never deleted for an unrevealed glass that anyone else can see (the D6(a)/D7(a) glasses have no such viewer) |
| `guesses` (theirs and others') | `participant_id` | kept, including `guessed_wine_id`, `locked_at` and points | D1 | unchanged |
| `semi_blind_candidate_keys` | via glass | follows its glass | — | — |
| `wine_identity_drafts` | `owner_id` → `auth.users` CASCADE | deleted | D8, owner-only | Names nothing (an incomplete glass of theirs stays incomplete, §7 R3) |
| `wine_pour_intents` | `owner_id` → `auth.users` CASCADE | deleted | D8, owner-only | Kept owner-only on purpose (D11 of add-wine v2); deleting names nothing |
| `label_reads` | `user_id` → `auth.users` CASCADE | deleted | D8; the table's own comment already says reads "disappear with the account" | — |
| `wset_notes` | `author_id` (RESTRICT) | deleted | D2 | No delete trigger. Identity-less notes are deleted without resolving. Resolved ones leave the ratings views. |
| `wset_note_aromas` | `note_id` CASCADE | deleted | follows notes | — |
| `catalog_wine_ratings`, `catalog_wine_descriptors` (views) | over `wset_notes` | recalculate | D2 | — |
| `cellar_consumptions` | `owner_id` | deleted | D8 | `catalog_wine_mark_blind` is decided only when an answer is inserted; deleting a lot or a consumption never changes `blind_pending` |
| `cellar_lots` | `owner_id` | deleted (`wine_pour_intents.cellar_lot_id` SET NULL for any other row) | D8 | as above |
| `friendships` | `user_id`, `friend_id` | deleted both ways | D8 | FRIENDS cellar access ends (the cellar is gone anyway) |
| `platform_invites` | `inviter_id` | deleted | D8 | — |
| `catalog_wines` | `created_by` (RESTRICT) | kept | D9 | The `"catalog read"` creator clause can no longer match anyone, so a `blind_pending` row stays hidden, which is tighter |
| `catalog_wine_grapes` | via catalog wine | kept | D9 | — |
| `catalog_wine_edits` | `editor_id` (SET NULL) | kept, still pointing at the profile | D9; `before`/`after` hold wine fields only | — |
| `catalog_wines_unidentified` | `created_by` (NO ACTION) | kept | D9; `unidentified read` is `true` for all signed-in users, i.e. shared | unchanged |
| `countries`/`regions`/`appellations.map_reviewed_by` | SET NULL | kept | curation audit | — |
| `auth_credentials`, `auth_sessions`, `auth_tokens` (live-only, empty) | `user_id` → `profiles` CASCADE | deleted when present | D4/D8: the profile is never deleted, so the cascade never runs | — |
| `auth_rate_limits` (live-only) | `key`, no user FK | untouched | Keyed windows that expire | — |
| `storage.objects` `avatars/<id>/…` | path | removed by the self-service action | D15 | — |
| `storage.objects` `tasting-images/<id>/…`, `wine-images/catalog/staging/<id>/…`, `wine-images/<tasting_id>/…` | path | kept | D15 | — |

Triggers walked on those tables (live 2026-09-19) and what the scrub makes them do:

- **`tastings`.** `tastings_stamp_lifecycle` stamps `finished_at` on CLOSED. `tastings_pause_follows_status` clears `paused_at`. `tastings_lock_setup_after_start` does not fire on a status change to CLOSED; it only refuses mode/timing/source changes and a return to DRAFT. `tastings_pointer_in_tasting` fires on the FK's SET NULL when a pointed-at glass is deleted.
- **`tasting_participants`.** `tasting_participants_leave_guard` lets every delete the scrub makes through. The scrub deletes only non-JOINED seats, or JOINED seats in never-started tastings, and `auth.uid()` is null under GoTrue anyway. `pin_tasting_participant_identity` is not touched. `tasting_participants_stamp_joined_at` is not touched.
- **`wines`.** `wines_drop_unresolved_notes` fires on the D6(a)/D7(a) deletes. `wines_pin_adder`, `wines_full_reveal_step` and `wines_stamp_revealed_at` fire on the renumbering update, as they do in `remove_flight_glass`. The reveal triggers (`semi_blind_release_revealed_wine`, `trg_catalog_wine_unmark_blind`, `wset_notes_resolve_on_reveal`, `wines_refuse_reveal_while_paused`) never fire, because nothing is revealed.
- **`wine_answers`.** `trg_catalog_wine_unmark_blind_on_unlink` fires only on the deleted glasses above.
- **`guesses`.** No write.
- **`wset_notes`.** Only BEFORE INSERT/UPDATE triggers exist, so none fires on delete.
- **`catalog_wines`.** No write.
- **`auth.users`.** `on_auth_user_created` → `handle_new_user` is unchanged (md5 `f18c8dc309331e2b2cf7d40bad8d55fa`).

## 3. The SQL design (`20260919101300_account_deletion.sql`)

No begin/commit, because the applier owns the transaction. `set local lock_timeout = '10s'`. The order in the file:

### 3.1 Pre-state (one `do` block, each check a `raise exception`)

- `public.profiles` has no column `deleted_at`.
- `public.profiles` has at most one foreign key. If it has one, it is exactly the init schema's `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`. Live has none.
- No function named `scrub_deleted_account`, `handle_deleted_user`, `profiles_deleted_guard` or `refuse_deleted_profile_link`.
- The only non-internal triggers on `auth.users` are `{on_auth_user_created}`.
- The function bodies the scrub relies on still match their md5 as read live on 2026-09-19. A change to any of them must surface here:

| Function | md5 |
|---|---|
| `handle_new_user` | `f18c8dc309331e2b2cf7d40bad8d55fa` |
| `tastings_stamp_lifecycle` | `5d7702a39d76b3a8b6fd3ddf2d30fe1d` |
| `tastings_lock_setup_after_start` | `fc4b5a849f9c73a4b94be246dfa4d948` |
| `tastings_pause_follows_status` | `68a9bfcb6564888af5ccc5c82846de68` |
| `tasting_participants_leave_guard` | `a13d0de839df497a9bc8619cb29af30d` |
| `catalog_wine_unmark_blind_on_unlink` | `3473768fbd4143ed68129953ecce6ea4` |
| `wines_drop_unresolved_notes` | `adb5d9b44b1df4797afea832f1fccbf6` |
| `wines_pin_adder` | `cdf869a9016452c49640bfba9fba2ff5` |
| `sync_is_curator_from_role` | `538b24bb26930a4f823f464b669ccd59` |
| `remove_flight_glass` (the renumbering copied below) | `afbc58c0c0b48becdfde9436d5b2ebc0` |
| `get_semi_blind_candidates` (the live body, `20260914102500`'s, that §3.5 replaces; pre-state only) | `ade50a9fd3932ba3bb261c01c6d9bfa9` |

- `anon` and `authenticated` hold table-level UPDATE on `profiles`. That is the state being narrowed; if it is already narrowed, re-read live before applying.
- The enum values the scrub writes exist: `user_role` `MEMBER`, `cellar_visibility` `PRIVATE`, `tasting_status` `DRAFT`/`CLOSED`, `participant_status` `JOINED`/`INVITED`.

### 3.2 Column, replay FK, write guard, grants, link guard

```sql
alter table public.profiles add column deleted_at timestamptz;
comment on column public.profiles.deleted_at is
  'Set once, by scrub_deleted_account, when the account is deleted. Never cleared.';

-- A clean replay of the repo still has the init schema's key (live dropped it
-- in 20260829265003, which is not in the repo). Never restored: see D4.
do $$
declare v_fk name;
begin
  select conname into v_fk from pg_constraint
   where conrelid = 'public.profiles'::regclass and contype = 'f';
  if v_fk is not null then
    execute format('alter table public.profiles drop constraint %I', v_fk);
  end if;
end $$;

-- SECURITY INVOKER on purpose: it reads current_user, which a definer function
-- would replace with its owner.
create function public.profiles_deleted_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'a deleted account stays deleted' using errcode = 'insufficient_privilege';
    end if;
    if current_user::text in ('anon', 'authenticated') then
      raise exception 'this account has been deleted' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null)
     and current_user::text in ('anon', 'authenticated') then
    raise exception 'only account deletion sets deleted_at' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger profiles_deleted_guard before insert or update on public.profiles
  for each row execute function public.profiles_deleted_guard();

revoke update on table public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url, location, phone, favorite_wine_type,
              cellar_visibility, preferred_currency, last_seen_at)
  on public.profiles to authenticated;

-- One function for both tables: to_jsonb(new) carries user_id always and
-- friend_id only on friendships (a bare new.friend_id would not compile for
-- tasting_participants).
create function public.refuse_deleted_profile_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles p
             where p.deleted_at is not null
               and p.id::text in (to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'friend_id')) then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger friendships_refuse_deleted_profile before insert on public.friendships
  for each row execute function public.refuse_deleted_profile_link();
create trigger tasting_participants_refuse_deleted_profile before insert on public.tasting_participants
  for each row execute function public.refuse_deleted_profile_link();
```

### 3.3 The scrub (order of operations)

```sql
create function public.scrub_deleted_account(p_user_id uuid)
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

create function public.handle_deleted_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.scrub_deleted_account(old.id);
  return null;
end $$;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();
create trigger on_auth_user_soft_deleted after update of deleted_at on auth.users
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.handle_deleted_user();
```

The FK cascades on a hard delete run as internal `RI_ConstraintTrigger_*` AFTER triggers. They sort ahead of `on_auth_user_deleted` by name, so `label_reads`, drafts and intents may already be gone when step 6 runs, and deleting nothing is harmless. GoTrue deletes as `supabase_auth_admin` with no JWT, so `auth.uid()` is null inside every trigger. The definer functions run as `postgres` (the owner, `rolbypassrls`).

### 3.4 EXECUTE

```sql
revoke all on function public.scrub_deleted_account(uuid)     from public, anon, authenticated, service_role;
revoke all on function public.handle_deleted_user()            from public, anon, authenticated, service_role;
revoke all on function public.refuse_deleted_profile_link()    from public, anon, authenticated, service_role;
revoke all on function public.profiles_deleted_guard()         from public, anon, authenticated, service_role;
```

Supabase's default privileges would otherwise grant EXECUTE to `anon`, `authenticated` and `service_role`, and PostgREST would then expose `/rpc/scrub_deleted_account`. Firing a trigger never checks EXECUTE on its function: on 2026-09-19 a rolled-back test showed a trigger whose function had EXECUTE revoked from `authenticated` still fired for an `authenticated` insert. `service_role` is revoked as well: nothing server-side calls the scrub, and the `transfer_tasting_host` OD-1 precedent applies.

### 3.5 `get_semi_blind_candidates`: "started" means actually started (D20)

`create or replace function public.get_semi_blind_candidates(p_tasting_id uuid)` repeats `20260914102500`'s body byte for byte, except one line:

```sql
-- 20260914102500 (live, md5 ade50a9fd3932ba3bb261c01c6d9bfa9):
--   select t.status <> 'DRAFT', t.host_id = auth.uid() into v_started, v_is_host
-- this migration (new body md5 40c5b78ccffa50b4ad7c75510e6e9f37):
  select t.status <> 'DRAFT' and (t.started_at is not null or t.finished_at is null), t.host_id = auth.uid() into v_started, v_is_host
```

- `create or replace` keeps ownership and the ACL: EXECUTE for the owner, `authenticated` and `service_role`; none for `anon` or PUBLIC.
- It sits after §3.4 and before the backfill, so no scrub in this transaction runs against the old test.

What each shape gets:

| Tasting | `v_started` |
|---|---|
| DRAFT | false (unchanged) |
| IN_PROGRESS, or legacy OPEN | true (unchanged; `finished_at` is null while not CLOSED) |
| CLOSED after a real Start (`started_at` set) | true (unchanged) |
| Legacy CLOSED with neither stamp (pre-M3) | true (unchanged) |
| CLOSED with `started_at` null and `finished_at` set: never started (D6(b), or a host closing their own DRAFT) | **false**: DRAFT visibility |

### 3.6 Backfill (D12)

```sql
do $$
declare v_phase1 bigint := 0;
begin
  if to_regclass('public.auth_credentials') is not null then
    execute 'select (select count(*) from public.auth_credentials)
                  + (select count(*) from public.auth_sessions)
                  + (select count(*) from public.auth_tokens)' into v_phase1;
  end if;
  if v_phase1 = 0 then
    perform public.scrub_deleted_account(p.id)
       from public.profiles p
      where p.deleted_at is null
        and not exists (select 1 from auth.users u where u.id = p.id and u.deleted_at is null);
  end if;
end $$;
```

Live on 2026-09-19: 33 profiles, 33 users, 0 orphans, 0 soft-deleted users. The owner already removed the two "niceman" profiles by hand, so this is a no-op live.

### 3.7 Post-state (same transaction, each check a `raise exception`)

- **Columns and constraints.**
  - `profiles.deleted_at` is `timestamptz`, nullable, with no default.
  - `profiles` constraints are exactly `{profiles_pkey}`: no foreign key at all.
  - `profiles` policies are exactly the two named in §2.1, with unchanged expressions.
- **Grants.**
  - `has_table_privilege(r, 'public.profiles', 'UPDATE')` is false for `anon` and `authenticated`.
  - `has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE')` is true for exactly the nine D10 columns. It is false for `id`, `email`, `created_at`, `is_curator`, `role` and `deleted_at`.
  - `anon` holds UPDATE on no column.
- **Functions.**
  - `scrub_deleted_account(uuid)`, `handle_deleted_user()` and `refuse_deleted_profile_link()` are `prosecdef` with `proconfig = {search_path=public}`, in `plpgsql`. The scrub is `volatile`.
  - `profiles_deleted_guard()` is not `prosecdef` and has `search_path=public`.
  - For all four, `has_function_privilege(r, …, 'EXECUTE')` is false for `anon`, `authenticated` and `service_role`, and `proacl` has no `=X/` (PUBLIC) entry.
- **Triggers.**
  - Non-internal triggers on `auth.users` are exactly `{on_auth_user_created, on_auth_user_deleted, on_auth_user_soft_deleted}`, all `tgenabled = 'O'`.
  - `on_auth_user_deleted` has `tgtype = 9` (ROW|DELETE, AFTER) and `tgfoid = 'public.handle_deleted_user()'::regprocedure`.
  - `on_auth_user_soft_deleted` has `tgtype = 17` (ROW|UPDATE, AFTER), `tgattr` naming only `deleted_at`, a non-null `tgqual`, and the same `tgfoid`.
  - `on_auth_user_created` still calls `handle_new_user`.
  - On `profiles`: `profiles_deleted_guard` (BEFORE INSERT OR UPDATE) and `profiles_sync_is_curator` are present.
  - `friendships_refuse_deleted_profile` and `tasting_participants_refuse_deleted_profile` are present (BEFORE INSERT, ROW).
- **Pins and backfill.**
  - Every §3.1 md5 except `get_semi_blind_candidates`'s is unchanged.
  - When the phase-1 tables are absent or empty, no profile with `deleted_at is null` lacks a live `auth.users` row.
- **`get_semi_blind_candidates` (§3.5).**
  - Its body md5 is `40c5b78ccffa50b4ad7c75510e6e9f37`.
  - It is still `prosecdef` with `search_path=public`, `plpgsql`, `volatile`, and returns `jsonb`.
  - Its EXECUTE entries are exactly the owner, `authenticated` and `service_role`, with no PUBLIC entry. `authenticated` can call it and `anon` cannot.
  - It stays out of the owner-only EXECUTE check that covers the four new functions.

### 3.8 Security reasoning

- **The scrub cannot be reached by anyone.** Only two triggers on `auth.users` call it, and writing to `auth.users` is GoTrue's alone. Every client role and `service_role` lacks EXECUTE.
- **A deleted row cannot be written through the API.** The guard is invoker-rights and keys on `current_user`. Every PostgREST write runs as `anon` or `authenticated`, so none can touch a deleted row, un-delete one, or stamp one. SECURITY DEFINER writers (the scrub, `admin_set_user_role`) run as `postgres` and pass. `service_role` passes too: it is trusted, and only the main session's fixtures use it.
- **The grant narrowing breaks no current writer.** Every client write to `profiles` in `src/` touches only the nine columns: `updateProfile`, `AvatarUploader`, `CellarVisibilityControl`, `set-password` and `last-seen.ts`. Seeds use the service role.
- **What a deleted profile exposes.** Its content is public-grade only: a fixed name and an undeliverable address. The link guard stops it from gaining friends or seats afterwards.

## 4. Probe scenarios

A probe, `.superpowers/account-deletion/probes/20260919101300-account-deletion.mjs` (gitignored), in the pattern of `.superpowers/blind-tasting/probes/*.mjs`:

- One `pg` client using `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`.
- A before-phase against live: re-reads §3.1's facts and prints them.
- An after-phase that:
  - builds fixtures on the seeded accounts, with Sofia Andersen as the account deleted and Marcus Chen, Priya Sharma, Diego Fernandez and Isabelle Moreau as the others (`demo.*@blindr.invalid`);
  - applies the migration file inside the transaction;
  - deletes with `delete from auth.users where id = …`, as GoTrue does, with no JWT;
  - runs client checks in savepoints with `set local role` plus `request.jwt.claims`.
- Both phases end in ROLLBACK. It then reads live once more to show nothing persisted.
- Its EXPECT table is written before the first run. Agents run it (it only ever rolls back). `scratch-apply --mode dry` must report `DRY-OK 20260919101300 account_deletion`. The main session applies live.

The core of every scenario below was already exercised in the two rolled-back prototypes on 2026-09-19. The probe makes each one a checked row.

| # | Scenario (fixtures) | EXPECT |
|---|---|---|
| S1 | **Guest.** Sofia has two notes: one resolved on a catalog wine, one identity-less on a hidden glass of a running tasting. She also has a cellar lot plus a consumption, friendships both ways with Priya, a platform invite, a `label_reads` row, and a draft plus a pour intent. She is JOINED in a CLOSED BYO tasting hosted by Marcus, where she brought a revealed glass that Priya guessed, and where she guessed Marcus's glass (scored). | `auth.users` row gone. Profile per §2.1, `deleted_at` set. Notes 0, and `catalog_wine_ratings.note_count` for that wine down by 1 (or no row). Lots and consumptions 0, friendships (either side) 0, invites 0, `label_reads`/drafts/intents 0. The CLOSED tasting is unchanged: row, her JOINED seat, her glass and its `wine_answers`, Priya's guess on it, and her own scored guess (compare row md5 before and after). |
| S2 | **Host of a CLOSED tasting.** Isabelle hosts "Bordeaux Classics", has 3 lots and created 3 catalog wines. | Tasting row identical (status, `finished_at`). Wines, answers, 12 guesses and 4 seats unchanged. The 3 `catalog_wines` still have `created_by` = her id, `blind_pending` unchanged. Lots 0. Its `tasting_places` row gone if one was set. |
| S3a | **Host of a never-started DRAFT, alone.** One host-added glass whose answer links a catalog wine that becomes `blind_pending`. | Tasting, glass, answer and seat gone. The catalog wine's `blind_pending` is false only if the before-phase showed no other unrevealed glass linking it. |
| S3b | **Host of a DRAFT with others.** Diego INVITED, Priya JOINED, one host glass keyed to a `blind_pending` catalog wine. | `status` CLOSED, `finished_at` set, `started_at` null. Glass `is_revealed` false, `reveal_step` 0, answer row unchanged, `blind_pending` still true. Diego's INVITED and Priya's JOINED seats unchanged. |
| S4 | **Host of an IN_PROGRESS LIVE tasting.** Priya is JOINED. Glass 1 is mid-step (`reveal_step` 2, through `reveal_next_category` as the host). On glass 2 Priya has a locked, unscored guess. `paused_at` is set. | CLOSED, `finished_at` set, `started_at` unchanged, `paused_at` null. Glass 1 still at step 2 and not revealed; glass 2 untouched. Priya's guess keeps `scored_at` null and `total_points` null (nothing scored). Every `blind_pending` value unchanged. |
| S5 | **Guest seats.** (a) Marcus's BYO DRAFT with glasses Marcus, Sofia, Marcus (positions 1–3); Sofia's glass has an answer, a draft and an intent. (b) Sofia INVITED to Marcus's IN_PROGRESS tasting. (c) Sofia JOINED in another IN_PROGRESS tasting of Marcus's, with a locked, unscored guess. | (a) Her glass, answer, draft and intent gone; positions are 1, 2, both Marcus's; her seat gone. (b) Seat gone. (c) JOINED seat and guess kept. When Marcus then reveals that glass through `reveal_wine` as Marcus, her guess is scored. |
| S6 | **Second delete is a no-op.** | `select scrub_deleted_account(sofia)` leaves every table's row count and the profile row's md5 unchanged, `deleted_at` included. `delete from auth.users where id = sofia` affects 0 rows. |
| S7 | **Clients.** Priya: set her own `deleted_at`; set her own `role = 'ADMIN'`; update each of the nine D10 columns on her own row; insert friendships to and from Sofia. Marcus: insert a participant row for Sofia. Sofia's leftover token: update her own `display_name`; `join_tasting_by_code`; `accept_platform_invite` on Priya's code. As `anon`: update any profile. As `postgres`: `update profiles set deleted_at = null` on Sofia. | Priya's `deleted_at` and `role` writes: 42501 permission denied for table profiles. Her nine columns: each succeeds. Friendships either way: 42501 "that account has been deleted". Marcus's insert: same refusal. Sofia's token: 42501 "this account has been deleted", and the refusal from `refuse_deleted_profile_link` for both joins. `anon`: 42501. `postgres` clearing `deleted_at`: "a deleted account stays deleted". |
| S8 | **`handle_new_user` afterwards.** Insert into `auth.users` a new row with email `demo.sofia@blindr.invalid`. | A new profile with a new id, that email, `deleted_at` null (`users_email_partial_key` no longer blocks it). Sofia's scrubbed row unchanged. |
| S9 | **Soft delete.** `update auth.users set deleted_at = now()` for Diego. | Diego scrubbed exactly as S1; his two CLOSED seats and 8 guesses kept. |
| S10 | **EXECUTE.** Call `scrub_deleted_account` as `anon`, `authenticated` and `service_role`. | 42501 permission denied for function scrub_deleted_account, each time. |
| S11 | **Sweep.** After S1, insert a note with `author_id` = Sofia (as `postgres`, standing in for a leftover token), then call the scrub. | Note gone; profile row md5 unchanged. |
| S12 | **Post-state bites.** In a savepoint, re-grant `update (role)` to `authenticated`, then re-run the §3.7 block. | It raises. |
| S13 | **Rule 1, across S1–S5.** | For every glass not revealed before the run: `is_revealed`, `reveal_step` and its `wine_answers` row are unchanged, unless the glass was deleted in S3a or S5(a). The set of `blind_pending` catalog wines changes only as S3a and S5(a) predict. |
| S14 | **Rule 1, semi-blind (D20).** Sofia hosts two never-started SEMI_BLIND DRAFTs. (a) Host-provides: Priya JOINED, Diego INVITED, one keyed host glass. (b) Bring-your-own: Priya and Marcus JOINED with one keyed bottle each, Diego INVITED. After the delete, Diego flips his own seat to JOINED in both. | Both CLOSED, with `started_at` null and `finished_at` set. `get_semi_blind_candidates` for Priya in (a): `{cards: [], pending: null}`; the glass stays at step 0, not revealed, and she reads no answer row. In (b), Priya and Marcus each get only their own bottle. Diego gets `null` while INVITED, and `{cards: [], pending: null}` in both after flipping. Same in the before-phase, where the tastings stay DRAFT. |
| S15 | **Lists that must survive.** (c) Sofia's started SEMI_BLIND tasting with Priya JOINED and one keyed glass. (d) Marcus's SEMI_BLIND tasting, started and then CLOSED normally, with Priya JOINED. | (c) is CLOSED by the delete with `started_at` unchanged; Priya still gets its one card (`pending` 0). (d) is untouched and still gives Priya its one card. |
| S16 | **The fix is load-bearing.** In a savepoint, restore `20260914102500`'s started line, then run S14's delete and Diego's flip. | Priya gets (a)'s never-revealed glass and both (b) bottles, and Diego gets (a)'s glass. The probe also checks that a copy of the migration keeping the old line fails its post-state (X5). |

## 5. The app

Read the relevant guide in `node_modules/next/dist/docs/` before writing code (AGENTS.md), in particular server actions with `useActionState` and `redirect`, and page `searchParams` as a Promise.

### 5.1 The server action — `src/app/profile/edit/delete-account-actions.ts`

`"use server"`. The only export is `export async function deleteAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState>`. `DeleteAccountState` (`{ error: string } | null`) lives in the plain module `src/lib/account/delete-account.ts` and is imported with `import type`. The file never re-exports it. Steps:

1. `const supabase = await createClient()` (`@/lib/supabase/server`), then `supabase.auth.getUser()`. With no user, `redirect("/login")`. The id used is always `user.id`; the form carries none.
2. If `!isDeleteConfirmed(String(formData.get("confirmation") ?? ""))`, return `{ error: DELETE_WORD_MISMATCH }`.
3. Last admin (D14): read the caller's `role`. If it is ADMIN, count `profiles` with `role = 'ADMIN'` and `deleted_at is null`. If `lastAdminRefusal(role, count)` returns a line, return it as the error.
4. `const admin = createAdminClient()` (`@/lib/supabase/admin`, server-only, never imported by a client file), then `const { error } = await admin.auth.admin.deleteUser(user.id)`. The second argument is never passed: a hard delete fires the trigger and frees the email. On error, return `{ error: error.message }` verbatim. Nothing changed; the user is still signed in and sees the error in the dialog.
5. Avatars (D15), best-effort:
   - `admin.storage.from("avatars").list(user.id, { limit: 1000 })`.
   - `avatarPathsToRemove(user.id, data ?? [])`.
   - `admin.storage.from("avatars").remove(paths)` when the list is non-empty.
   - Any failure is logged `{ name, message }` only and never shown: the account is already gone.
6. `await supabase.auth.signOut({ scope: "local" })`. In auth-js 2.110.2 (`GoTrueClient._signOut`) the local session is removed on every branch but scope `others`, and GoTrue's 401/403/404 for a user that no longer exists is ignored. The cookies are therefore cleared whatever GoTrue answers. Ignore its `error`.
7. `redirect(ACCOUNT_DELETED_LOGIN_PATH)` (`/login?deleted=1`).

### 5.2 The section and the dialog — `src/app/profile/edit/delete-account-section.tsx` (client)

Mounted on `src/app/profile/edit/page.tsx` as the last card, after "Appearance". It is its own `Card`, not part of the profile form.

- **The card.**
  - `CardHeader` › `CardTitle` "Delete account". `CardContent` holds the line "Delete your Blindr account and everything that is only yours." (`text-sm text-muted-foreground`), then the trigger.
  - The trigger is `<DialogTrigger render={<Button variant="outline" className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive md:pointer-fine:min-h-0" />}>Delete account</DialogTrigger>`.
  - `Button` is the render target here and is not composed with anything else, so leave `nativeButton` alone (CLAUDE.md, Base UI).
- **The dialog.**
  - `Dialog` is controlled (`open`, `onOpenChange`). While the action is pending, `onOpenChange(false)` is ignored, so Escape, the X and the backdrop cannot close it mid-delete. On close the typed value resets to `""`, and a `key` on the form, incremented per open, drops the last error. Reopening always starts blank.
  - `DialogContent` › `DialogHeader` › `DialogTitle` "Delete your account?".
  - Two labelled lists: "Deleted for good:" with its four items, then "Kept for others:" with its two items. The text comes from the constants in `delete-copy.ts`, so the straight quotes in `"Deleted user"` never meet JSX entity escaping.
  - A `<form action={formAction}>` using `useActionState(deleteAccount, null)`:
    - `Label htmlFor="delete-confirmation"` reading "Type DELETE to confirm".
    - A controlled `Input`: `id="delete-confirmation"`, `name="confirmation"`, `value`/`onChange`, `autoComplete="off"`, `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`, `aria-describedby` pointing at the error.
    - The error in `<p id=… role="alert" className="text-sm text-destructive">{state.error}</p>`, verbatim.
  - `DialogFooter` holds `<DialogClose render={<Button variant="outline" className="min-h-11 md:pointer-fine:min-h-0" />} disabled={pending}>Cancel</DialogClose>` and `<Button type="submit" variant="destructive" className="min-h-11 md:pointer-fine:min-h-0" disabled={pending || !isDeleteConfirmed(value)}>`. The submit label is "Delete my account", or `<WineGlassLoader /> Deleting…` while pending.
  - Tokens only, light and dark. 44 px tap targets on phones.

### 5.3 Login notice — `src/app/login/page.tsx`

`searchParams: Promise<{ next?: string; deleted?: string | string[] }>`. When `accountDeletedNotice(deleted)` returns a line, render `<p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">` inside `CardContent`, above `LoginForm`. `next` handling is unchanged.

### 5.4 `/u/<id>` for a deleted profile

- **`src/app/u/[id]/page.tsx`.**
  - Select `deleted_at` with the profile. If `profilePageView(...) === "deleted"`, return early: `AppHeader`, then the same `max-w-lg` column with one `Card`.
  - The card holds a `size-24` `bg-secondary` circle with no image, `h1` (font-heading) "Deleted user", and the line "This account has been deleted." (muted).
  - Nothing else: no `getProfileStats` call, and no friend, invite, cellar or edit buttons.
- **`src/app/u/[id]/cellar/page.tsx`** and **`src/app/u/[id]/tastings/[tastingId]/page.tsx`**: select `deleted_at`; a deleted profile gives `notFound()`.

### 5.5 People listings that must skip deleted profiles

Line numbers are at `dfe7a2b`. The change is always `.is("deleted_at", null)` on the `profiles` query.

| File | Query | Who |
|---|---|---|
| `src/app/community/people-list.tsx:43` | The directory list, search, sort and pages. Add the filter to the base query before `.or(…)`, `.order(…)` and `.range(…)`, so `count: "exact"`, the page count and every page exclude deleted profiles. In the rewritten Community, the same filter goes on the base query of every profiles list or search. | **main session at merge** (`src/app/community/**` is off-limits here) |
| `src/app/community/friends-list.tsx:31` | The Friends tab's profiles. Defensive: the scrub deletes friendships and D11 blocks new ones. | **main session at merge** |
| `src/app/tastings/new/people-search.ts:37` | `searchPeople`, a name search. "Deleted user" would otherwise match "del". | this build |
| `src/app/tastings/new/page.tsx:32` | Friends picker (defensive) | this build |
| `src/components/new-tasting-sheet.tsx:163` | Friends picker (defensive) | this build |
| `src/app/tastings/[id]/settings-actions.ts:76` | Settings friend picker (defensive) | this build |
| `src/app/admin/users/page.tsx:10` | Admin users list: a deleted account has no role to manage | this build |
| `src/app/tastings/[id]/actions.ts:256` | `inviteToTasting` email → profile lookup | this build |
| `src/app/tastings/new/actions.ts:219` | `createTasting` email → profile lookup | this build |
| `src/app/invite/actions.ts:149` | `sendPlatformInvite` existing-account check | this build |

Name-only readers such as leaderboards, the record, the CSV export and invitation cards need no change. They show "Deleted user", which is D1.

### 5.6 Participants card — `src/app/tastings/[id]/participants-card.tsx`

- Select `deleted_at`, and pass only non-deleted ids to `getBulkProfileSummaries`.
- A deleted participant's row, in both the laptop list and the phone list, renders the same layout inside a plain element instead of `<Link href="/u/…">`. It keeps the initial circle and the name. It drops the location/favourite and stats lines, and keeps "brings wine N", which belongs to the tasting.

### 5.7 Types — `src/lib/supabase/database.types.ts`

`profiles.Row` gets `deleted_at: string | null`, and `Insert`/`Update` do not (D18). The rest of the hand-written file stays in step with the migration as CLAUDE.md requires. `Relationships: []` is unchanged.

### 5.8 Pure modules and the vitest cases to write first

vitest has no `@/` alias, so these modules import siblings relatively and nothing from `@/`.

`src/lib/account/delete-copy.ts` holds every string in §6 as a named constant: the section, the dialog, the two list arrays in order, the notice, and the spec-copy lines.

`src/lib/account/delete-account.ts` exports:

- `DELETE_CONFIRM_WORD = "DELETE"`
- `isDeleteConfirmed(typed: string): boolean`: the exact string, with no trim and no case folding (D3)
- `DELETED_DISPLAY_NAME = "Deleted user"`
- `deletedEmailFor(userId: string): string` → `deleted+${userId}@blindr.invalid`
- `isDeletedProfile(p: { deleted_at: string | null } | null | undefined): boolean`
- `profilePageView({ viewerId, profileId, deletedAt }): "deleted" | "own" | "other"`
- `ACCOUNT_DELETED_LOGIN_PATH = "/login?deleted=1"`
- `accountDeletedNotice(param: string | string[] | undefined): string | null`
- `avatarPathsToRemove(userId: string, listed: { name: string; id: string | null }[]): string[]`
- `lastAdminRefusal(role: string, activeAdmins: number): string | null`
- `type DeleteAccountState = { error: string } | null`

Tests:

- **`src/lib/account/delete-account.test.ts`.**
  - `isDeleteConfirmed`: `"DELETE"` → true. `"delete"`, `"Delete"`, `" DELETE"`, `"DELETE "`, `"DELETE\n"`, `"DELETED"`, `""` and the full-width `"ＤＥＬＥＴＥ"` → false.
  - `deletedEmailFor("abc")` → `"deleted+abc@blindr.invalid"`.
  - `isDeletedProfile`: `null` and `undefined` → false; `{ deleted_at: null }` → false; a timestamp → true.
  - `profilePageView`:
    - a deleted profile → `"deleted"`, even when `viewerId === profileId`;
    - the viewer's own profile → `"own"`;
    - otherwise `"other"`.
  - `accountDeletedNotice`: `"1"` → the notice. `"0"`, `""`, `"true"`, `undefined` and `["1"]` → null.
  - `avatarPathsToRemove("u", [{ name: "avatar.png", id: "a" }, { name: "avatar.jpg", id: "b" }, { name: "x", id: null }])` → `["u/avatar.png", "u/avatar.jpg"]`. The folder entry (`id` null) is skipped. `[]` → `[]`. A name containing `/` or `..` is skipped.
  - `lastAdminRefusal`: `("ADMIN", 1)` → the spec-copy line. `("ADMIN", 2)`, `("MEMBER", 0)`, `("MEMBER", 1)` and `("CONTRIBUTOR", 1)` → null.
  - `ACCOUNT_DELETED_LOGIN_PATH` equals `"/login?deleted=1"`.
- **`src/lib/account/delete-copy.test.ts`** pins every owner string in §6 character for character, and the order of both lists.
- **`src/lib/account/account-deletion-migration.test.ts`** reads `supabase/migrations/20260919101300_account_deletion.sql` with `readFileSync`, normalising CRLF, and asserts:
  - it contains `display_name = 'Deleted user'`, and `DELETED_DISPLAY_NAME` equals that literal;
  - it contains `'deleted+' || p_user_id::text || '@blindr.invalid'`, and `deletedEmailFor("X")` equals that expression with `p_user_id::text` replaced by `X`.

  The SQL and the TypeScript can then never disagree about what a deleted profile looks like.

### 5.9 CLAUDE.md

Add an "Account deletion" bullet under Domain rules, in the style of the platform-invites one. Cover:

- The one path (the triggers on `auth.users` → `scrub_deleted_account`).
- The profile is kept and scrubbed; there is no FK to `auth.users`.
- The hosted-tastings and guest-seats rules.
- `get_semi_blind_candidates` decides "started" as `status <> 'DRAFT' and (started_at is not null or finished_at is null)`. A tasting CLOSED without ever starting (D6(b), or a host closing their own DRAFT) keeps DRAFT visibility. Never go back to a bare `status <> 'DRAFT'` or `status = 'CLOSED'` test for "started": that hands every candidate card of never-revealed glasses to the JOINED guests (D20).
- `deleted_at` is write-once, and client UPDATE is limited to the nine columns (with why: the self-promotion hole).
- The link guard.
- `.is("deleted_at", null)` on every people listing.
- A dashboard delete leaves the avatar file (the sweep query in §7 R5).
- Never pass `shouldSoftDelete`, because the self-service path relies on the hard delete freeing the email.

### 5.10 Merge notes for the main session

- **Community.** Add §5.5's two Community filters to whatever `src/app/community/**` looks like after the other build.
- **Login.** The main checkout has uncommitted auth work touching `src/app/login/page.tsx`, `login-form.tsx`, `login/actions.ts`, `src/lib/supabase/middleware.ts` and new `src/lib/auth/login-copy.ts` / `password-gate.ts`. This build keeps its login change to the `deleted` search param plus one status line. If `login-copy.ts` owns the login page's notices by then, fold `ACCOUNT_DELETED_NOTICE` into it rather than keeping a second notice slot. The password gate must let a signed-out visitor see `/login?deleted=1`.
- **Order of rollout.** Apply the migration live before, or together with, the deploy that adds the button and the `deleted_at` filters. The app's `.is("deleted_at", null)` fails on a database without the column.

## 6. Copy

Owner copy (verbatim):

- Section title: "Delete account"
- Section line: "Delete your Blindr account and everything that is only yours."
- Section button: "Delete account"
- Dialog title: "Delete your account?"
- List heading: "Deleted for good:"
  - "Your profile, photo and email"
  - "Your cellar and its history"
  - "Your tasting notes and ratings"
  - "Your friends list and invite links"
- List heading: "Kept for others:"
  - "Tastings you hosted or joined, shown as "Deleted user""
  - "Wines you added to the shared catalog"
- Input label: "Type DELETE to confirm"
- Buttons: "Cancel", "Delete my account"; pending "Deleting…"
- Login notice: "Your account has been deleted."
- The deleted profile's name everywhere: "Deleted user" (D1)

(spec copy), marked `(spec copy)` in code:

- Server-side mismatch: "Type DELETE exactly to delete your account."
- Last admin (D14): "You are the only admin. Make someone else an admin before you delete your account."
- `/u/<id>` of a deleted profile: "This account has been deleted."
- Database refusals (lower-case, the repo's SQL style):
  - "a deleted account stays deleted"
  - "this account has been deleted"
  - "only account deletion sets deleted_at"
  - "that account has been deleted"

Reused: "Deleted user" is also `DELETED_DISPLAY_NAME`, pinned to the SQL by §5.8's migration test.

## 7. Residuals, findings, non-goals

Accepted residuals:

- **R1 Leftover access token.** The JWT stays valid until it expires (the project's JWT expiry; Supabase's default is 3600 s). Profile, friendship and seat writes are refused (D10, D11). Other own-row inserts are possible, such as a note, a lot or a tasting. The main session sweeps with `select public.scrub_deleted_account(id) from public.profiles where deleted_at is not null`, which re-runs D8 only. A tasting created in that window is not swept.
- **R2 A deleted JOINED guest never locks.** In a running tasting, readiness never reaches everyone, and an ASYNC AFTER_ALL glass waits for the host. `reveal_wine`'s host path skips the count, so the host reveals.
- **R3 An incomplete BYO glass of a deleted guest in a running tasting loses its draft.** Nobody can finish it. `can_remove_flight_glass` needs the adder, or DRAFT plus host. `revealRefusal` refuses it, and the host finishes around it.
- **R4 Glasses never revealed in a tasting closed by deletion stay hidden for good.**
  - Their `blind_pending` catalog wines stay hidden, which is the existing accepted residual of `catalog_wine_identity_match`.
  - A SEMI_BLIND tasting that never started keeps its candidate list at DRAFT visibility: each guest sees only their own bottles, and the host's are shown to nobody. This works because `get_semi_blind_candidates` treats `status <> 'DRAFT' and (started_at is not null or finished_at is null)` as started (D20), and such a tasting has `started_at` null and `finished_at` set.
  - A started one keeps the full list its JOINED guests already had.
- **R5 A dashboard delete leaves `avatars/<id>/…`.** The URL is unreferenced once `avatar_url` is null. Sweep: `select o.name from storage.objects o join public.profiles p on p.id::text = split_part(o.name, '/', 1) where o.bucket_id = 'avatars' and p.deleted_at is not null`, then remove through the Storage API, never with a direct delete on `storage.objects`.
- **R6 Label-scan photos under `wine-images/catalog/staging/<id>/` stay.** See D15.
- **R7 A live account can still name itself "Deleted user".** The directory shows it, because it is not deleted.

Pre-existing issues found on 2026-09-19:

- **F1 (fixed by D10).** `authenticated` holds table-level UPDATE on `profiles`, and `profiles update own` checks only `id = auth.uid()`. Any signed-in member can therefore make themselves ADMIN (or CONTRIBUTOR, so `is_curator`) with one REST call. Rolled back on 2026-09-19: Diego (MEMBER) became ADMIN. Worth telling the owner when this ships.
- **F2 (not fixed here).** The storage policies `wine image write delete`/`update` return `true` for any path under `wine-images/catalog/`. Any signed-in user can delete or overwrite any catalog image, including the 97 under `catalog/staging/`. This is a separate task.
- **F3 (fixed by D20).** `authenticated` holds UPDATE on `tastings.status` under `tastings update host`. A host can therefore PATCH their own never-started SEMI_BLIND DRAFT to CLOSED, and the live `get_semi_blind_candidates` then counts it as started and hands every JOINED guest every candidate card. No live tasting is SEMI_BLIND today, so nothing has been exposed.

Non-goals:

- Handing hosting to someone instead of closing (`transfer_tasting_host` is DRAFT-only and refuses host-added glasses).
- Deleting unreferenced label-scan photos.
- A grace period or undo.
- Email confirmation of the deletion.
- Exporting one's data first.
- Admin-initiated deletion in the app (the dashboard covers it).
- Reserving the name "Deleted user".
- Any change to `src/app/community/**` in this build.

## 8. Verification

- **Checks.** `npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test` (the three new test files plus the suite), and `npm run build`.
- **Probe.** The §4 probe with every EXPECT row matching; `DRY-OK 20260919101300 account_deletion` from `scratch-apply --mode dry`.
- **Main session, after the live apply.**
  1. Create a throwaway account with `auth.admin.createUser`. Give it a note, a lot and a friendship with a demo account through the service role, then sign in as it with the `.superpowers/demo-session.mjs` pattern.
  2. Delete it through the real button at 375 px and 1280 px, in both themes. Check that the button enables only for `DELETE`, the pending state, and the landing on `/login?deleted=1` with the notice.
  3. Read back: profile scrubbed, `deleted_at` set, personal rows gone.
  4. `/u/<id>` shows the minimal page; `searchPeople` for "Del" returns nothing.
  5. Create and delete a second throwaway account from the Supabase dashboard. Its profile is scrubbed, the same as through the button.
