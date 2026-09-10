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
-- SECURITY DEFINER aggregate that returns totals only: no guessed value, and
-- no per-wine breakdown, ever crosses the boundary. It is the same pattern
-- get_wine_reveal already uses to drive the reveal panel, with the
-- authorization guard from tasting_guess_status.

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
  last_round as (
    select wine_id
    from countable
    where scored_at is not null
    order by scored_at desc
    limit 1
  )
  select
    p.id,
    coalesce(sum(c.pts), 0)::int,
    count(c.wine_id)::int,
    case
      when exists (select 1 from last_round)
        then coalesce(
          sum(c.pts) filter (where c.wine_id = (select wine_id from last_round)),
          0)::int
      else null
    end
  from tasting_participants p
  left join countable c on c.participant_id = p.id
  where p.tasting_id = p_tasting_id
    -- Anyone who is neither host nor participant gets no rows at all.
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  group by p.id;
$function$;

grant execute on function public.get_tasting_leaderboard(uuid) to authenticated;

do $$
declare
  v_secdef boolean;
  v_qual text;
begin
  select prosecdef into v_secdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_tasting_leaderboard';
  if v_secdef is null then
    raise exception 'get_tasting_leaderboard was not created';
  end if;
  -- A definer function that quietly lands as invoker reintroduces the exact
  -- bug this migration exists to fix, with no other visible symptom.
  if not v_secdef then
    raise exception 'get_tasting_leaderboard is not SECURITY DEFINER';
  end if;

  select qual::text into v_qual
  from pg_policies
  where tablename = 'guesses' and policyname = 'guesses read';
  if v_qual is null then
    raise exception 'the guesses read policy is missing';
  end if;
  -- Tripwire. The tempting "simplification" of this fix is to widen the
  -- SELECT policy to admit partially revealed wines, which would expose every
  -- unrevealed guessed value. Any such rewrite has to reference reveal_step.
  if v_qual like '%reveal_step%' then
    raise exception
      'the guesses SELECT policy now references reveal_step: partially revealed guesses are readable, which leaks unrevealed answers';
  end if;
  if v_qual not like '%is_revealed%' then
    raise exception 'the guesses SELECT policy no longer gates on is_revealed';
  end if;
end $$;

commit;
