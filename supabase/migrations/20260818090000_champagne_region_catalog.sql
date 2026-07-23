-- Champagne region — catalog (place only, DRAFT).
--
-- Champagne has ZERO parcels in the IGN AOC-VITICOLES:aire_parcellaire layer
-- that sources every other French region (verified live: LIKE '%Champagne%'
-- returns 0 while '%Bourgogne%' returns 37,416). Its footprint is therefore a
-- commune-union: the dissolve of its 635 official member communes (INAO
-- "Aires géographiques des AOC/AOP" open dataset, Licence Ouverte) fetched from
-- IGN Admin Express. The DRAFT boundary is staged by
-- scripts/wine-map-sources/fetch-champagne-communes.mjs (namespace
-- IGN_ADMIN_EXPRESS); the verification flip lands in 20260818093000 after
-- shape review. This migration only inserts the place so the boundary can
-- reference it.
do $$
declare
  v_france uuid;
  v_id uuid;
begin
  select id into v_france from wine_places where canonical_key = 'france';
  if v_france is null then
    raise exception 'france place missing';
  end if;

  if exists (select 1 from wine_places where canonical_key = 'france.champagne') then
    raise exception 'france.champagne already exists';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.champagne', 'Champagne', 'champagne', 1,
    4, 4, 'DRAFT',
    true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_id;

  -- Same-transaction assertion (never trust "version recorded").
  if not exists (
    select 1 from wine_places
     where id = v_id
       and canonical_key = 'france.champagne'
       and primary_parent_id = v_france
       and publication_status = 'DRAFT'
       and display_tier = 1
       and kind = 'REGION'
       and is_appellation
       and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional'
  ) then
    raise exception 'champagne catalog post-insert assertion failed';
  end if;
end;
$$;
