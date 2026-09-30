-- USA on the wine map, phase US-4: the promote (spec §8.4, §15 US-4;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md Task 11).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the 42 AVAs
-- of Washington, Oregon and New York to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the wave's 4 edges (§8.3). The cross-state
-- rules (D6, D14) are re-checked on the stored geometry: every AVA lies inside
-- its legal states, and every state edge carries the tree's land share. Checks
-- read only the three states' keys, and the country outline as land, so
-- California is never read. Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: the US-2 promote 20260930104747 is live; stage-usa-ava.mjs
-- --wave us4 --stage has committed one DRAFT, non-current boundary per place;
-- 20260930224747 and 20260930234747 are applied.
-- Rendered by scripts/usa-map/render-us4-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us4_promote, pg_temp._us4_prior, pg_temp._us4_edges, pg_temp._us4_staged, pg_temp._us4_geom;
create temp table _us4_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision, legal_keys text[] not null,
  min_lon double precision not null, min_lat double precision not null,
  max_lon double precision not null, max_lat double precision not null
) on commit drop;
insert into _us4_promote values
  ('united-states.new-york.champlain-valley-of-new-york', 'champlain_valley_of_new_york', false, 'united-states.new-york', null, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.finger-lakes.cayuga-lake', 'cayuga_lake', false, 'united-states.new-york.finger-lakes', 0.995, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.finger-lakes.seneca-lake', 'seneca_lake', false, 'united-states.new-york.finger-lakes', 0.995, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.hudson-river-region', 'hudson_river_region', true, 'united-states.new-york', null, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.long-island.north-fork-of-long-island', 'north_fork_of_long_island', false, 'united-states.new-york.long-island', 0.995, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.long-island.the-hamptons-long-island', 'the_hamptons_long_island', false, 'united-states.new-york.long-island', 0.995, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.niagara-escarpment', 'niagara_escarpment', false, 'united-states.new-york', null, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.new-york.upper-hudson', 'upper_hudson', false, 'united-states.new-york', null, '{united-states.new-york}', -79.9, 40.4, -71.7, 45.1),
  ('united-states.oregon.columbia-gorge', 'columbia_gorge', false, 'united-states.oregon', null, '{united-states.oregon,united-states.washington}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.southern-oregon.rogue-valley', 'rogue_valley', false, 'united-states.oregon.southern-oregon', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.southern-oregon.rogue-valley.applegate-valley', 'applegate_valley', false, 'united-states.oregon.southern-oregon.rogue-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.southern-oregon.umpqua-valley', 'umpqua_valley', false, 'united-states.oregon.southern-oregon', 0.9, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon', 'elkton_oregon', false, 'united-states.oregon.southern-oregon.umpqua-valley', 0.9, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon', 'red_hill_douglas_county__oregon', false, 'united-states.oregon.southern-oregon.umpqua-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.the-rocks-district-of-milton-freewater', 'the_rocks_district_of_milton_freewater', false, 'united-states.oregon', null, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.chehalem-mountains', 'chehalem_mountains', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.chehalem-mountains.laurelwood-district', 'laurelwood_district', false, 'united-states.oregon.willamette-valley.chehalem-mountains', 0.9, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.chehalem-mountains.ribbon-ridge', 'ribbon_ridge', false, 'united-states.oregon.willamette-valley.chehalem-mountains', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.dundee-hills', 'dundee_hills', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.eola-amity-hills', 'eola_amity_hills', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.lower-long-tom', 'lower_long_tom', false, 'united-states.oregon.willamette-valley', 0.9, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.mcminnville', 'mcminnville', false, 'united-states.oregon.willamette-valley', 0.9, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.mount-pisgah-polk-county-oregon', 'mount_pisgah__polk_county__oregon', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.tualatin-hills', 'tualatin_hills', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.van-duzer-corridor', 'van_duzer_corridor', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.oregon.willamette-valley.yamhill-carlton', 'yamhill_carlton', false, 'united-states.oregon.willamette-valley', 0.995, '{united-states.oregon}', -124.7, 41.9, -116.4, 46.4),
  ('united-states.washington.columbia-valley.ancient-lakes-of-columbia-valley', 'ancient_lakes_of_columbia_valley', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.horse-heaven-hills', 'horse_heaven_hills', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.lake-chelan', 'lake_chelan', false, 'united-states.washington.columbia-valley', 0.9, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.naches-heights', 'naches_heights', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.rocky-reach', 'rocky_reach', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.royal-slope', 'royal_slope', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.the-burn-of-columbia-valley', 'the_burn_of_columbia_valley', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.wahluke-slope', 'wahluke_slope', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.walla-walla-valley', 'walla_walla_valley', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.oregon,united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.white-bluffs', 'white_bluffs', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley', 'yakima_valley', false, 'united-states.washington.columbia-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley.candy-mountain', 'candy_mountain', false, 'united-states.washington.columbia-valley.yakima-valley', 0.883, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley.goose-gap', 'goose_gap', false, 'united-states.washington.columbia-valley.yakima-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley.rattlesnake-hills', 'rattlesnake_hills', false, 'united-states.washington.columbia-valley.yakima-valley', 0.9, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley.red-mountain', 'red_mountain', false, 'united-states.washington.columbia-valley.yakima-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1),
  ('united-states.washington.columbia-valley.yakima-valley.snipes-mountain', 'snipes_mountain', false, 'united-states.washington.columbia-valley.yakima-valley', 0.995, '{united-states.washington}', -124.9, 45.1, -116.8, 49.1);
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
  ('united-states'),
  ('united-states.new-york'),
  ('united-states.new-york.finger-lakes'),
  ('united-states.new-york.long-island'),
  ('united-states.oregon'),
  ('united-states.oregon.southern-oregon'),
  ('united-states.oregon.willamette-valley'),
  ('united-states.washington'),
  ('united-states.washington.columbia-valley'),
  ('united-states.washington.puget-sound');
create temp table _us4_edges (
  source_key text not null, target_key text not null, type public.wine_place_relationship_type not null,
  basis text not null, ratio double precision, share double precision, note text not null
) on commit drop;
insert into _us4_edges values
  ('united-states.oregon.columbia-gorge', 'united-states.washington', 'ALTERNATE_PARENT', 'state_share', null, 0.348, 'US-4, Oregon tree report: basis state_share, share 0.348'),
  ('united-states.oregon.the-rocks-district-of-milton-freewater', 'united-states.washington.columbia-valley', 'ALTERNATE_PARENT', 'within', null, null, 'US-4, Oregon tree report: basis within'),
  ('united-states.oregon.the-rocks-district-of-milton-freewater', 'united-states.washington.columbia-valley.walla-walla-valley', 'ALTERNATE_PARENT', 'within', null, null, 'US-4, Oregon tree report: basis within'),
  ('united-states.washington.columbia-valley.walla-walla-valley', 'united-states.oregon', 'ALTERNATE_PARENT', 'state_share', null, 0.3101, 'US-4, Washington tree report: basis state_share, share 0.3101');

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception 'US-4 promote: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-4 promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-4 promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave us4 --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where (p.canonical_key = 'united-states.new-york' or p.canonical_key like 'united-states.new-york.%' or p.canonical_key = 'united-states.oregon' or p.canonical_key like 'united-states.oregon.%' or p.canonical_key = 'united-states.washington' or p.canonical_key like 'united-states.washington.%')
     and p.canonical_key not in (select key from _us4_promote union all select key from _us4_prior);
  if v_text is not null then raise exception 'US-4 promote: boundaries on other places under Washington, Oregon or New York: %', v_text; end if;
end $$;

create temp table _us4_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us4_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this wave's staged boundary, else US-2's current one
-- (the country, the three states and their umbrella AVAs).
create temp table _us4_geom on commit drop as
select key, g from _us4_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us4_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_country extensions.geometry; v_land extensions.geometry; r record;
begin
  select count(*) into n from _us4_staged;
  if n <> 42 then raise exception 'US-4 promote: % staged rows, expected 42', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception 'US-4 promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between min_lon and max_lon
      or extensions.ST_Y(label_point) not between min_lat and max_lat;
  if v_text is not null then raise exception 'US-4 promote: invalid geometry or label outside its state''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception 'US-4 promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us4_staged where gp->>'display' = 'outline';
  if n <> 1 then raise exception 'US-4 promote: % outline places, expected 1', n; end if;

  -- §8.2 state containment, on land and buffered, against each AVA's legal (TTB)
  -- states' live outlines (plan decision 5).
  select g into v_country from _us4_geom where key = 'united-states';
  if v_country is null then raise exception 'US-4 promote: the United States outline is not live'; end if;
  v_land := extensions.ST_Buffer(v_country, 0.05);
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us4_geom st where st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us4_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-4 promote: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with US-3's
  -- measured simplification slack (US-4 measured at most 0.000284).
  select count(*) into n from _us4_staged s
   where s.parent_min is not null and not exists (select 1 from _us4_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception 'US-4 promote: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us4_staged s join _us4_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception 'US-4 promote: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 4). A state edge: the source's
  -- unbuffered land share in the target state, within 0.01 of the tree's and at
  -- least 0.005. A containment edge: >= 0.899 inside its target.
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
    left join _us4_geom a on a.key = e.source_key
    left join _us4_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and not coalesce(abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) <= 0.01, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis = 'state_share'
          and not coalesce(
            abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) - e.share) <= 0.01
            and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) >= 0.005, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis <> 'state_share'
          and not coalesce(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) >= 0.899, false));
  if v_text is not null then raise exception 'US-4 promote: an edge does not match the geometry: %', v_text; end if;
  for r in select e.source_key, e.target_key, e.share,
                  extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) as measured
             from _us4_edges e join _us4_geom a on a.key = e.source_key join _us4_geom b on b.key = e.target_key
            where e.basis = 'state_share' order by e.source_key loop
    raise notice 'US-4 promote: state share % in % %, tree %', r.source_key, r.target_key, round(r.measured::numeric, 4), r.share;
  end loop;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
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
  if v_text is not null then
    raise exception 'US-4 promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text;
  end if;
