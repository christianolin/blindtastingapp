-- Loire — wave 3b content (11 articles, then grapes and styles).
-- Insert-only, final-state asserted.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('cremant-de-loire', 'The Loire''s traditional-method sparkler, drawn from Anjou, Saumur and Touraine - Chenin-led with Chardonnay and Cabernet Franc.', 'Oceanic to semi-continental across its span.', 'Tuffeau limestone, schist and clay.', 'Traditional method; Chenin-led.'),
  ('rose-de-loire', 'The valley-wide DRY rosé appellation, spanning Anjou to Touraine.', 'Oceanic to semi-continental across its span.', 'Schist, tuffeau and gravel across the valley.', 'Always dry (unlike Rosé d''Anjou).'),
  ('cabernet-d-anjou', 'Anjou''s off-dry to medium-sweet Cabernet rosé - the valley''s biggest rosé AOC.', 'Oceanic Anjou.', 'Schist and carboniferous soils of the Anjou noir.', 'Off-dry Cabernet Franc/Sauvignon rosé.'),
  ('rose-d-anjou', 'Softly off-dry Grolleau-led rosé from the same Anjou sweep.', 'Oceanic Anjou.', 'Schist, sand and gravel.', 'Grolleau-led, gently sweet.'),
  ('coteaux-de-saumur', 'Saumur''s small sweet Chenin - late-harvest honey off tuffeau slopes.', 'Oceanic with warm tuffeau slopes.', 'Tuffeau chalk-limestone.', 'Sweet Chenin Blanc only.'),
  ('coteaux-du-vendomois', 'The Loir''s side valley (no final e) - peppery Pineau d''Aunis vin gris and reds.', 'Semi-oceanic, frost-prone valley.', 'Clay-with-flint over tuffeau.', 'Pineau d''Aunis speciality.'),
  ('orleans', 'The old vineyard of Orléans - Pinot Meunier-led reds and rosés with some Chardonnay.', 'Semi-continental northern edge.', 'Sand and gravel terraces of the Loire bend.', 'Pinot Meunier speciality.'),
  ('orleans-clery', 'Cléry''s Cabernet Franc red - the southern twin of Orléans.', 'Semi-continental northern edge.', 'Sand and gravel terraces.', 'Cabernet Franc red only.'),
  ('cote-roannaise', 'Gamay on granite above the upper Loire at Roanne.', 'Semi-continental foothills of the Massif Central.', 'Granite and sand.', 'Gamay reds and rosés.'),
  ('cotes-du-forez', 'The Loire''s southernmost Gamay - volcanic and granite slopes of the Forez.', 'Semi-continental, elevated.', 'Granite and basalt.', 'Gamay reds and rosés.'),
  ('saint-pourcain', 'One of France''s oldest vineyards, on the Allier - Gamay/Pinot reds and Chardonnay-Tressallier whites.', 'Semi-continental Allier valley.', 'Sand, gravel and clay-limestone.', 'Historic Bourbonnais vineyard.')
) as v(slug, descr, climate, soils, fact)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('cremant-de-loire','Chenin Blanc','PRINCIPAL'),('cremant-de-loire','Chardonnay','ACCESSORY'),('cremant-de-loire','Cabernet Franc','ACCESSORY'),
  ('rose-de-loire','Cabernet Franc','PRINCIPAL'),('rose-de-loire','Grolleau','ACCESSORY'),('rose-de-loire','Gamay','ACCESSORY'),
  ('cabernet-d-anjou','Cabernet Franc','PRINCIPAL'),('cabernet-d-anjou','Cabernet Sauvignon','ACCESSORY'),
  ('rose-d-anjou','Grolleau','PRINCIPAL'),('rose-d-anjou','Cabernet Franc','ACCESSORY'),
  ('coteaux-de-saumur','Chenin Blanc','PRINCIPAL'),
  ('coteaux-du-vendomois','Pineau d''Aunis','PRINCIPAL'),('coteaux-du-vendomois','Gamay','ACCESSORY'),
  ('orleans','Pinot Meunier','PRINCIPAL'),('orleans','Chardonnay','ACCESSORY'),
  ('orleans-clery','Cabernet Franc','PRINCIPAL'),
  ('cote-roannaise','Gamay','PRINCIPAL'),
  ('cotes-du-forez','Gamay','PRINCIPAL'),
  ('saint-pourcain','Gamay','PRINCIPAL'),('saint-pourcain','Chardonnay','ACCESSORY'),('saint-pourcain','Pinot Noir','ACCESSORY')
) as v(slug, grape, role)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('cremant-de-loire','SPARKLING',0),
  ('rose-de-loire','ROSE',0),
  ('cabernet-d-anjou','ROSE',0),
  ('rose-d-anjou','ROSE',0),
  ('coteaux-de-saumur','SWEET',0), ('coteaux-de-saumur','WHITE',1),
  ('coteaux-du-vendomois','RED',0), ('coteaux-du-vendomois','ROSE',1), ('coteaux-du-vendomois','WHITE',2),
  ('orleans','RED',0), ('orleans','ROSE',1), ('orleans','WHITE',2),
  ('orleans-clery','RED',0),
  ('cote-roannaise','RED',0), ('cote-roannaise','ROSE',1),
  ('cotes-du-forez','RED',0), ('cotes-du-forez','ROSE',1),
  ('saint-pourcain','RED',0), ('saint-pourcain','WHITE',1), ('saint-pourcain','ROSE',2)
) as v(slug, style, so)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_a <> 75 then raise exception 'expected 75 loire articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes g join wine_places p on p.id = g.wine_place_id
   where p.canonical_key in ('france.loire.cremant-de-loire','france.loire.rose-de-loire','france.loire.cabernet-d-anjou','france.loire.rose-d-anjou','france.loire.coteaux-de-saumur','france.loire.coteaux-du-vendomois','france.loire.orleans','france.loire.orleans-clery','france.loire.cote-roannaise','france.loire.cotes-du-forez','france.loire.saint-pourcain');
  if v_g < 21 then raise exception 'expected >= 21 wave-3b grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles s join wine_places p on p.id = s.wine_place_id
   where p.canonical_key in ('france.loire.cremant-de-loire','france.loire.rose-de-loire','france.loire.cabernet-d-anjou','france.loire.rose-d-anjou','france.loire.coteaux-de-saumur','france.loire.coteaux-du-vendomois','france.loire.orleans','france.loire.orleans-clery','france.loire.cote-roannaise','france.loire.cotes-du-forez','france.loire.saint-pourcain');
  if v_s < 20 then raise exception 'expected >= 20 wave-3b style rows, got %', v_s; end if;
end;
$$;
