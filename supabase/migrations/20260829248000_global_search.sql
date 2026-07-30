-- Global search: one RPC across wines, places, grapes and producers for the
-- header Cmd/Ctrl-K palette. ILIKE for now (the catalog is small); trigram
-- indexes are a perf follow-up. Uniform (kind, id, label, sublabel, href_key).
create or replace function search_all(p_query text, p_limit int default 8)
returns table (kind text, id uuid, label text, sublabel text, href_key text)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'wine'::text as kind, c.id,
           btrim(concat_ws(' ', pr.name, nullif(btrim(c.wine_name), ''), ap.name,
             case c.vintage_kind when 'YEAR' then c.vintage_year::text
                                 when 'NV' then 'NV' else null end)) as label,
           concat_ws(' · ', rg.name, co.name) as sublabel,
           c.id::text as href_key
    from catalog_wines c
    join producers pr on pr.id = c.producer_id
    join appellations ap on ap.id = c.appellation_id
    join regions rg on rg.id = c.region_id
    join countries co on co.id = c.country_id
    where c.merged_into is null
      and (pr.name ilike '%' || p_query || '%'
           or c.wine_name ilike '%' || p_query || '%'
           or ap.name ilike '%' || p_query || '%')
    limit p_limit
  ) w
  union all
  select * from (
    select 'place'::text, wp.id, wp.name, initcap(wp.kind::text), wp.canonical_key
    from wine_places wp
    where wp.publication_status = 'VERIFIED' and wp.name ilike '%' || p_query || '%'
    order by length(wp.name)
    limit p_limit
  ) p
  union all
  select * from (
    select 'grape'::text, g.id, g.name, null::text, g.name
    from grapes g where g.name ilike '%' || p_query || '%'
    order by length(g.name) limit p_limit
  ) gr
  union all
  select * from (
    select 'producer'::text, pr.id, pr.name, null::text, pr.id::text
    from producers pr where pr.name ilike '%' || p_query || '%'
    order by length(pr.name) limit p_limit
  ) pd;
$$;
grant execute on function search_all(text, int) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'search_all') then
    raise exception 'final-state: search_all missing';
  end if;
end $$;
