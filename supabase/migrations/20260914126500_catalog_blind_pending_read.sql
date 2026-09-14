-- A blind_pending catalog wine is readable only by those who may already see it
-- (BT-V3 fix group 1 (judgement G4), finding A-02 / V2-6-01; Global Constraints rule 1).
--
-- The hole. "catalog read" on catalog_wines is `using (true)` (20260829193000), so any
-- signed-in user can select a blind_pending catalog wine: the identity of an unrevealed
-- glass. The same rows also come back through search_catalog_wines and search_all, which
-- are SECURITY INVOKER and do not filter blind_pending (the app filters it; the RPCs are
-- callable directly). Two more tables carry the same identity, and this file closes them
-- too, because closing only "catalog read" would leave them open:
--   * catalog_wine_edits ("catalog edits read" is `using (true)`). catalog_wine_mark_blind's
--     UPDATE fires catalog_wines_audit, and each edit row's before/after jsonb is the whole
--     catalog row. Live on 2026-09-14 there were 26 flag flips across 12 wines.
--   * catalog_wine_grapes ("cwg read" is `using (true)`): the blend of a hidden wine.
--
-- After this file:
--   1. "catalog read" admits a row when:
--      - it is not blind_pending; or
--      - the caller created it; or
--      - can_read_blind_pending_catalog_wine(id): the caller is a curator, or may read a
--        wine_answers row that links the wine.
--      The helper is SECURITY INVOKER on purpose. The V2 judgement asked for a SECURITY
--      DEFINER helper; this is a deliberate deviation. The helper reads wine_answers under
--      the caller's own "wine_answers read", so nobody can read a hidden catalog wine without
--      also being able to read the answer key that names it. When M9b narrows that policy
--      (the host sees only host-added glasses, and the semi-blind participant clause goes;
--      spec §10.4 (f), §16.2 rows 1 and 3), this helper narrows with it. A DEFINER copy of
--      today's policy would reopen both rows at the catalog level, where created_by names a
--      bring-your-own contributor.
--      No recursion is possible: no policy on wine_answers, wines, tastings,
--      tasting_participants or profiles mentions a catalog table (asserted below). The
--      helper has SET search_path, so it is never inlined into the policy.
--      A caller's own cellar lot, consumption or note deliberately does NOT admit them. Any
--      user can insert a lot or a note that names any catalog wine id, and a public cellar
--      or a public note shows that id, so admitting owners would turn a leaked id into the
--      identity.
--   2. catalog_wine_identity_match(p jsonb), SECURITY DEFINER and STABLE, is the exact
--      identity lookup find_or_create_catalog_wine used to run as the caller.
--      - find_or_create_catalog_wine stays SECURITY INVOKER, so its insert still runs under
--        "catalog insert".
--      - It is recreated from its live definition with exactly one edit: the lookup calls
--        this helper. A second adder of an identity whose row is hidden then links to that
--        row instead of hitting catalog_wines_identity_key (23505).
--      - EXECUTE on the helper goes to authenticated and service_role only.
--   3. "catalog edits read" and "cwg read" admit only rows whose catalog wine the caller may
--      read. Their subquery runs under "catalog read".
--
-- Accepted residual: find_or_create_catalog_wine answers an exact identity with the id of a
-- hidden row that the caller then cannot read. A caller who guesses a hidden wine's whole
-- identity (producer, name, appellation, colour, vintage) therefore learns that such a row
-- exists, and each miss inserts a catalog wine in that caller's name. This cannot be closed
-- while the identity index is global.
--
-- Accepted residual: the creator clause (prescribed by the V2 judgement). A catalog wine's
-- creator still reads it, blind_pending flag included, when someone else's unrevealed glass
-- links it. A creator who did not add that glass learns only that a wine they created sits in
-- some unrevealed flight. They already know its identity.
--
-- Degraded, by design: if a second adder's own cellar lot or note names a hidden wine, they
-- see no wine details on it until a glass that links the wine is revealed or unlinked. At
-- that point the triggers clear blind_pending. The same applies to wset_notes_check_hue,
-- which is SECURITY INVOKER: it cannot see a hidden wine's colour, so it skips the hue check
-- on such a note. That is a data-quality gap, not a leak.
--
-- No begin/commit: the applier owns the transaction.

