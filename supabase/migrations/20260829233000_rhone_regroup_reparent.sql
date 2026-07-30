-- Rhône proper grouping (step 1 of 3): re-parent the southern peripherals under
-- Rhône méridional and introduce a Diois sub-region for the two Die sparklings,
-- so every appellation sits under a sub-region that (once its boundary is
-- re-derived in the following steps) geographically contains it. Diois lands
-- publication_status DRAFT — it is flipped VERIFIED alongside its derived
-- boundary in the flip migration, so it never counts as a verified place
-- without a current boundary. Only primary_parent_id changes here; canonical
-- keys (locked on verified places) are untouched.

update wine_places set primary_parent_id = (
  select id from wine_places where canonical_key = 'france.rhone.meridional'
)
where primary_parent_id = (select id from wine_places where canonical_key = 'france.rhone')
  and name in ('Luberon', 'Ventoux', 'Grignan-les-Adhémar', 'Côtes du Vivarais');

insert into wine_places (
  primary_parent_id, kind, canonical_key, name, slug,
  display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order
)
select
  (select id from wine_places where canonical_key = 'france.rhone'),
  'SUBREGION', 'france.rhone.diois', 'Diois', 'diois', 2, 6, 6, 'DRAFT', false, 3
where not exists (select 1 from wine_places where canonical_key = 'france.rhone.diois');

update wine_places set primary_parent_id = (
  select id from wine_places where canonical_key = 'france.rhone.diois'
)
where primary_parent_id = (select id from wine_places where canonical_key = 'france.rhone')
  and name in ('Clairette de Die', 'Crémant de Die');

do $$
declare v_region_appellations int; v_meridional_kids int; v_diois_kids int;
begin
  select count(*) into v_region_appellations
  from wine_places ch join wine_places p on p.id = ch.primary_parent_id
  where p.canonical_key = 'france.rhone' and ch.kind = 'APPELLATION';
  if v_region_appellations <> 2 then
    raise exception 'expected 2 appellations left under the region (CdR, CdRV), got %', v_region_appellations;
  end if;

  select count(*) into v_diois_kids
  from wine_places ch join wine_places p on p.id = ch.primary_parent_id
  where p.canonical_key = 'france.rhone.diois';
  if v_diois_kids <> 2 then
    raise exception 'expected 2 appellations under Diois, got %', v_diois_kids;
  end if;
end $$;
