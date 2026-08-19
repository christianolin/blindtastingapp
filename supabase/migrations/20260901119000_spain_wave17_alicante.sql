-- Spain wave 17: DO Alicante — the 4 pliego subzones' whole Alicante-province
-- municipios (34; the partial parajes from Caudete/Jumilla/Yecla/Abanilla/Orihuela
-- are excluded). valencia REGION already exists. APPELLATION tier 2 (6/6), DRAFT;
-- run-spain-dos promotes it. Article + chips PUBLISHED (render on promotion).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'alicante', 'spain.valencia.alicante', 'Alicante', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 30, p.id
  from wine_places p where p.canonical_key = 'spain.valencia';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'Home of Monastrell and of the historic, oxidatively-aged sweet Fondillón, Alicante stretches from the coastal L''Alacantí to the inland Vinalopó valley. Powerful Monastrell reds, aromatic Moscatel from the Marina coast, and a wave of fresh old-vine bottlings define the modern DO.',
  array['Powerful Monastrell reds','Historic sweet Fondillón','Moscatel from the coast','Coast + Vinalopó valley (34 municipios)']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.valencia.alicante';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Monastrell'),('Moscatel'),('Garnacha')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.valencia.alicante'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('SWEET',1),('WHITE',2),('ROSE',3)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.valencia.alicante'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.valencia.alicante' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Alicante DO not created DRAFT'; end if;
end $$;

commit;
