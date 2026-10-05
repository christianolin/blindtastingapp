-- Catalog dosage (owner, 2026-10-03: "I think its a bit odd that you cannot select sugar
-- classifications for cava and champagne etc", and the option the owner chose, "Its own
-- field": "A separate "Dosage" field for sparkling wines (Brut Nature … Doux, with local
-- names like Semiseco, Pas dosé and Dosaggio zero understood). It can sit alongside
-- Reserva or Gran Reserva, the label scanner fills it in, and it's part of the wine's
-- identity, so a Brut Nature and a Semi-sec of the same Cava stay separate wines. Not
-- scored in blind tastings.").
--
-- Applies after 20261003100000_catalog_near_matches (it replaces two of that file's
-- functions and asserts their bodies) and before 20261003102000_cava_duplicates_cleanup.
--
-- 1. catalog_wines.dosage_designation_id: a nullable FK to one of the seven existing
--    "Sparkling Dosage" rows of type_designations (Brut Nature, Extra Brut, Brut, Extra
--    Dry, Sec, Demi-Sec, Doux; 20260717090000). No new reference table: the value set is
--    those rows, so the guess ladder, the knowledge page and every existing answer key
--    that names one of them keep working. type_designation_id stays beside it for
--    Reserva / Gran Reserva / Grand Cru…
-- 2. catalog_wines_dosage_rule (BEFORE INSERT OR UPDATE OF type_designation_id,
--    dosage_designation_id, style), for every writer, the deployed app included:
--    - a dosage row given as the TYPE designation of a sparkling wine moves to the dosage
--      (the old way of storing it; an existing answer key's "Brut" copied onto its
--      catalog wine lands in the right column);
--    - a wine that is not sparkling keeps no dosage;
--    - a dosage must be a "Sparkling Dosage" row (23514 otherwise).
--    It changes only the row being written (NEW), so it is not a separate write that
--    rule 1 would have to judge: catalog_wines_rule1_guard still judges the statement.
-- 3. Legacy: every catalog wine (catalog rows only) whose type designation is a dosage
--    row and whose style is SPARKLING has it moved to the new column (4 live rows on
--    2026-10-03: 3 Brut, 1 Brut Nature). wine_answers and guesses are NOT touched: an
--    answer key that names "Brut" as its type designation keeps it and keeps scoring it
--    exactly as before (reveal_wine and score_own_guess are unchanged), and the dosage
--    rows stay active and selectable as type designations wherever an answer key or a
--    guess can name them.
-- 4. The identity: catalog_wines_identity_key gains the dosage, catalog_wine_identity_match
--    compares it, find_or_create_catalog_wine writes it. A payload WITHOUT the
--    "dosage_designation_id" key (the app deployed before this file, and every database
--    caller) is compared without the dosage unless its type designation is a dosage row,
--    exactly as before, so nothing deployed starts creating duplicates; the app that sends
--    the key always sends it, null included.
-- 5. catalog_wine_near_matches (20261003100000) also returns the dosage, so "Already in
--    the catalog?" can show "Brut Nature, yours is Demi-Sec". Dropped and recreated: its
--    result type changes. Same body otherwise; still SECURITY INVOKER, never a
--    blind_pending or merged row.
-- 6. authenticated may INSERT and UPDATE the new column (the identity and Manage wine
--    columns of 20260919223200).
--
-- Rule 1: the dosage is a column of catalog_wines, read under "catalog read" like every
-- other identity column, and never of wines/wine_answers/guesses: an unrevealed glass
-- shows nothing new. catalog_wine_identity_match (SECURITY DEFINER) compares one more
-- column, so it can only answer "no" more often: the accepted F12 residual is not
-- widened.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'catalog_wines'
                and column_name = 'dosage_designation_id') then
    raise exception '20261003101000: catalog_wines.dosage_designation_id already exists';
  end if;
  if to_regprocedure('public.catalog_wines_dosage_rule()') is not null then
    raise exception '20261003101000: catalog_wines_dosage_rule() already exists';
  end if;

  -- The seven dosage rows, exactly (names, order, category, no country, active).
  select string_agg(td.name, '|' order by td.sort_order, td.name) into v_text
  from type_designations td where td.category = 'Sparkling Dosage';
  if v_text is distinct from 'Brut Nature|Extra Brut|Brut|Extra Dry|Sec|Demi-Sec|Doux' then
    raise exception '20261003101000: the Sparkling Dosage rows are not the seven expected: %', v_text;
  end if;
  if exists (select 1 from type_designations td
              where td.category = 'Sparkling Dosage'
                and (not td.is_active or td.country_id is not null or td.region_id is not null)) then
    raise exception '20261003101000: a Sparkling Dosage row is inactive or scoped to a place';
  end if;

  -- 20261003100000 is in this database (applied, or earlier in the same dry run), with
  -- the bodies this file replaces.
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_identity_match(jsonb)');
  if v_text is distinct from '1c95d8037d552e5519d0aa1a4dd39766' then
    raise exception '20261003101000: catalog_wine_identity_match is not 20261003100000''s (md5 %)', v_text;
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_near_matches(uuid,text,uuid,text,integer)');
  if v_text is distinct from 'c8b6996c29b7faecb46d61d6a0254631' then
    raise exception '20261003101000: catalog_wine_near_matches is not 20261003100000''s (md5 %)', v_text;
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.find_or_create_catalog_wine(jsonb)');
  if v_text is distinct from '0e9e2f1142635473eb916125611ed7ef' then
    raise exception '20261003101000: find_or_create_catalog_wine is not 20260919223100''s (md5 %)', v_text;
  end if;

  -- The identity key is the one this file extends.
  select pg_get_indexdef('public.catalog_wines_identity_key'::regclass) into v_text;
  if v_text is distinct from
     'CREATE UNIQUE INDEX catalog_wines_identity_key ON public.catalog_wines USING btree (producer_id, COALESCE(lower(btrim(wine_name)), ''''::text), appellation_id, colour, vintage_kind, COALESCE(vintage_year, ''-1''::integer), COALESCE(vintage_tawny_years, ''-1''::integer)) WHERE (merged_into IS NULL)' then
    raise exception '20261003101000: catalog_wines_identity_key is not the expected definition: %', v_text;
  end if;

  -- What the legacy move will move, for the post-state.
  perform set_config('blindr.dosage_legacy_before', (
    select count(*)::text from catalog_wines c join type_designations td on td.id = c.type_designation_id
     where td.category = 'Sparkling Dosage' and c.style = 'SPARKLING'), true);
  perform set_config('blindr.dosage_rows_before', (select count(*)::text from catalog_wines), true);
  perform set_config('blindr.dosage_answers_before', (
    select md5(coalesce(string_agg(wa.wine_id::text || ':' || coalesce(wa.type_designation_id::text, '-'), ',' order by wa.wine_id), ''))
      from wine_answers wa), true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
alter table public.catalog_wines
  add column dosage_designation_id uuid
    constraint catalog_wines_dosage_designation_id_fkey references public.type_designations (id) on delete restrict,
  add constraint catalog_wines_dosage_sparkling_only
    check (dosage_designation_id is null or style = 'SPARKLING');

comment on column public.catalog_wines.dosage_designation_id is
  'A sparkling wine''s dosage: one of the "Sparkling Dosage" type_designations rows. Part of the identity (catalog_wines_identity_key). Never scored.';

-- ---------------------------------------------------------------------------
-- 2. The rule, for every writer
-- ---------------------------------------------------------------------------
create function public.catalog_wines_dosage_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The old way of storing a dosage: as the type designation of a sparkling wine.
  if new.style = 'SPARKLING' and new.type_designation_id is not null
     and exists (select 1 from type_designations td
                  where td.id = new.type_designation_id and td.category = 'Sparkling Dosage') then
    new.dosage_designation_id := coalesce(new.dosage_designation_id, new.type_designation_id);
    new.type_designation_id := null;
  end if;
  -- Only a sparkling wine has a dosage.
  if new.style is distinct from 'SPARKLING' then
    new.dosage_designation_id := null;
  end if;
  if new.dosage_designation_id is not null
     and not exists (select 1 from type_designations td
                      where td.id = new.dosage_designation_id and td.category = 'Sparkling Dosage') then
    raise exception using
      errcode = '23514',
      message = 'A dosage must be one of the sparkling dosages (Brut Nature … Doux).';
  end if;
  return new;
end $$;

revoke all on function public.catalog_wines_dosage_rule() from public, anon, authenticated, service_role;

create trigger catalog_wines_dosage_rule
  before insert or update of type_designation_id, dosage_designation_id, style on public.catalog_wines
  for each row execute function public.catalog_wines_dosage_rule();

-- ---------------------------------------------------------------------------
-- 3. Legacy: dosage rows stored as a catalog wine's type designation
-- ---------------------------------------------------------------------------
update public.catalog_wines c
   set dosage_designation_id = c.type_designation_id,
       type_designation_id = null
  from public.type_designations td
 where td.id = c.type_designation_id
   and td.category = 'Sparkling Dosage'
   and c.style = 'SPARKLING';

-- ---------------------------------------------------------------------------
-- 4. The identity
-- ---------------------------------------------------------------------------
drop index public.catalog_wines_identity_key;
create unique index catalog_wines_identity_key on public.catalog_wines (
  producer_id, coalesce(lower(btrim(wine_name)), ''), appellation_id, colour,
  vintage_kind, coalesce(vintage_year, -1), coalesce(vintage_tawny_years, -1),
  coalesce(dosage_designation_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where merged_into is null;

-- 20261003100000's lookup, plus the dosage. The dosage asked for is the payload's
-- "dosage_designation_id", or else its type designation when that is a dosage row; only
-- a sparkling wine has one. It is compared whenever the payload says anything about it
-- (the key is present, or the type designation is a dosage row); a payload that says
-- nothing (the app deployed before this file, database callers) is compared as before.
create or replace function public.catalog_wine_identity_match(p jsonb)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with legacy as (
    select exists (select 1 from type_designations td
                    where td.id = (p->>'type_designation_id')::uuid
                      and td.category = 'Sparkling Dosage') as dosage_as_type
  ),
  want as (
    select case when p->>'style' = 'SPARKLING'
                then coalesce((p->>'dosage_designation_id')::uuid,
                              case when legacy.dosage_as_type then (p->>'type_designation_id')::uuid end)
           end as dosage,
           (p ? 'dosage_designation_id') or (p->>'style' = 'SPARKLING' and legacy.dosage_as_type) as dosage_given
    from legacy
  )
  select c.id
  from catalog_wines c
  cross join want
  where c.merged_into is null
    and c.producer_id = (p->>'producer_id')::uuid
    and c.appellation_id = (p->>'appellation_id')::uuid
    and c.colour = (p->>'colour')::wine_colour
    and c.vintage_kind = (p->>'vintage_kind')::vintage_kind
    and c.vintage_year is not distinct from (p->>'vintage_year')::int
    and c.vintage_tawny_years is not distinct from (p->>'vintage_tawny_years')::int
    and (not want.dosage_given or c.dosage_designation_id is not distinct from want.dosage)
    and (
      coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')
      or ((not c.blind_pending or c.created_by = auth.uid())
          and public.f_search_norm(p->>'wine_name') <> ''
          and public.f_search_norm(c.wine_name) = public.f_search_norm(p->>'wine_name'))
    )
  order by (coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')) desc,
           c.created_at,
           c.id
  limit 1;
$$;

revoke all on function public.catalog_wine_identity_match(jsonb) from public, anon;
grant execute on function public.catalog_wine_identity_match(jsonb) to authenticated, service_role;

-- 20260919223100's body plus the dosage column (catalog_wines_dosage_rule settles a
-- legacy dosage-as-type and a non-sparkling wine). Attributes and EXECUTE unchanged.
create or replace function public.find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.catalog_wine_identity_match(p);
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, dosage_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by, blind_pending
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid, (p->>'dosage_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid(),
    coalesce((p->>'hidden')::boolean, false)
  ) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Near matches carry the dosage
-- ---------------------------------------------------------------------------
drop function public.catalog_wine_near_matches(uuid, text, uuid, text, int);

create function public.catalog_wine_near_matches(
  p_producer_id uuid,
  p_producer_name text,
  p_region_id uuid,
  p_wine_name text,
  p_limit int default 20
)
returns table (
  id uuid,
  producer_id uuid,
  producer_name text,
  wine_name text,
  vintage_kind vintage_kind,
  vintage_year int,
  vintage_tawny_years int,
  colour wine_colour,
  style wine_style,
  country_id uuid,
  region_id uuid,
  appellation_id uuid,
  appellation_name text,
  primary_grape_id uuid,
  primary_grape_name text,
  created_at timestamptz,
  producer_strength int,
  name_score real,
  dosage_designation_id uuid,
  dosage_name text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select public.f_search_norm(p_producer_name) as prod_norm,
           public.f_unaccent(coalesce(p_producer_name, '')) as prod_text,
           public.f_search_norm(p_wine_name) as name_norm,
           public.f_unaccent(coalesce(p_wine_name, '')) as name_text
  ),
  prods as (
    -- 3: the same producer (id, folded name or curated alias); 2: the read's wine name is
    -- this producer's name; 1: a similar name, in the region or with no region link.
    select p.id, max(m.strength) as strength
    from q
    join lateral (
      select pr.id, 3 as strength from producers pr where pr.id = p_producer_id
      union all
      select pr.id, 3 from producers pr
       where q.prod_norm <> '' and public.f_search_norm(pr.name) = q.prod_norm
      union all
      select pa.producer_id, 3 from producer_aliases pa
       where q.prod_norm <> '' and pa.alias_folded = q.prod_norm
      union all
      select pr.id, 2 from producers pr
       where length(q.name_norm) >= 4 and public.f_search_norm(pr.name) = q.name_norm
      union all
      select pr.id, 1 from producers pr
       where length(q.prod_norm) >= 4
         and public.f_unaccent(pr.name) % q.prod_text
         and public.similarity(public.f_unaccent(pr.name), q.prod_text) >= 0.45
         and (p_region_id is null or pr.region_id is null or pr.region_id = p_region_id)
    ) m on true
    join producers p on p.id = m.id
    group by p.id
  ),
  cands as (
    select c.*, coalesce(pp.strength, 0) as strength,
           case
             when public.f_search_norm(c.wine_name) = q.name_norm then 1.0
             when q.name_norm <> '' and public.f_search_norm(c.wine_name) <> ''
                  and (position(q.name_norm in public.f_search_norm(c.wine_name)) > 0
                       or position(public.f_search_norm(c.wine_name) in q.name_norm) > 0) then 0.9
             when q.prod_norm <> '' and public.f_search_norm(c.wine_name) = q.prod_norm then 0.8
             when q.name_norm = '' or public.f_search_norm(c.wine_name) = '' then 0.5
             else public.similarity(public.f_unaccent(coalesce(c.wine_name, '')), q.name_text)
           end::real as score
    from catalog_wines c
    cross join q
    left join prods pp on pp.id = c.producer_id
    where c.merged_into is null
      and not c.blind_pending
      and (pp.id is not null
           -- The read's producer is this wine's name ("Forns Raventós" read as a producer).
           or (length(q.prod_norm) >= 4 and public.f_search_norm(c.wine_name) = q.prod_norm))
  )
  select c.id, c.producer_id, pr.name, c.wine_name, c.vintage_kind, c.vintage_year, c.vintage_tawny_years,
         c.colour, c.style, c.country_id, c.region_id, c.appellation_id, ap.name, c.primary_grape_id, g.name,
         c.created_at, c.strength, c.score, c.dosage_designation_id, dz.name
  from cands c
  join producers pr on pr.id = c.producer_id
  left join appellations ap on ap.id = c.appellation_id
  left join grapes g on g.id = c.primary_grape_id
  left join type_designations dz on dz.id = c.dosage_designation_id
  where c.score >= 0.3
  order by c.strength desc, c.score desc, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.catalog_wine_near_matches(uuid, text, uuid, text, int) from public, anon;
grant execute on function public.catalog_wine_near_matches(uuid, text, uuid, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Column grants: the identity (insert) and Manage wine (update) columns
-- ---------------------------------------------------------------------------
grant insert (dosage_designation_id) on table public.catalog_wines to authenticated;
grant update (dosage_designation_id) on table public.catalog_wines to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_any uuid;
  v_n int;
  v_tpl record;
  v_brut uuid := (select id from type_designations where category = 'Sparkling Dosage' and name = 'Brut');
  v_nature uuid := (select id from type_designations where category = 'Sparkling Dosage' and name = 'Brut Nature');
  v_reserva uuid := (select id from type_designations where category is distinct from 'Sparkling Dosage' order by sort_order, id limit 1);
  v_probe uuid;
  v_after record;
  v_stage text := '';
begin
  -- Functions: attributes and EXECUTE.
  for v_fn in
    select s.sig, s.secdef, s.vol, p.oid, p.prosecdef, p.provolatile::text as vol_now,
           has_function_privilege('anon', p.oid, 'execute') as anon_x,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
           exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_x
    from (values
      ('public.catalog_wine_identity_match(jsonb)', true, 's'),
      ('public.catalog_wine_near_matches(uuid,text,uuid,text,integer)', false, 's'),
      ('public.find_or_create_catalog_wine(jsonb)', false, 'v')
    ) as s (sig, secdef, vol)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
  loop
    if v_fn.oid is null then raise exception '% is missing post-migration', v_fn.sig; end if;
    if v_fn.prosecdef is distinct from v_fn.secdef or v_fn.vol_now <> v_fn.vol then
      raise exception '% has security definer % / volatility %', v_fn.sig, v_fn.prosecdef, v_fn.vol_now;
    end if;
    if not v_fn.auth_x then raise exception '% is not executable by authenticated', v_fn.sig; end if;
    -- find_or_create_catalog_wine keeps its historical PUBLIC/anon EXECUTE (create or replace
    -- leaves its ACL alone); the two others never had it.
    if v_fn.sig <> 'public.find_or_create_catalog_wine(jsonb)' and (v_fn.anon_x or v_fn.public_x) then
      raise exception '% is executable by anon or PUBLIC', v_fn.sig;
    end if;
  end loop;
  if (select string_agg(x.g, ',' order by x.g collate "C")
        from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                   when a.grantee = p.proowner then 'OWNER'
                                   else pg_get_userbyid(a.grantee)::text end as g
                from pg_proc p, aclexplode(p.proacl) a
               where p.oid = 'public.find_or_create_catalog_wine(jsonb)'::regprocedure
                 and a.privilege_type = 'EXECUTE') x)
     is distinct from 'OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'find_or_create_catalog_wine EXECUTE grantees changed';
  end if;
  if has_function_privilege('authenticated', 'public.catalog_wines_dosage_rule()', 'execute') then
    raise exception 'catalog_wines_dosage_rule() is executable by authenticated';
  end if;

  -- Column grants.
  if not has_column_privilege('authenticated', 'public.catalog_wines', 'dosage_designation_id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.catalog_wines', 'dosage_designation_id', 'UPDATE')
     or has_column_privilege('anon', 'public.catalog_wines', 'dosage_designation_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.catalog_wines', 'blind_pending', 'UPDATE') then
    raise exception 'catalog_wines column grants are wrong after adding the dosage';
  end if;

  -- Legacy: everything moved, nothing else changed.
  if exists (select 1 from catalog_wines c join type_designations td on td.id = c.type_designation_id
              where td.category = 'Sparkling Dosage' and c.style = 'SPARKLING') then
    raise exception 'a sparkling catalog wine still carries a dosage as its type designation';
  end if;
  select count(*) into v_n from catalog_wines where dosage_designation_id is not null;
  if v_n::text is distinct from current_setting('blindr.dosage_legacy_before', true) then
    raise exception 'moved % dosage(s), expected %', v_n, current_setting('blindr.dosage_legacy_before', true);
  end if;
  if exists (select 1 from catalog_wines where dosage_designation_id is not null and style <> 'SPARKLING') then
    raise exception 'a wine that is not sparkling has a dosage';
  end if;
  if (select count(*)::text from catalog_wines) is distinct from current_setting('blindr.dosage_rows_before', true) then
    raise exception 'the catalog row count changed';
  end if;
  -- Answer keys untouched (rule: scoring and revealed answer keys never change).
  if (select md5(coalesce(string_agg(wa.wine_id::text || ':' || coalesce(wa.type_designation_id::text, '-'), ',' order by wa.wine_id), ''))
        from wine_answers wa) is distinct from current_setting('blindr.dosage_answers_before', true) then
    raise exception 'wine_answers changed';
  end if;

  -- The new lookup answers every live row with itself, with the dosage key (the app) ...
  select c.id into v_any
  from catalog_wines c
  where c.merged_into is null
    and public.catalog_wine_identity_match(jsonb_build_object(
          'producer_id', c.producer_id, 'wine_name', c.wine_name, 'appellation_id', c.appellation_id,
          'colour', c.colour, 'style', c.style, 'vintage_kind', c.vintage_kind, 'vintage_year', c.vintage_year,
          'vintage_tawny_years', c.vintage_tawny_years, 'type_designation_id', c.type_designation_id,
          'dosage_designation_id', c.dosage_designation_id)) is distinct from c.id
  limit 1;
  if v_any is not null then
    raise exception 'catalog_wine_identity_match does not answer live row % with itself', v_any;
  end if;
  -- ... and without it (the deployed app, database callers) still finds an equal identity.
  select c.id into v_any
  from catalog_wines c
  where c.merged_into is null
    and public.catalog_wine_identity_match(jsonb_build_object(
          'producer_id', c.producer_id, 'wine_name', c.wine_name, 'appellation_id', c.appellation_id,
          'colour', c.colour, 'vintage_kind', c.vintage_kind, 'vintage_year', c.vintage_year,
          'vintage_tawny_years', c.vintage_tawny_years)) is null
  limit 1;
  if v_any is not null then
    raise exception 'a payload without the dosage key no longer finds live row %', v_any;
  end if;

  -- A different dosage is a different wine.
  select c.* into v_tpl from catalog_wines c
   where c.merged_into is null and c.dosage_designation_id is not null order by c.created_at, c.id limit 1;
  if v_tpl.id is not null and public.catalog_wine_identity_match(jsonb_build_object(
          'producer_id', v_tpl.producer_id, 'wine_name', v_tpl.wine_name, 'appellation_id', v_tpl.appellation_id,
          'colour', v_tpl.colour, 'style', 'SPARKLING', 'vintage_kind', v_tpl.vintage_kind,
          'vintage_year', v_tpl.vintage_year, 'vintage_tawny_years', v_tpl.vintage_tawny_years,
          'dosage_designation_id', (select id from type_designations
                                     where category = 'Sparkling Dosage' and id <> v_tpl.dosage_designation_id
                                     order by sort_order limit 1))) is not distinct from v_tpl.id then
    raise exception 'another dosage matched catalog wine %', v_tpl.id;
  end if;

  -- The rule, on a probe row rolled back by the exception block (a savepoint).
  select c.* into v_tpl from catalog_wines c where c.merged_into is null order by c.created_at, c.id limit 1;
  begin
    v_stage := 'insert';
    insert into catalog_wines (country_id, region_id, appellation_id, primary_grape_id, producer_id,
                               type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
                               colour, style, wine_name, created_by)
    values (v_tpl.country_id, v_tpl.region_id, v_tpl.appellation_id, v_tpl.primary_grape_id, v_tpl.producer_id,
            v_brut, 'NV', null, null, v_tpl.colour, 'SPARKLING', 'dosage probe ' || gen_random_uuid(), v_tpl.created_by)
    returning id into v_probe;
    select type_designation_id, dosage_designation_id into v_after from catalog_wines where id = v_probe;
    if v_after.type_designation_id is not null or v_after.dosage_designation_id is distinct from v_brut then
      v_stage := 'insert-moved';
      raise exception 'probe-failed';
    end if;
    v_stage := 'still';
    update catalog_wines set style = 'STILL' where id = v_probe;
    if (select dosage_designation_id from catalog_wines where id = v_probe) is not null then
      raise exception 'probe-failed';
    end if;
    v_stage := 'invalid';
    begin
      update catalog_wines set style = 'SPARKLING', dosage_designation_id = v_reserva where id = v_probe;
      v_stage := 'invalid-accepted';
      raise exception 'probe-failed';
    exception when check_violation then
      v_stage := 'invalid-refused';
    end;
    v_stage := 'both';
    -- The invalid update above was rolled back to its savepoint: the probe is still STILL.
    update catalog_wines set style = 'SPARKLING', dosage_designation_id = v_nature, type_designation_id = v_brut
     where id = v_probe;
    select type_designation_id, dosage_designation_id into v_after from catalog_wines where id = v_probe;
    if v_after.type_designation_id is not null or v_after.dosage_designation_id is distinct from v_nature then
      raise exception 'probe-failed';
    end if;
    v_stage := 'done';
    raise exception 'probe-rollback';
  exception when raise_exception then
    if sqlerrm <> 'probe-rollback' then
      raise exception 'catalog_wines_dosage_rule failed its probe at stage % (%)', v_stage, sqlerrm;
    end if;
  end;
  if exists (select 1 from catalog_wines where id = v_probe) then
    raise exception 'the dosage probe row was not rolled back';
  end if;

  -- The near-match list never carries a hidden or merged row, and names the dosage.
  if exists (
    select 1
    from catalog_wines c
    cross join lateral public.catalog_wine_near_matches(c.producer_id, null, c.region_id, c.wine_name, 50) m
    join catalog_wines x on x.id = m.id
    where x.blind_pending or x.merged_into is not null
       or m.dosage_designation_id is distinct from x.dosage_designation_id
  ) then
    raise exception 'catalog_wine_near_matches returned a hidden or merged row, or the wrong dosage';
  end if;
end $$;
