-- Spain wave 5: Navarra REGION + DO Navarra; Condado de Huelva (Andalucía).
--
-- From official MAPA pliegos: Navarra (118 municipios, southern Navarra, 5
-- subzones) and Condado de Huelva (18 municipios; Huelva capital excluded).
-- navarra REGION is tree-only (overview boundary built separately); andalucia
-- already exists. Regional DOPs -> APPELLATION tier 2 (6/6), DRAFT.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'navarra', 'spain.navarra', 'Navarra', 'REGION', 1, 4, 4, false, 'VERIFIED', 90, id
  from wine_places where canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('navarra', 'spain.navarra.navarra', 'Navarra', 10, 'spain.navarra'),
    ('condado-de-huelva', 'spain.andalucia.condado-de-huelva', 'Condado de Huelva', 20, 'spain.andalucia')
  ) as v(slug, ckey, name, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key = 'spain.navarra' and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'navarra REGION not created'; end if;
  select count(*) into v_do from wine_places where canonical_key in ('spain.navarra.navarra','spain.andalucia.condado-de-huelva') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 2 then raise exception 'expected 2 new DRAFT DOs, got %', v_do; end if;
end $$;

commit;
