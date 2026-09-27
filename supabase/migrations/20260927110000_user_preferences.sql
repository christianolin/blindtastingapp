-- user_preferences: a person's own saved settings, starting with the cellar
-- list's sort.
--
-- Spec: docs/superpowers/specs/2026-09-27-cellar-sort-memory.md (C3 and C4 are
-- the SQL design this file implements; C1-C7 its decisions). Owner,
-- 2026-09-27: "cellars should default sort by newest added, but its saved on
-- each profile what has been sorted by last".
--
-- Written against the live state as the migrations applied to production
-- leave it, read from this repository's migration files (the implementer had
-- no database access); the pre-state block below checks every fact this file
-- relies on and fails closed, and the main session's dry run (the pg applier
-- with --dry, then scripts/user-preferences.test.mjs with
-- USER_PREFERENCES_APPLY) re-reads live before the apply:
-- * No table user_preferences, no function drop_deleted_profile_preferences
--   and no trigger profiles_deleted_drop_preferences.
-- * profiles: PRIMARY KEY (id); deleted_at timestamptz, nullable, made
--   write-once by profiles_deleted_guard and stamped last by
--   scrub_deleted_account (20260919101300; recreated since, never changed in
--   that respect). Its non-internal triggers, per the repository, are
--   profiles_deleted_drop_favourites (20260919141700), profiles_deleted_guard
--   (20260919101300), profiles_drop_catalog_wine_photos (20260919183100) and
--   profiles_sync_is_curator. The list is deliberately not pinned: the
--   sharing-defaults (20260927140000) and levels (20260927160000) migrations
--   queued behind this one each add an AFTER UPDATE OF deleted_at trigger of
--   the same shape, so the pre-state requires only the two this relies on and
--   the post-state asserts this file added exactly its own.
-- * profiles_deleted_drop_favourites is the precedent this copies: AFTER
--   UPDATE OF deleted_at, FOR EACH ROW (tgtype 17), WHEN (old.deleted_at is
--   null and new.deleted_at is not null), calling
--   drop_deleted_profile_favourites(), SECURITY DEFINER, search_path=public,
--   EXECUTE held by its owner alone.
-- * Supabase's default privileges (pg_default_acl for postgres in public)
--   grant anon, authenticated and service_role every privilege on a new table
--   and EXECUTE on a new function (plus PUBLIC): the revokes below undo that,
--   and the post-state block asserts the result, not the default.
--
-- What this migration does (spec C3, C4):
-- 1. user_preferences (user_id -> profiles ON DELETE CASCADE, the primary key;
--    cellar_sort text, null or one of the five cellar sort keys). The table
--    is named for preferences in general; this adds only cellar_sort (C3).
-- 2. RLS on, not forced: SELECT, INSERT and UPDATE of one's own row
--    (user_id = auth.uid()), for authenticated only. No DELETE policy.
-- 3. Grants: nothing for PUBLIC or anon; authenticated SELECT, INSERT
--    (user_id, cellar_sort) and UPDATE (cellar_sort); service_role keeps
--    Supabase's defaults. Why not a profiles column: every member reads
--    profiles ("profiles read" is true), a sort has no reason to be public, and
--    the profiles client UPDATE grant is pinned exactly by the two migrations
--    queued behind this one. A separate table touches neither.
-- 4. profiles_deleted_drop_preferences: AFTER UPDATE OF deleted_at on
--    profiles, only when it goes from null to set, deletes that person's row
--    inside the stamping transaction (C4). scrub_deleted_account is not
--    recreated.
--
-- Note for the app (src/lib/cellar/sort-preference.ts): a PostgREST upsert
-- lists every payload column in ON CONFLICT DO UPDATE SET, user_id included,
-- and UPDATE is granted on cellar_sort alone, so saveCellarSort updates the
-- row and inserts it when there is none rather than calling .upsert().
--
-- Security: nothing here reaches a tasting, a glass or an answer key (rule 1);
-- the row names only its owner and a sort key, and only its owner reads it.
--
-- Deployed code once applied: nothing in the deployed app reads or writes the
-- table; the app that does tolerates a missing row and a failed read. Every
-- existing profiles write is unaffected: the new trigger fires only on an
-- UPDATE whose SET names deleted_at, and only when it goes from null to set.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_attnum int2;
begin
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.user_preferences') is not null then
    raise exception 'public.user_preferences already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'drop_deleted_profile_preferences';
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(format('%s.%s', t.tgrelid::regclass::text, t.tgname), ', ') into v_text
  from pg_trigger t
  where t.tgname = 'profiles_deleted_drop_preferences';
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 2. profiles: the key the table references and a nullable deleted_at.
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.profiles'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)')
     or not exists (select 1 from pg_attribute a
                    where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped
                      and a.atttypid = 'timestamptz'::regtype and not a.attnotnull) then
    raise exception 'profiles has no PRIMARY KEY (id) or no nullable deleted_at timestamptz';
  end if;

  -- 3. profiles' triggers: the account-deletion ones this file relies on are
  --    there, and the whole list is kept (transaction-local) for the
  --    post-state, which asserts this file added exactly one. Not pinned
  --    exactly: the sharing-defaults and levels migrations queued behind this
  --    one each add a trigger of the same shape, so the order they apply in
  --    must not matter.
  select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
  if v_text is null
     or not string_to_array(v_text, ', ') @> array['profiles_deleted_drop_favourites', 'profiles_deleted_guard'] then
    raise exception 'profiles triggers lack the account-deletion ones this file relies on: %', coalesce(v_text, '-');
  end if;
  perform set_config('blindr.user_preferences_profiles_triggers', v_text, true);

  -- 4. The precedent holds: profiles_deleted_drop_favourites is the row-level
  --    AFTER UPDATE OF deleted_at trigger firing only when deleted_at goes
  --    from null to set, and its function is SECURITY DEFINER, search_path
  --    public, EXECUTE held by its owner alone.
  select a.attnum into v_attnum from pg_attribute a
   where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_drop_favourites'
                   and not t.tgisinternal and t.tgenabled = 'O' and t.tgtype = 17
                   and t.tgattr::text = v_attnum::text
                   and t.tgfoid = to_regprocedure('public.drop_deleted_profile_favourites()')
                   and regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g')
                       = 'CREATE TRIGGER profiles_deleted_drop_favourites AFTER UPDATE OF deleted_at ON profiles '
                         || 'FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) '
                         || 'EXECUTE FUNCTION drop_deleted_profile_favourites()') then
    raise exception 'profiles_deleted_drop_favourites is not the AFTER UPDATE OF deleted_at precedent this file copies';
  end if;
  select format('secdef %s, config %s, execute %s', p.prosecdef, p.proconfig::text,
                coalesce((select string_agg(x.g, ',' order by x.g collate "C")
                          from (select case when a.grantee = 0 then 'PUBLIC'
                                            when a.grantee = p.proowner then 'OWNER'
                                            else pg_get_userbyid(a.grantee)::text end as g
                                from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x), '-'))
    into v_text
  from pg_proc p
  where p.oid = to_regprocedure('public.drop_deleted_profile_favourites()');
  if v_text is distinct from 'secdef true, config {search_path=public}, execute OWNER' then
    raise exception 'drop_deleted_profile_favourites() is not SECURITY DEFINER, search_path public, owner-only EXECUTE: %',
      coalesce(v_text, 'missing');
  end if;

  -- 5. The deleted-account guard is in place (deleted_at is write-once).
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_guard'
                   and t.tgenabled = 'O' and t.tgfoid = 'public.profiles_deleted_guard()'::regprocedure) then
    raise exception 'profiles_deleted_guard is missing or disabled';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec C3: the table, RLS, the three policies and the grants.
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  cellar_sort text check (cellar_sort in ('bottles','name','added','yours','community'))
);

