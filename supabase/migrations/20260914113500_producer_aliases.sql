-- Add-wine v2, L1 round-2 follow-ups — owner approvals 1 and 2 (2026-09-13, "Go with
-- your recommendations"), the alias half: curated alternative producer names.
--
-- find_producer_by_folded_name finds a producer only by its own name, folded. Two
-- recorded reads print a name no producer row carries:
--   #12, round 2: "Borges Porto", the brand on the label. It folds to no producer, so it
--       stays pending, and a save would add a producer beside the catalog's 'Sociedade
--       dos Vinhos Borges' (6aaef358, Porto). There is deliberately no plain "Borges"
--       alias: 'Borges' is the Madeira house (25612e68).
--   #15, both rounds: "Tridente". It finds the empty duplicate 'Tridente' (0d1d099c,
--       Castilla La Mancha), not the catalog's 'Bodegas Tridente' (7f46bd24, Castilla y
--       Leon). Approval 2 merges the duplicate into Bodegas Tridente (the main session's
--       data change, run separately); this alias keeps a later save from recreating it.
--
-- 1. public.producer_aliases holds one curated row per alternative name: the producer it
--    names (on delete cascade, so a producer merged away takes its aliases along), the
--    alias as written, and alias_folded = f_search_norm(alias), the lookup's own fold,
--    stored under a unique index, so a folded name names at most one producer.
--    Access mirrors producers (live 2026-09-13: row level security on, one select policy
--    for authenticated using (true), table grants to anon, authenticated and
--    service_role) without any write: row level security on, the same select policy, and
--    SELECT, only SELECT, for anon, authenticated and service_role. Rows change only
--    through migrations. anon keeps SELECT, as it has on producers, because the lookup is
--    SECURITY INVOKER and executable by PUBLIC, and Postgres checks the privileges on
--    every table a query names before it runs: without the grant an anon call would
--    raise "permission denied for table producer_aliases" where it returns null today.
--    Row level security still shows anon no alias, as it shows anon no producer.
-- 2. find_producer_by_folded_name is recreated from its live definition (20260914112500's
--    body, read with pg_get_functiondef on 2026-09-13 and asserted below before the
--    replace). The producer query is kept word for word as the first argument of
--    coalesce(); the second is the producer of the alias whose alias_folded equals
--    f_search_norm(p_name):
--      - a producer row always beats an alias: the alias is read only when no producer
--        row folds equal, and the region, exact spelling, held wines, region link, name
--        and id still decide among producer rows exactly as before;
--      - the region never filters or orders the alias half: an alias names one producer,
--        and the resolver weighs a region that disagrees with it (approval 3);
--      - the unique index lets the alias half return at most one row, so it has no
--        tie-break and no limit (a second row would raise, never pick one);
--      - the join to producers returns only a producer the caller can see.
--    Everything else stays: the signature, LANGUAGE sql, STABLE, SECURITY INVOKER,
--    SET search_path = public, the owner and the ACL (PUBLIC, postgres, anon,
--    authenticated and service_role may execute). CREATE OR REPLACE keeps the owner and
--    the grants; the grant below repeats 20260912101000's and changes nothing.
-- 3. find_or_create_producer is not recreated. It calls the lookup at run time, so with
--    the alias a pending "Borges Porto" reuses 6aaef358 and, once the merge has run, a
--    pending "Tridente" reuses 7f46bd24 instead of inserting a row. Its definition and
--    grants are asserted unchanged.
-- 4. Exactly two seeds, fail-closed: each target producer must exist under its expected
--    name, "Borges Porto" must fold to no producer, and "Tridente" to none but the known
--    duplicate 0d1d099c. The duplicate may be present or already merged away: while it
--    exists its row wins, and once the merge deletes it the alias answers.
--
-- src/lib/wine-identity/__fixtures__/snapshot-lookup.ts mirrors the fallback, and
-- producer-aliases.test.ts pins it.
--
-- No begin/commit: the applier wraps the file in one transaction.

