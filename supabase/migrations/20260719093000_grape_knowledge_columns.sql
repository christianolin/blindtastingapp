-- Knowledge section, part 2: the Grape Library reuses the existing `grapes`
-- reference table (same id/name every wine_answers/guesses FK points at) and
-- adds nullable descriptive columns alongside it. Additive only — nothing
-- here is read by scoring, which only ever compares grape ids.
--
-- Not every grape gets a curated profile in this first pass (57 exist, ~40
-- are profiled below); the rest simply render as "no profile yet" in the UI
-- until someone fills them in — that's the intended gradual-expansion path.
alter table grapes
  add column if not exists color text check (color in ('RED', 'WHITE')),
  add column if not exists description text,
  add column if not exists typical_aromas text,
  add column if not exists typical_acidity text,
  add column if not exists typical_tannin text,
  add column if not exists typical_body text,
  add column if not exists typical_alcohol text,
  add column if not exists main_regions text;

-- ============================================================================
-- Reds
-- ============================================================================

update grapes set
  color = 'RED',
  description = 'A thick-skinned, late-ripening red grape and one of the world''s most planted — the backbone of Bordeaux''s Left Bank blends and countless New World varietals.',
  typical_aromas = 'Blackcurrant, black cherry, cedar, graphite; green bell pepper when underripe.',
  typical_acidity = 'Medium-high',
  typical_tannin = 'High',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Bordeaux (Médoc), Napa Valley, Coonawarra, Maipo Valley, Tuscany (Super Tuscans)'
where name = 'Cabernet Sauvignon';

update grapes set
  color = 'RED',
  description = 'A softer, earlier-ripening cousin of Cabernet Sauvignon, dominant on Bordeaux''s Right Bank and widely planted for approachable varietal wines.',
  typical_aromas = 'Plum, black cherry, chocolate, herbs.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Bordeaux (Pomerol, Saint-Émilion), California, Washington State, northeastern Italy'
where name = 'Merlot';

update grapes set
  color = 'RED',
  description = 'An aromatic, lighter-bodied red grape and parent of Cabernet Sauvignon, often used as a blending component but increasingly bottled alone.',
  typical_aromas = 'Red currant, raspberry, violet, bell pepper, graphite.',
  typical_acidity = 'Medium-high',
  typical_tannin = 'Medium',
  typical_body = 'Medium',
  typical_alcohol = 'Medium',
  main_regions = 'Loire Valley (Chinon, Bourgueil), Bordeaux blends, Friuli, Long Island'
where name = 'Cabernet Franc';

update grapes set
  color = 'RED',
  description = 'A thin-skinned, cool-climate red grape prized for its perfume and silky texture — the signature red of Burgundy.',
  typical_aromas = 'Red cherry, raspberry, strawberry, forest floor; mushroom with age.',
  typical_acidity = 'High',
  typical_tannin = 'Low to medium',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Burgundy, Oregon, Central Otago, Sonoma Coast, Champagne (as a base wine)'
where name = 'Pinot Noir';

update grapes set
  color = 'RED',
  description = 'A dark, peppery red grape known as Syrah in France and Shiraz in Australia — full-bodied in warm climates, more savory and peppery when cool-grown.',
  typical_aromas = 'Blackberry, black pepper, smoked meat, violet, olive.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium-high',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Northern Rhône (Hermitage, Côte-Rôtie), Barossa Valley, McLaren Vale'
where name = 'Syrah';

update grapes set
  color = 'RED',
  description = 'A high-sugar, low-tannin red grape (called Garnacha in Spain) central to Southern Rhône and Priorat blends.',
  typical_aromas = 'Strawberry, raspberry, white pepper, dried herbs (garrigue).',
  typical_acidity = 'Low to medium',
  typical_tannin = 'Low to medium',
  typical_body = 'Medium to full',
  typical_alcohol = 'High',
  main_regions = 'Southern Rhône (Châteauneuf-du-Pape), Priorat, Sardinia (as Cannonau)'
