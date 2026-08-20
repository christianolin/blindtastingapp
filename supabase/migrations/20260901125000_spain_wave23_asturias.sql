-- Spain wave 23: a NEW comunidad — Principado de Asturias — and its DO Cangas.
-- 8 whole municipios of the upper Narcea valley (Tineo is parroquia-partial, taken
-- whole). New REGION node (tier 1, VERIFIED, tree-only). DO -> APPELLATION tier 2
-- (6/6) DRAFT; run-spain-dos promotes it. Native white Albarín added idempotently.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select 'Albarín', 'WHITE', 'green', 'A rare, aromatic native white of Spain''s north-west (Asturias, León) — floral, citrus, moderately structured whites.', 'Asturias (Cangas), Castilla y León'
where not exists (select 1 from grapes g where g.name = 'Albarín');

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'asturias', 'spain.asturias', 'Principado de Asturias', 'REGION', 1, 4, 4, false, 'VERIFIED', 120, p.id
  from wine_places p where p.canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'cangas', 'spain.asturias.cangas', 'Cangas', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 10, p.id
  from wine_places p where p.canonical_key = 'spain.asturias';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'Spain''s green north-western mountain frontier — a tiny, historic Asturian DO in the steep upper Narcea valley, reviving rare native grapes (Albarín Blanco, Verdejo Negro, Carrasquín) alongside Mencía for fresh, distinctive mountain wines on schist terraces.',
  array['Rare Asturian native grapes','Mencía reds & Albarín Blanco whites','Steep upper Narcea valley','Spain''s green north-west']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.asturias.cangas';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Mencía'),('Albarín')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.asturias.cangas'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('WHITE',1)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.asturias.cangas'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key = 'spain.asturias' and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'Asturias REGION not created'; end if;
  select count(*) into v_do from wine_places where canonical_key = 'spain.asturias.cangas' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 1 then raise exception 'Cangas DO not created DRAFT'; end if;
end $$;

commit;
