-- Wave 4 catalog (DRAFT): round-2 long-tails across Sicily, Lombardy, Friuli
-- and Veneto, plus Trentodoc under Trentino (the Trentino DOC umbrella footprint
-- itself attaches to the existing italy.trentino-alto-adige.trentino node via
-- staging). Veneto footprints are parcel-accurate (Regione Veneto); the rest are
-- comune-union. Staged separately.

begin;

-- Sicily.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('noto',  'italy.sicilia.noto',  'Noto',  'subregional', 50),
    ('menfi', 'italy.sicilia.menfi', 'Menfi', 'subregional', 60),
    ('faro',  'italy.sicilia.faro',  'Faro',  'communal',    70)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.sicilia') p;

-- Lombardy.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'san-colombano', 'italy.lombardia.san-colombano', 'San Colombano al Lambro', 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', 'communal', 'DRAFT', 70, p.id
  from (select id from wine_places where canonical_key = 'italy.lombardia') p;

-- Friuli.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'friuli-isonzo', 'italy.friuli.friuli-isonzo', 'Friuli Isonzo', 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', 'subregional', 'DRAFT', 40, p.id
  from (select id from wine_places where canonical_key = 'italy.friuli') p;

-- Veneto.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, 'subregional', 'DRAFT', v.so, p.id
  from (values
    ('montello-colli-asolani', 'italy.veneto.montello-colli-asolani', 'Montello - Colli Asolani', 'DOC',  160),
    ('monti-lessini',          'italy.veneto.monti-lessini',          'Monti Lessini',            'DOC',  170),
    ('colli-di-conegliano',    'italy.veneto.colli-di-conegliano',    'Colli di Conegliano',      'DOCG', 180),
    ('bagnoli',                'italy.veneto.bagnoli',                'Bagnoli',                  'DOC',  190)
  ) as v(slug, ckey, name, sys, so)
  cross join (select id from wine_places where canonical_key = 'italy.veneto') p;

-- Trentino: Trentodoc (tree-only sparkling, shares the Trentino zone).
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'trentodoc', 'italy.trentino-alto-adige.trentodoc', 'Trentodoc', 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOC', 'regional', 'DRAFT', 20, p.id
  from (select id from wine_places where canonical_key = 'italy.trentino-alto-adige.trentino') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key in (
    'italy.sicilia.noto','italy.sicilia.menfi','italy.sicilia.faro','italy.lombardia.san-colombano',
    'italy.friuli.friuli-isonzo','italy.veneto.montello-colli-asolani','italy.veneto.monti-lessini',
    'italy.veneto.colli-di-conegliano','italy.veneto.bagnoli','italy.trentino-alto-adige.trentodoc'
  ) and publication_status = 'DRAFT';
  if n <> 10 then raise exception 'expected 10 new DRAFT wave-4 places, got %', n; end if;
end $$;

commit;
