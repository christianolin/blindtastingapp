-- Phase 3C Task 5c: the searchable hierarchy sidebar needs the whole verified
-- place tree in one call. Security invoker: RLS already restricts to VERIFIED
-- places for the authenticated role; the WHERE makes it explicit either way.
create or replace function get_wine_place_tree()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'key', p.canonical_key,
        'name', p.name,
        'kind', p.kind,
        'tier', p.display_tier,
        'parent_key', parent.canonical_key,
        'has_children', exists (
          select 1 from wine_places c
           where c.primary_parent_id = p.id and c.publication_status = 'VERIFIED'
        )
      )
      order by p.canonical_key
    ),
    '[]'::jsonb
  )
  from wine_places p
  left join wine_places parent on parent.id = p.primary_parent_id
  where p.publication_status = 'VERIFIED';
$$;

revoke execute on function get_wine_place_tree() from public;
revoke execute on function get_wine_place_tree() from anon;
grant execute on function get_wine_place_tree() to authenticated;
