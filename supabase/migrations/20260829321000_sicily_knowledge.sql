-- Knowledge for Sicily round 1. Full Details on the REGION and on Etna (its
-- distinctive volcanic terroir); articles + grape/style chips throughout.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.sicilia',
   'Sicily, the Mediterranean''s largest island, is one of Italy''s most dynamic wine regions — from the high volcanic slopes of Mount Etna to the sun-baked plains of the west, home to Nero d''Avola reds, crisp Grillo whites, the sweet wines of Pantelleria and the fortified Marsala.',
   'Nero d''Avola, Nerello Mascalese, Frappato, Perricone (reds); Grillo, Catarratto, Carricante, Inzolia, Grecanico, Zibibbo (whites).',
   'Structured Nero d''Avola and elegant Etna reds; crisp island whites; sweet Passito di Pantelleria; and fortified Marsala.',
   'Warm, dry Mediterranean with intense sun, tempered by altitude on Etna and by sea breezes on the coasts; large diurnal shifts on the high slopes keep acidity.',
   'Volcanic basalt, ash and lava on Etna; limestone, clay and sandy calcareous soils across the rolling interior and coasts.',
   array['The Mediterranean''s largest island','Mount Etna — volcanic, contrada-based wines','Nero d''Avola is the flagship red','Home of Marsala and Passito di Pantelleria']::text[]),
  ('italy.sicilia.etna',
   'Etna — terraced vineyards on the slopes of Europe''s most active volcano, up to ~1,000 m: pale, perfumed, Pinot-like Nerello Mascalese reds and racy Carricante whites, increasingly bottled by single contrada (cru). Sicily''s first DOC (1968).',
   'Nerello Mascalese, Nerello Cappuccio, Carricante',
   null,
   'High-altitude and, for Sicily, surprisingly cool, with large day–night temperature swings and a long growing season on the volcano''s slopes.',
   'Volcanic — black basaltic ash, lava and pumice that vary by eruption flow and altitude (the basis of the contrada system).',
   array['Nerello Mascalese reds + Carricante whites','Volcanic slopes to ~1,000 m','Contrada (cru) system','Sicily''s first DOC (1968)']::text[]),
  ('italy.sicilia.sicilia-doc',
   'Sicilia DOC — the island-wide appellation (upgraded from IGT in 2011) covering all of Sicily, for varietal Nero d''Avola, Grillo, Catarratto and more.',
   'Nero d''Avola, Grillo, Catarratto, Nerello Mascalese',
   null, null, null,
   array['Island-wide DOC (since 2011)','Nero d''Avola, Grillo, Catarratto','Covers the whole region','Varietal labelling']::text[]),
  ('italy.sicilia.cerasuolo-di-vittoria',
   'Cerasuolo di Vittoria — Sicily''s only DOCG: a cherry-bright, fragrant red blending Nero d''Avola with Frappato, from the south-eastern corner of the island.',
   'Nero d''Avola, Frappato',
   null, null, null,
   array['Sicily''s only DOCG (2005)','Nero d''Avola + Frappato','South-eastern Sicily (Vittoria)','Cherry-bright, fragrant red']::text[]),
  ('italy.sicilia.marsala',
   'Marsala — the historic fortified wine of western Sicily around the town of Marsala, from Grillo, Catarratto and Inzolia (plus red grapes): in styles from dry Vergine to sweet, and Oro, Ambra and Rubino colours.',
   'Grillo, Catarratto, Inzolia',
   null, null, null,
   array['Fortified wine (Trapani province)','Grillo / Catarratto / Inzolia base','Fine / Superiore / Vergine styles','Created 1773; DOC 1969']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape entity links (chips).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Nero d''Avola','italy.sicilia'),('Nerello Mascalese','italy.sicilia'),('Grillo','italy.sicilia'),('Catarratto','italy.sicilia'),('Frappato','italy.sicilia'),
  ('Nero d''Avola','italy.sicilia.sicilia-doc'),('Grillo','italy.sicilia.sicilia-doc'),('Catarratto','italy.sicilia.sicilia-doc'),
  ('Nerello Mascalese','italy.sicilia.etna'),('Nerello Cappuccio','italy.sicilia.etna'),('Carricante','italy.sicilia.etna'),
  ('Nero d''Avola','italy.sicilia.cerasuolo-di-vittoria'),('Frappato','italy.sicilia.cerasuolo-di-vittoria'),
  ('Grillo','italy.sicilia.marsala'),('Catarratto','italy.sicilia.marsala'),('Inzolia','italy.sicilia.marsala')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links (appellations; region uses wine_styles text).
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.sicilia.sicilia-doc','RED',0),('italy.sicilia.sicilia-doc','WHITE',1),
  ('italy.sicilia.etna','RED',0),('italy.sicilia.etna','WHITE',1),
  ('italy.sicilia.cerasuolo-di-vittoria','RED',0),
  ('italy.sicilia.marsala','FORTIFIED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.sicilia%' and x.editorial_status='PUBLISHED';
  if a <> 5 then raise exception 'expected 5 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.sicilia%' and x.editorial_status='PUBLISHED';
  if gr <> 16 then raise exception 'expected 16 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.sicilia%' and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 style links, got %', sl; end if;
end $$;

commit;
