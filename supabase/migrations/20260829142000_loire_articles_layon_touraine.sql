-- Loire articles part 2: Layon sweet family, Saumur and Touraine
-- (20 places). Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('coteaux-du-layon',
   'The Layon stream''s morning mists breed botrytis on Chenin - honeyed sweet wines with Chenin''s saving acidity.',
   'Mist-prone valley in warm Anjou.', 'Schist with carboniferous seams.',
   'Chenin moelleux heartland', 'Six named villages + Chaume rise within it'),
  ('coteaux-du-layon-beaulieu-sur-layon-ou-beaulieu',
   'Layon village cru at Beaulieu - fine-boned sweet Chenin above the stream.',
   'Misty mornings, sunny days.', 'Schist.',
   'Named-village Layon', 'Slopes directly over the Layon'),
  ('coteaux-du-layon-faye-d-anjou-ou-faye',
   'Faye''s slopes give some of the raciest village-level Layon.',
   'Mist and sun in rhythm.', 'Schist and sandstone.',
   'Named-village Layon', 'Racy, citrus-edged sweetness'),
  ('coteaux-du-layon-premier-cru-chaume',
   'The single PREMIER CRU of the Loire: Chaume''s amphitheatre, halfway to Quarts-de-Chaume in richness.',
   'Perfect southeast mist-trap.', 'Schist and puddingstone.',
   'The Loire''s only premier cru', 'Steps below Quarts de Chaume in the hierarchy'),
  ('coteaux-du-layon-rablay-sur-layon-ou-rablay',
   'Rablay''s gentler slopes - generous, early-charming sweet Chenin.',
   'Sheltered mid-valley.', 'Schist and clay.',
   'Named-village Layon', 'An artists''-village of the valley'),
  ('coteaux-du-layon-rochefort-sur-loire-ou-rochefort',
   'Rochefort, gateway to the great crus - powerful sweet Chenin beside Chaume.',
   'Loire-and-Layon confluence mists.', 'Schist, quartz, puddingstone.',
   'Named-village Layon', 'Adjoins the Quarts-de-Chaume amphitheatre'),
  ('coteaux-du-layon-saint-aubin-de-luigne-ou-saint-aubin',
   'Saint-Aubin''s steep corridors - concentrated Layon with mineral spine.',
   'Deep valley mist-trap.', 'Schist.',
   'Named-village Layon', 'Some of the steepest Layon slopes'),
  ('coteaux-du-layon-saint-lambert-du-lattay-ou-saint-lambert',
   'Saint-Lambert - classic mid-Layon sweetness, apricot and quince.',
   'Mist-fed mornings.', 'Schist and sandstone.',
   'Named-village Layon', 'Home of the Layon wine museum'),
  ('quarts-de-chaume',
   'The Loire''s only GRAND CRU: a south-facing horseshoe where the lord once took the best quarter - tiny yields of immortal sweet Chenin.',
   'Perfect botrytis amphitheatre.', 'Schist and quartz puddingstone.',
   'The valley''s sole grand cru (2011)', 'The name recalls the seigneur''s quarter-share'),
  ('bonnezeaux',
   'Three schist ridges at Thouarce - Layon''s other historic great growth, unctuous yet vibrant.',
   'Open, mist-prone slopes.', 'Schist with quartz.',
   'Historic cru of the Layon', 'No premier/grand cru label, grand cru repute'),
  ('coteaux-de-l-aubance',
   'The Aubance''s gentler sweet Chenin - lighter mists, more demi-sec grace.',
   'Softer mist regime than the Layon.', 'Schist.',
   'The subtler sweet valley of Anjou', 'Demi-sec to moelleux styles'),
  ('saumur',
   'White tuffeau country: sparkling and still Chenin from cellars carved in the stone, plus Cabernet Franc reds.',
   'Mild, chalk-tempered.', 'Tuffeau chalk.',
   'Tuffeau cellars power a sparkling industry', 'Chenin and Cabernet Franc'),
  ('saumur-champigny',
   'The red jewel of Saumur: Cabernet Franc on tuffeau - fragrant, silky, cellar-cool.',
   'Warm plateau over cool cellars.', 'Tuffeau chalk with sand.',
   'Benchmark tuffeau Cabernet Franc', 'Champigny = campus igni, field of fire'),
  ('touraine',
   'The garden of France: Sauvignon and Gamay across the chateaux country, with Chenin and Cot in the mix.',
   'Mild continental-Atlantic blend.', 'Tuffeau, clay-silex, sand.',
   'Sauvignon leads the whites', 'Base AOC of the chateaux country'),
  ('touraine-amboise',
   'Touraine villages around the royal chateau - Chenin whites and Cot-Gamay reds.',
   'Loire-bank mildness.', 'Clay-silex over tuffeau.',
   'Village complement of Amboise', 'Cot (Malbec) has a foothold'),
  ('touraine-azay-le-rideau',
   'A small Chenin-and-Grolleau enclave by the Indre - delicate whites and pale roses.',
   'Soft river valley.', 'Sand and clay on tuffeau.',
   'Chenin whites, Grolleau roses', 'One of the smallest Touraine villages'),
  ('touraine-chenonceaux',
   'The Cher-side villages under the great chateau - polished Sauvignon and Cot-led reds.',
   'Cher valley warmth.', 'Clay-silex and gravel.',
   'Premium Touraine village tier', 'Sauvignon whites of extra depth'),
  ('touraine-mesland',
   'North-bank villages at Mesland - Gamay-led reds with flinty freshness.',
   'North-bank exposure.', 'Clay-silex.',
   'Gamay-first village complement', 'Faces Chaumont across the Loire'),
  ('touraine-noble-joue',
   'The revived "noble Joue" of Tours: a vin gris rose from the three Pinots - Meunier, Gris and Noir.',
   'City-edge mildness.', 'Gravel and sand.',
   'Rose only, from three Pinots', 'A medieval Tours speciality reborn'),
  ('touraine-oisly',
   'Sologne-edge sands given to Sauvignon alone - the purest varietal expression in Touraine.',
   'Continental Sologne edge.', 'Sand over clay.',
   'Sauvignon-only village tier', 'Sandy soils, aromatic precision')
) as v(slug, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_a <> 44 then
    raise exception 'expected 44 loire articles after part 2, got %', v_a;
  end if;
end $$;
