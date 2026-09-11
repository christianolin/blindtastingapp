-- Guess ladder + create-flow support (2026-09 flows handoff).
--
-- 1. guesses.locked_at — the guess ladder autosaves every field as it is
--    picked, so "a guess row exists" (what tasting_guess_status reported as
--    readiness) would light up on the first tap. "Locked in" is now an explicit
--    act: the taster presses Lock in, locked_at is stamped, and Change it clears
--    it again. It is a readiness signal only — it does not stop the host from
--    revealing (reveal_wine scores whatever has been saved) and the server does
--    not refuse edits on a locked guess (the ladder unlocks first); scored
--    guesses stay locked by the existing app rule.
-- 2. tasting_guess_status gains a `locked` column so everyone can see who is
--    still deciding versus who is in.
-- 3. tastings.join_code + join_tasting_by_code — the invite step's share link.
--    The host mints a code (ensure_join_code); anyone signed in who opens
--    /j/<code> joins as a JOINED participant (or flips their INVITED row).
--    SECURITY DEFINER because the participants insert policy is host-only.


-- 1. locked_at ---------------------------------------------------------------
alter table public.guesses
  add column if not exists locked_at timestamptz;

-- 2. readiness now says whether the guess is locked --------------------------
-- CREATE OR REPLACE cannot change a function's return type, so drop first.
drop function if exists public.tasting_guess_status(uuid);
create function public.tasting_guess_status(p_tasting_id uuid)
returns table (wine_id uuid, participant_id uuid, locked boolean)
language sql
stable
security definer
set search_path = public
as $func$
  select g.wine_id, g.participant_id, (g.locked_at is not null) as locked
  from guesses g
  join wines w on w.id = g.wine_id
  where w.tasting_id = p_tasting_id
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
$func$;
grant execute on function public.tasting_guess_status(uuid) to authenticated;

-- 3. join codes ---------------------------------------------------------------
alter table public.tastings
  add column if not exists join_code text;
create unique index if not exists tastings_join_code_key
  on public.tastings (join_code)
  where join_code is not null;

-- Six characters from an unambiguous alphabet (no 0/O/1/I), e.g. "NEB7K2".
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- Host-only: returns the tasting's join code, minting one on first use.
create or replace function public.ensure_join_code(p_tasting_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  if not is_tasting_host(p_tasting_id) then
    raise exception 'only the host can share a join link';
  end if;
  select join_code into v_code from tastings where id = p_tasting_id;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_attempt := v_attempt + 1;
    v_code := generate_join_code();
    begin
      update tastings set join_code = v_code where id = p_tasting_id;
      return v_code;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise;
      end if;
    end;
  end loop;
end;
$$;
grant execute on function public.ensure_join_code(uuid) to authenticated;

-- Anyone signed in with the code joins (or accepts their pending invite).
-- Returns the tasting id. Closed tastings and OPEN-mode tastings after start
-- are refused the same way the lobby refuses late invites for blind play.
create or replace function public.join_tasting_by_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tasting tastings%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sign in to join a tasting';
  end if;
  select * into v_tasting from tastings where join_code = upper(trim(p_code));
  if not found then
    raise exception 'no tasting has that code';
  end if;
  if v_tasting.status = 'CLOSED' then
    raise exception 'that tasting has finished';
  end if;
  if v_tasting.status <> 'DRAFT' and v_tasting.reveal_mode <> 'OPEN' then
    raise exception 'that tasting has already started';
  end if;
  insert into tasting_participants (tasting_id, user_id, status, joined_at)
  values (v_tasting.id, v_uid, 'JOINED', now())
  on conflict (tasting_id, user_id) do update
    set status = 'JOINED',
        joined_at = coalesce(tasting_participants.joined_at, now())
    where tasting_participants.status <> 'JOINED';
  return v_tasting.id;
end;
$$;
grant execute on function public.join_tasting_by_code(text) to authenticated;

-- 4. semi-blind candidate list -----------------------------------------------
-- 20260710134710 granted SEMI_BLIND participants read access to every wine's
-- answer key (the candidate list they match glasses against). The
-- 20260716140000 rewrite of "wine_answers read" dropped that clause, so a
-- non-host participant in a semi-blind tasting has had an empty candidate
-- list since. Restore it — through the SECURITY DEFINER helper, never a raw
-- tasting_participants subquery (see CLAUDE.md on RLS recursion).
drop policy if exists "wine_answers read" on public.wine_answers;
create policy "wine_answers read" on public.wine_answers for select to authenticated using (
  has_scored_guess(wine_id)
  or exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_answers.wine_id
      and (
        t.host_id = auth.uid()
        or w.is_revealed
        or p.user_id = auth.uid()
        or (t.reveal_mode = 'SEMI_BLIND' and is_tasting_participant(t.id))
      )
  )
);

-- Same-transaction assertions (never trust "version recorded").
do $$
declare
  v_qual text;
begin
  select pol.qual::text into v_qual
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'wine_answers'
    and pol.policyname = 'wine_answers read';
  if v_qual is null or v_qual not like '%SEMI_BLIND%' then
    raise exception 'wine_answers read policy lacks the semi-blind clause post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name = 'guesses' and column_name = 'locked_at') then
    raise exception 'guesses.locked_at missing post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name = 'tastings' and column_name = 'join_code') then
    raise exception 'tastings.join_code missing post-migration';
  end if;
  if to_regprocedure('public.join_tasting_by_code(text)') is null then
    raise exception 'join_tasting_by_code missing post-migration';
  end if;
  if to_regprocedure('public.ensure_join_code(uuid)') is null then
    raise exception 'ensure_join_code missing post-migration';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tasting_guess_status' and p.prosecdef
  ) then
    raise exception 'tasting_guess_status is not SECURITY DEFINER post-migration';
  end if;
end $$;

