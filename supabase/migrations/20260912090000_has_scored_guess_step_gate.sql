-- REVEAL-13 (ledger B13.1, high risk): has_scored_guess must not hand anyone a
-- wine_answers row before that glass's answer is legitimately theirs.
--
-- The live helper (dumped 2026-09-12) leaked the whole answer key two ways:
--
-- 1. Shared step reveal. public.reveal_next_category ends EVERY step, step 1
--    included, with
--      update guesses set total_points = ..., scored_at = coalesce(scored_at, now())
--      where wine_id = p_wine_id;
--    has_scored_guess checked only `g.scored_at is not null`, and the
--    "wine_answers read" policy opens with `has_scored_guess(wine_id) OR`. Once
--    the host had revealed only the country, every guesser with a row could
--    select the full row (producer, vintage, image_url, catalog link), and the
--    SECURITY INVOKER reveal_answer_cell(wine, key) returned unrevealed cells
--    while get_wine_reveal still said "still hidden".
--
-- 2. Forged scored_at (found in adversarial verification). anon and
--    authenticated hold INSERT/UPDATE on guesses.scored_at; "guesses insert
--    own" / "guesses update own" check only that the participant row is the
--    caller's (no tasting binding, no status); block_guess_writes_after_reveal
--    fires only once is_revealed. So at reveal_step 0 (the whole guessing
--    phase) a JOINED, INVITED or DECLINED participant could stamp scored_at on
--    a guess of their own and read the answer key, and ANY signed-in user who
--    knew a wine id could host a throwaway tasting, take its JOINED row, plant
--    a pre-scored guess on the foreign wine and read that answer key. A
--    reveal_step gate alone leaves both open.
--
-- The fix: has_scored_guess grants only for the path it exists for, the ASYNC
-- IMMEDIATE "see my own answer once I lock" read after score_own_guess (which
-- itself requires JOINED + ASYNC IMMEDIATE). All of:
--   * the guess's participant row is the caller's, is JOINED, and belongs to
--     the SAME tasting as the wine;
--   * that tasting is timing_mode ASYNC with async_reveal_policy IMMEDIATE
--     (tastings are host-writable only; the app freezes setup after DRAFT);
--   * the guess is scored;
--   * the glass has no shared step reveal in progress (wines.reveal_step = 0)
--     or is fully revealed (wines.is_revealed; the wines_full_reveal_step
--     trigger squares reveal_step up at that moment).
-- B13.1's fix still holds sentence by sentence: no grant mid shared step
-- reveal, a full reveal grants through the policy's is_revealed clause, and
-- ASYNC IMMEDIATE still grants through score_own_guess. The tasting / JOINED /
-- ASYNC IMMEDIATE binding goes beyond B13.1's literal wording; it follows map
-- REVEAL-13 ("limit has_scored_guess to the self-scored ASYNC path") and
-- precedence invariant 2, and is flagged for ledger sign-off.
--
-- Every path that reads has_scored_guess or relied on its grant:
--   * "wine_answers read" is the only reader; no function body calls the
--     helper. The policy's other clauses (host, is_revealed, the wine's
--     contributor, SEMI_BLIND participants) are untouched, so the host, the
--     contributor and semi-blind candidate lists keep access, mid-step too.
--   * score_own_guess stamps only the caller's scored_at and never moves
--     wines.reveal_step, so an ASYNC IMMEDIATE guesser still reads the answer
--     right after locking.
--   * reveal_wine ("Reveal everything") and reveal_next_category's last step
--     set is_revealed, which grants everyone through the policy.
--   * reveal_own_next_category (self-paced; nothing in src/ calls it) stamps
--     scored_at at the caller's last own step and moves only
--     guesses.reveal_step. In an ASYNC IMMEDIATE tasting that still grants the
--     row. Elsewhere the row now waits for the full reveal, while the finished
--     guesser keeps every revealed cell through get_wine_reveal (its ASYNC
--     branch reads the guess's own reveal_step). Self-paced completion is
--     client-writable, so it cannot grant rows without reopening leak 2.
--   * get_wine_reveal, reveal_next_category, reveal_own_next_category,
--     score_own_guess and reveal_wine are SECURITY DEFINER functions owned by
--     the table owner; they read wine_answers without RLS and are unaffected.
--   * Readers of wine_answers behind scored guesses (profile-stats,
--     your-numbers, the create sheet's name suggestion) see LIVE and
--     AFTER_ALL glasses once revealed: the fully-revealed rule they document.
-- Accepted trade-off: an ASYNC IMMEDIATE guesser who already self-scored loses
-- the row if the host step-reveals that same glass through
-- reveal_next_category, until the full reveal.
--
-- NOT closed here (B13.1 touches only this helper; needs a companion B13 item):
--   * anon/authenticated can still write guesses.scored_at, total_points, the
--     *_points columns and reveal_step. A JOINED participant of an ASYNC
--     IMMEDIATE tasting can still plant scored_at and read that tasting's
--     answers without burning a lock, and anyone can forge their own points.
--   * get_wine_reveal's ASYNC branch trusts the caller's own
--     guesses.reveal_step (participant looked up with no status filter), so a
--     participant of any status who writes reveal_step = 99 gets every
--     correct cell.
--   A column-level REVOKE of those columns from anon/authenticated (or a
--   BEFORE trigger refusing client changes to them) closes both.
--
-- Recreated from the LIVE pg_get_functiondef, not from 20260716140000: same
-- signature, LANGUAGE sql, STABLE, SECURITY DEFINER, search_path=public.
-- CREATE OR REPLACE keeps the OID, the owner (postgres) and the ACL, so the
-- policy's reference and every grant stay as they are. No other function or
-- policy is touched. No begin/commit: the applier owns the transaction, and
-- the assertions below run inside it.

-- Fail closed unless the live helper is exactly (modulo whitespace) the body
-- this file was written against, or already this file's body (a replay).
do $$
declare
  c_live constant text := 'select exists ( select 1 from guesses g join tasting_participants p on p.id = g.participant_id where g.wine_id = p_wine_id and p.user_id = auth.uid() and g.scored_at is not null );';
  c_new constant text := 'select exists ( select 1 from guesses g join tasting_participants p on p.id = g.participant_id join wines w on w.id = g.wine_id join tastings t on t.id = w.tasting_id where g.wine_id = p_wine_id and p.user_id = auth.uid() and g.scored_at is not null and p.tasting_id = w.tasting_id and p.status = ''JOINED'' and t.timing_mode = ''ASYNC'' and t.async_reveal_policy = ''IMMEDIATE'' and (w.reveal_step = 0 or w.is_revealed) );';
  v_count int;
  v_norm text;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'has_scored_guess';
  if v_count <> 1 then
    raise exception 'expected exactly one public.has_scored_guess before the step gate, found %', v_count;
  end if;

  select btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')) into v_norm
  from pg_proc p
  where p.oid = 'public.has_scored_guess(uuid)'::regprocedure;
  if v_norm is distinct from c_live and v_norm is distinct from c_new then
    raise exception 'public.has_scored_guess drifted from the live body this migration was written against: %', v_norm;
  end if;
end $$;

create or replace function public.has_scored_guess(p_wine_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from guesses g
    join tasting_participants p on p.id = g.participant_id
    join wines w on w.id = g.wine_id
    join tastings t on t.id = w.tasting_id
    where g.wine_id = p_wine_id
      and p.user_id = auth.uid()
      and g.scored_at is not null
      and p.tasting_id = w.tasting_id
      and p.status = 'JOINED'
      and t.timing_mode = 'ASYNC'
      and t.async_reveal_policy = 'IMMEDIATE'
      and (w.reveal_step = 0 or w.is_revealed)
  );
$function$;

-- Same-transaction assertions (never trust "version recorded").
do $$
declare
  c_new constant text := 'select exists ( select 1 from guesses g join tasting_participants p on p.id = g.participant_id join wines w on w.id = g.wine_id join tastings t on t.id = w.tasting_id where g.wine_id = p_wine_id and p.user_id = auth.uid() and g.scored_at is not null and p.tasting_id = w.tasting_id and p.status = ''JOINED'' and t.timing_mode = ''ASYNC'' and t.async_reveal_policy = ''IMMEDIATE'' and (w.reveal_step = 0 or w.is_revealed) );';
  v_count int;
  v_norm text;
  v_acl text;
  v_owner text;
  v_secdef boolean;
  v_volatile text;
  v_lang text;
  v_config text;
  v_rettype text;
  v_qual text;
  v_permissive text;
  v_cmd text;
  v_roles text;
  v_policies text;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'has_scored_guess';
  if v_count <> 1 then
    raise exception 'expected exactly one public.has_scored_guess post-migration, found %', v_count;
  end if;

  select btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')), p.proacl::text,
         pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile::text, l.lanname,
         p.proconfig::text, format_type(p.prorettype, null)
    into v_norm, v_acl, v_owner, v_secdef, v_volatile, v_lang, v_config, v_rettype
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = 'public.has_scored_guess(uuid)'::regprocedure;

  -- 1. The body is exactly the gated one: the step condition, the tasting /
  --    JOINED / ASYNC IMMEDIATE binding, and the original caller and
  --    scored-guess conditions.
  if v_norm is distinct from c_new then
    raise exception 'has_scored_guess body differs from the gated body post-migration: %', v_norm;
  end if;
  if strpos(v_norm, 'join wines w on w.id = g.wine_id') = 0
     or strpos(v_norm, '(w.reveal_step = 0 or w.is_revealed)') = 0 then
    raise exception 'has_scored_guess lacks the shared step-reveal gate post-migration';
  end if;
  if strpos(v_norm, 'join tastings t on t.id = w.tasting_id') = 0
     or strpos(v_norm, 'p.tasting_id = w.tasting_id') = 0
     or strpos(v_norm, 'p.status = ''JOINED''') = 0
     or strpos(v_norm, 't.timing_mode = ''ASYNC''') = 0
     or strpos(v_norm, 't.async_reveal_policy = ''IMMEDIATE''') = 0 then
    raise exception 'has_scored_guess lacks the tasting / JOINED / ASYNC IMMEDIATE binding post-migration';
  end if;
  if strpos(v_norm, 'g.wine_id = p_wine_id') = 0
     or strpos(v_norm, 'p.user_id = auth.uid()') = 0
     or strpos(v_norm, 'g.scored_at is not null') = 0 then
    raise exception 'has_scored_guess lost its caller or scored-guess condition post-migration';
  end if;

  -- 2. Signature, language, volatility, SECURITY DEFINER, search_path, owner.
  if v_rettype <> 'boolean' or v_lang <> 'sql' or v_volatile <> 's'
     or not v_secdef or v_config is distinct from '{search_path=public}'
     or v_owner <> 'postgres' then
    raise exception 'has_scored_guess attributes changed post-migration: returns % lang % volatile % secdef % config % owner %',
      v_rettype, v_lang, v_volatile, v_secdef, v_config, v_owner;
  end if;

  -- 3. Grants: identical to the live ACL.
  if v_acl is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'has_scored_guess grants changed post-migration: %', v_acl;
  end if;
  if not has_function_privilege('authenticated', 'public.has_scored_guess(uuid)', 'execute') then
    raise exception 'authenticated lost execute on has_scored_guess post-migration';
  end if;

  -- 4. The read policy: same shape, same text as live, every clause present.
  select pol.qual, pol.permissive, pol.cmd, pol.roles::text
    into v_qual, v_permissive, v_cmd, v_roles
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = 'wine_answers'
    and pol.policyname = 'wine_answers read';
  if v_qual is null then
    raise exception 'wine_answers read policy missing post-migration';
  end if;
  if v_permissive <> 'PERMISSIVE' or v_cmd <> 'SELECT' or v_roles <> '{authenticated}' then
    raise exception 'wine_answers read policy shape changed post-migration: % % %', v_permissive, v_cmd, v_roles;
  end if;
  if strpos(v_qual, 'has_scored_guess(wine_id)') = 0
     or strpos(v_qual, 't.host_id = auth.uid()') = 0
     or strpos(v_qual, 'w.is_revealed') = 0
     or strpos(v_qual, 'p.user_id = auth.uid()') = 0
     or strpos(v_qual, 'SEMI_BLIND') = 0
     or strpos(v_qual, 'is_tasting_participant(t.id)') = 0 then
    raise exception 'wine_answers read policy lost a clause (has_scored_guess / host / revealed / contributor / semi-blind participant) post-migration';
  end if;
  if md5(v_qual) <> 'dabdc0e3b678ed52b96d817c5cf9c242' then
    raise exception 'wine_answers read policy text differs from the live text this migration was written against (qual md5 %)', md5(v_qual);
  end if;

  -- 5. No wine_answers policy appeared or vanished.
  select string_agg(pol.policyname, ',' order by pol.policyname) into v_policies
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'wine_answers';
  if v_policies is distinct from 'wine_answers insert,wine_answers read,wine_answers update' then
    raise exception 'wine_answers policy set changed post-migration: %', v_policies;
  end if;
end $$;
