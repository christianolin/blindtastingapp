-- Reveal timing:
--   * LIVE tastings: the host reveals each wine manually (button). Never
--     auto-revealed (enforced app-side in maybeAutoRevealWine).
--   * ASYNC tastings: choose per tasting when a guesser sees their result —
--     'AFTER_ALL' (the historical behaviour: nothing shows until everyone has
--     guessed that wine, then it auto-reveals) or 'IMMEDIATE' (you see your own
--     score the moment you submit, without revealing the answer to anyone else;
--     the wine still auto-reveals globally once all have guessed).
-- Type name deliberately differs from the column name (a Postgres enum type
-- can't share its name with a column that uses it — see reveal_mode_type).
create type async_reveal_type as enum ('AFTER_ALL', 'IMMEDIATE');

alter table tastings
  add column if not exists async_reveal_policy async_reveal_type not null default 'AFTER_ALL';

-- SECURITY DEFINER helper so the wine_answers read policy can grant a guesser
-- access to an answer they've already been scored against (immediate mode)
-- without a raw cross-table subquery (which would risk the RLS recursion the
-- tastings/participants/wines policies keep re-triggering).
create or replace function has_scored_guess(p_wine_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from guesses g
    join tasting_participants p on p.id = g.participant_id
    where g.wine_id = p_wine_id
      and p.user_id = auth.uid()
      and g.scored_at is not null
  );
$$;

grant execute on function has_scored_guess(uuid) to authenticated;

-- Extend the answer-visibility policy: you may also read a wine's answer once
-- your own guess for it has been scored (immediate-reveal async), even though
-- the wine isn't globally revealed yet.
drop policy "wine_answers read" on wine_answers;
create policy "wine_answers read" on wine_answers for select to authenticated using (
  has_scored_guess(wine_id)
  or exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (
        t.host_id = auth.uid()
        or w.is_revealed
        or p.user_id = auth.uid()
      )
  )
);

-- Scores just the caller's own guess for one wine, immediately, without
-- touching wines.is_revealed (so other participants can still guess). Only
-- acts on ASYNC + IMMEDIATE tastings and only for a JOINED participant's
-- not-yet-scored guess. Mirrors reveal_wine's per-category / semi-blind
-- scoring exactly — same point values, same null-for-not-applicable rules.
create or replace function score_own_guess(p_wine_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer wine_answers%rowtype;
  v_tasting_id uuid;
  v_reveal_mode reveal_mode_type;
  v_timing timing_mode;
  v_policy async_reveal_type;
  v_participant_id uuid;
begin
  select w.tasting_id, t.reveal_mode, t.timing_mode, t.async_reveal_policy
    into v_tasting_id, v_reveal_mode, v_timing, v_policy
  from wines w
  join tastings t on t.id = w.tasting_id
  where w.id = p_wine_id;

  if v_tasting_id is null then
    return;
  end if;
  if v_timing <> 'ASYNC' or v_policy <> 'IMMEDIATE' then
    return;
  end if;

  select id into v_participant_id
  from tasting_participants
  where tasting_id = v_tasting_id and user_id = auth.uid() and status = 'JOINED';
  if v_participant_id is null then
    return;
  end if;

  select * into v_answer from wine_answers where wine_id = p_wine_id;
  if not found then
    return;
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
    where g.wine_id = p_wine_id
      and g.participant_id = v_participant_id
      and g.scored_at is null;
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
        when g.vintage_kind = v_answer.vintage_kind and g.vintage_kind = 'NV' then 2
        when g.vintage_kind = v_answer.vintage_kind and g.vintage_kind = 'TAWNY'
          and g.vintage_tawny_years = v_answer.vintage_tawny_years then 2
        when g.vintage_kind = v_answer.vintage_kind and g.vintage_kind = 'YEAR'
          and g.vintage_year = v_answer.vintage_year then 2
        when g.vintage_kind = v_answer.vintage_kind and g.vintage_kind = 'YEAR'
          and abs(g.vintage_year - v_answer.vintage_year) = 1 then 1
        else 0
      end,
      scored_at = now()
    where g.wine_id = p_wine_id
      and g.participant_id = v_participant_id
      and g.scored_at is null;

    update guesses
    set total_points = coalesce(country_points, 0)
      + coalesce(region_points, 0)
      + coalesce(appellation_points, 0)
      + coalesce(primary_grape_points, 0)
      + coalesce(secondary_grape_points, 0)
      + coalesce(producer_points, 0)
      + coalesce(type_designation_points, 0)
      + coalesce(vintage_points, 0)
    where wine_id = p_wine_id and participant_id = v_participant_id;
  end if;
end;
$$;

grant execute on function score_own_guess(uuid) to authenticated;
