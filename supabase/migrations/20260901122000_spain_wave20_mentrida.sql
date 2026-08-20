-- Spain wave 20: DO Méntrida — shipped faithful to the current (2022) pliego,
-- which significantly expanded the zona to 77 Toledo municipios (including Toledo
-- city and Talavera de la Reina; Argés & Guadamur partial-polígono, taken whole).
-- castilla-la-mancha REGION exists. APPELLATION tier 2 (6/6) DRAFT; run-spain-dos
-- promotes it.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'mentrida', 'spain.castilla-la-mancha.mentrida', 'Méntrida', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 70, p.id
  from wine_places p where p.canonical_key = 'spain.castilla-la-mancha';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'The historic Garnacha heartland south-west of Madrid, on the granite-and-clay plains of northern Toledo. Long a source of robust bulk reds and rosados, its old bush-vine Garnacha is being rediscovered for fresher, more elegant reds; the current DO zone reaches across a wide swathe of Toledo province.',
  array['Old-vine Garnacha heartland','Robust reds & rosados','Granite-clay plains of northern Toledo','Wide current zona (77 municipios)']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.castilla-la-mancha.mentrida';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Garnacha'),('Tempranillo'),('Syrah')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.mentrida'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('RED',0),('ROSE',1)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.mentrida'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.castilla-la-mancha.mentrida' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Méntrida DO not created DRAFT'; end if;
end $$;

commit;
