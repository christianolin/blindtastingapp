-- get_app_stats(): app-wide headline counts for the overview hero.
-- SECURITY DEFINER so totals are accurate regardless of the caller's RLS
-- visibility (tastings + wset_notes are row-restricted; a plain COUNT via the
-- user client would undercount). Read-only; returns exactly one row.
create or replace function public.get_app_stats()
returns table (
  members bigint,
  tastings bigint,
  wines_catalogued bigint,
  notes_created bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from profiles)                                    as members,
    (select count(*) from tastings)                                    as tastings,
    (select count(*) from catalog_wines where blind_pending = false)   as wines_catalogued,
    (select count(*) from wset_notes)                                  as notes_created;
$$;

revoke all on function public.get_app_stats() from public, anon;
grant execute on function public.get_app_stats() to authenticated;
