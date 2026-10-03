-- Catalog dedupe, part 1 (owner, 2026-10-03: "I really dont want to flood the catalog with
-- duplicates"; approved proposal items 1-4). On 2026-10-02 three people at one Cava tasting
-- added eleven catalog wines in ninety minutes, several of them twice: "Òrtus Blanc de Noirs"
-- under two spellings of one producer, "Nódal" and "Nodal" as two rows of one vintage. This
-- file gives the add-wine sheet what it needs to stop that before the row exists:
--
-- 1. catalog_wine_identity_match(jsonb) (find_or_create_catalog_wine's lookup) also matches a
--    name that differs only by accents, case, spaces or punctuation (f_search_norm): "Nódal"
--    is "Nodal", "Semi-sec" is "Semi Sec". The exact lower(btrim()) match is tried first and
--    still matches any row, hidden or not, exactly as before (catalog_wines_identity_key is
--    unchanged). The new folded match is admitted ONLY on a row the caller already reads
--    without any glass-based grant: not blind_pending, or created by the caller. So it tells
--    nobody anything about a hidden wine that the accepted residual F12 (spec
--    2026-09-19-rule1-older-leaks) did not already tell them: F12 is not widened.
-- 2. catalog_wine_near_matches(...) — the "Already in the catalog?" candidates. SECURITY
--    INVOKER, so "catalog read" applies, and stricter than RLS on purpose: never a
--    blind_pending row (even one the caller could read), never a row merged away — exactly
--    findConfidentMatch's candidate rule (src/lib/wine-identity/server/match.ts), so no hidden
--    glass's identity can reach the list. Producers match by id, by folded name, by curated
--    alias, or by trigram similarity (in the region, or with no region); a read whose wine
--    name is another producer's name, or a wine whose name is the read's producer, counts too.
-- 3. similar_producers(name, region) — "Did you mean …?" before a new producer is created.
--    Producers are reference rows every signed-in user already reads (search_producers lists
--    them); the wine count it returns counts only public, unmerged wines.
-- 4. recent_circle_catalog_wines(query, hours, limit) — public catalog wines created in the
--    last p_hours (default 24, at most 72) by the caller, people the caller shares a tasting
--    with (both JOINED), or people the caller has as friends, filtered by the same token rule
--    as search_catalog_wines. The add-wine search ranks them first, so the second person at a
--    tasting finds the first person's entry. SECURITY INVOKER over "participants read",
--    "friendships read own" and "catalog read", and again never a blind_pending row.
--
-- Every new function: authenticated and service_role EXECUTE only (PUBLIC and anon revoked).
-- No begin/commit: the applier owns the transaction.

-- ---------------------------------------------------------------------------
-- Pre-state
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  if to_regprocedure('public.catalog_wine_near_matches(uuid,text,uuid,text,integer)') is not null
     or to_regprocedure('public.similar_producers(text,uuid,integer)') is not null
     or to_regprocedure('public.recent_circle_catalog_wines(text,integer,integer)') is not null then
    raise exception '20261003100000: an object of this migration already exists';
  end if;

  -- The identity lookup is replaced from its live definition (20260914126500); stop if it changed.
  select md5(replace(p.prosrc, chr(13), '')) || '|' || p.prosecdef::text || '|' || p.provolatile::text || '|' || p.proconfig::text
    into v_text
  from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_identity_match(jsonb)');
  if v_text is distinct from '763eb9a53dcb0ebb4dbeaf0c92073f35|true|s|{search_path=public}' then
    raise exception '20261003100000: catalog_wine_identity_match is not the live definition: %', v_text;
  end if;

  -- find_or_create_catalog_wine calls it and is not touched.
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.find_or_create_catalog_wine(jsonb)');
  if v_text is distinct from '0e9e2f1142635473eb916125611ed7ef' then
    raise exception '20261003100000: find_or_create_catalog_wine is not the live definition: %', v_text;
  end if;

  -- pg_trgm's similarity() and % live in public on this project.
  if to_regprocedure('public.similarity(text,text)') is null then
    raise exception '20261003100000: public.similarity(text,text) (pg_trgm) is missing';
  end if;

  perform set_config('blindr.near_identity_before',
    (select count(*)::text from catalog_wines c where c.merged_into is null), true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. The identity lookup folds accents for rows the caller already reads
-- ---------------------------------------------------------------------------
create or replace function public.catalog_wine_identity_match(p jsonb)
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
    and c.appellation_id = (p->>'appellation_id')::uuid
    and c.colour = (p->>'colour')::wine_colour
    and c.vintage_kind = (p->>'vintage_kind')::vintage_kind
    and c.vintage_year is not distinct from (p->>'vintage_year')::int
    and c.vintage_tawny_years is not distinct from (p->>'vintage_tawny_years')::int
    and (
      coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')
      or ((not c.blind_pending or c.created_by = auth.uid())
          and public.f_search_norm(c.wine_name) = public.f_search_norm(p->>'wine_name'))
    )
  order by (coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')) desc,
           c.created_at,
           c.id
  limit 1;
$$;

revoke all on function public.catalog_wine_identity_match(jsonb) from public, anon;
grant execute on function public.catalog_wine_identity_match(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Near matches
-- ---------------------------------------------------------------------------
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
  name_score real
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
         c.created_at, c.strength, c.score
  from cands c
  join producers pr on pr.id = c.producer_id
  left join appellations ap on ap.id = c.appellation_id
  left join grapes g on g.id = c.primary_grape_id
  where c.score >= 0.3
  order by c.strength desc, c.score desc, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.catalog_wine_near_matches(uuid, text, uuid, text, int) from public, anon;
grant execute on function public.catalog_wine_near_matches(uuid, text, uuid, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Similar producers
-- ---------------------------------------------------------------------------
create function public.similar_producers(p_name text, p_region_id uuid, p_limit int default 5)
returns table (
  id uuid,
  name text,
  region_id uuid,
  region_name text,
  in_region boolean,
  wine_count int,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.id, p.name, p.region_id, r.name,
         coalesce(p_region_id is not null and p.region_id = p_region_id, false),
         (select count(*) from catalog_wines w
           where w.producer_id = p.id and w.merged_into is null and not w.blind_pending)::int,
         public.similarity(public.f_unaccent(p.name), public.f_unaccent(coalesce(p_name, '')))
  from producers p
  left join regions r on r.id = p.region_id
  where length(public.f_search_norm(p_name)) >= 4
    and public.f_search_norm(p.name) <> public.f_search_norm(p_name)
    and public.f_unaccent(p.name) % public.f_unaccent(coalesce(p_name, ''))
    and public.similarity(public.f_unaccent(p.name), public.f_unaccent(coalesce(p_name, ''))) >= 0.45
  order by 5 desc, 7 desc, 6 desc, p.name, p.id
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

revoke all on function public.similar_producers(text, uuid, int) from public, anon;
grant execute on function public.similar_producers(text, uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Recent wines from the caller's circle
-- ---------------------------------------------------------------------------
create function public.recent_circle_catalog_wines(p_query text, p_hours int default 24, p_limit int default 10)
returns table (
  id uuid,
  wine_name text,
  producer text,
  appellation text,
  region text,
  country text,
  colour wine_colour,
  style wine_style,
  vintage_kind vintage_kind,
  vintage_year int,
  vintage_tawny_years int,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select btrim(coalesce(p_query, '')) as raw),
  circle as (
    select auth.uid() as user_id
    union
    select other.user_id
      from tasting_participants mine
      join tasting_participants other on other.tasting_id = mine.tasting_id
     where mine.user_id = auth.uid() and mine.status = 'JOINED' and other.status = 'JOINED'
    union
    select f.friend_id from friendships f where f.user_id = auth.uid()
  )
  select
    c.id, c.wine_name, pr.name, ap.name, rg.name, co.name, c.colour, c.style,
    c.vintage_kind, c.vintage_year, c.vintage_tawny_years, c.created_at
  from catalog_wines c
  left join producers pr on pr.id = c.producer_id
  left join appellations ap on ap.id = c.appellation_id
  left join regions rg on rg.id = c.region_id
  left join countries co on co.id = c.country_id
  cross join q
  where auth.uid() is not null
    and c.merged_into is null
    and not c.blind_pending
    and c.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 72))
    and c.created_by in (select circle.user_id from circle)
    and q.raw <> ''
    and (
      select bool_and(
        public.f_search_norm(
          coalesce(pr.name, '') || ' ' || coalesce(c.wine_name, '') || ' '
            || coalesce(ap.name, '') || ' ' || coalesce(rg.name, '') || ' '
            || coalesce(co.name, '') || ' ' || coalesce(c.vintage_year::text, '') || ' '
            || coalesce((
                 select string_agg(g.name, ' ')
                   from catalog_wine_grapes cwg
                   join grapes g on g.id = cwg.grape_id
                  where cwg.catalog_wine_id = c.id
               ), '')
        ) like '%' || public.f_search_norm(tok) || '%'
      )
      from regexp_split_to_table(q.raw, '\s+') as tok
      where public.f_search_norm(tok) <> ''
    )
  order by c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke all on function public.recent_circle_catalog_wines(text, int, int) from public, anon;
grant execute on function public.recent_circle_catalog_wines(text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_any uuid;
  v_id uuid;
  v_payload jsonb;
begin
  -- Attributes and EXECUTE of every function this file creates or replaces.
  for v_fn in
    select s.sig, s.secdef, p.oid, p.prosecdef, p.provolatile::text as vol, p.proconfig::text as cfg,
           has_function_privilege('anon', p.oid, 'execute') as anon_x,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
           has_function_privilege('service_role', p.oid, 'execute') as svc_x,
           exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_x
    from (values
      ('public.catalog_wine_identity_match(jsonb)', true),
      ('public.catalog_wine_near_matches(uuid,text,uuid,text,integer)', false),
      ('public.similar_producers(text,uuid,integer)', false),
      ('public.recent_circle_catalog_wines(text,integer,integer)', false)
    ) as s (sig, secdef)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
  loop
    if v_fn.oid is null then raise exception '% is missing post-migration', v_fn.sig; end if;
    if v_fn.prosecdef is distinct from v_fn.secdef or v_fn.vol <> 's' then
      raise exception '% has security definer % / volatility %', v_fn.sig, v_fn.prosecdef, v_fn.vol;
    end if;
    if v_fn.anon_x or v_fn.public_x or not v_fn.auth_x or not v_fn.svc_x then
      raise exception '% EXECUTE is wrong: anon %, public %, authenticated %, service_role %',
        v_fn.sig, v_fn.anon_x, v_fn.public_x, v_fn.auth_x, v_fn.svc_x;
    end if;
  end loop;

  -- The lookup still answers every live row with itself (the exact branch first), so no
  -- existing identity moves to another row.
  select c.id into v_any
  from catalog_wines c
  where c.merged_into is null
    and public.catalog_wine_identity_match(jsonb_build_object(
          'producer_id', c.producer_id, 'wine_name', c.wine_name, 'appellation_id', c.appellation_id,
          'colour', c.colour, 'vintage_kind', c.vintage_kind, 'vintage_year', c.vintage_year,
          'vintage_tawny_years', c.vintage_tawny_years)) is distinct from c.id
  limit 1;
  if v_any is not null then
    raise exception '20261003100000: catalog_wine_identity_match no longer answers live row % with itself', v_any;
  end if;

  -- An accent-only variant of a public row resolves to that row (with no session, as the
  -- migration runs, auth.uid() is null: only the not-blind_pending half can admit it).
  select c.id, jsonb_build_object(
           'producer_id', c.producer_id,
           'wine_name', upper(c.wine_name) || '.',
           'appellation_id', c.appellation_id, 'colour', c.colour, 'vintage_kind', c.vintage_kind,
           'vintage_year', c.vintage_year, 'vintage_tawny_years', c.vintage_tawny_years)
    into v_id, v_payload
  from catalog_wines c
  where c.merged_into is null and not c.blind_pending and public.f_search_norm(c.wine_name) <> ''
  order by c.created_at, c.id
  limit 1;
  if v_id is not null and public.catalog_wine_identity_match(v_payload) is distinct from v_id then
    raise exception '20261003100000: a case/punctuation variant of % did not resolve to it', v_id;
  end if;

  -- A hidden row is never matched by the folded half for someone who is not its creator.
  select c.id, jsonb_build_object(
           'producer_id', c.producer_id,
           'wine_name', upper(c.wine_name) || '.',
           'appellation_id', c.appellation_id, 'colour', c.colour, 'vintage_kind', c.vintage_kind,
           'vintage_year', c.vintage_year, 'vintage_tawny_years', c.vintage_tawny_years)
    into v_id, v_payload
  from catalog_wines c
  where c.merged_into is null and c.blind_pending and public.f_search_norm(c.wine_name) <> ''
    and lower(btrim(c.wine_name)) <> lower(btrim(upper(c.wine_name) || '.'))
  limit 1;
  if v_id is not null and public.catalog_wine_identity_match(v_payload) is not distinct from v_id then
    raise exception '20261003100000: the folded half matched hidden row % without a session', v_id;
  end if;

  -- The near-match list never carries a hidden or merged row.
  if exists (
    select 1
    from catalog_wines c
    cross join lateral public.catalog_wine_near_matches(c.producer_id, null, c.region_id, c.wine_name, 50) m
    join catalog_wines x on x.id = m.id
    where x.blind_pending or x.merged_into is not null
  ) then
    raise exception '20261003100000: catalog_wine_near_matches returned a hidden or merged row';
  end if;

  -- With no session the circle is empty.
  if exists (select 1 from public.recent_circle_catalog_wines('a', 72, 20)) then
    raise exception '20261003100000: recent_circle_catalog_wines answered without a session';
  end if;

  if (select count(*)::text from catalog_wines c where c.merged_into is null)
     is distinct from current_setting('blindr.near_identity_before', true) then
    raise exception '20261003100000: the live catalog row count changed inside this migration';
  end if;
end $$;
