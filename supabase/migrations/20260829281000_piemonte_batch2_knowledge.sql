-- Knowledge for Piedmont batch 2 (5 places). PUBLISHED, verified facts only.
-- All principal grapes here (Pinot Nero, Chardonnay, Timorasso, Ruché,
-- Grignolino) are absent from the `grapes` table, so they are captured as
-- grape_varieties text and there are no grape links this batch.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.alta-langa',
   'Alta Langa — Piedmont''s benchmark traditional-method (Metodo Classico) sparkling wine, from Pinot Nero and/or Chardonnay grown high in the hills of Cuneo, Asti and Alessandria. Always vintage-dated, with long lees ageing.',
   'Pinot Nero, Chardonnay',
   array['Pinot Nero &/or Chardonnay','Traditional method, always vintage (millesimato)','≥30 months on the lees','DOCG since 2011 — Cuneo/Asti/Alessandria hills']::text[]),
  ('italy.piemonte.colli-tortonesi',
   'Colli Tortonesi — the Tortona hills of eastern Alessandria, famous for reviving Timorasso: a structured, age-worthy white often labelled ''Derthona''. Barbera and Croatina supply the reds.',
   'Timorasso, Barbera, Croatina',
   array['Timorasso (white, ''Derthona'') is the star','Also Barbera & Croatina reds','Tortona hills, E Alessandria','DOC since 1973']::text[]),
  ('italy.piemonte.ruche',
   'Ruché di Castagnole Monferrato — a rare aromatic red from the Ruché grape around Castagnole Monferrato in the Asti hills: perfumed of roses and spice, lightly tannic.',
   'Ruché',
   array['Ruché (aromatic red)','DOCG since 2010','Seven communes around Castagnole Monferrato (Asti)','Floral, rose-and-spice, lightly tannic']::text[]),
  ('italy.piemonte.grignolino-dasti',
   'Grignolino d''Asti — a pale, firm, low-colour red of real character from the Grignolino grape in the Asti hills: light in body, high in tannin, savoury.',
   'Grignolino',
   array['Grignolino (min 90%)','DOC','Asti hills','Pale, tannic, savoury — a connoisseur''s red']::text[]),
  ('italy.piemonte.grignolino-casalese',
   'Grignolino del Monferrato Casalese — the same characterful pale red on the Casale Monferrato side (Alessandria), often cited as Grignolino''s finest expression on the sandier Monferrato soils.',
   'Grignolino',
   array['Grignolino (min 90%)','DOC','Around Casale Monferrato (Alessandria)','Sandy soils — often Grignolino''s benchmark']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.alta-langa','SPARKLING',0),
  ('italy.piemonte.colli-tortonesi','WHITE',0), ('italy.piemonte.colli-tortonesi','RED',1),
  ('italy.piemonte.ruche','RED',0),
  ('italy.piemonte.grignolino-dasti','RED',0),
  ('italy.piemonte.grignolino-casalese','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche','italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese') and x.editorial_status='PUBLISHED';
  if a <> 5 then raise exception 'expected 5 batch-2 articles, got %', a; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche','italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese') and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 batch-2 style links, got %', sl; end if;
end $$;

commit;
