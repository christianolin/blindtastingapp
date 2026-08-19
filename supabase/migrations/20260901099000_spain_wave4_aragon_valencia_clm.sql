-- Spain wave 4: Aragón fills out + Comunidad Valenciana & Castilla-La Mancha
-- REGION nodes and their first DOs.
--
-- From official MAPA pliegos (municipality lists located by density + verified):
--   Aragón: Cariñena (16), Calatayud (50), Campo de Borja (16) — Zaragoza.
--   Comunidad Valenciana: Utiel-Requena (9) — Valencia.
--   Castilla-La Mancha: Almansa (7) — Albacete.
-- The province-capital header (Zaragoza/València) is excluded from each list.
-- valencia + castilla-la-mancha REGION nodes are tree-only (overview boundaries
-- built by build-spain-comunidad-boundaries). aragon already exists. All regional
-- DOPs -> APPELLATION tier 2 (6/6), DRAFT; run-spain-dos.mjs promotes each.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'valencia', 'spain.valencia', 'Comunidad Valenciana', 'REGION', 1, 4, 4, false, 'VERIFIED', 70, id
  from wine_places where canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'castilla-la-mancha', 'spain.castilla-la-mancha', 'Castilla-La Mancha', 'REGION', 1, 4, 4, false, 'VERIFIED', 80, id
  from wine_places where canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('carinena', 'spain.aragon.carinena', 'Cariñena', 20, 'spain.aragon'),
    ('calatayud', 'spain.aragon.calatayud', 'Calatayud', 30, 'spain.aragon'),
    ('campo-de-borja', 'spain.aragon.campo-de-borja', 'Campo de Borja', 40, 'spain.aragon'),
    ('utiel-requena', 'spain.valencia.utiel-requena', 'Utiel-Requena', 10, 'spain.valencia'),
    ('almansa', 'spain.castilla-la-mancha.almansa', 'Almansa', 10, 'spain.castilla-la-mancha')
  ) as v(slug, ckey, name, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key in ('spain.valencia', 'spain.castilla-la-mancha') and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 2 then raise exception 'expected 2 new REGIONs, got %', v_reg; end if;
  select count(*) into v_do from wine_places where canonical_key in ('spain.aragon.carinena','spain.aragon.calatayud','spain.aragon.campo-de-borja','spain.valencia.utiel-requena','spain.castilla-la-mancha.almansa') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 5 then raise exception 'expected 5 new DRAFT DOs, got %', v_do; end if;
end $$;

commit;
