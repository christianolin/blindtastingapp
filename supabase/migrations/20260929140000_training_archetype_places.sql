-- Training room on the wine map, phase R1a (spec
-- docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.1, RM3, RM4).
-- One read for the room: every typical wine's home map place, the REGION it
-- sits in (the nearest place in its chain, itself included, whose kind is
-- REGION), and the nearest place in that chain with a current VALIDATED
-- boundary, with that boundary's label point as lon/lat.
--
-- SECURITY INVOKER: wine_places' "wine places verified read" and the
-- boundaries' "wine place boundaries validated read" apply as everywhere else.
-- EXECUTE for authenticated only (PUBLIC, anon and service_role revoked, the
-- house rule for a new function). It writes no table: no wine_places or
-- wine_place_boundaries write, so no neighbour-cache refresh (CLAUDE.md).
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '5s';

create or replace function public.training_archetype_places()
returns table (
  archetype_id uuid,
  place_key text,
  region_key text,
  region_name text,
  point_key text,
  point_lon double precision,
  point_lat double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with recursive chain as (
    select a.id as archetype_id, p.id as place_id, p.canonical_key, p.name, p.kind,
           p.primary_parent_id, 0 as depth
      from public.wine_archetypes a
      join public.wine_places p on p.id = a.wine_place_id
    union all
    select c.archetype_id, p.id, p.canonical_key, p.name, p.kind, p.primary_parent_id, c.depth + 1
      from chain c
      join public.wine_places p on p.id = c.primary_parent_id
     where c.depth < 8
  ),
  with_point as (
    select c.*, b.label_point
      from chain c
      left join public.wine_place_boundaries b
        on b.wine_place_id = c.place_id and b.is_current and b.quality_status = 'VALIDATED'
  )
  select a.id,
         home.canonical_key,
         reg.canonical_key,
         reg.name,
         pt.canonical_key,
         ST_X(pt.label_point)::double precision,
         ST_Y(pt.label_point)::double precision
    from public.wine_archetypes a
    left join with_point home on home.archetype_id = a.id and home.depth = 0
    left join lateral (
      select w.canonical_key, w.name from with_point w
       where w.archetype_id = a.id and w.kind = 'REGION'
       order by w.depth limit 1
    ) reg on true
    left join lateral (
      select w.canonical_key, w.label_point from with_point w
       where w.archetype_id = a.id and w.label_point is not null
       order by w.depth limit 1
    ) pt on true
$$;

comment on function public.training_archetype_places() is
  'Training room (2026-09-29 spec RM3): per typical wine, its home map place, its REGION ancestor (self included) and the nearest current VALIDATED label point. SECURITY INVOKER, authenticated only.';

revoke all on function public.training_archetype_places() from public, anon, service_role;
grant execute on function public.training_archetype_places() to authenticated;

-- Same-transaction asserts (fail closed).
do $$
declare
  v_total int;
  v_placed int;
  v_rows int;
  v_key int;
  v_region int;
  v_point int;
  v_ancestor int;
  v_claims text := current_setting('request.jwt.claims', true);
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'training_archetype_places'
       and p.pronargs = 0 and not p.prosecdef and p.provolatile = 's'
  ) then
    raise exception 'training_archetype_places is missing, SECURITY DEFINER or not STABLE';
  end if;
  if not has_function_privilege('authenticated', 'public.training_archetype_places()', 'EXECUTE')
     or has_function_privilege('anon', 'public.training_archetype_places()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.training_archetype_places()', 'EXECUTE') then
    raise exception 'training_archetype_places: EXECUTE must be authenticated only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) x
     where n.nspname = 'public' and p.proname = 'training_archetype_places'
       and x.grantee = 0 and x.privilege_type = 'EXECUTE'
  ) then
    raise exception 'training_archetype_places: PUBLIC still holds EXECUTE';
  end if;

  select count(*), count(wine_place_id) into v_total, v_placed from public.wine_archetypes;

  -- As a signed-in reader (the room's caller), not as the owner. The fake
  -- claims are put back right after: `reset role` does not reset them, and
  -- left behind they would make auth.uid() the zero UUID for every later
  -- statement in the applier's transaction (an audit trigger would stamp it).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(place_key), count(region_key), count(point_lon),
         count(*) filter (where point_key is not null and point_key <> place_key)
    into v_rows, v_key, v_region, v_point, v_ancestor
    from public.training_archetype_places();
  reset role;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if auth.uid() is distinct from v_uid then
    raise exception 'training_archetype_places: auth.uid() is % after the check, was %', auth.uid(), v_uid;
  end if;

  if v_rows <> v_total then
    raise exception 'training_archetype_places: % rows as authenticated, % archetypes', v_rows, v_total;
  end if;
  if v_key <> v_placed or v_region <> v_placed or v_point <> v_placed then
    raise exception 'training_archetype_places: placed %, with key %, with region %, with point %',
      v_placed, v_key, v_region, v_point;
  end if;
  if v_ancestor <> 1 then
    raise exception 'training_archetype_places: % ancestor points, expected exactly 1 (italy.abruzzo)', v_ancestor;
  end if;
  raise notice 'training_archetype_places: % rows, % placed, % ancestor point', v_rows, v_placed, v_ancestor;
end $$;

notify pgrst, 'reload schema';
