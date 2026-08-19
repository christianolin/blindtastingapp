-- Friuli round 1 catalog (DRAFT). New REGION via ISTAT comune-union. The two
-- famous white-wine hill zones: Collio and Friuli Colli Orientali (with the
-- nested DOCGs Ramandolo and Rosazzo, tree-only). Plain DOCs (Grave, Isonzo,
-- Friuli) deferred to a later round.
--   italy
--   └─ Friuli-Venezia Giulia (REGION)             [ISTAT blob]
--      ├─ Collio (DOC)                            [comune-union footprint]
--      └─ Friuli Colli Orientali (SUBREGION, DOC) [comune-union footprint]
--         ├─ Ramandolo (DOCG)                     (tree-only)
--         └─ Rosazzo (DOCG)                       (tree-only)

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'friuli', 'italy.friuli', 'Friuli-Venezia Giulia', 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', 70, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'collio', 'italy.friuli.collio', 'Collio', 'APPELLATION'::wine_place_kind, 2, 6, 6, true, 'DOC', 'subregional', 'DRAFT', 10, p.id
  from (select id from wine_places where canonical_key = 'italy.friuli') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'friuli-colli-orientali', 'italy.friuli.friuli-colli-orientali', 'Friuli Colli Orientali', 'SUBREGION'::wine_place_kind, 2, 5, 5, true, 'DOC', 'subregional', 'DRAFT', 20, p.id
  from (select id from wine_places where canonical_key = 'italy.friuli') p;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOCG', 'communal', 'DRAFT', v.so, p.id
  from (values
    ('ramandolo', 'italy.friuli.ramandolo', 'Ramandolo', 10),
    ('rosazzo',   'italy.friuli.rosazzo',   'Rosazzo',   20)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy.friuli.friuli-colli-orientali') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.friuli%' and publication_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 new DRAFT Friuli places, got %', n; end if;
end $$;

commit;
