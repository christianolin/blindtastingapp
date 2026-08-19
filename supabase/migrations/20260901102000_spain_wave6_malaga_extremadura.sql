-- Spain wave 6: Málaga (Andalucía) + Extremadura REGION & Ribera del Guadiana.
--
-- The two "less sure" multi-subzone DOs, resolved by reading their pliegos:
--   Málaga (102 municipios) — shared Málaga/Sierras de Málaga zone across 7
--     subzones; Málaga city verified as a member (Montes de Málaga subzone).
--   Ribera del Guadiana (122 municipios) — 6 subzones (Tierra de Barros, Ribera
--     Alta/Baja, Montánchez, Cañamero…); Badajoz + Mérida verified members.
-- Full lists captured via multi-cluster density location. extremadura REGION is
-- tree-only; andalucia already exists. Regional DOPs -> APPELLATION tier 2 (6/6),
-- DRAFT; run-spain-dos.mjs promotes each.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select 'extremadura', 'spain.extremadura', 'Extremadura', 'REGION', 1, 4, 4, false, 'VERIFIED', 100, id
  from wine_places where canonical_key = 'spain';

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('malaga', 'spain.andalucia.malaga', 'Málaga', 30, 'spain.andalucia'),
    ('ribera-del-guadiana', 'spain.extremadura.ribera-del-guadiana', 'Ribera del Guadiana', 10, 'spain.extremadura')
  ) as v(slug, ckey, name, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places where canonical_key = 'spain.extremadura' and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'extremadura REGION not created'; end if;
  select count(*) into v_do from wine_places where canonical_key in ('spain.andalucia.malaga','spain.extremadura.ribera-del-guadiana') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 2 then raise exception 'expected 2 new DRAFT DOs, got %', v_do; end if;
end $$;

commit;
