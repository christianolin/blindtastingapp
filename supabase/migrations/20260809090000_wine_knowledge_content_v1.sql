-- Phase 3K Task 4: V1 editorial content (assistant-drafted, seeds as DRAFT;
-- the owner review flips junction content to PUBLISHED). Grape profile
-- fields fill gaps only (coalesce keeps any existing curation); existing
-- articles are never overwritten — only their null soils backfill.

-- ---------------------------------------------------------------------------
-- 1. Grape profiles: skin colours for the V1 core set; Aligoté gets a full
--    profile; Muscadelle and Carmenère are added (both spec-listed, absent).
-- ---------------------------------------------------------------------------
update grapes set skin_color = v.skin
from (values
  ('Pinot Noir', 'thin, blue-black'),
  ('Chardonnay', 'green-gold'),
  ('Aligoté', 'pale green-yellow'),
  ('Gamay', 'blue-purple'),
  ('Cabernet Sauvignon', 'thick, blue-black'),
  ('Cabernet Franc', 'thin, blue-violet'),
  ('Merlot', 'blue-black, thinner than Cabernet'),
  ('Petit Verdot', 'thick, inky black'),
  ('Malbec', 'dark purple-black'),
  ('Sauvignon Blanc', 'green-yellow'),
  ('Semillon', 'golden, pink-tinged when ripe'),
  ('Pinot Gris', 'greyish-pink'),
  ('Riesling', 'green-yellow, freckled'),
  ('Syrah', 'deep blue-black'),
  ('Grenache', 'thin, purple-red')
) as v(name, skin)
where grapes.name = v.name and grapes.skin_color is null;

update grapes set
  color = coalesce(color, 'WHITE'),
  description = coalesce(description, 'Burgundy''s second white grape, almost always bottled unblended as Bourgogne Aligoté. High acid and lean, citrusy fruit — the traditional base of a Kir.'),
  typical_aromas = coalesce(typical_aromas, 'Lemon, green apple, white flowers, chalk'),
  typical_acidity = coalesce(typical_acidity, 'High'),
  typical_tannin = coalesce(typical_tannin, 'None (white)'),
  typical_body = coalesce(typical_body, 'Light'),
  typical_alcohol = coalesce(typical_alcohol, 'Low to medium'),
  main_regions = coalesce(main_regions, 'Burgundy (Bouzeron, Bourgogne Aligoté)')
where name = 'Aligoté';

