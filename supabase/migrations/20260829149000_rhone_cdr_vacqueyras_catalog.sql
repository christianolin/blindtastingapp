-- Vallee du Rhone — Cotes du Rhone (regional AOC) + Vacqueyras catalog (DRAFT).
--
-- The two arrivals the meridional groundwork deferred:
--  * france.rhone.cotes-du-rhone — the regional appellation, tier 2 sibling of
--    the two SUBREGIONs (valley-wide backdrop; INAO parcel dissolve, 18,181
--    member parcels pinned in inao-denomination-membership.json).
--  * france.rhone.vacqueyras — the 17th cru, tier 3 under meridional. Absent
--    from the INAO parcel layer (verified 0 matches), so its boundary is the
--    2-commune aire-geographique union (data/wine-map/vacqueyras-communes.json)
--    per the Champagne commune-union model.
-- Boundaries are staged separately and flipped in 20260829150000; meridional +
-- france.rhone re-derive afterwards (20260829153000).
do $$
declare
  v_region uuid; v_merid uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.rhone is not VERIFIED'; end if;
  select id into v_merid from wine_places
   where canonical_key = 'france.rhone.meridional' and publication_status = 'VERIFIED';
  if v_merid is null then raise exception 'france.rhone.meridional is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.cotes-du-rhone') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_region, 'APPELLATION', 'france.rhone.cotes-du-rhone', 'Côtes du Rhône', 'cotes-du-rhone', 2, 7, 7, 'DRAFT', true, 'AOC/AOP', 'regional', 3);
  end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.vacqueyras') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_merid, 'APPELLATION', 'france.rhone.vacqueyras', 'Vacqueyras', 'vacqueyras', 3, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 17);
  end if;

  -- Final-state assertions.
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.rhone.cotes-du-rhone' and primary_parent_id = v_region
       and kind = 'APPELLATION' and display_tier = 2 and appellation_level = 'regional'
       and is_appellation and appellation_system = 'AOC/AOP'
  ) then
    raise exception 'cotes-du-rhone catalog row missing or wrong';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.rhone.vacqueyras' and primary_parent_id = v_merid
       and kind = 'APPELLATION' and display_tier = 3 and appellation_level = 'communal'
       and is_appellation and appellation_system = 'AOC/AOP'
  ) then
    raise exception 'vacqueyras catalog row missing or wrong';
  end if;
  select count(*) into v_n from wine_places
   where primary_parent_id = v_merid and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 9 then
    raise exception 'expected 9 crus under meridional, got %', v_n;
  end if;
end;
$$;
