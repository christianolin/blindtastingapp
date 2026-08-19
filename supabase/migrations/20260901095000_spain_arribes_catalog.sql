-- Spain wave 1 (cont.): Arribes DO catalog node.
--
-- Fifth DO, fourth in Castilla y León. Sourced from the official MAPA pliego
-- PDO-ES-A0614 ("La zona de producción comprende los siguientes municipios: •
-- Provincia de Salamanca / • Provincia de Zamora"): 32 INE municipios along the
-- Duero canyon (18 Salamanca + 14 Zamora; the pliego's many Zamora pedanías are
-- excluded as they are not separate INE municipios, and Monumenta is excluded as
-- it has no georef geometry). castilla-y-leon (REGION) + spain already exist.
-- Regional DOP -> APPELLATION tier 2 (6/6). DRAFT; run-spain-dos.mjs promotes it.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'arribes', 'spain.castilla-y-leon.arribes', 'Arribes', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 40, id
  from wine_places where canonical_key = 'spain.castilla-y-leon';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key = 'spain.castilla-y-leon.arribes' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOP'
     and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'arribes APPELLATION not created DRAFT'; end if;
end $$;

commit;
