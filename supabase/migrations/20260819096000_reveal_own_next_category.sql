-- Progressive reveal (self-paced / free): a participant reveals THEIR OWN
-- answer one category at a time. Scoped to the caller's own guess; never
-- touches wines.reveal_step / is_revealed. Blocked in guided-live tastings,
-- where the shared reveal is host-driven.
create or replace function reveal_own_next_category(p_wine_id uuid, p_expected_step smallint)
returns smallint language plpgsql security definer set search_path = public as $$
declare
  v_ans wine_answers%rowtype;
  v_tasting uuid; v_status text; v_timing text; v_sequential boolean;
  v_pid uuid; v_steps text[]; v_next text; v_new smallint;
begin
  select w.tasting_id, t.status::text, t.timing_mode::text, t.sequential_guessing
    into v_tasting, v_status, v_timing, v_sequential
  from wines w join tastings t on t.id = w.tasting_id where w.id = p_wine_id;
  if v_tasting is null then raise exception 'Wine % not found', p_wine_id; end if;
  if v_status = 'CLOSED' then raise exception 'Tasting is finished'; end if;
  if v_timing = 'LIVE' and v_sequential then
    raise exception 'Guided live reveal is host-driven';
  end if;

  select id into v_pid from tasting_participants
    where tasting_id = v_tasting and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null then raise exception 'Not a participant'; end if;

  select * into v_ans from wine_answers where wine_id = p_wine_id;
  if not found then raise exception 'No answer key for wine %', p_wine_id; end if;
  v_steps := in_play_steps(p_wine_id);

  update guesses set reveal_step = reveal_step + 1
   where wine_id = p_wine_id and participant_id = v_pid
     and reveal_step = p_expected_step and reveal_step < array_length(v_steps, 1);
  if not found then
    return (select reveal_step from guesses
            where wine_id = p_wine_id and participant_id = v_pid);
  end if;
  select reveal_step into v_new from guesses
    where wine_id = p_wine_id and participant_id = v_pid;
  v_next := v_steps[v_new];

  if v_next = 'country' then
    update guesses set country_points = case when country_id = v_ans.country_id then 2 else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'region' then
    update guesses set region_points = case when region_id = v_ans.region_id then 3 else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'appellation' then
    update guesses set appellation_points = case when appellation_id = v_ans.appellation_id then 5 else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'grapes' then
    update guesses set
      primary_grape_points = case when primary_grape_id = v_ans.primary_grape_id then 8 else 0 end,
      secondary_grape_points = case
        when v_ans.secondary_grape_id is null then null
        when secondary_grape_id = v_ans.secondary_grape_id then 2 else 0 end
      where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'producer' then
    update guesses set producer_points = case when producer_id = v_ans.producer_id then 6 else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'type_designation' then
    update guesses set type_designation_points = case when type_designation_id = v_ans.type_designation_id then 2 else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  elsif v_next = 'vintage' then
    update guesses set vintage_points = case
      when vintage_kind is null then 0
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'NV' then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'TAWNY' and vintage_tawny_years = v_ans.vintage_tawny_years then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and vintage_year = v_ans.vintage_year then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and abs(vintage_year - v_ans.vintage_year) = 1 then 1
      else 0 end where wine_id = p_wine_id and participant_id = v_pid;
  end if;

  update guesses set
    total_points = coalesce(country_points,0) + coalesce(region_points,0)
      + coalesce(appellation_points,0) + coalesce(primary_grape_points,0)
      + coalesce(secondary_grape_points,0) + coalesce(producer_points,0)
      + coalesce(type_designation_points,0) + coalesce(vintage_points,0),
    scored_at = case when v_new >= array_length(v_steps, 1) then now() else scored_at end
  where wine_id = p_wine_id and participant_id = v_pid;

  return v_new;
end $$;
grant execute on function reveal_own_next_category(uuid, smallint) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'reveal_own_next_category') then
    raise exception 'reveal_own_next_category missing post-migration';
  end if;
end $$;
