-- Knowledge for Piedmont batch 3 (7 Alto Piemonte DOCs). PUBLISHED, verified
-- facts. Nebbiolo (locally 'Spanna') is the principal of all seven and IS in
-- the grapes table, so each gets a Nebbiolo grape link; blend partners
-- (Vespolina, Uva Rara, Croatina, Erbaluce) are captured as grape_varieties text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.boca',
   'Boca — one of Alto Piemonte''s smallest, rarest reds: Nebbiolo (Spanna) with a little Vespolina and Uva Rara, on acidic volcanic porphyry soils in the Novara hills. Perfumed, mineral, age-worthy.',
   'Nebbiolo (Spanna), Vespolina, Uva Rara',
   array['Nebbiolo (Spanna)-based','DOC since 1969','Novara hills','Volcanic porphyry soils — perfumed, mineral']::text[]),
  ('italy.piemonte.bramaterra',
   'Bramaterra — a Nebbiolo (Spanna)-led red blended with Croatina, Uva Rara and Vespolina, on iron-rich volcanic soils between Biella and Vercelli. Structured and long-lived.',
   'Nebbiolo (Spanna), Croatina, Uva Rara, Vespolina',
   array['Nebbiolo (Spanna)-based blend','DOC since 1979','Between Biella & Vercelli','Volcanic soils — structured, ageworthy']::text[]),
  ('italy.piemonte.lessona',
   'Lessona — a tiny, prized Biella appellation: Nebbiolo (Spanna) on unusual acidic marine-sand soils, giving especially elegant, perfumed, fine-boned reds.',
   'Nebbiolo (Spanna)',
   array['Nebbiolo (Spanna), min 85%','DOC since 1976','Biella province','Marine-sand soils — elegant, fine-boned']::text[]),
  ('italy.piemonte.fara',
   'Fara — a small Novara-side red: Nebbiolo (Spanna) with Vespolina and Uva Rara, aromatic and supple, from the plains-edge hills.',
   'Nebbiolo (Spanna), Vespolina, Uva Rara',
   array['Nebbiolo (Spanna)-based','DOC since 1969','Novara province','Aromatic, supple']::text[]),
  ('italy.piemonte.sizzano',
   'Sizzano — a rare Novara red centred on the village of Sizzano: Nebbiolo (Spanna)-based with Vespolina and Uva Rara, structured and traditional.',
   'Nebbiolo (Spanna), Vespolina, Uva Rara',
   array['Nebbiolo (Spanna)-based','DOC since 1969','Village of Sizzano (Novara)','Structured, traditional']::text[]),
  ('italy.piemonte.colline-novaresi',
   'Colline Novaresi — the umbrella DOC for the Novara hills, covering Nebbiolo (Spanna), Vespolina and Uva Rara reds plus Erbaluce whites: the everyday face of northern Piedmont.',
   'Nebbiolo (Spanna), Vespolina, Uva Rara, Erbaluce',
   array['Province-wide Novara umbrella DOC','Spanna/Vespolina/Uva Rara reds + Erbaluce whites','DOC since 1994','The everyday Alto Piemonte']::text[]),
  ('italy.piemonte.coste-della-sesia',
   'Coste della Sesia — the umbrella DOC for the Biella and Vercelli hills along the Sesia: Nebbiolo (Spanna), Croatina, Vespolina and Uva Rara reds and rosés, plus Erbaluce whites.',
   'Nebbiolo (Spanna), Croatina, Vespolina, Uva Rara, Erbaluce',
   array['Biella/Vercelli umbrella DOC along the Sesia','Reds & rosés + Erbaluce whites','DOC since 1996','Companion to Gattinara, Lessona, Bramaterra']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Nebbiolo grape link for all seven.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on g.name = 'Nebbiolo'
where p.canonical_key in (
  'italy.piemonte.boca','italy.piemonte.bramaterra','italy.piemonte.lessona','italy.piemonte.fara',
  'italy.piemonte.sizzano','italy.piemonte.colline-novaresi','italy.piemonte.coste-della-sesia'
);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.boca','RED',0),
  ('italy.piemonte.bramaterra','RED',0),
  ('italy.piemonte.lessona','RED',0),
  ('italy.piemonte.fara','RED',0),
  ('italy.piemonte.sizzano','RED',0),
  ('italy.piemonte.colline-novaresi','RED',0), ('italy.piemonte.colline-novaresi','WHITE',1),
  ('italy.piemonte.coste-della-sesia','RED',0), ('italy.piemonte.coste-della-sesia','WHITE',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.boca','italy.piemonte.bramaterra','italy.piemonte.lessona','italy.piemonte.fara','italy.piemonte.sizzano','italy.piemonte.colline-novaresi','italy.piemonte.coste-della-sesia') and x.editorial_status='PUBLISHED';
  if a <> 7 then raise exception 'expected 7 batch-3 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.boca','italy.piemonte.bramaterra','italy.piemonte.lessona','italy.piemonte.fara','italy.piemonte.sizzano','italy.piemonte.colline-novaresi','italy.piemonte.coste-della-sesia') and x.editorial_status='PUBLISHED';
  if gr <> 7 then raise exception 'expected 7 batch-3 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.boca','italy.piemonte.bramaterra','italy.piemonte.lessona','italy.piemonte.fara','italy.piemonte.sizzano','italy.piemonte.colline-novaresi','italy.piemonte.coste-della-sesia') and x.editorial_status='PUBLISHED';
  if sl <> 9 then raise exception 'expected 9 batch-3 style links, got %', sl; end if;
end $$;

commit;
