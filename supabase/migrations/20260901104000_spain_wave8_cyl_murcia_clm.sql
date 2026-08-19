-- Spain wave 8: Castilla y León (Ribera del Duero, Tierra de León, Cebreros) +
-- Murcia (Bullas, Yecla) + Castilla-La Mancha (Ribera del Júcar).
--
-- From official MAPA pliegos (density-located; province capitals excluded as
-- non-members): Ribera del Duero (83), Tierra de León (85), Cebreros (35),
-- Bullas (11), Yecla (1 — the single municipality), Ribera del Júcar (7). All
-- parent REGIONs already exist. Regional DOPs -> APPELLATION tier 2 (6/6), DRAFT.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('ribera-del-duero', 'spain.castilla-y-leon.ribera-del-duero', 'Ribera del Duero', 5, 'spain.castilla-y-leon'),
    ('tierra-de-leon', 'spain.castilla-y-leon.tierra-de-leon', 'Tierra de León', 50, 'spain.castilla-y-leon'),
    ('cebreros', 'spain.castilla-y-leon.cebreros', 'Cebreros', 60, 'spain.castilla-y-leon'),
    ('bullas', 'spain.murcia.bullas', 'Bullas', 20, 'spain.murcia'),
    ('yecla', 'spain.murcia.yecla', 'Yecla', 30, 'spain.murcia'),
    ('ribera-del-jucar', 'spain.castilla-la-mancha.ribera-del-jucar', 'Ribera del Júcar', 50, 'spain.castilla-la-mancha')
  ) as v(slug, ckey, name, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key in ('spain.castilla-y-leon.ribera-del-duero','spain.castilla-y-leon.tierra-de-leon','spain.castilla-y-leon.cebreros','spain.murcia.bullas','spain.murcia.yecla','spain.castilla-la-mancha.ribera-del-jucar') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 6 then raise exception 'expected 6 new DRAFT DOs, got %', v; end if;
end $$;

commit;
