-- Knowledge for Piedmont batch 5 (13 Asti/Monferrato denominations). PUBLISHED.
-- Grape links only for grapes in the table (Barbera, Nebbiolo, Arneis, Dolcetto);
-- Cortese/Freisa/Moscato/Malvasia/Gamba di Pernice captured as text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.barbera-del-monferrato',
   'Barbera del Monferrato — the everyday Barbera of the Monferrato hills, often with a little Freisa, Grignolino or Dolcetto: bright, tangy, sometimes lightly frizzante.',
   'Barbera (+ Freisa, Grignolino, Dolcetto)',
   array['Barbera-based (min 85%)','DOC','Monferrato hills (Asti/Alessandria)','Bright, tangy, everyday red']::text[]),
  ('italy.piemonte.barbera-del-monferrato-superiore',
   'Barbera del Monferrato Superiore — the ambitious, riper, oak-aged tier of Monferrato Barbera, promoted to DOCG: fuller-bodied and structured.',
   'Barbera',
   array['Barbera (min 85%)','DOCG since 2008','Monferrato hills','Riper, oak-aged, structured']::text[]),
  ('italy.piemonte.terre-alfieri',
   'Terre Alfieri — a DOCG on the Roero/Astigiano border: fragrant Arneis whites and structured Nebbiolo reds from the hills around San Damiano d''Asti.',
   'Arneis, Nebbiolo',
   array['Arneis (white) + Nebbiolo (red)','DOCG since 2020','Roero/Astigiano border, around San Damiano d''Asti','Perfumed whites, structured reds']::text[]),
  ('italy.piemonte.cortese-alto-monferrato',
   'Cortese dell''Alto Monferrato — a crisp, light dry white from Cortese in the southern Monferrato hills toward Acqui and Ovada, a country cousin of Gavi.',
   'Cortese',
   array['100% Cortese','DOC','Southern Monferrato (Acqui/Ovada)','Crisp, light dry white']::text[]),
  ('italy.piemonte.albugnano',
   'Albugnano — a small, high-altitude Nebbiolo enclave in the Basso Monferrato north of Asti, sometimes called ''the Barolo of Monferrato'': perfumed, fine-boned reds.',
   'Nebbiolo',
   array['Nebbiolo (min 85%)','DOC','Basso Monferrato, north of Asti','High-altitude, perfumed reds']::text[]),
  ('italy.piemonte.freisa-dasti',
   'Freisa d''Asti — the characterful Freisa grape around Asti: a tannic, lightly bitter red made dry or gently sweet and frizzante, a Piedmontese classic.',
   'Freisa',
   array['Freisa','DOC','Asti hills','Dry or lightly sweet/frizzante, tannic']::text[]),
  ('italy.piemonte.dolcetto-dasti',
   'Dolcetto d''Asti — soft, round, deeply coloured Dolcetto from the Asti hills: an easy, fruit-forward everyday red.',
   'Dolcetto',
   array['Dolcetto','DOC','Asti hills','Soft, fruit-forward everyday red']::text[]),
  ('italy.piemonte.canelli',
   'Canelli — the historic heart of Moscato around the town of Canelli, now its own DOCG: intensely aromatic, sweet, low-alcohol sparkling and frizzante whites from Moscato Bianco.',
   'Moscato Bianco',
   array['Moscato Bianco','DOCG since 2023','Around Canelli (Asti/Cuneo)','The historic cradle of Moscato']::text[]),
  ('italy.piemonte.calosso',
   'Calosso — a tiny appellation around the village of Calosso in the Asti hills, best known for the rare local red grape Gamba di Pernice.',
   'Gamba di Pernice, Barbera',
   array['Gamba di Pernice (rare local red)','DOC','Village of Calosso (Asti)','Distinctive, small-production red']::text[]),
  ('italy.piemonte.malvasia-di-casorzo',
   'Malvasia di Casorzo d''Asti — a sweet, aromatic, lightly sparkling red (and rosé) from aromatic Malvasia, around Casorzo on the Asti/Alessandria border.',
   'Malvasia di Casorzo',
   array['Malvasia (aromatic red)','DOC','Around Casorzo (Asti/Alessandria)','Sweet, lightly sparkling red']::text[]),
  ('italy.piemonte.loazzolo',
   'Loazzolo — one of Italy''s smallest DOCs: a rare, honeyed late-harvest Moscato passito dessert wine from the high hills of Loazzolo in southern Asti.',
   'Moscato Bianco',
   array['Moscato Bianco (passito)','DOC','Village of Loazzolo (southern Asti)','Rare honeyed dessert wine']::text[]),
  ('italy.piemonte.gabiano',
   'Gabiano — a tiny Barbera-based red from steep hills above the Po around Gabiano, in the far north-east of the Monferrato.',
   'Barbera (+ Freisa, Grignolino)',
   array['Barbera-based','DOC','Around Gabiano (Alessandria), above the Po','Small, structured red']::text[]),
  ('italy.piemonte.rubino-di-cantavenna',
   'Rubino di Cantavenna — a rare Barbera-led blend from a cluster of villages near Gabiano and Cantavenna in the NE Monferrato.',
   'Barbera (+ Grignolino, Freisa)',
   array['Barbera-led blend','DOC','Near Cantavenna/Gabiano (Alessandria)','Rare, small-production red']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links (in-table grapes only).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Barbera'  and p.canonical_key in ('italy.piemonte.barbera-del-monferrato','italy.piemonte.barbera-del-monferrato-superiore','italy.piemonte.gabiano','italy.piemonte.rubino-di-cantavenna'))
  or (g.name = 'Nebbiolo' and p.canonical_key in ('italy.piemonte.terre-alfieri','italy.piemonte.albugnano'))
  or (g.name = 'Arneis'   and p.canonical_key in ('italy.piemonte.terre-alfieri'))
  or (g.name = 'Dolcetto' and p.canonical_key in ('italy.piemonte.dolcetto-dasti'))
);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.barbera-del-monferrato','RED',0),
  ('italy.piemonte.barbera-del-monferrato-superiore','RED',0),
  ('italy.piemonte.terre-alfieri','RED',0), ('italy.piemonte.terre-alfieri','WHITE',1),
  ('italy.piemonte.cortese-alto-monferrato','WHITE',0),
  ('italy.piemonte.albugnano','RED',0),
  ('italy.piemonte.freisa-dasti','RED',0),
  ('italy.piemonte.dolcetto-dasti','RED',0),
  ('italy.piemonte.canelli','SPARKLING',0), ('italy.piemonte.canelli','SWEET',1),
  ('italy.piemonte.calosso','RED',0),
  ('italy.piemonte.malvasia-di-casorzo','SPARKLING',0), ('italy.piemonte.malvasia-di-casorzo','SWEET',1),
  ('italy.piemonte.loazzolo','SWEET',0),
  ('italy.piemonte.gabiano','RED',0),
  ('italy.piemonte.rubino-di-cantavenna','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  ckeys text[] := array[
    'italy.piemonte.barbera-del-monferrato','italy.piemonte.barbera-del-monferrato-superiore','italy.piemonte.terre-alfieri',
    'italy.piemonte.cortese-alto-monferrato','italy.piemonte.albugnano','italy.piemonte.freisa-dasti','italy.piemonte.dolcetto-dasti',
    'italy.piemonte.canelli','italy.piemonte.calosso','italy.piemonte.malvasia-di-casorzo','italy.piemonte.loazzolo',
    'italy.piemonte.gabiano','italy.piemonte.rubino-di-cantavenna'
  ];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if a <> 13 then raise exception 'expected 13 batch-5 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if gr <> 8 then raise exception 'expected 8 batch-5 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if sl <> 16 then raise exception 'expected 16 batch-5 style links, got %', sl; end if;
end $$;

commit;
