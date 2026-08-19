-- Spain wave 19: DO Uclés (Castilla-La Mancha). Whole-municipality union of the
-- pliego zona — 24 INE municipios (Cuenca + a corner of Toledo). Five localities
-- the pliego names separately (Carrascosa del Campo, Langa, Loranca del Campo,
-- Valparaíso de Arriba/Abajo) are the single merged municipio Campos del Paraíso;
-- Cabezamesada & Corral de Almaguer are partial-polígono, taken whole. castilla-
-- la-mancha REGION exists. APPELLATION tier 2 (6/6) DRAFT; run-spain-dos promotes.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'ucles', 'spain.castilla-la-mancha.ucles', 'Uclés', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 60, p.id
  from wine_places p where p.canonical_key = 'spain.castilla-la-mancha';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'A high, open Tempranillo (Cencibel) DO on the plains of western Cuenca around the great monastery of Uclés, reaching into a corner of Toledo. Altitude and continental swings give structured, modern reds and fresh rosados.',
  array['Tempranillo (Cencibel) reds','Around the monastery of Uclés','Cuenca + a corner of Toledo','High, continental plains']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.castilla-la-mancha.ucles';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Tempranillo'),('Garnacha')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.ucles'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('ROSE',1)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.ucles'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.castilla-la-mancha.ucles' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Uclés DO not created DRAFT'; end if;
end $$;

commit;