-- Before anything changes: the state this file starts from, and the attributes and
-- answers the assertions compare against. The settings are transaction-local.
do $$
declare
  v_lookup regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_create regprocedure := to_regprocedure('public.find_or_create_producer(text,uuid)');
  v_body text;
  v_expected constant text := $expected$select p.id from producers p where public.f_search_norm(p_name) <> '' and public.f_search_norm(p.name) = public.f_search_norm(p_name) order by coalesce(p_region_id is not null and p.region_id = p_region_id, false) desc, lower(p.name) = lower(btrim(p_name)) desc, (exists (select 1 from catalog_wines w where w.producer_id = p.id) or exists (select 1 from wine_answers a where a.producer_id = p.id)) desc, (p.region_id is not null) desc, p.name, p.id limit 1$expected$;
begin
  if to_regclass('public.producer_aliases') is not null then
    raise exception '20260914113500: public.producer_aliases already exists before the migration';
  end if;
  if v_lookup is null then
    raise exception '20260914113500: find_producer_by_folded_name(text,uuid) is missing before the replace (it needs 20260912101000)';
  end if;
  if v_create is null then
    raise exception '20260914113500: find_or_create_producer(text,uuid) is missing before the replace (it needs 20260912101000)';
  end if;

  -- The replace starts from 20260914112500's body. If the live body has changed since,
  -- stop instead of overwriting someone else's change.
  select btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')) into v_body
  from pg_proc p
  where p.oid = v_lookup::oid;
  if v_body is distinct from v_expected then
    raise exception '20260914113500: find_producer_by_folded_name is not 20260914112500''s body before the replace: %', v_body;
  end if;
  perform set_config('blindr.alias_lookup_body_before', v_body, true);

  -- The seeds' targets, fail-closed on any drift.
  if not exists (select 1 from public.producers p
                 where p.id = '6aaef358-1645-4811-bd99-daa63c585391' and p.name = 'Sociedade dos Vinhos Borges') then
    raise exception '20260914113500: producer 6aaef358 is not ''Sociedade dos Vinhos Borges'' (found %)',
      coalesce((select quote_literal(p.name) from public.producers p where p.id = '6aaef358-1645-4811-bd99-daa63c585391'), 'no row');
  end if;
  if not exists (select 1 from public.producers p
                 where p.id = '7f46bd24-f237-48e2-a151-ea52e66c2d09' and p.name = 'Bodegas Tridente') then
    raise exception '20260914113500: producer 7f46bd24 is not ''Bodegas Tridente'' (found %)',
      coalesce((select quote_literal(p.name) from public.producers p where p.id = '7f46bd24-f237-48e2-a151-ea52e66c2d09'), 'no row');
  end if;
  if not exists (select 1 from public.producers p
                 where p.id = '25612e68-9bcb-4dc7-b19c-02a6a76e522a' and p.name = 'Borges') then
    raise exception '20260914113500: producer 25612e68 is not ''Borges'', the Madeira house (found %)',
      coalesce((select quote_literal(p.name) from public.producers p where p.id = '25612e68-9bcb-4dc7-b19c-02a6a76e522a'), 'no row');
  end if;
  -- An alias answers only when no producer row folds equal: "Borges Porto" must fold to
  -- no producer, and "Tridente" to none but the known duplicate.
  if exists (select 1 from public.producers p where public.f_search_norm(p.name) = public.f_search_norm('Borges Porto')) then
    raise exception '20260914113500: a producer already folds equal to ''Borges Porto'': %',
      (select string_agg(p.id || ' ' || quote_literal(p.name), ', ') from public.producers p
       where public.f_search_norm(p.name) = public.f_search_norm('Borges Porto'));
  end if;
  if exists (select 1 from public.producers p
             where public.f_search_norm(p.name) = public.f_search_norm('Tridente')
               and p.id <> '0d1d099c-3ee0-4601-99ee-d0d4f5ffd194') then
    raise exception '20260914113500: a producer other than the duplicate 0d1d099c folds equal to ''Tridente'': %',
      (select string_agg(p.id || ' ' || quote_literal(p.name), ', ') from public.producers p
       where public.f_search_norm(p.name) = public.f_search_norm('Tridente') and p.id <> '0d1d099c-3ee0-4601-99ee-d0d4f5ffd194');
  end if;

  -- Every attribute but the body of both functions.
  perform set_config(
    'blindr.alias_lookup_before',
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
    'blindr.alias_create_before',
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

  -- What the lookup answers today for names no alias touches: every producer that folds
  -- to something with "borges" or "tridente" in it plus the first 200 producers by id,
  -- each by its own name with no region and with its own region; and a few names that
  -- are no producer's. Compared after the replace.
  perform set_config(
    'blindr.alias_sample_before',
    (
      select coalesce(jsonb_agg(jsonb_build_array(s.id,
                                                  public.find_producer_by_folded_name(s.name, null),
                                                  public.find_producer_by_folded_name(s.name, s.region_id))
                                order by s.id), '[]'::jsonb)::text
      from (
        select p.id, p.name, p.region_id
        from public.producers p
        where public.f_search_norm(p.name) like '%borges%' or public.f_search_norm(p.name) like '%tridente%'
        union
        (select p.id, p.name, p.region_id from public.producers p order by p.id limit 200)
      ) s
    ),
    true
  );
  perform set_config(
    'blindr.alias_names_before',
    (
      select jsonb_agg(jsonb_build_array(n.name, public.find_producer_by_folded_name(n.name, null)) order by n.ord)::text
      from unnest(array['Borges', 'BORGES', 'Borges & Irmão', 'Sociedade dos Vinhos Borges', 'Bodegas Tridente',
                        'Porto', 'Douro', 'Borges Portugal', 'Tridente Tempranillo', 'Bodegas', '', ' – ',
                        'Blindr no such producer']) with ordinality as n(name, ord)
    ),
    true
  );
end $$;

create table public.producer_aliases (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id) on delete cascade,
  alias text not null,
  alias_folded text not null generated always as (public.f_search_norm(alias)) stored,
  created_at timestamptz not null default now(),
  constraint producer_aliases_alias_trimmed check (alias = btrim(regexp_replace(alias, '[[:space:]]+', ' ', 'g'))),
  constraint producer_aliases_alias_folds check (public.f_search_norm(alias) <> '')
);

