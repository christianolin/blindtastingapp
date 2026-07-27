-- Vallee du Rhone — wave 1 content B: satellite + VDN articles, then grapes
-- and styles for the whole wave. Insert-only, final-state asserted.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('ventoux', 'The slopes of the Giant of Provence - fresher, elevation-cooled Grenache/Syrah reds, rosé and white.', 'Mediterranean tempered by altitude on the mountain''s flanks.', 'Limestone scree, sand and red clay.', 'Cooler-climate southern Rhône satellite.'),
  ('luberon', 'Between Rhône and Provence - perfumed rosé, fresh whites and supple reds on the Luberon massif.', 'Mediterranean with cool nights off the massif.', 'Limestone, sand and clay.', 'Rosé and white share the stage with red.'),
  ('grignan-les-adhemar', 'The Drôme provençale''s truffle-country reds - formerly Coteaux du Tricastin.', 'Mediterranean; strongly Mistral-swept.', 'Stony terraces, sand and limestone.', 'Renamed from Coteaux du Tricastin in 2010.'),
  ('cotes-du-vivarais', 'Ardèche gorge-country - bright Grenache/Syrah reds and rosé off limestone plateaux.', 'Mediterranean with Cévennes freshness.', 'Limestone plateaux and stony clay.', 'Right-bank satellite by the Ardèche gorges.'),
  ('clairette-de-die', 'The Drôme valley''s ancestral-method sparkler - grapey, gently sweet Muscat-led bubbles.', 'Pre-alpine valley; cool nights preserve aromatics.', 'Limestone and marl terraces.', 'Méthode ancestrale; Muscat-led.'),
  ('cremant-de-die', 'The Die valley''s dry traditional-method sparkling, Clairette-led.', 'Pre-alpine valley; cool nights preserve freshness.', 'Limestone and marl terraces.', 'Dry counterpart to Clairette de Die.'),
  ('muscat-de-beaumes-de-venise', 'The great southern Rhône Muscat Vin Doux Naturel - apricot-honeyed, fortified sweetness.', 'Warm Mediterranean below the Dentelles.', 'Triassic sand, clay and limestone.', 'Vin Doux Naturel; twin of the dry red cru.')
) as v(slug, descr, climate, soils, fact)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- CdRV family (prefix): the GSM trio on the umbrella and every named village.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from wine_places p
cross join (values ('Grenache','PRINCIPAL'),('Syrah','ACCESSORY'),('Mourvèdre','ACCESSORY')) as v(grape, role)
join grapes g on g.name = v.grape
where p.canonical_key like 'france.rhone.cotes-du-rhone-villages%'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('ventoux','Grenache','PRINCIPAL'),('ventoux','Syrah','ACCESSORY'),('ventoux','Cinsault','ACCESSORY'),
  ('luberon','Grenache','PRINCIPAL'),('luberon','Syrah','ACCESSORY'),('luberon','Vermentino','ACCESSORY'),
  ('grignan-les-adhemar','Grenache','PRINCIPAL'),('grignan-les-adhemar','Syrah','ACCESSORY'),
  ('cotes-du-vivarais','Grenache','PRINCIPAL'),('cotes-du-vivarais','Syrah','ACCESSORY'),
  ('clairette-de-die','Muscat','PRINCIPAL'),('clairette-de-die','Clairette','ACCESSORY'),
  ('cremant-de-die','Clairette','PRINCIPAL'),
  ('muscat-de-beaumes-de-venise','Muscat','PRINCIPAL')
) as v(slug, grape, role)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED'::wine_style_kind, null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.rhone.cotes-du-rhone-villages%'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('ventoux','RED',0),('ventoux','ROSE',1),('ventoux','WHITE',2),
  ('luberon','RED',0),('luberon','ROSE',1),('luberon','WHITE',2),
  ('grignan-les-adhemar','RED',0),('grignan-les-adhemar','WHITE',1),
  ('cotes-du-vivarais','RED',0),('cotes-du-vivarais','ROSE',1),
  ('clairette-de-die','SPARKLING',0),
  ('cremant-de-die','SPARKLING',0),
  ('muscat-de-beaumes-de-venise','FORTIFIED',0),('muscat-de-beaumes-de-venise','SWEET',1)
) as v(slug, style, so)
join wine_places p on p.canonical_key = 'france.rhone.' || v.slug
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone%';
  if v_a <> 50 then raise exception 'expected 50 rhone articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes g join wine_places p on p.id = g.wine_place_id
   where p.canonical_key like 'france.rhone.cotes-du-rhone-villages%';
  if v_g < 66 then raise exception 'expected >= 66 CdRV-family grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles s join wine_places p on p.id = s.wine_place_id
   where p.canonical_key like 'france.rhone%';
  if v_s < 40 then raise exception 'expected >= 40 rhone style rows, got %', v_s; end if;
end;
$$;
