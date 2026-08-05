-- Link the 51 Alsace Grand Cru members to their wine_places, so the library
-- table can offer the same "on the map" buttons as the Bordeaux classifications.
--
-- In Alsace the grand cru IS its own appellation (unlike the Médoc, where a
-- château sits inside a commune's appellation), so each member points at the
-- place of the same name under france.alsace. Matching is on a slugified name:
-- every one of the 51 resolves, verified before writing this migration.
update wine_designation_members m
set appellation_wine_place_id = p.id
from wine_designations d, wine_places p
where m.designation_id = d.id
  and d.key = 'alsace-grand-cru'
  and m.appellation_wine_place_id is null
  and p.kind = 'APPELLATION'
  and p.canonical_key = 'france.alsace.' || regexp_replace(
        lower(translate(m.name,
          'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
          'aaaaaaceeeeiiiinooooouuuuyyoa')),
        '[^a-z0-9]+', '-', 'g');
