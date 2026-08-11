-- Piedmont batch 7 catalog (DRAFT): the Torino province + alpine/Cuneo fringe.
-- These are geographically scattered with no natural umbrella, so they sit as
-- tier-2 appellations directly under Piemonte (as Alta Langa / Colli Tortonesi
-- already do). Alba DOC is the exception — the Alba blend zone, placed under
-- Langhe. Footprints from the official Regione Piemonte dataset, staged
-- separately.

begin;

-- Tier-2 appellations directly under Piemonte.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('collina-torinese',    'italy.piemonte.collina-torinese',    'Collina Torinese',                 'subregional',  90),
    ('freisa-di-chieri',    'italy.piemonte.freisa-di-chieri',    'Freisa di Chieri',                 'subregional', 100),
    ('malvasia-castelnuovo','italy.piemonte.malvasia-castelnuovo','Malvasia di Castelnuovo Don Bosco','communal',    110),
    ('pinerolese',          'italy.piemonte.pinerolese',          'Pinerolese',                       'subregional', 120),
    ('valsusa',             'italy.piemonte.valsusa',             'Valsusa',                          'communal',    130),
    ('colline-saluzzesi',   'italy.piemonte.colline-saluzzesi',   'Colline Saluzzesi',                'subregional', 140),
    ('valli-ossolane',      'italy.piemonte.valli-ossolane',      'Valli Ossolane',                   'subregional', 150)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte') p;

-- Alba DOC under Langhe.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'alba', 'italy.piemonte.alba', 'Alba', 'APPELLATION'::wine_place_kind, 3, 7, 7,
       true, 'DOC', 'subregional', 'DRAFT', 100, p.id
  from (select id from wine_places where canonical_key = 'italy.piemonte.langhe') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.collina-torinese','italy.piemonte.freisa-di-chieri','italy.piemonte.malvasia-castelnuovo',
     'italy.piemonte.pinerolese','italy.piemonte.valsusa','italy.piemonte.colline-saluzzesi','italy.piemonte.valli-ossolane',
     'italy.piemonte.alba'
   ) and publication_status = 'DRAFT';
  if n <> 8 then raise exception 'expected 8 new DRAFT batch-7 places, got %', n; end if;
end $$;

commit;
