-- Lombardy round 1 catalog (DRAFT). New REGION via ISTAT comune-union (no
-- official delimited-zone GIS). Marquee zones: Franciacorta (DOCG), Valtellina
-- Superiore (DOCG) + Sforzato (tree-only, same zone), Oltrepò Pavese (DOC).
--   italy
--   └─ Lombardia (REGION)                    [ISTAT blob]
--      ├─ Franciacorta (DOCG)                [comune-union footprint]
--      ├─ Valtellina Superiore (DOCG)        [comune-union footprint]
--      ├─ Sforzato di Valtellina (DOCG)      (tree-only — same zone)
--      └─ Oltrepò Pavese (DOC)               [comune-union footprint]

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'lombardia', 'italy.lombardia', 'Lombardia', 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', 60, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('franciacorta',           'italy.lombardia.franciacorta',           'Franciacorta',           'DOCG', 'subregional', 10),
    ('valtellina-superiore',   'italy.lombardia.valtellina-superiore',   'Valtellina Superiore',   'DOCG', 'subregional', 20),
    ('sforzato-di-valtellina', 'italy.lombardia.sforzato-di-valtellina', 'Sforzato di Valtellina', 'DOCG', 'subregional', 30),
    ('oltrepo-pavese',         'italy.lombardia.oltrepo-pavese',         'Oltrepò Pavese',         'DOC',  'regional',    40)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.lombardia') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.lombardia%' and publication_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 new DRAFT Lombardy places, got %', n; end if;
end $$;

commit;
