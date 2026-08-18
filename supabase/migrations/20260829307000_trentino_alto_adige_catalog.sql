-- Trentino-Alto Adige round 1 catalog (DRAFT). New REGION with the Alto Adige
-- (Südtirol) subregion and its named DOC subzones. Trentino (Trento province)
-- is a separate autonomous province with its own GIS and will follow.
--
--   italy
--   └─ Trentino-Alto Adige (REGION)                       [ISTAT blob]
--      ├─ Alto Adige (SUBREGION, DOC — the umbrella)       [footprint]
--      │   └─ Santa Maddalena, Terlano, Meranese, Valle Isarco,
--      │      Val Venosta, Colli di Bolzano, Lago di Caldaro   [7 footprints]
--      ├─ Valdadige (DOC — shared valley floor)            [footprint]
--      ├─ Mitterberg (IGT)                                 (tree-only)
--      └─ Vigneti delle Dolomiti (IGT)                     (tree-only)
-- Footprints from the official Provincia di Bolzano dataset, staged separately.

begin;

-- REGION node.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'trentino-alto-adige', 'italy.trentino-alto-adige', 'Trentino-Alto Adige', 'REGION'::wine_place_kind, 1, 4, 4,
       false, null, null, 'DRAFT', 30, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

-- Alto Adige subregion (umbrella DOC, footprint).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'alto-adige', 'italy.trentino-alto-adige.alto-adige', 'Alto Adige', 'SUBREGION'::wine_place_kind, 2, 5, 5,
       true, 'DOC', 'regional', 'DRAFT', 10, p.id
  from (select id from wine_places where canonical_key = 'italy.trentino-alto-adige') p;

-- Tier-2 broad/shared appellations under the region.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, 'regional', 'DRAFT', v.so, p.id
  from (values
    ('valdadige',              'italy.trentino-alto-adige.valdadige',              'Valdadige',              'DOC', 20),
    ('mitterberg',             'italy.trentino-alto-adige.mitterberg',             'Mitterberg',             'IGT', 30),
    ('vigneti-delle-dolomiti', 'italy.trentino-alto-adige.vigneti-delle-dolomiti', 'Vigneti delle Dolomiti', 'IGT', 40)
  ) as v(slug, ckey, name, sys, so)
  cross join (select id from wine_places where canonical_key = 'italy.trentino-alto-adige') p;

-- Alto Adige named subzones (tier-3).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOC', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('santa-maddalena',  'italy.trentino-alto-adige.santa-maddalena',  'Santa Maddalena',  'communal',    10),
    ('terlano',          'italy.trentino-alto-adige.terlano',          'Terlano',          'communal',    20),
    ('meranese',         'italy.trentino-alto-adige.meranese',         'Meranese',         'communal',    30),
    ('valle-isarco',     'italy.trentino-alto-adige.valle-isarco',     'Valle Isarco',     'subregional', 40),
    ('val-venosta',      'italy.trentino-alto-adige.val-venosta',      'Val Venosta',      'subregional', 50),
    ('colli-di-bolzano', 'italy.trentino-alto-adige.colli-di-bolzano', 'Colli di Bolzano', 'communal',    60),
    ('lago-di-caldaro',  'italy.trentino-alto-adige.lago-di-caldaro',  'Lago di Caldaro',  'communal',    70)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.trentino-alto-adige.alto-adige') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.trentino-alto-adige%' and publication_status = 'DRAFT';
  if n <> 12 then raise exception 'expected 12 new DRAFT Trentino-Alto Adige places, got %', n; end if;
end $$;

commit;
