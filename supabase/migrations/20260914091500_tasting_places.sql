-- tasting_places: a tasting's private place (blind-tasting spec §13.4, §15 M2;
-- ledger B12; owner default Q2).
--
-- Why a table and not a tastings column: a tasting row becomes readable by
-- every signed-in user once one of its wines is revealed ("tastings with
-- revealed wines are public"), and DECLINED participant rows read it through
-- "tastings read" (is_tasting_participant has no status filter). A place can be
-- a home address, so it lives outside tastings:
-- * readers: the host and JOINED and INVITED participants, through the new
--   SECURITY DEFINER helper is_tasting_member. DECLINED people and strangers,
--   including anyone who can read a revealed tasting, get nothing;
-- * writer: the host only, through the live SECURITY DEFINER is_tasting_host;
-- * anon: no table privilege and no EXECUTE on the helper.
-- No wine data is involved (spec §16.1 row 4). Cross-table checks go through
-- SECURITY DEFINER helpers, never a raw subquery (CLAUDE.md RLS recursion).
--
-- Written against the LIVE state (read-only dump, 2026-09-13:
-- .superpowers/blind-tasting/probes/20260914091500-live-defs.sql). M2 recreates
-- no existing object. The statements between the two assertion blocks are spec
-- §13.4 verbatim; the assertions are this migration's own.
--
-- Deployed code neither reads nor writes tasting_places (the app reads null
-- until BT-C1, BT-L4, BT-G1, BT-G2 and BT-Q1 ship), so this is behaviour-neutral.
--
-- Privileges noted, not changed (spec SQL verbatim): Supabase's default ACL for
-- new public tables also gives authenticated TRUNCATE, REFERENCES, TRIGGER and
-- MAINTAIN, exactly as it does on tastings and every other public table;
-- PostgREST exposes none of them. service_role keeps full table access and
-- EXECUTE on is_tasting_member through the same default ACL (the post-state
-- block prints what authenticated holds).
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.tasting_places') is not null then
    raise exception 'public.tasting_places already exists';
  end if;

  -- create or replace would silently overwrite a function of the same name.
  if exists (select 1 from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = 'is_tasting_member') then
    raise exception 'a public.is_tasting_member function already exists; re-dump and rebuild this migration';
  end if;

  if exists (select 1 from pg_trigger t where t.tgname = 'tasting_places_set_updated_at') then
    raise exception 'a trigger named tasting_places_set_updated_at already exists';
  end if;

  -- The write policies call is_tasting_host: SECURITY DEFINER, search_path
  -- pinned, and the live body (host_id = auth.uid()).
  if not exists (select 1 from pg_proc p
                 where p.oid = to_regprocedure('public.is_tasting_host(uuid)')
                   and p.prosecdef
                   and p.proconfig = array['search_path=public']::text[]
                   and md5(p.prosrc) = '8ef6153d5d80f4bdcf587b4270568a02') then
    raise exception 'public.is_tasting_host(uuid) is missing, not SECURITY DEFINER with search_path=public, or differs from the live body this migration was written against';
  end if;

  if not exists (select 1 from pg_proc p
                 where p.oid = to_regprocedure('public.set_updated_at()')
                   and p.prorettype = 'trigger'::regtype
                   and md5(p.prosrc) = '9b1889f56258bf9d6554213c05019c76') then
    raise exception 'public.set_updated_at() is missing or differs from the live trigger function (new.updated_at = now())';
  end if;

  -- is_tasting_member reads tasting_participants.status against these labels.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.tasting_participants'::regclass
                   and a.attname = 'status'
                   and a.atttypid = 'public.participant_status'::regtype
                   and not a.attisdropped)
     or (select array_agg(e.enumlabel::text order by e.enumsortorder)
         from pg_enum e where e.enumtypid = 'public.participant_status'::regtype)
        is distinct from array['INVITED', 'JOINED', 'DECLINED']::text[] then
    raise exception 'tasting_participants.status is not participant_status (INVITED, JOINED, DECLINED)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §13.4, verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.is_tasting_member(p_tasting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tastings t where t.id = p_tasting_id and t.host_id = auth.uid())
      or exists (select 1 from tasting_participants p
                 where p.tasting_id = p_tasting_id and p.user_id = auth.uid()
                   and p.status in ('JOINED', 'INVITED'));
