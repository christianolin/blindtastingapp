-- Add-wine v2, L1 follow-up — owner approval 3 (2026-09-13), the lookup half:
-- "make the producer lookup prefer the exact spelling, then entries that hold wines".
--
-- find_producer_by_folded_name picks one row among producers whose names fold
-- equal. After the region keys the tie went to the name, so a label spelled exactly
-- like the copy that holds the wines still landed on a duplicate. Live, 2026-09-13:
--   "J.M. Boillot" in Bourgogne returned 'J. M. Boillot' (745fc108, no wines), not
--   'J.M. Boillot' (266af94b, 3 catalog wines and 1 answer key);
--   "Vidal-Fleury" in Rhône returned 'Vidal Fleury' (9f9c976f, no wines), not
--   'Vidal-Fleury' (58116bac, 1 catalog wine).
-- The order becomes:
--   1. the given region (unchanged; null-safe since 20260912101530);
--   2. the exact spelling: lower(p.name) = lower(btrim(p_name));
--   3. a producer that holds wines: a catalog_wines or wine_answers row carries its id;
--   4. any region link (unchanged);
--   5. name, then id (unchanged).
-- The region stays first, so a label read in one region never takes another
-- region's copy just because it is spelled the same. The exact spelling beats the
-- wines: when a label matches a different copy letter for letter, that copy is what
-- the label says (under-labeling beats mislabeling). Approval 3's merges of the two
-- duplicate sets above run separately; this order holds for any later duplicate.
--
-- Recreated from the live definition (pg_get_functiondef, 2026-09-13, which is
-- 20260912101530's body) with only the ORDER BY changed. Everything else stays: the
-- signature (p_name text, p_region_id uuid default null) returns uuid, LANGUAGE sql,
-- STABLE, SECURITY INVOKER, SET search_path = public, the owner and the ACL (live:
-- PUBLIC, postgres, anon, authenticated and service_role may execute). CREATE OR
-- REPLACE keeps the owner and the grants; the grant below repeats 20260912101000's
-- and changes nothing. find_or_create_producer calls this function at run time, so
-- it takes the new order without being recreated; its definition and grants are
-- asserted unchanged.
--
-- SECURITY INVOKER on purpose, as before (spec §E.2). The wines key reads
-- catalog_wines (readable by every authenticated user) and wine_answers under the
-- caller's RLS, so an answer key the caller may not see never decides which copy
-- they get; a DEFINER lookup would let anyone learn that some still-hidden answer
-- key uses a particular spelling. The price: a producer whose only wine is an
-- answer key hidden from the caller counts, for that caller, as holding none.
--
-- The index (measured 2026-09-13 as authenticated, inside a rolled-back transaction;
-- .superpowers/add-wine-v2/probes/112500-index-experiment.log). Unaided, the planner
-- hashes the wines key: every lookup scans all of wine_answers and evaluates its RLS
-- policy (has_scored_guess plus the wines / tastings / participants subplans) on
-- every row. RPC median 9.8 ms against 0.53 ms before, with only 8 answer rows, and
-- it grows with every glass. A btree on wine_answers(producer_id) alone does not
-- change the plan: producers has never been analyzed since 20260912101000 created
-- producers_search_norm_eq_idx, so the planner expects 169 folded-equal candidates
-- and hashing still looks cheaper. With the index AND `analyze public.producers` it
-- probes per candidate and runs RLS only on that producer's answer rows: 0.6 ms to
-- execute, RPC median 5.9 ms (the rest is planning the RLS expansion on each call).
-- catalog_wines gets no index: its per-candidate scan is 20 pages / 0.03 ms today,
-- and adding one changed nothing measurable (an unfiltered EXISTS cannot use the
-- partial catalog_wines_identity_key).
--
-- No begin/commit: the applier wraps the file in one transaction.

-- Capture every attribute but the body of both functions before the replace, so the
-- assertions can prove nothing else changed. The settings are transaction-local.
do $$
declare
  v_lookup regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_create regprocedure := to_regprocedure('public.find_or_create_producer(text,uuid)');
  v_def text;
begin
  if v_lookup is null then
    raise exception '20260914112500: find_producer_by_folded_name(text,uuid) is missing before the replace (it needs 20260912101000)';
  end if;
  if v_create is null then
    raise exception '20260914112500: find_or_create_producer(text,uuid) is missing before the replace (it needs 20260912101000)';
  end if;

  -- The replace starts from 20260912101530's order. If the live order has changed
  -- since, stop instead of overwriting someone else's change.
  v_def := regexp_replace(pg_get_functiondef(v_lookup::oid), '\s+', ' ', 'g');
  if position('order by coalesce(p_region_id is not null and p.region_id = p_region_id, false) desc, (p.region_id is not null) desc, p.name, p.id limit 1' in v_def) = 0 then
    raise exception '20260914112500: find_producer_by_folded_name is not 20260912101530''s definition before the replace: %', v_def;
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
        'rows', p.prorows,
        'config', p.proconfig,
        'owner', p.proowner::regrole::text,
        'acl', p.proacl::text,
        'execute', jsonb_build_object(
          'public', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
          'anon', case when to_regrole('anon') is null then null else has_function_privilege('anon', p.oid, 'execute') end,
          'authenticated', case when to_regrole('authenticated') is null then null else has_function_privilege('authenticated', p.oid, 'execute') end,
          'service_role', case when to_regrole('service_role') is null then null else has_function_privilege('service_role', p.oid, 'execute') end
        )
      )::text
      from pg_proc p
      join pg_language l on l.oid = p.prolang
      where p.oid = v_lookup::oid
    ),
    true
  );
  perform set_config(
    'blindr.producer_create_before',
    (
      select jsonb_build_object(
        'arguments', pg_get_function_arguments(p.oid),
        'result', pg_get_function_result(p.oid),
        'language', l.lanname,
        'volatile', p.provolatile::text,
        'security_definer', p.prosecdef,
        'config', p.proconfig,
        'owner', p.proowner::regrole::text,
        'acl', p.proacl::text,
        'source_md5', md5(p.prosrc),
        'execute', jsonb_build_object(
          'public', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
          'anon', case when to_regrole('anon') is null then null else has_function_privilege('anon', p.oid, 'execute') end,
          'authenticated', case when to_regrole('authenticated') is null then null else has_function_privilege('authenticated', p.oid, 'execute') end,
          'service_role', case when to_regrole('service_role') is null then null else has_function_privilege('service_role', p.oid, 'execute') end
        )
      )::text
      from pg_proc p
      join pg_language l on l.oid = p.prolang
      where p.oid = v_create::oid
    ),
    true
  );
