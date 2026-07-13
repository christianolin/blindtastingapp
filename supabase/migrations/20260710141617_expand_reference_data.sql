-- Expands reference data (appellations + producers, plus a handful of
-- missing grapes/type designations) well beyond the original starter seed.
-- LWIN itself is Liv-ex's licensed/proprietary database, not something this
-- migration can query directly — this instead covers the same real-world
-- facts LWIN organizes its records around (official AOC/DOCG/AVA/GI
-- appellations and internationally recognized producers), prioritizing the
-- classic fine-wine regions the app is themed around.
--
-- Every insert is idempotent (ON CONFLICT DO NOTHING) since some of this data
-- already exists from earlier manual testing.

-- ============================================================================
-- Appellations
-- ============================================================================

insert into appellations (region_id, name)
select rg.id, a.name
from regions rg
join (values
  -- Bordeaux
  ('Bordeaux', 'Saint-Estèphe'), ('Bordeaux', 'Saint-Julien'),
  ('Bordeaux', 'Haut-Médoc'), ('Bordeaux', 'Listrac-Médoc'),
  ('Bordeaux', 'Moulis-en-Médoc'), ('Bordeaux', 'Graves'),
  ('Bordeaux', 'Fronsac'), ('Bordeaux', 'Lalande-de-Pomerol'),
  ('Bordeaux', 'Canon-Fronsac'), ('Bordeaux', 'Barsac'),
  ('Bordeaux', 'Cadillac'), ('Bordeaux', 'Loupiac'),
  ('Bordeaux', 'Entre-Deux-Mers'), ('Bordeaux', 'Côtes de Bourg'),
  ('Bordeaux', 'Blaye Côtes de Bordeaux'), ('Bordeaux', 'Saint-Émilion Grand Cru'),
  -- Bourgogne (Grand Crus, village AOCs, Chablis tiers)
  ('Bourgogne', 'Chambertin'), ('Bourgogne', 'Chambertin-Clos de Bèze'),
  ('Bourgogne', 'Romanée-Conti'), ('Bourgogne', 'La Tâche'),
  ('Bourgogne', 'Richebourg'), ('Bourgogne', 'Romanée-Saint-Vivant'),
  ('Bourgogne', 'La Romanée'), ('Bourgogne', 'Échezeaux'),
  ('Bourgogne', 'Grands Échezeaux'), ('Bourgogne', 'Clos de Vougeot'),
  ('Bourgogne', 'Clos de la Roche'), ('Bourgogne', 'Clos Saint-Denis'),
  ('Bourgogne', 'Clos de Tart'), ('Bourgogne', 'Musigny'),
  ('Bourgogne', 'Bonnes-Mares'), ('Bourgogne', 'Corton'),
  ('Bourgogne', 'Corton-Charlemagne'), ('Bourgogne', 'Montrachet'),
  ('Bourgogne', 'Chevalier-Montrachet'), ('Bourgogne', 'Bâtard-Montrachet'),
  ('Bourgogne', 'Bienvenues-Bâtard-Montrachet'), ('Bourgogne', 'Criots-Bâtard-Montrachet'),
  ('Bourgogne', 'Chambolle-Musigny'), ('Bourgogne', 'Morey-Saint-Denis'),
  ('Bourgogne', 'Vougeot'), ('Bourgogne', 'Nuits-Saint-Georges'),
  ('Bourgogne', 'Aloxe-Corton'), ('Bourgogne', 'Pommard'),
  ('Bourgogne', 'Volnay'), ('Bourgogne', 'Puligny-Montrachet'),
  ('Bourgogne', 'Chassagne-Montrachet'), ('Bourgogne', 'Santenay'),
  ('Bourgogne', 'Mercurey'), ('Bourgogne', 'Givry'),
  ('Bourgogne', 'Rully'), ('Bourgogne', 'Montagny'),
  ('Bourgogne', 'Saint-Véran'), ('Bourgogne', 'Chablis Grand Cru'),
  ('Bourgogne', 'Chablis Premier Cru'), ('Bourgogne', 'Marsannay'),
  ('Bourgogne', 'Fixin'),
  -- Champagne, Alsace
  ('Champagne', 'Champagne AOC'),
  ('Alsace', 'Alsace Grand Cru'), ('Alsace', 'Alsace Grand Cru Schlossberg'),
  ('Alsace', 'Alsace Grand Cru Rangen'),
  -- Rhône
  ('Rhône', 'Gigondas'), ('Rhône', 'Vacqueyras'), ('Rhône', 'Cornas'),
  ('Rhône', 'Saint-Joseph'), ('Rhône', 'Crozes-Hermitage'),
  ('Rhône', 'Vinsobres'), ('Rhône', 'Lirac'), ('Rhône', 'Tavel'),
  -- Loire, Jura, Languedoc-Roussillon, Provence
  ('Loire', 'Savennières'), ('Loire', 'Bourgueil'),
  ('Loire', 'Saumur-Champigny'), ('Loire', 'Quarts de Chaume'),
  ('Jura', 'Château-Chalon'), ('Jura', 'Arbois'),
  ('Languedoc-Roussillon', 'Minervois'), ('Languedoc-Roussillon', 'Corbières'),
  ('Languedoc-Roussillon', 'Faugères'),
  ('Provence', 'Bandol'), ('Provence', 'Côtes de Provence'),
  -- Piemonte, Toscana, Veneto, Campania, Puglia, Sicilia
  ('Piemonte', 'DOC Langhe'), ('Piemonte', 'DOCG Dolcetto di Dogliani'),
  ('Piemonte', 'DOCG Ghemme'), ('Piemonte', 'DOCG Gattinara'),
  ('Toscana', 'DOCG Chianti'), ('Toscana', 'DOC Bolgheri Sassicaia'),
  ('Toscana', 'DOCG Carmignano'),
  ('Veneto', 'DOC Bardolino'), ('Veneto', 'DOCG Recioto della Valpolicella'),
  ('Campania', 'DOCG Taurasi'), ('Campania', 'DOCG Fiano di Avellino'),
  ('Campania', 'DOCG Greco di Tufo'),
  ('Puglia', 'DOC Primitivo di Manduria'),
  ('Sicilia', 'DOC Etna'), ('Sicilia', 'DOCG Cerasuolo di Vittoria'),
  -- Spain
  ('Ribera del Duero', 'Ribera del Duero DO'),
  ('Priorat', 'Priorat DOQ'),
  ('Rías Baixas', 'Rías Baixas DO'),
  ('Jerez', 'Jerez-Xérès-Sherry'),
  -- Germany
  ('Mosel', 'Wehlener Sonnenuhr'), ('Mosel', 'Scharzhofberg'),
  ('Mosel', 'Bernkasteler Doctor'),
  ('Rheingau', 'Schloss Johannisberg'), ('Rheingau', 'Marcobrunn'),
  ('Rheinhessen', 'Niersteiner Pettenthal'),
  ('Nahe', 'Niederhäuser Hermannshöhle'),
  ('Pfalz', 'Forster Jesuitengarten'),
  -- Austria
  ('Wachau', 'Wachau DAC'), ('Wachau', 'Singerriedel'),
  ('Kamptal', 'Kamptal DAC'), ('Kamptal', 'Heiligenstein'),
  ('Kremstal', 'Kremstal DAC'),
  ('Burgenland', 'Ruster Ausbruch'),
  -- Portugal
  ('Douro', 'Douro DOC'), ('Vinho Verde', 'Vinho Verde DOC'),
  ('Dão', 'Dão DOC'), ('Bairrada', 'Bairrada DOC'),
  ('Alentejo', 'Alentejo DOC'),
  -- USA
  ('California', 'Oakville'), ('California', 'Rutherford'),
  ('California', 'Stags Leap District'), ('California', 'Howell Mountain'),
  ('California', 'Spring Mountain District'),
  ('Oregon', 'Dundee Hills'), ('Oregon', 'Ribbon Ridge'),
  ('Washington', 'Walla Walla Valley'), ('Washington', 'Red Mountain'),
  ('New York', 'Finger Lakes'),
  -- Australia
  ('South Australia', 'Eden Valley'),
  ('Victoria', 'Heathcote'), ('Victoria', 'Mornington Peninsula'),
  ('Tasmania', 'Coal River Valley'),
  ('New South Wales', 'Hunter Valley'),
  -- New Zealand
  ('Marlborough', 'Marlborough'), ('Central Otago', 'Central Otago'),
  ('Hawke''s Bay', 'Gimblett Gravels'),
  -- South Africa
  ('Stellenbosch', 'Stellenbosch'), ('Stellenbosch', 'Simonsberg-Stellenbosch'),
  ('Western Cape', 'Constantia'), ('Western Cape', 'Swartland'),
  -- Argentina, Chile, Greece
  ('Salta', 'Cafayate'),
  ('Maipo Valley', 'Alto Maipo'), ('Casablanca Valley', 'Casablanca Valley'),
  ('Colchagua Valley', 'Apalta'),
  ('Santorini', 'Santorini PDO'), ('Nemea', 'Nemea PDO')
) as a(region, name) on a.region = rg.name
on conflict (region_id, name) do nothing;

