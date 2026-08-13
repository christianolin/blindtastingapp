-- Knowledge for Tuscany round 2 (12 DOC/DOCG zones). PUBLISHED, verified facts.
-- Grape links for in-table grapes; Syrah / Ansonica / Albarola as text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.toscana.carmignano',
   'Carmignano — a tiny, historic DOCG in the hills west of Florence, delimited by grand-ducal edict in 1716: Sangiovese blended with a little Cabernet (the old ''uva francesca''), long before the Super Tuscans.',
   'Sangiovese, Cabernet Sauvignon',
   array['Sangiovese + min ~10% Cabernet','DOCG since 1990','Hills west of Florence (Prato)','One of the oldest delimited wine zones (1716)']::text[]),
  ('italy.toscana.cortona',
   'Cortona — an eastern Tuscan DOC around the hill town of Cortona (Arezzo) that has made its name with powerful, ripe Syrah.',
   'Syrah, Merlot, Sangiovese',
   array['Best known for Syrah','DOC','Around Cortona (Arezzo)','Ripe, warm-climate reds']::text[]),
  ('italy.toscana.maremma-toscana',
   'Maremma Toscana — the broad coastal DOC of Grosseto province, covering Sangiovese and Vermentino as well as international varieties: the umbrella for Tuscany''s dynamic south-west coast.',
   'Sangiovese, Vermentino, Cabernet, Merlot',
   array['Coastal umbrella DOC (Grosseto)','Sangiovese & Vermentino + international','DOC since 2011','Tuscany''s dynamic south-western coast']::text[]),
  ('italy.toscana.montecucco',
   'Montecucco — the hills on the flanks of Monte Amiata just west of Montalcino: Sangiovese reds of increasing quality (with a Montecucco Sangiovese DOCG).',
   'Sangiovese',
   array['Sangiovese','DOC (+ Montecucco Sangiovese DOCG)','Amiata foothills, west of Montalcino','A value-driven Brunello neighbour']::text[]),
  ('italy.toscana.orcia',
   'Orcia — the scenic Val d''Orcia between Montalcino and Montepulciano (a UNESCO landscape): fresh, mid-weight Sangiovese reds.',
   'Sangiovese',
   array['Sangiovese','DOC','Val d''Orcia (UNESCO landscape)','Between Montalcino and Montepulciano']::text[]),
  ('italy.toscana.suvereto',
   'Suvereto — a small coastal DOCG in the Val di Cornia (Livorno), specialising in polished Bordeaux-variety reds (Cabernet, Merlot).',
   'Cabernet Sauvignon, Merlot',
   array['Bordeaux varieties (Cabernet, Merlot)','DOCG since 2011','Coastal Livorno (Val di Cornia)','Polished, structured reds']::text[]),
  ('italy.toscana.val-di-cornia',
   'Val di Cornia — a coastal DOC straddling Livorno and Pisa around Piombino: Sangiovese and Bordeaux-variety reds plus Vermentino whites.',
   'Sangiovese, Cabernet, Merlot, Vermentino',
   array['Sangiovese + Bordeaux varieties; Vermentino','DOC','Coastal Livorno/Pisa (Piombino)','Reds and whites']::text[]),
  ('italy.toscana.colline-lucchesi',
   'Colline Lucchesi — the hills around Lucca in north-west Tuscany: Sangiovese-based reds alongside fresh whites.',
   'Sangiovese',
   array['Sangiovese-based reds + whites','DOC','Hills around Lucca','North-west Tuscany']::text[]),
  ('italy.toscana.montecarlo',
   'Montecarlo — a DOC east of Lucca long known for characterful whites built on Trebbiano with French varieties, alongside Sangiovese-based reds.',
   'Trebbiano, Sangiovese',
   array['Whites (Trebbiano + French varieties)','DOC','East of Lucca','Also Sangiovese-based reds']::text[]),
  ('italy.toscana.elba',
   'Elba — the island DOC off the Tuscan coast: Sangiovese reds, Ansonica and Vermentino whites, and the famed sweet Aleatico passito.',
   'Sangiovese, Vermentino, Ansonica, Aleatico',
   array['Island DOC (Tuscan Archipelago)','Sangiovese reds; Ansonica/Vermentino whites','Famed sweet Aleatico passito','Off the Tuscan coast']::text[]),
  ('italy.toscana.pomino',
   'Pomino — a small, high-altitude DOC in the cool hills above Rufina, historically noted for elegant whites (Chardonnay, Pinot) as well as Sangiovese-based reds.',
   'Sangiovese, Chardonnay, Pinot',
   array['Sangiovese reds + elegant whites','DOC','High hills above Rufina','Cool-climate, historic Frescobaldi estate']::text[]),
  ('italy.toscana.candia-dei-colli-apuani',
   'Candia dei Colli Apuani — a DOC on the steep Apuan slopes above Massa and Carrara: fresh whites led by Vermentino, plus some red.',
   'Vermentino',
   array['Vermentino-led whites','DOC','Apuan slopes above Massa/Carrara','North-west corner of Tuscany']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links (in-table grapes only).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Sangiovese' and p.canonical_key in (
        'italy.toscana.carmignano','italy.toscana.maremma-toscana','italy.toscana.montecucco','italy.toscana.orcia',
        'italy.toscana.val-di-cornia','italy.toscana.colline-lucchesi','italy.toscana.elba','italy.toscana.pomino'))
  or (g.name = 'Cabernet Sauvignon' and p.canonical_key in ('italy.toscana.carmignano','italy.toscana.suvereto'))
  or (g.name = 'Merlot' and p.canonical_key in ('italy.toscana.suvereto'))
  or (g.name = 'Vermentino' and p.canonical_key in (
        'italy.toscana.maremma-toscana','italy.toscana.val-di-cornia','italy.toscana.elba','italy.toscana.candia-dei-colli-apuani'))
  or (g.name = 'Trebbiano' and p.canonical_key in ('italy.toscana.montecarlo'))
)
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.toscana.carmignano','RED',0),
  ('italy.toscana.cortona','RED',0),
  ('italy.toscana.maremma-toscana','RED',0), ('italy.toscana.maremma-toscana','WHITE',1),
  ('italy.toscana.montecucco','RED',0),
  ('italy.toscana.orcia','RED',0),
  ('italy.toscana.suvereto','RED',0),
  ('italy.toscana.val-di-cornia','RED',0), ('italy.toscana.val-di-cornia','WHITE',1),
  ('italy.toscana.colline-lucchesi','RED',0), ('italy.toscana.colline-lucchesi','WHITE',1),
  ('italy.toscana.montecarlo','RED',0), ('italy.toscana.montecarlo','WHITE',1),
  ('italy.toscana.elba','RED',0), ('italy.toscana.elba','WHITE',1),
  ('italy.toscana.pomino','RED',0), ('italy.toscana.pomino','WHITE',1),
  ('italy.toscana.candia-dei-colli-apuani','WHITE',0), ('italy.toscana.candia-dei-colli-apuani','RED',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  ckeys text[] := array[
    'italy.toscana.carmignano','italy.toscana.cortona','italy.toscana.maremma-toscana','italy.toscana.montecucco',
    'italy.toscana.orcia','italy.toscana.suvereto','italy.toscana.val-di-cornia','italy.toscana.colline-lucchesi',
    'italy.toscana.montecarlo','italy.toscana.elba','italy.toscana.pomino','italy.toscana.candia-dei-colli-apuani'
  ];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if a <> 12 then raise exception 'expected 12 round-2 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if gr <> 16 then raise exception 'expected 16 round-2 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(ckeys) and x.editorial_status='PUBLISHED';
  if sl <> 19 then raise exception 'expected 19 round-2 style links, got %', sl; end if;
end $$;

commit;