end $$;

-- The wines key probes wine_answers by producer per candidate (see the header).
create index if not exists wine_answers_producer_id_idx
  on public.wine_answers (producer_id);

-- Statistics for producers_search_norm_eq_idx's expression, so the planner expects
-- the one or two folded-equal candidates there really are, not 169.
analyze public.producers;

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
           lower(p.name) = lower(btrim(p_name)) desc,
           (exists (select 1 from catalog_wines w where w.producer_id = p.id)
             or exists (select 1 from wine_answers a where a.producer_id = p.id)) desc,
           (p.region_id is not null) desc,
           p.name,
           p.id
  limit 1
$$;

grant execute on function public.find_producer_by_folded_name(text, uuid) to authenticated;

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version must
-- never exist without the DDL it names. The ordering checks run inside a
-- synthetic-rollback subtransaction (spec §E.0), so no row they create survives
-- either a dry or a live apply.
do $$
declare
  v_fn regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_create regprocedure := to_regprocedure('public.find_or_create_producer(text,uuid)');
  v_before jsonb := nullif(current_setting('blindr.producer_lookup_before', true), '')::jsonb;
  v_create_before jsonb := nullif(current_setting('blindr.producer_create_before', true), '')::jsonb;
  v_after jsonb;
  v_create_after jsonb;
  v_def text;
  v_key text;
  v_at int;
  v_last int := 0;
  v_profile uuid;
  v_region_a uuid;
  v_region_b uuid;
  v_appellation uuid;
  v_appellation_region uuid;
  v_country uuid;
  v_grape uuid;
  v_s text := replace(gen_random_uuid()::text, '-', '');
  v_tasting uuid;
  v_wine uuid;
  v_unidentified uuid;
  -- region beats the exact spelling and held wines
  v_region_exact uuid;
  v_region_other uuid;
  v_got_region uuid;
  -- the exact spelling beats held wines and a region link
  v_exact_wines uuid;
  v_exact_copy uuid;
  v_got_exact uuid;
  v_got_exact_padded uuid;
  -- held wines beat a region link: through catalog_wines, then through wine_answers
  v_wines_catalog uuid;
  v_wines_catalog_link uuid;
  v_got_wines_catalog uuid;
  v_wines_answer uuid;
  v_wines_answer_link uuid;
  v_got_wines_answer uuid;
  -- a region link beats the name, both ways round
  v_link_1_null uuid;
  v_link_1_linked uuid;
  v_got_link_1 uuid;
  v_link_2_linked uuid;
  v_link_2_null uuid;
  v_got_link_2 uuid;
  -- the caller takes the new order
  v_reused uuid;
  v_ran boolean := false;