-- A folded name names at most one producer; the lookup's equality uses this index.
create unique index producer_aliases_alias_folded_key
  on public.producer_aliases (alias_folded);

-- The on-delete-cascade from producers.
create index producer_aliases_producer_id_idx
  on public.producer_aliases (producer_id);

alter table public.producer_aliases enable row level security;

-- Who can read producers today (init_schema's "reference read"), and no write policy.
create policy "producer aliases read" on public.producer_aliases
  for select to authenticated using (true);

-- The schema's default privileges hand anon, authenticated and service_role every table
-- privilege; curated rows keep SELECT only.
revoke all on table public.producer_aliases from public, anon, authenticated, service_role;
grant select on table public.producer_aliases to anon, authenticated, service_role;

create or replace function public.find_producer_by_folded_name(p_name text, p_region_id uuid default null)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select p.id
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
     limit 1),
    (select pa.producer_id
     from producer_aliases pa
     join producers ap on ap.id = pa.producer_id
     where public.f_search_norm(p_name) <> ''
       and pa.alias_folded = public.f_search_norm(p_name))
  )
$$;

grant execute on function public.find_producer_by_folded_name(text, uuid) to authenticated;

-- The two approved aliases (approval 1: no plain "Borges"; approval 2: "Tridente").
insert into public.producer_aliases (producer_id, alias) values
  ('6aaef358-1645-4811-bd99-daa63c585391', 'Borges Porto'),
  ('7f46bd24-f237-48e2-a151-ea52e66c2d09', 'Tridente');

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version must
-- never exist without the DDL it names. The behavioural checks run inside a
-- synthetic-rollback subtransaction (spec §E.0), so no row they create survives either
-- a dry or a live apply.
do $$
declare
  v_tbl regclass := to_regclass('public.producer_aliases');
  v_fn regprocedure := to_regprocedure('public.find_producer_by_folded_name(text,uuid)');
  v_create regprocedure := to_regprocedure('public.find_or_create_producer(text,uuid)');
  v_before jsonb := nullif(current_setting('blindr.alias_lookup_before', true), '')::jsonb;
  v_create_before jsonb := nullif(current_setting('blindr.alias_create_before', true), '')::jsonb;
  v_body_before text := nullif(current_setting('blindr.alias_lookup_body_before', true), '');
  v_sample_before jsonb := nullif(current_setting('blindr.alias_sample_before', true), '')::jsonb;
  v_names_before jsonb := nullif(current_setting('blindr.alias_names_before', true), '')::jsonb;
  v_after jsonb;
  v_create_after jsonb;
  v_sample_after jsonb;
  v_names_after jsonb;
  v_text text;
  v_expected text;
  v_role text;
  v_priv text;
  -- the live rows the approvals name
  v_sociedade constant uuid := '6aaef358-1645-4811-bd99-daa63c585391';
  v_bodegas constant uuid := '7f46bd24-f237-48e2-a151-ea52e66c2d09';
  v_duplicate constant uuid := '0d1d099c-3ee0-4601-99ee-d0d4f5ffd194';
  v_madeira_house constant uuid := '25612e68-9bcb-4dc7-b19c-02a6a76e522a';
  v_tridente_expected uuid;
  v_region_porto uuid;
  v_region_madeira uuid;
  v_region_cyl uuid;
  v_real jsonb;
  v_real_expected jsonb;
  -- synthetic rows
  v_profile uuid;
  v_region_a uuid;
  v_region_b uuid;
  v_s text := replace(gen_random_uuid()::text, '-', '');
  v_target uuid;
  v_alias uuid;
  v_row uuid;
  v_untrimmed_refused boolean;
  v_unfoldable_refused boolean;
  v_twin_refused boolean;
  v_got_row uuid;
  v_got_row_create uuid;
  v_visible_authenticated int;
  v_insert_refused boolean;
  v_update_refused boolean;
  v_delete_refused boolean;
  v_service_insert_refused boolean;
  v_visible_anon int;
  v_got_anon uuid;
  v_anon_error text;
  v_got_alias uuid;
  v_got_alias_null uuid;
  v_count_before int;
  v_got_alias_create uuid;
  v_count_after int;
  v_alias_left int;
  v_got_gone uuid;
  v_synthetic boolean := false;
  v_ran boolean := false;
