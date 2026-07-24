-- Champagne — Premier Cru villages catalog (38 SITE places, DRAFT).
--
-- Best-knowledge Echelle des Crus 1er cru villages as commune-rating SITE places
-- (is_appellation=false, tier 3) under their sub-region. Generated from
-- data/wine-map/champagne-premier-crus.json. Commune footprints (IGN Admin
-- Express by INSEE) are flipped in 20260827093000, then the 3 sub-regions are
-- re-derived to include them. Deferred edge cases (Tauxieres-Mutry, Mareuil-sur-
-- Ay, Bisseuil, Vertus) are documented in the artifact.
do $$
declare v_n int;
begin
  if exists (select 1 from wine_places where canonical_key = any(array['france.champagne.bezannes', 'france.champagne.billy-le-grand', 'france.champagne.chamery', 'france.champagne.chigny-les-roses', 'france.champagne.cormontreuil', 'france.champagne.coulommes-la-montagne', 'france.champagne.ecueil', 'france.champagne.jouy-les-reims', 'france.champagne.les-mesneux', 'france.champagne.ludes', 'france.champagne.montbre', 'france.champagne.pargny-les-reims', 'france.champagne.rilly-la-montagne', 'france.champagne.sacy', 'france.champagne.sermiers', 'france.champagne.taissy', 'france.champagne.trepail', 'france.champagne.trois-puits', 'france.champagne.vaudemange', 'france.champagne.villedommange', 'france.champagne.villers-allerand', 'france.champagne.villers-aux-noeuds', 'france.champagne.villers-marmery', 'france.champagne.vrigny', 'france.champagne.avenay-val-d-or', 'france.champagne.champillon', 'france.champagne.cumieres', 'france.champagne.dizy', 'france.champagne.hautvillers', 'france.champagne.mutigny', 'france.champagne.bergeres-les-vertus', 'france.champagne.coligny', 'france.champagne.cuis', 'france.champagne.etrechy', 'france.champagne.grauves', 'france.champagne.pierry', 'france.champagne.villeneuve-renneville-chevigny', 'france.champagne.voipreux'])) then
    raise exception 'champagne 1er cru places already exist';
  end if;
  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
  select sr.id, 'SITE', 'france.champagne.' || v.slug, v.name, v.slug, 3, 8, 8, 'DRAFT', false, v.so
  from (values
    ('bezannes', 'Bezannes', 'montagne-de-reims', 100),
    ('billy-le-grand', 'Billy-le-Grand', 'montagne-de-reims', 101),
    ('chamery', 'Chamery', 'montagne-de-reims', 102),
    ('chigny-les-roses', 'Chigny-les-Roses', 'montagne-de-reims', 103),
    ('cormontreuil', 'Cormontreuil', 'montagne-de-reims', 104),
    ('coulommes-la-montagne', 'Coulommes-la-Montagne', 'montagne-de-reims', 105),
    ('ecueil', 'Écueil', 'montagne-de-reims', 106),
    ('jouy-les-reims', 'Jouy-lès-Reims', 'montagne-de-reims', 107),
    ('les-mesneux', 'Les Mesneux', 'montagne-de-reims', 108),
    ('ludes', 'Ludes', 'montagne-de-reims', 109),
    ('montbre', 'Montbré', 'montagne-de-reims', 110),
    ('pargny-les-reims', 'Pargny-lès-Reims', 'montagne-de-reims', 111),
    ('rilly-la-montagne', 'Rilly-la-Montagne', 'montagne-de-reims', 112),
    ('sacy', 'Sacy', 'montagne-de-reims', 113),
    ('sermiers', 'Sermiers', 'montagne-de-reims', 114),
    ('taissy', 'Taissy', 'montagne-de-reims', 115),
    ('trepail', 'Trépail', 'montagne-de-reims', 116),
    ('trois-puits', 'Trois-Puits', 'montagne-de-reims', 117),
    ('vaudemange', 'Vaudemange', 'montagne-de-reims', 118),
    ('villedommange', 'Villedommange', 'montagne-de-reims', 119),
    ('villers-allerand', 'Villers-Allerand', 'montagne-de-reims', 120),
    ('villers-aux-noeuds', 'Villers-aux-Nœuds', 'montagne-de-reims', 121),
    ('villers-marmery', 'Villers-Marmery', 'montagne-de-reims', 122),
    ('vrigny', 'Vrigny', 'montagne-de-reims', 123),
    ('avenay-val-d-or', 'Avenay-Val-d''Or', 'grande-vallee-de-la-marne', 124),
    ('champillon', 'Champillon', 'grande-vallee-de-la-marne', 125),
    ('cumieres', 'Cumières', 'grande-vallee-de-la-marne', 126),
    ('dizy', 'Dizy', 'grande-vallee-de-la-marne', 127),
    ('hautvillers', 'Hautvillers', 'grande-vallee-de-la-marne', 128),
    ('mutigny', 'Mutigny', 'grande-vallee-de-la-marne', 129),
    ('bergeres-les-vertus', 'Bergères-lès-Vertus', 'cote-des-blancs', 130),
    ('coligny', 'Coligny', 'cote-des-blancs', 131),
    ('cuis', 'Cuis', 'cote-des-blancs', 132),
    ('etrechy', 'Étréchy', 'cote-des-blancs', 133),
    ('grauves', 'Grauves', 'cote-des-blancs', 134),
    ('pierry', 'Pierry', 'cote-des-blancs', 135),
    ('villeneuve-renneville-chevigny', 'Villeneuve-Renneville-Chevigny', 'cote-des-blancs', 136),
    ('voipreux', 'Voipreux', 'cote-des-blancs', 137)
  ) as v(slug, name, subregion, so)
  join wine_places sr on sr.canonical_key = 'france.champagne.' || v.subregion and sr.kind = 'SUBREGION';
  select count(*) into v_n from wine_places
   where canonical_key like 'france.champagne.%' and kind = 'SITE' and display_tier = 3 and not is_appellation;
  if v_n <> 55 then
    raise exception 'expected 55 champagne tier-3 SITE villages (17 GC + 38 1er cru), got %', v_n;
  end if;
end;
$$;
