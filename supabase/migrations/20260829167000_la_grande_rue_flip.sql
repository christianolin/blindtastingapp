-- Bourgogne — La Grande Rue boundary flip.
--
-- Promotes the staged DRAFT concave dissolve (4 INAO parcels, 42 vtx) to
-- current-VALIDATED and the place -> VERIFIED. Window = the Vosne-Romanée
-- box (lon [4.9,5.0], lat [47.1,47.2]).
do $$
declare
  v_place uuid; v_boundary uuid; v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue';
  if v_place is null then raise exception 'la-grande-rue place missing'; end if;
  select count(*) into v_count from wine_place_boundaries
   where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT la-grande-rue boundary, got %', v_count;
  end if;
  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_boundary, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries
   where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < 4.9 or v_miny < 47.1 or v_maxx > 5.0 or v_maxy > 47.2 then
    raise exception 'la-grande-rue bbox %,%,%,% escapes the window',
      v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_boundary;
  update wine_places set publication_status = 'VERIFIED' where id = v_place;

  if not exists (
    select 1 from wine_places p
     where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
       and p.publication_status = 'VERIFIED' and p.canonical_key_locked_at is not null
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) = 1
  ) then
    raise exception 'la-grande-rue not verified with exactly one current boundary';
  end if;
end;
$$;