-- ============================================================================
-- Producers
-- ============================================================================

insert into producers (name) values
  -- Bordeaux
  ('Château Lafite Rothschild'), ('Château Latour'), ('Château Haut-Brion'),
  ('Château Mouton Rothschild'), ('Château Pétrus'), ('Château Cheval Blanc'),
  ('Château Ausone'), ('Le Pin'), ('Château Angélus'),
  ('Château Léoville-Las-Cases'), ('Château Palmer'),
  ('Château Pichon Longueville Baron'), ('Château Pichon Longueville Comtesse de Lalande'),
  ('Château Ducru-Beaucaillou'), ('Château Cos d''Estournel'), ('Château Montrose'),
  ('Château Lynch-Bages'), ('Château d''Yquem'), ('Château Rieussec'),
  ('Château Climens'), ('Château Figeac'), ('Château Canon'),
  ('Château La Mission Haut-Brion'), ('Château Smith Haut Lafitte'),
  ('Domaine de Chevalier'),
  -- Bourgogne
  ('Domaine de la Romanée-Conti'), ('Domaine Armand Rousseau'), ('Domaine Leroy'),
  ('Domaine Comte Georges de Vogüé'), ('Domaine Jacques-Frédéric Mugnier'),
  ('Domaine Georges Roumier'), ('Domaine Coche-Dury'), ('Domaine Leflaive'),
  ('Domaine Ramonet'), ('Domaine Bonneau du Martray'), ('Domaine Méo-Camuzet'),
  ('Domaine Dujac'), ('Maison Louis Jadot'), ('Maison Joseph Drouhin'),
  ('Domaine Ponsot'), ('Domaine Faiveley'), ('Domaine Anne Gros'),
  ('Domaine Sylvain Cathiard'), ('Maison Bouchard Père & Fils'),
  -- Champagne
  ('Krug'), ('Dom Pérignon'), ('Bollinger'), ('Louis Roederer'), ('Salon'),
  ('Pol Roger'), ('Taittinger'), ('Veuve Clicquot'), ('Ruinart'),
  ('Philipponnat'), ('Jacques Selosse'), ('Pierre Péters'), ('Egly-Ouriet'),
  ('Armand de Brignac'),
  -- Rhône
  ('E. Guigal'), ('M. Chapoutier'), ('Paul Jaboulet Aîné'),
  ('Jean-Louis Chave'), ('Château de Beaucastel'), ('Château Rayas'),
  ('Domaine Auguste Clape'),
  -- Piemonte
  ('Bruno Giacosa'), ('Giacomo Conterno'), ('Roberto Voerzio'), ('Vietti'),
  ('Marchesi di Barolo'), ('Pio Cesare'), ('Ceretto'), ('Aldo Conterno'),
  ('Elio Altare'), ('Produttori del Barbaresco'), ('Marcarini'),
  -- Toscana / Veneto
  ('Tenuta San Guido'), ('Biondi-Santi'), ('Antinori'), ('Tenuta dell''Ornellaia'),
  ('Casanova di Neri'), ('Poggio di Sotto'), ('Avignonesi'),
  ('Giuseppe Quintarelli'), ('Dal Forno Romano'), ('Allegrini'), ('Masi'),
  -- Spain
  ('Vega Sicilia'), ('Dominio de Pingus'), ('Marqués de Murrieta'),
  ('La Rioja Alta'), ('R. López de Heredia'), ('CVNE'), ('Muga'), ('Artadi'),
  ('Álvaro Palacios'), ('Clos Mogador'),
  -- Germany / Austria
  ('Egon Müller'), ('Dönnhoff'), ('J.J. Prüm'), ('Fritz Haag'), ('Robert Weil'),
  ('Schloss Johannisberg'), ('F.X. Pichler'), ('Domäne Wachau'), ('Bründlmayer'),
  -- Portugal
  ('Taylor''s'), ('Fonseca'), ('Graham''s'), ('Niepoort'), ('Quinta do Noval'),
  -- USA
  ('Screaming Eagle'), ('Harlan Estate'), ('Opus One'), ('Ridge Vineyards'),
  ('Caymus Vineyards'), ('Shafer Vineyards'), ('Dominus Estate'),
  ('Scarecrow'), ('Colgin Cellars'), ('Domaine Serene'),
  ('Chateau Ste. Michelle'), ('Leonetti Cellar'),
  -- Australia / New Zealand / South Africa / Argentina / Greece
  ('Penfolds'), ('Henschke'), ('Torbreck'), ('Cullen Wines'),
  ('Cloudy Bay'), ('Felton Road'),
  ('Kanonkop'), ('Sadie Family Wines'),
  ('Catena Zapata'), ('Achaval-Ferrer'),
  ('Domaine Sigalas'), ('Gaia Wines')
on conflict (name) do nothing;

-- ============================================================================
-- A few missing grapes needed by the appellations/producers above
-- ============================================================================

insert into grapes (name) values
  ('Pinot Meunier'), ('Marsanne'), ('Roussanne'), ('Picpoul'), ('Counoise'),
  ('Trebbiano'), ('Vermentino'), ('Touriga Franca'), ('Tinta Roriz'),
  ('Xinomavro'), ('Moscato'), ('Cortese'), ('Arneis'), ('Dolcetto'),
  ('Aglianico'), ('Primitivo'), ('Fiano'), ('Greco')
on conflict (name) do nothing;

-- ============================================================================
-- A few missing type designations
-- ============================================================================

insert into type_designations (name) values
  ('Vendange Tardive'), ('Sélection de Grains Nobles'),
  ('Grand Cru Classé'), ('Cru Bourgeois')
on conflict (name) do nothing;
