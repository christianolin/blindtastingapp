-- Owner: "overlapping must not happen" — the district outlines are
-- re-derived with a coverage union (processed shape ∪ raw children), so no
-- closing arc or simplification cut can slice inside a village. This flip
-- promotes the six covered revisions.

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
     and b.generation_parameters ? 'coverage_union';
  if v_count <> 6 then
    raise exception 'expected 6 covered district drafts, got %', v_count;
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
  and d.generation_parameters ? 'coverage_union'
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
  -- The point of the exercise: every village must sit inside its district.
  select count(*) into v_uncovered
    from wine_places d
    join wine_place_boundaries db on db.wine_place_id = d.id and db.is_current
    join wine_places v on v.primary_parent_id = d.id and v.publication_status = 'VERIFIED'
    join wine_place_boundaries vb on vb.wine_place_id = v.id and vb.is_current
   where d.kind = 'SUBREGION' and d.canonical_key like 'france.bourgogne.%'
     and not extensions.ST_Covers(
           extensions.ST_Buffer(db.display_geometry, 0.0002),
           vb.display_geometry);
  if v_uncovered <> 0 then
    raise exception '% villages poke outside their district outline', v_uncovered;
  end if;
end $$;