$$;
revoke all on function public.is_tasting_member(uuid) from public, anon;
grant execute on function public.is_tasting_member(uuid) to authenticated;

create table public.tasting_places (
  tasting_id uuid primary key references public.tastings(id) on delete cascade,
  place text not null check (char_length(place) between 1 and 200 and place = btrim(place)),
  updated_at timestamptz not null default now()
);
alter table public.tasting_places enable row level security;

create policy "tasting places read" on public.tasting_places
  for select to authenticated using (public.is_tasting_member(tasting_id));
create policy "tasting places insert host" on public.tasting_places
  for insert to authenticated with check (public.is_tasting_host(tasting_id));
create policy "tasting places update host" on public.tasting_places
  for update to authenticated
  using (public.is_tasting_host(tasting_id))
  with check (public.is_tasting_host(tasting_id));
create policy "tasting places delete host" on public.tasting_places
  for delete to authenticated using (public.is_tasting_host(tasting_id));

revoke all on public.tasting_places from anon;
grant select, insert, update, delete on public.tasting_places to authenticated;

create trigger tasting_places_set_updated_at
  before update on public.tasting_places
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn oid := to_regprocedure('public.is_tasting_member(uuid)');
  v_tbl oid := to_regclass('public.tasting_places');
  v_text text;
