-- Starter reference data drawn from the scoring rules' own examples plus other
-- common wine categories. Hosts can add more via the "add new option" flow.

insert into countries (name) values
  ('France'), ('Italy'), ('Spain'), ('Germany'), ('Portugal'), ('Austria'),
  ('USA'), ('Australia'), ('New Zealand'), ('South Africa'), ('Argentina'),
  ('Chile'), ('Hungary'), ('Greece');

insert into regions (country_id, name)
select c.id, r.name
from countries c
join (values
  ('France', 'Bordeaux'), ('France', 'Bourgogne'), ('France', 'Rhône'),
  ('France', 'Loire'), ('France', 'Alsace'), ('France', 'Champagne'),
  ('France', 'Languedoc-Roussillon'), ('France', 'Provence'), ('France', 'Jura'),
  ('Italy', 'Piemonte'), ('Italy', 'Toscana'), ('Italy', 'Veneto'),
  ('Italy', 'Sicilia'), ('Italy', 'Campania'), ('Italy', 'Puglia'),
  ('Spain', 'Rioja'), ('Spain', 'Ribera del Duero'), ('Spain', 'Priorat'),
  ('Spain', 'Rías Baixas'), ('Spain', 'Jerez'),
  ('Germany', 'Mosel'), ('Germany', 'Rheingau'), ('Germany', 'Pfalz'),
  ('Germany', 'Nahe'), ('Germany', 'Rheinhessen'),
  ('Portugal', 'Douro'), ('Portugal', 'Vinho Verde'), ('Portugal', 'Alentejo'),
  ('Portugal', 'Dão'), ('Portugal', 'Bairrada'),
  ('Austria', 'Wachau'), ('Austria', 'Kamptal'), ('Austria', 'Kremstal'),
  ('Austria', 'Burgenland'),
  ('USA', 'California'), ('USA', 'Oregon'), ('USA', 'Washington'), ('USA', 'New York'),
  ('Australia', 'South Australia'), ('Australia', 'Victoria'),
  ('Australia', 'Western Australia'), ('Australia', 'New South Wales'), ('Australia', 'Tasmania'),
  ('New Zealand', 'Marlborough'), ('New Zealand', 'Central Otago'), ('New Zealand', 'Hawke''s Bay'),
  ('South Africa', 'Western Cape'), ('South Africa', 'Stellenbosch'),
  ('Argentina', 'Mendoza'), ('Argentina', 'Salta'),
  ('Chile', 'Maipo Valley'), ('Chile', 'Casablanca Valley'), ('Chile', 'Colchagua Valley'),
  ('Hungary', 'Tokaj'),
  ('Greece', 'Santorini'), ('Greece', 'Nemea')
) as r(country, name) on r.country = c.name;

insert into appellations (region_id, name)
select rg.id, a.name
from regions rg
join (values
  ('Bordeaux', 'Pauillac'), ('Bordeaux', 'Pomerol'), ('Bordeaux', 'Margaux'),
  ('Bordeaux', 'Saint-Émilion'), ('Bordeaux', 'Médoc'),
  ('Bordeaux', 'Pessac-Léognan'), ('Bordeaux', 'Sauternes'),
  ('Bourgogne', 'Chablis'), ('Bourgogne', 'Gevrey-Chambertin'),
  ('Bourgogne', 'Vosne-Romanée'), ('Bourgogne', 'Meursault'), ('Bourgogne', 'Pouilly-Fuissé'),
  ('Rhône', 'Châteauneuf-du-Pape'), ('Rhône', 'Côte-Rôtie'),
  ('Rhône', 'Hermitage'), ('Rhône', 'Condrieu'),
  ('Loire', 'Sancerre'), ('Loire', 'Pouilly-Fumé'), ('Loire', 'Vouvray'),
  ('Loire', 'Chinon'), ('Loire', 'Muscadet'),
  ('Piemonte', 'DOCG Barolo'), ('Piemonte', 'DOCG Barbaresco'),
  ('Piemonte', 'DOC Barbera d''Alba'), ('Piemonte', 'DOC Barbera d''Asti'),
  ('Piemonte', 'DOCG Roero'), ('Piemonte', 'DOCG Gavi'),
  ('Toscana', 'DOCG Chianti Classico'), ('Toscana', 'DOCG Brunello di Montalcino'),
  ('Toscana', 'IGT Bolgheri'), ('Toscana', 'DOCG Vino Nobile di Montepulciano'),
  ('Veneto', 'DOCG Amarone della Valpolicella'), ('Veneto', 'DOC Soave'),
  ('Veneto', 'DOC Valpolicella'),
  ('Rioja', 'Rioja Alta'), ('Rioja', 'Rioja Alavesa'), ('Rioja', 'Rioja Oriental'),
  ('California', 'Napa Valley'), ('California', 'Sonoma'), ('California', 'Russian River Valley'),
  ('Oregon', 'Willamette Valley'),
  ('Washington', 'Columbia Valley'),
  ('South Australia', 'Barossa Valley'), ('South Australia', 'McLaren Vale'),
  ('South Australia', 'Clare Valley'), ('South Australia', 'Coonawarra'),
  ('Western Australia', 'Margaret River'),
  ('Victoria', 'Yarra Valley'),
  ('Mendoza', 'Luján de Cuyo'), ('Mendoza', 'Uco Valley'),
  ('Tokaj', 'Tokaji')
) as a(region, name) on a.region = rg.name;

insert into grapes (name) values
  ('Cabernet Sauvignon'), ('Merlot'), ('Cabernet Franc'), ('Petit Verdot'),
  ('Malbec'), ('Pinot Noir'), ('Chardonnay'), ('Sauvignon Blanc'), ('Riesling'),
  ('Syrah'), ('Grenache'), ('Mourvèdre'), ('Sangiovese'), ('Nebbiolo'),
  ('Barbera'), ('Tempranillo'), ('Garnacha'), ('Chenin Blanc'), ('Semillon'),
  ('Viognier'), ('Gewürztraminer'), ('Pinot Gris'), ('Zinfandel'),
  ('Grüner Veltliner'), ('Furmint'), ('Assyrtiko'), ('Nero d''Avola'),
  ('Touriga Nacional'), ('Albariño'), ('Verdejo'), ('Muscat'), ('Gamay'),
  ('Carignan'), ('Cinsault'), ('Mencía'), ('Corvina'), ('Glera'), ('Silvaner');

insert into type_designations (name) values
  ('Kabinett'), ('Feinherb'), ('Spätlese'), ('Auslese'), ('Beerenauslese (BA)'),
  ('Trockenbeerenauslese (TBA)'), ('1. Lage'), ('Grosses Gewächs (GG)'),
  ('Riserva'), ('Gran Reserva'), ('Reserva'), ('Crianza'), ('Grand Cru'), ('Premier Cru');
