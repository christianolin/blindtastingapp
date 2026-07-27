-- Vallee du Rhone — region outline re-derive #2 (revision flip).
--
-- france.rhone's outline was the union of its 16 crus (honest gaps). Its
-- children are now the 2 SUBREGIONs + the Cotes du Rhone regional dissolve,
-- so derive-boundary.mjs re-derived it from those 3 — the valley-wide
-- footprint the septentrional groundwork promised ("the outline expands").
-- Window = the CdR window (lon [4.4,5.25], lat [43.8,45.6]).
do $$
declare
  v_place uuid;
  v_old uuid;
  v_new uuid;
  v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_place is null then
    raise exception 'france.rhone place missing';
  end if;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then
    raise exception 'expected exactly 1 current france.rhone boundary pre-flip, got %', v_count;
  end if;
  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT france.rhone boundary pre-flip, got %', v_count;
  end if;

  select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_new, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < 4.4 or v_miny < 43.8 or v_maxx > 5.25 or v_maxy > 45.6 then
    raise exception 'france.rhone new boundary %,%,%,% escapes the window',
      v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  -- Same-transaction assertions.
  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then
    raise exception 'france.rhone must have exactly 1 current boundary post-flip, got %', v_count;
  end if;
  if not exists (
    select 1 from wine_place_boundaries where id = v_new and is_current and quality_status = 'VALIDATED'
  ) then
    raise exception 'new france.rhone boundary not current/validated';
  end if;
  if exists (select 1 from wine_place_boundaries where id = v_old and is_current) then
    raise exception 'old france.rhone boundary still current';
  end if;
end;
$$;
