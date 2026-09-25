-- tour_seen: the per-account "has seen the first-run tour" stamp.
--
-- Spec: docs/superpowers/specs/2026-09-25-first-run-tour-design.md (D1, D2,
-- §2, §4). Owner decisions 2026-09-24: a getting-started tour shown once per
-- PERSON, not per device or IP, to new accounts and to every existing account
-- once after release, with a way to see it again from /profile/edit.
--
-- Written against the profiles state the last two migrations that set or
-- pinned its client grants leave behind (20260919101300 account deletion,
-- step 4; 20260919141700 profile favourites, pre-state 2 and post-state 7),
-- re-read on live by the main session before applying (plan Task 9 Step 2):
-- * RLS on, not forced; exactly two policies: "profiles read" (SELECT,
--   authenticated, true) and "profiles update own" (UPDATE, authenticated,
--   id = auth.uid() in both USING and WITH CHECK).
-- * No table-level UPDATE for anon or authenticated; authenticated holds
--   UPDATE on exactly nine columns (display_name, bio, avatar_url, location,
--   phone, favorite_wine_type, cellar_visibility, preferred_currency,
--   last_seen_at); no other role holds a column privilege; service_role keeps
--   table-level UPDATE.
-- * profiles_deleted_guard (BEFORE INSERT OR UPDATE) refuses every client
--   write to a deleted profile, so a deleted account cannot stamp or clear
--   the new column either.
--
-- What this migration does:
-- 1. profiles.tour_seen_at timestamptz, nullable, no default. Null means
--    "show the tour"; every existing profile starts null, so everyone sees it
--    once (D1), and handle_new_user (md5-pinned by 20260919101300) needs no
--    change for new accounts.
-- 2. grant update (tour_seen_at) on public.profiles to authenticated: the app
--    stamps and clears it as the signed-in person (markTourSeen / resetTour in
--    src/lib/first-run/actions.ts) through "profiles update own". No new
--    policy, function or trigger.
--
-- Deliberately left alone: scrub_deleted_account (the stamp is not personal
-- data, D1); "profiles read" already covers the column for every member, as
-- it does last_seen_at. Additive: the deployed app never selects the column,
-- so this applies BEFORE the app deploy (spec §4). The app that selects it in
-- AppShell must not ship until this is live.

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The column does not exist yet.
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.profiles'::regclass and a.attname = 'tour_seen_at' and not a.attisdropped) then
    raise exception 'profiles.tour_seen_at already exists; re-read live before applying';
  end if;

  -- 2. RLS on, not forced, and exactly the two policies.
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
    raise exception 'profiles policies differ from the state this file was written against: %', v_text;
  end if;

  -- 3. The nine-column client UPDATE grant, and nothing wider.
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds table-level UPDATE on profiles';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE' then
    raise exception 'profiles column privileges differ from the nine-column grant: %', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
             where a.attrelid = 'public.profiles'::regclass and x.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on profiles';
  end if;

  -- 4. The deleted-account guard is in place (it covers the new column too).
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_guard'
                   and t.tgenabled = 'O' and t.tgfoid = 'public.profiles_deleted_guard()'::regprocedure) then
    raise exception 'profiles_deleted_guard is missing or disabled';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The change (spec §2).
-- ---------------------------------------------------------------------------
alter table public.profiles add column tour_seen_at timestamptz;

comment on column public.profiles.tour_seen_at is
  'First-run tour dismissed at (spec 2026-09-25-first-run-tour-design D1). Null = show the tour on the next signed-in page. Written only by the signed-in person (markTourSeen / resetTour).';

grant update (tour_seen_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
  v_total bigint;
  v_stamped bigint;
begin
  -- 1. The column: timestamptz, nullable, no default; null on every row.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.profiles'::regclass and a.attname = 'tour_seen_at' and not a.attisdropped
                   and a.atttypid = 'timestamptz'::regtype and not a.attnotnull and not a.atthasdef) then
    raise exception 'profiles.tour_seen_at is not a nullable timestamptz without a default';
  end if;
  select count(*), count(p.tour_seen_at) into v_total, v_stamped from public.profiles p;
  if v_stamped <> 0 then
    raise exception 'profiles.tour_seen_at is already set on % rows', v_stamped;
  end if;

  -- 2. RLS and the two policies unchanged.
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

  -- 3. Grants: no table-level UPDATE for anon or authenticated; authenticated
  --    UPDATE on exactly the ten client columns; anon on none; no other
  --    column grantee; the columns no client writes stay unwritable;
  --    authenticated keeps SELECT and service_role keeps UPDATE.
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds table-level UPDATE on profiles';
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
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE' then
    raise exception 'profiles column privileges are %, expected UPDATE on exactly the ten client columns', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
             where a.attrelid = 'public.profiles'::regclass and x.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on profiles';
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

  -- 4. The deleted-account guard still covers every client write.
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_guard'
                   and t.tgenabled = 'O' and t.tgfoid = 'public.profiles_deleted_guard()'::regprocedure) then
    raise exception 'profiles_deleted_guard is missing or disabled';
  end if;

  raise notice 'tour_seen: % profiles, every tour_seen_at null; client UPDATE is now ten columns', v_total;
end $$;
