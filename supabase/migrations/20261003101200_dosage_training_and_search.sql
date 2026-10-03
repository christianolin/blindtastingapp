-- The sparkling dosage, two readers that only knew the type designation
-- (review of catalog-dedupe, 2026-10-03). Applies after 20261003101000_catalog_dosage,
-- which adds catalog_wines.dosage_designation_id and moves the four legacy rows' "Brut"
-- and "Brut Nature" out of type_designation_id, and before
-- 20261003101500_corpinnat_appellation.
--
-- 1. record_training_attempt (training room). Its designation category, and D17's
--    actual-archetype tie-break, compared the archetype's designations with
--    catalog_wines.type_designation_id alone. Eight wine_archetype_designations rows are
--    dosages (Champagne Brut; Vouvray Sec, Demi-Sec; Prosecco Brut, Extra Dry;
--    Franciacorta Brut; Cava Brut, Brut Nature). Once 101000 moves a sparkling wine's
--    dosage out of the type designation, a reveal of Veuve Clicquot "Brut Yellow Label"
--    (bc89a662) would lose the category (possible points down by 2) and those eight rows
--    could never match again. Both comparisons now take the type designation OR the
--    dosage. Nothing else in the body changes: it is the live body (md5 below, the
--    20260927100000 file byte for byte) with those two comparisons widened, recreated
--    with the same attributes and EXECUTE (owner and authenticated only). A wine that
--    still has its dosage as its type designation scores exactly as before; a wine with
--    a dosage and no type designation scores as it did before 101000 moved it. Training
--    is not the blind-tasting game: reveal_wine and score_own_guess are not touched, and
--    training_attempts holds 0 rows today (asserted), so nothing stored changes.
--
-- 2. search_catalog_wines (the catalog search the add-wine sheet runs). Its search
--    text gains the dosage's name and its label spellings, so "brut nature" or "semi
--    seco" finds the Cava that carries it. Additive only: the same columns, order,
--    limit and SECURITY INVOKER (RLS still decides which rows a caller reads; the join
--    is to type_designations, a public reference table). The spellings are dosage.ts's
--    dosageSearchTerms, pinned by src/lib/wine-identity/dosage-search-sql.test.ts.
--
-- Rule 1: neither function reads or writes a tasting, glass, guess or answer key.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

do $$
declare
  v_text text;
begin
  -- 101000 is in: the dosage column and its FK exist.
  if not exists (select 1 from pg_attribute
                 where attrelid = 'public.catalog_wines'::regclass and attname = 'dosage_designation_id'
                   and not attisdropped) then
    raise exception '20261003101200: catalog_wines.dosage_designation_id is missing; apply 20261003101000 first';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261003101000') then
    raise exception '20261003101200: 20261003101000 is not recorded';
  end if;

  -- The two bodies this file recreates, as read live on 2026-10-03.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.record_training_attempt(jsonb,jsonb,jsonb)', 'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.search_catalog_wines(text,integer)',         '493c7f85508a7c73278f6ea92fe9eb06')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception '20261003101200: % differs from the live body this file was written against', v_text;
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('record_training_attempt', 'search_catalog_wines')) <> 2 then
    raise exception '20261003101200: an extra overload of record_training_attempt or search_catalog_wines exists';
  end if;

  -- What the training reveal scores against: the eight dosage rows of the archetypes,
  -- and no attempt yet (so no stored score changes).
  if (select count(*) from wine_archetype_designations d
        join type_designations t on t.id = d.type_designation_id
       where t.category = 'Sparkling Dosage') <> 8 then
    raise exception '20261003101200: expected 8 archetype dosage rows';
  end if;
  if (select count(*) from training_attempts) <> 0 then
    raise exception '20261003101200: training_attempts is no longer empty; re-check that no stored score depends on this';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. record_training_attempt: the live body with the designation category and
--    D17's tie-break comparing the type designation or the dosage.
-- ---------------------------------------------------------------------------

