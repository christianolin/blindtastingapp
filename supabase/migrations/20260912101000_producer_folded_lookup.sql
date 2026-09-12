-- Add-wine v2 (D6, D8, spec §E.2): one folded producer lookup, so a typed or
-- scanned name that folds equal to an existing producer ("CHATEAU PALMER",
-- "Château-Palmer") reuses it instead of creating a duplicate (byhand-1, scan-3).
-- Both sides fold with f_search_norm (IMMUTABLE, 20260829260000), so a btree
-- functional index serves the equality. SECURITY INVOKER is enough: authenticated
-- may already read and insert producers. Existing folded collisions are counted,
-- not merged. No begin/commit: the applier wraps the file.

create index if not exists producers_search_norm_eq_idx
  on public.producers (public.f_search_norm(name));

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
  order by (p_region_id is not null and p.region_id = p_region_id) desc,
           (p.region_id is not null) desc,
           p.name,
           p.id
  limit 1
$$;

create or replace function public.find_or_create_producer(p_name text, p_region_id uuid default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if public.f_search_norm(v_name) = '' then
    raise exception 'producer name is empty';
  end if;
  v_id := public.find_producer_by_folded_name(v_name, p_region_id);
  if v_id is not null then
    return v_id;
  end if;
  insert into producers (name, region_id) values (v_name, p_region_id)
  on conflict (name) do nothing
  returning id into v_id;
  return coalesce(v_id, public.find_producer_by_folded_name(v_name, p_region_id));
end $$;

grant execute on function public.find_producer_by_folded_name(text, uuid) to authenticated;
grant execute on function public.find_or_create_producer(text, uuid) to authenticated;

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version
-- must never exist without the DDL it names. The create-path check runs inside a
-- synthetic-rollback subtransaction (spec §E.0), so no producer row survives
-- either a dry or a live apply.
do $$
declare
  v_lookup regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_create regprocedure := to_regprocedure('public.find_or_create_producer(text,uuid)');
  v_fn regprocedure;
  v_name text;
  v_found uuid;
  v_found_norm text;
  v_raised boolean := false;
  v_message text;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_ran boolean := false;
  v_first uuid;
  v_second uuid;
  v_rows int;
  v_stored text;
  v_groups int;
  v_group_rows int;
begin
  -- 1. Both functions exist by full signature, pin search_path and are callable by
  --    authenticated. They are SECURITY INVOKER on purpose (authenticated may read
  --    and insert producers), so prosecdef is not asserted.
  if v_lookup is null then
    raise exception 'find_producer_by_folded_name(text,uuid) missing post-migration';
  end if;
  if v_create is null then
    raise exception 'find_or_create_producer(text,uuid) missing post-migration';
  end if;
  foreach v_fn in array array[v_lookup, v_create] loop
    if not exists (
      select 1
      from pg_proc p
      where p.oid = v_fn::oid
        and 'search_path=public' = any (coalesce(p.proconfig, '{}'::text[]))
    ) then
      raise exception '% does not pin search_path to public post-migration', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn::oid, 'execute') then
      raise exception '% is not executable by authenticated post-migration', v_fn;
    end if;
  end loop;

  -- 2. The btree equality index on the folded name that serves the lookup.
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_am am on am.oid = c.relam
    where c.relname = 'producers_search_norm_eq_idx'
      and c.relnamespace = 'public'::regnamespace
      and i.indrelid = 'public.producers'::regclass
      and am.amname = 'btree'
      and pg_get_indexdef(i.indexrelid) like '%f_search_norm(name)%'
  ) then
    raise exception 'producers_search_norm_eq_idx missing or not a btree on f_search_norm(name) post-migration';
  end if;

  -- 3. A case-changed spelling of an existing producer (an accented one when there
  --    is one) finds a producer that folds equal to the original.
  select p.name into v_name
  from public.producers p
  where public.f_search_norm(p.name) <> ''
    and p.name <> upper(p.name)
    and public.f_search_norm(upper(p.name)) = public.f_search_norm(p.name)
  order by (p.name <> public.f_unaccent(p.name)) desc, p.name, p.id
  limit 1;
  if v_name is null then
    raise notice '20260912101000: folded-lookup assertion skipped (no producers)';
  else
    v_found := public.find_producer_by_folded_name(upper(v_name));
    select public.f_search_norm(p.name) into v_found_norm from public.producers p where p.id = v_found;
    if v_found is null or v_found_norm is distinct from public.f_search_norm(v_name) then
      raise exception 'find_producer_by_folded_name(upper(%)) did not find a folded-equal producer post-migration', quote_literal(v_name);
    end if;
  end if;

  -- 4. A blank name is refused before anything is written.
  begin
    perform public.find_or_create_producer('  ');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_message = message_text;
  end;
  if not v_raised or v_message is distinct from 'producer name is empty' then
    raise exception 'find_or_create_producer(''  '') did not refuse the blank name post-migration (%)',
      coalesce(v_message, 'no error');
  end if;

  -- 5. Behavioural, as authenticated: a new name is stored trimmed and space-collapsed
  --    once, and a spelling that folds equal reuses that row instead of adding a
  --    duplicate (byhand-1, scan-3).
  begin
    set local role authenticated;
    v_first := public.find_or_create_producer('  Blindr   assertion-producer ' || v_suffix || ' ');
    v_second := public.find_or_create_producer('BLINDR ASSERTION PRODUCER ' || upper(v_suffix));
    select count(*), min(p.name) into v_rows, v_stored
    from public.producers p
    where public.f_search_norm(p.name) = public.f_search_norm('blindr assertion producer ' || v_suffix);
    v_ran := true;
    raise exception 'synthetic rollback' using errcode = 'SYNRB';
  exception
    when sqlstate 'SYNRB' then
      null;
  end;
  if not v_ran then
    raise exception '20260912101000: behavioural assertions did not run to completion';
  end if;
  if v_first is null or v_first is distinct from v_second then
    raise exception 'find_or_create_producer created a second producer for a folded-equal spelling post-migration';
  end if;
  if v_rows is distinct from 1 then
    raise exception 'find_or_create_producer left % producers for one folded name post-migration', v_rows;
  end if;
  if v_stored is distinct from 'Blindr assertion-producer ' || v_suffix then
    raise exception 'find_or_create_producer did not store the trimmed, space-collapsed name post-migration (%)', v_stored;
  end if;
  if exists (select 1 from public.producers p where p.id = v_first) then
    raise exception '20260912101000: the synthetic producer survived its rollback';
  end if;

  -- 6. Existing folded collisions are tolerated, not merged: report how many.
  select count(*), coalesce(sum(s.n), 0) into v_groups, v_group_rows
  from (
    select public.f_search_norm(p.name) as folded, count(*) as n
    from public.producers p
    group by public.f_search_norm(p.name)
    having count(*) > 1
  ) s
  where s.folded <> '';
  raise notice '20260912101000: % folded producer-name collision group(s) across % row(s), left unmerged',
    v_groups, v_group_rows;
end $$;
