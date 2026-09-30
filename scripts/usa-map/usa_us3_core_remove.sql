-- USA on the wine map, phase US-3 core batch ROLLBACK: remove (abandon the batch before its promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md Task 20).
--
-- Deletes the 86 places of the core batch (deepest first), their
-- relationships, boundaries and knowledge (articles, styles and grapes cascade),
-- and the catalog (20260930154747) and knowledge (20260930164747)
-- history rows, so both apply again as committed. Refuses once the promote has
-- run (keys lock for good; use the unpublish file), and while any other
-- California place outside the earlier waves and this batch exists (remove the
-- later batch first). Keeps the source snapshots (immutable; a re-stage reuses them).
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_rb, pg_temp._us3_known;
create temp table _us3_rb (key text primary key, depth int not null) on commit drop;
insert into _us3_rb values
  ('united-states.california.central-coast.alisos-canyon', 3),
  ('united-states.california.central-coast.carmel-valley', 3),
  ('united-states.california.central-coast.gabilan-mountains', 3),
  ('united-states.california.central-coast.gabilan-mountains.chalone', 4),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan', 4),
  ('united-states.california.central-coast.monterey', 3),
  ('united-states.california.central-coast.monterey.arroyo-seco', 4),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands', 4),
  ('united-states.california.central-coast.paso-robles', 3),
  ('united-states.california.central-coast.paso-robles.adelaida-district', 4),
  ('united-states.california.central-coast.paso-robles.creston-district', 4),
  ('united-states.california.central-coast.paso-robles.el-pomar-district', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district', 4),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district', 4),
  ('united-states.california.central-coast.paso-robles.san-juan-creek', 4),
  ('united-states.california.central-coast.paso-robles.san-miguel-district', 4),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch', 4),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district', 4),
  ('united-states.california.central-coast.san-francisco-bay', 3),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley', 4),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains', 4),
  ('united-states.california.central-coast.san-luis-obispo-coast', 3),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley', 4),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley', 4),
  ('united-states.california.central-coast.santa-maria-valley', 3),
  ('united-states.california.central-coast.santa-ynez-valley', 3),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon', 4),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara', 4),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district', 4),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills', 4),
  ('united-states.california.central-valley.lodi', 3),
  ('united-states.california.central-valley.lodi.alta-mesa', 4),
  ('united-states.california.central-valley.lodi.borden-ranch', 4),
  ('united-states.california.central-valley.lodi.clements-hills', 4),
  ('united-states.california.central-valley.lodi.cosumnes-river', 4),
  ('united-states.california.central-valley.lodi.jahant', 4),
  ('united-states.california.central-valley.lodi.mokelumne-river', 4),
  ('united-states.california.central-valley.lodi.sloughhouse', 4),
  ('united-states.california.el-dorado', 2),
  ('united-states.california.el-dorado.fair-play', 3),
  ('united-states.california.north-coast.clear-lake', 3),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county', 4),
  ('united-states.california.north-coast.fountaingrove-district', 3),
  ('united-states.california.north-coast.los-carneros', 3),
  ('united-states.california.north-coast.mendocino', 3),
  ('united-states.california.north-coast.mendocino.anderson-valley', 4),
  ('united-states.california.north-coast.mendocino-ridge', 3),
  ('united-states.california.north-coast.napa-valley', 3),
  ('united-states.california.north-coast.napa-valley.atlas-peak', 4),
  ('united-states.california.north-coast.napa-valley.calistoga', 4),
  ('united-states.california.north-coast.napa-valley.chiles-valley', 4),
  ('united-states.california.north-coast.napa-valley.coombsville', 4),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district', 4),
  ('united-states.california.north-coast.napa-valley.howell-mountain', 4),
  ('united-states.california.north-coast.napa-valley.mt-veeder', 4),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley', 4),
  ('united-states.california.north-coast.napa-valley.oakville', 4),
  ('united-states.california.north-coast.napa-valley.rutherford', 4),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district', 4),
  ('united-states.california.north-coast.napa-valley.st-helena', 4),
  ('united-states.california.north-coast.napa-valley.stags-leap-district', 4),
  ('united-states.california.north-coast.napa-valley.yountville', 4),
  ('united-states.california.north-coast.northern-sonoma', 3),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley', 4),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley', 4),
  ('united-states.california.north-coast.northern-sonoma.knights-valley', 4),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley', 4),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill', 5),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley', 5),
  ('united-states.california.north-coast.petaluma-gap', 3),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak', 3),
  ('united-states.california.north-coast.rockpile', 3),
  ('united-states.california.north-coast.sonoma-coast', 3),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast', 4),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview', 5),
  ('united-states.california.north-coast.sonoma-valley', 3),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley', 4),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county', 4),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain', 4),
  ('united-states.california.north-coast.wild-horse-valley', 3),
  ('united-states.california.sierra-foothills.california-shenandoah-valley', 3),
  ('united-states.california.sierra-foothills.fiddletown', 3),
  ('united-states.california.south-coast.temecula-valley', 3);
