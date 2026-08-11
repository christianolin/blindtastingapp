-- Piedmont batch 4 catalog (DRAFT): the Canavese subregion, north of Turin
-- (Ivrea morainic amphitheatre). Mirrors the Monferrato pattern — a SUBREGION
-- node carrying its own umbrella-DOC footprint, with appellations beneath.
--   Piemonte
--   └─ Canavese (subregion = Canavese DOC)
--      ├─ Erbaluce di Caluso (DOCG — white, sparkling, passito)
--      └─ Carema (DOC — alpine Nebbiolo)
-- Footprints from the official Regione Piemonte dataset, staged separately.

begin;

-- Tier-2 subregion node (carries the Canavese DOC footprint).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'canavese', 'italy.piemonte.canavese', 'Canavese', 'SUBREGION'::wine_place_kind, 2, 5, 5,
       true, 'DOC', 'subregional', 'DRAFT', 80, p.id
  from (select id from wine_places where canonical_key = 'italy.piemonte') p;

-- Tier-3 appellations under Canavese.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('erbaluce-di-caluso', 'italy.piemonte.erbaluce-di-caluso', 'Erbaluce di Caluso', 'DOCG', 'subregional', 10),
    ('carema',             'italy.piemonte.carema',             'Carema',             'DOC',  'communal',    20)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.canavese') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in ('italy.piemonte.canavese','italy.piemonte.erbaluce-di-caluso','italy.piemonte.carema')
     and publication_status = 'DRAFT';
  if n <> 3 then raise exception 'expected 3 new DRAFT batch-4 places, got %', n; end if;
end $$;

commit;
