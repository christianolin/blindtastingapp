-- USA on the wine map, phase US-2: the promote (spec §8.4, §15; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 9).
--
-- Re-checks, in SQL, every domain invariant the stage asserted, then flips the
-- 16 US-2 places to VERIFIED and their boundaries to VALIDATED + current in one
-- transaction. The country flips with the states (D12), or every release would
-- fail assertMultiCountryArchive. Stores the one ALTERNATE_PARENT edge (§8.3).
-- Ends with the neighbour refresh (standing rule), which must return >= 0.
--
-- Precondition: scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage
-- has committed exactly one DRAFT, non-current boundary per place, and the
-- catalog (20260930084747) and knowledge (20260930094747) migrations are applied.
-- Rendered by scripts/usa-map/render-us2-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us2_promote, pg_temp._us2_edges, pg_temp._us2_staged;
create temp table _us2_promote (
  key text primary key, kind text not null, role text not null, ucd_ava_id text,
  legal_keys text[] not null, outline boolean not null, members text[]
) on commit drop;
insert into _us2_promote values
  ('united-states', 'COUNTRY', 'ne-country', null, '{}', false, null),
  ('united-states.california', 'REGION', 'ne-state', null, '{}', false, null),
  ('united-states.california.central-coast', 'SUBREGION', 'ucd', 'central_coast', '{united-states.california}', true, null),
  ('united-states.california.central-valley', 'SUBREGION', 'derived', null, '{united-states.california}', true, '{capay_valley,clarksburg,diablo_grande,dunnigan_hills,lodi,madera,paulsell_valley,river_junction,salado_creek,tracy_hills,winters_highlands}'),
  ('united-states.california.north-coast', 'SUBREGION', 'ucd', 'north_coast', '{united-states.california}', true, null),
  ('united-states.california.sierra-foothills', 'SUBREGION', 'ucd', 'sierra_foothills', '{united-states.california}', true, null),
  ('united-states.california.south-coast', 'SUBREGION', 'ucd', 'south_coast', '{united-states.california}', true, null),
  ('united-states.new-york', 'REGION', 'ne-state', null, '{}', false, null),
  ('united-states.new-york.finger-lakes', 'SUBREGION', 'ucd', 'finger_lakes', '{united-states.new-york}', true, null),
  ('united-states.new-york.long-island', 'SUBREGION', 'ucd', 'long_island', '{united-states.new-york}', false, null),
  ('united-states.oregon', 'REGION', 'ne-state', null, '{}', false, null),
  ('united-states.oregon.southern-oregon', 'SUBREGION', 'ucd', 'southern_oregon', '{united-states.oregon}', true, null),
  ('united-states.oregon.willamette-valley', 'SUBREGION', 'ucd', 'willamette_valley', '{united-states.oregon}', true, null),
  ('united-states.washington', 'REGION', 'ne-state', null, '{}', false, null),
  ('united-states.washington.columbia-valley', 'SUBREGION', 'ucd', 'columbia_valley', '{united-states.oregon,united-states.washington}', true, null),
  ('united-states.washington.puget-sound', 'SUBREGION', 'ucd', 'puget_sound', '{united-states.washington}', true, null);
create temp table _us2_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, note text not null
) on commit drop;
insert into _us2_edges values
  ('united-states.washington.columbia-valley', 'united-states.oregon', 'ALTERNATE_PARENT', 'US-2 tree report: basis state_share, share 0.224 (TTB lists OR and WA)');

-- 1. Pre-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where canonical_key = 'united-states' or canonical_key like 'united-states.%';
  if n <> 16 then raise exception 'US-2 promote: expected 16 united-states places, found %', n; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-2 promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-2 promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --stage first): %', v_text;
  end if;
end $$;

