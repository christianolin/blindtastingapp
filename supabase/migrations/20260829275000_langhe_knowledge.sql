-- Knowledge content for the Langhe subregion + its new appellations.
-- All PUBLISHED (only status the RPC/RLS + client render). Verified facts only.

begin;

-- Articles (grape_varieties left null where a wine_place_grapes link exists;
-- set only for Verduno Pelaverga, whose grape isn't in the grapes table).
insert into wine_place_articles (wine_place_id, description, soils, climate, grape_varieties, key_facts, editorial_status)
select p.id, v.descr, v.soils, v.clim, v.gv, v.kf, 'PUBLISHED'
from (values
  ('italy.piemonte.langhe',
   'The Langhe — the hills south of the Tanaro around Alba (Cuneo) — is the heart of Piedmont''s greatest reds. Nebbiolo peaks here as Barolo and Barbaresco, alongside Dolcetto, Barbera and the white Arneis. The Langhe DOC is the flexible, district-wide appellation uniting them across red, white and varietal wines.',
   'Calcareous Tortonian (Sant''Agata) marls to the west and north; sandier Serravallian formations to the east.',
   'Continental, with the autumn fog (nebbia) that names Nebbiolo; hillside vineyards ~200–500 m.',
   null::text,
   array['Hills south of the Tanaro around Alba (Cuneo)','Home of Barolo & Barbaresco (Nebbiolo)','Langhe DOC = district-wide catch-all: red, white & varietal','UNESCO World Heritage vineyard landscape (2014)']::text[]),
  ('italy.piemonte.dogliani',
   'Dogliani, in the hills southwest of Barolo, is the benchmark for Dolcetto — deep, plummy, low-acid reds. Long the grape''s spiritual home, elevated to DOCG in 2011.',
   'Marls and sandstones of the Dogliani/Monregalese hills.', null::text, null::text,
   array['100% Dolcetto','DOCG since 2011 (Dolcetto di Dogliani DOC from 1974)','Dogliani/Monregalese hills, province of Cuneo','~21 comuni']::text[]),
  ('italy.piemonte.diano-dalba',
   'Diano d''Alba is a single-comune DOCG for Dolcetto, on the hill between Barolo and Barbaresco, famous for its sun-facing ''sorì''. Fuller and more structured than most Dolcetto.',
   null::text, null::text, null::text,
   array['100% Dolcetto','DOCG since 2010','Single comune: Diano d''Alba (Cuneo)','77 named ''sorì'' crus']::text[]),
  ('italy.piemonte.verduno-pelaverga',
   'A tiny, distinctive DOC around the village of Verduno at Barolo''s northern edge, made from the rare Pelaverga piccolo grape — light, peppery, floral reds found almost nowhere else.',
   null::text, null::text, 'Pelaverga piccolo (min 85%)',
   array['≥85% Pelaverga piccolo','DOC since 1995','Verduno (+ parts of La Morra & Roddi), Cuneo','One of Piedmont''s rarest reds']::text[]),
  ('italy.piemonte.barbera-dalba',
   'Barbera d''Alba is the Alba-area expression of Barbera: deep colour, bright acidity, low tannin — a versatile everyday red spread across the Langhe and into Roero.',
   null::text, null::text, null::text,
   array['≥85% Barbera','DOC since 1970','Around Alba: Langhe + parts of Roero','Piedmont''s most-planted red grape']::text[]),
  ('italy.piemonte.dolcetto-dalba',
   'Dolcetto d''Alba — soft, fruity, early-drinking reds from the Langhe hills around Alba, planted on the cooler sites Nebbiolo doesn''t claim. The everyday red of the district.',
   null::text, null::text, null::text,
   array['100% Dolcetto','DOC since 1974','Langhe around Alba (Cuneo)','Soft, early-drinking']::text[]),
  ('italy.piemonte.nebbiolo-dalba',
   'Nebbiolo d''Alba is Nebbiolo grown around Alba outside the Barolo and Barbaresco zones, on both sides of the Tanaro (Langhe and Roero). Lighter and earlier-maturing than its famous neighbours.',
   null::text, null::text, null::text,
   array['100% Nebbiolo','DOC since 1970','Around Alba: Langhe + Roero (excl. Barolo/Barbaresco)','Approachable, earlier-drinking Nebbiolo']::text[])
) as v(ck, descr, soils, clim, gv, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape links (PRINCIPAL). Dolcetto → dogliani/diano/dolcetto-dalba(+langhe);
-- Nebbiolo → nebbiolo-dalba(+langhe); Barbera → barbera-dalba(+langhe); Arneis → langhe.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true,
       case when p.canonical_key = 'italy.piemonte.langhe' then null else 100 end, 'PUBLISHED'
from wine_places p
join grapes g on (
     (g.name = 'Dolcetto'  and p.canonical_key in ('italy.piemonte.dogliani','italy.piemonte.diano-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.langhe'))
  or (g.name = 'Nebbiolo'  and p.canonical_key in ('italy.piemonte.nebbiolo-dalba','italy.piemonte.langhe'))
  or (g.name = 'Barbera'   and p.canonical_key in ('italy.piemonte.barbera-dalba','italy.piemonte.langhe'))
  or (g.name = 'Arneis'    and p.canonical_key in ('italy.piemonte.langhe'))
);

-- Style links. RED for all; + WHITE for the mixed Langhe DOC.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, 'RED', 0, 'PUBLISHED' from wine_places p
where p.canonical_key in ('italy.piemonte.langhe','italy.piemonte.dogliani','italy.piemonte.diano-dalba',
      'italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba');
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, 'WHITE', 1, 'PUBLISHED' from wine_places p where p.canonical_key = 'italy.piemonte.langhe';

-- Fail-closed assertions.
do $$
declare a int; gr int; st int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.canonical_key in ('italy.piemonte.langhe','italy.piemonte.dogliani','italy.piemonte.diano-dalba','italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba') and x.editorial_status='PUBLISHED';
  if a <> 7 then raise exception 'expected 7 new articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.piemonte.%' and p.canonical_key not in ('italy.piemonte.barolo','italy.piemonte.barbaresco') and x.editorial_status='PUBLISHED';
  if gr <> 9 then raise exception 'expected 9 grape links, got %', gr; end if;
  select count(*) into st from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.piemonte.%' and x.editorial_status='PUBLISHED' and p.canonical_key <> 'italy.piemonte.barolo' and p.canonical_key <> 'italy.piemonte.barbaresco';
  if st <> 8 then raise exception 'expected 8 new style links, got %', st; end if;
end $$;

commit;
