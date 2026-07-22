-- Phase 3C Task 5a flip, Phase B: the Côte de Nuits district. Its
-- DERIVED_FROM_DESCENDANTS boundary (union of VERIFIED villages — Vosne only
-- in the 5a slice; re-derived in 5b when the other villages land) was staged
-- after Phase A. Validate it, mark current, publish the district.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne.cote-de-nuits'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 1 then
    raise exception 'expected exactly 1 staged district boundary, got %', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key = 'france.bourgogne.cote-de-nuits'
     and b.quality_status = 'DRAFT' and not b.is_current;

  update wine_places
     set publication_status = 'VERIFIED'
   where canonical_key = 'france.bourgogne.cote-de-nuits'
     and publication_status = 'DRAFT';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected 1 published district, got %', v_count;
  end if;

  select count(*) into v_count from wine_places where publication_status = 'VERIFIED';
  if v_count <> 44 then
    raise exception 'expected 44 VERIFIED places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (
       select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
     );
  if v_count <> 0 then
    raise exception '% VERIFIED places lack a current VALIDATED boundary', v_count;
  end if;
end;
$$;
