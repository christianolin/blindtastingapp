-- USA on the wine map, phase US-2 ROLLBACK: remove (abandon the wave before the promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 11).
--
-- Deletes the 16 US-2 places (deepest first), their relationships, boundaries
-- and knowledge (articles, styles and grapes cascade), and the catalog
-- (20260930084747) and knowledge (20260930094747) history
-- rows, so both can be applied again, as committed, in their order. Refuses once
-- the promote has run: VERIFIED keys are locked for good, and the way back is
-- the unpublish file.
-- Kept on purpose: the source snapshots (immutable; a re-stage reuses them) and
-- the Petite Sirah grape row the knowledge added (harmless; deleting it would
-- need every grape FK checked). The knowledge file inserts it with
-- "on conflict (name) do nothing", so it applies again on top of the kept row.
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
    raise exception 'US-2 remove: a later US wave exists: write its own rollback (%)', v_text;
  end if;
end $$;

do $$
declare v_text text;
begin
  -- The lock check first, so after a promote this is always the message.
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join _us2_rb e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if v_text is not null then
    raise exception 'US-2 remove: keys are locked (the promote ran): use the unpublish file instead (%)', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-2 remove: missing or not DRAFT: %', v_text; end if;
end $$;

delete from public.wine_place_relationships r
 using public.wine_places p
 where p.canonical_key in (select key from _us2_rb)
   and (r.source_place_id = p.id or r.target_place_id = p.id);
delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us2_rb);
delete from public.wine_places p
 using _us2_rb e
 where p.canonical_key = e.key and e.depth = 2;
delete from public.wine_places p
 using _us2_rb e
 where p.canonical_key = e.key and e.depth = 1;
delete from public.wine_places p
 using _us2_rb e
 where p.canonical_key = e.key and e.depth = 0;
delete from supabase_migrations.schema_migrations where version in ('20260930084747', '20260930094747');

do $$
declare n int;
begin
  select count(*) into n from public.wine_places where canonical_key = 'united-states' or canonical_key like 'united-states.%';
  if n <> 0 then raise exception 'US-2 remove: % united-states places left', n; end if;
  select (select count(*) from public.wine_place_articles a where not exists (select 1 from public.wine_places p where p.id = a.wine_place_id))
       + (select count(*) from public.wine_place_styles s where not exists (select 1 from public.wine_places p where p.id = s.wine_place_id))
       + (select count(*) from public.wine_place_grapes g where not exists (select 1 from public.wine_places p where p.id = g.wine_place_id))
    into n;
  if n <> 0 then raise exception 'US-2 remove: % orphan knowledge rows', n; end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20260930084747', '20260930094747')) then
    raise exception 'US-2 remove: history rows left';
  end if;
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
  raise notice 'US-2 remove: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
