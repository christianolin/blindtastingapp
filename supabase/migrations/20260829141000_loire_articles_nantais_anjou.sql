-- Loire articles part 1: Pays Nantais, Fiefs Vendeens and Anjou families
-- (19 places). Parts 2-3 complete the valley. Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('muscadet',
   'The base appellation of Melon de Bourgogne around Nantes - bone-dry, saline white built for oysters.',
   'Mild, damp Atlantic.', 'Gneiss, granite and schist.',
   'Melon de Bourgogne only', 'The generic tier under Sevre et Maine'),
  ('muscadet-coteaux-de-la-loire',
   'The northern Muscadet, on schist slopes along the Loire around Ancenis - leaner, stonier wines.',
   'Atlantic with river moderation.', 'Schist and gneiss.',
   'The most inland, mineral Muscadet', 'A small northern sub-zone'),
  ('muscadet-cotes-de-grandlieu',
   'Muscadet from the sandy shores of Lac de Grandlieu - early, soft and shore-scented.',
   'Lake-tempered Atlantic.', 'Sand and gravel.',
   'The earliest-ripening Muscadet zone', 'Named for the great shallow lake'),
  ('muscadet-sevre-et-maine-clisson',
   'The first Muscadet cru communal: granite of Clisson, long lees ageing - Muscadet with Chablis-like stuffing.',
   'Warm inland pocket.', 'Granite of Clisson.',
   'Cru communal - min 24 months on lees', 'Granite gives the flesh'),
  ('muscadet-sevre-et-maine-gorges',
   'Cru communal on gabbro - smoky, tight Muscadet that demands patience.',
   'Inland, continental-leaning.', 'Green gabbro.',
   'Gabbro soil, smoky style', 'Cru communal with long lees rules'),
  ('muscadet-sevre-et-maine-le-pallet',
   'The most charming of the crus communaux - early-drinking finesse from gneiss and gabbro.',
   'Mild Sevre valley.', 'Gneiss and gabbro.',
   'The suplest cru communal', 'Birthplace of Abelard (1079)'),
  ('gros-plant-du-pays-nantais',
   'Folle Blanche sur lie - the sharpest, most sea-spray white of the Atlantic coast.',
   'Full Atlantic exposure.', 'Sand, gneiss and schist.',
   'Folle Blanche, bracing and saline', 'The oyster wine of Nantes'),
  ('coteaux-d-ancenis',
   'Gamay reds and roses - plus a rare Malvoisie (Pinot Gris) demi-sec - on Loire-side schist at Ancenis.',
   'River-moderated Atlantic.', 'Schist.',
   'Malvoisie is the local treasure', 'Gamay leads the reds'),
  ('fiefs-vendeens-brem',
   'Vendee coast fief: sea-freshened Chenin and Grolleau Gris whites, light reds.',
   'Maritime, sunny Vendee.', 'Schist and quartz.',
   'Coastal fief near the sables', 'Grolleau Gris speciality'),
  ('fiefs-vendeens-chantonnay',
   'The inland Vendee fief - Gamay and Pinot Noir reds from bocage country.',
   'Mild inland Vendee.', 'Schist and clay.',
   'The most inland fief', 'Red-leaning'),
  ('fiefs-vendeens-mareuil',
   'The largest fief, on the Lay river - Negrette-spiced reds and roses unique to the Vendee.',
   'Sunny lower Vendee.', 'Schist and rhyolite.',
   'Negrette appears in the blend - a Vendee quirk', 'The biggest of the five fiefs'),
  ('fiefs-vendeens-pissotte',
   'A handful of hectares near Fontenay-le-Comte - Chenin-led whites of quiet local fame.',
   'Mild southern Vendee.', 'Schist over limestone.',
   'Tiny fief (a few growers)', 'Chenin-led whites'),
  ('fiefs-vendeens-vix',
   'The marsh-edge fief by the Marais Poitevin - supple reds and dry whites.',
   'Marsh-tempered maritime.', 'Limestone island in the marsh.',
   'Vines on a limestone rise over the marais', 'The southernmost fief'),
  ('anjou',
   'The broad AOC of black-schist Anjou: Chenin whites, Cabernet Franc reds and the famous roses around Angers.',
   'Soft angevin climate - the douceur angevine.', 'Black schist (Anjou noir) and some limestone.',
   'Chenin and Cabernet Franc heartland', 'Also the base for Anjou Gamay and roses'),
  ('anjou-brissac',
   'The Aubance-side villages red: Cabernet Franc of depth from the warm schist south of Angers.',
   'Warm, dry Anjou noir.', 'Schist.',
   'Villages-level Cabernet Franc', 'Around the great chateau of Brissac'),
  ('anjou-villages',
   'The superior red tier of Anjou - riper, firmer Cabernet Franc (and Sauvignon) from the best schist slopes.',
   'Douceur angevine.', 'Schist with gravel.',
   'Reds only, stricter than plain Anjou', 'Cabernet Franc first'),
  ('anjou-coteaux-de-la-loire',
   'A sliver of Chenin on the north bank near Savennieres - demi-sec and moelleux whites of old reputation.',
   'River-warmed slopes.', 'Schist.',
   'Off-dry Chenin speciality', 'Faces Savennieres across the Loire'),
  ('savennieres',
   'Chenin at its most mineral: sun-struck schist promontories over the Loire - dry, austere young, magnificent at ten years.',
   'Sheltered, dry south-facing spurs.', 'Purple schist with volcanic veins.',
   'The great DRY Chenin of Anjou', 'Includes the Roche aux Moines and Coulee de Serrant slopes'),
  ('savennieres-roche-aux-moines',
   'The monks'' rock above the Loire - a grand-cru-scale Chenin site within Savennieres.',
   'Warm, wind-brushed promontory.', 'Schist and quartz veins.',
   'One of Anjou''s two hallowed Chenin crus', 'Neighbour of the Coulee de Serrant monopole')
) as v(slug, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_a <> 24 then
    raise exception 'expected 24 loire articles after part 1, got %', v_a;
  end if;
end $$;
