-- Phase 3E flip: the 11 staged Bordeaux appellation boundaries become
-- VALIDATED + current and their places VERIFIED. No derived parents here
-- (Médoc/Graves macro-region re-derivation is deferred), so a plain flip.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bordeaux%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 11 then
    raise exception 'expected 11 staged Bordeaux 3E boundaries, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key like 'france.bordeaux%'
  and b.quality_status = 'DRAFT' and not b.is_current;

update wine_places
set publication_status = 'VERIFIED'
where canonical_key like 'france.bordeaux%' and publication_status = 'DRAFT';

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