create or replace function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- The championship maxima (spec D7); the DB suite pins each to reveal_wine's.
  c_country constant smallint := 2;
  c_region constant smallint := 3;
  c_appellation constant smallint := 5;
  c_primary_grape constant smallint := 8;
  c_secondary_grape constant smallint := 2;
  c_type_designation constant smallint := 2;
  c_vintage constant smallint := 2;
  c_vintage_near constant smallint := 1;
  v_uid uuid := auth.uid();
  v_attempt training_attempts%rowtype;
  v_attempt_id uuid;
  v_session uuid;
  v_started timestamptz;
  v_wine_id uuid;
  v_wine catalog_wines%rowtype;
  v_pick_id uuid;
  v_pick wine_archetypes%rowtype;
  v_has_pick boolean := false;
  -- A pick that stopped at the region (region-guess addendum R6, R7).
  v_region_pick_id uuid;
  v_grape_pick_id uuid;
  v_region_country uuid;
  v_has_region boolean := false;
  v_note jsonb;
  v_hue wset_colour_hue;
  v_identities int;
  v_cleared boolean := false;
  v_note_id uuid;
  v_kind vintage_kind;
  v_score boolean := false;
  v_country smallint;
  v_region smallint;
  v_appellation smallint;
  v_primary smallint;
  v_secondary smallint;
  v_designation smallint;
  v_vintage smallint;
  v_actual uuid;
