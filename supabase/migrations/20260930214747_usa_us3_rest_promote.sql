-- USA on the wine map, phase US-3 rest batch: the promote (spec §8.4, §15 US-3;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 18).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the 64
-- California AVAs of the rest batch to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the batch's 5 edges (§8.3; an edge ships
-- with the batch its second endpoint lands in). Checks read only
-- united-states.california.*, so another state's wave can run in any order.
-- Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: 20260930174747 (the previous wave's promote) is live;
-- stage-usa-ava.mjs --wave us3-rest --stage has committed one DRAFT,
-- non-current boundary per place; 20260930194747 and 20260930204747 are applied.
-- Rendered by scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_promote, pg_temp._us3_prior, pg_temp._us3_edges, pg_temp._us3_staged, pg_temp._us3_geom;
create temp table _us3_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision
) on commit drop;
insert into _us3_promote values
  ('united-states.california.antelope-valley-of-the-california-high-desert', 'antelope_valley_of_the_california_high_desert', false, 'united-states.california', null),
  ('united-states.california.central-coast.monterey.hames-valley', 'hames_valley', false, 'united-states.california.central-coast.monterey', 0.995),
  ('united-states.california.central-coast.monterey.san-bernabe', 'san_bernabe', false, 'united-states.california.central-coast.monterey', 0.995),
  ('united-states.california.central-coast.monterey.san-lucas', 'san_lucas', false, 'united-states.california.central-coast.monterey', 0.995),
  ('united-states.california.central-coast.san-antonio-valley', 'san_antonio_valley', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.san-benito', 'san_benito', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.san-benito.cienega-valley', 'cienega_valley', false, 'united-states.california.central-coast.san-benito', 0.995),
  ('united-states.california.central-coast.san-benito.cienega-valley.lime-kiln-valley', 'lime_kiln_valley', false, 'united-states.california.central-coast.san-benito.cienega-valley', 0.995),
  ('united-states.california.central-coast.san-benito.paicines', 'paicines', false, 'united-states.california.central-coast.san-benito', 0.995),
  ('united-states.california.central-coast.san-francisco-bay.lamorinda', 'lamorinda', false, 'united-states.california.central-coast.san-francisco-bay', 0.995),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 'santa_clara_valley', false, 'united-states.california.central-coast.san-francisco-bay', 0.9),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.pacheco-pass', 'pacheco_pass', false, 'united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 0.995),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.san-ysidro-district', 'san_ysidro_district', false, 'united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 0.995),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains.ben-lomond-mountain', 'ben_lomond_mountain', false, 'united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 0.995),
  ('united-states.california.central-coast.york-mountain', 'york_mountain', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-valley.capay-valley', 'capay_valley', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.clarksburg', 'clarksburg', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.clarksburg.merritt-island', 'merritt_island', false, 'united-states.california.central-valley.clarksburg', 0.995),
  ('united-states.california.central-valley.diablo-grande', 'diablo_grande', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.dunnigan-hills', 'dunnigan_hills', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.madera', 'madera', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.paulsell-valley', 'paulsell_valley', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.river-junction', 'river_junction', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.salado-creek', 'salado_creek', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.tracy-hills', 'tracy_hills', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.winters-highlands', 'winters_highlands', false, 'united-states.california.central-valley', null),
  ('united-states.california.contra-costa', 'contra_costa', false, 'united-states.california', null),
  ('united-states.california.covelo', 'covelo', false, 'united-states.california', null),
  ('united-states.california.cucamonga-valley', 'cucamonga_valley', false, 'united-states.california', null),
  ('united-states.california.dos-rios', 'dos_rios', false, 'united-states.california', null),
  ('united-states.california.inwood-valley', 'inwood_valley', false, 'united-states.california', null),
  ('united-states.california.leona-valley', 'leona_valley', false, 'united-states.california', null),
  ('united-states.california.malibu-coast', 'malibu_coast', false, 'united-states.california', null),
  ('united-states.california.malibu-coast.malibu-newton-canyon', 'malibu_newton_canyon', false, 'united-states.california.malibu-coast', 0.995),
  ('united-states.california.malibu-coast.saddle-rock-malibu', 'saddle_rock_malibu', false, 'united-states.california.malibu-coast', 0.995),
  ('united-states.california.manton-valley', 'manton_valley', false, 'united-states.california', null),
  ('united-states.california.north-coast.benmore-valley', 'benmore_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.clear-lake.big-valley-district-lake-county', 'big_valley_district_lake_county', false, 'united-states.california.north-coast.clear-lake', 0.995),
  ('united-states.california.north-coast.clear-lake.kelsey-bench-lake-county', 'kelsey_bench_lake_county', false, 'united-states.california.north-coast.clear-lake', 0.995),
  ('united-states.california.north-coast.clear-lake.upper-lake-valley', 'upper_lake_valley', false, 'united-states.california.north-coast.clear-lake', 0.995),
  ('united-states.california.north-coast.cole-ranch', 'cole_ranch', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.comptche', 'comptche', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.eagle-peak-mendocino-county', 'eagle_peak_mendocino_county', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.guenoc-valley', 'guenoc_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.high-valley', 'high_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.long-valley-lake-county', 'long_valley-lake_county', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.mendocino.mcdowell-valley', 'mcdowell_valley', false, 'united-states.california.north-coast.mendocino', 0.9),
  ('united-states.california.north-coast.mendocino.potter-valley', 'potter_valley', false, 'united-states.california.north-coast.mendocino', 0.9),
  ('united-states.california.north-coast.mendocino.redwood-valley', 'redwood_valley', false, 'united-states.california.north-coast.mendocino', 0.995),
  ('united-states.california.north-coast.mendocino.yorkville-highlands', 'yorkville_highlands', false, 'united-states.california.north-coast.mendocino', 0.995),
  ('united-states.california.north-coast.solano-county-green-valley', 'solano_county_green_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.suisun-valley', 'suisun_valley', false, 'united-states.california.north-coast', 0.9),
  ('united-states.california.palos-verdes-peninsula', 'palos_verdes_peninsula', false, 'united-states.california', null),
  ('united-states.california.seiad-valley', 'seiad_valley', false, 'united-states.california', null),
  ('united-states.california.sierra-foothills.north-yuba', 'north_yuba', false, 'united-states.california.sierra-foothills', 0.995),
  ('united-states.california.sierra-pelona-valley', 'sierra_pelona_valley', false, 'united-states.california', null),
  ('united-states.california.south-coast.ramona-valley', 'ramona_valley', false, 'united-states.california.south-coast', 0.995),
  ('united-states.california.south-coast.san-luis-rey', 'san_luis_rey', false, 'united-states.california.south-coast', 0.995),
  ('united-states.california.south-coast.san-pasqual-valley', 'san_pasqual_valley', false, 'united-states.california.south-coast', 0.995),
  ('united-states.california.squaw-valley-miramonte', 'squaw_valley_miramonte', false, 'united-states.california', null),
  ('united-states.california.tehachapi-mountains', 'tehachapi_mountains', false, 'united-states.california', null),
  ('united-states.california.trinity-lakes', 'trinity_lakes', false, 'united-states.california', null),
  ('united-states.california.willow-creek', 'willow_creek', false, 'united-states.california', null),
  ('united-states.california.yucaipa-valley', 'yucaipa_valley', false, 'united-states.california', null);
create temp table _us3_prior (key text primary key) on commit drop;
insert into _us3_prior values
  ('united-states'),
  ('united-states.california'),
  ('united-states.california.central-coast'),
  ('united-states.california.central-coast.alisos-canyon'),
  ('united-states.california.central-coast.carmel-valley'),
  ('united-states.california.central-coast.gabilan-mountains'),
  ('united-states.california.central-coast.gabilan-mountains.chalone'),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan'),
  ('united-states.california.central-coast.monterey'),
  ('united-states.california.central-coast.monterey.arroyo-seco'),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands'),
  ('united-states.california.central-coast.paso-robles'),
  ('united-states.california.central-coast.paso-robles.adelaida-district'),
  ('united-states.california.central-coast.paso-robles.creston-district'),
  ('united-states.california.central-coast.paso-robles.el-pomar-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district'),
  ('united-states.california.central-coast.paso-robles.san-juan-creek'),
  ('united-states.california.central-coast.paso-robles.san-miguel-district'),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch'),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district'),
  ('united-states.california.central-coast.san-francisco-bay'),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley'),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains'),
  ('united-states.california.central-coast.san-luis-obispo-coast'),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley'),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley'),
  ('united-states.california.central-coast.santa-maria-valley'),
  ('united-states.california.central-coast.santa-ynez-valley'),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon'),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara'),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district'),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills'),
  ('united-states.california.central-valley'),
  ('united-states.california.central-valley.lodi'),
  ('united-states.california.central-valley.lodi.alta-mesa'),
  ('united-states.california.central-valley.lodi.borden-ranch'),
  ('united-states.california.central-valley.lodi.clements-hills'),
  ('united-states.california.central-valley.lodi.cosumnes-river'),
  ('united-states.california.central-valley.lodi.jahant'),
  ('united-states.california.central-valley.lodi.mokelumne-river'),
  ('united-states.california.central-valley.lodi.sloughhouse'),
  ('united-states.california.el-dorado'),
  ('united-states.california.el-dorado.fair-play'),
  ('united-states.california.north-coast'),
  ('united-states.california.north-coast.clear-lake'),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county'),
  ('united-states.california.north-coast.fountaingrove-district'),
  ('united-states.california.north-coast.los-carneros'),
  ('united-states.california.north-coast.mendocino'),
  ('united-states.california.north-coast.mendocino-ridge'),
  ('united-states.california.north-coast.mendocino.anderson-valley'),
  ('united-states.california.north-coast.napa-valley'),
  ('united-states.california.north-coast.napa-valley.atlas-peak'),
  ('united-states.california.north-coast.napa-valley.calistoga'),
  ('united-states.california.north-coast.napa-valley.chiles-valley'),
  ('united-states.california.north-coast.napa-valley.coombsville'),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley'),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district'),
  ('united-states.california.north-coast.napa-valley.howell-mountain'),
  ('united-states.california.north-coast.napa-valley.mt-veeder'),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley'),
  ('united-states.california.north-coast.napa-valley.oakville'),
  ('united-states.california.north-coast.napa-valley.rutherford'),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district'),
  ('united-states.california.north-coast.napa-valley.st-helena'),
  ('united-states.california.north-coast.napa-valley.stags-leap-district'),
  ('united-states.california.north-coast.napa-valley.yountville'),
  ('united-states.california.north-coast.northern-sonoma'),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley'),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley'),
  ('united-states.california.north-coast.northern-sonoma.knights-valley'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley'),
  ('united-states.california.north-coast.petaluma-gap'),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak'),
  ('united-states.california.north-coast.rockpile'),
  ('united-states.california.north-coast.sonoma-coast'),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast'),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview'),
  ('united-states.california.north-coast.sonoma-valley'),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley'),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county'),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain'),
  ('united-states.california.north-coast.wild-horse-valley'),
  ('united-states.california.sierra-foothills'),
  ('united-states.california.sierra-foothills.california-shenandoah-valley'),
  ('united-states.california.sierra-foothills.fiddletown'),
  ('united-states.california.south-coast'),
  ('united-states.california.south-coast.temecula-valley'),
  ('united-states.new-york'),
  ('united-states.new-york.finger-lakes'),
  ('united-states.new-york.long-island'),
  ('united-states.oregon'),
  ('united-states.oregon.southern-oregon'),
  ('united-states.oregon.willamette-valley'),
  ('united-states.washington'),
  ('united-states.washington.columbia-valley'),
  ('united-states.washington.puget-sound');
