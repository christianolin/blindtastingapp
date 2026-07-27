-- Alsace Grand Cru articles, part 2 (L-R, 12 crus). Part 3 (S-Z) completes
-- the 51. Insert-only with guards; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('mambourg',
   'Sigolsheim''s long limestone-marl spine, the warmest of the Kaysersberg valley mouths - Gewurztraminer of saffron and smoke.',
   'Full-day sun along an east-west ridge.',
   'Marl-limestone.',
   'Gewurztraminer benchmark (Deiss, Weinbach)', 'Ripens among the earliest in Alsace'),
  ('mandelberg',
   'The almond hill of Mittelwihr - warm enough for almond trees, marl-limestone giving racy Riesling and fine Gewurztraminer.',
   'Notably mild microclimate.',
   'Marl-limestone.',
   'Almonds have flowered here for centuries', 'Riesling and Gewurztraminer share the cru'),
  ('marckrain',
   'Bennwihr''s border ridge on marl-limestone - supple, spice-driven Gewurztraminer and Pinot Gris.',
   'Gentle east-facing slope.',
   'Marl-limestone.',
   'Gewurztraminer and Pinot Gris lead', 'A gentle, generous style of cru'),
  ('moenchberg',
   'The monks'' hill of Andlau and Eichhoffen: limestone scree over marl, tended by Benedictines from the 9th century.',
   'Sheltered foothill site.',
   'Limestone scree on marl.',
   'Monastic since the 800s', 'Riesling and Pinot Gris excel'),
  ('muenchberg',
   'Nothalten''s amphitheatre of volcanic sediment and sandstone - austere, stony Riesling of cult reputation (Ostertag).',
   'Cool, late-ripening bowl.',
   'Volcanic sediment with sandstone.',
   'Volcanic-sediment Riesling', 'Made famous by Domaine Ostertag'),
  ('ollwiller',
   'Wuenheim''s slope under the Hartmannswillerkopf, in the driest corner of Alsace - patient Riesling and Gewurztraminer.',
   'The rain-shadow extreme of the region.',
   'Sandstone-derived clay.',
   'Among the driest vineyards in France', 'Wines of quiet, slow-burn depth'),
  ('osterberg',
   'The Easter hill of Ribeauville, marl terraces continuing the Geisberg line - Riesling of cut and salinity.',
   'Sheltered valley mouth.',
   'Stony marl.',
   'Riesling-first cru', 'Adjoins Geisberg''s terraces'),
  ('pfersigberg',
   'The peach-tree hill of Eguisheim: warm limestone-sandstone giving Gewurztraminer and Riesling of ripe, rounded charm.',
   'Warm and early-ripening.',
   'Limestone with sandstone.',
   'Peaches once grew between the vines', 'Home turf of several Eguisheim houses'),
  ('pfingstberg',
   'Orschwihr''s Pentecost hill - marl-sandstone terraces high above the Lauch valley, floral Riesling with mountain freshness.',
   'Cooler, higher southern site.',
   'Marl and sandstone.',
   'High-set, fresh Riesling', 'The name means Whitsun hill'),
  ('praelatenberg',
   'The prelates'' hill below Haut-Koenigsbourg at Kintzheim - granite-gneiss giving pure, crystalline Riesling.',
   'Sunny lower mountain slope.',
   'Granite and gneiss.',
   'Church-owned for a millennium', 'Crystalline granite Riesling'),
  ('rangen',
   'Thann''s legendary Rangen: the southernmost, steepest and only fully VOLCANIC cru - smoky, flinty wines of enormous intensity.',
   'Extreme slope (to 90%), stored heat in dark rock.',
   'Volcanic greywacke and tuff.',
   'The only volcanic grand cru; Clos Saint-Urbain (Zind-Humbrecht)', 'Southernmost vineyard of Alsace'),
  ('rosacker',
   'Hunawihr''s dolomitic limestone ridge - within it lies Clos Sainte-Hune, source of Alsace''s most famous Riesling (Trimbach).',
   'Cool, steady limestone site.',
   'Dolomitic muschelkalk.',
   'Contains Clos Sainte-Hune (Trimbach)', 'Riesling of legendary longevity')
) as v(slug, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.alsace.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.alsace%';
  if v_a <> 36 then
    raise exception 'expected 36 alsace articles after part 2 (region + 35 crus), got %', v_a;
  end if;
end $$;
