-- Vallee du Rhone — region outline re-derive #3 (revision flip).
--
-- The wave-1 satellites (Ventoux, Luberon, Grignan-les-Adhemar, Cotes du
-- Vivarais, Clairette/Cremant de Die) and CdRV joined france.rhone as direct
-- children; derive-boundary.mjs re-derived the outline from all 10 children
-- (1347 vtx, 3 components) so the region finally spans the whole greater
-- valley. Window from the live child bboxes: lon [4.25,5.8], lat [43.6,45.6].
do $$
declare
  v_place uuid; v_old uuid; v_new uuid; v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_place is null then raise exception 'france.rhone place missing'; end if;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'expected 1 current france.rhone boundary pre-flip, got %', v_count; end if;
  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then raise exception 'expected 1 DRAFT france.rhone boundary pre-flip, got %', v_count; end if;

  select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_new, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < 4.25 or v_miny < 43.6 or v_maxx > 5.8 or v_maxy > 45.6 then
    raise exception 'france.rhone new boundary %,%,%,% escapes the window', v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'france.rhone must have exactly 1 current boundary post-flip'; end if;
  if exists (select 1 from wine_place_boundaries where id = v_old and is_current) then
    raise exception 'old france.rhone boundary still current';
  end if;
end;
$$;
