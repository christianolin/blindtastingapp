-- Vallee du Rhone — sub-region + Cotes du Rhone + Vacqueyras content (v1).
-- Articles for the 2 SUBREGIONs (grapes/styles live on the crus, per the
-- Champagne sub-region precedent) + full article/grapes/styles for the two
-- new appellations. Insert-only, final-state asserted.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('septentrional', 'The Rhône''s narrow northern strip - steep terraced côtes of Syrah above the river, from Côte-Rôtie down to Saint-Péray.', 'Moderate continental with a Mediterranean edge; sun-trap terraces, Mistral down the corridor.', 'Granite, gneiss and mica-schist terraces.', 'Syrah is the only red grape; 8 crus.'),
  ('meridional', 'The broad southern basin - Grenache-led GSM blends over garrigue, galets roulés and sand, from Châteauneuf-du-Pape to Tavel.', 'Warm Mediterranean; the Mistral wind and stony soils drive concentration.', 'Galets roulés, clay-limestone, sand and garrigue.', 'Grenache-led (GSM); 9 crus.'),
  ('cotes-du-rhone', 'The valley-wide regional appellation - the base of the Rhône pyramid; supple Grenache-led reds with rosé and white across both banks.', 'Warm Mediterranean in the south, cooler up the corridor; Mistral throughout.', 'Everything from galets roulés to sand, clay and limestone across 170+ communes.', 'Regional AOC; the Villages tier and named Villages sit above it.'),
  ('vacqueyras', 'Cru since 1990 - dark, garrigue-scented Grenache-led reds between Gigondas and Beaumes-de-Venise below the Dentelles de Montmirail.', 'Warm Mediterranean; dry, Mistral-swept garrigue plateau.', 'Red clay and stony garrigue terraces; sand at the foot of the Dentelles.', 'Red-dominant; commune-level aire (Vacqueyras + Sarrians).')
) as v(slug, descr, climate, soils, fact)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('cotes-du-rhone','Grenache','PRINCIPAL'),
  ('cotes-du-rhone','Syrah','ACCESSORY'),
  ('cotes-du-rhone','Mourvèdre','ACCESSORY'),
  ('cotes-du-rhone','Cinsault','ACCESSORY'),
  ('vacqueyras','Grenache','PRINCIPAL'),
  ('vacqueyras','Syrah','ACCESSORY'),
  ('vacqueyras','Mourvèdre','ACCESSORY')
) as v(slug, grape, role)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('cotes-du-rhone','RED',0), ('cotes-du-rhone','ROSE',1), ('cotes-du-rhone','WHITE',2),
  ('vacqueyras','RED',0), ('vacqueyras','WHITE',1)
) as v(slug, style, so)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key in ('france.rhone.septentrional','france.rhone.meridional','france.rhone.cotes-du-rhone','france.rhone.vacqueyras');
  if v_a <> 4 then raise exception 'expected 4 new rhone articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes gp join wine_places p on p.id = gp.wine_place_id
   where p.canonical_key in ('france.rhone.cotes-du-rhone','france.rhone.vacqueyras');
  if v_g < 7 then raise exception 'expected >= 7 cdr/vacqueyras grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles s join wine_places p on p.id = s.wine_place_id
   where p.canonical_key in ('france.rhone.cotes-du-rhone','france.rhone.vacqueyras');
  if v_s < 5 then raise exception 'expected >= 5 cdr/vacqueyras styles, got %', v_s; end if;
end;
$$;