-- ===========================================================================
-- Pre-state assertions
-- ===========================================================================
do $$
declare
  v_text text;
begin
  -- 1. This file has not run.
  if to_regprocedure('public.can_read_blind_pending_catalog_wine(uuid)') is not null
     or to_regprocedure('public.catalog_wine_identity_match(jsonb)') is not null then
    raise exception 'an object of 20260914126500_catalog_blind_pending_read already exists';
  end if;

  -- 2. The three tables carry exactly their live policies, and the three read policies are
  --    still `using (true)`.
  select string_agg(format('%s.%s|%s|%s|%s|%s|%s', pol.tablename, pol.policyname, pol.cmd, pol.roles::text,
                           pol.permissive, coalesce(md5(pol.qual), '-'), coalesce(md5(pol.with_check), '-')),
                    '; ' order by pol.tablename::text collate "C", pol.policyname::text collate "C")
    into v_text
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename in ('catalog_wines', 'catalog_wine_edits', 'catalog_wine_grapes');
  if v_text is distinct from
     'catalog_wine_edits.catalog edits read|SELECT|{authenticated}|PERMISSIVE|b326b5062b2f0e69046810717534cb09|-; '
     'catalog_wine_grapes.cwg read|SELECT|{authenticated}|PERMISSIVE|b326b5062b2f0e69046810717534cb09|-; '
     'catalog_wine_grapes.cwg write|ALL|{authenticated}|PERMISSIVE|88548a171b4186d502ab9b5a6d553037|88548a171b4186d502ab9b5a6d553037; '
     'catalog_wines.catalog insert|INSERT|{authenticated}|PERMISSIVE|-|987767fc803474751ce44a4235a12922; '
     'catalog_wines.catalog read|SELECT|{authenticated}|PERMISSIVE|b326b5062b2f0e69046810717534cb09|-; '
     'catalog_wines.catalog update|UPDATE|{authenticated}|PERMISSIVE|a6c00a03d54dae235f8f8ff8079f557b|a6c00a03d54dae235f8f8ff8079f557b' then
    raise exception 'the catalog_wines, catalog_wine_edits and catalog_wine_grapes policies are not the live ones: %', v_text;
  end if;

  -- 3. find_or_create_catalog_wine is the live definition: plpgsql, SECURITY INVOKER,
  --    VOLATILE, search_path=public, and one function of its name.
  select string_agg(format('%s|%s|%s|%s|%s|%s', pg_get_function_identity_arguments(p.oid), p.prosecdef::text, p.provolatile,
                           p.proconfig::text, l.lanname, md5(replace(p.prosrc, chr(13), ''))), '; ')
    into v_text
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace and p.proname = 'find_or_create_catalog_wine';
  if v_text is distinct from 'p jsonb|false|v|{search_path=public}|plpgsql|b9e7bb9ba7e2f5f7074ebe6aa8175ab3' then
    raise exception 'find_or_create_catalog_wine is not the live definition: %', v_text;
  end if;

  -- 4. Recursion guard. No policy on a table that "wine_answers read" reaches (or on profiles)
  --    mentions a catalog table.
  select string_agg(pol.tablename || '.' || pol.policyname, ', ' order by pol.tablename::text collate "C", pol.policyname::text collate "C")
    into v_text
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename in ('wine_answers', 'wines', 'tastings', 'tasting_participants', 'profiles')
    and (coalesce(pol.qual, '') ~ 'catalog_wine' or coalesce(pol.with_check, '') ~ 'catalog_wine');
  if v_text is not null then
    raise exception 'a policy reachable from "wine_answers read" mentions a catalog table: %', v_text;
  end if;
end $$;

-- Every public policy and function as it stood, for the "nothing else changed" post-assert.
create temp table a02_pre_policies on commit drop as
  select pol.tablename::text as tablename, pol.policyname::text as policyname,
         jsonb_build_array(pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check) as shape
  from pg_policies pol
  where pol.schemaname = 'public';
