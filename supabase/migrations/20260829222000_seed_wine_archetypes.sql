-- Seed curated wine-style archetypes (typical SAT range profiles) for a
-- starter set of iconic French appellations. Idempotent: each archetype is
-- inserted only if its name is not already present. Generated from
-- scripts/tmp-gen-archetypes.mjs (place + grape + term looked up by natural
-- key so this replays on a fresh DB).

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Vosne-Romanée', 'RED', 'STILL', (select id from grapes where name = 'Pinot Noir'), null, 'Silky, perfumed Côte de Nuits Pinot Noir — red fruit, floral lift, fine tannin, savoury with age.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","MEDIUM"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM_PLUS","HIGH"],"tannin":["MEDIUM","MEDIUM_PLUS"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM","MEDIUM_PLUS"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["LONG","LONG"]}'::jsonb, 90, 95, 1
  from wine_places p
  where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Vosne-Romanée')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['red cherry', 'raspberry', 'strawberry', 'violet', 'rose', 'forest floor']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Chablis', 'WHITE', 'STILL', (select id from grapes where name = 'Chardonnay'), null, 'Steely, unoaked Chardonnay — green apple and citrus over a wet-stone minerality, high acid.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON_GREEN","LEMON"],"noseIntensity":["MEDIUM","MEDIUM_PLUS"],"development":["YOUTHFUL","YOUTHFUL"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM_PLUS","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_MINUS","MEDIUM"],"flavourIntensity":["MEDIUM","MEDIUM_PLUS"],"finish":["MEDIUM_PLUS","LONG"]}'::jsonb, 88, 93, 2
  from wine_places p
  where p.canonical_key = 'france.bourgogne.chablis.chablis'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Chablis')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apple', 'lemon', 'grapefruit', 'wet stones', 'biscuit']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Sancerre', 'WHITE', 'STILL', (select id from grapes where name = 'Sauvignon Blanc'), null, 'Crisp, aromatic Sauvignon Blanc — gooseberry, citrus and cut grass with flinty minerality.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON_GREEN","LEMON"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","YOUTHFUL"],"sweetness":["DRY","DRY"],"acidity":["HIGH","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_MINUS","MEDIUM"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["MEDIUM","MEDIUM_PLUS"]}'::jsonb, 86, 91, 3
  from wine_places p
  where p.canonical_key = 'france.loire.sancerre'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Sancerre')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['gooseberry', 'lime', 'grapefruit', 'grass', 'blackcurrant leaf', 'wet stones']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Châteauneuf-du-Pape', 'RED', 'STILL', (select id from grapes where name = 'Grenache'), (select id from grapes where name = 'Syrah'), 'Warm, full-bodied southern-Rhône GSM blend — ripe black fruit, garrigue herbs, sweet spice, soft tannin.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","DEEP"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["DEVELOPING","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM_MINUS","MEDIUM"],"tannin":["MEDIUM","MEDIUM_PLUS"],"alcohol":["MEDIUM","HIGH"],"body":["MEDIUM_PLUS","FULL"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["MEDIUM_PLUS","LONG"]}'::jsonb, 90, 94, 4
  from wine_places p
  where p.canonical_key = 'france.rhone.chateauneuf-du-pape'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Châteauneuf-du-Pape')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['blackberry', 'black cherry', 'black plum', 'black pepper', 'dried herbs', 'liquorice']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Côte-Rôtie', 'RED', 'STILL', (select id from grapes where name = 'Syrah'), null, 'Northern-Rhône Syrah — black fruit, cracked pepper, violets and smoky, savoury complexity.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","DEEP"],"colourHue":["PURPLE","RUBY"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["MEDIUM_PLUS","HIGH"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_PLUS","FULL"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["LONG","LONG"]}'::jsonb, 91, 95, 5
  from wine_places p
  where p.canonical_key = 'france.rhone.cote-rotie'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Côte-Rôtie')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['blackberry', 'black pepper', 'violet', 'smoke', 'leather']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Margaux', 'RED', 'STILL', (select id from grapes where name = 'Cabernet Sauvignon'), (select id from grapes where name = 'Merlot'), 'Left-bank Cabernet-led claret — blackcurrant, cedar and tobacco with firm, structured tannin.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","DEEP"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM","MEDIUM_PLUS"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["MEDIUM_PLUS","HIGH"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_PLUS","FULL"],"flavourIntensity":["MEDIUM","MEDIUM_PLUS"],"finish":["LONG","LONG"]}'::jsonb, 90, 95, 6
  from wine_places p
  where p.canonical_key = 'france.bordeaux.haut-medoc.margaux'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Margaux')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['blackcurrant', 'black cherry', 'cedar', 'tobacco', 'vanilla', 'mint']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Sauternes', 'WHITE', 'SWEET', null, null, 'Botrytised sweet white — luscious apricot, honey and marmalade balanced by bright acidity.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["MEDIUM","DEEP"],"colourHue":["GOLD","AMBER"],"noseIntensity":["PRONOUNCED","PRONOUNCED"],"development":["DEVELOPING","FULLY_DEVELOPED"],"sweetness":["SWEET","LUSCIOUS"],"acidity":["MEDIUM_PLUS","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","HIGH"],"body":["FULL","FULL"],"flavourIntensity":["PRONOUNCED","PRONOUNCED"],"finish":["LONG","LONG"]}'::jsonb, 90, 96, 7
  from wine_places p
  where p.canonical_key = 'france.bordeaux.sauternes'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Sauternes')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apricot', 'honey', 'orange marmalade', 'ginger', 'vanilla']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Champagne', 'WHITE', 'SPARKLING', (select id from grapes where name = 'Chardonnay'), (select id from grapes where name = 'Pinot Noir'), 'Traditional-method sparkling — green apple and citrus with autolytic biscuit and brioche, racy acidity.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON_GREEN","GOLD"],"noseIntensity":["MEDIUM","MEDIUM_PLUS"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","OFF_DRY"],"acidity":["HIGH","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_MINUS","MEDIUM"],"flavourIntensity":["MEDIUM","MEDIUM_PLUS"],"finish":["MEDIUM_PLUS","LONG"],"mousse":["CREAMY","CREAMY"]}'::jsonb, 89, 94, 8
  from wine_places p
  where p.canonical_key = 'france.champagne'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Champagne')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['apple', 'lemon', 'biscuit', 'brioche', 'bread']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Alsace Riesling', 'WHITE', 'STILL', (select id from grapes where name = 'Riesling'), null, 'Dry, aromatic Riesling — lime and orchard fruit with a petrol note developing over stony minerality.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["PALE","MEDIUM"],"colourHue":["LEMON_GREEN","LEMON"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","OFF_DRY"],"acidity":["HIGH","HIGH"],"tannin":["LOW","LOW"],"alcohol":["MEDIUM","MEDIUM"],"body":["MEDIUM_MINUS","MEDIUM"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["MEDIUM_PLUS","LONG"]}'::jsonb, 88, 93, 9
  from wine_places p
  where p.canonical_key = 'france.alsace'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Alsace Riesling')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['lime', 'apple', 'apricot', 'petrol', 'honey']) order by lower(term), sort_order
) t;

