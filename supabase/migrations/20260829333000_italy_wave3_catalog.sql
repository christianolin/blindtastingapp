-- Wave 3 catalog (DRAFT): fill the hollow Trentino half of Trentino-Alto Adige,
-- plus notable additions in Lombardy and Friuli. All comune-union footprints,
-- staged separately.
--   Trentino-Alto Adige
--     └─ Trentino (SUBREGION, tree-only for now — the broad Trentino DOC
--        umbrella needs its full 72-comune list) → Teroldego Rotaliano [footprint]
--   Lombardia → Riviera del Garda Classico (DOC), Moscato di Scanzo (DOCG)
--   Friuli    → Carso (DOC)

begin;

-- Trentino subregion (grouping node, no footprint yet).
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'trentino', 'italy.trentino-alto-adige.trentino', 'Trentino', 'SUBREGION'::wine_place_kind, 2, 5, 5, true, 'DOC', 'regional', 'DRAFT', 5, p.id
  from (select id from wine_places where canonical_key = 'italy.trentino-alto-adige') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'teroldego-rotaliano', 'italy.trentino-alto-adige.teroldego-rotaliano', 'Teroldego Rotaliano', 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOC', 'communal', 'DRAFT', 10, p.id
  from (select id from wine_places where canonical_key = 'italy.trentino-alto-adige.trentino') p;

-- Lombardy additions.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('riviera-del-garda-classico', 'italy.lombardia.riviera-del-garda-classico', 'Riviera del Garda Classico', 'DOC',  'subregional', 50),
    ('moscato-di-scanzo',          'italy.lombardia.moscato-di-scanzo',          'Moscato di Scanzo',          'DOCG', 'communal',    60)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.lombardia') p;

-- Friuli addition.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'carso', 'italy.friuli.carso', 'Carso', 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', 'subregional', 'DRAFT', 30, p.id
  from (select id from wine_places where canonical_key = 'italy.friuli') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key in (
    'italy.trentino-alto-adige.trentino','italy.trentino-alto-adige.teroldego-rotaliano',
    'italy.lombardia.riviera-del-garda-classico','italy.lombardia.moscato-di-scanzo','italy.friuli.carso'
  ) and publication_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 new DRAFT wave-3 places, got %', n; end if;
end $$;

commit;