begin
  -- 1. Signed in.
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object' then
    raise exception 'the attempt must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_attempt_id := nullif(p_attempt ->> 'attempt_id', '')::uuid;
  v_wine_id := nullif(p_attempt ->> 'actual_catalog_wine_id', '')::uuid;
  if v_wine_id is not null then
    -- Read as the definer: "catalog read" may hide a blind_pending row from
    -- the caller, and the score is still computed (step 4).
    select * into v_wine from catalog_wines where id = v_wine_id;
    if not found then
      raise exception 'no such wine' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if v_attempt_id is null then
    -- 2. A fresh attempt, idempotent on (caller, session key): a second tab
    --    or a reload returns the first attempt unchanged.
    v_session := nullif(p_attempt ->> 'session_key', '')::uuid;
    if v_session is null then
      raise exception 'a session key is required' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('training-session:' || v_uid::text || ':' || v_session::text, 0));
    select * into v_attempt from training_attempts where author_id = v_uid and session_key = v_session;
    if not found then
      if p_note is null or jsonb_typeof(p_note) <> 'object' then
        raise exception 'the note must be an object' using errcode = 'invalid_parameter_value';
      end if;
      if nullif(p_note ->> 'id', '') is not null then
        raise exception 'a new session takes no note id' using errcode = 'insufficient_privilege';
      end if;
      if p_aromas is not null and jsonb_typeof(p_aromas) <> 'array' then
        raise exception 'the aromas must be a list' using errcode = 'invalid_parameter_value';
      end if;
      if jsonb_typeof(coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)) <> 'array' then
        raise exception 'the ranking must be a list' using errcode = 'invalid_parameter_value';
      end if;
      v_pick_id := nullif(p_attempt ->> 'picked_archetype_id', '')::uuid;
      if v_pick_id is not null and not exists (select 1 from wine_archetypes where id = v_pick_id) then
        raise exception 'no such typical wine' using errcode = 'invalid_parameter_value';
      end if;
      -- A region pick, optionally with a grape. The table's checks refuse a
      -- typical wine and a region together, and a grape without a region.
      v_region_pick_id := nullif(p_attempt ->> 'picked_region_id', '')::uuid;
      if v_region_pick_id is not null and not exists (select 1 from regions where id = v_region_pick_id) then
        raise exception 'no such region' using errcode = 'invalid_parameter_value';
      end if;
      v_grape_pick_id := nullif(p_attempt ->> 'picked_grape_id', '')::uuid;
      if v_grape_pick_id is not null and not exists (select 1 from grapes where id = v_grape_pick_id) then
        raise exception 'no such grape' using errcode = 'invalid_parameter_value';
      end if;
      v_started := coalesce(nullif(p_attempt ->> 'started_at', '')::timestamptz, now());
      v_hue := nullif(p_note ->> 'colour_hue', '')::wset_colour_hue;
      v_note := (p_note - 'id') || jsonb_build_object(
        'context_kind', 'TRAINING',
        'tasting_wine_id', null,
        'unidentified_wine_id', null,
        'catalog_wine_id', v_wine_id,
        'tasted_on', (v_started at time zone 'UTC')::date);
      -- 2b. A hue that does not fit the revealed wine's colour would be refused
      --     by wset_notes_check_hue: drop it from the note, keep it on the attempt.
      if v_wine_id is not null and not wset_hue_fits_colour(v_hue, v_wine.colour) then
        v_note := jsonb_set(v_note, '{colour_hue}', 'null'::jsonb);
        v_cleared := true;
      end if;
      v_note_id := save_wset_note(v_note, coalesce(p_aromas, '[]'::jsonb));
      v_kind := nullif(p_attempt ->> 'guessed_vintage_kind', '')::vintage_kind;
      insert into training_attempts (
        author_id, session_key, note_id, picked_archetype_id, picked_region_id, picked_grape_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id, v_region_pick_id, v_grape_pick_id,
        v_kind,
        case when v_kind = 'YEAR' then (p_attempt ->> 'guessed_vintage_year')::smallint end,
        case when v_kind = 'TAWNY' then (p_attempt ->> 'guessed_vintage_tawny_years')::smallint end,
        v_hue, v_cleared, coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)
      )
      returning * into v_attempt;
      v_score := v_wine_id is not null;
    end if;
  else
    -- 3. A re-reveal of the caller's own unscored attempt: only the note's
    --    identity and the score are written; p_note, p_aromas, the pick, the
    --    vintage and the ranking are ignored.
    select * into v_attempt from training_attempts
     where id = v_attempt_id and author_id = v_uid
     for update;
    if not found then
      raise exception 'that session is not yours' using errcode = 'insufficient_privilege';
    end if;
    if v_attempt.scored_at is not null then
      raise exception 'already revealed' using errcode = 'P0001';
    end if;
    if v_wine_id is null then
      raise exception 'name the wine to reveal' using errcode = 'invalid_parameter_value';
    end if;
    select n.colour_hue, num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id)
      into v_hue, v_identities
      from wset_notes n where n.id = v_attempt.note_id
     for update;
    if v_identities = 0 then
      v_cleared := not wset_hue_fits_colour(v_hue, v_wine.colour);
      update wset_notes
         set catalog_wine_id = v_wine_id,
             colour_hue = case when wset_hue_fits_colour(colour_hue, v_wine.colour) then colour_hue end
       where id = v_attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
    end if;
    v_score := true;
  end if;

  -- 4. Score against the named wine with the picked archetype's FKs, grapes
  --    and designations, or with the picked region's own FKs and the picked
  --    grape; no pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    if not v_has_pick and v_attempt.picked_region_id is not null then
      select r.country_id into v_region_country from regions r where r.id = v_attempt.picked_region_id;
      v_has_region := found;
    end if;
    v_country := case
      when v_has_pick and v_pick.country_id = v_wine.country_id then c_country
      when v_has_region and v_region_country = v_wine.country_id then c_country
      else 0
    end;
    v_region := case
      when v_has_pick and v_pick.region_id = v_wine.region_id then c_region
      when v_has_region and v_attempt.picked_region_id = v_wine.region_id then c_region
      else 0
    end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case
      when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape
      when v_has_region and v_attempt.picked_grape_id = v_wine.primary_grape_id then c_primary_grape
      else 0
    end;
    v_secondary := case
      when v_wine.secondary_grape_id is null then null
      when v_has_pick and v_pick.secondary_grape_id = v_wine.secondary_grape_id then c_secondary_grape
      else 0
    end;
    -- The designation category: the wine's type designation or, for a sparkling
    -- wine, its dosage (20261003101000 moved the dosages out of the type
    -- designation; the archetypes' Brut, Brut Nature, Sec … rows still match it).
    v_designation := case
      when v_wine.type_designation_id is null and v_wine.dosage_designation_id is null then null
      when v_has_pick and exists (select 1 from wine_archetype_designations d
                                   where d.archetype_id = v_pick.id
                                     and d.type_designation_id in (v_wine.type_designation_id,
                                                                   v_wine.dosage_designation_id)) then c_type_designation
      else 0
    end;
    -- reveal_wine's vintage rule; null when no vintage was guessed.
    v_vintage := case
      when v_attempt.guessed_vintage_kind is null then null
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'NV' then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'TAWNY'
        and v_attempt.guessed_vintage_tawny_years = v_wine.vintage_tawny_years then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and v_attempt.guessed_vintage_year = v_wine.vintage_year then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and abs(v_attempt.guessed_vintage_year - v_wine.vintage_year) = 1 then c_vintage_near
      else 0
    end;
    -- D17: the wine's own style. Same appellation, colour and style; else same
    -- region, primary grape, colour and style. Ties: the wine's designation,
    -- then the taster's pick, then an equal second grape, sort_order, id.
    select a.id into v_actual
      from wine_archetypes a
     where a.colour = v_wine.colour and a.style = v_wine.style
       and (a.appellation_id = v_wine.appellation_id
            or (a.region_id = v_wine.region_id and a.primary_grape_id = v_wine.primary_grape_id))
     order by (a.appellation_id = v_wine.appellation_id) desc,
              exists (select 1 from wine_archetype_designations d
                       where d.archetype_id = a.id
                         and d.type_designation_id in (v_wine.type_designation_id,
                                                       v_wine.dosage_designation_id)) desc,
              (a.id is not distinct from v_attempt.picked_archetype_id) desc,
              (a.secondary_grape_id is not distinct from v_wine.secondary_grape_id) desc,
              a.sort_order,
              a.id
     limit 1;
    update training_attempts
       set actual_catalog_wine_id = v_wine_id,
           actual_archetype_id = v_actual,
           hue_cleared = v_cleared,
           country_points = v_country,
           region_points = v_region,
           appellation_points = v_appellation,
           primary_grape_points = v_primary,
           secondary_grape_points = v_secondary,
           type_designation_points = v_designation,
           vintage_points = v_vintage,
           total_points = v_country + v_region + v_appellation + v_primary
             + coalesce(v_secondary, 0) + coalesce(v_designation, 0) + coalesce(v_vintage, 0),
           possible_points = c_country + c_region + c_appellation + c_primary_grape
             + case when v_secondary is null then 0 else c_secondary_grape end
             + case when v_designation is null then 0 else c_type_designation end
             + case when v_vintage is null then 0 else c_vintage end,
           scored_at = now()
     where id = v_attempt.id
    returning * into v_attempt;
  end if;

  -- 5. The attempt as stored.
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'note_id', v_attempt.note_id,
    'points', jsonb_build_object(
      'country', v_attempt.country_points,
      'region', v_attempt.region_points,
      'appellation', v_attempt.appellation_points,
      'primary_grape', v_attempt.primary_grape_points,
      'secondary_grape', v_attempt.secondary_grape_points,
      'type_designation', v_attempt.type_designation_points,
      'vintage', v_attempt.vintage_points),
    'total', v_attempt.total_points,
    'possible', v_attempt.possible_points,
    'actual_archetype_id', v_attempt.actual_archetype_id,
    'hue_cleared', v_attempt.hue_cleared);
