-- Wine-hub "Structure" panel: community-averaged nose/palate structure for a
-- catalog wine. Aggregates the ordinal SAT fields across ALL notes (any author)
-- — the same public-aggregate model as catalog_wine_guess_stats — returning the
-- average ordinal index per dimension (mapped 1..max via the enum's position)
-- plus the sample count. Dimensions with no data are omitted (e.g. tannin on
-- whites). SECURITY DEFINER so authenticated callers get aggregates across
-- authors without individual notes ever leaving the function.

create or replace function catalog_wine_structure(p_catalog_wine_id uuid)
returns table (dimension text, avg_index numeric, max_index int, n int)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select * from wset_notes where catalog_wine_id = p_catalog_wine_id
  )
  select 'nose_intensity',
         avg(array_position(enum_range(null::wset_intensity), nose_intensity)),
         array_length(enum_range(null::wset_intensity), 1),
         count(nose_intensity)::int
    from n having count(nose_intensity) > 0
  union all
  select 'sweetness',
         avg(array_position(enum_range(null::wset_sweetness), sweetness)),
         array_length(enum_range(null::wset_sweetness), 1),
         count(sweetness)::int
    from n having count(sweetness) > 0
  union all
  select 'acidity',
         avg(array_position(enum_range(null::wset_level), acidity)),
         array_length(enum_range(null::wset_level), 1),
         count(acidity)::int
    from n having count(acidity) > 0
  union all
  select 'tannin',
         avg(array_position(enum_range(null::wset_level), tannin)),
         array_length(enum_range(null::wset_level), 1),
         count(tannin)::int
    from n having count(tannin) > 0
  union all
  select 'alcohol',
         avg(array_position(enum_range(null::wset_level), alcohol)),
         array_length(enum_range(null::wset_level), 1),
         count(alcohol)::int
    from n having count(alcohol) > 0
  union all
  select 'body',
         avg(array_position(enum_range(null::wset_body), body)),
         array_length(enum_range(null::wset_body), 1),
         count(body)::int
    from n having count(body) > 0
  union all
  select 'flavour_intensity',
         avg(array_position(enum_range(null::wset_intensity), flavour_intensity)),
         array_length(enum_range(null::wset_intensity), 1),
         count(flavour_intensity)::int
    from n having count(flavour_intensity) > 0
  union all
  select 'finish',
         avg(array_position(enum_range(null::wset_finish), finish)),
         array_length(enum_range(null::wset_finish), 1),
         count(finish)::int
    from n having count(finish) > 0
$$;

revoke all on function catalog_wine_structure(uuid) from public;
grant execute on function catalog_wine_structure(uuid) to authenticated;
