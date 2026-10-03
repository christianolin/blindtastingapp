// The one-off fp-1 footprint pass: the pure half (waves, the sitting gate, the
// reveal diff, the report, the rendered promote / unstage / revert SQL).
// footprint-pass.mjs is the database half. Design: scratchpad
// footprints/design-final.md §5.4, §6, §7.
import { firstDrawnZoom, revealPlan } from "../wine-map-tiles/lib.mjs";
import { FOOTPRINT_VERSION, PARAMS } from "./footprint-sql.mjs";

/** Waves, worst first (survey p90, 2026-10-03): Germany by region, then the rest by country. */
export const WAVES = Object.freeze([
  "germany.mittelrhein", "germany.pfalz", "germany.mosel", "germany.ahr", "germany.nahe", "germany.rheinhessen",
  "germany", "france", "spain", "italy", "united-states", "portugal",
]);

export const REVISION_SUFFIX = "+fp1";

export function inScope(key, scope) {
  return scope === "*" || key === scope || key.startsWith(`${scope}.`);
}

/** The wave a key belongs to in a whole-map run: the first matching scope, else "*". */
export function waveOf(key, waves = WAVES) {
  return waves.find((w) => inScope(key, w)) ?? "*";
}

/** Waves of a run: one scope, or every wave then "*" for --wave all. */
export function wavesFor(arg) {
  return !arg || arg === "all" ? [...WAVES, "*"] : [arg];
}

export function countryOf(key) {
  return key.split(".")[0];
}

/** Sitting gate for --stage (built like usa-stage-lib's sittingGate). Returns the refusals. */
export function sittingGate(f) {
  const r = [];
  if (!f.ownerApproval) r.push("the review file carries no owner approval (_provenance.owner_approval)");
  if (!f.migrationRecorded) r.push(`Migration A ${f.migrationVersion} is not recorded live`);
  if (!f.functionLive) r.push("public.wine_footprint_clean does not exist live");
  if (f.draftBoundaries > 0) r.push(`${f.draftBoundaries} DRAFT boundaries exist: someone is mid-batch (promote or unstage first)`);
  if (f.buildingReleases > 0) r.push(`${f.buildingReleases} release(s) BUILDING in the last hour: a tiles run is in flight`);
  if (f.priorPromote && !f.priorPromoted) r.push(`the previous wave's promote ${f.priorPromote} is not recorded live`);
  if (f.staleInputs > 0) r.push(`${f.staleInputs} input row(s) are no longer current or changed since the dry run`);
  if (!(f.changed > 0)) r.push("nothing to stage: the review file lists no changed place");
  return r;
}

// ---------------------------------------------------------------- reveal diff

/**
 * When a tier >= 2 place is first drawn, before and after (export.mjs's rule at
 * REVEAL_CHECK_PX, per place; the subregion family pull is not applied here, so
 * revealFamilyReport re-checks Burgundy on the Gate B draft). `row`: { id,
 * canonical_key, display_tier, kind, primary_parent_id, min_zoom, geometry
 * (GeoJSON string), label_point (GeoJSON string) }.
 */
export function revealOf(row) {
  if (Number(row.display_tier) < 2) return null;
  const plan = revealPlan([row], () => 0).get(row.id);
  if (!plan) return null;
  const zoom = firstDrawnZoom(plan.side, row.min_zoom);
  const partZooms = plan.parts.map((p) => firstDrawnZoom(p.side, row.min_zoom));
  return { zoom, parts: partZooms.length, waiting: partZooms.filter((z) => z > zoom).length };
}

export function revealDiff(before, after) {
  const a = revealOf(before);
  const b = revealOf(after);
  if (!a || !b) return null;
  return { zoom_before: a.zoom, zoom_after: b.zoom, flip: a.zoom !== b.zoom, waiting_before: a.waiting, waiting_after: b.waiting };
}

// ---------------------------------------------------------------- report

