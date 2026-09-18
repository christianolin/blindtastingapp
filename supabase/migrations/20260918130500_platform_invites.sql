-- platform_invites: a personal invite link (/invite/<code>) that brings someone
-- onto Blindr as the inviter's friend, both ways: the table, its RLS, the
-- anon-callable preview and the signed-in accept.
--
-- Platform invites, PI-SQL1: spec §4 (the SQL between the banners below,
-- verbatim), D4 (data), D6 (version), D7 (the code is minted by the column
-- default; no client chooses one), D8 (bounds), D9 (the preview's four
-- columns), D10 (accept's rules, in order); plan refinement 14 (constraint
-- names). Ledger: docs/superpowers/plans/2026-09-18-platform-invites.md.
--
-- Written against the LIVE state (read-only dump, 2026-09-18:
-- .superpowers/invites/probes/20260918130500-live-defs.sql), never an older
-- migration file:
-- * generate_join_code(): invoker rights, no search_path, volatile, plpgsql,
--   returns text; the M4 body (10 characters from the 32-letter alphabet
--   ABCDEFGHJKLMNPQRSTUVWXYZ23456789; md5 32e10e8b3ab902e7de729a8147a2e47e);
--   Supabase's default function ACL, EXECUTE for PUBLIC, anon, authenticated
--   and service_role — which is what lets a client's INSERT evaluate the new
--   column default (D7). Its only live caller is ensure_join_code (SECURITY
--   DEFINER, host-only). Neither is changed here.
-- * friendships: one-way rows (id, user_id, friend_id, created_at);
--   friendships_user_id_friend_id_key UNIQUE (user_id, friend_id) — the
--   target of accept's ON CONFLICT — and friendships_check CHECK
--   (user_id <> friend_id); both FKs cascade from profiles(id); RLS on with
--   the three "own" policies for authenticated; no triggers. Not changed.
-- * profiles: id uuid PRIMARY KEY, display_name text not null,
--   avatar_url text — what the preview joins. Not changed.
-- * No platform_invites table; no function named get_platform_invite_preview
--   or accept_platform_invite (any signature); no schema_migrations row for
--   20260918130500.
-- * Supabase's default privileges (pg_default_acl for postgres in public)
--   grant anon, authenticated and service_role every privilege on a new table
--   and EXECUTE on a new function: the revokes below undo that, and the
--   post-state block asserts the result, not the default.
--
-- What this migration does (spec §4, verbatim; the five refusal strings in
-- accept_platform_invite carry a trailing plan-copy marker comment and
-- nothing else differs from the spec's block):
-- 1. platform_invites: id, code (default generate_join_code(), unique, shape
--    ^[A-HJ-NP-Z2-9]{10}$), inviter_id -> profiles ON DELETE CASCADE,
--    invitee_email, invitee_name, max_uses (default 50, 1..1000), uses
--    (default 0, >= 0), expires_at (default now() + 30 days; > created_at and
--    <= created_at + 1 year), created_at; invitee_name 1..80 characters when
--    set; invitee_email stored lower(btrim()) when set (D8); an index on
--    inviter_id.
-- 2. RLS: the inviter reads and inserts own rows; nobody updates or deletes
--    through a client. authenticated holds SELECT and INSERT on exactly
--    inviter_id, invitee_email, invitee_name, max_uses, expires_at (a client
--    cannot choose id, code, uses or created_at); anon holds nothing;
--    service_role keeps the defaults (the probe's and the main session's
--    fixtures).
-- 3. get_platform_invite_preview(code): SECURITY DEFINER, stable, sql;
--    EXECUTE for anon and authenticated. One row per known code — state
--    ('expired' wins over 'exhausted', else 'ok'), the inviter's display
--    name and avatar, and inviter_id for signed-in callers only — never the
--    invitee's name or email (D9). No row means an unknown code.
-- 4. accept_platform_invite(code): SECURITY DEFINER, volatile, plpgsql;
--    EXECUTE for authenticated only (revoked from PUBLIC, anon and
--    service_role — auth.uid() is null for it; the transfer_tasting_host OD-1
--    precedent). In order: not signed in; no row; own link; expired; an
--    account that already holds a friendships row to the inviter gets the
--    reverse row if missing and counts no use (idempotent, checked before the
--    cap so a re-open never reads as used up); used up; otherwise both rows
--    (ON CONFLICT DO NOTHING), uses + 1, the inviter id returned (D10).
--
-- Security (spec §4 "Security reasoning"; D7, D9, D10, D12):
-- * The preview exposes nothing a signed-in user could not already read from
--   the public directory (profiles display name and avatar) plus a validity
--   word; codes carry about 50 bits and the preview has no per-caller limit,
--   as get_join_preview. It never selects invitee_email or invitee_name.
-- * invitee_email is readable only by its inviter (RLS) and never leaves a
--   server action; no RPC returns it.
-- * A client's INSERT is column-limited, so no client picks a code (D7) or
--   forges uses/created_at; the shape check pins what generate_join_code
--   mints. There is no client UPDATE or DELETE grant at all (D21: no revoke).
-- * accept writes only friendships rows naming the caller, once per account;
--   the intent cookie (D12) in the app stops a crafted link from turning a
--   signed-in visit into a friendship — the RPC itself cannot tell, so the
--   app is the only caller and calls it only on the person's own act.
-- * Lock: accept takes the invite row FOR UPDATE, so two concurrent accepts
--   of the last use serialise and the second reads the cap.
--
-- Deployed code once applied: nothing in src/ calls these yet (PI-D1 adds the
-- actions and the accept route; the plan applies this live before that
-- deploy so a deployed page never calls a missing RPC). addFriend's direct
-- friendships insert, ensure_join_code and every tasting join code keep
-- working: generate_join_code gains a second reference as a column default
-- and nothing else.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. Nothing this migration creates exists yet: create table would fail
  --    halfway, and create or replace would silently overwrite a function.
  if to_regclass('public.platform_invites') is not null then
    raise exception 'public.platform_invites already exists; re-dump and rebuild this migration';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('get_platform_invite_preview', 'accept_platform_invite');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;

  -- 2. generate_join_code(): the live M4 body (10 characters), invoker rights,
  --    no search_path, volatile, returns text, plpgsql, Supabase's default ACL
  --    (a client's INSERT evaluates the column default with it: D7).
  select p.prosrc, p.prosecdef, p.proconfig, p.provolatile, p.prorettype, l.lanname, p.proacl::text as acl
    into v_fn
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.generate_join_code()');
  if not found then
    raise exception 'public.generate_join_code() does not exist';
  end if;
  if md5(replace(v_fn.prosrc, chr(13), '')) <> '32e10e8b3ab902e7de729a8147a2e47e'
     or strpos(replace(v_fn.prosrc, chr(13), ''), '  for i in 1..10 loop' || chr(10)) = 0
     or strpos(v_fn.prosrc, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') = 0
     or v_fn.prosecdef
     or v_fn.proconfig is not null
     or v_fn.provolatile <> 'v'
     or v_fn.prorettype <> 'text'::regtype
     or v_fn.lanname <> 'plpgsql'
     or v_fn.acl is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'generate_join_code differs from the live function this migration was built from (acl %); rebuild from pg_get_functiondef', v_fn.acl;
  end if;
  if not has_function_privilege('authenticated', 'public.generate_join_code()', 'EXECUTE') then
    raise exception 'authenticated cannot execute generate_join_code, so a client insert could not evaluate the code default';
  end if;

  -- 3. friendships: the unique accept's ON CONFLICT names, the self-friend
  --    check, and the two cascading FKs — the dumped constraint set exactly.
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
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
  if not exists (select 1 from pg_class c where c.oid = 'public.friendships'::regclass and c.relrowsecurity) then
    raise exception 'friendships row level security is not enabled';
  end if;

  -- 4. profiles: the columns the preview joins, and the FK target.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname in ('id', 'display_name', 'avatar_url');
  if v_text is distinct from 'id uuid not null, display_name text not null, avatar_url text' then
    raise exception 'profiles columns the preview reads differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.profiles'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)') then
    raise exception 'profiles has no PRIMARY KEY (id) for platform_invites.inviter_id to reference';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §4, verbatim (the five plan-copy marker comments aside).
-- ---------------------------------------------------------------------------
create table public.platform_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null default public.generate_join_code(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_name text,
  max_uses int not null default 50,
  uses int not null default 0,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  constraint platform_invites_code_key unique (code),
  constraint platform_invites_code_shape check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  constraint platform_invites_max_uses_range check (max_uses between 1 and 1000),
  constraint platform_invites_uses_range check (uses >= 0),
  constraint platform_invites_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '1 year'),
  constraint platform_invites_invitee_name_len
    check (invitee_name is null or char_length(invitee_name) between 1 and 80),
  constraint platform_invites_invitee_email_folded
    check (invitee_email is null or invitee_email = lower(btrim(invitee_email)))
);
create index platform_invites_inviter_idx on public.platform_invites (inviter_id);
alter table public.platform_invites enable row level security;
create policy "platform invites read own" on public.platform_invites
  for select to authenticated using (inviter_id = auth.uid());
create policy "platform invites insert own" on public.platform_invites
  for insert to authenticated with check (inviter_id = auth.uid());
-- Supabase's default privileges grant everything to anon/authenticated on a new table.
revoke all on table public.platform_invites from public, anon, authenticated;
grant select on public.platform_invites to authenticated;
grant insert (inviter_id, invitee_email, invitee_name, max_uses, expires_at)
  on public.platform_invites to authenticated;

create or replace function public.get_platform_invite_preview(p_code text)
returns table (state text, inviter_name text, inviter_avatar_url text, inviter_id uuid)
language sql stable security definer set search_path = public as $$
  select case when i.expires_at <= now() then 'expired'
              when i.uses >= i.max_uses then 'exhausted'
              else 'ok' end,
         p.display_name, p.avatar_url,
         case when auth.uid() is not null then i.inviter_id end
  from platform_invites i
  join profiles p on p.id = i.inviter_id
  where i.code = upper(btrim(p_code));
$$;
revoke all on function public.get_platform_invite_preview(text) from public;
grant execute on function public.get_platform_invite_preview(text) to anon, authenticated;

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
revoke all on function public.accept_platform_invite(text) from public, anon, service_role;
grant execute on function public.accept_platform_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. The table: exactly the nine columns of spec §4, in order, with their
  --    types, nullability and defaults (a schema prefix in a deparsed default
  --    is dropped, so the check does not depend on the applier's search_path).
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.platform_invites'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), code text not null default generate_join_code(), '
       || 'inviter_id uuid not null, invitee_email text, invitee_name text, '
       || 'max_uses int4 not null default 50, uses int4 not null default 0, '
       || 'expires_at timestamptz not null default (now() + ''30 days''::interval), '
       || 'created_at timestamptz not null default now()' then
    raise exception 'platform_invites columns differ from spec §4: %', v_text;
  end if;

  -- 2. The constraints, by the names plan refinement 14 pins, and the index.
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.platform_invites'::regclass;
  if v_text is distinct from
       'platform_invites_code_key UNIQUE (code); '
       || 'platform_invites_code_shape CHECK ((code ~ ''^[A-HJ-NP-Z2-9]{10}$''::text)); '
       || 'platform_invites_expiry_window CHECK (((expires_at > created_at) AND (expires_at <= (created_at + ''1 year''::interval)))); '
       || 'platform_invites_invitee_email_folded CHECK (((invitee_email IS NULL) OR (invitee_email = lower(btrim(invitee_email))))); '
       || 'platform_invites_invitee_name_len CHECK (((invitee_name IS NULL) OR ((char_length(invitee_name) >= 1) AND (char_length(invitee_name) <= 80)))); '
       || 'platform_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'platform_invites_max_uses_range CHECK (((max_uses >= 1) AND (max_uses <= 1000))); '
       || 'platform_invites_pkey PRIMARY KEY (id); '
       || 'platform_invites_uses_range CHECK ((uses >= 0))' then
    raise exception 'platform_invites constraints differ from spec §4: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i
                 where i.schemaname = 'public' and i.tablename = 'platform_invites'
                   and i.indexname = 'platform_invites_inviter_idx'
                   and i.indexdef like '% USING btree (inviter_id)') then
    raise exception 'platform_invites_inviter_idx is missing or is not a btree on inviter_id';
  end if;

  -- 3. RLS on (not forced: the owner and the SECURITY DEFINER functions
  --    bypass it); exactly the two permissive policies of spec §4.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.platform_invites'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'platform_invites row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.platform_invites'::regclass;
  if v_text is distinct from
       'platform invites insert own a permissive {authenticated} - (inviter_id = auth.uid()); '
       || 'platform invites read own r permissive {authenticated} (inviter_id = auth.uid()) -' then
    raise exception 'platform_invites policies differ from spec §4: %', v_text;
  end if;

  -- 4. Table privileges: anon and PUBLIC hold nothing (table or column);
  --    authenticated holds SELECT at table level and INSERT on exactly the
  --    five client columns — never id, code, uses or created_at — and no
  --    UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER; service_role keeps
  --    the defaults.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.platform_invites'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on platform_invites';
  end if;
  if exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
             where t.attrelid = 'public.platform_invites'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a column privilege on platform_invites';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.platform_invites'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on platform_invites are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
             where t.attrelid = 'public.platform_invites'::regclass and a.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on platform_invites';
  end if;
  select string_agg(format('%s:%s', t.attname, a.privilege_type), ',' order by t.attnum, a.privilege_type collate "C") into v_text
  from pg_attribute t, aclexplode(t.attacl) a
  where t.attrelid = 'public.platform_invites'::regclass and t.attnum > 0 and not t.attisdropped;
  if v_text is distinct from 'inviter_id:INSERT,invitee_email:INSERT,invitee_name:INSERT,max_uses:INSERT,expires_at:INSERT' then
    raise exception 'column privileges on platform_invites are %, expected INSERT for authenticated on exactly inviter_id, invitee_email, invitee_name, max_uses, expires_at', coalesce(v_text, '-');
  end if;
  if not has_column_privilege('authenticated', 'public.platform_invites', 'inviter_id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.platform_invites', 'invitee_email', 'INSERT')
     or not has_column_privilege('authenticated', 'public.platform_invites', 'invitee_name', 'INSERT')
     or not has_column_privilege('authenticated', 'public.platform_invites', 'max_uses', 'INSERT')
     or not has_column_privilege('authenticated', 'public.platform_invites', 'expires_at', 'INSERT')
     or has_column_privilege('authenticated', 'public.platform_invites', 'id', 'INSERT')
     or has_column_privilege('authenticated', 'public.platform_invites', 'code', 'INSERT')
     or has_column_privilege('authenticated', 'public.platform_invites', 'uses', 'INSERT')
     or has_column_privilege('authenticated', 'public.platform_invites', 'created_at', 'INSERT')
     or not has_table_privilege('authenticated', 'public.platform_invites', 'SELECT')
     or has_table_privilege('authenticated', 'public.platform_invites', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.platform_invites', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.platform_invites', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.platform_invites', 'DELETE')
     or has_table_privilege('authenticated', 'public.platform_invites', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.platform_invites', 'TRIGGER')
     or has_any_column_privilege('anon', 'public.platform_invites', 'SELECT')
     or has_any_column_privilege('anon', 'public.platform_invites', 'INSERT')
     or has_any_column_privilege('anon', 'public.platform_invites', 'UPDATE')
     or has_table_privilege('anon', 'public.platform_invites', 'DELETE') then
    raise exception 'platform_invites privileges are not: authenticated SELECT + INSERT on the five client columns only; anon nothing';
  end if;
  if not has_table_privilege('service_role', 'public.platform_invites', 'SELECT')
     or not has_table_privilege('service_role', 'public.platform_invites', 'INSERT')
     or not has_table_privilege('service_role', 'public.platform_invites', 'UPDATE')
     or not has_table_privilege('service_role', 'public.platform_invites', 'DELETE') then
    raise exception 'service_role lost its default privileges on platform_invites (the probe and the main session fixtures need them)';
  end if;

  -- 5. The two new functions and the one they rely on: security, search_path,
  --    volatility, language, return type, arguments, body (md5 of prosrc with
  --    any CR stripped) and the roles holding EXECUTE ("OWNER" is the
  --    function owner). generate_join_code's md5 is the live one from the
  --    pre-state block: untouched.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
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
      ('public.get_platform_invite_preview(text)', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_code text', '78ef407fa04bea5c5ced0495fe411e27', 'OWNER,anon,authenticated,service_role'),
      ('public.accept_platform_invite(text)', true, '{search_path=public}', 'v', 'plpgsql', 'uuid', false,
       'p_code text', 'b47d41eab50acac6ca48c213d5503c63', 'OWNER,authenticated'),
      ('public.generate_join_code()', false, null, 'v', 'plpgsql', 'text', false,
       '', '32e10e8b3ab902e7de729a8147a2e47e', 'OWNER,PUBLIC,anon,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
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

  -- 6. What each role can call: the preview for anon and authenticated;
  --    accept for authenticated only — not anon, not PUBLIC, not service_role.
  if not has_function_privilege('anon', 'public.get_platform_invite_preview(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_platform_invite_preview(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.accept_platform_invite(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.accept_platform_invite(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.accept_platform_invite(text)', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure('public.accept_platform_invite(text)') and a.grantee = 0) then
    raise exception 'EXECUTE on the platform-invite functions is not: preview anon + authenticated; accept authenticated only';
  end if;

  -- 7. The preview returns exactly the four columns of spec §4 / D9, in order:
  --    never the invitee's name or email.
  select string_agg(format('%s %s', x.n, t.typname), ', ' order by x.ord)
    into v_text
  from pg_proc p
  cross join lateral unnest(p.proallargtypes, p.proargmodes, p.proargnames)
    with ordinality as x (typ, mode, n, ord)
  join pg_type t on t.oid = x.typ
  where p.oid = to_regprocedure('public.get_platform_invite_preview(text)')
    and x.mode = 't';
  if v_text is distinct from 'state text, inviter_name text, inviter_avatar_url text, inviter_id uuid' then
    raise exception 'get_platform_invite_preview columns differ from spec §4: %', v_text;
  end if;
  if (select strpos(p.prosrc, 'invitee') from pg_proc p where p.oid = to_regprocedure('public.get_platform_invite_preview(text)')) <> 0 then
    raise exception 'get_platform_invite_preview reads an invitee column';
  end if;

  -- 8. What this migration relies on without changing it: generate_join_code's
  --    ACL (its body is in the loop above); friendships' unique
  --    (user_id, friend_id) and its user_id <> friend_id check.
  if (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.generate_join_code()'))
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'generate_join_code grants changed post-migration';
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.friendships'::regclass and k.conname = 'friendships_user_id_friend_id_key'
                   and pg_get_constraintdef(k.oid) = 'UNIQUE (user_id, friend_id)')
     or not exists (select 1 from pg_constraint k
                    where k.conrelid = 'public.friendships'::regclass and k.conname = 'friendships_check'
                      and pg_get_constraintdef(k.oid) = 'CHECK ((user_id <> friend_id))') then
    raise exception 'friendships no longer carries the unique (user_id, friend_id) or the user_id <> friend_id check that accept_platform_invite relies on';
  end if;

  -- Informational: the new functions' ACLs and the table's.
  select string_agg(format('%s %s', p.proname, p.proacl), '; ' order by p.proname::text collate "C") into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.get_platform_invite_preview(text)'), to_regprocedure('public.accept_platform_invite(text)'));
  raise notice 'platform invites: EXECUTE %; table acl %', v_text,
    (select c.relacl::text from pg_class c where c.oid = 'public.platform_invites'::regclass);
end $$;
