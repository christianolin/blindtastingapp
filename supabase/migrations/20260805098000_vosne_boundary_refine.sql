-- Phase 3C Task 5c: refined Vosne-Romanée boundaries (owner directive: more
-- detail). The 23 subtree places re-staged with fine generalization
-- (crus/climats ≈8 m tolerance + 0.0008° closing; village/group ≈30 m +
-- 0.002°); this revision-flip retires the coarse current rows and promotes
-- the refined DRAFTs. Fail-closed; fully transactional.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 23 then
    raise exception 'expected 23 refined DRAFT boundaries, got %', v_count;
  end if;

  select count(*) into v_count from (
    select b.wine_place_id
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
       and b.quality_status = 'DRAFT' and not b.is_current
     group by b.wine_place_id
    having count(*) <> 1
  ) multi;
  if v_count <> 0 then
    raise exception '% places carry multiple DRAFTs', v_count;
  end if;

  update wine_place_boundaries b
     set is_current = false
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 23 then
    raise exception 'expected 23 retired coarse boundaries, got %', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 23 then
    raise exception 'expected 23 promoted refined boundaries, got %', v_count;
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
