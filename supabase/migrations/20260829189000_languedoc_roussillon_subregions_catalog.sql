-- Languedoc-Roussillon — sub-region hierarchy (56 flat children -> 2 groups).
--
-- The dual region finally splits along its own name: NEW SUBREGIONs
-- Languedoc and Roussillon (tier 2, is_appellation=false); the 13 Roussillon
-- AOCs move explicitly, everything else (43) follows by catch-all — all to
-- tier 3, keys immutable. Boundaries DERIVED from children, flipped in
-- 20260829191000.
do $$
declare
  v_region uuid; v_lan uuid; v_rou uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.languedoc-roussillon' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.languedoc-roussillon is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.languedoc-roussillon.languedoc') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
    values
      (v_region,'SUBREGION','france.languedoc-roussillon.languedoc','Languedoc','languedoc',2,6,6,'DRAFT',false,1),
      (v_region,'SUBREGION','france.languedoc-roussillon.roussillon','Roussillon','roussillon',2,6,6,'DRAFT',false,2);
  end if;
  select id into v_lan from wine_places where canonical_key = 'france.languedoc-roussillon.languedoc';
  select id into v_rou from wine_places where canonical_key = 'france.languedoc-roussillon.roussillon';
  if v_lan is null or v_rou is null then
    raise exception 'languedoc/roussillon sub-region rows missing after insert';
  end if;

  update wine_places set primary_parent_id = v_rou, display_tier = 3
   where canonical_key = any(array[
     'france.languedoc-roussillon.banyuls','france.languedoc-roussillon.banyuls-grand-cru',
     'france.languedoc-roussillon.collioure','france.languedoc-roussillon.cotes-du-roussillon',
     'france.languedoc-roussillon.cotes-du-roussillon-villages',
     'france.languedoc-roussillon.cotes-du-roussillon-villages-caramany',
     'france.languedoc-roussillon.cotes-du-roussillon-villages-les-aspres',
     'france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde',
     'france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel',
     'france.languedoc-roussillon.grand-roussillon','france.languedoc-roussillon.maury',
     'france.languedoc-roussillon.muscat-de-rivesaltes','france.languedoc-roussillon.rivesaltes']);

  -- Catch-all: every remaining tier-2 appellation child is Languedoc proper.
  update wine_places set primary_parent_id = v_lan, display_tier = 3
   where primary_parent_id = v_region and kind = 'APPELLATION' and display_tier = 2;

  -- Final-state assertions: 13 + 43 accounts for all 56.
  select count(*) into v_n from wine_places where primary_parent_id = v_rou and display_tier = 3;
  if v_n <> 13 then raise exception 'expected 13 roussillon members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_lan and display_tier = 3;
  if v_n <> 43 then raise exception 'expected 43 languedoc members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_region;
  if v_n <> 2 then raise exception 'expected 2 direct children of the region, got %', v_n; end if;
end;
$$;
