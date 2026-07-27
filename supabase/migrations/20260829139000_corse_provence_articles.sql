-- Corse (5) + Provence (up to 6) articles - completes both regions'
-- profiles. Guarded per place, so entries that already have articles skip.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('france.corse.calvi',
   'The Balagne''s granite bowl behind Calvi - herb-laden Vermentino and supple Sciaccarello under steady sea wind.',
   'Dry, windy north-west coast.',
   'Granite arenes.',
   'The Balagne, Corsica''s garden', 'Vermentino and Sciaccarello lead'),
  ('france.corse.coteaux-du-cap-corse',
   'Terraced schist on the island''s wild northern finger - saline whites and reds grown between sea and maquis.',
   'Exposed, maritime, steep.',
   'Schist terraces.',
   'Shares the Cap with Muscat du Cap Corse', 'Some of Corsica''s most dramatic vineyards'),
  ('france.corse.figari',
   'Corsica''s oldest vineyard plain, wind-scoured granite in the far south - sinewy reds from an antique terroir.',
   'The windiest AOC of the island.',
   'Granite sand.',
   'Vines since the 5th century BC', 'Constant wind keeps the vines healthy'),
  ('france.corse.porto-vecchio',
   'Granite slopes above the gulf and salt pans of Porto-Vecchio - polished Vermentino and easy southern reds.',
   'Warm south-east littoral.',
   'Granite.',
   'Smallest of the village denominations', 'Whites shine near the coast'),
  ('france.corse.sartene',
   'Around the most Corsican of towns, granite hills hold old Sciaccarello - peppery, tradition-steeped reds.',
   'Dry granite hills of the south-west.',
   'Granite arenes.',
   'Sciaccarello heartland', 'Sartene: "the most Corsican of towns"'),
  ('france.provence.cotes-de-provence',
   'The great sweep of the Var - France''s rose engine, from schist Maures to limestone plateaux, with serious reds at La Londe and Frejus.',
   'Full Mediterranean sun, mistral-swept.',
   'Schist in the east, limestone in the west.',
   'The world''s benchmark rose appellation', 'Named terroirs: Sainte-Victoire, La Londe, Frejus, Pierrefeu'),
  ('france.provence.coteaux-daix-en-provence',
   'From the Durance to the sea around Aix - breezy limestone country for structured rose and Cabernet-touched reds.',
   'Mistral-cooled western Provence.',
   'Clay-limestone.',
   'Cabernet Sauvignon entered Provence here', 'Rose leads, reds age well'),
  ('france.provence.coteaux-varois-en-provence',
   'The high heart of the Var around Brignoles - altitude gives the freshest, latest-picked roses of Provence.',
   'Continental nights at 350 m+.',
   'Limestone of the Sainte-Baume foothills.',
   'The coolest of the big three Provence AOCs', 'Harvest can run into October'),
  ('france.provence.cotes-de-provence-sainte-victoire',
   'Red-earth vineyards under Cezanne''s limestone mountain - taut, mineral rose with a painter''s light.',
   'Dry inland basin, cold nights.',
   'Red clay over limestone scree.',
   'Named terroir beneath Mont Sainte-Victoire', 'Cezanne painted this skyline'),
  ('france.provence.les-baux-de-provence',
   'Organic-pioneer reds and roses in the jagged white Alpilles - Grenache, Syrah and Mourvedre in garrigue.',
   'Ferociously sunny, mistral-dried.',
   'Limestone scree of the Alpilles.',
   'A stronghold of organic viticulture', 'Named for the clifftop village of Les Baux'),
  ('france.provence.palette',
   'A pine-ringed limestone amphitheatre by Aix, barely 50 ha - Chateau Simone''s ancient vines define it.',
   'Sheltered, pine-shaded microclimate.',
   'Lime-rich Langesse scree.',
   'Dominated by Chateau Simone', 'Old-vine field blends, all three colours')
) as v(ck, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = v.ck
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_c int; v_p int;
begin
  select count(*) into v_c from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.corse%';
  if v_c <> 9 then raise exception 'expected 9 corse articles, got %', v_c; end if;
  select count(*) into v_p from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.provence%';
  if v_p <> 8 then raise exception 'expected 8 provence articles, got %', v_p; end if;
end $$;
