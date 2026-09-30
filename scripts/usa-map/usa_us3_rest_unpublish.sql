-- USA on the wine map, phase US-3 rest batch ROLLBACK: unpublish (a roll forward after the promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 20).
--
-- Takes the 64 places of the rest batch off the map without touching
-- their locked keys: every boundary of the batch
-- non-current and every place DRAFT, then the checked refresh. Boundaries,
-- relationships and knowledge stay, for a later re-promote. Refuses while a
-- later batch is live (unpublish it first).
-- THEN, on master: splice-boundary-expectations.mjs --write (it keeps only the
-- current united-states rows, so this batch's rows leave the hunk); git diff must
-- show only removed united-states rows; commit and push it as a staged push.
-- THEN DISPATCH A NEW TILES RELEASE FROM MASTER (promote=true), and never roll
-- back the manifest (§17.3).
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_rb, pg_temp._us3_known;
create temp table _us3_rb (key text primary key, depth int not null) on commit drop;
insert into _us3_rb values
  ('united-states.california.antelope-valley-of-the-california-high-desert', 2),
  ('united-states.california.central-coast.monterey.hames-valley', 4),
  ('united-states.california.central-coast.monterey.san-bernabe', 4),
  ('united-states.california.central-coast.monterey.san-lucas', 4),
  ('united-states.california.central-coast.san-antonio-valley', 3),
  ('united-states.california.central-coast.san-benito', 3),
  ('united-states.california.central-coast.san-benito.cienega-valley', 4),
  ('united-states.california.central-coast.san-benito.cienega-valley.lime-kiln-valley', 5),
  ('united-states.california.central-coast.san-benito.paicines', 4),
  ('united-states.california.central-coast.san-francisco-bay.contra-costa', 4),
  ('united-states.california.central-coast.san-francisco-bay.lamorinda', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.pacheco-pass', 5),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.san-ysidro-district', 5),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains.ben-lomond-mountain', 5),
  ('united-states.california.central-coast.york-mountain', 3),
  ('united-states.california.central-valley.capay-valley', 3),
  ('united-states.california.central-valley.clarksburg', 3),
  ('united-states.california.central-valley.clarksburg.merritt-island', 4),
  ('united-states.california.central-valley.diablo-grande', 3),
  ('united-states.california.central-valley.dunnigan-hills', 3),
  ('united-states.california.central-valley.madera', 3),
  ('united-states.california.central-valley.paulsell-valley', 3),
  ('united-states.california.central-valley.river-junction', 3),
  ('united-states.california.central-valley.salado-creek', 3),
  ('united-states.california.central-valley.tracy-hills', 3),
  ('united-states.california.central-valley.winters-highlands', 3),
  ('united-states.california.comptche', 2),
  ('united-states.california.covelo', 2),
  ('united-states.california.cucamonga-valley', 2),
  ('united-states.california.dos-rios', 2),
  ('united-states.california.inwood-valley', 2),
  ('united-states.california.leona-valley', 2),
  ('united-states.california.malibu-coast', 2),
  ('united-states.california.malibu-coast.malibu-newton-canyon', 3),
  ('united-states.california.malibu-coast.saddle-rock-malibu', 3),
  ('united-states.california.manton-valley', 2),
  ('united-states.california.north-coast.benmore-valley', 3),
  ('united-states.california.north-coast.clear-lake.big-valley-district-lake-county', 4),
  ('united-states.california.north-coast.clear-lake.kelsey-bench-lake-county', 4),
  ('united-states.california.north-coast.clear-lake.upper-lake-valley', 4),
  ('united-states.california.north-coast.cole-ranch', 3),
  ('united-states.california.north-coast.eagle-peak-mendocino-county', 3),
  ('united-states.california.north-coast.guenoc-valley', 3),
  ('united-states.california.north-coast.high-valley', 3),
  ('united-states.california.north-coast.long-valley-lake-county', 3),
  ('united-states.california.north-coast.mendocino.mcdowell-valley', 4),
  ('united-states.california.north-coast.mendocino.potter-valley', 4),
  ('united-states.california.north-coast.mendocino.redwood-valley', 4),
  ('united-states.california.north-coast.mendocino.yorkville-highlands', 4),
  ('united-states.california.north-coast.solano-county-green-valley', 3),
  ('united-states.california.north-coast.suisun-valley', 3),
  ('united-states.california.palos-verdes-peninsula', 2),
  ('united-states.california.seiad-valley', 2),
  ('united-states.california.sierra-foothills.north-yuba', 3),
  ('united-states.california.sierra-pelona-valley', 2),
  ('united-states.california.south-coast.ramona-valley', 3),
  ('united-states.california.south-coast.san-luis-rey', 3),
  ('united-states.california.south-coast.san-pasqual-valley', 3),
  ('united-states.california.squaw-valley-miramonte', 2),
  ('united-states.california.tehachapi-mountains', 2),
  ('united-states.california.trinity-lakes', 2),
  ('united-states.california.willow-creek', 2),
  ('united-states.california.yucaipa-valley', 2);
-- Every California key this batch knows about (earlier waves and itself).
create temp table _us3_known (key text primary key) on commit drop;
insert into _us3_known values
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
  ('united-states.california.antelope-valley-of-the-california-high-desert'),
  ('united-states.california.central-coast.monterey.hames-valley'),
  ('united-states.california.central-coast.monterey.san-bernabe'),
  ('united-states.california.central-coast.monterey.san-lucas'),
  ('united-states.california.central-coast.san-antonio-valley'),
  ('united-states.california.central-coast.san-benito'),
  ('united-states.california.central-coast.san-benito.cienega-valley'),
  ('united-states.california.central-coast.san-benito.cienega-valley.lime-kiln-valley'),
  ('united-states.california.central-coast.san-benito.paicines'),
  ('united-states.california.central-coast.san-francisco-bay.contra-costa'),
  ('united-states.california.central-coast.san-francisco-bay.lamorinda'),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley'),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.pacheco-pass'),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.san-ysidro-district'),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains.ben-lomond-mountain'),
  ('united-states.california.central-coast.york-mountain'),
  ('united-states.california.central-valley.capay-valley'),
  ('united-states.california.central-valley.clarksburg'),
  ('united-states.california.central-valley.clarksburg.merritt-island'),
  ('united-states.california.central-valley.diablo-grande'),
  ('united-states.california.central-valley.dunnigan-hills'),
  ('united-states.california.central-valley.madera'),
  ('united-states.california.central-valley.paulsell-valley'),
  ('united-states.california.central-valley.river-junction'),
  ('united-states.california.central-valley.salado-creek'),
  ('united-states.california.central-valley.tracy-hills'),
  ('united-states.california.central-valley.winters-highlands'),
  ('united-states.california.comptche'),
  ('united-states.california.covelo'),
  ('united-states.california.cucamonga-valley'),
  ('united-states.california.dos-rios'),
  ('united-states.california.inwood-valley'),
  ('united-states.california.leona-valley'),
  ('united-states.california.malibu-coast'),
  ('united-states.california.malibu-coast.malibu-newton-canyon'),
  ('united-states.california.malibu-coast.saddle-rock-malibu'),
  ('united-states.california.manton-valley'),
  ('united-states.california.north-coast.benmore-valley'),
  ('united-states.california.north-coast.clear-lake.big-valley-district-lake-county'),
  ('united-states.california.north-coast.clear-lake.kelsey-bench-lake-county'),
  ('united-states.california.north-coast.clear-lake.upper-lake-valley'),
  ('united-states.california.north-coast.cole-ranch'),
  ('united-states.california.north-coast.eagle-peak-mendocino-county'),
  ('united-states.california.north-coast.guenoc-valley'),
  ('united-states.california.north-coast.high-valley'),
  ('united-states.california.north-coast.long-valley-lake-county'),
  ('united-states.california.north-coast.mendocino.mcdowell-valley'),
  ('united-states.california.north-coast.mendocino.potter-valley'),
  ('united-states.california.north-coast.mendocino.redwood-valley'),
  ('united-states.california.north-coast.mendocino.yorkville-highlands'),
  ('united-states.california.north-coast.solano-county-green-valley'),
  ('united-states.california.north-coast.suisun-valley'),
  ('united-states.california.palos-verdes-peninsula'),
  ('united-states.california.seiad-valley'),
  ('united-states.california.sierra-foothills.north-yuba'),
  ('united-states.california.sierra-pelona-valley'),
  ('united-states.california.south-coast.ramona-valley'),
  ('united-states.california.south-coast.san-luis-rey'),
  ('united-states.california.south-coast.san-pasqual-valley'),
  ('united-states.california.squaw-valley-miramonte'),
  ('united-states.california.tehachapi-mountains'),
  ('united-states.california.trinity-lakes'),
  ('united-states.california.willow-creek'),
  ('united-states.california.yucaipa-valley');

