-- Champagne — sub-region hierarchy (Montagne de Reims / Cote des Blancs /
-- Grande Vallee de la Marne) + re-parent the 17 Grand Cru villages.
--
-- Introduces 3 SUBREGION nodes (is_appellation=false, tier 2) under
-- france.champagne and moves the existing 17 GC villages from tier 2 (direct
-- children of the region) to tier 3 under their sub-region. Only the three
-- GC-bearing sub-regions are created here; Cote des Bar (Aube) and Cote de
-- Sezanne have no Grand Cru and arrive with the Premier Cru villages. Canonical
-- keys are immutable and unchanged - only primary_parent_id + display_tier move.
-- Sub-region boundaries are DERIVED from their children and flipped in
-- 20260826093000.
do $$
declare
  v_champ uuid; v_mdr uuid; v_cdb uuid; v_gvm uuid; v_n int;
begin
  select id into v_champ from wine_places where canonical_key = 'france.champagne' and publication_status = 'VERIFIED';
  if v_champ is null then raise exception 'france.champagne is not VERIFIED'; end if;
  if exists (select 1 from wine_places where canonical_key = any(array[
      'france.champagne.montagne-de-reims','france.champagne.cote-des-blancs','france.champagne.grande-vallee-de-la-marne'])) then
    raise exception 'champagne sub-regions already exist';
  end if;

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
  values
    (v_champ,'SUBREGION','france.champagne.montagne-de-reims','Montagne de Reims','montagne-de-reims',2,6,6,'DRAFT',false,1),
    (v_champ,'SUBREGION','france.champagne.cote-des-blancs','Côte des Blancs','cote-des-blancs',2,6,6,'DRAFT',false,2),
    (v_champ,'SUBREGION','france.champagne.grande-vallee-de-la-marne','Grande Vallée de la Marne','grande-vallee-de-la-marne',2,6,6,'DRAFT',false,3);

  select id into v_mdr from wine_places where canonical_key = 'france.champagne.montagne-de-reims';
  select id into v_cdb from wine_places where canonical_key = 'france.champagne.cote-des-blancs';
  select id into v_gvm from wine_places where canonical_key = 'france.champagne.grande-vallee-de-la-marne';

  update wine_places set primary_parent_id = v_mdr, display_tier = 3
   where canonical_key = any(array['france.champagne.ambonnay','france.champagne.beaumont-sur-vesle','france.champagne.bouzy','france.champagne.louvois','france.champagne.mailly-champagne','france.champagne.puisieulx','france.champagne.sillery','france.champagne.verzenay','france.champagne.verzy']);
  update wine_places set primary_parent_id = v_cdb, display_tier = 3
   where canonical_key = any(array['france.champagne.avize','france.champagne.chouilly','france.champagne.cramant','france.champagne.le-mesnil-sur-oger','france.champagne.oger','france.champagne.oiry']);
  update wine_places set primary_parent_id = v_gvm, display_tier = 3
   where canonical_key = any(array['france.champagne.ay','france.champagne.tours-sur-marne']);

  if (select count(*) from wine_places where canonical_key like 'france.champagne.%' and kind = 'SUBREGION') <> 3 then
    raise exception 'expected 3 champagne sub-regions';
  end if;
  select count(*) into v_n from wine_places p
    join wine_places sr on sr.id = p.primary_parent_id
   where sr.kind = 'SUBREGION' and sr.canonical_key like 'france.champagne.%' and p.display_tier = 3 and p.kind = 'SITE';
  if v_n <> 17 then
    raise exception 'expected 17 GC villages reparented under sub-regions, got %', v_n;
  end if;
  if (select count(*) from wine_places where primary_parent_id = v_champ and kind = 'SITE') <> 0 then
    raise exception 'GC villages still directly under france.champagne';
  end if;
end;
$$;
