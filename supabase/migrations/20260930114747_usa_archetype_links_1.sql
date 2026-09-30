-- USA on the wine map, archetype links step 1 (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md D22, §14.2; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 10).
--
-- Gives the 3 US typical wines a home on the map: Napa and Sonoma on North
-- Coast, Willamette on Willamette Valley, each also placed on its state's page
-- (the training-room drift guard RM9a). Each placement's sort_order is the
-- archetype's own (the live convention: the batch generator's home placement
-- and R1b's check). Matched by live id AND name; every other field asserted.
--
-- R2 (20260929150000) gave these wines a curated display point while they had
-- no map place. A placed wine never keeps one (the room's R2 check: 18 points
-- before this, 15 after, never a placed one), so this clears the three here;
-- the unpublish rollback (scripts/usa-map/usa_us2_unpublish.sql) restores them. If R2's
-- columns are gone (its rollback ran), the point steps are skipped.
--
-- Apply AFTER the US-2 promote (20260930104747): every place must be
-- VERIFIED with a current boundary, or the pre-state refuses. Writes
-- wine_archetypes and wine_archetype_placements only: no wine_places or
-- wine_place_boundaries write, no neighbour-cache refresh, no tiles run.
-- Rendered by scripts/usa-map/render-us2-sql.mjs from
-- data/wine-map/usa-us2-archetype-links.json; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

drop table if exists pg_temp._us2_links;
create temp table _us2_links (
  archetype_id uuid not null, name text not null, sort_order int not null,
  appellation text not null, region text not null, home_key text not null, place_key text not null,
  display_lon double precision not null, display_lat double precision not null,
  primary key (archetype_id, place_key)
) on commit drop;
insert into _us2_links values
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon', 88, 'Napa Valley AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast', -122.4, 38.43),
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon', 88, 'Napa Valley AVA', 'California', 'united-states.california.north-coast', 'united-states.california', -122.4, 38.43),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california.north-coast', -122.82, 38.4),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay', 89, 'Sonoma Coast AVA', 'California', 'united-states.california.north-coast', 'united-states.california', -122.82, 38.4),
  ('bab8537e-b0bc-4f7c-8547-242537322f8a'::uuid, 'A typical Willamette Pinot Noir', 90, 'Willamette Valley AVA', 'Oregon', 'united-states.oregon.willamette-valley', 'united-states.oregon.willamette-valley', -123.03, 45.28),
  ('bab8537e-b0bc-4f7c-8547-242537322f8a'::uuid, 'A typical Willamette Pinot Noir', 90, 'Willamette Valley AVA', 'Oregon', 'united-states.oregon.willamette-valley', 'united-states.oregon', -123.03, 45.28);

-- Pre-state.
do $$
declare v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, sort_order, appellation, region from _us2_links) l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where a.id is null or a.name <> l.name or a.sort_order <> l.sort_order
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or a.wine_place_id is not null
      or exists (select 1 from public.wine_archetype_placements x where x.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links: pre-state differs for %', v_text;
  end if;

  select string_agg(distinct l.place_key, ', ') into v_text
    from _us2_links l
    left join public.wine_places p on p.canonical_key = l.place_key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v_text is not null then
    raise exception 'US archetype links: % is not VERIFIED with a current boundary (apply after the US-2 promote)', v_text;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$
      select string_agg(l.name, ', ' order by l.name)
        from (select distinct archetype_id, name, display_lon, display_lat from _us2_links) l
        join public.wine_archetypes a on a.id = l.archetype_id
       where not ((a.display_lon is null and a.display_lat is null)
                  or (a.display_lon = l.display_lon and a.display_lat = l.display_lat))$q$
      into v_text;
    if v_text is not null then
      raise exception 'US archetype links: curated display point is neither R2''s nor empty for %', v_text;
    end if;
  end if;
end $$;

update public.wine_archetypes a
   set wine_place_id = p.id
  from (select distinct archetype_id, home_key from _us2_links) l
  join public.wine_places p on p.canonical_key = l.home_key
 where a.id = l.archetype_id;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _us2_links l
  join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- A placed wine has a real point: drop R2's curated one.
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$
      update public.wine_archetypes a
         set display_lon = null, display_lat = null
        from (select distinct archetype_id from _us2_links) l
       where a.id = l.archetype_id and a.display_lon is not null$q$;
  end if;
end $$;

-- Post-state, same transaction.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_archetype_placements x
    join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%';
  if n <> 6 then
    raise exception 'US archetype links: % placements on united-states places, expected 6', n;
  end if;

  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, home_key, appellation, region from _us2_links) l
    join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where p.canonical_key is distinct from l.home_key
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or (select array_agg(pp.canonical_key order by pp.canonical_key)
            from public.wine_archetype_placements x join public.wine_places pp on pp.id = x.wine_place_id
           where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(k.place_key order by k.place_key) from _us2_links k where k.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links: home, placements or scoring fields wrong for %', v_text;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$select count(*)::int from public.wine_archetypes
                where display_lon is not null and wine_place_id is not null$q$ into n;
    if n <> 0 then
      raise exception 'US archetype links: % placed archetypes still carry a curated display point', n;
    end if;
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
    raise exception 'US archetype links: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
end $$;
