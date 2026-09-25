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
