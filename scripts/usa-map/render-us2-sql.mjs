// Renders the US-2 SQL from the wave (us2-wave.mjs). The committed files must
// equal this render (us2-sql.test.mjs), so a hand-edit shows up as a test
// failure, never as silent drift. No file contains begin/commit/rollback: the
// owner's applier owns the transaction (spec D24).
//
// Usage: node scripts/usa-map/render-us2-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
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

const pgArray = (list) => `'{${list.join(",")}}'`;

/** The stage role of a wave place; stage-usa-ava.mjs writes the same roles. */
function promoteRole(p) {
  if (p.kind === "COUNTRY") return "ne-country";
  if (p.kind === "REGION") return "ne-state";
  if (p.navigation_node) return "derived";
  return "ucd";
}

export function promoteSql(wave) {
  const stateKey = new Map(wave.states.map((s) => [s.code, s.key]));
  const legalKeysOf = (p) => {
    if (p.navigation_node) return [stateKey.get(p.map_state)];
    if (!p.legal_states) return [];
    return p.legal_states.map((c) => {
      if (!stateKey.has(c)) throw new Error(`${p.key}: legal state ${c} is not a wave state`);
      return stateKey.get(c);
    }).sort();
  };
  const members = new Map(wave.derived.map((d) => [d.key, d.members]));
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.kind), sq(promoteRole(p)), sq(p.ucd_ava_id), pgArray(legalKeysOf(p)),
    bool(wave.outlineKeys.includes(p.key)), members.has(p.key) ? pgArray(members.get(p.key)) : "null",
  ].join(", ")})`).join(",\n");
  const byKey = new Map(wave.places.map((p) => [p.key, p]));
  const edges = wave.edges.map((e) => {
    const legal = byKey.get(e.source_key).legal_states ?? [];
    const note = `US-2 tree report: basis ${e.basis}${e.share != null ? `, share ${e.share}` : ""} (TTB lists ${legal.join(" and ")})`;
    return `  (${sq(e.source_key)}, ${sq(e.target_key)}, ${sq(e.type)}, ${sq(note)})`;
  }).join(",\n");
  const n = wave.places.length;
  const kindList = Object.entries(countBy(wave.places, (p) => p.kind)).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => `(${sq(k)}, ${c})`).join(", ");
  const avaCount = wave.places.filter((p) => p.appellation_system === "AVA").length;
  const outlineCount = wave.outlineKeys.length;
  return `-- USA on the wine map, phase US-2: the promote (spec §8.4, §15; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 9).
--
-- Re-checks, in SQL, every domain invariant the stage asserted, then flips the
-- ${n} US-2 places to VERIFIED and their boundaries to VALIDATED + current in one
-- transaction. The country flips with the states (D12), or every release would
-- fail assertMultiCountryArchive. Stores the one ALTERNATE_PARENT edge (§8.3).
-- Ends with the neighbour refresh (standing rule), which must return >= 0.
--
-- Precondition: scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage
-- has committed exactly one DRAFT, non-current boundary per place, and the
-- catalog (${US2_VERSIONS.catalog}) and knowledge (${US2_VERSIONS.knowledge}) migrations are applied.
-- Rendered by scripts/usa-map/render-us2-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us2_promote, pg_temp._us2_edges, pg_temp._us2_staged;
create temp table _us2_promote (
  key text primary key, kind text not null, role text not null, ucd_ava_id text,
  legal_keys text[] not null, outline boolean not null, members text[]
) on commit drop;
insert into _us2_promote values
${rows};
create temp table _us2_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, note text not null
) on commit drop;
insert into _us2_edges values
${edges};

-- 1. Pre-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where canonical_key = 'united-states' or canonical_key like 'united-states.%';
  if n <> ${n} then raise exception 'US-2 promote: expected ${n} united-states places, found %', n; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception 'US-2 promote: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception 'US-2 promote: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --stage first): %', v_text;
  end if;
end $$;