create temp table _us3_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, ratio double precision, note text not null
) on commit drop;
insert into _us3_edges values
  ('united-states.california.contra-costa', 'united-states.california.central-coast', 'OVERLAPS', 0.3367, 'US-3 rest, California tree report: basis partial_overlap, ratio 0.3367'),
  ('united-states.california.contra-costa', 'united-states.california.central-coast.san-francisco-bay', 'OVERLAPS', 0.3363, 'US-3 rest, California tree report: basis partial_overlap, ratio 0.3363'),
  ('united-states.california.north-coast.cole-ranch', 'united-states.california.north-coast.mendocino', 'OVERLAPS', 0.694, 'US-3 rest, California tree report: basis partial_overlap, ratio 0.694'),
  ('united-states.california.north-coast.high-valley', 'united-states.california.north-coast.clear-lake', 'OVERLAPS', 0.7591, 'US-3 rest, California tree report: basis partial_overlap, ratio 0.7591'),
  ('united-states.california.north-coast.wild-horse-valley', 'united-states.california.north-coast.solano-county-green-valley', 'OVERLAPS', 0.6594, 'US-3 rest, California tree report: basis partial_overlap, ratio 0.6594');

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception 'US-3 rest promote: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-3 rest promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-3 rest promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave us3-rest --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%')
     and p.canonical_key not in (select key from _us3_promote union all select key from _us3_prior);
  if v_text is not null then raise exception 'US-3 rest promote: boundaries on other California places: %', v_text; end if;
