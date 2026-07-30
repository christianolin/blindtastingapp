-- Rhône proper grouping (step 2 of 3): promote the re-derived Rhône méridional
-- outline (now covering Ventoux / Luberon / Côtes du Vivarais / Grignan) and the
-- new Diois outline to current + VALIDATED, and flip Diois to VERIFIED alongside
-- its boundary (so it is never a verified place without a current boundary).
-- DRAFTs were staged by derive-boundary.mjs (rhone-meridional-regroup, rhone-diois).

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone.meridional'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v <> 1 then raise exception 'expected 1 meridional draft, got %', v; end if;
  select count(*) into v from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone.diois'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v <> 1 then raise exception 'expected 1 diois draft, got %', v; end if;
end $$;

update wine_place_boundaries b set is_current = false
from wine_places p
where p.id = b.wine_place_id and p.canonical_key = 'france.rhone.meridional' and b.is_current;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in ('france.rhone.meridional', 'france.rhone.diois')
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';

update wine_places set publication_status = 'VERIFIED'
where canonical_key = 'france.rhone.diois' and publication_status = 'DRAFT';

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone.meridional' and b.is_current;
  if v <> 1 then raise exception 'meridional current <> 1: %', v; end if;
  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.rhone.diois' and b.is_current and b.quality_status = 'VALIDATED';
  if v <> 1 then raise exception 'diois current/validated <> 1: %', v; end if;

  select count(*) into v
    from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key in ('france.rhone.meridional', 'france.rhone.diois')
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.0002), cb.display_geometry);
  if v <> 0 then raise exception '% children poke outside their subregion outline', v; end if;

  select count(*) into v from wine_places p where p.publication_status = 'VERIFIED'
     and not exists (
       select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v <> 0 then raise exception '% verified places without a current boundary', v; end if;
end $$;