create temp table _us2_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us2_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text;
begin
  select count(*) into n from _us2_staged;
  if n <> ${n} then raise exception 'US-2 promote: % staged rows, expected ${n}', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged where not (
       (role = 'ne-country' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id = 'ne_50m_admin_0_countries_lakes:USA' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ne-state' and method = 'MANUAL' and ns = 'NATURAL_EARTH'
        and feature_id like 'ne_50m_admin_1_states_provinces_lakes:US-%' and gp->>'engine' = 'natural-earth-extract')
    or (role = 'ucd' and method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA'
        and feature_id = ucd_ava_id and gp->>'engine' = 'ucd-ava-digitization'
        and gp->>'crs_in' = 'EPSG:4269' and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity')
    or (role = 'derived' and method = 'DERIVED_FROM_DESCENDANTS' and ns = 'UCD_TTB_AVA'
        and feature_id = 'derived:' || split_part(key, '.', 3) and gp->>'engine' = 'ucd-ava-derived-union'
        and array(select jsonb_array_elements_text(gp->'members') order by 1) = members));
  if v_text is not null then raise exception 'US-2 promote: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between -125.5 and -66.5
      or extensions.ST_Y(label_point) not between 24 and 49.5;
  if v_text is not null then raise exception 'US-2 promote: invalid geometry or label outside the United States box: %', v_text; end if;

  -- D15: the outline set is exactly the AVA places of 5,000 km² or more, plus Central Valley.
  select string_agg(key, ', ' order by key) into v_text from _us2_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or (role in ('ne-country', 'ne-state') and gp ? 'display')
      or (role = 'ucd' and outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000));
  if v_text is not null then raise exception 'US-2 promote: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us2_staged where gp->>'display' = 'outline';
  if n <> ${outlineCount} then raise exception 'US-2 promote: % outline places, expected ${outlineCount}', n; end if;

  -- §8.2 state containment, on land and buffered: the share of each AVA-based
  -- place's land (land = inside the staged lower-48 outline, buffered) that
  -- lies inside its legal states' staged outlines, buffered.
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us2_staged st
               where st.role = 'ne-state' and st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(c.g, 0.05) from _us2_staged c where c.role = 'ne-country'))), 0) as share
      from _us2_staged s where s.role in ('ucd', 'derived')) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception 'US-2 promote: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- The states lie in the country outline.
  select string_agg(s.key, ', ') into v_text from _us2_staged s, _us2_staged c
   where s.role = 'ne-state' and c.role = 'ne-country'
     and extensions.ST_Area(extensions.ST_Intersection(s.g, extensions.ST_Buffer(c.g, 0.05))) < 0.995 * extensions.ST_Area(s.g);
  if v_text is not null then raise exception 'US-2 promote: state outside the country outline: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (US rule, §8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us2_promote e join public.wine_places p on p.canonical_key = e.key
   where not exists (select 1 from public.wine_place_articles a where a.wine_place_id = p.id
                       and a.editorial_status = 'PUBLISHED'
                       and length(trim(coalesce(a.description, ''))) >= 40
                       and length(trim(coalesce(a.climate, ''))) >= 40
                       and length(trim(coalesce(a.soils, ''))) >= 40
                       and length(trim(coalesce(a.grape_varieties, ''))) >= 40
                       and length(trim(coalesce(a.wine_styles, ''))) >= 40
                       and cardinality(a.key_facts) >= 3)
      or not exists (select 1 from public.wine_place_styles s where s.wine_place_id = p.id and s.editorial_status = 'PUBLISHED')
      or not exists (select 1 from public.wine_place_grapes g where g.wine_place_id = p.id and g.editorial_status = 'PUBLISHED');
  if v_text is not null then raise exception 'US-2 promote: has no complete article, style and grape (apply the knowledge migration first): %', v_text; end if;

  if not exists (select 1 from public.wine_place_articles a join public.wine_places p on p.id = a.wine_place_id
                  where p.canonical_key = 'united-states.california.central-valley'
                    and substring(a.description from '^[^.]*\\.') ~* 'not an AVA'
                    and substring(a.description from '^[^.]*\\.') ~* 'grouping') then
    raise exception 'US-2 promote: Central Valley''s first sentence must say it is a grouping on this map, not an AVA (D25)';
  end if;
end $$;

