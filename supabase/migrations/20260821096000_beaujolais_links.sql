-- Beaujolais — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Beaujolais' -> france.beaujolais, and 12 `appellations` rows by their exact
-- stored names (ASCII in the scoring table: Chenas/Julienas/Regnie/Cote de
-- Brouilly/Moulin-a-Vent) -> the matching places. 'Beaujolais AOP' maps to the
-- dual-role region place france.beaujolais (region == regional AOC). Scoring
-- rows keep their UUIDs/names; French display names live on wine_places only.
-- Mirrors the map_status=VERIFIED / MIGRATED_EXACT pattern used region-wide.
do $$
declare
  v_region_place uuid;
  v_rows int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.beaujolais' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.beaujolais is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Beaujolais region migration: exact name match'
   where name = 'Beaujolais' and map_status = 'PENDING';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'expected exactly 1 Beaujolais region link, got %', v_rows;
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Beaujolais region migration: exact name match'
    from (values
      ('Beaujolais AOP',          'france.beaujolais'),
      ('Beaujolais-Villages AOP', 'france.beaujolais.beaujolais-villages'),
      ('Brouilly AOP',            'france.beaujolais.brouilly'),
      ('Cote de Brouilly AOP',    'france.beaujolais.cote-de-brouilly'),
      ('Chenas AOP',              'france.beaujolais.chenas'),
      ('Chiroubles AOP',          'france.beaujolais.chiroubles'),
      ('Fleurie AOP',             'france.beaujolais.fleurie'),
      ('Julienas AOP',            'france.beaujolais.julienas'),
      ('Morgon AOP',              'france.beaujolais.morgon'),
      ('Moulin-a-Vent AOP',       'france.beaujolais.moulin-a-vent'),
      ('Regnie AOP',              'france.beaujolais.regnie'),
      ('Saint-Amour AOP',         'france.beaujolais.saint-amour')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name and a.map_status = 'PENDING';
  get diagnostics v_rows = row_count;
  if v_rows <> 12 then
    raise exception 'expected exactly 12 Beaujolais appellation links, got %', v_rows;
  end if;

  -- Same-transaction assertions.
  if (select count(*) from regions
       where wine_place_id = v_region_place and map_status = 'VERIFIED'
         and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1) <> 1 then
    raise exception 'beaujolais region link assertion failed';
  end if;
  if (select count(*) from appellations a
        join wine_places p on p.id = a.wine_place_id
       where p.canonical_key like 'france.beaujolais%'
         and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT') <> 12 then
    raise exception 'beaujolais appellation link assertion failed';
  end if;
end;
$$;
