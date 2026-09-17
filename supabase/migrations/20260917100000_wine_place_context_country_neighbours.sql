-- Give the country pages their neighbours: France offers Deutschland, España
-- and Italia; Spain offers Portugal and France; Italy offers France.
--
-- 20260917090000 defined a neighbour as a place no deeper than the target,
-- which fixed the panel timing out but left countries with nothing: the bound
-- was "between 1 and t.display_tier", and for a tier-0 country that range is
-- empty. Italy and Germany had shown no neighbours before that migration
-- either, so nothing regressed -- but France had never once answered inside the
-- timeout, so no one had ever seen what it should show.
--
-- The bound becomes "between least(t.display_tier, 1) and t.display_tier", which
-- is 0..0 for a country and unchanged for everything else.
--
-- COUNTRIES ARE SIMPLIFIED HARDER, on both sides of the comparison. They are the
-- largest geometries on the map -- Spain 9 571 points, Italy 7 531, France
-- 6 961 -- and comparing them to each other is the same work that made this
-- function slow to begin with:
--
--                   0.005 (as before)   0.02 (this migration)
--   france               1 193ms                265ms
--   spain                1 720ms                268ms
--   italy                1 059ms                204ms
--
-- with identical neighbours. The precision buys nothing here: the five outlines
-- abut, so every country-to-country distance is exactly 0 and the ordering among
-- them is arbitrary either way. The coarser tolerance is applied only when the
-- TARGET is tier 0, so no region-level comparison changes; Baden, Bourgogne and
-- Chianti measure the same before and after.

begin;

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
  ),
  -- The target's own geometry, and a simplified copy of it, each computed
  -- ONCE. MATERIALIZED is load-bearing throughout this block: without it the
  -- planner inlines these, sees an indexable ST_DWithin in nearby_list, and
  -- drives the GiST index over every boundary on the map -- which is the plan
  -- that made this function take four seconds for Baden and six for Prosecco.
  target_geom as materialized (
    select b.display_geometry as g
      from target t
      join wine_place_boundaries b on b.wine_place_id = t.id and b.is_current
  ),
  -- 0.005 degrees is about 500 m, immaterial to which regions neighbour which,
  -- and it is what stops a 4 000-point outline being walked once per candidate.
  -- It can reorder neighbours that are within metres of each other; ties at
  -- distance 0 were already in arbitrary order, since touching regions all
  -- measure exactly 0 apart.
  target_simple as materialized (
    select extensions.ST_SimplifyPreserveTopology(
             (select g from target_geom),
             case when (select display_tier from target) = 0 then 0.02 else 0.005 end
           ) as g
  ),
  -- Candidates, narrowed on BOTH axes before a single exact distance is
  -- computed. Neither narrowing is enough alone:
  --   geography only  Baden's padded envelope holds 907 candidates, 809 of them
  --                   individual sites, each costing an exact test against a
  --                   55-part outline.
  --   tier only       bounded candidates but unbounded geography -- Chianti
  --                   would measure itself against every region on earth.
  -- The && runs off the spatial index and is cheap; the tier bound cuts what
  -- survives it to a handful; only that handful is measured exactly.
  --
  -- The tier bound is also what "nearby" should have meant. A neighbour is a
  -- PEER: before this, Bourgogne's neighbours were Beaujolais followed by four
  -- of Beaujolais's own appellations -- one neighbour, listed five times -- and
  -- Baden's included "France".
  -- The && must be schema-qualified. This function runs with search_path set
  -- to public only, so the bare operator does not resolve -- and it has to stay
  -- an OPERATOR rather than become extensions.geometry_overlaps(...), because
  -- an index scan is driven by operators. Written as a function call it would
  -- still be correct and would silently stop using the GiST index, which is the
  -- whole point of this line.
  nearby_candidates as materialized (
    select p2.id, p2.canonical_key, p2.name, p2.kind, b2.display_geometry as g
      from target t,
           wine_places p2
           join wine_place_boundaries b2
             on b2.wine_place_id = p2.id and b2.is_current
     -- least(...) is 0 only for a country, where the old bound was 1..0 --
     -- empty, so a country never had neighbours. Everything else keeps 1..n.
     where p2.display_tier between least(t.display_tier, 1) and t.display_tier
       and p2.id <> t.id
       and p2.id not in (select id from ancestor_ids)
       and p2.primary_parent_id is distinct from t.id
       and p2.canonical_key not like t.canonical_key || '.%'
       and t.canonical_key not like p2.canonical_key || '.%'
       and b2.display_geometry operator(extensions.&&) extensions.ST_Expand((select g from target_geom), 0.1)
  ),
  nearby_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', n.id, 'key', n.canonical_key, 'name', n.name, 'kind', n.kind)
        order by n.dist
      ),
      '[]'::jsonb
    ) as items
    from (
      select nc.id, nc.canonical_key, nc.name, nc.kind,
             extensions.ST_Distance(nc.g, (select g from target_simple)) as dist
        from nearby_candidates nc
       where extensions.ST_DWithin(
               case when (select display_tier from target) = 0
                    then extensions.ST_SimplifyPreserveTopology(nc.g, 0.02)
                    else nc.g end,
               (select g from target_simple), 0.1)
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
  ),
  classified_member_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', m.name, 'tier', m.tier, 'tier_rank', m.tier_rank,
          'system_key', d.key, 'system_name', d.name, 'local_note', m.local_note
        )
        order by d.sort_order, m.tier_rank, m.sort_order
      ),
      '[]'::jsonb
    ) as items
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
    join target t on m.appellation_wine_place_id = t.id
    where m.member_kind = 'ESTATE'
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
      'dual_labels', (select items from dual_label_list),
      'classified_members', (select items from classified_member_list)
    )
  end
$function$;

commit;
