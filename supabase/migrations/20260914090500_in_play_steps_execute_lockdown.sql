-- in_play_steps: EXECUTE for its owner and service_role only. get_wine_reveal:
-- a null in_play_count before a glass's first reveal step.
--
-- Blind-tasting v3, M1 (BT-SQL1): spec §14.3, §15 M1, §16.1 row 12b and the
-- in_play_steps / get_wine_reveal rows of §16.2; ledger "B13.4 outcome", Left
-- open. Written against the LIVE state (read-only dump, 2026-09-13), never an
-- older migration file; get_wine_reveal is recreated from pg_get_functiondef
-- with exactly one edit.
--
-- The leaks (rule 1: nobody sees an unrevealed wine they did not add, not even
-- as a count):
-- * public.in_play_steps(uuid) is SECURITY DEFINER and carries Supabase's
--   default function ACL: PUBLIC, anon and authenticated hold EXECUTE. Anyone
--   with the anon key can call it on a hidden glass and read its in-play
--   category list; 5, 6 or 7 entries say whether the answer key has an
--   appellation and a type designation. 20260912093000 kept that ACL on purpose
--   (the wines_full_reveal_step trigger calls it in the caller's role).
-- * public.get_wine_reveal (JOINED participants and the host) returns
--   in_play_count at every step, so at step 0 the same shape reaches every
--   guest before the first category is revealed.
--
-- What this migration does:
-- 1. EXECUTE on in_play_steps is revoked from PUBLIC, anon and authenticated.
--    The owner (postgres) keeps it; service_role keeps its explicit grant,
--    restated so it never depends on PUBLIC. Every caller keeps working:
--    * get_wine_reveal, reveal_next_category and reveal_own_next_category are
--      SECURITY DEFINER functions owned by postgres, so they call it as the
--      owner.
--    * wines_full_reveal_step() (BEFORE UPDATE on public.wines, invoker rights)
--      calls it only when is_revealed flips to true. The app flips it only
--      inside reveal_wine and reveal_next_category (SECURITY DEFINER), where the
--      trigger runs as postgres. moveWine's position updates never reach the
--      call, and OPEN glasses are inserted revealed (an INSERT does not fire the
--      trigger).
--    * Nothing in src/ or scripts/ calls in_play_steps, and no policy, view,
--      constraint, column default or trigger definition names it (asserted
--      below, before and after).
--    Accepted consequence (spec §14.3): a client's direct
--    `update wines set is_revealed = true` through PostgREST, a scoring bypass
--    no app path uses, now fails inside wines_full_reveal_step with "permission
--    denied for function in_play_steps". PL/pgSQL checks that EXECUTE when the
--    trigger's expression is first evaluated in a transaction and caches it for
--    the rest of the transaction; a PostgREST request is its own transaction,
--    so the check runs as the client. (A transaction that has already revealed
--    a glass in an owner context skips it; no client can reach that.) M6's
--    column privileges later refuse the write outright. Scripts that flip
--    is_revealed as the owner connection or with the service-role key are
--    unaffected.
-- 2. get_wine_reveal: in_play_count is null while the glass is at step 0 and
--    not revealed; from step 1, or once revealed, it is the count as before.
--    Nothing else changes: the rest of the body, SECURITY DEFINER, search_path,
--    owner, volatility and the ACL (CREATE OR REPLACE keeps it). Deployed code
--    is unaffected: RevealView (play/reveal-view.tsx:157) returns before it
--    reads in_play_count at reveal_step 0, the Overview banner
--    (src/lib/overview-data.ts) reads only revealed_keys, and the host console
--    does not call it.
--
-- Not closed here (spec §14.3, §16.3): score_own_guess without a lock;
-- reveal_next_category accepting the contributor in any timing mode; during a
-- shared step reveal "{k} of {m} attributes" still shows the count.
--
-- No begin/commit: the applier owns the transaction. A temp table carries the
-- pre-migration state into the assertions; it and a temp view are dropped at
-- the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot.
-- ---------------------------------------------------------------------------
create temp table in_play_090500_functions as
select s.sig, p.oid, replace(p.prosrc, chr(13), '') as src, p.proacl::text as acl, p.prosecdef,
       p.proconfig::text as config, p.proowner, p.provolatile, p.prorettype, p.prolang
from unnest(array[
  'public.in_play_steps(uuid)',
  'public.get_wine_reveal(uuid)',
  'public.reveal_next_category(uuid,smallint)',
  'public.reveal_own_next_category(uuid,smallint)',
  'public.reveal_wine(uuid)',
  'public.score_own_guess(uuid)',
  'public.wines_full_reveal_step()'
]) as s (sig)
left join pg_proc p on p.oid = to_regprocedure(s.sig);

-- Every object that names in_play_steps. A view, so the post-state assertions
-- read the catalog again. Session temp schemas are skipped: this view's own
-- definition names in_play_steps.
create temp view in_play_090500_references as
select 'routine' as kind,
       n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
         || case when p.prosecdef then ' definer' else ' invoker' end as name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname !~ '^pg_(toast_)?temp_'
  and p.prosrc ilike '%in_play_steps%'
union all
select 'policy', pol.schemaname || '.' || pol.tablename || ' ' || pol.policyname
from pg_policies pol
where coalesce(pol.qual, '') ilike '%in_play_steps%'
   or coalesce(pol.with_check, '') ilike '%in_play_steps%'
union all
select 'view', v.schemaname || '.' || v.viewname
from pg_views v
where v.schemaname !~ '^pg_(toast_)?temp_'
  and v.definition ilike '%in_play_steps%'
union all
select 'matview', mv.schemaname || '.' || mv.matviewname
from pg_matviews mv
where mv.definition ilike '%in_play_steps%'
union all
select 'constraint', con.conname::text
from pg_constraint con
where con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%in_play_steps%'
union all
select 'default', ad.adrelid::regclass::text
from pg_attrdef ad
where pg_get_expr(ad.adbin, ad.adrelid) ilike '%in_play_steps%'
union all
select 'trigger', t.tgname::text
from pg_trigger t
where not t.tgisinternal
  and pg_get_triggerdef(t.oid) ilike '%in_play_steps%';

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  c_refs constant text := 'routine public.get_wine_reveal(uuid) definer; '
    || 'routine public.reveal_next_category(uuid, smallint) definer; '
    || 'routine public.reveal_own_next_category(uuid, smallint) definer; '
    || 'routine public.wines_full_reveal_step() invoker';
  c_ips_md5 constant text := '09f3924f8aae6df2ce846eb85b025f0c';
  c_ips_acl constant text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  c_gwr_md5 constant text := 'f1da546f7037b5462b1798fae96ac184';
  c_gwr_acl constant text := '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  c_gwr_old constant text := '    ''in_play_count'', coalesce(array_length(v_all, 1), 0),';
  v_text text;
  v_fn record;
begin
  if to_regprocedure('public.in_play_steps(uuid)') is null then
    raise exception 'public.in_play_steps(uuid) does not exist';
  end if;

  select string_agg(sig, ', ') into v_text from in_play_090500_functions where oid is null;
  if v_text is not null then
    raise exception 'functions missing pre-migration: %', v_text;
  end if;

  -- The state this migration closes.
  if not has_function_privilege('authenticated', 'public.in_play_steps(uuid)', 'EXECUTE') then
    raise exception 'authenticated no longer holds EXECUTE on in_play_steps; re-dump and rebuild this migration';
  end if;

  -- get_wine_reveal, reveal_next_category and reveal_own_next_category (and
  -- in_play_steps, reveal_wine, score_own_guess) run as their owner.
  select string_agg(sig, ', ') into v_text
  from in_play_090500_functions
  where sig <> 'public.wines_full_reveal_step()' and not prosecdef;
  if v_text is not null then
    raise exception 'expected SECURITY DEFINER, found invoker rights: %', v_text;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.wines'::regclass
      and t.tgname = 'wines_full_reveal_step'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
      and t.tgfoid = to_regprocedure('public.wines_full_reveal_step()')::oid
  ) then
    raise exception 'trigger wines_full_reveal_step on public.wines is missing, disabled or no longer calls wines_full_reveal_step()';
  end if;

  select * into v_fn from in_play_090500_functions where sig = 'public.in_play_steps(uuid)';
  if md5(v_fn.src) <> c_ips_md5 or v_fn.acl is distinct from c_ips_acl then
    raise exception 'in_play_steps differs from the live function this migration was written against (acl %)', v_fn.acl;
  end if;

  select * into v_fn from in_play_090500_functions where sig = 'public.get_wine_reveal(uuid)';
  if md5(v_fn.src) <> c_gwr_md5
     or v_fn.acl is distinct from c_gwr_acl
     or v_fn.config is distinct from '{search_path=public}'
     or v_fn.provolatile <> 's'
     or array_length(string_to_array(v_fn.src, c_gwr_old), 1) <> 2 then
    raise exception 'get_wine_reveal differs from the live body this migration was built from; rebuild it from pg_get_functiondef';
  end if;

  select string_agg(kind || ' ' || name, '; ' order by kind collate "C", name collate "C") into v_text
  from in_play_090500_references;
  if v_text is distinct from c_refs then
    raise exception 'in_play_steps is named by objects this migration was not written against: %', v_text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. in_play_steps: its owner and service_role only.