insert into grapes (name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
select * from (values
  ('Muscadelle', 'WHITE', 'yellow-green',
   'Aromatic minor partner of white Bordeaux, prized in sweet blends for its grapey, floral perfume. Almost never varietal; adds lift to Sauvignon Blanc and Semillon.',
   'Grape, orange blossom, honeysuckle', 'Medium', 'None (white)', 'Light to medium', 'Medium',
   'Bordeaux (Sauternes, Entre-deux-Mers), Bergerac'),
  ('Carmenère', 'RED', 'deep purple-black',
   'Old Bordeaux variety, nearly lost to phylloxera and now rare in its permitted accessory role there; famously rediscovered as Chile''s signature grape. Deep colour, herbal edge.',
   'Blackberry, green peppercorn, tomato leaf, dark chocolate', 'Medium', 'Medium', 'Medium to full', 'Medium to high',
   'Chile (Colchagua), Bordeaux (minor accessory)')
) as v(name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- ---------------------------------------------------------------------------
-- 2. Designations: one catalogue entry per system tier, linked by each
--    place's classification level (resolved at seed time — no runtime
--    inheritance, so nothing can double-render).
-- ---------------------------------------------------------------------------
insert into wine_designations (key, name, appellation_system, description)
values
  ('burgundy-grand-cru', 'Grand Cru (Burgundy)', 'AOC/AOP',
   'The top of Burgundy''s four-tier ladder: 33 individually delimited vineyards with their own AOCs, about 1% of production. The vineyard alone carries the name — no village on the label.'),
  ('burgundy-premier-cru', 'Premier Cru (Burgundy)', 'AOC/AOP',
   'Named single vineyards (climats) one step below Grand Cru, labelled as Village + climat (e.g. Vosne-Romanée 1er Cru Les Suchots). Roughly 10% of Burgundy.'),
  ('burgundy-village', 'Village appellation (Burgundy)', 'AOC/AOP',
   'Communal AOCs carrying a village''s name (Gevrey-Chambertin, Vosne-Romanée…). The wine may blend vineyards across that village only.')
on conflict (key) do nothing;

insert into wine_place_designations (wine_place_id, designation_id, local_note)
select p.id, d.id, null
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

do $$
declare v_count int;
begin
  select count(*) into v_count from wine_place_designations;
  if v_count < 45 then
    raise exception 'designation links: expected >= 45, got %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Wine styles.
-- ---------------------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, note, sort_order)
select p.id, v.style::wine_style_kind, v.note, v.sort
from (values
  ('france.bordeaux', 'RED', 'About 85% of production', 0),
  ('france.bordeaux', 'WHITE', null, 1),
  ('france.bordeaux', 'ROSE', null, 2),
  ('france.bordeaux', 'SWEET', 'Sauternes, Barsac and neighbours', 3),
  ('france.bordeaux.medoc', 'RED', null, 0),
  ('france.bordeaux.haut-medoc', 'RED', null, 0),
  ('france.bordeaux.haut-medoc.margaux', 'RED', null, 0),
  ('france.bordeaux.haut-medoc.pauillac', 'RED', null, 0),
  ('france.bordeaux.haut-medoc.saint-estephe', 'RED', null, 0),
  ('france.bordeaux.haut-medoc.saint-julien', 'RED', null, 0),
  ('france.bordeaux.saint-emilion', 'RED', null, 0),
  ('france.bordeaux.pomerol', 'RED', null, 0),
  ('france.bordeaux.fronsac', 'RED', null, 0),
  ('france.bordeaux.canon-fronsac', 'RED', null, 0),
  ('france.bordeaux.blaye', 'RED', 'Blaye AOC is red only; local whites label as Côtes de Blaye', 0),
  ('france.bordeaux.cotes-de-bourg', 'RED', 'Plus a trace of dry white', 0),
  ('france.bordeaux.entre-deux-mers', 'WHITE', 'The AOC is white only; reds here label as Bordeaux', 0),
  ('france.bordeaux.graves', 'RED', null, 0),
  ('france.bordeaux.graves', 'WHITE', null, 1),
  ('france.bordeaux.pessac-leognan', 'RED', null, 0),
  ('france.bordeaux.pessac-leognan', 'WHITE', null, 1),
  ('france.bordeaux.sauternes', 'SWEET', 'Botrytised sweet whites', 0),
  ('france.bordeaux.sauternes.barsac', 'SWEET', 'Botrytised sweet whites; may also label as Sauternes', 0),
  ('france.bourgogne', 'WHITE', 'Chardonnay-led — the majority of production', 0),
  ('france.bourgogne', 'RED', null, 1),
  ('france.bourgogne', 'SPARKLING', 'Crémant de Bourgogne', 2),
  ('france.bourgogne.cote-de-nuits', 'RED', 'Overwhelmingly Pinot Noir', 0),
  ('france.bourgogne.cote-de-nuits', 'WHITE', 'Tiny volumes', 1),
  ('france.bourgogne.cote-de-nuits.marsannay', 'RED', null, 0),
  ('france.bourgogne.cote-de-nuits.marsannay', 'WHITE', null, 1),
  ('france.bourgogne.cote-de-nuits.marsannay', 'ROSE', 'The only Burgundy village AOC with rosé', 2),
  ('france.bourgogne.cote-de-nuits.fixin', 'RED', null, 0),
  ('france.bourgogne.cote-de-nuits.fixin', 'WHITE', 'Rare', 1),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'RED', null, 0),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'WHITE', 'A whisper of white', 1),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-nuits.vougeot', 'RED', null, 0),
  ('france.bourgogne.cote-de-nuits.vougeot', 'WHITE', 'Rare', 1),
  ('france.bourgogne.cote-de-nuits.vosne-romanee', 'RED', 'Red only', 0),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'RED', null, 0),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'WHITE', 'Tiny volumes', 1)
) as v(key, style, note, sort)
join wine_places p on p.canonical_key = v.key
on conflict (wine_place_id, style) do nothing;

-- Every Côte de Nuits cru and climat is red…
insert into wine_place_styles (wine_place_id, style, note, sort_order)
select p.id, 'RED', null, 0
from wine_places p
where p.publication_status = 'VERIFIED'
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.%'
  and p.appellation_level in ('grand_cru', 'premier_cru')
on conflict (wine_place_id, style) do nothing;

