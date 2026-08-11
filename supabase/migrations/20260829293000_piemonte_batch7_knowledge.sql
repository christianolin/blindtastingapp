-- Knowledge for Piedmont batch 7 (Torino/alpine fringe + Alba). PUBLISHED.
-- Nebbiolo (in the grapes table) links Valli Ossolane and Alba; the many rare
-- local grapes (Freisa, Malvasia di Schierano, Avanà, Pelaverga, etc.) are text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.collina-torinese',
   'Collina Torinese — the wooded hills immediately east of Turin: everyday Barbera and Freisa reds, plus the local Bonarda, from vineyards facing the city.',
   'Barbera, Freisa, Bonarda',
   array['Barbera/Freisa/Bonarda reds','DOC','Hills east of Turin','Everyday local reds']::text[]),
  ('italy.piemonte.freisa-di-chieri',
   'Freisa di Chieri — the Freisa grape around Chieri, south-east of Turin: a tannic, lightly bitter red made dry, sweet or gently sparkling.',
   'Freisa',
   array['Freisa','DOC','Around Chieri (Torino)','Dry, sweet or frizzante']::text[]),
  ('italy.piemonte.malvasia-castelnuovo',
   'Malvasia di Castelnuovo Don Bosco — a sweet, aromatic, lightly sparkling red from aromatic Malvasia di Schierano, around Castelnuovo Don Bosco on the Torino/Asti border.',
   'Malvasia di Schierano',
   array['Aromatic Malvasia (red)','DOC','Castelnuovo Don Bosco (Torino/Asti)','Sweet, lightly sparkling red']::text[]),
  ('italy.piemonte.pinerolese',
   'Pinerolese — the alpine foothills south-west of Turin around Pinerolo: light mountain reds from Barbera, Bonarda and Nebbiolo plus rare local grapes such as Ramìe and Doux d''Henry.',
   'Barbera, Bonarda, Nebbiolo, Ramìe',
   array['Mountain reds (Barbera/Bonarda/Nebbiolo + rarities)','DOC','Foothills around Pinerolo (Torino)','Includes rare Ramìe & Doux d''Henry']::text[]),
  ('italy.piemonte.valsusa',
   'Valsusa — among Italy''s highest-altitude vineyards, in the Susa valley west of Turin: light, fresh alpine reds from indigenous Avanà, Becuèt and Barbera.',
   'Avanà, Becuèt, Barbera',
   array['Alpine reds (Avanà, Becuèt, Barbera)','DOC','Susa valley, west of Turin','Very high-altitude, light and fresh']::text[]),
  ('italy.piemonte.colline-saluzzesi',
   'Colline Saluzzesi — the foothills around Saluzzo at the foot of Monviso: reds from Pelaverga and Nebbiolo/Barbera, plus the sweet sparkling Quagliano.',
   'Pelaverga, Quagliano, Nebbiolo, Barbera',
   array['Pelaverga & Quagliano + Nebbiolo/Barbera','DOC','Around Saluzzo (Cuneo), below Monviso','Local reds incl. sweet sparkling Quagliano']::text[]),
  ('italy.piemonte.valli-ossolane',
   'Valli Ossolane — the alpine valleys of the far-northern Ossola near Switzerland: structured Nebbiolo reds (the local ''Prünent'') and mountain whites.',
   'Nebbiolo (Prünent), Croatina',
   array['Nebbiolo (local ''Prünent'') + whites','DOC','Ossola valleys (Verbano-Cusio-Ossola)','Far-northern alpine Piedmont']::text[]),
  ('italy.piemonte.alba',
   'Alba — a Langhe DOC for a Nebbiolo-and-Barbera blend from the hills around Alba, marrying Nebbiolo''s structure with Barbera''s fruit and acidity.',
   'Nebbiolo, Barbera',
   array['Nebbiolo + Barbera blend','DOC since 2010','Hills around Alba (Langhe)','Structure of Nebbiolo, fruit of Barbera']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Nebbiolo grape link for Valli Ossolane and Alba.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on g.name = 'Nebbiolo'
where p.canonical_key in ('italy.piemonte.valli-ossolane','italy.piemonte.alba');

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.collina-torinese','RED',0),
  ('italy.piemonte.freisa-di-chieri','RED',0),
  ('italy.piemonte.malvasia-castelnuovo','SPARKLING',0), ('italy.piemonte.malvasia-castelnuovo','SWEET',1),
  ('italy.piemonte.pinerolese','RED',0),
  ('italy.piemonte.valsusa','RED',0),
  ('italy.piemonte.colline-saluzzesi','RED',0),
  ('italy.piemonte.valli-ossolane','RED',0), ('italy.piemonte.valli-ossolane','WHITE',1),
  ('italy.piemonte.alba','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  ckeys text[] := array[
    'italy.piemonte.collina-torinese','italy.piemonte.freisa-di-chieri','italy.piemonte.malvasia-castelnuovo',
    'italy.piemonte.pinerolese','italy.piemonte.valsusa','italy.piemonte.colline-saluzzesi','italy.piemonte.valli-ossolane',
    'italy.piemonte.alba'
  ];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if a <> 8 then raise exception 'expected 8 batch-7 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if gr <> 2 then raise exception 'expected 2 batch-7 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if sl <> 10 then raise exception 'expected 10 batch-7 style links, got %', sl; end if;
end $$;

commit;
