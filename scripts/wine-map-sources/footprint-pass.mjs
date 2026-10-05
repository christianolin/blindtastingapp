// The one-off fp-1 footprint pass over today's shapes, worst first
// (design: scratchpad footprints/design-final.md §5.4, §6, §7).
//
//   --dry (the default) WRITES NOTHING: one read-only transaction per batch
//   (withReadOnly: BEGIN READ ONLY, always rolled back), one place per statement,
//   a pause between places, a statement timeout. Per wave, places run deepest tier
//   first, then ascending area; each changed output is carried as "pending" for the
//   places after it (and for later waves), so the dry run computes exactly what a
//   stage would. Every place, a DERIVED_FROM_DESCENDANTS parent included, is cleaned
//   from its stored current row: the pass never re-derives a parent (review
//   2026-10-04, F1/F7: a re-derived input moved Sud-Ouest by 76 km² and dropped the
//   own ground of a parent_plus_children_union premier-cru group, while every
//   stamp metric, measured against that re-derived input, read clean). So every
//   metric, the ladder, the report and the promote measure against the live row.
//   Re-deriving a parent stays derive-boundary.mjs's job, with its own review. A
//   place whose current row is itself a cleanup re-cleans from its recorded input
//   (idempotence by provenance).
//
//   --closure-from <prior review dir> --seed-geojson <prior geojson dir>: re-run
//   only the places a change can reach (after a fix to the step), in the same global
//   order, seeding every other place's prior output as pending (each seed must
//   round-trip to its recorded sha256, else it is recomputed). Starts from
//   --keys plus the prior run's re-derived parents plus every place whose cleaned
//   reach (12 m, or inside its outer rings) touches ground a neighbour's prior
//   cleanup gave up, plus (when the prior run's parameters differ: only the crumb
//   bounds may, footprint-pass-lib.mjs paramReach) every place whose crumb floor
//   moves; a seeded record then carries the new parameters in its stamp and a
//   "carried" note (its floor, hence its output and stamp, is the same under both);
//   a recomputed place whose output moved adds the same-tier
//   places after it its change can reach, and its ancestors that lost ground.
//   Writes the merged review files (prior records, recomputed ones replaced),
//   the recomputed GeoJSON (deleting a stale one), the report, and closure.json.
//   Outputs: one review JSON per wave (owner approval goes into its _provenance),
//   <geojson-dir>/<key>.geojson for every changed place (before, after, blockers,
//   parent), and a markdown report (per country, refusals, flags, reveal flips).
//
//     node scripts/wine-map-sources/footprint-pass.mjs --dry [--wave all|<scope>] [--keys k1,k2]
//          [--review-dir data/wine-map/review] [--geojson-dir .superpowers/footprints]
//          [--report <file>] [--batch 40] [--pause-ms 150] [--timeout-ms 90000] [--survey <survey.json>]
//
//   --stage --review <file>: AT A SITTING ONLY (main session, after owner approval).
//   Refuses unless the sitting gate passes (owner approval recorded, Migration A
//   live, no DRAFT boundary anywhere, no tiles release BUILDING in the last hour,
//   the previous wave promoted, every input row still current with its recorded
//   sha). Then recomputes every changed place through public.wine_footprint_clean
//   in ONE transaction, asserts each output sha equals the approved one, inserts
//   each as a DRAFT, NON-CURRENT row (revision <input>+fp1, same snapshot and
//   source refs), commits, and ends with the neighbour-cache refresh. An
//   unchanged place is never restaged.
//
//   --render-sql --review <file>: the promote migration and the unstage / revert
//   rollback files, from the approved review file. "Do not hand-edit." The
//   rollback files run through scripts/usa-map/apply-rollback.mjs.
//
//   --render-reject --review <file> --release <version>: Gate B rejected the
//   wave's draft tiles release: the rollback file that marks it FAILED, so no
//   promote.mjs (bare or by version) can ship it after the DB revert.
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pgConfig, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { withReadOnly } from "./read-only-client.mjs";
import { refreshNeighbourCache } from "./neighbour-cache.mjs";
import { FOOTPRINT_VERSION, MIGRATION_A_VERSION, PARAMS } from "./footprint-sql.mjs";
import {
  EINZELLAGE_CLEANED_NOTE, cleanFootprint, cleanGeomCte, createPending, footprintStepLive, methodAfterCleanupSql,
  orderBatch, readContext,
} from "./footprint-cleanup.mjs";
import {
  REVISION_SUFFIX, areaDelta, flagsOf, inScope, paramReach, rejectPath, renderPromoteSql, renderRejectReleaseSql, renderReport,
  renderRevertSql, renderUnstageSql, renderedPaths, revealDiff, sittingGate, wavesFor,
} from "./footprint-pass-lib.mjs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugOf = (wave) => wave.replaceAll(".", "_").replaceAll("*", "rest");

