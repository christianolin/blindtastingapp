-- Per-wine cellar holdings for the catalog list — total bottles + distinct
-- holders across everyone's cellars. cellar_lots is owner-only RLS, so this
-- bulk count must be SECURITY DEFINER.
create or replace function catalog_wine_holdings(p_ids uuid[])
returns table (catalog_wine_id uuid, holders int, bottles int)
language sql
security definer
set search_path = public
stable
as $$
  select catalog_wine_id,
         count(distinct owner_id)::int as holders,
         coalesce(sum(quantity), 0)::int as bottles
  from cellar_lots
  where catalog_wine_id = any(p_ids) and quantity > 0
  group by catalog_wine_id;
$$;

grant execute on function catalog_wine_holdings(uuid[]) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'catalog_wine_holdings') then
    raise exception 'final-state: catalog_wine_holdings missing';
  end if;
end $$;
