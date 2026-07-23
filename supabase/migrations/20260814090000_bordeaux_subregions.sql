-- Phase 3E: the missing Bordeaux sub-appellations, staged as DRAFT places.
-- Boundaries are staged separately by build-boundary.mjs; a flip migration
-- marks them VERIFIED once the shapes are reviewed. All are real INAO AOCs
-- resolving exactly in the committed vocabulary.
--
-- Placement:
--  * Listrac-Médoc — a Haut-Médoc commune (parent haut-medoc, like Margaux).
--  * The four Saint-Émilion satellites, Lalande-de-Pomerol, and the sweet
--    right-bank AOCs (Cadillac, Cérons, Loupiac, Sainte-Croix-du-Mont,
--    Côtes de Bordeaux-Saint-Macaire) — their own distinct footprints, so
--    they sit directly under Bordeaux rather than nested inside a neighbour.

insert into wine_places (primary_parent_id, kind, canonical_key, name, slug,
  display_tier, min_zoom, label_min_zoom, publication_status, sort_order,
  is_appellation, appellation_system, appellation_level)
select
  (select id from wine_places where canonical_key = v.parent),
  'APPELLATION', v.key, v.name, v.slug,
  v.tier, v.zoom, v.zoom, 'DRAFT', v.sort,
  true, 'AOC/AOP', 'communal'
from (values
  ('france.bordeaux.haut-medoc', 'france.bordeaux.haut-medoc.listrac-medoc', 'Listrac-Médoc', 'listrac-medoc', 3, 9, 210),
  ('france.bordeaux', 'france.bordeaux.montagne-saint-emilion', 'Montagne-Saint-Émilion', 'montagne-saint-emilion', 2, 7, 211),
  ('france.bordeaux', 'france.bordeaux.lussac-saint-emilion', 'Lussac-Saint-Émilion', 'lussac-saint-emilion', 2, 7, 212),
  ('france.bordeaux', 'france.bordeaux.puisseguin-saint-emilion', 'Puisseguin-Saint-Émilion', 'puisseguin-saint-emilion', 2, 7, 213),
  ('france.bordeaux', 'france.bordeaux.saint-georges-saint-emilion', 'Saint-Georges-Saint-Émilion', 'saint-georges-saint-emilion', 2, 7, 214),
  ('france.bordeaux', 'france.bordeaux.lalande-de-pomerol', 'Lalande-de-Pomerol', 'lalande-de-pomerol', 2, 7, 215),
  ('france.bordeaux', 'france.bordeaux.cadillac', 'Cadillac', 'cadillac', 2, 7, 216),
  ('france.bordeaux', 'france.bordeaux.cerons', 'Cérons', 'cerons', 2, 7, 217),
  ('france.bordeaux', 'france.bordeaux.loupiac', 'Loupiac', 'loupiac', 2, 7, 218),
  ('france.bordeaux', 'france.bordeaux.sainte-croix-du-mont', 'Sainte-Croix-du-Mont', 'sainte-croix-du-mont', 2, 7, 219),
  ('france.bordeaux', 'france.bordeaux.cotes-de-bordeaux-saint-macaire', 'Côtes de Bordeaux-Saint-Macaire', 'cotes-de-bordeaux-saint-macaire', 2, 7, 220)
) as v(parent, key, name, slug, tier, zoom, sort);

do $$
declare v_count int;
begin
  select count(*) into v_count from wine_places where canonical_key like 'france.bordeaux%';
  if v_count <> 29 then
    raise exception 'expected 29 Bordeaux places, got %', v_count;
  end if;
end $$;
