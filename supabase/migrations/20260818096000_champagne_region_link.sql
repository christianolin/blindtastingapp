-- Champagne region — scoring reference link.
--
-- Links the live `regions` row named 'Champagne' to the canonical place
-- france.champagne (exact-name review, never fuzzy). The scoring row keeps its
-- UUID and name; the French display name lives on wine_places only. Mirrors
-- the map_status = VERIFIED / MIGRATED_EXACT pattern used for Bordeaux and
-- Bourgogne.
do $$
declare
  v_place uuid;
  v_region uuid;
  v_rows int;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.champagne' and publication_status = 'VERIFIED';
  if v_place is null then
    raise exception 'champagne place is not VERIFIED';
  end if;

  select count(*) into v_rows from regions where name = 'Champagne';
  if v_rows <> 1 then
    raise exception 'expected exactly 1 region named Champagne, got %', v_rows;
  end if;
  select id into v_region from regions where name = 'Champagne';

  update regions
     set wine_place_id = v_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Champagne region migration: exact name match'
   where id = v_region and map_status = 'PENDING';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'expected to link exactly 1 Champagne region row, got %', v_rows;
  end if;

  -- Same-transaction assertion.
  if not exists (
    select 1 from regions
     where id = v_region
       and wine_place_id = v_place
       and map_status = 'VERIFIED'
       and map_match_method = 'MIGRATED_EXACT'
       and map_match_confidence = 1
       and map_reviewed_at is not null
  ) then
    raise exception 'champagne region link post-update assertion failed';
  end if;
end;
$$;
