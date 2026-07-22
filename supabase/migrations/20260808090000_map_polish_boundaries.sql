-- Phase 3C.6 map polish: fine-detail revisions for the two coarse outlines
-- the owner flagged — the Côte de Nuits derived footprint (simplify 0.002 →
-- 0.0002; villages no longer poke past the district border) and the
-- Bourgogne concave envelope (0.005 → 0.002). Retire-then-promote per place.
do $$
declare
  r record;
  v_count int;
begin
  for r in
    select unnest(array[
      'france.bourgogne',
      'france.bourgogne.cote-de-nuits'
    ]) as key
  loop
    select count(*) into v_count
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = r.key
       and b.quality_status = 'DRAFT' and not b.is_current;
    if v_count <> 1 then
      raise exception 'expected exactly 1 staged boundary for %, got %', r.key, v_count;
    end if;

    update wine_place_boundaries b
       set is_current = false
      from wine_places p
     where p.id = b.wine_place_id
       and p.canonical_key = r.key
       and b.is_current;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception 'expected 1 retired boundary for %, got %', r.key, v_count;
    end if;

    update wine_place_boundaries b
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
      from wine_places p
     where p.id = b.wine_place_id
       and p.canonical_key = r.key
       and b.quality_status = 'DRAFT' and not b.is_current;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception 'expected 1 promoted boundary for %, got %', r.key, v_count;
    end if;
  end loop;

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
