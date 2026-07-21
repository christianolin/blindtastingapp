-- One bounded context fetch for the tile map UI: the selected place, its
-- ancestor chain, immediate children, article, and current boundary
-- envelope — replacing the old full-tree select. security invoker: RLS on
-- wine_places / wine_place_articles / wine_place_boundaries already limits
-- authenticated readers to VERIFIED places, PLACEHOLDER|PUBLISHED articles,
-- and current VALIDATED boundaries, so this function adds no new exposure.
create or replace function get_wine_place_context(p_place_key text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select * from wine_places where canonical_key = p_place_key
  ),
  ancestor_chain as (
    with recursive chain as (
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, 1 as depth
      from wine_places p
      join target t on p.id = t.primary_parent_id
      union all
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, c.depth + 1
      from wine_places p
      join chain c on p.id = c.primary_parent_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', id, 'key', canonical_key, 'name', name, 'kind', kind)
        order by depth desc
      ),
      '[]'::jsonb
    ) as items
    from chain
  ),
  child_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'key', c.canonical_key, 'name', c.name, 'kind', c.kind,
          'min_zoom', c.min_zoom
        )
        order by c.sort_order, c.name
      ),
      '[]'::jsonb
    ) as items
    from wine_places c
    join target t on c.primary_parent_id = t.id
  ),
  article_row as (
    select jsonb_build_object(
      'description', a.description,
      'climate', a.climate,
      'grape_varieties', a.grape_varieties,
      'wine_styles', a.wine_styles,
      'key_facts', to_jsonb(coalesce(a.key_facts, array[]::text[])),
      'editorial_status', a.editorial_status
    ) as item
    from wine_place_articles a
    join target t on a.wine_place_id = t.id
  ),
  boundary_row as (
    select jsonb_build_object(
      'bbox', to_jsonb(b.bbox),
      'label_lon', extensions.ST_X(b.label_point),
      'label_lat', extensions.ST_Y(b.label_point)
    ) as item
    from wine_place_boundaries b
    join target t on b.wine_place_id = t.id
    where b.is_current
  )
  select case
    when not exists (select 1 from target) then null
    else jsonb_build_object(
      'place', (
        select jsonb_build_object(
          'id', t.id, 'key', t.canonical_key, 'name', t.name, 'kind', t.kind,
          'tier', t.display_tier, 'min_zoom', t.min_zoom,
          'label_min_zoom', t.label_min_zoom
        )
        from target t
      ),
      'ancestors', (select items from ancestor_chain),
      'children', (select items from child_list),
      'article', (select item from article_row),
      'boundary', (select item from boundary_row)
    )
  end
$$;

revoke execute on function get_wine_place_context(text) from public, anon;
grant execute on function get_wine_place_context(text) to authenticated;
