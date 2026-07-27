-- Vallee du Rhone — sub-region hierarchy (Rhône septentrional / Rhône
-- méridional) + re-parent the 16 crus (owner call, 2026-07-27).
--
-- Introduces 2 SUBREGION nodes (is_appellation=false, tier 2) under
-- france.rhone and moves the 16 existing crus from tier 2 (direct children of
-- the region) to tier 3 under their sub-region. Mirrors the Champagne
-- sub-region migration (20260826090000): canonical keys are immutable and
-- unchanged — only primary_parent_id + display_tier move. Sub-region
-- boundaries are DERIVED from their children and flipped in 20260829148000.
-- The Cotes du Rhone regional appellation + Vacqueyras arrive separately
-- (20260829149000+).
do $$
declare
  v_region uuid; v_sept uuid; v_merid uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.rhone is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.septentrional') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
    values
      (v_region,'SUBREGION','france.rhone.septentrional','Rhône septentrional','septentrional',2,6,6,'DRAFT',false,1),
      (v_region,'SUBREGION','france.rhone.meridional','Rhône méridional','meridional',2,6,6,'DRAFT',false,2);
  end if;

  select id into v_sept from wine_places where canonical_key = 'france.rhone.septentrional';
  select id into v_merid from wine_places where canonical_key = 'france.rhone.meridional';
  if v_sept is null or v_merid is null then
    raise exception 'rhone sub-region rows missing after insert';
  end if;

  update wine_places set primary_parent_id = v_sept, display_tier = 3
   where canonical_key = any(array[
     'france.rhone.cote-rotie','france.rhone.condrieu','france.rhone.chateau-grillet',
     'france.rhone.saint-joseph','france.rhone.hermitage','france.rhone.crozes-hermitage',
     'france.rhone.cornas','france.rhone.saint-peray']);
  update wine_places set primary_parent_id = v_merid, display_tier = 3
   where canonical_key = any(array[
     'france.rhone.chateauneuf-du-pape','france.rhone.gigondas','france.rhone.vinsobres',
     'france.rhone.cairanne','france.rhone.rasteau','france.rhone.beaumes-de-venise',
     'france.rhone.lirac','france.rhone.tavel']);

  -- Final-state assertions.
  if (select count(*) from wine_places where primary_parent_id = v_region and kind = 'SUBREGION') <> 2 then
    raise exception 'expected 2 rhone sub-regions under france.rhone';
  end if;
  select count(*) into v_n from wine_places
   where primary_parent_id = v_sept and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 8 then
    raise exception 'expected 8 crus under septentrional, got %', v_n;
  end if;
  select count(*) into v_n from wine_places
   where primary_parent_id = v_merid and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 8 then
    raise exception 'expected 8 crus under meridional, got %', v_n;
  end if;
  -- Stable against later arrivals (Cotes du Rhone will legitimately sit as an
  -- APPELLATION directly under the region): assert on the 16 cru keys, not on
  -- totals under the prefix.
  if exists (
    select 1 from wine_places
     where primary_parent_id = v_region
       and canonical_key = any(array[
         'france.rhone.cote-rotie','france.rhone.condrieu','france.rhone.chateau-grillet',
         'france.rhone.saint-joseph','france.rhone.hermitage','france.rhone.crozes-hermitage',
         'france.rhone.cornas','france.rhone.saint-peray',
         'france.rhone.chateauneuf-du-pape','france.rhone.gigondas','france.rhone.vinsobres',
         'france.rhone.cairanne','france.rhone.rasteau','france.rhone.beaumes-de-venise',
         'france.rhone.lirac','france.rhone.tavel'])
  ) then
    raise exception 'a cru is still directly under france.rhone';
  end if;
end;
$$;
