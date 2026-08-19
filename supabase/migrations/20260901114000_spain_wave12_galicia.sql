-- Spain wave 12: the four remaining Galician DOPs, from their MAPA pliego zona
-- lists. Galician DOs are PARROQUIA-delimited, so these are whole-municipality
-- OVER-APPROXIMATIONS (documented, consistent with Ribeiro): every ayuntamiento
-- that contributes a parroquia is taken whole.
--   Rías Baixas (34)   - Pontevedra + A Coruña; 5 subzones (Albariño).
--   Ribeira Sacra (18) - Lugo + Ourense; terraced Sil/Miño canyons (Mencía/Godello).
--   Valdeorras (8)     - Ourense; the 8 named ayuntamientos (Godello/Mencía).
--   Monterrei (8)      - Ourense; valle + ladera subzones (Godello/Treixadura/Mencía).
-- galicia REGION already exists. Regional DOPs -> APPELLATION tier 2 (6/6), DRAFT;
-- run-spain-dos.mjs promotes each. Articles + chips PUBLISHED (render on promotion).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('rias-baixas', 'spain.galicia.rias-baixas', 'Rías Baixas', 20),
    ('ribeira-sacra', 'spain.galicia.ribeira-sacra', 'Ribeira Sacra', 30),
    ('valdeorras', 'spain.galicia.valdeorras', 'Valdeorras', 40),
    ('monterrei', 'spain.galicia.monterrei', 'Monterrei', 50)
  ) as v(slug, ckey, name, so)
  cross join wine_places p
 where p.canonical_key = 'spain.galicia';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  ('spain.galicia.rias-baixas',
   'Galicia''s flagship white DO on the Atlantic coast of Pontevedra, and the world reference for Albariño — salt-tinged, aromatic, crisp whites across five subzones (Val do Salnés, Condado do Tea, O Rosal, Soutomaior, Ribeira do Ulla). Granite soils, high rainfall and pergola-trained vines shape its sea-breeze freshness.',
   array['Albariño — saline Atlantic whites','Five subzones led by Val do Salnés','Granite soils, pergola training','Cool, wet, maritime Galicia']),
  ('spain.galicia.ribeira-sacra',
   'Heroic viticulture on near-vertical terraces above the Sil and Miño river canyons, straddling Lugo and Ourense. Fragrant, medium-bodied Mencía reds and mineral Godello whites from tiny slate-and-granite plots reached only on foot or by boat.',
   array['Terraced canyon "heroic" viticulture','Mencía reds & Godello whites','Slate and granite, steep Sil/Miño slopes','Amandi and its sister subzones']),
  ('spain.galicia.valdeorras',
   'The "valley of gold" in eastern Ourense — the modern home of Godello, giving mineral, textured, age-worthy whites, alongside Mencía reds, on slate (lousa) and granite.',
   array['Godello''s benchmark home','Mencía reds too','Slate & granite soils','Eastern Ourense, upper Sil']),
  ('spain.galicia.monterrei',
   'A warm, sheltered valley on the Portuguese border reviving Godello and Treixadura whites and Mencía reds across its valle and ladera subzones — riper and rounder than Galicia''s Atlantic zones.',
   array['Godello & Treixadura whites','Mencía reds','Warm border valley','Valle + ladera de Monterrei'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Albariño','spain.galicia.rias-baixas'),('Treixadura','spain.galicia.rias-baixas'),
  ('Mencía','spain.galicia.ribeira-sacra'),('Godello','spain.galicia.ribeira-sacra'),('Albariño','spain.galicia.ribeira-sacra'),
  ('Godello','spain.galicia.valdeorras'),('Mencía','spain.galicia.valdeorras'),
  ('Godello','spain.galicia.monterrei'),('Treixadura','spain.galicia.monterrei'),('Mencía','spain.galicia.monterrei')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.galicia.rias-baixas','WHITE',0),('spain.galicia.rias-baixas','RED',1),
  ('spain.galicia.ribeira-sacra','RED',0),('spain.galicia.ribeira-sacra','WHITE',1),
  ('spain.galicia.valdeorras','WHITE',0),('spain.galicia.valdeorras','RED',1),
  ('spain.galicia.monterrei','WHITE',0),('spain.galicia.monterrei','RED',1)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (
  select 1 from wine_place_styles ws
  where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null
);

do $$
declare v_nodes int; v_articles int;
begin
  select count(*) into v_nodes from wine_places
   where canonical_key in ('spain.galicia.rias-baixas','spain.galicia.ribeira-sacra','spain.galicia.valdeorras','spain.galicia.monterrei')
     and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_nodes <> 4 then raise exception 'expected 4 DRAFT Galicia DOs, got %', v_nodes; end if;
  select count(*) into v_articles from wine_place_articles x join wine_places p on p.id = x.wine_place_id
   where p.canonical_key in ('spain.galicia.rias-baixas','spain.galicia.ribeira-sacra','spain.galicia.valdeorras','spain.galicia.monterrei')
     and x.editorial_status = 'PUBLISHED';
  if v_articles <> 4 then raise exception 'expected 4 Galicia DO articles, got %', v_articles; end if;
end $$;

commit;
