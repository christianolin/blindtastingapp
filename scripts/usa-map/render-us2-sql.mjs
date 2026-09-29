// Renders the US-2 SQL from the wave (us2-wave.mjs). The committed files must
// equal this render (us2-sql.test.mjs), so a hand-edit shows up as a test
// failure, never as silent drift. No file contains begin/commit/rollback: the
// owner's applier owns the transaction (spec D24).
//
// Usage: node scripts/usa-map/render-us2-sql.mjs
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { depthOf, loadTrees, us2Wave, US2_FILES, US2_VERSIONS } from "./us2-wave.mjs";

export const sq = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
const US_WHERE = "canonical_key = 'united-states' or canonical_key like 'united-states.%'";

/** The checked neighbour refresh every catalogue-writing file ends with (CLAUDE.md standing rule). */
export const REFRESH_BLOCK = (label) => `do $$
declare
  t0 timestamptz := clock_timestamp();
  v_rows integer;
begin
  select public.refresh_wine_place_neighbours() into v_rows;
  if v_rows < 0 then
    raise exception 'refresh_wine_place_neighbours refused to publish the cache; see the warning above';
  end if;
  raise notice '${label}: neighbour refresh % rows in % s', v_rows,
    round(extract(epoch from clock_timestamp() - t0)::numeric, 1);
end $$;
`;

export function catalogSql(wave) {
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perParent = valuesOf(countBy(wave.places.filter((p) => p.parent_key), (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us2_catalog v
  left join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  return `-- USA on the wine map, phase US-2: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 2).
--
-- Inserts the ${wave.places.length} US-2 places DRAFT: the united-states COUNTRY, the four wave
-- states (REGION, tier 1, one tile shard each), their umbrella AVAs (SUBREGION,
-- AVA/regional) and Central Valley, a navigation node that is not an AVA (D25).
-- Every row is rendered from the committed tree reports
-- (data/wine-map/usa-*-tree.json) by scripts/usa-map/render-us2-sql.mjs, and
-- us2-sql.test.mjs proves this file equals that render. Do not hand-edit.
--
-- DRAFT places are invisible to the app ("wine places verified read") and to
-- the tiles export (VERIFIED only). Boundaries are staged by
-- scripts/wine-map-sources/stage-usa-ava.mjs and everything flips at once in
-- ${US2_VERSIONS.promote}_usa_us2_promote.sql (D11, D12).
--
-- A migration that writes wine_places ends with the neighbour refresh in the
-- same transaction (CLAUDE.md standing rule). DRAFT places have no current
-- boundary, so they are never a neighbour and the cache comes back fresh.
--
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us2_catalog;
create temp table _us2_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text, depth int not null
) on commit drop;
insert into _us2_catalog values
${rows};

do $$
begin
  if exists (select 1 from public.wine_places where ${US_WHERE}) then
    raise exception 'US-2 catalog: united-states places already exist';
  end if;
end $$;

${insertAt(0)}
${insertAt(1)}
${insertAt(2)}
do $$
declare
  n int;
  v_text text;
begin
  select count(*) into n from public.wine_places where ${US_WHERE};
  if n <> ${wave.places.length} then
    raise exception 'US-2 catalog: expected ${wave.places.length} united-states places, got %', n;
  end if;

  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us2_catalog v
    left join public.wine_places p on p.canonical_key = v.key
    left join public.wine_places pp on pp.id = p.primary_parent_id
   where p.id is null
      or p.kind::text <> v.kind or p.name <> v.name or p.slug <> v.slug
      or p.display_tier <> v.tier or p.min_zoom <> v.min_zoom or p.label_min_zoom <> v.label_min_zoom
      or p.is_appellation <> v.is_app
      or p.appellation_system is distinct from v.system
      or p.appellation_level is distinct from v.level
      or p.sort_order <> v.sort_order
      or p.publication_status <> 'DRAFT'
      or pp.canonical_key is distinct from v.parent_key;
  if v_text is not null then
    raise exception 'US-2 catalog: rows differ from the tree reports: %', v_text;
  end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select kind::text as kind, count(*)::int as n from public.wine_places
                where ${US_WHERE} group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: kind counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key as parent, count(*)::int as n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                where p.canonical_key like 'united-states.%' group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception 'US-2 catalog: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK("US-2 catalog")}`;
}

/** Every rendered file, path -> text. */
export function renderAll(wave) {
  return { [US2_FILES.catalog]: catalogSql(wave) };
}

async function main() {
  const wave = us2Wave(await loadTrees());
  for (const [path, text] of Object.entries(renderAll(wave))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
