-- USA on the wine map, archetype links step 2 (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md D22, §14.2; plan
-- docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 19).
--
-- Moves the 2 California typical wines from North Coast (step 1,
-- 20260930114747) to their AVAs: Napa Cabernet Sauvignon to Napa Valley, Sonoma
-- Chardonnay to Sonoma Coast (also placed on Russian River Valley). North Coast
-- and California stay as placements. Only adds placements; the pre-state must
-- be step 1 exactly, so a second run refuses. Writes wine_archetypes and
-- wine_archetype_placements only: no refresh, no tiles run. The core unpublish
-- rollback puts step 1 back. Rendered by scripts/usa-map/render-us3-sql.mjs from
-- data/wine-map/usa-us3-archetype-links.json; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

drop table if exists pg_temp._us3_links, pg_temp._us3_from;
create temp table _us3_links (
  archetype_id uuid not null, name text not null, sort_order int not null,
  appellation text not null, region text not null, from_home text not null, home_key text not null, place_key text not null,
  primary key (archetype_id, place_key)
) on commit drop;
insert into _us3_links values
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon', 88, 'Napa Valley AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.napa-valley', 'united-states.california'),
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon', 88, 'Napa Valley AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.napa-valley', 'united-states.california.north-coast'),
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon', 88, 'Napa Valley AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.napa-valley', 'united-states.california.north-coast.napa-valley'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.sonoma-coast', 'united-states.california'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.sonoma-coast', 'united-states.california.north-coast'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.sonoma-coast', 'united-states.california.north-coast.northern-sonoma.russian-river-valley'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast.sonoma-coast', 'united-states.california.north-coast.sonoma-coast');
create temp table _us3_from (archetype_id uuid not null, place_key text not null, primary key (archetype_id, place_key)) on commit drop;
insert into _us3_from values
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'united-states.california'),
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'united-states.california.north-coast'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'united-states.california'),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'united-states.california.north-coast');

-- Pre-state: step 1 exactly, no curated point, and the new places live.
do $$
declare v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, sort_order, appellation, region, from_home from _us3_links) l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places h on h.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where a.id is null or a.name <> l.name or a.sort_order <> l.sort_order
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or h.canonical_key is distinct from l.from_home
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(f.place_key order by f.place_key) from _us3_from f where f.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: pre-state is not step 1 for % (applied twice, or step 1 is not live)', v_text;
  end if;

  select string_agg(distinct l.place_key, ', ') into v_text
    from _us3_links l left join public.wine_places p on p.canonical_key = l.place_key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v_text is not null then
    raise exception 'US archetype links step 2: % is not VERIFIED with a current boundary (apply after the US-3 core promote)', v_text;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$select string_agg(a.name, ', ') from public.wine_archetypes a
                 where a.id in (select archetype_id from _us3_links) and a.display_lon is not null$q$ into v_text;
    if v_text is not null then
      raise exception 'US archetype links step 2: % carries a curated display point', v_text;
    end if;
  end if;
end $$;

update public.wine_archetypes a
   set wine_place_id = p.id
  from (select distinct archetype_id, home_key from _us3_links) l
  join public.wine_places p on p.canonical_key = l.home_key
 where a.id = l.archetype_id;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _us3_links l join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- Post-state, same transaction.
do $$
declare n int; v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, home_key, appellation, region from _us3_links) l
    join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where p.canonical_key is distinct from l.home_key
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(k.place_key order by k.place_key) from _us3_links k where k.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: home, placements or scoring fields wrong for %', v_text;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$select count(*)::int from public.wine_archetypes
                where display_lon is not null and wine_place_id is not null$q$ into n;
    if n <> 0 then raise exception 'US archetype links step 2: % placed archetypes carry a curated display point', n; end if;
  end if;

  with recursive chain as (
    select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
      from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
    union all
    select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
      from chain c join public.wine_places p on p.id = c.primary_parent_id where c.depth < 8
  ),
  reg as (
    select distinct on (archetype_id) archetype_id, place_id, canonical_key
      from chain where kind = 'REGION' order by archetype_id, depth
  )
  select string_agg(format('%s (%s)', a.name, r.canonical_key), '; ') into v_text
    from reg r join public.wine_archetypes a on a.id = r.archetype_id
   where r.canonical_key <> 'france.bourgogne'
     and not exists (select 1 from public.wine_archetype_placements x
                      where x.archetype_id = r.archetype_id and x.wine_place_id = r.place_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
end $$;
