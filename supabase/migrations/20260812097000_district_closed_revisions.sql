-- Owner brief: a côte is one continuous strip. The six district footprints
-- are re-derived with morphological closing (one polygon per côte; Grand
-- Auxerrois keeps Vézelay as its honest second island) and fine edges.
-- This flip retires the fragmented currents and promotes the closed drafts.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.kind = 'SUBREGION'
     and p.canonical_key like 'france.bourgogne.%'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS'
     and b.generation_parameters ->> 'closing' is not null
     and (b.generation_parameters ->> 'closing')::float8 > 0;
  if v_count <> 6 then
    raise exception 'expected 6 closed district drafts, got %', v_count;
  end if;
end $$;

update wine_place_boundaries b
set is_current = false
from wine_place_boundaries d
join wine_places p on p.id = d.wine_place_id
where p.kind = 'SUBREGION'
  and p.canonical_key like 'france.bourgogne.%'
  and d.quality_status = 'DRAFT' and not d.is_current
  and d.boundary_method = 'DERIVED_FROM_DESCENDANTS'
  and (d.generation_parameters ->> 'closing')::float8 > 0
  and b.wine_place_id = d.wine_place_id
  and b.is_current;

update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.kind = 'SUBREGION'
  and p.canonical_key like 'france.bourgogne.%'
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