const CATALOGUE_SQL = `
select p.id, p.canonical_key key, p.display_tier tier, p.kind::text kind, p.primary_parent_id, p.min_zoom,
       p.publication_status::text pub,
       b.id boundary_id, b.revision, b.boundary_method::text method, b.generation_parameters gp,
       extensions.ST_Area(b.display_geometry::extensions.geography) area,
       extensions.ST_XMin(extensions.Box2D(b.display_geometry)) x0, extensions.ST_YMin(extensions.Box2D(b.display_geometry)) y0,
       extensions.ST_XMax(extensions.Box2D(b.display_geometry)) x1, extensions.ST_YMax(extensions.Box2D(b.display_geometry)) y1,
       encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') sha
  from public.wine_places p
  join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
 order by p.canonical_key`;

const BOUNDARY_SQL = `
select encode(extensions.ST_AsEWKB(display_geometry), 'hex') hex,
       encode(sha256(extensions.ST_AsEWKB(display_geometry)), 'hex') sha,
       extensions.ST_AsGeoJSON(display_geometry, 6) gj, extensions.ST_AsGeoJSON(label_point, 6) lp
  from public.wine_place_boundaries where id = $1`;

const AFTER_SQL = `
select extensions.ST_AsGeoJSON($1::extensions.geometry, 6) gj,
       extensions.ST_AsGeoJSON(extensions.ST_PointOnSurface($1::extensions.geometry), 6) lp`;

const CLIP_SQL = `
select case when $1::extensions.geometry is null then null else
  extensions.ST_AsGeoJSON(extensions.ST_ClipByBox2D($1::extensions.geometry,
    extensions.ST_Expand(extensions.Box2D($2::extensions.geometry),
      0.25 * greatest(extensions.ST_XMax(extensions.Box2D($2::extensions.geometry)) - extensions.ST_XMin(extensions.Box2D($2::extensions.geometry)),
                      extensions.ST_YMax(extensions.Box2D($2::extensions.geometry)) - extensions.ST_YMin(extensions.Box2D($2::extensions.geometry)), 0.002))), 6) end gj`;

/**
 * The raw input of a place: its stored current row, never a re-derivation (F1/F7);
 * a row that is itself a cleanup re-cleans from its recorded input (idempotence by
 * provenance).
 */
async function rawInput(c, place) {
  const prior = place.gp?.cleanup?.input_boundary_id;
  const from = prior ?? place.boundary_id;
  return { hex: (await c.query(BOUNDARY_SQL, [from])).rows[0].hex, inputBoundaryId: from };
}

async function loadCatalogue(timeoutMs) {
  let catalogue;
  let versions;
  let via;
  await withReadOnly(async (c) => {
    catalogue = (await c.query(CATALOGUE_SQL)).rows.map((r) => ({ ...r, area: Number(r.area), bbox: [r.x0, r.y0, r.x1, r.y1].map(Number) }));
    versions = (await c.query("select extensions.postgis_lib_version() postgis, extensions.postgis_geos_version() geos")).rows[0];
    via = (await footprintStepLive(c)) ? "function" : "inline";
  }, { statementTimeoutMs: timeoutMs });
  console.log(`catalogue: ${catalogue.length} places with a current VALIDATED boundary; step via ${via}`);
  return { catalogue, versions, via };
}

/** The global order of a run: per wave (worst first), deepest tier first, then ascending area. */
function globalOrder(catalogue, waves, keep = () => true) {
  const done = new Set();
  const out = [];
  for (const wave of waves) {
    const list = orderBatch(catalogue.filter((p) => !done.has(p.id) && inScope(p.key, wave) && keep(p)));
    list.forEach((p) => done.add(p.id));
    for (const place of list) out.push({ place, wave });
  }
  return out;
}

