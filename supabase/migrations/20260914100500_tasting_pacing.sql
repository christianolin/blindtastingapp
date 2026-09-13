-- M7 tasting_pacing (blind-tasting v3 · BT-SQL7)
-- Spec §7.4 (SQL, verbatim below), §7.3 items 2-3, §7.5, §15 M7, §16.1 rows
-- 13-14; ledger B6 (Pause, the pour pointer), Q1 (Pause is for live tastings
-- only); plan BT-SQL7, refinement 19 ("M7: Pause LIVE-only").
--
-- What it does (spec §7.4):
-- 1. tastings.paused_at (timestamptz, nullable). The host writes it through the
--    live "tastings update host" policy. tastings_pause_follows_status clears it
--    on any tasting that is not LIVE and IN_PROGRESS (an insert, End tasting, a
--    DRAFT or an ASYNC tasting), so a pause exists only while a live tasting runs.
-- 2. tastings_pointer_in_tasting: tastings.current_wine_id, the pour pointer
--    (the column has existed since T9 but nothing writes it), must be a glass of
--    the same tasting.
-- 3. wines_refuse_reveal_while_paused: no reveal step and no full reveal while
--    the glass's tasting is paused. It covers reveal_next_category, reveal_wine
--    (whose scoring rolls back with the raise) and any direct write, without
--    recreating a scoring function.
-- 4. get_tasting_leaderboard, recreated from its live pg_get_functiondef
--    (dumped to .superpowers/blind-tasting/probes/20260914100500-live-defs.sql,
--    md5 54c484be...). Only the t and live_round CTEs change, as spec §7.4
--    shows: t also selects current_wine_id, and live_round tries the pour
--    pointer's glass while its step reveal runs, ahead of the two live picks.
--    The signature, LANGUAGE sql STABLE SECURITY DEFINER, search_path, ACL, the
--    host / participant gate and every output column stay (asserted). The
--    spec's inline "-- new" / "-- unchanged" markers annotate its diff; this
--    file words those comments for the function's later readers instead. The
--    SQL of both CTEs is the spec's token for token (probe row L1).
--
-- Beyond the spec block (the M4, M5 and M6 precedent for trigger functions):
-- EXECUTE on the three trigger functions is revoked from PUBLIC, anon and
-- authenticated.
--
-- Live facts this file was written against (read-only dump, 2026-09-13):
-- * tastings: 4 rows, none with a current_wine_id. Its foreign key to wines is
--   ON DELETE SET NULL, so deleting or removing the pointer's glass writes a
--   null pointer, which the pointer trigger accepts. anon, authenticated and
--   service_role hold table-level privileges with no column ACL, so the new
--   column is writable by whoever "tastings update host" admits (the host) and
--   by service_role; anon has no policy on tastings.
-- * The only SQL writers of wines are reveal_wine and reveal_next_category,
--   both SECURITY DEFINER. M6 adds move_flight_glass, remove_flight_glass and
--   set_flight_glass_added_via, which write position and added_via only, and
--   takes client UPDATE of reveal_step and is_revealed away. Neither scoring
--   function catches exceptions: reveal_next_category moves reveal_step before
--   it scores, and reveal_wine scores before it flips is_revealed, so the raise
--   rolls the whole call back. A reveal_next_category whose expected step is
--   stale updates no wines row and returns the current step, paused or not.
-- * BEFORE UPDATE triggers on wines fire in name order: wines_full_reveal_step
--   (raises reveal_step on the reveal flip), wines_pin_adder (M6), this file's
--   wines_refuse_reveal_while_paused, then wines_stamp_revealed_at. An UPDATE OF
--   trigger fires when a listed column is a SET target; both scoring functions
--   name reveal_step or is_revealed in their SET lists.
--
-- Order: after M6 (spec §15). The pre-state requires M6's trigger sets on
-- tastings and wines, so this file fails closed when applied before M6. While
-- M4, M5 and M6 are not live it is dry-run as the concatenation M4 + M5 + M6 + M7.
--
-- Deployed code once applied (BT-M7): nothing in src or scripts reads or writes
-- paused_at or current_wine_id (rg, 2026-09-13). Every tasting therefore keeps a
-- null pause and a null pointer: the pause trigger clears a null, the pointer
-- trigger accepts a null, the reveal trigger never meets a paused tasting, and
-- the leaderboard's pointer pick never matches, so its live picks decide as
-- before. src/lib/tasting-leaderboard.ts reads the same four columns.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_n int;
begin
  -- 1. None of the objects M7 creates exists yet. CREATE OR REPLACE would
  --    silently overwrite a function, and a trigger or column of the same name
  --    would fail the apply halfway.
  select concat_ws(' / ',
     (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')),
     (select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") from pg_trigger t
       where t.tgname in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')),
     (select 'tastings.paused_at' from pg_attribute a
       where a.attrelid = 'public.tastings'::regclass and a.attname = 'paused_at' and not a.attisdropped))
    into v_text;
  if v_text is distinct from '' then
    raise exception 'an object M7 creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;

  -- 2. get_tasting_leaderboard is the dumped live function (and the only one of
  --    that name): body, SECURITY DEFINER, search_path=public, STABLE, sql, its
  --    result columns, its argument and its ACL.
  select count(*) into v_n from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'get_tasting_leaderboard';
  if v_n <> 1 then
    raise exception 'expected exactly one public.get_tasting_leaderboard, found %', v_n;
  end if;
  select format('secdef=%s config=%s volatile=%s lang=%s returns=%s args=(%s) acl=%s md5=%s',
           p.prosecdef, p.proconfig::text, p.provolatile, l.lanname, pg_get_function_result(p.oid),
           pg_get_function_identity_arguments(p.oid), p.proacl::text, md5(replace(p.prosrc, chr(13), '')))
    into v_text
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.get_tasting_leaderboard(uuid)');
  if v_text is distinct from 'secdef=t config={search_path=public} volatile=s lang=sql returns=TABLE(participant_id uuid, total integer, wines_scored integer, last_round_points integer) args=(p_tasting_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=54c484be761f10594b1a691b9ec719d4' then
    raise exception 'get_tasting_leaderboard is not the dumped live function: %; re-dump and rebuild this migration', v_text;
  end if;

  -- 3. The scoring engine is the one this file was written against (none of its
  --    functions catches the raise), and the SQL writers of wines are exactly the
  --    two scoring functions plus M6's three position / added_via writers, all
  --    SECURITY DEFINER. A new writer must be checked against the pause trigger.
  select string_agg(format('%s=%s', p.proname, md5(replace(p.prosrc, chr(13), ''))), '; ' order by p.proname::text collate "C")
    into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.reveal_wine(uuid)'),
                  to_regprocedure('public.reveal_next_category(uuid,smallint)'),
                  to_regprocedure('public.score_own_guess(uuid)'),
                  to_regprocedure('public.reveal_own_next_category(uuid,smallint)'));
  if v_text is distinct from 'reveal_next_category=6a08183662534db0d212b2412d729ac2; reveal_own_next_category=7ed3b1d262563ee6e699ced8c2811f87; reveal_wine=13923813da0f470fe2d1ffd3ac445625; score_own_guess=f7acab278d1a88558b1e35b4370e72e4' then
    raise exception 'the scoring functions are not the dumped bodies: %', v_text;
  end if;
  select string_agg(format('%s %s', p.oid::regprocedure::text, p.prosecdef), ', ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosrc ~* 'update\s+(only\s+)?(public\.)?wines\M';
  if v_text is distinct from 'move_flight_glass(uuid,integer) t, remove_flight_glass(uuid) t, reveal_next_category(uuid,smallint) t, reveal_wine(uuid) t, set_flight_glass_added_via(uuid,text) t' then
    raise exception 'the SQL writers of wines are not the ones this file was written against (apply M6 first; check a new writer against the pause trigger): %', v_text;
  end if;

  -- 4. The columns the triggers and the leaderboard's changed CTEs read, with
  --    their types and nullability.
  select string_agg(format('%s.%s %s %s', c.relname, a.attname, t.typname, case when a.attnotnull then 'not null' else 'null' end),
                    '; ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_type t on t.oid = a.atttypid
  where a.attnum > 0 and not a.attisdropped
    and ((c.oid = 'public.tastings'::regclass and a.attname in ('id', 'current_wine_id', 'status', 'timing_mode', 'leaderboard_reveal'))
      or (c.oid = 'public.wines'::regclass and a.attname in ('id', 'tasting_id', 'position', 'reveal_step', 'is_revealed')));
  if v_text is distinct from 'tastings.current_wine_id uuid null; tastings.id uuid not null; tastings.leaderboard_reveal wine_leaderboard_reveal not null; tastings.status tasting_status not null; tastings.timing_mode timing_mode not null; wines.id uuid not null; wines.is_revealed bool not null; wines.position int4 not null; wines.reveal_step int2 not null; wines.tasting_id uuid not null' then
    raise exception 'the columns M7 reads are not the dumped ones: %', v_text;
  end if;

  -- 5. The enum labels the triggers and the leaderboard compare against.
  select string_agg(format('%s=%s', t.typname, (select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
                                                 from pg_enum e where e.enumtypid = t.oid)), '; ' order by t.typname::text collate "C")
    into v_text
  from pg_type t
  where t.typnamespace = 'public'::regnamespace
    and t.typname in ('tasting_status', 'timing_mode', 'wine_leaderboard_reveal');
  if v_text is distinct from 'tasting_status=DRAFT,OPEN,IN_PROGRESS,CLOSED; timing_mode=LIVE,ASYNC; wine_leaderboard_reveal=PER_ATTRIBUTE,PER_WINE' then
    raise exception 'the enum labels M7 relies on differ: %', v_text;
  end if;

  -- 6. The triggers on tastings (M3's lifecycle stamp, M6's setup lock) and on
  --    wines (the blind-pending unmark, M1's full-reveal step, M3's stamp, M5's
  --    two, M6's adder pin): apply M6 first. The two BEFORE UPDATE bodies that
  --    run ahead of the pause trigger in name order are pinned.
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.tastings'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start; tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle' then
    raise exception 'the triggers on tastings are not the M3 + M6 set (apply M6 first): %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal;
  if v_text is distinct from 'trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind; wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes; wines_full_reveal_step 19 O wines_full_reveal_step; wines_pin_adder 23 O wines_pin_adder; wines_stamp_revealed_at 23 O wines_stamp_revealed_at; wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal' then
    raise exception 'the triggers on wines are not the M1 + M3 + M5 + M6 set (apply M6 first): %', v_text;
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.wines_full_reveal_step()'))
       is distinct from '5c8215b1df122773ec07058e31337c0e'
     or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.wines_pin_adder()'))
       is distinct from '11cc3e61f6b0b3d3834ced2f57115696' then
    raise exception 'wines_full_reveal_step or wines_pin_adder is not the dumped body';
  end if;

  -- 7. The constraints on tastings: the pointer's foreign key is ON DELETE SET
  --    NULL, so a removed glass never leaves a pointer behind.
  select string_agg(format('%s %s%s', c.conname, pg_get_constraintdef(c.oid), case when c.condeferrable then ' DEFERRABLE' else '' end),
                    '; ' order by c.conname::text collate "C")
    into v_text
  from pg_constraint c where c.conrelid = 'public.tastings'::regclass;
  if v_text is distinct from 'tastings_current_wine_id_fkey FOREIGN KEY (current_wine_id) REFERENCES wines(id) ON DELETE SET NULL; tastings_host_id_fkey FOREIGN KEY (host_id) REFERENCES profiles(id) ON DELETE CASCADE; tastings_pkey PRIMARY KEY (id)' then
    raise exception 'the constraints on tastings are not the dumped set: %', v_text;
  end if;

  -- 8. Who writes and reads the two pacing columns (security reasoning): the
  --    host writes them through "tastings update host"; the host, participants
  --    and, once a glass is revealed, every signed-in user read them. The table
  --    ACL is table-level with no column ACL, so paused_at takes the same grants.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(p.qual, '-'), coalesce(p.with_check, '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'tastings';
  if v_text is distinct from 'tastings delete host|DELETE|{authenticated}|PERMISSIVE|(host_id = auth.uid())|-; tastings insert|INSERT|{authenticated}|PERMISSIVE|-|(host_id = auth.uid()); tastings read|SELECT|{authenticated}|PERMISSIVE|((host_id = auth.uid()) OR is_tasting_participant(id))|-; tastings update host|UPDATE|{authenticated}|PERMISSIVE|(host_id = auth.uid())|(host_id = auth.uid()); tastings with revealed wines are public|SELECT|{authenticated}|PERMISSIVE|tasting_has_revealed_wine(id)|-' then
    raise exception 'the policies on tastings are not the dumped set: %', v_text;
  end if;
  select c.relacl::text || ' | ' || coalesce((select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
           from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null), '-')
    into v_text
  from pg_class c where c.oid = 'public.tastings'::regclass;
  if v_text is distinct from '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres} | -' then
    raise exception 'the tastings table or column ACL is not the dumped one: %', v_text;
  end if;

  -- 9. RLS enabled and not forced (the SECURITY DEFINER triggers read as the owner).
  select string_agg(format('%s %s %s', c.relname, c.relrowsecurity, c.relforcerowsecurity), '; ' order by c.relname::text collate "C")
    into v_text
  from pg_class c where c.oid in ('public.tastings'::regclass, 'public.wines'::regclass);
  if v_text is distinct from 'tastings t f; wines t f' then
    raise exception 'RLS on tastings or wines is not enabled-and-not-forced: %', v_text;
  end if;

  -- 10. Data (read-only check 2026-09-13: 4 tastings, 0 pointers). The pointer
  --     trigger checks writes only, so no existing pointer may lie outside its
  --     own tasting.
  select count(*) into v_n
  from public.tastings t
  where t.current_wine_id is not null
    and not exists (select 1 from public.wines w where w.id = t.current_wine_id and w.tasting_id = t.id);
  if v_n <> 0 then
    raise exception '% tastings point at a glass of another tasting', v_n;
  end if;
end $$;

-- Snapshot of everything this file must leave alone, compared in the post-state.
create temp table m7_pre_functions on commit drop as
  select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body, p.proacl::text as acl,
         p.prosecdef, p.proconfig::text as config, p.provolatile
  from pg_proc p where p.pronamespace = 'public'::regnamespace;
create temp table m7_pre_leaderboard on commit drop as
  select replace(p.prosrc, chr(13), '') as src
  from pg_proc p where p.oid = to_regprocedure('public.get_tasting_leaderboard(uuid)');
create temp table m7_pre_policies on commit drop as
  select p.tablename::text as tablename, p.policyname::text as policyname, p.cmd, p.roles::text as roles, p.permissive,
         p.qual, p.with_check
  from pg_policies p where p.schemaname = 'public';
create temp table m7_pre_triggers on commit drop as
  select t.tgrelid::regclass::text as tbl, t.tgname::text as tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;
create temp table m7_pre_acls on commit drop as
  select c.relname::text as relname, c.relacl::text as relacl,
         (select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
            from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null) as attacl
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm');
create temp table m7_pre_constraints on commit drop as
  select c.conrelid::regclass::text as tbl, c.conname::text as conname, pg_get_constraintdef(c.oid) as def
  from pg_constraint c join pg_class r on r.oid = c.conrelid
  where r.relnamespace = 'public'::regnamespace;

-- ===========================================================================
-- Spec §7.4 (M7 tasting_pacing), verbatim.
-- ===========================================================================
alter table public.tastings add column paused_at timestamptz;

-- The pour pointer must stay inside its own tasting.
create or replace function public.tastings_pointer_in_tasting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_wine_id is not null and not exists (
    select 1 from wines w where w.id = new.current_wine_id and w.tasting_id = new.id
  ) then
    raise exception 'the pour pointer must be a glass of this tasting';
  end if;
  return new;
end $$;
create trigger tastings_pointer_in_tasting
  before insert or update of current_wine_id on public.tastings
  for each row execute function public.tastings_pointer_in_tasting();

-- Pause exists only on a LIVE tasting while IN_PROGRESS; anything else clears it.
create or replace function public.tastings_pause_follows_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'IN_PROGRESS' or new.timing_mode <> 'LIVE' then
    new.paused_at := null;
  end if;
  return new;
end $$;
create trigger tastings_pause_follows_status
  before insert or update of status, paused_at, timing_mode on public.tastings
  for each row execute function public.tastings_pause_follows_status();

-- No reveal write while paused. It covers reveal_wine, reveal_next_category and
-- a host's direct update, without recreating a scoring function: reveal_wine
-- scores guesses before it flips wines.is_revealed, so this raise rolls that
-- scoring back in the same transaction.
create or replace function public.wines_refuse_reveal_while_paused()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.reveal_step > old.reveal_step or (new.is_revealed and not old.is_revealed))
     and exists (select 1 from tastings t where t.id = new.tasting_id and t.paused_at is not null)
  then
    raise exception 'The tasting is paused';
  end if;
  return new;
end $$;
create trigger wines_refuse_reveal_while_paused
  before update of reveal_step, is_revealed on public.wines
  for each row execute function public.wines_refuse_reveal_while_paused();
-- ===========================================================================
-- End of spec §7.4's first block.
-- ===========================================================================

-- The three functions run only as triggers: no client EXECUTE (M4, M5 and M6 do
-- the same for theirs).
revoke all on function public.tastings_pointer_in_tasting(), public.tastings_pause_follows_status(),
  public.wines_refuse_reveal_while_paused() from public, anon, authenticated;

-- get_tasting_leaderboard: the live definition with the t and live_round CTEs of
-- spec §7.4. CREATE OR REPLACE keeps its ACL (asserted below).
CREATE OR REPLACE FUNCTION public.get_tasting_leaderboard(p_tasting_id uuid)
 RETURNS TABLE(participant_id uuid, total integer, wines_scored integer, last_round_points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with t as (
    select
      timing_mode::text as timing_mode,
      coalesce(leaderboard_reveal::text, 'PER_ATTRIBUTE') as leaderboard_reveal,
      current_wine_id  -- the pour pointer (20260914100500), read by live_round
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
      -- Ahead of both picks above: the pour pointer's glass while its step
      -- reveal runs (20260914100500), so the round follows the glass being
      -- poured even when an earlier glass is also mid step-reveal.
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.id = t.current_wine_id and w.reveal_step > 0 and not w.is_revealed),
      -- Else the lowest-position glass mid step-reveal.
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.tasting_id = p_tasting_id and w.reveal_step > 0 and not w.is_revealed
        order by w.position limit 1),
      -- Else the glass with the newest scored_at among countable guesses.
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

-- ---------------------------------------------------------------------------
-- Post-state (spec §7.4 "Assertions"), same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_n int;
  v_sig text;
  v_expected text;
  v_pre text;
  v_post text;
  v_pre_out text;
  v_post_out text;
  v_marks text[] := array[E'\n  with t as (', E'\n  -- Reproduces the countability rule', E'\n  live_round as (', E'\n  -- ASYNC: per participant'];
  v_mark text;
  v_a int; v_b int; v_c int; v_d int;
  v_pa int; v_pb int; v_pc int; v_pd int;
begin
  -- 1. Every object M7 creates exists.
  select concat_ws(' / ',
     (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')),
     (select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") from pg_trigger t
       where t.tgname in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')),
     (select 'tastings.paused_at' from pg_attribute a
       where a.attrelid = 'public.tastings'::regclass and a.attname = 'paused_at' and not a.attisdropped))
    into v_text;
  if v_text is distinct from 'tastings_pause_follows_status(), tastings_pointer_in_tasting(), wines_refuse_reveal_while_paused() / tastings_pause_follows_status, tastings_pointer_in_tasting, wines_refuse_reveal_while_paused / tastings.paused_at' then
    raise exception 'the objects M7 creates are not all present, or others share their names: %', v_text;
  end if;

  -- 2. paused_at is timestamptz, nullable, with no default and no column ACL, so
  --    the host's write goes through the table grant and "tastings update host".
  select format('%s %s default=%s acl=%s', t.typname, case when a.attnotnull then 'not null' else 'null' end, a.atthasdef,
                coalesce(a.attacl::text, '-'))
    into v_text
  from pg_attribute a join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.tastings'::regclass and a.attname = 'paused_at' and not a.attisdropped;
  if v_text is distinct from 'timestamptz null default=f acl=-' then
    raise exception 'tastings.paused_at is not a nullable timestamptz without default or column ACL: %', v_text;
  end if;
  if not has_column_privilege('authenticated', 'public.tastings', 'paused_at', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.tastings', 'paused_at', 'SELECT') then
    raise exception 'authenticated cannot select or update tastings.paused_at (the host''s Pause write)';
  end if;

  -- 3. The three triggers as spec §7.4 defines them, enabled, with no WHEN
  --    clause, inside the full trigger sets on both tables.
  select string_agg(format('%s %s', t.tgenabled, pg_get_triggerdef(t.oid)), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgname in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')
    and not t.tgisinternal and t.tgqual is null;
  if v_text is distinct from 'O CREATE TRIGGER tastings_pause_follows_status BEFORE INSERT OR UPDATE OF status, paused_at, timing_mode ON public.tastings FOR EACH ROW EXECUTE FUNCTION tastings_pause_follows_status(); O CREATE TRIGGER tastings_pointer_in_tasting BEFORE INSERT OR UPDATE OF current_wine_id ON public.tastings FOR EACH ROW EXECUTE FUNCTION tastings_pointer_in_tasting(); O CREATE TRIGGER wines_refuse_reveal_while_paused BEFORE UPDATE OF reveal_step, is_revealed ON public.wines FOR EACH ROW EXECUTE FUNCTION wines_refuse_reveal_while_paused()' then
    raise exception 'the three M7 triggers are not as spec §7.4 defines them: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.tastings'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start; tastings_pause_follows_status 23 O tastings_pause_follows_status; tastings_pointer_in_tasting 23 O tastings_pointer_in_tasting; tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle' then
    raise exception 'the triggers on tastings after M7 are not the expected set: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal;
  if v_text is distinct from 'trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind; wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes; wines_full_reveal_step 19 O wines_full_reveal_step; wines_pin_adder 23 O wines_pin_adder; wines_refuse_reveal_while_paused 19 O wines_refuse_reveal_while_paused; wines_stamp_revealed_at 23 O wines_stamp_revealed_at; wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal' then
    raise exception 'the triggers on wines after M7 are not the expected set: %', v_text;
  end if;

  -- 4. The three trigger functions: SECURITY DEFINER exactly where spec §7.4
  --    writes it (the pointer and reveal checks read other rows whoever writes;
  --    the pause clear reads only NEW), search_path=public, the reviewed bodies
  --    (md5 without carriage returns), and no client EXECUTE.
  foreach v_sig in array array['public.tastings_pointer_in_tasting()', 'public.tastings_pause_follows_status()',
                               'public.wines_refuse_reveal_while_paused()'] loop
    select format('secdef=%s config=%s volatile=%s lang=%s returns=%s args=(%s) acl=%s md5=%s',
             p.prosecdef, p.proconfig::text, p.provolatile, l.lanname, pg_get_function_result(p.oid),
             pg_get_function_identity_arguments(p.oid), p.proacl::text, md5(replace(p.prosrc, chr(13), '')))
      into v_text
    from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(v_sig);
    v_expected := case v_sig
      when 'public.tastings_pointer_in_tasting()' then 'secdef=t config={search_path=public} volatile=v lang=plpgsql returns=trigger args=() acl={postgres=X/postgres,service_role=X/postgres} md5=76a506bf2c46bb4ef9800eabe6da8890'
      when 'public.tastings_pause_follows_status()' then 'secdef=f config={search_path=public} volatile=v lang=plpgsql returns=trigger args=() acl={postgres=X/postgres,service_role=X/postgres} md5=68a9bfcb6564888af5ccc5c82846de68'
      when 'public.wines_refuse_reveal_while_paused()' then 'secdef=t config={search_path=public} volatile=v lang=plpgsql returns=trigger args=() acl={postgres=X/postgres,service_role=X/postgres} md5=b0a0214647ff114e54ef792de588d3ab'
    end;
    if v_text is distinct from v_expected then
      raise exception '% is not the reviewed trigger function: %', v_sig, v_text;
    end if;
    if has_function_privilege('authenticated', v_sig, 'EXECUTE') or has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception '% is executable by a client role', v_sig;
    end if;
  end loop;

  -- 5. get_tasting_leaderboard keeps its signature, result columns, SQL
  --    STABLE SECURITY DEFINER, search_path and ACL, carries the reviewed body,
  --    and differs from the live body only inside the t and live_round CTEs.
  select count(*) into v_n from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'get_tasting_leaderboard';
  if v_n <> 1 then
    raise exception 'expected exactly one public.get_tasting_leaderboard after M7, found %', v_n;
  end if;
  select format('secdef=%s config=%s volatile=%s lang=%s returns=%s args=(%s) acl=%s md5=%s',
           p.prosecdef, p.proconfig::text, p.provolatile, l.lanname, pg_get_function_result(p.oid),
           pg_get_function_identity_arguments(p.oid), p.proacl::text, md5(replace(p.prosrc, chr(13), '')))
    into v_text
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.get_tasting_leaderboard(uuid)');
  if v_text is distinct from 'secdef=t config={search_path=public} volatile=s lang=sql returns=TABLE(participant_id uuid, total integer, wines_scored integer, last_round_points integer) args=(p_tasting_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=01bb23814292030c648de0960794bba1' then
    raise exception 'get_tasting_leaderboard is not the reviewed function: %', v_text;
  end if;
  select l.src into v_pre from m7_pre_leaderboard l;
  select replace(p.prosrc, chr(13), '') into v_post from pg_proc p where p.oid = to_regprocedure('public.get_tasting_leaderboard(uuid)');
  foreach v_mark in array v_marks loop
    if (length(v_pre) - length(replace(v_pre, v_mark, ''))) / length(v_mark) <> 1
       or (length(v_post) - length(replace(v_post, v_mark, ''))) / length(v_mark) <> 1 then
      raise exception 'the leaderboard body before or after M7 does not carry the marker % exactly once', v_mark;
    end if;
  end loop;
  v_a := strpos(v_pre, v_marks[1]);  v_b := strpos(v_pre, v_marks[2]);
  v_c := strpos(v_pre, v_marks[3]);  v_d := strpos(v_pre, v_marks[4]);
  v_pa := strpos(v_post, v_marks[1]); v_pb := strpos(v_post, v_marks[2]);
  v_pc := strpos(v_post, v_marks[3]); v_pd := strpos(v_post, v_marks[4]);
  if not (v_a < v_b and v_b < v_c and v_c < v_d and v_pa < v_pb and v_pb < v_pc and v_pc < v_pd) then
    raise exception 'the leaderboard CTE markers are out of order';
  end if;
  -- Outside the two CTEs: the text before t, from the countable comment up to
  -- live_round, and from the async comment on.
  v_pre_out := substr(v_pre, 1, v_a - 1) || substr(v_pre, v_b, v_c - v_b) || substr(v_pre, v_d);
  v_post_out := substr(v_post, 1, v_pa - 1) || substr(v_post, v_pb, v_pc - v_pb) || substr(v_post, v_pd);
  if v_pre_out is distinct from v_post_out then
    raise exception 'get_tasting_leaderboard changed outside its t and live_round CTEs';
  end if;
  if substr(v_pre, v_a, v_b - v_a) = substr(v_post, v_pa, v_pb - v_pa)
     or substr(v_pre, v_c, v_d - v_c) = substr(v_post, v_pc, v_pd - v_pc) then
    raise exception 'get_tasting_leaderboard''s t or live_round CTE did not change';
  end if;

  -- 6. Everything else is untouched: every other public function (body, ACL,
  --    definer, config, volatility; the scoring engine among them), every
  --    policy, every other trigger, every relation's ACL and every constraint.
  select string_agg(coalesce(pre.sig, cur.sig), ', ' order by coalesce(pre.sig, cur.sig) collate "C")
    into v_text
  from m7_pre_functions pre
  full join (select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body, p.proacl::text as acl,
                    p.prosecdef, p.proconfig::text as config, p.provolatile
             from pg_proc p where p.pronamespace = 'public'::regnamespace) cur on cur.oid = pre.oid
  where coalesce(pre.sig, cur.sig) not in (
          'get_tasting_leaderboard(uuid)', 'tastings_pointer_in_tasting()', 'tastings_pause_follows_status()',
          'wines_refuse_reveal_while_paused()')
    and (pre.oid is null or cur.oid is null
         or (pre.sig, pre.body, pre.acl, pre.prosecdef, pre.config, pre.provolatile)
            is distinct from (cur.sig, cur.body, cur.acl, cur.prosecdef, cur.config, cur.provolatile));
  if v_text is not null then
    raise exception 'M7 changed a function it does not own: %', v_text;
  end if;
  select string_agg(format('%s.%s', coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)), ', ')
    into v_text
  from m7_pre_policies pre
  full join (select p.tablename::text as tablename, p.policyname::text as policyname, p.cmd, p.roles::text as roles, p.permissive,
                    p.qual, p.with_check
             from pg_policies p where p.schemaname = 'public') cur
    on cur.tablename = pre.tablename and cur.policyname = pre.policyname
  where pre.policyname is null or cur.policyname is null
     or (pre.cmd, pre.roles, pre.permissive, pre.qual, pre.with_check)
        is distinct from (cur.cmd, cur.roles, cur.permissive, cur.qual, cur.with_check);
  if v_text is not null then
    raise exception 'M7 changed a policy: %', v_text;
  end if;
  select string_agg(format('%s.%s', coalesce(pre.tbl, cur.tbl), coalesce(pre.tgname, cur.tgname)), ', ')
    into v_text
  from m7_pre_triggers pre
  full join (select t.tgrelid::regclass::text as tbl, t.tgname::text as tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) cur
    on cur.tbl = pre.tbl and cur.tgname = pre.tgname
  where coalesce(pre.tgname, cur.tgname) not in ('tastings_pointer_in_tasting', 'tastings_pause_follows_status', 'wines_refuse_reveal_while_paused')
    and (pre.tgname is null or cur.tgname is null or (pre.tgenabled, pre.def) is distinct from (cur.tgenabled, cur.def));
  if v_text is not null then
    raise exception 'M7 changed a trigger it does not own: %', v_text;
  end if;
  select string_agg(coalesce(pre.relname, cur.relname), ', ')
    into v_text
  from m7_pre_acls pre
  full join (select c.relname::text as relname, c.relacl::text as relacl,
                    (select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
                       from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null) as attacl
             from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')) cur
    on cur.relname = pre.relname
  where pre.relname is null or cur.relname is null or (pre.relacl, pre.attacl) is distinct from (cur.relacl, cur.attacl);
  if v_text is not null then
    raise exception 'M7 changed a relation ACL: %', v_text;
  end if;
  select string_agg(format('%s.%s', coalesce(pre.tbl, cur.tbl), coalesce(pre.conname, cur.conname)), ', ')
    into v_text
  from m7_pre_constraints pre
  full join (select c.conrelid::regclass::text as tbl, c.conname::text as conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c join pg_class r on r.oid = c.conrelid
             where r.relnamespace = 'public'::regnamespace) cur
    on cur.tbl = pre.tbl and cur.conname = pre.conname
  where pre.conname is null or cur.conname is null or pre.def is distinct from cur.def;
  if v_text is not null then
    raise exception 'M7 changed a constraint: %', v_text;
  end if;

  -- Informational.
  select format('tastings %s: with a pour pointer %s, paused %s', count(*), count(*) filter (where t.current_wine_id is not null),
                count(*) filter (where t.paused_at is not null))
    into v_text
  from public.tastings t;
  raise notice 'tasting pacing: %', v_text;
end $$;
