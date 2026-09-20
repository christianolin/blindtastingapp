-- wine_place_neighbours: the map's details panel stops measuring polygons on
-- every click.
--
-- Diagnosis: docs/superpowers/specs/2026-09-20-wine-place-nearby.md (§4 is the
-- recommendation this file implements; §5 is how equivalence is proven; §6 is
-- the sketch this file follows).
--
-- THE PROBLEM, measured live 2026-09-20. get_wine_place_context's nearby_list
-- CTE is 92-99.5% of everything the function costs: replace it with '[]' and
-- every key in the catalogue answers in 1.3-2.2 ms. It is slow because it runs
-- exact PostGIS distance over each candidate's FULL outline on every request,
-- for data that only changes when a migration publishes places. Server-side,
-- over all 3,257 places that have a current boundary:
--
--                     median    p90     p99    worst   total
--   before              33.0    86.4   255.5    558.5   147.9 s
--   after (cache hit)    0.7     0.8     1.5      ~2      2.4 s
--
--   france  242 -> ~1 ms      spain   245 -> ~2 ms      italy 169 -> ~2 ms
--   germany.mosel.bernkastel.sankt-michael.leiwen-klostergarten 558 -> <2 ms
--
-- The GiST index on wine_place_boundaries.display_geometry is NOT the problem
-- and no index on it is created here: the boundaries-first plan that index
-- would drive was measured at 3-10x SLOWER than the plan running today
-- (france 260.7 -> 2542.5 ms round-trip), because it must materialise
-- megabytes of detoasted multipolygon before the tier filter can discard it.
--
-- THREE CLAUSES.
--
-- R1  order by n.dist / dist gains ", canonical_key". Touching places are all
--     at ST_Distance exactly 0, so today's ORDER BY has genuine ties and the
--     order among them is whatever the executor's sort happened to receive.
--     Measured: the live function returns a DIFFERENT nearby order for 1,619
--     of 3,257 keys depending on whether it is called as postgres or as
--     authenticated (1,286 reorder, 333 a different five). This clause makes
--     the list a function of the data alone -- which is what lets a stored
--     list be proven equal to a computed one. It is the ONE user-visible
--     change here: 1,619 places show their nearby chips in a different order
--     on the day this ships, and 280 of those show a different five. Every
--     entry that moves is at distance 0 from the selected place, and nothing
--     outside the "nearby" array changes for any key (proven: outside_nearby
--     = 0 over the whole catalogue).
--
-- R2  ST_Intersects short-circuits the distance. ST_Distance returns exactly
--     0 when two geometries intersect, and ST_Intersects reaches that answer
--     ~130x faster on a large pair (spain vs france: 1.00 ms against
--     130.83 ms). Both rewrites are identities. Proven byte-identical over
--     all 3,257 keys with a boundary: 0 differ.
--
-- R3  the list is precomputed into wine_place_neighbours (place ids and an
--     ordinal, nothing geometric, nothing per-user), with a one-row freshness
--     flag, statement-level triggers that clear it on any write to
--     wine_places or wine_place_boundaries, and a refresh function that
--     rebuilds it from the function's own live branch. On a hit the geometry
--     CTEs are gated off entirely (a One-Time Filter), so the RPC costs what
--     its other eleven CTEs cost and nothing more. Correctness never depends
--     on anyone remembering to refresh: a stale flag falls back to the live
--     computation, so forgetting is slow, never wrong.
--
-- OPERATIONAL RULE THIS ADDS. Anything that inserts, updates or deletes
-- wine_places or wine_place_boundaries leaves the cache stale, and stale means
-- the map pays the old cost again (france 65 ms instead of 1 ms; the worst
-- key, germany...leiwen-klostergarten, 454 ms instead of 1 ms). Repair it with
--   select public.refresh_wine_place_neighbours();
-- It returns the row count it wrote, or -1 if it refused to publish (see the
-- function) -- treat a negative return as an error the way the DO block below
-- does. Until a write is followed by a refresh the map computes the list live:
-- slow, but correct. Who calls it, and when:
--
--   A MIGRATION that writes either table ends with the select above IN THE
--   SAME TRANSACTION as its write. That is the strong form, and a migration
--   can always honour it.
--
--   THE PIPELINE SCRIPTS under scripts/wine-map-sources/ are catalogue writers
--   too -- 28 of them commit against live outside any migration
--   (build-germany-einzellagen/anbaugebiete/bereiche/grosslagen, the three
--   build-*-country-outline, build-spain-comunidad-boundaries, build-boundary,
--   derive-boundary, fetch-alsace/champagne/vacqueyras-communes, run-spain-dos,
--   the stage-*-official and stage-wave* family, trim-sibling-overlaps) -- and
--   they CANNOT honour the same-transaction form: build-germany-einzellagen.mjs
--   commits once per place, and a 65 s refresh inside each of 3,216
--   transactions is not a thing to ask for. Their rule is one refresh as the
--   LAST step of a BATCH, in its own transaction:
--     node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs
--   which is the select above plus a check of its return. Between the batch's
--   first write and that call the map is slow and correct: that window is
--   accepted, not overlooked. scripts/wine-map-sources/run-targets.mjs (the one
--   batch orchestrator) already ends with it, every committing script prints a
--   banner naming the command once it has made the cache stale, and the trigger
--   below raises a NOTICE on the same transition.
--
-- NOTHING HERE DEPENDS ON SOMEONE REMEMBERING, SILENTLY.
-- scripts/wine-place-context.test.mjs asserts the cache is fresh, so a
-- forgotten refresh fails the repo's own database contract test rather than
-- merely costing a quarter-second a click; wine_place_neighbours_state.built_at
-- says when the list was last rebuilt.
--
-- The "same transaction" half is what makes the migration form the strong one.
-- The trigger clears fresh when the write happens and the refresh sets it back
-- when it finishes; a catalogue write landing between those two points in a
-- DIFFERENT transaction would leave the flag true over a list that no longer
-- matches. The refresh holds the one state row for its whole duration, so a
-- concurrent catalogue write blocks on it rather than interleaving -- but a
-- write that COMMITTED after the refresh's snapshot was taken is exactly the
-- case the batch form has to avoid: run the refresh once the batch has
-- finished writing, not while it still is.
--
-- WHAT THIS MIGRATION LOCKS, AND THE RETRY TO EXPECT. Readers are never
-- blocked (a SELECT takes ACCESS SHARE, which conflicts with nothing here) and
-- no app write path touches either table -- but the two FOREIGN KEY
-- declarations on wine_places and the four CREATE TRIGGERs take SHARE ROW
-- EXCLUSIVE on BOTH wine_places and wine_place_boundaries and hold it for the
-- whole ~135 s transaction, so the pipeline scripts above would block behind
-- it. Measured, not assumed (fix-locks.mjs reads pg_locks mid-apply):
--   wine_places            ShareRowExclusiveLock granted=true
--   wine_place_boundaries  ShareRowExclusiveLock granted=true
-- With lock_timeout = '10s' a competing lock aborts the whole apply --
-- autovacuum or autoanalyze on the 26 MB wine_place_boundaries table takes
-- SHARE UPDATE EXCLUSIVE, which conflicts -- and a dry run of this file hit
-- exactly that: "canceling statement due to lock timeout" at 10.5 s, with the
-- immediate retry running clean. That message is the intended fail-closed
-- outcome, not a sign the migration is wrong: the transaction is atomic, so
-- the fix is to run it again. Expect a possible retry.
--
-- RLS AND GRANTS DO NOT MOVE. get_wine_place_context stays LANGUAGE sql,
-- STABLE, SECURITY INVOKER, search_path=public, EXECUTE for authenticated and
-- service_role and nothing for anon or PUBLIC -- asserted before and after.
-- The cached list is rendered by joining wine_places, so the same row policy
-- that decides which neighbours the live branch may see decides it here too;
-- the table itself carries the same two-sided VERIFIED check
-- wine_place_relationships uses, and no client role may write it. Rule 1 is
-- not in play: nothing on this path touches a wine, a glass or a tasting.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_n    bigint;
begin
  -- 1. The migration that installed the body replaced here is applied.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260917100000') then
    raise exception '20260917100000 (wine_place_context country neighbours) is not applied; apply it first';
  end if;

  -- 2. get_wine_place_context is byte-for-byte the definition measured in
  --    docs/superpowers/specs/2026-09-20-wine-place-nearby.md. If this has
  --    moved, the function changed and every measurement needs re-taking.
  select md5(replace(pg_get_functiondef('public.get_wine_place_context(text)'::regprocedure), chr(13), ''))
    into v_text;
  if v_text <> '8079a6f1d560a0cb93fdb5364786a39e' then
    raise exception 'get_wine_place_context is not the definition this migration replaces (md5 %)', v_text;
  end if;

  -- 3. ...and it is SECURITY INVOKER with search_path=public, which this file
  --    keeps. A SECURITY DEFINER copy would read the catalogue as the owner.
  if exists (select 1 from pg_proc p
              where p.oid = 'public.get_wine_place_context(text)'::regprocedure
                and (p.prosecdef or p.proconfig is distinct from array['search_path=public'])) then
    raise exception 'get_wine_place_context is not SECURITY INVOKER with search_path=public';
  end if;

  -- 4. The ACL this file re-asserts afterwards.
  if not has_function_privilege('authenticated', 'public.get_wine_place_context(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_wine_place_context(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_wine_place_context(text)', 'EXECUTE')
     or has_function_privilege('public', 'public.get_wine_place_context(text)', 'EXECUTE') then
    raise exception 'get_wine_place_context ACL is not {authenticated, service_role} (%)',
      (select p.proacl::text from pg_proc p where p.oid = 'public.get_wine_place_context(text)'::regprocedure);
  end if;

  -- 5. Nothing this migration creates exists yet.
  select string_agg(c.relname, ', ' order by c.relname) into v_text
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('wine_place_neighbours', 'wine_place_neighbours_state');
  if v_text is not null then
    raise exception 'a table this migration creates already exists: %', v_text;
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('refresh_wine_place_neighbours', 'wine_place_neighbours_mark_stale');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname) into v_text
  from pg_trigger t
  where t.tgname in ('wine_places_stale_neighbours', 'wine_places_truncate_stale_neighbours',
                     'wine_place_boundaries_stale_neighbours', 'wine_place_boundaries_truncate_stale_neighbours');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 6. The catalogue the cache is built from is the one whose policies the
  --    reader applies. The fill below runs as the owner, so if a place were
  --    not VERIFIED (or a current boundary not VALIDATED) the stored list
  --    could hold a row a reader cannot see. refresh_wine_place_neighbours
  --    checks that itself and leaves the cache stale rather than wrong; this
  --    assertion is only so the post-state's "fresh" expectation is honest.
  select count(*) into v_n from wine_places where publication_status <> 'VERIFIED';
  if v_n > 0 then
    raise exception '% wine_places rows are not VERIFIED; the cache would be left stale', v_n;
  end if;
  select count(*) into v_n from wine_place_boundaries where is_current and quality_status <> 'VALIDATED';
  if v_n > 0 then
    raise exception '% current boundaries are not VALIDATED; the cache would be left stale', v_n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The stored list. Place ids and an ordinal, nothing geometric, nothing
