-- Tuscany round 3 catalog (DRAFT): only DOCs that DO NOT overlap already-mapped
-- footprints (verified in PostGIS: each <6% area overlap with existing Toscana
-- zones, 0% with one another). Fills empty map area — Lunigiana (NW) and the
-- Pisa/Livorno coast north of Bolgheri. All tier-2 appellations under Toscana.

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('colli-di-luni',        'italy.toscana.colli-di-luni',        'Colli di Luni',        'subregional', 200),
    ('montescudaio',         'italy.toscana.montescudaio',         'Montescudaio',         'subregional', 210),
    ('terratico-di-bibbona', 'italy.toscana.terratico-di-bibbona', 'Terratico di Bibbona', 'communal',    220)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.toscana') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in ('italy.toscana.colli-di-luni','italy.toscana.montescudaio','italy.toscana.terratico-di-bibbona')
     and publication_status = 'DRAFT';
  if n <> 3 then raise exception 'expected 3 new DRAFT round-3 places, got %', n; end if;
end $$;

commit;
