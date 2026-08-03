-- Surface classification designations in the global (top-bar) search: the
-- classification systems (wine_designations) and the glossary terms
-- (type_designations). Both resolve to the single tabbed Designations page; the
-- exact tab is mapped client-side (the tab taxonomy lives in
-- src/lib/designations/tabs.ts), so href_key carries the system key or the term
-- name and kind is 'designation'. The wine/place/grape branches are unchanged.
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
    select 'designation'::text, wd.id, wd.name,
           coalesce(wd.display_group, 'Classification')::text, wd.key
    from wine_designations wd
    where wd.name ilike '%' || p_query || '%'
    order by length(wd.name) limit p_limit
  ) ds
  union all
  select * from (
    select 'designation'::text, td.id, td.name, td.category::text, td.name
    from type_designations td
    where td.is_active and td.name ilike '%' || p_query || '%'
    order by length(td.name) limit p_limit
  ) dt;
$$;
