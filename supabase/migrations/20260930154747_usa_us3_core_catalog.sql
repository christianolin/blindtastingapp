-- USA on the wine map, phase US-3 core batch: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-3;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 3).
--
-- Inserts the 86 California AVAs of the US-3 core batch DRAFT
-- (APPELLATION, AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-california-tree.json. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; us3-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs every US-2 place VERIFIED (the US-2 promote is live).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us3-core and flip in 20260930174747.
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
  ('united-states.california.central-coast.alisos-canyon', 'alisos-canyon', 'Alisos Canyon', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.carmel-valley', 'carmel-valley', 'Carmel Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.gabilan-mountains', 'gabilan-mountains', 'Gabilan Mountains', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.gabilan-mountains.chalone', 'chalone', 'Chalone', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.gabilan-mountains', 4),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan', 'mt-harlan', 'Mt. Harlan', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.gabilan-mountains', 4),
  ('united-states.california.central-coast.monterey', 'monterey', 'Monterey', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.monterey.arroyo-seco', 'arroyo-seco', 'Arroyo Seco', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.monterey', 4),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands', 'santa-lucia-highlands', 'Santa Lucia Highlands', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.california.central-coast.monterey', 4),
  ('united-states.california.central-coast.paso-robles', 'paso-robles', 'Paso Robles', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.paso-robles.adelaida-district', 'adelaida-district', 'Adelaida District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.creston-district', 'creston-district', 'Creston District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.el-pomar-district', 'el-pomar-district', 'El Pomar District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district', 'paso-robles-estrella-district', 'Paso Robles Estrella District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district', 'paso-robles-geneseo-district', 'Paso Robles Geneseo District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district', 'paso-robles-highlands-district', 'Paso Robles Highlands District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 60, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district', 'paso-robles-willow-creek-district', 'Paso Robles Willow Creek District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 70, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.san-juan-creek', 'san-juan-creek', 'San Juan Creek', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 80, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.san-miguel-district', 'san-miguel-district', 'San Miguel District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 90, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch', 'santa-margarita-ranch', 'Santa Margarita Ranch', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 100, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district', 'templeton-gap-district', 'Templeton Gap District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 110, 'united-states.california.central-coast.paso-robles', 4),
  ('united-states.california.central-coast.san-francisco-bay', 'san-francisco-bay', 'San Francisco Bay', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 80, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley', 'livermore-valley', 'Livermore Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast.san-francisco-bay', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 'santa-cruz-mountains', 'Santa Cruz Mountains', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.california.central-coast.san-francisco-bay', 4),
  ('united-states.california.central-coast.san-luis-obispo-coast', 'san-luis-obispo-coast', 'San Luis Obispo Coast', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 90, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley', 'arroyo-grande-valley', 'Arroyo Grande Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.san-luis-obispo-coast', 4),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley', 'edna-valley', 'Edna Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.san-luis-obispo-coast', 4),
  ('united-states.california.central-coast.santa-maria-valley', 'santa-maria-valley', 'Santa Maria Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 100, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.santa-ynez-valley', 'santa-ynez-valley', 'Santa Ynez Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 110, 'united-states.california.central-coast', 3),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon', 'ballard-canyon', 'Ballard Canyon', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.central-coast.santa-ynez-valley', 4),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara', 'happy-canyon-of-santa-barbara', 'Happy Canyon of Santa Barbara', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.central-coast.santa-ynez-valley', 4),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district', 'los-olivos-district', 'Los Olivos District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.central-coast.santa-ynez-valley', 4),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills', 'sta-rita-hills', 'Sta. Rita Hills', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.central-coast.santa-ynez-valley', 4),
  ('united-states.california.central-valley.lodi', 'lodi', 'Lodi', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 50, 'united-states.california.central-valley', 3),
  ('united-states.california.central-valley.lodi.alta-mesa', 'alta-mesa', 'Alta Mesa', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.borden-ranch', 'borden-ranch', 'Borden Ranch', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.clements-hills', 'clements-hills', 'Clements Hills', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.cosumnes-river', 'cosumnes-river', 'Cosumnes River', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.jahant', 'jahant', 'Jahant', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.mokelumne-river', 'mokelumne-river', 'Mokelumne River', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 60, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.central-valley.lodi.sloughhouse', 'sloughhouse', 'Sloughhouse', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 70, 'united-states.california.central-valley.lodi', 4),
  ('united-states.california.el-dorado', 'el-dorado', 'El Dorado', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 80, 'united-states.california', 2),
  ('united-states.california.el-dorado.fair-play', 'fair-play', 'Fair Play', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.el-dorado', 3),
  ('united-states.california.north-coast.clear-lake', 'clear-lake', 'Clear Lake', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county', 'red-hills-lake-county', 'Red Hills Lake County', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast.clear-lake', 4),
  ('united-states.california.north-coast.fountaingrove-district', 'fountaingrove-district', 'Fountaingrove District', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.los-carneros', 'los-carneros', 'Los Carneros', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 90, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.mendocino', 'mendocino', 'Mendocino', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 100, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.mendocino.anderson-valley', 'anderson-valley', 'Anderson Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.mendocino', 4),
  ('united-states.california.north-coast.mendocino-ridge', 'mendocino-ridge', 'Mendocino Ridge', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 110, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.napa-valley', 'napa-valley', 'Napa Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 120, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.napa-valley.atlas-peak', 'atlas-peak', 'Atlas Peak', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.calistoga', 'calistoga', 'Calistoga', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.chiles-valley', 'chiles-valley', 'Chiles Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.coombsville', 'coombsville', 'Coombsville', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley', 'crystal-springs-of-napa-valley', 'Crystal Springs of Napa Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district', 'diamond-mountain-district', 'Diamond Mountain District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 60, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.howell-mountain', 'howell-mountain', 'Howell Mountain', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 70, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.mt-veeder', 'mt-veeder', 'Mt. Veeder', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 80, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley', 'oak-knoll-district-of-napa-valley', 'Oak Knoll District of Napa Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 90, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.oakville', 'oakville', 'Oakville', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 100, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.rutherford', 'rutherford', 'Rutherford', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 110, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district', 'spring-mountain-district', 'Spring Mountain District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 120, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.st-helena', 'st-helena', 'St. Helena', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 130, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.stags-leap-district', 'stags-leap-district', 'Stags Leap District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 140, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.yountville', 'yountville', 'Yountville', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 150, 'united-states.california.north-coast.napa-valley', 4),
  ('united-states.california.north-coast.northern-sonoma', 'northern-sonoma', 'Northern Sonoma', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 130, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley', 'alexander-valley', 'Alexander Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.northern-sonoma', 4),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley', 'dry-creek-valley', 'Dry Creek Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.northern-sonoma', 4),
  ('united-states.california.north-coast.northern-sonoma.knights-valley', 'knights-valley', 'Knights Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast.northern-sonoma', 4),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley', 'russian-river-valley', 'Russian River Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.california.north-coast.northern-sonoma', 4),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill', 'chalk-hill', 'Chalk Hill', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.northern-sonoma.russian-river-valley', 5),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley', 'green-valley-of-russian-river-valley', 'Green Valley of Russian River Valley', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.northern-sonoma.russian-river-valley', 5),
  ('united-states.california.north-coast.petaluma-gap', 'petaluma-gap', 'Petaluma Gap', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 140, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', 'pine-mountain-cloverdale-peak', 'Pine Mountain-Cloverdale Peak', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 150, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.rockpile', 'rockpile', 'Rockpile', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 160, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.sonoma-coast', 'sonoma-coast', 'Sonoma Coast', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 180, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 'west-sonoma-coast', 'West Sonoma Coast', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.sonoma-coast', 4),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview', 'fort-ross-seaview', 'Fort Ross-Seaview', 'APPELLATION', 5, 8, 10, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 5),
  ('united-states.california.north-coast.sonoma-valley', 'sonoma-valley', 'Sonoma Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 190, 'united-states.california.north-coast', 3),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley', 'bennett-valley', 'Bennett Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.california.north-coast.sonoma-valley', 4),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county', 'moon-mountain-district-sonoma-county', 'Moon Mountain District Sonoma County', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.california.north-coast.sonoma-valley', 4),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain', 'sonoma-mountain', 'Sonoma Mountain', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.california.north-coast.sonoma-valley', 4),
  ('united-states.california.north-coast.wild-horse-valley', 'wild-horse-valley', 'Wild Horse Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 210, 'united-states.california.north-coast', 3),
  ('united-states.california.sierra-foothills.california-shenandoah-valley', 'california-shenandoah-valley', 'California Shenandoah Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.california.sierra-foothills', 3),
  ('united-states.california.sierra-foothills.fiddletown', 'fiddletown', 'Fiddletown', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.california.sierra-foothills', 3),
  ('united-states.california.south-coast.temecula-valley', 'temecula-valley', 'Temecula Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.california.south-coast', 3);
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
  ('united-states.washington.puget-sound', true);

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception 'US-3 core catalog: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or (e.must_be_verified and p.publication_status <> 'VERIFIED');
  if v_text is not null then
    raise exception 'US-3 core catalog: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
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
  if v_text is not null then raise exception 'US-3 core catalog: rows differ from the tree report: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('APPELLATION', 86)) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 core catalog: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('2', 2), ('3', 33), ('4', 48), ('5', 3)) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 core catalog: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('united-states.california', 1), ('united-states.california.central-coast', 9), ('united-states.california.central-coast.gabilan-mountains', 2), ('united-states.california.central-coast.monterey', 2), ('united-states.california.central-coast.paso-robles', 11), ('united-states.california.central-coast.san-francisco-bay', 2), ('united-states.california.central-coast.san-luis-obispo-coast', 2), ('united-states.california.central-coast.santa-ynez-valley', 4), ('united-states.california.central-valley', 1), ('united-states.california.central-valley.lodi', 7), ('united-states.california.el-dorado', 1), ('united-states.california.north-coast', 13), ('united-states.california.north-coast.clear-lake', 1), ('united-states.california.north-coast.mendocino', 1), ('united-states.california.north-coast.napa-valley', 15), ('united-states.california.north-coast.northern-sonoma', 4), ('united-states.california.north-coast.northern-sonoma.russian-river-valley', 2), ('united-states.california.north-coast.sonoma-coast', 1), ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 1), ('united-states.california.north-coast.sonoma-valley', 3), ('united-states.california.sierra-foothills', 2), ('united-states.california.south-coast', 1)) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-3 core catalog: children per parent off: %', v_text; end if;
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
  raise notice 'US-3 core catalog: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
