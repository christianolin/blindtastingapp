-- Loire — sub-region hierarchy (Pays Nantais / Anjou-Saumur / Touraine /
-- Centre-Loire) + re-parent the 59 AOCs (owner call, 2026-07-27).
--
-- The Loire tree was flat: 59 appellations directly under france.loire, with
-- crus beside their parents (Muscadet SM Clisson beside Muscadet). Mirrors
-- the Champagne (20260826090000) / Rhone (20260829147000) sub-region model:
-- 4 SUBREGION nodes (is_appellation=false, tier 2); the 59 AOCs move to
-- tier 3 via primary_parent_id + display_tier only — canonical keys are
-- immutable and unchanged. The Touraine sub-region's key is
-- france.loire.touraine-region because france.loire.touraine is the Touraine
-- AOC's (locked) key; Haut-Poitou rides with Touraine (nearest neighbour —
-- its own node would be a single-member island). Sub-region boundaries are
-- DERIVED from their children and flipped in 20260829163000.
do $$
declare
  v_region uuid; v_pn uuid; v_as uuid; v_tr uuid; v_cl uuid; v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.loire' and publication_status = 'VERIFIED';
  if v_region is null then raise exception 'france.loire is not VERIFIED'; end if;

  if not exists (select 1 from wine_places where canonical_key = 'france.loire.pays-nantais') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
    values
      (v_region,'SUBREGION','france.loire.pays-nantais','Pays Nantais','pays-nantais',2,6,6,'DRAFT',false,1),
      (v_region,'SUBREGION','france.loire.anjou-saumur','Anjou-Saumur','anjou-saumur',2,6,6,'DRAFT',false,2),
      (v_region,'SUBREGION','france.loire.touraine-region','Touraine','touraine-region',2,6,6,'DRAFT',false,3),
      (v_region,'SUBREGION','france.loire.centre-loire','Centre-Loire','centre-loire',2,6,6,'DRAFT',false,4);
  end if;
  select id into v_pn from wine_places where canonical_key = 'france.loire.pays-nantais';
  select id into v_as from wine_places where canonical_key = 'france.loire.anjou-saumur';
  select id into v_tr from wine_places where canonical_key = 'france.loire.touraine-region';
  select id into v_cl from wine_places where canonical_key = 'france.loire.centre-loire';
  if v_pn is null or v_as is null or v_tr is null or v_cl is null then
    raise exception 'loire sub-region rows missing after insert';
  end if;

  update wine_places set primary_parent_id = v_pn, display_tier = 3
   where canonical_key = any(array[
     'france.loire.muscadet','france.loire.muscadet-coteaux-de-la-loire',
     'france.loire.muscadet-cotes-de-grandlieu','france.loire.muscadet-sevre-et-maine',
     'france.loire.muscadet-sevre-et-maine-clisson','france.loire.muscadet-sevre-et-maine-gorges',
     'france.loire.muscadet-sevre-et-maine-le-pallet','france.loire.gros-plant-du-pays-nantais',
     'france.loire.coteaux-d-ancenis','france.loire.fiefs-vendeens-brem',
     'france.loire.fiefs-vendeens-chantonnay','france.loire.fiefs-vendeens-mareuil',
     'france.loire.fiefs-vendeens-pissotte','france.loire.fiefs-vendeens-vix']);

  update wine_places set primary_parent_id = v_as, display_tier = 3
   where canonical_key = any(array[
     'france.loire.anjou','france.loire.anjou-brissac',
     'france.loire.anjou-villages','france.loire.anjou-coteaux-de-la-loire',
     'france.loire.savennieres','france.loire.savennieres-roche-aux-moines',
     'france.loire.coteaux-du-layon',
     'france.loire.coteaux-du-layon-beaulieu-sur-layon-ou-beaulieu',
     'france.loire.coteaux-du-layon-faye-d-anjou-ou-faye',
     'france.loire.coteaux-du-layon-premier-cru-chaume',
     'france.loire.coteaux-du-layon-rablay-sur-layon-ou-rablay',
     'france.loire.coteaux-du-layon-rochefort-sur-loire-ou-rochefort',
     'france.loire.coteaux-du-layon-saint-aubin-de-luigne-ou-saint-aubin',
     'france.loire.coteaux-du-layon-saint-lambert-du-lattay-ou-saint-lambert',
     'france.loire.quarts-de-chaume','france.loire.bonnezeaux',
     'france.loire.coteaux-de-l-aubance','france.loire.saumur',
     'france.loire.saumur-champigny']);

  update wine_places set primary_parent_id = v_tr, display_tier = 3
   where canonical_key = any(array[
     'france.loire.touraine','france.loire.touraine-amboise',
     'france.loire.touraine-azay-le-rideau','france.loire.touraine-chenonceaux',
     'france.loire.touraine-mesland','france.loire.touraine-noble-joue',
     'france.loire.touraine-oisly','france.loire.vouvray',
     'france.loire.montlouis-sur-loire','france.loire.chinon',
     'france.loire.bourgueil','france.loire.saint-nicolas-de-bourgueil',
     'france.loire.jasnieres','france.loire.coteaux-du-loir',
     'france.loire.cheverny','france.loire.cour-cheverny',
     'france.loire.valencay','france.loire.haut-poitou']);

  update wine_places set primary_parent_id = v_cl, display_tier = 3
   where canonical_key = any(array[
     'france.loire.sancerre','france.loire.pouilly-fume',
     'france.loire.pouilly-sur-loire','france.loire.menetou-salon',
     'france.loire.quincy','france.loire.reuilly',
     'france.loire.coteaux-du-giennois','france.loire.chateaumeillant']);

  -- Final-state assertions: 14 + 19 + 18 + 8 accounts for all 59 AOCs, so a
  -- missed re-parent cannot balance out. No "nothing left under the region"
  -- count — later waves may legitimately add tier-2 appellations there.
  if (select count(*) from wine_places where primary_parent_id = v_region and kind = 'SUBREGION') <> 4 then
    raise exception 'expected 4 loire sub-regions under france.loire';
  end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_pn and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 14 then raise exception 'expected 14 AOCs under pays-nantais, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_as and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 19 then raise exception 'expected 19 AOCs under anjou-saumur, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_tr and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 18 then raise exception 'expected 18 AOCs under touraine, got %', v_n; end if;
  select count(*) into v_n from wine_places where primary_parent_id = v_cl and kind = 'APPELLATION' and display_tier = 3;
  if v_n <> 8 then raise exception 'expected 8 AOCs under centre-loire, got %', v_n; end if;
end;
$$;
