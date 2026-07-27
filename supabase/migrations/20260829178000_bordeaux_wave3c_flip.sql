-- Bordeaux — wave 3c boundary flip (5 places).
--
-- Promotes the 5 staged DRAFT concave dissolves to current-VALIDATED and
-- their places -> VERIFIED. Combined window from the live staged bboxes
-- (lon [-0.682,0.032], lat [44.485,45.344]): lon [-0.75,0.1], lat [44.4,45.4].
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bordeaux%' and b.quality_status = 'DRAFT';
  if v_count <> 5 then
    raise exception 'expected exactly 5 DRAFT bordeaux wave-3c boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.bordeaux%' and b.quality_status = 'DRAFT'
  loop
    if r.ck not in ('france.bordeaux.cotes-de-bordeaux','france.bordeaux.graves-de-vayres',
                    'france.bordeaux.graves.graves-superieures','france.bordeaux.premieres-cotes-de-bordeaux',
                    'france.bordeaux.saint-emilion.saint-emilion-grand-cru') then
      raise exception 'unexpected DRAFT boundary for %', r.ck;
    end if;
    if r.bbox[1] < -0.75 or r.bbox[2] < 44.4 or r.bbox[3] > 0.1 or r.bbox[4] > 45.4 then
      raise exception 'wave-3c % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key in ('france.bordeaux.cotes-de-bordeaux','france.bordeaux.graves-de-vayres',
                           'france.bordeaux.graves.graves-superieures','france.bordeaux.premieres-cotes-de-bordeaux',
                           'france.bordeaux.saint-emilion.saint-emilion-grand-cru')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if v_count <> 5 then
    raise exception 'expected 5 verified wave-3c places, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.bordeaux%' and p.publication_status = 'VERIFIED'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a bordeaux place lacks exactly one current boundary';
  end if;
end;
$$;
