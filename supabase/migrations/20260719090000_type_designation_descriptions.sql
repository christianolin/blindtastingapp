-- Knowledge section, part 1: a short plain-English explanation for each
-- type_designation, reusing the SAME table (and its existing `category`
-- grouping) already used for scoring — this is additive only, no impact on
-- reveal_wine or any guess comparison, which only ever compares the id.
alter table type_designations add column if not exists description text;

-- Prädikat (German ripeness/must-weight levels, ascending sugar at harvest)
update type_designations set description = 'The lightest Prädikat level — grapes picked at normal ripeness, giving delicate, often off-dry wines with lower alcohol.' where name = 'Kabinett';
update type_designations set description = '"Late harvest" — grapes picked riper than Kabinett, giving fuller, often slightly sweeter wines.' where name = 'Spätlese';
update type_designations set description = 'Made from selectively picked, very ripe bunches, sometimes with some botrytis — riper and richer than Spätlese, ranging from off-dry to sweet.' where name = 'Auslese';
update type_designations set description = 'Made from individually selected, overripe berries usually affected by noble rot — rich, sweet, and rare.' where name = 'Beerenauslese (BA)';
update type_designations set description = 'The highest Prädikat level — from shrivelled, botrytis-affected berries picked individually; intensely sweet and concentrated.' where name = 'Trockenbeerenauslese (TBA)';
update type_designations set description = '"Ice wine" — made from grapes frozen naturally on the vine and pressed while frozen, concentrating sugar and acidity into a vivid, sweet wine.' where name = 'Eiswein';

-- Quality Classification
update type_designations set description = 'Germany''s top dry-wine designation under the VDP classification — a dry wine from a classified Grosse Lage (grand cru) vineyard.' where name = 'Grosses Gewächs (GG)';
update type_designations set description = 'VDP designation for a classified premier-cru-level vineyard site, one tier below Grosse Lage.' where name = 'Erste Lage';
update type_designations set description = 'Alternate short form of Erste Lage — a VDP premier-cru-level vineyard classification.' where name = '1. Lage';
update type_designations set description = 'The top tier of vineyard classification in regions such as Burgundy and Alsace, denoting the most highly regarded sites.' where name = 'Grand Cru';
update type_designations set description = '"First growth" vineyard tier, ranking just below Grand Cru in Burgundy and Champagne classifications.' where name = 'Premier Cru';
update type_designations set description = 'A wine from an officially classified estate under one of Bordeaux''s classification systems (e.g. the 1855 Classification, Saint-Émilion''s classification).' where name = 'Grand Cru Classé';
update type_designations set description = 'The highest rank within Saint-Émilion''s classification, awarded to a small number of top estates.' where name = 'Premier Grand Cru Classé';
update type_designations set description = 'A quality classification for Médoc estates ranked just outside the 1855 Classification.' where name = 'Cru Bourgeois';
update type_designations set description = 'A classification for small, traditionally-run Médoc estates, below Cru Bourgeois in the regional hierarchy.' where name = 'Cru Artisan';
update type_designations set description = 'The top tier within the Cru Bourgeois classification, awarded to a small number of outstanding estates.' where name = 'Cru Exceptionnel';
update type_designations set description = 'VDP entry-level tier — an estate''s basic regional wine.' where name = 'Gutswein';
update type_designations set description = 'VDP village-level tier, from a single village or commune, above Gutswein and below Erste/Grosse Lage.' where name = 'Ortswein';
update type_designations set description = 'The ripest, richest tier in Austria''s Wachau classification — named for a green lizard, denoting fully ripe, higher-alcohol dry wines.' where name = 'Smaragd';
update type_designations set description = 'The middle ripeness tier in the Wachau''s classification, between Steinfeder and Smaragd — medium-bodied dry wines.' where name = 'Federspiel';
update type_designations set description = 'The lightest ripeness tier in the Wachau''s classification — light, fresh, lower-alcohol dry wines.' where name = 'Steinfeder';