/** One place through the step: its record (and its GeoJSON when it changed). Throws on a database error. */
async function processPlace(c, { place, wave, pending, via, geojsonDir, survey }) {
  const started = Date.now();
  const rec = {
    key: place.key, place_id: place.id, tier: place.tier, kind: place.kind, wave,
    current_boundary_id: place.boundary_id, current_revision: place.revision, current_sha256: place.sha,
    method: place.method, score_before: survey?.get(place.key) ?? null,
  };
  const raw = await rawInput(c, place);
  const result = await cleanFootprint(c, {
    raw: raw.hex, placeId: place.id, pending: pending.near(place.bbox), via, inputBoundaryId: raw.inputBoundaryId,
  });
  const cu = result.cleanup;
  Object.assign(rec, {
    input_boundary_id: raw.inputBoundaryId, input_sha256: cu.input_sha256,
    status: cu.status, rung: cu.rung, output_sha256: cu.output_sha256,
    changed: cu.output_sha256 !== place.sha, metrics: cu.metrics, parent: cu.context?.parent_key ?? null,
    partners: cu.context?.partners ?? [], flags: flagsOf(cu.metrics),
  });
  if (rec.changed) {
    rec.stamp = cu;
    const before = (await c.query(BOUNDARY_SQL, [place.boundary_id])).rows[0];
    const after = (await c.query(AFTER_SQL, [result.hex])).rows[0];
    const row = (gj, lp) => ({
      id: place.id, canonical_key: place.key, display_tier: place.tier, kind: place.kind,
      primary_parent_id: place.primary_parent_id, min_zoom: place.min_zoom, geometry: gj, label_point: lp,
    });
    rec.reveal = revealDiff(row(before.gj, before.lp), row(after.gj, after.lp));
    let blk = result.context?.blockersHex ?? null;
    let par = result.context?.parentHex ?? null;
    if (via === "function") {
      const ctx = await readContext(c, { placeId: place.id, raw: raw.hex, pendingJson: JSON.stringify(pending.near(place.bbox)) });
      blk = ctx.blockers;
      par = ctx.parent;
    }
    const blkGj = (await c.query(CLIP_SQL, [blk, before.hex])).rows[0].gj;
    const parGj = (await c.query(CLIP_SQL, [par, before.hex])).rows[0].gj;
    const feature = (role, gj, props = {}) => (gj ? { type: "Feature", properties: { role, ...props }, geometry: JSON.parse(gj) } : null);
    const fc = {
      type: "FeatureCollection",
      properties: { key: place.key, status: cu.status, rung: cu.rung, metrics: cu.metrics, parent: rec.parent, blockers: cu.context?.blocker_keys ?? null },
      features: [
        feature("before", before.gj, { sha256: place.sha }),
        feature("after", after.gj, { sha256: cu.output_sha256 }),
        feature("blockers", blkGj),
        feature("parent", parGj, { key: rec.parent }),
      ].filter(Boolean),
    };
    await writeFile(path.join(geojsonDir, `${place.key}.geojson`), JSON.stringify(fc));
  }
  rec.ms = Date.now() - started;
  if (rec.changed || rec.status !== "unchanged") {
    const m = rec.metrics;
    console.log(`  ${rec.status}/${rec.rung} ${place.key} parts ${m.parts_before}->${m.parts_after} holes ${m.holes_before}->${m.holes_after} area ${(100 * (areaDelta(m) ?? 0)).toFixed(2)}% ${rec.ms}ms`);
  }
  return { rec, hex: rec.changed ? result.hex : null, bbox: result.bbox };
}

async function writeOutputs({ reviewDir, perWave, provenance, reportPath, records }) {
  for (const [wave, recs] of perWave) {
    const file = path.join(reviewDir, `footprints-${slugOf(wave)}.json`);
    await writeFile(file, `${JSON.stringify({
      _provenance: { ...provenance, wave, owner_approval: null, prior_promote: null,
        note: "Dry run of footprint-pass.mjs. Owner approval goes into owner_approval (who, when, what was seen); --stage refuses without it." },
      places: recs,
    }, null, 1)}\n`);
    console.log(`wrote ${file}`);
  }
  if (reportPath) {
    await writeFile(reportPath, renderReport({ provenance, records }));
    console.log(`wrote ${reportPath}`);
  }
}

