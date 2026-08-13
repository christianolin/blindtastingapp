-- Knowledge for Tuscany round 1 (23 places incl. the region overview).
-- PUBLISHED, verified facts. Grape links only for grapes in the table
-- (Sangiovese, Cabernet Sauvignon, Cabernet Franc, Merlot, Trebbiano);
-- Vernaccia / Moscato / Malvasia captured as grape_varieties text.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.toscana',
   'Tuscany — Italy''s most celebrated red-wine region and the homeland of Sangiovese: from the Chianti hills between Florence and Siena to Brunello di Montalcino, Vino Nobile di Montepulciano, the coastal Super Tuscan heartland of Bolgheri, and the white Vernaccia di San Gimignano.',
   'Sangiovese',
   array['Sangiovese is the signature grape','Chianti, Brunello, Vino Nobile, Bolgheri','Florence & Siena at its heart','Home of the ''Super Tuscans''']::text[]),
  ('italy.toscana.chianti-classico',
   'Chianti Classico — the historic core of Chianti between Florence and Siena, marked by the Gallo Nero (Black Rooster): Sangiovese-based reds of structure and finesse, topped by the Gran Selezione tier.',
   'Sangiovese',
   array['Sangiovese-based (min 80%)','DOCG — Gallo Nero (Black Rooster)','Between Florence and Siena','Annata / Riserva / Gran Selezione']::text[]),
  ('italy.toscana.chianti',
   'Chianti — the large DOCG spread across central Tuscany in seven subzones, from Rufina to the Colli Senesi: approachable, food-friendly Sangiovese reds.',
   'Sangiovese',
   array['Sangiovese-based','DOCG with 7 subzones','Across central Tuscany','Everyday, food-friendly reds']::text[]),
  ('italy.toscana.chianti-rufina',
   'Chianti Rufina — the smallest and most prestigious Chianti subzone, in the cool hills east of Florence along the Sieve: elegant, notably fresh, age-worthy Sangiovese.',
   'Sangiovese',
   array['Sangiovese','Smallest, most prestigious Chianti subzone','Cool hills east of Florence (Sieve valley)','Elegant, fresh, age-worthy']::text[]),
  ('italy.toscana.chianti-colli-fiorentini',
   'Chianti Colli Fiorentini — the hills around Florence just south of the city: supple, fragrant Sangiovese.',
   'Sangiovese',
   array['Sangiovese','DOCG subzone','Hills around Florence','Supple, fragrant reds']::text[]),
  ('italy.toscana.chianti-colli-senesi',
   'Chianti Colli Senesi — the largest subzone, in the hills around Siena stretching toward Montalcino and Montepulciano: warm, generous Sangiovese.',
   'Sangiovese',
   array['Sangiovese','Largest Chianti subzone','Hills around Siena','Warm, generous reds']::text[]),
  ('italy.toscana.chianti-colli-aretini',
   'Chianti Colli Aretini — the hills around Arezzo in eastern Tuscany: bright, easy-drinking Sangiovese.',
   'Sangiovese',
   array['Sangiovese','DOCG subzone','Hills around Arezzo (E Tuscany)','Bright, easy-drinking']::text[]),
  ('italy.toscana.chianti-colline-pisane',
   'Chianti Colline Pisane — the gentle hills near Pisa in western Tuscany: soft, light Sangiovese.',
   'Sangiovese',
   array['Sangiovese','DOCG subzone','Hills near Pisa (W Tuscany)','Soft, light reds']::text[]),
  ('italy.toscana.chianti-montalbano',
   'Chianti Montalbano — the Montalbano hills west of Florence (shared with Carmignano): rounded, approachable Sangiovese.',
   'Sangiovese',
   array['Sangiovese','DOCG subzone','Montalbano hills, W of Florence','Rounded, approachable']::text[]),
  ('italy.toscana.chianti-montespertoli',
   'Chianti Montespertoli — a small subzone around Montespertoli west of Florence, carved from the Colli Fiorentini: balanced Sangiovese.',
   'Sangiovese',
   array['Sangiovese','Smallest, newest Chianti subzone','Around Montespertoli (W of Florence)','Balanced reds']::text[]),
  ('italy.toscana.montalcino',
   'Montalcino — the hilltop town south of Siena whose warm, dry climate ripens Sangiovese (''Brunello'') to power and longevity, giving some of Italy''s most prestigious reds.',
   'Sangiovese',
   array['Sangiovese (''Brunello'')','South of Siena','Warm, dry — powerful, long-lived reds','Home of Brunello di Montalcino']::text[]),
  ('italy.toscana.brunello-di-montalcino',
   'Brunello di Montalcino — one of Italy''s greatest reds: 100% Sangiovese aged at least five years (two in oak), powerful, structured and extremely long-lived.',
   'Sangiovese',
   array['100% Sangiovese (''Brunello'')','DOCG since 1980','Minimum ~5 years ageing (2 in oak)','Powerful, age-worthy']::text[]),
  ('italy.toscana.rosso-di-montalcino',
   'Rosso di Montalcino — Brunello''s younger sibling: 100% Sangiovese from the same zone with shorter ageing, fresher and earlier-drinking.',
   'Sangiovese',
   array['100% Sangiovese','DOC','Same zone as Brunello, shorter ageing','Fresher, earlier-drinking']::text[]),
  ('italy.toscana.moscadello-di-montalcino',
   'Moscadello di Montalcino — Montalcino''s historic sweet white from Moscato Bianco, made still, lightly sparkling or as a late-harvest dessert wine.',
   'Moscato Bianco',
   array['Moscato Bianco','DOC','Montalcino''s historic sweet white','Still, frizzante or late-harvest']::text[]),
  ('italy.toscana.sant-antimo',
   'Sant''Antimo — Montalcino''s flexible DOC for wines made outside the Brunello rules: Sangiovese alongside international varieties (Cabernet, Merlot) and whites.',
   'Sangiovese, Cabernet, Merlot',
   array['Sangiovese + international varieties','DOC','Montalcino (outside the Brunello rules)','Reds and whites']::text[]),
  ('italy.toscana.montepulciano',
   'Montepulciano — the Renaissance hill town in south-east Tuscany whose local Sangiovese clone ''Prugnolo Gentile'' makes the noble Vino Nobile (not to be confused with the Montepulciano grape of Abruzzo).',
   'Sangiovese',
   array['Sangiovese (''Prugnolo Gentile'')','SE Tuscany hill town','Home of Vino Nobile','A place, not the Montepulciano grape']::text[]),
  ('italy.toscana.vino-nobile-di-montepulciano',
   'Vino Nobile di Montepulciano — a historic, aristocratic Sangiovese-based red (min 70% Prugnolo Gentile), elegant and structured; one of Italy''s first DOCGs.',
   'Sangiovese',
   array['Sangiovese (''Prugnolo Gentile'') min 70%','DOCG since 1980','Around Montepulciano','Elegant, aristocratic red']::text[]),
  ('italy.toscana.rosso-di-montepulciano',
   'Rosso di Montepulciano — the younger, fresher counterpart to Vino Nobile, from the same Sangiovese-based blend with shorter ageing.',
   'Sangiovese',
   array['Sangiovese-based','DOC','Same zone as Vino Nobile','Younger, fresher red']::text[]),
  ('italy.toscana.vin-santo-di-montepulciano',
   'Vin Santo di Montepulciano — a traditional dried-grape dessert wine from Trebbiano and Malvasia, slowly aged in small barrels (''caratelli'').',
   'Trebbiano, Malvasia',
   array['Trebbiano & Malvasia (dried grapes)','DOC','Slow-aged in caratelli','Traditional dessert wine']::text[]),
  ('italy.toscana.bolgheri',
   'Bolgheri — the coastal Maremma zone that launched the Super Tuscans: Bordeaux varieties (Cabernet Sauvignon, Merlot, Cabernet Franc) on maritime soils give rich, polished reds, alongside Vermentino whites.',
   'Cabernet Sauvignon, Merlot, Cabernet Franc, Vermentino',
   array['Bordeaux varieties (+ Vermentino whites)','DOC since 1994','Coastal Maremma (Livorno)','Birthplace of the Super Tuscans']::text[]),
  ('italy.toscana.bolgheri-sassicaia',
   'Bolgheri Sassicaia — Italy''s only single-estate DOC: the Cabernet-dominated wine of Tenuta San Guido that pioneered the Super Tuscan movement.',
   'Cabernet Sauvignon, Cabernet Franc',
   array['Cabernet Sauvignon-dominated','DOC — single estate (Tenuta San Guido)','Within Bolgheri','The original Super Tuscan']::text[]),
  ('italy.toscana.vernaccia-di-san-gimignano',
   'Vernaccia di San Gimignano — Tuscany''s most famous white, from the Vernaccia grape around the towered town of San Gimignano: crisp and savoury with a bitter-almond finish. Italy''s first DOC (1966), later DOCG.',
   'Vernaccia',
   array['Vernaccia (white)','Italy''s first DOC (1966), now DOCG','Around San Gimignano','Crisp, savoury, almond finish']::text[]),
  ('italy.toscana.morellino-di-scansano',
   'Morellino di Scansano — the Maremma''s leading red, from Sangiovese (locally ''Morellino'') around Scansano in southern Tuscany: warm, supple and approachable.',
   'Sangiovese',
   array['Sangiovese (local ''Morellino'')','DOCG since 2007','Around Scansano, southern Maremma','Warm, supple reds']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links (in-table grapes only).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Sangiovese' and p.canonical_key in (
        'italy.toscana.chianti-classico','italy.toscana.chianti','italy.toscana.chianti-rufina',
        'italy.toscana.chianti-colli-fiorentini','italy.toscana.chianti-colli-senesi','italy.toscana.chianti-colli-aretini',
        'italy.toscana.chianti-colline-pisane','italy.toscana.chianti-montalbano','italy.toscana.chianti-montespertoli',
        'italy.toscana.montalcino','italy.toscana.brunello-di-montalcino','italy.toscana.rosso-di-montalcino',
        'italy.toscana.sant-antimo','italy.toscana.montepulciano','italy.toscana.vino-nobile-di-montepulciano',
        'italy.toscana.rosso-di-montepulciano','italy.toscana.morellino-di-scansano'))
  or (g.name = 'Cabernet Sauvignon' and p.canonical_key in ('italy.toscana.bolgheri','italy.toscana.bolgheri-sassicaia'))
  or (g.name = 'Merlot' and p.canonical_key in ('italy.toscana.bolgheri'))
  or (g.name = 'Cabernet Franc' and p.canonical_key in ('italy.toscana.bolgheri-sassicaia'))
  or (g.name = 'Trebbiano' and p.canonical_key in ('italy.toscana.vin-santo-di-montepulciano'))
);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.toscana.chianti-classico','RED',0),
  ('italy.toscana.chianti','RED',0),
  ('italy.toscana.chianti-rufina','RED',0),
  ('italy.toscana.chianti-colli-fiorentini','RED',0),
  ('italy.toscana.chianti-colli-senesi','RED',0),
  ('italy.toscana.chianti-colli-aretini','RED',0),
  ('italy.toscana.chianti-colline-pisane','RED',0),
  ('italy.toscana.chianti-montalbano','RED',0),
  ('italy.toscana.chianti-montespertoli','RED',0),
  ('italy.toscana.montalcino','RED',0),
  ('italy.toscana.brunello-di-montalcino','RED',0),
  ('italy.toscana.rosso-di-montalcino','RED',0),
  ('italy.toscana.moscadello-di-montalcino','WHITE',0), ('italy.toscana.moscadello-di-montalcino','SWEET',1),
  ('italy.toscana.sant-antimo','RED',0), ('italy.toscana.sant-antimo','WHITE',1),
  ('italy.toscana.montepulciano','RED',0),
  ('italy.toscana.vino-nobile-di-montepulciano','RED',0),
  ('italy.toscana.rosso-di-montepulciano','RED',0),
  ('italy.toscana.vin-santo-di-montepulciano','SWEET',0),
  ('italy.toscana.bolgheri','RED',0), ('italy.toscana.bolgheri','WHITE',1),
  ('italy.toscana.bolgheri-sassicaia','RED',0),
  ('italy.toscana.vernaccia-di-san-gimignano','WHITE',0),
  ('italy.toscana.morellino-di-scansano','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key like 'italy.toscana%' and x.editorial_status='PUBLISHED';
  if a <> 23 then raise exception 'expected 23 Toscana articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key like 'italy.toscana%' and x.editorial_status='PUBLISHED';
  if gr <> 22 then raise exception 'expected 22 Toscana grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key like 'italy.toscana%' and x.editorial_status='PUBLISHED';
  if sl <> 24 then raise exception 'expected 24 Toscana style links, got %', sl; end if;
end $$;

commit;
