-- Vallee du Rhone — meridional outline re-derive #2 (revision flip).
--
-- Muscat de Beaumes-de-Venise joined meridional as its 10th child;
-- derive-boundary.mjs re-derived the outline from all 10 (370 vtx, 4
-- components). Retires the 9-cru current boundary, promotes the 10-child
-- outline. Window = the meridional window (lon [4.5,5.2], lat [43.9,44.5]).
do $$
declare
  v_place uuid; v_old uuid; v_new uuid; v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.rhone.meridional' and publication_status = 'VERIFIED';
  if v_place is null then raise exception 'france.rhone.meridional place missing'; end if;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'expected 1 current meridional boundary pre-flip, got %', v_count; end if;
  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then raise exception 'expected 1 DRAFT meridional boundary pre-flip, got %', v_count; end if;

  select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_new, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < 4.5 or v_miny < 43.9 or v_maxx > 5.2 or v_maxy > 44.5 then
    raise exception 'meridional new boundary %,%,%,% escapes the window', v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  select count(*) into v_count from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 1 then raise exception 'meridional must have exactly 1 current boundary post-flip'; end if;
  if exists (select 1 from wine_place_boundaries where id = v_old and is_current) then
    raise exception 'old meridional boundary still current';
  end if;
end;
$$;