do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1;
  if v_text is not null then raise exception 'US-3 rest unpublish: not VERIFIED with one current boundary: %', v_text; end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.canonical_key not in (select key from _us3_known)
     and (p.publication_status = 'VERIFIED'
          or exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current));
  if v_text is not null then raise exception 'US-3 rest unpublish: a later batch is live (unpublish it first): %', v_text; end if;
  select string_agg(a.name, ', ' order by a.name) into v_text
    from public.wine_archetypes a
   where (a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us3_rb))
          or exists (select 1 from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
                      where x.archetype_id = a.id and p.canonical_key in (select key from _us3_rb)));
  if v_text is not null then
    raise exception 'US-3 rest unpublish: an archetype not in the links file is placed on this batch (re-point it first): %', v_text;
  end if;
end $$;

update public.wine_place_boundaries b
   set is_current = false
  from public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb) and b.is_current;
update public.wine_places p
   set publication_status = 'DRAFT', updated_at = now()
 where p.canonical_key in (select key from _us3_rb);

do $$
declare n int;
begin
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.publication_status = 'VERIFIED';
  if n <> 0 then raise exception 'US-3 rest unpublish: % VERIFIED places of this batch left', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and b.is_current;
  if n <> 0 then raise exception 'US-3 rest unpublish: % current boundaries left', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.canonical_key_locked_at is not null;
  if n <> 64 then raise exception 'US-3 rest unpublish: % of 64 keys still locked (they never unlock)', n; end if;
  select count(*) into n from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception 'US-3 rest unpublish: % archetype placements on this batch left', n; end if;
  select count(*) into n from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception 'US-3 rest unpublish: % archetypes still at home on this batch', n; end if;
end $$;

do $$
declare
  t0 timestamptz := clock_timestamp();
  v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice 'US-3 rest unpublish: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
