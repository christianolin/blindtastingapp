-- search_catalog_wines missed a wine whose varietal identity is stored as a
-- GRAPE rather than in wine_name: a label scan of "El Enemigo Cabernet Franc"
-- built the query "El Enemigo Cabernet Franc Mendoza", but the pre-existing
-- catalog row had wine_name = null and carried "Cabernet Franc" only as its
-- grape — which this function did not include in its searchable text — so the
-- bool_and (every token must match) dropped it and the scan created a duplicate.
--
-- Fix: fold the wine's linked grape names into the searchable string (a
-- correlated string_agg over catalog_wine_grapes). Strictly additive — it can
-- only surface MORE matches, keeps the precise all-tokens-must-match behaviour,
-- and also lets the catalog picker find wines by grape. Otherwise identical to
-- 20260829262000 (f_search_norm on both sides, null-safety, ordering).
create or replace function search_catalog_wines(p_query text, p_limit int default 20)
returns table (
  id uuid,
  wine_name text,
  producer text,
  appellation text,
  region text,
  country text,
  colour wine_colour,
  style wine_style,
  vintage_kind vintage_kind,
  vintage_year int,
  vintage_tawny_years int
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select btrim(coalesce(p_query, '')) as raw)
  select
    c.id, c.wine_name, pr.name as producer, ap.name as appellation,
    rg.name as region, co.name as country, c.colour, c.style,
    c.vintage_kind, c.vintage_year, c.vintage_tawny_years
  from catalog_wines c
  left join producers pr on pr.id = c.producer_id
  left join appellations ap on ap.id = c.appellation_id
  left join regions rg on rg.id = c.region_id
  left join countries co on co.id = c.country_id
  cross join q
  where c.merged_into is null
    and (
      q.raw = ''
      or (
        select bool_and(
          public.f_search_norm(
            coalesce(pr.name, '') || ' ' || coalesce(c.wine_name, '') || ' '
              || coalesce(ap.name, '') || ' ' || coalesce(rg.name, '') || ' '
              || coalesce(co.name, '') || ' ' || coalesce(c.vintage_year::text, '') || ' '
              || coalesce((
                   select string_agg(g.name, ' ')
                     from catalog_wine_grapes cwg
                     join grapes g on g.id = cwg.grape_id
                    where cwg.catalog_wine_id = c.id
                 ), '')
          ) like '%' || public.f_search_norm(tok) || '%'
        )
        from regexp_split_to_table(q.raw, '\s+') as tok
        where public.f_search_norm(tok) <> ''
      )
    )
  order by pr.name, c.wine_name, c.vintage_year nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function search_catalog_wines(text, int) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'search_catalog_wines') then
    raise exception 'final-state: search_catalog_wines missing';
  end if;
end $$;
