-- Semi-blind matching isn't the VM/DM category-by-category scoring — you're
-- picking which whole wine a glass is, not guessing country/region/grape/
-- etc. independently, so a category breakdown doesn't mean anything (a
-- totally wrong match could still show a "correct" country by coincidence).
-- Score it as a simple 1 (matched) / 0 (didn't) instead, with every
-- category column left null (not applicable) — the tasting's total then
-- naturally reads as "wines matched correctly" rather than a VM/DM point
-- sum. Fully-blind guesses are unchanged.
create or replace function reveal_wine(p_wine_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer wine_answers%rowtype;
  v_tasting_id uuid;
  v_contributor_participant_id uuid;
  v_is_host boolean;
  v_is_participant boolean;
  v_eligible_count int;
  v_guess_count int;
  v_reveal_mode reveal_mode_type;
begin
  select w.tasting_id, w.contributor_participant_id, t.host_id = auth.uid(), t.reveal_mode
    into v_tasting_id, v_contributor_participant_id, v_is_host, v_reveal_mode
  from wines w
  join tastings t on t.id = w.tasting_id
  where w.id = p_wine_id;

  if v_tasting_id is null then
    raise exception 'Wine % not found', p_wine_id;
  end if;

  if not v_is_host then
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
      and id is distinct from v_contributor_participant_id;

    select count(*) into v_guess_count
    from guesses where wine_id = p_wine_id;

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
$$;
