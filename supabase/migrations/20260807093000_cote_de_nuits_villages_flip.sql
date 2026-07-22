-- Phase 3C wave 5b flip (owner approved the shapes 2026-07-22): validate the
-- 29 staged Côte de Nuits village/grand-cru/1er-group boundaries, mark them
-- current, publish their places. The district re-derives (union of all 8
-- villages) in 20260807096000 once these are VERIFIED. Fail-closed.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-nuits%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  if v_count <> 29 then
    raise exception 'expected 29 staged wave-5b boundaries, got %', v_count;
  end if;

  select count(*) into v_count from (
    select b.wine_place_id
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.bourgogne.cote-de-nuits%'
       and b.quality_status = 'DRAFT' and not b.is_current
     group by b.wine_place_id
    having count(*) <> 1
  ) multi;
  if v_count <> 0 then
    raise exception '% places carry multiple DRAFTs', v_count;
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key like 'france.bourgogne.cote-de-nuits%'
     and b.quality_status = 'DRAFT' and not b.is_current;
  get diagnostics v_count = row_count;
  if v_count <> 29 then
    raise exception 'expected 29 promoted boundaries, got %', v_count;
  end if;

  update wine_places
     set publication_status = 'VERIFIED'
   where canonical_key like 'france.bourgogne.cote-de-nuits%'
     and publication_status = 'DRAFT';
  get diagnostics v_count = row_count;
  if v_count <> 29 then
    raise exception 'expected 29 published places, got %', v_count;
  end if;

  select count(*) into v_count from wine_places where publication_status = 'VERIFIED';
  if v_count <> 73 then
    raise exception 'expected 73 VERIFIED places, got %', v_count;
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
