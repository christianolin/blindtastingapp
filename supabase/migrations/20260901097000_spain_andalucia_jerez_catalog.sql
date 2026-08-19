-- Spain wave 2 (cont.): Andalucía REGION node + Jerez-Xérès-Sherry DO.
--
-- Sourced from the official pliego DOP «Jerez-Xérès-Sherry», §D.1 "Zona
-- Delimitada": 10 términos municipales of the Marco de Jerez — 9 in Cádiz
-- (Jerez de la Frontera, El Puerto de Santa María, Sanlúcar de Barrameda,
-- Trebujena, Chipiona, Rota, Puerto Real, Chiclana de la Frontera, San José del
-- Valle) + Lebrija (Sevilla). Trans-provincial within Andalucía. Regional DOP ->
-- APPELLATION tier 2 (6/6). andalucia REGION is tree-only. DRAFT; run-spain-dos
-- promotes it from the pliego municipality union. spain already exists.

begin;

-- andalucia (REGION, tier 1, tree-only)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'andalucia', 'spain.andalucia', 'Andalucía', 'REGION', 1, 4, 4,
       false, 'VERIFIED', 50, id
  from wine_places where canonical_key = 'spain';

-- jerez (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select 'jerez', 'spain.andalucia.jerez', 'Jerez-Xérès-Sherry', 'APPELLATION', 2, 6, 6,
       true, 'DOP', 'regional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'spain.andalucia';

do $$
declare v_reg int; v_do int;
begin
  select count(*) into v_reg from wine_places
   where canonical_key = 'spain.andalucia' and kind = 'REGION'
     and display_tier = 1 and publication_status = 'VERIFIED';
  if v_reg <> 1 then raise exception 'andalucia REGION not created'; end if;

  select count(*) into v_do from wine_places
   where canonical_key = 'spain.andalucia.jerez' and kind = 'APPELLATION'
     and display_tier = 2 and is_appellation and appellation_system = 'DOP'
     and publication_status = 'DRAFT';
  if v_do <> 1 then raise exception 'jerez APPELLATION not created DRAFT'; end if;
end $$;

commit;
