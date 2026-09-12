-- reveal_wine: a participant may reveal only once every eligible participant
-- has LOCKED a guess; the HOST_PROVIDES host is not an eligible guesser; a
-- caller with no auth.uid() is refused; CLOSED tastings refuse every caller.
--
-- Blind-tasting ledger B13.3 (map XCUT-38, HOST-33, HOST-16) and CLAUDE.md's
-- "Known caveat, not changed" in the 2026-09 flows notes.
--
-- Recreated from the LIVE definition (pg_get_functiondef, 2026-09-12), not from
-- an older migration file. The newest file that defines reveal_wine,
-- 20260807090000_optional_producer_vintage.sql, never ran live: its version is
-- recorded as 20260807090000_cote_de_nuits_villages, so the live function has
-- no "answer unknown => null points" branch for producer or vintage (and
-- wine_answers.producer_id / vintage_kind are still NOT NULL). This migration
-- keeps the live scoring exactly as it is and does not pick that file up.
--
-- Behaviour changes, all before the scoring section:
-- 1. Locked guesses only. The gate compares the eligible participants who have
--    a guess with locked_at set on this glass against all eligible
--    participants. The guess ladder autosaves drafts (20260911100000), so "a
--    row exists" no longer means "this taster is done". It counts eligible
--    participants, not guess rows: RLS lets a user write a locked row through a
--    participant row in another tasting, as an INVITED or DECLINED participant,
--    as the wine's contributor, or as the HOST_PROVIDES host, and none of those
--    may fill the count.
-- 2. Eligible participants = JOINED, minus the wine's contributor (as before),
--    minus the host when wine_source = 'HOST_PROVIDES' (they set the answers
--    and never guess).
-- 3. A CLOSED tasting refuses every caller, host included, with the message
--    reveal_next_category and reveal_own_next_category already raise.
-- 4. The host test is null-safe, as in reveal_next_category and
--    get_wine_reveal. Live, a caller with no auth.uid() (the public anon key
--    without a session; anon holds EXECUTE) made v_is_host null, skipped the
--    whole participant gate, and could reveal and score any glass whose id it
--    knew. It now gets the outsider refusal.
--
-- Unchanged: the host may reveal early; the outsider and "not everyone has
-- guessed" refusals; any participant row, whatever its status, may call once
-- the gate passes; everything from "select * into v_answer" to the end (the
-- answer-key check, both scoring branches, is_revealed); the signature,
-- SECURITY DEFINER, search_path, owner and grants (CREATE OR REPLACE keeps the
-- ACL).
--
-- Callers this affects:
-- - scripts/seed-demo-people.mjs inserts its demo tastings CLOSED and then
--   reveals them as the host, which change 3 refuses.
-- - maybeAutoRevealWine (play/actions.ts) applies the same eligibility rule
--   but counts locked rows through the caller's RLS view, where a participant
--   sees only their own row on a hidden glass. So an ASYNC AFTER_ALL wine
--   still auto-reveals only when the host (bring-your-own) or the only
--   eligible guesser locks last. This migration does not change that.
--
-- Line endings: the live body is stored with CRLF (the only reveal function
-- that is); this file is LF. A carriage return is whitespace to PL/pgSQL, so
-- every body comparison below strips chr(13) on both sides.
--
-- No begin/commit: the applier owns the transaction. The temp table carries the
-- pre-migration definition into the assertions and is dropped at the end.

create temp table reveal_wine_092000_before as
select p.prosrc, p.proacl::text as acl, p.proconfig::text as config,
       p.prosecdef, p.proowner, p.prorettype
from pg_proc p
where p.oid = to_regprocedure('public.reveal_wine(uuid)');

-- Pre-check: refuse unless the live body is the one this file was built from.
do $$
declare
  v_before record;
