-- Vallee du Rhone — wave 1 scoring reference links (exact stored names).
--
-- 24 reference rows -> places. NOTE stored-name quirks matched verbatim:
-- 'Suza la Rousse AOP' and 'Vaison le Romaine AOP' are typos in the
-- reference table; 'Sainte-Cecile'/'Seguret'/'Valreas'/'Grignan-les-Adhemar'
-- etc. are stored unaccented. Gadagne, Nyons, Puymeras, Saint-Andeol and
-- Saint-Pantaleon have places but no reference rows (none exist to link);
-- 'Visan AOP' has a reference row but no INAO parcels (stays PENDING).
-- IDEMPOTENT (final-state, not row-count).
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.cotes-du-rhone-villages' and publication_status = 'VERIFIED') then
    raise exception 'france.rhone.cotes-du-rhone-villages is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
    from (values
      ('Chusclan AOP',            'france.rhone.cotes-du-rhone-villages.chusclan'),
      ('Laudun AOP',              'france.rhone.cotes-du-rhone-villages.laudun'),
      ('Massif d''Uchaux AOP',    'france.rhone.cotes-du-rhone-villages.massif-d-uchaux'),
      ('Plan de Dieu AOP',        'france.rhone.cotes-du-rhone-villages.plan-de-dieu'),
      ('Roaix AOP',               'france.rhone.cotes-du-rhone-villages.roaix'),
      ('Rochegude AOP',           'france.rhone.cotes-du-rhone-villages.rochegude'),
      ('Rousset-les-Vignes AOP',  'france.rhone.cotes-du-rhone-villages.rousset-les-vignes'),
      ('Sablet AOP',              'france.rhone.cotes-du-rhone-villages.sablet'),
      ('Saint-Gervais AOP',       'france.rhone.cotes-du-rhone-villages.saint-gervais'),
      ('Saint-Maurice AOP',       'france.rhone.cotes-du-rhone-villages.saint-maurice'),
      ('Sainte-Cecile AOP',       'france.rhone.cotes-du-rhone-villages.sainte-cecile'),
      ('Seguret AOP',             'france.rhone.cotes-du-rhone-villages.seguret'),
      ('Signargues AOP',          'france.rhone.cotes-du-rhone-villages.signargues'),
      ('Suza la Rousse AOP',      'france.rhone.cotes-du-rhone-villages.suze-la-rousse'),
      ('Vaison le Romaine AOP',   'france.rhone.cotes-du-rhone-villages.vaison-la-romaine'),
      ('Valreas AOP',             'france.rhone.cotes-du-rhone-villages.valreas')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
    from (values
      ('Cotes du Rhone Villages AOP',      'france.rhone.cotes-du-rhone-villages'),
      ('Ventoux AOP',                      'france.rhone.ventoux'),
      ('Luberon AOP',                      'france.rhone.luberon'),
      ('Grignan-les-Adhemar AOP',          'france.rhone.grignan-les-adhemar'),
      ('Cotes du Vivarais AOP',            'france.rhone.cotes-du-vivarais'),
      ('Clairette de Die AOP',             'france.rhone.clairette-de-die'),
      ('Cremant de Die AOP',               'france.rhone.cremant-de-die'),
      ('Muscat de Beaumes de Venise AOP',  'france.rhone.muscat-de-beaumes-de-venise')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state: 18 pre-wave links + 24 new = 42 Rhone appellation links.
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 42 then
    raise exception 'expected 42 Rhone appellation links, got %', v_app;
  end if;
end;
$$;