end $$;

create temp table _us3_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us3_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this batch's staged boundary, else an earlier wave's current one.
create temp table _us3_geom on commit drop as
select key, g from _us3_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us3_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_state extensions.geometry; v_land extensions.geometry;
begin
  select count(*) into n from _us3_staged;
  if n <> 64 then raise exception 'US-3 rest promote: % staged rows, expected 64', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception 'US-3 rest promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between -124.6 and -114
      or extensions.ST_Y(label_point) not between 32.4 and 42.1;
  if v_text is not null then raise exception 'US-3 rest promote: invalid geometry or label outside California''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception 'US-3 rest promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us3_staged where gp->>'display' = 'outline';
  if n <> 0 then raise exception 'US-3 rest promote: % outline places, expected 0', n; end if;

  -- §8.2 state containment, on land and buffered, against the live outlines.
  select extensions.ST_Buffer(g, 0.05) into v_state from _us3_geom where key = 'united-states.california';
  select extensions.ST_Buffer(g, 0.05) into v_land from _us3_geom where key = 'united-states';
  if v_state is null or v_land is null then raise exception 'US-3 rest promote: the California or United States outline is not live'; end if;
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key, extensions.ST_Area(extensions.ST_Intersection(s.g, v_state))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us3_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-3 rest promote: not inside California (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with the measured
  -- simplification slack (plan decision 6: max difference 0.00081).
  select count(*) into n from _us3_staged s
   where s.parent_min is not null and not exists (select 1 from _us3_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception 'US-3 rest promote: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us3_staged s join _us3_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception 'US-3 rest promote: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 7).
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
    left join _us3_geom a on a.key = e.source_key
    left join _us3_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) > 0.01)
      or (e.type = 'ALTERNATE_PARENT'
          and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) < 0.899);
  if v_text is not null then raise exception 'US-3 rest promote: an edge does not match the geometry: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
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
    raise exception 'US-3 rest promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text;
  end if;
