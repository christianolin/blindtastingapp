-- Semi-blind tastings: every wine's full answer key is visible up front (as
-- a "candidate list"), participants just don't know which glass is which.
-- Guessing becomes "pick which candidate wine this glass is" instead of
-- filling in each category — reveal_wine resolves that pick to the chosen
-- wine's actual answer_key and scores it exactly like a normal guess, so the
-- scoring engine itself doesn't need a special case, just an extra input path.

create type reveal_mode_type as enum ('BLIND', 'SEMI_BLIND');

alter table tastings
  add column reveal_mode reveal_mode_type not null default 'BLIND';

alter table guesses
  add column guessed_wine_id uuid references wines(id) on delete set null;

-- Wine answers become readable to any participant of a SEMI_BLIND tasting,
-- regardless of per-wine reveal state or contributor — that's the whole
-- point of the mode.
drop policy "wine_answers read" on wine_answers;
create policy "wine_answers read" on wine_answers for select to authenticated using (
  exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (
        t.host_id = auth.uid()
        or w.is_revealed
        or p.user_id = auth.uid()
        or (t.reveal_mode = 'SEMI_BLIND' and is_tasting_participant(w.tasting_id))
      )
  )
);

-- reveal_wine: when a guess references a candidate wine (guessed_wine_id,
-- semi-blind mode) score against THAT wine's answer key; otherwise fall back
-- to the guess's own category columns (blind mode, unchanged behavior).
create or replace function reveal_wine(p_wine_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer wine_answers%rowtype;
  v_is_host boolean;
begin
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id and t.host_id = auth.uid()
  ) into v_is_host;

  if not v_is_host then
    raise exception 'Only the host can reveal a wine';
  end if;

  select * into v_answer from wine_answers where wine_id = p_wine_id;
  if not found then
    raise exception 'Wine % has no answer key recorded', p_wine_id;
  end if;

  update guesses g
  set
    country_points = case when resolved.country_id = v_answer.country_id then 2 else 0 end,
    region_points = case when resolved.region_id = v_answer.region_id then 3 else 0 end,
    appellation_points = case when resolved.appellation_id = v_answer.appellation_id then 5 else 0 end,
    primary_grape_points = case when resolved.primary_grape_id = v_answer.primary_grape_id then 8 else 0 end,
    secondary_grape_points = case
      when v_answer.secondary_grape_id is null then null
      when resolved.secondary_grape_id = v_answer.secondary_grape_id then 2
      else 0
    end,
    producer_points = case when resolved.producer_id = v_answer.producer_id then 6 else 0 end,
    type_designation_points = case
      when v_answer.type_designation_id is null then null
      when resolved.type_designation_id = v_answer.type_designation_id then 2
      else 0
    end,
    vintage_points = case
      when resolved.vintage_kind is null then 0
      when resolved.vintage_kind = v_answer.vintage_kind
        and resolved.vintage_kind = 'NV' then 2
      when resolved.vintage_kind = v_answer.vintage_kind
        and resolved.vintage_kind = 'TAWNY'
        and resolved.vintage_tawny_years = v_answer.vintage_tawny_years then 2
      when resolved.vintage_kind = v_answer.vintage_kind
        and resolved.vintage_kind = 'YEAR'
        and resolved.vintage_year = v_answer.vintage_year then 2
      when resolved.vintage_kind = v_answer.vintage_kind
        and resolved.vintage_kind = 'YEAR'
        and abs(resolved.vintage_year - v_answer.vintage_year) = 1 then 1
      else 0
    end,
    scored_at = now()
  from (
    select
      g2.id,
      coalesce(gw.country_id, g2.country_id) as country_id,
      coalesce(gw.region_id, g2.region_id) as region_id,
      coalesce(gw.appellation_id, g2.appellation_id) as appellation_id,
      coalesce(gw.primary_grape_id, g2.primary_grape_id) as primary_grape_id,
      coalesce(gw.secondary_grape_id, g2.secondary_grape_id) as secondary_grape_id,
      coalesce(gw.producer_id, g2.producer_id) as producer_id,
      coalesce(gw.type_designation_id, g2.type_designation_id) as type_designation_id,
      coalesce(gw.vintage_kind, g2.vintage_kind) as vintage_kind,
      coalesce(gw.vintage_year, g2.vintage_year) as vintage_year,
      coalesce(gw.vintage_tawny_years, g2.vintage_tawny_years) as vintage_tawny_years
    from guesses g2
    left join wine_answers gw on gw.wine_id = g2.guessed_wine_id
    where g2.wine_id = p_wine_id
  ) resolved
  where g.id = resolved.id;

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

  update wines set is_revealed = true where id = p_wine_id;
end;
$$;
