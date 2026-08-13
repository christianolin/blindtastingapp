-- Fill out the Piemonte and Toscana region Details to France's depth
-- (Intro / Climate / Soils / Key facts / Grapes / Wine styles), and link real
-- grape entities to the two regions and to the round-1 appellations that were
-- previously grape_varieties text only (now that those grapes exist).

begin;

update wine_place_articles x set
  description = 'Piedmont (''the foot of the mountains'') is Italy''s kingdom of Nebbiolo, ringed by the Alps and Apennines. Its patchwork of hilly denominations — Barolo, Barbaresco, the Langhe, Monferrato, Roero and the volcanic north — is built on native grapes and single-vineyard tradition rather than international blends.',
  climate = 'Continental: cold, foggy winters, warm summers and marked day–night temperature swings. Autumn fog (nebbia) shrouds the Langhe as late-ripening Nebbiolo comes in.',
  soils = 'Calcareous marls and clays (the Langhe''s Tortonian and Serravallian marls), sandier soils in Roero, and iron-rich volcanic porphyry in Alto Piemonte.',
  grape_varieties = 'Nebbiolo, Barbera, Dolcetto, Moscato, Cortese and Arneis, plus Grignolino, Brachetto, Freisa and the Alto Piemonte''s Vespolina and Uva Rara.',
  wine_styles = 'Structured, age-worthy reds (Barolo, Barbaresco), everyday reds (Barbera, Dolcetto), aromatic sweet sparkling (Asti, Brachetto), crisp whites (Gavi, Roero Arneis) and traditional-method sparkling (Alta Langa).',
  key_facts = array[
    'Italy''s kingdom of Nebbiolo — home of Barolo & Barbaresco',
    'More DOCG zones than any other Italian region',
    'Native grapes and single-vineyard (MGA) tradition',
    'UNESCO World Heritage vineyard landscapes (2014)'
  ]::text[]
from wine_places p where p.id = x.wine_place_id and p.canonical_key = 'italy.piemonte';

update wine_place_articles x set
  description = 'Tuscany is the heartland of Sangiovese and of Italian fine wine, its rolling hills running from the Chianti country between Florence and Siena to the hilltop towns of Montalcino and Montepulciano and the Bordeaux-inspired ''Super Tuscan'' coast at Bolgheri.',
  climate = 'Warm Mediterranean, tempered by altitude in the inland hills and by sea breezes on the Maremma coast; long dry summers and marked diurnal shifts favour Sangiovese.',
  soils = 'Famously galestro (crumbly clay-schist) and alberese (compact limestone) in Chianti and Montalcino, with sandier, gravelly maritime soils along the Bolgheri coast.',
  grape_varieties = 'Sangiovese above all, with Canaiolo, Colorino and Ciliegiolo; Bordeaux varieties (Cabernet, Merlot) on the coast; and the whites Vernaccia, Vermentino, Trebbiano and Malvasia.',
  wine_styles = 'Structured Sangiovese reds (Chianti Classico, Brunello, Vino Nobile), Bordeaux-blend Super Tuscans (Bolgheri), crisp whites (Vernaccia di San Gimignano) and Vin Santo dessert wines.',
  key_facts = array[
    'Homeland of Sangiovese',
    'Chianti Classico, Brunello and Vino Nobile',
    'Birthplace of the Super Tuscans (Bolgheri)',
    'Vernaccia di San Gimignano — a famed white'
  ]::text[]
from wine_places p where p.id = x.wine_place_id and p.canonical_key = 'italy.toscana';

-- Grape entity links (regions + retro-fill of round-1 appellations). Idempotent.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  -- Piemonte region
  ('Nebbiolo','italy.piemonte'), ('Barbera','italy.piemonte'), ('Dolcetto','italy.piemonte'),
  ('Moscato','italy.piemonte'), ('Cortese','italy.piemonte'), ('Arneis','italy.piemonte'),
  -- Toscana region
  ('Sangiovese','italy.toscana'), ('Canaiolo','italy.toscana'), ('Colorino','italy.toscana'),
  ('Vernaccia','italy.toscana'), ('Vermentino','italy.toscana'), ('Trebbiano','italy.toscana'),
  ('Cabernet Sauvignon','italy.toscana'), ('Merlot','italy.toscana'),
  -- Retro-fill Piemonte appellations (grape now exists)
  ('Cortese','italy.piemonte.gavi'), ('Cortese','italy.piemonte.cortese-alto-monferrato'),
  ('Moscato','italy.piemonte.asti'), ('Moscato','italy.piemonte.canelli'), ('Moscato','italy.piemonte.loazzolo'),
  ('Brachetto','italy.piemonte.brachetto-dacqui'),
  ('Grignolino','italy.piemonte.grignolino-dasti'), ('Grignolino','italy.piemonte.grignolino-casalese'),
  ('Ruché','italy.piemonte.ruche'), ('Timorasso','italy.piemonte.colli-tortonesi'),
  ('Erbaluce','italy.piemonte.erbaluce-di-caluso'), ('Freisa','italy.piemonte.freisa-dasti'),
  ('Pelaverga','italy.piemonte.verduno-pelaverga'),
  -- Retro-fill Toscana appellations
  ('Vernaccia','italy.toscana.vernaccia-di-san-gimignano'),
  ('Malvasia','italy.toscana.vin-santo-di-montepulciano'),
  ('Moscato','italy.toscana.moscadello-di-montalcino')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (
  select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id
);

do $$
declare pc int; tc int; pg int; tg int;
begin
  select count(*) into pc from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key='italy.piemonte' and x.climate is not null and x.soils is not null;
  select count(*) into tc from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key='italy.toscana' and x.climate is not null and x.soils is not null;
  if pc <> 1 or tc <> 1 then raise exception 'region articles not enriched (piemonte=%, toscana=%)', pc, tc; end if;
  select count(*) into pg from wine_place_grapes wg join wine_places p on p.id=wg.wine_place_id where p.canonical_key='italy.piemonte';
  select count(*) into tg from wine_place_grapes wg join wine_places p on p.id=wg.wine_place_id where p.canonical_key='italy.toscana';
  if pg < 6 or tg < 8 then raise exception 'region grape links missing (piemonte=%, toscana=%)', pg, tg; end if;
end $$;

commit;
