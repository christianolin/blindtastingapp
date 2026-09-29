-- USA on the wine map, phase US-2: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 2).
--
-- Inserts the 16 US-2 places DRAFT: the united-states COUNTRY, the four wave
-- states (REGION, tier 1, one tile shard each), their umbrella AVAs (SUBREGION,
-- AVA/regional) and Central Valley, a navigation node that is not an AVA (D25).
-- Every row is rendered from the committed tree reports
-- (data/wine-map/usa-*-tree.json) by scripts/usa-map/render-us2-sql.mjs, and
-- us2-sql.test.mjs proves this file equals that render. Do not hand-edit.
--
-- DRAFT places are invisible to the app ("wine places verified read") and to
-- the tiles export (VERIFIED only). Boundaries are staged by
-- scripts/wine-map-sources/stage-usa-ava.mjs and everything flips at once in
-- 20260930104747_usa_us2_promote.sql (D11, D12).
--
-- A migration that writes wine_places ends with the neighbour refresh in the
-- same transaction (CLAUDE.md standing rule). DRAFT places have no current
-- boundary, so they are never a neighbour and the cache comes back fresh.
--
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us2_catalog;
create temp table _us2_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text, depth int not null
) on commit drop;
insert into _us2_catalog values
  ('united-states', 'united-states', 'United States', 'COUNTRY', 0, 1.5, 2, false, null, null, 140, null, 0),
  ('united-states.california', 'california', 'California', 'REGION', 1, 4, 4, false, null, null, 10, 'united-states', 1),
  ('united-states.california.central-coast', 'central-coast', 'Central Coast', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 20, 'united-states.california', 2),
  ('united-states.california.central-valley', 'central-valley', 'Central Valley', 'SUBREGION', 2, 5, 5, false, null, null, 30, 'united-states.california', 2),
  ('united-states.california.north-coast', 'north-coast', 'North Coast', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 130, 'united-states.california', 2),
  ('united-states.california.sierra-foothills', 'sierra-foothills', 'Sierra Foothills', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 160, 'united-states.california', 2),
  ('united-states.california.south-coast', 'south-coast', 'South Coast', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 180, 'united-states.california', 2),
  ('united-states.new-york', 'new-york', 'New York', 'REGION', 1, 4, 4, false, null, null, 20, 'united-states', 1),
  ('united-states.new-york.finger-lakes', 'finger-lakes', 'Finger Lakes', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 20, 'united-states.new-york', 2),
  ('united-states.new-york.long-island', 'long-island', 'Long Island', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 40, 'united-states.new-york', 2),
  ('united-states.oregon', 'oregon', 'Oregon', 'REGION', 1, 4, 4, false, null, null, 30, 'united-states', 1),
  ('united-states.oregon.southern-oregon', 'southern-oregon', 'Southern Oregon', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 20, 'united-states.oregon', 2),
  ('united-states.oregon.willamette-valley', 'willamette-valley', 'Willamette Valley', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 40, 'united-states.oregon', 2),
  ('united-states.washington', 'washington', 'Washington', 'REGION', 1, 4, 4, false, null, null, 40, 'united-states', 1),
  ('united-states.washington.columbia-valley', 'columbia-valley', 'Columbia Valley', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 10, 'united-states.washington', 2),
  ('united-states.washington.puget-sound', 'puget-sound', 'Puget Sound', 'SUBREGION', 2, 5, 5, true, 'AVA', 'regional', 20, 'united-states.washington', 2);

do $$
begin
  if exists (select 1 from public.wine_places where canonical_key = 'united-states' or canonical_key like 'united-states.%') then
    raise exception 'US-2 catalog: united-states places already exist';
  end if;
end $$;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us2_catalog v
  left join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 0
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us2_catalog v
  left join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 1
 order by v.sort_order, v.key;

insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us2_catalog v
  left join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = 2
 order by v.sort_order, v.key;

do $$
declare
  n int;
  v_text text;
begin
  select count(*) into n from public.wine_places where canonical_key = 'united-states' or canonical_key like 'united-states.%';
  if n <> 16 then
    raise exception 'US-2 catalog: expected 16 united-states places, got %', n;
  end if;

  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us2_catalog v
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
  if v_text is not null then
    raise exception 'US-2 catalog: rows differ from the tree reports: %', v_text;
  end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('COUNTRY', 1), ('REGION', 4), ('SUBREGION', 11)) e(kind, n)
    left join (select kind::text as kind, count(*)::int as n from public.wine_places
                where canonical_key = 'united-states' or canonical_key like 'united-states.%' group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: kind counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ('united-states', 4), ('united-states.california', 5), ('united-states.new-york', 2), ('united-states.oregon', 2), ('united-states.washington', 2)) e(parent, n)
    left join (select pp.canonical_key as parent, count(*)::int as n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                where p.canonical_key like 'united-states.%' group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: children per parent off: %', v_text; end if;
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
  raise notice 'US-2 catalog: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
