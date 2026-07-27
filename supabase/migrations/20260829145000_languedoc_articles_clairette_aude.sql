-- Languedoc-Roussillon articles part 2: the Clairette family and the
-- western Aude (18 places). Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Mediterranean; the west feels the Atlantic corridor.', v.soils,
       array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('clairette-du-languedoc',
   'One of the Languedoc''s oldest whites (AOC 1948): Clairette alone, dry to rancio, along the mid-Herault.',
   'Terraces and marl of the Herault valley.',
   'Clairette only - dry, moelleux and rancio', 'Among the first Languedoc AOCs (1948)'),
  ('clairette-du-languedoc-adissan',
   'The Clairette commune par excellence - Adissan''s cooperative keeps the moelleux tradition alive.',
   'Clay-limestone terraces.',
   'Adissan is the family''s beating heart', 'Moelleux Clairette speciality'),
  ('clairette-du-languedoc-aspiran',
   'Roman potters'' village whose amphorae once shipped Clairette - the vine outlived the kilns.',
   'Gravel terraces over clay.',
   'Roman amphora-works village', 'Clairette commune of the decree'),
  ('clairette-du-languedoc-cabrieres',
   'Clairette from the volcanic-schist bowl of Cabrieres - the freshest, stoniest of the family.',
   'Schist and basalt.',
   'Volcanic-schist Clairette', 'Overlaps the red Cabrieres terroir'),
  ('clairette-du-languedoc-ceyras',
   'Herault-bank Clairette commune - soft, blossomy dry whites.',
   'River terraces.',
   'Clairette commune of the decree', 'Light, early-drinking style'),
  ('clairette-du-languedoc-fontes',
   'Fontes'' basalt-touched slopes - Clairette with a mineral echo.',
   'Basalt over limestone.',
   'Basalt lends the accent', 'Clairette commune of the decree'),
  ('clairette-du-languedoc-le-bosc',
   'High ruffe-red ground toward Salagou - Clairette of altitude and cut.',
   'Ruffe (red sandstone) and scree.',
   'Red-earth Clairette', 'Near the Salagou crater lands'),
  ('clairette-du-languedoc-lieuran-cabrieres',
   'A hamlet-scale Clairette commune between Cabrieres and the valley floor.',
   'Schist and clay.',
   'Hamlet-sized member of the family', 'Clairette only, as everywhere here'),
  ('clairette-du-languedoc-nizas',
   'Nizas'' gentle rise - Clairette in its easiest, most aperitif form.',
   'Clay-limestone.',
   'Aperitif-styled Clairette', 'Clairette commune of the decree'),
  ('clairette-du-languedoc-paulhan',
   'The market town of the Clairette belt - dry and rancio traditions side by side.',
   'Terraces and marl.',
   'Rancio Clairette survives here', 'Clairette commune of the decree'),
  ('clairette-du-languedoc-peret',
   'Peret''s stony shelf under the Cabrieres hills - taut, herbal Clairette.',
   'Stony clay-limestone.',
   'Herbal, stony style', 'Clairette commune of the decree'),
  ('clairette-du-languedoc-saint-andre-de-sangonis',
   'The eastern gate of the Clairette family, on Herault gravels.',
   'River gravels.',
   'Easternmost Clairette commune', 'Gravel-grown freshness'),
  ('clairette-de-bellegarde',
   'A tiny Clairette island in the Costieres pebbles between Nimes and the Camargue - dry white only.',
   'Rolled galets over sand.',
   'Dry Clairette only (AOC 1949)', 'A 50-hectare curiosity'),
  ('corbieres-boutenac',
   'The golden crescent of Corbieres: old-vine Carignan on sun-cooked terraces - the massif''s named cru.',
   'Galets and sandstone of the Boutenac arc.',
   'Min 30% old Carignan by decree', 'Cru status since 2005'),
  ('minervois',
   'A vast sun-terrace from Carcassonne to Saint-Chinian under the Montagne Noire - garrigue reds of polish and spice.',
   'Terraces, marble and schist bands.',
   'La Liviniere rises within it', 'Syrah-Grenache with old Carignan'),
  ('minervois-la-liviniere',
   'The Minervois'' first cru: high marble-and-schist slopes giving the massif''s deepest, most refined reds.',
   'Marble outcrops and schist.',
   'First Languedoc village cru (1999)', 'Petit Causse altitude and freshness'),
  ('cabardes',
   'Where Atlantic meets Mediterranean above Carcassonne - the only AOC REQUIRING both Bordeaux and Rhone grapes.',
   'Clay-limestone and schist.',
   'Bordeaux + Rhone varieties by law', 'West-wind (Cers) and east-wind country'),
  ('malepere',
   'The Atlantic-most red of the Languedoc: Merlot-led blends on a forested massif south-west of Carcassonne.',
   'Clay-limestone terraces.',
   'Merlot leads - unique in the Midi', 'The "bad stone" massif of the Cers wind')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.languedoc-roussillon.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_a <> 40 then
    raise exception 'expected 40 languedoc articles after part 2, got %', v_a;
  end if;
end $$;
