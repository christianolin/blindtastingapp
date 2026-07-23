-- Progressive reveal (guided/shared): reveal one category at a time for the
-- current wine. in_play_steps derives the ordered non-skipped step keys from
-- the answer (only appellation + type_designation are nullable, so only those
-- are skippable; producer + vintage columns are NOT NULL). reveal_next_category
-- scores just the advancing category for every guess, via compare-and-set on
-- wines.reveal_step, flipping is_revealed on the final step.

create or replace function in_play_steps(p_wine_id uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    'country', 'region',
    case when a.appellation_id is not null then 'appellation' end,
    'grapes',
    'producer',
    case when a.type_designation_id is not null then 'type_designation' end,
    'vintage'
  ], null)
  from wine_answers a where a.wine_id = p_wine_id;
$$;
grant execute on function in_play_steps(uuid) to authenticated;

create or replace function reveal_next_category(p_wine_id uuid, p_expected_step smallint)
returns smallint language plpgsql security definer set search_path = public as $$
declare
  v_ans wine_answers%rowtype;
  v_tasting uuid; v_contrib uuid; v_is_host boolean; v_status text;
  v_steps text[]; v_next text; v_new smallint;
begin
  select w.tasting_id, w.contributor_participant_id, t.host_id = auth.uid(),
         t.status::text
    into v_tasting, v_contrib, v_is_host, v_status
  from wines w join tastings t on t.id = w.tasting_id where w.id = p_wine_id;
  if v_tasting is null then raise exception 'Wine % not found', p_wine_id; end if;
  if v_status = 'CLOSED' then raise exception 'Tasting is finished'; end if;
  if not (v_is_host or v_contrib in (
    select id from tasting_participants
    where tasting_id = v_tasting and user_id = auth.uid()))
  then raise exception 'Only the host or the wine owner can reveal'; end if;

  select * into v_ans from wine_answers where wine_id = p_wine_id;
  if not found then raise exception 'No answer key for wine %', p_wine_id; end if;
  v_steps := in_play_steps(p_wine_id);

  -- Compare-and-set: no-op (return current) if already advanced past expected
  -- or already fully revealed.
  update wines set reveal_step = reveal_step + 1
   where id = p_wine_id and reveal_step = p_expected_step
     and reveal_step < array_length(v_steps, 1);
  if not found then
    return (select reveal_step from wines where id = p_wine_id);
  end if;
  select reveal_step into v_new from wines where id = p_wine_id;
  v_next := v_steps[v_new];  -- 1-based: the step just revealed

  if v_next = 'country' then
    update guesses set country_points = case when country_id = v_ans.country_id then 2 else 0 end where wine_id = p_wine_id;
  elsif v_next = 'region' then
    update guesses set region_points = case when region_id = v_ans.region_id then 3 else 0 end where wine_id = p_wine_id;
  elsif v_next = 'appellation' then
    update guesses set appellation_points = case when appellation_id = v_ans.appellation_id then 5 else 0 end where wine_id = p_wine_id;
  elsif v_next = 'grapes' then
    update guesses set
      primary_grape_points = case when primary_grape_id = v_ans.primary_grape_id then 8 else 0 end,
      secondary_grape_points = case
        when v_ans.secondary_grape_id is null then null
        when secondary_grape_id = v_ans.secondary_grape_id then 2 else 0 end
      where wine_id = p_wine_id;
  elsif v_next = 'producer' then
    update guesses set producer_points = case when producer_id = v_ans.producer_id then 6 else 0 end where wine_id = p_wine_id;
  elsif v_next = 'type_designation' then
    update guesses set type_designation_points = case when type_designation_id = v_ans.type_designation_id then 2 else 0 end where wine_id = p_wine_id;
  elsif v_next = 'vintage' then
    update guesses set vintage_points = case
      when vintage_kind is null then 0
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'NV' then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'TAWNY' and vintage_tawny_years = v_ans.vintage_tawny_years then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and vintage_year = v_ans.vintage_year then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and abs(vintage_year - v_ans.vintage_year) = 1 then 1
      else 0 end where wine_id = p_wine_id;
  end if;

  update guesses set
    total_points = coalesce(country_points,0) + coalesce(region_points,0)
      + coalesce(appellation_points,0) + coalesce(primary_grape_points,0)
      + coalesce(secondary_grape_points,0) + coalesce(producer_points,0)
      + coalesce(type_designation_points,0) + coalesce(vintage_points,0),
    scored_at = coalesce(scored_at, now())
  where wine_id = p_wine_id;

  if v_new >= array_length(v_steps, 1) then
    update wines set is_revealed = true where id = p_wine_id;
  end if;
  return v_new;
end $$;
grant execute on function reveal_next_category(uuid, smallint) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'reveal_next_category') then
    raise exception 'reveal_next_category missing post-migration';
  end if;
  if not exists (select 1 from pg_proc where proname = 'in_play_steps') then
    raise exception 'in_play_steps missing post-migration';
  end if;
end $$;
