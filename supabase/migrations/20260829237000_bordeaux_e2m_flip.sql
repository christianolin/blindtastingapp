-- Bordeaux Entre-Deux-Mers restructure (step 2 of 2): promote the derived
-- subregion outline (union of the E2M AOC + the six right-bank / sweet-wine
-- appellations) to current + VALIDATED and flip the subregion back to VERIFIED.
-- DRAFT staged by derive-boundary.mjs (bordeaux-e2m-subregion).

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bordeaux.entre-deux-mers'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v <> 1 then raise exception 'expected 1 E2M subregion draft, got %', v; end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id and p.canonical_key = 'france.bordeaux.entre-deux-mers'
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';

update wine_places set publication_status = 'VERIFIED'
where canonical_key = 'france.bordeaux.entre-deux-mers' and publication_status = 'DRAFT';

do $$
declare v int;
begin
  select count(*) into v from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bordeaux.entre-deux-mers' and b.is_current and b.quality_status = 'VALIDATED';
  if v <> 1 then raise exception 'E2M subregion current/validated <> 1: %', v; end if;

  select count(*) into v
    from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key = 'france.bordeaux.entre-deux-mers'
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.0006), cb.display_geometry);
  if v <> 0 then raise exception '% E2M children poke outside the subregion outline', v; end if;

  select count(*) into v from wine_places p where p.publication_status = 'VERIFIED'
     and not exists (select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v <> 0 then raise exception '% verified places without a current boundary', v; end if;
end $$;
