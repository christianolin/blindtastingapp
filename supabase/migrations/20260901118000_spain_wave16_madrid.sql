-- Spain wave 16: a NEW comunidad — Comunidad de Madrid — and its DO Vinos de
-- Madrid, from the official pliego. Whole-municipality union of the 4 subzones
-- (Arganda, Navalcarnero, San Martín de Valdeiglesias, El Molar) = 70 municipios;
-- Alcalá de Henares excluded (only its finca El Encín is in the DO), Madrid city
-- is not a member. New REGION node (tier 1, VERIFIED, tree-only). DO -> APPELLATION
-- tier 2 (6/6) DRAFT; run-spain-dos promotes it. Native whites added idempotently.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Malvar', 'WHITE', 'green', 'A native central-Spanish white — soft, gently aromatic, the traditional white of Vinos de Madrid.', 'Comunidad de Madrid'),
  ('Albillo Real', 'WHITE', 'green', 'A delicate, fragrant central-Spanish white (Sierra de Gredos, Madrid) giving textured, aromatic whites.', 'Madrid, Castilla y León (Gredos)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'madrid', 'spain.madrid', 'Comunidad de Madrid', 'REGION', 1, 4, 4, false, 'VERIFIED', 110, p.id
  from wine_places p where p.canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'vinos-de-madrid', 'spain.madrid.vinos-de-madrid', 'Vinos de Madrid', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 10, p.id
  from wine_places p where p.canonical_key = 'spain.madrid';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'Ringing the capital across four subzones — Arganda, Navalcarnero, San Martín de Valdeiglesias and El Molar — Madrid''s DO has shed its bulk-wine past for characterful old-vine Garnacha (especially in granitic San Martín, on the Gredos flank) and Tempranillo, plus fresh Albillo and Malvar whites, driven by a wave of ambitious small growers.',
  array['Four subzones around the capital','Old-vine Garnacha (San Martín / Gredos)','Tempranillo reds; Albillo & Malvar whites','Madrid city is not a member']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.madrid.vinos-de-madrid';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Garnacha'),('Tempranillo'),('Albillo Real'),('Malvar')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.madrid.vinos-de-madrid'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('WHITE',1),('ROSE',2)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.madrid.vinos-de-madrid'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key = 'spain.madrid' and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'Madrid REGION not created'; end if;
  select count(*) into v_do from wine_places where canonical_key = 'spain.madrid.vinos-de-madrid' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 1 then raise exception 'Vinos de Madrid DO not created DRAFT'; end if;
end $$;

commit;
