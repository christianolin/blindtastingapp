-- Bourgogne pilot region: dual-role node (region == Bourgogne AOC,
-- duplicates rule), French display name, tier-1 zooms matching Bordeaux.
insert into wine_places (
  primary_parent_id, kind, canonical_key, name, slug, display_tier,
  min_zoom, label_min_zoom, publication_status, sort_order,
  is_appellation, appellation_system, appellation_level
)
select p.id, 'REGION', 'france.bourgogne', 'Bourgogne', 'bourgogne', 1, 4, 4,
       'DRAFT', 10, true, 'AOC/AOP', 'regional'
from wine_places p where p.canonical_key = 'france';

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'france.bourgogne';
  if v <> 1 then raise exception 'bourgogne place missing'; end if;
end;
$$;