function runOptions() {
  return {
    reviewDir: arg("review-dir", "data/wine-map/review"),
    geojsonDir: arg("geojson-dir", ".superpowers/footprints"),
    reportPath: arg("report", null),
    batch: Number(arg("batch", "40")),
    pauseMs: Number(arg("pause-ms", "150")),
    timeoutMs: Number(arg("timeout-ms", "90000")),
  };
}

async function dryRun() {
  const waves = wavesFor(arg("wave", "all"));
  const keys = arg("keys") ? new Set(arg("keys").split(",")) : null;
  const { reviewDir, geojsonDir, reportPath, batch, pauseMs, timeoutMs } = runOptions();
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const survey = arg("survey") ? new Map(JSON.parse(await readFile(arg("survey"), "utf8")).places.map((p) => [p.key, p.score])) : null;
  await mkdir(geojsonDir, { recursive: true });
  await mkdir(reviewDir, { recursive: true });
  const t0 = Date.now();
  const { catalogue, versions, via } = await loadCatalogue(timeoutMs);

  const pending = createPending();
  const records = [];
  const perWave = new Map();
  const order = globalOrder(catalogue, waves, (p) => !keys || keys.has(p.key));
  let i = 0;
  while (i < order.length && records.length < limit) {
    i = await withReadOnly(async (c) => {
      await c.query("set local search_path = public, extensions");
      let j = i;
      for (; j < order.length && j < i + batch && records.length < limit; j += 1) {
        const { place, wave } = order[j];
        if (!perWave.has(wave)) perWave.set(wave, []);
        try {
          const out = await processPlace(c, { place, wave, pending, via, geojsonDir, survey });
          if (out.rec.changed) pending.map.set(place.id, { hex: out.hex, bbox: out.bbox });
          records.push(out.rec);
          perWave.get(wave).push(out.rec);
        } catch (error) {
          const rec = { key: place.key, place_id: place.id, tier: place.tier, kind: place.kind, wave, current_boundary_id: place.boundary_id,
            current_revision: place.revision, current_sha256: place.sha, method: place.method,
            status: `error:${error.code ?? "?"}`, error: String(error.message).slice(0, 300), changed: false };
          records.push(rec);
          perWave.get(wave).push(rec);
          console.log(`  ERROR ${place.key}: ${rec.error}`);
          return j + 1; // the read-only transaction is aborted: the next batch starts after this place
        }
        await sleep(pauseMs);
      }
      return j;
    }, { statementTimeoutMs: timeoutMs });
    console.log(`  ${i}/${order.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }

  const provenance = {
    generated_at: new Date().toISOString(), version: FOOTPRINT_VERSION, params: PARAMS, via,
    postgis: versions.postgis, geos: versions.geos, waves: [...perWave.keys()], elapsed_s: Math.round((Date.now() - t0) / 1000),
  };
  await writeOutputs({ reviewDir, perWave, provenance, reportPath, records });
  console.log(`DONE dry: ${records.length} places, ${records.filter((r) => r.changed).length} changed, ${Math.round((Date.now() - t0) / 1000)} s; nothing written`);
}

// ---------------------------------------------------------------- closure re-run

/** Hex EWKB of a prior run's "after" (6-decimal GeoJSON on the 1e-6° grid: it round-trips byte for byte). */
const SEED_SQL = `
select encode(extensions.ST_AsEWKB(g), 'hex') hex, encode(sha256(extensions.ST_AsEWKB(g)), 'hex') sha,
       extensions.ST_XMin(extensions.Box3D(g)) x0, extensions.ST_YMin(extensions.Box3D(g)) y0,
       extensions.ST_XMax(extensions.Box3D(g)) x1, extensions.ST_YMax(extensions.Box3D(g)) y1
  from (select extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326) g) z`;

/** The region a place's output moved by: (a ∆ b) as hex, or null when empty. */
const MOVED_SQL = `
select case when extensions.ST_IsEmpty(d) then null else encode(extensions.ST_AsEWKB(d), 'hex') end hex
  from (select extensions.ST_CollectionExtract(extensions.ST_SymDifference($1::extensions.geometry, $2::extensions.geometry, ${PARAMS.grid_deg}), 3) d) z`;

/**
 * Same-tier places (no partner edge) whose cleaned reach could touch `region`:
 * within 12 m of the region (the closing radius is 10 m) or the region inside one
 * of their parts' outer rings (hole filling).
 */
const REACH_SQL = `
with l as (select $1::extensions.geometry g)
select p.canonical_key k
  from l, public.wine_place_boundaries yb join public.wine_places p on p.id = yb.wine_place_id
 where yb.is_current and yb.quality_status = 'VALIDATED' and p.display_tier = $2 and p.id <> $3::uuid
   and yb.display_geometry && extensions.ST_Expand(l.g, 0.0005)
   and not exists (select 1 from public.wine_place_relationships r
                    where r.relationship_type::text in ('DUAL_LABEL', 'OVERLAPS', 'REPLACES_WITHIN')
                      and ((r.source_place_id = p.id and r.target_place_id = $3::uuid) or (r.source_place_id = $3::uuid and r.target_place_id = p.id)))
   and (extensions.ST_DWithin(l.g::extensions.geography, yb.display_geometry::extensions.geography, 12)
        or extensions.ST_Intersects(l.g, (select extensions.ST_Collect(extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom)))
                                            from extensions.ST_Dump(yb.display_geometry) d)))`;

async function readPrior(dir) {
  const prior = new Map();
  let params = null;
  for (const name of (await readdir(dir)).filter((n) => n.startsWith("footprints-") && n.endsWith(".json"))) {
    const file = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    assert.ok(!params || JSON.stringify(params) === JSON.stringify(file._provenance.params), `${name}: the prior run's files disagree on params`);
    params = file._provenance.params;
    for (const rec of file.places) prior.set(rec.key, rec);
  }
  return { prior, params };
}

