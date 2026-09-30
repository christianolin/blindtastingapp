-- USA on the wine map, phase US-4: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-4;
-- plan docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md Task 4).
--
-- Inserts the 42 AVAs of Washington, Oregon and New York DRAFT (APPELLATION,
-- AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-{washington,oregon,new-york}-tree.json: one place per
-- cross-state AVA, under its map state (D6). Rendered by
-- scripts/usa-map/render-us4-sql.mjs; us4-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs the US-2 places of the three states VERIFIED (the US-2 promote is live).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us4 and flip in 20261001004747.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us4_catalog, pg_temp._us4_prior;
create temp table _us4_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us4_catalog values
  ('united-states.new-york.champlain-valley-of-new-york', 'champlain-valley-of-new-york', 'Champlain Valley of New York', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 10, 'united-states.new-york', 2),
  ('united-states.new-york.finger-lakes.cayuga-lake', 'cayuga-lake', 'Cayuga Lake', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.new-york.finger-lakes', 3),
  ('united-states.new-york.finger-lakes.seneca-lake', 'seneca-lake', 'Seneca Lake', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.new-york.finger-lakes', 3),
  ('united-states.new-york.hudson-river-region', 'hudson-river-region', 'Hudson River Region', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 30, 'united-states.new-york', 2),
  ('united-states.new-york.long-island.north-fork-of-long-island', 'north-fork-of-long-island', 'North Fork of Long Island', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.new-york.long-island', 3),
  ('united-states.new-york.long-island.the-hamptons-long-island', 'the-hamptons-long-island', 'The Hamptons, Long Island', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.new-york.long-island', 3),
  ('united-states.new-york.niagara-escarpment', 'niagara-escarpment', 'Niagara Escarpment', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 50, 'united-states.new-york', 2),
  ('united-states.new-york.upper-hudson', 'upper-hudson', 'Upper Hudson', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 60, 'united-states.new-york', 2),
  ('united-states.oregon.columbia-gorge', 'columbia-gorge', 'Columbia Gorge', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 10, 'united-states.oregon', 2),
  ('united-states.oregon.southern-oregon.rogue-valley', 'rogue-valley', 'Rogue Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.oregon.southern-oregon', 3),
  ('united-states.oregon.southern-oregon.rogue-valley.applegate-valley', 'applegate-valley', 'Applegate Valley', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.oregon.southern-oregon.rogue-valley', 4),
  ('united-states.oregon.southern-oregon.umpqua-valley', 'umpqua-valley', 'Umpqua Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.oregon.southern-oregon', 3),
  ('united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon', 'elkton-oregon', 'Elkton Oregon', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.oregon.southern-oregon.umpqua-valley', 4),
  ('united-states.oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon', 'red-hill-douglas-county-oregon', 'Red Hill Douglas County, Oregon', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.oregon.southern-oregon.umpqua-valley', 4),
  ('united-states.oregon.the-rocks-district-of-milton-freewater', 'the-rocks-district-of-milton-freewater', 'The Rocks District of Milton-Freewater', 'APPELLATION', 2, 6, 6, true, 'AVA', 'regional', 30, 'united-states.oregon', 2),
  ('united-states.oregon.willamette-valley.chehalem-mountains', 'chehalem-mountains', 'Chehalem Mountains', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.chehalem-mountains.laurelwood-district', 'laurelwood-district', 'Laurelwood District', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.oregon.willamette-valley.chehalem-mountains', 4),
  ('united-states.oregon.willamette-valley.chehalem-mountains.ribbon-ridge', 'ribbon-ridge', 'Ribbon Ridge', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.oregon.willamette-valley.chehalem-mountains', 4),
  ('united-states.oregon.willamette-valley.dundee-hills', 'dundee-hills', 'Dundee Hills', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.eola-amity-hills', 'eola-amity-hills', 'Eola-Amity Hills', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.lower-long-tom', 'lower-long-tom', 'Lower Long Tom', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.mcminnville', 'mcminnville', 'McMinnville', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.mount-pisgah-polk-county-oregon', 'mount-pisgah-polk-county-oregon', 'Mount Pisgah, Polk County, Oregon', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 60, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.tualatin-hills', 'tualatin-hills', 'Tualatin Hills', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 70, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.van-duzer-corridor', 'van-duzer-corridor', 'Van Duzer Corridor', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 80, 'united-states.oregon.willamette-valley', 3),
  ('united-states.oregon.willamette-valley.yamhill-carlton', 'yamhill-carlton', 'Yamhill-Carlton', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 90, 'united-states.oregon.willamette-valley', 3),
  ('united-states.washington.columbia-valley.ancient-lakes-of-columbia-valley', 'ancient-lakes-of-columbia-valley', 'Ancient Lakes of Columbia Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 10, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.horse-heaven-hills', 'horse-heaven-hills', 'Horse Heaven Hills', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 20, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.lake-chelan', 'lake-chelan', 'Lake Chelan', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 30, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.naches-heights', 'naches-heights', 'Naches Heights', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 40, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.rocky-reach', 'rocky-reach', 'Rocky Reach', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 50, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.royal-slope', 'royal-slope', 'Royal Slope', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 60, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.the-burn-of-columbia-valley', 'the-burn-of-columbia-valley', 'The Burn of Columbia Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 70, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.wahluke-slope', 'wahluke-slope', 'Wahluke Slope', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 80, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.walla-walla-valley', 'walla-walla-valley', 'Walla Walla Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 90, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.white-bluffs', 'white-bluffs', 'White Bluffs', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 100, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.yakima-valley', 'yakima-valley', 'Yakima Valley', 'APPELLATION', 3, 6, 7, true, 'AVA', 'subregional', 110, 'united-states.washington.columbia-valley', 3),
  ('united-states.washington.columbia-valley.yakima-valley.candy-mountain', 'candy-mountain', 'Candy Mountain', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 10, 'united-states.washington.columbia-valley.yakima-valley', 4),
  ('united-states.washington.columbia-valley.yakima-valley.goose-gap', 'goose-gap', 'Goose Gap', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 20, 'united-states.washington.columbia-valley.yakima-valley', 4),
  ('united-states.washington.columbia-valley.yakima-valley.rattlesnake-hills', 'rattlesnake-hills', 'Rattlesnake Hills', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 30, 'united-states.washington.columbia-valley.yakima-valley', 4),
  ('united-states.washington.columbia-valley.yakima-valley.red-mountain', 'red-mountain', 'Red Mountain', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 40, 'united-states.washington.columbia-valley.yakima-valley', 4),
  ('united-states.washington.columbia-valley.yakima-valley.snipes-mountain', 'snipes-mountain', 'Snipes Mountain', 'APPELLATION', 4, 7, 9, true, 'AVA', 'subregional', 50, 'united-states.washington.columbia-valley.yakima-valley', 4);
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

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception 'US-4 catalog: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED';
  if v_text is not null then
    raise exception 'US-4 catalog: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 2
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 3
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 4
 order by v.sort_order, v.key;

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v
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
  if v_text is not null then raise exception 'US-4 catalog: rows differ from the tree reports: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('APPELLATION', 42)) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-4 catalog: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('2', 6), ('3', 26), ('4', 10)) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-4 catalog: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('united-states.new-york', 4), ('united-states.new-york.finger-lakes', 2), ('united-states.new-york.long-island', 2), ('united-states.oregon', 2), ('united-states.oregon.southern-oregon', 2), ('united-states.oregon.southern-oregon.rogue-valley', 1), ('united-states.oregon.southern-oregon.umpqua-valley', 2), ('united-states.oregon.willamette-valley', 9), ('united-states.oregon.willamette-valley.chehalem-mountains', 2), ('united-states.washington.columbia-valley', 11), ('united-states.washington.columbia-valley.yakima-valley', 5)) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-4 catalog: children per parent off: %', v_text; end if;
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
  raise notice 'US-4 catalog: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
