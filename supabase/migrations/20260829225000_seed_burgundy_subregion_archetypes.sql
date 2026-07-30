-- Author the Burgundy subregion archetypes (so a broad region shows subregion
-- representatives, not a single appellation) plus Petit Chablis, and place each
-- in the hierarchy: subregion archetypes roll up to Burgundy; Petit Chablis
-- joins Chablis at the Chablis subregion. Idempotent (insert-if-absent by name).
-- Aroma terms are reused from the known-good set seeded in 20260829222000.

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Petit Chablis', 'WHITE', 'STILL', (select id from grapes where name = 'Chardonnay'), null, 'Light, crisp unoaked Chardonnay — green apple, citrus and a saline, stony freshness; drink young.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","PALE"],"colourHue":["LEMON_GREEN","LEMON"],"noseIntensity":["MEDIUM_MINUS","MEDIUM"],"development":["YOUTHFUL","YOUTHFUL"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM_PLUS","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["LIGHT","MEDIUM_MINUS"],"flavourIntensity":["MEDIUM_MINUS","MEDIUM"],"finish":["MEDIUM_MINUS","MEDIUM"]}'::jsonb, 85, 89, 11
  from wine_places p
  where p.canonical_key = 'france.bourgogne.chablis.petit-chablis'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Petit Chablis')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apple', 'lemon', 'grapefruit', 'wet stones']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Côte de Nuits', 'RED', 'STILL', (select id from grapes where name = 'Pinot Noir'), null, 'Structured red Burgundy — red and black cherry, violet and forest floor over fine, firm tannin and bright acidity.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","MEDIUM"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM_PLUS","HIGH"],"tannin":["MEDIUM","MEDIUM_PLUS"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM","MEDIUM_PLUS"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["MEDIUM_PLUS","LONG"]}'::jsonb, 89, 93, 12
  from wine_places p
  where p.canonical_key = 'france.bourgogne.cote-de-nuits'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Côte de Nuits')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['red cherry', 'black cherry', 'raspberry', 'violet', 'forest floor']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Côte de Beaune', 'WHITE', 'STILL', (select id from grapes where name = 'Chardonnay'), null, 'Benchmark white Burgundy — citrus and orchard fruit with subtle oak, hazelnut and a long, mineral finish.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON","GOLD"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM","MEDIUM_PLUS"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["MEDIUM_PLUS","LONG"]}'::jsonb, 90, 94, 13
  from wine_places p
  where p.canonical_key = 'france.bourgogne.cote-de-beaune'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Côte de Beaune')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apple', 'lemon', 'honey', 'vanilla', 'biscuit']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Mâconnais', 'WHITE', 'STILL', (select id from grapes where name = 'Chardonnay'), null, 'Rounder, sunnier southern Chardonnay — ripe apple, citrus and stone fruit; supple and easy-drinking.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON","GOLD"],"noseIntensity":["MEDIUM","MEDIUM_PLUS"],"development":["YOUTHFUL","YOUTHFUL"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_MINUS","MEDIUM"],"flavourIntensity":["MEDIUM","MEDIUM_PLUS"],"finish":["MEDIUM","MEDIUM_PLUS"]}'::jsonb, 86, 90, 14
  from wine_places p
  where p.canonical_key = 'france.bourgogne.maconnais'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Mâconnais')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apple', 'lemon', 'apricot', 'honey']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Côte Chalonnaise', 'RED', 'STILL', (select id from grapes where name = 'Pinot Noir'), null, 'Approachable red Burgundy — red cherry and raspberry with an earthy, savoury edge and medium tannin.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","MEDIUM"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM","MEDIUM_PLUS"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["MEDIUM","MEDIUM"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM","MEDIUM"],"flavourIntensity":["MEDIUM","MEDIUM_PLUS"],"finish":["MEDIUM","MEDIUM_PLUS"]}'::jsonb, 86, 90, 15
  from wine_places p
  where p.canonical_key = 'france.bourgogne.cote-chalonnaise'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Côte Chalonnaise')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['red cherry', 'raspberry', 'strawberry', 'dried herbs']) order by lower(term), sort_order
) t;

-- Place the new archetypes: each at its home place (sort 0) and the subregion
-- reds/whites roll up to Burgundy; Petit Chablis joins Chablis at the subregion.
-- Burgundy list ordered roughly north -> south via sort_order.
insert into wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select a.id, p.id, v.sort_order
from (values
  ('A typical Petit Chablis', 'france.bourgogne.chablis.petit-chablis', 0),
  ('A typical Petit Chablis', 'france.bourgogne.chablis', 20),
  ('A typical Côte de Nuits', 'france.bourgogne.cote-de-nuits', 0),
  ('A typical Côte de Nuits', 'france.bourgogne', 20),
  ('A typical Côte de Beaune', 'france.bourgogne.cote-de-beaune', 0),
  ('A typical Côte de Beaune', 'france.bourgogne', 30),
  ('A typical Mâconnais', 'france.bourgogne.maconnais', 0),
  ('A typical Mâconnais', 'france.bourgogne', 50),
  ('A typical Côte Chalonnaise', 'france.bourgogne.cote-chalonnaise', 0),
  ('A typical Côte Chalonnaise', 'france.bourgogne', 40)
) as v(name, key, sort_order)
join wine_archetypes a on a.name = v.name
join wine_places p on p.canonical_key = v.key
on conflict (archetype_id, wine_place_id) do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_archetypes;
  if n < 15 then raise exception 'final-state: expected >= 15 archetypes, got %', n; end if;
end $$;