async function closureRun() {
  const priorDir = arg("closure-from");
  const seedDir = arg("seed-geojson");
  assert.ok(priorDir && seedDir, "--closure-from <prior review dir> needs --seed-geojson <prior geojson dir>");
  const { reviewDir, geojsonDir, reportPath, batch, pauseMs, timeoutMs } = runOptions();
  assert.notEqual(path.resolve(geojsonDir), path.resolve(seedDir), "write the closure's GeoJSON to a new --geojson-dir");
  await mkdir(geojsonDir, { recursive: true });
  await mkdir(reviewDir, { recursive: true });
  const t0 = Date.now();
  const { prior, params: priorParams } = await readPrior(priorDir);
  const paramsChanged = JSON.stringify(priorParams) !== JSON.stringify(PARAMS);
  const { catalogue, versions, via } = await loadCatalogue(timeoutMs);
  const order = globalOrder(catalogue, wavesFor("all"));
  const index = new Map(order.map((o, i) => [o.place.key, i]));
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const seedOf = async (key) => {
    const fc = JSON.parse(await readFile(path.join(seedDir, `${key}.geojson`), "utf8"));
    return fc.features.find((f) => f.properties.role === "after").geometry;
  };

  // the starting set
  const todo = new Set(arg("keys") ? arg("keys").split(",") : []);
  const why = new Map();
  const add = (key, reason) => {
    if (!index.has(key) || todo.has(key)) return;
    todo.add(key);
    why.set(key, reason);
  };
  for (const { place } of order) {
    const p = prior.get(place.key);
    if (!p) add(place.key, "no prior record");
    else if (p.rederived) add(place.key, "re-derived before (F1/F7)");
    else if (String(p.status).startsWith("error")) add(place.key, "prior error");
    else if (paramsChanged) {
      const r = paramReach(priorParams, PARAMS, p.metrics);
      if (r.to !== r.from) add(place.key, `crumb floor ${r.from ?? "?"} -> ${r.to ?? "?"} m²`);
    }
  }
  // F2: ground a prior output gave up now blocks every same-tier place after it that could reach it
  await withReadOnly(async (c) => {
    await c.query("set local search_path = public, extensions");
    for (const { place } of order) {
      const p = prior.get(place.key);
      if (!p?.changed || p.rederived || !(Number(p.metrics?.lost_m2) > 0)) continue;
      const after = await seedOf(place.key);
      const lost = (await c.query(
        `select case when extensions.ST_IsEmpty(d) then null else encode(extensions.ST_AsEWKB(d), 'hex') end hex
           from (select extensions.ST_CollectionExtract(extensions.ST_Difference(b.display_geometry,
                   extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($2), 4326), ${PARAMS.grid_deg}), 3) d
                   from public.wine_place_boundaries b where b.id = $1) z`, [place.boundary_id, JSON.stringify(after)])).rows[0]?.hex;
      if (!lost) continue;
      for (const { k } of (await c.query(REACH_SQL, [lost, place.tier, place.id])).rows) {
        if (index.get(k) > index.get(place.key)) add(k, `reaches ground ${place.key} gave up (F2)`);
      }
    }
  }, { statementTimeoutMs: timeoutMs });
  console.log(`closure start: ${todo.size} places`);

  // the walk
  const pending = createPending();
  const records = new Map();
  const moved = [];
  const seedFailed = [];
  let i = 0;
  while (i < order.length) {
    i = await withReadOnly(async (c) => {
      await c.query("set local search_path = public, extensions");
      let computed = 0;
      let j = i;
      for (; j < order.length && computed < batch; j += 1) {
        const { place, wave } = order[j];
        const p = prior.get(place.key);
        if (!todo.has(place.key)) {
          if (p?.changed) {
            const s = (await c.query(SEED_SQL, [JSON.stringify(await seedOf(place.key))])).rows[0];
            if (s.sha === p.output_sha256) {
              pending.map.set(place.id, { hex: s.hex, bbox: [s.x0, s.y0, s.x1, s.y1].map(Number) });
              await copyFile(path.join(seedDir, `${place.key}.geojson`), path.join(geojsonDir, `${place.key}.geojson`));
              continue;
            }
            seedFailed.push(place.key);
            add(place.key, "its prior output does not round-trip");
          } else {
            continue;
          }
        }
        computed += 1;
        let out;
        try {
          out = await processPlace(c, { place, wave, pending, via, geojsonDir, survey: null });
        } catch (error) {
          records.set(place.key, { key: place.key, place_id: place.id, wave, status: `error:${error.code ?? "?"}`,
            error: String(error.message).slice(0, 300), changed: false, current_boundary_id: place.boundary_id, current_sha256: place.sha });
          console.log(`  ERROR ${place.key}: ${String(error.message).slice(0, 200)}`);
          return j + 1;
        }
        out.rec.closure_reason = why.get(place.key) ?? "--keys";
        records.set(place.key, out.rec);
        if (out.rec.changed) pending.map.set(place.id, { hex: out.hex, bbox: out.bbox });
        else await rm(path.join(geojsonDir, `${place.key}.geojson`), { force: true });
        const priorSha = p?.output_sha256 ?? place.sha;
        if (out.rec.output_sha256 !== priorSha) {
          moved.push({ key: place.key, prior_sha256: priorSha, sha256: out.rec.output_sha256, prior_changed: !!p?.changed, changed: out.rec.changed });
          // what this place's move can reach: same-tier places after it, ancestors that lost ground
          const priorHex = p?.changed
            ? (await c.query(SEED_SQL, [JSON.stringify(await seedOf(place.key))])).rows[0].hex
            : (await c.query(BOUNDARY_SQL, [place.boundary_id])).rows[0].hex;
          const nowHex = out.hex ?? (await c.query(BOUNDARY_SQL, [place.boundary_id])).rows[0].hex;
          const region = (await c.query(MOVED_SQL, [priorHex, nowHex])).rows[0].hex;
          if (region) {
            for (const { k } of (await c.query(REACH_SQL, [region, place.tier, place.id])).rows) {
              if (index.get(k) > j) add(k, `reaches the move of ${place.key}`);
            }
          }
          for (let a = byId.get(place.primary_parent_id); a; a = byId.get(a.primary_parent_id)) {
            const pa = prior.get(a.key);
            if (!pa || Number(pa.metrics?.lost_m2) > 0) add(a.key, `ancestor of the move of ${place.key}`);
          }
        }
        await sleep(pauseMs);
      }
      return j;
    }, { statementTimeoutMs: timeoutMs });
    console.log(`  walked ${i}/${order.length}; computed ${records.size}, moved ${moved.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }

  // merged outputs: the prior records, the recomputed ones replaced, in the global order
  const perWave = new Map();
  const all = [];
  for (const { place, wave } of order) {
    let rec = records.get(place.key);
    if (!rec && prior.has(place.key)) {
      rec = prior.get(place.key);
      if (paramsChanged) {
        // not reached: its crumb floor is the same under both parameter sets (paramReach),
        // and so are its input and neighbours, so the step returns the same output and stamp
        const floor = paramReach(priorParams, PARAMS, rec.metrics);
        rec = { ...rec, carried: { from: priorDir, crumb_floor_m2: floor.to, note: "seeded: same crumb floor under both parameter sets" } };
        if (rec.stamp) rec.stamp = { ...rec.stamp, params: PARAMS };
      }
    }
    if (!rec) continue;
    if (!perWave.has(wave)) perWave.set(wave, []);
    perWave.get(wave).push(rec);
    all.push(rec);
  }
  const provenance = {
    generated_at: new Date().toISOString(), version: FOOTPRINT_VERSION, params: PARAMS, via,
    postgis: versions.postgis, geos: versions.geos, waves: [...perWave.keys()], elapsed_s: Math.round((Date.now() - t0) / 1000),
    closure: { from: priorDir, computed: records.size, moved: moved.length,
      params_changed: paramsChanged ? Object.keys(PARAMS).filter((k) => JSON.stringify(priorParams[k]) !== JSON.stringify(PARAMS[k]))
        .map((k) => ({ param: k, from: priorParams[k], to: PARAMS[k] })) : [] },
  };
  await writeOutputs({ reviewDir, perWave, provenance, reportPath, records: all });
  const closurePath = path.join(reviewDir, "closure.json");
  await writeFile(closurePath, `${JSON.stringify({ computed: [...records.keys()].map((k) => ({ key: k, reason: records.get(k).closure_reason ?? null })), moved, seed_failed: seedFailed }, null, 1)}\n`);
  console.log(`wrote ${closurePath}`);
  console.log(`DONE closure: ${records.size} recomputed, ${moved.length} moved, ${all.filter((r) => r.changed).length} changed in all; nothing written to the database`);
}

async function readGateFacts(client, review) {
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
  const changed = review.places.filter((p) => p.changed);
  const prior = review._provenance.prior_promote ?? null;
  const recorded = async (v) => (await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  let stale = 0;
  for (const p of changed) {
    const r = await one(`select count(*)::int n from public.wine_place_boundaries b
       where b.id = $1 and b.wine_place_id = $2 and b.is_current and b.quality_status = 'VALIDATED'
         and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = $3`, [p.current_boundary_id, p.place_id, p.current_sha256]);
    if (r.n !== 1) stale += 1;
  }
  return {
    ownerApproval: review._provenance.owner_approval,
    migrationVersion: MIGRATION_A_VERSION,
    migrationRecorded: await recorded(MIGRATION_A_VERSION),
    functionLive: await footprintStepLive(client),
    draftBoundaries: (await one("select count(*)::int n from public.wine_place_boundaries where quality_status = 'DRAFT'")).n,
    buildingReleases: (await one("select count(*)::int n from public.wine_map_releases where status = 'BUILDING' and created_at > now() - interval '1 hour'")).n,
    priorPromote: prior,
    priorPromoted: prior ? await recorded(prior) : true,
    staleInputs: stale,
    changed: changed.length,
  };
}

const STAGE_SQL = (asisPatch) => {
  const base = asisPatch
    ? `(case when geom.cleanup->>'status' = 'cleaned' then $5::jsonb || '${JSON.stringify({ generalised: true, note: EINZELLAGE_CLEANED_NOTE }).replaceAll("'", "''")}'::jsonb else $5::jsonb end)`
    : "$5::jsonb";
  return `
with geom_raw as (select $1::extensions.geometry g),
${cleanGeomCte({ placeId: "$2", pending: "$3" })}
insert into public.wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
select $2::uuid, b.source_snapshot_id, ${methodAfterCleanupSql("$4")}, 'DRAFT', geom.g, extensions.ST_PointOnSurface(geom.g),
       array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
             extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
       b.source_feature_refs,
       ${base} || jsonb_build_object('cleanup', geom.cleanup || jsonb_build_object('input_boundary_id', $6::text)),
       b.revision || '${REVISION_SUFFIX}', false, null
  from geom, public.wine_place_boundaries b
 where b.id = $7
returning id, generation_parameters->'cleanup'->>'output_sha256' sha, encode(extensions.ST_AsEWKB(display_geometry), 'hex') hex,
          extensions.ST_XMin(extensions.Box2D(display_geometry)) x0, extensions.ST_YMin(extensions.Box2D(display_geometry)) y0,
          extensions.ST_XMax(extensions.Box2D(display_geometry)) x1, extensions.ST_YMax(extensions.Box2D(display_geometry)) y1`;
};

async function stage() {
  const reviewPath = arg("review");
  assert.ok(reviewPath, "--stage needs --review <file>");
  const review = JSON.parse(await readFile(reviewPath, "utf8"));
  assert.equal(review._provenance.version, FOOTPRINT_VERSION, "review file of another version");
  // e.g. a review3 file (crumb cap 5,000 m²) against today's 1,000 m² parameters
  assert.deepEqual(review._provenance.params, PARAMS, "review file computed with other parameters: re-run the dry pass");
  const client = new pg.Client(pgConfig());
  client.on("notice", (n) => console.log(n.message));
  await client.connect();
  try {
    const facts = await readGateFacts(client, review);
    const refusals = sittingGate(facts);
    if (refusals.length) {
      console.log("REFUSED:\n- " + refusals.join("\n- "));
      process.exitCode = 1;
      return;
    }
    const catalogue = (await client.query(CATALOGUE_SQL)).rows.map((r) => ({ ...r, bbox: [r.x0, r.y0, r.x1, r.y1].map(Number) }));
    const byId = new Map(catalogue.map((p) => [p.id, p]));
    await client.query("begin");
    await client.query("set local statement_timeout = 600000");
    await client.query("set local search_path = public, extensions");
    const pending = createPending();
    let staged = 0;
    for (const p of review.places.filter((x) => x.changed)) {
      const place = byId.get(p.place_id);
      assert.ok(place, `${p.key}: no current row`);
      const raw = await rawInput(client, place);
      assert.equal(raw.inputBoundaryId, p.input_boundary_id, `${p.key}: input moved since the dry run`);
      const gp = { ...(place.gp ?? {}) };
      delete gp.cleanup;
      const r = (await client.query(STAGE_SQL(gp.engine === "weinbergsrolle-asis"), [
        raw.hex, p.place_id, JSON.stringify(pending.near(place.bbox)), place.method, JSON.stringify(gp), p.input_boundary_id, p.current_boundary_id,
      ])).rows[0];
      assert.equal(r.sha, p.output_sha256, `${p.key}: output ${r.sha} differs from the approved ${p.output_sha256}`);
      pending.map.set(p.place_id, { hex: r.hex, bbox: [r.x0, r.y0, r.x1, r.y1].map(Number) });
      staged += 1;
    }
    await client.query("commit");
    console.log(`STAGED ${staged} DRAFT, non-current ${REVISION_SUFFIX} rows (wave ${review._provenance.wave})`);
    const refreshed = await refreshNeighbourCache(client, { force: true });
    console.log(`neighbour cache: ${JSON.stringify(refreshed)}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function renderSql() {
  const reviewPath = arg("review");
  assert.ok(reviewPath, "--render-sql needs --review <file>");
  const review = JSON.parse(await readFile(reviewPath, "utf8"));
  assert.ok(review._provenance.owner_approval, "render only an approved review file (_provenance.owner_approval)");
  const files = renderedPaths(review._provenance.wave, arg("timestamp", releaseVersion().replace(/\D/g, "").slice(0, 14)));
  await mkdir(path.dirname(files.unstage), { recursive: true });
  await writeFile(files.promote, renderPromoteSql(review));
  await writeFile(files.unstage, renderUnstageSql(review));
  await writeFile(files.revert, renderRevertSql(review));
  console.log(`wrote\n  ${Object.values(files).join("\n  ")}`);
}

async function renderReject() {
  const reviewPath = arg("review");
  const version = arg("release");
  assert.ok(reviewPath && version, "--render-reject needs --review <file> --release <version>");
  const review = JSON.parse(await readFile(reviewPath, "utf8"));
  const file = rejectPath(review._provenance.wave, version);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, renderRejectReleaseSql(review, version));
  console.log(`wrote ${file}`);
}

if (has("stage")) await stage();
else if (has("render-sql")) await renderSql();
else if (has("render-reject")) await renderReject();
else if (arg("closure-from")) await closureRun();
else await dryRun();
