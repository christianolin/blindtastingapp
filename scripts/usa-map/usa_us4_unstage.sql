-- USA on the wine map, phase US-4 ROLLBACK: unstage (after --stage, before the promote) (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md Task 12).
--
-- Removes the 42 DRAFT, non-current boundaries stage-usa-ava.mjs --wave us4
-- --stage committed, and nothing else: the places, their knowledge and the
-- source snapshots stay (snapshots are immutable; a re-stage reuses them). Ends
-- with the checked neighbour refresh, which brings the cache and master's
-- map-data checks back to green.
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Touches only keys under Washington,
-- Oregon and New York. Rendered by scripts/usa-map/render-us4-sql.mjs; do not
-- hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us4_rb, pg_temp._us4_known;
create temp table _us4_rb (key text primary key, depth int not null) on commit drop;
insert into _us4_rb values
  ('united-states.new-york.champlain-valley-of-new-york', 2),
  ('united-states.new-york.finger-lakes.cayuga-lake', 3),
  ('united-states.new-york.finger-lakes.seneca-lake', 3),
  ('united-states.new-york.hudson-river-region', 2),
  ('united-states.new-york.long-island.north-fork-of-long-island', 3),
  ('united-states.new-york.long-island.the-hamptons-long-island', 3),
  ('united-states.new-york.niagara-escarpment', 2),
  ('united-states.new-york.upper-hudson', 2),
  ('united-states.oregon.columbia-gorge', 2),
  ('united-states.oregon.southern-oregon.rogue-valley', 3),
  ('united-states.oregon.southern-oregon.rogue-valley.applegate-valley', 4),
  ('united-states.oregon.southern-oregon.umpqua-valley', 3),
  ('united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon', 4),
  ('united-states.oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon', 4),
  ('united-states.oregon.the-rocks-district-of-milton-freewater', 2),
  ('united-states.oregon.willamette-valley.chehalem-mountains', 3),
  ('united-states.oregon.willamette-valley.chehalem-mountains.laurelwood-district', 4),
  ('united-states.oregon.willamette-valley.chehalem-mountains.ribbon-ridge', 4),
  ('united-states.oregon.willamette-valley.dundee-hills', 3),
  ('united-states.oregon.willamette-valley.eola-amity-hills', 3),
  ('united-states.oregon.willamette-valley.lower-long-tom', 3),
  ('united-states.oregon.willamette-valley.mcminnville', 3),
  ('united-states.oregon.willamette-valley.mount-pisgah-polk-county-oregon', 3),
  ('united-states.oregon.willamette-valley.tualatin-hills', 3),
  ('united-states.oregon.willamette-valley.van-duzer-corridor', 3),
  ('united-states.oregon.willamette-valley.yamhill-carlton', 3),
  ('united-states.washington.columbia-valley.ancient-lakes-of-columbia-valley', 3),
  ('united-states.washington.columbia-valley.horse-heaven-hills', 3),
  ('united-states.washington.columbia-valley.lake-chelan', 3),
  ('united-states.washington.columbia-valley.naches-heights', 3),
  ('united-states.washington.columbia-valley.rocky-reach', 3),
  ('united-states.washington.columbia-valley.royal-slope', 3),
  ('united-states.washington.columbia-valley.the-burn-of-columbia-valley', 3),
  ('united-states.washington.columbia-valley.wahluke-slope', 3),
  ('united-states.washington.columbia-valley.walla-walla-valley', 3),
  ('united-states.washington.columbia-valley.white-bluffs', 3),
  ('united-states.washington.columbia-valley.yakima-valley', 3),
  ('united-states.washington.columbia-valley.yakima-valley.candy-mountain', 4),
  ('united-states.washington.columbia-valley.yakima-valley.goose-gap', 4),
  ('united-states.washington.columbia-valley.yakima-valley.rattlesnake-hills', 4),
  ('united-states.washington.columbia-valley.yakima-valley.red-mountain', 4),
  ('united-states.washington.columbia-valley.yakima-valley.snipes-mountain', 4);
