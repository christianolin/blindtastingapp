// The one-off fp-1 footprint pass: the pure half (waves, the sitting gate, the
// reveal diff, the report, the rendered promote / unstage / revert SQL).
// footprint-pass.mjs is the database half. Design: scratchpad
// footprints/design-final.md §5.4, §6, §7.
import { firstDrawnZoom, revealPlan } from "../wine-map-tiles/lib.mjs";
import { FOOTPRINT_VERSION, MIGRATION_A, MIGRATION_W, PARAMS, WATER_FILE, independentFailuresSql } from "./footprint-sql.mjs";

/**
 * What a run's code is (footprint-pass.mjs codeOf: `git status --porcelain -- <these>`):
 * the scripts, AND the sea data file (footprint-sql.mjs reads it at import, and before
 * Migration W it decides which closing pieces are wet) and the two migrations
 * (review 2026-10-05: an edited, uncommitted data file passed for a clean run).
 */
export const CODE_PATHS = Object.freeze(["scripts", WATER_FILE, MIGRATION_A, MIGRATION_W]);

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

/** The parameters a closure re-run can follow from a prior run: the crumb bounds only. */
export const CLOSURE_PARAMS = Object.freeze(["crumb_min_m2", "crumb_max_m2"]);

/**
 * What a parameter change does to one place, from its prior record (closure re-run).
 * The crumb floor is clamp(crumb_share x A, crumb_min, crumb_max), and the floor is
 * the only way those two parameters enter the step: the prior floor tells where
 * crumb_share x A sat (exactly when strictly inside the prior bounds, only "at or
 * beyond" when on a bound). Returns null when no parameter differs, else
 * { from, to }: to is the new floor, or null when the record cannot tell it (the
 * place is recomputed). The place's output can differ only when to !== from.
 * Throws when any other parameter changed: that needs a full --dry run.
 */
export function paramReach(priorParams, params, metrics) {
  const changed = Object.keys({ ...priorParams, ...params })
    .filter((k) => JSON.stringify(priorParams?.[k]) !== JSON.stringify(params[k]));
  if (!changed.length) return null;
  const other = changed.filter((k) => !CLOSURE_PARAMS.includes(k));
  if (other.length) throw new Error(`a closure re-run follows only ${CLOSURE_PARAMS.join(", ")}; ${other.join(", ")} changed: run a full --dry`);
  const from = Number(metrics?.crumb_floor_m2);
  if (metrics?.crumb_floor_m2 == null || !Number.isFinite(from)) return { from: null, to: null };
  const [lo, hi, nlo, nhi] = [priorParams.crumb_min_m2, priorParams.crumb_max_m2, params.crumb_min_m2, params.crumb_max_m2].map(Number);
  const clamp = (x) => Math.min(Math.max(x, nlo), nhi);
  let to = null;
  if (from > lo && from < hi) to = clamp(from); // crumb_share x A = from
  else if (lo < hi && from === hi) to = nhi <= hi ? clamp(hi) : null; // crumb_share x A >= hi
  else if (lo < hi && from === lo) to = nlo >= lo ? clamp(lo) : null; // crumb_share x A <= lo
  else if (nlo === nhi) to = nlo; // the new floor is one value for every place
  return { from, to };
}

/** A place that hit the statement timeout is retried once, first in a fresh transaction, with this x the timeout. */
export const SLOW_FACTOR = 4;

/**
 * Whether to retry place `j` after `error`: a statement timeout (57014), the first
 * time only. The aborted transaction rolls back; the next batch starts AT the place,
 * with SLOW_FACTOR x the timeout for that whole batch. Nothing it computed
 * reached the pending map, so the retry sees exactly what the first attempt saw.
 * (run5, 2026-10-05: United States North Coast, 80 s in run4, hit the 90 s timeout
 * once under load and became an error record in an otherwise clean full run.)
 */
export function retryOnTimeout(error, j, slow, key, timeoutMs, log = console.log) {
  if (error?.code !== "57014" || slow.has(j)) return false;
  slow.add(j);
  log(`  TIMEOUT ${key}: retrying it first in a new transaction with a ${(SLOW_FACTOR * timeoutMs) / 1000} s statement timeout`);
  return true;
}

/**
 * How far (m) a place's cleaned shape can reach beyond its raw input, outside its
 * outer rings (hole filling is the other reach): the closing dilates by gap_m / 2
 * with mitre joins, whose tip lies at most mitre_limit x the radius from the raw
 * (a longer mitre is clipped), and the closing lies inside that dilation; opening
 * arms, dropping crumbs and the constraint only remove ground. The closure
 * re-run's reach (footprint-pass.mjs REACH_SQL) uses this bound; the fixed 12 m it
 * used before is short of a mitred corner's reach.
 */
