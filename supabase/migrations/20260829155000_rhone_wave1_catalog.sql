-- Vallee du Rhone — wave 1 completion catalog (29 places, DRAFT).
--
-- * Cotes du Rhone Villages (regional AOC, tier 2) + its 21 named-village
--   geographic denominations (tier 3 UNDER the CdRV place — the pyramid's
--   middle step). Visan has a reference row but no parcels in the pinned
--   INAO membership file — deferred with the other no-parcel refs.
-- * 6 satellite AOCs (tier 2 under france.rhone): Ventoux, Luberon,
--   Grignan-les-Adhemar, Cotes du Vivarais, Clairette de Die, Cremant de Die.
-- * Muscat de Beaumes-de-Venise (VDN twin of the dry cru, tier 3 under
--   meridional).
-- Boundaries staged by run-targets (concave INAO dissolves); flip in
-- 20260829156000.
do $$
declare
  v_region uuid; v_merid uuid; v_cdrv uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.rhone is not VERIFIED'; end if;
  select id into v_merid from wine_places
   where canonical_key = 'france.rhone.meridional' and publication_status = 'VERIFIED';
  if v_merid is null then raise exception 'france.rhone.meridional is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.cotes-du-rhone-villages') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_region, 'APPELLATION', 'france.rhone.cotes-du-rhone-villages', 'Côtes du Rhône Villages', 'cotes-du-rhone-villages', 2, 7, 7, 'DRAFT', true, 'AOC/AOP', 'regional', 4);
  end if;
  select id into v_cdrv from wine_places where canonical_key = 'france.rhone.cotes-du-rhone-villages';

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_cdrv, 'APPELLATION', 'france.rhone.cotes-du-rhone-villages.' || v.slug, v.name, v.slug, 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('chusclan','Chusclan',1),('gadagne','Gadagne',2),('laudun','Laudun',3),
    ('massif-d-uchaux','Massif d''Uchaux',4),('nyons','Nyons',5),('plan-de-dieu','Plan de Dieu',6),
    ('puymeras','Puyméras',7),('roaix','Roaix',8),('rochegude','Rochegude',9),
    ('rousset-les-vignes','Rousset-les-Vignes',10),('sablet','Sablet',11),('saint-andeol','Saint-Andéol',12),
    ('saint-gervais','Saint-Gervais',13),('saint-maurice','Saint-Maurice',14),('saint-pantaleon-les-vignes','Saint-Pantaléon-les-Vignes',15),
    ('sainte-cecile','Sainte-Cécile',16),('seguret','Séguret',17),('signargues','Signargues',18),
    ('suze-la-rousse','Suze-la-Rousse',19),('vaison-la-romaine','Vaison-la-Romaine',20),('valreas','Valréas',21)
  ) as v(slug, name, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.rhone.cotes-du-rhone-villages.' || v.slug);

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_region, 'APPELLATION', 'france.rhone.' || v.slug, v.name, v.slug, 2, 7, 7, 'DRAFT', true, 'AOC/AOP', 'regional', v.so
  from (values
    ('ventoux','Ventoux',5),('luberon','Luberon',6),('grignan-les-adhemar','Grignan-les-Adhémar',7),
    ('cotes-du-vivarais','Côtes du Vivarais',8),('clairette-de-die','Clairette de Die',9),('cremant-de-die','Crémant de Die',10)
  ) as v(slug, name, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.rhone.' || v.slug);

  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.muscat-de-beaumes-de-venise') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_merid, 'APPELLATION', 'france.rhone.muscat-de-beaumes-de-venise', 'Muscat de Beaumes-de-Venise', 'muscat-de-beaumes-de-venise', 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 18);
  end if;

  -- Final-state assertions.
  select count(*) into v_n from wine_places where primary_parent_id = v_cdrv and display_tier = 3;
  if v_n <> 21 then raise exception 'expected 21 named CdRV villages, got %', v_n; end if;
  select count(*) into v_n from wine_places
   where canonical_key in ('france.rhone.cotes-du-rhone-villages','france.rhone.ventoux','france.rhone.luberon','france.rhone.grignan-les-adhemar','france.rhone.cotes-du-vivarais','france.rhone.clairette-de-die','france.rhone.cremant-de-die','france.rhone.muscat-de-beaumes-de-venise');
  if v_n <> 8 then raise exception 'expected 8 wave-1 tier-2/VDN places, got %', v_n; end if;
  select count(*) into v_n from wine_places where canonical_key like 'france.rhone%' and kind = 'APPELLATION';
  if v_n <> 47 then raise exception 'expected 47 rhone appellation places, got %', v_n; end if;
end;
$$;
