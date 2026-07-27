-- Vallee du Rhone — wave 1 content A: articles for CdRV + the 21 named
-- villages. Shared climate/soils/key-fact for the named-village family; each
-- row carries a one-line locator. Grapes/styles + the satellite articles are
-- content B (20260829159000). Insert-only.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Warm Mediterranean; Mistral-swept.',
  'Stony terraces, sand and clay over limestone.',
  array['Côtes du Rhône Villages named village'], 'PUBLISHED'
from (values
  ('chusclan', 'Gard west-bank named village in the Cèze valley - Grenache-led reds and rosé.'),
  ('gadagne', 'Named village on the hills east of Avignon - the family''s southernmost Vaucluse member.'),
  ('laudun', 'West-bank named village - structured reds and some of the family''s best whites.'),
  ('massif-d-uchaux', 'Wooded sandstone massif north of Orange - fresh, structured reds.'),
  ('nyons', 'Olive-country named village in the Drôme foothills.'),
  ('plan-de-dieu', 'Stony glacial plain between Cairanne and Gigondas - robust, wind-swept reds.'),
  ('puymeras', 'Foothill named village northeast of Vaison-la-Romaine.'),
  ('roaix', 'Small Ouvèze-valley named village between Rasteau and Séguret.'),
  ('rochegude', 'Named village at the Drôme-Vaucluse border.'),
  ('rousset-les-vignes', 'Northernmost named village, under the Lance mountain.'),
  ('sablet', 'Sandy-soiled named village at the foot of the Dentelles de Montmirail.'),
  ('saint-andeol', 'Right-bank Ardèche named village around Bourg-Saint-Andéol.'),
  ('saint-gervais', 'Small Gard named village in the Cèze valley.'),
  ('saint-maurice', 'Drôme named village of the Eygues valley.'),
  ('saint-pantaleon-les-vignes', 'Tiny northern named village beside Rousset-les-Vignes.'),
  ('sainte-cecile', 'Plain-and-terrace named village south of Suze-la-Rousse.'),
  ('seguret', 'Medieval hillside named village beside Sablet.'),
  ('signargues', 'Southernmost Gard named village on red-pebble terraces.'),
  ('suze-la-rousse', 'Named village around the château of the wine university.'),
  ('vaison-la-romaine', 'Roman-town named village on the upper Ouvèze.'),
  ('valreas', 'Heart of the papal Enclave - fresh, higher-altitude reds.')
) as v(slug, descr)
join wine_places p on p.canonical_key = 'france.rhone.cotes-du-rhone-villages.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The middle step of the Rhône pyramid - stricter yields and riper minimums than Côtes du Rhône, from the southern valley''s better sites; 21 named villages may append their name.',
  'Warm Mediterranean; the Mistral and stony soils drive concentration.',
  'Galets roulés, sand, marl and clay-limestone.',
  array['Regional AOC between Côtes du Rhône and the crus', '21 named villages'],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.rhone.cotes-du-rhone-villages'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone.cotes-du-rhone-villages%';
  if v_a <> 22 then raise exception 'expected 22 CdRV-family articles, got %', v_a; end if;
end;
$$;
