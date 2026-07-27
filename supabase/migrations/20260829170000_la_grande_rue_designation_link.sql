-- Bourgogne — link the La Grande Rue designation member to its new place.
--
-- The burgundy-grand-cru member row predates the place ("Not yet on the
-- Blindr map"); with the place now VERIFIED (20260829167000) it gets the
-- wine_place_designations link and the member row's wine_place_id, and the
-- stale note sentence goes. Keeps the drift guard's invariant: every linked
-- member also carries the place-designation link. IDEMPOTENT (final-state).
do $$
declare
  v_place uuid; v_desig uuid;
begin
  select id into v_place from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
     and publication_status = 'VERIFIED';
  if v_place is null then raise exception 'la-grande-rue is not VERIFIED'; end if;
  select id into v_desig from wine_designations where key = 'burgundy-grand-cru';
  if v_desig is null then raise exception 'burgundy-grand-cru designation missing'; end if;

  if not exists (
    select 1 from wine_place_designations
     where wine_place_id = v_place and designation_id = v_desig
  ) then
    insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
    values (v_place, v_desig, null, 'PUBLISHED');
  end if;

  update wine_designation_members
     set wine_place_id = v_place,
         local_note = 'Elevated from Premier Cru to Grand Cru in 1992; a monopole.'
   where designation_id = v_desig and name = 'La Grande Rue';

  -- Final-state assertions.
  if not exists (
    select 1 from wine_designation_members
     where designation_id = v_desig and name = 'La Grande Rue' and wine_place_id = v_place
  ) then
    raise exception 'La Grande Rue member not linked';
  end if;
  if not exists (
    select 1 from wine_place_designations
     where wine_place_id = v_place and designation_id = v_desig
  ) then
    raise exception 'La Grande Rue place-designation link missing';
  end if;
end;
$$;