create temp table _us2_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us2_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text;
begin
  select count(*) into n from _us2_staged;
  if n <> 16 then raise exception 'US-2 promote: % staged rows, expected 16', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged where not (
       (role = 'ne-country' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id = 'ne_50m_admin_0_countries_lakes:USA' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ne-state' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id like 'ne_50m_admin_1_states_provinces_lakes:US-%' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ucd' and method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA'
        and feature_id = ucd_ava_id and gp->>'engine' = 'ucd-ava-digitization'
        and gp->>'crs_in' = 'EPSG:4269' and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity')
    or (role = 'derived' and method = 'DERIVED_FROM_DESCENDANTS' and ns = 'UCD_TTB_AVA'
        and feature_id = 'derived:' || split_part(key, '.', 3) and gp->>'engine' = 'ucd-ava-derived-union'
        and array(select jsonb_array_elements_text(gp->'members') order by 1) = members));
  if v_text is not null then raise exception 'US-2 promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between -125.5 and -66.5
      or extensions.ST_Y(label_point) not between 24 and 49.5;
  if v_text is not null then raise exception 'US-2 promote: invalid geometry or label outside the United States box: %', v_text; end if;

  -- D15: the outline set is exactly the AVA places of 5,000 km² or more, plus Central Valley.
  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or (role in ('ne-country', 'ne-state') and gp ? 'display')
      or (role = 'ucd' and outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000));
  if v_text is not null then raise exception 'US-2 promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us2_staged where gp->>'display' = 'outline';
  if n <> 10 then raise exception 'US-2 promote: % outline places, expected 10', n; end if;

  -- §8.2 state containment, on land and buffered: the share of each AVA-based
  -- place's land (land = inside the staged lower-48 outline, buffered) that
  -- lies inside its legal states' staged outlines, buffered.
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us2_staged st
               where st.role = 'ne-state' and st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(c.g, 0.05) from _us2_staged c where c.role = 'ne-country'))), 0) as share
      from _us2_staged s where s.role in ('ucd', 'derived')) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-2 promote: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- The states lie in the country outline.
  select string_agg(s.key, ', ') into v_text from _us2_staged s, _us2_staged c
   where s.role = 'ne-state' and c.role = 'ne-country'
     and extensions.ST_Area(extensions.ST_Intersection(s.g, extensions.ST_Buffer(c.g, 0.05))) < 0.995 * extensions.ST_Area(s.g);
  if v_text is not null then raise exception 'US-2 promote: state outside the country outline: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (US rule, §8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
   where not exists (select 1 from public.wine_place_articles a where a.wine_place_id = p.id
                       and a.editorial_status = 'PUBLISHED'
                       and length(trim(coalesce(a.description, ''))) >= 40
                       and length(trim(coalesce(a.climate, ''))) >= 40
                       and length(trim(coalesce(a.soils, ''))) >= 40
                       and length(trim(coalesce(a.grape_varieties, ''))) >= 40
                       and length(trim(coalesce(a.wine_styles, ''))) >= 40
                       and cardinality(a.key_facts) >= 3)
      or not exists (select 1 from public.wine_place_styles s where s.wine_place_id = p.id and s.editorial_status = 'PUBLISHED')
      or not exists (select 1 from public.wine_place_grapes g where g.wine_place_id = p.id and g.editorial_status = 'PUBLISHED');
  if v_text is not null then raise exception 'US-2 promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text; end if;

  if not exists (select 1 from public.wine_place_articles a join public.wine_places p on p.id = a.wine_place_id
                  where p.canonical_key = 'united-states.california.central-valley'
                    and substring(a.description from '^[^.]*\.') ~* 'not an AVA'
                    and substring(a.description from '^[^.]*\.') ~* 'grouping') then
    raise exception 'US-2 promote: Central Valley''s first sentence must say it is a grouping on this map, not an AVA (D25)';
  end if;
end $$;

-- 4. Flip, and the edge.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us2_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us2_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us2_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
do $$
declare
  t0 timestamptz := clock_timestamp();
  v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice 'US-2 promote: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;

-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where (canonical_key = 'united-states' or canonical_key like 'united-states.%') and publication_status <> 'VERIFIED';
  if n <> 0 then raise exception 'US-2 promote: % united-states places still DRAFT', n; end if;
  select count(*) into n from public.wine_places p join _us2_promote e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if n <> 16 then raise exception 'US-2 promote: % of 16 keys locked', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'united-states%' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 16 then raise exception 'US-2 promote: % current VALIDATED boundaries, expected 16', n; end if;
  select string_agg(format('%s=%s (expected %s)', e.k, coalesce(x.c, 0), e.c), ', ') into v_text
    from (values ('COUNTRY', 1), ('REGION', 4), ('SUBREGION', 11)) e(k, c)
    full join (select p.kind::text k, count(*)::int c from public.wine_places p
                where p.canonical_key like 'united-states%' group by 1) x on x.k = e.k
   where coalesce(x.c, 0) <> coalesce(e.c, 0);
  if v_text is not null then raise exception 'US-2 promote: kind counts off: %', v_text; end if;
  select count(*) into n from public.wine_places where canonical_key like 'united-states.%' and appellation_system = 'AVA';
  if n <> 10 then raise exception 'US-2 promote: % AVA places, expected 10', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where s.canonical_key like 'united-states%' or t.canonical_key like 'united-states%';
  if n <> (select count(*) from _us2_edges) then raise exception 'US-2 promote: % US relationships, expected %', n, (select count(*) from _us2_edges); end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-2 promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
