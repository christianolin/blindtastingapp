-- Rhône proper grouping (step 3 of 3): re-derive the Vallée du Rhône region
-- outline from its new direct children (Rhône septentrional, Rhône méridional
-- now covering the southern peripherals, the new Diois, and the two umbrella
-- appellations) and promote it. The prior outline predated Diois-as-a-node and
-- left a sub-0.1% sliver of Diois outside it; the coverage-union re-derive wraps
-- every direct child. DRAFT staged by derive-boundary.mjs (rhone-region-regroup).

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v <> 1 then raise exception 'expected 1 rhone region draft, got %', v; end if;
end $$;

update wine_place_boundaries b set is_current = false
from wine_places p
where p.id = b.wine_place_id and p.canonical_key = 'france.rhone' and b.is_current;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id and p.canonical_key = 'france.rhone'
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone' and b.is_current;
  if v <> 1 then raise exception 'rhone region current <> 1: %', v; end if;

  select count(*) into v
    from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key = 'france.rhone'
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.001), cb.display_geometry);
  if v <> 0 then raise exception '% region direct children poke outside the rhone outline', v; end if;
end $$;
