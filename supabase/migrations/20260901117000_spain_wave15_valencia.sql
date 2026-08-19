-- Spain wave 15: DO Valencia — the whole-municipality union of its four pliego
-- subzones (Alto Turia, Valentino, Moscatel de Valencia, Clariano), 91 municipios
-- of Valencia province (Valencia city is not a member). valencia REGION already
-- exists. APPELLATION tier 2 (6/6), DRAFT; run-spain-dos promotes it. Article +
-- chips PUBLISHED (render on promotion).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'valencia-do', 'spain.valencia.valencia', 'Valencia', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 20, p.id
  from wine_places p where p.canonical_key = 'spain.valencia';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'The Comunidad Valenciana''s namesake DO, spread over four subzones from the high, cool Alto Turia to the Clariano hills of the interior. Best known for sweet, grapey Moscatel de Valencia, and for great-value reds and whites from Tempranillo, Garnacha, Bobal and Merseguera. The city of Valencia itself lies outside the vineyard zone.',
  array['Four subzones (Alto Turia to Clariano)','Sweet Moscatel de Valencia','Great-value reds & whites','91 municipios, coast-to-interior']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.valencia.valencia';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Moscatel'),('Bobal'),('Tempranillo'),('Garnacha')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.valencia.valencia'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('WHITE',0),('RED',1),('SWEET',2),('ROSE',3)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.valencia.valencia'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'spain.valencia.valencia' and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Valencia DO not created DRAFT'; end if;
end $$;

commit;
