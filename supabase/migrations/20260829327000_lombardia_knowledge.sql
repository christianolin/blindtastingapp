-- Knowledge for Lombardy round 1. Full Details on the REGION; articles + grape/
-- style chips throughout.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.lombardia',
   'Lombardy spans the Italian Alps to the Po plain — from the terraced alpine Nebbiolo of Valtellina and the Chardonnay/Pinot Nero sparkling of Franciacorta (Italy''s benchmark Metodo Classico) to the Pinot Nero and Bonarda hills of the Oltrepò Pavese and the shores of Lake Garda.',
   'Chardonnay & Pinot Nero (Franciacorta); Nebbiolo/Chiavennasca (Valtellina); Pinot Nero, Croatina, Barbera, Riesling (Oltrepò Pavese).',
   'Traditional-method sparkling (Franciacorta), alpine Nebbiolo (Valtellina Superiore, Sforzato) and Oltrepò''s Pinot Nero and everyday reds and whites.',
   'From cold alpine in Valtellina, through lake-moderated (Iseo, Garda) in the centre, to warmer continental in the Oltrepò hills.',
   'Alpine sand and stony terraces in Valtellina; morainic gravels around Franciacorta and the lakes; clay-limestone marls in the Oltrepò.',
   array['Franciacorta — Italy''s top Metodo Classico','Valtellina — alpine terraced Nebbiolo (Chiavennasca)','Oltrepò Pavese — a Pinot Nero heartland','Spans the Alps to the Po plain']::text[]),
  ('italy.lombardia.franciacorta',
   'Franciacorta — Italy''s benchmark traditional-method sparkling, from Chardonnay, Pinot Nero and Pinot Bianco on the morainic hills south of Lake Iseo (Brescia), with long lees ageing.',
   'Chardonnay, Pinot Nero, Pinot Bianco, Erbamat',
   null, null, null,
   array['Metodo Classico sparkling','Chardonnay / Pinot Nero / Pinot Bianco','Morainic hills south of Lake Iseo (Brescia)','DOCG since 1995']::text[]),
  ('italy.lombardia.valtellina-superiore',
   'Valtellina Superiore — steep, terraced alpine Nebbiolo (locally ''Chiavennasca'') on the north side of the upper Adda valley (Sondrio), with the famed subzones Sassella, Grumello, Inferno and Valgella.',
   'Nebbiolo (Chiavennasca)',
   null, null, null,
   array['Nebbiolo (Chiavennasca), min 90%','DOCG since 1998','Steep terraces, upper Adda valley (Sondrio)','Subzones: Sassella, Grumello, Inferno, Valgella']::text[]),
  ('italy.lombardia.sforzato-di-valtellina',
   'Sforzato di Valtellina (Sfursat) — a powerful dried-grape (appassimento) dry red Nebbiolo from Valtellina; one of Italy''s few alpine Amarone-style wines.',
   'Nebbiolo (Chiavennasca)',
   null, null, null,
   array['Dried-grape (appassimento), dry','DOCG','Nebbiolo (Chiavennasca)','Alpine, powerful, ageworthy']::text[]),
  ('italy.lombardia.oltrepo-pavese',
   'Oltrepò Pavese — the Apennine foothills south of Pavia, a major zone for Pinot Nero (still and sparkling) and the Croatina-based Bonarda, plus Barbera and Riesling.',
   'Pinot Nero, Croatina, Barbera, Riesling',
   null, null, null,
   array['Pinot Nero heartland (still & sparkling)','Bonarda (Croatina) everyday reds','Apennine foothills south of Pavia','Also Barbera and Riesling']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Chardonnay','italy.lombardia'),('Pinot Nero','italy.lombardia'),('Nebbiolo','italy.lombardia'),('Croatina','italy.lombardia'),('Barbera','italy.lombardia'),
  ('Chardonnay','italy.lombardia.franciacorta'),('Pinot Nero','italy.lombardia.franciacorta'),('Pinot Bianco','italy.lombardia.franciacorta'),
  ('Nebbiolo','italy.lombardia.valtellina-superiore'),
  ('Nebbiolo','italy.lombardia.sforzato-di-valtellina'),
  ('Pinot Nero','italy.lombardia.oltrepo-pavese'),('Croatina','italy.lombardia.oltrepo-pavese'),('Barbera','italy.lombardia.oltrepo-pavese')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.lombardia.franciacorta','SPARKLING',0),
  ('italy.lombardia.valtellina-superiore','RED',0),
  ('italy.lombardia.sforzato-di-valtellina','RED',0),
  ('italy.lombardia.oltrepo-pavese','RED',0),('italy.lombardia.oltrepo-pavese','WHITE',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.lombardia%' and x.editorial_status='PUBLISHED';
  if a <> 5 then raise exception 'expected 5 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.lombardia%' and x.editorial_status='PUBLISHED';
  if gr <> 13 then raise exception 'expected 13 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.lombardia%' and x.editorial_status='PUBLISHED';
  if sl <> 5 then raise exception 'expected 5 style links, got %', sl; end if;
end $$;

commit;
