-- Knowledge for wave 4: articles + grape/style chips on the 10 new appellations.
begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, null, null, v.kf, 'PUBLISHED'
from (values
  ('italy.sicilia.noto',
   'Noto — the south-eastern tip of Sicily and the heartland of Nero d''Avola (the grape takes its name from nearby Avola): structured, sun-drenched reds, alongside the sweet, aromatic Moscato di Noto.',
   'Nero d''Avola; Moscato Bianco (Moscato di Noto)',
   'Full-bodied Nero d''Avola reds and sweet Moscato',
   array['Nero d''Avola heartland (named for Avola)','DOC — south-east Sicily','Also sweet Moscato di Noto','Noto, Avola, Pachino, Rosolini']::text[]),
  ('italy.sicilia.menfi',
   'Menfi — a coastal DOC on Sicily''s south-west (Agrigento), home to some of the island''s most modern estates: a broad, multi-varietal denomination spanning both native and international reds and whites.',
   'Nero d''Avola, Chardonnay, Grillo and others',
   'Modern multi-varietal reds and whites',
   array['South-west coast (Agrigento)','DOC — broad multi-varietal','Home of major modern estates','Menfi, Sciacca, Sambuca']::text[]),
  ('italy.sicilia.faro',
   'Faro — a tiny, revived DOC on the north-eastern tip of Sicily above Messina: elegant, perfumed reds from the Nerello grapes with Nocera, in the mould of nearby Etna.',
   'Nerello Mascalese, Nerello Cappuccio, Nocera',
   'Elegant Nerello-based reds',
   array['Tiny DOC above Messina (NE tip)','Nerello Mascalese + Nocera','Elegant, Etna-like reds','Revived by a handful of growers']::text[]),
  ('italy.lombardia.san-colombano',
   'San Colombano al Lambro — Lombardy''s ''wine of Milan'', from an isolated hill on the Po plain south-east of the city: earthy, fragrant reds from Croatina, Barbera and Uva Rara.',
   'Croatina, Barbera, Uva Rara',
   'Earthy Croatina-Barbera reds',
   array['The ''vino di Milano''','DOC — an isolated hill on the plain','Croatina / Barbera / Uva Rara reds','South-east of Milan']::text[]),
  ('italy.friuli.friuli-isonzo',
   'Friuli Isonzo — the gravelly alluvial plain of the Isonzo river in Gorizia, between Collio and the sea: a source of precise, expressive whites (Friulano, Pinot Grigio) and ripe reds.',
   'Friulano, Pinot Grigio, Merlot, Cabernet',
   'Precise whites and ripe reds',
   array['The Isonzo river plain (Gorizia)','DOC — gravelly alluvial soils','Whites: Friulano, Pinot Grigio','Between Collio and the Adriatic']::text[]),
  ('italy.veneto.montello-colli-asolani',
   'Montello - Colli Asolani (Asolo Montello) — the Treviso hills around Asolo and the Montello ridge: Bordeaux-style reds (Cabernet, Merlot) and whites, in the same country as Asolo Prosecco.',
   'Cabernet Sauvignon, Merlot, Chardonnay',
   'Bordeaux-style reds and whites',
   array['Asolo & the Montello ridge (Treviso)','DOC — still reds and whites','Bordeaux varieties (Cabernet, Merlot)','Prosecco country']::text[]),
  ('italy.veneto.monti-lessini',
   'Monti Lessini — the Lessini mountains north of Verona and Vicenza, home of Durella: a very high-acid native white made into the crisp, lively Durello sparkling wine.',
   'Durella',
   'Crisp Durello sparkling and whites',
   array['Lessini mountains (Verona/Vicenza)','DOC — home of Durello','Durella: very high natural acidity','Sparkling and still whites']::text[]),
  ('italy.veneto.colli-di-conegliano',
   'Colli di Conegliano — a DOCG in the Conegliano-Valdobbiadene hills for still wines (as opposed to the Prosecco): structured Manzoni Bianco-led whites, Bordeaux-blend reds and sweet passiti.',
   'Manzoni Bianco (whites); Cabernet, Merlot (reds)',
   'Still whites, reds and sweet passiti',
   array['DOCG — the Conegliano hills (Treviso)','Still wines, not Prosecco','Manzoni Bianco-led whites','Also sweet Torchiato / Refrontolo']::text[]),
  ('italy.veneto.bagnoli',
   'Bagnoli (Bagnoli di Sopra) — one of Veneto''s oldest denominations, on the Padua plain: Raboso-based reds, including the tannic, long-lived Friularo made from late-harvested grapes.',
   'Raboso',
   'Raboso reds and Friularo',
   array['Bagnoli di Sopra (Padua plain)','DOC — one of Veneto''s oldest','Raboso-based reds','Friularo: late-harvest, long-lived']::text[]),
  ('italy.trentino-alto-adige.trentodoc',
   'Trentodoc — Trentino''s Metodo Classico mountain sparkling from Chardonnay and Pinot Nero: grown from the valley floor up to high alpine vineyards, giving taut, long-ageing bottlings.',
   'Chardonnay, Pinot Nero',
   'Metodo Classico mountain sparkling',
   array['Trentino''s Metodo Classico sparkling','DOC — Chardonnay & Pinot Nero','Vineyards from valley to alpine slopes','A benchmark Italian sparkling']::text[])
) as v(ck, descr, gv, styles, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Nero d''Avola','italy.sicilia.noto'),
  ('Nero d''Avola','italy.sicilia.menfi'),
  ('Nerello Mascalese','italy.sicilia.faro'),('Nocera','italy.sicilia.faro'),
  ('Croatina','italy.lombardia.san-colombano'),('Barbera','italy.lombardia.san-colombano'),
  ('Friulano','italy.friuli.friuli-isonzo'),('Pinot Grigio','italy.friuli.friuli-isonzo'),
  ('Cabernet Sauvignon','italy.veneto.montello-colli-asolani'),('Merlot','italy.veneto.montello-colli-asolani'),
  ('Durella','italy.veneto.monti-lessini'),
  ('Manzoni Bianco','italy.veneto.colli-di-conegliano'),
  ('Raboso','italy.veneto.bagnoli'),
  ('Chardonnay','italy.trentino-alto-adige.trentodoc'),('Pinot Nero','italy.trentino-alto-adige.trentodoc')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.sicilia.noto','RED',0),('italy.sicilia.noto','SWEET',1),
  ('italy.sicilia.menfi','RED',0),('italy.sicilia.menfi','WHITE',1),
  ('italy.sicilia.faro','RED',0),
  ('italy.lombardia.san-colombano','RED',0),
  ('italy.friuli.friuli-isonzo','WHITE',0),('italy.friuli.friuli-isonzo','RED',1),
  ('italy.veneto.montello-colli-asolani','RED',0),
  ('italy.veneto.monti-lessini','SPARKLING',0),('italy.veneto.monti-lessini','WHITE',1),
  ('italy.veneto.colli-di-conegliano','WHITE',0),('italy.veneto.colli-di-conegliano','RED',1),
  ('italy.veneto.bagnoli','RED',0),
  ('italy.trentino-alto-adige.trentodoc','SPARKLING',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  keys text[] := array['italy.sicilia.noto','italy.sicilia.menfi','italy.sicilia.faro','italy.lombardia.san-colombano','italy.friuli.friuli-isonzo','italy.veneto.montello-colli-asolani','italy.veneto.monti-lessini','italy.veneto.colli-di-conegliano','italy.veneto.bagnoli','italy.trentino-alto-adige.trentodoc'];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if a <> 10 then raise exception 'expected 10 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if gr <> 15 then raise exception 'expected 15 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if sl <> 15 then raise exception 'expected 15 style links, got %', sl; end if;
end $$;

commit;
