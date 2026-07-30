-- Revert the Rhône regrouping from 20260829229000. The subregion borders are
-- auto-derived hulls of their children, baked into the map tiles. The six
-- appellations moved under Rhône méridional fall entirely outside that hull
-- (Ventoux, Luberon, Côtes du Vivarais, Grignan-les-Adhémar are broad areas
-- east/west of the cru core; Clairette/Crémant de Die sit in the distant Diois),
-- so the rendered subregion polygon stopped containing its own children. The
-- region boundary does cover them, so restore them there until the subregion
-- boundaries can be regenerated and the map tiles rebuilt.

update wine_places ch
set primary_parent_id = (
  select id from wine_places where canonical_key = 'france.rhone'
)
where ch.primary_parent_id = (
    select id from wine_places where canonical_key = 'france.rhone.meridional'
  )
  and ch.name in (
    'Luberon', 'Ventoux', 'Grignan-les-Adhémar', 'Côtes du Vivarais',
    'Clairette de Die', 'Crémant de Die'
  );

do $$
declare n int;
begin
  select count(*) into n
  from wine_places ch
  join wine_places reg on reg.id = ch.primary_parent_id
  where reg.canonical_key = 'france.rhone' and ch.kind = 'APPELLATION';
  if n <> 8 then
    raise exception 'final-state: expected 8 appellations back under the Rhône region, got %', n;
  end if;
end $$;
