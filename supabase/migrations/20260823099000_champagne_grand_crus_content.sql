-- Champagne — Grand Cru villages content (v1, published).
--
-- A concise article per village (sub-region + dominant grape), grapes per
-- village (Montagne de Reims + Grande Vallee de la Marne = Pinot Noir; Cote des
-- Blancs = Chardonnay; the other as accessory), and SPARKLING style for all.
-- Insert-only with guards. ASCII prose (display names keep accents).

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  p.name || ', a Champagne Grand Cru village rated 100% on the Echelle des Crus, in the '
    || v.subregion || ' - ' || v.principal || ' on deep chalk.',
  'Cool, marginal semi-continental; the northern edge of ripening, so blending across villages and vintages is the norm.',
  'Deep Belemnite and Micraster chalk (craie) under clay and marl on the slopes.',
  array['One of the 17 Champagne Grand Cru villages (a whole-commune 100% rating, not a parcel AOC)', v.subregion || ', ' || v.principal || '-dominant'],
  'PUBLISHED'
from (values
  ('ambonnay', 'Montagne de Reims', 'Pinot Noir'),
  ('beaumont-sur-vesle', 'Montagne de Reims', 'Pinot Noir'),
  ('bouzy', 'Montagne de Reims', 'Pinot Noir'),
  ('louvois', 'Montagne de Reims', 'Pinot Noir'),
  ('mailly-champagne', 'Montagne de Reims', 'Pinot Noir'),
  ('puisieulx', 'Montagne de Reims', 'Pinot Noir'),
  ('sillery', 'Montagne de Reims', 'Pinot Noir'),
  ('verzenay', 'Montagne de Reims', 'Pinot Noir'),
  ('verzy', 'Montagne de Reims', 'Pinot Noir'),
  ('ay', 'Grande Vallee de la Marne', 'Pinot Noir'),
  ('tours-sur-marne', 'Grande Vallee de la Marne', 'Pinot Noir'),
  ('avize', 'Cote des Blancs', 'Chardonnay'),
  ('chouilly', 'Cote des Blancs', 'Chardonnay'),
  ('cramant', 'Cote des Blancs', 'Chardonnay'),
  ('le-mesnil-sur-oger', 'Cote des Blancs', 'Chardonnay'),
  ('oger', 'Cote des Blancs', 'Chardonnay'),
  ('oiry', 'Cote des Blancs', 'Chardonnay')
) as v(slug, subregion, principal)
join wine_places p on p.canonical_key = 'france.champagne.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('ambonnay', 'Pinot Noir', 'PRINCIPAL'), ('ambonnay', 'Chardonnay', 'ACCESSORY'),
  ('beaumont-sur-vesle', 'Pinot Noir', 'PRINCIPAL'), ('beaumont-sur-vesle', 'Chardonnay', 'ACCESSORY'),
  ('bouzy', 'Pinot Noir', 'PRINCIPAL'), ('bouzy', 'Chardonnay', 'ACCESSORY'),
  ('louvois', 'Pinot Noir', 'PRINCIPAL'), ('louvois', 'Chardonnay', 'ACCESSORY'),
  ('mailly-champagne', 'Pinot Noir', 'PRINCIPAL'), ('mailly-champagne', 'Chardonnay', 'ACCESSORY'),
  ('puisieulx', 'Pinot Noir', 'PRINCIPAL'), ('puisieulx', 'Chardonnay', 'ACCESSORY'),
  ('sillery', 'Pinot Noir', 'PRINCIPAL'), ('sillery', 'Chardonnay', 'ACCESSORY'),
  ('verzenay', 'Pinot Noir', 'PRINCIPAL'), ('verzenay', 'Chardonnay', 'ACCESSORY'),
  ('verzy', 'Pinot Noir', 'PRINCIPAL'), ('verzy', 'Chardonnay', 'ACCESSORY'),
  ('ay', 'Pinot Noir', 'PRINCIPAL'), ('ay', 'Chardonnay', 'ACCESSORY'),
  ('tours-sur-marne', 'Pinot Noir', 'PRINCIPAL'), ('tours-sur-marne', 'Chardonnay', 'ACCESSORY'),
  ('avize', 'Chardonnay', 'PRINCIPAL'), ('avize', 'Pinot Noir', 'ACCESSORY'),
  ('chouilly', 'Chardonnay', 'PRINCIPAL'), ('chouilly', 'Pinot Noir', 'ACCESSORY'),
  ('cramant', 'Chardonnay', 'PRINCIPAL'), ('cramant', 'Pinot Noir', 'ACCESSORY'),
  ('le-mesnil-sur-oger', 'Chardonnay', 'PRINCIPAL'), ('le-mesnil-sur-oger', 'Pinot Noir', 'ACCESSORY'),
  ('oger', 'Chardonnay', 'PRINCIPAL'), ('oger', 'Pinot Noir', 'ACCESSORY'),
  ('oiry', 'Chardonnay', 'PRINCIPAL'), ('oiry', 'Pinot Noir', 'ACCESSORY')
) as v(slug, grape, role)
join wine_places p on p.canonical_key = 'france.champagne.' || v.slug
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'SPARKLING', 'Traditional-method Champagne', 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.champagne.%'
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id=a.wine_place_id where p.canonical_key like 'france.champagne.%';
  if v_a <> 17 then raise exception 'expected 17 champagne GC articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg join wine_places p on p.id=wg.wine_place_id where p.canonical_key like 'france.champagne.%';
  if v_g < 17 then raise exception 'expected >= 17 champagne GC grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws join wine_places p on p.id=ws.wine_place_id where p.canonical_key like 'france.champagne.%';
  if v_s <> 17 then raise exception 'expected 17 champagne GC styles, got %', v_s; end if;
end;
$$;
