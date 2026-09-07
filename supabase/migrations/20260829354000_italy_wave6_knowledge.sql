-- Wave 6 knowledge: full Details on the 8 regions + 17 subregions, and
-- articles/grape/style chips on the 28 appellations.
begin;

-- Region + subregion Details (full: climate + soils).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.marche','The Marche, on the central Adriatic between the Apennines and the sea, is best known for Verdicchio — Italy''s finest native white, from Jesi and Matelica — and for Montepulciano/Sangiovese reds (Conero, Rosso Piceno) in the south.','Verdicchio (whites); Montepulciano, Sangiovese (reds); Pecorino, Passerina.','Structured Verdicchio whites; Montepulciano-based reds; Pecorino/Passerina whites.','Continental inland, moderated by the Adriatic on the coast; cool nights in the hills.','Calcareous clay and marine-sediment marls in the hills; sandier near the coast.',array['Verdicchio — Italy''s finest native white','Jesi & Matelica whites','Conero & Rosso Piceno reds','Adriatic hills']::text[]),
  ('italy.lazio','Lazio, the region of Rome, is dominated by white wine from the volcanic Castelli Romani hills (Frascati) and the lakes of the north (Est! Est!! Est!!!), with the red Cesanese del Piglio its one DOCG.','Malvasia, Trebbiano (whites); Cesanese (red).','Fresh volcanic whites; Cesanese reds.','Mediterranean; warmer on the coast, cooler on the volcanic hills.','Volcanic tuff and ash (Castelli Romani, Vulsini); limestone in the Ciociaria.',array['The wines of Rome','Volcanic-hill whites (Frascati)','Cesanese del Piglio — the one red DOCG','Lakes of the north']::text[]),
  ('italy.sardegna','Sardinia is a wine world of its own, shaped by island and Spanish heritage: the red Cannonau (Grenache) and Carignano, the white Vermentino of Gallura, and the singular flor-aged Vernaccia di Oristano.','Cannonau, Carignano, Monica (reds); Vermentino, Vernaccia, Nuragus, Nasco (whites).','Warm reds; crisp Vermentino; oxidative Vernaccia.','Hot, dry, windy Mediterranean, tempered by the sea and by altitude inland.','Granite (Gallura), limestone, and coastal sand (Sulcis).',array['An island wine world','Cannonau (Grenache) & Carignano reds','Vermentino di Gallura — its DOCG','Flor-aged Vernaccia di Oristano']::text[]),
  ('italy.liguria','Liguria is a narrow arc of steep coast between mountains and sea, making tiny quantities of characterful wine: the Cinque Terre and Colli di Luni whites of the east, and Pigato, Vermentino and the red Rossese of the west.','Vermentino, Pigato, Bosco, Albarola (whites); Rossese (red).','Saline coastal whites; the sweet Sciacchetrà; Rossese reds.','Mild, maritime Mediterranean on steep, sun-facing terraces.','Schist, sandstone and terraced hillsides.',array['A narrow coastal arc','Cinque Terre & Colli di Luni whites','Pigato & Rossese in the west','Steep terraced vineyards']::text[]),
  ('italy.calabria','Calabria, the toe of Italy, is an ancient, mountainous wine region: its calling card is Cirò, the Gaglioppo red of the Ionian coast, with the rare sweet Greco di Bianco in the far south.','Gaglioppo, Magliocco (reds); Greco Bianco, Mantonico (whites).','Gaglioppo reds; sweet Greco di Bianco.','Hot Mediterranean coast, cooled by the Sila and Aspromonte mountains inland.','Clay, sand and granite; alluvial coastal flats.',array['The toe of Italy','Cirò — its calling card','Gaglioppo grape','Rare sweet Greco di Bianco']::text[]),
  ('italy.basilicata','Basilicata is a small, mountainous southern region defined by one great wine: Aglianico del Vulture, the structured red grown on the volcanic slopes of the extinct Monte Vulture.','Aglianico (red).','Structured, age-worthy Aglianico reds.','Continental and high, with hot days and cold nights on the Vulture slopes.','Volcanic ash and tuff over clay (Monte Vulture).',array['Defined by one great wine','Aglianico del Vulture','Volcanic Monte Vulture','Structured, age-worthy reds']::text[]),
  ('italy.valle-d-aosta','Valle d''Aosta, Italy''s smallest region, is an alpine valley of tiny high-altitude vineyards: the ungrafted Prié Blanc of Morgex at Europe''s roof, Nebbiolo (Donnas) in the lower valley, and native reds around Aosta.','Prié Blanc, Petite Arvine (whites); Nebbiolo (Picotendro), Petit Rouge (reds).','Alpine whites and sparkling; mountain Nebbiolo reds.','Alpine-continental; steep, sun-trapping slopes and cool nights.','Glacial moraine, sand and rock.',array['Italy''s smallest region','Europe''s highest vineyards (Morgex)','Nebbiolo in the lower valley','Alpine native grapes']::text[]),
  ('italy.molise','Molise, a tiny region between Abruzzo and Puglia, is best known for its rediscovered native red Tintilia and for the Biferno reds and whites of the Adriatic hills.','Tintilia, Montepulciano, Aglianico (reds); Trebbiano, Falanghina (whites).','Tintilia and Montepulciano reds; Biferno reds and whites.','Continental inland, Adriatic-moderated on the coast.','Clay and limestone hills; alluvial river valleys.',array['Italy''s second-smallest region','Native Tintilia rediscovered','Biferno reds & whites','Between Abruzzo and Puglia']::text[]),
  -- Subregions
  ('italy.marche.castelli-di-jesi','The Castelli di Jesi — the hills of fortified towns around Jesi in the Esino valley, the largest and most famous Verdicchio zone.','Verdicchio','Structured, age-worthy Verdicchio','Continental hills, Adriatic-influenced.','Calcareous clay and marl.',array['The heart of Verdicchio','Fortified hill towns around Jesi','Esino valley','Verdicchio whites']::text[]),
  ('italy.marche.matelica','Matelica — a high inland Marche valley running north-south (against the Apennine grain), giving a firmer, more mineral Verdicchio than Jesi.','Verdicchio','Firm, mineral Verdicchio','Cool, continental, no maritime influence.','Marine-sediment marls and limestone.',array['High inland valley','Firmer, mineral Verdicchio','Runs N–S against the grain','Rare and prized']::text[]),
  ('italy.marche.piceno','The Piceno — the southern Marche around Ascoli and Fermo: Montepulciano/Sangiovese reds (Rosso Piceno) and the Pecorino/Passerina whites of Offida.','Montepulciano, Sangiovese; Pecorino, Passerina','Reds; Pecorino/Passerina whites','Adriatic-moderated hills.','Clay, sand and limestone.',array['Southern Marche (Ascoli/Fermo)','Rosso Piceno reds','Offida whites','Pecorino & Passerina']::text[]),
  ('italy.lazio.castelli-romani','The Castelli Romani — the volcanic Alban Hills south-east of Rome, the city''s historic wine garden: fresh Malvasia/Trebbiano whites (Frascati, Marino).','Malvasia, Trebbiano','Fresh whites; the sweet Cannellino','Warm volcanic hills near the sea.','Volcanic tuff and ash.',array['Rome''s wine garden','Volcanic Alban Hills','Frascati & Marino','Fresh whites']::text[]),
  ('italy.lazio.ciociaria','The Ciociaria — the Frosinone hinterland of southern Lazio, home of Cesanese, the region''s leading native red (Cesanese del Piglio).','Cesanese','Cesanese reds','Continental inland hills.','Limestone and clay.',array['Southern Lazio (Frosinone)','Home of Cesanese','Cesanese del Piglio DOCG','Spicy reds']::text[]),
  ('italy.lazio.alta-tuscia','The Alta Tuscia — the volcanic lake country of northern Lazio (Viterbo), on the Vulsini slopes around Lake Bolsena: home of Est! Est!! Est!!!.','Trebbiano, Malvasia','Fresh volcanic whites','Continental, lake-moderated.','Volcanic tuff.',array['Northern Lazio (Viterbo)','Lake Bolsena & the Vulsini','Est! Est!! Est!!!','Volcanic whites']::text[]),
  ('italy.sardegna.gallura','Gallura — the granite north-east of Sardinia, the island''s premier white zone: Vermentino di Gallura, its only DOCG, grown on decomposed granite.','Vermentino','Aromatic, saline Vermentino','Windy, maritime, warm.','Decomposed granite (sabbione).',array['Granite NE Sardinia','Vermentino di Gallura DOCG','Decomposed-granite soils','The island''s top white zone']::text[]),
  ('italy.sardegna.sulcis','Sulcis — the south-west corner of Sardinia and its islands (Sant''Antioco, San Pietro): old-vine Carignano on sandy coastal soils.','Carignano','Full, warm Carignano reds and rosati','Hot, dry, windy coast.','Sand over clay.',array['SW Sardinia & its islands','Old-vine Carignano','Sandy coastal soils','Warm, supple reds']::text[]),
  ('italy.sardegna.oristano','Oristano — the Tirso plain of central-western Sardinia, home of the flor-aged Vernaccia di Oristano.','Vernaccia di Oristano','Oxidative, sherry-like Vernaccia','Warm coastal plain.','Alluvial sand and clay.',array['Central-west Sardinia','The Tirso plain','Vernaccia di Oristano','Flor-aged oxidative white']::text[]),
  ('italy.liguria.riviera-di-ponente','The Riviera di Ponente — western Liguria towards France (Imperia, Savona): the aromatic whites Pigato and Vermentino and the perfumed red Rossese of Dolceacqua.','Pigato, Vermentino; Rossese','Aromatic whites; Rossese reds','Mild maritime, sun-facing terraces.','Clay, schist and limestone.',array['Western Liguria (Imperia/Savona)','Pigato & Vermentino whites','Rossese di Dolceacqua','Towards the French border']::text[]),
  ('italy.liguria.riviera-di-levante','The Riviera di Levante — eastern Liguria (La Spezia): the terraced Cinque Terre whites and their sweet Sciacchetrà, and the Vermentino of Colli di Luni.','Bosco, Albarola, Vermentino','Saline whites; Sciacchetrà','Maritime, steep coastal terraces.','Sandstone and schist.',array['Eastern Liguria (La Spezia)','Cinque Terre & Colli di Luni','Sweet Sciacchetrà','Steep sea terraces']::text[]),
  ('italy.calabria.ionio-crotonese','Cirò and the Crotonese — the Ionian coast and hills of Crotone, Calabria''s most famous zone: the ancient Gaglioppo red of Cirò.','Gaglioppo, Greco','Gaglioppo reds; Greco whites','Hot Ionian coast, cooled inland.','Clay and sand over marine terraces.',array['Ionian coast of Crotone','Cirò','Ancient Gaglioppo red','Calabria''s most famous zone']::text[]),
  ('italy.calabria.locride','The Locride — the southern Ionian coast of Reggio Calabria around Locri and Bianco: home of the rare sweet Greco di Bianco.','Greco','Sweet passito Greco di Bianco','Hot, dry Ionian coast.','Sandy coastal hills.',array['Southern Ionian coast','Locri & Bianco','Sweet Greco di Bianco','Sun-dried grapes']::text[]),
  ('italy.basilicata.vulture','The Vulture — the slopes of the extinct volcano Monte Vulture in northern Basilicata (Potenza), the home of Aglianico del Vulture.','Aglianico','Structured, age-worthy Aglianico','High, continental, big diurnal swings.','Volcanic ash and tuff.',array['Extinct volcano Monte Vulture','Northern Basilicata (Potenza)','Aglianico del Vulture','Volcanic slopes']::text[]),
  ('italy.valle-d-aosta.valdigne','The Valdigne — the upper Valle d''Aosta below Mont Blanc, home to Europe''s highest vineyards: the ungrafted Prié Blanc of Blanc de Morgex et de La Salle.','Prié Blanc','Taut alpine whites and sparkling','High alpine; short, intense season.','Glacial sand and moraine.',array['Upper valley below Mont Blanc','Europe''s highest vineyards','Ungrafted Prié Blanc','Blanc de Morgex']::text[]),
  ('italy.valle-d-aosta.basse-vallee','The Basse Vallée — the lower Valle d''Aosta towards Piedmont: warmer, Nebbiolo (Picotendro) country, home of Donnas.','Nebbiolo','Mountain Nebbiolo reds','Milder alpine, sheltered.','Moraine and sand.',array['Lower valley towards Piedmont','Nebbiolo (Picotendro)','Home of Donnas','Warmer, sheltered']::text[]),
  ('italy.molise.basso-molise','The Basso Molise — the lower Biferno valley and the Adriatic hills of Campobasso: the region''s main wine district, home of Biferno.','Montepulciano, Aglianico, Trebbiano','Biferno reds, whites and rosati','Adriatic-moderated hills.','Clay and alluvium.',array['Lower Biferno valley','Adriatic hills of Campobasso','Home of Biferno','Molise''s main district']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Appellation articles (climate/soils null).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, null, null, v.kf, 'PUBLISHED'
from (values
  ('italy.marche.verdicchio-dei-castelli-di-jesi','Verdicchio dei Castelli di Jesi — the Marche''s flagship white, from Verdicchio across the hills around Jesi: fresh and saline young, nutty and honeyed with age; the Riserva is a DOCG.','Verdicchio','Saline, age-worthy white',array['The Marche''s signature white','Verdicchio around Jesi','Fresh to nutty with age','Riserva = DOCG']::text[]),
  ('italy.marche.verdicchio-di-matelica','Verdicchio di Matelica — a firmer, more mineral Verdicchio from a high inland valley, rarer than Jesi; the Riserva is a DOCG.','Verdicchio','Firm, mineral white',array['Inland high-valley Verdicchio','Firmer & more mineral than Jesi','Rare','Riserva = DOCG']::text[]),
  ('italy.marche.conero','Conero — the DOCG red of Monte Conero south of Ancona, from Montepulciano: structured, dark-fruited reds off the coastal limestone headland.','Montepulciano','Structured red',array['DOCG red of Monte Conero','Montepulciano-based','Coastal limestone headland','Ages well']::text[]),
  ('italy.marche.rosso-piceno','Rosso Piceno — the Marche''s region-wide red, a Montepulciano–Sangiovese blend from across the hills; the Superiore comes from the Ascoli hinterland.','Montepulciano, Sangiovese','Montepulciano–Sangiovese red',array['The Marche''s everyday red','Montepulciano + Sangiovese','Region-wide; Superiore near Ascoli','Juicy to structured']::text[]),
  ('italy.marche.offida','Offida — the southern-Marche DOCG for the whites Pecorino and Passerina and a Montepulciano red, on the Ascoli hills.','Pecorino, Passerina','Pecorino/Passerina whites, Montepulciano red',array['DOCG of the Ascoli hills','Pecorino & Passerina whites','Also a Montepulciano red','Southern Marche']::text[]),
  ('italy.lazio.frascati','Frascati — Rome''s classic white from the volcanic Castelli Romani, a Malvasia/Trebbiano blend; fresh and dry, with a sweet Cannellino (both DOCG at Superiore level).','Malvasia, Trebbiano','Fresh white; sweet Cannellino',array['Rome''s classic white','Volcanic Castelli Romani','Malvasia + Trebbiano','Superiore/Cannellino = DOCG']::text[]),
  ('italy.lazio.marino','Marino — a neighbour of Frascati in the Alban Hills, a similar fresh Malvasia/Trebbiano white long associated with Rome.','Malvasia, Trebbiano','Fresh volcanic white',array['Alban Hills near Rome','Malvasia + Trebbiano','Fresh, dry white','Frascati''s neighbour']::text[]),
  ('italy.lazio.cesanese-del-piglio','Cesanese del Piglio — Lazio''s only red DOCG, from Cesanese on the Ciociaria hills south-east of Rome: spicy, warm, medium-bodied reds.','Cesanese','Spicy Cesanese red',array['Lazio''s only red DOCG','Cesanese grape','Ciociaria hills (Frosinone)','Spicy, warm reds']::text[]),
  ('italy.lazio.est-est-est-di-montefiascone','Est! Est!! Est!!! di Montefiascone — the famous-named white of Lake Bolsena in northern Lazio, a Trebbiano/Malvasia blend from the volcanic Vulsini.','Trebbiano, Malvasia','Fresh volcanic white',array['The legendary-named white','Lake Bolsena (Viterbo)','Trebbiano + Malvasia','Volcanic Vulsini hills']::text[]),
  ('italy.sardegna.vermentino-di-gallura','Vermentino di Gallura — Sardinia''s only DOCG, from Vermentino on the decomposed granite of the Gallura: aromatic, saline, textured whites.','Vermentino','Aromatic, saline white',array['Sardinia''s only DOCG','Granite hills of Gallura','Aromatic & saline','The island''s benchmark white']::text[]),
  ('italy.sardegna.carignano-del-sulcis','Carignano del Sulcis — old-vine Carignano on the sandy south-west coast and islands of Sardinia: warm, supple, dark-fruited reds and rosati.','Carignano','Supple Carignano reds and rosati',array['Sandy Sulcis coast & islands','Old-vine Carignano','Warm, supple reds','Also rosato & passito']::text[]),
  ('italy.sardegna.vernaccia-di-oristano','Vernaccia di Oristano — a singular Sardinian white aged oxidatively under flor near Oristano, dry and nutty like a fino sherry.','Vernaccia di Oristano','Oxidative, flor-aged white',array['Flor-aged, oxidative white','Near Oristano (Tirso plain)','Dry, nutty, sherry-like','A one-of-a-kind Italian wine']::text[]),
  ('italy.sardegna.cannonau-di-sardegna','Cannonau di Sardegna — the island-wide red from Cannonau (Grenache), Sardinia''s signature grape: warm, herbal, full-bodied reds, at their best in Nuoro and Ogliastra.','Cannonau','Warm, herbal red',array['Sardinia''s signature red','Cannonau = Grenache','Island-wide DOC','Warm, herbal, full-bodied']::text[]),
  ('italy.sardegna.vermentino-di-sardegna','Vermentino di Sardegna — the island-wide white DOC from Vermentino: fresh, easy, citrus-and-sea whites across Sardinia.','Vermentino','Fresh, citrusy white',array['Island-wide Vermentino DOC','Fresh, easy, citrusy','Everyday island white','Sea-breeze salinity']::text[]),
  ('italy.liguria.rossese-di-dolceacqua','Rossese di Dolceacqua — the perfumed red of the far-western Ligurian Riviera, from Rossese on steep terraces near the French border: light, fragrant, mineral.','Rossese','Perfumed, light red',array['Far-western Riviera (Imperia)','Rossese grape','Light, fragrant, mineral','Terraces near France']::text[]),
  ('italy.liguria.riviera-ligure-di-ponente','Riviera Ligure di Ponente — the region-wide western-Liguria DOC for the aromatic whites Pigato and Vermentino (plus Rossese and Ormeasco reds).','Pigato, Vermentino','Aromatic Pigato/Vermentino whites',array['Western Liguria (Imperia/Savona)','Pigato & Vermentino whites','Savoury, herbal','Also Rossese/Ormeasco reds']::text[]),
  ('italy.liguria.cinque-terre','Cinque Terre — the dramatic terraced vineyards above five villages on the eastern-Ligurian coast: dry Bosco/Albarola/Vermentino whites and the prized sweet Sciacchetrà.','Bosco, Albarola','Dry white; sweet Sciacchetrà',array['Terraced coastal vineyards','Bosco/Albarola/Vermentino','Dry whites','Sweet Sciacchetrà passito']::text[]),
  ('italy.liguria.colli-di-luni','Colli di Luni — the Magra valley straddling eastern Liguria and Tuscany: crisp, structured Vermentino whites and some Sangiovese-based reds.','Vermentino','Structured Vermentino white',array['Magra valley (La Spezia)','Vermentino-led whites','Also Sangiovese reds','Ligurian–Tuscan border']::text[]),
  ('italy.calabria.ciro','Cirò — Calabria''s most famous wine, from Gaglioppo on the Ionian coast of Crotone: pale but firm, savoury, tannic reds (also a Greco white and a rosato).','Gaglioppo','Savoury Gaglioppo red',array['Calabria''s calling card','Gaglioppo grape','Ionian coast (Crotone)','One of Italy''s oldest wines']::text[]),
  ('italy.calabria.greco-di-bianco','Greco di Bianco — a rare, honeyed sweet passito white from sun-dried Greco Bianco grapes at Bianco on Calabria''s southern Ionian tip.','Greco','Honeyed sweet passito',array['Rare sweet passito','Greco Bianco grape','Bianco (Reggio Calabria)','Sun-dried grapes']::text[]),
  ('italy.calabria.savuto','Savuto — a historic red DOC of the Savuto valley in western Calabria (Cosenza/Catanzaro), a Gaglioppo-led blend.','Gaglioppo','Gaglioppo-led red',array['Historic Calabrian red','Savuto valley','Gaglioppo-based blend','Cosenza/Catanzaro']::text[]),
  ('italy.basilicata.aglianico-del-vulture','Aglianico del Vulture — Basilicata''s great red, from Aglianico on the volcanic slopes of Monte Vulture: structured, mineral, age-worthy (the Superiore is a DOCG).','Aglianico','Structured, mineral red',array['Basilicata''s great red','Volcanic Monte Vulture','Aglianico grape','Superiore = DOCG']::text[]),
  ('italy.basilicata.matera','Matera — a broad DOC across the Matera province of eastern Basilicata: Primitivo and Sangiovese-based reds and some whites.','Sangiovese','Reds and whites',array['Broad DOC (Matera province)','Primitivo & Sangiovese reds','Eastern Basilicata','Also whites & spumante']::text[]),
  ('italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle','Blanc de Morgex et de La Salle — from the ungrafted native Prié Blanc at Morgex below Mont Blanc, among Europe''s highest vineyards: taut, high-acid alpine whites and sparkling.','Prié Blanc','Taut alpine white and sparkling',array['Europe''s highest vineyards','Ungrafted Prié Blanc','Below Mont Blanc','Taut whites & sparkling']::text[]),
  ('italy.valle-d-aosta.donnas','Donnas — the Nebbiolo (Picotendro) red of the lower Valle d''Aosta, an alpine cousin of Piedmont''s Nebbiolo: lighter, fragrant mountain reds.','Nebbiolo','Alpine Nebbiolo red',array['Alpine Nebbiolo (Picotendro)','Lower Valle d''Aosta','Light, fragrant reds','Cousin of Barolo''s grape']::text[]),
  ('italy.valle-d-aosta.valle-d-aosta-doc','Valle d''Aosta (Vallée d''Aoste) — the region-wide DOC spanning the whole alpine valley, with named subzones (Torrette, Chambave, Nus, Enfer d''Arvier, Arnad-Montjovet) and many native grapes.','Petit Rouge, Nebbiolo, Prié Blanc','Alpine reds and whites',array['Region-wide alpine DOC','Many named subzones','Native reds & whites','One valley, many wines']::text[]),
  ('italy.molise.biferno','Biferno — Molise''s principal DOC, from the Adriatic hills of Campobasso: Montepulciano/Aglianico reds, Trebbiano whites and rosati.','Montepulciano','Reds, whites and rosati',array['Molise''s principal DOC','Campobasso hills','Montepulciano/Aglianico reds','Also whites & rosati']::text[]),
  ('italy.molise.tintilia-del-molise','Tintilia del Molise — from the rediscovered native Tintilia: deeply coloured, spicy, structured reds and rosati, Molise''s signature wine.','Tintilia','Spicy Tintilia red',array['Molise''s signature native','Tintilia grape','Deep, spicy, structured','Reds and rosati']::text[])
) as v(ck, descr, gv, styles, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Verdicchio','italy.marche.verdicchio-dei-castelli-di-jesi'),
  ('Verdicchio','italy.marche.verdicchio-di-matelica'),
  ('Montepulciano','italy.marche.conero'),
  ('Montepulciano','italy.marche.rosso-piceno'),('Sangiovese','italy.marche.rosso-piceno'),
  ('Pecorino','italy.marche.offida'),('Passerina','italy.marche.offida'),
  ('Malvasia','italy.lazio.frascati'),('Trebbiano','italy.lazio.frascati'),
  ('Malvasia','italy.lazio.marino'),('Trebbiano','italy.lazio.marino'),
  ('Cesanese','italy.lazio.cesanese-del-piglio'),
  ('Trebbiano','italy.lazio.est-est-est-di-montefiascone'),('Malvasia','italy.lazio.est-est-est-di-montefiascone'),
  ('Vermentino','italy.sardegna.vermentino-di-gallura'),
  ('Carignano','italy.sardegna.carignano-del-sulcis'),
  ('Vernaccia di Oristano','italy.sardegna.vernaccia-di-oristano'),
  ('Cannonau','italy.sardegna.cannonau-di-sardegna'),
  ('Vermentino','italy.sardegna.vermentino-di-sardegna'),
  ('Rossese','italy.liguria.rossese-di-dolceacqua'),
  ('Pigato','italy.liguria.riviera-ligure-di-ponente'),('Vermentino','italy.liguria.riviera-ligure-di-ponente'),
  ('Bosco','italy.liguria.cinque-terre'),('Albarola','italy.liguria.cinque-terre'),
  ('Vermentino','italy.liguria.colli-di-luni'),
  ('Gaglioppo','italy.calabria.ciro'),
  ('Greco','italy.calabria.greco-di-bianco'),
  ('Gaglioppo','italy.calabria.savuto'),
  ('Aglianico','italy.basilicata.aglianico-del-vulture'),
  ('Sangiovese','italy.basilicata.matera'),
  ('Prié Blanc','italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle'),
  ('Nebbiolo','italy.valle-d-aosta.donnas'),
  ('Montepulciano','italy.molise.biferno'),
  ('Tintilia','italy.molise.tintilia-del-molise')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.marche.verdicchio-dei-castelli-di-jesi','WHITE',0),('italy.marche.verdicchio-dei-castelli-di-jesi','SPARKLING',1),
  ('italy.marche.verdicchio-di-matelica','WHITE',0),
  ('italy.marche.conero','RED',0),
  ('italy.marche.rosso-piceno','RED',0),
  ('italy.marche.offida','WHITE',0),('italy.marche.offida','RED',1),
  ('italy.lazio.frascati','WHITE',0),('italy.lazio.frascati','SWEET',1),
  ('italy.lazio.marino','WHITE',0),
  ('italy.lazio.cesanese-del-piglio','RED',0),
  ('italy.lazio.est-est-est-di-montefiascone','WHITE',0),
  ('italy.sardegna.vermentino-di-gallura','WHITE',0),
  ('italy.sardegna.carignano-del-sulcis','RED',0),('italy.sardegna.carignano-del-sulcis','ROSE',1),
  ('italy.sardegna.vernaccia-di-oristano','WHITE',0),('italy.sardegna.vernaccia-di-oristano','FORTIFIED',1),
  ('italy.sardegna.cannonau-di-sardegna','RED',0),('italy.sardegna.cannonau-di-sardegna','ROSE',1),
  ('italy.sardegna.vermentino-di-sardegna','WHITE',0),
  ('italy.liguria.rossese-di-dolceacqua','RED',0),
  ('italy.liguria.riviera-ligure-di-ponente','WHITE',0),
  ('italy.liguria.cinque-terre','WHITE',0),('italy.liguria.cinque-terre','SWEET',1),
  ('italy.liguria.colli-di-luni','WHITE',0),('italy.liguria.colli-di-luni','RED',1),
  ('italy.calabria.ciro','RED',0),('italy.calabria.ciro','WHITE',1),
  ('italy.calabria.greco-di-bianco','SWEET',0),
  ('italy.calabria.savuto','RED',0),
  ('italy.basilicata.aglianico-del-vulture','RED',0),
  ('italy.basilicata.matera','RED',0),
  ('italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle','WHITE',0),('italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle','SPARKLING',1),
  ('italy.valle-d-aosta.donnas','RED',0),
  ('italy.valle-d-aosta.valle-d-aosta-doc','RED',0),('italy.valle-d-aosta.valle-d-aosta-doc','WHITE',1),
  ('italy.molise.biferno','RED',0),
  ('italy.molise.tintilia-del-molise','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
    where p.canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)(\.|$)' and x.editorial_status='PUBLISHED';
  if a <> 53 then raise exception 'expected 53 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id
    where p.canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)\.' and x.editorial_status='PUBLISHED';
  if gr <> 34 then raise exception 'expected 34 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id
    where p.canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)\.' and x.editorial_status='PUBLISHED';
  if sl <> 39 then raise exception 'expected 39 style links, got %', sl; end if;
end $$;

commit;
