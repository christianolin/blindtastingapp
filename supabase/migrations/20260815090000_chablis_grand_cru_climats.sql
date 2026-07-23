-- Phase 3F: the seven named climats of the Chablis Grand Cru appellation,
-- as SITE places under the grand cru (tier 5). Each is a single official
-- INAO parcel; boundaries are staged separately, a flip migration verifies.

insert into wine_places (primary_parent_id, kind, canonical_key, name, slug,
  display_tier, min_zoom, label_min_zoom, publication_status, sort_order,
  is_appellation, appellation_system, appellation_level)
select
  (select id from wine_places where canonical_key = 'france.bourgogne.chablis.chablis.chablis-grand-cru'),
  'SITE', v.key, v.name, v.slug, 5, 14, 14, 'DRAFT', v.sort,
  true, 'AOC/AOP', 'grand_cru'
from (values
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.bougros', 'Bougros', 'bougros', 300),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.preuses', 'Preuses', 'preuses', 301),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.vaudesir', 'Vaudésir', 'vaudesir', 302),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.grenouilles', 'Grenouilles', 'grenouilles', 303),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.valmur', 'Valmur', 'valmur', 304),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.les-clos', 'Les Clos', 'les-clos', 305),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.blanchot', 'Blanchot', 'blanchot', 306)
) as v(key, name, slug, sort);

do $$
declare v_count int;
begin
  select count(*) into v_count from wine_places where canonical_key like 'france.bourgogne.chablis%';
  if v_count <> 12 then
    raise exception 'expected 12 Chablis places, got %', v_count;
  end if;
end $$;
