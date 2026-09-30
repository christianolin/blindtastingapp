-- USA on the wine map, phase US-3 rest batch: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-3;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 3).
--
-- Inserts the 64 California AVAs of the US-3 rest batch DRAFT
-- (APPELLATION, AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-california-tree.json. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; us3-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs every US-2 place VERIFIED and every core place present (the core catalog applied; the core promote need not be live yet).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us3-rest and flip in 20260930214747.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us3_catalog, pg_temp._us3_prior;
create temp table _us3_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us3_catalog values
  ('united-states.california.antelope-valley-of-the-california-high-desert', 'antelope-valley-of-the-california-high-desert', 'Antelope Valley of the California High Desert', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 10, 'united-states.california', 2),
  ('united-states.california.central-coast.monterey.hames-valley', 'hames-valley', 'Hames Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.monterey', 4),
  ('united-states.california.central-coast.monterey.san-bernabe', 'san-bernabe', 'San Bernabe', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast.monterey', 4),
  ('united-states.california.central-coast.monterey.san-lucas', 'san-lucas', 'San Lucas', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.central-coast.monterey', 4),
  ('united-states.california.central-coast.san-antonio-valley', 'san-antonio-valley', 'San Antonio Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 60, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.san-benito', 'san-benito', 'San Benito', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 70, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.san-benito.cienega-valley', 'cienega-valley', 'Cienega Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-benito', 4),
  ('united-states.california.central-coast.san-benito.cienega-valley.lime-kiln-valley', 'lime-kiln-valley', 'Lime Kiln Valley', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-benito.cienega-valley', 5),
  ('united-states.california.central-coast.san-benito.paicines', 'paicines', 'Paicines', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.san-benito', 4),
  ('united-states.california.central-coast.san-francisco-bay.lamorinda', 'lamorinda', 'Lamorinda', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-francisco-bay', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 'santa-clara-valley', 'Santa Clara Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast.san-francisco-bay', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.pacheco-pass', 'pacheco-pass', 'Pacheco Pass', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 5),
  ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley.san-ysidro-district', 'san-ysidro-district', 'San Ysidro District', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 5),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains.ben-lomond-mountain', 'ben-lomond-mountain', 'Ben Lomond Mountain', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 5),
  ('united-states.california.central-coast.york-mountain', 'york-mountain', 'York Mountain', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 120, 'united-states.california.central-coast', 3),
  ('united-states.california.central-valley.capay-valley', 'capay-valley', 'Capay Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 10, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.clarksburg', 'clarksburg', 'Clarksburg', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 20, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.clarksburg.merritt-island', 'merritt-island', 'Merritt Island', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.central-valley.clarksburg', 4),
  ('united-states.california.central-valley.diablo-grande', 'diablo-grande', 'Diablo Grande', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 30, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.dunnigan-hills', 'dunnigan-hills', 'Dunnigan Hills', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 40, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.madera', 'madera', 'Madera', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 60, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.paulsell-valley', 'paulsell-valley', 'Paulsell Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 70, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.river-junction', 'river-junction', 'River Junction', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 80, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.salado-creek', 'salado-creek', 'Salado Creek', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 90, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.tracy-hills', 'tracy-hills', 'Tracy Hills', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 100, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.winters-highlands', 'winters-highlands', 'Winters Highlands', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 110, 'united-states.california.central-valley', 3),
  ('united-states.california.contra-costa', 'contra-costa', 'Contra Costa', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 40, 'united-states.california', 2),
  ('united-states.california.covelo', 'covelo', 'Covelo', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 50, 'united-states.california', 2),
  ('united-states.california.cucamonga-valley', 'cucamonga-valley', 'Cucamonga Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 60, 'united-states.california', 2),
  ('united-states.california.dos-rios', 'dos-rios', 'Dos Rios', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 70, 'united-states.california', 2),
  ('united-states.california.inwood-valley', 'inwood-valley', 'Inwood Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 90, 'united-states.california', 2),
  ('united-states.california.leona-valley', 'leona-valley', 'Leona Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 100, 'united-states.california', 2),
  ('united-states.california.malibu-coast', 'malibu-coast', 'Malibu Coast', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 110, 'united-states.california', 2),
  ('united-states.california.malibu-coast.malibu-newton-canyon', 'malibu-newton-canyon', 'Malibu-Newton Canyon', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.malibu-coast', 3),
  ('united-states.california.malibu-coast.saddle-rock-malibu', 'saddle-rock-malibu', 'Saddle Rock-Malibu', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.malibu-coast', 3),
  ('united-states.california.manton-valley', 'manton-valley', 'Manton Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 120, 'united-states.california', 2),
  ('united-states.california.north-coast.benmore-valley', 'benmore-valley', 'Benmore Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.clear-lake.big-valley-district-lake-county', 'big-valley-district-lake-county', 'Big Valley District-Lake County', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.clear-lake', 4),
  ('united-states.california.north-coast.clear-lake.kelsey-bench-lake-county', 'kelsey-bench-lake-county', 'Kelsey Bench-Lake County', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.clear-lake', 4),
  ('united-states.california.north-coast.clear-lake.upper-lake-valley', 'upper-lake-valley', 'Upper Lake Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.north-coast.clear-lake', 4),
  ('united-states.california.north-coast.cole-ranch', 'cole-ranch', 'Cole Ranch', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.comptche', 'comptche', 'Comptche', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.eagle-peak-mendocino-county', 'eagle-peak-mendocino-county', 'Eagle Peak Mendocino County', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.guenoc-valley', 'guenoc-valley', 'Guenoc Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 70, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.high-valley', 'high-valley', 'High Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 80, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.long-valley-lake-county', 'long-valley-lake-county', 'Long Valley-Lake County', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 90, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.mendocino.mcdowell-valley', 'mcdowell-valley', 'McDowell Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.mendocino', 4),
  ('united-states.california.north-coast.mendocino.potter-valley', 'potter-valley', 'Potter Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast.mendocino', 4),
  ('united-states.california.north-coast.mendocino.redwood-valley', 'redwood-valley', 'Redwood Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.north-coast.mendocino', 4),
  ('united-states.california.north-coast.mendocino.yorkville-highlands', 'yorkville-highlands', 'Yorkville Highlands', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.california.north-coast.mendocino', 4),
  ('united-states.california.north-coast.solano-county-green-valley', 'solano-county-green-valley', 'Solano County Green Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 180, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.suisun-valley', 'suisun-valley', 'Suisun Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 210, 'united-states.california.north-coast', 3),
  ('united-states.california.palos-verdes-peninsula', 'palos-verdes-peninsula', 'Palos Verdes Peninsula', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 140, 'united-states.california', 2),
  ('united-states.california.seiad-valley', 'seiad-valley', 'Seiad Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 150, 'united-states.california', 2),
  ('united-states.california.sierra-foothills.north-yuba', 'north-yuba', 'North Yuba', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.california.sierra-foothills', 3),
  ('united-states.california.sierra-pelona-valley', 'sierra-pelona-valley', 'Sierra Pelona Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 170, 'united-states.california', 2),
  ('united-states.california.south-coast.ramona-valley', 'ramona-valley', 'Ramona Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.south-coast', 3),
  ('united-states.california.south-coast.san-luis-rey', 'san-luis-rey', 'San Luis Rey', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.south-coast', 3),
  ('united-states.california.south-coast.san-pasqual-valley', 'san-pasqual-valley', 'San Pasqual Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.california.south-coast', 3),
  ('united-states.california.squaw-valley-miramonte', 'squaw-valley-miramonte', 'Squaw Valley-Miramonte', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 190, 'united-states.california', 2),
  ('united-states.california.tehachapi-mountains', 'tehachapi-mountains', 'Tehachapi Mountains', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 200, 'united-states.california', 2),
  ('united-states.california.trinity-lakes', 'trinity-lakes', 'Trinity Lakes', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 210, 'united-states.california', 2),
  ('united-states.california.willow-creek', 'willow-creek', 'Willow Creek', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 220, 'united-states.california', 2),
  ('united-states.california.yucaipa-valley', 'yucaipa-valley', 'Yucaipa Valley', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 230, 'united-states.california', 2);
create temp table _us3_prior (key text primary key, must_be_verified boolean not null) on commit drop;
insert into _us3_prior values
  ('united-states', true),
  ('united-states.california', true),
  ('united-states.california.central-coast', true),
  ('united-states.california.central-valley', true),
  ('united-states.california.north-coast', true),
  ('united-states.california.sierra-foothills', true),
  ('united-states.california.south-coast', true),
  ('united-states.new-york', true),
  ('united-states.new-york.finger-lakes', true),
  ('united-states.new-york.long-island', true),
  ('united-states.oregon', true),
  ('united-states.oregon.southern-oregon', true),
  ('united-states.oregon.willamette-valley', true),
  ('united-states.washington', true),
  ('united-states.washington.columbia-valley', true),
  ('united-states.washington.puget-sound', true),
  ('united-states.california.central-coast.alisos-canyon', false),
  ('united-states.california.central-coast.carmel-valley', false),
  ('united-states.california.central-coast.gabilan-mountains', false),
  ('united-states.california.central-coast.gabilan-mountains.chalone', false),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan', false),
  ('united-states.california.central-coast.monterey', false),
  ('united-states.california.central-coast.monterey.arroyo-seco', false),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands', false),
  ('united-states.california.central-coast.paso-robles', false),
  ('united-states.california.central-coast.paso-robles.adelaida-district', false),
  ('united-states.california.central-coast.paso-robles.creston-district', false),
  ('united-states.california.central-coast.paso-robles.el-pomar-district', false),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district', false),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district', false),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district', false),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district', false),
  ('united-states.california.central-coast.paso-robles.san-juan-creek', false),
  ('united-states.california.central-coast.paso-robles.san-miguel-district', false),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch', false),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district', false),
  ('united-states.california.central-coast.san-francisco-bay', false),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley', false),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', false),
  ('united-states.california.central-coast.san-luis-obispo-coast', false),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley', false),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley', false),
  ('united-states.california.central-coast.santa-maria-valley', false),
  ('united-states.california.central-coast.santa-ynez-valley', false),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon', false),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara', false),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district', false),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills', false),
  ('united-states.california.central-valley.lodi', false),
  ('united-states.california.central-valley.lodi.alta-mesa', false),
  ('united-states.california.central-valley.lodi.borden-ranch', false),
  ('united-states.california.central-valley.lodi.clements-hills', false),
  ('united-states.california.central-valley.lodi.cosumnes-river', false),
  ('united-states.california.central-valley.lodi.jahant', false),
  ('united-states.california.central-valley.lodi.mokelumne-river', false),
  ('united-states.california.central-valley.lodi.sloughhouse', false),
  ('united-states.california.el-dorado', false),
  ('united-states.california.el-dorado.fair-play', false),
  ('united-states.california.north-coast.clear-lake', false),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county', false),
  ('united-states.california.north-coast.fountaingrove-district', false),
  ('united-states.california.north-coast.los-carneros', false),
  ('united-states.california.north-coast.mendocino', false),
  ('united-states.california.north-coast.mendocino.anderson-valley', false),
  ('united-states.california.north-coast.mendocino-ridge', false),
  ('united-states.california.north-coast.napa-valley', false),
  ('united-states.california.north-coast.napa-valley.atlas-peak', false),
  ('united-states.california.north-coast.napa-valley.calistoga', false),
  ('united-states.california.north-coast.napa-valley.chiles-valley', false),
  ('united-states.california.north-coast.napa-valley.coombsville', false),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley', false),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district', false),
  ('united-states.california.north-coast.napa-valley.howell-mountain', false),
  ('united-states.california.north-coast.napa-valley.mt-veeder', false),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley', false),
  ('united-states.california.north-coast.napa-valley.oakville', false),
  ('united-states.california.north-coast.napa-valley.rutherford', false),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district', false),
  ('united-states.california.north-coast.napa-valley.st-helena', false),
  ('united-states.california.north-coast.napa-valley.stags-leap-district', false),
  ('united-states.california.north-coast.napa-valley.yountville', false),
  ('united-states.california.north-coast.northern-sonoma', false),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley', false),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley', false),
  ('united-states.california.north-coast.northern-sonoma.knights-valley', false),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley', false),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill', false),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley', false),
  ('united-states.california.north-coast.petaluma-gap', false),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', false),
  ('united-states.california.north-coast.rockpile', false),
  ('united-states.california.north-coast.sonoma-coast', false),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast', false),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview', false),
  ('united-states.california.north-coast.sonoma-valley', false),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley', false),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county', false),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain', false),
  ('united-states.california.north-coast.wild-horse-valley', false),
  ('united-states.california.sierra-foothills.california-shenandoah-valley', false),
  ('united-states.california.sierra-foothills.fiddletown', false),
  ('united-states.california.south-coast.temecula-valley', false);

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception 'US-3 rest catalog: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or (e.must_be_verified and p.publication_status <> 'VERIFIED');
  if v_text is not null then
    raise exception 'US-3 rest catalog: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 2
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 3
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 4
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 5
 order by v.sort_order, v.key;

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v
    left join public.wine_places p on p.canonical_key = v.key
    left join public.wine_places pp on pp.id = p.primary_parent_id
   where p.id is null
      or p.kind::text <> v.kind or p.name <> v.name or p.slug <> v.slug
      or p.display_tier <> v.tier or p.min_zoom <> v.min_zoom or p.label_min_zoom <> v.label_min_zoom
      or p.is_appellation <> v.is_app
      or p.appellation_system is distinct from v.system
      or p.appellation_level is distinct from v.level
      or p.sort_order <> v.sort_order
      or p.publication_status <> 'DRAFT'
      or pp.canonical_key is distinct from v.parent_key;
  if v_text is not null then raise exception 'US-3 rest catalog: rows differ from the tree report: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('APPELLATION', 64)) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 rest catalog: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('2', 27), ('3', 19), ('4', 14), ('5', 4)) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 rest catalog: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('united-states.california', 17), ('united-states.california.central-coast', 3), ('united-states.california.central-coast.monterey', 3), ('united-states.california.central-coast.san-benito', 2), ('united-states.california.central-coast.san-benito.cienega-valley', 1), ('united-states.california.central-coast.san-francisco-bay', 2), ('united-states.california.central-coast.san-francisco-bay.santa-clara-valley', 2), ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 1), ('united-states.california.central-valley', 10), ('united-states.california.central-valley.clarksburg', 1), ('united-states.california.malibu-coast', 2), ('united-states.california.north-coast', 9), ('united-states.california.north-coast.clear-lake', 3), ('united-states.california.north-coast.mendocino', 4), ('united-states.california.sierra-foothills', 1), ('united-states.california.south-coast', 3)) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 rest catalog: children per parent off: %', v_text; end if;
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
  raise notice 'US-3 rest catalog: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
