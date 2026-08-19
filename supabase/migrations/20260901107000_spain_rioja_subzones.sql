-- Spain subzone tier: the three zones of DOCa Rioja — Rioja Alta, Rioja
-- Oriental, Rioja Alavesa — as APPELLATION children of spain.la-rioja.rioja.
--
-- Sourced from the DOCa Rioja pliego, which lists every municipio under exactly
-- one zone header (RIOJA ALTA / RIOJA ORIENTAL / RIOJA ALAVESA); the three
-- partition the DO. Each subzone's municipios are the intersection of its pliego
-- zone list with the parent Rioja entry's 135 municipios, so the three tile the
-- DO exactly (Alta 75 + Oriental 47 + Alavesa 13 = 135). This is the first
-- SUBREGIONAL (subzone) tier on the Spanish map — the reusable pattern for later
-- multi-zone DOs (Rías Baixas, etc.).
--
-- APPELLATION, display_tier 3 (deeper than the DO's tier 2; the hierarchy trigger
-- requires child tier >= parent tier), min_zoom/label 7 (reveal below the DO's 6),
-- appellation_level 'subregional', DRAFT. run-spain-dos.mjs dissolves each zone's
-- municipality union and promotes it, with the parent-containment guard checking
-- it sits inside the current Rioja boundary.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 3, 7, 7, true, 'DOCa', 'subregional', 'DRAFT', v.so, p.id
  from (values
    ('rioja-alta', 'spain.la-rioja.rioja.rioja-alta', 'Rioja Alta', 10),
    ('rioja-oriental', 'spain.la-rioja.rioja.rioja-oriental', 'Rioja Oriental', 20),
    ('rioja-alavesa', 'spain.la-rioja.rioja.rioja-alavesa', 'Rioja Alavesa', 30)
  ) as v(slug, ckey, name, so)
  cross join wine_places p
 where p.canonical_key = 'spain.la-rioja.rioja';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key in ('spain.la-rioja.rioja.rioja-alta','spain.la-rioja.rioja.rioja-oriental','spain.la-rioja.rioja.rioja-alavesa')
     and kind = 'APPELLATION' and display_tier = 3 and appellation_level = 'subregional' and publication_status = 'DRAFT';
  if v <> 3 then raise exception 'expected 3 DRAFT Rioja subzones, got %', v; end if;
end $$;

commit;
