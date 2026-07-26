-- Languedoc-Roussillon — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: BOTH `regions` rows
-- 'Languedoc' and 'Roussillon' -> the combined region place
-- france.languedoc-roussillon (the model has one region node spanning both,
-- anchored on the Languedoc AOC footprint), and 33 `appellations` rows by
-- their exact stored names. 'Languedoc AOP' and 'Roussillon AOP' also map to
-- the region place (dual-role pattern). Stored short forms are curated
-- exact-stored-name rows: 'Gres de Montpellier AOP' / 'Montpeyroux AOP' (the
-- Languedoc terroirs), 'Caramany AOP' / 'Lesquerde AOP' / 'Tautavel AOP'
-- (Cotes du Roussillon Villages named crus), and 'Maury Sec AOP' joins
-- 'Maury AOP' on the Maury place (the dry AOC shares the delimitation).
-- Places with no scoring row (the Clairette du Languedoc communes, the
-- Languedoc saint-terroirs, Corbieres-Boutenac, Minervois-La Liviniere,
-- Saint-Chinian Berlou/Roquebrun, Les Aspres, Grand Roussillon, Muscat de
-- Frontignan, Muscat de Mireval...) stay map-only per the artifact rule.
-- Left PENDING deliberately: 'Blanquette de Limoux AOP' and 'Cremant de
-- Limoux AOP' (style AOCs of Limoux) and 'Clairette de Die AOP' (Rhone/Die,
-- artifact caveat).
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.languedoc-roussillon' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.languedoc-roussillon is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Languedoc-Roussillon region migration: exact name match'
   where name in ('Languedoc', 'Roussillon');

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Languedoc-Roussillon region migration: exact name match'
    from (values
      ('Languedoc AOP',                         'france.languedoc-roussillon'),
      ('Roussillon AOP',                        'france.languedoc-roussillon'),
      ('Gres de Montpellier AOP',               'france.languedoc-roussillon.languedoc-gres-de-montpellier'),
      ('Montpeyroux AOP',                       'france.languedoc-roussillon.languedoc-montpeyroux'),
      ('Terrasses du Larzac AOP',               'france.languedoc-roussillon.terrasses-du-larzac'),
      ('Pic Saint Loup AOP',                    'france.languedoc-roussillon.pic-saint-loup'),
      ('La Clape AOP',                          'france.languedoc-roussillon.la-clape'),
      ('Picpoul de Pinet AOP',                  'france.languedoc-roussillon.picpoul-de-pinet'),
      ('Clairette du Languedoc AOP',            'france.languedoc-roussillon.clairette-du-languedoc'),
      ('Clairette de Bellegarde AOP',           'france.languedoc-roussillon.clairette-de-bellegarde'),
      ('Corbières AOP',                         'france.languedoc-roussillon.corbieres'),
      ('Minervois AOP',                         'france.languedoc-roussillon.minervois'),
      ('Saint Chinian AOP',                     'france.languedoc-roussillon.saint-chinian'),
      ('Faugères AOP',                          'france.languedoc-roussillon.faugeres'),
      ('Fitou AOP',                             'france.languedoc-roussillon.fitou'),
      ('Cabardes AOP',                          'france.languedoc-roussillon.cabardes'),
      ('Malepere AOP',                          'france.languedoc-roussillon.malepere'),
      ('Limoux AOP',                            'france.languedoc-roussillon.limoux'),
      ('Costieres de Nimes AOP',                'france.languedoc-roussillon.costieres-de-nimes'),
      ('Cotes du Roussillon AOP',               'france.languedoc-roussillon.cotes-du-roussillon'),
      ('Cotes du Roussillon-Villages AOP',      'france.languedoc-roussillon.cotes-du-roussillon-villages'),
      ('Caramany AOP',                          'france.languedoc-roussillon.cotes-du-roussillon-villages-caramany'),
      ('Lesquerde AOP',                         'france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde'),
      ('Tautavel AOP',                          'france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel'),
      ('Collioure AOP',                         'france.languedoc-roussillon.collioure'),
      ('Banyuls AOP',                           'france.languedoc-roussillon.banyuls'),
      ('Banyuls Grand Cru AOP',                 'france.languedoc-roussillon.banyuls-grand-cru'),
      ('Maury AOP',                             'france.languedoc-roussillon.maury'),
      ('Maury Sec AOP',                         'france.languedoc-roussillon.maury'),
      ('Rivesaltes AOP',                        'france.languedoc-roussillon.rivesaltes'),
      ('Muscat de Rivesaltes AOP',              'france.languedoc-roussillon.muscat-de-rivesaltes'),
      ('Muscat de Lunel AOP',                   'france.languedoc-roussillon.muscat-de-lunel'),
      ('Muscat de Saint Jean de Minervois AOP', 'france.languedoc-roussillon.muscat-de-saint-jean-de-minervois')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 2 then
    raise exception 'expected 2 linked Languedoc/Roussillon region rows, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 33 then
    raise exception 'expected 33 linked Languedoc-Roussillon appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Blanquette de Limoux AOP', 'Cremant de Limoux AOP', 'Clairette de Die AOP')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 3 then
    raise exception 'expected 3 untouched Limoux-style/Die rows, got %', v_count;
  end if;
end;
$$;
