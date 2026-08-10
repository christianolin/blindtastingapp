-- Italy / Piedmont pilot catalog (DRAFT).
--
-- Seeds the first four Italian wine_places nodes: italy (COUNTRY) ->
-- piemonte (REGION) -> {barolo, barbaresco} (APPELLATION, DOCG, communal).
-- All rows land as DRAFT so canonical_key stays unlocked
-- (lock_verified_wine_place_canonical_key only fires at VERIFIED) and no
-- read-policy exposure occurs (wine_places select policy requires
-- publication_status = 'VERIFIED'). Boundaries and articles are out of
-- scope for this migration; they land in later, separately reviewed steps.
--
-- min_zoom/label_min_zoom follow the existing tier conventions: COUNTRY
-- tier 0 matches france's world_wine_map_seed values (1.5/2); REGION
-- tier 1 matches bourgogne/champagne/bordeaux (4/4); APPELLATION tier 2
-- communal-under-region matches france.bordeaux.fronsac/canon-fronsac (7/7).

begin;

-- italy (COUNTRY, tier 0)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order
) values (
  'italy', 'italy', 'Italia', 'COUNTRY', 0, 1.5, 2,
  false, 'DRAFT', 100
);

-- piemonte (REGION, tier 1)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select 'piemonte', 'italy.piemonte', 'Piemonte', 'REGION', 1, 4, 4,
       false, 'DRAFT', 10, id
  from wine_places where canonical_key = 'italy';

-- barolo + barbaresco (APPELLATION, tier 2, DOCG, communal)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 7, 7,
       true, 'DOCG', 'communal', 'DRAFT', v.so, p.id
  from (values ('barolo', 'italy.piemonte.barolo', 'Barolo', 10),
               ('barbaresco', 'italy.piemonte.barbaresco', 'Barbaresco', 20)
       ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte') p;

-- same-transaction assertion (never trust "version recorded")
do $$ begin
  if (select count(*) from wine_places where canonical_key like 'italy%') <> 4
    then raise exception 'expected 4 italy places'; end if;
end $$;

commit;
