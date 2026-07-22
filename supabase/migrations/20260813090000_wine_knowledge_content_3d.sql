-- Phase 3D content: knowledge layer for the 68 places added by the Burgundy
-- waves (Côte de Beaune + Chablis/Auxerrois/Chalonnaise/Mâconnais). Follows
-- the content-v1 conventions; junction rows seed PUBLISHED (the owner's
-- standing publish decision covers editorial content, corrections are cheap
-- updates). Rule-driven layers rerun idempotently over ALL Burgundy places.

-- ---------------------------------------------------------------------------
-- 1. Designation links by classification level (idempotent rerun).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. The Burgundy exception grapes: César (Irancy's seasoning) and nothing
--    else missing — Aligoté/Gamay/Sauvignon Blanc already exist.
-- ---------------------------------------------------------------------------
insert into grapes (name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
select * from (values
  ('César', 'RED', 'thick, deep violet',
   'Ancient northern-Burgundy red, said to have arrived with the Romans. Survives almost solely in Irancy, where a seasoning of César stiffens Pinot Noir with colour and grip.',
   'Dark cherry, violet, bramble, pepper', 'Medium to high', 'High', 'Medium', 'Medium',
   'Irancy (max 10% of the blend)')
) as v(name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- ---------------------------------------------------------------------------
-- 3. Premier-cru group nodes inherit their village's styles and grapes
--    (rule; covers every Burgundy group, existing rows untouched).
-- ---------------------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select grp.id, s.style, null, s.sort_order, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_styles s on s.wine_place_id = v.id
where grp.publication_status = 'VERIFIED'
  and grp.canonical_key like 'france.bourgogne.%'
  and grp.slug = 'premier-cru'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select grp.id, g.grape_id, g.role, g.permitted, g.share_pct, null, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_grapes g on g.wine_place_id = v.id
where grp.publication_status = 'VERIFIED'
  and grp.canonical_key like 'france.bourgogne.%'
  and grp.slug = 'premier-cru'
on conflict (wine_place_id, grape_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Wine styles: districts, villages and grands crus of the 3D waves.
-- ---------------------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.sort, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune', 'WHITE', 'Home of the great white grands crus', 1),
  ('france.bourgogne.chablis', 'WHITE', 'Chardonnay only', 0),
  ('france.bourgogne.grand-auxerrois', 'WHITE', null, 0),
  ('france.bourgogne.grand-auxerrois', 'RED', null, 1),
  ('france.bourgogne.cote-chalonnaise', 'RED', null, 0),
  ('france.bourgogne.cote-chalonnaise', 'WHITE', null, 1),
  ('france.bourgogne.maconnais', 'WHITE', 'Chardonnay-dominated', 0),
  ('france.bourgogne.maconnais', 'RED', 'Mâcon rouge, mostly Gamay', 1),
  ('france.bourgogne.cote-de-beaune.ladoix', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.ladoix', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.beaune', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.beaune', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.pommard', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-beaune.volnay', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-beaune.monthelie', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'RED', null, 1),
  ('france.bourgogne.cote-de-beaune.meursault', 'WHITE', 'The Côte''s white capital', 0),
  ('france.bourgogne.cote-de-beaune.meursault', 'RED', 'A little red', 1),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'RED', 'Historically red country', 1),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'WHITE', null, 0),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'RED', null, 1),
  ('france.bourgogne.cote-de-beaune.santenay', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.santenay', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-beaune.maranges', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'WHITE', 'A rare Corton Blanc', 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne', 'WHITE', 'White only; sold as Corton-Charlemagne in practice', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.chablis.chablis', 'WHITE', 'Chardonnay only', 0),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru', 'WHITE', 'White only — seven climats on one slope', 0),
  ('france.bourgogne.chablis.petit-chablis', 'WHITE', null, 0),
  ('france.bourgogne.grand-auxerrois.irancy', 'RED', 'Red only', 0),
  ('france.bourgogne.grand-auxerrois.saint-bris', 'WHITE', 'Sauvignon — unique in Burgundy', 0),
  ('france.bourgogne.grand-auxerrois.vezelay', 'WHITE', null, 0),
  ('france.bourgogne.cote-chalonnaise.bouzeron', 'WHITE', 'Aligoté only', 0),
  ('france.bourgogne.cote-chalonnaise.rully', 'WHITE', null, 0),
  ('france.bourgogne.cote-chalonnaise.rully', 'RED', null, 1),
  ('france.bourgogne.cote-chalonnaise.rully', 'SPARKLING', 'A Crémant heartland', 2),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'RED', null, 0),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'WHITE', null, 1),
  ('france.bourgogne.cote-chalonnaise.givry', 'RED', null, 0),
  ('france.bourgogne.cote-chalonnaise.givry', 'WHITE', null, 1),
  ('france.bourgogne.cote-chalonnaise.montagny', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.macon', 'WHITE', null, 0),
  ('france.bourgogne.maconnais.macon', 'RED', null, 1),
  ('france.bourgogne.maconnais.macon', 'ROSE', null, 2),
  ('france.bourgogne.maconnais.vire-clesse', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.pouilly-fuisse', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.pouilly-vinzelles', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.pouilly-loche', 'WHITE', 'White only', 0),
  ('france.bourgogne.maconnais.saint-veran', 'WHITE', 'White only', 0)
) as v(key, style, note, sort)
join wine_places p on p.canonical_key = v.key
on conflict (wine_place_id, style) do nothing;

-- ---------------------------------------------------------------------------
-- 4b. Grand-cru styles: Burgundy's whites get their gold. Corton is the one
--     red on the hill (with a sliver of white).
-- ---------------------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.sort, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'RED', null, 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'WHITE', 'A rare sliver of Corton Blanc', 1),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet', 'WHITE', 'White only', 0),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru', 'WHITE', 'White only', 0)
) as v(key, style, note, sort)
join wine_places p on p.canonical_key = v.key
on conflict (wine_place_id, style) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Grapes — Côte de Beaune (villages, GCs, district).
-- ---------------------------------------------------------------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune', 'Pinot Noir', 'PRINCIPAL', 58, null),
  ('france.bourgogne.cote-de-beaune', 'Chardonnay', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-de-beaune', 'Aligoté', 'ACCESSORY', 2, null),
  ('france.bourgogne.cote-de-beaune.ladoix', 'Pinot Noir', 'PRINCIPAL', 65, null),
  ('france.bourgogne.cote-de-beaune.ladoix', 'Chardonnay', 'PRINCIPAL', 35, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'Pinot Noir', 'PRINCIPAL', 95, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton', 'Chardonnay', 'ACCESSORY', 5, null),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'Pinot Noir', 'PRINCIPAL', 60, null),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses', 'Chardonnay', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune', 'Chardonnay', 'ACCESSORY', 10, null),
  ('france.bourgogne.cote-de-beaune.beaune', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.beaune', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-de-beaune.pommard', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.volnay', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.monthelie', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.monthelie', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'Pinot Noir', 'PRINCIPAL', 70, null),
  ('france.bourgogne.cote-de-beaune.auxey-duresses', 'Chardonnay', 'PRINCIPAL', 30, null),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'Chardonnay', 'PRINCIPAL', 55, null),
  ('france.bourgogne.cote-de-beaune.saint-romain', 'Pinot Noir', 'PRINCIPAL', 45, null),
  ('france.bourgogne.cote-de-beaune.meursault', 'Chardonnay', 'PRINCIPAL', 96, null),
  ('france.bourgogne.cote-de-beaune.meursault', 'Pinot Noir', 'ACCESSORY', 3, 'A little Meursault rouge'),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'Chardonnay', 'PRINCIPAL', 60, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet', 'Pinot Noir', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'Chardonnay', 'PRINCIPAL', 70, null),
  ('france.bourgogne.cote-de-beaune.saint-aubin', 'Pinot Noir', 'PRINCIPAL', 30, null),
  ('france.bourgogne.cote-de-beaune.santenay', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-beaune.santenay', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-de-beaune.maranges', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.cote-de-beaune.maranges', 'Chardonnay', 'ACCESSORY', 10, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'Pinot Noir', 'PRINCIPAL', 97, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton', 'Chardonnay', 'ACCESSORY', 3, 'Corton Blanc'),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet', 'Chardonnay', 'PRINCIPAL', 100, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Grapes — Chablis, Grand Auxerrois, Côte Chalonnaise, Mâconnais.
-- ---------------------------------------------------------------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note, 'PUBLISHED'
from (values
  ('france.bourgogne.chablis', 'Chardonnay', 'PRINCIPAL', 98, null),
  ('france.bourgogne.chablis.chablis', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.chablis.petit-chablis', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.grand-auxerrois', 'Pinot Noir', 'PRINCIPAL', 45, null),
  ('france.bourgogne.grand-auxerrois', 'Chardonnay', 'PRINCIPAL', 30, null),
  ('france.bourgogne.grand-auxerrois', 'Sauvignon Blanc', 'ACCESSORY', 15, 'Saint-Bris only'),
  ('france.bourgogne.grand-auxerrois', 'César', 'ACCESSORY', 2, 'Irancy only'),
  ('france.bourgogne.grand-auxerrois.irancy', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.grand-auxerrois.irancy', 'César', 'ACCESSORY', 5, 'Capped at 10% of the blend'),
  ('france.bourgogne.grand-auxerrois.saint-bris', 'Sauvignon Blanc', 'PRINCIPAL', 95, 'Burgundy''s only Sauvignon AOC'),
  ('france.bourgogne.grand-auxerrois.vezelay', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-chalonnaise', 'Pinot Noir', 'PRINCIPAL', 50, null),
  ('france.bourgogne.cote-chalonnaise', 'Chardonnay', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-chalonnaise', 'Aligoté', 'ACCESSORY', 8, null),
  ('france.bourgogne.cote-chalonnaise.bouzeron', 'Aligoté', 'PRINCIPAL', 100, 'The only village AOC for Aligoté'),
  ('france.bourgogne.cote-chalonnaise.rully', 'Chardonnay', 'PRINCIPAL', 60, null),
  ('france.bourgogne.cote-chalonnaise.rully', 'Pinot Noir', 'PRINCIPAL', 40, null),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-chalonnaise.mercurey', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-chalonnaise.givry', 'Pinot Noir', 'PRINCIPAL', 80, null),
  ('france.bourgogne.cote-chalonnaise.givry', 'Chardonnay', 'ACCESSORY', 20, null),
  ('france.bourgogne.cote-chalonnaise.montagny', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais', 'Chardonnay', 'PRINCIPAL', 85, null),
  ('france.bourgogne.maconnais', 'Gamay', 'ACCESSORY', 10, null),
  ('france.bourgogne.maconnais', 'Pinot Noir', 'ACCESSORY', 4, null),
  ('france.bourgogne.maconnais.macon', 'Chardonnay', 'PRINCIPAL', 80, null),
  ('france.bourgogne.maconnais.macon', 'Gamay', 'ACCESSORY', 15, 'Mâcon rouge is Gamay country'),
  ('france.bourgogne.maconnais.macon', 'Pinot Noir', 'ACCESSORY', 5, null),
  ('france.bourgogne.maconnais.vire-clesse', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-fuisse', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-vinzelles', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.pouilly-loche', 'Chardonnay', 'PRINCIPAL', 100, null),
  ('france.bourgogne.maconnais.saint-veran', 'Chardonnay', 'PRINCIPAL', 100, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Articles — the five new districts (insert-only, never overwrites).
-- ---------------------------------------------------------------------------
insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, v.climate, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune',
   'The southern half of the Côte d''Or, Ladoix to Maranges — where Burgundy turns white. Nearly all the region''s great Chardonnay grands crus sit here, alongside reds of grace (Volnay) and muscle (Pommard).',
   'Continental, a touch softer than the Côte de Nuits; the slope bends more east-southeast.',
   'Limestone and marl again, with more marl in the white villages.',
   array['All of Burgundy''s white grands crus but one (Chablis GC)', 'Home of Montrachet, Corton and Corton-Charlemagne', 'Both colours at the highest level']),
  ('france.bourgogne.chablis',
   'Burgundy''s cold northern outpost, closer to Champagne than to Beaune. Pure, steely Chardonnay over Kimmeridgian limestone — oyster-shell soils that taste like the wine''s spine.',
   'Semi-continental and frost-prone; smudge-pots and sprinklers guard the spring.',
   'Kimmeridgian marl full of tiny fossil oysters; Portlandian on the plateaux (Petit Chablis).',
   array['One grand cru with seven named climats', 'Kimmeridgian vs Portlandian defines the hierarchy', 'Historically shipped to Paris by river']),
  ('france.bourgogne.grand-auxerrois',
   'The scattering of villages around Auxerre that survived phylloxera''s near-erasure of the Yonne vineyard. Three distinct personalities: red Irancy, Sauvignon Saint-Bris, airy Vézelay.',
   'Cool semi-continental, like neighbouring Chablis.',
   'Kimmeridgian and Portlandian limestone hills.',
   array['Once one of France''s largest vineyards, pre-phylloxera', 'Holds Burgundy''s only Sauvignon AOC', 'Vézelay hill is a UNESCO site']),
  ('france.bourgogne.cote-chalonnaise',
   'The Côte d''Or''s southern continuation without the wall of fame — five villages on broken limestone hills giving honest Pinot, brisk Chardonnay, and the Aligoté of Bouzeron.',
   'Continental, slightly drier and breezier than the Côte d''Or.',
   'The same Jurassic limestones, more fragmented by faulting.',
   array['Bouzeron: the only village AOC for Aligoté', 'A Crémant de Bourgogne heartland', 'Value hunting ground for red Burgundy']),
  ('france.bourgogne.maconnais',
   'Burgundy''s sunny southern gate, rolling cattle-and-vine country down to the rock of Solutré. Generous Chardonnay in volume — and in Pouilly-Fuissé, real grandeur.',
   'The warmest of Burgundy''s districts, with a first whisper of the south.',
   'Limestone ridges alternating with clay and granite as the Beaujolais nears.',
   array['Chardonnay village namesake lies here', 'Pouilly-Fuissé gained premiers crus in 2020', 'The rock of Solutré overlooks the best slopes'])
) as v(key, description, climate, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune.ladoix',
   'The Côte de Beaune''s quiet first village, wrapping the north-east shoulder of the hill of Corton. Unshowy reds and a growing line of mineral whites, often at kind prices.',
   'Marl and limestone on the Corton flank.',
   array['Shares the hill of Corton with Aloxe and Pernand', 'Often bottled as Côte de Beaune-Villages historically']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton',
   'The village beneath the great wooded dome of Corton. Almost all red at village level — firm, slow-opening Pinot in the shadow of its two grand-cru crowns.',
   'Iron-rich red soils below, whiter marls up the hill.',
   array['Home village of Corton and Corton-Charlemagne', 'Emperor Charlemagne''s vineyard legend lives here']),
  ('france.bourgogne.cote-de-beaune.pernand-vergelesses',
   'Tucked in the cool valley behind the hill of Corton, half red, half white — bright, edgy wines that reward warm years and patient cellars.',
   'Steep marl slopes with varied exposures.',
   array['Holds a share of Corton-Charlemagne''s west face', 'Île des Vergelesses is the flagship premier cru']),
  ('france.bourgogne.cote-de-beaune.savigny-les-beaune',
   'A working wine village astride its own little valley, generous with fruit and value. Supple, red-fruited Pinot flanked by two distinct premier-cru banks.',
   'Alluvial valley floor between two marl slopes.',
   array['Premiers crus split across two facing hillsides', 'Long the Beaune trade''s quiet source of value']),
  ('france.bourgogne.cote-de-beaune.chorey-les-beaune',
   'Flatland village below the main slope — honest, early-drinking red Burgundy without pretension, and without premiers crus.',
   'Deeper alluvial clays off the slope.',
   array['No premiers crus', 'Nearly all red']),
  ('france.bourgogne.cote-de-beaune.beaune',
   'The wine capital''s own vineyard, a long ribbon of premiers crus above the ramparts and the Hospices. Mid-weight, spicy reds the négociants built their houses on.',
   'Varied marl and limestone along a broad slope.',
   array['One of Burgundy''s largest premier-cru rosters', 'The Hospices de Beaune auction each November']),
  ('france.bourgogne.cote-de-beaune.pommard',
   'The Côte de Beaune''s sternest red: tannic, iron-edged, built to outlast its drinkers. No grand cru — its partisans consider that an oversight.',
   'Heavier iron-rich clay over limestone.',
   array['Rugiens and Epenots lead the premiers crus', 'Red only']),
  ('france.bourgogne.cote-de-beaune.volnay',
   'Pommard''s opposite: the most delicate red of the Côte de Beaune, all perfume and silk from high, thin limestone soils.',
   'Thin, pale limestone high on the slope.',
   array['Red only', 'Caillerets and Santenots the classic crus']),
  ('france.bourgogne.cote-de-beaune.monthelie',
   'A sun-trap hamlet in the fold between Volnay and Meursault — reds in Volnay''s lighter style at half the fame, and a little white.',
   'Limestone scree with south exposure.',
   array['One of the Côte''s sunniest exposures', 'Mostly red, in Volnay''s image'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune.auxey-duresses',
   'Cooler side-valley village behind Meursault, two-thirds red, one-third white — sinewy Pinot and lean, appley Chardonnay that shine in warm vintages.',
   'Marl slopes with mixed exposures along the combe.',
   array['Whites once sold as Meursault before the AOC era', 'A value door into the Côte de Beaune']),
  ('france.bourgogne.cote-de-beaune.saint-romain',
   'The Côte''s high mountain outpost, vines to 400 m under white cliffs. Chiselled, cool-fruited whites and taut reds — no premiers crus, growing reputation.',
   'High marl and limestone under Jurassic cliffs.',
   array['Among the highest villages in the Côte d''Or', 'No premiers crus']),
  ('france.bourgogne.cote-de-beaune.meursault',
   'The Côte''s great white village without a grand cru — and barely missing it. Butter, hazelnut and stone in wines from Perrières, Genevrières and Charmes that outclass many grands crus.',
   'Stony limestone with little topsoil on the best band.',
   array['Perrières is the perennial grand-cru candidate', 'Nearly all white, with a curio of Meursault rouge']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet',
   'White Burgundy''s aristocrat: tension, florality and cut. The village shares the Montrachet hill with Chassagne and claims Chevalier and Bienvenues outright.',
   'Shallow limestone; a high water table forbids deep cellars.',
   array['Four grands crus touch the commune', 'Village cellars are famously impossible — too much groundwater']),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet',
   'The other half of the Montrachet hill — richer, rounder whites than Puligny and, less famously, a large share of sturdy red from its southern soils.',
   'Limestone north, redder clays south.',
   array['Shares Montrachet and Bâtard with Puligny', 'Once a majority-red village']),
  ('france.bourgogne.cote-de-beaune.saint-aubin',
   'The high valley behind the Montrachet hill, transformed by warming vintages from backwater to insider''s white — flinty, saline Chardonnay a stone''s throw from the grands crus.',
   'Steep stony limestone, much of it high and cool.',
   array['En Remilly borders Chevalier-Montrachet', 'The Côte''s fastest-rising village']),
  ('france.bourgogne.cote-de-beaune.santenay',
   'The Côte d''Or''s southern spa town — earthy, robust reds and a swelling share of white as the limestone bends west.',
   'Varied: marl, limestone and mineral springs.',
   array['A spa town since Roman times', 'The Côte d''Or''s last full commune']),
  ('france.bourgogne.cote-de-beaune.maranges',
   'Around the corner where the Côte finally ends: three merged hamlets making dark, rustic-edged Pinot, long a blender and now a bargain.',
   'Red-brown clay over limestone, south-facing.',
   array['Three communes merged into one AOC (1989)', 'The Côte de Beaune''s southern full stop'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton',
   'The Côte de Beaune''s only red grand cru — a whole hillside of it, sold under Corton alone or with a climat name (Bressandes, Clos du Roi, Renardes…). Iron and dark cherry, slow to unfurl.',
   'Iron-flecked marl on the hill''s lower and mid flanks.',
   array['The Côte de Beaune''s sole red grand cru', 'Usually carries a climat name', 'A sliver of Corton Blanc exists']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne',
   'The white crown of the hill of Corton, wrapping its south and west faces — steely, saline grandeur that needs a decade, from land legend says Charlemagne ordered planted white.',
   'White marl high on the dome, hence the Chardonnay.',
   array['Legend: white vines so wine wouldn''t stain the emperor''s beard', 'One of white Burgundy''s two summits']),
  ('france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne',
   'The historic core parcels of the emperor''s vineyard — an AOC that exists mostly on paper, its wine sold as Corton-Charlemagne, as the law allows.',
   'The same white marls as Corton-Charlemagne.',
   array['May be sold as Corton-Charlemagne — and virtually always is', '87% shared footprint in INAO parcels']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet',
   'The greatest dry white vineyard on earth by common consent: eight hectares astride Puligny and Chassagne producing Chardonnay of impossible completeness — power, cut, perfume, permanence.',
   'Thin stony limestone on a perfect south-east tilt.',
   array['Straddles Puligny and Chassagne', 'The reference point for all Chardonnay']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet',
   'The steep, stony shelf directly above Montrachet — leaner soil, airier wine: the "knight" gives chiselled, mineral splendour where the master gives weight.',
   'Almost soil-less limestone rubble upslope.',
   array['Entirely within Puligny', 'The most mineral of the family']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet',
   'Below the master vineyard and richer for its deeper soil — opulent, honeyed white Burgundy with the family''s spine underneath. Straddles both villages.',
   'Deeper clay-limestone below the road.',
   array['Straddles Puligny and Chassagne', 'The richest of the Montrachets']),
  ('france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet',
   'A small Puligny-side corner of Bâtard with its own AOC — finer-boned than its parent, rare and quietly cherished.',
   'As Bâtard, marginally lighter.',
   array['Effectively a named corner of Bâtard', 'About 3.7 ha']),
  ('france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet',
   'The smallest of the Montrachet family, wholly in Chassagne — a hectare and a half of chalky, quick-witted white, seldom seen and swiftly gone.',
   'Chalky scree ("criots" = the crackling stones).',
   array['Smallest of the five Montrachet grands crus', 'Entirely within Chassagne'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.chablis.chablis',
   'The village AOC that made cold-climate Chardonnay a world style: bone-dry, green-gold wine tasting of stones, citrus and sea air, rarely touched by new oak.',
   'Kimmeridgian marl seamed with fossil oysters.',
   array['Forty premier-cru climats on the best slopes', 'The benchmark for unoaked Chardonnay']),
  ('france.bourgogne.chablis.petit-chablis',
   'The plateau ring above Chablis proper — Portlandian limestone rather than Kimmeridgian, giving a lighter, sharper apéritif cousin.',
   'Portlandian limestone caps the plateaux.',
   array['Same grape, younger rock', 'Drink young and cold']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru',
   'One south-west-facing amphitheatre above the town split into seven named climats — Les Clos, Vaudésir, Blanchot, Bougros, Grenouilles, Preuses, Valmur. Chablis with flesh and decades ahead of it.',
   'The steepest, richest Kimmeridgian slope in the region.',
   array['Seven climats, one AOC', 'Les Clos is the traditional summit']),
  ('france.bourgogne.grand-auxerrois.irancy',
   'A red-wine amphitheatre of cherry orchards and Pinot Noir south of Auxerre, seasoned by the ancient César grape — sinewy, cool-fruited northern red.',
   'Kimmeridgian slopes in a sheltered bowl.',
   array['César may season the blend up to 10%', 'The Yonne''s only red village AOC']),
  ('france.bourgogne.grand-auxerrois.saint-bris',
   'Burgundy''s constitutional anomaly: an AOC for Sauvignon Blanc, planted here since the Loire trade came upriver. Nettle-and-citrus whites on Chablis'' doorstep.',
   'The same Kimmeridgian as neighbouring Chablis.',
   array['Burgundy''s only Sauvignon AOC', 'Blanc and Gris both permitted']),
  ('france.bourgogne.grand-auxerrois.vezelay',
   'Chardonnay from the flanks of the pilgrimage hill — slender, floral, early-drinking whites revived from near-extinction in the 1970s.',
   'Limestone and marl below the basilica hill.',
   array['Village AOC only since 2017', 'The hill is a UNESCO site']),
  ('france.bourgogne.cote-chalonnaise.bouzeron',
   'The only village in France where Aligoté gets top billing — old vines on prime slopes turning the region''s sharp deuxième into something saline and fine.',
   'Thin limestone the Aligoté monopolises.',
   array['Aligoté only', 'Championed by Aubert de Villaine of DRC fame']),
  ('france.bourgogne.cote-chalonnaise.rully',
   'Poised white-leaning village and long-time Crémant engine — orchard-fruited Chardonnay, brisk Pinot, and a premier-cru roster out of proportion to its fame.',
   'Marl and limestone in gentle folds.',
   array['A cradle of Crémant de Bourgogne', 'More white than red']),
  ('france.bourgogne.cote-chalonnaise.mercurey',
   'The Chalonnaise''s big red: a village of scale and self-belief making dark, firm Pinot Noir that ages like a Côte d''Or understudy.',
   'Iron-tinged clay-limestone.',
   array['The district''s largest village AOC', 'Once home to its own dukes'' vineyards']),
  ('france.bourgogne.cote-chalonnaise.givry',
   'Compact red-wine village with a royal warrant in its past — supple, spiced Pinot said to be Henri IV''s preferred pour.',
   'Warm limestone slopes west of Chalon.',
   array['Henri IV''s favourite, say the locals', 'Mostly red']),
  ('france.bourgogne.cote-chalonnaise.montagny',
   'The Chalonnaise''s all-white southern village — stony, straight-backed Chardonnay where every premier cru is white by definition.',
   'Marl over hard limestone benches.',
   array['White only', 'Premiers crus cover much of the vineyard']),
  ('france.bourgogne.maconnais.macon',
   'The regional workhorse AOC spanning dozens of villages — round, sunny Chardonnay in volume, plus Gamay reds that remember Beaujolais is next door.',
   'Limestone, clay and patches of granite southward.',
   array['Village names may be appended (Mâcon-Lugny…)', 'Reds are Gamay country']),
  ('france.bourgogne.maconnais.vire-clesse',
   'Two villages fused into one white AOC on a prime limestone ridge — ripe, honeysuckle Mâconnais with unusual precision.',
   'A long east-facing limestone ridge.',
   array['Created 1999 from two Mâcon villages', 'White only']),
  ('france.bourgogne.maconnais.pouilly-fuisse',
   'The Mâconnais'' flagship beneath the rock of Solutré: golden, powerful Chardonnay that finally won premier-cru rank in 2020.',
   'Limestone amphitheatres under the twin rocks.',
   array['Premiers crus since the 2020 vintage', 'The south''s answer to the Côte de Beaune']),
  ('france.bourgogne.maconnais.pouilly-vinzelles',
   'Pouilly''s eastern sibling on a single sun-soaked slope — riper and rounder, a hamlet''s worth of golden white.',
   'Clay-limestone facing the Saône plain.',
   array['Tiny production', 'White only']),
  ('france.bourgogne.maconnais.pouilly-loche',
   'The smallest of the Pouillys, wine from one hamlet — may also sell as Pouilly-Vinzelles, and often does.',
   'As Vinzelles, a shade cooler.',
   array['May label as Pouilly-Vinzelles', 'One of Burgundy''s smallest AOCs']),
  ('france.bourgogne.maconnais.saint-veran',
   'The ring around Pouilly-Fuissé, created 1971 — limestone Chardonnay with much of the flagship''s sunshine at a friendlier price.',
   'Limestone in two separate northern and southern lobes.',
   array['Two detached sectors surround Pouilly-Fuissé', 'White only'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- ---------------------------------------------------------------------------
-- 8. Premier-cru group stubs (rule; covers every new group, existing rows
--    untouched) and the fail-closed total.
-- ---------------------------------------------------------------------------
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

-- Re-run the group inheritance now that every village carries styles and
-- grapes (the chunk-3 pass ran before the new villages' data existed; this
-- one completes the new groups, on-conflict keeps the rest untouched).
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select grp.id, s.style, null, s.sort_order, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_styles s on s.wine_place_id = v.id
where grp.publication_status = 'VERIFIED'
  and grp.canonical_key like 'france.bourgogne.%'
  and grp.slug = 'premier-cru'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select grp.id, g.grape_id, g.role, g.permitted, g.share_pct, null, 'PUBLISHED'
from wine_places grp
join wine_places v on v.id = grp.primary_parent_id
join wine_place_grapes g on g.wine_place_id = v.id
where grp.publication_status = 'VERIFIED'
  and grp.canonical_key like 'france.bourgogne.%'
  and grp.slug = 'premier-cru'
on conflict (wine_place_id, grape_id) do nothing;

do $$
declare v_missing int; v_grapeless int;
begin
  select count(*) into v_missing
    from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception 'articles: % verified places still missing one', v_missing;
  end if;
  -- Every verified Burgundy place below region level must carry grapes.
  select count(*) into v_grapeless
    from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne.%'
     and not exists (select 1 from wine_place_grapes g where g.wine_place_id = p.id);
  if v_grapeless <> 0 then
    raise exception 'grapes: % Burgundy places still unlinked', v_grapeless;
  end if;
end $$;
