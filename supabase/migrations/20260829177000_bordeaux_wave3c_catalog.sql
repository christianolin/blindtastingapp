-- Bordeaux — wave 3c completion catalog (5 places, DRAFT).
--
-- * Côtes de Bordeaux (umbrella of the côtes, scattered clusters), Graves
--   de Vayres (an Entre-deux-Mers enclave — NOT in the Graves district) and
--   Premières Côtes de Bordeaux (right-bank Garonne strip) as tier-2
--   children of the region.
-- * Graves Supérieures (sweet overlay of the Graves zone) tier 3 under
--   graves; Saint-Émilion Grand Cru (stricter overlay of the same zone)
--   tier 3 under saint-emilion — level stays 'communal' so the
--   classification ramp doesn't paint the whole commune "grand cru dark".
-- The three region-wide styles (Bordeaux AOP / Bordeaux Supérieur / Crémant
-- de Bordeaux) link to the dual-role france.bordeaux region place instead
-- (20260829179000) — the Champagne/Languedoc model; no near-duplicate
-- region outlines. Existing Blaye + Cotes de Bordeaux Saint-Macaire places
-- get their missing links there too. Flip in 20260829178000.
do $$
declare
  v_region uuid; v_graves uuid; v_se uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.bordeaux' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.bordeaux is not VERIFIED'; end if;
  select id into v_graves from wine_places where canonical_key = 'france.bordeaux.graves' and publication_status = 'VERIFIED';
  select id into v_se from wine_places where canonical_key = 'france.bordeaux.saint-emilion' and publication_status = 'VERIFIED';
  if v_graves is null or v_se is null then
    raise exception 'graves/saint-emilion parents are not VERIFIED';
  end if;

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_region, 'APPELLATION', 'france.bordeaux.' || v.slug, v.name, v.slug, 2, 7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('cotes-de-bordeaux', 'Côtes de Bordeaux', 'subregional', 90),
    ('graves-de-vayres', 'Graves de Vayres', 'communal', 91),
    ('premieres-cotes-de-bordeaux', 'Premières Côtes de Bordeaux', 'communal', 92)
  ) as v(slug, name, level, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.bordeaux.' || v.slug);

  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.graves.graves-superieures') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_graves, 'APPELLATION', 'france.bordeaux.graves.graves-superieures', 'Graves Supérieures', 'graves-superieures', 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 90);
  end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.saint-emilion.saint-emilion-grand-cru') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_se, 'APPELLATION', 'france.bordeaux.saint-emilion.saint-emilion-grand-cru', 'Saint-Émilion Grand Cru', 'saint-emilion-grand-cru', 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 90);
  end if;

  -- Final-state assertions.
  select count(*) into v_n from wine_places
   where canonical_key in ('france.bordeaux.cotes-de-bordeaux','france.bordeaux.graves-de-vayres','france.bordeaux.premieres-cotes-de-bordeaux')
     and primary_parent_id = v_region and display_tier = 2;
  if v_n <> 3 then raise exception 'expected 3 wave-3c tier-2 places, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.graves.graves-superieures' and primary_parent_id = v_graves and display_tier = 3) then
    raise exception 'graves-superieures catalog row wrong';
  end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.saint-emilion.saint-emilion-grand-cru' and primary_parent_id = v_se and display_tier = 3) then
    raise exception 'saint-emilion-grand-cru catalog row wrong';
  end if;
end;
$$;
