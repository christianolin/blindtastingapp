-- Knowledge for Piedmont batch 4 (Canavese subregion). PUBLISHED, verified.
-- Nebbiolo (in the grapes table) is the principal red of Canavese and Carema;
-- Erbaluce (white) is captured as grape_varieties text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.canavese',
   'Canavese — the hills of the Ivrea morainic amphitheatre north of Turin: an umbrella DOC for Nebbiolo, Barbera and Freisa reds plus Erbaluce whites and rosés, around the glacial lakes of the Canavese.',
   'Nebbiolo, Barbera, Freisa, Erbaluce',
   array['Umbrella DOC north of Turin (Ivrea amphitheatre)','Nebbiolo/Barbera/Freisa reds + Erbaluce whites','DOC since 1996','Glacial morainic hills and lakes']::text[]),
  ('italy.piemonte.erbaluce-di-caluso',
   'Erbaluce di Caluso — the Canavese''s signature white, from the versatile Erbaluce grape: crisp still wines, traditional-method sparkling, and the prized Caluso Passito (dried-grape sweet wine).',
   'Erbaluce',
   array['Erbaluce (white)','DOCG since 2010 (also called Caluso)','Still, Metodo Classico sparkling & Passito','Morainic hills around Caluso, north of Turin']::text[]),
  ('italy.piemonte.carema',
   'Carema — a rare alpine Nebbiolo from steep, stone-pillared terraces on the Valle d''Aosta border: elegant, perfumed, high-altitude reds in the far north of Piedmont.',
   'Nebbiolo (Picotendro)',
   array['Nebbiolo (min 85%, local ''Picotendro'')','DOC since 1967','Steep terraces on the Valle d''Aosta border','Alpine — elegant, perfumed, ageworthy']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Nebbiolo grape link for Canavese (umbrella red) and Carema.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on g.name = 'Nebbiolo'
where p.canonical_key in ('italy.piemonte.canavese','italy.piemonte.carema');

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.canavese','RED',0), ('italy.piemonte.canavese','WHITE',1),
  ('italy.piemonte.erbaluce-di-caluso','WHITE',0), ('italy.piemonte.erbaluce-di-caluso','SPARKLING',1), ('italy.piemonte.erbaluce-di-caluso','SWEET',2),
  ('italy.piemonte.carema','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.canavese','italy.piemonte.erbaluce-di-caluso','italy.piemonte.carema') and x.editorial_status='PUBLISHED';
  if a <> 3 then raise exception 'expected 3 batch-4 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.canavese','italy.piemonte.erbaluce-di-caluso','italy.piemonte.carema') and x.editorial_status='PUBLISHED';
  if gr <> 2 then raise exception 'expected 2 batch-4 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.canavese','italy.piemonte.erbaluce-di-caluso','italy.piemonte.carema') and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 batch-4 style links, got %', sl; end if;
end $$;

commit;
