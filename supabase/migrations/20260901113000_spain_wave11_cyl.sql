-- Spain wave 11: four more Castilla y León DOPs, sourced from their official
-- MAPA pliego "zona de producción" lists (read directly, density-located, and
-- INE-resolved fail-closed):
--   Bierzo (31)                    - León; the El Bierzo comarca (Mencía).
--   Valtiendas (16)                - Segovia; comarca de Fuentidueña (Tempranillo).
--   Sierra de Salamanca (26)       - Salamanca; Sierra de Francia (Rufete). The
--                                    capital Salamanca is a spurious header match,
--                                    dropped (not a listed member).
--   Tierra del Vino de Zamora (56) - Zamora (incl. the city of Zamora, a genuine
--                                    member) + Salamanca. Capital Salamanca dropped.
-- castilla-y-leon REGION already exists. Regional DOPs -> APPELLATION tier 2
-- (6/6), DRAFT; run-spain-dos.mjs promotes each from its municipality union.
-- Articles + grape/style chips are PUBLISHED here and render once the DO is
-- promoted to VERIFIED. Two grapes (Rufete, Garnacha Tintorera) added idempotently.

begin;

-- Missing native grapes for the chips.
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Rufete', 'RED', 'blue-black', 'A delicate, pale, aromatic native red of the Salamanca mountains — high-altitude, fragrant reds in Sierra de Salamanca.', 'Castilla y León (Sierra de Salamanca)'),
  ('Garnacha Tintorera', 'RED', 'blue-black', 'Alicante Bouschet — a red-fleshed teinturier grape giving deep colour and body; grown in Bierzo and warm zones across Spain.', 'Castilla y León, Castilla-La Mancha, Galicia')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- Catalog nodes (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('bierzo', 'spain.castilla-y-leon.bierzo', 'Bierzo', 70),
    ('valtiendas', 'spain.castilla-y-leon.valtiendas', 'Valtiendas', 80),
    ('sierra-de-salamanca', 'spain.castilla-y-leon.sierra-de-salamanca', 'Sierra de Salamanca', 90),
    ('tierra-del-vino-de-zamora', 'spain.castilla-y-leon.tierra-del-vino-de-zamora', 'Tierra del Vino de Zamora', 100)
  ) as v(slug, ckey, name, so)
  cross join wine_places p
 where p.canonical_key = 'spain.castilla-y-leon';

-- Articles (PUBLISHED; render once the DO is promoted to VERIFIED).
insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  ('spain.castilla-y-leon.bierzo',
   'A green, Atlantic-influenced pocket in the north-west of León, Bierzo is the modern home of Mencía — fragrant, mineral, medium-bodied reds from old vines on slate and clay — alongside increasingly fine Godello whites. A hoya (tectonic basin) ringed by mountains gives it a milder microclimate than the Castilian plateau.',
   array['Mencía reds from old slate-grown vines','Atlantic-influenced tectonic basin','Godello & Palomino whites','The El Bierzo comarca, León']),
  ('spain.castilla-y-leon.valtiendas',
   'A small Segovian DO on the northern edge of the Duero basin, Valtiendas makes structured Tempranillo (Tinta del País) reds from high, continental vineyards around the medieval town of Fuentidueña.',
   array['Tempranillo (Tinta del País) reds','High, continental Segovian plateau','Small Fuentidueña-area DO']),
  ('spain.castilla-y-leon.sierra-de-salamanca',
   'A mountain DO in the foothills of the Sierra de Francia, reviving the native red Rufete — pale, perfumed, high-altitude reds — alongside Tempranillo and Garnacha on steep granite terraces.',
   array['Native Rufete reds','Steep granite mountain terraces','Sierra de Francia (Salamanca)']),
  ('spain.castilla-y-leon.tierra-del-vino-de-zamora',
   'Straddling the Zamora–Salamanca border along the Duero, this historic zone — whose name means "land of wine" — makes robust Tempranillo reds and Malvasía whites from old, dry-farmed vines.',
   array['"Land of wine" — historic Duero zone','Tempranillo reds & Malvasía whites','Old dry-farmed vines','Zamora + Salamanca provinces'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

-- Grape chips.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Mencía','spain.castilla-y-leon.bierzo'),('Godello','spain.castilla-y-leon.bierzo'),
  ('Tempranillo','spain.castilla-y-leon.valtiendas'),
  ('Rufete','spain.castilla-y-leon.sierra-de-salamanca'),('Tempranillo','spain.castilla-y-leon.sierra-de-salamanca'),
  ('Tempranillo','spain.castilla-y-leon.tierra-del-vino-de-zamora'),('Malvasia','spain.castilla-y-leon.tierra-del-vino-de-zamora')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style pills.
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.castilla-y-leon.bierzo','RED',0),('spain.castilla-y-leon.bierzo','WHITE',1),
  ('spain.castilla-y-leon.valtiendas','RED',0),
  ('spain.castilla-y-leon.sierra-de-salamanca','RED',0),
  ('spain.castilla-y-leon.tierra-del-vino-de-zamora','RED',0),('spain.castilla-y-leon.tierra-del-vino-de-zamora','WHITE',1)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (
  select 1 from wine_place_styles ws
  where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null
);

do $$
declare v_nodes int; v_articles int;
begin
  select count(*) into v_nodes from wine_places
   where canonical_key in ('spain.castilla-y-leon.bierzo','spain.castilla-y-leon.valtiendas','spain.castilla-y-leon.sierra-de-salamanca','spain.castilla-y-leon.tierra-del-vino-de-zamora')
     and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_nodes <> 4 then raise exception 'expected 4 DRAFT CyL DOs, got %', v_nodes; end if;
  select count(*) into v_articles from wine_place_articles x
    join wine_places p on p.id = x.wine_place_id
   where p.canonical_key like 'spain.castilla-y-leon.%' and x.editorial_status = 'PUBLISHED'
     and p.canonical_key in ('spain.castilla-y-leon.bierzo','spain.castilla-y-leon.valtiendas','spain.castilla-y-leon.sierra-de-salamanca','spain.castilla-y-leon.tierra-del-vino-de-zamora');
  if v_articles <> 4 then raise exception 'expected 4 CyL DO articles, got %', v_articles; end if;
end $$;

commit;
