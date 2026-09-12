-- Add-wine v2 follow-up F5x (spec §B.7, §E.2): make the first tie-break of
-- find_producer_by_folded_name null-safe.
--
-- 20260912101000 ordered folded-equal producers by
--   (p_region_id is not null and p.region_id = p_region_id) desc
-- With a region given, a candidate whose region_id is NULL makes that key NULL
-- (`true and null`), and DESC sorts NULLs first, so a region-less duplicate beat
-- the region-linked row the caller asked for. Live, 6 of the 44 folded collision
-- groups mix the two; 'Chateau Lascombes' with Bordeaux returned the region-less
-- row. That breaks producer identity whenever the region is already known: the
-- resolver's existing producer id (§B.5 step 6), the confident catalog match keyed
-- on that id (§B.6), and find_or_create_producer reusing the duplicate. With no
-- region the key is false for every row, so §B.5 step 7 was never affected.
--
-- Recreated from the live definition (pg_get_functiondef) with only that key
-- changed, to coalesce(..., false). Everything else stays: the signature,
-- LANGUAGE sql, STABLE, SECURITY INVOKER (live prosecdef is false; §E.2 says
-- invoker is enough), the pinned search_path, the owner and the ACL. CREATE OR
-- REPLACE keeps the owner and the grants; the grant below repeats
-- 20260912101000's and changes nothing. find_or_create_producer calls this
-- function at run time, so it takes the fix without being recreated.
-- No begin/commit: the applier wraps the file in one transaction.

-- Capture every attribute except the body before the replace, so the assertions
-- can prove the replace changed nothing else. The setting is transaction-local.
do $$
declare
  v_fn regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
begin
  if v_fn is null then
    raise exception '20260912101530: find_producer_by_folded_name(text,uuid) is missing before the replace (it needs 20260912101000)';
  end if;
  perform set_config(
    'blindr.producer_lookup_before',
    (
      select jsonb_build_object(
        'arguments', pg_get_function_arguments(p.oid),
        'result', pg_get_function_result(p.oid),
        'language', l.lanname,
        'volatile', p.provolatile::text,
        'security_definer', p.prosecdef,
        'strict', p.proisstrict,
        'leakproof', p.proleakproof,
        'parallel', p.proparallel::text,
        'cost', p.procost,
        'config', p.proconfig,
        'owner', p.proowner::regrole::text,
        'acl', p.proacl::text
      )::text
      from pg_proc p
      join pg_language l on l.oid = p.prolang
      where p.oid = v_fn::oid
    ),
    true
  );
end $$;

create or replace function public.find_producer_by_folded_name(p_name text, p_region_id uuid default null)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from producers p
  where public.f_search_norm(p_name) <> ''
    and public.f_search_norm(p.name) = public.f_search_norm(p_name)
  order by coalesce(p_region_id is not null and p.region_id = p_region_id, false) desc,
           (p.region_id is not null) desc,
           p.name,
           p.id
  limit 1
$$;

grant execute on function public.find_producer_by_folded_name(text, uuid) to authenticated;

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version
-- must never exist without the DDL it names. The ordering check runs inside a
-- synthetic-rollback subtransaction (spec §E.0), so no producer row survives
-- either a dry or a live apply.
do $$
declare
  v_fn regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_before jsonb := nullif(current_setting('blindr.producer_lookup_before', true), '')::jsonb;
  v_after jsonb;
  v_def text;
  v_region_a uuid;
  v_region_b uuid;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_null_id uuid;
  v_a_id uuid;
  v_b_id uuid;
  v_with_a uuid;
  v_with_b uuid;
  v_without uuid;
  v_reused uuid;
  v_ran boolean := false;
