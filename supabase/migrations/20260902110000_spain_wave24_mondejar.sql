-- Spain wave 24: DO Mondéjar (Castilla-La Mancha) — the last unshipped DO.
--
-- Its membership entry (21 Guadalajara municipios, whole-municipality union of
-- the pliego zona) was sourced and marked `ready` during the Castilla-La Mancha
-- wave but its catalog node was never created, so the entry pointed at a place
-- row that didn't exist. That is not merely a missing region: run-spain-dos
-- would reject the ready entry on every future run. This closes it.
--
-- castilla-la-mancha REGION already exists. APPELLATION tier 2 (6/6) DRAFT;
-- run-spain-dos promotes it to VERIFIED with its dissolved boundary.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'mondejar', 'spain.castilla-la-mancha.mondejar', 'Mondéjar', 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', 80, p.id
  from wine_places p where p.canonical_key = 'spain.castilla-la-mancha';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'A small DO in the limestone hills of La Alcarria, south-east of Guadalajara and within easy reach of Madrid. Whites built on the local Malvar are its signature — soft, faintly aniseed and honeyed — alongside Tempranillo (Cencibel) reds from cooler, higher ground than the Meseta to the south.',
  array['Native Malvar whites','Tempranillo (Cencibel) reds','La Alcarria limestone, Guadalajara','21 municipios — one of Spain''s smallest DOs']::text[],
  'PUBLISHED'
from wine_places p where p.canonical_key = 'spain.castilla-la-mancha.mondejar';

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Malvar'),('Tempranillo'),('Macabeu')) as m(grape)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.mondejar'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('WHITE',0),('RED',1)) as s(style, so)
join wine_places p on p.canonical_key = 'spain.castilla-la-mancha.mondejar'
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key = 'spain.castilla-la-mancha.mondejar'
     and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 1 then raise exception 'Mondéjar DO not created DRAFT'; end if;
end $$;

commit;
