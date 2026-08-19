-- Spain wave 2: Aragón + Murcia REGION nodes and their first DOs (Somontano,
-- Jumilla) — the first Spanish DOs outside Castilla y León / Cataluña.
--
-- Sourced from official MAPA pliegos:
--   Somontano (Huesca) — 43 municipios (área geográfica list).
--   Jumilla — 7 municipios; trans-comunidad DOP keyed under Murcia (the town of
--     Jumilla, prov 30) with 6 Albacete/Castilla-La Mancha municipios (prov 02)
--     in the dissolve, like Rioja spanning three provinces.
-- Both are regional DOPs -> APPELLATION tier 2 (6/6). REGION nodes are tree-only
-- (no boundary). Lands DRAFT; run-spain-dos.mjs promotes each from its pliego
-- municipality union. spain + the driver guards already exist (20260901091000).

begin;

-- aragon (REGION, tier 1, tree-only)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'aragon', 'spain.aragon', 'Aragón', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 30, id
  from wine_places where canonical_key = 'spain';

-- murcia (REGION, tier 1, tree-only)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'murcia', 'spain.murcia', 'Región de Murcia', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 40, id
  from wine_places where canonical_key = 'spain';

-- somontano (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'somontano', 'spain.aragon.somontano', 'Somontano', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.aragon';

-- jumilla (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'jumilla', 'spain.murcia.jumilla', 'Jumilla', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.murcia';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key in ('spain.aragon', 'spain.murcia') and kind = 'REGION'
     and display_tier = 1 and publication_status = 'VERIFIED';
  if v <> 2 then raise exception 'expected 2 new REGION nodes, got %', v; end if;

  select count(*) into v from wine_places
   where canonical_key in ('spain.aragon.somontano', 'spain.murcia.jumilla')
     and kind = 'APPELLATION' and display_tier = 2 and is_appellation
     and appellation_system = 'DOP' and publication_status = 'DRAFT';
  if v <> 2 then raise exception 'expected 2 new DRAFT APPELLATIONs, got %', v; end if;
end $$;

commit;
