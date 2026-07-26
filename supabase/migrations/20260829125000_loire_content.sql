-- Loire — knowledge content (v1, published).
--
-- Region + Sancerre + Vouvray + Chinon + Muscadet Sevre et Maine articles;
-- every constituent gets grape/style links where the grape exists in the
-- library. Missing from the library (carried in style notes instead):
-- Folle Blanche (Gros Plant), Romorantin (Cour-Cheverny), Chasselas
-- (Pouilly-sur-Loire), Pineau d'Aunis (Coteaux du Loir). Insert-only with
-- guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'France''s longest wine river: a thousand kilometres of vineyards from the Atlantic salt of Muscadet through Chenin''s Anjou-Touraine heartland to the flinty Sauvignons of Sancerre. One valley, four families, and the world''s greatest range of Chenin Blanc.',
  'Atlantic in the west, progressively continental upriver; cool-climate freshness everywhere.',
  'Gneiss and schist (Nantais), dark schist and carbonifere (Anjou noir), tuffeau limestone (Saumur-Touraine), Kimmeridgian marl and silex (Centre).',
  array[
    'Four families: Pays Nantais, Anjou-Saumur, Touraine, Centre-Loire',
    'Chenin Blanc in every register: dry, sparkling, moelleux, noble rot',
    'Cabernet Franc reds: Chinon, Bourgueil, Saumur-Champigny',
    'Sauvignon Blanc benchmarks: Sancerre and Pouilly-Fume',
    'Muscadet sur lie: Melon de Bourgogne by the Atlantic'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.loire'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Cool and bright; river light and long autumns.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('sancerre',
   'The Sauvignon Blanc benchmark on chalk and flint hills above the upper Loire - taut, smoky, citrus-mineral whites, plus Pinot Noir reds and roses from the same slopes.',
   'Kimmeridgian marl (terres blanches), caillottes limestone and silex.',
   'The world benchmark for dry Sauvignon Blanc',
   'Pinot Noir makes the reds and roses'),
  ('vouvray',
   'Chenin Blanc on tuffeau limestone east of Tours - sec, demi-sec, moelleux and fine traditional-method bubbles, all from one grape, with legendary ageing capacity.',
   'Tuffeau limestone with clay and silex caps.',
   'One grape (Chenin), every register: dry to noble-rot sweet + sparkling',
   'Top vintages age for half a century'),
  ('chinon',
   'Rabelais'' town and Cabernet Franc''s Loire capital: sappy, raspberry-and-pencil-shaving reds from gravel terraces and tuffeau slopes along the Vienne.',
   'Sand-gravel terraces (lighter wines) and tuffeau slopes (structured).',
   'Cabernet Franc capital of the Loire',
   'A little Chenin white and Cabernet rose'),
  ('muscadet-sevre-et-maine',
   'The heart of Muscadet, between the Sevre and Maine rivers: Melon de Bourgogne raised sur lie for salty, lees-creamy whites - the oyster wine, with cru communal depth in Clisson, Gorges and Le Pallet.',
   'Gneiss, gabbro and granite of the Armorican massif.',
   'Sur lie: winter on the fine lees gives texture and bite',
   'Crus communaux (Clisson, Gorges, Le Pallet) age impressively')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place (library-present only).
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.loire', 'Chenin Blanc',       'PRINCIPAL', 'Vouvray, Anjou and the Layon sweets'),
  ('france.loire', 'Sauvignon Blanc',    'PRINCIPAL', 'Sancerre, Pouilly-Fume, Touraine'),
  ('france.loire', 'Cabernet Franc',     'PRINCIPAL', 'Chinon, Bourgueil, Saumur-Champigny'),
  ('france.loire', 'Melon de Bourgogne', 'PRINCIPAL', 'Muscadet'),
  ('france.loire.muscadet',                       'Melon de Bourgogne', 'PRINCIPAL', null),
  ('france.loire.muscadet-coteaux-de-la-loire',   'Melon de Bourgogne', 'PRINCIPAL', null),
  ('france.loire.muscadet-cotes-de-grandlieu',    'Melon de Bourgogne', 'PRINCIPAL', null),
  ('france.loire.muscadet-sevre-et-maine',        'Melon de Bourgogne', 'PRINCIPAL', 'Sur lie'),
  ('france.loire.muscadet-sevre-et-maine-clisson', 'Melon de Bourgogne', 'PRINCIPAL', 'Cru communal'),
  ('france.loire.muscadet-sevre-et-maine-gorges',  'Melon de Bourgogne', 'PRINCIPAL', 'Cru communal'),
  ('france.loire.muscadet-sevre-et-maine-le-pallet', 'Melon de Bourgogne', 'PRINCIPAL', 'Cru communal'),
  ('france.loire.coteaux-d-ancenis', 'Gamay', 'PRINCIPAL', 'With the sweet Malvoisie (Pinot Gris)'),
  ('france.loire.anjou', 'Chenin Blanc',   'PRINCIPAL', null),
  ('france.loire.anjou', 'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.anjou', 'Grolleau',       'ACCESSORY', 'Rose d''Anjou'),
  ('france.loire.anjou-brissac',           'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.anjou-villages',          'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.anjou-coteaux-de-la-loire', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.savennieres',                 'Chenin Blanc', 'PRINCIPAL', 'Dry Chenin of legendary intensity'),
  ('france.loire.savennieres-roche-aux-moines', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon', 'Chenin Blanc', 'PRINCIPAL', 'Noble-rot and passerillage sweets'),
  ('france.loire.coteaux-du-layon-beaulieu-sur-layon-ou-beaulieu', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon-faye-d-anjou-ou-faye',           'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon-premier-cru-chaume',             'Chenin Blanc', 'PRINCIPAL', 'The Layon premier cru'),
  ('france.loire.coteaux-du-layon-rablay-sur-layon-ou-rablay',     'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon-rochefort-sur-loire-ou-rochefort', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon-saint-aubin-de-luigne-ou-saint-aubin', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-layon-saint-lambert-du-lattay-ou-saint-lambert', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.quarts-de-chaume', 'Chenin Blanc', 'PRINCIPAL', 'The Loire''s only grand cru - noble rot'),
  ('france.loire.bonnezeaux',       'Chenin Blanc', 'PRINCIPAL', 'Noble-rot sweet'),
  ('france.loire.coteaux-de-l-aubance', 'Chenin Blanc', 'PRINCIPAL', 'Sweet'),
  ('france.loire.saumur', 'Chenin Blanc',   'PRINCIPAL', 'Whites and fine bubbles'),
  ('france.loire.saumur', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.loire.saumur-champigny', 'Cabernet Franc', 'PRINCIPAL', 'The silky Saumur red'),
  ('france.loire.touraine', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.touraine', 'Gamay',           'ACCESSORY', null),
  ('france.loire.touraine', 'Chenin Blanc',    'ACCESSORY', null),
  ('france.loire.touraine-amboise',       'Chenin Blanc',    'PRINCIPAL', null),
  ('france.loire.touraine-azay-le-rideau', 'Chenin Blanc',   'PRINCIPAL', null),
  ('france.loire.touraine-chenonceaux',   'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.touraine-mesland',       'Gamay',           'PRINCIPAL', null),
  ('france.loire.touraine-noble-joue',    'Pinot Noir',      'PRINCIPAL', 'A rose of the three Pinots'),
  ('france.loire.touraine-oisly',         'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.vouvray',            'Chenin Blanc', 'PRINCIPAL', 'Sec to moelleux + bubbles'),
  ('france.loire.montlouis-sur-loire', 'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.jasnieres',          'Chenin Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-loir',    'Chenin Blanc', 'PRINCIPAL', 'With Pineau d''Aunis reds - not yet in the grape library'),
  ('france.loire.chinon',                    'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.bourgueil',                 'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.saint-nicolas-de-bourgueil', 'Cabernet Franc', 'PRINCIPAL', null),
  ('france.loire.cheverny', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.cheverny', 'Gamay',           'ACCESSORY', null),
  ('france.loire.valencay', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.valencay', 'Gamay',           'ACCESSORY', null),
  ('france.loire.haut-poitou', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.sancerre', 'Sauvignon Blanc', 'PRINCIPAL', 'The benchmark'),
  ('france.loire.sancerre', 'Pinot Noir',      'ACCESSORY', 'Reds and roses'),
  ('france.loire.pouilly-fume', 'Sauvignon Blanc', 'PRINCIPAL', 'Smoky silex'),
  ('france.loire.menetou-salon', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.menetou-salon', 'Pinot Noir',      'ACCESSORY', null),
  ('france.loire.quincy', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.reuilly', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.reuilly', 'Pinot Noir',      'ACCESSORY', 'Pinot Gris rose too'),
  ('france.loire.coteaux-du-giennois', 'Sauvignon Blanc', 'PRINCIPAL', null),
  ('france.loire.coteaux-du-giennois', 'Pinot Noir',      'ACCESSORY', 'With Gamay'),
  ('france.loire.chateaumeillant', 'Gamay', 'PRINCIPAL', 'Reds and vin gris')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('france.loire', 'WHITE', 'Chenin, Sauvignon, Melon', 0),
  ('france.loire', 'RED', 'Cabernet Franc, Gamay, Pinot Noir', 1),
  ('france.loire', 'ROSE', null, 2),
  ('france.loire', 'SPARKLING', 'Cremant de Loire, Vouvray, Saumur', 3),
  ('france.loire', 'SWEET', 'Layon, Quarts de Chaume, moelleux Chenin', 4),
  ('france.loire.muscadet', 'WHITE', 'Sur lie', 0),
  ('france.loire.muscadet-coteaux-de-la-loire', 'WHITE', null, 0),
  ('france.loire.muscadet-cotes-de-grandlieu', 'WHITE', null, 0),
  ('france.loire.muscadet-sevre-et-maine', 'WHITE', 'Sur lie', 0),
  ('france.loire.muscadet-sevre-et-maine-clisson', 'WHITE', null, 0),
  ('france.loire.muscadet-sevre-et-maine-gorges', 'WHITE', null, 0),
  ('france.loire.muscadet-sevre-et-maine-le-pallet', 'WHITE', null, 0),
  ('france.loire.gros-plant-du-pays-nantais', 'WHITE', 'Folle Blanche - not yet in the grape library', 0),
  ('france.loire.fiefs-vendeens-brem', 'RED', 'Red, white and rose', 0),
  ('france.loire.fiefs-vendeens-chantonnay', 'RED', 'Red, white and rose', 0),
  ('france.loire.fiefs-vendeens-mareuil', 'RED', 'Red, white and rose', 0),
  ('france.loire.fiefs-vendeens-pissotte', 'RED', 'Red, white and rose', 0),
  ('france.loire.fiefs-vendeens-vix', 'RED', 'Red, white and rose', 0),
  ('france.loire.coteaux-d-ancenis', 'RED', 'Gamay', 0),
  ('france.loire.coteaux-d-ancenis', 'SWEET', 'Malvoisie (Pinot Gris)', 1),
  ('france.loire.anjou', 'RED', null, 0),
  ('france.loire.anjou', 'WHITE', null, 1),
  ('france.loire.anjou', 'ROSE', 'Rose d''Anjou, Cabernet d''Anjou', 2),
  ('france.loire.anjou-brissac', 'RED', null, 0),
  ('france.loire.anjou-villages', 'RED', null, 0),
  ('france.loire.anjou-coteaux-de-la-loire', 'WHITE', null, 0),
  ('france.loire.savennieres', 'WHITE', 'Dry Chenin', 0),
  ('france.loire.savennieres-roche-aux-moines', 'WHITE', null, 0),
  ('france.loire.coteaux-du-layon', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-beaulieu-sur-layon-ou-beaulieu', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-faye-d-anjou-ou-faye', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-premier-cru-chaume', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-rablay-sur-layon-ou-rablay', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-rochefort-sur-loire-ou-rochefort', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-saint-aubin-de-luigne-ou-saint-aubin', 'SWEET', null, 0),
  ('france.loire.coteaux-du-layon-saint-lambert-du-lattay-ou-saint-lambert', 'SWEET', null, 0),
  ('france.loire.quarts-de-chaume', 'SWEET', 'Noble rot - the Loire grand cru', 0),
  ('france.loire.bonnezeaux', 'SWEET', null, 0),
  ('france.loire.coteaux-de-l-aubance', 'SWEET', null, 0),
  ('france.loire.saumur', 'WHITE', null, 0),
  ('france.loire.saumur', 'RED', null, 1),
  ('france.loire.saumur', 'SPARKLING', 'Traditional method on tuffeau', 2),
  ('france.loire.saumur-champigny', 'RED', null, 0),
  ('france.loire.touraine', 'WHITE', null, 0),
  ('france.loire.touraine', 'RED', null, 1),
  ('france.loire.touraine', 'ROSE', null, 2),
  ('france.loire.touraine-amboise', 'RED', null, 0),
  ('france.loire.touraine-azay-le-rideau', 'WHITE', null, 0),
  ('france.loire.touraine-chenonceaux', 'WHITE', null, 0),
  ('france.loire.touraine-mesland', 'RED', null, 0),
  ('france.loire.touraine-noble-joue', 'ROSE', 'The Tours rose of the three Pinots', 0),
  ('france.loire.touraine-oisly', 'WHITE', null, 0),
  ('france.loire.vouvray', 'WHITE', 'Sec to moelleux', 0),
  ('france.loire.vouvray', 'SPARKLING', null, 1),
  ('france.loire.vouvray', 'SWEET', 'Moelleux and liquoreux years', 2),
  ('france.loire.montlouis-sur-loire', 'WHITE', null, 0),
  ('france.loire.montlouis-sur-loire', 'SPARKLING', 'Petillant originel', 1),
  ('france.loire.jasnieres', 'WHITE', null, 0),
  ('france.loire.coteaux-du-loir', 'RED', 'Pineau d''Aunis - not yet in the grape library', 0),
  ('france.loire.coteaux-du-loir', 'WHITE', null, 1),
  ('france.loire.chinon', 'RED', null, 0),
  ('france.loire.chinon', 'ROSE', null, 1),
  ('france.loire.chinon', 'WHITE', 'A little Chenin', 2),
  ('france.loire.bourgueil', 'RED', null, 0),
  ('france.loire.bourgueil', 'ROSE', null, 1),
  ('france.loire.saint-nicolas-de-bourgueil', 'RED', null, 0),
  ('france.loire.cheverny', 'WHITE', null, 0),
  ('france.loire.cheverny', 'RED', null, 1),
  ('france.loire.cour-cheverny', 'WHITE', 'Romorantin - not yet in the grape library', 0),
  ('france.loire.valencay', 'RED', null, 0),
  ('france.loire.valencay', 'WHITE', null, 1),
  ('france.loire.haut-poitou', 'WHITE', null, 0),
  ('france.loire.haut-poitou', 'RED', null, 1),
  ('france.loire.sancerre', 'WHITE', null, 0),
  ('france.loire.sancerre', 'RED', 'Pinot Noir', 1),
  ('france.loire.sancerre', 'ROSE', null, 2),
  ('france.loire.pouilly-fume', 'WHITE', 'Smoky silex Sauvignon', 0),
  ('france.loire.pouilly-sur-loire', 'WHITE', 'Chasselas - not yet in the grape library', 0),
  ('france.loire.menetou-salon', 'WHITE', null, 0),
  ('france.loire.menetou-salon', 'RED', null, 1),
  ('france.loire.menetou-salon', 'ROSE', null, 2),
  ('france.loire.quincy', 'WHITE', null, 0),
  ('france.loire.reuilly', 'WHITE', null, 0),
  ('france.loire.reuilly', 'RED', null, 1),
  ('france.loire.reuilly', 'ROSE', 'Pinot Gris vin gris', 2),
  ('france.loire.coteaux-du-giennois', 'WHITE', null, 0),
  ('france.loire.coteaux-du-giennois', 'RED', null, 1),
  ('france.loire.chateaumeillant', 'RED', null, 0),
  ('france.loire.chateaumeillant', 'ROSE', 'Vin gris', 1)
) as v(ck, style, note, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_a <> 5 then raise exception 'expected 5 loire articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_g <> 66 then raise exception 'expected 66 loire grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_s <> 89 then raise exception 'expected 89 loire styles, got %', v_s; end if;
end;
$$;