where name = 'Grenache';

update grapes set
  color = 'RED',
  description = 'The Spanish name for Grenache — a warm-climate red grape central to Priorat, Rioja, and Navarra blends.',
  typical_aromas = 'Red berry, strawberry, white pepper, garrigue herbs.',
  typical_acidity = 'Low to medium',
  typical_tannin = 'Low to medium',
  typical_body = 'Medium to full',
  typical_alcohol = 'High',
  main_regions = 'Priorat, Rioja, Navarra'
where name = 'Garnacha';

update grapes set
  color = 'RED',
  description = 'Italy''s most planted red grape, the backbone of Chianti and Brunello di Montalcino — high acid and firm tannin with a savory core.',
  typical_aromas = 'Sour cherry, plum, dried herbs, leather, tomato leaf.',
  typical_acidity = 'High',
  typical_tannin = 'Medium-high',
  typical_body = 'Medium',
  typical_alcohol = 'Medium to high',
  main_regions = 'Tuscany (Chianti, Brunello di Montalcino, Vino Nobile di Montepulciano)'
where name = 'Sangiovese';

update grapes set
  color = 'RED',
  description = 'A pale-colored but powerfully tannic red grape behind Barolo and Barbaresco — high in both acid and tannin, built to age for decades.',
  typical_aromas = 'Rose, tar, red cherry, dried herbs; truffle with age.',
  typical_acidity = 'High',
  typical_tannin = 'High',
  typical_body = 'Full (though pale in color)',
  typical_alcohol = 'Medium to high',
  main_regions = 'Piedmont (Barolo, Barbaresco)'
where name = 'Nebbiolo';

update grapes set
  color = 'RED',
  description = 'Spain''s signature red grape, the backbone of Rioja and Ribera del Duero — moderate acidity with a natural affinity for oak aging.',
  typical_aromas = 'Red plum, cherry, tobacco, leather, dill (from American oak).',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium-high',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium',
  main_regions = 'Rioja, Ribera del Duero'
where name = 'Tempranillo';

update grapes set
  color = 'RED',
  description = 'A dark, fleshy red grape that found its greatest fame in Argentina, though it originates in southwest France (Cahors).',
  typical_aromas = 'Black plum, blackberry, violet, cocoa.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Mendoza, Cahors'
where name = 'Malbec';

update grapes set
  color = 'RED',
  description = 'A light, juicy red grape best known as the sole grape of Beaujolais, typically made for early, fruit-forward drinking.',
  typical_aromas = 'Red cherry, raspberry, banana (carbonic maceration), floral notes.',
  typical_acidity = 'Medium-high',
  typical_tannin = 'Low',
  typical_body = 'Light',
  typical_alcohol = 'Low to medium',
  main_regions = 'Beaujolais, Loire Valley'
where name = 'Gamay';

update grapes set
  color = 'RED',
  description = 'A thick-skinned, sugar-rich red grape (genetically identical to Italy''s Primitivo) known for jammy, high-alcohol California wines.',
  typical_aromas = 'Blackberry, raspberry jam, black pepper, brambly spice.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Full',
  typical_alcohol = 'High',
  main_regions = 'California (Sonoma, Lodi, Paso Robles)'
where name = 'Zinfandel';

update grapes set
  color = 'RED',
  description = 'Southern Italy''s version of Zinfandel (the same variety) — ripe, warm-climate, and full-bodied, especially from Puglia.',
  typical_aromas = 'Blackberry, dried fig, black pepper, dark chocolate.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Full',
  typical_alcohol = 'High',
  main_regions = 'Puglia (Primitivo di Manduria)'
where name = 'Primitivo';

update grapes set
  color = 'RED',
  description = 'A deeply colored, naturally high-acid Piedmontese red grape, traditionally lighter in tannin than its neighbor Nebbiolo.',
  typical_aromas = 'Black cherry, plum, blackberry, subtle earthiness.',
  typical_acidity = 'High',
  typical_tannin = 'Low to medium',
  typical_body = 'Medium',
  typical_alcohol = 'Medium to high',
  main_regions = 'Piedmont (Barbera d''Asti, Barbera d''Alba)'
