-- Sud-Ouest — constituent boundary flip (all 19 children).
--
-- Promotes the 19 staged DRAFT boundaries (Bergerac, Monbazillac, Montravel,
-- Pécharmant, Saussignac, Côtes de Duras, Côtes du Marmandais, Cahors,
-- Gaillac, Gaillac premières côtes, Fronton, Brulhois, Marcillac, Madiran,
-- Pacherenc du Vic-Bilh, Jurançon, Béarn, Irouléguy, Buzet;
-- scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES, params from the owner-previewed artifact
-- data/wine-map/sud-ouest-appellations.json) to current-VALIDATED and their
-- places DRAFT -> VERIFIED. The aggregate region outline is derived from
-- these children and flips in 20260829118000. bbox window guard = the
-- artifact's region_window (lon [-1.6,2.75], lat [42.7,45.2]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 19 DRAFT child boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.sud-ouest.%' and b.quality_status = 'DRAFT';
  if v_count <> 19 then
    raise exception 'expected exactly 19 DRAFT sud-ouest child boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.sud-ouest%' and b.is_current;
  if v_count <> 0 then
    raise exception 'sud-ouest already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.sud-ouest.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < -1.6 or r.bbox[2] < 42.7 or r.bbox[3] > 2.75 or r.bbox[4] > 45.2 then
      raise exception 'sud-ouest boundary % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  -- Same-transaction assertions (region intentionally still DRAFT).
  select count(*) into v_count from wine_places
   where canonical_key like 'france.sud-ouest.%' and publication_status = 'VERIFIED';
  if v_count <> 19 then
    raise exception 'expected 19 verified sud-ouest children, got %', v_count;
  end if;
  if (select publication_status from wine_places where canonical_key = 'france.sud-ouest') <> 'DRAFT' then
    raise exception 'sud-ouest region must stay DRAFT until its derived outline flips';
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.sud-ouest.%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 19 then
    raise exception 'expected 19 current/validated sud-ouest child boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.sud-ouest.%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a sud-ouest child lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.sud-ouest.%' and canonical_key_locked_at is null
  ) then
    raise exception 'a sud-ouest child is not locked post-verify';
  end if;
end;
$$;
