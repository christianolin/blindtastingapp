-- Bordeaux — wave 3c scoring reference links (10 rows, exact stored names).
--
-- * Region-wide styles link to the dual-role france.bordeaux region place
--   (the Champagne/Maury model — several names, one shape): Bordeaux AOP,
--   Bordeaux Superieur AOP, Cremant de Bordeaux AOP.
-- * Two rows that stayed PENDING despite existing places: Blaye AOP and
--   Cotes de Bordeaux Saint-Macaire AOP.
-- * Five rows for the new wave-3c places; 'Saint-Émilion Grand Cru AOP' is
--   stored WITH the accent. IDEMPOTENT (final-state).
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.cotes-de-bordeaux' and publication_status = 'VERIFIED') then
    raise exception 'france.bordeaux.cotes-de-bordeaux is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Phase 3E bordeaux migration: exact name match'
    from (values
      ('Bordeaux AOP',                        'france.bordeaux'),
      ('Bordeaux Superieur AOP',              'france.bordeaux'),
      ('Cremant de Bordeaux AOP',             'france.bordeaux'),
      ('Blaye AOP',                           'france.bordeaux.blaye'),
      ('Cotes de Bordeaux Saint-Macaire AOP', 'france.bordeaux.cotes-de-bordeaux-saint-macaire'),
      ('Cotes de Bordeaux AOP',               'france.bordeaux.cotes-de-bordeaux'),
      ('Graves de Vayres AOP',                'france.bordeaux.graves-de-vayres'),
      ('Graves Superieures AOP',              'france.bordeaux.graves.graves-superieures'),
      ('Premieres Cotes de Bordeaux AOP',     'france.bordeaux.premieres-cotes-de-bordeaux'),
      ('Saint-Émilion Grand Cru AOP',         'france.bordeaux.saint-emilion.saint-emilion-grand-cru')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state: exactly these 10 rows are linked.
  select count(*) into v_app from appellations a
   where a.name in ('Bordeaux AOP','Bordeaux Superieur AOP','Cremant de Bordeaux AOP','Blaye AOP',
                    'Cotes de Bordeaux Saint-Macaire AOP','Cotes de Bordeaux AOP','Graves de Vayres AOP',
                    'Graves Superieures AOP','Premieres Cotes de Bordeaux AOP','Saint-Émilion Grand Cru AOP')
     and a.map_status = 'VERIFIED' and a.wine_place_id is not null;
  if v_app <> 10 then
    raise exception 'expected 10 wave-3c links, got %', v_app;
  end if;
end;
$$;
