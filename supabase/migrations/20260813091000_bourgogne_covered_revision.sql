-- Bourgogne's outline, re-derived from the covered districts with the same
-- coverage-union guarantee: the region can never cut inside a district.

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS'
     and b.generation_parameters ? 'coverage_union';
  if v_count <> 1 then
    raise exception 'expected 1 covered bourgogne draft, got %', v_count;
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
  and b.generation_parameters ? 'coverage_union';

do $$
declare v_current int; v_orphans int; v_uncovered int;
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
  select count(*) into v_uncovered
    from wine_places r
    join wine_place_boundaries rb on rb.wine_place_id = r.id and rb.is_current
    join wine_places d on d.primary_parent_id = r.id and d.publication_status = 'VERIFIED'
    join wine_place_boundaries db on db.wine_place_id = d.id and db.is_current
   where r.canonical_key = 'france.bourgogne'
     and not extensions.ST_Covers(
           extensions.ST_Buffer(rb.display_geometry, 0.0002),
           db.display_geometry);
  if v_uncovered <> 0 then
    raise exception '% districts poke outside the bourgogne outline', v_uncovered;
  end if;
end $$;
