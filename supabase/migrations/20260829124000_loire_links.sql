-- Loire — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Loire' -> france.loire, and 35 `appellations` rows by their exact stored
-- names (ASCII variants like 'Menetou Salon AOP', 'Saint Nicolas de
-- Bourgueil AOP', 'Pouilly sur Loire AOP' are the stored forms). Two curated
-- stored-form rows: 'Anjou Villages Brissac AOP' -> the Anjou Brissac place
-- (INAO denomination name) and 'Coteaux du Layon Chaume Premier Cru AOP' ->
-- the premier-cru Chaume place. Places with no scoring row (Savennieres,
-- the Layon named villages, the Muscadet crus communaux, the Touraine
-- sub-appellations, the five Fiefs Vendeens crus, Coteaux d'Ancenis,
-- Pouilly-Fume's neighbour crus...) stay map-only per the artifact rule.
-- Left PENDING deliberately: 'Fiefs Vendeens AOP' (umbrella — the five crus
-- are the map places), 'Savennieres Coulee-de-Serrant AOP' (unmodeled
-- monopole), 'Anjou Gamay AOP' / 'Cabernet d''Anjou AOP' (style AOCs, not
-- geographies) and 'Saumur Mousseux AOP' (style).
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.loire' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.loire is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Loire region migration: exact name match'
   where name = 'Loire';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Loire region migration: exact name match'
    from (values
      ('Muscadet AOP',                          'france.loire.muscadet'),
      ('Muscadet Cotes de Grandlieu AOP',       'france.loire.muscadet-cotes-de-grandlieu'),
      ('Muscadet Sevre et Maine AOP',           'france.loire.muscadet-sevre-et-maine'),
      ('Gros Plant du Pays Nantais AOP',        'france.loire.gros-plant-du-pays-nantais'),
      ('Anjou AOP',                             'france.loire.anjou'),
      ('Anjou Villages AOP',                    'france.loire.anjou-villages'),
      ('Anjou Villages Brissac AOP',            'france.loire.anjou-brissac'),
      ('Savennieres Roche aux Moines AOP',      'france.loire.savennieres-roche-aux-moines'),
      ('Coteaux du Layon AOP',                  'france.loire.coteaux-du-layon'),
      ('Coteaux du Layon Chaume Premier Cru AOP', 'france.loire.coteaux-du-layon-premier-cru-chaume'),
      ('Quarts de Chaume AOP',                  'france.loire.quarts-de-chaume'),
      ('Bonnezeaux AOP',                        'france.loire.bonnezeaux'),
      ('Coteaux de l''Aubance AOP',             'france.loire.coteaux-de-l-aubance'),
      ('Saumur AOP',                            'france.loire.saumur'),
      ('Saumur-Champigny AOP',                  'france.loire.saumur-champigny'),
      ('Touraine AOP',                          'france.loire.touraine'),
      ('Vouvray AOP',                           'france.loire.vouvray'),
      ('Montlouis-sur-Loire AOP',               'france.loire.montlouis-sur-loire'),
      ('Chinon AOP',                            'france.loire.chinon'),
      ('Bourgueil AOP',                         'france.loire.bourgueil'),
      ('Saint Nicolas de Bourgueil AOP',        'france.loire.saint-nicolas-de-bourgueil'),
      ('Jasnieres AOP',                         'france.loire.jasnieres'),
      ('Coteaux du Loir AOP',                   'france.loire.coteaux-du-loir'),
      ('Cheverny AOP',                          'france.loire.cheverny'),
      ('Cour-Cheverny AOP',                     'france.loire.cour-cheverny'),
      ('Valencay AOP',                          'france.loire.valencay'),
      ('Haut-Poitou AOP',                       'france.loire.haut-poitou'),
      ('Sancerre AOP',                          'france.loire.sancerre'),
      ('Pouilly-Fumé AOP',                      'france.loire.pouilly-fume'),
      ('Pouilly sur Loire AOP',                 'france.loire.pouilly-sur-loire'),
      ('Menetou Salon AOP',                     'france.loire.menetou-salon'),
      ('Quincy AOP',                            'france.loire.quincy'),
      ('Reuilly AOP',                           'france.loire.reuilly'),
      ('Coteaux du Giennois AOP',               'france.loire.coteaux-du-giennois'),
      ('Chateaumeillant AOP',                   'france.loire.chateaumeillant')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Loire region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 35 then
    raise exception 'expected 35 linked Loire appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Fiefs Vendeens AOP', 'Savennieres Coulee-de-Serrant AOP',
                  'Anjou Gamay AOP', 'Cabernet d''Anjou AOP', 'Saumur Mousseux AOP')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 5 then
    raise exception 'expected 5 untouched Loire style/umbrella rows, got %', v_count;
  end if;
end;
$$;
