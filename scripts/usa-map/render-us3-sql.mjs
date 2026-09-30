// Renders the US-3 SQL (catalog, promote, archetype links step 2, rollbacks)
// from the two batches (us3-wave.mjs). The committed files must equal this
// render (us3-sql.test.mjs). No file contains begin/commit/rollback: the
// applier, or apply-rollback.mjs, owns the transaction (spec D24).
//
// Usage: node scripts/usa-map/render-us3-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DISPLAY_COLUMNS_LIVE, REFRESH_BLOCK, RM9A_SQL, sq } from "./render-us2-sql.mjs";
import { depthOf, loadTrees } from "./us2-wave.mjs";
import { STATE_WINDOWS } from "../wine-map-sources/usa-stage-lib.mjs";
import { CA_KEY, loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
const CA_WHERE = (alias) => `(${alias}.canonical_key = '${CA_KEY}' or ${alias}.canonical_key like '${CA_KEY}.%')`;
const PLAN = "docs/superpowers/plans/2026-09-30-usa-wine-map-us3.md";

export async function loadUs3Waves() {
  const trees = await loadTrees();
  const batches = await loadBatches();
  const ttb = await loadTtb();
  return { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
}

export function catalogSql(wave) {
  const tag = `US-3 ${wave.batch} catalog`;
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const prior = [
    ...wave.prior.verified.map((k) => `  (${sq(k)}, true)`),
    ...wave.prior.present.map((k) => `  (${sq(k)}, false)`),
  ].join(",\n");
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => a - b);
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perTier = valuesOf(countBy(wave.places, (p) => String(p.display_tier)));
  const perParent = valuesOf(countBy(wave.places, (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us3_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  const needs = wave.batch === "core"
    ? "every US-2 place VERIFIED (the US-2 promote is live)"
    : "every US-2 place VERIFIED and every core place present (the core catalog applied; the core promote need not be live yet)";
  return `-- USA on the wine map, phase US-3 ${wave.batch} batch: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-3;
-- plan ${PLAN} Task 3).
--
-- Inserts the ${wave.places.length} California AVAs of the US-3 ${wave.batch} batch DRAFT
-- (APPELLATION, AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-california-tree.json. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; us3-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs ${needs}.
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us3-${wave.batch} and flip in ${wave.versions.promote}.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us3_catalog, pg_temp._us3_prior;
create temp table _us3_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us3_catalog values
${rows};
create temp table _us3_prior (key text primary key, must_be_verified boolean not null) on commit drop;
insert into _us3_prior values
${prior};

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception '${tag}: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or (e.must_be_verified and p.publication_status <> 'VERIFIED');
  if v_text is not null then
    raise exception '${tag}: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

${depths.map(insertAt).join("\n")}
do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us3_catalog v
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
  if v_text is not null then raise exception '${tag}: rows differ from the tree report: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perTier}) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us3_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}


export function promoteSql(wave) {
  const tag = `US-3 ${wave.batch} promote`;
  const n = wave.places.length;
  const W = STATE_WINDOWS.CA;
  const checks = new Map(wave.parentChecks.map((c) => [c.key, c]));
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.ucd_ava_id), bool(wave.outlineKeys.includes(p.key)), sq(p.parent_key),
    checks.has(p.key) ? num(checks.get(p.key).min) : "null",
  ].join(", ")})`).join(",\n");
  const prior = wave.priorKeys.map((k) => `  (${sq(k)})`).join(",\n");
  const edges = wave.edges.map((e) => `  (${[
    sq(e.source_key), sq(e.target_key), sq(e.type), e.ratio != null ? num(e.ratio) : "null",
    sq(`US-3 ${wave.batch}, California tree report: basis ${e.basis}${e.ratio != null ? `, ratio ${e.ratio}` : ""}`),
  ].join(", ")})`).join(",\n");
  const outlineCount = wave.outlineKeys.length;
  const cv = wave.derivedCheck;
  const cvBlock = !cv ? "" : `
-- 3b. Central Valley's derived outline equals its promoted members' union
--     (spec §25; plan decision 8; measured 2026-09-30: 0.023% and 0.00026%).
do $$
declare v_cv extensions.geometry; v_gp jsonb; v_members extensions.geometry; n int;
        v_sym double precision; v_out double precision;
begin
  select b.display_geometry, b.generation_parameters into v_cv, v_gp
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.canonical_key = ${sq(cv.key)};
  if v_cv is null then raise exception '${tag}: ${cv.key} has no current boundary'; end if;
  if array(select jsonb_array_elements_text(v_gp->'members') order by 1)
     <> array[${cv.members.map((m) => sq(m.ucd_ava_id)).join(", ")}]::text[] then
    raise exception '${tag}: Central Valley''s member list is not its ${cv.members.length} children';
  end if;
  select count(*), extensions.ST_Union(g) into n, v_members
    from _us3_geom where key in (${cv.members.map((m) => sq(m.key)).join(", ")});
  if n <> ${cv.members.length} then raise exception '${tag}: % of ${cv.members.length} Central Valley members have a geometry', n; end if;
  v_sym := extensions.ST_Area(extensions.ST_SymDifference(v_cv, v_members)) / extensions.ST_Area(v_cv);
  v_out := extensions.ST_Area(extensions.ST_Difference(v_members, v_cv)) / extensions.ST_Area(v_cv);
  if v_sym >= 0.001 or v_out >= 0.0001 then
    raise exception '${tag}: Central Valley''s outline is not its members'' union (symmetric difference %, members outside %)',
      round(v_sym::numeric, 6), round(v_out::numeric, 6);
  end if;
  raise notice '${tag}: Central Valley against its members: symmetric difference %, members outside %',
    round(v_sym::numeric, 6), round(v_out::numeric, 6);
end $$;
`;
  return `-- USA on the wine map, phase US-3 ${wave.batch} batch: the promote (spec §8.4, §15 US-3;
-- plan ${PLAN} Task 18).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the ${n}
-- California AVAs of the ${wave.batch} batch to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the batch's ${wave.edges.length} edges (§8.3; an edge ships
-- with the batch its second endpoint lands in). Checks read only
-- united-states.california.*, so another state's wave can run in any order.
-- Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: ${wave.priorPromote} (the previous wave's promote) is live;
-- stage-usa-ava.mjs --wave ${wave.name} --stage has committed one DRAFT,
-- non-current boundary per place; ${wave.versions.catalog} and ${wave.versions.knowledge} are applied.
-- Rendered by scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_promote, pg_temp._us3_prior, pg_temp._us3_edges, pg_temp._us3_staged, pg_temp._us3_geom;
create temp table _us3_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision
) on commit drop;
insert into _us3_promote values
${rows};
create temp table _us3_prior (key text primary key) on commit drop;
insert into _us3_prior values
${prior};
create temp table _us3_edges (
  source_key text not null, target_key text not null,
  type public.wine_place_relationship_type not null, ratio double precision, note text not null
) on commit drop;
insert into _us3_edges values
${edges};

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception '${tag}: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception '${tag}: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave ${wave.name} --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${CA_WHERE("p")}
     and p.canonical_key not in (select key from _us3_promote union all select key from _us3_prior);
  if v_text is not null then raise exception '${tag}: boundaries on other California places: %', v_text; end if;
end $$;

create temp table _us3_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us3_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this batch's staged boundary, else an earlier wave's current one.
create temp table _us3_geom on commit drop as
select key, g from _us3_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us3_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_state extensions.geometry; v_land extensions.geometry;
begin
  select count(*) into n from _us3_staged;
  if n <> ${n} then raise exception '${tag}: % staged rows, expected ${n}', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception '${tag}: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between ${W.minLon} and ${W.maxLon}
      or extensions.ST_Y(label_point) not between ${W.minLat} and ${W.maxLat};
  if v_text is not null then raise exception '${tag}: invalid geometry or label outside California''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us3_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception '${tag}: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us3_staged where gp->>'display' = 'outline';
  if n <> ${outlineCount} then raise exception '${tag}: % outline places, expected ${outlineCount}', n; end if;

  -- §8.2 state containment, on land and buffered, against the live outlines.
  select extensions.ST_Buffer(g, 0.05) into v_state from _us3_geom where key = '${CA_KEY}';
  select extensions.ST_Buffer(g, 0.05) into v_land from _us3_geom where key = 'united-states';
  if v_state is null or v_land is null then raise exception '${tag}: the California or United States outline is not live'; end if;
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key, extensions.ST_Area(extensions.ST_Intersection(s.g, v_state))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us3_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception '${tag}: not inside California (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with the measured
  -- simplification slack (plan decision 6: max difference 0.00081).
  select count(*) into n from _us3_staged s
   where s.parent_min is not null and not exists (select 1 from _us3_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception '${tag}: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us3_staged s join _us3_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception '${tag}: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 7).
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
    left join _us3_geom a on a.key = e.source_key
    left join _us3_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) > 0.01)
      or (e.type = 'ALTERNATE_PARENT'
          and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) < 0.899);
  if v_text is not null then raise exception '${tag}: an edge does not match the geometry: %', v_text; end if;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
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
  if v_text is not null then
    raise exception '${tag}: has no complete article, style and grape (apply the knowledge migration first): %', v_text;
  end if;
end $$;
${cvBlock}
-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us3_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us3_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us3_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK(tag)}
-- 6. Post-state.
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED, locked and current: %', v_text; end if;
  select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${CA_WHERE("p")} and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
  if n <> ${wave.after.caPlaces} then raise exception '${tag}: % live California places, expected ${wave.after.caPlaces}', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where ${CA_WHERE("p")} and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception '${tag}: % DRAFT California boundaries left', n; end if;
  select count(*) into n from public.wine_places p
   where ${CA_WHERE("p")} and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
  if n <> ${wave.after.caAva} then raise exception '${tag}: % VERIFIED California AVA places, expected ${wave.after.caAva}', n; end if;
  select count(*) into n from public.wine_place_relationships r
    join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
   where ${CA_WHERE("s")} or ${CA_WHERE("t")};
  if n <> ${wave.after.caEdges} then raise exception '${tag}: % California relationships, expected ${wave.after.caEdges}', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us3_edges e
   where (select count(*) from public.wine_place_relationships r
            join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and r.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception '${tag}: edges not stored exactly once: %', v_text; end if;
  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception '${tag}: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
`;
}

export const LINKS2_PATH = "data/wine-map/usa-us3-archetype-links.json";
export const loadLinks2 = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(LINKS2_PATH)).links;

function checkLinks2(links) {
  if (!Array.isArray(links) || links.length === 0) throw new Error("no archetype links");
  for (const l of links) {
    if (!/^[0-9a-f-]{36}$/.test(l.archetype_id)) throw new Error(`${l.name}: bad archetype id`);
    if (!Number.isInteger(l.sort_order)) throw new Error(`${l.name}: sort_order must be an integer`);
    if (!l.placements.includes(l.home) || !l.from.placements.includes(l.from.home)) {
      throw new Error(`${l.name}: a home must be one of its placements`);
    }
    for (const k of l.from.placements) if (!l.placements.includes(k)) throw new Error(`${l.name}: step 2 must keep ${k} (spec §14.2)`);
  }
}

/** Archetype links step 2 (spec D22, §14.2). */
export function links2Sql(links) {
  checkLinks2(links);
  const rows = links.flatMap((l) => l.placements.map((k) => `  (${[
    `${sq(l.archetype_id)}::uuid`, sq(l.name), l.sort_order, sq(l.appellation), sq(l.region), sq(l.from.home), sq(l.home), sq(k),
  ].join(", ")})`)).join(",\n");
  const fromRows = links.flatMap((l) => l.from.placements.map((k) => `  (${sq(l.archetype_id)}::uuid, ${sq(k)})`)).join(",\n");
  return `-- USA on the wine map, archetype links step 2 (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md D22, §14.2; plan
-- ${PLAN} Task 19).
--
-- Moves the ${links.length} California typical wines from North Coast (step 1,
-- 20260930114747) to their AVAs: Napa Cabernet Sauvignon to Napa Valley, Sonoma
-- Chardonnay to Sonoma Coast (also placed on Russian River Valley). North Coast
-- and California stay as placements. Only adds placements; the pre-state must
-- be step 1 exactly, so a second run refuses. Writes wine_archetypes and
-- wine_archetype_placements only: no refresh, no tiles run. The core unpublish
-- rollback puts step 1 back. Rendered by scripts/usa-map/render-us3-sql.mjs from
-- ${LINKS2_PATH}; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

drop table if exists pg_temp._us3_links, pg_temp._us3_from;
create temp table _us3_links (
  archetype_id uuid not null, name text not null, sort_order int not null,
  appellation text not null, region text not null, from_home text not null, home_key text not null, place_key text not null,
  primary key (archetype_id, place_key)
) on commit drop;
insert into _us3_links values
${rows};
create temp table _us3_from (archetype_id uuid not null, place_key text not null, primary key (archetype_id, place_key)) on commit drop;
insert into _us3_from values
${fromRows};

-- Pre-state: step 1 exactly, no curated point, and the new places live.
do $$
declare v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, sort_order, appellation, region, from_home from _us3_links) l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places h on h.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where a.id is null or a.name <> l.name or a.sort_order <> l.sort_order
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or h.canonical_key is distinct from l.from_home
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(f.place_key order by f.place_key) from _us3_from f where f.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: pre-state is not step 1 for % (applied twice, or step 1 is not live)', v_text;
  end if;

  select string_agg(distinct l.place_key, ', ') into v_text
    from _us3_links l left join public.wine_places p on p.canonical_key = l.place_key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or not exists (select 1 from public.wine_place_boundaries b
                      where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v_text is not null then
    raise exception 'US archetype links step 2: % is not VERIFIED with a current boundary (apply after the US-3 core promote)', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$select string_agg(a.name, ', ') from public.wine_archetypes a
                 where a.id in (select archetype_id from _us3_links) and a.display_lon is not null$q$ into v_text;
    if v_text is not null then
      raise exception 'US archetype links step 2: % carries a curated display point', v_text;
    end if;
  end if;
end $$;

update public.wine_archetypes a
   set wine_place_id = p.id
  from (select distinct archetype_id, home_key from _us3_links) l
  join public.wine_places p on p.canonical_key = l.home_key
 where a.id = l.archetype_id;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _us3_links l join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- Post-state, same transaction.
do $$
declare n int; v_text text;
begin
  select string_agg(l.name, ', ' order by l.name) into v_text
    from (select distinct archetype_id, name, home_key, appellation, region from _us3_links) l
    join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.id = a.wine_place_id
    left join public.appellations ap on ap.id = a.appellation_id
    left join public.regions r on r.id = a.region_id
   where p.canonical_key is distinct from l.home_key
      or ap.name is distinct from l.appellation or r.name is distinct from l.region
      or (select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
            join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = l.archetype_id)
         is distinct from
         (select array_agg(k.place_key order by k.place_key) from _us3_links k where k.archetype_id = l.archetype_id);
  if v_text is not null then
    raise exception 'US archetype links step 2: home, placements or scoring fields wrong for %', v_text;
  end if;

  if ${DISPLAY_COLUMNS_LIVE} then
    execute $q$select count(*)::int from public.wine_archetypes
                where display_lon is not null and wine_place_id is not null$q$ into n;
    if n <> 0 then raise exception 'US archetype links step 2: % placed archetypes carry a curated display point', n; end if;
  end if;

${RM9A_SQL}
  if v_text is not null then
    raise exception 'US archetype links step 2: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
end $$;
`;
}

// --- Rollbacks (spec §16, §25). scripts/usa-map/, unversioned, run with
// apply-rollback.mjs (--check, --dry, then no flag); re-appliable, each asserts
// its own pre-state. They work on exactly one batch's keys.
const underCa = (k) => k === CA_KEY || k.startsWith(`${CA_KEY}.`);

function rbPrelude(wave) {
  const rows = wave.places.map((p) => `  (${sq(p.key)}, ${depthOf(p.key)})`).join(",\n");
  const known = [...wave.priorKeys.filter(underCa), ...wave.places.map((p) => p.key)].map((k) => `  (${sq(k)})`).join(",\n");
  return `set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us3_rb, pg_temp._us3_known;
create temp table _us3_rb (key text primary key, depth int not null) on commit drop;
insert into _us3_rb values
${rows};
-- Every California key this batch knows about (earlier waves and itself).
create temp table _us3_known (key text primary key) on commit drop;
insert into _us3_known values
${known};
`;
}

const rbHeader = (wave, title, body) => `-- USA on the wine map, phase US-3 ${wave.batch} batch ROLLBACK: ${title} (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §16, §25; plan
-- ${PLAN} Task 20).
--
${body.trim().split("\n").map((l) => (l ? `-- ${l}` : "--")).join("\n")}
--
-- Deliberately outside supabase/migrations/, with no version prefix: run it
-- with scripts/usa-map/apply-rollback.mjs (--check, --dry, then no flag), never
-- with the migration applier. Re-appliable: every step asserts its own
-- pre-state, and nothing is recorded. Rendered by
-- scripts/usa-map/render-us3-sql.mjs; do not hand-edit.
-- No begin/commit: the runner owns the transaction (D24).

`;

export function unstageSql(wave) {
  const tag = `US-3 ${wave.batch} unstage`;
  const n = wave.places.length;
  return `${rbHeader(wave, "unstage (after --stage, before the promote)", `
Removes the ${n} DRAFT, non-current boundaries stage-usa-ava.mjs --wave ${wave.name}
--stage committed, and nothing else: the places, their knowledge and the
source snapshots stay (snapshots are immutable; a re-stage reuses them). Ends
with the checked neighbour refresh, which brings the cache and master's
map-data checks back to green.`)}${rbPrelude(wave)}
do $$
declare n int; v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT (after the promote, use the unpublish file): %', v_text; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and (b.is_current or b.quality_status <> 'DRAFT');
  if n <> 0 then raise exception '${tag}: % boundaries on this batch are current or not DRAFT', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> ${n} then raise exception '${tag}: % DRAFT non-current boundaries on this batch, expected ${n}', n; end if;
end $$;

delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb)
   and b.quality_status = 'DRAFT' and not b.is_current;

do $$
declare n int;
begin
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % boundaries left on this batch', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.publication_status = 'DRAFT';
  if n <> ${n} then raise exception '${tag}: % DRAFT places, expected ${n}', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function removeSql(wave) {
  const tag = `US-3 ${wave.batch} remove`;
  const n = wave.places.length;
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => b - a);
  const deletes = depths.map((d) => `delete from public.wine_places p
 using _us3_rb e
 where p.canonical_key = e.key and e.depth = ${d};`).join("\n");
  return `${rbHeader(wave, "remove (abandon the batch before its promote)", `
Deletes the ${n} places of the ${wave.batch} batch (deepest first), their
relationships, boundaries and knowledge (articles, styles and grapes cascade),
and the catalog (${wave.versions.catalog}) and knowledge (${wave.versions.knowledge})
history rows, so both apply again as committed. Refuses once the promote has
run (keys lock for good; use the unpublish file), and while any other
California place outside the earlier waves and this batch exists (remove the
later batch first). Keeps the source snapshots (immutable; a re-stage reuses them).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  -- The lock check first, so after a promote this is always the message.
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join _us3_rb e on e.key = p.canonical_key
   where p.canonical_key_locked_at is not null;
  if v_text is not null then
    raise exception '${tag}: keys are locked (the promote ran): use the unpublish file instead (%)', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${CA_WHERE("p")} and p.canonical_key not in (select key from _us3_known);
  if v_text is not null then raise exception '${tag}: other California places exist (remove the later batch first): %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
end $$;

delete from public.wine_place_relationships r
 using public.wine_places p
 where p.canonical_key in (select key from _us3_rb)
   and (r.source_place_id = p.id or r.target_place_id = p.id);
delete from public.wine_place_boundaries b
 using public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb);
${deletes}
delete from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}');

do $$
declare n int;
begin
  select count(*) into n from public.wine_places where canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % places of this batch left', n; end if;
  select (select count(*) from public.wine_place_articles a where not exists (select 1 from public.wine_places p where p.id = a.wine_place_id))
       + (select count(*) from public.wine_place_styles s where not exists (select 1 from public.wine_places p where p.id = s.wine_place_id))
       + (select count(*) from public.wine_place_grapes g where not exists (select 1 from public.wine_places p where p.id = g.wine_place_id))
    into n;
  if n <> 0 then raise exception '${tag}: % orphan knowledge rows', n; end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('${wave.versions.catalog}', '${wave.versions.knowledge}')) then
    raise exception '${tag}: history rows left';
  end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function unpublishSql(wave, links) {
  const tag = `US-3 ${wave.batch} unpublish`;
  const n = wave.places.length;
  const back = links ? links.flatMap((l) => l.from.placements.map((k) =>
    `  (${sq(l.archetype_id)}::uuid, ${sq(l.from.home)}, ${sq(k)}, ${l.sort_order})`)).join(",\n") : null;
  const linkSteps = !links ? "" : `
-- Archetype links first, back to step 1, so no typical wine points at a DRAFT place.
drop table if exists pg_temp._us3_back;
create temp table _us3_back (archetype_id uuid not null, from_home text not null, place_key text not null,
  sort_order int not null, primary key (archetype_id, place_key)) on commit drop;
insert into _us3_back values
${back};
delete from public.wine_archetype_placements x
 using public.wine_places p
 where p.id = x.wine_place_id and p.canonical_key in (select key from _us3_rb)
   and x.archetype_id in (select archetype_id from _us3_back);
update public.wine_archetypes a
   set wine_place_id = h.id
  from (select distinct archetype_id, from_home from _us3_back) b
  join public.wine_places h on h.canonical_key = b.from_home
 where a.id = b.archetype_id
   and a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us3_rb));
insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select b.archetype_id, p.id, b.sort_order from _us3_back b join public.wine_places p on p.canonical_key = b.place_key
on conflict (archetype_id, wine_place_id) do nothing;
`;
  // Archetypes the links file restores are exempt; for the rest batch (no links) none is.
  const notLinked = links ? `a.id not in (${links.map((l) => `${sq(l.archetype_id)}::uuid`).join(", ")}) and ` : "";
  return `${rbHeader(wave, "unpublish (a roll forward after the promote)", `
Takes the ${n} places of the ${wave.batch} batch off the map without touching
their locked keys: ${links ? "the archetype links go back to step 1 first (homes on North Coast,\nplacements on North Coast and California), then " : ""}every boundary of the batch
non-current and every place DRAFT, then the checked refresh. Boundaries,
relationships and knowledge stay, for a later re-promote. Refuses while a
later batch is live (unpublish it first).
THEN, on master: splice-boundary-expectations.mjs --write (it keeps only the
current united-states rows, so this batch's rows leave the hunk); git diff must
show only removed united-states rows; commit and push it as a staged push.
THEN DISPATCH A NEW TILES RELEASE FROM MASTER (promote=true), and never roll
back the manifest (§17.3).`)}${rbPrelude(wave)}
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us3_rb e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED with one current boundary: %', v_text; end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p
   where ${CA_WHERE("p")} and p.canonical_key not in (select key from _us3_known)
     and (p.publication_status = 'VERIFIED'
          or exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = p.id and b.is_current));
  if v_text is not null then raise exception '${tag}: a later batch is live (unpublish it first): %', v_text; end if;
  select string_agg(a.name, ', ' order by a.name) into v_text
    from public.wine_archetypes a
   where ${notLinked}(a.wine_place_id in (select p.id from public.wine_places p where p.canonical_key in (select key from _us3_rb))
          or exists (select 1 from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
                      where x.archetype_id = a.id and p.canonical_key in (select key from _us3_rb)));
  if v_text is not null then
    raise exception '${tag}: an archetype not in the links file is placed on this batch (re-point it first): %', v_text;
  end if;
end $$;
${linkSteps}
update public.wine_place_boundaries b
   set is_current = false
  from public.wine_places p
 where p.id = b.wine_place_id and p.canonical_key in (select key from _us3_rb) and b.is_current;
update public.wine_places p
   set publication_status = 'DRAFT', updated_at = now()
 where p.canonical_key in (select key from _us3_rb);

do $$
declare n int;
begin
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.publication_status = 'VERIFIED';
  if n <> 0 then raise exception '${tag}: % VERIFIED places of this batch left', n; end if;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select key from _us3_rb) and b.is_current;
  if n <> 0 then raise exception '${tag}: % current boundaries left', n; end if;
  select count(*) into n from public.wine_places p where p.canonical_key in (select key from _us3_rb) and p.canonical_key_locked_at is not null;
  if n <> ${n} then raise exception '${tag}: % of ${n} keys still locked (they never unlock)', n; end if;
  select count(*) into n from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % archetype placements on this batch left', n; end if;
  select count(*) into n from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
   where p.canonical_key in (select key from _us3_rb);
  if n <> 0 then raise exception '${tag}: % archetypes still at home on this batch', n; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function renderAll(waves, links) {
  return {
    [waves.core.files.catalog]: catalogSql(waves.core),
    [waves.rest.files.catalog]: catalogSql(waves.rest),
    [waves.core.files.promote]: promoteSql(waves.core),
    [waves.rest.files.promote]: promoteSql(waves.rest),
    [waves.core.files.links]: links2Sql(links),
    [waves.core.rollbackFiles.unstage]: unstageSql(waves.core),
    [waves.core.rollbackFiles.remove]: removeSql(waves.core),
    [waves.core.rollbackFiles.unpublish]: unpublishSql(waves.core, links),
    [waves.rest.rollbackFiles.unstage]: unstageSql(waves.rest),
    [waves.rest.rollbackFiles.remove]: removeSql(waves.rest),
    [waves.rest.rollbackFiles.unpublish]: unpublishSql(waves.rest, null),
  };
}

async function main() {
  const waves = await loadUs3Waves();
  for (const [path, text] of Object.entries(renderAll(waves, await loadLinks2()))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