begin
  select * into v_before from reveal_wine_092000_before;
  if not found then
    raise exception 'reveal_wine(uuid) missing pre-migration';
  end if;
  if md5(replace(v_before.prosrc, chr(13), '')) <> 'db2f35c511d54edc4e0954c7d1683465' then
    raise exception 'reveal_wine live body differs from the one this migration was built from; rebuild it from pg_get_functiondef';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.reveal_wine(p_wine_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_answer wine_answers%rowtype;
  v_tasting_id uuid;
  v_contributor_participant_id uuid;
  v_is_host boolean;
  v_is_participant boolean;
  v_eligible_count int;
  v_guess_count int;
  v_reveal_mode reveal_mode_type;
  v_status tasting_status;
  v_wine_source wine_source_mode;
  v_host_id uuid;
begin
  select w.tasting_id, w.contributor_participant_id, t.host_id = auth.uid(), t.reveal_mode,
         t.status, t.wine_source, t.host_id
    into v_tasting_id, v_contributor_participant_id, v_is_host, v_reveal_mode,
         v_status, v_wine_source, v_host_id
  from wines w
  join tastings t on t.id = w.tasting_id
  where w.id = p_wine_id;

  if v_tasting_id is null then
    raise exception 'Wine % not found', p_wine_id;
  end if;

  if v_status = 'CLOSED' then
    raise exception 'Tasting is finished';
  end if;

  if not coalesce(v_is_host, false) then
    select exists (
      select 1 from tasting_participants
      where tasting_id = v_tasting_id and user_id = auth.uid()
    ) into v_is_participant;

    if not v_is_participant then
      raise exception 'Only the host or a participant can reveal a wine';
    end if;

    select count(*) into v_eligible_count
    from tasting_participants
    where tasting_id = v_tasting_id
      and status = 'JOINED'
      and id is distinct from v_contributor_participant_id
      and not (v_wine_source = 'HOST_PROVIDES' and user_id = v_host_id);

    select count(*) into v_guess_count
    from tasting_participants p
    where p.tasting_id = v_tasting_id
      and p.status = 'JOINED'
      and p.id is distinct from v_contributor_participant_id
      and not (v_wine_source = 'HOST_PROVIDES' and p.user_id = v_host_id)
      and exists (
        select 1 from guesses g
        where g.wine_id = p_wine_id
          and g.participant_id = p.id
          and g.locked_at is not null
      );

    if v_eligible_count = 0 or v_guess_count < v_eligible_count then
      raise exception 'Not everyone has guessed yet — only the host can reveal early';
    end if;
  end if;

  select * into v_answer from wine_answers where wine_id = p_wine_id;
  if not found then
    raise exception 'Wine % has no answer key recorded', p_wine_id;
  end if;

  if v_reveal_mode = 'SEMI_BLIND' then
    update guesses g
    set
      country_points = null,
      region_points = null,
      appellation_points = null,
      primary_grape_points = null,
      secondary_grape_points = null,
      producer_points = null,
      type_designation_points = null,
      vintage_points = null,
      total_points = case when g.guessed_wine_id = p_wine_id then 1 else 0 end,
      scored_at = now()
    where g.wine_id = p_wine_id;
  else
    update guesses g
    set
      country_points = case when g.country_id = v_answer.country_id then 2 else 0 end,
      region_points = case when g.region_id = v_answer.region_id then 3 else 0 end,
      appellation_points = case
        when v_answer.appellation_id is null then null
        when g.appellation_id = v_answer.appellation_id then 5
        else 0
      end,
      primary_grape_points = case when g.primary_grape_id = v_answer.primary_grape_id then 8 else 0 end,
      secondary_grape_points = case
        when v_answer.secondary_grape_id is null then null
        when g.secondary_grape_id = v_answer.secondary_grape_id then 2
        else 0
      end,
      producer_points = case when g.producer_id = v_answer.producer_id then 6 else 0 end,
      type_designation_points = case
        when v_answer.type_designation_id is null then null
        when g.type_designation_id = v_answer.type_designation_id then 2
        else 0
      end,
      vintage_points = case
        when g.vintage_kind is null then 0
        when g.vintage_kind = v_answer.vintage_kind
          and g.vintage_kind = 'NV' then 2
        when g.vintage_kind = v_answer.vintage_kind
          and g.vintage_kind = 'TAWNY'
          and g.vintage_tawny_years = v_answer.vintage_tawny_years then 2
        when g.vintage_kind = v_answer.vintage_kind
          and g.vintage_kind = 'YEAR'
          and g.vintage_year = v_answer.vintage_year then 2
        when g.vintage_kind = v_answer.vintage_kind
          and g.vintage_kind = 'YEAR'
          and abs(g.vintage_year - v_answer.vintage_year) = 1 then 1
        else 0
      end,
      scored_at = now()
    where g.wine_id = p_wine_id;

    update guesses
    set total_points = coalesce(country_points, 0)
      + coalesce(region_points, 0)
      + coalesce(appellation_points, 0)
      + coalesce(primary_grape_points, 0)
      + coalesce(secondary_grape_points, 0)
      + coalesce(producer_points, 0)
      + coalesce(type_designation_points, 0)
      + coalesce(vintage_points, 0)
    where wine_id = p_wine_id;
  end if;

  update wines set is_revealed = true where id = p_wine_id;
end;
$function$;

-- Same-transaction assertions (never trust "version recorded").
do $$
declare
  v_mark constant text := '  select * into v_answer from wine_answers where wine_id = p_wine_id;';
  v_host_test constant text := '  if not coalesce(v_is_host, false) then';
  v_compare constant text := '    if v_eligible_count = 0 or v_guess_count < v_eligible_count then';
  v_closed constant text := replace($lit$  if v_status = 'CLOSED' then
    raise exception 'Tasting is finished';
  end if;$lit$, chr(13), '');
  v_eligible constant text := replace($lit$    select count(*) into v_eligible_count
    from tasting_participants
    where tasting_id = v_tasting_id
      and status = 'JOINED'
      and id is distinct from v_contributor_participant_id
      and not (v_wine_source = 'HOST_PROVIDES' and user_id = v_host_id);$lit$, chr(13), '');
  v_locked constant text := replace($lit$    select count(*) into v_guess_count
    from tasting_participants p
    where p.tasting_id = v_tasting_id
      and p.status = 'JOINED'
      and p.id is distinct from v_contributor_participant_id
      and not (v_wine_source = 'HOST_PROVIDES' and p.user_id = v_host_id)
      and exists (
        select 1 from guesses g
        where g.wine_id = p_wine_id
          and g.participant_id = p.id
          and g.locked_at is not null
      );$lit$, chr(13), '');
  v_before record;
  v_after record;
  v_old text;
  v_new text;
  v_gate text;
  v_mark_at int;
  v_gate_at int;
  v_closed_at int;
begin
  select * into v_before from reveal_wine_092000_before;
  select replace(p.prosrc, chr(13), '') as src, p.proacl::text as acl,
         p.proconfig::text as config, p.prosecdef, p.proowner, p.prorettype
    into v_after
  from pg_proc p
  where p.oid = to_regprocedure('public.reveal_wine(uuid)');
  if not found then
    raise exception 'reveal_wine(uuid) missing post-migration';
  end if;

  -- Signature, security, owner and grants.
  if v_after.prorettype <> 'void'::regtype then
    raise exception 'reveal_wine return type changed post-migration';
  end if;
  if not v_after.prosecdef then
    raise exception 'reveal_wine is not SECURITY DEFINER post-migration';
  end if;
  if v_after.config is distinct from '{search_path=public}'
     or v_after.config is distinct from v_before.config then
    raise exception 'reveal_wine search_path changed post-migration';
  end if;
  if v_after.proowner <> v_before.proowner then
    raise exception 'reveal_wine owner changed post-migration';
  end if;
  if v_after.acl is distinct from v_before.acl
     or not has_function_privilege('authenticated', 'public.reveal_wine(uuid)', 'execute') then
    raise exception 'reveal_wine grants changed post-migration';
  end if;

  -- The scoring section is the live one.
  v_old := replace(v_before.prosrc, chr(13), '');
  v_new := v_after.src;
  v_mark_at := strpos(v_new, v_mark);
  if strpos(v_old, v_mark) = 0 or v_mark_at = 0
     or strpos(substr(v_new, v_mark_at + 1), v_mark) > 0 then
    raise exception 'reveal_wine scoring marker not found exactly once post-migration';
  end if;
  if substr(v_new, v_mark_at) <> substr(v_old, strpos(v_old, v_mark))
     or md5(substr(v_new, v_mark_at)) <> '9561fd5d51bd1ec67fed4eb28f12e4bd' then
    raise exception 'reveal_wine scoring section differs from the live one post-migration';
  end if;

  -- The host test is null-safe: a caller with no auth.uid() is not the host.
  v_gate_at := strpos(v_new, v_host_test);
  if v_gate_at = 0 or v_gate_at > v_mark_at
     or strpos(substr(v_new, v_gate_at + 1), v_host_test) > 0
     or strpos(v_new, 'if not v_is_host then') > 0 then
    raise exception 'reveal_wine host test is not null-safe post-migration';
  end if;
  v_gate := substr(v_new, v_gate_at, v_mark_at - v_gate_at);

  -- Eligible participants: JOINED, not the contributor, not the HOST_PROVIDES host.
  if strpos(v_gate, v_eligible) = 0 then
    raise exception 'reveal_wine eligible count does not exclude the contributor and the HOST_PROVIDES host post-migration';
  end if;

  -- The gate counts eligible participants with a LOCKED guess, never raw guess rows.
  if strpos(v_gate, v_locked) = 0 or strpos(v_gate, 'from guesses where') > 0 then
    raise exception 'reveal_wine participant gate does not count eligible participants with a locked guess post-migration';
  end if;
  if strpos(v_gate, v_compare) = 0 then
    raise exception 'reveal_wine gate comparison changed post-migration';
  end if;
  if strpos(v_gate, 'raise exception ''Not everyone has guessed yet — only the host can reveal early'';') = 0
     or strpos(v_gate, 'raise exception ''Only the host or a participant can reveal a wine'';') = 0 then
    raise exception 'reveal_wine gate refusal messages changed post-migration';
  end if;

  -- CLOSED refuses every caller: the check sits before the host test.
  v_closed_at := strpos(v_new, v_closed);
  if v_closed_at = 0 or v_closed_at > v_gate_at then
    raise exception 'reveal_wine does not refuse CLOSED tastings for every caller post-migration';
  end if;

  -- The whole body is the reviewed one (regenerate with gen-092000.mjs; never hand-edit).
  if md5(v_new) <> '13923813da0f470fe2d1ffd3ac445625' then
    raise exception 'reveal_wine body differs from the reviewed one post-migration';
  end if;
end $$;

drop table reveal_wine_092000_before;
