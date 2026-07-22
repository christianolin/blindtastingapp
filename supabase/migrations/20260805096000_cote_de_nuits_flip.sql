-- Phase 3C Task 5a flip, Phase A (owner approved the shapes 2026-07-22):
-- validate the 23 staged Vosne-Romanée subtree boundaries, mark them current,
-- and publish their places. The DISTRICT (cote-de-nuits) stays DRAFT here:
-- its DERIVED_FROM_DESCENDANTS boundary can only be built once the villages
-- are VERIFIED+current, so Phase B (20260805097000) flips it separately.
-- Fail-closed guards; fully transactional.
do $$
declare
  v_count int;
begin
  -- Exactly the staged subtree, nothing else.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 23 then
    raise exception 'expected 23 staged Vosne boundaries, got %', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and b.quality_status = 'DRAFT' and not b.is_current;

  update wine_places
     set publication_status = 'VERIFIED'
   where canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and publication_status = 'DRAFT';
  get diagnostics v_count = row_count;
  if v_count <> 23 then
    raise exception 'expected 23 published Vosne places, got %', v_count;
  end if;

  -- Every VERIFIED place must carry a current VALIDATED boundary (the tile
  -- export fails otherwise). The district is intentionally still DRAFT.
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
