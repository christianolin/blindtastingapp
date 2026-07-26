-- Champagne — premier-cru completion flip (4 villages) + Aÿ refinement.
--
-- Promotes the 4 staged DRAFT déléguée footprints (Mareuil-sur-Aÿ, Bisseuil,
-- Tauxières-Mutry, Vertus — IGN Admin Express communes déléguées, MANUAL)
-- to current-VALIDATED and their places DRAFT -> VERIFIED, completing the
-- échelle-des-crus Premier Cru set at 42 villages (59 SITE total with the
-- 17 Grand Cru). Simultaneously supersedes Aÿ Grand Cru's commune-nouvelle
-- footprint (which over-included Mareuil-sur-Aÿ and Bisseuil) with its
-- historic Ay déléguée footprint — the follow-up documented in
-- champagne-grand-crus.json. The old Aÿ boundary is retired, not deleted.
-- bbox window guard = the Champagne window (lon [3.0,5.05], lat [47.8,49.6]).
do $$
declare
  r record;
  v_count int;
  v_ay_old uuid;
  v_ay_new uuid;
begin
  -- Pre-flip shape.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (
           'france.champagne.mareuil-sur-ay', 'france.champagne.bisseuil',
           'france.champagne.tauxieres-mutry', 'france.champagne.vertus'
         )
     and b.quality_status = 'DRAFT';
  if v_count <> 4 then
    raise exception 'expected 4 DRAFT completion boundaries pre-flip, got %', v_count;
  end if;
  select b.id into v_ay_new
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.champagne.ay' and b.quality_status = 'DRAFT'
     and b.generation_parameters->>'engine' = 'commune-deleguee';
  if v_ay_new is null then
    raise exception 'Ay deleguee DRAFT boundary missing pre-flip';
  end if;
  select b.id into v_ay_old
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.champagne.ay' and b.is_current;
  if v_ay_old is null then
    raise exception 'Ay has no current boundary pre-flip';
  end if;

  -- Flip the 4 new villages.
  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in (
             'france.champagne.mareuil-sur-ay', 'france.champagne.bisseuil',
             'france.champagne.tauxieres-mutry', 'france.champagne.vertus'
           )
       and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 3.0 or r.bbox[2] < 47.8 or r.bbox[3] > 5.05 or r.bbox[4] > 49.6 then
      raise exception 'completion boundary % bbox %,%,%,% escapes the Champagne window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  -- Refine Aÿ: retire the commune-nouvelle footprint, promote the déléguée.
  select b.id into v_ay_new
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.champagne.ay' and b.quality_status = 'DRAFT';
  if (select bbox[1] from wine_place_boundaries where id = v_ay_new) < 3.0 then
    raise exception 'Ay deleguee bbox escapes the window (west)';
  end if;
  update wine_place_boundaries set is_current = false where id = v_ay_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_ay_new;

  -- Same-transaction assertions.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.champagne.%' and kind = 'SITE'
     and publication_status = 'VERIFIED';
  if v_count <> 59 then
    raise exception 'expected 59 verified champagne villages, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.champagne%'
       and p.publication_status = 'VERIFIED'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a champagne place lacks exactly one current boundary';
  end if;
  if (select generation_parameters->>'engine'
        from wine_place_boundaries b
        join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'france.champagne.ay' and b.is_current)
     is distinct from 'commune-deleguee' then
    raise exception 'Ay current boundary is not the deleguee refinement';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.champagne%' and publication_status = 'VERIFIED'
       and canonical_key_locked_at is null
  ) then
    raise exception 'a champagne place is not locked post-verify';
  end if;
end;
$$;
