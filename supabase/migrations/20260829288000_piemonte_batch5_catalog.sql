-- Piedmont batch 5 catalog (DRAFT): the Asti/Monferrato long tail — 13 further
-- denominations, all tier-3 under Monferrato. Footprints from the official
-- Regione Piemonte dataset, staged separately.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('barbera-del-monferrato',           'italy.piemonte.barbera-del-monferrato',           'Barbera del Monferrato',            'DOC',  'subregional',  80),
    ('barbera-del-monferrato-superiore', 'italy.piemonte.barbera-del-monferrato-superiore', 'Barbera del Monferrato Superiore',  'DOCG', 'subregional',  90),
    ('terre-alfieri',                    'italy.piemonte.terre-alfieri',                    'Terre Alfieri',                     'DOCG', 'subregional', 100),
    ('cortese-alto-monferrato',          'italy.piemonte.cortese-alto-monferrato',          'Cortese dell''Alto Monferrato',     'DOC',  'subregional', 110),
    ('albugnano',                        'italy.piemonte.albugnano',                        'Albugnano',                         'DOC',  'communal',    120),
    ('freisa-dasti',                     'italy.piemonte.freisa-dasti',                     'Freisa d''Asti',                    'DOC',  'subregional', 130),
    ('dolcetto-dasti',                   'italy.piemonte.dolcetto-dasti',                   'Dolcetto d''Asti',                  'DOC',  'subregional', 140),
    ('canelli',                          'italy.piemonte.canelli',                          'Canelli',                           'DOCG', 'communal',    150),
    ('calosso',                          'italy.piemonte.calosso',                          'Calosso',                           'DOC',  'communal',    160),
    ('malvasia-di-casorzo',              'italy.piemonte.malvasia-di-casorzo',              'Malvasia di Casorzo d''Asti',       'DOC',  'communal',    170),
    ('loazzolo',                         'italy.piemonte.loazzolo',                         'Loazzolo',                          'DOC',  'communal',    180),
    ('gabiano',                          'italy.piemonte.gabiano',                          'Gabiano',                           'DOC',  'communal',    190),
    ('rubino-di-cantavenna',             'italy.piemonte.rubino-di-cantavenna',             'Rubino di Cantavenna',              'DOC',  'communal',    200)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.monferrato') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.barbera-del-monferrato','italy.piemonte.barbera-del-monferrato-superiore','italy.piemonte.terre-alfieri',
     'italy.piemonte.cortese-alto-monferrato','italy.piemonte.albugnano','italy.piemonte.freisa-dasti','italy.piemonte.dolcetto-dasti',
     'italy.piemonte.canelli','italy.piemonte.calosso','italy.piemonte.malvasia-di-casorzo','italy.piemonte.loazzolo',
     'italy.piemonte.gabiano','italy.piemonte.rubino-di-cantavenna'
   ) and publication_status = 'DRAFT';
  if n <> 13 then raise exception 'expected 13 new DRAFT batch-5 places, got %', n; end if;
end $$;

commit;
