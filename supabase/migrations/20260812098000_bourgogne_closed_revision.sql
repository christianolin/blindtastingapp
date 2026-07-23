-- Bourgogne's region footprint: the closed re-derivation from the six
-- closed districts replaces the fragmented first derivation.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS'
     and (b.generation_parameters ->> 'closing')::float8 > 0;
  if v_count <> 1 then
    raise exception 'expected 1 closed bourgogne draft, got %', v_count;
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
  and b.boundary_method = 'DERIVED_FROM_DESCENDANTS'
  and (b.generation_parameters ->> 'closing')::float8 > 0;

do $$
declare v_current int; v_orphans int;
begin
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
