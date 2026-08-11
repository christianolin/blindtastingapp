-- Piedmont batch 1 catalog (DRAFT): two subregions + the marquee DOCGs.
--
-- Tidy hierarchy:
--   Piemonte
--   ├─ Monferrato (subregion = Monferrato DOC)  → Barbera d'Asti, Nizza, Asti, Brachetto d'Acqui
--   ├─ Alto Piemonte (subregion, tree-only)     → Gattinara, Ghemme
--   ├─ Roero (appellation)
--   └─ Gavi (appellation)
--
-- Geometry (official Regione Piemonte data) is staged separately for all except
-- Alto Piemonte, which is a boundary-less grouping node (tree/Details only). All
-- DRAFT until the reviewed flip.

begin;

-- Tier-2 nodes under Piemonte: 2 subregions + 2 standalone appellations.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, v.kind::wine_place_kind, 2, v.mz, v.mz, v.is_app, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('monferrato',    'italy.piemonte.monferrato',    'Monferrato',    'SUBREGION',   5.0, true,  'DOC',  'subregional', 20),
    ('alto-piemonte', 'italy.piemonte.alto-piemonte', 'Alto Piemonte', 'SUBREGION',   5.0, false, null,   null,          30),
    ('roero',         'italy.piemonte.roero',         'Roero',         'APPELLATION', 6.0, true,  'DOCG', 'subregional', 40),
    ('gavi',          'italy.piemonte.gavi',          'Gavi',          'APPELLATION', 6.0, true,  'DOCG', 'subregional', 50)
  ) as v(slug, ckey, name, kind, mz, is_app, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte') p;

-- Tier-3 appellations under Monferrato.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION', 3, 7, 7, true, 'DOCG', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('barbera-dasti',    'italy.piemonte.barbera-dasti',    'Barbera d''Asti',     'subregional', 10),
    ('nizza',            'italy.piemonte.nizza',            'Nizza',               'communal',    20),
    ('asti',             'italy.piemonte.asti',             'Asti',                'regional',    30),
    ('brachetto-dacqui', 'italy.piemonte.brachetto-dacqui', 'Brachetto d''Acqui',  'subregional', 40)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.monferrato') p;

-- Tier-3 appellations under Alto Piemonte.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION', 3, 7, 7, true, 'DOCG', 'communal', 'DRAFT', v.so, p.id
  from (values
    ('gattinara', 'italy.piemonte.gattinara', 'Gattinara', 10),
    ('ghemme',    'italy.piemonte.ghemme',    'Ghemme',    20)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.alto-piemonte') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.monferrato','italy.piemonte.alto-piemonte','italy.piemonte.roero','italy.piemonte.gavi',
     'italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.asti','italy.piemonte.brachetto-dacqui',
     'italy.piemonte.gattinara','italy.piemonte.ghemme'
   ) and publication_status = 'DRAFT';
  if n <> 10 then raise exception 'expected 10 new DRAFT batch-1 places, got %', n; end if;
end $$;

commit;
