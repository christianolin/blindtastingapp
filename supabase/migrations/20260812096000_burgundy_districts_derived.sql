-- Phase 3D waves 2+3, phase B: the four derived district footprints flip
-- VALIDATED + current and the district places become VERIFIED.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (
           'france.bourgogne.chablis', 'france.bourgogne.grand-auxerrois',
           'france.bourgogne.cote-chalonnaise', 'france.bourgogne.maconnais')
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 4 then
    raise exception 'expected 4 staged derived district boundaries, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in (
        'france.bourgogne.chablis', 'france.bourgogne.grand-auxerrois',
        'france.bourgogne.cote-chalonnaise', 'france.bourgogne.maconnais')
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';

update wine_places
set publication_status = 'VERIFIED'
where canonical_key in (
        'france.bourgogne.chablis', 'france.bourgogne.grand-auxerrois',
        'france.bourgogne.cote-chalonnaise', 'france.bourgogne.maconnais')
  and publication_status = 'DRAFT';

do $$
declare v_verified int; v_current int; v_orphans int;
begin
  select count(*) into v_verified from wine_places where publication_status = 'VERIFIED';
  if v_verified <> 141 then
    raise exception 'expected 141 verified places, got %', v_verified;
  end if;
  select count(*) into v_current from wine_place_boundaries where is_current;
  if v_current <> 141 then
    raise exception 'expected 141 current boundaries, got %', v_current;
  end if;
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