-- Aging Classification
update type_designations set description = 'A Spanish wine aged a minimum period (commonly 2 years, with time in oak for reds) before release — the youngest official aging tier.' where name = 'Crianza';
update type_designations set description = 'A Spanish wine aged longer than Crianza (commonly around 3 years for reds, with at least a year in oak) — a mid-tier aging classification.' where name = 'Reserva';
update type_designations set description = 'Spain''s longest official aging tier — wines aged for extended periods (often 5+ years, with substantial oak and bottle age) from exceptional vintages.' where name = 'Gran Reserva';
update type_designations set description = 'Italy''s equivalent aging classification — a wine aged longer than the regular version of its appellation, requirements varying by DOC/DOCG.' where name = 'Riserva';
update type_designations set description = 'An Italian designation for wines meeting stricter requirements (often higher minimum alcohol or extra aging) than the base version of the appellation.' where name = 'Superiore';
update type_designations set description = '"Late harvest" — an Alsace designation for wines made from very ripe, late-picked grapes, ranging from off-dry to sweet.' where name = 'Vendange Tardive';
update type_designations set description = 'Alsace''s top sweetness designation — wines from individually selected, botrytis-affected berries, intensely sweet and rare.' where name = 'Sélection de Grains Nobles';
update type_designations set description = 'A single-vintage Port aged longer in barrel than a standard Vintage Port before bottling, making it ready to drink sooner.' where name = 'Late Bottled Vintage (LBV)';
update type_designations set description = 'Port from a single exceptional year, bottled young after about two years in barrel and built to age for decades in bottle.' where name = 'Vintage Port';
update type_designations set description = 'A single-vintage Tawny Port aged for years in barrel — labeled with its harvest year — before release.' where name = 'Colheita';
update type_designations set description = 'Italy''s young, fresh, fruity wine style released the same year as harvest — the Italian equivalent of Beaujolais Nouveau.' where name = 'Novello';

-- Sparkling Dosage (increasing sweetness)
update type_designations set description = 'The driest sparkling wine style — no dosage (added sugar) at all, or under 3 g/L residual sugar.' where name = 'Brut Nature';
update type_designations set description = 'A very dry sparkling wine style, with 0–6 g/L residual sugar.' where name = 'Extra Brut';
update type_designations set description = 'The most common dry sparkling wine style, with up to 12 g/L residual sugar.' where name = 'Brut';
update type_designations set description = 'Despite the name, slightly sweeter than Brut — 12–17 g/L residual sugar.' where name = 'Extra Dry';
update type_designations set description = '"Dry" in name only — a medium-sweet sparkling style with 17–32 g/L residual sugar.' where name = 'Sec';
update type_designations set description = 'A noticeably sweet sparkling wine style, with 32–50 g/L residual sugar.' where name = 'Demi-Sec';
update type_designations set description = 'The sweetest sparkling wine style, with over 50 g/L residual sugar.' where name = 'Doux';

-- Fortified Style (Sherry + Port styles)
update type_designations set description = 'A light, dry, biologically aged Sherry made under a protective layer of flor yeast — pale and delicately tangy.' where name = 'Fino';
update type_designations set description = 'A Fino-style Sherry aged specifically in Sanlúcar de Barrameda, prized for its distinctive salty, briny edge.' where name = 'Manzanilla';
update type_designations set description = 'A Sherry that starts aging under flor like a Fino, then continues oxidatively after the flor dies — nutty and amber-colored.' where name = 'Amontillado';
update type_designations set description = 'A fully oxidatively aged Sherry with no flor influence — rich, nutty, and deep amber to mahogany in color.' where name = 'Oloroso';
update type_designations set description = 'A rare Sherry style that starts like an Amontillado but develops the richness of an Oloroso — combining freshness with depth.' where name = 'Palo Cortado';
update type_designations set description = 'An intensely sweet, dark Sherry made from sun-dried Pedro Ximénez grapes — thick, raisiny, and syrupy.' where name = 'Pedro Ximénez';
update type_designations set description = 'A youthful Port style, aged briefly in tank or large barrel to preserve bright, fruity character.' where name = 'Ruby';
update type_designations set description = 'A Port aged oxidatively in barrel for years, developing nutty, dried-fruit character and a tawny-brown color.' where name = 'Tawny';

-- Sweetness (German/Austrian dryness scale)
update type_designations set description = '"Dry" — a wine with very low residual sugar, at most a few grams per liter.' where name = 'Trocken';
update type_designations set description = '"Off-dry" / "half-dry" — a wine with noticeably more residual sugar than Trocken but still relatively dry.' where name = 'Halbtrocken';
update type_designations set description = 'An unofficial but common term for a style between Halbtrocken and sweeter, slightly fruity wines — not legally defined but widely used.' where name = 'Feinherb';
