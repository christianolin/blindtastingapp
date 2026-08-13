-- Tuscany round 2 catalog (DRAFT): 12 further notable DOC/DOCG zones, all
-- tier-2 appellations directly under Toscana (geographically scattered, no
-- single grouping). Footprints from the official Regione Toscana dataset,
-- staged separately.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('carmignano',              'italy.toscana.carmignano',              'Carmignano',              'DOCG', 'subregional',  80),
    ('cortona',                 'italy.toscana.cortona',                 'Cortona',                 'DOC',  'subregional',  90),
    ('maremma-toscana',         'italy.toscana.maremma-toscana',         'Maremma Toscana',         'DOC',  'regional',    100),
    ('montecucco',              'italy.toscana.montecucco',              'Montecucco',              'DOC',  'subregional', 110),
    ('orcia',                   'italy.toscana.orcia',                   'Orcia',                   'DOC',  'subregional', 120),
    ('suvereto',                'italy.toscana.suvereto',                'Suvereto',                'DOCG', 'communal',    130),
    ('val-di-cornia',           'italy.toscana.val-di-cornia',           'Val di Cornia',           'DOC',  'subregional', 140),
    ('colline-lucchesi',        'italy.toscana.colline-lucchesi',        'Colline Lucchesi',        'DOC',  'subregional', 150),
    ('montecarlo',              'italy.toscana.montecarlo',              'Montecarlo',              'DOC',  'communal',    160),
    ('elba',                    'italy.toscana.elba',                    'Elba',                    'DOC',  'subregional', 170),
    ('pomino',                  'italy.toscana.pomino',                  'Pomino',                  'DOC',  'communal',    180),
    ('candia-dei-colli-apuani', 'italy.toscana.candia-dei-colli-apuani', 'Candia dei Colli Apuani', 'DOC',  'subregional', 190)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.toscana.carmignano','italy.toscana.cortona','italy.toscana.maremma-toscana','italy.toscana.montecucco',
     'italy.toscana.orcia','italy.toscana.suvereto','italy.toscana.val-di-cornia','italy.toscana.colline-lucchesi',
     'italy.toscana.montecarlo','italy.toscana.elba','italy.toscana.pomino','italy.toscana.candia-dei-colli-apuani'
   ) and publication_status = 'DRAFT';
  if n <> 12 then raise exception 'expected 12 new DRAFT round-2 places, got %', n; end if;
end $$;

commit;