create temp table a02_pre_functions on commit drop as
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         jsonb_build_array(md5(replace(p.prosrc, chr(13), '')), p.proacl::text, p.prosecdef, p.proconfig::text, p.provolatile) as shape
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace;

-- ===========================================================================
-- 1. Who may read a blind_pending catalog wine
-- ===========================================================================
create function public.can_read_blind_pending_catalog_wine(p_catalog_wine_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
      or exists (select 1 from wine_answers wa where wa.catalog_wine_id = p_catalog_wine_id);
$$;

revoke all on function public.can_read_blind_pending_catalog_wine(uuid) from public, anon;
grant execute on function public.can_read_blind_pending_catalog_wine(uuid) to authenticated, service_role;

drop policy "catalog read" on public.catalog_wines;
create policy "catalog read" on public.catalog_wines
  for select to authenticated
  using (not blind_pending or created_by = auth.uid() or public.can_read_blind_pending_catalog_wine(id));

-- ===========================================================================
-- 2. The identity lookup behind find_or_create_catalog_wine, as the definer
-- ===========================================================================
create function public.catalog_wine_identity_match(p jsonb)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from catalog_wines c
  where c.merged_into is null
    and c.producer_id = (p->>'producer_id')::uuid
    and coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')
    and c.appellation_id = (p->>'appellation_id')::uuid
    and c.colour = (p->>'colour')::wine_colour
    and c.vintage_kind = (p->>'vintage_kind')::vintage_kind
    and c.vintage_year is not distinct from (p->>'vintage_year')::int
    and c.vintage_tawny_years is not distinct from (p->>'vintage_tawny_years')::int
  limit 1;
$$;

revoke all on function public.catalog_wine_identity_match(jsonb) from public, anon;
grant execute on function public.catalog_wine_identity_match(jsonb) to authenticated, service_role;

-- Recreated from the live definition (md5 b9e7bb9b… pre-asserted above) with exactly one
-- edit: the `select c.id into v_id from catalog_wines c where … limit 1;` lookup becomes
-- the helper call. Still SECURITY INVOKER. `create or replace` keeps the owner and the ACL.
create or replace function public.find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.catalog_wine_identity_match(p);
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- ===========================================================================
-- 3. The edit history and the blend follow "catalog read"
-- ===========================================================================
drop policy "catalog edits read" on public.catalog_wine_edits;
create policy "catalog edits read" on public.catalog_wine_edits
  for select to authenticated
  using (exists (select 1 from public.catalog_wines w where w.id = catalog_wine_edits.catalog_wine_id));

drop policy "cwg read" on public.catalog_wine_grapes;
create policy "cwg read" on public.catalog_wine_grapes
  for select to authenticated
  using (exists (select 1 from public.catalog_wines w where w.id = catalog_wine_grapes.catalog_wine_id));

-- ===========================================================================
-- Same-transaction assertions (never trust "version recorded")
-- ===========================================================================
do $$
declare
  v_text text;
  v_n int;
begin
  -- 1. The three read policies are the new text; the other three are unchanged.
  select string_agg(format('%s.%s|%s|%s|%s|%s|%s', pol.tablename, pol.policyname, pol.cmd, pol.roles::text,
                           pol.permissive, coalesce(pol.qual, '-'), coalesce(pol.with_check, '-')),
                    E'\n' order by pol.tablename::text collate "C", pol.policyname::text collate "C")
    into v_text
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.policyname in ('catalog read', 'catalog edits read', 'cwg read');
  if v_text is distinct from
     E'catalog_wine_edits.catalog edits read|SELECT|{authenticated}|PERMISSIVE|(EXISTS ( SELECT 1\n   FROM catalog_wines w\n  WHERE (w.id = catalog_wine_edits.catalog_wine_id)))|-\n'
     'catalog_wine_grapes.cwg read|SELECT|{authenticated}|PERMISSIVE|(EXISTS ( SELECT 1\n   FROM catalog_wines w\n  WHERE (w.id = catalog_wine_grapes.catalog_wine_id)))|-\n'
     'catalog_wines.catalog read|SELECT|{authenticated}|PERMISSIVE|((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id))|-' then
    raise exception 'the new catalog read policies are not the expected text: %', v_text;
  end if;

  -- 2. No other policy in public was added, removed or changed.
  select string_agg(coalesce(pre.tablename, post.tablename) || '.' || coalesce(pre.policyname, post.policyname), ', ')
    into v_text
  from a02_pre_policies pre
  full join (
    select pol.tablename::text as tablename, pol.policyname::text as policyname,
           jsonb_build_array(pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check) as shape
    from pg_policies pol where pol.schemaname = 'public'
  ) post on post.tablename = pre.tablename and post.policyname = pre.policyname
  where (pre.shape is distinct from post.shape)
    and (coalesce(pre.tablename, post.tablename), coalesce(pre.policyname, post.policyname)) not in
        (('catalog_wines', 'catalog read'), ('catalog_wine_edits', 'catalog edits read'), ('catalog_wine_grapes', 'cwg read'));
  if v_text is not null then
    raise exception 'policies changed beyond the three catalog read policies: %', v_text;
  end if;

  -- 3. Functions: two added and one changed (find_or_create_catalog_wine), nothing else.
  select string_agg(coalesce(pre.sig, post.sig), ', ' order by coalesce(pre.sig, post.sig) collate "C")
    into v_text
  from a02_pre_functions pre
  full join (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           jsonb_build_array(md5(replace(p.prosrc, chr(13), '')), p.proacl::text, p.prosecdef, p.proconfig::text, p.provolatile) as shape
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  ) post on post.sig = pre.sig
  where pre.shape is distinct from post.shape;
  if v_text is distinct from 'can_read_blind_pending_catalog_wine(p_catalog_wine_id uuid), catalog_wine_identity_match(p jsonb), find_or_create_catalog_wine(p jsonb)' then
    raise exception 'functions changed beyond this file''s three: %', v_text;
  end if;

  -- 4. The two helpers' shapes and ACLs; find_or_create_catalog_wine's new body, with its
  --    security, volatility, config and ACL unchanged.
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', p.proname, p.prosecdef::text, p.provolatile, p.proconfig::text, l.lanname,
                           p.proacl::text, md5(replace(p.prosrc, chr(13), ''))),
                    '; ' order by p.proname::text collate "C")
    into v_text
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('can_read_blind_pending_catalog_wine', 'catalog_wine_identity_match', 'find_or_create_catalog_wine');
  if v_text is distinct from
     'can_read_blind_pending_catalog_wine|false|s|{search_path=public}|sql|{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}|111373cbbf75a46339813b377c8a975c; '
     'catalog_wine_identity_match|true|s|{search_path=public}|sql|{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}|763eb9a53dcb0ebb4dbeaf0c92073f35; '
     'find_or_create_catalog_wine|false|v|{search_path=public}|plpgsql|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}|2cf9598f9b8640e6ef7bcfc4e30e82fb' then
    raise exception 'the catalog read functions are not the expected shape: %', v_text;
  end if;

  -- 5. The recursion guard still holds after the change.
  select count(*) into v_n
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename in ('wine_answers', 'wines', 'tastings', 'tasting_participants', 'profiles')
    and (coalesce(pol.qual, '') ~ 'catalog_wine' or coalesce(pol.with_check, '') ~ 'catalog_wine');
  if v_n <> 0 then
    raise exception 'a policy reachable from "wine_answers read" mentions a catalog table';
  end if;

  -- 6. Behaviour, as a signed-in caller with no rows anywhere: the three reads plan and run
  --    (no policy recursion), and no blind_pending row is visible to that caller.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.catalog_wines where blind_pending;
  perform count(*) from public.catalog_wine_edits;
  perform count(*) from public.catalog_wine_grapes;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_n <> 0 then
    raise exception 'a caller with no answer key reads % blind_pending catalog wine(s)', v_n;
  end if;
end $$;
