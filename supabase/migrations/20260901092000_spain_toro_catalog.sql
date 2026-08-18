-- Spain wave 1 (cont.): Toro DO catalog node.
--
-- Second Castilla y León DOP, sourced from the official MAPA pliego PDO-ES-A0886
-- ("Comprende los siguientes municipios: Provincia de Zamora / Valladolid").
-- castilla-y-leon (REGION) and the re-activated spain node already exist
-- (20260901091000). Toro is a compact multi-municipality DOP -> APPELLATION
-- tier 2, treated regional like Rueda (6/6). Lands DRAFT; run-spain-dos.mjs
-- promotes it to VERIFIED when it stages the 15-municipio pliego union.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'toro', 'spain.castilla-y-leon.toro', 'Toro', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 20, id
  from wine_places where canonical_key = 'spain.castilla-y-leon';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key = 'spain.castilla-y-leon.toro' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOP'
     and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'toro APPELLATION not created DRAFT'; end if;
end $$;

commit;