where name = 'Barbera';

update grapes set
  color = 'RED',
  description = 'A late-ripening, thick-skinned red grape valued for structure and color in Southern Rhône and Spanish blends.',
  typical_aromas = 'Blackberry, black pepper, gamey/animal notes, violet.',
  typical_acidity = 'Medium',
  typical_tannin = 'High',
  typical_body = 'Full',
  typical_alcohol = 'High',
  main_regions = 'Southern Rhône (Bandol), Jumilla (as Monastrell)'
where name = 'Mourvèdre';

update grapes set
  color = 'RED',
  description = 'A late-ripening, deeply colored Bordeaux blending grape used in small amounts for color, tannin, and spice.',
  typical_aromas = 'Violet, blackberry, black pepper, graphite.',
  typical_acidity = 'Medium-high',
  typical_tannin = 'High',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Bordeaux (Médoc, small % of blends), Australia, Virginia'
where name = 'Petit Verdot';

update grapes set
  color = 'RED',
  description = 'A high-yielding, high-acid, high-tannin red grape historically bulk-planted in southern France and Spain, now valued from old, low-yielding vines.',
  typical_aromas = 'Red and black berries, dried herbs, earthy spice.',
  typical_acidity = 'High',
  typical_tannin = 'High',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Languedoc-Roussillon, Priorat (as Cariñena/Samsó)'
where name = 'Carignan';

update grapes set
  color = 'RED',
  description = 'A soft, fruity, low-tannin red grape widely used in southern French rosé and blends, and a parent of South Africa''s Pinotage.',
  typical_aromas = 'Red cherry, strawberry, floral notes.',
  typical_acidity = 'Medium',
  typical_tannin = 'Low',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Languedoc, Southern Rhône blends, South Africa'
where name = 'Cinsault';

update grapes set
  color = 'RED',
  description = 'Portugal''s most prized red grape, contributing structure, color, and perfume to both Port and dry Douro reds.',
  typical_aromas = 'Blackberry, violet, bay leaf, licorice.',
  typical_acidity = 'High',
  typical_tannin = 'High',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Douro, Dão'
where name = 'Touriga Nacional';

update grapes set
  color = 'RED',
  description = 'Sicily''s signature red grape, giving ripe, generous wines with soft tannin in the island''s warm climate.',
  typical_aromas = 'Black cherry, plum, licorice, herbs.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Sicily'
where name = 'Nero d''Avola';

update grapes set
  color = 'RED',
  description = 'An early-ripening Piedmontese red grape making soft, fruity wines meant for younger drinking, in contrast to age-worthy Nebbiolo.',
  typical_aromas = 'Black cherry, blackberry, licorice, almond.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium',
  typical_body = 'Medium',
  typical_alcohol = 'Medium',
  main_regions = 'Piedmont (Dolcetto d''Alba)'
where name = 'Dolcetto';

update grapes set
  color = 'RED',
  description = 'The principal grape of Valpolicella and Amarone, giving bright cherry fruit and — when dried for Amarone — rich, raisinated depth.',
  typical_aromas = 'Sour cherry, red plum, almond; dried fruit in Amarone.',
  typical_acidity = 'High',
  typical_tannin = 'Medium',
  typical_body = 'Medium (Valpolicella) to full (Amarone)',
  typical_alcohol = 'Medium to high',
  main_regions = 'Veneto (Valpolicella, Amarone della Valpolicella)'
where name = 'Corvina';

update grapes set
  color = 'RED',
  description = 'The Portuguese name for Tempranillo — a key red grape in Port and Douro/Dão table wines.',
  typical_aromas = 'Red plum, cherry, dried herbs.',
  typical_acidity = 'Medium',
  typical_tannin = 'Medium-high',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium',
  main_regions = 'Douro, Dão (as Tinta Roriz/Aragonez)'
