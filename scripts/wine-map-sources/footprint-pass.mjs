// The one-off fp-1 footprint pass over today's shapes, worst first
// (design: scratchpad footprints/design-final.md §5.4, §6, §7).
//
//   --dry (the default) WRITES NOTHING: one read-only transaction per batch
//   (withReadOnly: BEGIN READ ONLY, always rolled back), one place per statement,
//   a pause between places, a statement timeout. Per wave, places run deepest tier
//   first, then ascending area; each changed output is carried as "pending" for the
//   places after it (and for later waves), so the dry run computes exactly what a
//   stage would. A DERIVED_FROM_DESCENDANTS parent with a changed child is
//   re-derived (derive-boundary's SQL, its own stored parameters) and then goes
//   through the step like any other write. A place whose current row is itself a
//   cleanup re-cleans from its recorded input (idempotence by provenance).
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
//   rollback files, from the approved review file. "Do not hand-edit."
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pgConfig, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { withReadOnly } from "./read-only-client.mjs";
import { refreshNeighbourCache } from "./neighbour-cache.mjs";
import { CONTEXT_SQL, DERIVE_SQL, FOOTPRINT_VERSION, MIGRATION_A_VERSION, PARAMS } from "./footprint-sql.mjs";
import {
  EINZELLAGE_CLEANED_NOTE, cleanFootprint, cleanGeomCte, createPending, footprintStepLive, methodAfterCleanupSql,
  orderBatch,
} from "./footprint-cleanup.mjs";
import {
  REVISION_SUFFIX, areaDelta, flagsOf, inScope, renderPromoteSql, renderReport, renderRevertSql, renderUnstageSql,
  renderedPaths, revealDiff, sittingGate, wavesFor,
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

/** Children a DERIVED parent is re-derived from (derive-boundary: VERIFIED children, current VALIDATED). */
function childrenOf(place, catalogue) {
  return catalogue.filter((c) => c.primary_parent_id === place.id && c.pub === "VERIFIED");
}

async function rawInput(c, place, catalogue, pending) {
  // a derived parent with a changed child: re-derived from the pending children
  if (place.method === "DERIVED_FROM_DESCENDANTS") {
    const kids = childrenOf(place, catalogue);
    if (kids.some((k) => pending.has(k.id))) {
      const hex = [];
      for (const k of kids) hex.push(pending.get(k.id) ?? (await c.query(BOUNDARY_SQL, [k.boundary_id])).rows[0].hex);
      const gp = place.gp ?? {};
      const r = (await c.query(DERIVE_SQL, [hex, Number(gp.simplify_tolerance ?? 0.002), Number(gp.closing ?? 0), Number(gp.min_part_share ?? 0)])).rows[0];
      return { hex: r.raw_hex, inputBoundaryId: place.boundary_id, rederived: true };
    }
  }
  // idempotence by provenance: a cleaned row re-cleans from its recorded input
  const prior = place.gp?.cleanup?.input_boundary_id;
  const from = prior ?? place.boundary_id;
  return { hex: (await c.query(BOUNDARY_SQL, [from])).rows[0].hex, inputBoundaryId: from, rederived: false };
}

async function dryRun() {
  const waves = wavesFor(arg("wave", "all"));
  const keys = arg("keys") ? new Set(arg("keys").split(",")) : null;
  const reviewDir = arg("review-dir", "data/wine-map/review");
  const geojsonDir = arg("geojson-dir", ".superpowers/footprints");
  const reportPath = arg("report", null);
  const batch = Number(arg("batch", "40"));
  const pauseMs = Number(arg("pause-ms", "150"));
  const timeoutMs = Number(arg("timeout-ms", "90000"));
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const survey = arg("survey") ? new Map(JSON.parse(await readFile(arg("survey"), "utf8")).places.map((p) => [p.key, p.score])) : null;
  await mkdir(geojsonDir, { recursive: true });
  await mkdir(reviewDir, { recursive: true });
  const t0 = Date.now();

  let catalogue;
  let versions;
  let via;
  await withReadOnly(async (c) => {
    catalogue = (await c.query(CATALOGUE_SQL)).rows.map((r) => ({ ...r, area: Number(r.area), bbox: [r.x0, r.y0, r.x1, r.y1].map(Number) }));
    versions = (await c.query("select extensions.postgis_lib_version() postgis, extensions.postgis_geos_version() geos")).rows[0];
    via = (await footprintStepLive(c)) ? "function" : "inline";
  }, { statementTimeoutMs: timeoutMs });
  console.log(`catalogue: ${catalogue.length} places with a current VALIDATED boundary; step via ${via}`);

  const pending = createPending();
  const done = new Set();
  const records = [];
  const perWave = new Map();
  let processed = 0;
  for (const wave of waves) {
    const list = orderBatch(catalogue.filter((p) => !done.has(p.id) && inScope(p.key, wave) && (!keys || keys.has(p.key))));
    list.forEach((p) => done.add(p.id));
    if (!list.length) continue;
    console.log(`wave ${wave}: ${list.length} places`);
    const waveRecords = [];
    perWave.set(wave, waveRecords);
    let i = 0;
    while (i < list.length && processed < limit) {
      i = await withReadOnly(async (c) => {
        await c.query("set local search_path = public, extensions");
        let j = i;
        for (; j < list.length && j < i + batch && processed < limit; j += 1) {
          const place = list[j];
          const started = Date.now();
          const rec = {
            key: place.key, place_id: place.id, tier: place.tier, kind: place.kind, wave,
            current_boundary_id: place.boundary_id, current_revision: place.revision, current_sha256: place.sha,
            method: place.method, score_before: survey?.get(place.key) ?? null,
          };
          try {
            const raw = await rawInput(c, place, catalogue, pending);
            const result = await cleanFootprint(c, {
              raw: raw.hex, placeId: place.id, pending: pending.near(place.bbox), via, inputBoundaryId: raw.inputBoundaryId,
            });
            const cu = result.cleanup;
            Object.assign(rec, {
              input_boundary_id: raw.inputBoundaryId, input_sha256: cu.input_sha256, rederived: raw.rederived,
              status: cu.status, rung: cu.rung, output_sha256: cu.output_sha256,
              changed: cu.output_sha256 !== place.sha, metrics: cu.metrics, parent: cu.context?.parent_key ?? null,
              partners: cu.context?.partners ?? [], flags: flagsOf(cu.metrics),
            });
            if (rec.changed) {
              rec.stamp = cu;
              pending.map.set(place.id, { hex: result.hex, bbox: result.bbox });
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
                const ctx = (await c.query(CONTEXT_SQL, [place.id, raw.hex, JSON.stringify(pending.near(place.bbox))])).rows[0];
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
          } catch (error) {
            Object.assign(rec, { status: `error:${error.code ?? "?"}`, error: String(error.message).slice(0, 300), changed: false });
            records.push(rec);
            waveRecords.push(rec);
            processed += 1;
            console.log(`  ERROR ${place.key}: ${rec.error}`);
            return j + 1; // the read-only transaction is aborted: the next batch starts after this place
          }
          rec.ms = Date.now() - started;
          records.push(rec);
          waveRecords.push(rec);
          processed += 1;
          if (rec.changed || rec.status !== "unchanged") {
            const m = rec.metrics;
            console.log(`  ${rec.status}/${rec.rung} ${place.key} parts ${m.parts_before}->${m.parts_after} holes ${m.holes_before}->${m.holes_after} area ${(100 * (areaDelta(m) ?? 0)).toFixed(2)}% ${rec.ms}ms`);
          }
          await sleep(pauseMs);
        }
        return j;
      }, { statementTimeoutMs: timeoutMs });
      console.log(`  ${wave}: ${i}/${list.length} (${processed} total, ${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }

  const provenance = {
    generated_at: new Date().toISOString(), version: FOOTPRINT_VERSION, params: PARAMS, via,
    postgis: versions.postgis, geos: versions.geos, waves: [...perWave.keys()], elapsed_s: Math.round((Date.now() - t0) / 1000),
  };
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
  console.log(`DONE dry: ${records.length} places, ${records.filter((r) => r.changed).length} changed, ${Math.round((Date.now() - t0) / 1000)} s; nothing written`);
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
      const raw = await rawInput(client, place, catalogue, pending);
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

if (has("stage")) await stage();
else if (has("render-sql")) await renderSql();
else await dryRun();
