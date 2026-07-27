-- Bordeaux — sub-region hierarchy (owner: "the flat list makes no sense").
--
-- 22 direct children collapse into the six classic groups: Médoc and Graves
-- already exist (Cérons — a sweet enclave inside the Graves zone — moves
-- under Graves); NEW SUBREGIONs Libournais (the right-bank Pomerol/
-- Saint-Émilion country) and Blaye & Bourg; the Entre-deux-Mers AOC becomes
-- the umbrella for the between-the-rivers enclaves and Garonne-bank sweets
-- (the CdRV nesting model); the Côtes de Bordeaux umbrella stays at region
-- level (it spans banks). Keys immutable — only primary_parent_id +
-- display_tier move; Saint-Émilion's Grand Cru child follows to tier 4.
-- Sub-region boundaries DERIVED from children, flipped in 20260829187000.
do $$
declare
  v_region uuid; v_lib uuid; v_bb uuid; v_e2m uuid; v_graves uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.bordeaux' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.bordeaux is not VERIFIED'; end if;
  select id into v_e2m from wine_places where canonical_key = 'france.bordeaux.entre-deux-mers' and publication_status = 'VERIFIED';
  select id into v_graves from wine_places where canonical_key = 'france.bordeaux.graves' and publication_status = 'VERIFIED';
  if v_e2m is null or v_graves is null then
    raise exception 'entre-deux-mers/graves anchors are not VERIFIED';
  end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.libournais') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
    values
      (v_region,'SUBREGION','france.bordeaux.libournais','Libournais','libournais',2,6,6,'DRAFT',false,1),
      (v_region,'SUBREGION','france.bordeaux.blaye-bourg','Blaye & Bourg','blaye-bourg',2,6,6,'DRAFT',false,2);
  end if;
  select id into v_lib from wine_places where canonical_key = 'france.bordeaux.libournais';
  select id into v_bb from wine_places where canonical_key = 'france.bordeaux.blaye-bourg';
  if v_lib is null or v_bb is null then
    raise exception 'bordeaux sub-region rows missing after insert';
  end if;

  update wine_places set primary_parent_id = v_lib, display_tier = 3
   where canonical_key = any(array[
     'france.bordeaux.canon-fronsac','france.bordeaux.fronsac',
     'france.bordeaux.lalande-de-pomerol','france.bordeaux.lussac-saint-emilion',
     'france.bordeaux.montagne-saint-emilion','france.bordeaux.pomerol',
     'france.bordeaux.puisseguin-saint-emilion','france.bordeaux.saint-emilion',
     'france.bordeaux.saint-georges-saint-emilion']);
  update wine_places set display_tier = 4
   where canonical_key = 'france.bordeaux.saint-emilion.saint-emilion-grand-cru';

  update wine_places set primary_parent_id = v_bb, display_tier = 3
   where canonical_key = any(array[
     'france.bordeaux.blaye','france.bordeaux.cotes-de-bourg']);

  update wine_places set primary_parent_id = v_e2m, display_tier = 3
   where canonical_key = any(array[
     'france.bordeaux.cadillac','france.bordeaux.cotes-de-bordeaux-saint-macaire',
     'france.bordeaux.graves-de-vayres','france.bordeaux.loupiac',
     'france.bordeaux.premieres-cotes-de-bordeaux','france.bordeaux.sainte-croix-du-mont']);

  update wine_places set primary_parent_id = v_graves, display_tier = 3
   where canonical_key = 'france.bordeaux.cerons';

  -- Final-state assertions: 9 + 2 + 6 + 1 moved; the region keeps exactly
  -- its six classic direct children.
  select count(*) into v_n from wine_places where primary_parent_id = v_lib and display_tier = 3;
  if v_n <> 9 then raise exception 'expected 9 libournais members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_bb and display_tier = 3;
  if v_n <> 2 then raise exception 'expected 2 blaye-bourg members, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_e2m and display_tier = 3;
  if v_n <> 6 then raise exception 'expected 6 entre-deux-mers members, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.bordeaux.cerons' and primary_parent_id = v_graves and display_tier = 3) then
    raise exception 'cerons not under graves';
  end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_region;
  if v_n <> 6 then raise exception 'expected 6 direct bordeaux children, got %', v_n; end if;
end;
$$;
