-- Wave 5b knowledge: full Details on the 6 subregions + articles/grape/style
-- chips on the 13 new appellations.
begin;

-- Subregion Details (full: climate + soils).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.emilia-romagna.romagna',
   'Romagna — the eastern half of Emilia-Romagna, from the Apennine foothills to the Adriatic around Forlì, Faenza and Cesena: Sangiovese country, and home of Albana, Italy''s first white DOCG.',
   'Sangiovese, Albana, Trebbiano, Pagadebit.',
   'Sangiovese reds; dry and sweet Albana whites.',
   'Warmer and Adriatic-influenced, cooled from the Apennines inland.',
   'Clay, limestone and the local sandstone ''spungone'' in the hills; alluvium on the plain.',
   array['Sangiovese country','Albana — Italy''s first white DOCG','Forlì / Faenza / Cesena hills','Apennines to the Adriatic']::text[]),
  ('italy.emilia-romagna.emilia',
   'Emilia — the western, Po-plain half of the region, from Piacenza through Parma, Reggio and Modena to Bologna: the land of frothy Lambrusco and, in the hills, Pignoletto and the Piacenza reds.',
   'Lambrusco (Sorbara, Grasparossa, Salamino), Pignoletto, Barbera, Croatina, Malvasia.',
   'Frothy Lambrusco reds and rosés; Pignoletto whites; Gutturnio reds.',
   'Continental plain (hot, humid summers, foggy winters); cooler in the Apennine foothills.',
   'Alluvial silts and clays on the plain; clay, limestone and sandstone in the hills.',
   array['Frothy Lambrusco heartland','Pignoletto in the Bologna hills','Gutturnio in the Piacenza hills','Po plain + Apennine foothills']::text[]),
  ('italy.campania.irpinia',
   'Irpinia — the mountainous interior of Campania around Avellino, the heart of the region''s fine wine: cool volcanic hills giving the tannic red Taurasi and the age-worthy whites Fiano and Greco.',
   'Aglianico; Fiano, Greco, Coda di Volpe.',
   'Structured Aglianico reds; mineral, long-lived whites.',
   'Cool, continental and high (up to ~700 m), with big diurnal swings.',
   'Volcanic tuff and ash over clay and limestone.',
   array['Campania''s fine-wine heart (Avellino)','Taurasi, Fiano, Greco','Cool, high volcanic hills','Three DOCGs']::text[]),
  ('italy.campania.sannio',
   'Sannio — the hills of Benevento in north-central Campania, a high-volume zone with real quality at the top: the red Aglianico del Taburno and, across the whole province, the white Falanghina del Sannio.',
   'Aglianico; Falanghina, Greco, Fiano, Coda di Volpe.',
   'Aglianico reds and rosati; Falanghina whites.',
   'Continental inland hills — warm summers, cool nights.',
   'Calcareous clay, arenaceous and volcanic soils.',
   array['The hills of Benevento','Aglianico del Taburno (DOCG)','Falanghina del Sannio across the province','Campania''s volume + quality zone']::text[]),
  ('italy.puglia.salento',
   'Salento — the flat, sun-baked peninsula forming the heel of Italy (Lecce, Brindisi and southern Taranto): the land of Negroamaro and Primitivo, of deep reds and characterful rosati.',
   'Negroamaro, Primitivo, Malvasia Nera (reds); Verdeca, Bianco d''Alessano (whites).',
   'Deep reds, classic rosati, some whites.',
   'Hot, dry Mediterranean, cooled by breezes off the Adriatic and Ionian seas.',
   'Iron-rich red ''terra rossa'' over limestone.',
   array['The heel of Italy','Negroamaro + Primitivo','Home of the Italian rosato','Terra rossa over limestone']::text[]),
  ('italy.puglia.central-puglia',
   'Central Puglia — the Murgia plateau and the Valle d''Itria behind Bari: the tannic Nero di Troia and Primitivo of the Murgia (Castel del Monte, Gioia del Colle) and the crisp Verdeca whites of the trulli country (Locorotondo).',
   'Nero di Troia, Primitivo (reds); Verdeca, Bianco d''Alessano (whites).',
   'Structured reds; crisp Valle d''Itria whites.',
   'Warm Mediterranean, tempered by altitude on the Murgia plateau.',
   'Limestone and red terra rossa over karst.',
   array['Murgia plateau + Valle d''Itria','Nero di Troia & Primitivo reds','Verdeca whites (Locorotondo)','Trulli country']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Appellation articles (climate/soils null).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, null, null, v.kf, 'PUBLISHED'
from (values
  ('italy.emilia-romagna.romagna-sangiovese',
   'Romagna Sangiovese — the region-wide red of Romagna, from Sangiovese across the hills from Imola to Rimini: from easy, juicy everyday wines to serious, terroir-driven Superiore and Riserva bottlings by named sub-zone.',
   'Sangiovese', 'Juicy to structured Sangiovese reds',
   array['Romagna''s region-wide red','100% / mostly Sangiovese','Imola to Rimini hills','Superiore & named sub-zones']::text[]),
  ('italy.emilia-romagna.colli-bolognesi-pignoletto',
   'Colli Bolognesi Pignoletto — the DOCG of the hills south-west of Bologna, from at least 95% Pignoletto: crisp, lightly floral whites, still, frizzante and spumante.',
   'Pignoletto', 'Crisp still and frizzante whites',
   array['DOCG — hills SW of Bologna','Min 95% Pignoletto','Still, frizzante & spumante','Classic Bolognese aperitivo']::text[]),
  ('italy.emilia-romagna.gutturnio',
   'Gutturnio — the signature red of the Colli Piacentini in the far west of Emilia, a Barbera–Croatina (Bonarda) blend: from lively frizzante to still Superiore and Riserva.',
   'Barbera, Croatina', 'Barbera–Croatina reds, still and frizzante',
   array['The red of the Colli Piacentini','Barbera + Croatina (Bonarda)','Frizzante to Superiore/Riserva','Piacenza''s four valleys']::text[]),
  ('italy.campania.aglianico-del-taburno',
   'Aglianico del Taburno — the DOCG red of the Taburno massif in Sannio (Benevento), from Aglianico: firm, structured reds and a distinctive rosato, a cooler counterpart to Taurasi.',
   'Aglianico', 'Structured red and rosato',
   array['DOCG — the Taburno massif (Benevento)','100% / mostly Aglianico','Firm, structured reds + rosato','A cooler cousin of Taurasi']::text[]),
  ('italy.campania.falanghina-del-sannio',
   'Falanghina del Sannio — the fresh, floral white of Benevento, grown across the whole Sannio: Campania''s most planted Falanghina zone, from easy everyday wines to structured single-vineyard bottlings.',
   'Falanghina', 'Fresh, floral white',
   array['Across the whole Sannio (Benevento)','100% Falanghina','Fresh, floral, citrus','Campania''s Falanghina heartland']::text[]),
  ('italy.campania.vesuvio',
   'Vesuvio — the DOC of the slopes of Mount Vesuvius, whose superior wines carry the historic name Lacryma Christi: mineral whites from Coda di Volpe (Caprettone) and soft reds from Piedirosso.',
   'Coda di Volpe, Piedirosso', 'Volcanic whites and soft reds (Lacryma Christi)',
   array['The slopes of Vesuvius','Superior wines = Lacryma Christi','Coda di Volpe whites, Piedirosso reds','Volcanic soils, sea nearby']::text[]),
  ('italy.puglia.copertino',
   'Copertino — a Salento DOC around the town of Copertino near Lecce, from Negroamaro: warm, smooth, dark-fruited reds and a fragrant rosato.',
   'Negroamaro, Malvasia Nera', 'Negroamaro reds and rosato',
   array['Salento DOC near Lecce','Negroamaro-based','Smooth, warm reds','Also a fragrant rosato']::text[]),
  ('italy.puglia.gioia-del-colle',
   'Gioia del Colle — a Primitivo DOC on the higher Murgia plateau south of Bari: fresher, more structured Primitivo than the coastal Manduria style, plus reds and rosati.',
   'Primitivo', 'Fresher, structured Primitivo reds',
   array['Primitivo on the Murgia plateau','Higher, cooler than Manduria','Fresher, more structured style','South of Bari']::text[]),
  ('italy.puglia.locorotondo',
   'Locorotondo — a crisp white DOC of the Valle d''Itria (trulli country) from Verdeca and Bianco d''Alessano: light, dry and delicate, one of southern Italy''s classic whites.',
   'Verdeca, Bianco d''Alessano', 'Light, dry white',
   array['Valle d''Itria (trulli country)','Verdeca + Bianco d''Alessano','Light, crisp, dry','A classic southern white']::text[]),
  ('italy.umbria.colli-del-trasimeno',
   'Colli del Trasimeno (Trasimeno) — the DOC of the gentle hills around Lake Trasimeno in western Umbria: Sangiovese and Gamay del Trasimeno (Grenache) reds and Grechetto/Trebbiano whites.',
   'Sangiovese, Grechetto', 'Lake-hill reds and whites',
   array['Hills around Lake Trasimeno','Sangiovese + Gamay del Trasimeno reds','Grechetto / Trebbiano whites','Western Umbria']::text[]),
  ('italy.umbria.colli-martani',
   'Colli Martani — a central-Umbrian DOC on the Martani hills, best known for Grechetto (the ''Grechetto di Todi'' type): firm, nutty whites, plus Sangiovese and Trebbiano.',
   'Grechetto, Sangiovese', 'Grechetto whites and Sangiovese reds',
   array['Martani hills (central Umbria)','Grechetto di Todi','Firm, nutty whites','Also Sangiovese & Trebbiano']::text[]),
  ('italy.abruzzo.tullum',
   'Tullum (Terre Tollesi) — a tiny DOCG built around the single hill town of Tollo in Chieti: structured Montepulciano reds, plus Pecorino and Passerina whites and a Chardonnay spumante.',
   'Montepulciano, Pecorino', 'Montepulciano reds and Pecorino whites',
   array['DOCG — the single town of Tollo','Structured Montepulciano reds','Pecorino & Passerina whites','One of Abruzzo''s two DOCGs']::text[]),
  ('italy.abruzzo.villamagna',
   'Villamagna — a small Montepulciano DOC around Villamagna near Chieti: a boutique, terroir-focused red from a handful of growers on the Chieti hills.',
   'Montepulciano', 'Boutique Montepulciano red',
   array['Small DOC near Chieti','100% / mostly Montepulciano','Boutique, terroir-focused','A handful of growers']::text[])
) as v(ck, descr, gv, styles, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Pignoletto','italy.emilia-romagna.colli-bolognesi-pignoletto'),
  ('Barbera','italy.emilia-romagna.gutturnio'),('Croatina','italy.emilia-romagna.gutturnio'),
  ('Sangiovese','italy.emilia-romagna.romagna-sangiovese'),
  ('Aglianico','italy.campania.aglianico-del-taburno'),
  ('Falanghina','italy.campania.falanghina-del-sannio'),
  ('Coda di Volpe','italy.campania.vesuvio'),('Piedirosso','italy.campania.vesuvio'),
  ('Negroamaro','italy.puglia.copertino'),('Malvasia Nera','italy.puglia.copertino'),
  ('Primitivo','italy.puglia.gioia-del-colle'),
  ('Verdeca','italy.puglia.locorotondo'),('Bianco d''Alessano','italy.puglia.locorotondo'),
  ('Sangiovese','italy.umbria.colli-del-trasimeno'),('Grechetto','italy.umbria.colli-del-trasimeno'),
  ('Grechetto','italy.umbria.colli-martani'),('Sangiovese','italy.umbria.colli-martani'),
  ('Montepulciano','italy.abruzzo.tullum'),('Pecorino','italy.abruzzo.tullum'),
  ('Montepulciano','italy.abruzzo.villamagna')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.emilia-romagna.colli-bolognesi-pignoletto','WHITE',0),('italy.emilia-romagna.colli-bolognesi-pignoletto','SPARKLING',1),
  ('italy.emilia-romagna.gutturnio','RED',0),
  ('italy.emilia-romagna.romagna-sangiovese','RED',0),
  ('italy.campania.aglianico-del-taburno','RED',0),('italy.campania.aglianico-del-taburno','ROSE',1),
  ('italy.campania.falanghina-del-sannio','WHITE',0),
  ('italy.campania.vesuvio','WHITE',0),('italy.campania.vesuvio','RED',1),
  ('italy.puglia.copertino','RED',0),('italy.puglia.copertino','ROSE',1),
  ('italy.puglia.gioia-del-colle','RED',0),('italy.puglia.gioia-del-colle','ROSE',1),
  ('italy.puglia.locorotondo','WHITE',0),
  ('italy.umbria.colli-del-trasimeno','RED',0),('italy.umbria.colli-del-trasimeno','WHITE',1),
  ('italy.umbria.colli-martani','WHITE',0),('italy.umbria.colli-martani','RED',1),
  ('italy.abruzzo.tullum','RED',0),('italy.abruzzo.tullum','WHITE',1),
  ('italy.abruzzo.villamagna','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  keys text[] := array[
    'italy.emilia-romagna.romagna','italy.emilia-romagna.emilia','italy.campania.irpinia','italy.campania.sannio','italy.puglia.salento','italy.puglia.central-puglia',
    'italy.emilia-romagna.romagna-sangiovese','italy.emilia-romagna.colli-bolognesi-pignoletto','italy.emilia-romagna.gutturnio',
    'italy.campania.aglianico-del-taburno','italy.campania.falanghina-del-sannio','italy.campania.vesuvio',
    'italy.puglia.copertino','italy.puglia.gioia-del-colle','italy.puglia.locorotondo',
    'italy.umbria.colli-del-trasimeno','italy.umbria.colli-martani','italy.abruzzo.tullum','italy.abruzzo.villamagna'];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if a <> 19 then raise exception 'expected 19 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if gr <> 20 then raise exception 'expected 20 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if sl <> 21 then raise exception 'expected 21 style links, got %', sl; end if;
end $$;

commit;
