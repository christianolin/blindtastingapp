-- USA on the wine map, phase US-2 ROLLBACK: unpublish (a roll forward after the promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 11).
--
-- Takes the 16 US-2 places off the map without touching their locked keys:
-- archetype links first (their placements on US places deleted, their homes set
-- to null, and R2's curated display point restored where the links cleared it),
-- then every US boundary non-current and every US place DRAFT, then the checked
-- refresh. Boundaries, relationships and knowledge stay, for a later re-promote.
-- THEN DISPATCH A NEW TILES RELEASE FROM MASTER (promote=true), and
-- never roll back the manifest (§17.3): that would remove other people's newer
-- places.
--
-- Deliberately outside supabase/migrations/: a replay must never run it. Apply
-- with the owner's applier (--check, --dry, then no flag). Rendered by
-- scripts/usa-map/render-us2-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us2_rb;
create temp table _us2_rb (key text primary key, depth int not null) on commit drop;
insert into _us2_rb values
  ('united-states', 0),
  ('united-states.california', 1),
  ('united-states.california.central-coast', 2),
  ('united-states.california.central-valley', 2),
  ('united-states.california.north-coast', 2),
  ('united-states.california.sierra-foothills', 2),
  ('united-states.california.south-coast', 2),
  ('united-states.new-york', 1),
  ('united-states.new-york.finger-lakes', 2),
  ('united-states.new-york.long-island', 2),
  ('united-states.oregon', 1),
  ('united-states.oregon.southern-oregon', 2),
  ('united-states.oregon.willamette-valley', 2),
  ('united-states.washington', 1),
  ('united-states.washington.columbia-valley', 2),
  ('united-states.washington.puget-sound', 2);

do $$
declare v_text text;
begin
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
     and p.canonical_key not in (select key from _us2_rb);
  if v_text is not null then
    raise exception 'US-2 unpublish: a later US wave exists: write its own rollback (%)', v_text;
  end if;
end $$;

drop table if exists pg_temp._us2_points;
create temp table _us2_points (archetype_id uuid primary key, display_lon double precision not null,
  display_lat double precision not null) on commit drop;
insert into _us2_points values
  ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, -122.4, 38.43),
  ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, -122.82, 38.4),
  ('bab8537e-b0bc-4f7c-8547-242537322f8a'::uuid, -123.03, 45.28);

do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1;
  if v_text is not null then raise exception 'US-2 unpublish: not VERIFIED with one current boundary: %', v_text; end if;
end $$;

-- Archetype links first: a typical wine never points at a DRAFT place.
drop table if exists pg_temp._us2_unlinked;
create temp table _us2_unlinked on commit drop as
select a.id from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
 where p.canonical_key in (select key from _us2_rb);
delete from public.wine_archetype_placements x
 using public.wine_places p
 where p.id = x.wine_place_id and p.canonical_key in (select key from _us2_rb);
update public.wine_archetypes a
   set wine_place_id = null
  from public.wine_places p
 where p.id = a.wine_place_id and p.canonical_key in (select key from _us2_rb);
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2 then
    execute $q$
      update public.wine_archetypes a
         set display_lon = pt.display_lon, display_lat = pt.display_lat
        from _us2_points pt
       where a.id = pt.archetype_id and a.id in (select id from _us2_unlinked)
         and a.wine_place_id is null and a.display_lon is null$q$;
  end if;
end $$;

update public.wine_place_boundaries b
   set is_current = false
  from public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us2_rb) and b.is_current;
update public.wine_places p
   set publication_status = 'DRAFT', updated_at = now()
 where p.canonical_key in (select key from _us2_rb);

do $$
declare n int;
begin
  select count(*) into n from public.wine_places
   where (canonical_key = 'united-states' or canonical_key like 'united-states.%') and publication_status = 'VERIFIED';
  if n <> 0 then raise exception 'US-2 unpublish: % VERIFIED US places left', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us2_rb) and b.is_current;
  if n <> 0 then raise exception 'US-2 unpublish: % current US boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where p.canonical_key in (select key from _us2_rb) and p.canonical_key_locked_at is not null;
  if n <> 16 then raise exception 'US-2 unpublish: % of 16 keys still locked (they never unlock)', n; end if;
  select count(*) into n from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key in (select key from _us2_rb);
  if n <> 0 then raise exception 'US-2 unpublish: % archetype placements on US places left', n; end if;
  select count(*) into n from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
   where p.canonical_key in (select key from _us2_rb);
  if n <> 0 then raise exception 'US-2 unpublish: % archetypes still at home on a US place', n; end if;
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
  raise notice 'US-2 unpublish: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
