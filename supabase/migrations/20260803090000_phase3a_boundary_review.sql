-- Flip the eight reviewed Phase 3A boundaries current and publish their
-- places. Fails closed unless each target has exactly one DRAFT candidate.
do $$
declare
  k text;
  v_place uuid;
  v_count int;
begin
  foreach k in array array[
    'france.bordeaux.fronsac', 'france.bordeaux.canon-fronsac',
    'france.bordeaux.blaye', 'france.bordeaux.cotes-de-bourg',
    'france.bordeaux.entre-deux-mers', 'france.bordeaux.graves',
    'france.bordeaux.medoc', 'france.bourgogne'
  ] loop
    select id into v_place from wine_places where canonical_key = k;
    if v_place is null then raise exception 'missing place %', k; end if;
    select count(*) into v_count from wine_place_boundaries
      where wine_place_id = v_place and quality_status = 'DRAFT';
    if v_count <> 1 then
      raise exception 'expected exactly 1 DRAFT boundary for %, got %', k, v_count;
    end if;
    update wine_place_boundaries set is_current = false
      where wine_place_id = v_place and is_current;
    update wine_place_boundaries
      set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
      where wine_place_id = v_place and quality_status = 'DRAFT';
  end loop;

  update wine_places set publication_status = 'VERIFIED'
  where publication_status = 'DRAFT' and canonical_key like 'france%';
  get diagnostics v_count = row_count;
  if v_count <> 6 then raise exception 'expected 6 places verified, got %', v_count; end if;
end;
$$;
