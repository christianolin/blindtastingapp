// Renders the US-4 SQL (catalog, promote, rollbacks) from the US-4 wave
// (us4-wave.mjs). The committed files must equal this render
// (us4-sql.test.mjs). No file contains begin/commit/rollback: the applier, or
// apply-rollback.mjs, owns the transaction (spec D24). Every check and write is
// scoped to Washington, Oregon and New York; nothing here names California.
//
// Usage: node scripts/usa-map/render-us4-sql.mjs
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { REFRESH_BLOCK, sq } from "./render-us2-sql.mjs";
import { depthOf, loadTrees, STATE_SLUGS } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { SCOPE_KEYS, us4Wave } from "./us4-wave.mjs";
import { STATE_WINDOWS } from "../wine-map-sources/usa-stage-lib.mjs";

const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
export const SCOPE_WHERE = (alias) => `(${SCOPE_KEYS.map((k) => `${alias}.canonical_key = '${k}' or ${alias}.canonical_key like '${k}.%'`).join(" or ")})`;
const PLAN = "docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md";

export async function loadUs4Wave() {
  return us4Wave(await loadTrees(), await loadTtb());
}

export function catalogSql(wave) {
  const tag = "US-4 catalog";
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const prior = wave.prior.verified.map((k) => `  (${sq(k)})`).join(",\n");
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => a - b);
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perTier = valuesOf(countBy(wave.places, (p) => String(p.display_tier)));
  const perParent = valuesOf(countBy(wave.places, (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  return `-- USA on the wine map, phase US-4: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-4;
-- plan ${PLAN} Task 4).
--
-- Inserts the ${wave.places.length} AVAs of Washington, Oregon and New York DRAFT (APPELLATION,
-- AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-{washington,oregon,new-york}-tree.json: one place per
-- cross-state AVA, under its map state (D6). Rendered by
-- scripts/usa-map/render-us4-sql.mjs; us4-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs the US-2 places of the three states VERIFIED (the US-2 promote is live).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us4 and flip in ${wave.versions.promote}.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us4_catalog, pg_temp._us4_prior;
create temp table _us4_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us4_catalog values
${rows};
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
${prior};

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception '${tag}: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED';
  if v_text is not null then
    raise exception '${tag}: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

${depths.map(insertAt).join("\n")}
do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v
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
  if v_text is not null then raise exception '${tag}: rows differ from the tree reports: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perTier}) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

export function promoteSql(wave) {
  const tag = "US-4 promote";
  const n = wave.places.length;
  const checks = new Map(wave.parentChecks.map((c) => [c.key, c]));
  const stateKeyOf = (code) => {
    if (!STATE_SLUGS[code]) throw new Error(`legal state ${code} is not a wave state`);
    return `united-states.${STATE_SLUGS[code]}`;
  };
  const rows = wave.places.map((p) => {
    const w = STATE_WINDOWS[p.map_state];
    return `  (${[
      sq(p.key), sq(p.ucd_ava_id), bool(wave.outlineKeys.includes(p.key)), sq(p.parent_key),
      checks.has(p.key) ? num(checks.get(p.key).min) : "null", `'{${p.legal_states.map(stateKeyOf).sort().join(",")}}'`,
      num(w.minLon), num(w.minLat), num(w.maxLon), num(w.maxLat),
    ].join(", ")})`;
  }).join(",\n");
  const prior = wave.priorKeys.map((k) => `  (${sq(k)})`).join(",\n");
  const stateName = (k) => wave.states.find((s) => k === s.key || k.startsWith(`${s.key}.`))?.name;
  const edges = wave.edges.map((e) => `  (${[
    sq(e.source_key), sq(e.target_key), sq(e.type), sq(e.basis),
    e.ratio != null ? num(e.ratio) : "null", e.share != null ? num(e.share) : "null",
    sq(`US-4, ${stateName(e.source_key)} tree report: basis ${e.basis}${e.share != null ? `, share ${e.share}` : ""}${e.ratio != null ? `, ratio ${e.ratio}` : ""}`),
  ].join(", ")})`).join(",\n");
  const perState = wave.states.map((s) => `(${sq(s.key)}, ${wave.after.perState[s.code].places}, ${wave.after.perState[s.code].ava})`).join(", ");
  const oneEach = [...new Set([...wave.ucd.map((u) => u.ucd_ava_id), ...wave.crossState.map((c) => c.ucd_ava_id)])].sort().map(sq).join(", ");
  const deferred = wave.deferred.map(sq).join(", ");
  const outlineCount = wave.outlineKeys.length;
  return `-- USA on the wine map, phase US-4: the promote (spec §8.4, §15 US-4;
-- plan ${PLAN} Task 11).
--
-- Re-checks in SQL every invariant the stage asserted, then flips the ${n} AVAs
-- of Washington, Oregon and New York to VERIFIED and their boundaries to
-- VALIDATED + current, and stores the wave's ${wave.edges.length} edges (§8.3). The cross-state
-- rules (D6, D14) are re-checked on the stored geometry: every AVA lies inside
-- its legal states, and every state edge carries the tree's land share. Checks
-- read only the three states' keys, and the country outline as land, so
-- California is never read. Ends with the neighbour refresh, which must return >= 0.
--
-- Precondition: the US-2 promote ${wave.priorPromote} is live; stage-usa-ava.mjs
-- --wave us4 --stage has committed one DRAFT, non-current boundary per place;
-- ${wave.versions.catalog} and ${wave.versions.knowledge} are applied.
-- Rendered by scripts/usa-map/render-us4-sql.mjs; do not hand-edit.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '30min';

drop table if exists pg_temp._us4_promote, pg_temp._us4_prior, pg_temp._us4_edges, pg_temp._us4_staged, pg_temp._us4_geom;
create temp table _us4_promote (
  key text primary key, ucd_ava_id text not null, outline boolean not null,
  parent_key text not null, parent_min double precision, legal_keys text[] not null,
  min_lon double precision not null, min_lat double precision not null,
  max_lon double precision not null, max_lat double precision not null
) on commit drop;
insert into _us4_promote values
${rows};
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
${prior};
create temp table _us4_edges (
  source_key text not null, target_key text not null, type public.wine_place_relationship_type not null,
  basis text not null, ratio double precision, share double precision, note text not null
) on commit drop;
insert into _us4_edges values
${edges};

-- 1. Pre-state.
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED'
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then
    raise exception '${tag}: an earlier wave is not live (VERIFIED with one current boundary): %', v_text;
  end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'DRAFT';
  if v_text is not null then raise exception '${tag}: missing or not DRAFT: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current) <> 1
      or exists (select 1 from public.wine_place_boundaries b
                  where b.wine_place_id = p.id and (b.is_current or b.quality_status <> 'DRAFT'));
  if v_text is not null then
    raise exception '${tag}: expected exactly one DRAFT, non-current boundary per place (run stage-usa-ava.mjs --wave us4 --stage first): %', v_text;
  end if;
  select string_agg(p.canonical_key, ', ' order by p.canonical_key) into v_text
    from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
   where ${SCOPE_WHERE("p")}
     and p.canonical_key not in (select key from _us4_promote union all select key from _us4_prior);
  if v_text is not null then raise exception '${tag}: boundaries on other places under Washington, Oregon or New York: %', v_text; end if;
end $$;

create temp table _us4_staged on commit drop as
select e.*, p.id as place_id, b.id as boundary_id, b.display_geometry as g, b.label_point,
       b.boundary_method::text as method, b.generation_parameters as gp,
       so.source_namespace as ns, so.source_feature_id as feature_id
  from _us4_promote e
  join public.wine_places p on p.canonical_key = e.key
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT' and not b.is_current
  join public.wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
  join public.wine_boundary_sources so on so.id = s.source_id;

-- Every geometry a check reads: this wave's staged boundary, else US-2's current one
-- (the country, the three states and their umbrella AVAs).
create temp table _us4_geom on commit drop as
select key, g from _us4_staged
union all
select p.canonical_key, b.display_geometry
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 where p.canonical_key in (select key from _us4_prior);

-- 2. Domain invariants, re-checked rather than trusted from the script.
do $$
declare n int; v_text text; v_country extensions.geometry; v_land extensions.geometry; r record;
begin
  select count(*) into n from _us4_staged;
  if n <> ${n} then raise exception '${tag}: % staged rows, expected ${n}', n; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged where not (
    method = 'GENERALIZED_FROM_OFFICIAL_SOURCE' and ns = 'UCD_TTB_AVA' and feature_id = ucd_ava_id
    and gp->>'engine' = 'ucd-ava-digitization' and gp->>'crs_in' = 'EPSG:4269'
    and gp->>'crs_out' = 'EPSG:4326' and gp->>'transform' = 'identity');
  if v_text is not null then raise exception '${tag}: provenance does not match the stage: %', v_text; end if;

  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where not extensions.ST_IsValid(g) or extensions.ST_IsEmpty(g) or not extensions.ST_Covers(g, label_point)
      or extensions.ST_X(label_point) not between min_lon and max_lon
      or extensions.ST_Y(label_point) not between min_lat and max_lat;
  if v_text is not null then raise exception '${tag}: invalid geometry or label outside its state''s window: %', v_text; end if;

  -- D15: an AVA of 5,000 km² or more draws as an outline, and only such an AVA.
  select string_agg(key, ', ' order by key) into v_text from _us4_staged
   where (coalesce(gp->>'display', '') = 'outline') <> outline
      or outline <> (extensions.ST_Area(g::extensions.geography) / 1e6 >= 5000);
  if v_text is not null then raise exception '${tag}: outline set is not D15''s: %', v_text; end if;
  select count(*) into n from _us4_staged where gp->>'display' = 'outline';
  if n <> ${outlineCount} then raise exception '${tag}: % outline places, expected ${outlineCount}', n; end if;

  -- §8.2 state containment, on land and buffered, against each AVA's legal (TTB)
  -- states' live outlines (plan decision 5).
  select g into v_country from _us4_geom where key = 'united-states';
  if v_country is null then raise exception '${tag}: the United States outline is not live'; end if;
  v_land := extensions.ST_Buffer(v_country, 0.05);
  select string_agg(format('%s %s', x.key, round(x.share::numeric, 4)), ', ') into v_text from (
    select s.key,
           extensions.ST_Area(extensions.ST_Intersection(s.g,
             (select extensions.ST_Buffer(extensions.ST_Union(st.g), 0.05) from _us4_geom st where st.key = any(s.legal_keys))))
           / nullif(extensions.ST_Area(extensions.ST_Intersection(s.g, v_land)), 0) as share
      from _us4_staged s) x
   where x.share is null or x.share < 0.995;
  if v_text is not null then raise exception '${tag}: not inside its legal states (>= 99.5%% of land): %', v_text; end if;

  -- D7 parent containment on the stored display geometry, with US-3's
  -- measured simplification slack (US-4 measured at most 0.000284).
  select count(*) into n from _us4_staged s
   where s.parent_min is not null and not exists (select 1 from _us4_geom pg where pg.key = s.parent_key);
  if n <> 0 then raise exception '${tag}: % places whose parent AVA has no geometry', n; end if;
  select string_agg(format('%s %s in %s', x.key, round(x.inside::numeric, 5), x.parent_key), ', ') into v_text from (
    select s.key, s.parent_key, s.parent_min,
           extensions.ST_Area(extensions.ST_Intersection(s.g, pg.g)) / nullif(extensions.ST_Area(s.g), 0) as inside
      from _us4_staged s join _us4_geom pg on pg.key = s.parent_key
     where s.parent_min is not null) x
   where x.inside is null or x.inside < x.parent_min - 0.001;
  if v_text is not null then raise exception '${tag}: not inside its parent AVA: %', v_text; end if;

  -- §8.3 edges, re-checked (plan decision 4). A state edge: the source's
  -- unbuffered land share in the target state, within 0.01 of the tree's and at
  -- least 0.005. A containment edge: >= 0.899 inside its target.
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
    left join _us4_geom a on a.key = e.source_key
    left join _us4_geom b on b.key = e.target_key
   where a.g is null or b.g is null
      or (e.type = 'OVERLAPS'
          and not coalesce(abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) - e.ratio) <= 0.01, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis = 'state_share'
          and not coalesce(
            abs(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) - e.share) <= 0.01
            and extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) >= 0.005, false))
      or (e.type = 'ALTERNATE_PARENT' and e.basis <> 'state_share'
          and not coalesce(extensions.ST_Area(extensions.ST_Intersection(a.g, b.g)) / extensions.ST_Area(a.g) >= 0.899, false));
  if v_text is not null then raise exception '${tag}: an edge does not match the geometry: %', v_text; end if;
  for r in select e.source_key, e.target_key, e.share,
                  extensions.ST_Area(extensions.ST_Intersection(a.g, b.g))
                  / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, v_country)), 0) as measured
             from _us4_edges e join _us4_geom a on a.key = e.source_key join _us4_geom b on b.key = e.target_key
            where e.basis = 'state_share' order by e.source_key loop
    raise notice '${tag}: state share % in % %, tree %', r.source_key, r.target_key, round(r.measured::numeric, 4), r.share;
  end loop;