begin
  -- 1. The function exists by full signature.
  if v_fn is null then
    raise exception 'find_producer_by_folded_name(text,uuid) missing post-migration';
  end if;

  -- 2. Every attribute but the body is what it was before the replace ...
  if v_before is null then
    raise exception '20260912101530: the pre-replace attribute capture is missing (the file must run in one transaction)';
  end if;
  select jsonb_build_object(
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'language', l.lanname,
    'volatile', p.provolatile::text,
    'security_definer', p.prosecdef,
    'strict', p.proisstrict,
    'leakproof', p.proleakproof,
    'parallel', p.proparallel::text,
    'cost', p.procost,
    'config', p.proconfig,
    'owner', p.proowner::regrole::text,
    'acl', p.proacl::text
  )
  into v_after
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_fn::oid;
  if v_after is distinct from v_before then
    raise exception 'find_producer_by_folded_name changed beyond its body post-migration: before %, after %',
      v_before, v_after;
  end if;

  -- ... which is SECURITY INVOKER, STABLE, search_path pinned to public, and
  --     executable by authenticated.
  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_fn::oid
      and not p.prosecdef
      and p.provolatile = 's'
      and 'search_path=public' = any (coalesce(p.proconfig, '{}'::text[]))
  ) then
    raise exception 'find_producer_by_folded_name is not SECURITY INVOKER, STABLE and search_path=public post-migration';
  end if;
  if not has_function_privilege('authenticated', v_fn::oid, 'execute') then
    raise exception 'find_producer_by_folded_name is not executable by authenticated post-migration';
  end if;

  -- 3. The body orders by the null-safe region key, and no longer by the bare one.
  v_def := pg_get_functiondef(v_fn::oid);
  if position('order by coalesce(p_region_id is not null and p.region_id = p_region_id, false) desc,' in v_def) = 0
     or position('order by (p_region_id is not null' in v_def) > 0 then
    raise exception 'find_producer_by_folded_name does not order by the null-safe region key post-migration';
  end if;

  -- 4. Behavioural, as authenticated: three producers whose names fold equal, one
  --    with no region, one in region A and one in region B. Asked for A, the lookup
  --    returns A's row, never the region-less one (the defect returned it, because
  --    its NULL key sorted first). Asked for B, B's row. With no region, a
  --    region-linked row. find_or_create_producer reuses A's row for region A.
  select r.id into v_region_a from public.regions r order by r.id limit 1;
  select r.id into v_region_b from public.regions r where r.id <> v_region_a order by r.id limit 1;
  if v_region_b is null then
    raise notice '20260912101530: behavioural ordering assertion skipped (fewer than two regions)';
  else
    begin
      insert into public.producers (name, region_id)
      values ('BLINDR ORDER CHECK ' || upper(v_suffix), null)
      returning id into v_null_id;
      insert into public.producers (name, region_id)
      values ('Blindr order-check ' || v_suffix, v_region_b)
      returning id into v_b_id;
      insert into public.producers (name, region_id)
      values ('blindr order check ' || v_suffix, v_region_a)
      returning id into v_a_id;

      set local role authenticated;
      v_with_a := public.find_producer_by_folded_name('Blindr Order Check ' || v_suffix, v_region_a);
      v_with_b := public.find_producer_by_folded_name('Blindr Order Check ' || v_suffix, v_region_b);
      v_without := public.find_producer_by_folded_name('Blindr Order Check ' || v_suffix, null);
      v_reused := public.find_or_create_producer('  Blindr   Order Check ' || v_suffix || ' ', v_region_a);
      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;
    if not v_ran then
      raise exception '20260912101530: behavioural assertions did not run to completion';
    end if;
    if v_with_a is distinct from v_a_id then
      raise exception 'find_producer_by_folded_name for region A returned % instead of region A''s producer % (region-less %, region B %) post-migration',
        v_with_a, v_a_id, v_null_id, v_b_id;
    end if;
    if v_with_b is distinct from v_b_id then
      raise exception 'find_producer_by_folded_name for region B returned % instead of region B''s producer % (region-less %, region A %) post-migration',
        v_with_b, v_b_id, v_null_id, v_a_id;
    end if;
    if v_without is null or v_without = v_null_id then
      raise exception 'find_producer_by_folded_name with no region returned % (the region-less producer is %), not a region-linked producer post-migration',
        v_without, v_null_id;
    end if;
    if v_reused is distinct from v_a_id then
      raise exception 'find_or_create_producer for region A reused % instead of region A''s producer % (region-less %) post-migration',
        v_reused, v_a_id, v_null_id;
    end if;
    if exists (select 1 from public.producers p where p.id in (v_null_id, v_a_id, v_b_id)) then
      raise exception '20260912101530: a synthetic producer survived its rollback';
    end if;
  end if;
end $$;
