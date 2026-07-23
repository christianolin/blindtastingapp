-- Fill out the Grape Library: profiles for every incomplete variety. All
-- fields use coalesce so any existing curation is preserved; editorial,
-- assistant-drafted. Whites get typical_tannin = 'None (white)'.

-- 1. The fully-empty grapes get complete profiles.
update grapes g set
  color = coalesce(g.color, v.color),
  skin_color = coalesce(g.skin_color, v.skin),
  description = coalesce(g.description, v.description),
  typical_aromas = coalesce(g.typical_aromas, v.aromas),
  typical_acidity = coalesce(g.typical_acidity, v.acidity),
  typical_tannin = coalesce(g.typical_tannin, v.tannin),
  typical_body = coalesce(g.typical_body, v.body),
  typical_alcohol = coalesce(g.typical_alcohol, v.alcohol),
  main_regions = coalesce(g.main_regions, v.regions)
from (values
  ('Aglianico', 'RED', 'thick, blue-black',
   'Southern Italy''s noble red — the "Barolo of the South". Firm tannins, dark fruit and volcanic minerality that ages for decades.',
   'Black cherry, leather, tar, wood ash', 'High', 'High', 'Full', 'Medium to high',
   'Campania (Taurasi), Basilicata (Aglianico del Vulture)'),
  ('Arneis', 'WHITE', 'golden-yellow',
   'Piedmont''s revived white — the "little rascal", tricky in the vineyard but charming in the glass: pear and almond, low acid, best drunk young.',
   'Pear, white peach, almond, chamomile', 'Medium to low', 'None (white)', 'Medium', 'Medium',
   'Piedmont (Roero, Langhe)'),
  ('Cortese', 'WHITE', 'green-gold',
   'The grape of Gavi — crisp, lemony, lightly saline dry white from south-east Piedmont.',
   'Lemon, green apple, white flowers, wet stone', 'High', 'None (white)', 'Light to medium', 'Medium',
   'Piedmont (Gavi)'),
  ('Counoise', 'RED', 'blue-black',
   'A minor Châteauneuf-du-Pape variety prized for the pepper, freshness and floral lift it brings to Grenache-based blends.',
   'Raspberry, white pepper, dried herbs', 'High', 'Low to medium', 'Light to medium', 'Medium',
   'Southern Rhône (Châteauneuf-du-Pape)'),
  ('Fiano', 'WHITE', 'thick, golden',
   'An ancient Campanian white of real substance — honeyed, nutty and waxy, and unusually long-lived for the south.',
   'Honey, hazelnut, pear, wild herbs', 'Medium to high', 'None (white)', 'Medium to full', 'Medium',
   'Campania (Fiano di Avellino), Sicily'),
  ('Furmint', 'WHITE', 'thin, golden',
   'Hungary''s great white — backbone of sweet Tokaji and, increasingly, of taut smoky dry wines; prone to noble rot.',
   'Green apple, quince, smoke, honey', 'High', 'None (white)', 'Medium to full', 'Medium',
   'Hungary (Tokaj)'),
  ('Greco', 'WHITE', 'thick, golden-amber',
   'A firm, structured southern-Italian white — peachy and mineral, with a grip unusual in a white wine.',
   'Peach, apricot, citrus peel, flint', 'High', 'None (white)', 'Medium to full', 'Medium',
   'Campania (Greco di Tufo)'),
  ('Marsanne', 'WHITE', 'thick, golden',
   'The richer half of white Rhône blends — full, waxy and almond-scented, gaining honeyed depth with age.',
   'Almond, quince, honeysuckle, marzipan', 'Low to medium', 'None (white)', 'Full', 'Medium to high',
   'Northern Rhône (Hermitage, Crozes), Australia'),
  ('Mencía', 'RED', 'thin, blue-black',
   'North-west Spain''s fragrant red — floral, red-fruited and mineral from steep slate slopes.',
   'Red cherry, violet, graphite, bay leaf', 'Medium to high', 'Medium', 'Medium', 'Medium to high',
   'Spain (Bierzo, Ribeira Sacra)'),
  ('Moscato', 'WHITE', 'green-gold to pink',
   'Muscat Blanc in its Asti guise — intensely grapey and floral, usually gently sweet and lightly sparkling.',
   'Grape, orange blossom, peach, elderflower', 'Medium', 'None (white)', 'Light', 'Low',
   'Piedmont (Asti, Moscato d''Asti)'),
  ('Picpoul', 'WHITE', 'green-gold',
   'Languedoc''s "lip-stinger" — a zesty, saline seaside white made for a plate of oysters.',
   'Lemon, grapefruit, green apple, sea spray', 'High', 'None (white)', 'Light', 'Medium',
   'Languedoc (Picpoul de Pinet)'),
  ('Pinot Meunier', 'RED', 'blue-black, downy',
   'The soft, fruity, early-ripening third grape of Champagne, lending approachable fruit and roundness to the blend.',
   'Red apple, cherry, brioche', 'High', 'Low', 'Light to medium', 'Medium',
   'Champagne'),
  ('Roussanne', 'WHITE', 'russet-gold',
   'The aromatic, structured partner to Marsanne in white Rhône — herbal tea, pear and fine acidity.',
   'Herbal tea, pear, honeysuckle, beeswax', 'Medium to high', 'None (white)', 'Medium to full', 'Medium',
   'Northern & Southern Rhône, Savoie'),
  ('Silvaner', 'WHITE', 'green-yellow',
   'A quietly mineral German and Alsatian white — understated, earthy and food-friendly, at its best in Franken.',
   'Green apple, pear, fresh herbs, earth', 'Medium', 'None (white)', 'Medium', 'Medium',
   'Germany (Franken, Rheinhessen), Alsace'),
  ('Trebbiano', 'WHITE', 'golden-yellow',
   'Italy''s ubiquitous high-acid white (Ugni Blanc in France) — neutral and crisp, and the distilling base of Cognac.',
   'Lemon, green apple, neutral florals', 'High', 'None (white)', 'Light', 'Medium',
   'Central Italy; France (as Ugni Blanc)')
) as v(name, color, skin, description, aromas, acidity, tannin, body, alcohol, regions)
where g.name = v.name;

