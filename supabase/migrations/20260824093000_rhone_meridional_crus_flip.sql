-- Vallee du Rhone (Southern slice) — boundary flip, Phase A: the 8 southern crus.
--
-- Promotes the 8 staged DRAFT southern-cru boundaries (concave dissolves of the
-- INAO parcels) to current-VALIDATED and their places -> VERIFIED. The DRAFT
-- boundaries under france.rhone.% are exactly these 8 (the 8 northern crus are
-- already current). france.rhone is RE-DERIVED from all 16 crus + revision-
-- flipped in 20260824094000. Window guard = the southern region_window
-- (lon [4.5,5.2], lat [43.9,44.5]).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT';
  if v_count <> 8 then
    raise exception 'expected exactly 8 DRAFT southern rhone boundaries pre-flip, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.5 or r.bbox[2] < 43.9 or r.bbox[3] > 5.2 or r.bbox[4] > 44.5 then
      raise exception 'southern rhone cru % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone.%'
     and slug in ('chateauneuf-du-pape','gigondas','vinsobres','cairanne','rasteau','beaumes-de-venise','lirac','tavel')
     and publication_status = 'VERIFIED';
  if v_count <> 8 then
    raise exception 'expected 8 verified southern crus, got %', v_count;
  end if;
  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone.%' and publication_status = 'VERIFIED';
  if v_count <> 16 then
    raise exception 'expected 16 verified rhone crus, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.rhone.%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a rhone cru lacks exactly one current boundary';
  end if;
end;
$$;