end $$;

create or replace function public.search_catalog_wines(p_query text, p_limit int default 20)
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
  vintage_tawny_years int
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select btrim(coalesce(p_query, '')) as raw)
  select
    c.id, c.wine_name, pr.name as producer, ap.name as appellation,
    rg.name as region, co.name as country, c.colour, c.style,
    c.vintage_kind, c.vintage_year, c.vintage_tawny_years
  from catalog_wines c
  left join producers pr on pr.id = c.producer_id
  left join appellations ap on ap.id = c.appellation_id
  left join regions rg on rg.id = c.region_id
  left join countries co on co.id = c.country_id
  left join type_designations ds on ds.id = c.dosage_designation_id
  cross join q
  where c.merged_into is null
    and (
      q.raw = ''
      or (
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
              -- The dosage and its label spellings (20261003101200), so "brut nature"
              -- or "semi seco" finds a Cava that carries it.
              || ' ' || coalesce(case ds.name
                   when 'Brut Nature' then 'Brut Nature Pas dosé Non dosé Non dosato Dosage zéro Zero dosage Dosaggio zero Brut zero Brut Natur Bruto natural Naturherb'
                   when 'Extra Brut' then 'Extra Brut Extra herb'
                   when 'Brut' then 'Brut'
                   when 'Extra Dry' then 'Extra Dry Extra seco Extra sec Extra secco Extra trocken'
                   when 'Sec' then 'Sec Seco Secco Asciutto'
                   when 'Demi-Sec' then 'Demi-Sec Semiseco Semi-seco Semi-sec Abboccato'
                   when 'Doux' then 'Doux Dulce Dolce'
                 end, '')
          ) like '%' || public.f_search_norm(tok) || '%'
        )
        from regexp_split_to_table(q.raw, '\s+') as tok
        where public.f_search_norm(tok) <> ''
      )
    )
  order by pr.name, c.wine_name, c.vintage_year nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- create or replace keeps both ACLs; restated for record_training_attempt as
