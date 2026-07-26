-- Champagne — premier-cru completion catalog (places only, DRAFT).
--
-- The four échelle-des-crus Premier Cru villages deferred from the original
-- wave because their communes merged into communes nouvelles: their historic
-- footprints ARE available as IGN Admin Express communes déléguées
-- (probed live: Mareuil-sur-Aÿ = déléguée 51347 and Bisseuil = déléguée
-- 51064, both within Aÿ-Champagne 51030; Tauxières-Mutry = 51564;
-- Vertus = 51612 within Blancs-Coteaux). Model identical to the 55 live
-- villages: kind SITE, tier 3, zoom 8, NOT an appellation (échelle ratings
-- are village ratings, not AOCs), parent = the sub-region. Boundaries are
-- staged from the déléguée polygons next (MANUAL, IGN_ADMIN_EXPRESS) and the
-- reviewed flip — which also refines Aÿ Grand Cru from its over-wide
-- commune-nouvelle footprint to the historic Ay déléguée — lands in
-- 20260829132000.
do $$
declare
  v_n int;
begin
  if exists (
    select 1 from wine_places where canonical_key in (
      'france.champagne.mareuil-sur-ay', 'france.champagne.bisseuil',
      'france.champagne.tauxieres-mutry', 'france.champagne.vertus'
    )
  ) then
    raise exception 'champagne completion places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select parent.id, 'SITE', 'france.champagne.' || v.slug, v.name, v.slug, 3,
         8, 8, 'DRAFT', false, null, null, v.so
  from (values
    ('mareuil-sur-ay',  'Mareuil-sur-Aÿ',  'france.champagne.grande-vallee-de-la-marne', 200),
    ('bisseuil',        'Bisseuil',        'france.champagne.grande-vallee-de-la-marne', 201),
    ('tauxieres-mutry', 'Tauxières-Mutry', 'france.champagne.montagne-de-reims',         202),
    ('vertus',          'Vertus',          'france.champagne.cote-des-blancs',           203)
  ) as v(slug, name, parent_key, so)
  join wine_places parent on parent.canonical_key = v.parent_key;

  select count(*) into v_n from wine_places
   where canonical_key like 'france.champagne.%' and kind = 'SITE';
  if v_n <> 59 then
    raise exception 'expected 59 champagne SITE villages, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key in (
          'france.champagne.mareuil-sur-ay', 'france.champagne.bisseuil',
          'france.champagne.tauxieres-mutry', 'france.champagne.vertus'
        )
          and kind = 'SITE' and not is_appellation
          and display_tier = 3 and min_zoom = 8
          and publication_status = 'DRAFT') <> 4 then
    raise exception 'champagne completion places assertion failed';
  end if;
end;
$$;
