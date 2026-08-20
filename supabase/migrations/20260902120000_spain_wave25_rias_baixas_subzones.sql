-- Spain wave 25: the five subzones of DOP Rías Baixas.
--
-- Second use of the subregional tier established for Rioja (Alta / Alavesa /
-- Oriental): APPELLATION children of the DO at tier 3, min_zoom 7, so they
-- appear only on drill-down while Rías Baixas itself still renders at z6.
--
-- Sourced from the pliego's §4 table (Subzona | Términos municipales |
-- Parroquias). Two honest caveats, recorded here and in each entry's
-- provenance note:
--   * Whole-municipality over-approximation. The pliego delimits most subzones
--     by parroquia; the pipeline has no sub-municipal geometry. Same model the
--     parent DO already uses.
--   * Unlike Rioja, these do NOT tile the DO exactly: Tui's parroquias are
--     split between Condado do Tea and O Rosal, so those two overlap in Tui.
--     That is what the pliego says.
-- Every parent municipio is covered by at least one subzone (34/34, no holes).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, 'spain.galicia.rias-baixas.' || v.slug, v.name, 'APPELLATION', 3, 7, 7, true, 'DOP', 'subregional', 'DRAFT', v.so, p.id
from (values
  ('val-do-salnes',   'Val do Salnés',   10),
  ('condado-do-tea',  'Condado do Tea',  20),
  ('o-rosal',         'O Rosal',         30),
  ('soutomaior',      'Soutomaior',      40),
  ('ribeira-do-ulla', 'Ribeira do Ulla', 50)
) as v(slug, name, so)
join wine_places p on p.canonical_key = 'spain.galicia.rias-baixas';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.description, v.facts::text[], 'PUBLISHED'
from (values
  ('val-do-salnes',
   'Albariño''s historic heartland, on the cool, rain-washed coast around Cambados and the Ría de Arousa. The largest and most planted subzone, and the coldest: sandy granite soils and Atlantic wind give the taut, saline, high-acid style most people picture when they think of Rías Baixas.',
   array['The original and largest subzone','Cambados and the Ría de Arousa','Sandy granite, strong Atlantic influence','Taut, saline, high-acid Albariño']),
  ('condado-do-tea',
   'Inland along the river Miño on the Portuguese border, sheltered from the ocean and the warmest of the subzones. Riper, rounder wines, and the one place where Albariño is traditionally blended with Treixadura.',
   array['Warmest subzone, inland on the Miño','Albariño blended with Treixadura','Sheltered from Atlantic weather','Riper, broader whites']),
  ('o-rosal',
   'Terraced slopes running down to the Miño estuary, looking across at Portugal. Albariño here is classically partnered with Loureira, giving markedly floral, citrus-scented wines with a softer edge than Salnés.',
   array['Terraces above the Miño estuary','Albariño with Loureira','Faces Portugal across the river','Floral, citrus-scented style']),
  ('soutomaior',
   'The smallest subzone by far — a single municipality at the head of the Ría de Vigo, added in 1996. Light granite and sandy soils, and almost exclusively Albariño.',
   array['Smallest subzone — one municipality','Head of the Ría de Vigo','Granite and sandy soils','Effectively all Albariño']),
  ('ribeira-do-ulla',
   'The northernmost and most inland subzone, following the river Ulla south of Santiago de Compostela. The newest addition to the DO, and the one with a real red-wine tradition alongside its Albariño.',
   array['Northernmost, most inland subzone','The Ulla valley below Santiago','Newest of the five','Some red wine alongside Albariño'])
) as v(slug, description, facts)
join wine_places p on p.canonical_key = 'spain.galicia.rias-baixas.' || v.slug;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('val-do-salnes',   'Albariño'),
  ('condado-do-tea',  'Albariño'),
  ('condado-do-tea',  'Treixadura'),
  ('o-rosal',         'Albariño'),
  ('soutomaior',      'Albariño'),
  ('ribeira-do-ulla', 'Albariño')
) as v(slug, grape)
join grapes g on g.name = v.grape
join wine_places p on p.canonical_key = 'spain.galicia.rias-baixas.' || v.slug
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('val-do-salnes',   'WHITE', 0),
  ('condado-do-tea',  'WHITE', 0),
  ('o-rosal',         'WHITE', 0),
  ('soutomaior',      'WHITE', 0),
  ('ribeira-do-ulla', 'WHITE', 0),
  ('ribeira-do-ulla', 'RED',   1)
) as s(slug, style, so)
join wine_places p on p.canonical_key = 'spain.galicia.rias-baixas.' || s.slug
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key like 'spain.galicia.rias-baixas.%'
     and kind = 'APPELLATION' and display_tier = 3 and publication_status = 'DRAFT';
  if v <> 5 then raise exception 'expected 5 Rías Baixas subzones DRAFT, found %', v; end if;
end $$;

commit;
