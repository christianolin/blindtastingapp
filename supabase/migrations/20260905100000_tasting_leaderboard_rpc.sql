-- Live standings during a progressive reveal.
--
-- THE BUG. getTastingLeaderboard reads `guesses` directly under the viewer's
-- own session. The `guesses read` SELECT policy admits a row only when it is
-- the viewer's own guess, the wine is FULLY revealed, or the viewer is the
-- host. There is no clause for a partially revealed wine, so mid-reveal a
-- participant can read exactly one row -- their own -- and the leaderboard
-- sums only that. You watch your own points climb while everyone else sits
-- frozen until the wine finishes.
--
-- THE FIX, and why it is not a policy change. Widening the policy would make
-- the whole guess row readable, including country_id / region_id /
-- appellation_id for categories NOT yet revealed, while guessing may still be
-- open -- a cheating vector in place of a scoreboard bug. Instead this adds a
-- SECURITY DEFINER aggregate that returns points totals only: no UNREVEALED
-- value ever crosses the boundary. Note that this is not the same as "no
-- per-wine figure crosses it": `last_round_points` is a single participant's
-- points on a single wine. That figure is limited to categories that have
-- already been revealed (`total_points` sums revealed categories only), and it
-- is derivable anyway from successive `total` deltas, so it discloses nothing
-- that the running total does not. It is the same pattern get_wine_reveal
-- already uses to drive the reveal panel, with the authorization guard from
-- tasting_guess_status.

begin;

create or replace function public.get_tasting_leaderboard(p_tasting_id uuid)
returns table (
  participant_id uuid,
  total integer,
  wines_scored integer,
  last_round_points integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with t as (
    select
      timing_mode::text as timing_mode,
      coalesce(leaderboard_reveal::text, 'PER_ATTRIBUTE') as leaderboard_reveal
    from tastings
    where id = p_tasting_id
  ),
  -- Reproduces the countability rule the TypeScript used, unchanged:
  --   PER_WINE      -> only once the wine is fully revealed
  --   PER_ATTRIBUTE -> from the first reveal step; the shared wine step when
  --                    guided (LIVE), else this guess's own step.
  -- total_points is already the sum of revealed categories only (unrevealed
  -- category columns are null), so the per-category drip needs no new maths.
  countable as (
    select
      g.participant_id,
      g.wine_id,
      coalesce(g.total_points, 0) as pts,
      g.scored_at
    from guesses g
    join wines w on w.id = g.wine_id
    cross join t
    where w.tasting_id = p_tasting_id
      and (
        w.is_revealed
        or (
          t.leaderboard_reveal <> 'PER_WINE'
          and case
                when t.timing_mode = 'LIVE' then coalesce(w.reveal_step, 0) > 0
                else coalesce(g.reveal_step, 0) > 0
              end
        )
      )
  ),
  -- "Last round" is per participant, not global. In a LIVE tasting everyone is
  -- on the same wine, so this picks the same wine for everyone and matches the
  -- old global behaviour exactly. In an ASYNC tasting participants advance
  -- independently: a global pick would show "+0 last round" to anyone who has
  -- not yet opened whichever wine some other participant happened to score
  -- most recently. Scoping it per participant is the only reading that is
  -- correct in both modes.
  last_round as (
    select distinct on (participant_id)
      participant_id,
      wine_id
    from countable
    where scored_at is not null
    order by participant_id, scored_at desc
  )
  select
    p.id,
    coalesce(sum(c.pts), 0)::int,
    count(c.wine_id)::int,
    -- NULL when this participant has no scored countable guess at all;
    -- otherwise the number, which may legitimately be 0.
    case
      when lr.wine_id is null then null
      else coalesce(sum(c.pts) filter (where c.wine_id = lr.wine_id), 0)::int
    end
  from tasting_participants p
  left join countable c on c.participant_id = p.id
  left join last_round lr on lr.participant_id = p.id
  where p.tasting_id = p_tasting_id
    -- Anyone who is neither host nor participant gets no rows at all.
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  -- lr has at most one row per participant, so lr.wine_id never splits a group.
  group by p.id, lr.wine_id;
$function$;

grant execute on function public.get_tasting_leaderboard(uuid) to authenticated;

-- ASSERTIONS AT APPLY TIME ONLY.
--
-- This block runs exactly once, when this migration is applied (and once more
-- in the dry run that precedes it). It is NOT an ongoing tripwire: migrations
-- are recorded in supabase_migrations.schema_migrations and never re-run, so a
-- LATER migration that widens the guesses SELECT policy, or that replaces this
-- function without SECURITY DEFINER or without the pinned search_path, will
-- not be caught here. It asserts the state of the database at the moment this
-- migration lands, and nothing beyond that.
do $$
declare
  v_oid oid;
  v_secdef boolean;
  v_config text[];
  v_qual text;
  v_offenders text;
begin
  -- Address the function by full signature so an added overload cannot make
  -- this assertion inspect an arbitrary one of them.
  v_oid := to_regprocedure('public.get_tasting_leaderboard(uuid)');
  if v_oid is null then
    raise exception 'get_tasting_leaderboard(uuid) was not created';
  end if;

  select p.prosecdef, p.proconfig into v_secdef, v_config
  from pg_proc p
  where p.oid = v_oid;

  -- A definer function that quietly lands as invoker reintroduces the exact
  -- bug this migration exists to fix, with no other visible symptom.
  if not v_secdef then
    raise exception 'get_tasting_leaderboard is not SECURITY DEFINER';
  end if;

  -- A definer function without a pinned search_path resolves its unqualified
  -- names against the caller's search_path, which is a privilege-escalation
  -- vector; a create-or-replace that drops the SET clause would otherwise be
  -- invisible here.
  if v_config is null
     or not exists (
       select 1 from unnest(v_config) as cfg where cfg = 'search_path=public'
     ) then
    raise exception
      'get_tasting_leaderboard no longer pins search_path=public (proconfig: %)',
      coalesce(v_config::text, 'null');
  end if;

  select pol.qual::text into v_qual
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = 'guesses'
    and pol.policyname = 'guesses read';
  if v_qual is null then
    raise exception 'the guesses read policy is missing';
  end if;
  if v_qual not like '%is_revealed%' then
    raise exception 'the guesses read policy no longer gates on is_revealed';
  end if;

  -- Tripwire. The tempting "simplification" of this fix is to widen the SELECT
  -- policy to admit partially revealed wines, which would expose every
  -- unrevealed guessed value. Any such rewrite has to reference reveal_step.
  -- Postgres OR's every permissive SELECT policy together, so a widening added
  -- under a different policy name would grant exactly the same read. Check
  -- them all, not just 'guesses read'.
  select string_agg(pol.policyname, ', ' order by pol.policyname)
  into v_offenders
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = 'guesses'
    and pol.permissive = 'PERMISSIVE'
    and pol.cmd in ('SELECT', 'ALL')
    and coalesce(pol.qual::text, '') like '%reveal_step%';
  if v_offenders is not null then
    raise exception
      'permissive SELECT policies on guesses now reference reveal_step (%): partially revealed guesses are readable, which leaks unrevealed answers',
      v_offenders;
  end if;
end $$;

commit;
