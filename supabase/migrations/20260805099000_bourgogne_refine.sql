-- Phase 3C Task 5c: promote the sliver-cleaned Bourgogne footprint (concave
-- engine with the part-area filter: 4 genuine islands — main mass, Chablis/
-- Auxerrois, Tonnerrois, Châtillonnais — the ~7 sub-kilometre MakeValid
-- fragments are gone). Retires the 11-part current row.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bourgogne'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 1 then
    raise exception 'expected exactly 1 staged Bourgogne boundary, got %', v_count;
  end if;

  update wine_place_boundaries b
     set is_current = false
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key = 'france.bourgogne'
     and b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected 1 retired Bourgogne boundary, got %', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key = 'france.bourgogne'
     and b.quality_status = 'DRAFT' and not b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected 1 promoted Bourgogne boundary, got %', v_count;
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