begin
  -- 0. The pre-change capture ran in this transaction.
  if v_before is null or v_create_before is null or v_body_before is null
     or v_sample_before is null or v_names_before is null then
    raise exception '20260914113500: the pre-change capture is missing (the file must run in one transaction)';
  end if;

  -- 1. The table: columns, generated fold, defaults, keys, checks and indexes.
  if v_tbl is null then
    raise exception 'public.producer_aliases missing post-migration';
  end if;
  select string_agg(format('%s:%s:%s:%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then 'not null' else 'null' end,
                           case a.attgenerated when 's' then 'stored' else 'plain' end),
                    ', ' order by a.attnum)
  into v_text
  from pg_attribute a
  where a.attrelid = v_tbl and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
     'id:uuid:not null:plain, producer_id:uuid:not null:plain, alias:text:not null:plain, alias_folded:text:not null:stored, created_at:timestamp with time zone:not null:plain' then
    raise exception 'producer_aliases columns are not as designed post-migration: %', v_text;
  end if;
  select string_agg(a.attname || '=' || pg_get_expr(d.adbin, d.adrelid), ' | ' order by a.attnum)
  into v_text
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = v_tbl;
  if v_text is null
     or v_text not like 'id=gen_random_uuid() | alias_folded=%f_search_norm(alias) | created_at=now()' then
    raise exception 'producer_aliases defaults or the generated fold are not as designed post-migration: %', v_text;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = v_tbl and c.contype = 'p'
      and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = v_tbl and a.attname = 'id')]
  ) then
    raise exception 'producer_aliases has no primary key on id post-migration';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = v_tbl and c.contype = 'f') <> 1 or not exists (
    select 1 from pg_constraint c
    where c.conrelid = v_tbl and c.contype = 'f'
      and c.confrelid = 'public.producers'::regclass
      and c.confdeltype = 'c'
      and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = v_tbl and a.attname = 'producer_id')]
      and c.confkey = array[(select a.attnum from pg_attribute a where a.attrelid = 'public.producers'::regclass and a.attname = 'id')]
  ) then
    raise exception 'producer_aliases.producer_id is not the one foreign key to producers(id) on delete cascade post-migration';
  end if;
  select string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' order by c.conname)
  into v_text
  from pg_constraint c
  where c.conrelid = v_tbl and c.contype = 'c';
  if (select count(*) from pg_constraint c where c.conrelid = v_tbl and c.contype = 'c') <> 2
     or v_text not like 'producer_aliases_alias_folds: CHECK ((f_search_norm(alias) <> ''''::text)) | producer_aliases_alias_trimmed: CHECK ((alias = btrim(regexp_replace(alias, ''[[:space:]]+''%''g''%' then
    raise exception 'producer_aliases check constraints are not as designed post-migration: %', v_text;
  end if;
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_am am on am.oid = c.relam
    where i.indrelid = v_tbl
      and c.relname = 'producer_aliases_alias_folded_key'
      and c.relnamespace = 'public'::regnamespace
      and am.amname = 'btree'
      and i.indisunique
      and i.indpred is null
      and i.indexprs is null
      and i.indnatts = 1
      and i.indkey[0] = (select a.attnum from pg_attribute a where a.attrelid = v_tbl and a.attname = 'alias_folded')
  ) then
    raise exception 'producer_aliases_alias_folded_key missing or not a unique btree on producer_aliases(alias_folded) post-migration';
  end if;
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_am am on am.oid = c.relam
    where i.indrelid = v_tbl
      and c.relname = 'producer_aliases_producer_id_idx'
      and c.relnamespace = 'public'::regnamespace
      and am.amname = 'btree'
      and i.indpred is null
      and i.indexprs is null
      and i.indnatts = 1
      and i.indkey[0] = (select a.attnum from pg_attribute a where a.attrelid = v_tbl and a.attname = 'producer_id')
  ) then
    raise exception 'producer_aliases_producer_id_idx missing or not a btree on producer_aliases(producer_id) post-migration';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = v_tbl and not t.tgisinternal) then
    raise exception 'producer_aliases has a trigger post-migration';
  end if;

  -- 2. Row level security is on, and the policies are exactly producers' select policy:
  --    one permissive SELECT for authenticated using (true), and nothing that writes.
  if not (select c.relrowsecurity from pg_class c where c.oid = v_tbl) then
    raise exception 'row level security is off on producer_aliases post-migration';
  end if;
  select string_agg(format('%s|%s|%s|%s|%s', l.permissive, l.roles::text, l.cmd, coalesce(l.qual, '-'), coalesce(l.with_check, '-')),
                    ';' order by l.policyname)
  into v_text
  from pg_policies l
  where l.schemaname = 'public' and l.tablename = 'producer_aliases';
  select string_agg(format('%s|%s|%s|%s|%s', l.permissive, l.roles::text, l.cmd, coalesce(l.qual, '-'), coalesce(l.with_check, '-')),
                    ';' order by l.policyname)
  into v_expected
  from pg_policies l
  where l.schemaname = 'public' and l.tablename = 'producers' and l.cmd = 'SELECT';
  if v_text is distinct from 'PERMISSIVE|{authenticated}|SELECT|true|-' or v_text is distinct from v_expected then
    raise exception 'producer_aliases policies are not exactly producers'' select policy post-migration: % (producers: %)',
      v_text, v_expected;
  end if;

  -- 3. Grants: anon, authenticated and service_role hold SELECT, as they do on producers,
  --    and nothing else; PUBLIC and every column hold nothing.
  select string_agg(format('%s:%s', case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type),
                    ',' order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type)
  into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = v_tbl and a.grantee <> c.relowner;
  if v_text is distinct from 'anon:SELECT,authenticated:SELECT,service_role:SELECT' then
    raise exception 'producer_aliases table grants are not SELECT-only for anon, authenticated and service_role post-migration: %', v_text;
  end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not has_table_privilege(v_role, v_tbl, 'SELECT')
       or not has_table_privilege(v_role, 'public.producers'::regclass, 'SELECT') then
      raise exception '% cannot select producer_aliases, or producers, post-migration', v_role;
    end if;
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(v_role, v_tbl, v_priv) then
        raise exception '% holds % on producer_aliases post-migration', v_role, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(v_role, v_tbl, v_priv) then
        raise exception '% holds column % on producer_aliases post-migration', v_role, v_priv;
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attacl is not null) then
    raise exception 'producer_aliases carries column grants post-migration';
  end if;

  -- 4. The lookup: every attribute but the body is what it was before the replace, and
  --    the body is 20260914112500's query, word for word, with the alias fallback.
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
  if v_fn is null or v_after is distinct from v_before then
    raise exception 'find_producer_by_folded_name changed beyond its body post-migration: before %, after %', v_before, v_after;
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.oid = v_fn::oid
      and not p.prosecdef
      and p.provolatile = 's'
      and l.lanname = 'sql'
      and 'search_path=public' = any (coalesce(p.proconfig, '{}'::text[]))
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) then
    raise exception 'find_producer_by_folded_name is not SECURITY INVOKER, STABLE, LANGUAGE sql, search_path=public and executable by authenticated post-migration';
  end if;
  v_expected := 'select coalesce( (' || v_body_before || '), (select pa.producer_id from producer_aliases pa'
             || ' join producers ap on ap.id = pa.producer_id where public.f_search_norm(p_name) <> '''''
             || ' and pa.alias_folded = public.f_search_norm(p_name)) )';
  select btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')) into v_text from pg_proc p where p.oid = v_fn::oid;
  if v_text is distinct from v_expected then
    raise exception 'find_producer_by_folded_name is not 20260914112500''s query with the alias fallback post-migration: %', v_text;
  end if;

  -- 5. find_or_create_producer is untouched: same body, attributes and grants, and it
  --    still calls the lookup.
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
  if v_create is null or v_create_after is distinct from v_create_before then
    raise exception 'find_or_create_producer changed post-migration: before %, after %', v_create_before, v_create_after;
  end if;
  if position('find_producer_by_folded_name' in (select p.prosrc from pg_proc p where p.oid = v_create::oid)) = 0 then
    raise exception 'find_or_create_producer no longer calls find_producer_by_folded_name post-migration';
  end if;

  -- 6. Exactly the two approved aliases, and no plain "Borges".
  select string_agg(format('%s>%s>%s', a.alias_folded, a.producer_id, a.alias), ',' order by a.alias_folded)
  into v_text
  from public.producer_aliases a;
  if v_text is distinct from
     'borgesporto>6aaef358-1645-4811-bd99-daa63c585391>Borges Porto,tridente>7f46bd24-f237-48e2-a151-ea52e66c2d09>Tridente' then
    raise exception 'producer_aliases does not hold exactly the two approved aliases post-migration: %', v_text;
  end if;
  if exists (select 1 from public.producer_aliases a
             where a.alias_folded = public.f_search_norm('Borges') or a.producer_id = v_madeira_house) then
    raise exception 'an alias folds to ''Borges'' or names the Madeira house post-migration';
  end if;

  -- 7. Names no alias touches resolve exactly as before the replace.
  select coalesce(jsonb_agg(jsonb_build_array(s.id,
                                              public.find_producer_by_folded_name(s.name, null),
                                              public.find_producer_by_folded_name(s.name, s.region_id))
                            order by s.id), '[]'::jsonb)
  into v_sample_after
  from (
    select p.id, p.name, p.region_id
    from public.producers p
    where public.f_search_norm(p.name) like '%borges%' or public.f_search_norm(p.name) like '%tridente%'
    union
    (select p.id, p.name, p.region_id from public.producers p order by p.id limit 200)
  ) s;
  if v_sample_after is distinct from v_sample_before then
    raise exception 'find_producer_by_folded_name changed its pick for a producer''s own name post-migration';
  end if;
  select jsonb_agg(jsonb_build_array(n.name, public.find_producer_by_folded_name(n.name, null)) order by n.ord)
  into v_names_after
  from unnest(array['Borges', 'BORGES', 'Borges & Irmão', 'Sociedade dos Vinhos Borges', 'Bodegas Tridente',
                    'Porto', 'Douro', 'Borges Portugal', 'Tridente Tempranillo', 'Bodegas', '', ' – ',
                    'Blindr no such producer']) with ordinality as n(name, ord);
  if v_names_after is distinct from v_names_before then
    raise exception 'find_producer_by_folded_name changed its pick for a name no alias touches post-migration: before %, after %',
      v_names_before, v_names_after;
  end if;

  -- 8. Behavioural, as authenticated (and anon, and service_role where stated).
  select p.region_id into v_region_porto from public.producers p where p.id = v_sociedade;
  select p.region_id into v_region_madeira from public.producers p where p.id = v_madeira_house;
  select p.region_id into v_region_cyl from public.producers p where p.id = v_bodegas;
  -- While the duplicate exists its row wins; once the merge has deleted it, the alias.
  v_tridente_expected := coalesce((select p.id from public.producers p where p.id = v_duplicate), v_bodegas);
  v_real_expected := jsonb_build_array(v_sociedade, v_sociedade, v_sociedade, v_sociedade,
                                       v_madeira_house, v_madeira_house,
                                       v_tridente_expected, v_tridente_expected,
                                       v_sociedade, v_bodegas);
  select pr.id into v_profile from public.profiles pr order by pr.id limit 1;
  select r.id into v_region_a from public.regions r order by r.id limit 1;
  select r.id into v_region_b from public.regions r where r.id <> v_region_a order by r.id limit 1;

  begin
    perform set_config('request.jwt.claims',
      case when v_profile is null then json_build_object('role', 'authenticated')
           else json_build_object('sub', v_profile, 'role', 'authenticated') end::text, true);
    set local role authenticated;

    -- The live rows: "Borges Porto" in any spelling and any region → Sociedade dos Vinhos
    -- Borges; "Borges" → the Madeira house; "Tridente" → the duplicate while it exists,
    -- else Bodegas Tridente; the targets' own names → themselves.
    v_real := jsonb_build_array(
      public.find_producer_by_folded_name('Borges Porto', null),
      public.find_producer_by_folded_name('BORGES PORTO', v_region_madeira),
      public.find_producer_by_folded_name('  Bórges-Pórto ', v_region_cyl),
      public.find_producer_by_folded_name('borges  porto', v_region_porto),
      public.find_producer_by_folded_name('Borges', null),
      public.find_producer_by_folded_name('Borges', v_region_porto),
      public.find_producer_by_folded_name('Tridente', null),
      public.find_producer_by_folded_name('TRIDENTE', v_region_cyl),
      public.find_producer_by_folded_name('Sociedade dos Vinhos Borges', v_region_porto),
      public.find_producer_by_folded_name('Bodegas Tridente', null)
    );
    reset role;

    if v_region_b is null then
      raise notice '20260914113500: synthetic alias assertions skipped (needs two regions)';
    else
      -- A target producer with an alias, and a producer row whose name folds equal to
      -- the alias, in another region.
      insert into public.producers (name, region_id) values ('Blindr alias target ' || v_s, v_region_a)
      returning id into v_target;
      insert into public.producer_aliases (producer_id, alias) values (v_target, 'Blindr alias ' || v_s)
      returning id into v_alias;
      insert into public.producers (name, region_id) values ('Blindr-Alias-' || v_s, v_region_b)
      returning id into v_row;

      -- The checks refuse an untidy or unfoldable alias, and the unique index a folded twin.
      begin
        insert into public.producer_aliases (producer_id, alias) values (v_target, ' Blindr untrimmed ' || v_s);
        v_untrimmed_refused := false;
      exception when check_violation then
        v_untrimmed_refused := true;
      end;
      begin
        insert into public.producer_aliases (producer_id, alias) values (v_target, '–');
        v_unfoldable_refused := false;
      exception when check_violation then
        v_unfoldable_refused := true;
      end;
      begin
        insert into public.producer_aliases (producer_id, alias) values (v_row, 'BLINDR-ALIAS-' || upper(v_s));
        v_twin_refused := false;
      exception when unique_violation then
        v_twin_refused := true;
      end;

      set local role authenticated;
      -- A producer row beats the alias, even given the alias's producer's region.
      v_got_row := public.find_producer_by_folded_name('BLINDR ALIAS ' || upper(v_s), v_region_a);
      v_got_row_create := public.find_or_create_producer('  Blindr   alias ' || v_s || ' ', v_region_a);
      -- authenticated reads aliases and writes none.
      select count(*) into v_visible_authenticated from public.producer_aliases a where a.id = v_alias;
      begin
        insert into public.producer_aliases (producer_id, alias) values (v_target, 'Blindr alias write ' || v_s);
        v_insert_refused := false;
      exception when insufficient_privilege then
        v_insert_refused := true;
      end;
      begin
        update public.producer_aliases set alias = 'Blindr alias update ' || v_s where id = v_alias;
        v_update_refused := false;
      exception when insufficient_privilege then
        v_update_refused := true;
      end;
      begin
        delete from public.producer_aliases where id = v_alias;
        v_delete_refused := false;
      exception when insufficient_privilege then
        v_delete_refused := true;
      end;
      reset role;

      set local role service_role;
      begin
        insert into public.producer_aliases (producer_id, alias) values (v_target, 'Blindr alias service ' || v_s);
        v_service_insert_refused := false;
      exception when insufficient_privilege then
        v_service_insert_refused := true;
      end;
      reset role;

      -- anon sees no alias, and its lookup still returns null rather than raising.
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      set local role anon;
      select count(*) into v_visible_anon from public.producer_aliases;
      begin
        v_got_anon := public.find_producer_by_folded_name('Blindr alias ' || v_s, null);
      exception when others then
        get stacked diagnostics v_anon_error = message_text;
      end;
      reset role;

      -- The producer row goes, as a merge deletes a duplicate: the alias takes over,
      -- whatever the region, and find_or_create_producer reuses it without a new row.
      delete from public.producers where id = v_row;
      perform set_config('request.jwt.claims',
        case when v_profile is null then json_build_object('role', 'authenticated')
             else json_build_object('sub', v_profile, 'role', 'authenticated') end::text, true);
      set local role authenticated;
      v_got_alias := public.find_producer_by_folded_name('  BLINDR-ALIAS  ' || upper(v_s), v_region_b);
      v_got_alias_null := public.find_producer_by_folded_name('blindr alias ' || v_s, null);
      select count(*) into v_count_before from public.producers p where p.name like '%' || v_s;
      v_got_alias_create := public.find_or_create_producer('Blindr Alias ' || v_s, v_region_b);
      select count(*) into v_count_after from public.producers p where p.name like '%' || v_s;
      reset role;

      -- Deleting the alias's producer takes the alias with it.
      delete from public.producers where id = v_target;
      select count(*) into v_alias_left from public.producer_aliases a where a.id = v_alias;
      v_got_gone := public.find_producer_by_folded_name('Blindr alias ' || v_s, null);
      v_synthetic := true;
    end if;

    v_ran := true;
    raise exception 'synthetic rollback' using errcode = 'SYNRB';
  exception
    when sqlstate 'SYNRB' then
      null;
  end;
  if not v_ran then
    raise exception '20260914113500: behavioural assertions did not run to completion';
  end if;
  if v_real is distinct from v_real_expected then
    raise exception 'the live aliases do not resolve as approved post-migration: got %, expected %', v_real, v_real_expected;
  end if;
  if v_synthetic then
    if not (v_untrimmed_refused and v_unfoldable_refused and v_twin_refused) then
      raise exception 'producer_aliases accepted an untrimmed (%), unfoldable (%) or folded-twin (%) alias post-migration',
        not v_untrimmed_refused, not v_unfoldable_refused, not v_twin_refused;
    end if;
    if v_got_row is distinct from v_row or v_got_row_create is distinct from v_row then
      raise exception 'a producer row did not beat the alias post-migration: got % / %, expected % (alias target %)',
        v_got_row, v_got_row_create, v_row, v_target;
    end if;
    if v_visible_authenticated is distinct from 1 then
      raise exception 'authenticated cannot read producer_aliases post-migration (% rows)', v_visible_authenticated;
    end if;
    if not (v_insert_refused and v_update_refused and v_delete_refused) then
      raise exception 'authenticated could insert (%), update (%) or delete (%) producer_aliases post-migration',
        not v_insert_refused, not v_update_refused, not v_delete_refused;
    end if;
    if not v_service_insert_refused then
      raise exception 'service_role could insert into producer_aliases post-migration';
    end if;
    if v_visible_anon is distinct from 0 or v_got_anon is not null or v_anon_error is not null then
      raise exception 'anon saw % alias rows, or its lookup returned % / raised % post-migration', v_visible_anon, v_got_anon, v_anon_error;
    end if;
    if v_got_alias is distinct from v_target or v_got_alias_null is distinct from v_target
       or v_got_alias_create is distinct from v_target then
      raise exception 'the alias did not answer once no producer row folded equal post-migration: got % / % / %, expected %',
        v_got_alias, v_got_alias_null, v_got_alias_create, v_target;
    end if;
    if v_count_before is distinct from 1 or v_count_after is distinct from v_count_before then
      raise exception 'find_or_create_producer added a producer for an aliased name post-migration (% before, % after)',
        v_count_before, v_count_after;
    end if;
    if v_alias_left is distinct from 0 or v_got_gone is not null then
      raise exception 'deleting the alias''s producer left the alias (% rows) or a lookup hit (%) post-migration', v_alias_left, v_got_gone;
    end if;
    if exists (select 1 from public.producers p where p.id in (v_target, v_row) or p.name like '%' || v_s)
       or exists (select 1 from public.producer_aliases a where a.id = v_alias or a.alias like '%' || v_s) then
      raise exception '20260914113500: a synthetic row survived its rollback';
    end if;
  end if;
end $$;