export function cleanedReachM(params = PARAMS) {
  const style = String(params.buffer_style ?? "");
  const join = /join=(\w+)/.exec(style)?.[1] ?? "round";
  const mitre = Number(/mitre_limit=([0-9.]+)/.exec(style)?.[1] ?? 5); // PostGIS's default mitre limit
  const k = join === "mitre" ? Math.max(1, mitre) : 1; // round / bevel joins stay within the radius
  return k * (Number(params.gap_m) / 2) + 1; // + 1 m slack: denoise (1 cm), the grid (~0.1 m)
}

/**
 * The code a review file was computed with: refusals for --stage. Only a review
 * whose every record was computed by the run's own commit, from a committed tree,
 * is stageable, i.e. a full --dry run. A closure re-run seeds every unreached
 * place's PRIOR record, which carries what the prior code computed: review
 * 2026-10-05 found 8 records seeded through two closure re-runs from the run
 * before cded7a3 that no longer matched (sub-m²), and --stage's per-place sha
 * assert would have refused 5 German waves mid-transaction. A closure re-run is
 * a preview.
 */
export function codeRefusals(review, { water = null } = {}) {
  const code = review?._provenance?.code;
  if (!code?.commit) return ["the review file records no code commit (_provenance.code): re-run a full --dry"];
  const r = [];
  // the sea it computed with (review 2026-10-05): the module's rows, which --stage then finds live
  if (water) {
    const got = review._provenance.water?.rows_sha256 ?? null;
    if (got !== water.rows_sha256) {
      r.push(`the run's sea rows ${got ? got.slice(0, 12) : "(not recorded)"} are not the committed ${water.file} rows ${water.rows_sha256.slice(0, 12)}: re-run a full --dry`);
    }
    // and the data file itself (LF line ends): its coverage box decides which places are refused
    const file = review._provenance.water?.file_sha256 ?? null;
    if (file !== water.file_sha256) {
      r.push(`the run's sea file ${file ? file.slice(0, 12) : "(not recorded)"} is not the committed ${water.file} ${water.file_sha256.slice(0, 12)}: re-run a full --dry`);
    }
  }
  if (code.dirty?.length) {
    r.push(`the run's code was not committed (${code.dirty.length} modified file(s), e.g. ${code.dirty[0]}): commit, then re-run a full --dry`);
  }
  if (review._provenance.closure) r.push("a closure re-run (_provenance.closure) is a preview: stage from a full --dry run");
  const part = review._provenance.partial;
  if (part?.keys || part?.limit != null) r.push("a --keys / --limit run computed without the places before it: stage from a full --dry run");
  const other = (review.places ?? []).filter((p) => p.computed_commit !== code.commit);
  if (other.length) {
    const commits = [...new Set(other.map((p) => String(p.computed_commit ?? "(none)").slice(0, 7)))];
    r.push(`${other.length} record(s) were not computed by this run's code ${code.commit.slice(0, 7)} (from ${commits.join(", ")}, e.g. ${other[0].key}): only a full --dry run is stageable`);
  }
  return r;
}

/** The owner approval as one line for a SQL comment (a string, or { text, ... }): a line break would end the comment. */
export function approvalLine(a) {
  if (!a) return "(none)";
  return String(typeof a === "string" ? a : a.text ?? JSON.stringify(a)).replace(/[\r\n\u2028\u2029]+/g, " ");
}

