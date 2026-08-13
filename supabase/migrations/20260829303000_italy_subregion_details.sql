-- Fill Climate + Soils on the Piemonte and Toscana subregion Details (they
-- already have Intro/Key facts/Grapes). Langhe already carries them. Also give
-- Alto Piemonte its Nebbiolo (Spanna) grape link so its Grapes section shows a
-- chip rather than nothing.

begin;

update wine_place_articles x set climate = v.climate, soils = v.soils
from (values
  ('italy.piemonte.monferrato',
   'Continental, with warm summers and cold winters; the rolling Monferrato hills are lower and gentler than the Langhe, with good airflow.',
   'Calcareous clays and sands (the sabbie astiane) — lighter, sandier soils than the Langhe''s marls.'),
  ('italy.piemonte.alto-piemonte',
   'Cooler and wetter than southern Piedmont, moderated by the Alps to the north; a longer, later growing season for Nebbiolo (Spanna).',
   'Acidic, iron-rich volcanic soils — porphyry, and at Gattinara the pink volcanic rock — plus glacial moraine, unusual terroir for Nebbiolo.'),
  ('italy.piemonte.canavese',
   'Cool sub-alpine, moderated by the morainic amphitheatre of Ivrea and its glacial lakes north of Turin.',
   'Glacial moraine — acidic, stony, mineral-rich soils left by ancient Alpine glaciers.'),
  ('italy.toscana.chianti',
   'Warm Mediterranean tempered by altitude; hot summers with cool nights across the hills between Florence and Siena.',
   'Galestro (crumbly clay-schist) and alberese (compact limestone), with sandstone and clay in the outlying subzones.'),
  ('italy.toscana.montalcino',
   'The warmest and driest corner of the Sangiovese heartland, sheltered by Monte Amiata; long, even ripening for powerful Brunello.',
   'Varied — galestro and alberese higher up, with clay, marine sediments and volcanic influence from Monte Amiata lower down.'),
  ('italy.toscana.montepulciano',
   'Warm, well-ventilated hills in south-east Tuscany; slightly cooler and later-ripening than neighbouring Montalcino.',
   'Sandy pliocene soils with clay and marine sediments, giving Vino Nobile its perfume and elegance.'),
  ('italy.toscana.bolgheri',
   'Maritime Mediterranean, warmed and moderated by the Tyrrhenian Sea; mild and breezy with little frost — ideal for Bordeaux varieties.',
   'Diverse alluvial and coastal soils — gravel, sand, clay and marine deposits on the plain and low hills below Castagneto Carducci.')
) as v(ck, climate, soils)
join wine_places p on p.canonical_key = v.ck
where p.id = x.wine_place_id;

-- Alto Piemonte -> Nebbiolo grape chip.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from wine_places p join grapes g on g.name = 'Nebbiolo'
where p.canonical_key = 'italy.piemonte.alto-piemonte'
  and not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

do $$
declare n int;
begin
  select count(*) into n from wine_place_articles x join wine_places p on p.id=x.wine_place_id
   where p.kind='SUBREGION' and p.canonical_key like 'italy.%' and x.climate is not null and x.soils is not null;
  if n <> 8 then raise exception 'expected 8 subregions with climate+soils (7 updated + Langhe), got %', n; end if;
end $$;

commit;
