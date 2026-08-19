-- Spain wave 3: Galicia REGION + Ribeiro; Montsant (Cataluña).
--
-- Ribeiro (Ourense) — 13 municipios; Galician DOs are parroquia-delimited, so
-- this is a coarser whole-municipality over-approximation (9 whole ayuntamientos
-- + 4 partial-parroquia parents; Ourense city excluded — only 2 lugares belong).
-- Montsant (Tarragona) — 13 municipios ringing the Priorat DOQ; cataluna REGION
-- already exists. Both regional DOPs -> APPELLATION tier 2 (6/6). galicia REGION
-- is tree-only (its overview boundary is built by build-spain-comunidad-boundaries).
-- DRAFT; run-spain-dos.mjs promotes each from its pliego municipality union.

begin;

-- galicia (REGION, tier 1, tree-only)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'galicia', 'spain.galicia', 'Galicia', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 60, id
  from wine_places where canonical_key = 'spain';

-- ribeiro (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'ribeiro', 'spain.galicia.ribeiro', 'Ribeiro', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.galicia';

-- montsant (APPELLATION, tier 2, DOP regional) — DRAFT, under existing cataluna.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'montsant', 'spain.cataluna.montsant', 'Montsant', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 20, id
  from wine_places where canonical_key = 'spain.cataluna';

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places
   where canonical_key = 'spain.galicia' and kind = 'REGION'
     and display_tier = 1 and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'galicia REGION not created'; end if;

  select count(*) into v_do from wine_places
   where canonical_key in ('spain.galicia.ribeiro', 'spain.cataluna.montsant')
     and kind = 'APPELLATION' and display_tier = 2 and is_appellation
     and appellation_system = 'DOP' and publication_status = 'DRAFT';
  if v_do <> 2 then raise exception 'expected 2 new DRAFT APPELLATIONs, got %', v_do; end if;
end $$;

commit;