where name = 'Tinta Roriz';

update grapes set
  color = 'RED',
  description = 'The most widely planted grape in the Douro, valued for aromatics and balance in both Port and dry red blends.',
  typical_aromas = 'Red berry, floral (rose), citrus peel.',
  typical_acidity = 'Medium-high',
  typical_tannin = 'Medium',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium',
  main_regions = 'Douro'
where name = 'Touriga Franca';

update grapes set
  color = 'RED',
  description = 'Greece''s most prestigious red grape, often compared to Nebbiolo for its high acid and tannin and long ageing potential.',
  typical_aromas = 'Tomato, olive, dried herbs, red cherry.',
  typical_acidity = 'High',
  typical_tannin = 'High',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium',
  main_regions = 'Naoussa, Amyndeon (Greece)'
where name = 'Xinomavro';

-- ============================================================================
-- Whites
-- ============================================================================

update grapes set
  color = 'WHITE',
  description = 'A neutral, highly adaptable white grape that takes strongly on winemaking choices (oak, malolactic fermentation) and climate — from lean and mineral to rich and buttery.',
  typical_aromas = 'Green apple, citrus (cool climate); peach, pineapple, butter, vanilla (warm climate/oaked).',
  typical_acidity = 'Medium to high',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Burgundy (Chablis, Côte de Beaune), Champagne, California, Australia'
where name = 'Chardonnay';

update grapes set
  color = 'WHITE',
  description = 'An aromatic, high-acid white grape known for pungent herbaceous character in cool climates and riper tropical fruit in warmer ones.',
  typical_aromas = 'Gooseberry, green bell pepper, grass, passionfruit, citrus.',
  typical_acidity = 'High',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Loire Valley (Sancerre, Pouilly-Fumé), Marlborough (New Zealand), Bordeaux (blends)'
where name = 'Sauvignon Blanc';

update grapes set
  color = 'WHITE',
  description = 'An intensely aromatic, naturally high-acid white grape capable of everything from bone-dry to lusciously sweet, and famed for its ability to age.',
  typical_aromas = 'Lime, green apple, white flowers; petrol with age.',
  typical_acidity = 'High',
  typical_body = 'Light to medium',
  typical_alcohol = 'Low to medium',
  main_regions = 'Mosel, Rheingau, Alsace, Clare Valley, Finger Lakes'
where name = 'Riesling';

update grapes set
  color = 'WHITE',
  description = 'A pink-skinned relative of Pinot Noir, made as a light, neutral white in Italy (Pinot Grigio) or a richer, more textured style in Alsace (Pinot Gris).',
  typical_aromas = 'Pear, apple, citrus; honey and spice in richer Alsace styles.',
  typical_acidity = 'Medium',
  typical_body = 'Light (Grigio) to full (Alsace Gris)',
  typical_alcohol = 'Medium',
  main_regions = 'Alsace, northeastern Italy, Oregon'
where name = 'Pinot Gris';

update grapes set
  color = 'WHITE',
  description = 'A pink-skinned, intensely perfumed white grape making some of the most instantly recognizable aromatic white wines.',
  typical_aromas = 'Lychee, rose petal, ginger, muscat grape.',
  typical_acidity = 'Low to medium',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Alsace, Alto Adige, Germany'
where name = 'Gewürztraminer';

update grapes set
  color = 'WHITE',
  description = 'A versatile, high-acid white grape from the Loire Valley made in dry, sweet, and sparkling styles, and also central to South African whites.',
  typical_aromas = 'Quince, apple, honey, wet wool, chamomile.',
  typical_acidity = 'High',
  typical_body = 'Light to full (style-dependent)',
  typical_alcohol = 'Medium',
  main_regions = 'Loire Valley (Vouvray, Savennières), South Africa'
where name = 'Chenin Blanc';

