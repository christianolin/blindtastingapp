-- Promote the pebble-filtered Franken and Saale-Unstrut boundaries staged by
-- stage-germany-weinbau.mjs after 20260915090000 retired the speckled ones.
--
-- The bands on hectares_planted and the bounding boxes are the ones
-- 20260913180000 and 20260913200000 set, unchanged and for the same reasons:
-- the band is on planted extent measured before the close, because the stored
-- geometry is a closed outline whose area is inflated on purpose, and the boxes
-- are wide enough to admit Saale-Unstrut's Brandenburg exclave.
--
-- What is new is the filter's own record, carried in generation_parameters:
--
--   min_planted_ha           the threshold, 5
--   closed_parts             parts the close produced, before filtering
--   dropped_parts            parts the filter removed
--   dropped_hectares         planted vineyard inside them
--   planted_before_filter    the whole clip's planted extent
--   hectares_planted         planted extent of the parts that SURVIVED
--
-- Checking those rather than only the part count matters: a part count of 41
-- is also what a differently-tuned close would produce, and that close would
-- have inflated the area instead of removing dust. The assertions below pin
-- which of the two happened.
--
-- The exclave check is the one that earns its keep. Saale-Unstrut's four Werder
-- (Havel) Gemarkungen sit 106 km north of everything else in the region, they
-- come from a different state, a different source and a different SRID, and
-- they are exactly the kind of small detached thing a pebble filter is built to
-- delete. They hold enough vineyard to clear 5 ha and they survive -- but if a
-- future threshold rise ever eats them, this fails rather than quietly
-- publishing a region with its northern lobe missing.

begin;

do $$
declare
  r record;
  n int;
  expected record;
