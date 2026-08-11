-- Knowledge for Piedmont batch 1 (10 places). PUBLISHED, verified facts only.
-- Grape links only for grapes in the `grapes` table (Nebbiolo, Barbera, Arneis);
-- Cortese/Moscato/Brachetto captured in grape_varieties text instead.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.roero',
   'Roero — the sandy hills on the left (north) bank of the Tanaro, facing Langhe. Nebbiolo reds and, above all, the aromatic white Arneis that put the grape back on the map.',
   null::text,
   array['Nebbiolo (red) + Arneis (white)','DOCG since 2004','North bank of the Tanaro, facing Langhe','Sandier soils — earlier-drinking, perfumed']::text[]),
  ('italy.piemonte.gavi',
   'Gavi (Cortese di Gavi) — Piedmont''s benchmark dry white, from Cortese grown around the town of Gavi in the far south-east toward Liguria. Crisp, mineral, citrus and almond.',
   'Cortese',
   array['100% Cortese','DOCG since 1998','Around Gavi, SE Piedmont (Alessandria)','Piedmont''s flagship dry white']::text[]),
  ('italy.piemonte.monferrato',
   'Monferrato — the rolling hills between the Po and the Apennines, east of the Langhe. Barbera country above all, plus Grignolino, Freisa, Ruchè, and the sweet sparklers Moscato and Brachetto.',
   null::text,
   array['Barbera heartland (+ Grignolino, Freisa, Ruchè)','Also Moscato d''Asti & Brachetto d''Acqui','Between the Po and the Apennines, E of Langhe','UNESCO World Heritage landscape (2014)']::text[]),
  ('italy.piemonte.barbera-dasti',
   'Barbera d''Asti — the top expression of Barbera, from the Monferrato hills around Asti. Deep, vibrant, food-friendly reds.',
   null::text,
   array['≥90% Barbera','DOCG since 2008','Monferrato hills around Asti','Nizza is its grand cru']::text[]),
  ('italy.piemonte.nizza',
   'Nizza — the prestige heart of Barbera d''Asti, a DOCG in its own right since 2014: riper, more structured 100% Barbera from the best hills around Nizza Monferrato.',
   null::text,
   array['100% Barbera','DOCG since 2014','Best hills around Nizza Monferrato','The grand cru of Barbera d''Asti']::text[]),
  ('italy.piemonte.asti',
   'Asti — the vast Moscato zone across the Asti, Cuneo and Alessandria hills: sweet, low-alcohol sparkling Asti Spumante and the gently frizzante Moscato d''Asti, from aromatic Moscato Bianco.',
   'Moscato Bianco',
   array['Moscato Bianco','DOCG since 1993','Asti, Cuneo & Alessandria provinces','Asti Spumante + Moscato d''Asti']::text[]),
  ('italy.piemonte.brachetto-dacqui',
   'Brachetto d''Acqui — sweet, low-alcohol, aromatic sparkling RED around Acqui Terme, from the Brachetto grape: strawberry-and-rose fizz.',
   'Brachetto',
   array['Brachetto','DOCG since 1996','Around Acqui Terme (Alessandria/Asti)','Sweet aromatic sparkling red']::text[]),
  ('italy.piemonte.gattinara',
   'Gattinara — the star of Alto Piemonte: age-worthy Nebbiolo (locally ''Spanna'') on acidic, iron-rich porphyry soils north of the Po. Perfumed, structured, long-lived.',
   null::text,
   array['≥90% Nebbiolo (Spanna)','DOCG since 1990','Around Gattinara (Vercelli)','Volcanic/porphyry soils — mineral, ageworthy']::text[]),
  ('italy.piemonte.ghemme',
   'Ghemme — Gattinara''s neighbour across the Sesia on the Novara side: Nebbiolo-based, elegant and structured, on glacial gravel and clay.',
   null::text,
   array['≥85% Nebbiolo (Spanna)','DOCG since 1997','Around Ghemme (Novara)','Glacial soils — elegant, structured']::text[]),
  ('italy.piemonte.alto-piemonte',
   'Alto Piemonte — the northern hills of Novara, Vercelli and Biella: a Nebbiolo (Spanna) heartland of small, historic denominations on volcanic and glacial soils. Gattinara and Ghemme lead; Boca, Bramaterra, Lessona and others follow.',
   null::text,
   array['Nebbiolo (Spanna) north of the Po','Gattinara & Ghemme are the DOCGs','Volcanic & glacial soils','A rising star for mineral, age-worthy Nebbiolo']::text[])
) as v(ck, descr, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links (grapes present in the table only).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Nebbiolo' and p.canonical_key in ('italy.piemonte.roero','italy.piemonte.gattinara','italy.piemonte.ghemme','italy.piemonte.alto-piemonte'))
  or (g.name = 'Arneis'   and p.canonical_key in ('italy.piemonte.roero'))
  or (g.name = 'Barbera'  and p.canonical_key in ('italy.piemonte.monferrato','italy.piemonte.barbera-dasti','italy.piemonte.nizza'))
);

-- Style links.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.piemonte.roero','RED',0), ('italy.piemonte.roero','WHITE',1),
  ('italy.piemonte.gavi','WHITE',0),
  ('italy.piemonte.monferrato','RED',0), ('italy.piemonte.monferrato','WHITE',1),
  ('italy.piemonte.barbera-dasti','RED',0),
  ('italy.piemonte.nizza','RED',0),
  ('italy.piemonte.asti','SPARKLING',0), ('italy.piemonte.asti','SWEET',1),
  ('italy.piemonte.brachetto-dacqui','SPARKLING',0), ('italy.piemonte.brachetto-dacqui','SWEET',1),
  ('italy.piemonte.gattinara','RED',0),
  ('italy.piemonte.ghemme','RED',0),
  ('italy.piemonte.alto-piemonte','RED',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.roero','italy.piemonte.gavi','italy.piemonte.monferrato','italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.asti','italy.piemonte.brachetto-dacqui','italy.piemonte.gattinara','italy.piemonte.ghemme','italy.piemonte.alto-piemonte') and x.editorial_status='PUBLISHED';
  if a <> 10 then raise exception 'expected 10 batch-1 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key in ('italy.piemonte.roero','italy.piemonte.monferrato','italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.gattinara','italy.piemonte.ghemme','italy.piemonte.alto-piemonte') and x.editorial_status='PUBLISHED';
  if gr <> 8 then raise exception 'expected 8 batch-1 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.piemonte.%' and x.editorial_status='PUBLISHED' and p.sort_order >= 20 and p.display_tier >= 2 and p.canonical_key not in ('italy.piemonte.langhe','italy.piemonte.barolo','italy.piemonte.barbaresco','italy.piemonte.dogliani','italy.piemonte.diano-dalba','italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba');
  if sl <> 14 then raise exception 'expected 14 batch-1 style links, got %', sl; end if;
end $$;

commit;
