-- Account deletion: one database path for every way an account goes away.
--
-- Spec: docs/superpowers/specs/2026-09-19-account-deletion-design.md (§3 is
-- the SQL design this file implements; D1-D19 are its decisions). Owner
-- decisions 2026-09-19: tastings they hosted or joined are KEPT, with the
-- person shown as "Deleted user" (D1); their tasting notes and ratings are
-- DELETED (D2); people confirm by typing DELETE (D3, app side).
--
-- Why: deleting a user in the Supabase dashboard left an orphaned profile
-- that kept showing in Community with its friendships. public.profiles has no
-- foreign key to auth.users on live: the live-only migration
-- 20260829265003_profiles_drop_authusers_fk (branch auth-phase-1, whose own
-- authentication creates profiles with no auth.users row) dropped it on
-- purpose. It is NOT restored here (D4): the profile row is scrubbed and kept,
-- so nothing ever cascades from profiles (tastings.host_id and
-- tasting_participants.user_id are ON DELETE CASCADE, and deleting a host's
-- tasting would delete everyone's guesses and could unmark a hidden glass's
-- catalog wine: a rule-1 leak).
--
-- Written against the LIVE state (read-only queries, 2026-09-19), never an
-- older migration file:
-- * profiles: the 14 columns pinned below; profiles_pkey only (no FK at all);
--   RLS on with "profiles read" (authenticated, true) and "profiles update
--   own" (authenticated, id = auth.uid()); one trigger,
--   profiles_sync_is_curator (BEFORE INSERT OR UPDATE OF role); table ACL
--   arwdDxtm for anon, authenticated and service_role (Supabase's default),
--   no column grants.
-- * auth.users: one non-internal trigger, on_auth_user_created (AFTER INSERT)
--   -> handle_new_user() (SECURITY DEFINER, search_path public); a deleted_at
--   timestamptz column (GoTrue's soft delete). label_reads.user_id,
--   wine_identity_drafts.owner_id and wine_pour_intents.owner_id reference it
--   ON DELETE CASCADE. GoTrue deletes as supabase_auth_admin with no JWT, so
--   auth.uid() is null inside every trigger this fires.
-- * The live-only auth-phase-1 tables auth_credentials, auth_sessions and
--   auth_tokens exist, are empty, and reference profiles ON DELETE CASCADE.
--   This file works with or without them (to_regclass guards).
-- * The ten function bodies the scrub relies on, and get_semi_blind_candidates
--   (recreated in step 8), pinned by md5 below.
-- * 32 profiles, 32 users, 0 orphans, 0 soft-deleted users (so the backfill
--   is a no-op live; the owner removed the two "niceman" profiles by hand).
--
-- What this migration does:
-- 1. profiles.deleted_at (timestamptz, null): stamped once, by
--    scrub_deleted_account, never cleared (D10).
-- 2. Drops profiles' foreign key only if this database still has the init
--    schema's (a clean replay of the repo; live has none) (D12).
-- 3. profiles_deleted_guard (BEFORE INSERT OR UPDATE on profiles, SECURITY
--    INVOKER because it reads current_user): once deleted_at is set nobody
--    changes it; no client (anon/authenticated) sets it or writes any column
--    of a deleted row (D10).
-- 4. Client UPDATE on profiles narrowed to the nine columns the app writes;
--    anon loses UPDATE entirely. This also closes a live hole: any signed-in
--    member could `update profiles set role = 'ADMIN'` on their own row (F1).
-- 5. refuse_deleted_profile_link (BEFORE INSERT on friendships and
--    tasting_participants): no new friendship or seat names a deleted
--    profile (D11).
-- 6. scrub_deleted_account(uuid) (SECURITY DEFINER, EXECUTE revoked from
--    PUBLIC, anon, authenticated and service_role): the one deletion path
--    (D4-D8). Hosted tastings: a never-started DRAFT nobody else joined or was
--    invited to is deleted; every other unfinished one is CLOSED with nothing
--    revealed; their places are deleted (D6). Seats in other people's
--    tastings: a never-started tasting loses their glasses (renumbered) and
--    their seat; a started one loses only an unanswered seat nothing
--    references; a CLOSED one keeps everything (D7). Deleted on every call:
--    notes, cellar, friendships, invites, pour intents, drafts, label reads,
--    phase-1 rows (D8). Kept: catalog rows, edits, map reviews, tastings,
--    seats, glasses, answers, guesses (D9). Last, the profile is scrubbed to
--    "Deleted user" / deleted+<id>@blindr.invalid and deleted_at stamped (D5).
-- 7. handle_deleted_user() and two triggers on auth.users:
--    on_auth_user_deleted (AFTER DELETE) and on_auth_user_soft_deleted (AFTER
--    UPDATE OF deleted_at, null -> set). The self-service button's hard
--    delete, the dashboard's "Delete user" and a GoTrue soft delete all land
--    here. Firing a trigger never checks EXECUTE on its function.
-- 8. get_semi_blind_candidates recreated with one line changed: "started" is
--    status <> 'DRAFT' and (started_at is not null or finished_at is null),
--    so a tasting CLOSED without ever starting (D6b) keeps DRAFT visibility
--    (rule 1, below).
-- 9. Backfill: every profile whose auth.users row is missing or soft-deleted
--    is scrubbed, but only while the phase-1 tables are absent or empty, so a
--    phase-1 account is never mistaken for an orphan (D12).
--
-- Rule 1 (no identity of an unrevealed glass reaches anyone who may not
-- already see it): nothing here reveals, scores or moves a glass. No policy
-- tests a tasting's status or its lifecycle stamps (checked live 2026-09-19).
-- One function did widen a read when a tasting leaves DRAFT: the live
-- get_semi_blind_candidates read "started" as status <> 'DRAFT', so D6b
-- closing a never-started SEMI_BLIND DRAFT that others JOINED (or were
-- INVITED to, then flip their own seat to JOINED) would hand them every
-- candidate card of glasses never revealed: in a one-glass flight, that
-- glass's producer, name, vintage, appellation and grape. Step 8 recreates it
-- so that shape keeps DRAFT visibility. Every other function that tests
-- <> 'DRAFT' only gates a write (can_remove_flight_glass, move_flight_glass,
-- set_flight_glass_added_via, can_delete_flight_glass_row, the pour/draw-down
-- functions, transfer_tasting_host, the flight lock and lifecycle triggers).
-- The only deleted glasses are a never-started tasting's: the deleted host's
-- own (nobody else JOINED or INVITED) or the deleted person's own BYO glasses
-- in someone else's never-started tasting — the same delete
-- remove_flight_glass makes in a DRAFT today.
--
-- Security: the scrub is reachable only through the two auth.users triggers
-- (writing auth.users is GoTrue's alone) and EXECUTE is revoked from every
-- client role and service_role. A GoTrue delete runs the scrub inside its own
-- transaction, so any raise rolls the whole delete back ("Database error
-- deleting user") and changes nothing.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
  v_bad text;
begin
  -- 1. Nothing this migration creates exists yet.
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped) then
    raise exception 'public.profiles already has deleted_at; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('scrub_deleted_account', 'handle_deleted_user', 'profiles_deleted_guard', 'refuse_deleted_profile_link');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(format('%s.%s', t.tgrelid::regclass::text, t.tgname), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('profiles_deleted_guard', 'friendships_refuse_deleted_profile',
                     'tasting_participants_refuse_deleted_profile', 'on_auth_user_deleted', 'on_auth_user_soft_deleted');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 2. profiles has no foreign key (live), or exactly the init schema's
  --    (a clean replay: 20260829265003, which dropped it live, is not in the repo).
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.profiles'::regclass and k.contype = 'f';
  if v_text is not null
     and v_text <> 'profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE' then
    raise exception 'profiles foreign keys are "%", expected none or the init schema''s profiles_id_fkey', v_text;
  end if;

  -- 3. profiles: exactly the 14 live columns (by name), so the scrub names
  --    every personal one; RLS on, not forced; the two live policies; the one
  --    live trigger.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url text, bio text, cellar_visibility cellar_visibility not null, created_at timestamptz not null, '
       || 'display_name text not null, email text not null, favorite_wine_type text, id uuid not null, '
       || 'is_curator bool not null, last_seen_at timestamptz, location text, phone text, '
       || 'preferred_currency text not null, role user_role not null' then
    raise exception 'profiles columns differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.profiles'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'profiles row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.profiles'::regclass;
  if v_text is distinct from
       'profiles read r permissive {authenticated} true -; '
       || 'profiles update own w permissive {authenticated} (id = auth.uid()) (id = auth.uid())' then
    raise exception 'profiles policies differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
  if v_text is distinct from 'profiles_sync_is_curator 23 sync_is_curator_from_role()' then
    raise exception 'profiles triggers differ from the live state this file was written against: %', v_text;
  end if;

  -- 4. profiles privileges: anon and authenticated hold table-level UPDATE
  --    (the state being narrowed) and no column grants exist yet.
  if not has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon/authenticated no longer hold table-level UPDATE on profiles; re-read live before applying';
  end if;
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and a.attacl is not null) then
    raise exception 'profiles already carries column-level grants; re-read live before applying';
  end if;

  -- 5. auth.users: the only non-internal trigger is on_auth_user_created ->
  --    handle_new_user(); deleted_at is a timestamptz (the soft-delete trigger's column).
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
  if v_text is distinct from 'on_auth_user_created 5 handle_new_user()' then
    raise exception 'auth.users triggers differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'auth.users'::regclass and a.attname = 'deleted_at' and not a.attisdropped
                   and a.atttypid = 'timestamptz'::regtype)
     or not exists (select 1 from pg_attribute a
                    where a.attrelid = 'auth.users'::regclass and a.attname = 'id' and not a.attisdropped
                      and a.atttypid = 'uuid'::regtype) then
    raise exception 'auth.users has no id uuid / deleted_at timestamptz';
  end if;

  -- 6. The function bodies the scrub relies on (md5 of prosrc, any CR
  --    stripped), as read live 2026-09-19. A change to any of them must surface.
  --    get_semi_blind_candidates is the live body (= 20260914102500's) that
  --    step 8 replaces; the post-state pins the new body instead.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_bad
  from (values
    ('public.get_semi_blind_candidates(uuid)',       'ade50a9fd3932ba3bb261c01c6d9bfa9'),
    ('public.handle_new_user()',                     'f18c8dc309331e2b2cf7d40bad8d55fa'),
    ('public.tastings_stamp_lifecycle()',            '5d7702a39d76b3a8b6fd3ddf2d30fe1d'),
    ('public.tastings_lock_setup_after_start()',     'fc4b5a849f9c73a4b94be246dfa4d948'),
    ('public.tastings_pause_follows_status()',       '68a9bfcb6564888af5ccc5c82846de68'),
    ('public.tasting_participants_leave_guard()',    'a13d0de839df497a9bc8619cb29af30d'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.wines_drop_unresolved_notes()',         'adb5d9b44b1df4797afea832f1fccbf6'),
    ('public.wines_pin_adder()',                     'cdf869a9016452c49640bfba9fba2ff5'),
    ('public.sync_is_curator_from_role()',           '538b24bb26930a4f823f464b669ccd59'),
    ('public.remove_flight_glass(uuid)',             'afbc58c0c0b48becdfde9436d5b2ebc0')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_bad;
  end if;

  -- 7. The enum labels the scrub writes or compares.
  if not exists (select 1 from pg_enum where enumtypid = 'public.user_role'::regtype and enumlabel = 'MEMBER')
     or not exists (select 1 from pg_enum where enumtypid = 'public.cellar_visibility'::regtype and enumlabel = 'PRIVATE')
     or (select count(*) from pg_enum where enumtypid = 'public.tasting_status'::regtype and enumlabel in ('DRAFT', 'CLOSED')) <> 2
     or (select count(*) from pg_enum where enumtypid = 'public.participant_status'::regtype and enumlabel in ('JOINED', 'INVITED')) <> 2 then
    raise exception 'an enum label the scrub writes is missing';
  end if;

  -- 8. Every column the scrub names exists (plpgsql resolves them only at the
  --    first call, which would be someone's delete).
  select string_agg(s.col, ', ') into v_bad
  from unnest(array[
    'tastings.host_id', 'tastings.status', 'tastings.started_at', 'tastings.finished_at', 'tastings.paused_at',
    'tasting_places.tasting_id',
    'tasting_participants.tasting_id', 'tasting_participants.user_id', 'tasting_participants.status',
    'wines.tasting_id', 'wines.position', 'wines.contributor_participant_id',
    'guesses.participant_id',
    'wset_notes.author_id', 'cellar_consumptions.owner_id', 'cellar_lots.owner_id',
    'friendships.user_id', 'friendships.friend_id', 'platform_invites.inviter_id',
    'wine_pour_intents.owner_id', 'wine_identity_drafts.owner_id', 'label_reads.user_id'
  ]) as s (col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || split_part(s.col, '.', 1))
                      and a.attname = split_part(s.col, '.', 2) and not a.attisdropped);
  if v_bad is not null then
    raise exception 'columns the scrub names are missing: %', v_bad;
  end if;

  -- 9. The delete rules the scrub's deletes run into (every FK that points at
  --    profiles or at a table the scrub deletes from, the phase-1 tables
  --    aside): nothing RESTRICTs a delete the scrub makes, and profiles' own
  --    RESTRICTs (catalog_wines, wset_notes) are why the row stays.
  select string_agg(format('%s.%s %s', k.conrelid::regclass::text, k.conname, k.confdeltype), '; '
                    order by k.conrelid::regclass::text collate "C", k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.contype = 'f'
    and k.confrelid in ('public.profiles'::regclass, 'public.wset_notes'::regclass, 'public.cellar_lots'::regclass,
                        'public.cellar_consumptions'::regclass, 'public.tasting_participants'::regclass,
                        'public.wines'::regclass, 'public.tastings'::regclass)
    and k.conrelid::regclass::text not in ('auth_credentials', 'auth_sessions', 'auth_tokens');
  if v_text is distinct from
       'appellations.appellations_map_reviewed_by_fkey n; catalog_wine_edits.catalog_wine_edits_editor_id_fkey n; '
       || 'catalog_wines.catalog_wines_created_by_fkey r; catalog_wines_unidentified.catalog_wines_unidentified_created_by_fkey a; '
       || 'cellar_consumptions.cellar_consumptions_lot_id_fkey n; cellar_consumptions.cellar_consumptions_owner_id_fkey c; '
       || 'cellar_consumptions.cellar_consumptions_wset_note_id_fkey n; cellar_lots.cellar_lots_owner_id_fkey c; '
       || 'countries.countries_map_reviewed_by_fkey n; friendships.friendships_friend_id_fkey c; '
       || 'friendships.friendships_user_id_fkey c; guesses.guesses_guessed_wine_id_fkey n; '
       || 'guesses.guesses_participant_id_fkey c; guesses.guesses_wine_id_fkey c; '
       || 'platform_invites.platform_invites_inviter_id_fkey c; regions.regions_map_reviewed_by_fkey n; '
       || 'semi_blind_candidate_keys.semi_blind_candidate_keys_tasting_id_fkey c; '
       || 'semi_blind_candidate_keys.semi_blind_candidate_keys_wine_id_fkey c; '
       || 'tasting_participants.tasting_participants_tasting_id_fkey c; tasting_participants.tasting_participants_user_id_fkey c; '
       || 'tasting_places.tasting_places_tasting_id_fkey c; tastings.tastings_current_wine_id_fkey n; '
       || 'tastings.tastings_host_id_fkey c; wine_answers.wine_answers_wine_id_fkey c; '
       || 'wine_identity_drafts.wine_identity_drafts_wine_id_fkey c; '
       || 'wine_pour_intents.wine_pour_intents_cellar_consumption_id_fkey n; '
       || 'wine_pour_intents.wine_pour_intents_cellar_lot_id_fkey n; wine_pour_intents.wine_pour_intents_wine_id_fkey c; '
       || 'wines.wines_contributor_participant_id_fkey n; wines.wines_tasting_id_fkey c; '
       || 'wset_note_aromas.wset_note_aromas_note_id_fkey c; wset_notes.wset_notes_author_id_fkey r; '
       || 'wset_notes.wset_notes_tasting_wine_id_fkey n' then
    raise exception 'foreign keys into the tables the scrub touches differ from the live state this file was written against: %', v_text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1-2. The column, and the replay-only foreign key drop (D10, D12).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. The deleted_at write guard (D10).
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it reads current_user, which a definer function
-- would replace with its owner. Every PostgREST write runs as anon or
-- authenticated; the scrub and admin_set_user_role (SECURITY DEFINER) run as
-- the owner and pass.
create function public.profiles_deleted_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'a deleted account stays deleted' using errcode = 'insufficient_privilege'; -- (spec copy)
    end if;
    if current_user::text in ('anon', 'authenticated') then
      raise exception 'this account has been deleted' using errcode = 'insufficient_privilege'; -- (spec copy)
    end if;
  end if;
  if new.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null)
     and current_user::text in ('anon', 'authenticated') then
    raise exception 'only account deletion sets deleted_at' using errcode = 'insufficient_privilege'; -- (spec copy)
  end if;
  return new;
end $$;
create trigger profiles_deleted_guard before insert or update on public.profiles
  for each row execute function public.profiles_deleted_guard();

-- ---------------------------------------------------------------------------
-- 4. Client UPDATE narrowed to the nine columns the app writes (D10, F1).
-- ---------------------------------------------------------------------------
-- updateProfile, AvatarUploader, CellarVisibilityControl, set-password and
-- last-seen.ts write only these. role changes go through admin_set_user_role;
-- id, email, created_at, is_curator, role and deleted_at are never client-written.
revoke update on table public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url, location, phone, favorite_wine_type,
              cellar_visibility, preferred_currency, last_seen_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 5. No new friendship or seat names a deleted profile (D11).
-- ---------------------------------------------------------------------------
-- One function for both tables: to_jsonb(new) carries user_id always and
-- friend_id only on friendships (a bare new.friend_id would not compile for
-- tasting_participants).
create function public.refuse_deleted_profile_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles p
             where p.deleted_at is not null
               and p.id::text in (to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'friend_id')) then
    raise exception 'that account has been deleted' using errcode = 'insufficient_privilege'; -- (spec copy)
  end if;
  return new;
end $$;
create trigger friendships_refuse_deleted_profile before insert on public.friendships
  for each row execute function public.refuse_deleted_profile_link();
create trigger tasting_participants_refuse_deleted_profile before insert on public.tasting_participants
  for each row execute function public.refuse_deleted_profile_link();

-- ---------------------------------------------------------------------------
-- 6. The scrub (D4-D9, D12).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. The two auth.users triggers (D4).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- EXECUTE (spec §3.4). Supabase's default privileges would otherwise grant it
-- to anon, authenticated and service_role, and PostgREST would expose
-- /rpc/scrub_deleted_account. Firing a trigger never checks EXECUTE.
-- ---------------------------------------------------------------------------
revoke all on function public.scrub_deleted_account(uuid)     from public, anon, authenticated, service_role;
revoke all on function public.handle_deleted_user()            from public, anon, authenticated, service_role;
revoke all on function public.refuse_deleted_profile_link()    from public, anon, authenticated, service_role;
revoke all on function public.profiles_deleted_guard()         from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. get_semi_blind_candidates: "started" means it actually started (rule 1).
-- ---------------------------------------------------------------------------
-- D6(b) closes a hosted DRAFT that someone else JOINED or was INVITED to. The
-- live function (20260914102500, pinned in the pre-state) decided "started" as
-- status <> 'DRAFT', so once that DRAFT is CLOSED every JOINED guest (an
-- INVITED one can flip their own seat to JOINED through "participants update
-- own or host") would get every candidate card of glasses nobody ever saw
-- revealed. A host could already reach the same state by setting DRAFT ->
-- CLOSED themselves ("tastings update host").
--
-- The body below is 20260914102500's, byte for byte, except the one `select
-- ... into v_started, v_is_host` line: "started" is now the old test AND
-- (started_at is not null or finished_at is null). tastings_stamp_lifecycle
-- stamps started_at on every DRAFT -> IN_PROGRESS and finished_at on every
-- move to CLOSED, so a CLOSED row with started_at null and finished_at set was
-- closed without ever starting, and keeps DRAFT visibility: only the caller's
-- own cards, and "pending" only for the host. Because it only adds a clause,
-- it never widens anything: a running tasting, a tasting closed after a real
-- Start, and a legacy row with neither stamp keep their list. Live has no
-- SEMI_BLIND tasting (read 2026-09-19), so no existing row changes behaviour.
-- `create or replace` keeps the ACL (owner, authenticated and service_role
-- EXECUTE; no anon or PUBLIC), which the post-state asserts.
create or replace function public.get_semi_blind_candidates(p_tasting_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cards jsonb;
  v_pending int;
  v_unkeyed int;
  v_started boolean;
  v_is_host boolean;
  v_pid uuid;
begin
  if not public.can_see_semi_blind_list(p_tasting_id) then
    return null;
  end if;
  perform public.ensure_semi_blind_keys(p_tasting_id);
  select t.status <> 'DRAFT' and (t.started_at is not null or t.finished_at is null), t.host_id = auth.uid() into v_started, v_is_host
  from tastings t where t.id = p_tasting_id;
  select id into v_pid from tasting_participants
   where tasting_id = p_tasting_id and user_id = auth.uid() and status = 'JOINED';

  -- Before Start a caller sees only the glasses they added (spec §10.3 item 1).
  -- From Start the same holds while any glass has no answer key: a glass started
  -- without one (add-wine D7) and keyed later would otherwise put one new card on
  -- the guests' screens in the same refresh as tasting_incomplete_glasses drops
  -- that glass. Every card appears at once when the last key lands (BT-SQL9 review).
  with numbered as (
    select w.id, w.is_revealed, w.added_by_host, w.contributor_participant_id,
           row_number() over (order by w.position) as glass,
           exists (select 1 from wine_answers a where a.wine_id = w.id) as keyed
    from wines w where w.tasting_id = p_tasting_id
  ),
  unkeyed as (
    select (count(*) filter (where not n.keyed))::int as n
    from numbered n
  ),
  ordered as (
    select n.id, n.is_revealed, n.glass
    from numbered n cross join unkeyed x
    where (v_started and x.n = 0)
       or (n.added_by_host and v_is_host)
       or (v_pid is not null and n.contributor_participant_id = v_pid)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', k.candidate_key,
           'producer', pr.name,
           'wine_name', coalesce(cw.wine_name, u.wine_name),
           'vintage_kind', a.vintage_kind,
           'vintage_year', a.vintage_year,
           'vintage_tawny_years', a.vintage_tawny_years,
           'appellation', ap.name,
           'grape', g.name,
           'revealed_glass', case when o.is_revealed then o.glass end
         ) order by k.candidate_key), '[]'::jsonb),
         (select x.n from unkeyed x)
    into v_cards, v_unkeyed
  from ordered o
  join semi_blind_candidate_keys k on k.wine_id = o.id
  join wine_answers a on a.wine_id = o.id
  left join producers pr on pr.id = a.producer_id
  left join catalog_wines cw on cw.id = a.catalog_wine_id
  left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
  left join appellations ap on ap.id = a.appellation_id
  left join grapes g on g.id = a.primary_grape_id;

  v_pending := case when v_started or v_is_host then v_unkeyed end;

  return jsonb_build_object('cards', v_cards, 'pending', v_pending);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Backfill (D12): profiles whose auth user is missing or soft-deleted, only
--    while the phase-1 tables are absent or empty (0 such profiles live today).
-- ---------------------------------------------------------------------------
do $$
declare
  v_phase1 bigint := 0;
  v_n bigint;
  v_table text;
begin
  foreach v_table in array array['auth_credentials', 'auth_sessions', 'auth_tokens'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('select count(*) from public.%I', v_table) into v_n;
      v_phase1 := v_phase1 + v_n;
    end if;
  end loop;
  if v_phase1 = 0 then
    perform public.scrub_deleted_account(p.id)
       from public.profiles p
      where p.deleted_at is null
        and not exists (select 1 from auth.users u where u.id = p.id and u.deleted_at is null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- post-state: begin (same transaction; every check a raise exception)
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
  v_phase1 bigint := 0;
  v_n bigint;
  v_table text;
  v_deleted_attnum int2;
begin
  -- 1. The column: timestamptz, nullable, no default.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped
                   and a.atttypid = 'timestamptz'::regtype and not a.attnotnull and not a.atthasdef) then
    raise exception 'profiles.deleted_at is not a nullable timestamptz without a default';
  end if;

  -- 2. profiles constraints: exactly profiles_pkey (no foreign key at all).
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.profiles'::regclass;
  if v_text is distinct from 'profiles_pkey PRIMARY KEY (id)' then
    raise exception 'profiles constraints are "%", expected exactly profiles_pkey', v_text;
  end if;

  -- 3. Policies unchanged; RLS still on, not forced.
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.profiles'::regclass;
  if v_text is distinct from
       'profiles read r permissive {authenticated} true -; '
       || 'profiles update own w permissive {authenticated} (id = auth.uid()) (id = auth.uid())'
     or not exists (select 1 from pg_class c
                    where c.oid = 'public.profiles'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'profiles policies or RLS changed: %', v_text;
  end if;

  -- 4. Grants: no table-level UPDATE for anon or authenticated; authenticated
  --    UPDATE on exactly the nine columns; anon UPDATE on none; no other
  --    column grantee; authenticated keeps SELECT; service_role keeps UPDATE.
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated still holds table-level UPDATE on profiles';
  end if;
  if has_any_column_privilege('anon', 'public.profiles', 'UPDATE') then
    raise exception 'anon holds UPDATE on a profiles column';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE' then
    raise exception 'profiles column privileges are %, expected UPDATE on exactly the nine client columns', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
             where a.attrelid = 'public.profiles'::regclass and x.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on profiles';
  end if;
  select string_agg(s.col, ', ') into v_bad
  from unnest(array['display_name', 'bio', 'avatar_url', 'location', 'phone', 'favorite_wine_type',
                    'cellar_visibility', 'preferred_currency', 'last_seen_at']) as s (col)
  where not has_column_privilege('authenticated', 'public.profiles', s.col, 'UPDATE');
  if v_bad is not null then
    raise exception 'authenticated cannot update profiles columns it needs: %', v_bad;
  end if;
  select string_agg(s.col, ', ') into v_bad
  from unnest(array['id', 'email', 'created_at', 'is_curator', 'role', 'deleted_at']) as s (col)
  where has_column_privilege('authenticated', 'public.profiles', s.col, 'UPDATE');
  if v_bad is not null then
    raise exception 'authenticated can update profiles columns no client writes: %', v_bad;
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    raise exception 'authenticated lost SELECT or service_role lost UPDATE on profiles';
  end if;

  -- 5. The four new functions: security, search_path, language, volatility,
  --    return type, body (md5 of prosrc, CR stripped), and nobody but the
  --    owner holds EXECUTE (no PUBLIC entry; anon, authenticated and
  --    service_role refused).
  select string_agg(format('%s (%s)', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_bad
  from (values
    ('public.scrub_deleted_account(uuid)',   true,  'v', 'void',    'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.handle_deleted_user()',         true,  'v', 'trigger', '31854c042d1a56f11845579481fe979f'),
    ('public.refuse_deleted_profile_link()', true,  'v', 'trigger', '288dd03195cd529a7c5bc995cac78035'),
    ('public.profiles_deleted_guard()',      false, 'v', 'trigger', '605da26c81c9a0a4ff813595c10b79f1')
  ) as s (sig, secdef, volatile, rettype, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  left join pg_language l on l.oid = p.prolang
  where p.oid is null
     or p.prosecdef <> s.secdef
     or p.proconfig is distinct from array['search_path=public']
     or l.lanname <> 'plpgsql'
     or p.provolatile::text <> s.volatile
     or format_type(p.prorettype, null) <> s.rettype
     or md5(replace(p.prosrc, chr(13), '')) <> s.md5
     or exists (select 1 from aclexplode(p.proacl) x where x.grantee <> p.proowner)
     or p.proacl is null
     or has_function_privilege('anon', p.oid, 'EXECUTE')
     or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'new functions differ from the ones this migration was written with (body md5 in brackets): %', v_bad;
  end if;

  -- 6. Triggers on auth.users: exactly the three, all enabled; the delete one
  --    is AFTER ROW DELETE (tgtype 9), the soft-delete one AFTER ROW UPDATE
  --    (tgtype 17) OF deleted_at only, with a WHEN clause; on_auth_user_created
  --    still calls handle_new_user.
  select attnum into v_deleted_attnum from pg_attribute
   where attrelid = 'auth.users'::regclass and attname = 'deleted_at' and not attisdropped;
  select string_agg(format('%s %s %s %s %s %s', t.tgname, t.tgtype, t.tgenabled, t.tgfoid::regprocedure::text,
                           coalesce(nullif(t.tgattr::text, ''), '-'), t.tgqual is not null),
                    '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'on_auth_user_created 5 O handle_new_user() - f; '
       || 'on_auth_user_deleted 9 O handle_deleted_user() - f; '
       || format('on_auth_user_soft_deleted 17 O handle_deleted_user() %s t', v_deleted_attnum) then
    raise exception 'auth.users triggers are "%"', v_text;
  end if;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_soft_deleted'
                   and pg_get_triggerdef(t.oid) like '% WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE %') then
    raise exception 'on_auth_user_soft_deleted does not fire only when deleted_at goes from null to set';
  end if;

  -- 7. Triggers on profiles, friendships and tasting_participants.
  select string_agg(format('%s.%s %s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text, coalesce(nullif(t.tgattr::text, ''), '-')),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where not t.tgisinternal
    and (t.tgrelid = 'public.profiles'::regclass
         or t.tgname in ('friendships_refuse_deleted_profile', 'tasting_participants_refuse_deleted_profile'));
  if v_text is distinct from
       'friendships.friendships_refuse_deleted_profile 7 O refuse_deleted_profile_link() -; '
       || 'profiles.profiles_deleted_guard 23 O profiles_deleted_guard() -; '
       || 'profiles.profiles_sync_is_curator 23 O sync_is_curator_from_role() 11; '
       || 'tasting_participants.tasting_participants_refuse_deleted_profile 7 O refuse_deleted_profile_link() -' then
    raise exception 'profile-link triggers are "%"', v_text;
  end if;

  -- 8. The pinned bodies are unchanged.
  select string_agg(s.sig, ', ') into v_bad
  from (values
    ('public.handle_new_user()',                     'f18c8dc309331e2b2cf7d40bad8d55fa'),
    ('public.tastings_stamp_lifecycle()',            '5d7702a39d76b3a8b6fd3ddf2d30fe1d'),
    ('public.tastings_lock_setup_after_start()',     'fc4b5a849f9c73a4b94be246dfa4d948'),
    ('public.tastings_pause_follows_status()',       '68a9bfcb6564888af5ccc5c82846de68'),
    ('public.tasting_participants_leave_guard()',    'a13d0de839df497a9bc8619cb29af30d'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.wines_drop_unresolved_notes()',         'adb5d9b44b1df4797afea832f1fccbf6'),
    ('public.wines_pin_adder()',                     'cdf869a9016452c49640bfba9fba2ff5'),
    ('public.sync_is_curator_from_role()',           '538b24bb26930a4f823f464b669ccd59'),
    ('public.remove_flight_glass(uuid)',             'afbc58c0c0b48becdfde9436d5b2ebc0')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'pinned function bodies changed: %', v_bad;
  end if;

  -- 9. Backfill: with the phase-1 tables absent or empty, every profile that
  --    is not deleted has a live (not soft-deleted) auth user.
  foreach v_table in array array['auth_credentials', 'auth_sessions', 'auth_tokens'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('select count(*) from public.%I', v_table) into v_n;
      v_phase1 := v_phase1 + v_n;
    end if;
  end loop;
  if v_phase1 = 0 and exists (
       select 1 from public.profiles p
        where p.deleted_at is null
          and not exists (select 1 from auth.users u where u.id = p.id and u.deleted_at is null)) then
    raise exception 'a profile whose auth user is gone or soft-deleted was not scrubbed';
  end if;

  -- 10. get_semi_blind_candidates (step 8): the new body (md5 of prosrc, CR
  --     stripped), still SECURITY DEFINER, search_path public, plpgsql,
  --     volatile, returning jsonb; EXECUTE unchanged by the replace: exactly
  --     the owner, authenticated and service_role (no PUBLIC), so
  --     authenticated can call it and anon cannot.
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from pg_proc p,
       lateral (select case when a.grantee = 0 then 'PUBLIC'
                            when a.grantee = p.proowner then 'OWNER'
                            else pg_get_userbyid(a.grantee)::text end || ':' || a.privilege_type as g
                  from aclexplode(p.proacl) a) as x
  where p.oid = to_regprocedure('public.get_semi_blind_candidates(uuid)');
  select coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing') into v_bad
  from (select 1) as one
  left join pg_proc p on p.oid = to_regprocedure('public.get_semi_blind_candidates(uuid)');
  if v_bad <> '40c5b78ccffa50b4ad7c75510e6e9f37'
     or not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                    where p.oid = to_regprocedure('public.get_semi_blind_candidates(uuid)')
                      and p.prosecdef and p.proconfig = array['search_path=public'] and l.lanname = 'plpgsql'
                      and p.provolatile = 'v' and format_type(p.prorettype, null) = 'jsonb')
     or v_text is distinct from 'OWNER:EXECUTE,authenticated:EXECUTE,service_role:EXECUTE'
     or not has_function_privilege('authenticated', 'public.get_semi_blind_candidates(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_semi_blind_candidates(uuid)', 'EXECUTE') then
    raise exception 'get_semi_blind_candidates is not the recreated one (body md5 %, EXECUTE %)', v_bad, coalesce(v_text, '-');
  end if;
end $$;
-- ---------------------------------------------------------------------------
-- post-state: end
-- ---------------------------------------------------------------------------