begin
  for expected in
    select * from (values
      -- key, name, min parts, max parts, planted floor, planted ceiling,
      -- bbox, and the count the close produced before filtering
      ('germany.franken',       'Franken',        30, 60, 5000, 9000,  8.5, 11.5, 48.8, 50.7, 87),
      ('germany.saale-unstrut', 'Saale-Unstrut',  12, 30,  600, 1400, 10.3, 13.4, 50.4, 52.6, 43)
    ) as t(key, nm, min_parts, max_parts, ha_lo, ha_hi, x_lo, x_hi, y_lo, y_hi, closed)
  loop
    select count(*) into n
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = expected.key
       and b.quality_status = 'DRAFT' and not b.is_current;
    if n <> 1 then
      raise exception '% : expected 1 DRAFT boundary, got %', expected.nm, n;
    end if;

    select b.id, b.display_geometry g,
           (b.generation_parameters->>'hectares_planted')::numeric planted,
           (b.generation_parameters->>'planted_before_filter')::numeric planted_all,
           (b.generation_parameters->>'dropped_hectares')::numeric dropped_ha,
           (b.generation_parameters->>'min_planted_ha')::numeric min_ha,
           (b.generation_parameters->>'closed_parts')::int closed_parts,
           (b.generation_parameters->>'dropped_parts')::int dropped_parts,
           (b.generation_parameters->>'engine') engine,
           (b.generation_parameters->>'raw_parts')::int raw_parts,
           extensions.ST_NumGeometries(b.display_geometry) parts
      into r
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = expected.key
       and b.quality_status = 'DRAFT' and not b.is_current;

    if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
      raise exception '% : geometry invalid or empty', expected.nm;
    end if;
    if r.engine is distinct from 'vineyard-clip+close' then
      raise exception '% : engine is %, expected vineyard-clip+close', expected.nm, r.engine;
    end if;

    -- The filter ran, at the threshold this migration was written for.
    if r.min_ha is distinct from 5 then
      raise exception '% : min_planted_ha is %, expected 5 — this is not the filtered rebuild',
        expected.nm, r.min_ha;
    end if;
    if r.closed_parts is distinct from expected.closed then
      raise exception '% : the close produced % parts, expected % — the close itself has changed, so the part count below is not measuring the filter',
        expected.nm, r.closed_parts, expected.closed;
    end if;
    if r.dropped_parts is null or r.dropped_parts <= 0 then
      raise exception '% : the filter dropped no parts', expected.nm;
    end if;
    if r.parts <> r.closed_parts - r.dropped_parts then
      raise exception '% : % parts stored, but % closed minus % dropped is %',
        expected.nm, r.parts, r.closed_parts, r.dropped_parts,
        r.closed_parts - r.dropped_parts;
    end if;
    if r.parts < expected.min_parts or r.parts > expected.max_parts then
      raise exception '% : % parts is outside %-%', expected.nm, r.parts,
        expected.min_parts, expected.max_parts;
    end if;

    -- It removed dust, not vineyard. Anything over a twentieth of the region's
    -- planted extent means the threshold is cutting into real sites.
    if r.planted is null or r.planted < expected.ha_lo or r.planted > expected.ha_hi then
      raise exception '% : % planted ha is outside %-% — the vineyard clip has failed open or shut',
        expected.nm, r.planted, expected.ha_lo, expected.ha_hi;
    end if;
    if r.planted_all is null or r.planted_all <= 0 then
      raise exception '% : planted_before_filter is missing', expected.nm;
    end if;
    if r.dropped_ha / r.planted_all > 0.05 then
      raise exception '% : the filter dropped % of % planted ha — more than a twentieth is not dust',
        expected.nm, r.dropped_ha, r.planted_all;
    end if;
    if abs((r.planted + r.dropped_ha) - r.planted_all) > 1 then
      raise exception '% : kept % + dropped % does not account for % planted ha',
        expected.nm, r.planted, r.dropped_ha, r.planted_all;
    end if;

    -- The close still knitted the parcels together; the filter is not doing
    -- that job for it.
    if r.parts >= r.raw_parts then
      raise exception '% : % parts from % raw — the close knitted nothing together',
        expected.nm, r.parts, r.raw_parts;
    end if;

    if extensions.ST_XMin(extensions.Box3D(r.g)) < expected.x_lo
       or extensions.ST_XMax(extensions.Box3D(r.g)) > expected.x_hi
       or extensions.ST_YMin(extensions.Box3D(r.g)) < expected.y_lo
       or extensions.ST_YMax(extensions.Box3D(r.g)) > expected.y_hi then
      raise exception '% : bbox escapes its region', expected.nm;
    end if;

    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.id;

    select count(*) into n
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = expected.key and b.is_current;
    if n <> 1 then
      raise exception '% : expected exactly 1 current boundary, got %', expected.nm, n;
    end if;
  end loop;

  -- Saale-Unstrut's Brandenburg exclave: small, detached, from another state,
  -- and precisely what a pebble filter deletes by accident.
  if not exists (
    select 1
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id,
           extensions.ST_Dump(b.display_geometry) d
     where p.canonical_key = 'germany.saale-unstrut' and b.is_current
       and extensions.ST_YMax(extensions.Box3D(d.geom)) > 52.2
  ) then
    raise exception 'Saale-Unstrut: nothing north of 52.2 N — the filter ate the Werder (Havel) exclave';
  end if;

  -- Germany is back to 10 of its 13 Anbaugebiete with geometry. Baden and
  -- Württemberg need a cadastral layer; Sachsen's section 5 is metes and bounds
  -- with no place list at all.
  select count(*) into n
    from wine_places p
    join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 10 then
    raise exception 'expected 10 German Anbaugebiete with geometry, got %', n;
  end if;

  -- Hessische Bergstraße and Rheingau were deliberately left alone: their
  -- closes worked and they carry no filter record.
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.rheingau', 'germany.hessische-bergstrasse')
     and b.is_current
     and (b.generation_parameters ->> 'min_planted_ha') is null;
  if n <> 2 then
    raise exception 'Rheingau and Hessische Bergstraße should still hold their unfiltered boundaries, got %', n;
  end if;
end $$;

commit;
