-- Phase 3D wave 1 flip: the 40 staged Côte de Beaune boundaries become
-- VALIDATED + current and their places VERIFIED. The district itself stays
-- DRAFT — its footprint derives from the verified villages next, then flips
-- in its own migration (two-phase, as in 3C).

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-beaune.%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 40 then
    raise exception 'expected 40 staged Cote de Beaune boundaries, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key like 'france.bourgogne.cote-de-beaune.%'
  and b.quality_status = 'DRAFT' and not b.is_current;

update wine_places
set publication_status = 'VERIFIED'
where canonical_key like 'france.bourgogne.cote-de-beaune.%'
  and publication_status = 'DRAFT';

do $$
declare v_places int; v_orphans int;
begin
  select count(*) into v_places from wine_places
   where canonical_key like 'france.bourgogne.cote-de-beaune.%'
     and publication_status = 'VERIFIED';
  if v_places <> 40 then
    raise exception 'expected 40 VERIFIED Cote de Beaune places, got %', v_places;
  end if;
  select count(*) into v_orphans from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (
       select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current
          and b.quality_status = 'VALIDATED'
     );
  -- The district is still DRAFT (its derived footprint flips separately),
  -- so no VERIFIED place anywhere may lack a current validated boundary.
  if v_orphans <> 0 then
    raise exception 'verified places without current boundary: %', v_orphans;
  end if;
end $$;
