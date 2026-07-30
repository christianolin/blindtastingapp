-- Bordeaux Entre-Deux-Mers restructure (step 1 of 2). The "Entre-deux-Mers"
-- place was an APPELLATION acting as a pseudo-subregion: it parented Cadillac,
-- Loupiac, Sainte-Croix-du-Mont, Graves de Vayres, Premières Côtes de Bordeaux
-- and Côtes de Bordeaux-Saint-Macaire — none of which its dry-white AOC boundary
-- geographically contains. Promote it to a SUBREGION (the Chablis model), split
-- the AOC out into a nested child that keeps the official boundary, and relink
-- the catalog appellation to that child. The subregion is left DRAFT and
-- boundary-less until its derived outline is flipped in step 2.

do $$
declare v_place uuid; v_aoc uuid;
begin
  select id into v_place from wine_places where canonical_key = 'france.bordeaux.entre-deux-mers';
  if v_place is null then raise exception 'E2M place missing'; end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug,
    display_tier, min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_place, 'APPELLATION', 'france.bordeaux.entre-deux-mers.entre-deux-mers',
    'Entre-deux-Mers', 'entre-deux-mers', 3, 7, 7, 'VERIFIED',
    true, 'AOC/AOP', 'subregional', 64
  )
  returning id into v_aoc;

  update wine_place_boundaries set wine_place_id = v_aoc where wine_place_id = v_place;
  update appellations set wine_place_id = v_aoc where wine_place_id = v_place;

  update wine_places
     set kind = 'SUBREGION', is_appellation = false,
         appellation_system = null, appellation_level = null,
         publication_status = 'DRAFT'
   where id = v_place;

  if not exists (select 1 from wine_places where id = v_aoc and kind = 'APPELLATION') then
    raise exception 'AOC node not created'; end if;
  if not exists (select 1 from wine_place_boundaries where wine_place_id = v_aoc and is_current and quality_status = 'VALIDATED') then
    raise exception 'AOC boundary not moved'; end if;
  if exists (select 1 from wine_place_boundaries where wine_place_id = v_place and is_current) then
    raise exception 'subregion should have no current boundary yet'; end if;
  if not exists (select 1 from appellations where wine_place_id = v_aoc) then
    raise exception 'appellation not relinked'; end if;
  if exists (select 1 from wine_places where id = v_place and kind <> 'SUBREGION') then
    raise exception 'E2M not promoted to subregion'; end if;
end $$;
