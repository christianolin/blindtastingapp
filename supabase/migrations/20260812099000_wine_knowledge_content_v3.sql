-- Phase 3D content: articles, styles, grapes and designations for the 68
-- Burgundy places added by waves 3D-1..3 (Côte de Beaune, Chablis, Grand
-- Auxerrois, Côte Chalonnaise, Mâconnais). Published directly per the
-- standing owner review pattern — corrections are cheap updates. Insert-only
-- against existing rows throughout.

-- Irancy's signature accessory grape.
insert into grapes (name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
select * from (values
  ('César', 'RED', 'thick, deep black',
   'Ancient northern-Burgundy red said to have arrived with Roman legions; now a seasoning grape of Irancy (max 10%), adding colour, tannin and a rustic edge to Pinot Noir.',
   'Dark cherry, forest floor, black pepper', 'Medium to high', 'High', 'Medium', 'Medium',
   'Irancy (Yonne)')
) as v(name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- Designation links: same rule as v1, now covering every new Burgundy
-- classified place (grand cru / premier cru / village catalogue entries).
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p
join wine_designations d on d.key = case
  when p.appellation_level = 'grand_cru' then 'burgundy-grand-cru'
  when p.appellation_level = 'premier_cru' then 'burgundy-premier-cru'
  when p.appellation_level = 'communal' then 'burgundy-village'
end
where p.publication_status = 'VERIFIED'
  and p.canonical_key like 'france.bourgogne.%'
  and p.appellation_level in ('grand_cru', 'premier_cru', 'communal')
on conflict (wine_place_id, designation_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.sort, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune', 'RED', 'Slightly red-led overall', 0),
  ('france.bourgogne.cote-de-beaune', 'WHITE', 'Home of Burgundy''s greatest whites', 1),
  ('france.bourgogne.chablis', 'WHITE', 'White only — pure Chardonnay', 0),
  ('france.bourgogne.grand-auxerrois', 'WHITE', null, 0),
  ('france.bourgogne.grand-auxerrois', 'RED', 'Irancy', 1),
  ('france.bourgogne.cote-chalonnaise', 'RED', null, 0),
  ('france.bourgogne.cote-chalonnaise', 'WHITE', null, 1),
  ('france.bourgogne.maconnais', 'WHITE', 'Overwhelmingly Chardonnay', 0),
  ('france.bourgogne.maconnais', 'RED', 'Gamay-led reds as Mâcon', 1),
  ('france.bourgogne.cote-de-beaune.ladoix', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.ladoix', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'RED', 'White is a rarity', 0),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'RED', 'Nearly all red', 0),
  ('france.bourgogne.cote-de-beaune.beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.beaune', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.pommard', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-beaune.volnay', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-beaune.monthelie', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.monthelie', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'WHITE', 'White-led', 0),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'RED', null, 1),
  ('france.bourgogne.cote-de-beaune.meursault', 'WHITE', 'The white benchmark', 0),
  ('france.bourgogne.cote-de-beaune.meursault', 'RED', 'Rare — the best reds sell as Volnay-Santenots', 1),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet', 'WHITE', 'White only in practice', 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'RED', 'A genuine third of production', 1),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'RED', null, 1),
  ('france.bourgogne.cote-de-beaune.santenay', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.santenay', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.maranges', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.maranges', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'RED', 'The Côte de Beaune''s only red grand cru', 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'WHITE', 'A sliver of Corton blanc', 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.chablis.chablis', 'WHITE', null, 0),
  ('france.bourgogne.chablis.petit-chablis', 'WHITE', null, 0),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru', 'WHITE', null, 0),
  ('france.bourgogne.grand-auxerrois.irancy', 'RED', 'Pinot Noir with a dash of César', 0),
  ('france.bourgogne.grand-auxerrois.saint-bris', 'WHITE', 'Burgundy''s Sauvignon island', 0),
  ('france.bourgogne.grand-auxerrois.vezelay', 'WHITE', null, 0),
  ('france.bourgogne.cote-chalonnaise.bouzeron', 'WHITE', 'Aligoté''s own village AOC', 0),
  ('france.bourgogne.cote-chalonnaise.rully', 'WHITE', null, 0),
  ('france.bourgogne.cote-chalonnaise.rully', 'RED', null, 1),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'RED', 'The Chalonnaise''s red capital', 0),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'WHITE', null, 1),
  ('france.bourgogne.cote-chalonnaise.givry', 'RED', null, 0),
  ('france.bourgogne.cote-chalonnaise.givry', 'WHITE', null, 1),
  ('france.bourgogne.cote-chalonnaise.montagny', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.macon', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.macon', 'RED', 'From Gamay', 1),
  ('france.bourgogne.maconnais.vire-clesse', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.pouilly-fuisse', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.pouilly-vinzelles', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.pouilly-loche', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.saint-veran', 'WHITE', null, 0)
) as v(key, style, note, sort)
join wine_places p on p.canonical_key = v.key
on conflict (wine_place_id, style) do nothing;

