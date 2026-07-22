-- Context RPC v2 (Phase 3K): additive keys — grapes, styles, designations,
-- nearby, dual_labels — plus `soils` in the article block. Same function,
-- same invoker security: RLS on the new junctions (PUBLISHED + VERIFIED
-- place) filters content for authenticated callers automatically.
CREATE OR REPLACE FUNCTION public.get_wine_place_context(p_place_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with target as (
    select * from wine_places where canonical_key = p_place_key
  ),
  ancestor_ids as (
    with recursive chain as (
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, 1 as depth
      from wine_places p
      join target t on p.id = t.primary_parent_id
      union all
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, c.depth + 1
      from wine_places p
      join chain c on p.id = c.primary_parent_id
    )
    select * from chain
  ),
  ancestor_chain as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', id, 'key', canonical_key, 'name', name, 'kind', kind)
        order by depth desc
      ),
      '[]'::jsonb
    ) as items
    from ancestor_ids
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
      'soils', a.soils,
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
  ),
  grape_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id, 'name', g.name, 'color', g.color,
          'skin_color', g.skin_color,
          'role', wpg.role, 'permitted', wpg.permitted,
          'share_pct', wpg.share_pct, 'local_note', wpg.local_note
        )
        order by wpg.role, coalesce(wpg.share_pct, 0) desc, g.name
      ),
      '[]'::jsonb
    ) as items
    from wine_place_grapes wpg
    join grapes g on g.id = wpg.grape_id
    join target t on wpg.wine_place_id = t.id
  ),
  style_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('style', s.style, 'note', s.note)
        order by s.sort_order, s.style
      ),
      '[]'::jsonb
    ) as items
    from wine_place_styles s
    join target t on s.wine_place_id = t.id
  ),
  designation_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', d.key, 'name', d.name,
          'appellation_system', d.appellation_system,
          'description', d.description, 'local_note', pd.local_note
        )
        order by d.name
      ),
      '[]'::jsonb
    ) as items
    from wine_place_designations pd
    join wine_designations d on d.id = pd.designation_id
    join target t on pd.wine_place_id = t.id
  )
  ,
  -- Up to 5 verified neighbours within ~10 km (0.1 deg), by boundary
  -- distance. Ancestors excluded via the real chain (reparenting means key
  -- prefixes alone can miss a parent); descendants via key prefix + direct
  -- children (locked keys keep prefixes for the unreparented majority).
  nearby_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', n.id, 'key', n.canonical_key, 'name', n.name, 'kind', n.kind)
        order by n.dist
      ),
      '[]'::jsonb
    ) as items
    from (
      select p2.id, p2.canonical_key, p2.name, p2.kind,
             extensions.ST_Distance(b2.display_geometry, tb.display_geometry) as dist
      from target t
      join wine_place_boundaries tb on tb.wine_place_id = t.id and tb.is_current
      join wine_place_boundaries b2 on b2.is_current and b2.wine_place_id <> t.id
      join wine_places p2 on p2.id = b2.wine_place_id
      where extensions.ST_DWithin(b2.display_geometry, tb.display_geometry, 0.1)
        and p2.id not in (select id from ancestor_ids)
        and p2.primary_parent_id is distinct from t.id
        and p2.canonical_key not like t.canonical_key || '.%'
        and t.canonical_key not like p2.canonical_key || '.%'
      order by dist
      limit 5
    ) n
  ),
  dual_label_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id, 'key', o.canonical_key, 'name', o.name,
          'direction', x.direction, 'note', x.note
        )
        order by o.name
      ),
      '[]'::jsonb
    ) as items
    from (
      select r.target_place_id as other_id, 'MAY_BE_SOLD_AS' as direction, r.note
      from wine_place_relationships r
      join target t on r.source_place_id = t.id
      where r.relationship_type = 'DUAL_LABEL'
      union all
      select r.source_place_id, 'ALSO_SOLD_AS_THIS', r.note
      from wine_place_relationships r
      join target t on r.target_place_id = t.id
      where r.relationship_type = 'DUAL_LABEL'
    ) x
    join wine_places o on o.id = x.other_id
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
      'boundary', (select item from boundary_row),
      'grapes', (select items from grape_list),
      'styles', (select items from style_list),
      'designations', (select items from designation_list),
      'nearby', (select items from nearby_list),
      'dual_labels', (select items from dual_label_list)
    )
  end
$function$;
