-- Per-wine blind/semi-blind appearance counts for the catalog list. wine_answers
-- is RLS-restricted, so this bulk count is SECURITY DEFINER; it counts distinct
-- REVEALED tastings only (an unrevealed pour never leaks a wine into the list).
create or replace function catalog_wine_appearances(p_ids uuid[])
returns table (catalog_wine_id uuid, appearances int)
language sql
security definer
set search_path = public
stable
as $$
  select a.catalog_wine_id, count(distinct w.tasting_id)::int
  from wine_answers a
  join wines w on w.id = a.wine_id
  where a.catalog_wine_id = any(p_ids)
    and w.is_revealed
  group by a.catalog_wine_id;
$$;

grant execute on function catalog_wine_appearances(uuid[]) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'catalog_wine_appearances') then
    raise exception 'final-state: catalog_wine_appearances missing';
  end if;
end $$;
