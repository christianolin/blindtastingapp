-- Wave 3d — scoring reference links (16 rows, exact stored names).
--
-- * Bourgogne region-wide styles -> the dual-role france.bourgogne place
--   (Bordeaux model): Bourgogne AOP, Aligote, Passe-tout-grains, Cremant.
-- * Cremant de Limoux -> the existing Limoux place (Maury/Maury Sec model:
--   two names, one zone). Cremant/Macvin du Jura -> the france.jura region.
-- * Nine rows for the new wave-3d places. Review notes reuse each family's
--   canonical note (pinned allow-list). IDEMPOTENT (final-state).
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.sud-ouest.saint-mont' and publication_status = 'VERIFIED') then
    raise exception 'wave-3d places are not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = v.note
    from (values
      ('Bourgogne AOP',                 'france.bourgogne', 'Phase 3D districts migration: exact name match'),
      ('Bourgogne Aligote AOP',         'france.bourgogne', 'Phase 3D districts migration: exact name match'),
      ('Bourgogne Passe-tout-grains AOP','france.bourgogne', 'Phase 3D districts migration: exact name match'),
      ('Cremant de Bourgogne AOP',      'france.bourgogne', 'Phase 3D districts migration: exact name match'),
      ('Cote de Beaune AOP',            'france.bourgogne.cote-de-beaune.cote-de-beaune', 'Phase 3D districts migration: exact name match'),
      ('Cote de Beaune-Villages AOP',   'france.bourgogne.cote-de-beaune.cote-de-beaune-villages', 'Phase 3D districts migration: exact name match'),
      ('Macon-Villages AOP',            'france.bourgogne.maconnais.macon-villages', 'Phase 3D districts migration: exact name match'),
      ('Cremant de Limoux AOP',         'france.languedoc-roussillon.limoux', 'Languedoc-Roussillon region migration: exact name match'),
      ('Cremant du Jura AOP',           'france.jura', 'Jura region migration: exact name match'),
      ('Macvin du Jura AOP',            'france.jura', 'Jura region migration: exact name match'),
      ('Pierrevert AOP',                'france.provence.pierrevert', 'Provence region migration: exact name match'),
      ('Cotes de Bergerac AOP',         'france.sud-ouest.cotes-de-bergerac', 'Sud-Ouest region migration: exact name match'),
      ('Cotes de Montravel AOP',        'france.sud-ouest.cotes-de-montravel', 'Sud-Ouest region migration: exact name match'),
      ('Haut-Montravel AOP',            'france.sud-ouest.haut-montravel', 'Sud-Ouest region migration: exact name match'),
      ('Saint-Mont AOP',                'france.sud-ouest.saint-mont', 'Sud-Ouest region migration: exact name match'),
      ('Tursan AOP',                    'france.sud-ouest.tursan', 'Sud-Ouest region migration: exact name match')
    ) as v(app_name, ck, note)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  select count(*) into v_app from appellations a
   where a.name in ('Bourgogne AOP','Bourgogne Aligote AOP','Bourgogne Passe-tout-grains AOP','Cremant de Bourgogne AOP',
                    'Cote de Beaune AOP','Cote de Beaune-Villages AOP','Macon-Villages AOP','Cremant de Limoux AOP',
                    'Cremant du Jura AOP','Macvin du Jura AOP','Pierrevert AOP','Cotes de Bergerac AOP',
                    'Cotes de Montravel AOP','Haut-Montravel AOP','Saint-Mont AOP','Tursan AOP')
     and a.map_status = 'VERIFIED' and a.wine_place_id is not null;
  if v_app <> 16 then
    raise exception 'expected 16 wave-3d links, got %', v_app;
  end if;
end;
$$;
