-- Bourgogne — La Grande Rue catalog (DRAFT).
--
-- The missing Vosne-Romanée grand cru (the strip between La Tâche and
-- Romanée-Conti, promoted 1992) — 8th GC under this node, since Échezeaux
-- and Grands-Échezeaux also hang here: APPELLATION / grand_cru, tier 4 under
-- france.bourgogne.cote-de-nuits.vosne-romanee, zooms + next sort copied
-- from its sibling La Tâche. 4 INAO parcels; boundary staged by run-targets,
-- flip in 20260829167000, link + content follow.
do $$
declare
  v_parent uuid; v_mz numeric; v_lmz numeric; v_so int; v_n int;
begin
  select id into v_parent from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee'
     and publication_status = 'VERIFIED';
  if v_parent is null then raise exception 'vosne-romanee is not VERIFIED'; end if;

  select min_zoom, label_min_zoom into v_mz, v_lmz from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-tache';
  if v_mz is null then raise exception 'la-tache sibling missing (zoom template)'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_so from wine_places
   where primary_parent_id = v_parent and appellation_level = 'grand_cru';

  if not exists (select 1 from wine_places where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_parent, 'APPELLATION', 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue', 'La Grande Rue', 'la-grande-rue', 4, v_mz, v_lmz, 'DRAFT', true, 'AOC/AOP', 'grand_cru', v_so);
  end if;

  -- Final-state assertions.
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
       and primary_parent_id = v_parent and kind = 'APPELLATION'
       and display_tier = 4 and appellation_level = 'grand_cru' and is_appellation
  ) then
    raise exception 'la-grande-rue catalog row missing or wrong';
  end if;
  select count(*) into v_n from wine_places
   where primary_parent_id = v_parent and appellation_level = 'grand_cru';
  if v_n <> 8 then
    raise exception 'expected 8 vosne-romanee grand crus, got %', v_n;
  end if;
end;
$$;