end $$;

-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us4_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us4_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us4_edges e
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
  raise notice 'US-4 promote: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;

-- 6. Post-state.
do $$
declare n int; v_text text; r record;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception 'US-4 promote: not VERIFIED, locked and current: %', v_text; end if;
  for r in select * from (values ('united-states.new-york', 11, 10), ('united-states.oregon', 21, 20), ('united-states.washington', 19, 18)) e(state_key, live, ava) loop
    select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
    if n <> r.live then raise exception 'US-4 promote: % live places under %, expected %', n, r.state_key, r.live; end if;
    select count(*) into n from public.wine_places p
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
    if n <> r.ava then raise exception 'US-4 promote: % VERIFIED AVA places under %, expected %', n, r.state_key, r.ava; end if;
  end loop;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where (p.canonical_key = 'united-states.new-york' or p.canonical_key like 'united-states.new-york.%' or p.canonical_key = 'united-states.oregon' or p.canonical_key like 'united-states.oregon.%' or p.canonical_key = 'united-states.washington' or p.canonical_key like 'united-states.washington.%') and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception 'US-4 promote: % DRAFT boundaries left under Washington, Oregon or New York', n; end if;
  select count(*) into n from public.wine_place_relationships rel
    join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
   where (s.canonical_key = 'united-states.new-york' or s.canonical_key like 'united-states.new-york.%' or s.canonical_key = 'united-states.oregon' or s.canonical_key like 'united-states.oregon.%' or s.canonical_key = 'united-states.washington' or s.canonical_key like 'united-states.washington.%') or (t.canonical_key = 'united-states.new-york' or t.canonical_key like 'united-states.new-york.%' or t.canonical_key = 'united-states.oregon' or t.canonical_key like 'united-states.oregon.%' or t.canonical_key = 'united-states.washington' or t.canonical_key like 'united-states.washington.%');
  if n <> 5 then raise exception 'US-4 promote: % relationships under the three states, expected 5', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
   where (select count(*) from public.wine_place_relationships rel
            join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and rel.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception 'US-4 promote: edges not stored exactly once: %', v_text; end if;

  -- D6/D14: one place per AVA of this wave and per cross-state AVA; nothing
  -- deferred (Idaho, Ohio) placed; no key under a state outside wave 1.
  select string_agg(format('%s=%s', x.id, x.n), ', ') into v_text from (
    select f.id, (select count(*)::int from public.wine_place_boundaries b
                    join public.wine_boundary_source_snapshots ss on ss.id = b.source_snapshot_id
                    join public.wine_boundary_sources so on so.id = ss.source_id
                   where b.is_current and so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = f.id) n
      from unnest(array['ancient_lakes_of_columbia_valley', 'applegate_valley', 'candy_mountain', 'cayuga_lake', 'champlain_valley_of_new_york', 'chehalem_mountains', 'columbia_gorge', 'columbia_valley', 'dundee_hills', 'elkton_oregon', 'eola_amity_hills', 'goose_gap', 'horse_heaven_hills', 'hudson_river_region', 'lake_chelan', 'laurelwood_district', 'lower_long_tom', 'mcminnville', 'mount_pisgah__polk_county__oregon', 'naches_heights', 'niagara_escarpment', 'north_fork_of_long_island', 'rattlesnake_hills', 'red_hill_douglas_county__oregon', 'red_mountain', 'ribbon_ridge', 'rocky_reach', 'rogue_valley', 'royal_slope', 'seneca_lake', 'snipes_mountain', 'the_burn_of_columbia_valley', 'the_hamptons_long_island', 'the_rocks_district_of_milton_freewater', 'tualatin_hills', 'umpqua_valley', 'upper_hudson', 'van_duzer_corridor', 'wahluke_slope', 'walla_walla_valley', 'white_bluffs', 'yakima_valley', 'yamhill_carlton']::text[]) f(id)) x
   where x.n <> 1;
  if v_text is not null then raise exception 'US-4 promote: a cross-state AVA is not exactly one place (current UC Davis boundaries per AVA): %', v_text; end if;
  select string_agg(so.source_feature_id, ', ') into v_text
    from public.wine_boundary_sources so
    join public.wine_boundary_source_snapshots ss on ss.source_id = so.id
    join public.wine_place_boundaries b on b.source_snapshot_id = ss.id
   where so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = any(array['lake_erie', 'lewis_clark_valley', 'snake_river_valley']::text[]);
  if v_text is not null then raise exception 'US-4 promote: a deferred AVA has a place: %', v_text; end if;
  select string_agg(canonical_key, ', ' order by canonical_key) into v_text from public.wine_places
   where canonical_key like 'united-states.%' and split_part(canonical_key, '.', 2) not in ('california', 'washington', 'oregon', 'new-york');
  if v_text is not null then raise exception 'US-4 promote: a place under a state outside wave 1: %', v_text; end if;

  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-4 promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
