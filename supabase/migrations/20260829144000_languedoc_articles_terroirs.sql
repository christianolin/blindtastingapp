-- Languedoc-Roussillon articles part 1: the Languedoc named terroirs and
-- the schist/garrigue crus (18 places). Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Mediterranean - hot, dry, tramontane-swept.', v.soils,
       array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('languedoc-cabrieres',
   'A volcanic-schist bowl in the Herault hills, long famed for its deep roses and warm Grenache reds.',
   'Schist with volcanic veins.',
   'Historic rose reputation (Estabel)', 'Grenache-led hill terroir'),
  ('languedoc-gres-de-montpellier',
   'The gravel-and-limestone belt around Montpellier - polished Syrah-Grenache reds for the city''s table.',
   'Gres (gravel-sandstone) and limestone.',
   'Urban-fringe quality belt', 'Syrah-Grenache city reds'),
  ('languedoc-la-mejanelle',
   'Galets-strewn plain at Montpellier''s eastern edge - Rhone-like pebbles, ripe Grenache.',
   'Rolled quartz galets on red clay.',
   'Pebble terroir inside the city sprawl', 'One of the four historic Coteaux crus'),
  ('languedoc-montpeyroux',
   'A mountain-foot village under the Larzac cliffs - structured, stony reds beside Terrasses du Larzac.',
   'Limestone scree and clay.',
   'High-set village terroir', 'Neighbours the Terrasses du Larzac'),
  ('languedoc-quatourze',
   'A sea-level pebble shelf by Narbonne''s lagoon - dark, salty-edged Grenache-Carignan.',
   'Quartz galets over clay.',
   'Lagoon-side pebble cru', 'One of the oldest named terroirs'),
  ('languedoc-saint-christol',
   'Old papal-favoured slopes east of Montpellier - supple, spice-driven blends.',
   'Villafranchian gravels.',
   'Wines once shipped to the papal court', 'Eastern Languedoc gravel cru'),
  ('languedoc-saint-drezery',
   'A small gravel-and-marl terroir north of Montpellier - easy, perfumed reds.',
   'Gravels with red marl.',
   'Compact northern terroir', 'Grenache-Syrah suppleness'),
  ('languedoc-saint-georges-d-orques',
   'Montpellier''s historic west-side vineyard, praised by Jefferson - firm, herb-laced reds.',
   'Villafranchian pebbles on clay.',
   'Thomas Jefferson bought it by name', 'Historic cru absorbed by the city''s edge'),
  ('languedoc-saint-saturnin',
   'High valley villages under the Rocher des Vierges - bright, altitude-cooled reds and the "vin d''une nuit" rose.',
   'Scree and ruffe (red sandstone).',
   'Vin d''une nuit - one-night rose', 'Altitude freshness in the Herault hills'),
  ('terrasses-du-larzac',
   'The Languedoc''s star of the 2010s: high terraces under the Larzac plateau, cool nights, savoury Syrah-Grenache of real finesse.',
   'Limestone terraces, galets and ruffe.',
   'Biggest day-night swings in the Languedoc', 'AOC in its own right since 2014'),
  ('pic-saint-loup',
   'The cool northern cru under the tooth-shaped peak - garrigue-scented Syrah with mountain freshness.',
   'Limestone scree of the pic and Hortus cliff.',
   'Syrah-dominant by decree', 'The coolest, rainiest Languedoc cru'),
  ('la-clape',
   'A limestone island between Narbonne and the sea - salty Bourboulenc whites and sun-baked reds among pines.',
   'Bare karst limestone massif.',
   'Bourboulenc white is the speciality', 'An island until Roman times'),
  ('picpoul-de-pinet',
   'The green-gold oyster wine of the Thau lagoon - lip-stinging (lip-picking: pique-poul) freshness by the shellfish beds.',
   'Miocene limestone by the lagoon.',
   'White only - Picpoul grape', 'The Languedoc''s biggest white AOC'),
  ('faugeres',
   'Pure schist hills above Beziers - reds of graphite and garrigue, the Languedoc''s most soil-marked cru.',
   'Deep folded schist.',
   'One rock type: schist', 'Syrah-Grenache-Carignan with smoky cut'),
  ('saint-chinian',
   'Twin-soiled cru: schist to the north, clay-limestone to the south - two accents of spicy, supple red.',
   'Schist north / limestone south.',
   'Two geologies, one appellation', 'Among the first Languedoc crus (1982)'),
  ('saint-chinian-berlou',
   'The schist heart of Saint-Chinian, Carignan-strong - a named cru of the northern hills.',
   'Pure schist.',
   'Old-vine Carignan emphasis', 'Named village cru (2005)'),
  ('saint-chinian-roquebrun',
   'Amphitheatre above the Orb river where oranges ripen - schist reds of unusual generosity.',
   'Schist in a sun-trap bend.',
   'Mediterranean microclimate (orange trees)', 'Named village cru (2005)'),
  ('fitou',
   'The Languedoc''s FIRST red AOC (1948), in two lobes - maritime lagoon vines and high schist inland - Carignan at its saltiest.',
   'Coastal lobe: clay-limestone; inland: schist.',
   'First red AOC of the Languedoc (1948)', 'Two separated lobes share the name')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.languedoc-roussillon.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_a <> 22 then
    raise exception 'expected 22 languedoc articles after part 1, got %', v_a;
  end if;
end $$;
