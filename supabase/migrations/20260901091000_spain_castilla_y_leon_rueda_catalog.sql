-- Spain wave 1 (pilot): Castilla y León + Rueda catalog, and re-activation of
-- the spain COUNTRY node.
--
-- Context: the spain node (20260901090000) was set to EXCLUDED with its boundary
-- retired by a collaborator while it was content-less (a lone country outline on
-- the shared map). It now gains a real DO (Rueda, sourced from the official MAPA
-- pliego PDO-ES-A0889), so this restores it VERIFIED with its Natural Earth
-- boundary current. Tree: spain (COUNTRY 0) -> castilla-y-leon (REGION 1,
-- tree-only, no boundary yet) -> rueda (APPELLATION 2, DRAFT — run-spain-dos.mjs
-- promotes it to VERIFIED when it stages the pliego-union boundary).
-- Tiers/zooms mirror Italy (italy.piemonte REGION 4/4; italy.piemonte.barolo
-- APPELLATION); Rueda is a regional DOP so it reveals a touch earlier (6/6).

begin;

-- 1. Re-activate the spain COUNTRY node + its boundary.
do $$
declare v_current int; v_place uuid;
begin
  select id into v_place from wine_places where canonical_key = 'spain';
  if v_place is null then raise exception 'spain place missing'; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key = 'spain' and publication_status <> 'VERIFIED';

  update wine_place_boundaries b set is_current = true
   where b.wine_place_id = v_place
     and b.quality_status = 'VALIDATED'
     and b.revision = '20260901090000';

  select count(*) into v_current
    from wine_place_boundaries
   where wine_place_id = v_place and is_current and quality_status = 'VALIDATED';
  if v_current <> 1 then
    raise exception 'expected exactly 1 current-validated spain boundary, got %', v_current;
  end if;
end $$;

-- 2. castilla-y-leon (REGION, tier 1) — tree-only grouping, no boundary.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'castilla-y-leon', 'spain.castilla-y-leon', 'Castilla y León', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 10, id
  from wine_places where canonical_key = 'spain';

-- 3. rueda (APPELLATION, tier 2, DOP regional) — DRAFT; the boundary + flip to
--    VERIFIED happen in run-spain-dos.mjs from the pliego municipality union.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'rueda', 'spain.castilla-y-leon.rueda', 'Rueda', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.castilla-y-leon';

-- Same-transaction assertions.
do $$
declare v_spain int; v_com int; v_rueda int;
begin
  select count(*) into v_spain from wine_places
   where canonical_key = 'spain' and publication_status = 'VERIFIED';
  if v_spain <> 1 then raise exception 'spain not VERIFIED'; end if;

  select count(*) into v_com from wine_places
   where canonical_key = 'spain.castilla-y-leon' and kind = 'REGION'
     and display_tier = 1 and publication_status = 'VERIFIED';
  if v_com <> 1 then raise exception 'castilla-y-leon REGION not created VERIFIED'; end if;

  select count(*) into v_rueda from wine_places
   where canonical_key = 'spain.castilla-y-leon.rueda' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOP'
     and publication_status = 'DRAFT';
  if v_rueda <> 1 then raise exception 'rueda APPELLATION not created DRAFT'; end if;
end $$;

commit;
