-- Spain knowledge, wave 1: the country node + all 11 comunidad REGION nodes get
-- a rich profile (description, climate, soils, key_facts) plus structured grape
-- and wine-style links. These nodes are already publication_status = VERIFIED,
-- so PUBLISHED content renders immediately in the map details panel. Mirrors the
-- Italian *_knowledge.sql pattern (insert ... from (values …) join on
-- canonical_key; grape/style links guarded with where-not-exists; fail-closed
-- count assertions). Written in-session (no API), per the AGENTS.md cost mandate.

begin;

-- 1. Articles (country + comunidades) --------------------------------------
insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, v.facts, 'PUBLISHED'
from (values
  ('spain',
   'Spain has more land under vine than any country on earth, and a diversity to match — from the Atlantic-cooled whites of Galicia to the sun-baked fortified wines of Andalucía, by way of Tempranillo''s noble homes along the Duero and Ebro. More than seventy DO/DOP zones and two "calificada" appellations (Rioja and Priorat) sit alongside a wealth of old, dry-farmed bush-vines and a modern revival that has remade regions like Priorat and Bierzo.',
   'Everything from cool, wet Atlantic in the north-west to hot, arid continental on the central Meseta and Mediterranean warmth on the east coast; high altitude tempers the heat across much of the interior.',
   'Hugely varied — limestone and clay on the Duero, slate (llicorella) in Priorat, chalky albariza in Jerez, granite and schist in Galicia, alluvial terraces along the Ebro.',
   array['Largest vineyard area of any country','Two DOCa/DOQ: Rioja & Priorat','Tempranillo & Garnacha are the signature reds','Home of Sherry, Cava and old-vine Garnacha']),

  ('spain.castilla-y-leon',
   'The high northern plateau either side of the river Duero is Spain''s red-wine heartland. Tempranillo — here called Tinta del País or Tinto Fino — makes powerful, structured reds in Ribera del Duero and Toro, while Verdejo gives crisp, aromatic whites in Rueda. Altitude of 700–900 m and fierce continental swings define the wines.',
   'Harsh continental: cold winters, hot days and cold nights in summer. The wide diurnal range preserves acidity, colour and aroma.',
   'Limestone and clay over sand-and-gravel terraces along the Duero and its tributaries.',
   array['Ribera del Duero & Toro: powerful Tempranillo','Rueda: Spain''s benchmark Verdejo whites','High altitude, big day–night temperature swings','Old dry-farmed bush-vines of Tinta de Toro']),

  ('spain.castilla-la-mancha',
   'The vast central Meseta south of Madrid is the largest continuous vineyard on the planet. Long the source of Spain''s bulk wine and brandy from the hardy white Airén, it now also turns out great-value reds from Tempranillo (locally Cencibel) and characterful old-vine bottlings from Bobal and Garnacha.',
   'Extreme continental: baking, dry summers and cold winters on a high, flat plateau (~600–700 m); very low rainfall.',
   'Deep red clay and limestone over chalky subsoil.',
   array['World''s largest vineyard area','Airén (whites/brandy) & Tempranillo/Cencibel','La Mancha & Valdepeñas: value reds','Warm, dry, high-plateau continental climate']),

  ('spain.aragon',
   'Straddling the Ebro basin and the foothills of the Iberian System, Aragón is old-vine Garnacha country. Calatayud, Campo de Borja and Cariñena grow gnarled bush-vines on slate and stone that give deep, generous reds, while cooler, Pyrenees-fed Somontano adds fresher reds, whites and international varieties.',
   'Continental with strong Mediterranean influence; hot, dry summers cooled by altitude and the cierzo, a cold north-west wind.',
   'Stony slate, slate-clay and limestone; poor, well-drained soils ideal for low-yielding Garnacha.',
   array['Old-vine Garnacha heartland','Campo de Borja, Calatayud, Cariñena','Somontano: cooler, more varietal','The cierzo wind keeps vines healthy']),

  ('spain.andalucia',
   'The sun-drenched south is the home of Spain''s great fortified wines. On the chalk-white albariza of Jerez, Palomino is transformed by flor and the solera into Sherry — from bone-dry Fino and Manzanilla to nutty Amontillado and Oloroso — while Málaga, Montilla-Moriles and Condado de Huelva add lusciously sweet Pedro Ximénez and Moscatel.',
   'Hot Mediterranean/Atlantic; the cool, humid poniente breeze off the ocean is vital for the flor that shapes Fino and Manzanilla.',
   'Brilliant-white albariza — a chalky, moisture-retaining marl — around Jerez; slate and schist in the Málaga hills.',
   array['Home of Sherry (Jerez–Xérès–Sherry)','Flor, the solera and biological ageing','Palomino, Pedro Ximénez, Moscatel','Málaga & Montilla: sweet fortified wines']),

  ('spain.murcia',
   'A hot, arid corner of the Levante that has become the world reference for Monastrell. In Jumilla, Yecla and Bullas the thick-skinned, drought-loving variety yields dark, dense, warming reds and juicy rosados from bush-vines that survived phylloxera on their own roots.',
   'Hot, dry Mediterranean-continental; very low rainfall and intense sunshine, moderated by altitude in the higher sites.',
   'Limestone with sandy topsoils, poor and free-draining.',
   array['World capital of Monastrell (Mourvèdre)','Jumilla, Yecla, Bullas','Old, ungrafted, dry-farmed bush-vines','Dark, powerful, high-alcohol reds']),

  ('spain.cataluna',
   'From the Mediterranean coast to the mountainous interior, Catalonia spans one of Spain''s most varied wine cultures. Penedès is the engine of Cava, Spain''s traditional-method sparkler from Macabeu, Xarel·lo and Parellada; nearby Priorat and Montsant make profound old-vine reds from Garnacha and Cariñena on slate; and cooler zones like Empordà and Conca de Barberà add their own character.',
   'Mediterranean on the coast, growing more continental and cooler with altitude inland (Priorat, Conca de Barberà).',
   'Slate (llicorella) in Priorat/Montsant; limestone, clay and sandy soils across the Penedès and coastal zones.',
   array['Cava: traditional-method sparkling','Priorat DOQ: cult old-vine slate reds','Xarel·lo, Macabeu, Parellada whites','Diverse: coast to mountain']),

  ('spain.galicia',
   'Green, Atlantic "Green Spain" in the wet north-west makes some of the country''s finest whites. Salt-tinged, aromatic Albariño from Rías Baixas is the star, joined by mineral Godello and Treixadura and, in the steep river valleys of Ribeira Sacra and Valdeorras, perfumed reds from Mencía.',
   'Cool, wet, maritime Atlantic — mild temperatures, high rainfall and humidity; pergola training helps air circulation.',
   'Granite, sand and slate; steep, terraced schist along the Sil and Miño rivers.',
   array['Albariño (Rías Baixas): saline Atlantic whites','Godello & Treixadura whites','Mencía reds (Ribeira Sacra, Valdeorras)','Cool, wet, maritime climate']),

  ('spain.valencia',
   'The Mediterranean Levante blends value and tradition. Utiel-Requena''s high plateau is the homeland of Bobal, giving deeply coloured reds and rosados; Valencia and Alicante add Monastrell reds and the region''s famous sweet, grapey Moscatel.',
   'Warm Mediterranean on the coast, cooler and more continental on the interior plateaus (Utiel-Requena, ~700 m).',
   'Limestone and clay with sandy topsoils.',
   array['Bobal heartland (Utiel-Requena)','Monastrell reds','Sweet Moscatel de Valencia','Coast-to-plateau climate range']),

  ('spain.navarra',
   'North of the Ebro and neighbour to Rioja, Navarra is famous for vivid Garnacha rosados and increasingly for its reds — Tempranillo and Garnacha alongside well-adapted Cabernet, Merlot and Chardonnay. A run from Pyrenean foothills to the warm south gives real diversity.',
   'Transitional: Atlantic and mountain influence in the north, warmer and drier towards the Ebro in the south.',
   'Clay-limestone, alluvial and stony soils.',
   array['Renowned Garnacha rosados','Tempranillo & Garnacha reds','Successful international varieties','North–south climatic range']),

  ('spain.extremadura',
   'A warm, wide region on the Portuguese border whose vineyards cluster in Ribera del Guadiana. Across six sub-zones it produces approachable, well-priced reds and whites from a broad palette — Tempranillo and Garnacha alongside native whites and international grapes.',
   'Hot, dry continental-Mediterranean with long sunshine hours and mild winters.',
   'Alluvial, sandy and clay-limestone soils along the Guadiana.',
   array['Ribera del Guadiana (six sub-zones)','Warm, sunny, dry climate','Tempranillo & Garnacha reds','Great-value everyday wines']),

  ('spain.la-rioja',
   'In the upper Ebro valley, La Rioja is Spain''s most celebrated wine region and one of only two with "calificada" (DOCa) status. Tempranillo-led blends, matured in oak and released as Crianza, Reserva and Gran Reserva, set the classic Spanish red style; fresh and barrel-aged Viura whites and rosados complete the picture across the Alta, Alavesa and Oriental zones.',
   'Continental moderated by the sheltering Sierra de Cantabria, with an Atlantic-to-Mediterranean gradient from Rioja Alta to Rioja Oriental.',
   'Calcareous clay, ferrous clay and alluvial terraces along the Ebro.',
   array['Spain''s benchmark red region','DOCa — the highest Spanish tier','Tempranillo, American-oak ageing tradition','Crianza / Reserva / Gran Reserva'])
) as v(key, descr, climate, soils, facts)
join wine_places p on p.canonical_key = v.key;

