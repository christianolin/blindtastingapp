-- Loire — wave 3b boundary flip (11 places).
--
-- Promotes the 11 staged DRAFT concave dissolves to current-VALIDATED and
-- their places -> VERIFIED: the two valley-wide style backdrops (Crémant /
-- Rosé de Loire — their INAO zones span Anjou->Touraine, not the Nantais),
-- the three upper-Loire satellites (Côte Roannaise / Côtes du Forez /
-- Saint-Pourçain, south-east of the valley proper) and the six sub-region
-- members. Combined window from the live staged bboxes
-- (lon [-0.948,4.109], lat [45.536,47.908]): lon [-1.0,4.2], lat [45.45,48.0].
-- Touched sub-regions + the region re-derive afterwards (20260829175000+).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire%' and b.quality_status = 'DRAFT';
  if v_count <> 11 then
    raise exception 'expected exactly 11 DRAFT loire wave-3b boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.loire%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < -1.0 or r.bbox[2] < 45.45 or r.bbox[3] > 4.2 or r.bbox[4] > 48.0 then
      raise exception 'wave-3b % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  -- Final-state: 64 pre-wave places + 11 new = 75 verified under the region.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.loire%' and publication_status = 'VERIFIED';
  if v_count <> 75 then
    raise exception 'expected 75 verified loire places, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.loire%' and p.publication_status = 'VERIFIED'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a loire place lacks exactly one current boundary';
  end if;
end;
$$;
