-- Knowledge for Tuscany round 3 (3 non-overlapping DOCs). PUBLISHED.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.toscana.colli-di-luni',
   'Colli di Luni — a DOC straddling the Lunigiana on the Liguria–Tuscany border, best known for crisp Vermentino whites alongside Sangiovese-based reds.',
   'Vermentino, Sangiovese',
   'Coastal Mediterranean, moderated by the Ligurian Sea and sheltered by the Apuan Alps.',
   'Sandy, stony alluvial soils of the Magra valley and its terraced hillsides.',
   array['Vermentino whites + Sangiovese reds','DOC — shared with eastern Liguria','Lunigiana, NW corner of Tuscany','Crisp, saline, coastal wines']::text[]),
  ('italy.toscana.montescudaio',
   'Montescudaio — a DOC in the hills behind Cecina in Pisa province: Sangiovese-based reds and fresh whites in a warm coastal-hinterland setting.',
   'Sangiovese',
   'Warm coastal-hinterland Mediterranean, tempered by proximity to the Tyrrhenian Sea.',
   'Sandy clays and marine sediments of the low hills behind the Cecina valley.',
   array['Sangiovese-based reds + whites','DOC','Hills behind Cecina (Pisa province)','Warm coastal hinterland']::text[]),
  ('italy.toscana.terratico-di-bibbona',
   'Terratico di Bibbona — a small coastal DOC around Bibbona just north of Bolgheri: Sangiovese and Bordeaux-variety reds plus whites on the Livorno coast.',
   'Sangiovese, Cabernet, Merlot',
   'Maritime Mediterranean, mild and breezy on the Livorno coast, much like neighbouring Bolgheri.',
   'Coastal sands, gravels and clays of the Maremma Pisana littoral.',
   array['Sangiovese + Bordeaux-variety reds; whites','DOC','Around Bibbona, just north of Bolgheri','Livorno coast']::text[])
) as v(ck, descr, gv, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Vermentino' and p.canonical_key in ('italy.toscana.colli-di-luni'))
  or (g.name = 'Sangiovese' and p.canonical_key in ('italy.toscana.colli-di-luni','italy.toscana.montescudaio','italy.toscana.terratico-di-bibbona'))
)
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.toscana.colli-di-luni','WHITE',0), ('italy.toscana.colli-di-luni','RED',1),
  ('italy.toscana.montescudaio','RED',0), ('italy.toscana.montescudaio','WHITE',1),
  ('italy.toscana.terratico-di-bibbona','RED',0), ('italy.toscana.terratico-di-bibbona','WHITE',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  ckeys text[] := array['italy.toscana.colli-di-luni','italy.toscana.montescudaio','italy.toscana.terratico-di-bibbona'];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if a <> 3 then raise exception 'expected 3 round-3 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if gr <> 4 then raise exception 'expected 4 round-3 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 round-3 style links, got %', sl; end if;
end $$;

commit;
