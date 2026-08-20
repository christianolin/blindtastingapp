-- Spain wave 22: DO Tarragona — whole-municipality union of the pliego "Zona de
-- producción" list (79 Tarragona-province municipios: Tarragonès, Alt & Baix Camp,
-- part of the Ribera d'Ebre, and Masllorenç). A few municipios the pliego includes
-- by "excepte polígon" partial clauses are taken whole. cataluna REGION exists.
-- APPELLATION tier 2 (6/6) DRAFT; run-spain-dos promotes it.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'tarragona', 'spain.cataluna.tarragona', 'Tarragona', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 100, p.id
  from wine_places p where p.canonical_key = 'spain.cataluna';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'One of Catalonia''s historic DOs, spanning the Camp de Tarragona — the Tarragonès and the Alt and Baix Camp around Reus and Valls — plus a slice of the Ribera d''Ebre along the river. It makes fresh whites and reds from Garnacha, Macabeu and Cariñena, and the traditional sweet, fortified "Tarragona clàssic", the altar-wine that once travelled the world.',
  array['Historic Camp de Tarragona DO','Garnacha, Macabeu & Cariñena','Sweet fortified "Tarragona clàssic"','Coast + a Ribera d''Ebre slice']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.cataluna.tarragona';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Garnacha'),('Macabeu'),('Tempranillo'),('Cariñena')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.cataluna.tarragona'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('WHITE',1),('FORTIFIED',2),('ROSE',3)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.cataluna.tarragona'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.cataluna.tarragona' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Tarragona DO not created DRAFT'; end if;
end $$;

commit;
