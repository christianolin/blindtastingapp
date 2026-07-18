-- Producer search v3: instant region page + two-group results.
--
-- 1. An empty/blank query with a region now returns that region's first 30
--    producers alphabetically, so the dropdown shows real options the moment
--    it opens instead of "type to search".
-- 2. A typed query no longer HIDES producers linked to a different region --
--    it returns everything that matches, with an `in_region` flag so the UI
--    can group region producers first ("Specific to {region}") and the rest
--    under "Other producers". Previously a wrong region guess could make the
--    right producer unfindable; now it's just ranked lower.
--
-- Signature change (adds a returned column), so drop + recreate.
drop function if exists public.search_producers(text, uuid);

create or replace function public.search_producers(
  p_query text,
  p_region_id uuid default null
)
returns table (id uuid, name text, in_region boolean)
language sql
stable
security definer
set search_path = public, extensions
as $func$
  -- `is not distinct from` (not plain `=`): producers with a NULL region_id
  -- must yield false here, not NULL -- a NULL in_region would sort above
  -- true in the `order by ... desc` and render in the wrong group.
  select p.id, p.name,
    (p_region_id is not null and p.region_id is not distinct from p_region_id) as in_region
  from producers p
  where
    case
      when coalesce(trim(p_query), '') = '' then
        -- Instant first page: only meaningful scoped to a region.
        p_region_id is not null and p.region_id = p_region_id
      else
        public.f_unaccent(p.name) ilike '%' || public.f_unaccent(trim(p_query)) || '%'
    end
  order by in_region desc, p.name
  limit case when coalesce(trim(p_query), '') = '' then 30 else 25 end
$func$;

grant execute on function public.search_producers(text, uuid) to authenticated;
