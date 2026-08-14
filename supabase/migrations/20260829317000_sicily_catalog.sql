-- Sicily round 1 catalog (DRAFT). New REGION. Sicily has no official
-- delimited-zone GIS, so footprints are ISTAT comune-union approximations from
-- the MASAF disciplinari (staged separately). Sicilia DOC = the whole island,
-- so it is tree/Details-only (the region fill already shows the island).
--
--   italy
--   └─ Sicilia (REGION)                       [ISTAT blob]
--      ├─ Sicilia DOC                          (tree-only — whole island)
--      ├─ Etna (DOC)                           [comune-union footprint]
--      ├─ Cerasuolo di Vittoria (DOCG)         [comune-union footprint]
--      └─ Marsala (DOC)                        [comune-union footprint]

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'sicilia', 'italy.sicilia', 'Sicilia', 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', 50, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('sicilia-doc',            'italy.sicilia.sicilia-doc',            'Sicilia DOC',            'DOC',  'regional',    10),
    ('etna',                   'italy.sicilia.etna',                   'Etna',                   'DOC',  'subregional', 20),
    ('cerasuolo-di-vittoria',  'italy.sicilia.cerasuolo-di-vittoria',  'Cerasuolo di Vittoria',  'DOCG', 'subregional', 30),
    ('marsala',                'italy.sicilia.marsala',                'Marsala',                'DOC',  'subregional', 40)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.sicilia') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.sicilia%' and publication_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 new DRAFT Sicily places, got %', n; end if;
end $$;

commit;
