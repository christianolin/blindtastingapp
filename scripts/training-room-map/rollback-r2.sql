-- Undo R2's data (supabase/migrations/<version>_training_room_display_points.sql):
-- spec docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.5.
-- NEVER under supabase/migrations. For completeness only: the R2 rollback is
-- an app revert, or NEXT_PUBLIC_TRAINING_MAP=0 and a redeploy. The two columns
-- are nullable and harmless to the old app, so this runs only if the feature
-- is abandoned, after the R2 app is reverted (a still-deployed R2 app's read
-- fails soft anyway: no curated dots). Run with
-- scripts/training-room-map/run-sql.mjs, --dry first, then for real, only
-- with the owner's go-ahead. Also removes R2's schema_migrations row, by name.

set local lock_timeout = '5s';

alter table public.wine_archetypes
  drop constraint if exists wine_archetypes_display_point_check,
  drop column if exists display_lon,
  drop column if exists display_lat;
delete from supabase_migrations.schema_migrations where name = 'training_room_display_points';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'wine_archetypes'
                and column_name in ('display_lon', 'display_lat')) then
    raise exception 'wine_archetypes still carries a display point column';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'training_room_display_points') then
    raise exception 'R2''s history row is still recorded';
  end if;
end $$;

notify pgrst, 'reload schema';