-- 2. Skin colours for red grapes that had every other field.
update grapes g set skin_color = v.skin
from (values
  ('Barbera', 'blue-black'),
  ('Carignan', 'thick, blue-black'),
  ('Cinsault', 'large, thin-skinned dark red'),
  ('Corvina', 'thick, dark blue'),
  ('Dolcetto', 'deep blue-black'),
  ('Garnacha', 'thin, pink-red'),
  ('Mourvèdre', 'thick, dark blue-black'),
  ('Nebbiolo', 'thin, pale blue-grey under heavy bloom'),
  ('Nero d''Avola', 'thick, blue-black'),
  ('Primitivo', 'blue-black'),
  ('Sangiovese', 'thin, blue-black'),
  ('Tempranillo', 'thick, dark purple-black'),
  ('Tinta Roriz', 'thick, dark purple-black'),
  ('Touriga Franca', 'thick, blue-black'),
  ('Touriga Nacional', 'small, thick blue-black'),
  ('Xinomavro', 'thin, dark red'),
  ('Zinfandel', 'thin, blue-black')
) as v(name, skin)
where g.name = v.name and g.skin_color is null;

-- 3. White grapes missing both skin colour and tannin.
update grapes g set
  skin_color = coalesce(g.skin_color, v.skin),
  typical_tannin = coalesce(g.typical_tannin, 'None (white)')
from (values
  ('Albariño', 'thick, golden-pink'),
  ('Assyrtiko', 'golden-amber'),
  ('Chenin Blanc', 'green-gold'),
  ('Gewürztraminer', 'pink-copper'),
  ('Glera', 'golden-green'),
  ('Grüner Veltliner', 'green-yellow'),
  ('Muscat', 'green to pink-amber'),
  ('Verdejo', 'green-gold'),
  ('Vermentino', 'golden-yellow'),
  ('Viognier', 'golden-yellow')
) as v(name, skin)
where g.name = v.name;

-- 4. White grapes that only lacked the (structurally absent) tannin field.
update grapes set typical_tannin = 'None (white)'
where typical_tannin is null and color = 'WHITE';

-- Fail-closed: no profiled grape should be left with a gap now.
do $$
declare v_gap int;
begin
  select count(*) into v_gap from grapes
   where color is null or skin_color is null or description is null
      or typical_aromas is null or typical_acidity is null or typical_tannin is null
      or typical_body is null or typical_alcohol is null or main_regions is null;
  if v_gap <> 0 then
    raise exception '% grapes still have profile gaps', v_gap;
  end if;
end $$;
