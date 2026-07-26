-- Savoie — knowledge content (v1, published).
--
-- Region + Roussette de Savoie + Seyssel articles; the 20 crus keep the
-- deliberate curation placeholder (like the Alsace grands crus) but every
-- place gets grape/style links where the grape exists in the library.
-- Chasselas (Crepy/Marin/Marignan/Ripaille), Gringet (Ayze) and Molette
-- (Seyssel) are not in the grapes table yet, so those crus carry the story
-- in style notes instead of grape links. Grape names match the live rows
-- exactly (Jacquère with grave accent). Insert-only with guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'Alpine vineyards in scattered pockets from Lake Geneva down the Combe de Savoie - steep slopes, glacial valleys and fresh, mountain-bright wines. Jacquere leads the whites, Altesse makes the Roussette wines, and Mondeuse gives the peppery alpine red.',
  'Alpine-continental: cold winters, warm summers, big day-night swings; lakes (Geneva, Bourget) temper the closest slopes.',
  'Glacial moraine, limestone scree (notably under Mont Granier for Apremont/Abymes) and molasse.',
  array[
    'Scattered pockets, not one vineyard: Leman shore, Rhone bend, Combe de Savoie',
    'Jacquere is the signature white; Altesse = Roussette de Savoie',
    'Mondeuse is the alpine red (Arbin its stronghold)',
    'Named crus append their village to Vin de Savoie (Apremont, Chignin...)',
    'Chasselas by Lake Geneva, Gringet in Ayze - alpine rarities'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.savoie'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Alpine-continental with lake and foehn influence.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('roussette-de-savoie',
   'The Altesse appellation: a region-wide overlay AOC for whites made only from Altesse (locally Roussette) - fuller and more age-worthy than Jacquere, with honey, bergamot and mountain-herb notes. Four crus (Frangy, Marestel, Monterminod, Monthoux) may add their name.',
   'Limestone scree and molasse on warm slopes.',
   'Altesse only - richer than the Jacquere whites',
   'Four named crus: Frangy, Marestel, Monterminod, Monthoux'),
  ('seyssel',
   'Savoie''s oldest AOC (1942), straddling the Rhone between Ain and Haute-Savoie: delicate whites from Altesse and the local Molette, plus a traditional-method mousseux with a long history.',
   'Glacial gravels and molasse above the young Rhone.',
   'Savoie''s first AOC - whites from Altesse and Molette',
   'A traditional-method sparkling (mousseux) heritage')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.savoie.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place (only grapes present in the library).
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.savoie', 'Jacquère',   'PRINCIPAL', 'The signature white - Apremont, Abymes, Chignin'),
  ('france.savoie', 'Altesse',    'PRINCIPAL', 'Roussette de Savoie'),
  ('france.savoie', 'Mondeuse',   'ACCESSORY', 'The peppery alpine red'),
  ('france.savoie', 'Roussanne',  'ACCESSORY', 'Chignin-Bergeron (locally Bergeron)'),
  ('france.savoie', 'Gamay',      'ACCESSORY', null),
  ('france.savoie', 'Pinot Noir', 'ACCESSORY', null),
  ('france.savoie', 'Chardonnay', 'ACCESSORY', null),
  ('france.savoie.roussette-de-savoie', 'Altesse', 'PRINCIPAL', 'Altesse only'),
  ('france.savoie.frangy',      'Altesse', 'PRINCIPAL', 'Roussette cru'),
  ('france.savoie.marestel',    'Altesse', 'PRINCIPAL', 'Roussette cru on the Jongieux slope'),
  ('france.savoie.monterminod', 'Altesse', 'PRINCIPAL', 'Tiny Roussette cru above Chambery'),
  ('france.savoie.monthoux',    'Altesse', 'PRINCIPAL', 'Roussette cru'),
  ('france.savoie.seyssel',     'Altesse', 'PRINCIPAL', 'With the local Molette'),
  ('france.savoie.apremont',               'Jacquère', 'PRINCIPAL', 'Under Mont Granier'),
  ('france.savoie.abymes-ou-les-abymes',   'Jacquère', 'PRINCIPAL', 'On the 1248 Granier landslide'),
  ('france.savoie.chignin',                'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.cruet',                  'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.jongieux',               'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.chautagne',              'Jacquère', 'PRINCIPAL', 'Also known for its reds'),
  ('france.savoie.montmelian',             'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.saint-jean-de-la-porte', 'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.saint-jeoire-prieure',   'Jacquère', 'PRINCIPAL', null),
  ('france.savoie.arbin',            'Mondeuse',  'PRINCIPAL', 'Arbin is Mondeuse country'),
  ('france.savoie.chignin-bergeron', 'Roussanne', 'PRINCIPAL', 'Locally called Bergeron')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles: WHITE everywhere except red-only Arbin; reds where they matter;
-- sparkling for Ayze (Gringet) and Seyssel (mousseux).
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'WHITE',
       case p.canonical_key
         when 'france.savoie.ayze' then 'Gringet - an alpine rarity'
         when 'france.savoie.crepy' then 'Chasselas by Lake Geneva'
         when 'france.savoie.marin' then 'Chasselas by Lake Geneva'
         when 'france.savoie.marignan' then 'Chasselas by Lake Geneva'
         when 'france.savoie.ripaille' then 'Chasselas by Lake Geneva'
         else null
       end,
       0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.savoie%'
  and p.canonical_key <> 'france.savoie.arbin'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('france.savoie',           'RED',       'Mondeuse, Gamay, Pinot Noir', 1),
  ('france.savoie',           'ROSE',      null, 2),
  ('france.savoie.chautagne', 'RED',       'Gamay and Mondeuse', 1),
  ('france.savoie.jongieux',  'RED',       'Gamay, Mondeuse, Pinot Noir', 1),
  ('france.savoie.arbin',     'RED',       'Mondeuse only', 0),
  ('france.savoie.ayze',      'SPARKLING', 'Gringet mousseux', 1),
  ('france.savoie.seyssel',   'SPARKLING', 'Traditional-method mousseux', 1)
) as v(ck, style, note, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.savoie%';
  if v_a <> 3 then raise exception 'expected 3 savoie articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.savoie%';
  if v_g <> 24 then raise exception 'expected 24 savoie grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.savoie%';
  if v_s <> 29 then raise exception 'expected 29 savoie styles (22 white + 4 red + rose + 2 sparkling), got %', v_s; end if;
end;
$$;
