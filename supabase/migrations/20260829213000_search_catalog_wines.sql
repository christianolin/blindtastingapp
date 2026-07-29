-- search_catalog_wines: the catalog-first picker's search. Every whitespace token in
-- the query must appear somewhere in the wine's producer / name / appellation / region /
-- country / vintage text (so "lascombes 2017" and "margaux lascombes" both hit).
-- security invoker — catalog_wines is public-read, so any authenticated user searches
-- the whole shared catalog. Excludes merged (tombstoned) rows.

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
set search_path = public
as $$
  with q as (select btrim(coalesce(p_query, '')) as raw)
  select
    c.id, c.wine_name, pr.name as producer, ap.name as appellation,
    rg.name as region, co.name as country, c.colour, c.style,
    c.vintage_kind, c.vintage_year, c.vintage_tawny_years
  from catalog_wines c
  join producers pr on pr.id = c.producer_id
  join appellations ap on ap.id = c.appellation_id
  join regions rg on rg.id = c.region_id
  join countries co on co.id = c.country_id
  cross join q
  where c.merged_into is null
    and (
      q.raw = ''
      or (
        select bool_and(
          (pr.name || ' ' || c.wine_name || ' ' || ap.name || ' ' || rg.name || ' '
            || co.name || ' ' || coalesce(c.vintage_year::text, '')) ilike '%' || tok || '%'
        )
        from regexp_split_to_table(q.raw, '\s+') as tok
        where tok <> ''
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