-- Every California key this batch knows about (earlier waves and itself).
create temp table _us3_known (key text primary key) on commit drop;
insert into _us3_known values
  ('united-states.california'),
  ('united-states.california.central-coast'),
  ('united-states.california.central-valley'),
  ('united-states.california.north-coast'),
  ('united-states.california.sierra-foothills'),
  ('united-states.california.south-coast'),
  ('united-states.california.central-coast.alisos-canyon'),
  ('united-states.california.central-coast.carmel-valley'),
  ('united-states.california.central-coast.gabilan-mountains'),
  ('united-states.california.central-coast.gabilan-mountains.chalone'),
  ('united-states.california.central-coast.gabilan-mountains.mt-harlan'),
  ('united-states.california.central-coast.monterey'),
  ('united-states.california.central-coast.monterey.arroyo-seco'),
  ('united-states.california.central-coast.monterey.santa-lucia-highlands'),
  ('united-states.california.central-coast.paso-robles'),
  ('united-states.california.central-coast.paso-robles.adelaida-district'),
  ('united-states.california.central-coast.paso-robles.creston-district'),
  ('united-states.california.central-coast.paso-robles.el-pomar-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-estrella-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-geneseo-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-highlands-district'),
  ('united-states.california.central-coast.paso-robles.paso-robles-willow-creek-district'),
  ('united-states.california.central-coast.paso-robles.san-juan-creek'),
  ('united-states.california.central-coast.paso-robles.san-miguel-district'),
  ('united-states.california.central-coast.paso-robles.santa-margarita-ranch'),
  ('united-states.california.central-coast.paso-robles.templeton-gap-district'),
  ('united-states.california.central-coast.san-francisco-bay'),
  ('united-states.california.central-coast.san-francisco-bay.livermore-valley'),
  ('united-states.california.central-coast.san-francisco-bay.santa-cruz-mountains'),
  ('united-states.california.central-coast.san-luis-obispo-coast'),
  ('united-states.california.central-coast.san-luis-obispo-coast.arroyo-grande-valley'),
  ('united-states.california.central-coast.san-luis-obispo-coast.edna-valley'),
  ('united-states.california.central-coast.santa-maria-valley'),
  ('united-states.california.central-coast.santa-ynez-valley'),
  ('united-states.california.central-coast.santa-ynez-valley.ballard-canyon'),
  ('united-states.california.central-coast.santa-ynez-valley.happy-canyon-of-santa-barbara'),
  ('united-states.california.central-coast.santa-ynez-valley.los-olivos-district'),
  ('united-states.california.central-coast.santa-ynez-valley.sta-rita-hills'),
  ('united-states.california.central-valley.lodi'),
  ('united-states.california.central-valley.lodi.alta-mesa'),
  ('united-states.california.central-valley.lodi.borden-ranch'),
  ('united-states.california.central-valley.lodi.clements-hills'),
  ('united-states.california.central-valley.lodi.cosumnes-river'),
  ('united-states.california.central-valley.lodi.jahant'),
  ('united-states.california.central-valley.lodi.mokelumne-river'),
  ('united-states.california.central-valley.lodi.sloughhouse'),
  ('united-states.california.el-dorado'),
  ('united-states.california.el-dorado.fair-play'),
  ('united-states.california.north-coast.clear-lake'),
  ('united-states.california.north-coast.clear-lake.red-hills-lake-county'),
  ('united-states.california.north-coast.fountaingrove-district'),
  ('united-states.california.north-coast.los-carneros'),
  ('united-states.california.north-coast.mendocino'),
  ('united-states.california.north-coast.mendocino.anderson-valley'),
  ('united-states.california.north-coast.mendocino-ridge'),
  ('united-states.california.north-coast.napa-valley'),
  ('united-states.california.north-coast.napa-valley.atlas-peak'),
  ('united-states.california.north-coast.napa-valley.calistoga'),
  ('united-states.california.north-coast.napa-valley.chiles-valley'),
  ('united-states.california.north-coast.napa-valley.coombsville'),
  ('united-states.california.north-coast.napa-valley.crystal-springs-of-napa-valley'),
  ('united-states.california.north-coast.napa-valley.diamond-mountain-district'),
  ('united-states.california.north-coast.napa-valley.howell-mountain'),
  ('united-states.california.north-coast.napa-valley.mt-veeder'),
  ('united-states.california.north-coast.napa-valley.oak-knoll-district-of-napa-valley'),
  ('united-states.california.north-coast.napa-valley.oakville'),
  ('united-states.california.north-coast.napa-valley.rutherford'),
  ('united-states.california.north-coast.napa-valley.spring-mountain-district'),
  ('united-states.california.north-coast.napa-valley.st-helena'),
  ('united-states.california.north-coast.napa-valley.stags-leap-district'),
  ('united-states.california.north-coast.napa-valley.yountville'),
  ('united-states.california.north-coast.northern-sonoma'),
  ('united-states.california.north-coast.northern-sonoma.alexander-valley'),
  ('united-states.california.north-coast.northern-sonoma.dry-creek-valley'),
  ('united-states.california.north-coast.northern-sonoma.knights-valley'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.chalk-hill'),
  ('united-states.california.north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley'),
  ('united-states.california.north-coast.petaluma-gap'),
  ('united-states.california.north-coast.pine-mountain-cloverdale-peak'),
  ('united-states.california.north-coast.rockpile'),
  ('united-states.california.north-coast.sonoma-coast'),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast'),
  ('united-states.california.north-coast.sonoma-coast.west-sonoma-coast.fort-ross-seaview'),
  ('united-states.california.north-coast.sonoma-valley'),
  ('united-states.california.north-coast.sonoma-valley.bennett-valley'),
  ('united-states.california.north-coast.sonoma-valley.moon-mountain-district-sonoma-county'),
  ('united-states.california.north-coast.sonoma-valley.sonoma-mountain'),
  ('united-states.california.north-coast.wild-horse-valley'),
  ('united-states.california.sierra-foothills.california-shenandoah-valley'),
  ('united-states.california.sierra-foothills.fiddletown'),
  ('united-states.california.south-coast.temecula-valley');

do $$
declare v_text text;
begin
  -- The lock check first, so after a promote this is always the message.
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join _us3_rb e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if v_text is not null then
    raise exception 'US-3 core remove: keys are locked (the promote ran): use the unpublish file instead (%)', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where (p.canonical_key = 'united-states.california' or p.canonical_key like 'united-states.california.%') and p.canonical_key not in (select key from _us3_known);
  if v_text is not null then raise exception 'US-3 core remove: other California places exist (remove the later batch first): %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-3 core remove: missing or not DRAFT: %', v_text; end if;
end $$;

delete from public.wine_place_relationships r
 using public.wine_places p
 where p.canonical_key in (select key from _us3_rb)
   and (r.source_place_id = p.id or r.target_place_id = p.id);
delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb);
delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = 5;
delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = 4;
delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = 3;
delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = 2;
delete from supabase_migrations.schema_migrations where version in ('20260930154747', '20260930164747');

do $$
declare n int;
begin
  select count(*) into n from public.wine_places where canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception 'US-3 core remove: % places of this batch left', n; end if;
  select (select count(*) from public.wine_place_articles a where not exists (select 1 from public.wine_places p where p.id = a.wine_place_id))
       + (select count(*) from public.wine_place_styles s where not exists (select 1 from public.wine_places p where p.id = s.wine_place_id))
       + (select count(*) from public.wine_place_grapes g where not exists (select 1 from public.wine_places p where p.id = g.wine_place_id))
    into n;
  if n <> 0 then raise exception 'US-3 core remove: % orphan knowledge rows', n; end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20260930154747', '20260930164747')) then
    raise exception 'US-3 core remove: history rows left';
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
  raise notice 'US-3 core remove: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