-- 4. Flip, and the edge.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us2_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us2_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us2_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK("US-2 promote")}
-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_places
   where (canonical_key = 'united-states' or canonical_key like 'united-states.%') and publication_status <> 'VERIFIED';
  if n <> 0 then raise exception 'US-2 promote: % united-states places still DRAFT', n; end if;
  select count(*) into n from public.wine_places p join _us2_promote e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if n <> ${n} then raise exception 'US-2 promote: % of ${n} keys locked', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'united-states%' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> ${n} then raise exception 'US-2 promote: % current VALIDATED boundaries, expected ${n}', n; end if;
  select string_agg(format('%s=%s (expected %s)', e.k, coalesce(x.c, 0), e.c), ', ') into v_text
    from (values ${kindList}) e(k, c)
    full join (select p.kind::text k, count(*)::int c from public.wine_places p
                where p.canonical_key like 'united-states%' group by 1) x on x.k = e.k
   where coalesce(x.c, 0) <> coalesce(e.c, 0);
  if v_text is not null then raise exception 'US-2 promote: kind counts off: %', v_text; end if;
  select count(*) into n from public.wine_places where canonical_key like 'united-states.%' and appellation_system = 'AVA';
  if n <> ${avaCount} then raise exception 'US-2 promote: % AVA places, expected ${avaCount}', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where s.canonical_key like 'united-states%' or t.canonical_key like 'united-states%';
  if n <> (select count(*) from _us2_edges) then raise exception 'US-2 promote: % US relationships, expected %', n, (select count(*) from _us2_edges); end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception 'US-2 promote: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
`;
}

export const LINKS_PATH = "data/wine-map/usa-us2-archetype-links.json";
export const loadLinks = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(LINKS_PATH)).links;

/** true when R2's curated display-point columns exist (20260929150000); a SQL expression. */
const DISPLAY_COLUMNS_LIVE = `(select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'wine_archetypes'
         and column_name in ('display_lon', 'display_lat')) = 2`;

/** R1b's RM9a query (20260929141000), verbatim: placed archetypes lacking their REGION placement. */
const RM9A_SQL = `  with recursive chain as (
    select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
      from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
    union all
    select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
      from chain c join public.wine_places p on p.id = c.primary_parent_id where c.depth < 8
  ),
  reg as (
    select distinct on (archetype_id) archetype_id, place_id, canonical_key
      from chain where kind = 'REGION' order by archetype_id, depth
  )
  select string_agg(format('%s (%s)', a.name, r.canonical_key), '; ') into v_text
    from reg r join public.wine_archetypes a on a.id = r.archetype_id
   where r.canonical_key <> 'france.bourgogne'
     and not exists (select 1 from public.wine_archetype_placements x
                      where x.archetype_id = r.archetype_id and x.wine_place_id = r.place_id);`;

function checkLinks(links) {
  if (!Array.isArray(links) || links.length === 0) throw new Error("no archetype links");
  for (const l of links) {
    if (!/^[0-9a-f-]{36}$/.test(l.archetype_id)) throw new Error(`${l.name}: bad archetype id`);
    if (!Number.isInteger(l.sort_order)) throw new Error(`${l.name}: sort_order must be an integer`);
    if (!l.placements.includes(l.home)) throw new Error(`${l.name}: its home must be one of its placements`);
    if (!Array.isArray(l.display_point) || l.display_point.length !== 2 || !l.display_point.every(Number.isFinite)) {
      throw new Error(`${l.name}: display_point must be [lon, lat]`);
    }
  }
}

/** Archetype links step 1 (plan Task 10; spec D22, §14.2). */
export function linksSql(links) {
  checkLinks(links);
  const rows = links.flatMap((l) => l.placements.map((k) => `  (${[
    `${sq(l.archetype_id)}::uuid`, sq(l.name), l.sort_order, sq(l.appellation), sq(l.region), sq(l.home), sq(k),
    num(l.display_point[0]), num(l.display_point[1]),
  ].join(", ")})`)).join(",\n");
  const nPlacements = links.reduce((n, l) => n + l.placements.length, 0);
  return `-- USA on the wine map, archetype links step 1 (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md D22, §14.2; plan
-- docs/superpowers/plans/2026-09-29-usa-wine-map-us2.md Task 10).
--
-- Gives the ${links.length} US typical wines a home on the map: Napa and Sonoma on North
-- Coast, Willamette on Willamette Valley, each also placed on its state's page
-- (the training-room drift guard RM9a). Each placement's sort_order is the
-- archetype's own (the live convention: the batch generator's home placement
-- and R1b's check). Matched by live id AND name; every other field asserted.
--
-- R2 (20260929150000) gave these wines a curated display point while they had
-- no map place. A placed wine never keeps one (the room's R2 check: 18 points
-- before this, 15 after, never a placed one), so this clears the three here;
-- the unpublish rollback (${US2_VERSIONS.unpublish}) restores them. If R2's
-- columns are gone (its rollback ran), the point steps are skipped.
--
-- Apply AFTER the US-2 promote (${US2_VERSIONS.promote}): every place must be
-- VERIFIED with a current boundary, or the pre-state refuses. Writes
-- wine_archetypes and wine_archetype_placements only: no wine_places or
-- wine_place_boundaries write, no neighbour-cache refresh, no tiles run.
-- Rendered by scripts/usa-map/render-us2-sql.mjs from
-- ${LINKS_PATH}; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

