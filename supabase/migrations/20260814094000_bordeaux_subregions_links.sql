-- Phase 3E scoring links: the 10 new Bordeaux appellations with an exact
-- scoring row. Côtes de Bordeaux-Saint-Macaire has no scoring row and stays
-- PENDING (no fuzzy matching).

update appellations a
set wine_place_id = p.id,
    map_status = 'VERIFIED',
    map_match_method = 'MIGRATED_EXACT',
    map_match_confidence = 1,
    map_reviewed_at = now(),
    map_review_note = 'Phase 3E bordeaux migration: exact name match'
from (values
  ('Listrac-Médoc AOP', 'france.bordeaux.haut-medoc.listrac-medoc'),
  ('Montagne-Saint-Emilion AOP', 'france.bordeaux.montagne-saint-emilion'),
  ('Lussac-Saint-Emilion AOP', 'france.bordeaux.lussac-saint-emilion'),
  ('Puisseguin-Saint-Emilion AOP', 'france.bordeaux.puisseguin-saint-emilion'),
  ('Saint-Georges-Saint-Emilion AOP', 'france.bordeaux.saint-georges-saint-emilion'),
  ('Lalande-de-Pomerol AOP', 'france.bordeaux.lalande-de-pomerol'),
  ('Cadillac AOP', 'france.bordeaux.cadillac'),
  ('Cerons AOP', 'france.bordeaux.cerons'),
  ('Loupiac AOP', 'france.bordeaux.loupiac'),
  ('Sainte-Croix-du-Mont AOP', 'france.bordeaux.sainte-croix-du-mont')
) as v(name, key)
join wine_places p on p.canonical_key = v.key
where a.name = v.name and a.wine_place_id is null;

do $$
declare v_count int;
begin
  select count(*) into v_count from appellations
   where map_review_note = 'Phase 3E bordeaux migration: exact name match';
  if v_count <> 10 then
    raise exception 'expected 10 Phase 3E links, got %', v_count;
  end if;
end $$;