-- 20260927100000 did. search_catalog_wines' ACL is left exactly as it is (asserted).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_wine record;
begin
  -- 1. record_training_attempt: attributes, the body this file wrote, EXECUTE.
  if not exists (select 1 from pg_proc p
                 join pg_language l on l.oid = p.prolang
                 where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
                   and p.prosecdef and p.proconfig::text = '{search_path=public}' and p.provolatile = 'v'
                   and l.lanname = 'plpgsql' and format_type(p.prorettype, null) = 'jsonb' and not p.proretset
                   and pg_get_function_identity_arguments(p.oid) = 'p_note jsonb, p_aromas jsonb, p_attempt jsonb') then
    raise exception '20261003101200: record_training_attempt attributes changed';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure;
  if v_text is distinct from '7bda8fa8c4f957c925df607f73f5d962' then
    raise exception '20261003101200: record_training_attempt body is not the one this file wrote (md5 %)', v_text;
  end if;
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from (select distinct case when a.grantee = 0 then 'PUBLIC'
                             when a.grantee = p.proowner then 'OWNER'
                             else pg_get_userbyid(a.grantee)::text end as g
        from pg_proc p, aclexplode(p.proacl) a
        where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
          and a.privilege_type = 'EXECUTE') x;
  if v_text is distinct from 'OWNER,authenticated' then
    raise exception '20261003101200: record_training_attempt EXECUTE is held by %, expected OWNER,authenticated', v_text;
  end if;

  -- 2. search_catalog_wines: same signature, result columns, attributes and ACL;
  --    the body this file wrote.
  if not exists (select 1 from pg_proc p
                 join pg_language l on l.oid = p.prolang
                 where p.oid = 'public.search_catalog_wines(text,integer)'::regprocedure
                   and not p.prosecdef and p.provolatile = 's' and l.lanname = 'sql'
                   and p.proconfig::text = '{"search_path=public, extensions"}'
                   and pg_get_function_result(p.oid) =
                       'TABLE(id uuid, wine_name text, producer text, appellation text, region text, country text, '
                       || 'colour wine_colour, style wine_style, vintage_kind vintage_kind, vintage_year integer, '
                       || 'vintage_tawny_years integer)') then
    raise exception '20261003101200: search_catalog_wines attributes or result columns changed';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = 'public.search_catalog_wines(text,integer)'::regprocedure;
  if v_text is distinct from 'ade1e462c7eaa4cb2aca470e2ec6c490' then
    raise exception '20261003101200: search_catalog_wines body is not the one this file wrote (md5 %)', v_text;
  end if;
  select p.proacl::text into v_text from pg_proc p
   where p.oid = 'public.search_catalog_wines(text,integer)'::regprocedure;
  if v_text is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception '20261003101200: search_catalog_wines ACL changed: %', v_text;
  end if;

  -- 3. Behaviour of the search, as the table owner: every live sparkling wine with a
  --    dosage is found by its producer plus its dosage's name, and still by its
  --    producer alone (additive: no row a search used to find is lost).
  for v_wine in
    select c.id, pr.name as producer, ds.name as dosage
      from catalog_wines c
      join producers pr on pr.id = c.producer_id
      join type_designations ds on ds.id = c.dosage_designation_id
     where c.merged_into is null
  loop
    if not exists (select 1 from public.search_catalog_wines(v_wine.producer || ' ' || v_wine.dosage, 50) s
                    where s.id = v_wine.id) then
      raise exception '20261003101200: "% %" does not find %', v_wine.producer, v_wine.dosage, v_wine.id;
    end if;
  end loop;

  raise notice '20261003101200: record_training_attempt md5 %, search_catalog_wines md5 %',
    (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure),
    (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = 'public.search_catalog_wines(text,integer)'::regprocedure);
end $$;
