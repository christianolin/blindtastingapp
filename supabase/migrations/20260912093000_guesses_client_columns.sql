-- guesses: the scoring columns are server-only; a client guess write must come
-- from the caller's own JOINED participant row, as an eligible guesser of that
-- glass, before the glass's reveal starts, on an unscored row, with a candidate
-- from the same tasting; get_wine_reveal serves JOINED participants (and the
-- host) only; no client may call reveal_own_next_category; anon and PUBLIC lose
-- EXECUTE on the game RPCs.
--
-- Blind-tasting ledger B13.4 and item 12 of
-- docs/superpowers/plans/2026-09-12-add-wine-v2-scan-and-flow-fixes.md.
-- Written against the LIVE state (read-only dump, 2026-09-12), never an older
-- migration file; get_wine_reveal is recreated from pg_get_functiondef.
--
-- The holes (adversarial verification of 20260912090000 and 20260912092000, and
-- of the first draft of this file):
-- * public.guesses carried Supabase's default table ACL: anon and authenticated
--   held INSERT and UPDATE on every column, the server-only ones included
--   (scored_at, the eight *_points columns, total_points, reveal_step).
-- * "guesses insert own" and "guesses update own" only required participant_id
--   to be a tasting_participants row with user_id = auth.uid(): no binding to
--   the wine's tasting, no status, no eligibility. A guess could be written by
--   an INVITED or DECLINED participant, on a glass of any tasting, by the
--   wine's bring-your-own contributor (a perfect guess on their own bottle,
--   which reveal_wine scores and get_tasting_leaderboard counts), or by the
--   HOST_PROVIDES host who set the answer.
-- * A guess stayed client-writable after it was scored and after its glass's
--   shared reveal started, and reveal_wine re-scores every row from its current
--   fields. An ASYNC IMMEDIATE guesser who had scored their own guess (and so
--   could read the answer), or a LIVE guesser shown a category mid-reveal,
--   could rewrite the guess to the answer and be paid for it, and a new row
--   could still be inserted after the first step.
-- * guessed_wine_id could name a wine of any tasting. Once the guesser's glass
--   was revealed, that wine's ON DELETE SET NULL tripped
--   guesses_block_after_reveal, so the stranger could no longer delete the
--   wine, its tasting or (through tastings.host_id) their profile.
-- * get_wine_reveal looked the caller's participant row up with no status
--   filter: INVITED and DECLINED participants were served the room's LIVE step
--   reveal and fully revealed glasses.
-- * reveal_own_next_category (self-paced; nothing in src/ calls it) let any
--   JOINED participant step their own guesses.reveal_step in every ASYNC
--   tasting (AFTER_ALL or IMMEDIATE, DRAFT or started, locked or not) and in
--   LIVE tastings without guided pacing. get_wine_reveal's ASYNC branch serves
--   the answer up to that step, so the whole answer key was one loop away
--   before anyone else had guessed; in LIVE each step wrote a right/wrong point
--   to the caller's readable row. The contributor and the HOST_PROVIDES host
--   could step too.
-- * anon and PUBLIC held EXECUTE on every game RPC (Supabase's default ACL).
--
-- What this migration does:
-- 1. Column privileges. INSERT and UPDATE on public.guesses are revoked from
--    PUBLIC, anon and authenticated, then authenticated is granted INSERT and
--    UPDATE on exactly the 14 client columns: wine_id, participant_id, the ten
--    guess fields, guessed_wine_id and locked_at. anon gets no write privilege.
--    The 14 server-only columns (id, the eight *_points, total_points,
--    scored_at, reveal_step, submitted_at, updated_at) get none: only column
--    defaults, the guesses_set_updated_at trigger and the SECURITY DEFINER
--    scoring functions (owned by postgres, the table owner) write them.
--    SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN stay exactly as
--    live, and service_role is untouched.
--    UPDATE on wine_id and participant_id is needed: submitGuess and
--    submitAllMatchGuesses PATCH them back unchanged, and a PostgREST upsert
--    (B7's onConflict wine_id, participant_id; B9's per-glass assignment) lists
--    every payload column in ON CONFLICT DO UPDATE SET, the conflict columns
--    included.
-- 2. guesses_pin_identity. Because UPDATE on wine_id and participant_id is
--    granted, a BEFORE UPDATE row trigger refuses any change to either, for
--    every role (the 20260912091000 pattern). Otherwise a caller could move a
--    guess onto another glass or participant. Nothing legitimate moves a guess:
--    both FKs are ON DELETE CASCADE with no ON UPDATE action, the scoring
--    functions write only points, scored_at and reveal_step, and a PATCH or
--    upsert restating the same ids passes (IS DISTINCT FROM).
-- 3. Two SECURITY DEFINER helpers (cross-table RLS goes through helpers,
--    CLAUDE.md), each answering only for the caller's own participant row:
--    * is_own_joined_participant_for_wine(participant, wine): the row is the
--      caller's, JOINED, and in the wine's tasting.
--    * is_open_guess_target(participant, wine, guessed_wine): that participant
--      may still guess that glass. They are not its contributor and not the
--      HOST_PROVIDES host, the glass's shared reveal has not started
--      (wines.reveal_step = 0), and a guessed_wine_id, when set, is a glass of
--      the same tasting.
--    "guesses insert own" WITH CHECK is both helpers. "guesses update own"
--    USING and WITH CHECK are both helpers plus scored_at is null and
--    reveal_step = 0, so a scored or stepped row is frozen for clients. Both are
--    altered in place (name, PERMISSIVE, TO authenticated and command stay);
--    "guesses read" is untouched. These are the app's own rules: resolveGuesser
--    (JOINED, not the HOST_PROVIDES host), guessBlockReason in
--    src/lib/guess-guards.ts (not revealed, reveal_step 0, not your bottle),
--    submitGuess / lockGuess / unlockGuess refusing scored rows, and reveal_wine's
--    eligibility rule (20260912092000). Locked rows stay writable: "Change it"
--    clears locked_at. guesses_block_after_reveal still guards revealed glasses,
--    and the SECURITY DEFINER scorers run as the table owner, outside RLS.
-- 4. get_wine_reveal: the participant lookup adds status = 'JOINED'. Every app
--    caller is JOINED already (PlayExperience returns null unless JOINED; the
--    Overview live banner needs a JOINED tasting), and the host keeps access
--    through the host test. The host and the wine's contributor are still
--    served: both already read the answer key through "wine_answers read". The
--    ASYNC branch still trusts the caller's own guesses.reveal_step; after 1.
--    and 5. no client-reachable path writes that column (reveal_wine,
--    reveal_next_category and score_own_guess never touch it), so it stays 0 on
--    every client-written row.
-- 5. EXECUTE on reveal_wine, reveal_next_category, score_own_guess,
--    get_wine_reveal, tasting_guess_status, get_tasting_leaderboard,
--    join_tasting_by_code and ensure_join_code is revoked from PUBLIC and anon
--    and granted explicitly to authenticated and service_role (both already
--    held it). reveal_own_next_category is revoked from PUBLIC, anon AND
--    authenticated and kept for service_role only: nothing in src/ calls it,
--    scripts/progressive-reveal.test.mjs calls it as the owner, and a
--    service_role caller has no auth.uid(), so it gets 'Not a participant'. Its
--    body is not recreated (an ACL survives CREATE OR REPLACE). Granting it to
--    clients again is its own item: it must first be limited to started ASYNC
--    IMMEDIATE tastings and a locked guess, and get_wine_reveal's ASYNC branch
--    with it. No signed-out flow calls these RPCs: /j/[code] redirects to /login
--    before join_tasting_by_code, and login, signup and the auth callbacks call
--    none. The policy helpers (has_scored_guess, is_tasting_host,
--    is_tasting_participant, tasting_has_revealed_wine, can_view_cellar) and
--    in_play_steps (called by the wines_full_reveal_step trigger in the
--    caller's role) keep their ACLs. get_tasting_leaderboard is only
--    re-granted, never recreated here; 20260912106000's CREATE OR REPLACE keeps
--    this ACL.
--
-- Every client write to guesses and the columns it names (all inside the grant):
-- * play/actions.ts submitGuess: insert, or PATCH where id, of {wine_id,
--   participant_id, country_id, region_id, appellation_id, primary_grape_id,
--   secondary_grape_id, producer_id, type_designation_id, vintage_kind,
--   vintage_year, vintage_tawny_years}.
-- * lockGuess: blank-row insert {wine_id, participant_id, locked_at}, or PATCH
--   {locked_at} where id. unlockGuess: PATCH {locked_at: null} where id.
--   lockGuesses: PATCH {locked_at} where id in (...).
-- * submitAllMatchGuesses: insert, or PATCH where id, of {wine_id,
--   participant_id, guessed_wine_id}. It does not check that guessed_wine_id
--   is a glass of the tasting; the policies now do.
-- * Planned: B7's per-field-group upsert (onConflict wine_id, participant_id)
--   of wine_id, participant_id and one field group; B9's per-glass assignment
--   (guessed_wine_id), swap, clear (guessed_wine_id and locked_at null) and
--   per-glass lock (locked_at); B9's reveal-time clear of other glasses runs
--   inside reveal_wine. T5 adds no guess payload (scoreLockedGuess only calls
--   score_own_guess).
-- * scripts/seed-demo-people.mjs inserts guesses with the service-role key and
--   reveals as the signed-in host: unaffected.
--
-- Not closed here (each needs its own item):
-- * score_own_guess scores the caller's row whether or not it is locked. Such a
--   row is then frozen unlocked, so it never counts as locked and an ASYNC
--   IMMEDIATE glass waits for the host's reveal, as it would for a taster who
--   never locks. No points can change once the answer is readable.
-- * A semi-blind guess may still pick a candidate of its own tasting that a
--   revealed glass then holds; deleting that one candidate (the planned B2
--   "Remove after Start") fails in guesses_block_after_reveal on the SET NULL.
--   The fix belongs in that trigger, not here.
-- * Tasting status (DRAFT, CLOSED) is not a write rule here; resolveGuesser
--   refuses both, and reveal_wine refuses CLOSED tastings.
-- * get_wine_reveal returns in_play_count at step 0 and in_play_steps is
--   callable by anyone, so whether a glass has an appellation or a type
--   designation leaks (handoff rule 1).
-- * tasting_guess_status and get_tasting_leaderboard accept INVITED and
--   DECLINED participants (is_tasting_participant).
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot.
-- ---------------------------------------------------------------------------
create temp table guesses_093000_cols as
select a.attname::text as col, r.role,
       has_column_privilege(r.role::name, 'public.guesses'::regclass::oid, a.attname::text, 'SELECT') as sel,
       has_column_privilege(r.role::name, 'public.guesses'::regclass::oid, a.attname::text, 'INSERT') as ins,
       has_column_privilege(r.role::name, 'public.guesses'::regclass::oid, a.attname::text, 'UPDATE') as upd,
       has_column_privilege(r.role::name, 'public.guesses'::regclass::oid, a.attname::text, 'REFERENCES') as ref
from pg_attribute a
cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as r (role)
where a.attrelid = 'public.guesses'::regclass
  and a.attnum > 0
  and not a.attisdropped;

create temp table guesses_093000_acl as
select x.grantor, x.grantee, x.privilege_type, x.is_grantable
from pg_class c, lateral aclexplode(c.relacl) x
where c.oid = 'public.guesses'::regclass;

create temp table guesses_093000_policies as
select pol.policyname::text as policyname, pol.permissive, pol.roles::text as roles, pol.cmd,
       replace(pol.qual, 'public.', '') as qual,
       replace(pol.with_check, 'public.', '') as with_check
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename = 'guesses';

create temp table guesses_093000_triggers as
select t.tgname::text as tgname, t.tgtype, t.tgenabled, t.tgfoid, t.tgattr::text as tgattr
from pg_trigger t
where t.tgrelid = 'public.guesses'::regclass and not t.tgisinternal;

create temp table guesses_093000_functions as
select s.sig, p.oid, replace(p.prosrc, chr(13), '') as src, p.proacl::text as acl, p.prosecdef,
       p.proconfig::text as config, p.proowner, p.provolatile, p.prorettype, p.prolang
from unnest(array[
  'public.reveal_wine(uuid)',
  'public.reveal_next_category(uuid,smallint)',
  'public.reveal_own_next_category(uuid,smallint)',
  'public.score_own_guess(uuid)',
  'public.get_wine_reveal(uuid)',
  'public.tasting_guess_status(uuid)',
  'public.get_tasting_leaderboard(uuid)',
  'public.join_tasting_by_code(text)',
  'public.ensure_join_code(uuid)',
  'public.has_scored_guess(uuid)',
  'public.is_tasting_host(uuid)',
  'public.is_tasting_participant(uuid)',
  'public.tasting_has_revealed_wine(uuid)',
  'public.in_play_steps(uuid)',
  'public.can_view_cellar(uuid)'
]) as s (sig)
left join pg_proc p on p.oid = to_regprocedure(s.sig);

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  c_columns constant text := 'appellation_id,appellation_points,country_id,country_points,guessed_wine_id,id,locked_at,participant_id,primary_grape_id,primary_grape_points,producer_id,producer_points,region_id,region_points,reveal_step,scored_at,secondary_grape_id,secondary_grape_points,submitted_at,total_points,type_designation_id,type_designation_points,updated_at,vintage_kind,vintage_points,vintage_tawny_years,vintage_year,wine_id';
  v_text text;
begin
  select string_agg(col, ',' order by col) into v_text
  from guesses_093000_cols where role = 'anon';
  if v_text is distinct from c_columns then
    raise exception 'guesses columns differ from the 28 this migration classifies: %', v_text;
  end if;

  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.guesses'::regclass and a.attnum > 0 and a.attacl is not null) then
    raise exception 'guesses already carries column-level grants; re-dump and rebuild this migration';
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.guesses'::regclass) then
    raise exception 'row level security is off on guesses';
  end if;

  select string_agg(coalesce(e.policyname, l.policyname), '; ') into v_text
  from (values
    ('guesses insert own', 'PERMISSIVE', '{authenticated}', 'INSERT', null, '25774c6f9e749f91f4681fca7d2027ae'),
    ('guesses read', 'PERMISSIVE', '{authenticated}', 'SELECT', 'aadad70c1422fd9e01a7be4da3779546', null),
    ('guesses update own', 'PERMISSIVE', '{authenticated}', 'UPDATE', '25774c6f9e749f91f4681fca7d2027ae', '25774c6f9e749f91f4681fca7d2027ae')
  ) as e (policyname, permissive, roles, cmd, qual_md5, check_md5)
  full join guesses_093000_policies l on l.policyname = e.policyname
  where e.policyname is null
     or l.policyname is null
     or l.permissive is distinct from e.permissive
     or l.roles is distinct from e.roles
     or l.cmd is distinct from e.cmd
     or md5(l.qual) is distinct from e.qual_md5
     or md5(l.with_check) is distinct from e.check_md5;
  if v_text is not null then
    raise exception 'guesses policies differ from the live ones this migration was written against: %', v_text;
  end if;

  select string_agg(tgname, ',' order by tgname) into v_text from guesses_093000_triggers;
  if v_text is distinct from 'guesses_block_after_reveal,guesses_set_updated_at' then
    raise exception 'guesses triggers differ from the live ones this migration was written against: %', v_text;
  end if;

  select string_agg(sig, ', ') into v_text from guesses_093000_functions where oid is null;
  if v_text is not null then
    raise exception 'functions missing pre-migration: %', v_text;
  end if;
  if (select md5(src) from guesses_093000_functions where sig = 'public.get_wine_reveal(uuid)') <> '73658c0ad48d7c091814a0485178a6f8' then
    raise exception 'get_wine_reveal differs from the live body this migration was built from; rebuild it from pg_get_functiondef';
  end if;

  if to_regprocedure('public.is_own_joined_participant_for_wine(uuid,uuid)') is not null
     or to_regprocedure('public.is_open_guess_target(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.pin_guess_identity()') is not null then
    raise exception 'is_own_joined_participant_for_wine, is_open_guess_target or pin_guess_identity already exists';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Column privileges.
-- ---------------------------------------------------------------------------
revoke insert, update on table public.guesses from public, anon, authenticated;

grant insert (
  wine_id, participant_id,
  country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
  producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
  guessed_wine_id, locked_at
) on table public.guesses to authenticated;

grant update (
  wine_id, participant_id,
  country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
  producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
  guessed_wine_id, locked_at
) on table public.guesses to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A guess never moves to another glass or participant.
-- ---------------------------------------------------------------------------
create function public.pin_guess_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.wine_id is distinct from old.wine_id then
    raise exception 'a guess cannot move to another glass'
      using errcode = 'insufficient_privilege',
            hint = 'Write a guess on the other glass instead.';
  end if;
  if new.participant_id is distinct from old.participant_id then
    raise exception 'a guess cannot change hands'
      using errcode = 'insufficient_privilege',
            hint = 'Write a guess for that participant instead.';
  end if;
  return new;
end;
$$;

create trigger guesses_pin_identity
  before update on public.guesses
  for each row execute function public.pin_guess_identity();

-- ---------------------------------------------------------------------------
-- 3. Guess writes: the caller's own JOINED row, an eligible guesser, a glass
--    whose reveal has not started, a candidate from the same tasting.
-- ---------------------------------------------------------------------------
create function public.is_own_joined_participant_for_wine(p_participant_id uuid, p_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tasting_participants p
    join wines w on w.tasting_id = p.tasting_id
    where p.id = p_participant_id
      and w.id = p_wine_id
      and p.user_id = auth.uid()
      and p.status = 'JOINED'
  );
$$;

revoke execute on function public.is_own_joined_participant_for_wine(uuid, uuid) from public, anon;
grant execute on function public.is_own_joined_participant_for_wine(uuid, uuid) to authenticated;

create function public.is_open_guess_target(p_participant_id uuid, p_wine_id uuid, p_guessed_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tasting_participants p
    join wines w on w.tasting_id = p.tasting_id
    join tastings t on t.id = w.tasting_id
    where p.id = p_participant_id
      and w.id = p_wine_id
      and p.user_id = auth.uid()
      and w.reveal_step = 0
      and w.contributor_participant_id is distinct from p.id
      and not (t.wine_source = 'HOST_PROVIDES' and t.host_id = p.user_id)
      and (p_guessed_wine_id is null
           or exists (select 1 from wines gw
                      where gw.id = p_guessed_wine_id and gw.tasting_id = w.tasting_id))
  );
$$;

revoke execute on function public.is_open_guess_target(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_open_guess_target(uuid, uuid, uuid) to authenticated;

alter policy "guesses insert own" on public.guesses
  with check (
    public.is_own_joined_participant_for_wine(participant_id, wine_id)
    and public.is_open_guess_target(participant_id, wine_id, guessed_wine_id)
  );

alter policy "guesses update own" on public.guesses
  using (
    public.is_own_joined_participant_for_wine(participant_id, wine_id)
    and public.is_open_guess_target(participant_id, wine_id, guessed_wine_id)
    and scored_at is null
    and reveal_step = 0
  )
  with check (
    public.is_own_joined_participant_for_wine(participant_id, wine_id)
    and public.is_open_guess_target(participant_id, wine_id, guessed_wine_id)
    and scored_at is null
    and reveal_step = 0
  );

-- ---------------------------------------------------------------------------
-- 4. get_wine_reveal serves JOINED participants (and the host) only.
--    LIVE pg_get_functiondef; the only edit is "and status = 'JOINED'".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wine_reveal(p_wine_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tasting uuid; v_timing text; v_is_revealed boolean; v_is_host boolean;
  v_pid uuid; v_all text[]; v_step int; v_scope_all boolean;
  v_correct jsonb := '{}'::jsonb; v_guesses jsonb := '[]'::jsonb;
  v_key text; i int; g record; v_vals jsonb; v_pts jsonb;
begin
  select w.tasting_id, w.is_revealed, t.timing_mode::text, t.host_id = auth.uid()
    into v_tasting, v_is_revealed, v_timing, v_is_host
  from wines w join tastings t on t.id = w.tasting_id where w.id = p_wine_id;
  if v_tasting is null then return null; end if;
  select id into v_pid from tasting_participants
    where tasting_id = v_tasting and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null and not coalesce(v_is_host, false) then return null; end if;

  if not exists (select 1 from wine_answers where wine_id = p_wine_id) then
    return null;
  end if;
  v_all := in_play_steps(p_wine_id);

  if v_is_revealed then
    v_step := coalesce(array_length(v_all, 1), 0); v_scope_all := true;
  elsif v_timing = 'LIVE' then
    select reveal_step into v_step from wines where id = p_wine_id;
    v_scope_all := true;
  else
    select reveal_step into v_step from guesses
      where wine_id = p_wine_id and participant_id = v_pid;
    v_step := coalesce(v_step, 0); v_scope_all := false;
  end if;
  v_step := coalesce(v_step, 0);

  for i in 1..v_step loop
    v_correct := v_correct || reveal_answer_cell(p_wine_id, v_all[i]);
  end loop;

  for g in
    select id, participant_id from guesses
    where wine_id = p_wine_id and (v_scope_all or participant_id = v_pid)
  loop
    v_vals := '{}'::jsonb; v_pts := '{}'::jsonb;
    for i in 1..v_step loop
      v_key := v_all[i];
      v_vals := v_vals || reveal_guess_cell(g.id, v_key);
      v_pts := v_pts || reveal_points_cell(g.id, v_key);
    end loop;
    v_guesses := v_guesses || jsonb_build_array(jsonb_build_object(
      'participant_id', g.participant_id, 'values', v_vals, 'points', v_pts));
  end loop;

  return jsonb_build_object(
    'reveal_step', v_step,
    'in_play_count', coalesce(array_length(v_all, 1), 0),
    'is_fully_revealed', coalesce(v_is_revealed, false),
    'revealed_keys', to_jsonb(v_all[1:v_step]),
    'correct', v_correct,
    'guesses', v_guesses);
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Game RPCs: signed-in callers only. reveal_own_next_category: no client.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.reveal_wine(uuid),
  public.reveal_next_category(uuid, smallint),
  public.score_own_guess(uuid),
  public.get_wine_reveal(uuid),
  public.tasting_guess_status(uuid),
  public.get_tasting_leaderboard(uuid),
  public.join_tasting_by_code(text),
  public.ensure_join_code(uuid)
from public, anon;

grant execute on function
  public.reveal_wine(uuid),
  public.reveal_next_category(uuid, smallint),
  public.score_own_guess(uuid),
  public.get_wine_reveal(uuid),
  public.tasting_guess_status(uuid),
  public.get_tasting_leaderboard(uuid),
  public.join_tasting_by_code(text),
  public.ensure_join_code(uuid)
to authenticated, service_role;

revoke execute on function public.reveal_own_next_category(uuid, smallint) from public, anon, authenticated;
grant execute on function public.reveal_own_next_category(uuid, smallint) to service_role;

-- ---------------------------------------------------------------------------
-- Same-transaction assertions (never trust "version recorded").
-- ---------------------------------------------------------------------------
do $$
declare
  c_client constant text[] := array[
    'wine_id', 'participant_id', 'country_id', 'region_id', 'appellation_id', 'primary_grape_id',
    'secondary_grape_id', 'producer_id', 'type_designation_id', 'vintage_kind', 'vintage_year',
    'vintage_tawny_years', 'guessed_wine_id', 'locked_at'];
  c_server constant text[] := array[
    'id', 'country_points', 'region_points', 'appellation_points', 'primary_grape_points',
    'secondary_grape_points', 'producer_points', 'type_designation_points', 'vintage_points',
    'total_points', 'scored_at', 'reveal_step', 'submitted_at', 'updated_at'];
  c_rpcs constant text[] := array[
    'public.reveal_wine(uuid)', 'public.reveal_next_category(uuid,smallint)',
    'public.score_own_guess(uuid)',
    'public.get_wine_reveal(uuid)', 'public.tasting_guess_status(uuid)',
    'public.get_tasting_leaderboard(uuid)', 'public.join_tasting_by_code(text)',
    'public.ensure_join_code(uuid)'];
  c_rpc_acl constant text := '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  c_rown constant text := 'public.reveal_own_next_category(uuid,smallint)';
  c_rown_acl constant text := '{postgres=X/postgres,service_role=X/postgres}';
  c_helper_call constant text := 'is_own_joined_participant_for_wine(participant_id, wine_id)';
  c_target_call constant text := 'is_open_guess_target(participant_id, wine_id, guessed_wine_id)';
  c_insert_check constant text := '(is_own_joined_participant_for_wine(participant_id, wine_id) AND is_open_guess_target(participant_id, wine_id, guessed_wine_id))';
  c_update_expr constant text := '(is_own_joined_participant_for_wine(participant_id, wine_id) AND is_open_guess_target(participant_id, wine_id, guessed_wine_id) AND (scored_at IS NULL) AND (reveal_step = 0))';
  c_helper_body constant text := $lit$select exists ( select 1 from tasting_participants p join wines w on w.tasting_id = p.tasting_id where p.id = p_participant_id and w.id = p_wine_id and p.user_id = auth.uid() and p.status = 'JOINED' );$lit$;
  c_target_body constant text := $lit$select exists ( select 1 from tasting_participants p join wines w on w.tasting_id = p.tasting_id join tastings t on t.id = w.tasting_id where p.id = p_participant_id and w.id = p_wine_id and p.user_id = auth.uid() and w.reveal_step = 0 and w.contributor_participant_id is distinct from p.id and not (t.wine_source = 'HOST_PROVIDES' and t.host_id = p.user_id) and (p_guessed_wine_id is null or exists (select 1 from wines gw where gw.id = p_guessed_wine_id and gw.tasting_id = w.tasting_id)) );$lit$;
  -- The body edits, CR-stripped like every body compared here (a checkout with
  -- CRLF line endings must not fail the comparison).
  c_gwr_old constant text := replace($lit$    where tasting_id = v_tasting and user_id = auth.uid();
  if v_pid is null and not coalesce(v_is_host, false) then return null; end if;$lit$, chr(13), '');
  c_gwr_new constant text := replace($lit$    where tasting_id = v_tasting and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null and not coalesce(v_is_host, false) then return null; end if;$lit$, chr(13), '');
  c_guesses constant oid := 'public.guesses'::regclass::oid;
  c_anon constant oid := 'anon'::regrole::oid;
  c_authenticated constant oid := 'authenticated'::regrole::oid;
  v_text text;
  v_oid oid;
  v_count int;
  v_fn record;
begin
  -- 1. The 28 columns are exactly 14 client columns plus 14 server-only ones.
  if cardinality(c_client) <> 14 or cardinality(c_server) <> 14
     or (select count(*) from guesses_093000_cols where role = 'anon') <> 28
     or exists (select 1 from guesses_093000_cols b
                where b.role = 'anon' and (b.col = any(c_client)) = (b.col = any(c_server))) then
    raise exception 'guesses columns are not exactly the 14 client plus 14 server-only columns';
  end if;

  -- 2. Effective column privileges, per role and column: authenticated may
  --    INSERT and UPDATE exactly the client columns, anon and PUBLIC nothing,
  --    service_role as before; SELECT and REFERENCES as before for every role.
  select string_agg(format('%s.%s', a.role, a.col), ', ' order by a.role, a.col) into v_text
  from (
    select b.*,
           has_column_privilege(b.role::name, c_guesses, b.col, 'SELECT') as sel_now,
           has_column_privilege(b.role::name, c_guesses, b.col, 'INSERT') as ins_now,
           has_column_privilege(b.role::name, c_guesses, b.col, 'UPDATE') as upd_now,
           has_column_privilege(b.role::name, c_guesses, b.col, 'REFERENCES') as ref_now
    from guesses_093000_cols b
  ) a
  where a.sel_now is distinct from a.sel
     or a.ref_now is distinct from a.ref
     or a.ins_now is distinct from (case a.role when 'authenticated' then a.col = any(c_client)
                                                when 'service_role' then a.ins else false end)
     or a.upd_now is distinct from (case a.role when 'authenticated' then a.col = any(c_client)
                                                when 'service_role' then a.upd else false end);
  if v_text is not null then
    raise exception 'guesses column privileges differ from the client-column matrix: %', v_text;
  end if;
  if has_table_privilege('anon', c_guesses, 'INSERT') or has_table_privilege('anon', c_guesses, 'UPDATE')
     or has_table_privilege('authenticated', c_guesses, 'INSERT') or has_table_privilege('authenticated', c_guesses, 'UPDATE')
     or has_any_column_privilege('anon', c_guesses, 'INSERT') or has_any_column_privilege('anon', c_guesses, 'UPDATE')
     or has_any_column_privilege('public', c_guesses, 'INSERT') or has_any_column_privilege('public', c_guesses, 'UPDATE') then
    raise exception 'a client role still holds table-level INSERT or UPDATE on guesses';
  end if;
  if not has_table_privilege('anon', c_guesses, 'SELECT') or not has_table_privilege('authenticated', c_guesses, 'SELECT')
     or not has_table_privilege('anon', c_guesses, 'DELETE') or not has_table_privilege('authenticated', c_guesses, 'DELETE') then
    raise exception 'guesses SELECT or DELETE grants changed';
  end if;

  -- 3. Table ACL: exactly the live one minus anon's and authenticated's INSERT and UPDATE.
  select string_agg(format('%s %s %s', d.side, d.grantee, d.privilege_type), ', ') into v_text
  from (
    (select 'unexpected' as side, x.grantor, x.grantee, x.privilege_type, x.is_grantable
     from pg_class c, lateral aclexplode(c.relacl) x
     where c.oid = c_guesses
     except
     select 'unexpected', b.grantor, b.grantee, b.privilege_type, b.is_grantable
     from guesses_093000_acl b
     where not (b.grantee in (c_anon, c_authenticated) and b.privilege_type in ('INSERT', 'UPDATE')))
    union all
    (select 'missing' as side, b.grantor, b.grantee, b.privilege_type, b.is_grantable
     from guesses_093000_acl b
     where not (b.grantee in (c_anon, c_authenticated) and b.privilege_type in ('INSERT', 'UPDATE'))
     except
     select 'missing', x.grantor, x.grantee, x.privilege_type, x.is_grantable
     from pg_class c, lateral aclexplode(c.relacl) x
     where c.oid = c_guesses)
  ) d;
  if v_text is not null then
    raise exception 'guesses table ACL differs from live minus client INSERT/UPDATE: %', v_text;
  end if;

  -- 4. Column ACLs: only authenticated's INSERT and UPDATE, on each client column.
  select string_agg(format('%s:%s:%s', a.attname, x.grantee, x.privilege_type), ', ') into v_text
  from pg_attribute a, lateral aclexplode(a.attacl) x
  where a.attrelid = c_guesses and a.attnum > 0
    and not (x.grantee = c_authenticated and x.privilege_type in ('INSERT', 'UPDATE')
             and a.attname::text = any(c_client));
  if v_text is not null then
    raise exception 'unexpected column grants on guesses: %', v_text;
  end if;
  select count(*) into v_count
  from pg_attribute a, lateral aclexplode(a.attacl) x
  where a.attrelid = c_guesses and a.attnum > 0
    and x.grantee = c_authenticated and x.privilege_type in ('INSERT', 'UPDATE')
    and a.attname::text = any(c_client);
  if v_count <> 28 then
    raise exception 'authenticated holds % of the 28 client-column INSERT/UPDATE grants', v_count;
  end if;

  -- 5. RLS unchanged; the live triggers unchanged; the pin trigger in place.
  if not (select relrowsecurity from pg_class where oid = c_guesses)
     or (select relforcerowsecurity from pg_class where oid = c_guesses) then
    raise exception 'row level security settings on guesses changed';
  end if;
  select string_agg(b.tgname, ', ') into v_text
  from guesses_093000_triggers b
  left join pg_trigger t on t.tgrelid = c_guesses and t.tgname = b.tgname and not t.tgisinternal
  where t.oid is null or t.tgtype <> b.tgtype or t.tgenabled <> b.tgenabled
     or t.tgfoid <> b.tgfoid or t.tgattr::text <> b.tgattr;
  if v_text is not null then
    raise exception 'live guesses triggers changed: %', v_text;
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = c_guesses and not t.tgisinternal) <> 3 then
    raise exception 'guesses does not carry exactly the two live triggers plus guesses_pin_identity';
  end if;
  -- tgtype 19 = ROW (1) | BEFORE (2) | UPDATE (16); an empty tgattr = no column list.
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c_guesses and t.tgname = 'guesses_pin_identity' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgtype = 19 and cardinality(t.tgattr::int2[]) = 0
      and t.tgfoid = 'public.pin_guess_identity()'::regprocedure
  ) then
    raise exception 'guesses_pin_identity is missing, disabled or mis-shaped';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.pin_guess_identity()'::regprocedure
      and l.lanname = 'plpgsql' and not p.prosecdef
      and p.proconfig @> array['search_path=public']
      and strpos(p.prosrc, 'new.wine_id is distinct from old.wine_id') > 0
      and strpos(p.prosrc, 'new.participant_id is distinct from old.participant_id') > 0
  ) then
    raise exception 'pin_guess_identity is not the SECURITY INVOKER plpgsql pin with a pinned search_path';
  end if;

  -- 6. The helpers: SECURITY DEFINER, search_path=public, STABLE sql, owned by
  --    postgres, the reviewed bodies, EXECUTE for authenticated only.
  v_oid := to_regprocedure('public.is_own_joined_participant_for_wine(uuid,uuid)');
  if v_oid is null then
    raise exception 'is_own_joined_participant_for_wine(uuid, uuid) missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = v_oid
      and p.prosecdef
      and p.proconfig::text = '{search_path=public}'
      and l.lanname = 'sql'
      and p.provolatile = 's'
      and p.prorettype = 'boolean'::regtype
      and pg_get_userbyid(p.proowner) = 'postgres'
      and btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')) = c_helper_body
  ) then
    raise exception 'is_own_joined_participant_for_wine is not the reviewed SECURITY DEFINER helper';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('public', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'is_own_joined_participant_for_wine EXECUTE is not authenticated-only (anon and PUBLIC revoked)';
  end if;

  v_oid := to_regprocedure('public.is_open_guess_target(uuid,uuid,uuid)');
  if v_oid is null then
    raise exception 'is_open_guess_target(uuid, uuid, uuid) missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = v_oid
      and p.prosecdef
      and p.proconfig::text = '{search_path=public}'
      and l.lanname = 'sql'
      and p.provolatile = 's'
      and p.prorettype = 'boolean'::regtype
      and pg_get_userbyid(p.proowner) = 'postgres'
      and btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')) = c_target_body
  ) then
    raise exception 'is_open_guess_target is not the reviewed SECURITY DEFINER helper';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('public', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'is_open_guess_target EXECUTE is not authenticated-only (anon and PUBLIC revoked)';
  end if;

  -- 7. Policies: same set, names, PERMISSIVE, roles and commands; insert is
  --    exactly both helpers, update both helpers on an unscored, unstepped row;
  --    "guesses read" byte-identical to live.
  select string_agg(coalesce(b.policyname, a.policyname), '; ') into v_text
  from guesses_093000_policies b
  full join (
    select pol.policyname::text as policyname, pol.permissive, pol.roles::text as roles, pol.cmd,
           replace(pol.qual, 'public.', '') as qual, replace(pol.with_check, 'public.', '') as with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'guesses'
  ) a on a.policyname = b.policyname
  where b.policyname is null or a.policyname is null
     or a.permissive is distinct from b.permissive
     or a.roles is distinct from b.roles
     or a.cmd is distinct from b.cmd
     or a.qual is distinct from (case b.policyname when 'guesses update own' then c_update_expr
                                                   when 'guesses insert own' then null
                                                   else b.qual end)
     or a.with_check is distinct from (case b.policyname when 'guesses read' then b.with_check
                                                         when 'guesses insert own' then c_insert_check
                                                         else c_update_expr end);
  if v_text is not null then
    raise exception 'guesses policies differ from the expected set: %', v_text;
  end if;
  select string_agg(format('%s/%s', policyname, md5(coalesce(replace(qual, 'public.', ''), '')) || md5(coalesce(replace(with_check, 'public.', ''), ''))), ', ')
    into v_text
  from pg_policies
  where schemaname = 'public' and tablename = 'guesses' and policyname = 'guesses read'
    and md5(replace(qual, 'public.', '')) = 'aadad70c1422fd9e01a7be4da3779546' and with_check is null;
  if v_text is null then
    raise exception 'the guesses read policy is not byte-identical to live';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'guesses'
        and policyname = 'guesses read') not like '%is_revealed%' then
    raise exception 'the guesses read policy no longer gates on is_revealed';
  end if;
  select string_agg(policyname, ', ') into v_text
  from pg_policies
  where schemaname = 'public' and tablename = 'guesses' and permissive = 'PERMISSIVE'
    and cmd in ('SELECT', 'ALL') and coalesce(qual, '') like '%reveal_step%';
  if v_text is not null then
    raise exception 'permissive SELECT policies on guesses reference reveal_step: %', v_text;
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'guesses'
        and policyname in ('guesses insert own', 'guesses update own')
        and strpos(coalesce(with_check, ''), c_helper_call) > 0
        and strpos(coalesce(with_check, ''), c_target_call) > 0
        and (policyname = 'guesses insert own'
             or (strpos(coalesce(qual, ''), c_helper_call) > 0 and strpos(coalesce(qual, ''), c_target_call) > 0
                 and strpos(qual, 'scored_at IS NULL') > 0 and strpos(qual, 'reveal_step = 0') > 0))) <> 2 then
    raise exception 'guesses insert own / guesses update own do not both call both helpers (update: unscored, unstepped rows only)';
  end if;

  -- 8. Functions: the eight game RPCs grant EXECUTE to authenticated and
  --    service_role only, reveal_own_next_category to service_role only;
  --    nothing else about any snapshotted function changed except the reviewed
  --    get_wine_reveal edit.
  for v_fn in
    select b.sig, b.oid, b.src as src_before, b.acl as acl_before, b.prosecdef as secdef_before,
           b.config as config_before, b.proowner as owner_before, b.provolatile as volatile_before,
           b.prorettype as rettype_before, b.prolang as lang_before,
           replace(p.prosrc, chr(13), '') as src_now, p.proacl::text as acl_now, p.prosecdef,
           p.proconfig::text as config_now, p.proowner, p.provolatile, p.prorettype, p.prolang
    from guesses_093000_functions b
    left join pg_proc p on p.oid = b.oid
  loop
    if v_fn.prolang is null then
      raise exception '% vanished post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef_before
       or v_fn.config_now is distinct from v_fn.config_before
       or v_fn.proowner <> v_fn.owner_before
       or v_fn.provolatile <> v_fn.volatile_before
       or v_fn.prorettype <> v_fn.rettype_before
       or v_fn.prolang <> v_fn.lang_before then
      raise exception '% attributes changed post-migration', v_fn.sig;
    end if;
    if v_fn.sig = any(c_rpcs) then
      if v_fn.acl_now is distinct from c_rpc_acl
         or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
         or has_function_privilege('public', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
        raise exception '% EXECUTE is not authenticated and service_role only: %', v_fn.sig, v_fn.acl_now;
      end if;
    elsif v_fn.sig = c_rown then
      if v_fn.acl_now is distinct from c_rown_acl
         or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
         or has_function_privilege('public', v_fn.oid, 'EXECUTE')
         or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
        raise exception '% EXECUTE is not service_role only: %', v_fn.sig, v_fn.acl_now;
      end if;
    elsif v_fn.acl_now is distinct from v_fn.acl_before then
      raise exception '% grants changed post-migration: %', v_fn.sig, v_fn.acl_now;
    end if;
    if v_fn.sig = 'public.get_wine_reveal(uuid)' then
      if md5(v_fn.src_now) <> 'f1da546f7037b5462b1798fae96ac184'
         or strpos(v_fn.src_now, c_gwr_new) = 0
         or replace(v_fn.src_now, c_gwr_new, c_gwr_old) <> v_fn.src_before then
        raise exception 'get_wine_reveal is not the live body plus the JOINED filter';
      end if;
    elsif v_fn.src_now <> v_fn.src_before then
      raise exception '% body changed post-migration', v_fn.sig;
    end if;
  end loop;

  -- Informational: live rows whose participant row is not JOINED or belongs to
  -- another tasting are now client-immutable (none on 2026-09-12).
  select count(*) into v_count
  from guesses g
  join wines w on w.id = g.wine_id
  join tasting_participants p on p.id = g.participant_id
  where p.tasting_id <> w.tasting_id or p.status <> 'JOINED';
  raise notice 'guesses rows outside the JOINED, same-tasting binding: %', v_count;
  select count(*) into v_count
  from guesses g
  join wines w on w.id = g.wine_id
  join tastings t on t.id = w.tasting_id
  join tasting_participants p on p.id = g.participant_id
  left join wines gw on gw.id = g.guessed_wine_id
  where w.contributor_participant_id = p.id
     or (t.wine_source = 'HOST_PROVIDES' and t.host_id = p.user_id)
     or (g.guessed_wine_id is not null and gw.tasting_id is distinct from w.tasting_id)
     or (g.scored_at is null and (w.reveal_step > 0 or g.reveal_step > 0));
  raise notice 'guesses rows outside the eligible, unstarted, same-tasting-candidate rules: %', v_count;
end $$;

drop table guesses_093000_cols;
drop table guesses_093000_acl;
drop table guesses_093000_policies;
drop table guesses_093000_triggers;
drop table guesses_093000_functions;