end $$;

-- 3b. Central Valley's derived outline equals its promoted members' union
--     (spec §25; plan decision 8; measured 2026-09-30: 0.023% and 0.00026%).
do $$
declare v_cv extensions.geometry; v_gp jsonb; v_members extensions.geometry; n int;
        v_sym double precision; v_out double precision;
begin
  select b.display_geometry, b.generation_parameters into v_cv, v_gp
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.canonical_key = 'united-states.california.central-valley';
  if v_cv is null then raise exception 'US-3 rest promote: united-states.california.central-valley has no current boundary'; end if;
  if array(select jsonb_array_elements_text(v_gp->'members') order by 1)
     <> array['capay_valley', 'clarksburg', 'diablo_grande', 'dunnigan_hills', 'lodi', 'madera', 'paulsell_valley', 'river_junction', 'salado_creek', 'tracy_hills', 'winters_highlands']::text[] then
    raise exception 'US-3 rest promote: Central Valley''s member list is not its 11 children';
  end if;
  select count(*), extensions.ST_Union(g) into n, v_members
    from _us3_geom where key in ('united-states.california.central-valley.capay-valley', 'united-states.california.central-valley.clarksburg', 'united-states.california.central-valley.diablo-grande', 'united-states.california.central-valley.dunnigan-hills', 'united-states.california.central-valley.lodi', 'united-states.california.central-valley.madera', 'united-states.california.central-valley.paulsell-valley', 'united-states.california.central-valley.river-junction', 'united-states.california.central-valley.salado-creek', 'united-states.california.central-valley.tracy-hills', 'united-states.california.central-valley.winters-highlands');
  if n <> 11 then raise exception 'US-3 rest promote: % of 11 Central Valley members have a geometry', n; end if;
  v_sym := extensions.ST_Area(extensions.ST_SymDifference(v_cv, v_members)) / extensions.ST_Area(v_cv);
  v_out := extensions.ST_Area(extensions.ST_Difference(v_members, v_cv)) / extensions.ST_Area(v_cv);
  if v_sym >= 0.001 or v_out >= 0.0001 then
    raise exception 'US-3 rest promote: Central Valley''s outline is not its members'' union (symmetric difference %, members outside %)',
      round(v_sym::numeric, 6), round(v_out::numeric, 6);
  end if;
  raise notice 'US-3 rest promote: Central Valley against its members: symmetric difference %, members outside %',
    round(v_sym::numeric, 6), round(v_out::numeric, 6);
end $$;

-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us3_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us3_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us3_edges e
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
  raise notice 'US-3 rest promote: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;

-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception 'US-3 rest promote: not VERIFIED, locked and current: %', v_text; end if;
  select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 156 then raise exception 'US-3 rest promote: % live California places, expected 156', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception 'US-3 rest promote: % DRAFT California boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
  if n <> 154 then raise exception 'US-3 rest promote: % VERIFIED California AVA places, expected 154', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where (s.canonical_key = 'united-states.california' or s.canonical_key like 'united-states.california.%') or (t.canonical_key = 'united-states.california' or t.canonical_key like 'united-states.california.%');
  if n <> 29 then raise exception 'US-3 rest promote: % California relationships, expected 29', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
   where (select count(*) from public.wine_place_relationships r
            join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and r.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception 'US-3 rest promote: edges not stored exactly once: %', v_text; end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-3 rest promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
