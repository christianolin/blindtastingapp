-- Tannin nature: WSET L4 adds a descriptive "nature" line under Tannin (ripe,
-- soft, smooth, unripe, green, coarse, stalky, chalky, fine-grained). Stored as
-- an enum array on wset_notes, exactly like observations / faults: multi-select,
-- optional, and it never counts toward the "assessed" tally. save_wset_note is
-- recreated to persist it in both the update and insert branches.

do $$
begin
  if to_regtype('public.wset_tannin_nature') is null then
    create type wset_tannin_nature as enum
      ('RIPE', 'SOFT', 'SMOOTH', 'UNRIPE', 'GREEN', 'COARSE', 'STALKY', 'CHALKY', 'FINE_GRAINED');
  end if;
end $$;

alter table wset_notes
  add column if not exists tannin_nature wset_tannin_nature[] not null default '{}';

create or replace function save_wset_note(p_note jsonb, p_aromas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := coalesce((p_note->>'id')::uuid, gen_random_uuid());
begin
  if exists (
    select 1 from wset_notes where id = v_id and author_id = auth.uid()
  ) then
    update wset_notes set
      catalog_wine_id = (p_note->>'catalog_wine_id')::uuid,
      tasted_on = coalesce((p_note->>'tasted_on')::date, tasted_on),
      clarity = (p_note->>'clarity')::wset_clarity,
      appearance_intensity =
        (p_note->>'appearance_intensity')::wset_appearance_intensity,
      colour_hue = (p_note->>'colour_hue')::wset_colour_hue,
      observations = coalesce(
        (select array_agg(x::wset_observation)
         from jsonb_array_elements_text(p_note->'observations') x), '{}'),
      condition = (p_note->>'condition')::wset_condition,
      faults = coalesce(
        (select array_agg(x::wset_fault)
         from jsonb_array_elements_text(p_note->'faults') x), '{}'),
      nose_intensity = (p_note->>'nose_intensity')::wset_intensity,
      development = (p_note->>'development')::wset_development,
      sweetness = (p_note->>'sweetness')::wset_sweetness,
      acidity = (p_note->>'acidity')::wset_level,
      tannin = (p_note->>'tannin')::wset_level,
      tannin_nature = coalesce(
        (select array_agg(x::wset_tannin_nature)
         from jsonb_array_elements_text(p_note->'tannin_nature') x), '{}'),
      alcohol = (p_note->>'alcohol')::wset_level,
      body = (p_note->>'body')::wset_body,
      mousse = (p_note->>'mousse')::wset_mousse,
      flavour_intensity = (p_note->>'flavour_intensity')::wset_intensity,
      finish = (p_note->>'finish')::wset_finish,
      quality_score = (p_note->>'quality_score')::smallint,
      price_category = (p_note->>'price_category')::wset_price_category,
      readiness = (p_note->>'readiness')::wset_readiness,
      taster_notes = coalesce(p_note->>'taster_notes', '')
    where id = v_id;
  else
    insert into wset_notes (
      id, catalog_wine_id, author_id, tasted_on,
      clarity, appearance_intensity, colour_hue, observations, condition,
      faults, nose_intensity, development, sweetness, acidity, tannin,
      tannin_nature, alcohol, body, mousse, flavour_intensity, finish,
      quality_score, price_category, readiness, taster_notes
    )
    values (
      v_id,
      (p_note->>'catalog_wine_id')::uuid,
      auth.uid(),
      coalesce((p_note->>'tasted_on')::date, current_date),
      (p_note->>'clarity')::wset_clarity,
      (p_note->>'appearance_intensity')::wset_appearance_intensity,
      (p_note->>'colour_hue')::wset_colour_hue,
      coalesce(
        (select array_agg(x::wset_observation)
         from jsonb_array_elements_text(p_note->'observations') x), '{}'),
      (p_note->>'condition')::wset_condition,
      coalesce(
        (select array_agg(x::wset_fault)
         from jsonb_array_elements_text(p_note->'faults') x), '{}'),
      (p_note->>'nose_intensity')::wset_intensity,
      (p_note->>'development')::wset_development,
      (p_note->>'sweetness')::wset_sweetness,
      (p_note->>'acidity')::wset_level,
      (p_note->>'tannin')::wset_level,
      coalesce(
        (select array_agg(x::wset_tannin_nature)
         from jsonb_array_elements_text(p_note->'tannin_nature') x), '{}'),
      (p_note->>'alcohol')::wset_level,
      (p_note->>'body')::wset_body,
      (p_note->>'mousse')::wset_mousse,
      (p_note->>'flavour_intensity')::wset_intensity,
      (p_note->>'finish')::wset_finish,
      (p_note->>'quality_score')::smallint,
      (p_note->>'price_category')::wset_price_category,
      (p_note->>'readiness')::wset_readiness,
      coalesce(p_note->>'taster_notes', '')
    );
  end if;

  delete from wset_note_aromas where note_id = v_id;
  insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate)
  select
    v_id,
    (a->>'term_id')::uuid,
    coalesce((a->>'sensed_on_nose')::boolean, false),
    coalesce((a->>'sensed_on_palate')::boolean, false)
  from jsonb_array_elements(coalesce(p_aromas, '[]'::jsonb)) as a;

  return v_id;
end;
$$;

grant execute on function save_wset_note(jsonb, jsonb) to authenticated;

do $$
begin
  if to_regtype('public.wset_tannin_nature') is null then
    raise exception 'final-state: wset_tannin_nature enum missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wset_notes'
      and column_name = 'tannin_nature'
  ) then
    raise exception 'final-state: wset_notes.tannin_nature column missing';
  end if;
end $$;