drop table if exists pg_temp._us2_links;
create temp table _us2_links (
  archetype_id uuid not null, name text not null, sort_order int not null,
  appellation text not null, region text not null, home_key text not null, place_key text not null,
  display_lon double precision not null, display_lat double precision not null,
  primary key (archetype_id, place_key)
) on commit drop;
insert into _us2_links values
${rows};

-- Pre-state.
do $$
declare v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, sort_order, appellation, region from _us2_links) l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where a.id is null or a.name <> l.name or a.sort_order <> l.sort_order
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or a.wine_place_id is not null
      or exists (select 1 from public.wine_archetype_placements x where x.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links: pre-state differs for %', v_text;
  end if;

  select string_agg(distinct l.place_key, ', ') into v_text
    from _us2_links l
    left join public.wine_places p on p.canonical_key = l.place_key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v_text is not null then
    raise exception 'US archetype links: % is not VERIFIED with a current boundary (apply after the US-2 promote)', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$
      select string_agg(l.name, ', ' order by l.name)
        from (select distinct archetype_id, name, display_lon, display_lat from _us2_links) l
        join public.wine_archetypes a on a.id = l.archetype_id
       where not ((a.display_lon is null and a.display_lat is null)
                  or (a.display_lon = l.display_lon and a.display_lat = l.display_lat))$q$
      into v_text;
    if v_text is not null then
      raise exception 'US archetype links: curated display point is neither R2''s nor empty for %', v_text;
    end if;
  end if;
end $$;

update public.wine_archetypes a
   set wine_place_id = p.id
  from (select distinct archetype_id, home_key from _us2_links) l
  join public.wine_places p on p.canonical_key = l.home_key
 where a.id = l.archetype_id;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _us2_links l
  join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- A placed wine has a real point: drop R2's curated one.
do $$
begin
  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$
      update public.wine_archetypes a
         set display_lon = null, display_lat = null
        from (select distinct archetype_id from _us2_links) l
       where a.id = l.archetype_id and a.display_lon is not null$q$;
  end if;
end $$;

-- Post-state, same transaction.
do $$
declare n int; v_text text;
begin
  select count(*) into n from public.wine_archetype_placements x
    join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%';
  if n <> ${nPlacements} then
    raise exception 'US archetype links: % placements on united-states places, expected ${nPlacements}', n;
  end if;

  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, home_key, appellation, region from _us2_links) l
    join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where p.canonical_key is distinct from l.home_key
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or (select array_agg(pp.canonical_key order by pp.canonical_key)
            from public.wine_archetype_placements x join public.wine_places pp on pp.id = x.wine_place_id
           where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(k.place_key order by k.place_key) from _us2_links k where k.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links: home, placements or scoring fields wrong for %', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$select count(*)::int from public.wine_archetypes
                where display_lon is not null and wine_place_id is not null$q$ into n;
    if n <> 0 then
      raise exception 'US archetype links: % placed archetypes still carry a curated display point', n;
    end if;
  end if;

${RM9A_SQL}
  if v_text is not null then
    raise exception 'US archetype links: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
end $$;
`;
}

/** Every rendered file, path -> text. */
export function renderAll(wave, links) {
  return {
    [US2_FILES.catalog]: catalogSql(wave),
    [US2_FILES.promote]: promoteSql(wave),
    [US2_FILES.links]: linksSql(links),
  };
}

async function main() {
  const wave = us2Wave(await loadTrees());
  for (const [path, text] of Object.entries(renderAll(wave, await loadLinks()))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