const q = (values, p) => {
  const s = [...values].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : null;
};
const pct = (x, d = 2) => (x === null || x === undefined ? "-" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)} %`);
const n0 = (x) => Number(x ?? 0).toLocaleString("en-US");

export function areaDelta(m) {
  return m && m.area_m2_before > 0 ? m.area_m2_after / m.area_m2_before - 1 : null;
}

/** Flags the pass reports and hand-fixes none of (design §4). */
export function flagsOf(m) {
  const flags = [];
  if (!m) return flags;
  const a = m.area_m2_before || 0;
  if (a > 0 && m.outside_parent_raw_m2 > 0.02 * a) flags.push("parent_conflict");
  if (a > 0 && m.raw_overlap_m2 > 0.01 * a) flags.push("overlap_without_edge");
  return flags;
}

export function summarize(records) {
  const groups = new Map();
  for (const r of records) {
    const c = countryOf(r.key);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(r);
  }
  const rows = [];
  for (const [country, rs] of [...groups].sort((a, b) => b[1].filter((r) => r.changed).length - a[1].filter((r) => r.changed).length)) {
    const changed = rs.filter((r) => r.changed);
    const d = changed.map((r) => areaDelta(r.metrics)).filter((x) => x !== null);
    const sum = (f) => changed.reduce((s, r) => s + Number(f(r.metrics) ?? 0), 0);
    rows.push({
      country, places: rs.length, changed: changed.length,
      unchanged: rs.filter((r) => r.status === "unchanged" && !r.changed).length,
      skipped: rs.filter((r) => r.status?.startsWith("skipped")).length,
      errors: rs.filter((r) => r.status?.startsWith("error")).length,
      close_only: changed.filter((r) => r.rung === "close-only").length,
      area_p50: q(d, 0.5), area_p90: q(d, 0.9), area_max: d.length ? Math.max(...d) : null, area_min: d.length ? Math.min(...d) : null,
      parts_before: sum((m) => m.parts_before), parts_after: sum((m) => m.parts_after),
      holes_before: sum((m) => m.holes_before), holes_after: sum((m) => m.holes_after),
      vertices_before: sum((m) => m.vertices_before), vertices_after: sum((m) => m.vertices_after),
      parent_conflict: rs.filter((r) => r.flags?.includes("parent_conflict")).length,
      overlap_without_edge: rs.filter((r) => r.flags?.includes("overlap_without_edge")).length,
      reveal_flips: changed.filter((r) => r.reveal?.flip).length,
    });
  }
  return rows;
}

export function renderReport({ provenance, records }) {
  const sum = summarize(records);
  const all = records;
  const changed = all.filter((r) => r.changed);
  const L = [];
  L.push(`# Footprint cleanup ${FOOTPRINT_VERSION}: dry run`, "");
  L.push(`Generated ${provenance.generated_at} by \`footprint-pass.mjs --dry\` (${provenance.via}). Read-only: nothing was written to the database or Storage, nothing was dispatched.`, "");
  L.push(`- Waves (worst first): ${provenance.waves.join(" → ")}`);
  L.push(`- PostGIS ${provenance.postgis}, GEOS ${provenance.geos}`);
  L.push(`- Places read: ${all.length}; **changed: ${changed.length}**; unchanged: ${all.filter((r) => !r.changed && r.status === "unchanged").length}; skipped: ${all.filter((r) => r.status?.startsWith("skipped")).length}; errors: ${all.filter((r) => r.status?.startsWith("error")).length}`);
  const d = changed.map((r) => areaDelta(r.metrics)).filter((x) => x !== null);
  L.push(`- Area change on changed places: p50 ${pct(q(d, 0.5))}, p90 ${pct(q(d, 0.9))}, p99 ${pct(q(d, 0.99))}, max ${pct(d.length ? Math.max(...d) : null)}, min ${pct(d.length ? Math.min(...d) : null)}`);
  const tot = (f) => changed.reduce((s, r) => s + Number(f(r.metrics) ?? 0), 0);
  L.push(`- Changed places, parts ${n0(tot((m) => m.parts_before))} → ${n0(tot((m) => m.parts_after))}; holes ${n0(tot((m) => m.holes_before))} → ${n0(tot((m) => m.holes_after))}; vertices ${n0(tot((m) => m.vertices_before))} → ${n0(tot((m) => m.vertices_after))}`);
  const worst = (f) => Math.max(0, ...changed.map((r) => Number(f(r.metrics) ?? 0)));
  L.push(`- Constraint checks (grid-exact, m²): max new overlap with a non-partner ${worst((m) => m.new_overlap_m2)}, max new ground outside the parent ${worst((m) => m.outside_parent_new_m2)}, max descendant ground lost ${worst((m) => m.protected_lost_m2)}`);
  L.push(`- Elapsed ${provenance.elapsed_s ?? "-"} s`, "");
  L.push("## Per country", "");
  L.push("| country | places | changed | unchanged | skipped | errors | close-only | area p50 | area p90 | area max | area min | parts | holes | vertices | parent conflict | overlap w/o edge | reveal flips |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|");
  for (const s of sum) {
    L.push(`| ${s.country} | ${s.places} | ${s.changed} | ${s.unchanged} | ${s.skipped} | ${s.errors} | ${s.close_only} | ${pct(s.area_p50)} | ${pct(s.area_p90)} | ${pct(s.area_max)} | ${pct(s.area_min)} | ${n0(s.parts_before)} → ${n0(s.parts_after)} | ${n0(s.holes_before)} → ${n0(s.holes_after)} | ${n0(s.vertices_before)} → ${n0(s.vertices_after)} | ${s.parent_conflict} | ${s.overlap_without_edge} | ${s.reveal_flips} |`);
  }
  L.push("", "## Refusals (skipped: the input is kept, stamped)", "");
  const skipped = all.filter((r) => r.status?.startsWith("skipped") || r.status?.startsWith("error"));
  if (!skipped.length) L.push("None.");
  for (const r of skipped) {
    const m = r.metrics ?? {};
    L.push(`- \`${r.key}\`: **${r.status}** (last attempt: area ${pct(areaDelta(m))}, parts ${m.parts_before ?? "-"} → ${m.parts_after ?? "-"})${r.error ? ` — ${r.error}` : ""}`);
  }
  L.push("", "## Biggest changes (by parts removed)", "");
  L.push("| key | status / rung | parts | holes | area | vertices | dropped | reveal zoom | flags |", "|---|---|---|---|---:|---|---:|---|---|");
  for (const r of [...changed].sort((a, b) => (b.metrics.parts_before - b.metrics.parts_after) - (a.metrics.parts_before - a.metrics.parts_after) || a.key.localeCompare(b.key)).slice(0, 40)) {
    const m = r.metrics;
    L.push(`| \`${r.key}\` | ${r.status}/${r.rung} | ${m.parts_before} → ${m.parts_after} | ${m.holes_before} → ${m.holes_after} | ${pct(areaDelta(m))} | ${m.vertices_before} → ${m.vertices_after} | ${m.dropped_parts} | ${r.reveal ? `${r.reveal.zoom_before} → ${r.reveal.zoom_after}` : "-"} | ${(r.flags ?? []).join(", ")} |`);
  }
  for (const [flag, title] of [["parent_conflict", "Parent conflicts (already > 2 % outside the containment parent; growth there is blocked)"], ["overlap_without_edge", "Overlaps without an edge (> 1 % raw overlap with a same-tier place that has no DUAL_LABEL/OVERLAPS/REPLACES_WITHIN edge)"]]) {
    const list = all.filter((r) => r.flags?.includes(flag));
    L.push("", `## ${title}: ${list.length}`, "");
    for (const r of list.slice(0, 60)) {
      const m = r.metrics;
      const v = flag === "parent_conflict" ? m.outside_parent_raw_m2 : m.raw_overlap_m2;
      L.push(`- \`${r.key}\`: ${(100 * v / m.area_m2_before).toFixed(1)} % (${n0(Math.round(v))} m²)${r.parent ? `, parent \`${r.parent}\`` : ""}`);
    }
    if (list.length > 60) L.push(`- … and ${list.length - 60} more (see the review JSON)`);
  }
  const flips = changed.filter((r) => r.reveal?.flip);
  L.push("", `## Reveal: first-drawn zoom flips (${flips.length})`, "");
  for (const r of flips.slice(0, 60)) L.push(`- \`${r.key}\`: z${r.reveal.zoom_before} → z${r.reveal.zoom_after}; pieces waiting ${r.reveal.waiting_before} → ${r.reveal.waiting_after}`);
  const pieces = changed.filter((r) => r.reveal && r.reveal.waiting_before !== r.reveal.waiting_after);
  L.push("", `Pieces that waited and now arrive with their place: ${pieces.reduce((s, r) => s + Math.max(0, r.reveal.waiting_before - r.reveal.waiting_after), 0)} across ${pieces.length} places. (Per-place rule at 24 px; the subregion family pull is re-checked by revealFamilyReport on the Gate B draft.)`);
  return `${L.join("\n")}\n`;
}

// ---------------------------------------------------------------- rendered SQL (from an approved review file)

const sqlStr = (s) => `'${String(s).replaceAll("'", "''")}'`;

function expectations(review) {
  const rows = review.places.filter((p) => p.changed).map((p) => ({
    place_id: p.place_id, key: p.key, current_boundary_id: p.current_boundary_id, current_sha: p.current_sha256, output_sha: p.output_sha256,
  }));
  if (!rows.length) throw new Error("the review file lists no changed place");
  return rows;
}

function header(kind, review) {
  return `-- Footprint cleanup ${FOOTPRINT_VERSION}, wave ${review._provenance.wave}: ${kind}.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: ${review._provenance.owner_approval ?? "(none)"}.
`;
}

/** The promote migration: re-assert, flip, refresh the neighbour cache, assert the post-state. */
export function renderPromoteSql(review) {
  const rows = expectations(review);
  const bounds = { grow: PARAMS.grow_max, shrink: PARAMS.shrink_max };
  return `${header("promote", review)}
do $promote$
declare
  v_expect jsonb := ${sqlStr(JSON.stringify(rows))}::jsonb;
  v_n int := jsonb_array_length(v_expect);
  v_bad int;
  v_refreshed int;
begin
  -- 1. every input is still current with the sha the owner approved against
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, current_sha text, output_sha text)
   where not exists (select 1 from public.wine_place_boundaries b
                      where b.id = e.current_boundary_id and b.wine_place_id = e.place_id and b.is_current
                        and b.quality_status = 'VALIDATED'
                        and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.current_sha);
  if v_bad > 0 then raise exception 'footprints promote: % input row(s) changed since approval', v_bad; end if;

  -- 2. exactly one staged ${REVISION_SUFFIX} row per place, DRAFT, non-current, with the approved output sha
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
             and b.revision like '%${REVISION_SUFFIX}'
             and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha
             and b.generation_parameters->'cleanup'->>'output_sha256' = e.output_sha) <> 1;
  if v_bad > 0 then raise exception 'footprints promote: % place(s) without exactly one approved staged row', v_bad; end if;

  -- 3. the stamp's own checks: no new overlap with a non-partner, no new ground
  --    outside the containment parent, no descendant ground lost (each <= 1 m²),
  --    area within [-${bounds.shrink * 100} %, +${bounds.grow * 100} %]
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
    join public.wine_place_boundaries b
      on b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%${REVISION_SUFFIX}'
   where (b.generation_parameters->'cleanup'->'metrics'->>'new_overlap_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'outside_parent_new_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'protected_lost_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           > (1 + ${bounds.grow}) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           < (1 - ${bounds.shrink}) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8;
  if v_bad > 0 then raise exception 'footprints promote: % staged row(s) fail the stamp checks', v_bad; end if;

  -- 4. flip: demote the inputs, make the staged rows VALIDATED + current
  update public.wine_place_boundaries b set is_current = false
    from jsonb_to_recordset(v_expect) e(current_boundary_id uuid)
   where b.id = e.current_boundary_id;
  update public.wine_place_boundaries b set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%${REVISION_SUFFIX}'
     and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha;
  get diagnostics v_bad = row_count;
  if v_bad <> v_n then raise exception 'footprints promote: flipped % of % rows', v_bad, v_n; end if;

  -- 5. post-state: each place has exactly one current row, the approved one
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current) <> 1
      or not exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current
                       and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha);
  if v_bad > 0 then raise exception 'footprints promote: post-state wrong for % place(s)', v_bad; end if;

  -- 6. the neighbour cache, in the same transaction
  v_refreshed := public.refresh_wine_place_neighbours();
  if v_refreshed < 0 then raise exception 'footprints promote: refresh_wine_place_neighbours() refused (%)', v_refreshed; end if;
end
$promote$;
`;
}

/** Before the promote: delete the wave's staged rows (none may be current), refresh. */
export function renderUnstageSql(review) {
  const rows = expectations(review);
  return `${header("unstage (rollback before the promote; re-appliable)", review)}
do $unstage$
declare
  v_expect jsonb := ${sqlStr(JSON.stringify(rows))}::jsonb;
  v_bad int;
begin
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid)
    join public.wine_place_boundaries b on b.wine_place_id = e.place_id and b.revision like '%${REVISION_SUFFIX}' and b.is_current;
  if v_bad > 0 then raise exception 'footprints unstage: % staged row(s) are already current: use the revert file', v_bad; end if;
  delete from public.wine_place_boundaries b
   using jsonb_to_recordset(v_expect) e(place_id uuid)
   where b.wine_place_id = e.place_id and b.revision like '%${REVISION_SUFFIX}' and b.quality_status = 'DRAFT' and not b.is_current;
  if public.refresh_wine_place_neighbours() < 0 then raise exception 'footprints unstage: neighbour refresh refused'; end if;
end
$unstage$;
`;
}

/** After the promote: demote the cleaned rows, make the recorded inputs current again, refresh. */
export function renderRevertSql(review) {
  const rows = expectations(review);
  return `${header("revert (rollback after the promote; re-appliable)", review)}
do $revert$
declare
  v_expect jsonb := ${sqlStr(JSON.stringify(rows))}::jsonb;
  v_bad int;
begin
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, current_sha text)
   where not exists (select 1 from public.wine_place_boundaries b
                      where b.id = e.current_boundary_id and b.wine_place_id = e.place_id and b.quality_status = 'VALIDATED'
                        and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.current_sha);
  if v_bad > 0 then raise exception 'footprints revert: % recorded input row(s) missing', v_bad; end if;
  update public.wine_place_boundaries b set is_current = false
    from jsonb_to_recordset(v_expect) e(place_id uuid)
   where b.wine_place_id = e.place_id and b.is_current and b.revision like '%${REVISION_SUFFIX}';
  update public.wine_place_boundaries b set is_current = true
    from jsonb_to_recordset(v_expect) e(current_boundary_id uuid)
   where b.id = e.current_boundary_id and not b.is_current;
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid)
   where (select count(*) from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current) <> 1
      or not exists (select 1 from public.wine_place_boundaries b where b.id = e.current_boundary_id and b.is_current);
  if v_bad > 0 then raise exception 'footprints revert: post-state wrong for % place(s)', v_bad; end if;
  if public.refresh_wine_place_neighbours() < 0 then raise exception 'footprints revert: neighbour refresh refused'; end if;
end
$revert$;
`;
}

/** File names for --render-sql. */
export function renderedPaths(wave, timestamp) {
  const slug = wave.replaceAll(".", "_").replaceAll("*", "rest");
  return {
    promote: `supabase/migrations/${timestamp}_footprints_${slug}_promote.sql`,
    unstage: `scripts/wine-map-sources/footprints/footprints_${slug}_unstage.sql`,
    revert: `scripts/wine-map-sources/footprints/footprints_${slug}_revert.sql`,
  };
}
