-- Phase 3F flip: the 10 Chablis and 318 Côte de Beaune premier-cru climats
-- become VALIDATED + current and their places VERIFIED (only this wave's
-- DRAFT rows match; earlier climats are already current).

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
       or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 328 then
    raise exception 'expected 328 staged climat boundaries, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
  and b.quality_status = 'DRAFT' and not b.is_current;

update wine_places
set publication_status = 'VERIFIED'
where (canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
    or canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
  and publication_status = 'DRAFT';

do $$
declare v_orphans int;
begin
  select count(*) into v_orphans from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (
       select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
     );
  if v_orphans <> 0 then
    raise exception 'verified places without current boundary: %', v_orphans;
  end if;
end $$;