comment on table public.user_preferences is
  'A person''s own saved settings (cellar-sort spec 2026-09-27 C3). Read and written by that person alone; removed when their profile is deleted.';
comment on column public.user_preferences.cellar_sort is
  'The cellar list''s last chosen sort (SortKey in src/lib/cellar/types.ts); null = never chosen, the list opens on newest added.';

alter table public.user_preferences enable row level security;
create policy "user preferences read own" on public.user_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "user preferences insert own" on public.user_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy "user preferences update own" on public.user_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.user_preferences from public, anon, authenticated;
grant select on public.user_preferences to authenticated;
grant insert (user_id, cellar_sort) on public.user_preferences to authenticated;
grant update (cellar_sort) on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Spec C4: account deletion takes a person's preferences with it (the
-- profiles_deleted_drop_favourites precedent). scrub_deleted_account is not
-- recreated. Firing a trigger never checks EXECUTE, so the function is
-- owner-only.
-- ---------------------------------------------------------------------------
create function public.drop_deleted_profile_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from user_preferences where user_id = new.id;
  return null;
end $$;
revoke all on function public.drop_deleted_profile_preferences() from public, anon, authenticated, service_role;

create trigger profiles_deleted_drop_preferences after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_profile_preferences();

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_attnum int2;
begin
  -- 1. Columns, in order, with types, nullability and (no) defaults.
  select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           case when a.atthasdef then ' default' else '' end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  where a.attrelid = 'public.user_preferences'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'user_id uuid not null, cellar_sort text' then
    raise exception 'user_preferences columns differ from spec C3: %', v_text;
  end if;

  -- 2. Constraints: the key, the cascade to profiles and the five-key check.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.user_preferences'::regclass;
  if v_text is distinct from
       'user_preferences_cellar_sort_check CHECK ((cellar_sort = ANY (ARRAY[''bottles''::text, ''name''::text, '
       || '''added''::text, ''yours''::text, ''community''::text]))); '
       || 'user_preferences_pkey PRIMARY KEY (user_id); '
       || 'user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE' then
    raise exception 'user_preferences constraints differ from spec C3: %', v_text;
  end if;

  -- 3. RLS on, not forced; exactly the three policies (pg_policies' text).
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.user_preferences'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'user_preferences row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s | %s | %s | %s | %s | %s', p.policyname, p.permissive, p.roles::text, p.cmd,
                           coalesce(p.qual, '-'), coalesce(p.with_check, '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'user_preferences';
  if v_text is distinct from
       'user preferences insert own | PERMISSIVE | {authenticated} | INSERT | - | (user_id = auth.uid()); '
       || 'user preferences read own | PERMISSIVE | {authenticated} | SELECT | (user_id = auth.uid()) | -; '
       || 'user preferences update own | PERMISSIVE | {authenticated} | UPDATE | (user_id = auth.uid()) | (user_id = auth.uid())' then
    raise exception 'user_preferences policies differ from spec C3: %', v_text;
  end if;

  -- 4. Privileges. PUBLIC and anon: nothing, at table or column level (the
  --    catalog and information_schema agree). authenticated: SELECT at table
  --    level, INSERT on user_id and cellar_sort, UPDATE on cellar_sort, and
  --    nothing else. service_role keeps Supabase's defaults. has_table_privilege
  --    with one privilege at a time: with a list it is true if any one is held.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.user_preferences'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole))
     or exists (select 1 from information_schema.table_privileges tp
                where tp.table_schema = 'public' and tp.table_name = 'user_preferences'
                  and tp.grantee in ('PUBLIC', 'anon'))
     or exists (select 1 from information_schema.column_privileges cp
                where cp.table_schema = 'public' and cp.table_name = 'user_preferences'
                  and cp.grantee in ('PUBLIC', 'anon'))
     or exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as pv (name)
                where has_table_privilege('anon', 'public.user_preferences', pv.name))
     or exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as pv (name)
                where has_any_column_privilege('anon', 'public.user_preferences', pv.name)) then
    raise exception 'PUBLIC or anon holds a privilege on user_preferences';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.user_preferences'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on user_preferences are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  select string_agg(format('%s:%s:%s', t.attname, pg_get_userbyid(a.grantee), a.privilege_type), ','
                    order by t.attnum, a.privilege_type collate "C")
    into v_text
  from pg_attribute t, aclexplode(t.attacl) a
  where t.attrelid = 'public.user_preferences'::regclass and t.attnum > 0 and not t.attisdropped;
  if v_text is distinct from
       'user_id:authenticated:INSERT,cellar_sort:authenticated:INSERT,cellar_sort:authenticated:UPDATE' then
    raise exception 'column privileges on user_preferences are %', coalesce(v_text, '-');
  end if;
  if not has_table_privilege('authenticated', 'public.user_preferences', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_preferences', 'INSERT')
     or has_table_privilege('authenticated', 'public.user_preferences', 'UPDATE')
     or has_table_privilege('authenticated', 'public.user_preferences', 'DELETE')
     or has_table_privilege('authenticated', 'public.user_preferences', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.user_preferences', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.user_preferences', 'TRIGGER')
     or not has_column_privilege('authenticated', 'public.user_preferences', 'user_id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.user_preferences', 'cellar_sort', 'INSERT')
     or not has_column_privilege('authenticated', 'public.user_preferences', 'cellar_sort', 'UPDATE')
     or has_column_privilege('authenticated', 'public.user_preferences', 'user_id', 'UPDATE')
     or exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as pv (name)
                where not has_table_privilege('service_role', 'public.user_preferences', pv.name)) then
    raise exception 'user_preferences privileges are not spec C3''s';
  end if;

  -- 5. The trigger function: SECURITY DEFINER, search_path public, plpgsql,
  --    volatile, returns trigger, no arguments, this body (md5 of prosrc with
  --    any CR stripped), EXECUTE held by its owner alone.
  select format('secdef %s, config %s, %s, %s, returns %s (set %s), args (%s), md5 %s, execute %s',
                p.prosecdef, p.proconfig::text, l.lanname, p.provolatile, format_type(p.prorettype, null), p.proretset,
                pg_get_function_identity_arguments(p.oid), md5(replace(p.prosrc, chr(13), '')),
                coalesce((select string_agg(x.g, ',' order by x.g collate "C")
                          from (select case when a.grantee = 0 then 'PUBLIC'
                                            when a.grantee = p.proowner then 'OWNER'
                                            else pg_get_userbyid(a.grantee)::text end as g
                                from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x), '-'))
    into v_text
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.drop_deleted_profile_preferences()');
  if v_text is distinct from
       'secdef true, config {search_path=public}, plpgsql, v, returns trigger (set false), args (), '
       || 'md5 282ad240f51c552d2c60637a0d076dbb, execute OWNER' then
    raise exception 'drop_deleted_profile_preferences() differs from spec C4: %', coalesce(v_text, 'missing');
  end if;
  if has_function_privilege('anon', 'public.drop_deleted_profile_preferences()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.drop_deleted_profile_preferences()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.drop_deleted_profile_preferences()', 'EXECUTE') then
    raise exception 'a client role or service_role can execute drop_deleted_profile_preferences()';
  end if;

  -- 6. The trigger: row-level AFTER UPDATE OF deleted_at (tgtype 17), enabled,
  --    firing only when deleted_at goes from null to set; profiles' triggers
  --    are the pre-state's plus this one.
  select a.attnum into v_attnum from pg_attribute a
   where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_drop_preferences'
                   and not t.tgisinternal and t.tgenabled = 'O' and t.tgtype = 17
                   and t.tgattr::text = v_attnum::text
                   and t.tgfoid = to_regprocedure('public.drop_deleted_profile_preferences()')
                   and regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g')
                       = 'CREATE TRIGGER profiles_deleted_drop_preferences AFTER UPDATE OF deleted_at ON profiles '
                         || 'FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) '
                         || 'EXECUTE FUNCTION drop_deleted_profile_preferences()') then
    raise exception 'profiles_deleted_drop_preferences is not a row-level AFTER UPDATE OF deleted_at trigger firing only when deleted_at goes from null to set';
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
    and t.tgname <> 'profiles_deleted_drop_preferences';
  if coalesce(v_text, '') is distinct from current_setting('blindr.user_preferences_profiles_triggers', true) then
    raise exception 'profiles triggers besides the new one changed: before "%", after "%"',
      current_setting('blindr.user_preferences_profiles_triggers', true), v_text;
  end if;

  -- 7. Not in a publication (nothing streams a person's preferences).
  if exists (select 1 from pg_publication_tables pt
             where pt.schemaname = 'public' and pt.tablename = 'user_preferences') then
    raise exception 'user_preferences is in a publication';
  end if;

  -- 8. Empty: this migration writes no row.
  if exists (select 1 from public.user_preferences) then
    raise exception 'user_preferences is not empty';
  end if;

  -- Informational: the table's and the function's ACLs.
  raise notice 'user_preferences: table acl %; drop_deleted_profile_preferences acl %',
    (select c.relacl::text from pg_class c where c.oid = 'public.user_preferences'::regclass),
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.drop_deleted_profile_preferences()'));
end $$;