with a as (
  insert into wine_archetypes
    (wine_place_id, name, colour, style, primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high, sort_order)
  select p.id, 'A typical Bandol', 'RED', 'STILL', (select id from grapes where name = 'Mourvèdre'), null, 'Mourvèdre-dominant Provence red — dark fruit, leather and garrigue with grippy, ageworthy tannin.', '{"clarity":["CLEAR","CLEAR"],"appearanceIntensity":["DEEP","DEEP"],"colourHue":["RUBY","GARNET"],"noseIntensity":["MEDIUM_PLUS","PRONOUNCED"],"development":["YOUTHFUL","DEVELOPING"],"sweetness":["DRY","DRY"],"acidity":["MEDIUM","MEDIUM_PLUS"],"tannin":["HIGH","HIGH"],"alcohol":["MEDIUM","HIGH"],"body":["FULL","FULL"],"flavourIntensity":["MEDIUM_PLUS","PRONOUNCED"],"finish":["LONG","LONG"]}'::jsonb, 89, 93, 10
  from wine_places p
  where p.canonical_key = 'france.provence.bandol'
    and not exists (select 1 from wine_archetypes wa where wa.name = 'A typical Bandol')
  returning id
)
insert into wine_archetype_aromas (archetype_id, term_id)
select a.id, t.id from a
cross join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(array['blackberry', 'black cherry', 'black pepper', 'leather', 'dried herbs', 'liquorice']) order by lower(term), sort_order
) t;

do $$
declare n int;
begin
  select count(*) into n from wine_archetypes;
  if n < 10 then raise exception 'final-state: expected >= 10 archetypes, got %', n; end if;
end $$;