/** Sitting gate for --stage (built like usa-stage-lib's sittingGate). Returns the refusals. */
export function sittingGate(f) {
  const r = [];
  if (!f.ownerApproval) r.push("the review file carries no owner approval (_provenance.owner_approval)");
  if (!f.migrationRecorded) r.push(`Migration A ${f.migrationVersion} is not recorded live`);
  if (!f.waterMigrationRecorded) r.push(`Migration W ${f.waterMigrationVersion} (keep water out) is not recorded live`);
  // the live step must be this module's (review 2026-10-05): A alone runs the pre-water step
  if (!f.functionLive) r.push("public.wine_footprint_clean does not exist live");
  else r.push(...(f.stepProblems ?? ["the live step was not checked against the module (stepProblems)"]));
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
  if (provenance.water) {
    L.push(`- Sea: ${provenance.water.rows} pieces of ${provenance.water.file} (rows sha256 ${provenance.water.rows_sha256}, file sha256 ${provenance.water.file_sha256 ?? "?"}), covering ${provenance.water.coverage?.join(", ")}`);
  }
  if (provenance.code) {
    L.push(`- Code: ${provenance.code.branch ?? "?"} @ ${provenance.code.commit}${provenance.code.dirty?.length ? ` (UNCOMMITTED changes: ${provenance.code.dirty.join(", ")})` : ""}; ${provenance.closure ? "a closure re-run (seeded records keep the commit that computed them): a preview, --stage refuses it" : "a full run: every record computed by this commit"}`);
  }
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

function header(kind, review, runner = null) {
  return `-- Footprint cleanup ${FOOTPRINT_VERSION}, wave ${review._provenance.wave}: ${kind}.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: ${approvalLine(review._provenance.owner_approval)}.
${runner ? `-- Run with ${runner}\n` : ""}`;
}

/** The runner of the versionless rollback files (never the migration applier: they record no history). */
export const ROLLBACK_RUNNER = "node --env-file=.env.local scripts/usa-map/apply-rollback.mjs <this file> --check, then --dry, then with no flag";

/** Tiles runs a promote or a rollback refuses to race (the sitting gate's own window). */
export const BUILDING_WINDOW = "1 hour";

/** The wave as the independent check reads it inside a rendered DO block: new shape (current) and replaced input. */
const PROMOTED_WAVE_SQL = `select e.place_id, nb.display_geometry g_new, ob.display_geometry g_old
       from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, output_sha text)
       join public.wine_place_boundaries nb on nb.wine_place_id = e.place_id and nb.is_current
        and encode(sha256(extensions.ST_AsEWKB(nb.display_geometry)), 'hex') = e.output_sha
       join public.wine_place_boundaries ob on ob.id = e.current_boundary_id`;

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
  v_list text;
begin
  perform set_config('search_path', 'public, extensions', true);
  -- 0. never alongside a tiles run: a release built from a half-flipped wave would
  --    publish it before Gate B
  select count(*) into v_bad from public.wine_map_releases
   where status = 'BUILDING' and created_at > now() - interval '${BUILDING_WINDOW}';
  if v_bad > 0 then raise exception 'footprints promote: % tiles release(s) BUILDING in the last ${BUILDING_WINDOW}: wait, then re-run', v_bad; end if;

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

  -- 5b. the independent check (footprint-sql.mjs independentCheckSql), on the stored
  --     rows themselves, trusting no stamp: each place's new ground against the input
  --     row it replaces, on every same-tier non-partner place (old and new shapes),
  --     outside its containment parent, and descendant ground given up; > 1 m² refuses
  select count(*), string_agg(format('%s %s / %s %s m²', x.kind, x.key, coalesce(x.other_key, '-'), round(x.m2::numeric, 1)), '; ')
    into v_bad, v_list
    from (${independentFailuresSql({ waveSql: PROMOTED_WAVE_SQL }).replaceAll("\n", "\n    ")}) x;
  if v_bad > 0 then raise exception 'footprints promote: % independent check failure(s): %', v_bad, left(v_list, 3000); end if;

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
  return `${header("unstage (rollback before the promote; re-appliable)", review, ROLLBACK_RUNNER)}
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
  return `${header("revert (rollback after the promote; re-appliable)", review, ROLLBACK_RUNNER)}
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

const RELEASE_VERSION = /^\d{8}T\d{6}Z$/;

/** File name for --render-reject: the wave's slug and the release version (lowercase). */
export function rejectPath(wave, version) {
  if (!RELEASE_VERSION.test(version)) throw new Error(`not a release version: ${version}`);
  const slug = wave.replaceAll(".", "_").replaceAll("*", "rest");
  return `scripts/wine-map-sources/footprints/footprints_${slug}_reject_${version.toLowerCase()}.sql`;
}

/**
 * Gate B rejected the wave's draft tiles release (review 2026-10-04, F7): mark it
 * FAILED, so a bare promote.mjs (which picks the newest VALIDATED release) can
 * never ship it after the DB revert, and promote.mjs refuses it by version too.
 * Only a VALIDATED release is rejected; an ACTIVE one is already live (revert the
 * DB, then a NEW release from master). Re-appliable: an already FAILED one is a no-op.
 */
export function renderRejectReleaseSql(review, version) {
  if (!RELEASE_VERSION.test(version)) throw new Error(`not a release version: ${version}`);
  return `${header(`reject the Gate B draft release ${version} (re-appliable)`, review, ROLLBACK_RUNNER)}
do $reject$
declare
  v_status text;
begin
  select status::text into v_status from public.wine_map_releases where version = ${sqlStr(version)};
  if v_status is null then raise exception 'footprints reject: no release ${version}'; end if;
  if v_status = 'FAILED' then raise notice 'footprints reject: ${version} is already FAILED'; return; end if;
  if v_status <> 'VALIDATED' then
    raise exception 'footprints reject: release ${version} is %; only a VALIDATED draft is rejected (an ACTIVE one: revert the DB, then a new release from master)', v_status;
  end if;
  update public.wine_map_releases
     set status = 'FAILED',
         validation_report = validation_report || jsonb_build_object('gate_b_rejected',
           jsonb_build_object('wave', ${sqlStr(review._provenance.wave)}, 'at', now(), 'by', 'footprint-pass.mjs --render-reject'))
   where version = ${sqlStr(version)} and status = 'VALIDATED';
end
$reject$;
`;
}
