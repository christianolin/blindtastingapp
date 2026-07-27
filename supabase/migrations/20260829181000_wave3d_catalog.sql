-- Wave 3d — completion catalog (9 places, DRAFT).
--
-- * Sud-Ouest five (flat tier-2, matching the region's structure): Côtes de
--   Bergerac, Côtes/Haut-Montravel, Saint-Mont, Tursan.
-- * Pierrevert (Haute-Provence, tier 2 under provence).
-- * Bourgogne: Côte de Beaune AOC (the hillside appellation — same-slug
--   child of its district, the Chablis pattern), Côte de Beaune-Villages
--   and Mâcon-Villages as tier-3 district members.
-- Region-wide styles (Bourgogne AOP/Aligoté/Passe-tout-grains/Crémant,
-- Crémant de Limoux -> Limoux, Crémant/Macvin du Jura -> Jura) are
-- link-only in 20260829183000 — the Bordeaux dual-role model.
-- Flip in 20260829182000; Sud-Ouest + Provence re-derive afterwards.
do $$
declare
  v_so uuid; v_pr uuid; v_cdb uuid; v_mac uuid; v_n int;
begin
  select id into v_so from wine_places where canonical_key = 'france.sud-ouest' and publication_status = 'VERIFIED';
  select id into v_pr from wine_places where canonical_key = 'france.provence' and publication_status = 'VERIFIED';
  select id into v_cdb from wine_places where canonical_key = 'france.bourgogne.cote-de-beaune' and publication_status = 'VERIFIED';
  select id into v_mac from wine_places where canonical_key = 'france.bourgogne.maconnais' and publication_status = 'VERIFIED';
  if v_so is null or v_pr is null or v_cdb is null or v_mac is null then
    raise exception 'a wave-3d parent is not VERIFIED';
  end if;

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_so, 'APPELLATION', 'france.sud-ouest.' || v.slug, v.name, v.slug, 2, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('cotes-de-bergerac', 'Côtes de Bergerac', 90),
    ('cotes-de-montravel', 'Côtes de Montravel', 91),
    ('haut-montravel', 'Haut-Montravel', 92),
    ('saint-mont', 'Saint-Mont', 93),
    ('tursan', 'Tursan', 94)
  ) as v(slug, name, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.sud-ouest.' || v.slug);

  if not exists (select 1 from wine_places where canonical_key = 'france.provence.pierrevert') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_pr, 'APPELLATION', 'france.provence.pierrevert', 'Pierrevert', 'pierrevert', 2, 7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', 90);
  end if;

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
  select v_cdb, 'APPELLATION', 'france.bourgogne.cote-de-beaune.' || v.slug, v.name, v.slug, 3, 8, 8, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('cote-de-beaune', 'Côte de Beaune', 90),
    ('cote-de-beaune-villages', 'Côte de Beaune-Villages', 91)
  ) as v(slug, name, so)
  where not exists (select 1 from wine_places w where w.canonical_key = 'france.bourgogne.cote-de-beaune.' || v.slug);

  if not exists (select 1 from wine_places where canonical_key = 'france.bourgogne.maconnais.macon-villages') then
    insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, appellation_system, appellation_level, sort_order)
    values (v_mac, 'APPELLATION', 'france.bourgogne.maconnais.macon-villages', 'Mâcon-Villages', 'macon-villages', 3, 8, 8, 'DRAFT', true, 'AOC/AOP', 'communal', 90);
  end if;

  -- Final-state assertions.
  select count(*) into v_n from wine_places
   where primary_parent_id = v_so and canonical_key in
     ('france.sud-ouest.cotes-de-bergerac','france.sud-ouest.cotes-de-montravel','france.sud-ouest.haut-montravel','france.sud-ouest.saint-mont','france.sud-ouest.tursan');
  if v_n <> 5 then raise exception 'expected 5 new sud-ouest places, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.provence.pierrevert' and primary_parent_id = v_pr) then
    raise exception 'pierrevert catalog row wrong';
  end if;
  select count(*) into v_n from wine_places
   where primary_parent_id = v_cdb and canonical_key in
     ('france.bourgogne.cote-de-beaune.cote-de-beaune','france.bourgogne.cote-de-beaune.cote-de-beaune-villages');
  if v_n <> 2 then raise exception 'expected 2 new cote-de-beaune members, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.bourgogne.maconnais.macon-villages' and primary_parent_id = v_mac) then
    raise exception 'macon-villages catalog row wrong';
  end if;
end;
$$;
