-- Tuscany round 1 catalog (DRAFT). New REGION (Toscana) + its headline
-- appellations, mirroring the tidy Piemonte model. Footprints (official Regione
-- Toscana GEOscopio data) are staged separately for the 15 footprint-bearing
-- places; the Montalcino/Montepulciano satellite DOCs are tree/Details-only.
--
--   italy
--   └─ Toscana (REGION)
--      ├─ Chianti Classico (DOCG)                         [footprint]
--      ├─ Chianti (SUBREGION, DOCG)                        [footprint]
--      │   └─ Rufina, Colli Fiorentini, Colli Senesi, Colli Aretini,
--      │      Colline Pisane, Montalbano, Montespertoli    [7 footprints]
--      ├─ Montalcino (SUBREGION, DOCG)                     [footprint = Brunello zone]
--      │   └─ Brunello, Rosso di Montalcino, Moscadello, Sant'Antimo  (tree-only)
--      ├─ Montepulciano (SUBREGION, DOCG)                  [footprint = Vino Nobile zone]
--      │   └─ Vino Nobile, Rosso di Montepulciano, Vin Santo (tree-only)
--      ├─ Bolgheri (SUBREGION, DOC)                        [footprint]
--      │   └─ Bolgheri Sassicaia (DOC)                     [footprint]
--      ├─ Vernaccia di San Gimignano (DOCG)               [footprint]
--      └─ Morellino di Scansano (DOCG)                    [footprint]

begin;

-- REGION node.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'toscana', 'italy.toscana', 'Toscana', 'REGION'::wine_place_kind, 1, 4, 4,
       false, null, null, 'DRAFT', 20, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

-- Tier-2 under Toscana.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, v.kind::wine_place_kind, 2, v.mz, v.mz, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('chianti-classico',           'italy.toscana.chianti-classico',           'Chianti Classico',            'APPELLATION', 'DOCG', 'subregional', 5, 10),
    ('chianti',                    'italy.toscana.chianti',                    'Chianti',                     'SUBREGION',   'DOCG', 'regional',    5, 20),
    ('montalcino',                 'italy.toscana.montalcino',                 'Montalcino',                  'SUBREGION',   'DOCG', 'communal',    6, 30),
    ('montepulciano',              'italy.toscana.montepulciano',              'Montepulciano',               'SUBREGION',   'DOCG', 'communal',    6, 40),
    ('bolgheri',                   'italy.toscana.bolgheri',                   'Bolgheri',                    'SUBREGION',   'DOC',  'communal',    6, 50),
    ('vernaccia-di-san-gimignano', 'italy.toscana.vernaccia-di-san-gimignano', 'Vernaccia di San Gimignano',  'APPELLATION', 'DOCG', 'communal',    6, 60),
    ('morellino-di-scansano',      'italy.toscana.morellino-di-scansano',      'Morellino di Scansano',       'APPELLATION', 'DOCG', 'subregional', 6, 70)
  ) as v(slug, ckey, name, kind, sys, lvl, mz, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana') p;

-- Chianti subzones (tier-3, DOCG).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOCG', 'subregional', 'DRAFT', v.so, p.id
  from (values
    ('chianti-rufina',           'italy.toscana.chianti-rufina',           'Chianti Rufina',            10),
    ('chianti-colli-fiorentini', 'italy.toscana.chianti-colli-fiorentini', 'Chianti Colli Fiorentini',  20),
    ('chianti-colli-senesi',     'italy.toscana.chianti-colli-senesi',     'Chianti Colli Senesi',      30),
    ('chianti-colli-aretini',    'italy.toscana.chianti-colli-aretini',    'Chianti Colli Aretini',     40),
    ('chianti-colline-pisane',   'italy.toscana.chianti-colline-pisane',   'Chianti Colline Pisane',    50),
    ('chianti-montalbano',       'italy.toscana.chianti-montalbano',       'Chianti Montalbano',        60),
    ('chianti-montespertoli',    'italy.toscana.chianti-montespertoli',    'Chianti Montespertoli',     70)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana.chianti') p;

-- Montalcino satellites (tier-3, tree-only).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, 'communal', 'DRAFT', v.so, p.id
  from (values
    ('brunello-di-montalcino',  'italy.toscana.brunello-di-montalcino',  'Brunello di Montalcino',  'DOCG', 10),
    ('rosso-di-montalcino',     'italy.toscana.rosso-di-montalcino',     'Rosso di Montalcino',     'DOC',  20),
    ('moscadello-di-montalcino','italy.toscana.moscadello-di-montalcino','Moscadello di Montalcino','DOC',  30),
    ('sant-antimo',             'italy.toscana.sant-antimo',             'Sant''Antimo',            'DOC',  40)
  ) as v(slug, ckey, name, sys, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana.montalcino') p;

-- Montepulciano satellites (tier-3, tree-only).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, 'communal', 'DRAFT', v.so, p.id
  from (values
    ('vino-nobile-di-montepulciano', 'italy.toscana.vino-nobile-di-montepulciano', 'Vino Nobile di Montepulciano', 'DOCG', 10),
    ('rosso-di-montepulciano',       'italy.toscana.rosso-di-montepulciano',       'Rosso di Montepulciano',       'DOC',  20),
    ('vin-santo-di-montepulciano',   'italy.toscana.vin-santo-di-montepulciano',   'Vin Santo di Montepulciano',   'DOC',  30)
  ) as v(slug, ckey, name, sys, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana.montepulciano') p;

-- Bolgheri Sassicaia (tier-3).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'bolgheri-sassicaia', 'italy.toscana.bolgheri-sassicaia', 'Bolgheri Sassicaia', 'APPELLATION'::wine_place_kind, 3, 8, 8,
       true, 'DOC', 'communal', 'DRAFT', 10, p.id
  from (select id from wine_places where canonical_key = 'italy.toscana.bolgheri') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.toscana%' and publication_status = 'DRAFT';
  if n <> 23 then raise exception 'expected 23 new DRAFT Toscana places, got %', n; end if;
end $$;

commit;
