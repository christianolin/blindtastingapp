-- Spain wave 18: the two previously-deferred Castilla y León DOPs, now verified.
--   Arlanza (53)             - Burgos (41) + Palencia (12); entidades menores are
--     not INE municipios (excluded); Los Balbases & Ciruelos de Cervera partial,
--     taken whole.
--   Valles de Benavente (61) - Zamora; the 61 parent municipios (parenthetical
--     anejos are not separate municipios, excluded).
-- castilla-y-leon REGION exists. APPELLATION tier 2 (6/6) DRAFT; run-spain-dos
-- promotes each. Article + chips PUBLISHED (render on promotion).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('arlanza', 'spain.castilla-y-leon.arlanza', 'Arlanza', 110),
    ('valles-de-benavente', 'spain.castilla-y-leon.valles-de-benavente', 'Valles de Benavente', 120)
  ) as v(slug, ckey, name, so)
  cross join wine_places p where p.canonical_key = 'spain.castilla-y-leon';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  ('spain.castilla-y-leon.arlanza',
   'A cool, high zone along the river Arlanza in southern Burgos (with a Palencia fringe), making structured Tempranillo — here Tinta del País — reds and vivid rosados on limestone and clay, the altitude keeping them fresh.',
   array['Tempranillo (Tinta del País) reds','Vivid rosados too','High Burgos–Palencia plateau','Limestone & clay soils']),
  ('spain.castilla-y-leon.valles-de-benavente',
   'A cluster of river valleys around Benavente in northern Zamora, reviving the native Prieto Picudo alongside Tempranillo for fresh reds and the lively, deeply coloured rosados the area is known for.',
   array['Native Prieto Picudo','Fresh reds & lively rosados','River valleys around Benavente (Zamora)'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Tempranillo','spain.castilla-y-leon.arlanza'),('Garnacha','spain.castilla-y-leon.arlanza'),
  ('Tempranillo','spain.castilla-y-leon.valles-de-benavente'),('Prieto Picudo','spain.castilla-y-leon.valles-de-benavente')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.castilla-y-leon.arlanza','RED',0),('spain.castilla-y-leon.arlanza','ROSE',1),
  ('spain.castilla-y-leon.valles-de-benavente','ROSE',0),('spain.castilla-y-leon.valles-de-benavente','RED',1)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key in ('spain.castilla-y-leon.arlanza','spain.castilla-y-leon.valles-de-benavente') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 2 then raise exception 'expected 2 DRAFT CyL DOs, got %', v; end if;
end $$;

commit;
