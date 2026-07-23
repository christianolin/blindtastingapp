-- Spoiler-safe progressive read. get_wine_reveal returns ONLY the categories
-- revealed so far (<= reveal_step); unrevealed categories are never built into
-- the JSON. The three cell helpers are SECURITY INVOKER, so a client calling
-- them directly is RLS-gated (an unrevealed wine_answers row is invisible) —
-- only get_wine_reveal (SECURITY DEFINER) reads them freely, and only for
-- revealed steps. Live/guided uses the shared wines.reveal_step and includes
-- every participant; self-paced uses the caller's own guesses.reveal_step and
-- includes only the caller.

create or replace function reveal_answer_cell(p_wine_id uuid, p_key text) returns jsonb
language sql stable set search_path = public as $$
  select case p_key
    when 'country' then jsonb_build_object('country', a.country_id)
    when 'region' then jsonb_build_object('region', a.region_id)
    when 'appellation' then jsonb_build_object('appellation', a.appellation_id)
    when 'grapes' then jsonb_build_object('primary_grape', a.primary_grape_id, 'secondary_grape', a.secondary_grape_id)
    when 'producer' then jsonb_build_object('producer', a.producer_id)
    when 'type_designation' then jsonb_build_object('type_designation', a.type_designation_id)
    when 'vintage' then jsonb_build_object('vintage_kind', a.vintage_kind, 'vintage_year', a.vintage_year, 'vintage_tawny_years', a.vintage_tawny_years)
    else '{}'::jsonb end
  from wine_answers a where a.wine_id = p_wine_id;
$$;

create or replace function reveal_guess_cell(p_guess_id uuid, p_key text) returns jsonb
language sql stable set search_path = public as $$
  select case p_key
    when 'country' then jsonb_build_object('country', g.country_id)
    when 'region' then jsonb_build_object('region', g.region_id)
    when 'appellation' then jsonb_build_object('appellation', g.appellation_id)
    when 'grapes' then jsonb_build_object('primary_grape', g.primary_grape_id, 'secondary_grape', g.secondary_grape_id)
    when 'producer' then jsonb_build_object('producer', g.producer_id)
    when 'type_designation' then jsonb_build_object('type_designation', g.type_designation_id)
    when 'vintage' then jsonb_build_object('vintage_kind', g.vintage_kind, 'vintage_year', g.vintage_year, 'vintage_tawny_years', g.vintage_tawny_years)
    else '{}'::jsonb end
  from guesses g where g.id = p_guess_id;
$$;

create or replace function reveal_points_cell(p_guess_id uuid, p_key text) returns jsonb
language sql stable set search_path = public as $$
  select case p_key
    when 'country' then jsonb_build_object('country', g.country_points)
    when 'region' then jsonb_build_object('region', g.region_points)
    when 'appellation' then jsonb_build_object('appellation', g.appellation_points)
    when 'grapes' then jsonb_build_object('primary_grape', g.primary_grape_points, 'secondary_grape', g.secondary_grape_points)
    when 'producer' then jsonb_build_object('producer', g.producer_points)
    when 'type_designation' then jsonb_build_object('type_designation', g.type_designation_points)
    when 'vintage' then jsonb_build_object('vintage', g.vintage_points)
    else '{}'::jsonb end
  from guesses g where g.id = p_guess_id;
$$;

create or replace function get_wine_reveal(p_wine_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    where tasting_id = v_tasting and user_id = auth.uid();
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
end $$;
grant execute on function get_wine_reveal(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_wine_reveal') then
    raise exception 'get_wine_reveal missing post-migration';
  end if;
end $$;
