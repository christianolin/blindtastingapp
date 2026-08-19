-- Spain wave 7: Castilla-La Mancha fills out — La Mancha, Valdepeñas, Manchuela.
--
-- From official MAPA pliegos (multi-cluster density-located, per-DO outliers
-- dropped): La Mancha (188 municipios across Ciudad Real/Cuenca/Toledo/Albacete —
-- Spain's largest DO), Valdepeñas (12, Ciudad Real), Manchuela (68, Cuenca +
-- Albacete; the Cuenca/Albacete capitals excluded as they lie outside the DO).
-- castilla-la-mancha REGION already exists. Regional DOPs -> APPELLATION tier 2
-- (6/6), DRAFT; run-spain-dos.mjs promotes each.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('la-mancha', 'spain.castilla-la-mancha.la-mancha', 'La Mancha', 20),
    ('valdepenas', 'spain.castilla-la-mancha.valdepenas', 'Valdepeñas', 30),
    ('manchuela', 'spain.castilla-la-mancha.manchuela', 'Manchuela', 40)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'spain.castilla-la-mancha') p;

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key in ('spain.castilla-la-mancha.la-mancha','spain.castilla-la-mancha.valdepenas','spain.castilla-la-mancha.manchuela') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 3 then raise exception 'expected 3 new DRAFT DOs, got %', v; end if;
end $$;

commit;