-- per-user -- the names and keys are still read through wine_places at
-- request time, so per-row RLS decides what a caller sees exactly as it does
-- on the live branch. (A nearby_cache jsonb column on wine_places would have
-- been one fewer join and would have carried the neighbours' names straight
-- past that policy; see the spec's "Why not the alternatives".)
-- ---------------------------------------------------------------------------
create table public.wine_place_neighbours (
  wine_place_id      uuid     not null references public.wine_places(id) on delete cascade,
  position           smallint not null,
  neighbour_place_id uuid     not null references public.wine_places(id) on delete cascade,
  primary key (wine_place_id, position),
  constraint wine_place_neighbours_position_check check (position between 1 and 5),
  constraint wine_place_neighbours_not_self check (neighbour_place_id <> wine_place_id)
);
create index wine_place_neighbours_neighbour_idx
  on public.wine_place_neighbours (neighbour_place_id);

alter table public.wine_place_neighbours enable row level security;

-- The same two-sided VERIFIED check wine_place_relationships uses.
create policy "wine place neighbours verified read"
  on public.wine_place_neighbours for select to authenticated
  using (
    exists (select 1 from public.wine_places p
             where p.id = wine_place_neighbours.wine_place_id
               and p.publication_status = 'VERIFIED')
    and exists (select 1 from public.wine_places p
                 where p.id = wine_place_neighbours.neighbour_place_id
                   and p.publication_status = 'VERIFIED')
  );

revoke all on public.wine_place_neighbours from anon, authenticated;
grant select on public.wine_place_neighbours to authenticated;

-- ---------------------------------------------------------------------------
-- One row, one boolean: is the stored list current with the catalogue? It is
-- a separate table on purpose -- the staleness trigger must not write the
-- table it watches.
-- ---------------------------------------------------------------------------
create table public.wine_place_neighbours_state (
  only_row boolean primary key default true,
  fresh    boolean not null default false,
  built_at timestamptz,
  constraint wine_place_neighbours_state_one_row check (only_row)
);
insert into public.wine_place_neighbours_state (only_row, fresh) values (true, false);

alter table public.wine_place_neighbours_state enable row level security;
create policy "wine place neighbours state read"
  on public.wine_place_neighbours_state for select to authenticated using (true);

revoke all on public.wine_place_neighbours_state from anon, authenticated;
grant select on public.wine_place_neighbours_state to authenticated;

-- ---------------------------------------------------------------------------
-- Any write to the catalogue invalidates the WHOLE cache. Statement-level, so
-- a 3,000-row data migration pays it once. Correct rather than clever: adding
-- one place changes OTHER places' neighbour lists, so a partial invalidation
-- would be wrong. TRUNCATE gets its own trigger because a TRUNCATE event may
-- not share a trigger with row-level events.
-- ---------------------------------------------------------------------------
create or replace function public.wine_place_neighbours_mark_stale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.wine_place_neighbours_state set fresh = false where only_row and fresh;
  -- Once per fresh -> stale transition, never once per statement: a batch that
  -- commits 3,216 times says this on its first write and then stays quiet.
  if found then
    raise notice 'the wine_place_neighbours cache is now stale; the map computes nearby lists live (slow, correct) until someone runs: select public.refresh_wine_place_neighbours();';
  end if;
  return null;
end
$fn$;
-- service_role is named explicitly: Supabase's default privileges grant EXECUTE
-- on a new public function to {anon, authenticated, service_role}, so leaving
-- it out would silently keep the grant (the same trap 20260914104500's
-- transfer_tasting_host documents). Post-state check 5 asserts all four.
revoke execute on function public.wine_place_neighbours_mark_stale() from public, anon, authenticated, service_role;

create trigger wine_places_stale_neighbours
  after insert or update or delete on public.wine_places
  for each statement execute function public.wine_place_neighbours_mark_stale();
create trigger wine_places_truncate_stale_neighbours
  after truncate on public.wine_places
  for each statement execute function public.wine_place_neighbours_mark_stale();
create trigger wine_place_boundaries_stale_neighbours
  after insert or update or delete on public.wine_place_boundaries
  for each statement execute function public.wine_place_neighbours_mark_stale();
create trigger wine_place_boundaries_truncate_stale_neighbours
  after truncate on public.wine_place_boundaries
  for each statement execute function public.wine_place_neighbours_mark_stale();

-- ---------------------------------------------------------------------------
-- The function. Every CTE except the nearby block is byte-identical to
-- 20260917100000's; the nearby block gains R1, R2 and the cache branch.
-- ---------------------------------------------------------------------------
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
  -- Is the precomputed neighbour list usable? A caller who cannot read the
  -- one-row state table, or a catalogue write that has not been followed by a
  -- refresh yet, coalesces to false and takes the live branch below: stale is
  -- slow, never wrong. MATERIALIZED so the answer is one constant, evaluated
  -- once, that the geometry CTEs can be gated on.
  cache_ready as materialized (
    select coalesce(
             (select s.fresh from wine_place_neighbours_state s where s.only_row),
             false
           ) as ok
  ),
  -- The target's own geometry, and a simplified copy of it, each computed
  -- ONCE. MATERIALIZED is load-bearing throughout this block: without it the
  -- planner inlines these, sees an indexable ST_DWithin in nearby_list, and
  -- drives the GiST index over every boundary on the map -- which is the plan
  -- that made this function take four seconds for Baden and six for Prosecco.
  -- The "not ok" guard becomes a One-Time Filter: on a cache hit no boundary
  -- geometry is read, detoasted, simplified or measured at all.
  target_geom as materialized (
    select b.display_geometry as g
      from target t
      join wine_place_boundaries b on b.wine_place_id = t.id and b.is_current
     where not (select ok from cache_ready)
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
     where not (select ok from cache_ready)
       and p2.display_tier between least(t.display_tier, 1) and t.display_tier
       and p2.id <> t.id
       and p2.id not in (select id from ancestor_ids)
       and p2.primary_parent_id is distinct from t.id
       and p2.canonical_key not like t.canonical_key || '.%'
       and t.canonical_key not like p2.canonical_key || '.%'
       and b2.display_geometry operator(extensions.&&) extensions.ST_Expand((select g from target_geom), 0.1)
  ),
  nearby_live as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', n.id, 'key', n.canonical_key, 'name', n.name, 'kind', n.kind)
        order by n.dist, n.canonical_key
      ),
      '[]'::jsonb
    ) as items
    from (
      select nc.id, nc.canonical_key, nc.name, nc.kind,
             -- ST_Distance returns exactly 0 when the geometries intersect, and
             -- ST_Intersects reaches that answer ~130x faster on a large pair.
             case when extensions.ST_Intersects(nc.g, (select g from target_simple))
                  then 0::float8
                  else extensions.ST_Distance(nc.g, (select g from target_simple))
             end as dist
        from nearby_candidates nc
       -- Intersection implies distance 0, which is <= 0.1, so the OR is an
       -- identity: it only lets the cheap test answer first when it can.
       where extensions.ST_Intersects(
               case when (select display_tier from target) = 0
                    then extensions.ST_SimplifyPreserveTopology(nc.g, 0.02)
                    else nc.g end,
               (select g from target_simple))
          or extensions.ST_DWithin(
               case when (select display_tier from target) = 0
                    then extensions.ST_SimplifyPreserveTopology(nc.g, 0.02)
                    else nc.g end,
               (select g from target_simple), 0.1)
       order by dist, nc.canonical_key
       limit 5
    ) n
  ),
  -- The stored list, rendered through wine_places so the SAME row policy that
  -- decides which neighbours the live branch may see decides it here too. The
  -- table holds place ids and an ordinal, nothing else.
  nearby_cached as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', np.id, 'key', np.canonical_key, 'name', np.name, 'kind', np.kind)
        order by n.position
      ),
      '[]'::jsonb
    ) as items
    from wine_place_neighbours n
    join target t on n.wine_place_id = t.id
    join wine_places np on np.id = n.neighbour_place_id
  ),
  nearby_list as (
    select case when (select ok from cache_ready)
                then (select items from nearby_cached)
                else (select items from nearby_live)
           end as items
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

-- The ACL survives CREATE OR REPLACE, but say it anyway so a future reader of
-- this file can see what the function is meant to be callable by.
revoke execute on function public.get_wine_place_context(text) from public, anon;
grant execute on function public.get_wine_place_context(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rebuild the stored list from the function's OWN live branch, so the two can
-- never disagree: fresh is cleared first, so every call below takes the live
-- path. SECURITY DEFINER and callable by nobody but the owner -- not by
-- authenticated, not by anon, and not by service_role either (the revoke names
-- it; see wine_place_neighbours_mark_stale above). Its callers are a migration
-- and the pipeline scripts, which connect as the owner.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_wine_place_neighbours()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_rows integer;
  v_bad  bigint;
begin
  update public.wine_place_neighbours_state set fresh = false where only_row;
  delete from public.wine_place_neighbours;

  insert into public.wine_place_neighbours (wine_place_id, position, neighbour_place_id)
  select p.id, o.ord::smallint, (o.e ->> 'id')::uuid
    from public.wine_places p
    join public.wine_place_boundaries b
      on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
   cross join lateral jsonb_array_elements(
     coalesce(public.get_wine_place_context(p.canonical_key) -> 'nearby', '[]'::jsonb)
   ) with ordinality as o(e, ord)
   where p.publication_status = 'VERIFIED';
  get diagnostics v_rows = row_count;

  -- This fill runs as the owner, so RLS did not filter it. Only publish the
  -- cache when every stored neighbour is one the READER's own policies would
  -- also have admitted; otherwise leave it stale and let the map compute the
  -- list live. Slow, never wrong.
  select count(*) into v_bad
    from public.wine_place_neighbours n
   where not exists (select 1 from public.wine_places p
                      where p.id = n.neighbour_place_id
                        and p.publication_status = 'VERIFIED')
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = n.neighbour_place_id
                        and b.is_current and b.quality_status = 'VALIDATED');
  if v_bad > 0 then
    raise warning 'refresh_wine_place_neighbours: % stored neighbours are not readable by authenticated; cache left stale', v_bad;
    return -1;
  end if;

  update public.wine_place_neighbours_state
     set fresh = true, built_at = now()
   where only_row;
  return v_rows;
end
$fn$;
revoke execute on function public.refresh_wine_place_neighbours() from public, anon, authenticated, service_role;

-- Fill it once, here. This is the slow step of the migration (~65-75 s for
-- 3,257 places, measured over six dry runs). Readers are never blocked: until
-- this transaction commits they keep seeing whatever the cache held before,
-- and the flag flips for everyone at the same instant the rows do.
do $$
declare v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice 'wine_place_neighbours filled: % rows', v_rows;
end $$;

-- ---------------------------------------------------------------------------
-- Post-state: fail closed unless the change landed exactly as intended.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text   text;
  v_def    text;
  v_expect text;
  v_sample jsonb;
  v_places bigint;
  v_n      bigint;
  v_m      bigint;
begin
  -- 1. The function is the one this file installs, and is still the shape it
  --    was: SECURITY INVOKER, search_path=public, LANGUAGE sql, STABLE.
  select pg_get_functiondef('public.get_wine_place_context(text)'::regprocedure) into v_def;
  if v_def not like '%order by n.dist, n.canonical_key%'                -- R1
     or v_def not like '%order by dist, nc.canonical_key%'              -- R1
     or v_def not like '%extensions.ST_Intersects(nc.g%'                -- R2
     or v_def not like '%cache_ready as materialized%'                  -- R3
     or v_def not like '%from wine_place_neighbours n%'                 -- R3
     or v_def not like '%not (select ok from cache_ready)%'             -- R3
  then
    raise exception 'get_wine_place_context is not the body this migration installs';
  end if;
  if exists (select 1 from pg_proc p
              where p.oid = 'public.get_wine_place_context(text)'::regprocedure
                and (p.prosecdef
                     or p.provolatile <> 's'
                     or p.prolang <> (select oid from pg_language where lanname = 'sql')
                     or p.proconfig is distinct from array['search_path=public'])) then
    raise exception 'get_wine_place_context must stay LANGUAGE sql STABLE SECURITY INVOKER search_path=public';
  end if;

  -- 2. Its ACL is untouched.
  if not has_function_privilege('authenticated', 'public.get_wine_place_context(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_wine_place_context(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_wine_place_context(text)', 'EXECUTE')
     or has_function_privilege('public', 'public.get_wine_place_context(text)', 'EXECUTE') then
    raise exception 'get_wine_place_context ACL moved (%)',
      (select p.proacl::text from pg_proc p where p.oid = 'public.get_wine_place_context(text)'::regprocedure);
  end if;

  -- 3. Both tables have RLS on with exactly the read policy this file wrote,
  --    and no client role may write either of them.
  foreach v_text in array array['wine_place_neighbours', 'wine_place_neighbours_state'] loop
    if not exists (select 1 from pg_class c
                    where c.oid = ('public.' || v_text)::regclass and c.relrowsecurity) then
      raise exception 'RLS is not enabled on %', v_text;
    end if;
    select string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, '+'), '; ' order by policyname)
      into v_def from pg_policies where schemaname = 'public' and tablename = v_text;
    -- (spelled out rather than a CASE inside the IF: plpgsql ends an IF
    -- condition at the first unparenthesised THEN, a CASE's included.)
    if v_text = 'wine_place_neighbours' then
      v_expect := 'wine place neighbours verified read SELECT authenticated';
    else
      v_expect := 'wine place neighbours state read SELECT authenticated';
    end if;
    if v_def is distinct from v_expect then
      raise exception 'policies on % are %', v_text, v_def;
    end if;
    select string_agg(distinct grantee || ':' || privilege_type, ', ')
      into v_def from information_schema.role_table_grants
     where table_schema = 'public' and table_name = v_text and grantee in ('anon', 'authenticated');
    if v_def is distinct from 'authenticated:SELECT' then
      raise exception 'client grants on % are % (expected authenticated:SELECT only)', v_text, v_def;
    end if;
  end loop;

  -- 4. The staleness triggers exist, are enabled, and are statement-level.
  select string_agg(format('%s.%s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_def
  from pg_trigger t
  where t.tgname in ('wine_places_stale_neighbours', 'wine_places_truncate_stale_neighbours',
                     'wine_place_boundaries_stale_neighbours', 'wine_place_boundaries_truncate_stale_neighbours');
  if v_def is distinct from
       'wine_place_boundaries.wine_place_boundaries_stale_neighbours 28 O; '
       || 'wine_place_boundaries.wine_place_boundaries_truncate_stale_neighbours 32 O; '
       || 'wine_places.wine_places_stale_neighbours 28 O; '
       || 'wine_places.wine_places_truncate_stale_neighbours 32 O' then
    raise exception 'the staleness triggers are %', v_def;
  end if;

  -- 5. Neither new function is callable by anybody but the owner. The ACL is
  --    asserted EXACTLY rather than by testing a few roles and describing
  --    another: Supabase's default privileges hand a new public function to
  --    service_role as well, so "no client can call it" and "only the owner
  --    can call it" are different claims and this file makes the second one.
  foreach v_text in array array['public.refresh_wine_place_neighbours()', 'public.wine_place_neighbours_mark_stale()'] loop
    if has_function_privilege('authenticated', v_text, 'EXECUTE')
       or has_function_privilege('anon', v_text, 'EXECUTE')
       or has_function_privilege('public', v_text, 'EXECUTE')
       or has_function_privilege('service_role', v_text, 'EXECUTE') then
      raise exception '% is callable by a role other than the owner (%)', v_text,
        (select p.proacl::text from pg_proc p where p.oid = v_text::regprocedure);
    end if;
    select p.proacl::text into v_def from pg_proc p where p.oid = v_text::regprocedure;
    if v_def is distinct from '{postgres=X/postgres}' then
      raise exception '% ACL is % (expected {postgres=X/postgres})', v_text, v_def;
    end if;
  end loop;

  -- 6. The cache is filled and published. Coverage is NOT recounted here: a
  --    recount taken while fresh is still true reads the cache on both sides
  --    of the comparison and can only ever agree with itself. Check 8 below
  --    subsumes it by comparing the cached render against the live one for
  --    every key, which catches an omitted place (cached '[]' against a live
  --    list) and a truncated one alike.
  if not exists (select 1 from public.wine_place_neighbours_state where only_row and fresh and built_at is not null) then
    raise exception 'the neighbour cache was not published';
  end if;
  select count(*) into v_n from public.wine_place_neighbours_state;
  if v_n <> 1 then
    raise exception 'wine_place_neighbours_state holds % rows', v_n;
  end if;
  select count(distinct wine_place_id) into v_places from public.wine_place_neighbours;
  if v_places = 0 then
    raise exception 'the neighbour cache is empty';
  end if;

  -- 7. Every stored ordinal is 1..5 and runs contiguously from 1 per place.
  select count(*) into v_m
    from (select wine_place_id, count(*) c, min(position) lo, max(position) hi
            from public.wine_place_neighbours group by wine_place_id) z
   where lo <> 1 or hi <> c or c > 5;
  if v_m > 0 then
    raise exception '% places have a broken neighbour ordinal run', v_m;
  end if;

  -- 8. The cache AGREES WITH THE LIVE BRANCH on the real data, for EVERY key
  --    in the catalogue -- checked here, not asserted. Read every place's
  --    nearby with the cache on (that is what a reader gets), switch the cache
  --    off, read them all again through the live geometry branch, and require
  --    the two to be identical. This is the whole claim of this migration and
  --    it is the reason the apply takes ~135 s rather than ~70 s: the second
  --    pass repeats the fill's own work in order to disagree with it if it can.
  --
  --    ORDER MATTERS. The cached pass has to come FIRST, while fresh is still
  --    true. Turning the cache off before collecting the sample would make
  --    both passes live and the comparison would prove nothing -- the same
  --    trap the old coverage recount in check 6 fell into.
  --
  --    A whole-catalogue pass and not a sample: a 45-key sample passes while
  --    an arbitrary place's list is missing or short, and "every place's list
  --    is right" is the claim being made.
  select count(*) into v_places
    from public.wine_places p
    join public.wine_place_boundaries b
      on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
   where p.publication_status = 'VERIFIED';
  select jsonb_object_agg(z.k, z.nearby) into v_sample
  from (
    select p.canonical_key as k,
           coalesce(public.get_wine_place_context(p.canonical_key) -> 'nearby', '[]'::jsonb) as nearby
      from public.wine_places p
      join public.wine_place_boundaries b
        on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
     where p.publication_status = 'VERIFIED'
  ) z;
  if v_sample is null or (select count(*) from jsonb_object_keys(v_sample)) <> v_places then
    raise exception 'the post-state read covered % of % places',
      coalesce((select count(*) from jsonb_object_keys(v_sample))::text, '0'), v_places;
  end if;

  update public.wine_place_neighbours_state set fresh = false where only_row;
  select count(*), string_agg(k, ', ' order by k) into v_n, v_def
    from (
      select e.k
        from jsonb_each(v_sample) as e(k, nearby)
       where e.nearby is distinct from
             coalesce(public.get_wine_place_context(e.k) -> 'nearby', '[]'::jsonb)
       limit 6
    ) d;
  update public.wine_place_neighbours_state set fresh = true, built_at = now() where only_row;
  if v_n > 0 then
    raise exception 'the cached nearby list disagrees with the live computation (first offenders: %)', v_def;
  end if;

  raise notice 'wine_place_neighbours: % rows over % places; all % places with a current VALIDATED boundary render the same nearby list cached as live',
    (select count(*) from public.wine_place_neighbours),
    (select count(distinct wine_place_id) from public.wine_place_neighbours), v_places;
end $$;
