-- Loire — region outline re-derive (revision flip).
--
-- Wave 3b gave france.loire five new direct tier-2 children (Crémant/Rosé
-- de Loire + the three upper-Loire satellites) and the three touched
-- sub-regions new outlines, so the region was re-derived from all 9 children
-- (3339 vtx, 9 components — the valley plus the Roannaise/Forez/Saint-
-- Pourçain satellites). Retires the old current outline, promotes the new.
-- Window: lon [-2.15,4.2], lat [45.4,48.0].
do $$
declare
  v_place uuid; v_old uuid; v_new uuid; v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.loire' and publication_status = 'VERIFIED';
  if v_place is null then raise exception 'france.loire place missing'; end if;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'expected 1 current france.loire boundary pre-flip, got %', v_count; end if;
  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then raise exception 'expected 1 DRAFT france.loire boundary pre-flip, got %', v_count; end if;

  select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_new, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < -2.15 or v_miny < 45.4 or v_maxx > 4.2 or v_maxy > 48.0 then
    raise exception 'france.loire new boundary %,%,%,% escapes the window',
      v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'france.loire must have exactly 1 current boundary post-flip'; end if;
  if exists (select 1 from wine_place_boundaries where id = v_old and is_current) then
    raise exception 'old france.loire boundary still current';
  end if;
end;
$$;
