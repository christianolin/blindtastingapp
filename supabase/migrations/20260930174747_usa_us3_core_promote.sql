-- USA on the wine map, phase US-3 core batch: the promote (spec §8.4, §15 US-3;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 18).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the 86
-- California AVAs of the core batch to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the batch's 24 edges (§8.3; an edge ships
-- with the batch its second endpoint lands in). Checks read only
-- united-states.california.*, so another state's wave can run in any order.
-- Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: 20260930104747 (the previous wave's promote) is live;
-- stage-usa-ava.mjs --wave us3-core --stage has committed one DRAFT,
-- non-current boundary per place; 20260930154747 and 20260930164747 are applied.
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
  ('united-states.california.central-coast.alisos-canyon', 'alisos_canyon', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.carmel-valley', 'carmel_valley', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.gabilan-mountains', 'gabilan_mountains', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.gabilan-mountains.chalone', 'chalone', false, 'united-states.california.central-coast.gabilan-mountains', 0.995),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan', 'mt__harlan', false, 'united-states.california.central-coast.gabilan-mountains', 0.995),
  ('united-states.california.central-coast.monterey', 'monterey', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.monterey.arroyo-seco', 'arroyo_seco', false, 'united-states.california.central-coast.monterey', 0.995),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands', 'santa_lucia_highlands', false, 'united-states.california.central-coast.monterey', 0.995),
  ('united-states.california.central-coast.paso-robles', 'paso_robles', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.paso-robles.adelaida-district', 'adelaida_district', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.creston-district', 'creston_district', false, 'united-states.california.central-coast.paso-robles', 0.9),
  ('united-states.california.central-coast.paso-robles.el-pomar-district', 'el_pomar_district', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district', 'paso_robles_estrella_district', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district', 'paso_robles_geneseo_district', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district', 'paso_robles_highlands_district', false, 'united-states.california.central-coast.paso-robles', 0.9),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district', 'paso_robles_willow_creek_district', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.san-juan-creek', 'san_juan_creek', false, 'united-states.california.central-coast.paso-robles', 0.995),
  ('united-states.california.central-coast.paso-robles.san-miguel-district', 'san_miguel_district', false, 'united-states.california.central-coast.paso-robles', 0.9),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch', 'santa_margarita_ranch', false, 'united-states.california.central-coast.paso-robles', 0.9),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district', 'templeton_gap_district', false, 'united-states.california.central-coast.paso-robles', 0.9),
  ('united-states.california.central-coast.san-francisco-bay', 'san_francisco_bay', true, 'united-states.california.central-coast', 0.9),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley', 'livermore_valley', false, 'united-states.california.central-coast.san-francisco-bay', 0.995),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 'santa_cruz_mountains', false, 'united-states.california.central-coast.san-francisco-bay', 0.995),
  ('united-states.california.central-coast.san-luis-obispo-coast', 'san_luis_obispo_coast', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley', 'arroyo_grande_valley', false, 'united-states.california.central-coast.san-luis-obispo-coast', 0.995),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley', 'edna_valley', false, 'united-states.california.central-coast.san-luis-obispo-coast', 0.995),
  ('united-states.california.central-coast.santa-maria-valley', 'santa_maria_valley', false, 'united-states.california.central-coast', 0.9),
  ('united-states.california.central-coast.santa-ynez-valley', 'santa_ynez_valley', false, 'united-states.california.central-coast', 0.995),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon', 'ballard_canyon', false, 'united-states.california.central-coast.santa-ynez-valley', 0.995),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara', 'happy_canyon_of_santa_barbara', false, 'united-states.california.central-coast.santa-ynez-valley', 0.995),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district', 'los_olivos_district', false, 'united-states.california.central-coast.santa-ynez-valley', 0.995),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills', 'sta__rita_hills', false, 'united-states.california.central-coast.santa-ynez-valley', 0.9),
  ('united-states.california.central-valley.lodi', 'lodi', false, 'united-states.california.central-valley', null),
  ('united-states.california.central-valley.lodi.alta-mesa', 'alta_mesa', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.borden-ranch', 'borden_ranch', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.clements-hills', 'clements_hills', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.cosumnes-river', 'cosumnes_river', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.jahant', 'jahant', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.mokelumne-river', 'mokelumne_river', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.central-valley.lodi.sloughhouse', 'sloughhouse', false, 'united-states.california.central-valley.lodi', 0.995),
  ('united-states.california.el-dorado', 'el_dorado', false, 'united-states.california', null),
  ('united-states.california.el-dorado.fair-play', 'fair_play', false, 'united-states.california.el-dorado', 0.995),
  ('united-states.california.north-coast.clear-lake', 'clear_lake', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county', 'red_hills_lake_county', false, 'united-states.california.north-coast.clear-lake', 0.995),
  ('united-states.california.north-coast.fountaingrove-district', 'fountaingrove_district', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.los-carneros', 'los_carneros', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.mendocino', 'mendocino', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.mendocino.anderson-valley', 'anderson_valley', false, 'united-states.california.north-coast.mendocino', 0.995),
  ('united-states.california.north-coast.mendocino-ridge', 'mendocino_ridge', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.napa-valley', 'napa_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.napa-valley.atlas-peak', 'atlas_peak', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.calistoga', 'calistoga', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.chiles-valley', 'chiles_valley', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.coombsville', 'coombsville', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley', 'crystal_springs_of_napa_valley', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district', 'diamond_mountain_district', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.howell-mountain', 'howell_mountain', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.mt-veeder', 'mt__veeder', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley', 'oak_knoll_district_of_napa_valley', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.oakville', 'oakville', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.rutherford', 'rutherford', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district', 'spring_mountain_district', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.st-helena', 'st__helena', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.stags-leap-district', 'stags_leap_district', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.napa-valley.yountville', 'yountville', false, 'united-states.california.north-coast.napa-valley', 0.995),
  ('united-states.california.north-coast.northern-sonoma', 'northern_sonoma', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley', 'alexander_valley', false, 'united-states.california.north-coast.northern-sonoma', 0.9),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley', 'dry_creek_valley', false, 'united-states.california.north-coast.northern-sonoma', 0.995),
  ('united-states.california.north-coast.northern-sonoma.knights-valley', 'knights_valley', false, 'united-states.california.north-coast.northern-sonoma', 0.995),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley', 'russian_river_valley', false, 'united-states.california.north-coast.northern-sonoma', 0.995),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill', 'chalk_hill', false, 'united-states.california.north-coast.northern-sonoma.russian-river-valley', 0.995),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley', 'green_valley_of_russian_river_valley', false, 'united-states.california.north-coast.northern-sonoma.russian-river-valley', 0.995),
  ('united-states.california.north-coast.petaluma-gap', 'petaluma_gap', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', 'pine_mountain_cloverdale_peak', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.rockpile', 'rockpile', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.sonoma-coast', 'sonoma_coast', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 'west_sonoma_coast', false, 'united-states.california.north-coast.sonoma-coast', 0.995),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview', 'fort_ross_seaview', false, 'united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 0.995),
  ('united-states.california.north-coast.sonoma-valley', 'sonoma_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley', 'bennett_valley', false, 'united-states.california.north-coast.sonoma-valley', 0.9),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county', 'moon_mountain_district_sonoma_county', false, 'united-states.california.north-coast.sonoma-valley', 0.995),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain', 'sonoma_mountain', false, 'united-states.california.north-coast.sonoma-valley', 0.995),
  ('united-states.california.north-coast.wild-horse-valley', 'wild_horse_valley', false, 'united-states.california.north-coast', 0.995),
  ('united-states.california.sierra-foothills.california-shenandoah-valley', 'california_shenandoah_valley', false, 'united-states.california.sierra-foothills', 0.995),
  ('united-states.california.sierra-foothills.fiddletown', 'fiddletown', false, 'united-states.california.sierra-foothills', 0.995),
  ('united-states.california.south-coast.temecula-valley', 'temecula_valley', false, 'united-states.california.south-coast', 0.995);
create temp table _us3_prior (key text primary key) on commit drop;
insert into _us3_prior values
  ('united-states'),
  ('united-states.california'),
  ('united-states.california.central-coast'),
  ('united-states.california.central-valley'),
  ('united-states.california.north-coast'),
  ('united-states.california.sierra-foothills'),
  ('united-states.california.south-coast'),
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
  ('united-states.california.el-dorado', 'united-states.california.sierra-foothills', 'OVERLAPS', 0.7487, 'US-3 core, California tree report: basis partial_overlap, ratio 0.7487'),
  ('united-states.california.el-dorado.fair-play', 'united-states.california.sierra-foothills', 'ALTERNATE_PARENT', null, 'US-3 core, California tree report: basis within'),
  ('united-states.california.north-coast.fountaingrove-district', 'united-states.california.north-coast.northern-sonoma', 'OVERLAPS', 0.0347, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0347'),
  ('united-states.california.north-coast.los-carneros', 'united-states.california.north-coast.napa-valley', 'OVERLAPS', 0.4017, 'US-3 core, California tree report: basis partial_overlap, ratio 0.4017'),
  ('united-states.california.north-coast.los-carneros', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.5983, 'US-3 core, California tree report: basis partial_overlap, ratio 0.5983'),
  ('united-states.california.north-coast.los-carneros', 'united-states.california.north-coast.sonoma-valley', 'OVERLAPS', 0.5983, 'US-3 core, California tree report: basis partial_overlap, ratio 0.5983'),
  ('united-states.california.north-coast.mendocino-ridge', 'united-states.california.north-coast.mendocino', 'OVERLAPS', 0.0449, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0449'),
  ('united-states.california.north-coast.mendocino.anderson-valley', 'united-states.california.north-coast.mendocino-ridge', 'OVERLAPS', 0.0627, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0627'),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley', 'united-states.california.north-coast.napa-valley.calistoga', 'OVERLAPS', 0.0126, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0126'),
  ('united-states.california.north-coast.northern-sonoma', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.3809, 'US-3 core, California tree report: basis partial_overlap, ratio 0.3809'),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley', 'united-states.california.north-coast.northern-sonoma.russian-river-valley', 'OVERLAPS', 0.0882, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0882'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.8795, 'US-3 core, California tree report: basis partial_overlap, ratio 0.8795'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.5598, 'US-3 core, California tree report: basis partial_overlap, ratio 0.5598'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley', 'united-states.california.north-coast.sonoma-coast', 'ALTERNATE_PARENT', null, 'US-3 core, California tree report: basis within'),
  ('united-states.california.north-coast.petaluma-gap', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.6644, 'US-3 core, California tree report: basis partial_overlap, ratio 0.6644'),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', 'united-states.california.north-coast.northern-sonoma', 'OVERLAPS', 0.3272, 'US-3 core, California tree report: basis partial_overlap, ratio 0.3272'),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', 'united-states.california.north-coast.northern-sonoma.alexander-valley', 'OVERLAPS', 0.3272, 'US-3 core, California tree report: basis partial_overlap, ratio 0.3272'),
  ('united-states.california.north-coast.rockpile', 'united-states.california.north-coast.northern-sonoma', 'OVERLAPS', 0.1915, 'US-3 core, California tree report: basis partial_overlap, ratio 0.1915'),
  ('united-states.california.north-coast.rockpile', 'united-states.california.north-coast.northern-sonoma.dry-creek-valley', 'OVERLAPS', 0.1913, 'US-3 core, California tree report: basis partial_overlap, ratio 0.1913'),
  ('united-states.california.north-coast.sonoma-valley', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.3965, 'US-3 core, California tree report: basis partial_overlap, ratio 0.3965'),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley', 'united-states.california.north-coast.sonoma-coast', 'OVERLAPS', 0.0324, 'US-3 core, California tree report: basis partial_overlap, ratio 0.0324'),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain', 'united-states.california.north-coast.sonoma-valley.bennett-valley', 'OVERLAPS', 0.1936, 'US-3 core, California tree report: basis partial_overlap, ratio 0.1936'),
  ('united-states.california.north-coast.wild-horse-valley', 'united-states.california.north-coast.napa-valley', 'OVERLAPS', 0.3403, 'US-3 core, California tree report: basis partial_overlap, ratio 0.3403'),
  ('united-states.california.sierra-foothills.california-shenandoah-valley', 'united-states.california.el-dorado', 'OVERLAPS', 0.1088, 'US-3 core, California tree report: basis partial_overlap, ratio 0.1088');

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
    raise exception 'US-3 core promote: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-3 core promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-3 core promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave us3-core --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%')
     and p.canonical_key not in (select key from _us3_promote union all select key from _us3_prior);
  if v_text is not null then raise exception 'US-3 core promote: boundaries on other California places: %', v_text; end if;
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
  if n <> 86 then raise exception 'US-3 core promote: % staged rows, expected 86', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception 'US-3 core promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between -124.6 and -114
      or extensions.ST_Y(label_point) not between 32.4 and 42.1;
  if v_text is not null then raise exception 'US-3 core promote: invalid geometry or label outside California''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception 'US-3 core promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us3_staged where gp->>'display' = 'outline';
  if n <> 1 then raise exception 'US-3 core promote: % outline places, expected 1', n; end if;

  -- §8.2 state containment, on land and buffered, against the live outlines.
  select extensions.ST_Buffer(g, 0.05) into v_state from _us3_geom where key = 'united-states.california';
  select extensions.ST_Buffer(g, 0.05) into v_land from _us3_geom where key = 'united-states';
  if v_state is null or v_land is null then raise exception 'US-3 core promote: the California or United States outline is not live'; end if;
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key, extensions.ST_Area(extensions.ST_Intersection(s.g, v_state))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us3_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-3 core promote: not inside California (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with the measured
  -- simplification slack (plan decision 6: max difference 0.00081).
  select count(*) into n from _us3_staged s
   where s.parent_min is not null and not exists (select 1 from _us3_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception 'US-3 core promote: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us3_staged s join _us3_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception 'US-3 core promote: not inside its parent AVA: %', v_text; end if;

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
  if v_text is not null then raise exception 'US-3 core promote: an edge does not match the geometry: %', v_text; end if;
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
    raise exception 'US-3 core promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text;
  end if;
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
  raise notice 'US-3 core promote: neighbour refresh % rows in % s', v_rows,
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
  if v_text is not null then raise exception 'US-3 core promote: not VERIFIED, locked and current: %', v_text; end if;
  select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 92 then raise exception 'US-3 core promote: % live California places, expected 92', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception 'US-3 core promote: % DRAFT California boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
  if n <> 90 then raise exception 'US-3 core promote: % VERIFIED California AVA places, expected 90', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where (s.canonical_key = 'united-states.california' or s.canonical_key like 'united-states.california.%') or (t.canonical_key = 'united-states.california' or t.canonical_key like 'united-states.california.%');
  if n <> 24 then raise exception 'US-3 core promote: % California relationships, expected 24', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
   where (select count(*) from public.wine_place_relationships r
            join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and r.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception 'US-3 core promote: edges not stored exactly once: %', v_text; end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-3 core promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
