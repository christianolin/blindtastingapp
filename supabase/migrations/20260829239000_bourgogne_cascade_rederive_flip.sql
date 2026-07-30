-- Cascade re-derive: Mâconnais and Côte de Beaune grew when re-derived to cover
-- their regional-appellation children, so the Bourgogne region outline (derived
-- from its six districts) no longer contained them (Mâconnais poked ~47% out).
-- Re-derive Bourgogne from the updated districts. Champagne needed no cascade —
-- its region still covers Montagne de Reims / Côte des Blancs.
-- DRAFT staged by derive-boundary.mjs (bourgogne-rederive-c).

do $$
declare v_place uuid; v_old uuid; v_new uuid; v int;
begin
  select id into v_place from wine_places where canonical_key = 'france.bourgogne';
  select id into v_new from wine_place_boundaries where wine_place_id = v_place
    and quality_status = 'DRAFT' and not is_current and boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_new is null then raise exception 'no bourgogne draft'; end if;
  select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne' and b.is_current;
  if v <> 1 then raise exception 'bourgogne current <> 1: %', v; end if;

  select count(*) into v
    from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key = 'france.bourgogne'
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.0006), cb.display_geometry);
  if v <> 0 then raise exception '% bourgogne districts poke outside the region outline', v; end if;
end $$;
