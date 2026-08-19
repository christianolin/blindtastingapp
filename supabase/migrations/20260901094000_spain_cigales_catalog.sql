-- Spain wave 1 (cont.): Cigales DO catalog node.
--
-- Fourth DO, third in Castilla y León. Sourced from the official MAPA pliego
-- cigales_2022_03_25.pdf: 12 municipios (11 in Valladolid along the Pisuerga +
-- Dueñas in Palencia). castilla-y-leon (REGION) + the spain node already exist
-- (20260901091000). Regional DOP -> APPELLATION tier 2 (6/6, like Rueda/Toro).
-- Lands DRAFT; run-spain-dos.mjs promotes it when it stages the pliego union.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'cigales', 'spain.castilla-y-leon.cigales', 'Cigales', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 30, id
  from wine_places where canonical_key = 'spain.castilla-y-leon';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key = 'spain.castilla-y-leon.cigales' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOP'
     and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'cigales APPELLATION not created DRAFT'; end if;
end $$;

commit;