-- Every key under the three states this wave knows about (US-2's and its own).
create temp table _us4_known (key text primary key) on commit drop;
insert into _us4_known values
  ('united-states.new-york'),
  ('united-states.new-york.finger-lakes'),
  ('united-states.new-york.long-island'),
  ('united-states.oregon'),
  ('united-states.oregon.southern-oregon'),
  ('united-states.oregon.willamette-valley'),
  ('united-states.washington'),
  ('united-states.washington.columbia-valley'),
  ('united-states.washington.puget-sound'),
  ('united-states.new-york.champlain-valley-of-new-york'),
  ('united-states.new-york.finger-lakes.cayuga-lake'),
  ('united-states.new-york.finger-lakes.seneca-lake'),
  ('united-states.new-york.hudson-river-region'),
  ('united-states.new-york.long-island.north-fork-of-long-island'),
  ('united-states.new-york.long-island.the-hamptons-long-island'),
  ('united-states.new-york.niagara-escarpment'),
  ('united-states.new-york.upper-hudson'),
  ('united-states.oregon.columbia-gorge'),
  ('united-states.oregon.southern-oregon.rogue-valley'),
  ('united-states.oregon.southern-oregon.rogue-valley.applegate-valley'),
  ('united-states.oregon.southern-oregon.umpqua-valley'),
  ('united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon'),
  ('united-states.oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon'),
  ('united-states.oregon.the-rocks-district-of-milton-freewater'),
  ('united-states.oregon.willamette-valley.chehalem-mountains'),
  ('united-states.oregon.willamette-valley.chehalem-mountains.laurelwood-district'),
  ('united-states.oregon.willamette-valley.chehalem-mountains.ribbon-ridge'),
  ('united-states.oregon.willamette-valley.dundee-hills'),
  ('united-states.oregon.willamette-valley.eola-amity-hills'),
  ('united-states.oregon.willamette-valley.lower-long-tom'),
  ('united-states.oregon.willamette-valley.mcminnville'),
  ('united-states.oregon.willamette-valley.mount-pisgah-polk-county-oregon'),
  ('united-states.oregon.willamette-valley.tualatin-hills'),
  ('united-states.oregon.willamette-valley.van-duzer-corridor'),
  ('united-states.oregon.willamette-valley.yamhill-carlton'),
  ('united-states.washington.columbia-valley.ancient-lakes-of-columbia-valley'),
  ('united-states.washington.columbia-valley.horse-heaven-hills'),
  ('united-states.washington.columbia-valley.lake-chelan'),
  ('united-states.washington.columbia-valley.naches-heights'),
  ('united-states.washington.columbia-valley.rocky-reach'),
  ('united-states.washington.columbia-valley.royal-slope'),
  ('united-states.washington.columbia-valley.the-burn-of-columbia-valley'),
  ('united-states.washington.columbia-valley.wahluke-slope'),
  ('united-states.washington.columbia-valley.walla-walla-valley'),
  ('united-states.washington.columbia-valley.white-bluffs'),
  ('united-states.washington.columbia-valley.yakima-valley'),
  ('united-states.washington.columbia-valley.yakima-valley.candy-mountain'),
  ('united-states.washington.columbia-valley.yakima-valley.goose-gap'),
  ('united-states.washington.columbia-valley.yakima-valley.rattlesnake-hills'),
  ('united-states.washington.columbia-valley.yakima-valley.red-mountain'),
  ('united-states.washington.columbia-valley.yakima-valley.snipes-mountain');

do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-4 unstage: missing or not DRAFT (after the promote, use the unpublish file): %', v_text; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb) and (b.is_current or b.quality_status <> 'DRAFT');
  if n <> 0 then raise exception 'US-4 unstage: % boundaries on this wave are current or not DRAFT', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb) and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 42 then raise exception 'US-4 unstage: % DRAFT non-current boundaries on this wave, expected 42', n; end if;
end $$;

delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us4_rb)
   and b.quality_status = 'DRAFT' and not b.is_current;

do $$
declare n int;
begin
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us4_rb);
  if n <> 0 then raise exception 'US-4 unstage: % boundaries left on this wave', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us4_rb) and p.publication_status = 'DRAFT';
  if n <> 42 then raise exception 'US-4 unstage: % DRAFT places, expected 42', n; end if;
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
  raise notice 'US-4 unstage: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
