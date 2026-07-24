-- Vallee du Rhone (Southern slice) — content (v1, published).
-- Grenache-led (GSM) reds; Tavel is rose-only; Lirac red + rose. Insert-only.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Warm Mediterranean; the Mistral wind and stony soils drive concentration.',
  v.soils, array['Grenache-led (GSM), southern Rhone', v.fact], 'PUBLISHED'
from (values
  ('chateauneuf-du-pape', 'The most famous Southern Rhone cru - powerful, warming Grenache-led reds (up to 13 permitted grapes) on galets roules pebbles near Avignon.', 'Galets roules (rolled quartz pebbles), sand and clay.', 'Up to 13 grapes permitted; Grenache-dominant.'),
  ('gigondas', 'Structured, spicy Grenache/Syrah/Mourvedre reds under the Dentelles de Montmirail.', 'Sandy clay and limestone scree off the Dentelles.', 'Mostly red, a little rose.'),
  ('vinsobres', 'A Drome hillside cru of Grenache and Syrah reds.', 'Clay-limestone and stony terraces.', 'Red only.'),
  ('cairanne', 'Garrigue-scented Grenache-led reds and some white; promoted to cru in 2016.', 'Clay-limestone, sand and stones.', 'Red and white.'),
  ('rasteau', 'Warm, generous dry Grenache reds; the sweet Vin Doux Naturel is a separate appellation.', 'Clay-limestone and stones on south-facing slopes.', 'Dry red cru (the VDN is separate).'),
  ('beaumes-de-venise', 'The dry red cru of Beaumes-de-Venise (Grenache/Syrah), distinct from the sweet Muscat VDN.', 'Triassic sand, clay and limestone.', 'Dry red (the Muscat is separate).'),
  ('lirac', 'A versatile west-bank cru - Grenache-led reds, roses and whites, neighbour to Tavel.', 'Galets roules terraces, sand and clay.', 'Red, rose and white.'),
  ('tavel', 'France''s great rose-only appellation - deep, dry, structured Grenache-led rose.', 'Galets roules, sand and flat limestone (lauzes).', 'Rose only.')
) as v(slug, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('chateauneuf-du-pape','Grenache','PRINCIPAL'),('chateauneuf-du-pape','Syrah','ACCESSORY'),('chateauneuf-du-pape','Mourvèdre','ACCESSORY'),
  ('gigondas','Grenache','PRINCIPAL'),('gigondas','Syrah','ACCESSORY'),('gigondas','Mourvèdre','ACCESSORY'),
  ('vinsobres','Grenache','PRINCIPAL'),('vinsobres','Syrah','ACCESSORY'),('vinsobres','Mourvèdre','ACCESSORY'),
  ('cairanne','Grenache','PRINCIPAL'),('cairanne','Syrah','ACCESSORY'),('cairanne','Mourvèdre','ACCESSORY'),
  ('rasteau','Grenache','PRINCIPAL'),('rasteau','Syrah','ACCESSORY'),('rasteau','Mourvèdre','ACCESSORY'),
  ('beaumes-de-venise','Grenache','PRINCIPAL'),('beaumes-de-venise','Syrah','ACCESSORY'),('beaumes-de-venise','Mourvèdre','ACCESSORY'),
  ('lirac','Grenache','PRINCIPAL'),('lirac','Syrah','ACCESSORY'),('lirac','Mourvèdre','ACCESSORY'),('lirac','Cinsault','ACCESSORY'),
  ('tavel','Grenache','PRINCIPAL'),('tavel','Cinsault','ACCESSORY'),('tavel','Syrah','ACCESSORY')
) as v(slug, grape, role)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('chateauneuf-du-pape','RED',0), ('gigondas','RED',0), ('vinsobres','RED',0),
  ('cairanne','RED',0), ('rasteau','RED',0), ('beaumes-de-venise','RED',0),
  ('lirac','RED',0), ('lirac','ROSE',1), ('tavel','ROSE',0)
) as v(slug, style, so)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone.%'
     and p.slug in ('chateauneuf-du-pape','gigondas','vinsobres','cairanne','rasteau','beaumes-de-venise','lirac','tavel');
  if v_a <> 8 then raise exception 'expected 8 southern rhone articles, got %', v_a; end if;
end;
$$;
