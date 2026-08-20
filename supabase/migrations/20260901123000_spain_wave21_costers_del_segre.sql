-- Spain wave 21: DO Costers del Segre (Cataluña) — the large, fragmented Lleida
-- DO. COARSE whole-municipality over-approximation: its 7 subzones are mostly
-- defined by individual polígonos catastrales, so the 69 whole municipios that
-- contribute any listed parcel are taken whole (Lleida city excluded — only the
-- Raimat estate belongs; the Valls del Riu Corb subzone reaches one Tarragona
-- municipio, Vallfogona de Riucorb). cataluna REGION exists. APPELLATION tier 2
-- (6/6) DRAFT; run-spain-dos promotes it.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'costers-del-segre', 'spain.cataluna.costers-del-segre', 'Costers del Segre', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 90, p.id
  from wine_places p where p.canonical_key = 'spain.cataluna';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'The largest and most scattered Catalan DO, spread over seven "unitats geogràfiques" along the river Segre — from the high Pyrenean Pallars down to the plains of Lleida and the olive-and-vine hills of Les Garrigues. A patchwork of styles, from crisp whites and Cava to structured reds of Tempranillo, Garnacha and Bordeaux varieties, pioneered by the Raimat estate.',
  array['Seven scattered subzones along the Segre','Lleida province (+ a Tarragona edge)','Local + international varieties','The Raimat estate pioneer']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.cataluna.costers-del-segre';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Tempranillo'),('Garnacha'),('Macabeu'),('Cabernet Sauvignon')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.cataluna.costers-del-segre'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('WHITE',1),('SPARKLING',2),('ROSE',3)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.cataluna.costers-del-segre'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.cataluna.costers-del-segre' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Costers del Segre DO not created DRAFT'; end if;
end $$;

commit;