-- Premier-cru groups inherit their village's styles (rosé never applies).
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select grp.id, vs.style, null, vs.sort_order, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_styles vs on vs.wine_place_id = v.id and vs.style <> 'ROSE'
where grp.canonical_key like 'france.bourgogne.%'
  and grp.canonical_key like '%.premier-cru'
  and grp.appellation_level = 'premier_cru'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune', 'Pinot Noir', 'PRINCIPAL', 55, null),
  ('france.bourgogne.cote-de-beaune', 'Chardonnay', 'PRINCIPAL', 42, null),
  ('france.bourgogne.cote-de-beaune', 'Aligoté', 'ACCESSORY', 2, null),
  ('france.bourgogne.chablis', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.grand-auxerrois', 'Chardonnay', 'PRINCIPAL', 45, null),
  ('france.bourgogne.grand-auxerrois', 'Pinot Noir', 'PRINCIPAL', 25, 'Irancy'),
  ('france.bourgogne.grand-auxerrois', 'Sauvignon Blanc', 'ACCESSORY', 20, 'Saint-Bris'),
  ('france.bourgogne.grand-auxerrois', 'Aligoté', 'ACCESSORY', 5, null),
  ('france.bourgogne.grand-auxerrois', 'César', 'ACCESSORY', null, 'Irancy''s seasoning grape'),
  ('france.bourgogne.cote-chalonnaise', 'Pinot Noir', 'PRINCIPAL', 50, null),
  ('france.bourgogne.cote-chalonnaise', 'Chardonnay', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-chalonnaise', 'Aligoté', 'ACCESSORY', 8, 'Bouzeron'),
  ('france.bourgogne.maconnais', 'Chardonnay', 'PRINCIPAL', 85, null),
  ('france.bourgogne.maconnais', 'Gamay', 'ACCESSORY', 10, 'Mâcon rouge'),
  ('france.bourgogne.maconnais', 'Pinot Noir', 'ACCESSORY', 3, null),
  ('france.bourgogne.cote-de-beaune.ladoix', 'Pinot Noir', 'PRINCIPAL', 75, null),
  ('france.bourgogne.cote-de-beaune.ladoix', 'Chardonnay', 'ACCESSORY', 22, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'Pinot Noir', 'PRINCIPAL', 98, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'Chardonnay', 'ACCESSORY', 1, null),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'Pinot Noir', 'PRINCIPAL', 70, null),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'Chardonnay', 'ACCESSORY', 28, null),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'Chardonnay', 'ACCESSORY', 12, null),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'Pinot Noir', 'PRINCIPAL', 95, null),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'Chardonnay', 'ACCESSORY', 4, null),
  ('france.bourgogne.cote-de-beaune.beaune', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.beaune', 'Chardonnay', 'ACCESSORY', 12, null),
  ('france.bourgogne.cote-de-beaune.pommard', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.volnay', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.monthelie', 'Pinot Noir', 'PRINCIPAL', 88, null),
  ('france.bourgogne.cote-de-beaune.monthelie', 'Chardonnay', 'ACCESSORY', 10, null),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'Pinot Noir', 'PRINCIPAL', 70, null),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'Chardonnay', 'ACCESSORY', 28, null),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'Chardonnay', 'PRINCIPAL', 55, null),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'Pinot Noir', 'PRINCIPAL', 43, null),
  ('france.bourgogne.cote-de-beaune.meursault', 'Chardonnay', 'PRINCIPAL', 96, null),
  ('france.bourgogne.cote-de-beaune.meursault', 'Pinot Noir', 'ACCESSORY', 3, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet', 'Chardonnay', 'PRINCIPAL', 99, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'Chardonnay', 'PRINCIPAL', 65, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'Pinot Noir', 'PRINCIPAL', 33, null),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'Chardonnay', 'PRINCIPAL', 70, null),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'Pinot Noir', 'ACCESSORY', 28, null),
  ('france.bourgogne.cote-de-beaune.santenay', 'Pinot Noir', 'PRINCIPAL', 80, null),
  ('france.bourgogne.cote-de-beaune.santenay', 'Chardonnay', 'ACCESSORY', 18, null),
  ('france.bourgogne.cote-de-beaune.maranges', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.cote-de-beaune.maranges', 'Chardonnay', 'ACCESSORY', 8, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'Pinot Noir', 'PRINCIPAL', 96, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'Chardonnay', 'ACCESSORY', 3, 'Corton blanc'),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.chablis.chablis', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.chablis.petit-chablis', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.grand-auxerrois.irancy', 'Pinot Noir', 'PRINCIPAL', 92, null),
  ('france.bourgogne.grand-auxerrois.irancy', 'César', 'ACCESSORY', 8, 'Capped at 10%'),
  ('france.bourgogne.grand-auxerrois.saint-bris', 'Sauvignon Blanc', 'PRINCIPAL', 88, 'The AOC requires Sauvignon'),
  ('france.bourgogne.grand-auxerrois.vezelay', 'Chardonnay', 'PRINCIPAL', 95, null),
  ('france.bourgogne.cote-chalonnaise.bouzeron', 'Aligoté', 'PRINCIPAL', 100, 'The only village AOC for Aligoté'),
  ('france.bourgogne.cote-chalonnaise.rully', 'Chardonnay', 'PRINCIPAL', 55, null),
  ('france.bourgogne.cote-chalonnaise.rully', 'Pinot Noir', 'PRINCIPAL', 43, null),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'Pinot Noir', 'PRINCIPAL', 80, null),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'Chardonnay', 'ACCESSORY', 18, null),
  ('france.bourgogne.cote-chalonnaise.givry', 'Pinot Noir', 'PRINCIPAL', 82, null),
  ('france.bourgogne.cote-chalonnaise.givry', 'Chardonnay', 'ACCESSORY', 16, null),
  ('france.bourgogne.cote-chalonnaise.montagny', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.macon', 'Chardonnay', 'PRINCIPAL', 80, null),
  ('france.bourgogne.maconnais.macon', 'Gamay', 'PRINCIPAL', 15, 'Mâcon rouge'),
  ('france.bourgogne.maconnais.macon', 'Pinot Noir', 'ACCESSORY', 3, null),
  ('france.bourgogne.maconnais.vire-clesse', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-fuisse', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-vinzelles', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-loche', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.saint-veran', 'Chardonnay', 'PRINCIPAL', 100, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Premier-cru groups inherit their village's grapes.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select grp.id, vg.grape_id, vg.role, vg.permitted, vg.share_pct, null, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_grapes vg on vg.wine_place_id = v.id
where grp.canonical_key like 'france.bourgogne.%'
  and grp.canonical_key like '%.premier-cru'
  and grp.appellation_level = 'premier_cru'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, v.climate, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune',
   'The southern half of the Côte d''Or, Ladoix to Maranges — red and white in near-equal measure, and home to every one of Burgundy''s great white grands crus. Broader, softer slopes than the Côte de Nuits.',
   'Continental, a shade warmer and more open than the north.',
   'Limestone with more marl and gentler contours.',
   array['All the white grands crus but Musigny Blanc', 'Corton — the Côte de Beaune''s only red grand cru', 'Runs from Ladoix to Maranges']),
  ('france.bourgogne.chablis',
   'Burgundy''s cool northern outpost, closer to Champagne than to Beaune — steely, saline Chardonnay from fossil-rich marl. One grand cru slope with seven named climats.',
   'Semi-continental and frost-prone; spring frost candles are part of the landscape.',
   'Kimmeridgian marl packed with fossil oysters; Portlandian limestone on the fringes.',
   array['Kimmeridgian soil defines the style', 'One grand cru, seven climats', 'Petit Chablis rings the plateau']),
  ('france.bourgogne.grand-auxerrois',
   'The scattered vineyards of the Yonne beyond Chablis: Irancy''s cherry-dark Pinot, Saint-Bris''s outlier Sauvignon, and Vézelay''s slender Chardonnay beneath the famous pilgrimage hill.',
   'Cool semi-continental — the northern edge of ripening.',
   'Kimmeridgian and Portlandian limestone.',
   array['Saint-Bris — Burgundy''s only Sauvignon AOC', 'Irancy seasons Pinot with ancient César', 'Vézelay''s hill is UNESCO-listed']),
  ('france.bourgogne.cote-chalonnaise',
   'The Côte d''Or''s southern continuation without the fame: five village AOCs from Bouzeron to Montagny giving honest Pinot, Chardonnay — and Burgundy''s only village Aligoté. The value hunting ground.',
   'Slightly drier and breezier than the Côte d''Or.',
   'The same limestone-marl family, more broken into hills.',
   array['Bouzeron: Aligoté''s only village AOC', 'Mercurey is the red capital', 'Montagny is white only']),
  ('france.bourgogne.maconnais',
   'Burgundy''s biggest white-wine engine, rolling south to the rock of Solutré — ripe, sunny Chardonnay from Mâcon to Pouilly-Fuissé, which gained premiers crus in 2020.',
   'The warmest, most southern Burgundy.',
   'Limestone ridges alternating with clay, granite appearing towards Beaujolais.',
   array['Pouilly-Fuissé gained premiers crus in 2020', 'The village of Chardonnay lends the grape its name', 'Gamay survives in Mâcon rouge']),
  ('france.bourgogne.cote-de-beaune.ladoix',
   'The Côte de Beaune''s quiet northern doorstep, wrapped around the hill of Corton — sturdy reds and mineral whites that often sell for less than their pedigree.',
   null,
   'Marl and limestone running up into the Corton hill.',
   array['Shares the hill of Corton', 'Often labelled Côte de Beaune-Villages historically']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton',
   'The village beneath the great wooded hill: nearly all red, firm and slow to unwind, with the Corton grands crus towering directly above the rooftops.',
   null,
   'Iron-rich red soil over limestone on the hill''s lower flanks.',
   array['Gateway to Corton and Corton-Charlemagne', 'Almost entirely red']),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses',
   'Tucked into the cool valley behind the Corton hill — bright, tensile whites (much of Corton-Charlemagne''s western face is here) and slender, savoury reds.',
   null,
   'Steep marl-limestone with cooler exposures.',
   array['Holds part of Corton-Charlemagne', 'Île des Vergelesses is the flagship premier cru']),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune',
   'A broad valley of supple, red-fruited Pinot either side of the little Rhoin stream — generous premiers crus on both slopes and some of the Côte''s best value.',
   null,
   'Gravelly valley floor rising to marl slopes on both sides.',
   array['Premiers crus face each other across the valley', 'Historic source of everyday Beaune reds']),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune',
   'Flatland village below the main slope — easy, cherry-bright Pinot for early drinking, nearly all of it red and honestly priced.',
   null,
   'Deeper alluvial clay and gravel off the slope.',
   array['No premiers crus', 'A byword for value Beaune-area red']),
  ('france.bourgogne.cote-de-beaune.beaune',
   'The wine capital''s own vineyard — a long ribbon of premiers crus above the medieval town, red-led with a swelling share of white. The négociant houses'' home turf.',
   null,
   'Varied marl and limestone along a long slope face.',
   array['One of Burgundy''s largest premier-cru rosters', 'Home of the Hospices de Beaune auction']),
  ('france.bourgogne.cote-de-beaune.pommard',
   'The Côte de Beaune''s sternest red: dark, tannic, iron-edged Pinot built for the long haul — no white, no grand cru, no apologies. Les Rugiens and Les Epenots lead.',
   null,
   'Heavier clay and iron-rich marl.',
   array['Red only', 'Les Rugiens is the perennial grand-cru candidate']),
  ('france.bourgogne.cote-de-beaune.volnay',
   'Pommard''s elegant opposite: the Côte de Beaune''s most perfumed, lacy red from thin, chalky soils high on the slope. Caillerets and Champans at the summit.',
   null,
   'Thin, pale, chalky limestone.',
   array['Red only', 'The "Chambolle of the Côte de Beaune"']),
  ('france.bourgogne.cote-de-beaune.monthelie',
   'The hidden fold between Volnay and Meursault — red-led, taut and red-fruited, a step lighter than Volnay and a big step cheaper.',
   null,
   'Limestone scree in a side valley.',
   array['Volnay''s quiet neighbour', 'Mostly red with a growing white share'])
) as v(key, description, climate, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune.auxey-duresses',
   'A cool side-valley behind Meursault splitting its loyalties: nervy whites in Meursault''s image and peppery, structured reds towards Monthélie — insider Burgundy.',
   'Cooler valley exposures, limestone and marl.',
   array['Whites echo neighbouring Meursault', 'Long a source for négociant blends']),
  ('france.bourgogne.cote-de-beaune.saint-romain',
   'The Côte''s mountain village, vines climbing past 400 m under white cliffs — chiselled, cool-toned Chardonnay first, sharp red-currant Pinot second.',
   'Among the highest and coolest village vineyards in the Côte d''Or.',
   array['No premiers crus — altitude is the signature', 'A white-led late bloomer of the Côte']),
  ('france.bourgogne.cote-de-beaune.meursault',
   'The Côte''s white benchmark: broad, nutty, textural Chardonnay from a deep bench of premiers crus — Perrières, Genevrières, Charmes — with no grand cru and no need of one.',
   'Deep, stony limestone with famous cellars metres below.',
   array['Perrières is the grand-cru-in-waiting', 'Its rare reds mostly sell as Volnay-Santenots']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet',
   'Where white Burgundy turns crystalline: floral, saline, endlessly precise Chardonnay. The village shares Montrachet and Bâtard with Chassagne and keeps Chevalier and Bienvenues for itself.',
   'High water table — almost no deep cellars in the village.',
   array['Four grands crus on its slope', 'The most mineral of the great white villages']),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet',
   'The Côte''s southern white powerhouse with a genuine red tradition — a third of it is Pinot. Shares Montrachet and Bâtard, and holds Criots-Bâtard alone.',
   'Limestone quarried for centuries — the stone built half of Beaune.',
   array['A third of production is red', 'Shares two grands crus with Puligny']),
  ('france.bourgogne.cote-de-beaune.saint-aubin',
   'A high, cool valley around the corner from Montrachet — flinty, energetic whites (En Remilly, Murgers des Dents de Chien) at friendly prices; the smart money''s white Burgundy.',
   'High, stony and cool; brisk ripening years favour it.',
   array['Two-thirds white and rising', 'Borders Montrachet across the road']),
  ('france.bourgogne.cote-de-beaune.santenay',
   'The Côte d''Or''s southern bookend spa town — sturdy, earthy reds and increasingly polished whites from a long, varied slope.',
   'Marl heavier and more mineral-veined towards the south.',
   array['The Côte d''Or''s southern terminus', 'Red-led with rising whites']),
  ('france.bourgogne.cote-de-beaune.maranges',
   'Three communes over the county line where the Côte finally fades — robust, dark-fruited Pinot, the last vines of the golden slope.',
   'Marl and limestone folds beyond the Dheune.',
   array['Created in 1989 from three villages', 'The Côte de Beaune''s final AOC southward']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton',
   'The Côte de Beaune''s only red grand cru and Burgundy''s largest — a whole hillside of named climats (Bressandes, Clos du Roi, Renardes) ringing the wooded crown. Iron-firm Pinot that ages like the Côte de Nuits.',
   'Iron-flecked red marl mid-slope beneath the woods.',
   array['The Côte de Beaune''s only red grand cru', 'Burgundy''s largest grand cru', 'A sliver of Corton blanc exists']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne',
   'The emperor''s white: powerful, stony Chardonnay from the upper flanks of the Corton hill, wrapping from Aloxe through Pernand. Slow-burning splendour built for a decade.',
   'Pale marl high on the hill, white-stone cool.',
   array['Legend credits Charlemagne''s own vines', 'Wraps around the hill''s south and west faces']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne',
   'The historical core parcel of the emperor''s vineyard — in practice sold as Corton-Charlemagne, whose name it may legally use; bottles saying just "Charlemagne" are collector curiosities.',
   'Shares the upper hill with Corton-Charlemagne.',
   array['Almost always sold as Corton-Charlemagne', '87% shared footprint in INAO parcels']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet',
   'The greatest dry white vineyard on earth by common consent — eight hectares astride the Puligny–Chassagne line giving Chardonnay of impossible completeness: power, cut, perfume, permanence.',
   'A perfect, bare mid-slope of cracked limestone.',
   array['Straddles Puligny and Chassagne', 'The reference point for dry white wine']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet',
   'The thin-soiled slope directly above Montrachet — the most aerial and mineral of the family, trading a little flesh for extra cut.',
   'Shallowest, stoniest soil of the group, higher on the slope.',
   array['Entirely within Puligny', 'The "upstairs neighbour" of Montrachet']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet',
   'The richest of the family, on deeper soil below Montrachet and shared with Chassagne — broad-shouldered, honeyed Chardonnay that fills every corner of the glass.',
   'Deeper, browner soil below the Montrachet wall.',
   array['Straddles Puligny and Chassagne', 'The most opulent Montrachet style']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet',
   'A small Puligny-side enclave within Bâtard''s band — a touch finer-boned than Bâtard, floral where its neighbour is rich.',
   'Shares Bâtard''s deeper band with slightly lighter soil.',
   array['Enclave within the Bâtard band', 'Just 3.7 ha, Puligny side only']),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet',
   'The smallest of the Montrachet family, wholly in Chassagne — bright, chalk-dust Chardonnay ("criots" = the crackle of stones) of jewel-box rarity.',
   'Stone-crackle limestone at the band''s southern tip.',
   array['Smallest of the Montrachet grands crus', 'Entirely within Chassagne'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.chablis.chablis',
   'The village AOC that made cool-climate Chardonnay famous: bone-dry, green-gold wine tasting of oyster shell and struck stone, from slopes along the little Serein.',
   'Kimmeridgian marl heavy with fossil oysters.',
   array['Forty premier-cru climats', 'The definition of unoaked Chardonnay for many']),
  ('france.bourgogne.chablis.petit-chablis',
   'The plateau ring above and around Chablis proper — lighter, sharper, citrus-and-chalk Chardonnay for immediate drinking.',
   'Younger Portlandian limestone on the plateau tops.',
   array['Portlandian rather than Kimmeridgian soil', 'Made for the first two years']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru',
   'One sweep of south-west-facing slope across the river from town, divided into seven climats — Les Clos, Vaudésir, Valmur among them — where Chablis gains flesh without losing its salt.',
   'The steepest, best-exposed Kimmeridgian in the region.',
   array['A single slope, seven named climats', 'Les Clos is the largest and most renowned']),
  ('france.bourgogne.grand-auxerrois.irancy',
   'A cherry-orchard amphitheatre south of Auxerre making the Yonne''s serious red: taut, dark-cherry Pinot Noir seasoned by up to a tenth of ancient César.',
   'A sheltered limestone bowl.',
   array['Red only', 'César adds colour and grip']),
  ('france.bourgogne.grand-auxerrois.saint-bris',
   'Burgundy''s constitutional anomaly: an AOC for Sauvignon Blanc, grassy and flinty, granted in 2003 in the middle of Chardonnay country.',
   'Kimmeridgian slopes like neighbouring Chablis.',
   array['Burgundy''s only Sauvignon AOC', 'AOC since 2003']),
  ('france.bourgogne.grand-auxerrois.vezelay',
   'Slender, unoaked Chardonnay from slopes beneath the pilgrimage basilica of Vézelay — village AOC only since 2017 and still a secret.',
   'Limestone and clay beneath the hill.',
   array['Village AOC since 2017', 'The basilica hill is UNESCO-listed']),
  ('france.bourgogne.cote-chalonnaise.bouzeron',
   'The only village appellation in Burgundy reserved for Aligoté — old vines on steep marl giving the grape its one chance at seriousness.',
   'Steep brown marl.',
   array['Aligoté only', 'Championed by the de Villaine family']),
  ('france.bourgogne.cote-chalonnaise.rully',
   'White-leaning village of taut, appley Chardonnay and slender reds — and the historic cradle of Crémant de Bourgogne.',
   'Limestone slopes open to the plain.',
   array['Crémant de Bourgogne began here', 'White-led with 23 premiers crus']),
  ('france.bourgogne.cote-chalonnaise.mercurey',
   'The Chalonnaise''s big red: firm, dark-berried Pinot from a large, quality-minded vineyard — the district''s answer to the Côte de Beaune.',
   'Iron-tinged marl over limestone.',
   array['The Chalonnaise''s largest and most red', 'Over thirty premiers crus']),
  ('france.bourgogne.cote-chalonnaise.givry',
   'Compact village of supple, spice-edged reds — the wine Henri IV famously favoured — with a small, bright white share.',
   'Limestone with light marl.',
   array['Henri IV''s table wine, says the legend', 'Red-led with lively premiers crus']),
  ('france.bourgogne.cote-chalonnaise.montagny',
   'The Chalonnaise''s southern white: all Chardonnay, firm and lemon-stony, from slopes that once counted every parcel premier cru.',
   'Marl and limestone folds.',
   array['White only', 'Nearly the whole slope ranks premier cru']),
  ('france.bourgogne.maconnais.macon',
   'The regional engine of the south: fresh, sunny Chardonnay (and Gamay reds) across dozens of villages, many hyphenating their name — Mâcon-Lugny, Mâcon-Verzé — under one roomy AOC.',
   'Limestone and clay over rolling farmland.',
   array['Village names hyphenate onto the label', 'Reds are Gamay']),
  ('france.bourgogne.maconnais.vire-clesse',
   'Two villages united in 1999 into the Mâconnais''s tightest cru — ripe but chalk-lined Chardonnay with unusual ageing stamina.',
   'Chalky limestone ridge.',
   array['Created 1999 from Viré and Clessé', 'Known for late-harvest levroutée rarities']),
  ('france.bourgogne.maconnais.pouilly-fuisse',
   'The Mâconnais''s flagship beneath the twin rocks of Solutré and Vergisson — rich, mineral Chardonnay that finally won premier-cru status in 2020.',
   'Limestone amphitheatres beneath the two great rocks.',
   array['Premiers crus granted 2020 — 22 climats', 'The south''s most serious white']),
  ('france.bourgogne.maconnais.pouilly-vinzelles',
   'Pouilly-Fuissé''s small eastern neighbour — a single slope of honeyed yet stony Chardonnay, long overshadowed and quietly excellent.',
   'East-facing limestone slope.',
   array['One main slope: Les Quarts', 'Fuissé''s quiet neighbour']),
  ('france.bourgogne.maconnais.pouilly-loche',
   'The smallest of the Pouillys — a hamlet''s worth of round, early-charming Chardonnay that may not call itself Fuissé and costs accordingly.',
   'Gentle limestone and clay.',
   array['The smallest Pouilly', 'A value doorway to the family']),
  ('france.bourgogne.maconnais.saint-veran',
   'The ring around Pouilly-Fuissé created in 1971 — bright, orchard-fruited Chardonnay bridging Mâcon and the crus, and often the region''s best value.',
   'Limestone with patches of clay.',
   array['Created 1971 from eight villages', 'Wraps around Pouilly-Fuissé'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Premier-cru group stubs (same rule as v1 — any group still without one).
insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  'The premier cru climats of ' || parent.name ||
  ', each a named vineyard mapped individually on the slope.',
  'PUBLISHED'
from wine_places p
join wine_places parent on parent.id = p.primary_parent_id
where p.publication_status = 'VERIFIED'
  and p.appellation_level = 'premier_cru'
  and p.canonical_key like '%.premier-cru'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_missing_articles int; v_missing_styles int; v_missing_grapes int;
begin
  select count(*) into v_missing_articles from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne%'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing_articles <> 0 then
    raise exception '% Burgundy places still lack an article', v_missing_articles;
  end if;
  select count(*) into v_missing_styles from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne.%'
     and not exists (select 1 from wine_place_styles s where s.wine_place_id = p.id);
  if v_missing_styles <> 0 then
    raise exception '% Burgundy places still lack styles', v_missing_styles;
  end if;
  select count(*) into v_missing_grapes from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne.%'
     and not exists (select 1 from wine_place_grapes g where g.wine_place_id = p.id);
  if v_missing_grapes <> 0 then
    raise exception '% Burgundy places still lack grape links', v_missing_grapes;
  end if;
end $$;




