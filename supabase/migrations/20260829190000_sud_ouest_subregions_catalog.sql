-- Sud-Ouest — sub-region hierarchy (24 flat children -> 4 classic clusters).
--
-- NEW SUBREGIONs (tier 2, is_appellation=false): Bergeracois (Dordogne +
-- Duras), Garonne & Tarn (incl. Cahors and Marcillac), Gascogne (Adour:
-- Madiran/Pacherenc/Saint-Mont/Tursan) and Pyrénées (Béarn/Irouléguy/
-- Jurançon). All 24 AOCs move to tier 3; keys immutable. Boundaries DERIVED
-- from children, flipped in 20260829191000.
do $$
declare
  v_region uuid; v_ber uuid; v_gar uuid; v_gas uuid; v_pyr uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.sud-ouest' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.sud-ouest is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.sud-ouest.bergeracois') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
    values
      (v_region,'SUBREGION','france.sud-ouest.bergeracois','Bergeracois','bergeracois',2,6,6,'DRAFT',false,1),
      (v_region,'SUBREGION','france.sud-ouest.garonne-tarn','Garonne & Tarn','garonne-tarn',2,6,6,'DRAFT',false,2),
      (v_region,'SUBREGION','france.sud-ouest.gascogne','Gascogne','gascogne',2,6,6,'DRAFT',false,3),
      (v_region,'SUBREGION','france.sud-ouest.pyrenees','Pyrénées','pyrenees',2,6,6,'DRAFT',false,4);
  end if;
  select id into v_ber from wine_places where canonical_key = 'france.sud-ouest.bergeracois';
  select id into v_gar from wine_places where canonical_key = 'france.sud-ouest.garonne-tarn';
  select id into v_gas from wine_places where canonical_key = 'france.sud-ouest.gascogne';
  select id into v_pyr from wine_places where canonical_key = 'france.sud-ouest.pyrenees';
  if v_ber is null or v_gar is null or v_gas is null or v_pyr is null then
    raise exception 'sud-ouest sub-region rows missing after insert';
  end if;

  update wine_places set primary_parent_id = v_ber, display_tier = 3
   where canonical_key = any(array[
     'france.sud-ouest.bergerac','france.sud-ouest.cotes-de-bergerac',
     'france.sud-ouest.cotes-de-montravel','france.sud-ouest.haut-montravel',
     'france.sud-ouest.montravel','france.sud-ouest.monbazillac',
     'france.sud-ouest.pecharmant','france.sud-ouest.saussignac',
     'france.sud-ouest.cotes-de-duras']);

  update wine_places set primary_parent_id = v_gar, display_tier = 3
   where canonical_key = any(array[
     'france.sud-ouest.buzet','france.sud-ouest.brulhois','france.sud-ouest.cahors',
     'france.sud-ouest.cotes-du-marmandais','france.sud-ouest.fronton',
     'france.sud-ouest.gaillac','france.sud-ouest.gaillac-premieres-cotes',
     'france.sud-ouest.marcillac']);

  update wine_places set primary_parent_id = v_gas, display_tier = 3
   where canonical_key = any(array[
     'france.sud-ouest.madiran','france.sud-ouest.pacherenc-du-vic-bilh',
     'france.sud-ouest.saint-mont','france.sud-ouest.tursan']);

  update wine_places set primary_parent_id = v_pyr, display_tier = 3
   where canonical_key = any(array[
     'france.sud-ouest.bearn','france.sud-ouest.irouleguy','france.sud-ouest.jurancon']);

  -- Final-state assertions: 9 + 8 + 4 + 3 accounts for all 24.
  select count(*) into v_n from wine_places where primary_parent_id = v_ber and display_tier = 3;
  if v_n <> 9 then raise exception 'expected 9 bergeracois members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_gar and display_tier = 3;
  if v_n <> 8 then raise exception 'expected 8 garonne-tarn members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_gas and display_tier = 3;
  if v_n <> 4 then raise exception 'expected 4 gascogne members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_pyr and display_tier = 3;
  if v_n <> 3 then raise exception 'expected 3 pyrenees members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_region;
  if v_n <> 4 then raise exception 'expected 4 direct children of sud-ouest, got %', v_n; end if;
end;
$$;
