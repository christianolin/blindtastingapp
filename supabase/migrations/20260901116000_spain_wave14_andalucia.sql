-- Spain wave 14: two more Andalucían DOPs.
--   Montilla-Moriles (17) - Córdoba; PX/Moscatel Sherry-style wines. 7 whole + 10
--     partial-taken-whole municipios (documented over-approx); Córdoba capital is
--     ageing-zone only, excluded.
--   Granada (174)          - whole-territory DO: the pliego delimits it as the
--     entire province of Granada (high-altitude Sierra Nevada / Alpujarras).
-- andalucia REGION already exists. APPELLATION tier 2 (6/6), DRAFT; run-spain-dos
-- promotes each. Articles + chips PUBLISHED (render on promotion).

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('montilla-moriles', 'spain.andalucia.montilla-moriles', 'Montilla-Moriles', 40),
    ('granada', 'spain.andalucia.granada', 'Granada', 50)
  ) as v(slug, ckey, name, so)
  cross join wine_places p where p.canonical_key = 'spain.andalucia';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  ('spain.andalucia.montilla-moriles',
   'Andalucía''s "other Sherry country" south of Córdoba — Pedro Ximénez on chalky albariza, aged under flor and through the solera into a Sherry-like spectrum from bone-dry Fino to intensely sweet PX (shipped worldwide as a sweetening wine). The heat means many wines reach fortification strength naturally, often unfortified.',
   array['PX & Moscatel; Sherry-like styles','Flor, the solera & albariza soils','South of Córdoba','Naturally high-strength wines']),
  ('spain.andalucia.granada',
   'A high-altitude, province-wide DO in Andalucía''s mountainous south-east — some of Europe''s highest vineyards (up to ~1,300 m) on the flanks of the Sierra Nevada and in the Alpujarras give surprisingly fresh reds, whites and rosés despite the southern latitude.',
   array['Whole-province DO (Granada)','Europe''s highest vineyards (~1,300 m)','Sierra Nevada & Alpujarras','Fresh reds, whites & rosés'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Pedro Ximénez','spain.andalucia.montilla-moriles'),('Moscatel','spain.andalucia.montilla-moriles'),
  ('Tempranillo','spain.andalucia.granada'),('Garnacha','spain.andalucia.granada')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.andalucia.montilla-moriles','FORTIFIED',0),('spain.andalucia.montilla-moriles','SWEET',1),('spain.andalucia.montilla-moriles','WHITE',2),
  ('spain.andalucia.granada','RED',0),('spain.andalucia.granada','WHITE',1),('spain.andalucia.granada','ROSE',2)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v_do int; v_art int;
begin
  select count(*) into v_do from wine_places where canonical_key in ('spain.andalucia.montilla-moriles','spain.andalucia.granada') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 2 then raise exception 'expected 2 DRAFT Andalucía DOs, got %', v_do; end if;
  select count(*) into v_art from wine_place_articles x join wine_places p on p.id = x.wine_place_id where p.canonical_key in ('spain.andalucia.montilla-moriles','spain.andalucia.granada') and x.editorial_status = 'PUBLISHED';
  if v_art <> 2 then raise exception 'expected 2 articles, got %', v_art; end if;
end $$;

commit;
