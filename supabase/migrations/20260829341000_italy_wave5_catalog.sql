-- Wave 5 catalog (DRAFT): five new Italian regions (Emilia-Romagna, Campania,
-- Puglia, Umbria, Abruzzo) + their flagship appellations. All comune-union
-- footprints (no official delimited-zone GIS) except the three Abruzzo regional
-- DOCs, which are region-wide and therefore tree-only (the region blob shows
-- them). Footprints staged separately via stage-wave5-region.mjs.
--
--   italy
--   ├─ Emilia-Romagna (REGION)
--   │   ├─ Romagna Albana (DOCG)                     [footprint]
--   │   ├─ Lambrusco di Sorbara (DOC)                [footprint]
--   │   └─ Lambrusco Grasparossa di Castelvetro (DOC)[footprint]
--   ├─ Campania (REGION)
--   │   ├─ Taurasi (DOCG) / Greco di Tufo (DOCG) / Fiano di Avellino (DOCG)  [footprints]
--   ├─ Puglia (REGION)
--   │   ├─ Primitivo di Manduria (DOC) / Castel del Monte (DOCG) / Salice Salentino (DOC) [footprints]
--   ├─ Umbria (REGION)
--   │   ├─ Montefalco Sagrantino (DOCG) / Torgiano Rosso Riserva (DOCG) / Orvieto (DOC) [footprints]
--   └─ Abruzzo (REGION)
--       ├─ Montepulciano d'Abruzzo Colline Teramane (DOCG)  [footprint]
--       └─ Montepulciano/Trebbiano/Cerasuolo d'Abruzzo (DOC) [tree-only, region-wide]

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', v.so, p.id
  from (values
    ('emilia-romagna', 'italy.emilia-romagna', 'Emilia-Romagna', 80),
    ('campania',       'italy.campania',       'Campania',       90),
    ('puglia',         'italy.puglia',         'Puglia',         100),
    ('umbria',         'italy.umbria',         'Umbria',         110),
    ('abruzzo',        'italy.abruzzo',        'Abruzzo',        120)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    -- Emilia-Romagna
    ('romagna-albana',                     'italy.emilia-romagna.romagna-albana',                     'Romagna Albana',                     'DOCG', 'subregional', 10, 'italy.emilia-romagna'),
    ('lambrusco-di-sorbara',               'italy.emilia-romagna.lambrusco-di-sorbara',               'Lambrusco di Sorbara',               'DOC',  'subregional', 20, 'italy.emilia-romagna'),
    ('lambrusco-grasparossa-di-castelvetro','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro','Lambrusco Grasparossa di Castelvetro','DOC', 'subregional', 30, 'italy.emilia-romagna'),
    -- Campania
    ('taurasi',            'italy.campania.taurasi',            'Taurasi',            'DOCG', 'subregional', 10, 'italy.campania'),
    ('greco-di-tufo',      'italy.campania.greco-di-tufo',      'Greco di Tufo',      'DOCG', 'subregional', 20, 'italy.campania'),
    ('fiano-di-avellino',  'italy.campania.fiano-di-avellino',  'Fiano di Avellino',  'DOCG', 'subregional', 30, 'italy.campania'),
    -- Puglia
    ('primitivo-di-manduria', 'italy.puglia.primitivo-di-manduria', 'Primitivo di Manduria', 'DOC',  'subregional', 10, 'italy.puglia'),
    ('castel-del-monte',      'italy.puglia.castel-del-monte',      'Castel del Monte',      'DOCG', 'subregional', 20, 'italy.puglia'),
    ('salice-salentino',      'italy.puglia.salice-salentino',      'Salice Salentino',      'DOC',  'subregional', 30, 'italy.puglia'),
    -- Umbria
    ('montefalco-sagrantino',   'italy.umbria.montefalco-sagrantino',   'Montefalco Sagrantino',   'DOCG', 'subregional', 10, 'italy.umbria'),
    ('torgiano-rosso-riserva',  'italy.umbria.torgiano-rosso-riserva',  'Torgiano Rosso Riserva',  'DOCG', 'communal',    20, 'italy.umbria'),
    ('orvieto',                 'italy.umbria.orvieto',                 'Orvieto',                 'DOC',  'subregional', 30, 'italy.umbria'),
    -- Abruzzo
    ('montepulciano-d-abruzzo-colline-teramane', 'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane', 'Montepulciano d''Abruzzo Colline Teramane', 'DOCG', 'subregional', 10, 'italy.abruzzo'),
    ('montepulciano-d-abruzzo',  'italy.abruzzo.montepulciano-d-abruzzo',  'Montepulciano d''Abruzzo',  'DOC', 'regional', 20, 'italy.abruzzo'),
    ('trebbiano-d-abruzzo',      'italy.abruzzo.trebbiano-d-abruzzo',      'Trebbiano d''Abruzzo',      'DOC', 'regional', 30, 'italy.abruzzo'),
    ('cerasuolo-d-abruzzo',      'italy.abruzzo.cerasuolo-d-abruzzo',      'Cerasuolo d''Abruzzo',      'DOC', 'regional', 40, 'italy.abruzzo')
  ) as v(slug, ckey, name, sys, lvl, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare nr int; na int;
begin
  select count(*) into nr from wine_places where canonical_key in ('italy.emilia-romagna','italy.campania','italy.puglia','italy.umbria','italy.abruzzo') and kind='REGION' and publication_status='DRAFT';
  if nr <> 5 then raise exception 'expected 5 new DRAFT regions, got %', nr; end if;
  select count(*) into na from wine_places where kind='APPELLATION' and publication_status='DRAFT'
    and canonical_key ~ '^italy\.(emilia-romagna|campania|puglia|umbria|abruzzo)\.';
  if na <> 16 then raise exception 'expected 16 new DRAFT appellations, got %', na; end if;
end $$;

commit;
