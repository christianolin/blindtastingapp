-- Phase 3C.6: promote the sibling-trimmed plot revisions (17 across Vosne,
-- Gevrey, Morey). Overlaps between independently generalized plots were
-- artefacts EXCEPT legal dual-label pairs (Chambertin/Clos de Bèze,
-- Charmes/Mazoyères), which the trim tool exempted and which stay untrimmed
-- by design. Retire-then-promote per place; fail-closed.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries
   where quality_status = 'DRAFT' and not is_current
     and generation_parameters ? 'sibling_trim';
  if v_count <> 17 then
    raise exception 'expected 17 staged trim revisions, got %', v_count;
  end if;

  select count(*) into v_count from (
    select wine_place_id
      from wine_place_boundaries
     where quality_status = 'DRAFT' and not is_current
       and generation_parameters ? 'sibling_trim'
     group by wine_place_id
    having count(*) <> 1
  ) multi;
  if v_count <> 0 then
    raise exception '% places carry multiple trim drafts', v_count;
  end if;

  update wine_place_boundaries cur
     set is_current = false
    from wine_place_boundaries draft
   where draft.quality_status = 'DRAFT' and not draft.is_current
     and draft.generation_parameters ? 'sibling_trim'
     and cur.wine_place_id = draft.wine_place_id
     and cur.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 17 then
    raise exception 'expected 17 retired plot boundaries, got %', v_count;
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where quality_status = 'DRAFT' and not is_current
     and generation_parameters ? 'sibling_trim';
  get diagnostics v_count = row_count;
  if v_count <> 17 then
    raise exception 'expected 17 promoted plot boundaries, got %', v_count;
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