begin
  -- 1. The function exists by full signature.
  if v_fn is null then
    raise exception 'find_producer_by_folded_name(text,uuid) missing post-migration';
  end if;
  if v_create is null then
    raise exception 'find_or_create_producer(text,uuid) missing post-migration';
  end if;

  -- 2. Every attribute but the body is what it was before the replace: signature,
  --    language, volatility, SECURITY, search_path, owner, ACL and who may execute.
  if v_before is null or v_create_before is null then
    raise exception '20260914112500: the pre-replace attribute capture is missing (the file must run in one transaction)';
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
    'rows', p.prorows,
    'config', p.proconfig,
    'owner', p.proowner::regrole::text,
    'acl', p.proacl::text,
    'execute', jsonb_build_object(
      'public', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
      'anon', case when to_regrole('anon') is null then null else has_function_privilege('anon', p.oid, 'execute') end,
      'authenticated', case when to_regrole('authenticated') is null then null else has_function_privilege('authenticated', p.oid, 'execute') end,
      'service_role', case when to_regrole('service_role') is null then null else has_function_privilege('service_role', p.oid, 'execute') end
    )
  )
  into v_after
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_fn::oid;
  if v_after is distinct from v_before then
    raise exception 'find_producer_by_folded_name changed beyond its body post-migration: before %, after %',
      v_before, v_after;
  end if;

  -- ... which is SECURITY INVOKER, STABLE, LANGUAGE sql, search_path pinned to
  --     public, and executable by authenticated.
  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.oid = v_fn::oid
      and not p.prosecdef
      and p.provolatile = 's'
      and l.lanname = 'sql'
      and 'search_path=public' = any (coalesce(p.proconfig, '{}'::text[]))
  ) then
    raise exception 'find_producer_by_folded_name is not SECURITY INVOKER, STABLE, LANGUAGE sql and search_path=public post-migration';
  end if;
  if not has_function_privilege('authenticated', v_fn::oid, 'execute') then
    raise exception 'find_producer_by_folded_name is not executable by authenticated post-migration';
  end if;

  -- 3. The caller find_or_create_producer is untouched: same body, attributes and
  --    grants, and it still calls the lookup.
  select jsonb_build_object(
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'language', l.lanname,
    'volatile', p.provolatile::text,
    'security_definer', p.prosecdef,
    'config', p.proconfig,
    'owner', p.proowner::regrole::text,
    'acl', p.proacl::text,
    'source_md5', md5(p.prosrc),
    'execute', jsonb_build_object(
      'public', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
      'anon', case when to_regrole('anon') is null then null else has_function_privilege('anon', p.oid, 'execute') end,
      'authenticated', case when to_regrole('authenticated') is null then null else has_function_privilege('authenticated', p.oid, 'execute') end,
      'service_role', case when to_regrole('service_role') is null then null else has_function_privilege('service_role', p.oid, 'execute') end
    )
  )
  into v_create_after
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_create::oid;
  if v_create_after is distinct from v_create_before then
    raise exception 'find_or_create_producer changed post-migration: before %, after %', v_create_before, v_create_after;
  end if;
  if position('find_producer_by_folded_name' in (select p.prosrc from pg_proc p where p.oid = v_create::oid)) = 0 then
    raise exception 'find_or_create_producer no longer calls find_producer_by_folded_name post-migration';
  end if;

  -- 4. The body orders by the five keys, in this order.
  v_def := regexp_replace(pg_get_functiondef(v_fn::oid), '\s+', ' ', 'g');
  foreach v_key in array array[
    'order by coalesce(p_region_id is not null and p.region_id = p_region_id, false) desc,',
    'lower(p.name) = lower(btrim(p_name)) desc,',
    '(exists (select 1 from catalog_wines w where w.producer_id = p.id) or exists (select 1 from wine_answers a where a.producer_id = p.id)) desc,',
    '(p.region_id is not null) desc,',
    'p.name, p.id limit 1'
  ] loop
    v_at := position(v_key in v_def);
    if v_at = 0 or v_at <= v_last then
      raise exception 'find_producer_by_folded_name does not order by % in sequence post-migration: %', quote_literal(v_key), v_def;
    end if;
    v_last := v_at;
  end loop;

  -- 5. The plain btree on wine_answers(producer_id), and statistics for the folded
  --    name index's expression (when there are producers to sample).
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_am am on am.oid = c.relam
    where c.relname = 'wine_answers_producer_id_idx'
      and c.relnamespace = 'public'::regnamespace
      and i.indrelid = 'public.wine_answers'::regclass
      and am.amname = 'btree'
      and i.indpred is null
      and i.indexprs is null
      and i.indnatts = 1
      and i.indkey[0] = (select a.attnum from pg_attribute a
                         where a.attrelid = 'public.wine_answers'::regclass and a.attname = 'producer_id')
  ) then
    raise exception 'wine_answers_producer_id_idx missing or not a plain btree on wine_answers(producer_id) post-migration';
  end if;
  if exists (select 1 from public.producers) and not exists (
    select 1 from pg_stats s where s.schemaname = 'public' and s.tablename = 'producers_search_norm_eq_idx'
  ) then
    raise exception '20260914112500: producers was not analyzed (no statistics for producers_search_norm_eq_idx) post-migration';
  end if;

  -- 6. Behavioural, as an authenticated host: producers whose names fold equal,
  --    built so that each key under test favours one row and every later key the
  --    other. Wines come from a synthetic catalog wine and a synthetic answer key in
  --    a synthetic tasting (hosted by an existing profile, spec §E.0), so the
  --    wine_answers half is visible to the caller through the host clause.
  select pr.id into v_profile from public.profiles pr order by pr.id limit 1;
  select r.id into v_region_a from public.regions r order by r.id limit 1;
  select r.id into v_region_b from public.regions r where r.id <> v_region_a order by r.id limit 1;
  select a.id, a.region_id, r.country_id into v_appellation, v_appellation_region, v_country
  from public.appellations a
  join public.regions r on r.id = a.region_id
  order by a.id
  limit 1;
  select g.id into v_grape from public.grapes g order by g.id limit 1;
  if v_profile is null or v_region_b is null or v_appellation is null or v_grape is null then
    raise notice '20260914112500: behavioural ordering assertions skipped (needs a profile, two regions, an appellation and a grape)';
  else
    begin
      insert into public.producers (name, region_id) values
        ('Blindr lookup-region ' || v_s, v_region_b)
      returning id into v_region_exact;
      insert into public.producers (name, region_id) values
        ('BLINDR LOOKUP REGION ' || upper(v_s), v_region_a)
      returning id into v_region_other;

      insert into public.producers (name, region_id) values
        ('Blindr Lookup Exact ' || v_s, v_region_a)
      returning id into v_exact_wines;
      insert into public.producers (name, region_id) values
        ('blindr lookup-exact ' || v_s, null)
      returning id into v_exact_copy;

      insert into public.producers (name, region_id) values
        ('Blindr Lookup Wines ' || v_s, null)
      returning id into v_wines_catalog;
      insert into public.producers (name, region_id) values
        ('BLINDR LOOKUP WINES ' || upper(v_s), v_region_a)
      returning id into v_wines_catalog_link;

      insert into public.producers (name, region_id) values
        ('Blindr Lookup Answer ' || v_s, null)
      returning id into v_wines_answer;
      insert into public.producers (name, region_id) values
        ('BLINDR LOOKUP ANSWER ' || upper(v_s), v_region_a)
      returning id into v_wines_answer_link;

      insert into public.producers (name, region_id) values
        ('Blindr Lookup Link1 ' || v_s, null)
      returning id into v_link_1_null;
      insert into public.producers (name, region_id) values
        ('BLINDR LOOKUP LINK1 ' || upper(v_s), v_region_a)
      returning id into v_link_1_linked;
      insert into public.producers (name, region_id) values
        ('Blindr Lookup Link2 ' || v_s, v_region_a)
      returning id into v_link_2_linked;
      insert into public.producers (name, region_id) values
        ('BLINDR LOOKUP LINK2 ' || upper(v_s), null)
      returning id into v_link_2_null;

      -- Catalog wines for the region, exact and catalog-wines rows.
      insert into public.catalog_wines
        (country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, colour, style, created_by)
      select v_country, v_appellation_region, v_appellation, v_grape, x.producer_id,
             'NV'::public.vintage_kind, 'RED'::public.wine_colour, 'STILL'::public.wine_style, v_profile
      from unnest(array[v_region_exact, v_exact_wines, v_wines_catalog]) as x(producer_id);

      -- An answer key (and nothing in the catalog) for the answer row.
      insert into public.tastings (name, host_id, timing_mode, wine_source)
      values ('Blindr lookup-order check ' || v_s, v_profile,
              (enum_range(null::public.timing_mode))[1], (enum_range(null::public.wine_source_mode))[1])
      returning id into v_tasting;
      insert into public.wines (tasting_id, position) values (v_tasting, 1) returning id into v_wine;
      insert into public.catalog_wines_unidentified (created_by) values (v_profile) returning id into v_unidentified;
      insert into public.wine_answers
        (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, unidentified_wine_id)
      values (v_wine, v_country, v_appellation_region, v_grape, v_wines_answer, 'NV', v_unidentified);

      perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
      set local role authenticated;

      -- The region beats an exact spelling that also holds wines.
      v_got_region := public.find_producer_by_folded_name('Blindr lookup-region ' || v_s, v_region_a);
      -- The exact spelling (case and surrounding spaces aside) beats wines and a region link.
      v_got_exact := public.find_producer_by_folded_name('blindr lookup-exact ' || v_s, null);
      v_got_exact_padded := public.find_producer_by_folded_name('  BLINDR LOOKUP-EXACT ' || upper(v_s) || ' ', null);
      -- No spelling is exact: held wines beat a region link, via either table.
      v_got_wines_catalog := public.find_producer_by_folded_name('Blindr-Lookup-Wines-' || v_s, null);
      v_got_wines_answer := public.find_producer_by_folded_name('Blindr-Lookup-Answer-' || v_s, null);
      -- No spelling is exact, no wines: the region link beats the name, both ways round.
      v_got_link_1 := public.find_producer_by_folded_name('Blindr-Lookup-Link1-' || v_s, null);
      v_got_link_2 := public.find_producer_by_folded_name('Blindr-Lookup-Link2-' || v_s, null);
      -- The caller: find_or_create_producer reuses the exact copy, adding nothing.
      v_reused := public.find_or_create_producer('  Blindr   lookup-exact ' || v_s || ' ', null);

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;
    if not v_ran then
      raise exception '20260914112500: behavioural assertions did not run to completion';
    end if;
    if v_got_region is distinct from v_region_other then
      raise exception 'the given region did not beat the exact spelling and held wines post-migration: got %, expected % (exact copy %)',
        v_got_region, v_region_other, v_region_exact;
    end if;
    if v_got_exact is distinct from v_exact_copy or v_got_exact_padded is distinct from v_exact_copy then
      raise exception 'the exact spelling did not beat held wines and a region link post-migration: got % / %, expected % (wines %)',
        v_got_exact, v_got_exact_padded, v_exact_copy, v_exact_wines;
    end if;
    if v_got_wines_catalog is distinct from v_wines_catalog then
      raise exception 'a catalog wine did not beat a region link post-migration: got %, expected % (linked %)',
        v_got_wines_catalog, v_wines_catalog, v_wines_catalog_link;
    end if;
    if v_got_wines_answer is distinct from v_wines_answer then
      raise exception 'an answer key did not beat a region link post-migration: got %, expected % (linked %)',
        v_got_wines_answer, v_wines_answer, v_wines_answer_link;
    end if;
    if v_got_link_1 is distinct from v_link_1_linked or v_got_link_2 is distinct from v_link_2_linked then
      raise exception 'a region link did not beat the name post-migration: got % / %, expected % / %',
        v_got_link_1, v_got_link_2, v_link_1_linked, v_link_2_linked;
    end if;
    if v_reused is distinct from v_exact_copy then
      raise exception 'find_or_create_producer reused % instead of the exact copy % (wines %) post-migration',
        v_reused, v_exact_copy, v_exact_wines;
    end if;
    if exists (
      select 1 from public.producers p
      where p.id in (v_region_exact, v_region_other, v_exact_wines, v_exact_copy, v_wines_catalog, v_wines_catalog_link,
                     v_wines_answer, v_wines_answer_link, v_link_1_null, v_link_1_linked, v_link_2_linked, v_link_2_null)
    ) or exists (select 1 from public.tastings t where t.id = v_tasting) then
      raise exception '20260914112500: a synthetic row survived its rollback';
    end if;
  end if;
end $$;
