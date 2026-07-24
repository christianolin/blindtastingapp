-- Vallee du Rhone (Northern slice) — knowledge content (v1, published).
--
-- Region profile + a concise article per cru; grapes and styles mapped per
-- place (Syrah reds; Viognier at Condrieu/Chateau-Grillet; Marsanne/Roussanne
-- whites; Cornas red-only; Saint-Peray white + sparkling). Insert-only with
-- guards. ASCII prose (display names keep accents on wine_places).

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The Northern Rhone: steep, terraced Syrah on granite from Vienne to Valence, plus some of France''s finest whites - Viognier at Condrieu, Marsanne and Roussanne at Hermitage. Eight crus line the river''s slopes.',
  'Continental with a strong Mediterranean influence; the Mistral wind dries and stresses the vines.',
  'Granite and schist on steep slopes (Cote-Rotie''s schist, Hermitage''s granite), with pockets of loess and sand.',
  array[
    'Syrah is the only red grape of the Northern Rhone',
    'Whites from Viognier, Marsanne and Roussanne',
    'Steep terraced slopes above the Rhone',
    'The 8 crus: Cote-Rotie, Condrieu, Chateau-Grillet, Saint-Joseph, Hermitage, Crozes-Hermitage, Cornas, Saint-Peray'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.rhone'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Continental with a strong Mediterranean influence and the drying Mistral wind.',
  v.soils,
  array[v.fact],
  'PUBLISHED'
from (values
  ('france.rhone.cote-rotie', 'The "roasted slope" above Ampuis - dark, floral Syrah, often co-fermented with a little Viognier, on steep schist terraces.', 'Schist and mica-schist (the Cote Brune and Cote Blonde).', 'Syrah, optionally with up to 20% Viognier.'),
  ('france.rhone.condrieu', 'The original home of Viognier - opulent, apricot-and-honeysuckle whites on granite terraces.', 'Granite (arzelle) terraces.', 'Viognier only; dry (rarely sweet) white.'),
  ('france.rhone.chateau-grillet', 'A tiny Viognier monopole enclave within Condrieu - one of France''s smallest appellations (~3.5 ha).', 'South-facing granite amphitheatre.', 'Viognier only.'),
  ('france.rhone.saint-joseph', 'A long strip down the river''s west bank - peppery Syrah reds and some Marsanne/Roussanne whites.', 'Granite and gneiss slopes.', 'Syrah (red); Marsanne/Roussanne (white).'),
  ('france.rhone.hermitage', 'The legendary granite hill above Tain - powerful, age-worthy Syrah and rich, long-lived whites.', 'Granite, with loess and glacial gravel on top.', 'Syrah (red); Marsanne/Roussanne (white).'),
  ('france.rhone.crozes-hermitage', 'The largest Northern Rhone appellation, wrapped around Hermitage - supple, approachable Syrah and whites.', 'Granite in the north; clay, gravel and loess terraces in the south.', 'Syrah (red); Marsanne/Roussanne (white).'),
  ('france.rhone.cornas', '100% Syrah, no white permitted - dark, robust, sun-trapped reds in a granite amphitheatre.', 'East/south-facing granite amphitheatre.', 'Syrah only; red only.'),
  ('france.rhone.saint-peray', 'Marsanne and Roussanne whites at the southern end - both still and traditional-method sparkling.', 'Granite and limestone.', 'White only, still or sparkling.')
) as v(ck, descr, soils, fact)
join wine_places p on p.canonical_key = v.ck
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('france.rhone', 'Syrah', 'PRINCIPAL'),
  ('france.rhone', 'Viognier', 'ACCESSORY'),
  ('france.rhone', 'Marsanne', 'ACCESSORY'),
  ('france.rhone', 'Roussanne', 'ACCESSORY'),
  ('france.rhone.cote-rotie', 'Syrah', 'PRINCIPAL'),
  ('france.rhone.cote-rotie', 'Viognier', 'ACCESSORY'),
  ('france.rhone.condrieu', 'Viognier', 'PRINCIPAL'),
  ('france.rhone.chateau-grillet', 'Viognier', 'PRINCIPAL'),
  ('france.rhone.saint-joseph', 'Syrah', 'PRINCIPAL'),
  ('france.rhone.saint-joseph', 'Marsanne', 'ACCESSORY'),
  ('france.rhone.saint-joseph', 'Roussanne', 'ACCESSORY'),
  ('france.rhone.hermitage', 'Syrah', 'PRINCIPAL'),
  ('france.rhone.hermitage', 'Marsanne', 'ACCESSORY'),
  ('france.rhone.hermitage', 'Roussanne', 'ACCESSORY'),
  ('france.rhone.crozes-hermitage', 'Syrah', 'PRINCIPAL'),
  ('france.rhone.crozes-hermitage', 'Marsanne', 'ACCESSORY'),
  ('france.rhone.crozes-hermitage', 'Roussanne', 'ACCESSORY'),
  ('france.rhone.cornas', 'Syrah', 'PRINCIPAL'),
  ('france.rhone.saint-peray', 'Marsanne', 'PRINCIPAL'),
  ('france.rhone.saint-peray', 'Roussanne', 'ACCESSORY')
) as v(ck, grape, role)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('france.rhone', 'RED', 0), ('france.rhone', 'WHITE', 1),
  ('france.rhone.cote-rotie', 'RED', 0),
  ('france.rhone.condrieu', 'WHITE', 0),
  ('france.rhone.chateau-grillet', 'WHITE', 0),
  ('france.rhone.saint-joseph', 'RED', 0), ('france.rhone.saint-joseph', 'WHITE', 1),
  ('france.rhone.hermitage', 'RED', 0), ('france.rhone.hermitage', 'WHITE', 1),
  ('france.rhone.crozes-hermitage', 'RED', 0), ('france.rhone.crozes-hermitage', 'WHITE', 1),
  ('france.rhone.cornas', 'RED', 0),
  ('france.rhone.saint-peray', 'WHITE', 0), ('france.rhone.saint-peray', 'SPARKLING', 1)
) as v(ck, style, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone%';
  if v_a <> 9 then raise exception 'expected 9 rhone articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.rhone%';
  if v_g < 9 then raise exception 'expected >= 9 rhone grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.rhone%';
  if v_s < 9 then raise exception 'expected >= 9 rhone styles, got %', v_s; end if;
end;
$$;
