-- Phase 3C.6 map polish: fine Bordeaux region footprint (owner: "too crude,
-- same as Bourgogne"). Freshly fetched Bordeaux-AOC membership (5,107
-- parcels) generalized by the concave engine at the fine tolerance replaces
-- the legacy Phase-1 outline. Retire-then-promote; fail-closed.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.bordeaux'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 1 then
    raise exception 'expected exactly 1 staged Bordeaux boundary, got %', v_count;
  end if;

  update wine_place_boundaries b
     set is_current = false
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key = 'france.bordeaux'
     and b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected 1 retired Bordeaux boundary, got %', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key = 'france.bordeaux'
     and b.quality_status = 'DRAFT' and not b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected 1 promoted Bordeaux boundary, got %', v_count;
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
