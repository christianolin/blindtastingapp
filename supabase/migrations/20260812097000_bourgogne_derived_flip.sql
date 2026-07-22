-- Phase 3D close: Bourgogne's outline stops being a parcel-membership
-- envelope and becomes DERIVED_FROM_DESCENDANTS — the closed, part-filtered
-- union of its six verified districts (205 vertices, 6 real islands). The
-- concave envelope retires as history.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 1 then
    raise exception 'expected 1 staged derived bourgogne boundary, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key = 'france.bourgogne'
  and b.is_current;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key = 'france.bourgogne'
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';

do $$
declare v_current int; v_method text; v_orphans int;
begin
  select count(*) into v_current from wine_place_boundaries where is_current;
  if v_current <> 141 then
    raise exception 'expected 141 current boundaries, got %', v_current;
  end if;
  select b.boundary_method::text into v_method
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne' and b.is_current;
  if v_method <> 'DERIVED_FROM_DESCENDANTS' then
    raise exception 'bourgogne current method is %, expected derived', v_method;
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
