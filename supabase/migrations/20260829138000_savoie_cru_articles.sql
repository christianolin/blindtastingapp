-- Savoie cru articles (20 places) - completes the region's profiles.
-- Insert-only with guards; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Alpine-continental; lakes and foehn temper the slopes.', v.soils,
       array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('abymes-ou-les-abymes',
   'Vines on the chaotic debris of the 1248 Mont Granier landslide - Jacquere of gentle, stony charm.',
   'Limestone landslide rubble (abymes = the chasms).',
   'Planted on the 1248 Granier collapse', 'Jacquere, light and thirst-quenching'),
  ('apremont',
   'The flagship Jacquere cru under Mont Granier''s pale cliff - alpine white at its crispest.',
   'Limestone scree of the Granier foot.',
   'The best-known Savoie cru', 'Jacquere with a wet-stone snap'),
  ('arbin',
   'The red enclave of the Combe de Savoie: sun-trapped slopes where Mondeuse reaches full, peppery ripeness.',
   'Warm glacial slope soils.',
   'Mondeuse country - reds only in practice', 'The deepest Savoie reds'),
  ('ayze',
   'A pocket of the Arve valley growing Gringet, found almost nowhere else - taut still whites and mountain bubbles.',
   'Steep morainic slopes.',
   'One of ~20 ha of Gringet worldwide', 'Still and mousseux styles'),
  ('chautagne',
   'North of Lac du Bourget, a warm shelf known as much for Gamay and Mondeuse reds as for its whites.',
   'Sandy glacial and molasse soils.',
   'A red-leaning Savoie cru', 'Warmth from the lake and the rock face'),
  ('chignin',
   'Terraced Jacquere under the medieval towers of Chignin - the village behind two crus.',
   'Limestone scree terraces.',
   'Twin cru with Chignin-Bergeron', 'Jacquere freshness from steep scree'),
  ('chignin-bergeron',
   'The same Chignin slopes given to Roussanne (Bergeron) - Savoie''s richest, most perfumed white.',
   'Warm limestone scree.',
   'Roussanne only - locally Bergeron', 'Savoie''s most sought-after white'),
  ('crepy',
   'Chasselas above Lake Geneva''s south shore - featherweight, faintly spritzig whites in the Swiss style.',
   'Glacial moraine over molasse.',
   'Chasselas, as across the lake in Vaud', 'Historically bottled sur lie'),
  ('cruet',
   'Combe de Savoie village cru - Jacquere with a little more flesh from fuller glacial soils.',
   'Glacial scree and clay.',
   'Jacquere-led village cru', 'Home to a strong cooperative tradition'),
  ('jongieux',
   'Vines over the Rhone bend below the Dent du Chat - Jacquere and Altesse; Marestel rises within it.',
   'Steep limestone and moraine.',
   'Shares its slope with Marestel', 'Whites lead; supple Gamay too'),
  ('marignan',
   'A tiny Chasselas terroir by the Foron stream near Lake Geneva - one hamlet''s worth of delicate white.',
   'Moraine over molasse.',
   'Among the smallest named crus', 'Chasselas by the lake'),
  ('marin',
   'Chasselas slopes above Thonon on Lake Geneva - light, floral, faintly stony.',
   'Glacial moraine.',
   'Lakeside Chasselas cru', 'Drunk young with lake fish'),
  ('montmelian',
   'The old fortress town of the Combe de Savoie, its slopes returning to Jacquere after urban centuries.',
   'Scree of the Bauges foot.',
   'A historic wine town reborn', 'Jacquere with alpine cut'),
  ('ripaille',
   'A single walled vineyard by the chateau of Ripaille on Lake Geneva''s shore - Chasselas of quiet elegance.',
   'Flat lakeside moraine.',
   'Essentially one estate''s clos', 'Chasselas beside the old charterhouse'),
  ('saint-jean-de-la-porte',
   'Combe de Savoie cru with a Mondeuse leaning - structured alpine reds beside its Jacquere.',
   'Glacial slope soils.',
   'Mondeuse does well here', 'Between Arbin and Cruet on the combe'),
  ('saint-jeoire-prieure',
   'A quiet priory village cru of the combe - Jacquere first, in modest quantity.',
   'Scree and clay.',
   'Small, low-profile cru', 'Jacquere-led whites'),
  ('frangy',
   'The Usses valley''s Altesse amphitheatre - Roussette de Savoie cru with a long name-check from Rousseau.',
   'Steep marl and limestone.',
   'Altesse (Roussette) only', 'Praised by Jean-Jacques Rousseau'),
  ('marestel',
   'The grand slope of Jongieux, Altesse at its most complete - honeyed, mineral, age-worthy.',
   'Very steep limestone under the Dent du Chat.',
   'The finest Roussette cru', 'Named for seigneur Mareste'),
  ('monterminod',
   'A hillside remnant above Chambery growing Altesse - a few hectares of city-edge vineyard.',
   'Steep morainic limestone.',
   'Tiny Roussette cru (~5 ha)', 'Overlooks Chambery'),
  ('monthoux',
   'Altesse on the Jongieux ridge opposite Marestel - fine Roussette in miniature.',
   'Limestone and moraine.',
   'Roussette cru in miniature', 'Neighbour and rival to Marestel')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.savoie.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.savoie%';
  if v_a <> 23 then
    raise exception 'expected 23 savoie articles (all places), got %', v_a;
  end if;
end $$;
