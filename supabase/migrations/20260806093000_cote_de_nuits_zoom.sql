-- Phase 3C Task 5c: reveal districts one zoom earlier. Bourgogne's whole
-- multi-island bbox fits the camera at ~z7, so a z8 district reveal was never
-- reached when clicking the region — Côte de Nuits looked absent. z7 matches
-- where region-fit cameras actually land (Bordeaux's tier-2 children use 7).
do $$
declare
  v_count int;
begin
  update wine_places
     set min_zoom = 7, label_min_zoom = 7
   where canonical_key = 'france.bourgogne.cote-de-nuits';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected to update 1 district, got %', v_count;
  end if;
end;
$$;
