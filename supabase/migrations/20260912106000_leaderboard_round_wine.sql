-- The leaderboard's round wine is chosen per tasting (reveal-7, spec §E.7).
--
-- THE BUG. 20260905100000 picked "last round" per participant: the countable
-- wine where that participant's own scored_at is newest. Its comment assumed
-- that in a LIVE tasting everyone is on the same wine. That is false for
-- anyone with no row on the wine being revealed: the wine's contributor (a
-- bring-your-own taster never guesses their own bottle), and any taster who
-- never picked a field. reveal_next_category and reveal_wine only UPDATE
-- existing guess rows, so those people keep the PREVIOUS glass as their last
-- round, and last_round_points returns that glass's points. rankDelta
-- subtracts it from their total, so the table sees rank moves that never
-- happened ("▼ 1st → 2nd" while nothing changed between them), and the host
-- console prints a stale "+20" among the current glass's points.
--
-- THE FIX. A LIVE tasting has one round wine for the whole table:
--   1. the lowest-position wine with reveal_step > 0 that is not fully
--      revealed (skipped under PER_WINE, where partial steps do not count);
--   2. otherwise the wine with the newest scored_at among countable guesses
--      (under PER_WINE, the last fully revealed wine — see the caveat below).
-- last_round_points is each participant's points on that wine, 0 when they
-- have no row there, null for the round wine's contributor, and null for
-- anyone with no scored countable guess at all (the console then hides "+N",
-- and rankDelta already treats null as 0). ASYNC tastings keep the
-- per-participant pick, because there participants advance independently.
--
-- CAVEAT (inherited from spec §E.7, deliberately not changed here). Rule 2
-- equals "the last fully revealed wine" only while glasses are revealed one
-- at a time. reveal_next_category stamps scored_at = coalesce(scored_at,
-- now()) at a glass's FIRST step and never refreshes it, while reveal_wine
-- stamps now(). When reveals are interleaved, a stepped glass therefore sorts
-- by when its reveal started, not when it finished. The blind-tasting pour
-- pointer (tastings.current_wine_id, .superpowers/blind-tasting/decisions.md
-- B6) is planned to take over the leaderboard's live round.
--
-- UNCHANGED. The signature, the return columns, language sql stable security
-- definer, the pinned search_path, the host / participant guard, and the `t`
-- and `countable` CTEs (copied from the live 20260905100000 body). As before,
-- only points totals cross the boundary: no unrevealed value does, and
-- last_round_points is limited to categories already revealed.
--
-- No begin / commit: scripts/scratch-apply.mjs wraps the file in one
-- transaction (spec §E.0). create or replace keeps whatever grants the
-- function has when this applies; the grant below is idempotent. (On
-- 2026-09-12 those were PUBLIC, anon, authenticated and service_role. The
-- PUBLIC / anon revoke is blind-tasting B13.4, lane N's 20260912093000, not
-- this file; with no auth.uid() the guard returns no rows anyway.)

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
  -- LIVE: one round wine for the whole tasting. Everyone is on the same glass,
  -- including the people with no row on it (its contributor, a taster who
  -- never picked a field), so a per-participant pick would hand those people
  -- their previous glass. First the lowest-position glass mid step-reveal
  -- (not under PER_WINE, where partial steps do not count), else the glass
  -- with the newest scored_at among countable guesses. Exactly one row,
  -- wine_id null when there is no round yet (or the tasting is ASYNC).
  live_round as (
    select coalesce(
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.tasting_id = p_tasting_id and w.reveal_step > 0 and not w.is_revealed
        order by w.position limit 1),
      (select c.wine_id from countable c cross join t
        where t.timing_mode = 'LIVE' and c.scored_at is not null
        order by c.scored_at desc limit 1)
    ) as wine_id
  ),
  -- ASYNC: per participant, as before. Participants advance independently, so
  -- a global pick would show "+0 last round" to anyone who has not yet opened
  -- whichever wine someone else happened to score most recently.
  async_round as (
    select distinct on (c.participant_id) c.participant_id, c.wine_id
    from countable c cross join t
    where t.timing_mode <> 'LIVE' and c.scored_at is not null
    order by c.participant_id, c.scored_at desc
  )
  select
    p.id,
    coalesce(sum(c.pts), 0)::int,
    count(c.wine_id)::int,
    case
      when (select timing_mode from t) = 'LIVE' then
        case
          -- No round yet.
          when lr.wine_id is null then null
          -- The round wine's contributor never guesses it.
          when rw.contributor_participant_id = p.id then null
          -- Nothing scored for this participant at all.
          when not exists (
            select 1 from countable x where x.participant_id = p.id and x.scored_at is not null
          ) then null
          -- Their points on the round wine; 0 with no row there.
          else coalesce(sum(c.pts) filter (where c.wine_id = lr.wine_id), 0)::int
        end
      else
        case
          when ar.wine_id is null then null
          else coalesce(sum(c.pts) filter (where c.wine_id = ar.wine_id), 0)::int
        end
    end
  from tasting_participants p
  cross join live_round lr
  left join wines rw on rw.id = lr.wine_id
  left join countable c on c.participant_id = p.id
  left join async_round ar on ar.participant_id = p.id
  where p.tasting_id = p_tasting_id
    -- Anyone who is neither host nor participant gets no rows at all.
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  -- lr and rw are one row for the whole tasting, and ar has at most one row
  -- per participant, so none of them splits a group.
  group by p.id, lr.wine_id, rw.contributor_participant_id, ar.wine_id;
