-- Promote the Saale-Unstrut boundary staged by stage-germany-weinbau.mjs.
--
-- Same shape of check as 20260913180000 promoted Franken with, and the same
-- reasoning: the band is on hectares_planted, the vineyard extent measured
-- BEFORE the morphological close, because the stored geometry is the closed
-- outline and its area is inflated on purpose. Measuring the geometry would
-- check the buffer rather than the data.
--
--   the clip fails open   the footprint becomes the union of ten Landkreise,
--                         two cities, two Ortsteile and four Gemarkungen --
--                         over a million hectares against a planted 894 -- so
--                         the ceiling catches it.
--   the clip fails shut   a handful of parcels survive; the floor catches it.
--
-- The bbox check is the one that matters most here, and it is deliberately
-- wide. Saale-Unstrut has a DETACHED northern lobe: four Gemarkungen of Stadt
-- Werder (Havel) in Brandenburg, 106 km from anything else in the region. A
-- tight box drawn round the Saale and Unstrut valleys would reject the correct
-- geometry. So the box runs to 52.6 N to admit Werder, and the part count
-- carries the rest of the weight -- a clip that escaped its units would not
-- stay at 43 parts.

begin;

do $$
declare
  r record;
  n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.saale-unstrut'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 1 then raise exception 'expected 1 DRAFT Saale-Unstrut boundary, got %', n; end if;

  select b.id, b.display_geometry g,
         (b.generation_parameters->>'hectares_planted')::numeric planted,
         (b.generation_parameters->>'engine') engine,
         (b.generation_parameters->>'named_units')::int units,
         (b.generation_parameters->>'raw_parts')::int raw_parts,
         extensions.ST_NumGeometries(b.display_geometry) parts
    into r
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.saale-unstrut'
     and b.quality_status = 'DRAFT' and not b.is_current;

  if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
    raise exception 'Saale-Unstrut: geometry invalid or empty';
  end if;
  if r.engine is distinct from 'vineyard-clip+close' then
    raise exception 'Saale-Unstrut: engine is %, expected vineyard-clip+close', r.engine;
  end if;
  -- 12 places (10 Landkreise + Jena + Erfurt) + 2 Ortsteile + 4 Gemarkungen.
  if r.units is distinct from 18 then
    raise exception 'Saale-Unstrut: built from % named units, the specification names 18', r.units;
  end if;
  if r.planted is null or r.planted < 600 or r.planted > 1400 then
    raise exception 'Saale-Unstrut: % planted ha is outside 600-1400 — the vineyard clip has failed open or shut',
      r.planted;
  end if;
  if r.parts >= r.raw_parts then
    raise exception 'Saale-Unstrut: close left % parts from % raw — it knitted nothing together',
      r.parts, r.raw_parts;
  end if;
  if extensions.ST_XMin(extensions.Box3D(r.g)) < 10.3
     or extensions.ST_XMax(extensions.Box3D(r.g)) > 13.4
     or extensions.ST_YMin(extensions.Box3D(r.g)) < 50.4
     or extensions.ST_YMax(extensions.Box3D(r.g)) > 52.6 then
    raise exception 'Saale-Unstrut: bbox escapes Sachsen-Anhalt, Thüringen and the Werder exclave';
  end if;
  -- The Brandenburg exclave is the piece most easily lost: it comes from a
  -- different state, a different source and a different SRID, and every other
  -- check above would still pass without it.
  if not exists (
    select 1 from extensions.ST_Dump(r.g) d
     where extensions.ST_YMax(extensions.Box3D(d.geom)) > 52.2
  ) then
    raise exception 'Saale-Unstrut: nothing north of 52.2 N — the Werder (Havel) exclave is missing';
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = r.id;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.saale-unstrut' and b.is_current;
  if n <> 1 then raise exception 'expected exactly 1 current Saale-Unstrut boundary, got %', n; end if;

  -- Germany now stands at 10 of its 13 Anbaugebiete with geometry. The three
  -- left are Baden and Württemberg, whose specifications mix Gemeinden with
  -- Gemarkungen and so need a cadastral layer, and Sachsen, whose section 5 is
  -- metes and bounds with no place list at all.
  select count(*) into n
    from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 10 then raise exception 'expected 10 German Anbaugebiete with geometry, got %', n; end if;
end $$;

commit;
