-- Premier-cru grouping polish. In INAO the generic "X Premier Cru" denomination
-- and each named 1er-cru climat are separate, non-overlapping parcel sets, so the
-- grouping node (the generic parcel) did not contain its named-climat children —
-- the only hierarchy level where a parent failed to enclose its children. Re-derive
-- each village 1er-cru node as the coverage-union of its own generic parcel plus
-- all its climats so drill-down stays inside the parent. Cross-commune grand crus
-- (Corton, Montrachet, Bonnes-Mares) are excluded — unioning them would push a
-- village polygon into a neighbour. The 1er cru lies within its village, so there
-- is no cascade. Reuses each node's existing official snapshot (revision).

do $$
declare
  keys text[] := array[
    'france.bourgogne.cote-de-beaune.meursault.premier-cru',
    'france.bourgogne.cote-de-beaune.ladoix.premier-cru',
    'france.bourgogne.cote-de-beaune.chassagne-montrachet.premier-cru',
    'france.bourgogne.cote-de-beaune.pommard.premier-cru',
    'france.bourgogne.cote-de-beaune.puligny-montrachet.premier-cru',
    'france.bourgogne.cote-de-beaune.volnay.premier-cru',
    'france.bourgogne.cote-de-beaune.monthelie.premier-cru',
    'france.bourgogne.cote-de-nuits.nuits-saint-georges.premier-cru',
    'france.bourgogne.cote-de-nuits.chambolle-musigny.premier-cru',
    'france.bourgogne.cote-de-nuits.morey-saint-denis.premier-cru',
    'france.bourgogne.cote-chalonnaise.rully.premier-cru',
    'france.bourgogne.cote-chalonnaise.montagny.premier-cru'
  ];
  -- Givry and Chablis 1er cru extend ~2.4-2.5% past their village/AOC generic
  -- parcel, which would need a multi-level cascade; left accurate-but-open.
  k text; v_place uuid; v_old uuid; v_snap uuid; v_geom extensions.geometry; v int;
begin
  foreach k in array keys loop
    select id into v_place from wine_places where canonical_key = k;
    if v_place is null then raise exception 'missing %', k; end if;
    select id, source_snapshot_id into v_old, v_snap
      from wine_place_boundaries where wine_place_id = v_place and is_current;

    with parts as (
      select display_geometry g from wine_place_boundaries where id = v_old
      union all
      select cb.display_geometry from wine_places ch
        join wine_place_boundaries cb on cb.wine_place_id = ch.id and cb.is_current
       where ch.primary_parent_id = v_place and ch.publication_status = 'VERIFIED'
    ),
    u as (select extensions.ST_Union(g) g from parts),
    simp as (
      select extensions.ST_CollectionExtract(extensions.ST_MakeValid(
               extensions.ST_SimplifyPreserveTopology(g, 0.0003)), 3) g from u
    ),
    cov as (
      select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(
               extensions.ST_Union(s.g, u.g)), 3)) g
      from simp s, u
    )
    select g into v_geom from cov;

    update wine_place_boundaries set is_current = false where id = v_old;
    insert into wine_place_boundaries (
      wine_place_id, source_snapshot_id, boundary_method, quality_status,
      display_geometry, label_point, bbox, source_feature_refs,
      generation_parameters, revision, is_current, reviewed_at
    ) values (
      v_place, v_snap, 'DERIVED_FROM_DESCENDANTS', 'VALIDATED',
      v_geom, extensions.ST_PointOnSurface(v_geom),
      array[
        extensions.ST_XMin(extensions.Box3D(v_geom)), extensions.ST_YMin(extensions.Box3D(v_geom)),
        extensions.ST_XMax(extensions.Box3D(v_geom)), extensions.ST_YMax(extensions.Box3D(v_geom))
      ]::double precision[],
      jsonb_build_object('union_of', 'generic parcel + named 1er-cru climats'),
      jsonb_build_object('engine', 'parent_plus_children_union', 'coverage_union', true,
                         'simplify_tolerance', 0.0003),
      to_char(now() at time zone 'utc', 'YYYYMMDD"T"HH24MISS"Z"'), true, now()
    );
  end loop;

  -- each grouping now contains its climats
  select count(*) into v from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key = any(keys)
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.0006), cb.display_geometry);
  if v <> 0 then raise exception '% climats still outside their grouping', v; end if;

  -- no cascade: each grouping stays inside its village/AOC parent
  select count(*) into v from wine_places node
    join wine_place_boundaries nb on nb.wine_place_id = node.id and nb.is_current
    join wine_places par on par.id = node.primary_parent_id
    join wine_place_boundaries prb on prb.wine_place_id = par.id and prb.is_current
   where node.canonical_key = any(keys)
     and not extensions.ST_Covers(extensions.ST_Buffer(prb.display_geometry, 0.0006), nb.display_geometry);
  if v <> 0 then raise exception '% groupings now poke outside their village (cascade needed)', v; end if;
end $$;