update grapes set
  color = 'WHITE',
  description = 'A low-acid, intensely perfumed white grape, historically confined to the Northern Rhône''s Condrieu but now planted more widely.',
  typical_aromas = 'Apricot, peach blossom, honeysuckle.',
  typical_acidity = 'Low',
  typical_body = 'Full',
  typical_alcohol = 'Medium to high',
  main_regions = 'Northern Rhône (Condrieu), California, Australia'
where name = 'Viognier';

update grapes set
  color = 'WHITE',
  description = 'Austria''s flagship white grape, giving peppery, food-friendly whites with bright acidity.',
  typical_aromas = 'White pepper, lentil, citrus, green apple.',
  typical_acidity = 'Medium-high',
  typical_body = 'Light to full',
  typical_alcohol = 'Medium',
  main_regions = 'Austria (Wachau, Kamptal, Kremstal)'
where name = 'Grüner Veltliner';

update grapes set
  color = 'WHITE',
  description = 'A thick-skinned, aromatic white grape from Spain''s Atlantic coast, giving fresh, saline wines (known as Alvarinho in Portugal).',
  typical_aromas = 'Lemon, peach, white flowers, saline minerality.',
  typical_acidity = 'High',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Rías Baixas, Vinho Verde (as Alvarinho)'
where name = 'Albariño';

update grapes set
  color = 'WHITE',
  description = 'A low-acid, waxy-textured white grape blended with Sauvignon Blanc in Bordeaux, and prone to noble rot for Sauternes; ages remarkably in Australia''s Hunter Valley.',
  typical_aromas = 'Lemon, beeswax, lanolin; honey with age or botrytis.',
  typical_acidity = 'Medium',
  typical_body = 'Medium to full',
  typical_alcohol = 'Medium',
  main_regions = 'Bordeaux (Sauternes, dry white blends), Hunter Valley'
where name = 'Semillon';

update grapes set
  color = 'WHITE',
  description = 'An ancient family of grapes making some of the most naturally grapey-aromatic wines, from bone-dry to lusciously sweet and sparkling.',
  typical_aromas = 'Fresh grape, orange blossom, rose.',
  typical_acidity = 'Medium',
  typical_body = 'Light to medium',
  typical_alcohol = 'Low to high (style-dependent)',
  main_regions = 'Alsace, Asti (Italy), Rutherglen (Australia), Samos (Greece)'
where name = 'Muscat';

update grapes set
  color = 'WHITE',
  description = 'Spain''s aromatic white grape from Rueda, giving fresh, herbal wines often compared to Sauvignon Blanc.',
  typical_aromas = 'Fennel, grass, citrus, white pepper.',
  typical_acidity = 'High',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Rueda'
where name = 'Verdejo';

update grapes set
  color = 'WHITE',
  description = 'Greece''s standout white grape from volcanic Santorini, retaining searing acidity even in a hot, dry climate.',
  typical_aromas = 'Lemon, lime, saline minerality; sometimes petrol with age.',
  typical_acidity = 'High',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium to high',
  main_regions = 'Santorini'
where name = 'Assyrtiko';

update grapes set
  color = 'WHITE',
  description = 'A Mediterranean white grape giving fresh, saline wines along Italy''s and southern France''s coastlines.',
  typical_aromas = 'Citrus, green apple, herbs, sea spray.',
  typical_acidity = 'Medium-high',
  typical_body = 'Light to medium',
  typical_alcohol = 'Medium',
  main_regions = 'Sardinia, Liguria, Provence (as Rolle)'
where name = 'Vermentino';

update grapes set
  color = 'WHITE',
  description = 'The grape behind Prosecco, typically made into a light, fruity, off-dry sparkling wine using the tank method.',
  typical_aromas = 'Green apple, pear, white flowers.',
  typical_acidity = 'Medium',
  typical_body = 'Light',
  typical_alcohol = 'Low to medium',
  main_regions = 'Veneto (Prosecco)'
where name = 'Glera';