$function$;

grant execute on function public.get_tasting_leaderboard(uuid) to authenticated;

-- ============================================================================
-- Same-transaction assertions (spec §E.0, §E.7).
--
-- They run once, when this migration is applied (and in the dry run before
-- it). They are not an ongoing tripwire: a later migration that replaces this
-- function, or widens the guesses policies, is not caught here.
-- ============================================================================
do $$
declare
  v_oid oid;
  v_secdef boolean;
  v_config text[];
  v_qual text;
  v_offenders text;
  v_def text;
  v_profiles uuid[];
  v_tasting uuid;
  v_pa uuid;
  v_pb uuid;
  v_pc uuid;
  v_pd uuid;
  v_w1 uuid;
  v_w2 uuid;
  v_w3 uuid;
  v_w4 uuid;
  v_live_attr jsonb;
  v_live_wine jsonb;
  v_async jsonb;
  v_outsider_rows integer;
  v_ran boolean := false;
begin
  -- 1. Copied from 20260905100000: the function, addressed by full signature so
  --    an added overload cannot make this inspect an arbitrary one, is SECURITY
  --    DEFINER and pins search_path=public.
  v_oid := to_regprocedure('public.get_tasting_leaderboard(uuid)');
  if v_oid is null then
    raise exception 'get_tasting_leaderboard(uuid) is missing post-migration';
  end if;

  select p.prosecdef, p.proconfig into v_secdef, v_config
  from pg_proc p
  where p.oid = v_oid;

  if not v_secdef then
    raise exception 'get_tasting_leaderboard is not SECURITY DEFINER post-migration';
  end if;

  if v_config is null
     or not exists (
       select 1 from unnest(v_config) as cfg where cfg = 'search_path=public'
     ) then
    raise exception
      'get_tasting_leaderboard no longer pins search_path=public (proconfig: %)',
      coalesce(v_config::text, 'null');
  end if;

  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'authenticated cannot execute get_tasting_leaderboard post-migration';
  end if;

  -- 2. Copied from 20260905100000: the guesses read policy still gates on
  --    is_revealed, and no permissive SELECT policy references reveal_step.
  --    Postgres ORs every permissive SELECT policy together, so a widening
  --    under another policy name would grant the same read: check them all.
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

  -- 3. Behavioural (spec §E.7), on synthetic rows that never commit (spec §E.0).
  --
  --    A synthetic LIVE bring-your-own tasting with four JOINED participants:
  --    A (the host), B, C and D.
  --      Glass 1: A's bottle, fully revealed; B scored 13 (30 min ago), C
  --               scored 7 (29 min ago).
  --      Glass 2: A's bottle, reveal_step = 2, not revealed; B has a
  --               step-scored row worth 5 (the newest scored_at); C has none.
  --      Glass 3: B's bottle, fully revealed BEFORE glass 1 despite its higher
  --               position; A scored 4 (60 min ago, the oldest scored_at).
  --      Glass 4: A's bottle, reveal_step = 1, not revealed, no rows: a second
  --               glass mid step-reveal, at a higher position than glass 2.
  --      D has no guess at all.
  --
  --    Every last_round_points rule has a check below that fails without it:
  --      - a participant with no row on the round wine gets 0: C under LIVE
  --        PER_ATTRIBUTE (the reveal-7 defect itself, so it is checked first);
  --      - the round wine's contributor gets null: A under LIVE. A has a
  --        scored guess on glass 3, so no other rule can null A;
  --      - anyone with no scored guess at all gets null: D, in every mode;
  --      - the lowest-position glass mid step-reveal is the round wine: under
  --        LIVE PER_ATTRIBUTE, B gets 5 from glass 2, not 0 from glass 4;
  --      - otherwise the newest scored_at is: under LIVE PER_WINE, glass 1
  --        wins over the earlier-revealed glass 3, so B gets 13 and C 7;
  --      - ASYNC keeps the per-participant pick: A 4, B 5, C 7, D null.
  --    Each observation is copied into a jsonb variable,
  --    { participant_id: [total, wines_scored, last_round_points] }, which
  --    survives the synthetic rollback; the assertions below read those.
  select array_agg(s.id) into v_profiles
  from (select pr.id from profiles pr order by pr.id limit 4) s;

  if coalesce(array_length(v_profiles, 1), 0) < 4 then
    raise notice 'get_tasting_leaderboard behavioural assertions skipped: fewer than four profiles exist';
  else
    begin
      insert into tastings (name, host_id, timing_mode, wine_source, status, reveal_mode, leaderboard_reveal)
      values ('synthetic get_tasting_leaderboard round-wine check', v_profiles[1],
              'LIVE', 'PARTICIPANT_CONTRIBUTED', 'IN_PROGRESS', 'BLIND', 'PER_ATTRIBUTE')
      returning id into v_tasting;

      insert into tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_profiles[1], 'JOINED', now())
      returning id into v_pa;
      insert into tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_profiles[2], 'JOINED', now())
      returning id into v_pb;
      insert into tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_profiles[3], 'JOINED', now())
      returning id into v_pc;
      insert into tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_profiles[4], 'JOINED', now())
      returning id into v_pd;

      insert into wines (tasting_id, position, contributor_participant_id)
      values (v_tasting, 1, v_pa)
      returning id into v_w1;
      insert into wines (tasting_id, position, contributor_participant_id, reveal_step)
      values (v_tasting, 2, v_pa, 2)
      returning id into v_w2;
      insert into wines (tasting_id, position, contributor_participant_id)
      values (v_tasting, 3, v_pb)
      returning id into v_w3;
      insert into wines (tasting_id, position, contributor_participant_id, reveal_step)
      values (v_tasting, 4, v_pa, 1)
      returning id into v_w4;

      -- guesses_block_after_reveal refuses guess writes on a revealed wine, so
      -- the rows on glasses 1 and 3 are written while they are hidden and the
      -- glasses are revealed after. B's glass-2 row carries its own
      -- reveal_step = 2 as well: LIVE counts it through the wine's step, the
      -- ASYNC check below through the guess's.
      insert into guesses (wine_id, participant_id, total_points, scored_at, locked_at, reveal_step)
      values
        (v_w1, v_pb, 13, now() - interval '30 minutes', now() - interval '31 minutes', 0),
        (v_w1, v_pc, 7, now() - interval '29 minutes', now() - interval '31 minutes', 0),
        (v_w2, v_pb, 5, now() - interval '5 minutes', now() - interval '6 minutes', 2),
        (v_w3, v_pa, 4, now() - interval '60 minutes', now() - interval '61 minutes', 0);

      update wines set is_revealed = true, reveal_step = 7 where id in (v_w1, v_w3);

      -- LIVE + PER_ATTRIBUTE, read by the host through the authenticated role.
      perform set_config('request.jwt.claim.sub', v_profiles[1]::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_profiles[1], 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select jsonb_object_agg(l.participant_id::text,
               jsonb_build_array(l.total, l.wines_scored, l.last_round_points))
        into v_live_attr
      from public.get_tasting_leaderboard(v_tasting) l;
      execute 'reset role';

      -- Someone who is neither host nor participant still gets no rows.
      perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into v_outsider_rows
      from public.get_tasting_leaderboard(v_tasting);
      execute 'reset role';

      -- LIVE + PER_WINE on the same tasting.
      update tastings set leaderboard_reveal = 'PER_WINE' where id = v_tasting;
      perform set_config('request.jwt.claim.sub', v_profiles[1]::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_profiles[1], 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select jsonb_object_agg(l.participant_id::text,
               jsonb_build_array(l.total, l.wines_scored, l.last_round_points))
        into v_live_wine
      from public.get_tasting_leaderboard(v_tasting) l;
      execute 'reset role';

      -- ASYNC + PER_ATTRIBUTE keeps the per-participant pick.
      update tastings set timing_mode = 'ASYNC', leaderboard_reveal = 'PER_ATTRIBUTE'
      where id = v_tasting;
      execute 'set local role authenticated';
      select jsonb_object_agg(l.participant_id::text,
               jsonb_build_array(l.total, l.wines_scored, l.last_round_points))
        into v_async
      from public.get_tasting_leaderboard(v_tasting) l;
      execute 'reset role';

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then null;
    end;

    if not v_ran then
      raise exception 'get_tasting_leaderboard synthetic scenario did not run to completion';
    end if;

    if v_outsider_rows <> 0 then
      raise exception 'get_tasting_leaderboard returned % rows to a caller who is neither host nor participant',
        v_outsider_rows;
    end if;

    -- LIVE + PER_ATTRIBUTE: the round wine is glass 2, the lowest-position
    -- glass mid step-reveal. The totals check also proves every participant's
    -- key is present, so a missing row cannot pass a null check.
    if v_live_attr is null or (select count(*) from jsonb_object_keys(v_live_attr)) <> 4 then
      raise exception 'LIVE PER_ATTRIBUTE: expected one row per participant (4), observed %', v_live_attr;
    end if;
    if (v_live_attr -> v_pc::text ->> 2)::int is distinct from 0 then
      raise exception 'LIVE PER_ATTRIBUTE: a participant with a scored guess elsewhere and no row on the round wine (C) must get 0, observed %',
        v_live_attr;
    end if;
    if (v_live_attr -> v_pa::text ->> 2) is not null then
      raise exception 'LIVE PER_ATTRIBUTE: the round wine''s contributor (A, who has a scored guess on glass 3) must get null last_round_points, observed %',
        v_live_attr;
    end if;
    if (v_live_attr -> v_pb::text ->> 2)::int is distinct from 5 then
      raise exception 'LIVE PER_ATTRIBUTE: the round wine is the lowest-position glass mid step-reveal (glass 2, not glass 4), so its guesser B must get their points on it (5), observed %',
        v_live_attr;
    end if;
    if (v_live_attr -> v_pd::text ->> 2) is not null then
      raise exception 'LIVE PER_ATTRIBUTE: a participant with no scored guess at all (D) must get null last_round_points, observed %',
        v_live_attr;
    end if;
    if (v_live_attr -> v_pa::text ->> 0)::int is distinct from 4
       or (v_live_attr -> v_pa::text ->> 1)::int is distinct from 1
       or (v_live_attr -> v_pb::text ->> 0)::int is distinct from 18
       or (v_live_attr -> v_pb::text ->> 1)::int is distinct from 2
       or (v_live_attr -> v_pc::text ->> 0)::int is distinct from 7
       or (v_live_attr -> v_pc::text ->> 1)::int is distinct from 1
       or (v_live_attr -> v_pd::text ->> 0)::int is distinct from 0
       or (v_live_attr -> v_pd::text ->> 1)::int is distinct from 0 then
      raise exception 'LIVE PER_ATTRIBUTE: totals / wines_scored changed (expected A 4/1, B 18/2, C 7/1, D 0/0), observed %',
        v_live_attr;
    end if;

    -- LIVE + PER_WINE: partial steps do not count, so the first pick is skipped
    -- and the round wine is the glass with the newest countable scored_at:
    -- glass 1 (29 min ago), not the earlier-revealed glass 3 (60 min ago), and
    -- not glass 2 (B's newer row there is not countable under PER_WINE).
    if v_live_wine is null or (select count(*) from jsonb_object_keys(v_live_wine)) <> 4 then
      raise exception 'LIVE PER_WINE: expected one row per participant (4), observed %', v_live_wine;
    end if;
    if (v_live_wine -> v_pb::text ->> 2)::int is distinct from 13 then
      raise exception 'LIVE PER_WINE: the round wine is the glass with the newest scored_at (glass 1, not the earlier-revealed glass 3), so B must get their glass-1 points (13), observed %',
        v_live_wine;
    end if;
    if (v_live_wine -> v_pc::text ->> 2)::int is distinct from 7 then
      raise exception 'LIVE PER_WINE: C must get their glass-1 points (7), observed %', v_live_wine;
    end if;
    if (v_live_wine -> v_pa::text ->> 2) is not null then
      raise exception 'LIVE PER_WINE: the round wine''s contributor (A, who has a scored guess on glass 3) must get null last_round_points, observed %',
        v_live_wine;
    end if;
    if (v_live_wine -> v_pd::text ->> 2) is not null then
      raise exception 'LIVE PER_WINE: a participant with no scored guess at all (D) must get null last_round_points, observed %',
        v_live_wine;
    end if;
    if (v_live_wine -> v_pa::text ->> 0)::int is distinct from 4
       or (v_live_wine -> v_pa::text ->> 1)::int is distinct from 1
       or (v_live_wine -> v_pb::text ->> 0)::int is distinct from 13
       or (v_live_wine -> v_pb::text ->> 1)::int is distinct from 1
       or (v_live_wine -> v_pc::text ->> 0)::int is distinct from 7
       or (v_live_wine -> v_pc::text ->> 1)::int is distinct from 1
       or (v_live_wine -> v_pd::text ->> 0)::int is distinct from 0
       or (v_live_wine -> v_pd::text ->> 1)::int is distinct from 0 then
      raise exception 'LIVE PER_WINE: totals / wines_scored changed (expected A 4/1, B 13/1, C 7/1, D 0/0), observed %',
        v_live_wine;
    end if;

    -- ASYNC: each participant's own newest scored wine, as before: A glass 3,
    -- B glass 2 (counted through the guess's own reveal_step), C glass 1, and
    -- nothing for D.
    if v_async is null or (select count(*) from jsonb_object_keys(v_async)) <> 4 then
      raise exception 'ASYNC: expected one row per participant (4), observed %', v_async;
    end if;
    if (v_async -> v_pa::text ->> 2)::int is distinct from 4
       or (v_async -> v_pb::text ->> 2)::int is distinct from 5
       or (v_async -> v_pc::text ->> 2)::int is distinct from 7
       or (v_async -> v_pd::text ->> 2) is not null then
      raise exception 'ASYNC: last_round_points must stay per participant (expected A 4, B 5, C 7, D null), observed %',
        v_async;
    end if;
    if (v_async -> v_pa::text ->> 0)::int is distinct from 4
       or (v_async -> v_pa::text ->> 1)::int is distinct from 1
       or (v_async -> v_pb::text ->> 0)::int is distinct from 18
       or (v_async -> v_pb::text ->> 1)::int is distinct from 2
       or (v_async -> v_pc::text ->> 0)::int is distinct from 7
       or (v_async -> v_pc::text ->> 1)::int is distinct from 1
       or (v_async -> v_pd::text ->> 0)::int is distinct from 0
       or (v_async -> v_pd::text ->> 1)::int is distinct from 0 then
      raise exception 'ASYNC: totals / wines_scored changed (expected A 4/1, B 18/2, C 7/1, D 0/0), observed %',
        v_async;
    end if;
  end if;

  -- 4. The recreated body is the one this migration wrote.
  v_def := pg_get_functiondef(v_oid);
  if strpos(v_def, 'live_round') = 0 or strpos(v_def, 'async_round') = 0 then
    raise exception 'get_tasting_leaderboard lacks the per-tasting round wine (live_round / async_round) post-migration';
  end if;
end $$;
