-- Promote the Franken boundary staged by stage-germany-weinbau.mjs.
--
-- The band is on hectares_planted, the vineyard extent measured BEFORE the
-- morphological close, not on the geometry's own area. The stored geometry is
-- the closed outline and its area is inflated by design, so measuring it would
-- check the buffer rather than the data. Planted hectares is what moves if the
-- clip goes wrong:
--
--   the clip fails open   the footprint becomes the whole-Gemeinde union. Those
--                         138 Gemeinden span twelve Landkreise from
--                         Aschaffenburg to Bamberg -- some 600 000 ha against a
--                         planted 7 000 -- so the ceiling catches it.
--   the clip fails shut   a handful of parcels survive; the floor catches it.
--
-- 7 043 ha is land use, and runs ahead of the roughly 6 200 ha of planted vines
-- Franken is usually credited with, exactly as Hessen's did. The band is set
-- wide enough to hold both figures and nothing like a failure.

begin;

do $$
declare
  r record;
  n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.franken'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 1 then raise exception 'expected 1 DRAFT Franken boundary, got %', n; end if;

  select b.id, b.display_geometry g,
         (b.generation_parameters->>'hectares_planted')::numeric planted,
         (b.generation_parameters->>'engine') engine,
         (b.generation_parameters->>'gemeinden_count')::int gemeinden,
         (b.generation_parameters->>'raw_parts')::int raw_parts,
         extensions.ST_NumGeometries(b.display_geometry) parts
    into r
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.franken'
     and b.quality_status = 'DRAFT' and not b.is_current;

  if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
    raise exception 'Franken: geometry invalid or empty';
  end if;
  if r.engine is distinct from 'vineyard-clip+close' then
    raise exception 'Franken: engine is %, expected vineyard-clip+close', r.engine;
  end if;
  if r.gemeinden is distinct from 138 then
    raise exception 'Franken: built from % Gemeinden, the specification names 138', r.gemeinden;
  end if;
  if r.planted is null or r.planted < 5000 or r.planted > 9000 then
    raise exception 'Franken: % planted ha is outside 5000-9000 — the vineyard clip has failed open or shut',
      r.planted;
  end if;
  if r.parts >= r.raw_parts then
    raise exception 'Franken: close left % parts from % raw — it knitted nothing together',
      r.parts, r.raw_parts;
  end if;
  -- Franken is Lower Franconia, not the Alps or the North Sea: roughly
  -- 9.0-10.8 E and 49.3-50.2 N. A clip that escaped its Gemeinden would show
  -- up here before anywhere else.
  if extensions.ST_XMin(extensions.Box3D(r.g)) < 8.5
     or extensions.ST_XMax(extensions.Box3D(r.g)) > 11.5
     or extensions.ST_YMin(extensions.Box3D(r.g)) < 48.8
     or extensions.ST_YMax(extensions.Box3D(r.g)) > 50.7 then
    raise exception 'Franken: bbox escapes Lower Franconia';
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = r.id;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.franken' and b.is_current;
  if n <> 1 then raise exception 'expected exactly 1 current Franken boundary, got %', n; end if;

  -- Germany now stands at 9 of its 13 Anbaugebiete with geometry.
  select count(*) into n
    from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 9 then raise exception 'expected 9 German Anbaugebiete with geometry, got %', n; end if;
end $$;

commit;
