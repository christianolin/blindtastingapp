-- Provence — reviewed boundary flip for the 7 CONSTITUENT AOCs.
--
-- Promotes the 7 staged DRAFT boundaries (Côtes de Provence + Coteaux
-- d'Aix-en-Provence + Coteaux varois en Provence + Sainte-Victoire + Bandol
-- + Les Baux de Provence + Palette; scripts/wine-map-sources/
-- build-boundary.mjs --engine concave, namespace IGN_INAO_AOC_VITICOLES,
-- params from the owner-previewed artifact data/wine-map/
-- provence-appellations.json) to current-VALIDATED and their places DRAFT
-- -> VERIFIED. The aggregate REGION place stays DRAFT here: its outline is
-- derived FROM these newly verified children (derive-boundary.mjs) and
-- flips in 20260829113000 — the Rhône rederive pattern. bbox window guard =
-- the artifact's region_window (lon [4.5,6.9], lat [42.9,44.0]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 7 DRAFT child boundaries, none current, and the
  -- region place has no boundary at all yet.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.provence.%' and b.quality_status = 'DRAFT';
  if v_count <> 7 then
    raise exception 'expected exactly 7 DRAFT provence child boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.provence%' and b.is_current;
  if v_count <> 0 then
    raise exception 'provence already has current boundaries pre-flip: %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.provence';
  if v_count <> 0 then
    raise exception 'provence region unexpectedly has a boundary pre-derive: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.provence.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.5 or r.bbox[2] < 42.9 or r.bbox[3] > 6.9 or r.bbox[4] > 44.0 then
      raise exception 'provence boundary % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  -- Same-transaction assertions: 7 verified children, region still DRAFT.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.provence.%' and publication_status = 'VERIFIED';
  if v_count <> 7 then
    raise exception 'expected 7 verified provence children, got %', v_count;
  end if;
  if (select publication_status from wine_places where canonical_key = 'france.provence') <> 'DRAFT' then
    raise exception 'provence region must stay DRAFT until its derived outline flips';
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.provence.%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 7 then
    raise exception 'expected 7 current/validated provence child boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.provence.%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a provence child lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.provence.%' and canonical_key_locked_at is null
  ) then
    raise exception 'a provence child is not locked post-verify';
  end if;
end;
$$;
