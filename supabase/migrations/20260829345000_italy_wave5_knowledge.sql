-- Wave 5 knowledge: full Details on the 5 new regions + articles/grape/style
-- chips on the 16 appellations.
begin;

-- Region Details (full: climate + soils).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.emilia-romagna',
   'Emilia-Romagna stretches across northern Italy from the Apennines to the Adriatic: Emilia in the west is Lambrusco country — the frothy reds of the Po plain around Modena and Reggio — while Romagna in the east is the land of Sangiovese and the white Albana.',
   'Lambrusco (Sorbara, Grasparossa, Salamino), Sangiovese, Albana, Trebbiano, Pignoletto.',
   'Frothy Lambrusco reds and rosés; Sangiovese reds; dry and sweet Albana whites.',
   'Continental on the Emilian plain (hot, humid summers, foggy winters); milder and Adriatic-influenced in the Romagnol hills.',
   'Alluvial clays and silts on the Po plain; clay, limestone and sandstone (the spungone) in the Romagnol hills.',
   array['Lambrusco heartland (Modena / Reggio)','Romagna = Sangiovese + Albana','Albana — Italy''s first white DOCG (1987)','Po plain to the Adriatic']::text[]),
  ('italy.campania',
   'Campania, around Naples, is one of southern Italy''s greatest wine regions, built on ancient native grapes: the volcanic hills of Irpinia (Avellino) give the tannic red Taurasi and the mineral whites Fiano and Greco.',
   'Aglianico (reds); Fiano, Greco, Falanghina, Coda di Volpe (whites).',
   'Structured, age-worthy Aglianico reds (Taurasi); mineral, long-lived whites (Fiano, Greco).',
   'Mediterranean on the coast; cooler, continental and higher in the inland Irpinia hills, where altitude and volcanic soils preserve acidity.',
   'Volcanic ash and tuff (Irpinia, Vesuvius), with limestone and clay in the hills.',
   array['Irpinia''s Aglianico + Fiano + Greco','Taurasi — ''the Barolo of the south''','Volcanic & tuff soils','Ancient Greek grape heritage']::text[]),
  ('italy.puglia',
   'Puglia, the heel of Italy, is a warm, sun-drenched region and one of the country''s largest producers: powerful reds from Primitivo (Manduria) and Negroamaro (Salento), plus the tannic Nero di Troia in the north.',
   'Primitivo, Negroamaro, Nero di Troia, Bombino Nero (reds); Bombino Bianco, Verdeca (whites).',
   'Rich, ripe reds and rosati; some sweet Primitivo.',
   'Hot, dry Mediterranean, tempered by sea breezes off the Adriatic and Ionian coasts.',
   'Iron-rich red ''terra rossa'' over limestone, with sandy coastal stretches.',
   array['Primitivo (= Zinfandel) heartland','Negroamaro of the Salento','Nero di Troia in the north (Castel del Monte)','Terra rossa over limestone']::text[]),
  ('italy.umbria',
   'Umbria, the green heart of Italy, is a landlocked hill region: its flagship is the intensely tannic Sagrantino of Montefalco, alongside Sangiovese-based Torgiano reds and the historic white Orvieto.',
   'Sagrantino, Sangiovese (reds); Grechetto, Trebbiano, Verdello, Drupeggio (whites).',
   'Powerful Sagrantino reds (dry and passito); Sangiovese reds; dry and sweet Orvieto whites.',
   'Continental, with warm days and cool nights in the hills; no maritime moderation.',
   'Clay and limestone with sandy marine sediments; volcanic tuff around Orvieto.',
   array['Sagrantino di Montefalco — hugely tannic','Torgiano Sangiovese reds','Orvieto — historic tuff-cellar white','Landlocked ''green heart of Italy''']::text[]),
  ('italy.abruzzo',
   'Abruzzo, on the mountainous Adriatic flank of central Italy, is dominated by one grape — Montepulciano — giving deeply-coloured reds (Montepulciano d''Abruzzo) and cherry-bright Cerasuolo rosati, with crisp Trebbiano and Pecorino whites.',
   'Montepulciano (reds / rosati); Trebbiano Abruzzese, Pecorino, Passerina, Cococciola (whites).',
   'Deep Montepulciano reds; cherry-red Cerasuolo rosati; crisp whites.',
   'Cooled by the Apennines (Gran Sasso, Maiella) inland and moderated by the Adriatic on the coast — big diurnal swings.',
   'Clay and limestone in the hills, alluvial gravels along the river valleys.',
   array['Montepulciano d''Abruzzo — the workhorse red','Cerasuolo d''Abruzzo — its cherry rosato','Colline Teramane — the premium DOCG hills','Gran Sasso mountains to the Adriatic']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Appellation articles (climate/soils left null; description + chips).
insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, null, null, v.kf, 'PUBLISHED'
from (values
  ('italy.emilia-romagna.romagna-albana',
   'Romagna Albana — Italy''s first white DOCG (1987), from the native Albana across the Romagnol hills from Imola to Cesena: made dry, off-dry, sweet and as a honeyed passito.',
   'Albana', 'Dry, sweet and passito whites',
   array['Italy''s first white DOCG (1987)','Native Albana','Romagnol hills (Imola–Cesena)','Dry through to passito']::text[]),
  ('italy.emilia-romagna.lambrusco-di-sorbara',
   'Lambrusco di Sorbara — the most delicate Lambrusco, from the sandy plain north of Modena: pale, high-acid, floral and famously frothy, often nearly rosé in colour.',
   'Lambrusco di Sorbara', 'Pale, high-acid frizzante and sparkling',
   array['The most delicate Lambrusco','Sandy plain north of Modena','Pale, floral, high-acid','Frizzante & Metodo Classico']::text[]),
  ('italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro',
   'Lambrusco Grasparossa di Castelvetro — the fullest, most tannic Lambrusco, from the foothills south of Modena around Castelvetro: deeply coloured, frothy and dry to amabile.',
   'Lambrusco Grasparossa', 'Deep, tannic red frizzante',
   array['The fullest, most tannic Lambrusco','Foothills around Castelvetro','Deeply coloured & frothy','Classic with Modenese food']::text[]),
  ('italy.campania.taurasi',
   'Taurasi — ''the Barolo of the south'', the great red of Irpinia from Aglianico grown on volcanic hills in the Avellino interior: tannic, structured and long-ageing (DOCG Riserva at four years).',
   'Aglianico', 'Structured, age-worthy red',
   array['''The Barolo of the south''','100% Aglianico (min 85%)','Volcanic Irpinia hills (Avellino)','DOCG — long-ageing']::text[]),
  ('italy.campania.greco-di-tufo',
   'Greco di Tufo — a mineral, structured Campanian white from Greco grown on the sulphur-rich tuff around Tufo in Irpinia: firm, savoury and capable of ageing, also made sparkling.',
   'Greco, Coda di Volpe', 'Mineral white and sparkling',
   array['Grown on sulphur-rich tuff (Tufo)','DOCG — 8 comuni, Sabato valley','Firm, savoury, age-worthy','Also Spumante']::text[]),
  ('italy.campania.fiano-di-avellino',
   'Fiano di Avellino — an aromatic yet structured Campanian white from the ancient Fiano around Avellino: hazelnut, honey and smoke, gaining complexity with age.',
   'Fiano', 'Aromatic, age-worthy white',
   array['Ancient Fiano (Apianum)','DOCG — hills around Avellino','Hazelnut, honey, smoke','Ages remarkably well']::text[]),
  ('italy.puglia.primitivo-di-manduria',
   'Primitivo di Manduria — the flagship Primitivo (genetically Zinfandel) of the Ionian Salento around Manduria: rich, warm, high-alcohol reds, plus a sweet Dolce Naturale.',
   'Primitivo', 'Rich reds and sweet Dolce Naturale',
   array['Primitivo = Zinfandel','Ionian Salento (Taranto/Brindisi)','Rich, warm, high-alcohol','Also sweet Dolce Naturale (DOCG)']::text[]),
  ('italy.puglia.castel-del-monte',
   'Castel del Monte — the benchmark of the Murgia hinterland behind Andria, named for the Swabian castle: tannic Nero di Troia reds and pale Bombino Nero rosati (three Castel del Monte DOCGs).',
   'Nero di Troia, Bombino Nero', 'Nero di Troia reds and Bombino Nero rosato',
   array['Murgia hills behind Andria','Nero di Troia (Uva di Troia) reds','Bombino Nero rosato DOCG','Named for Frederick II''s castle']::text[]),
  ('italy.puglia.salice-salentino',
   'Salice Salentino — the best-known DOC of the Salento, from Negroamaro (with Malvasia Nera) on the red terra rossa: warm, smooth, dark-fruited reds and rosati.',
   'Negroamaro, Malvasia Nera', 'Warm Negroamaro reds and rosati',
   array['Negroamaro heartland (Salento)','Terra rossa over limestone','Smooth, dark-fruited reds','Also a classic rosato']::text[]),
  ('italy.umbria.montefalco-sagrantino',
   'Montefalco Sagrantino — one of Italy''s most tannic reds, from 100% Sagrantino on the hills around Montefalco: dense, powerful and long-lived, historically made sweet as a passito.',
   'Sagrantino', 'Powerful dry red and passito',
   array['100% Sagrantino','DOCG — hills around Montefalco','Among Italy''s most tannic reds','Dry and passito styles']::text[]),
  ('italy.umbria.torgiano-rosso-riserva',
   'Torgiano Rosso Riserva — a single-comune DOCG at Torgiano near Perugia, pioneered by the Lungarotti family: structured, age-worthy Sangiovese-based reds aged at least three years.',
   'Sangiovese', 'Structured Sangiovese Riserva red',
   array['Single-comune DOCG (Torgiano)','Sangiovese-based','Pioneered by Lungarotti','Min 3 years ageing']::text[]),
  ('italy.umbria.orvieto',
   'Orvieto — Umbria''s historic white, from Grechetto and Trebbiano (Procanico) grown on volcanic tuff around the cliff-top city: traditionally off-dry, now mostly crisp and dry, with a prized noble-rot sweet version.',
   'Grechetto, Trebbiano', 'Dry, off-dry and noble-rot sweet whites',
   array['Historic tuff-cellar white','Grechetto + Trebbiano (Procanico)','Zone extends into northern Lazio','Also a noble-rot Muffa Nobile']::text[]),
  ('italy.abruzzo.montepulciano-d-abruzzo-colline-teramane',
   'Montepulciano d''Abruzzo Colline Teramane — Abruzzo''s premium DOCG, from Montepulciano on the hills of Teramo below the Gran Sasso: deeper, more structured and age-worthy than the base DOC.',
   'Montepulciano', 'Structured, age-worthy red',
   array['Abruzzo''s red DOCG','Teramo hills below the Gran Sasso','Deeper & more structured than the DOC','Montepulciano (min 90%)']::text[]),
  ('italy.abruzzo.montepulciano-d-abruzzo',
   'Montepulciano d''Abruzzo — the region-wide workhorse red from Montepulciano across the hill zones of all four Abruzzo provinces: deeply coloured, soft and fruity, from everyday to serious.',
   'Montepulciano', 'Deep, soft, fruity red',
   array['Abruzzo''s region-wide red DOC','Deeply coloured & soft','Everyday to serious bottlings','Hill zones of all four provinces']::text[]),
  ('italy.abruzzo.trebbiano-d-abruzzo',
   'Trebbiano d''Abruzzo — the region-wide white DOC: mostly crisp and neutral, but in a few hands (from Trebbiano Abruzzese) one of central Italy''s most characterful, long-lived whites.',
   'Trebbiano', 'Crisp white; rare age-worthy examples',
   array['Abruzzo''s region-wide white DOC','Trebbiano Abruzzese at its best','Mostly crisp and fresh','A few benchmark long-lived whites']::text[]),
  ('italy.abruzzo.cerasuolo-d-abruzzo',
   'Cerasuolo d''Abruzzo — Abruzzo''s cherry-bright rosato from Montepulciano, a DOC in its own right: deeply coloured for a rosé, fruity and savoury, a regional classic.',
   'Montepulciano', 'Cherry-red rosato',
   array['Cherry-red rosato (its own DOC)','From Montepulciano grapes','Deeply coloured, fruity, savoury','An Abruzzo classic']::text[])
) as v(ck, descr, gv, styles, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Albana','italy.emilia-romagna.romagna-albana'),
  ('Lambrusco di Sorbara','italy.emilia-romagna.lambrusco-di-sorbara'),
  ('Lambrusco Grasparossa','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro'),
  ('Aglianico','italy.campania.taurasi'),
  ('Greco','italy.campania.greco-di-tufo'),('Coda di Volpe','italy.campania.greco-di-tufo'),
  ('Fiano','italy.campania.fiano-di-avellino'),
  ('Primitivo','italy.puglia.primitivo-di-manduria'),
  ('Nero di Troia','italy.puglia.castel-del-monte'),('Bombino Nero','italy.puglia.castel-del-monte'),
  ('Negroamaro','italy.puglia.salice-salentino'),('Malvasia Nera','italy.puglia.salice-salentino'),
  ('Sagrantino','italy.umbria.montefalco-sagrantino'),
  ('Sangiovese','italy.umbria.torgiano-rosso-riserva'),
  ('Grechetto','italy.umbria.orvieto'),('Trebbiano','italy.umbria.orvieto'),
  ('Montepulciano','italy.abruzzo.montepulciano-d-abruzzo-colline-teramane'),
  ('Montepulciano','italy.abruzzo.montepulciano-d-abruzzo'),
  ('Trebbiano','italy.abruzzo.trebbiano-d-abruzzo'),
  ('Montepulciano','italy.abruzzo.cerasuolo-d-abruzzo')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.emilia-romagna.romagna-albana','WHITE',0),('italy.emilia-romagna.romagna-albana','SWEET',1),
  ('italy.emilia-romagna.lambrusco-di-sorbara','SPARKLING',0),('italy.emilia-romagna.lambrusco-di-sorbara','ROSE',1),
  ('italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro','SPARKLING',0),('italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro','RED',1),
  ('italy.campania.taurasi','RED',0),
  ('italy.campania.greco-di-tufo','WHITE',0),('italy.campania.greco-di-tufo','SPARKLING',1),
  ('italy.campania.fiano-di-avellino','WHITE',0),
  ('italy.puglia.primitivo-di-manduria','RED',0),('italy.puglia.primitivo-di-manduria','SWEET',1),
  ('italy.puglia.castel-del-monte','RED',0),('italy.puglia.castel-del-monte','ROSE',1),
  ('italy.puglia.salice-salentino','RED',0),('italy.puglia.salice-salentino','ROSE',1),
  ('italy.umbria.montefalco-sagrantino','RED',0),('italy.umbria.montefalco-sagrantino','SWEET',1),
  ('italy.umbria.torgiano-rosso-riserva','RED',0),
  ('italy.umbria.orvieto','WHITE',0),('italy.umbria.orvieto','SWEET',1),
  ('italy.abruzzo.montepulciano-d-abruzzo-colline-teramane','RED',0),
  ('italy.abruzzo.montepulciano-d-abruzzo','RED',0),
  ('italy.abruzzo.trebbiano-d-abruzzo','WHITE',0),
  ('italy.abruzzo.cerasuolo-d-abruzzo','ROSE',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  keys text[] := array[
    'italy.emilia-romagna','italy.campania','italy.puglia','italy.umbria','italy.abruzzo',
    'italy.emilia-romagna.romagna-albana','italy.emilia-romagna.lambrusco-di-sorbara','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro',
    'italy.campania.taurasi','italy.campania.greco-di-tufo','italy.campania.fiano-di-avellino',
    'italy.puglia.primitivo-di-manduria','italy.puglia.castel-del-monte','italy.puglia.salice-salentino',
    'italy.umbria.montefalco-sagrantino','italy.umbria.torgiano-rosso-riserva','italy.umbria.orvieto',
    'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane','italy.abruzzo.montepulciano-d-abruzzo','italy.abruzzo.trebbiano-d-abruzzo','italy.abruzzo.cerasuolo-d-abruzzo'];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if a <> 21 then raise exception 'expected 21 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if gr <> 20 then raise exception 'expected 20 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if sl <> 25 then raise exception 'expected 25 style links, got %', sl; end if;
end $$;

commit;
