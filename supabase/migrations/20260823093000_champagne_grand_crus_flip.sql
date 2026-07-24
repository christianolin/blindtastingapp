-- Champagne — Grand Cru villages boundary flip (17 places).
--
-- Promotes the 17 staged DRAFT commune-footprint boundaries (IGN Admin Express
-- by INSEE, MANUAL; Echelle des Crus 100% villages as whole-commune
-- over-approximations) to current-VALIDATED and their SITE places -> VERIFIED,
-- after owner shape review (preview: .superpowers/sdd/preview-champagne-grand-
-- crus.svg). Window guard = the Champagne display window (lon [3.0,5.05], lat
-- [47.8,49.6]).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%' and b.quality_status = 'DRAFT';
  if v_count <> 17 then
    raise exception 'expected exactly 17 DRAFT champagne GC boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%' and b.is_current;
  if v_count <> 0 then
    raise exception 'champagne GC already have current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.champagne.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 3.0 or r.bbox[2] < 47.8 or r.bbox[3] > 5.05 or r.bbox[4] > 49.6 then
      raise exception 'champagne GC % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.champagne.%' and publication_status = 'VERIFIED';
  if v_count <> 17 then
    raise exception 'expected 17 verified champagne GC places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 17 then
    raise exception 'expected 17 current/validated champagne GC boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.champagne.%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a champagne GC place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places where canonical_key like 'france.champagne.%' and canonical_key_locked_at is null
  ) then
    raise exception 'a champagne GC place is not locked post-verify';
  end if;
end;
$$;