-- 2. Grape links (principal varieties per comunidad) -----------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Tempranillo','spain'),('Garnacha','spain'),
  ('Tempranillo','spain.castilla-y-leon'),('Verdejo','spain.castilla-y-leon'),('Prieto Picudo','spain.castilla-y-leon'),
  ('Airén','spain.castilla-la-mancha'),('Tempranillo','spain.castilla-la-mancha'),('Bobal','spain.castilla-la-mancha'),
  ('Garnacha','spain.aragon'),('Cariñena','spain.aragon'),('Garnacha Blanca','spain.aragon'),
  ('Palomino','spain.andalucia'),('Pedro Ximénez','spain.andalucia'),('Moscatel','spain.andalucia'),
  ('Monastrell','spain.murcia'),
  ('Garnacha','spain.cataluna'),('Cariñena','spain.cataluna'),('Xarel·lo','spain.cataluna'),('Macabeu','spain.cataluna'),('Parellada','spain.cataluna'),
  ('Albariño','spain.galicia'),('Godello','spain.galicia'),('Treixadura','spain.galicia'),('Mencía','spain.galicia'),
  ('Bobal','spain.valencia'),('Monastrell','spain.valencia'),('Moscatel','spain.valencia'),
  ('Garnacha','spain.navarra'),('Tempranillo','spain.navarra'),
  ('Tempranillo','spain.extremadura'),('Garnacha','spain.extremadura'),
  ('Tempranillo','spain.la-rioja'),('Garnacha','spain.la-rioja'),('Graciano','spain.la-rioja'),('Viura','spain.la-rioja')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- 3. Style links -----------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain','RED',0),('spain','WHITE',1),('spain','ROSE',2),('spain','SPARKLING',3),('spain','FORTIFIED',4),
  ('spain.castilla-y-leon','RED',0),('spain.castilla-y-leon','WHITE',1),('spain.castilla-y-leon','ROSE',2),
  ('spain.castilla-la-mancha','RED',0),('spain.castilla-la-mancha','WHITE',1),('spain.castilla-la-mancha','ROSE',2),
  ('spain.aragon','RED',0),('spain.aragon','ROSE',1),('spain.aragon','WHITE',2),
  ('spain.andalucia','FORTIFIED',0),('spain.andalucia','WHITE',1),('spain.andalucia','SWEET',2),
  ('spain.murcia','RED',0),('spain.murcia','ROSE',1),
  ('spain.cataluna','RED',0),('spain.cataluna','WHITE',1),('spain.cataluna','SPARKLING',2),('spain.cataluna','ROSE',3),
  ('spain.galicia','WHITE',0),('spain.galicia','RED',1),
  ('spain.valencia','RED',0),('spain.valencia','WHITE',1),('spain.valencia','SWEET',2),
  ('spain.navarra','ROSE',0),('spain.navarra','RED',1),('spain.navarra','WHITE',2),
  ('spain.extremadura','RED',0),('spain.extremadura','WHITE',1),
  ('spain.la-rioja','RED',0),('spain.la-rioja','WHITE',1),('spain.la-rioja','ROSE',2)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (
  select 1 from wine_place_styles ws
  where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null
);

-- 4. Fail-closed assertions ------------------------------------------------
do $$
declare a int; g int; s int;
begin
  select count(*) into a from wine_place_articles x
    join wine_places p on p.id = x.wine_place_id
   where p.canonical_key like 'spain%' and x.editorial_status = 'PUBLISHED';
  if a <> 12 then raise exception 'expected 12 Spain articles, got %', a; end if;

  select count(*) into g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'spain%' and wg.editorial_status = 'PUBLISHED';
  if g < 34 then raise exception 'expected >=34 Spain grape links, got %', g; end if;

  select count(*) into s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'spain%' and ws.editorial_status = 'PUBLISHED';
  if s < 34 then raise exception 'expected >=34 Spain style links, got %', s; end if;
end $$;

commit;
