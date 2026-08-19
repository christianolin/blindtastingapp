-- Spain tree fix: collapse the two comunidades whose sole DO shares the
-- comunidad's name, so the tree stops showing a meaningless duplicate level
-- ("La Rioja > Rioja", "Navarra > Navarra"). We keep the single shard-anchor
-- comunidad node and make IT carry the appellation role — exactly France's
-- Bordeaux precedent, where france.bordeaux is a REGION node that is also
-- is_appellation=true for the regional Bordeaux AOP.
--
-- Result:
--   Spain > Rioja (DOCa) > { Rioja Alta, Rioja Alavesa, Rioja Oriental }
--   Spain > Navarra (DOP)
-- (No behaviour change for the other comunidades — their DOs have distinct
--  names, so the region>appellation nesting is meaningful and stays.)
--
-- The comunidad nodes already carry the identical boundary (their region
-- overview is the union of the DO's municipios), so the outline still renders;
-- the redundant DO nodes' boundary/article/links cascade away on delete.

begin;

-- 1. Reparent the 3 Rioja subzones onto the comunidad node BEFORE the DO node is
--    deleted (primary_parent_id is ON DELETE RESTRICT). Child tier 3 >= parent
--    tier 1 satisfies the hierarchy trigger.
update wine_places
   set primary_parent_id = (select id from wine_places where canonical_key = 'spain.la-rioja')
 where canonical_key in (
   'spain.la-rioja.rioja.rioja-alta',
   'spain.la-rioja.rioja.rioja-oriental',
   'spain.la-rioja.rioja.rioja-alavesa'
 );

-- 2. The comunidad nodes BECOME their sole same-named appellation.
update wine_places
   set name = 'Rioja', is_appellation = true, appellation_system = 'DOCa', appellation_level = 'regional'
 where canonical_key = 'spain.la-rioja';
update wine_places
   set is_appellation = true, appellation_system = 'DOP', appellation_level = 'regional'
 where canonical_key = 'spain.navarra';  -- name already 'Navarra'

-- 3. Delete the now-redundant DO nodes (boundary/article/grape/style links
--    cascade; Rioja's children are already reparented so the FK restrict clears).
delete from wine_places
 where canonical_key in ('spain.la-rioja.rioja', 'spain.navarra.navarra');

do $$
declare v int;
begin
  select count(*) into v from wine_places
    where canonical_key in ('spain.la-rioja.rioja', 'spain.navarra.navarra');
  if v <> 0 then raise exception 'redundant DO nodes still present: %', v; end if;

  select count(*) into v from wine_places
    where primary_parent_id = (select id from wine_places where canonical_key = 'spain.la-rioja')
      and canonical_key like 'spain.la-rioja.rioja.%';
  if v <> 3 then raise exception 'expected 3 reparented Rioja subzones, got %', v; end if;

  select count(*) into v from wine_places
    where canonical_key = 'spain.la-rioja' and is_appellation and appellation_system = 'DOCa' and name = 'Rioja';
  if v <> 1 then raise exception 'Rioja node not collapsed correctly'; end if;

  select count(*) into v from wine_places
    where canonical_key = 'spain.navarra' and is_appellation and appellation_system = 'DOP';
  if v <> 1 then raise exception 'Navarra node not collapsed correctly'; end if;

  -- both collapsed nodes must keep a current boundary so they still render
  select count(*) into v from wine_places p
    join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.canonical_key in ('spain.la-rioja', 'spain.navarra');
  if v <> 2 then raise exception 'collapsed nodes missing a current boundary: %', v; end if;
end $$;

commit;
