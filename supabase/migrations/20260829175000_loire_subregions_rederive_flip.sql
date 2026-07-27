-- Loire — sub-region outline re-derives (revision flips, 3 nodes).
--
-- Wave 3b added members to three sub-regions (Cabernet/Rosé d'Anjou +
-- Coteaux de Saumur under anjou-saumur; Coteaux du Vendômois under
-- touraine; Orléans + Orléans-Cléry under centre-loire), so each was
-- re-derived from its full child set. Retires each old current boundary and
-- promotes the new one. Windows from the live staged bboxes (+margin):
--   anjou-saumur    lon [-1.45,0.2], lat [46.85,47.6]   (unchanged bounds)
--   touraine-region lon [-0.1,1.8],  lat [46.55,47.95]  (Vendômois north)
--   centre-loire    lon [1.55,3.15], lat [46.4,48.0]    (Orléans north-west)
do $$
declare
  r record;
  v_old uuid;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 3 then
    raise exception 'expected exactly 3 DRAFT loire subregion re-derives, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.loire.anjou-saumur' then
      if r.bbox[1] < -1.45 or r.bbox[2] < 46.85 or r.bbox[3] > 0.2 or r.bbox[4] > 47.6 then
        raise exception 'anjou-saumur bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.loire.touraine-region' then
      if r.bbox[1] < -0.1 or r.bbox[2] < 46.55 or r.bbox[3] > 1.8 or r.bbox[4] > 47.95 then
        raise exception 'touraine bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.loire.centre-loire' then
      if r.bbox[1] < 1.55 or r.bbox[2] < 46.4 or r.bbox[3] > 3.15 or r.bbox[4] > 48.0 then
        raise exception 'centre-loire bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    else
      raise exception 'unexpected DRAFT subregion re-derive for %', r.ck;
    end if;

    select id into v_old from wine_place_boundaries
     where wine_place_id = r.place_id and is_current;
    if v_old is null then
      raise exception '% has no current boundary to retire', r.ck;
    end if;
    update wine_place_boundaries set is_current = false where id = v_old;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
  end loop;

  -- Same-transaction assertions.
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a loire subregion lacks exactly one current boundary post-flip';
  end if;
end;
$$;
