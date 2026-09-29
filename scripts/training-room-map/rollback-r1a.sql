-- Undo R1a (supabase/migrations/<version>_training_archetype_places.sql):
-- spec docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.5.
-- NEVER under supabase/migrations. Revert the R1 app FIRST (if it is not
-- reverted, its read fails soft anyway: every wine reads "Not on the wine map
-- yet"). Run with scripts/training-room-map/run-sql.mjs, --dry first, then
-- for real, only with the owner's go-ahead. Also removes R1a's
-- schema_migrations row, by name.

set local lock_timeout = '5s';

drop function if exists public.training_archetype_places();
delete from supabase_migrations.schema_migrations where name = 'training_archetype_places';

do $$
begin
  if to_regprocedure('public.training_archetype_places()') is not null then
    raise exception 'training_archetype_places still exists';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'training_archetype_places') then
    raise exception 'R1a''s history row is still recorded';
  end if;
end $$;

notify pgrst, 'reload schema';
