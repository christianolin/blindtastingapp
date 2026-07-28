-- save_wset_note: single-call upsert of a WSET note plus full replacement
-- of its aroma rows. SECURITY INVOKER on purpose: every statement inside
-- runs as the calling role, so the 20260829194000 RLS policies gate all
-- writes (insert demands author_id = auth.uid(); update/delete only reach
-- the caller's own rows). Also catalog_wine_ratings, the aggregate view
-- /cellar reads (security_invoker = true so the reader's RLS applies).

create or replace function save_wset_note(p_note jsonb, p_aromas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := coalesce((p_note->>'id')::uuid, gen_random_uuid());
begin
  -- Insert-or-update branches on existence of the CALLER's row: another
  -- author's id falls through to the insert branch, where the duplicate
  -- primary key (or RLS with-check) rejects the hijack.
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
      alcohol, body, mousse, flavour_intensity, finish, quality_score,
      price_category, readiness, taster_notes
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

  -- Replace, not merge: the sheet always sends the full aroma set. Both
  -- statements run as the caller, so the wset_note_aromas ownership
  -- policies gate them.
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

-- Aggregate ratings per catalog wine: simple average over all scored notes,
-- all history counts (re-tastings included). security_invoker so the
-- reader's own RLS on wset_notes applies (public read today, but the view
-- must not become a bypass if that ever tightens).
create or replace view catalog_wine_ratings
with (security_invoker = true) as
select
  catalog_wine_id,
  avg(quality_score)::numeric as avg_score,
  count(*)::int as note_count
from wset_notes
where quality_score is not null
group by catalog_wine_id;

grant select on catalog_wine_ratings to authenticated;

-- Final-state asserts.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_wset_note'
      and p.prosecdef = false
  ) then
    raise exception 'final-state: save_wset_note (security invoker) missing';
  end if;
  if to_regclass('public.catalog_wine_ratings') is null then
    raise exception 'final-state: catalog_wine_ratings view missing';
  end if;
  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'catalog_wine_ratings'
  ) then
    raise exception 'final-state: catalog_wine_ratings is not a view';
  end if;
end $$;
