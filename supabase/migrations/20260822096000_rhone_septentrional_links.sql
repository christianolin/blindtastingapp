-- Vallee du Rhone (Northern slice) — scoring reference links (exact-name).
--
-- Links the `regions` row 'Rhône' -> france.rhone and the 8 Northern Rhone cru
-- `appellations` rows -> their places, by exact stored name (accents kept:
-- 'Côte-Rôtie AOP', 'Rhône'; ASCII in the scoring table: Chateau-Grillet,
-- Saint-Peray). Variant rows (Ermitage AOP, La Cote Rotie AOP) + the full
-- 'Cotes du Rhône' regional link are left PENDING for a later pass.
--
-- IDEMPOTENT (final-state, not row-count): re-linking already-linked rows is a
-- no-op. This survived a twin-applier revert of the first apply, so it must be
-- safe to (re)apply against a partially- or fully-linked DB, and on fresh
-- replay. Scoring rows keep their UUIDs/names; French display names live on
-- wine_places only.
do $$
declare
  v_region_place uuid;
  v_reg int;
  v_app int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.rhone is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
   where name = 'Rhône';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
    from (values
      ('Côte-Rôtie AOP',      'france.rhone.cote-rotie'),
      ('Condrieu AOP',        'france.rhone.condrieu'),
      ('Chateau-Grillet AOP', 'france.rhone.chateau-grillet'),
      ('Saint-Joseph AOP',    'france.rhone.saint-joseph'),
      ('Hermitage AOP',       'france.rhone.hermitage'),
      ('Crozes-Hermitage AOP','france.rhone.crozes-hermitage'),
      ('Cornas AOP',          'france.rhone.cornas'),
      ('Saint-Peray AOP',     'france.rhone.saint-peray')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (idempotent-safe).
  select count(*) into v_reg from regions
   where name = 'Rhône' and wine_place_id = v_region_place and map_status = 'VERIFIED';
  if v_reg <> 1 then
    raise exception 'rhone region not linked exactly once, got %', v_reg;
  end if;
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 8 then
    raise exception 'expected 8 Rhone appellation links, got %', v_app;
  end if;
end;
$$;
