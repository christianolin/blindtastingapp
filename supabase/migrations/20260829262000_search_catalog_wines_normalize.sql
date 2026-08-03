-- search_catalog_wines matched with plain ilike, so accents and hyphens broke it:
-- a scan of "Château La Fleur-Pétrus" (accents) found nothing against the catalog's
-- "Chateau La Fleur-Petrus". Normalise BOTH the concatenated searchable string and
-- each whitespace-split query token via f_search_norm (accents folded via
-- f_unaccent, then spaces/hyphens/apostrophes stripped) before the tokenised
-- bool_and match. Same null-safety + ordering as 20260829254000; only the match
-- expression changes.
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
              || coalesce(co.name, '') || ' ' || coalesce(c.vintage_year::text, '')
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