-- …with one famous footnote.
insert into wine_place_styles (wine_place_id, style, note, sort_order)
select p.id, 'WHITE', 'Musigny Blanc — the Côte de Nuits'' only white grand cru', 1
from wine_places p
where p.canonical_key = 'france.bourgogne.cote-de-nuits.chambolle-musigny.musigny'
on conflict (wine_place_id, style) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Grapes — Bordeaux (shares are approximate editorial estimates).
-- ---------------------------------------------------------------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note
from (values
  ('france.bordeaux', 'Merlot', 'PRINCIPAL', 60, null),
  ('france.bordeaux', 'Cabernet Sauvignon', 'PRINCIPAL', 20, null),
  ('france.bordeaux', 'Cabernet Franc', 'ACCESSORY', 8, null),
  ('france.bordeaux', 'Sauvignon Blanc', 'ACCESSORY', 5, null),
  ('france.bordeaux', 'Semillon', 'ACCESSORY', 4, null),
  ('france.bordeaux', 'Petit Verdot', 'ACCESSORY', 1, null),
  ('france.bordeaux', 'Malbec', 'ACCESSORY', 1, 'Called Côt locally'),
  ('france.bordeaux', 'Muscadelle', 'ACCESSORY', 1, null),
  ('france.bordeaux', 'Carmenère', 'ACCESSORY', null, 'Permitted, vanishingly rare'),
  ('france.bordeaux.medoc', 'Merlot', 'PRINCIPAL', 52, null),
  ('france.bordeaux.medoc', 'Cabernet Sauvignon', 'PRINCIPAL', 40, null),
  ('france.bordeaux.medoc', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.medoc', 'Petit Verdot', 'ACCESSORY', 2, null),
  ('france.bordeaux.haut-medoc', 'Cabernet Sauvignon', 'PRINCIPAL', 52, null),
  ('france.bordeaux.haut-medoc', 'Merlot', 'PRINCIPAL', 40, null),
  ('france.bordeaux.haut-medoc', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc', 'Petit Verdot', 'ACCESSORY', 2, null),
  ('france.bordeaux.haut-medoc.pauillac', 'Cabernet Sauvignon', 'PRINCIPAL', 62, null),
  ('france.bordeaux.haut-medoc.pauillac', 'Merlot', 'PRINCIPAL', 30, null),
  ('france.bordeaux.haut-medoc.pauillac', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc.pauillac', 'Petit Verdot', 'ACCESSORY', 3, null),
  ('france.bordeaux.haut-medoc.margaux', 'Cabernet Sauvignon', 'PRINCIPAL', 55, null),
  ('france.bordeaux.haut-medoc.margaux', 'Merlot', 'PRINCIPAL', 35, null),
  ('france.bordeaux.haut-medoc.margaux', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc.margaux', 'Petit Verdot', 'ACCESSORY', 3, null),
  ('france.bordeaux.haut-medoc.saint-julien', 'Cabernet Sauvignon', 'PRINCIPAL', 60, null),
  ('france.bordeaux.haut-medoc.saint-julien', 'Merlot', 'PRINCIPAL', 32, null),
  ('france.bordeaux.haut-medoc.saint-julien', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc.saint-julien', 'Petit Verdot', 'ACCESSORY', 2, null),
  ('france.bordeaux.haut-medoc.saint-estephe', 'Cabernet Sauvignon', 'PRINCIPAL', 52, null),
  ('france.bordeaux.haut-medoc.saint-estephe', 'Merlot', 'PRINCIPAL', 40, null),
  ('france.bordeaux.haut-medoc.saint-estephe', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc.saint-estephe', 'Petit Verdot', 'ACCESSORY', 2, null),
  ('france.bordeaux.saint-emilion', 'Merlot', 'PRINCIPAL', 60, null),
  ('france.bordeaux.saint-emilion', 'Cabernet Franc', 'PRINCIPAL', 30, null),
  ('france.bordeaux.saint-emilion', 'Cabernet Sauvignon', 'ACCESSORY', 8, null),
  ('france.bordeaux.saint-emilion', 'Malbec', 'ACCESSORY', 1, null),
  ('france.bordeaux.pomerol', 'Merlot', 'PRINCIPAL', 80, null),
  ('france.bordeaux.pomerol', 'Cabernet Franc', 'PRINCIPAL', 15, null),
  ('france.bordeaux.pomerol', 'Cabernet Sauvignon', 'ACCESSORY', 4, null),
  ('france.bordeaux.fronsac', 'Merlot', 'PRINCIPAL', 78, null),
  ('france.bordeaux.fronsac', 'Cabernet Franc', 'ACCESSORY', 12, null),
  ('france.bordeaux.fronsac', 'Cabernet Sauvignon', 'ACCESSORY', 8, null),
  ('france.bordeaux.canon-fronsac', 'Merlot', 'PRINCIPAL', 80, null),
  ('france.bordeaux.canon-fronsac', 'Cabernet Franc', 'ACCESSORY', 15, null),
  ('france.bordeaux.canon-fronsac', 'Cabernet Sauvignon', 'ACCESSORY', 4, null),
  ('france.bordeaux.blaye', 'Merlot', 'PRINCIPAL', 65, 'The blend must be at least 50% Cabernet Sauvignon, Cabernet Franc and Merlot combined'),
  ('france.bordeaux.blaye', 'Cabernet Sauvignon', 'ACCESSORY', 15, null),
  ('france.bordeaux.blaye', 'Cabernet Franc', 'ACCESSORY', 10, null),
  ('france.bordeaux.blaye', 'Malbec', 'ACCESSORY', 7, null),
  ('france.bordeaux.blaye', 'Petit Verdot', 'ACCESSORY', 2, null),
  ('france.bordeaux.blaye', 'Carmenère', 'ACCESSORY', null, 'Rare; tightly capped in the blend'),
  ('france.bordeaux.cotes-de-bourg', 'Merlot', 'PRINCIPAL', 65, null),
  ('france.bordeaux.cotes-de-bourg', 'Malbec', 'ACCESSORY', 10, 'A local speciality — Bordeaux''s highest Malbec share'),
  ('france.bordeaux.cotes-de-bourg', 'Cabernet Sauvignon', 'ACCESSORY', 15, null),
  ('france.bordeaux.cotes-de-bourg', 'Cabernet Franc', 'ACCESSORY', 10, null),
  ('france.bordeaux.entre-deux-mers', 'Sauvignon Blanc', 'PRINCIPAL', 55, null),
  ('france.bordeaux.entre-deux-mers', 'Semillon', 'PRINCIPAL', 30, null),
  ('france.bordeaux.entre-deux-mers', 'Muscadelle', 'ACCESSORY', 10, null),
  ('france.bordeaux.graves', 'Cabernet Sauvignon', 'PRINCIPAL', 30, null),
  ('france.bordeaux.graves', 'Merlot', 'PRINCIPAL', 30, null),
  ('france.bordeaux.graves', 'Sauvignon Blanc', 'PRINCIPAL', 20, null),
  ('france.bordeaux.graves', 'Semillon', 'PRINCIPAL', 13, null),
  ('france.bordeaux.graves', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.graves', 'Muscadelle', 'ACCESSORY', 2, null),
  ('france.bordeaux.pessac-leognan', 'Cabernet Sauvignon', 'PRINCIPAL', 45, null),
  ('france.bordeaux.pessac-leognan', 'Merlot', 'PRINCIPAL', 35, null),
  ('france.bordeaux.pessac-leognan', 'Sauvignon Blanc', 'PRINCIPAL', 10, null),
  ('france.bordeaux.pessac-leognan', 'Semillon', 'ACCESSORY', 5, null),
  ('france.bordeaux.pessac-leognan', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.sauternes', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.sauternes', 'Sauvignon Blanc', 'ACCESSORY', 15, null),
  ('france.bordeaux.sauternes', 'Muscadelle', 'ACCESSORY', 5, null),
  ('france.bordeaux.sauternes.barsac', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.sauternes.barsac', 'Sauvignon Blanc', 'ACCESSORY', 15, null),
  ('france.bordeaux.sauternes.barsac', 'Muscadelle', 'ACCESSORY', 5, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Grapes — Burgundy.
-- ---------------------------------------------------------------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note
from (values
  ('france.bourgogne', 'Chardonnay', 'PRINCIPAL', 48, null),
  ('france.bourgogne', 'Pinot Noir', 'PRINCIPAL', 39, null),
  ('france.bourgogne', 'Aligoté', 'ACCESSORY', 6, null),
  ('france.bourgogne', 'Gamay', 'ACCESSORY', 3, 'Mostly in the far south'),
  ('france.bourgogne.cote-de-nuits', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.cote-de-nuits', 'Chardonnay', 'ACCESSORY', 6, null),
  ('france.bourgogne.cote-de-nuits', 'Aligoté', 'ACCESSORY', 2, null),
  ('france.bourgogne.cote-de-nuits.marsannay', 'Pinot Noir', 'PRINCIPAL', 75, null),
  ('france.bourgogne.cote-de-nuits.marsannay', 'Chardonnay', 'ACCESSORY', 20, null),
  ('france.bourgogne.cote-de-nuits.fixin', 'Pinot Noir', 'PRINCIPAL', 90, null),
  ('france.bourgogne.cote-de-nuits.fixin', 'Chardonnay', 'ACCESSORY', 8, null),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'Pinot Noir', 'PRINCIPAL', 96, null),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'Chardonnay', 'ACCESSORY', 3, null),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-nuits.vougeot', 'Pinot Noir', 'PRINCIPAL', 85, null),
  ('france.bourgogne.cote-de-nuits.vougeot', 'Chardonnay', 'ACCESSORY', 15, null),
  ('france.bourgogne.cote-de-nuits.vosne-romanee', 'Pinot Noir', 'PRINCIPAL', 100, null),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'Pinot Noir', 'PRINCIPAL', 97, null),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'Chardonnay', 'ACCESSORY', 2, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Every cru and climat of the Côte de Nuits is Pinot Noir…
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note)
select p.id, g.id, 'PRINCIPAL', true, 100, null
from wine_places p, grapes g
where g.name = 'Pinot Noir'
  and p.publication_status = 'VERIFIED'
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.%'
  and p.appellation_level in ('grand_cru', 'premier_cru')
on conflict (wine_place_id, grape_id) do nothing;

-- …with Musigny's white footnote.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note)
select p.id, g.id, 'ACCESSORY', true, null, 'A sliver of Chardonnay for Musigny Blanc'
from wine_places p, grapes g
where g.name = 'Chardonnay'
  and p.canonical_key = 'france.bourgogne.cote-de-nuits.chambolle-musigny.musigny'
on conflict (wine_place_id, grape_id) do nothing;

do $$
declare v_count int;
begin
  -- 76 Bordeaux + 20 Burgundy explicit + 44 rule-driven PN (23 grands crus,
  -- 7 premier-cru groups, 14 climats) + 1 Musigny Chardonnay.
  select count(*) into v_count from wine_place_grapes;
  if v_count <> 141 then
    raise exception 'wine_place_grapes: expected 141, got % (a VALUES row failed to match a place or grape)', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Articles — regions, district, new Bordeaux appellations. Insert-only:
--    places that already have an article are never touched here.
-- ---------------------------------------------------------------------------
insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, v.climate, v.soils, v.facts, 'DRAFT'
from (values
  ('france.bourgogne',
   'A narrow 250 km ribbon from Chablis to the Mâconnais where Pinot Noir and Chardonnay set their world reference. Terroir logic at its purest: a four-tier ladder from regional wine to grand cru, mapped vineyard by vineyard over centuries.',
   'Continental — cold winters, hail-prone summers, and harvest rain as the perennial gamble.',
   'Jurassic limestone and marl, endlessly reshuffled along the slope.',
   array['Four tiers: regional, village, premier cru, grand cru', 'The climats are a UNESCO World Heritage site', 'Grands crus are about 1% of production']),
  ('france.bourgogne.cote-de-nuits',
   'The northern half of the Côte d''Or escarpment, running from Dijon to Corgoloin — a strip rarely a kilometre wide that holds nearly all of Burgundy''s red grands crus. Pinot Noir at maximum depth, perfume and longevity.',
   'Continental; the east-facing slope catches morning sun and sheds cold air.',
   'Bajocian limestone and marl — the mid-slope band is the sweet spot.',
   array['24 of Burgundy''s 33 grands crus', 'All red except tiny Musigny Blanc', 'Eight village AOCs from Marsannay to Nuits-Saint-Georges']),
  ('france.bordeaux.blaye',
   'Sleepy right-bank district across the Gironde from the Médoc, its vines rolling over hills around the citadel town of Blaye. Merlot-led reds of honest, early-drinking charm — the Blaye AOC itself is red only.',
   'Maritime; the wide estuary tempers frost.',
   'Clay-limestone slopes with pockets of gravel and sand.',
   array['Red only under Blaye AOC', 'Most local production labels as Blaye Côtes de Bordeaux', 'The Vauban citadel is UNESCO-listed']),
  ('france.bordeaux.cotes-de-bourg',
   'An amphitheatre of hills where the Dordogne meets the Garonne, facing the Médoc across the water. Sturdy Merlot-led reds in which Malbec kept a foothold it lost almost everywhere else in Bordeaux.',
   'Maritime, notably frost-safe on the river slopes.',
   'Clay-limestone with veins of gravel.',
   array['Bordeaux''s highest share of Malbec', 'Almost entirely red', 'One of Bordeaux''s oldest vineyard areas']),
  ('france.bordeaux.entre-deux-mers',
   '"Between two seas" — the broad wedge of farmland between the tidal Garonne and Dordogne. The AOC covers brisk dry whites from Sauvignon and Semillon; reds grown here sell as plain Bordeaux.',
   'Maritime with slightly more continental swing inland.',
   'Clay-limestone and boulbènes (fine silty loams).',
   array['White only under the AOC', 'Bordeaux''s largest dry-white district', 'Reds from the same land label as Bordeaux AOC']),
  ('france.bordeaux.fronsac',
   'Hilly right-bank appellation just west of Libourne, above the Dordogne. Dense, structured Merlot-led reds from limestone slopes — in the 18th century more celebrated than neighbouring Pomerol.',
   'Maritime, moderated by the Dordogne and Isle rivers.',
   'Fronsac molasse — clay-limestone over compact starfish limestone.',
   array['Red only', 'Merlot-dominant with Cabernet Franc', 'Historically outranked Pomerol']),
  ('france.bordeaux.canon-fronsac',
   'The prized limestone heart of the Fronsac hills, a small enclave entirely inside Fronsac. Its slopes give the district''s densest, most mineral Merlot.',
   'Maritime, river-moderated.',
   'Pure limestone plateau and steep clay-limestone flanks.',
   array['An enclave within Fronsac', 'Red only', 'Among the right bank''s steepest vineyard slopes'])
) as v(key, description, climate, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, v.climate, v.soils, v.facts, 'DRAFT'
from (values
  ('france.bourgogne.cote-de-nuits.marsannay',
   'The Côte de Nuits'' northern gateway at Dijon''s edge, and the only village AOC in Burgundy for red, white and rosé alike. Long a bulk supplier, now one of the Côte''s best-value hunting grounds.',
   'Continental; the openness to the north brings a cooler edge.',
   'Limestone and marl thinning towards the plain.',
   array['Burgundy''s only village AOC with rosé', 'No premiers crus yet — candidates under INAO review', 'The Côte''s northern gateway']),
  ('france.bourgogne.cote-de-nuits.fixin',
   'A stern, quiet village between Marsannay and Gevrey whose structured, slow-ageing Pinot shares Gevrey''s marl backbone without its fame — or price.',
   'Continental, slightly cool exposure.',
   'Deep marl and limestone scree.',
   array['Premiers crus include Clos du Chapitre and Clos Napoléon', 'Structured reds built for the cellar']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin',
   'The Côte''s largest wine village and its red powerhouse: nine grands crus crowned by Chambertin itself. Dark, muscular, long-lived Pinot Noir — Burgundy with shoulders.',
   'Continental; the Combe de Lavaux funnels cooling air across the slope.',
   'Brown marls and limestone, with deeper clay on the flats.',
   array['Nine grands crus — more than any other village', 'Red only', 'Napoleon drank little else than Chambertin']),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis',
   'A small village wedged between Gevrey and Chambolle, with four grands crus wholly its own — three of them ancient walled clos — plus a share of Bonnes-Mares. The style sits midway between its neighbours'' muscle and lace.',
   'Continental, sheltered mid-slope.',
   'Limestone with thin red clay.',
   array['Four grands crus plus a slice of Bonnes-Mares', 'Three grands crus are walled clos', 'A whisper of white is made']),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny',
   'The Côte''s most ethereal reds: perfumed, silk-textured Pinot Noir off limestone-rich soils. Musigny crowns the village, with Bonnes-Mares shared towards Morey.',
   'Continental; a narrow combe cools the upper slope.',
   'The Côte''s highest limestone content, with little clay.',
   array['Red only', 'Les Amoureuses — a premier cru of grand cru repute', 'Musigny Blanc is the Côte de Nuits'' only white grand cru']),
  ('france.bourgogne.cote-de-nuits.vougeot',
   'A tiny commune dwarfed by its wall-ringed grand cru: Clos de Vougeot covers five-sixths of the village''s vines. The Cistercians'' medieval enclosure remains the template of climat thinking.',
   'Continental, low on the slope.',
   'From gravelly mid-slope to heavy alluvial clay by the road.',
   array['Clos de Vougeot: ~50 ha, ~80 owners', 'The château hosts the Confrérie des Chevaliers du Tastevin']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee',
   'The aristocrat of the Côte de Nuits: velvet-and-spice Pinot Noir under seven grands crus, Romanée-Conti and La Tâche foremost. The village that sets the ceiling of wine prices worldwide.',
   'Continental; a perfectly pitched east-facing slope.',
   'Limestone under varying depths of clay and marl — thinnest at the grands crus.',
   array['"There are no common wines in Vosne" — old local saying', 'Romanée-Conti is wine''s most expensive vineyard', 'Red only']),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges',
   'The Côte''s merchant town and southern anchor: no grand cru, but a deep bench of premiers crus split into two distinct halves either side of the town. Dark, earthy, savoury Pinot that repays patience.',
   'Continental.',
   'Deeper clay and alluvium north of town; stonier, thinner soils south.',
   array['No grand cru — Les Saint-Georges the perennial candidate', 'The town gave the Côte de Nuits its name']),
  ('france.bourgogne.cote-de-nuits.vougeot.clos-de-vougeot',
   'The Cistercians'' great walled vineyard, enclosed by 1336 and never subdivided by wall since — only by inheritance, into some 80 parcels today. Quality varies with slope position, from gravelly crest to clay foot.',
   'Continental.',
   'Gravelly limestone upslope grading to heavy clay at the bottom.',
   array['~50 ha — the Côte''s largest grand cru clos', 'Roughly 80 different owners', 'Walled since the 14th century'])
) as v(key, description, climate, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'DRAFT'
from (values
  ('france.bourgogne.cote-de-nuits.vosne-romanee.romanee-conti',
   '1.8 hectares of the most coveted vines on earth, monopole of the Domaine de la Romanée-Conti. Perfume over power — the reference point for Pinot Noir at its limit.',
   'Thin clay over fissured limestone, mid-slope.',
   array['Monopole of Domaine de la Romanée-Conti', 'Roughly 450 cases a year']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.la-romanee',
   'At 0.85 ha the smallest appellation in France, hugging the slope directly above Romanée-Conti. A single-owner monopole of the Comte Liger-Belair.',
   'Steep, stony, shallow.',
   array['France''s smallest AOC', 'Monopole of Comte Liger-Belair']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.la-tache',
   'The Domaine de la Romanée-Conti''s six-hectare monopole south of the village — the most complete Vosne grand cru: power, spice, iron and astonishing length.',
   'Varied along its long slope run — thin and stony above, deeper below.',
   array['Monopole of Domaine de la Romanée-Conti', 'Spans nearly the full slope height']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.richebourg',
   'Opulence incarnate — the richest and most heavily scented of Vosne''s grands crus, on the slope''s upper bend just north of Romanée-Conti.',
   'Limestone with a little more clay than its neighbours.',
   array['~8 ha shared among a dozen owners', 'The most opulent Vosne style']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.romanee-saint-vivant',
   'The gentlest of the family: silky, filigreed Pinot from deeper soils below Richebourg, named for the medieval priory of Saint-Vivant that once owned it.',
   'Deeper clay-limestone, low on the slope.',
   array['Named for the priory of Saint-Vivant', 'The laciest of Vosne''s grands crus']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux',
   'Large and variable grand cru in neighbouring Flagey-Échezeaux, counted with Vosne. Airy, spicy, red-fruited Pinot — the family''s most approachable bottle.',
   'A patchwork of eleven lieux-dits over varied limestone.',
   array['~36 ha — one of Burgundy''s largest grands crus', 'Lies in Flagey-Échezeaux, grouped with Vosne']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.grands-echezeaux',
   'Échezeaux''s smaller, deeper neighbour pressed against the wall of Clos de Vougeot — markedly more concentration, darker fruit and a longer life.',
   'Deeper, more homogeneous clay-limestone.',
   array['~9 ha beside Clos de Vougeot''s wall', 'The more serious of the two Échezeaux'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'DRAFT'
from (values
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin',
   'The king''s vineyard: Gevrey''s mightiest slope, all dark fruit, iron and decades of cellar life. With Clos de Bèze beside it, the summit of the village.',
   'Thin brown marl over hard limestone, perfectly pitched mid-slope.',
   array['~13 ha, many owners', 'Clos de Bèze may legally sell as Chambertin']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze',
   'The abbey of Bèze''s clos, documented since the year 640 — arguably Chambertin''s equal, often its superior in finesse, and legally entitled to use the Chambertin name.',
   'Slightly thinner, stonier soil than Chambertin proper.',
   array['Vines documented since 640', 'May be sold as Chambertin']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chapelle-chambertin',
   'Fine-boned satellite on shallow, stony ground beside Clos de Bèze, named for a long-gone chapel. Red-fruited, elegant Gevrey rather than a powerhouse.',
   'Very shallow stony limestone.',
   array['One of the lighter-framed satellites', 'Named for a 13th-century chapel']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.charmes-chambertin',
   'The largest and most generous of the satellites — supple, open, early-charming Gevrey. Mazoyères-Chambertin is customarily folded into it on labels.',
   'Deeper soil towards the road.',
   array['Largest of the Chambertin satellites', 'Mazoyères usually sells under this name']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.griotte-chambertin',
   'A tiny dish-shaped amphitheatre said to be named for the morello cherries (griottes) its wine so uncannily evokes. Rare, charming, quietly profound.',
   'A sun-trap hollow of thin limestone soil.',
   array['One of Burgundy''s smallest grands crus', 'Famous cherry-scented signature']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.latricieres-chambertin',
   'The cool, stony southern extension of Chambertin towards Morey — leaner and more mineral, a slow-burning wine for patient cellars.',
   'Thin, very stony, with cool air from the combe above.',
   array['Coolest site of the family', 'Borders Chambertin to the south']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.mazis-chambertin',
   'The northernmost satellite, hard against Clos de Bèze — the most Chambertin-like of them all in muscle, darkness and grip.',
   'Thin marl over rock in the upper part, deeper below.',
   array['Closest in style to Chambertin itself', 'Adjoins Clos de Bèze']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.mazoyeres-chambertin',
   'A grand cru that mostly exists on paper: nearly all of it is sold as Charmes-Chambertin, as the law allows. Deeper soils near the road give the softer wine of the pair.',
   'Deeper, sandier soils running to the route des Grands Crus.',
   array['May be sold as Charmes-Chambertin — and usually is', 'Fully shared footprint with Charmes in INAO parcels']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.ruchottes-chambertin',
   'Highest and stoniest of the family — a sliver of thin soil over bare rock above Mazis, giving taut, mineral, sinewy Gevrey.',
   'Barely any topsoil over fractured limestone.',
   array['Highest of Gevrey''s grands crus', 'Among the smallest of the family'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.description, null, v.soils, v.facts, 'DRAFT'
from (values
  ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-la-roche',
   'Morey''s grandest cru: rocky, dark and structured Pinot closer in spirit to Gevrey than to Chambolle. The name says it — rock barely below the surface.',
   'Shallow red clay strewn with limestone rubble.',
   array['Morey''s largest and most renowned grand cru', 'Built for long ageing']),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-saint-denis',
   'The village''s namesake clos and its silkiest grand cru — lace, red fruit and quiet length rather than muscle.',
   'Fine limestone scree with a little more clay.',
   array['Gave Morey-Saint-Denis half its name', 'The most delicate Morey grand cru']),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-des-lambrays',
   'A near-monopole walled clos rising steeply behind the village, revived to greatness in recent decades; whole-bunch vinification gives a savoury, perfumed wine.',
   'Steep, varied limestone and marl.',
   array['Almost a monopole (one tiny outside parcel)', 'Promoted to grand cru in 1981']),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-tart',
   'Monopole clos in unbroken single ownership since 1141 — from Cistercian nuns to today, never divided. Rich yet cool-toned, vinified from a single enclosed slope.',
   'Limestone with thin clay, vines planted north–south against erosion.',
   array['Single owner since 1141', 'The Côte''s largest monopole clos']),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny.musigny',
   'Chambolle''s crown and the Côte''s most refined grand cru — "silk and lace", wine of perfume and weightless intensity. A sliver of Chardonnay makes the Côte de Nuits'' only white grand cru.',
   'Very high limestone content, thin topsoil on a steep pitch.',
   array['"Silk and lace" — the classic descriptor', 'Musigny Blanc is unique in the Côte de Nuits']),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny.bonnes-mares',
   'Chambolle''s second grand cru, running across the boundary towards Morey — broader-shouldered and darker than Musigny, with two distinct soil bands giving two personalities.',
   'Red clay (terres rouges) north; whiter marl (terres blanches) south.',
   array['Spans Chambolle and Morey', 'Sturdier twin to Musigny''s lace']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.cros-parantoux',
   'The climat Henri Jayer rescued from artichokes and scrub after the war and made world-famous — high, cool and stony above Richebourg, giving taut, smoky, mineral Vosne.',
   'Thin soil over fissured rock; Jayer needed dynamite to plant.',
   array['Made famous by Henri Jayer', 'Borders Richebourg upslope']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots',
   'Vosne''s largest premier cru, lying between Romanée-Saint-Vivant and Échezeaux — generous, spicy, open-hearted wine from grand-cru company.',
   'Deeper clay-limestone.',
   array['Vosne''s largest premier cru', 'Surrounded by grands crus']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-beaux-monts',
   'High slope above Échezeaux with cooler exposure — bright, red-fruited, energetic Vosne that has quietly climbed the quality ladder.',
   'Stony upper-slope limestone.',
   array['High, cool site above Échezeaux', 'Noted for freshness and lift'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Premier-cru group nodes: rule-generated stub descriptions.
insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  'The premier cru climats of ' || parent.name || ' — each a named vineyard, mapped individually on the slope.',
  'DRAFT'
from wine_places p
join wine_places parent on parent.id = p.primary_parent_id
where p.publication_status = 'VERIFIED'
  and p.kind = 'SITE'
  and p.appellation_level = 'premier_cru'
  and p.canonical_key like '%.premier-cru'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Remaining individual climats: honest one-line stubs pending curation.
insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  p.name || ' is a premier cru climat of Vosne-Romanée, labelled Vosne-Romanée 1er Cru ' || p.name || '.',
  'DRAFT'
from wine_places p
where p.publication_status = 'VERIFIED'
  and p.kind = 'SITE'
  and p.appellation_level = 'premier_cru'
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.%'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Soils backfill for the 15 pre-existing articles (null soils only).
update wine_place_articles a set soils = v.soils
from (values
  ('france', 'Every major soil family, from Kimmeridgian chalk to granite.'),
  ('france.bordeaux', 'Gravel banks on the left bank; clay-limestone on the right.'),
  ('france.bordeaux.medoc', 'Clay-limestone with scattered gravel croupes.'),
  ('france.bordeaux.haut-medoc', 'Deep Günzian gravel croupes over clay.'),
  ('france.bordeaux.haut-medoc.margaux', 'The Médoc''s thinnest, stoniest gravels.'),
  ('france.bordeaux.haut-medoc.pauillac', 'Deep gravel banks over iron-rich subsoil.'),
  ('france.bordeaux.haut-medoc.saint-estephe', 'Gravel over heavier clay — the Médoc''s sturdiest soils.'),
  ('france.bordeaux.haut-medoc.saint-julien', 'Remarkably homogeneous deep gravel.'),
  ('france.bordeaux.medoc', 'Clay-limestone with gravel outcrops.'),
  ('france.bordeaux.graves', 'The namesake gravels over sand and clay.'),
  ('france.bordeaux.pessac-leognan', 'Deep gravel terraces at the city''s edge.'),
  ('france.bordeaux.saint-emilion', 'Limestone plateau and clay-limestone côtes; sandier towards Pomerol.'),
  ('france.bordeaux.pomerol', 'Clay and gravel over the iron-rich crasse de fer.'),
  ('france.bordeaux.sauternes', 'Gravel over limestone and clay beside the misty Ciron.'),
  ('france.bordeaux.sauternes.barsac', 'Red sands over the Barsac limestone plateau.')
) as v(key, soils)
join wine_places p on p.canonical_key = v.key
where a.wine_place_id = p.id and a.soils is null;

-- ---------------------------------------------------------------------------
-- Final fail-closed totals: every verified place must now carry an article.
-- ---------------------------------------------------------------------------
do $$
declare v_articles int; v_missing int; v_styles int; v_desig int;
begin
  select count(*) into v_articles from wine_place_articles;
  select count(*) into v_missing
    from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  select count(*) into v_styles from wine_place_styles;
  select count(*) into v_desig from wine_place_designations;
  if v_missing <> 0 then
    raise exception 'articles: % verified places still missing one', v_missing;
  end if;
  if v_articles < 73 then
    raise exception 'articles: expected >= 73, got %', v_articles;
  end if;
  if v_styles <> 87 then
    raise exception 'styles: expected 87, got %', v_styles;
  end if;
  if v_desig <> 52 then
    raise exception 'designation links: expected 52, got %', v_desig;
  end if;
end $$;









