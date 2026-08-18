-- Spain wave 1 (cont.): Cataluña + Priorat (DOQ/DOCa) catalog.
--
-- Third DO and the first outside Castilla y León. Sourced from the official MAPA
-- pliego priorat_2022_09_06.pdf, section 4.1 "Zona de producción de la uva":
-- 10 municipios in Tarragona (Catalan names resolved code-first against the INE
-- cache). Priorat is one of Spain's two DOCa/DOQ (calificada) and is a compact,
-- communal-scale appellation, so it reveals a touch later than the regional
-- Castilla y León DOPs (7/7 vs 6/6). Creates the cataluna REGION (tree-only, no
-- boundary yet) + priorat APPELLATION (DRAFT; run-spain-dos.mjs promotes it to
-- VERIFIED when it stages the 10-municipio pliego union). spain + the driver's
-- guards are already in place from 20260901091000.

begin;

-- cataluna (REGION, tier 1) — tree-only grouping, no boundary.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'cataluna', 'spain.cataluna', 'Cataluña', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 20, id
  from wine_places where canonical_key = 'spain';

-- priorat (APPELLATION, tier 2, DOCa/DOQ communal) — DRAFT.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'priorat', 'spain.cataluna.priorat', 'Priorat', 'APPELLATION', 2, 7, 7,
       true, 'DOCa/DOQ', 'communal', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.cataluna';

do $$
declare v_com int; v_pri int;
begin
  select count(*) into v_com from wine_places
   where canonical_key = 'spain.cataluna' and kind = 'REGION'
     and display_tier = 1 and publication_status = 'VERIFIED';
  if v_com <> 1 then raise exception 'cataluna REGION not created VERIFIED'; end if;

  select count(*) into v_pri from wine_places
   where canonical_key = 'spain.cataluna.priorat' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOCa/DOQ'
     and appellation_level = 'communal' and publication_status = 'DRAFT';
  if v_pri <> 1 then raise exception 'priorat APPELLATION not created DRAFT'; end if;
end $$;

commit;
