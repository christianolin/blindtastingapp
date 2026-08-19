-- Spain wave 9: La Rioja REGION + Rioja DOCa (the flagship).
--
-- From the official DOCa Rioja pliego: 135 municipios located via the
-- space-separated multi-column list (La Rioja 113 + Rioja Alavesa/Álava 13 +
-- Rioja/Navarra 9) — ~94% of the ~144-municipio DOCa; the multi-word remainder
-- in the table is refinable. Trans-comunidad DOCa keyed under La Rioja (its
-- Álava + Navarra municipios are in the dissolve, like the comunidad model
-- allows). Logroño is a member; Vitoria/Pamplona capitals excluded. la-rioja
-- REGION is tree-only (overview boundary built separately). Rioja is a regional
-- DOCa -> APPELLATION tier 2 (6/6), DRAFT; run-spain-dos.mjs promotes it.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'la-rioja', 'spain.la-rioja', 'La Rioja', 'REGION', 1, 4, 4, false, 'VERIFIED', 15, id
  from wine_places where canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'rioja', 'spain.la-rioja.rioja', 'Rioja', 'APPELLATION', 2, 6, 6, true, 'DOCa', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.la-rioja';

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key = 'spain.la-rioja' and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'la-rioja REGION not created'; end if;
  select count(*) into v_do from wine_places where canonical_key = 'spain.la-rioja.rioja' and kind = 'APPELLATION' and appellation_system = 'DOCa' and publication_status = 'DRAFT';
  if v_do <> 1 then raise exception 'rioja DOCa not created DRAFT'; end if;
end $$;

commit;
