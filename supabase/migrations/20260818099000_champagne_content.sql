-- Champagne region — knowledge content (v1, published).
--
-- Region-only profile: chalk (craie) soils, cool marginal climate, traditional-
-- method sparkling, the three principal grapes, and the Échelle des Crus note
-- (Grand Cru / Premier Cru are COMMUNE ratings, not parcel appellations).
-- Published directly per the standing owner review pattern; insert-only with
-- guards so a re-run is a no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'France''s great sparkling region, an hour east of Paris on the coolest edge of fine-wine ripening. Champagne is made by the traditional method — a second fermentation in the bottle — overwhelmingly as a blend of three grapes across some 635 chalk-country communes in five departments, with the Marne at its heart and the Aube''s Côte des Bar to the south.',
  'Cool, marginal semi-continental with an oceanic influence; frost and under-ripeness are perennial risks, which is why blending across villages and vintages is the norm.',
  'Deep Belemnite and Micraster chalk (craie) beneath clay and marl on the slopes — free-draining, heat-storing, and the key to Champagne''s taut acidity.',
  array[
    'Traditional method (méthode champenoise): a second fermentation in bottle',
    'Three principal grapes: Chardonnay, Pinot Noir, Pinot Meunier',
    'Échelle des Crus rates whole COMMUNES — 17 Grand Cru, 42 Premier Cru — not individual parcels',
    'Also produces still Coteaux Champenois and Rosé des Riceys'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.champagne'
  and not exists (
    select 1 from wine_place_articles a where a.wine_place_id = p.id
  );

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.sort, 'PUBLISHED'
from (values
  ('SPARKLING', 'Traditional-method sparkling — the overwhelming majority', 0),
  ('ROSE', 'Rosé Champagne, by blending or saignée', 1)
) as v(style, note, sort)
join wine_places p on p.canonical_key = 'france.champagne'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note, 'PUBLISHED'
from (values
  ('Pinot Noir', 'PRINCIPAL', 38, 'Body and structure'),
  ('Pinot Meunier', 'PRINCIPAL', 32, 'Fruit and early charm; the Marne Valley workhorse'),
  ('Chardonnay', 'PRINCIPAL', 30, 'Finesse and ageing; the Blanc de Blancs grape'),
  ('Pinot Gris', 'ACCESSORY', null, 'One of the rare permitted varieties (a.k.a. Fromenteau); Arbane, Petit Meslier and Pinot Blanc are also allowed')
) as v(grape, role, share, note)
join wine_places p on p.canonical_key = 'france.champagne'
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

do $$
declare
  v_place uuid;
begin
  select id into v_place from wine_places where canonical_key = 'france.champagne';
  if not exists (select 1 from wine_place_articles where wine_place_id = v_place) then
    raise exception 'champagne article missing post-insert';
  end if;
  if (select count(*) from wine_place_grapes where wine_place_id = v_place) < 3 then
    raise exception 'champagne principal grapes missing post-insert';
  end if;
  if (select count(*) from wine_place_styles where wine_place_id = v_place) < 1 then
    raise exception 'champagne styles missing post-insert';
  end if;
end;
$$;
