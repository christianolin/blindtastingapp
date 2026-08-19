-- Spain knowledge, wave 2: every live DO/DOP (34) plus the three Rioja subzones
-- gets a description + key_facts, and the notable ones get structured grape and
-- style links. All these places are publication_status = VERIFIED (promoted by
-- run-spain-dos.mjs), so PUBLISHED content renders in the details panel. Climate
-- and soils are carried by the parent comunidad article (wave 1); DO articles
-- focus on grape, style and character. Written in-session (no API).

begin;

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  -- Castilla y León
  ('spain.castilla-y-leon.rueda',
   'Castilla y León''s white-wine capital, where high, stony vineyards give crisp, aromatic Verdejo — grassy, citrus and fennel-scented — often joined by Sauvignon Blanc. A dramatic modern success built on altitude and cold nights.',
   array['Spain''s benchmark Verdejo','High, stony, continental','Crisp, aromatic whites']),
  ('spain.castilla-y-leon.toro',
   'Big, brooding reds from Tinta de Toro, the local Tempranillo, grown on sandy soils where many old vines are ungrafted. Warm days and poor soils concentrate the fruit into powerful, full-bodied wines.',
   array['Tinta de Toro (Tempranillo)','Old ungrafted bush-vines','Powerful, full-bodied reds']),
  ('spain.castilla-y-leon.cigales',
   'Historically rosado country north of Valladolid along the Pisuerga, Cigales now makes serious Tempranillo reds too, though fresh, vivid pinks remain its calling card.',
   array['Traditional Tempranillo rosados','Serious reds on the rise','Pisuerga valley']),
  ('spain.castilla-y-leon.arribes',
   'A wild, remote zone in the Duero gorges on the Portuguese border, championing the native red Juan García alongside Rufete and Tempranillo on steep granitic terraces.',
   array['Native Juan García reds','Steep Duero-canyon terraces','Remote border country']),
  ('spain.castilla-y-leon.ribera-del-duero',
   'Spain''s most prestigious red alongside Rioja — muscular, age-worthy Tempranillo (Tinto Fino / Tinta del País) from high, continental vineyards on the Duero, home to many of the country''s legendary estates.',
   array['Prestige Tempranillo reds','High altitude (~750–900 m)','Concentrated & age-worthy']),
  ('spain.castilla-y-leon.tierra-de-leon',
   'A cool north-westerly zone on the León plains reviving the native Prieto Picudo — deeply coloured, fresh reds and lively rosados.',
   array['Native Prieto Picudo','Fresh reds & rosados','Cool north-west León']),
  ('spain.castilla-y-leon.cebreros',
   'High-altitude old-vine Garnacha in the granite Sierra de Gredos west of Madrid, giving perfumed, mineral, elegant reds — a star of the acclaimed Gredos revival.',
   array['Old-vine Garnacha','Granite, high Gredos altitude','Perfumed, elegant reds']),

  -- Castilla-La Mancha
  ('spain.castilla-la-mancha.la-mancha',
   'The vast heart of the Meseta and the world''s largest DO — huge volumes of value wine, from neutral Airén whites to increasingly good Tempranillo (Cencibel) reds.',
   array['World''s largest DO','Airén whites, Cencibel reds','Hot, dry, high plateau']),
  ('spain.castilla-la-mancha.valdepenas',
   'A warm La Mancha enclave with a long tradition of soft, oak-aged Tempranillo (Cencibel) reds offering classic Spanish flavour at friendly prices.',
   array['Soft, oak-aged Cencibel','Great-value Reservas','Warm central plateau']),
  ('spain.castilla-la-mancha.manchuela',
   'Between the Meseta and the Levante, Manchuela has rediscovered old-vine Bobal — fresh, deeply coloured reds and rosados — on limestone at altitude.',
   array['Old-vine Bobal','Limestone at altitude','Fresh reds & rosados']),
  ('spain.castilla-la-mancha.almansa',
   'A warm eastern zone known for Garnacha Tintorera (Alicante Bouschet), a red-fleshed grape giving inky, robust, deeply coloured reds.',
   array['Garnacha Tintorera','Inky, robust reds','Warm eastern La Mancha']),
  ('spain.castilla-la-mancha.ribera-del-jucar',
   'A young DO along the Júcar river making modern, fruit-driven reds chiefly from Tempranillo (Cencibel) and Bordeaux varieties on gravelly terraces.',
   array['Modern Tempranillo reds','Júcar-river gravels','Fruit-forward style']),

  -- Aragón
  ('spain.aragon.somontano',
   'Under the Pyrenees, Aragón''s coolest and most cosmopolitan zone — polished reds, whites and rosados from local grapes and well-adapted Chardonnay, Cabernet, Merlot and Gewürztraminer.',
   array['Cool Pyrenean foothills','Local + international grapes','Polished, modern styles']),
  ('spain.aragon.carinena',
   'One of Spain''s oldest wine areas, giving warm, generous Garnacha and Cariñena reds from stony, drought-stressed vineyards.',
   array['Old-vine Garnacha & Cariñena','Stony, arid soils','Warm, generous reds']),
  ('spain.aragon.calatayud',
   'High, rugged Garnacha country in the Iberian System, where ancient bush-vines on slate yield concentrated, characterful reds at remarkable value.',
   array['High-altitude old-vine Garnacha','Slate soils','Concentrated value reds']),
  ('spain.aragon.campo-de-borja',
   'The self-styled "Empire of Garnacha" under the Moncayo, producing rich, warming, well-priced Garnacha reds from old vines.',
   array['"Empire of Garnacha"','Old-vine reds','Warm, generous, great value']),

  -- Andalucía
  ('spain.andalucia.jerez',
   'The legendary home of Sherry: Palomino on chalky albariza, aged under flor and through the solera into a spectrum from bone-dry Fino and Manzanilla to nutty Amontillado, Oloroso and sweet PX.',
   array['Fino to Oloroso to PX','Flor & the solera system','Chalky albariza soils']),
  ('spain.andalucia.condado-de-huelva',
   'An Atlantic Andalucían zone west of Jerez making fortified wines and increasingly fresh young whites from the local Zalema and Palomino.',
   array['Fortified & young whites','Zalema & Palomino','Atlantic Huelva coast']),
  ('spain.andalucia.malaga',
   'Historic sweet-wine country — sun-dried Pedro Ximénez and Moscatel make dark, luscious fortified Málaga, alongside the drier reds and whites of Sierras de Málaga.',
   array['Sweet PX & Moscatel','Historic dessert wines','Sierras de Málaga table wines']),

  -- Murcia
  ('spain.murcia.jumilla',
   'Monastrell''s grandest stage — old, ungrafted bush-vines on limestone give dark, powerful, warming reds that have soared in quality and value.',
   array['Old-vine Monastrell','Ungrafted on limestone','Dark, powerful reds']),
  ('spain.murcia.bullas',
   'A cooler, higher Murcian zone where altitude lends Monastrell more freshness and perfume than the region''s norm, with rosados a speciality.',
   array['Higher-altitude Monastrell','Fresher, perfumed reds','Rosados too']),
  ('spain.murcia.yecla',
   'A single-town DO in the Monastrell heartland, giving generous, sun-filled reds from old bush-vines.',
   array['Monastrell reds','Old bush-vines','Warm, generous style']),

  -- Cataluña
  ('spain.cataluna.priorat',
   'One of only two DOCa/DOQ zones — cult, powerful reds from old-vine Garnacha and Cariñena rooted in dark llicorella slate: mineral, structured and profoundly concentrated.',
   array['DOQ — Spain''s top tier','Llicorella slate soils','Old-vine Garnacha & Cariñena']),
  ('spain.cataluna.montsant',
   'The horseshoe of hills wrapped around Priorat, offering similarly bold, better-value Garnacha- and Cariñena-based reds on slate, granite and clay.',
   array['Rings Priorat DOQ','Garnacha & Cariñena','Bold value reds']),
  ('spain.cataluna.penedes',
   'Catalonia''s versatile heartland and the engine of Cava, making everything from crisp Xarel·lo whites to reds across a coast-to-mountain span of altitudes.',
   array['Cava country','Xarel·lo, Macabeu, Parellada','Coast-to-mountain diversity']),
  ('spain.cataluna.terra-alta',
   'A remote, windswept upland in southern Catalonia and a stronghold of Garnacha Blanca — textured, characterful whites plus generous reds.',
   array['Garnacha Blanca whites','Remote southern upland','Generous reds too']),
  ('spain.cataluna.emporda',
   'On the Costa Brava under the fierce tramontana wind, Empordà makes fresh Garnacha- and Cariñena-based reds and rosados plus traditional sweet Garnatxa.',
   array['Coastal, tramontana-swept','Garnacha & Cariñena','Rosados & sweet Garnatxa']),
  ('spain.cataluna.conca-de-barbera',
   'A cool inland Catalan zone famed for delicate Trepat rosados and for growing much of the Parellada that goes into Cava.',
   array['Delicate Trepat rosados','Parellada whites','Cool inland altitude']),
  ('spain.cataluna.alella',
   'A tiny historic DO on Barcelona''s doorstep, best known for whites from Pansa Blanca (Xarel·lo) grown on distinctive sandy-granitic "sauló".',
   array['Tiny coastal DO','Pansa Blanca (Xarel·lo)','Sandy "sauló" soils']),
  ('spain.cataluna.pla-de-bages',
   'An inland zone in the Bages basin reviving the native red Picapoll and making fresh reds and whites at altitude.',
   array['Native Picapoll','Inland Bages basin','Fresh reds & whites']),

  -- Galicia / Valencia / Navarra / Extremadura
  ('spain.galicia.ribeiro',
   'One of Spain''s oldest white regions, in the granite valleys of Ourense, making fragrant blends led by Treixadura — apple, peach and white-flower freshness.',
   array['Treixadura-led whites','Granite river valleys','Historic Galician DO']),
  ('spain.valencia.utiel-requena',
   'A high plateau inland from Valencia and the homeland of Bobal — deeply coloured, fresh reds and rosados from old, dry-farmed vines.',
   array['Bobal homeland','High plateau (~700 m)','Old-vine reds & rosados']),
  ('spain.navarra.navarra',
   'Rioja''s northern neighbour, long celebrated for vivid Garnacha rosados and now for reds and whites blending native and international grapes across diverse terrain.',
   array['Famous Garnacha rosados','Tempranillo & Garnacha reds','Native + international grapes']),
  ('spain.extremadura.ribera-del-guadiana',
   'Extremadura''s principal DO, spread over six sub-zones, making approachable, sunny reds and whites at excellent value.',
   array['Six sub-zones','Warm, sunny climate','Great-value reds & whites']),

  -- La Rioja (DO + subzones)
  ('spain.la-rioja.rioja',
   'Spain''s flagship DOCa — Tempranillo-led blends with Garnacha, Graciano and Mazuelo, matured in oak and released as Crianza, Reserva and Gran Reserva, plus fresh and barrel-aged Viura whites and rosados.',
   array['DOCa — Spain''s top tier','Tempranillo-led blends','Crianza / Reserva / Gran Reserva','Three zones: Alta, Alavesa, Oriental']),
  ('spain.la-rioja.rioja.rioja-alta',
   'The cooler, higher-altitude western zone around Haro, giving structured, elegant, long-lived Tempranillo reds — the classic face of fine Rioja.',
   array['Cooler, higher western zone','Elegant, age-worthy reds','Centred on Haro']),
  ('spain.la-rioja.rioja.rioja-alavesa',
   'The Basque enclave on chalk-clay slopes north of the Ebro, prized for perfumed, finer-boned Tempranillo and youthful carbonic-maceration reds.',
   array['Basque zone on chalk-clay','Perfumed, fine Tempranillo','Also young cosecha reds']),
  ('spain.la-rioja.rioja.rioja-oriental',
   'The warmer, drier, more Mediterranean eastern zone (formerly Rioja Baja), where Garnacha thrives alongside Tempranillo for riper, more generous wines.',
   array['Warmer eastern zone','Garnacha thrives here','Riper, generous style'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

-- Grape links (signature varieties; only grapes present in the library) ------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Verdejo','spain.castilla-y-leon.rueda'),
  ('Tempranillo','spain.castilla-y-leon.toro'),
  ('Tempranillo','spain.castilla-y-leon.cigales'),
  ('Tempranillo','spain.castilla-y-leon.ribera-del-duero'),
  ('Prieto Picudo','spain.castilla-y-leon.tierra-de-leon'),
  ('Garnacha','spain.castilla-y-leon.cebreros'),
  ('Airén','spain.castilla-la-mancha.la-mancha'),('Tempranillo','spain.castilla-la-mancha.la-mancha'),
  ('Tempranillo','spain.castilla-la-mancha.valdepenas'),
  ('Bobal','spain.castilla-la-mancha.manchuela'),
  ('Tempranillo','spain.castilla-la-mancha.ribera-del-jucar'),
  ('Garnacha','spain.aragon.carinena'),('Cariñena','spain.aragon.carinena'),
  ('Garnacha','spain.aragon.calatayud'),
  ('Garnacha','spain.aragon.campo-de-borja'),
  ('Palomino','spain.andalucia.jerez'),('Pedro Ximénez','spain.andalucia.jerez'),
  ('Palomino','spain.andalucia.condado-de-huelva'),
  ('Pedro Ximénez','spain.andalucia.malaga'),('Moscatel','spain.andalucia.malaga'),
  ('Monastrell','spain.murcia.jumilla'),
  ('Monastrell','spain.murcia.bullas'),
  ('Monastrell','spain.murcia.yecla'),
  ('Garnacha','spain.cataluna.priorat'),('Cariñena','spain.cataluna.priorat'),
  ('Garnacha','spain.cataluna.montsant'),('Cariñena','spain.cataluna.montsant'),
  ('Xarel·lo','spain.cataluna.penedes'),('Macabeu','spain.cataluna.penedes'),('Parellada','spain.cataluna.penedes'),
  ('Garnacha Blanca','spain.cataluna.terra-alta'),
  ('Garnacha','spain.cataluna.emporda'),('Cariñena','spain.cataluna.emporda'),
  ('Trepat','spain.cataluna.conca-de-barbera'),('Parellada','spain.cataluna.conca-de-barbera'),
  ('Xarel·lo','spain.cataluna.alella'),
  ('Treixadura','spain.galicia.ribeiro'),
  ('Bobal','spain.valencia.utiel-requena'),
  ('Garnacha','spain.navarra.navarra'),('Tempranillo','spain.navarra.navarra'),
  ('Tempranillo','spain.extremadura.ribera-del-guadiana'),
  ('Tempranillo','spain.la-rioja.rioja'),('Garnacha','spain.la-rioja.rioja'),('Graciano','spain.la-rioja.rioja'),('Viura','spain.la-rioja.rioja'),
  ('Tempranillo','spain.la-rioja.rioja.rioja-alta'),
  ('Tempranillo','spain.la-rioja.rioja.rioja-alavesa'),
  ('Garnacha','spain.la-rioja.rioja.rioja-oriental'),('Tempranillo','spain.la-rioja.rioja.rioja-oriental')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links --------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.castilla-y-leon.rueda','WHITE',0),
  ('spain.castilla-y-leon.toro','RED',0),
  ('spain.castilla-y-leon.cigales','ROSE',0),('spain.castilla-y-leon.cigales','RED',1),
  ('spain.castilla-y-leon.arribes','RED',0),
  ('spain.castilla-y-leon.ribera-del-duero','RED',0),
  ('spain.castilla-y-leon.tierra-de-leon','RED',0),('spain.castilla-y-leon.tierra-de-leon','ROSE',1),
  ('spain.castilla-y-leon.cebreros','RED',0),
  ('spain.castilla-la-mancha.la-mancha','RED',0),('spain.castilla-la-mancha.la-mancha','WHITE',1),
  ('spain.castilla-la-mancha.valdepenas','RED',0),
  ('spain.castilla-la-mancha.manchuela','RED',0),('spain.castilla-la-mancha.manchuela','ROSE',1),
  ('spain.castilla-la-mancha.almansa','RED',0),
  ('spain.castilla-la-mancha.ribera-del-jucar','RED',0),
  ('spain.aragon.somontano','RED',0),('spain.aragon.somontano','WHITE',1),
  ('spain.aragon.carinena','RED',0),
  ('spain.aragon.calatayud','RED',0),
  ('spain.aragon.campo-de-borja','RED',0),
  ('spain.andalucia.jerez','FORTIFIED',0),
  ('spain.andalucia.condado-de-huelva','FORTIFIED',0),('spain.andalucia.condado-de-huelva','WHITE',1),
  ('spain.andalucia.malaga','SWEET',0),('spain.andalucia.malaga','FORTIFIED',1),
  ('spain.murcia.jumilla','RED',0),
  ('spain.murcia.bullas','RED',0),('spain.murcia.bullas','ROSE',1),
  ('spain.murcia.yecla','RED',0),
  ('spain.cataluna.priorat','RED',0),
  ('spain.cataluna.montsant','RED',0),
  ('spain.cataluna.penedes','SPARKLING',0),('spain.cataluna.penedes','WHITE',1),('spain.cataluna.penedes','RED',2),
  ('spain.cataluna.terra-alta','WHITE',0),('spain.cataluna.terra-alta','RED',1),
  ('spain.cataluna.emporda','RED',0),('spain.cataluna.emporda','ROSE',1),
  ('spain.cataluna.conca-de-barbera','ROSE',0),('spain.cataluna.conca-de-barbera','WHITE',1),
  ('spain.cataluna.alella','WHITE',0),
  ('spain.cataluna.pla-de-bages','RED',0),('spain.cataluna.pla-de-bages','WHITE',1),
  ('spain.galicia.ribeiro','WHITE',0),
  ('spain.valencia.utiel-requena','RED',0),('spain.valencia.utiel-requena','ROSE',1),
  ('spain.navarra.navarra','ROSE',0),('spain.navarra.navarra','RED',1),
  ('spain.extremadura.ribera-del-guadiana','RED',0),('spain.extremadura.ribera-del-guadiana','WHITE',1),
  ('spain.la-rioja.rioja','RED',0),('spain.la-rioja.rioja','WHITE',1),('spain.la-rioja.rioja','ROSE',2),
  ('spain.la-rioja.rioja.rioja-alta','RED',0),
  ('spain.la-rioja.rioja.rioja-alavesa','RED',0),
  ('spain.la-rioja.rioja.rioja-oriental','RED',0)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (
  select 1 from wine_place_styles ws
  where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null
);

do $$
declare a int;
begin
  select count(*) into a from wine_place_articles x
    join wine_places p on p.id = x.wine_place_id
   where p.canonical_key like 'spain.%.%' and x.editorial_status = 'PUBLISHED';
  if a < 37 then raise exception 'expected >=37 Spain DO articles, got %', a; end if;
end $$;

commit;
