-- Beaujolais — knowledge content (v1, published).
--
-- Region profile + a concise article per sub-appellation; Gamay on every place
-- (the crus are red-only), with Chardonnay + white/rose for the regional and
-- villages AOCs. Insert-only with existence/conflict guards so a re-run is a
-- no-op. ASCII prose (display names keep their accents on wine_places).

-- Region article.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The home of Gamay, in the granite hills north of Lyon between Maconnais and the Rhone. Beaujolais runs from easy carbonic-macerated reds in the south to ten age-worthy Crus on the northern slopes; a tier of Beaujolais-Villages sits between the regional AOC and the crus.',
  'Semi-continental with a growing Mediterranean influence from the south; warm summers ripen Gamay reliably on the slopes.',
  'Pink granite and blue volcanic schist on the northern cru slopes (the key to structure and ageing); sandstone, clay and limestone across the south.',
  array[
    'One grape for the reds: Gamay (Gamay Noir a Jus Blanc), often by semi-carbonic maceration',
    'Three tiers: Beaujolais -> Beaujolais-Villages -> the 10 Crus',
    'The 10 Crus: Brouilly, Cote de Brouilly, Regnie, Morgon, Chiroubles, Fleurie, Moulin-a-Vent, Chenas, Julienas, Saint-Amour',
    'A little white and rose (Chardonnay/Gamay) under the Beaujolais and Beaujolais-Villages AOCs'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.beaujolais'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Per sub-appellation articles.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Semi-continental, warming from the south; the cru slopes catch morning sun on granite.',
  v.soils,
  array['Gamay, mostly by semi-carbonic maceration', v.fact],
  'PUBLISHED'
from (values
  ('beaujolais-villages', 'The middle tier of the Beaujolais pyramid: 38 northern communes whose Gamay outranks basic Beaujolais, in red, white and rose.', 'Granite, schist and clay-limestone across the northern hills.', 'A step up from regional Beaujolais, below the named crus.'),
  ('brouilly', 'The largest and southernmost cru, around Mont Brouilly - supple, fruit-forward Gamay.', 'Granite, blue diorite and schist.', 'Largest of the ten crus.'),
  ('cote-de-brouilly', 'The blue-volcanic slopes of Mont Brouilly itself - firmer and more mineral than Brouilly.', 'Blue volcanic diorite and granite on the hill.', 'A small hill enclave within Brouilly.'),
  ('regnie', 'The newest cru (1988), on pink granite sand - bright, approachable reds.', 'Pink granite sand (arene).', 'Promoted to cru status in 1988.'),
  ('morgon', 'Structured, dark-fruited Gamay that ages toward a Pinot-like depth (to "morgonner"); the Cote du Py is its heart.', 'Blue schist and decomposed volcanic rock (Cote du Py).', 'Known for age-worthy, brooding reds.'),
  ('chiroubles', 'The highest cru (~400 m) - the most fragrant, delicate and floral Gamay.', 'Pink granite sand at altitude.', 'Highest and often lightest of the crus.'),
  ('fleurie', 'The Queen of Beaujolais - silky, floral, red-fruited Gamay.', 'Pink granite and granitic sand.', 'Famed for perfumed, elegant reds.'),
  ('moulin-a-vent', 'The King of Beaujolais - the firmest, most structured and longest-lived cru.', 'Pink granite with manganese-rich veins.', 'The most powerful, age-worthy cru.'),
  ('chenas', 'The smallest cru - robust, floral Gamay once prized at the French court.', 'Pink granite and sandy schist.', 'Rarest of the ten crus.'),
  ('julienas', 'One of the oldest crus - sturdy, spicy, structured Gamay.', 'Granite, schist and clay-limestone.', 'Among the oldest-established crus.'),
  ('saint-amour', 'The northernmost cru, bordering Maconnais - tender, charming reds.', 'Granite, clay and siliceous stone.', 'Northernmost cru; a Valentine''s favourite.')
) as v(slug, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.beaujolais.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Gamay on every Beaujolais place.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null,
       'The sole red grape of Beaujolais (Gamay Noir a Jus Blanc)', 'PUBLISHED'
from wine_places p
join grapes g on g.name = 'Gamay'
where p.canonical_key like 'france.beaujolais%'
on conflict (wine_place_id, grape_id) do nothing;

-- Chardonnay for the regional + villages whites.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'ACCESSORY', true, null,
       'For white Beaujolais / Beaujolais-Villages Blanc', 'PUBLISHED'
from wine_places p
join grapes g on g.name = 'Chardonnay'
where p.canonical_key in ('france.beaujolais', 'france.beaujolais.beaujolais-villages')
on conflict (wine_place_id, grape_id) do nothing;

-- Red on every place.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED', 'Gamay, often semi-carbonic maceration', 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.beaujolais%'
on conflict (wine_place_id, style) do nothing;

-- White + rose for the regional + villages AOCs.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values ('WHITE', 'Chardonnay (white Beaujolais)', 1), ('ROSE', 'Gamay rose', 2))
  as v(style, note, so)
join wine_places p on p.canonical_key in ('france.beaujolais', 'france.beaujolais.beaujolais-villages')
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.beaujolais%';
  if v_a <> 12 then raise exception 'expected 12 beaujolais articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.beaujolais%';
  if v_g < 12 then raise exception 'expected >= 12 beaujolais grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.beaujolais%';
  if v_s < 12 then raise exception 'expected >= 12 beaujolais styles, got %', v_s; end if;
end;
$$;
