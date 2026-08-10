-- Fill spurious interior holes in the Piedmont comune-union footprints.
--
-- The Piemonte region outline is the dissolve of ~1179 ISTAT comuni; imperfect
-- source tiling + ST_SimplifyPreserveTopology left interior gaps (e.g. around
-- Moransengo/Aramengo). Barolo/Barbaresco are unions of contiguous member comuni
-- with no legitimate enclaves either. So drop every interior ring on these three
-- current boundaries, keeping each part's exterior ring, and recompute
-- label_point + bbox. Same ISTAT source geometry, cleaned — no new provenance.
-- The italy COUNTRY boundary (Natural Earth) is deliberately excluded: a country
-- may have real enclaves (San Marino, Vatican).

begin;

do $$
declare
  r record;
  v_geom extensions.geometry;
  v_holes int;
  v_fixed int := 0;
begin
  for r in
    select b.id, p.canonical_key
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in (
             'italy.piemonte', 'italy.piemonte.barolo', 'italy.piemonte.barbaresco'
           )
       and b.is_current
  loop
    -- Rebuild each part from its exterior ring only (drops interior rings).
    select extensions.ST_Multi(extensions.ST_Collect(
             extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom))))
      into v_geom
      from wine_place_boundaries b,
           lateral extensions.ST_Dump(b.display_geometry) d
     where b.id = r.id;

    v_geom := extensions.ST_MakeValid(v_geom);
    if not extensions.ST_IsValid(v_geom) or extensions.ST_IsEmpty(v_geom) then
      raise exception 'hole-filled geometry for % is invalid/empty', r.canonical_key;
    end if;

    update wine_place_boundaries
       set display_geometry = v_geom,
           label_point = extensions.ST_PointOnSurface(v_geom),
           bbox = array[
             extensions.ST_XMin(extensions.Box3D(v_geom)),
             extensions.ST_YMin(extensions.Box3D(v_geom)),
             extensions.ST_XMax(extensions.Box3D(v_geom)),
             extensions.ST_YMax(extensions.Box3D(v_geom))
           ]::double precision[]
     where id = r.id;

    v_fixed := v_fixed + 1;
  end loop;

  if v_fixed <> 3 then
    raise exception 'expected to process 3 current italy footprint boundaries, processed %', v_fixed;
  end if;

  -- No interior rings may remain on the three.
  select coalesce(sum(x.h), 0) into v_holes from (
    select (
      select coalesce(sum(extensions.ST_NumInteriorRings(
               extensions.ST_GeometryN(b.display_geometry, g))), 0)
        from generate_series(1, extensions.ST_NumGeometries(b.display_geometry)) g
    ) h
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (
           'italy.piemonte', 'italy.piemonte.barolo', 'italy.piemonte.barbaresco'
         )
     and b.is_current
  ) x;
  if v_holes <> 0 then
    raise exception 'interior rings remain after fill: %', v_holes;
  end if;
end $$;

commit;
