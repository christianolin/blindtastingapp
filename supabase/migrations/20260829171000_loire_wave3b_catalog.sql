-- Loire — wave 3b completion catalog (11 places, DRAFT).
--
-- * Valley-wide style AOCs as tier-2 backdrops (the Cotes du Rhone model):
--   Crémant de Loire, Rosé de Loire.
-- * Upper-Loire satellites as tier-2 (they sit ~150 km south of
--   Centre-Loire; folding them in would wreck its footprint): Côte
--   Roannaise, Côtes du Forez, Saint-Pourçain.
-- * Sub-region members (tier 3): Cabernet/Rosé d'Anjou + Coteaux de Saumur
--   under anjou-saumur, Coteaux du Vendômois under touraine-region,
--   Orléans + Orléans-Cléry under centre-loire.
-- Boundaries staged by run-targets; flip in 20260829172000; the touched
-- sub-regions + region re-derive afterwards (20260829175000+).
do $$
declare
  v_region uuid; v_as uuid; v_tr uuid; v_cl uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.loire' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.loire is not VERIFIED'; end if;
  select id into v_as from wine_places where canonical_key = 'france.loire.anjou-saumur' and publication_status = 'VERIFIED';
  select id into v_tr from wine_places where canonical_key = 'france.loire.touraine-region' and publication_status = 'VERIFIED';
  select id into v_cl from wine_places where canonical_key = 'france.loire.centre-loire' and publication_status = 'VERIFIED';
  if v_as is null or v_tr is null or v_cl is null then
    raise exception 'loire sub-regions are not VERIFIED';
  end if;

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_region, 'APPELLATION', 'france.loire.' || v.slug, v.name, v.slug, 2, 7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('cremant-de-loire', 'Crémant de Loire', 'regional', 5),
    ('rose-de-loire', 'Rosé de Loire', 'regional', 6),
    ('cote-roannaise', 'Côte Roannaise', 'communal', 7),
    ('cotes-du-forez', 'Côtes du Forez', 'communal', 8),
    ('saint-pourcain', 'Saint-Pourçain', 'communal', 9)
  ) as v(slug, name, level, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.loire.' || v.slug);

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_as, 'APPELLATION', 'france.loire.' || v.slug, v.name, v.slug, 3, 7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('cabernet-d-anjou', 'Cabernet d''Anjou', 'subregional', 60),
    ('rose-d-anjou', 'Rosé d''Anjou', 'subregional', 61),
    ('coteaux-de-saumur', 'Coteaux de Saumur', 'communal', 62)
  ) as v(slug, name, level, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.loire.' || v.slug);

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_tr, 'APPELLATION', 'france.loire.coteaux-du-vendomois', 'Coteaux du Vendômois', 'coteaux-du-vendomois', 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 63
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.loire.coteaux-du-vendomois');

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_cl, 'APPELLATION', 'france.loire.' || v.slug, v.name, v.slug, 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('orleans', 'Orléans', 64),
    ('orleans-clery', 'Orléans-Cléry', 65)
  ) as v(slug, name, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.loire.' || v.slug);

  -- Final-state assertions.
  select count(*) into v_n from wine_places
   where canonical_key in ('france.loire.cremant-de-loire','france.loire.rose-de-loire','france.loire.cote-roannaise','france.loire.cotes-du-forez','france.loire.saint-pourcain')
     and primary_parent_id = v_region and display_tier = 2;
  if v_n <> 5 then raise exception 'expected 5 wave-3b tier-2 places, got %', v_n; end if;
  select count(*) into v_n from wine_places
   where canonical_key in ('france.loire.cabernet-d-anjou','france.loire.rose-d-anjou','france.loire.coteaux-de-saumur')
     and primary_parent_id = v_as and display_tier = 3;
  if v_n <> 3 then raise exception 'expected 3 new anjou-saumur members, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.loire.coteaux-du-vendomois' and primary_parent_id = v_tr and display_tier = 3) then
    raise exception 'coteaux-du-vendomois catalog row wrong';
  end if;
  select count(*) into v_n from wine_places
   where canonical_key in ('france.loire.orleans','france.loire.orleans-clery')
     and primary_parent_id = v_cl and display_tier = 3;
  if v_n <> 2 then raise exception 'expected 2 new centre-loire members, got %', v_n; end if;
end;
$$;