begin
  -- 1. is_tasting_member: a STABLE SECURITY DEFINER sql function returning
  --    boolean, search_path pinned, EXECUTE for authenticated and not for anon
  --    or PUBLIC.
  if v_fn is null then
    raise exception 'public.is_tasting_member(uuid) was not created';
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = v_fn
                   and p.prosecdef
                   and p.proconfig = array['search_path=public']::text[]
                   and p.provolatile = 's'
                   and p.prorettype = 'boolean'::regtype
                   and p.prolang = (select l.oid from pg_language l where l.lanname = 'sql')) then
    raise exception 'is_tasting_member is not a STABLE SECURITY DEFINER sql function returning boolean with search_path=public';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('public', v_fn, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = v_fn and a.grantee in (0::oid, 'anon'::regrole::oid)) then
    raise exception 'is_tasting_member EXECUTE is not authenticated-only among the client roles: %',
      (select p.proacl::text from pg_proc p where p.oid = v_fn);
  end if;

  -- 2. The table's shape matches database.types.ts (tasting_places Row).
  if v_tbl is null then
    raise exception 'public.tasting_places was not created';
  end if;
  select string_agg(format('%s %s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  where a.attrelid = v_tbl and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'tasting_id uuid not null, place text not null, updated_at timestamp with time zone not null' then
    raise exception 'tasting_places columns differ from the spec: %', v_text;
  end if;
  if (select count(*) from pg_constraint k
      where k.conrelid = v_tbl and k.contype = 'p'
        and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (tasting_id)') <> 1 then
    raise exception 'tasting_places primary key is not (tasting_id)';
  end if;
  if (select count(*) from pg_constraint k
      where k.conrelid = v_tbl and k.contype = 'f'
        and k.confrelid = 'public.tastings'::regclass
        and k.confdeltype = 'c'
        and pg_get_constraintdef(k.oid) like 'FOREIGN KEY (tasting_id) REFERENCES %tastings(id) ON DELETE CASCADE') <> 1 then
    raise exception 'tasting_places.tasting_id does not reference tastings(id) on delete cascade';
  end if;
  if (select count(*) from pg_constraint k
      where k.conrelid = v_tbl and k.contype = 'c'
        and pg_get_constraintdef(k.oid) like '%char_length(place) >= 1%'
        and pg_get_constraintdef(k.oid) like '%char_length(place) <= 200%'
        and pg_get_constraintdef(k.oid) like '%place = btrim(place)%') <> 1 then
    raise exception 'tasting_places.place check (1 to 200 characters, no surrounding spaces) is missing';
  end if;
  if (select pg_get_expr(d.adbin, d.adrelid)
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = v_tbl and a.attname = 'updated_at') is distinct from 'now()' then
    raise exception 'tasting_places.updated_at does not default to now()';
  end if;

  -- 3. RLS enabled; exactly the four policies of spec §13.4.
  if not (select c.relrowsecurity from pg_class c where c.oid = v_tbl) then
    raise exception 'row level security is off on tasting_places';
  end if;
  select string_agg(coalesce(e.policyname, l.policyname), '; ') into v_text
  from (values
    ('tasting places read', 'SELECT', 'is_tasting_member(tasting_id)', null),
    ('tasting places insert host', 'INSERT', null, 'is_tasting_host(tasting_id)'),
    ('tasting places update host', 'UPDATE', 'is_tasting_host(tasting_id)', 'is_tasting_host(tasting_id)'),
    ('tasting places delete host', 'DELETE', 'is_tasting_host(tasting_id)', null)
  ) as e (policyname, cmd, qual, with_check)
  full join (
    select pol.policyname::text as policyname, pol.permissive, pol.roles::text as roles, pol.cmd,
           replace(pol.qual, 'public.', '') as qual,
           replace(pol.with_check, 'public.', '') as with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'tasting_places'
  ) l on l.policyname = e.policyname
  where e.policyname is null
     or l.policyname is null
     or l.permissive is distinct from 'PERMISSIVE'
     or l.roles is distinct from '{authenticated}'
     or l.cmd is distinct from e.cmd
     or l.qual is distinct from e.qual
     or l.with_check is distinct from e.with_check;
  if v_text is not null then
    raise exception 'tasting_places policies are not exactly the four of spec §13.4: %', v_text;
  end if;

  -- 4. Grants: nothing for anon or PUBLIC; select, insert, update and delete for
  --    authenticated.
  if has_table_privilege('anon', 'public.tasting_places', 'select') then
    raise exception 'anon can select tasting_places';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type) into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = v_tbl and a.grantee in (0::oid, 'anon'::regrole::oid);
  if v_text is not null then
    raise exception 'anon or PUBLIC holds privileges on tasting_places: %', v_text;
  end if;
  if not (has_table_privilege('authenticated', 'public.tasting_places', 'SELECT')
          and has_table_privilege('authenticated', 'public.tasting_places', 'INSERT')
          and has_table_privilege('authenticated', 'public.tasting_places', 'UPDATE')
          and has_table_privilege('authenticated', 'public.tasting_places', 'DELETE')) then
    raise exception 'authenticated lacks select, insert, update or delete on tasting_places';
  end if;

  -- 5. Exactly one trigger: BEFORE UPDATE FOR EACH ROW set_updated_at(), enabled.
  if (select count(*) from pg_trigger t where t.tgrelid = v_tbl and not t.tgisinternal) <> 1
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = v_tbl
                      and t.tgname = 'tasting_places_set_updated_at'
                      and t.tgfoid = 'public.set_updated_at()'::regprocedure
                      and t.tgtype = 19 -- ROW (1) | BEFORE (2) | UPDATE (16)
                      and t.tgenabled = 'O'
                      and not t.tgisinternal) then
    raise exception 'tasting_places_set_updated_at is not the single BEFORE UPDATE row trigger calling set_updated_at()';
  end if;

  -- 6. The helpers this file depends on are untouched.
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.is_tasting_host(uuid)'))
       is distinct from '8ef6153d5d80f4bdcf587b4270568a02'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.set_updated_at()'))
       is distinct from '9b1889f56258bf9d6554213c05019c76' then
    raise exception 'is_tasting_host or set_updated_at changed post-migration';
  end if;

  -- Informational: the rest of Supabase's default table ACL for authenticated.
  select string_agg(a.privilege_type, ',' order by a.privilege_type) into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = v_tbl and a.grantee = 'authenticated'::regrole::oid;
  raise notice 'tasting_places: authenticated holds % (PostgREST exposes select, insert, update, delete only)', v_text;
end $$;