-- ---------------------------------------------------------------------------
revoke execute on function public.in_play_steps(uuid) from public, anon, authenticated;
-- service_role holds an explicit grant live; restated so it never depends on PUBLIC.
grant execute on function public.in_play_steps(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. get_wine_reveal: no in_play_count before the first step. The live
--    pg_get_functiondef, with one edit: the in_play_count entry.
-- ---------------------------------------------------------------------------
create or replace function public.get_wine_reveal(p_wine_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
    'in_play_count', case when v_step = 0 and not coalesce(v_is_revealed, false)
                          then null else coalesce(array_length(v_all, 1), 0) end,
    'is_fully_revealed', coalesce(v_is_revealed, false),
    'revealed_keys', to_jsonb(v_all[1:v_step]),
    'correct', v_correct,
    'guesses', v_guesses);
end $function$;

-- ---------------------------------------------------------------------------
-- Post-state assertions (same transaction).
-- ---------------------------------------------------------------------------
do $$
declare
  c_refs constant text := 'routine public.get_wine_reveal(uuid) definer; '
    || 'routine public.reveal_next_category(uuid, smallint) definer; '
    || 'routine public.reveal_own_next_category(uuid, smallint) definer; '
    || 'routine public.wines_full_reveal_step() invoker';
  c_ips_acl constant text := '{postgres=X/postgres,service_role=X/postgres}';
  c_gwr_md5 constant text := '74b0502b60c481e27a10d77ef1437c56';
  c_gwr_old constant text := '    ''in_play_count'', coalesce(array_length(v_all, 1), 0),';
  c_gwr_new constant text := '    ''in_play_count'', case when v_step = 0 and not coalesce(v_is_revealed, false)'
    || chr(10) || '                          then null else coalesce(array_length(v_all, 1), 0) end,';
  v_fn record;
  v_text text;
begin
  for v_fn in
    select b.sig, b.oid, b.src as src_before, b.acl as acl_before, b.prosecdef as secdef_before,
           b.config as config_before, b.proowner as owner_before, b.provolatile as volatile_before,
           b.prorettype as rettype_before, b.prolang as lang_before,
           replace(p.prosrc, chr(13), '') as src_now, p.proacl::text as acl_now, p.prosecdef,
           p.proconfig::text as config_now, p.proowner, p.provolatile, p.prorettype, p.prolang
    from in_play_090500_functions b
    left join pg_proc p on p.oid = b.oid
  loop
    if v_fn.prolang is null then
      raise exception '% vanished post-migration (CREATE OR REPLACE keeps the oid)', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef_before
       or v_fn.config_now is distinct from v_fn.config_before
       or v_fn.proowner <> v_fn.owner_before
       or v_fn.provolatile <> v_fn.volatile_before
       or v_fn.prorettype <> v_fn.rettype_before
       or v_fn.prolang <> v_fn.lang_before then
      raise exception '% attributes changed post-migration', v_fn.sig;
    end if;

    if v_fn.sig = 'public.in_play_steps(uuid)' then
      if v_fn.acl_now is distinct from c_ips_acl
         or has_function_privilege('public', v_fn.oid, 'EXECUTE')
         or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
         or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
         or not has_function_privilege(v_fn.proowner, v_fn.oid, 'EXECUTE') then
        raise exception 'in_play_steps EXECUTE is not its owner and service_role only: %', v_fn.acl_now;
      end if;
    elsif v_fn.acl_now is distinct from v_fn.acl_before then
      raise exception '% grants changed post-migration: %', v_fn.sig, v_fn.acl_now;
    end if;

    if v_fn.sig = 'public.get_wine_reveal(uuid)' then
      if md5(v_fn.src_now) <> c_gwr_md5
         or strpos(v_fn.src_now, c_gwr_new) = 0
         or strpos(v_fn.src_now, c_gwr_old) > 0
         or replace(v_fn.src_now, c_gwr_new, c_gwr_old) <> v_fn.src_before then
        raise exception 'get_wine_reveal is not the live body with only its in_play_count entry changed';
      end if;
      if has_function_privilege('public', v_fn.oid, 'EXECUTE')
         or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
         or not has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
        raise exception 'get_wine_reveal EXECUTE is not authenticated and service_role only: %', v_fn.acl_now;
      end if;
    elsif v_fn.src_now <> v_fn.src_before then
      raise exception '% body changed post-migration', v_fn.sig;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.wines'::regclass
      and t.tgname = 'wines_full_reveal_step'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
      and t.tgfoid = to_regprocedure('public.wines_full_reveal_step()')::oid
  ) then
    raise exception 'trigger wines_full_reveal_step on public.wines changed post-migration';
  end if;

  -- Still exactly the four callers: three run as the owner, and the invoker-
  -- rights trigger reaches in_play_steps only inside them.
  select string_agg(kind || ' ' || name, '; ' order by kind collate "C", name collate "C") into v_text
  from in_play_090500_references;
  if v_text is distinct from c_refs then
    raise exception 'objects naming in_play_steps changed post-migration: %', v_text;
  end if;
end $$;

drop view in_play_090500_references;
drop table in_play_090500_functions;
