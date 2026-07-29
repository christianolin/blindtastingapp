-- Wine-hub aggregates (P3): a descriptor-frequency view and a guess-accuracy RPC
-- that power the catalog wine page's "what people find" and "blind-tasting track
-- record" sections.
--
-- catalog_wine_descriptors: security_invoker view. Both wset_notes and
-- wset_note_aromas are public-read, so every authenticated reader sees the full
-- community aggregate. One row per (wine, term) with a mention count.
--
-- catalog_wine_guess_stats: SECURITY DEFINER because cross-tasting guess reads are
-- RLS-scoped (own / revealed / host). It returns ONLY aggregate counts, and only
-- over REVEALED wines + SCORED guesses, so an unrevealed tasting can never leak or
-- spoil a wine's presence. A field is "correct" when its <field>_points > 0.
--
-- Idempotent: create-or-replace + grants are re-runnable; the final-state block
-- asserts end state, not row deltas.

create or replace view catalog_wine_descriptors
with (security_invoker = true) as
select
  n.catalog_wine_id,
  a.term_id,
  t.term,
  t.origin,
  count(*)::int as mentions
from wset_note_aromas a
join wset_notes n on n.id = a.note_id
join wset_aroma_terms t on t.id = a.term_id
where n.catalog_wine_id is not null
group by n.catalog_wine_id, a.term_id, t.term, t.origin;

grant select on catalog_wine_descriptors to authenticated;

create or replace function catalog_wine_guess_stats(p_catalog_wine_id uuid)
returns table (
  appearances int,
  guess_count int,
  country_correct int,
  region_correct int,
  appellation_correct int,
  primary_grape_correct int,
  secondary_grape_correct int,
  producer_correct int,
  type_designation_correct int,
  vintage_correct int
)
language sql
stable
security definer
set search_path = public
as $$
  with appearance as (
    select distinct w.id as wine_id, w.tasting_id
    from wine_answers wa
    join wines w on w.id = wa.wine_id
    where wa.catalog_wine_id = p_catalog_wine_id
      and w.is_revealed
  ),
  scored as (
    select g.*
    from guesses g
    join appearance ap on ap.wine_id = g.wine_id
    where g.scored_at is not null
  )
  select
    (select count(distinct tasting_id) from appearance)::int,
    (select count(*) from scored)::int,
    (select count(*) from scored where coalesce(country_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(region_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(appellation_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(primary_grape_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(secondary_grape_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(producer_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(type_designation_points, 0) > 0)::int,
    (select count(*) from scored where coalesce(vintage_points, 0) > 0)::int;
$$;

grant execute on function catalog_wine_guess_stats(uuid) to authenticated;

-- Final-state assertions.
do $$
begin
  if to_regclass('public.catalog_wine_descriptors') is null then
    raise exception 'final-state: catalog_wine_descriptors view missing';
  end if;
  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'catalog_wine_descriptors'
  ) then
    raise exception 'final-state: catalog_wine_descriptors is not a view';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'catalog_wine_guess_stats'
  ) then
    raise exception 'final-state: catalog_wine_guess_stats function missing';
  end if;
end $$;
