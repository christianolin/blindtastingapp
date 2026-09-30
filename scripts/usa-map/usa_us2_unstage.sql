-- USA on the wine map, phase US-2 ROLLBACK: unstage (after --stage, before the promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 11).
--
-- Removes the 16 DRAFT, non-current boundaries stage-usa-ava.mjs --stage
-- committed, and nothing else: the places, their knowledge and the source
-- snapshots stay (snapshots are immutable; a re-stage reuses them by source,
-- revision and checksum). Ends with the checked neighbour refresh, which brings
-- the cache and master's map-data checks back to green.
--
-- Deliberately outside supabase/migrations/, and with no version prefix: a
-- replay must never run it, and it must never be recorded. Apply it with
-- scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier: that records a schema_migrations version and
-- refuses it the second time, and a rollback may be needed more than once
-- (a second unstage after a re-stage). Re-appliable: every step asserts its
-- own pre-state, and nothing is recorded. Rendered by
-- scripts/usa-map/render-us2-sql.mjs; do not hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us2_rb;
create temp table _us2_rb (key text primary key, depth int not null) on commit drop;
insert into _us2_rb values
  ('united-states', 0),
  ('united-states.california', 1),
  ('united-states.california.central-coast', 2),
  ('united-states.california.central-valley', 2),
  ('united-states.california.north-coast', 2),
  ('united-states.california.sierra-foothills', 2),
  ('united-states.california.south-coast', 2),
  ('united-states.new-york', 1),
  ('united-states.new-york.finger-lakes', 2),
  ('united-states.new-york.long-island', 2),
  ('united-states.oregon', 1),
  ('united-states.oregon.southern-oregon', 2),
  ('united-states.oregon.willamette-valley', 2),
  ('united-states.washington', 1),
  ('united-states.washington.columbia-valley', 2),
  ('united-states.washington.puget-sound', 2);

do $$
declare v_text text;
begin
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
     and p.canonical_key not in (select key from _us2_rb);
  if v_text is not null then
    raise exception 'US-2 unstage: a later US wave exists: write its own rollback (%)', v_text;
  end if;
end $$;

do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-2 unstage: missing or not DRAFT (after the promote, use the unpublish file): %', v_text; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us2_rb) and (b.is_current or b.quality_status <> 'DRAFT');
  if n <> 0 then raise exception 'US-2 unstage: % US boundaries are current or not DRAFT', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us2_rb) and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 16 then raise exception 'US-2 unstage: % DRAFT non-current US boundaries, expected 16', n; end if;
end $$;

delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us2_rb)
   and b.quality_status = 'DRAFT' and not b.is_current;

do $$
declare n int;
begin
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us2_rb);
  if n <> 0 then raise exception 'US-2 unstage: % US boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where p.canonical_key in (select key from _us2_rb) and p.publication_status = 'DRAFT';
  if n <> 16 then raise exception 'US-2 unstage: % DRAFT US places, expected 16', n; end if;
end $$;

do $$
declare
  t0 timestamptz := clock_timestamp();
  v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice 'US-2 unstage: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