end $$;

-- 3. Coverage: no US place ever shows "Profile being curated" (§8.4 step 3).
do $$
declare v_text text;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
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

-- 4. Flip, and the edges.
update public.wine_place_boundaries b
   set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
  from _us4_staged s where b.id = s.boundary_id;
update public.wine_places p
   set publication_status = 'VERIFIED', updated_at = now()
  from _us4_promote e where p.canonical_key = e.key;
insert into public.wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, e.type, e.note
  from _us4_edges e
  join public.wine_places s on s.canonical_key = e.source_key
  join public.wine_places t on t.canonical_key = e.target_key;

-- 5. Refresh, same transaction.
${REFRESH_BLOCK(tag)}
-- 6. Post-state.
do $$
declare n int; v_text text; r record;
begin
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_promote e join public.wine_places p on p.canonical_key = e.key
   where p.publication_status <> 'VERIFIED' or p.canonical_key_locked_at is null
      or (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') <> 1;
  if v_text is not null then raise exception '${tag}: not VERIFIED, locked and current: %', v_text; end if;
  for r in select * from (values ${perState}) e(state_key, live, ava) loop
    select count(*) into n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED';
    if n <> r.live then raise exception '${tag}: % live places under %, expected %', n, r.state_key, r.live; end if;
    select count(*) into n from public.wine_places p
     where (p.canonical_key = r.state_key or p.canonical_key like r.state_key || '.%')
       and p.appellation_system = 'AVA' and p.publication_status = 'VERIFIED';
    if n <> r.ava then raise exception '${tag}: % VERIFIED AVA places under %, expected %', n, r.state_key, r.ava; end if;
  end loop;
  select count(*) into n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
   where ${SCOPE_WHERE("p")} and b.quality_status = 'DRAFT';
  if n <> 0 then raise exception '${tag}: % DRAFT boundaries left under Washington, Oregon or New York', n; end if;
  select count(*) into n from public.wine_place_relationships rel
    join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
   where ${SCOPE_WHERE("s")} or ${SCOPE_WHERE("t")};
  if n <> ${wave.after.scopeEdges} then raise exception '${tag}: % relationships under the three states, expected ${wave.after.scopeEdges}', n; end if;
  select string_agg(format('%s %s %s', e.type, e.source_key, e.target_key), ', ') into v_text
    from _us4_edges e
   where (select count(*) from public.wine_place_relationships rel
            join public.wine_places s on s.id = rel.source_place_id join public.wine_places t on t.id = rel.target_place_id
           where s.canonical_key = e.source_key and t.canonical_key = e.target_key and rel.relationship_type = e.type) <> 1;
  if v_text is not null then raise exception '${tag}: edges not stored exactly once: %', v_text; end if;

  -- D6/D14: one place per AVA of this wave and per cross-state AVA; nothing
  -- deferred (Idaho, Ohio) placed; no key under a state outside wave 1.
  select string_agg(format('%s=%s', x.id, x.n), ', ') into v_text from (
    select f.id, (select count(*)::int from public.wine_place_boundaries b
                    join public.wine_boundary_source_snapshots ss on ss.id = b.source_snapshot_id
                    join public.wine_boundary_sources so on so.id = ss.source_id
                   where b.is_current and so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = f.id) n
      from unnest(array[${oneEach}]::text[]) f(id)) x
   where x.n <> 1;
  if v_text is not null then raise exception '${tag}: a cross-state AVA is not exactly one place (current UC Davis boundaries per AVA): %', v_text; end if;
  select string_agg(so.source_feature_id, ', ') into v_text
    from public.wine_boundary_sources so
    join public.wine_boundary_source_snapshots ss on ss.source_id = so.id
    join public.wine_place_boundaries b on b.source_snapshot_id = ss.id
   where so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = any(array[${deferred}]::text[]);
  if v_text is not null then raise exception '${tag}: a deferred AVA has a place: %', v_text; end if;
  select string_agg(canonical_key, ', ' order by canonical_key) into v_text from public.wine_places
   where canonical_key like 'united-states.%' and split_part(canonical_key, '.', 2) not in ('california', 'washington', 'oregon', 'new-york');
  if v_text is not null then raise exception '${tag}: a place under a state outside wave 1: %', v_text; end if;

  if not (select fresh from public.wine_place_neighbours_state) then
    raise exception '${tag}: the neighbour cache is not fresh after the refresh';
  end if;
end $$;
`;
}

// (Task 12 inserts the rollback renderers here.)

/** Every rendered file, path -> text. */
export function renderAll(wave) {
  return {
    [wave.files.catalog]: catalogSql(wave),
    [wave.files.promote]: promoteSql(wave),
  };
}

async function main() {
  const wave = await loadUs4Wave();
  for (const [path, text] of Object.entries(renderAll(wave))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
