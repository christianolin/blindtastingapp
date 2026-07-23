-- Phase 3F flip: the 121 individual Côte de Nuits premier-cru climats become
-- VALIDATED + current and their places VERIFIED. (Vosne's 14 climats are
-- already current, so the DRAFT filter selects only this wave's.)

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 121 then
    raise exception 'expected 121 staged Cote de Nuits climat boundaries, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
  and b.quality_status = 'DRAFT' and not b.is_current;

update wine_places
set publication_status = 'VERIFIED'
where canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
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
