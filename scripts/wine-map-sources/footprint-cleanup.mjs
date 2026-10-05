// Footprint cleanup fp-1: the one shared tail every boundary write goes through.
//
// Builders: replace the INSERT's copied `geom as (select <raw> g)` CTE with
//     geom_raw as (select <raw> g),
//     ${cleanGeomCte({ placeId: "$11" })}            -- or { placeKey: "$15" }
// and its generation_parameters `$13::jsonb` with ${withCleanupStamp("$13")}.
// geom.g is then the cleaned footprint (byte for byte the raw input when the rule
// leaves the place alone) and geom.cleanup the stamp Migration A's trigger checks.
// A builder that stages several places in one run needs nothing more: staged fp-1
// DRAFT rows already block their neighbours (footprint-sql.mjs CONTEXT_SQL).
//
// The step needs public.wine_footprint_clean, i.e. Migration A
// (footprint-sql.mjs MIGRATION_A) applied live. Until then a builder's INSERT
// fails with "function public.wine_footprint_clean(...) does not exist"; the
// one-off runner (footprint-pass.mjs --dry) does not need it: cleanFootprint()
// runs the same SQL inline in a read-only transaction.
import {
  CONTEXT_SQL, CORE_SQL, FOOTPRINT_VERSION, PARAMS, PROTECTED_SQL, STAMP_SQL, WATER_ROWS_PARAM, WATER_TABLE, contextSql,
  independentFailuresSql, ladderReason, metricsOf, rungs, waterRowsNear,
} from "./footprint-sql.mjs";

/** The raw input every GeoJSON builder used to write: Multi(CollectionExtract(MakeValid(SetSRID(GeoJSON))). */
export function rawFromGeoJson(param) {
  return `extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(${param}), 4326)), 3))`;
}

/**
 * The `geom` CTE: geom.g (the footprint to store) and geom.cleanup (its stamp).
 * `raw` is the SQL of the raw input (default: the builder's own CTE renamed
 * geom_raw); the place is `placeId` (SQL of a uuid) or `placeKey` (SQL of a
 * canonical_key); `pending` optional SQL of a {"<uuid>": "<hex EWKB>"} jsonb.
 */
export function cleanGeomCte({ raw = "(select g from geom_raw)", placeId = null, placeKey = null, pending = null } = {}) {
  if (!placeId === !placeKey) throw new Error("cleanGeomCte: pass exactly one of placeId or placeKey");
  const id = placeId ? `(${placeId})::uuid` : `(select id from public.wine_places where canonical_key = ${placeKey})`;
  return `geom as (select c.geom g, c.cleanup from public.wine_footprint_clean(${raw}, ${id}, coalesce((${pending ?? "null"})::jsonb, '{}'::jsonb)) c)`;
}

/**
 * generation_parameters with the stamp: the builder's own jsonb || {cleanup}.
 * `cleanedPatch` (optional object) is merged in only when the step changed the
 * shape, e.g. to correct an "used unmodified" note.
 */
export function withCleanupStamp(paramsSql, { cleanedPatch = null } = {}) {
  const base = `(${paramsSql})::jsonb`;
  const patched = cleanedPatch
    ? `(case when geom.cleanup->>'status' = 'cleaned' then ${base} || '${JSON.stringify(cleanedPatch).replaceAll("'", "''")}'::jsonb else ${base} end)`
    : base;
  return `(${patched} || jsonb_build_object('cleanup', geom.cleanup))`;
}

/** The boundary_method a cleaned footprint is stored with (SQL), from the builder's own. */
export function methodAfterCleanupSql(methodSql) {
  return `(case when geom.cleanup->>'status' = 'cleaned' and (${methodSql})::text = 'MANUAL'
               then 'GENERALIZED_FROM_OFFICIAL_SOURCE' else (${methodSql})::text end)::public.wine_boundary_method`;
}

/** The same rule in JS (the one-off pass). */
export function methodAfterCleanup(method, status) {
  return status === "cleaned" && method === "MANUAL" ? "GENERALIZED_FROM_OFFICIAL_SOURCE" : method;
}

export const EINZELLAGE_CLEANED_NOTE = "A cartographic footprint of the Weinbergsrolle parcels (fp-1 cleanup).";

/** generation_parameters after a cleanup: the stamp added; an as-is Einzellage note corrected. */
export function generationAfterCleanup(generation, cleanup) {
  const out = { ...(generation ?? {}) };
  delete out.cleanup;
  if (cleanup?.status === "cleaned" && out.engine === "weinbergsrolle-asis") {
    out.generalised = true;
    out.note = EINZELLAGE_CLEANED_NOTE;
  }
  return { ...out, cleanup };
}

/** Batch order (design §5.2): deepest tier first, then ascending raw area, then key. */
export function orderBatch(rows) {
  return [...rows].sort((x, y) =>
    Number(y.tier) - Number(x.tier) || Number(x.area) - Number(y.area) || String(x.key).localeCompare(String(y.key)));
}

/**
 * Pending outputs carried through a batch: place id -> { hex, bbox }. Only a
 * cleaned output is carried (an unchanged place stands as it is stored).
 */
export function createPending() {
  const map = new Map();
  return {
    map,
    add(placeId, result) {
      if (result?.cleanup?.status === "cleaned") map.set(placeId, { hex: result.hex, bbox: result.bbox ?? null });
    },
    get(placeId) { return map.get(placeId)?.hex ?? null; },
    has(placeId) { return map.has(placeId); },
    /** The entries whose bbox meets `bbox` grown by `pad` degrees (all when either bbox is unknown). */
    near(bbox, pad = 0.01) {
      const out = {};
      for (const [id, v] of map) {
        if (!bbox || !v.bbox || bboxesMeet(bbox, v.bbox, pad)) out[id] = v.hex;
      }
      return out;
    },
    get size() { return map.size; },
  };
}

export function bboxesMeet(a, b, pad = 0) {
  return a[0] - pad <= b[2] && b[0] - pad <= a[2] && a[1] - pad <= b[3] && b[1] - pad <= a[3];
}

/** Whether Migration A's sea table exists on this database. */
export async function waterTableLive(client) {
  const { rows } = await client.query(`select to_regclass('${WATER_TABLE}') is not null live`);
  return rows[0].live === true;
}

/**
 * The context row of one write (CONTEXT_SQL): the sea from Migration A's table when it
 * exists, else (a read-only rehearsal before it) the committed pieces near the raw, the
 * very rows the migration loads.
 */
export async function readContext(client, { placeId, raw, pendingJson }) {
  if (await waterTableLive(client)) return (await client.query(CONTEXT_SQL, [placeId, raw, pendingJson])).rows[0];
  const bb = (await client.query(
    `select extensions.ST_XMin(b) x0, extensions.ST_YMin(b) y0, extensions.ST_XMax(b) x1, extensions.ST_YMax(b) y1
       from (select extensions.Box3D($1::extensions.geometry) b) z`, [raw])).rows[0];
  const water = waterRowsNear([bb.x0, bb.y0, bb.x1, bb.y1].map(Number));
  return (await client.query(contextSql({ waterRows: WATER_ROWS_PARAM }), [placeId, raw, pendingJson, JSON.stringify(water)])).rows[0];
}

/** Whether Migration A is live on this database. */
export async function footprintStepLive(client) {
  const { rows } = await client.query(
    "select to_regprocedure('public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb)') is not null live");
  return rows[0].live === true;
}

/**
 * Clean one footprint: { hex, cleanup, metrics, context, bbox }. `raw` is the raw
 * input as hex EWKB (4326); `pending` {"<uuid>": "<hex EWKB>"}. `via`: "function"
 * (Migration A's public.wine_footprint_clean), "inline" (the same SQL texts run
 * here, which a read-only transaction allows), or "auto". Both give the same
 * output_sha256; footprint-pass.mjs --stage asserts it.
 */
export async function cleanFootprint(client, { raw, placeId, pending = {}, params = PARAMS, via = "auto", inputBoundaryId = null }) {
  const pendingJson = JSON.stringify(pending ?? {});
  const useFunction = via === "function" || (via === "auto" && (await footprintStepLive(client)));
  let hex;
  let cleanup;
  let context = null;
  if (useFunction) {
    const { rows } = await client.query(
      `select encode(extensions.ST_AsEWKB(c.geom), 'hex') hex, c.cleanup
         from public.wine_footprint_clean($1::extensions.geometry, $2::uuid, $3::jsonb, $4::jsonb) c`,
      [raw, placeId, pendingJson, params === PARAMS ? null : JSON.stringify(params)]);
    ({ hex, cleanup } = rows[0]);
  } else {
    await client.query("set local search_path = public, extensions");
    const ctx = await readContext(client, { placeId, raw, pendingJson });
    if (!ctx?.k) throw new Error(`cleanFootprint: no wine_places row ${placeId}`);
    context = {
      tier: ctx.tier, key: ctx.k, partners: ctx.partner_keys, blockers: ctx.blocker_keys, parent: ctx.parent_key,
      blockersHex: ctx.blockers ?? null, parentHex: ctx.parent ?? null,
      seaHex: ctx.sea ?? null, outsideHex: ctx.outside ?? null,
    };
    let r;
    let prot = null;
    let rungName;
    let tryParams;
    let reason = null;
    for (const [name, p] of rungs(params)) {
      rungName = name;
      tryParams = p;
      prot = null;
      r = (await client.query(CORE_SQL, [raw, ctx.blockers, ctx.parent, null, JSON.stringify(p), ctx.sea, ctx.outside])).rows[0];
      if (!r.unchanged) {
        prot = (await client.query(PROTECTED_SQL, [placeId, raw, r.clean4, pendingJson])).rows[0]?.prot ?? null;
        if (prot) r = (await client.query(CORE_SQL, [raw, ctx.blockers, ctx.parent, prot, JSON.stringify(p), ctx.sea, ctx.outside])).rows[0];
      }
      reason = ladderReason(r, p);
      if (reason === null) break;
    }
    const status = reason === null ? (r.unchanged ? "unchanged" : "cleaned") : `skipped:${reason}`;
    const out = reason === null ? r.clean4 : raw;
    const meta = {
      version: FOOTPRINT_VERSION, params: tryParams, rung: reason === null ? rungName : "none", status,
      input_boundary_id: null, partners: ctx.partner_keys, parent_key: ctx.parent_key, metrics: metricsOf(r),
    };
    const s = (await client.query(STAMP_SQL, [raw, out, ctx.blockers, ctx.parent, prot, JSON.stringify(meta), ctx.sea, ctx.outside])).rows[0];
    hex = s.out_hex;
    cleanup = s.stamp;
  }
  if (inputBoundaryId) cleanup = { ...cleanup, input_boundary_id: inputBoundaryId };
  const bb = (await client.query(
    `select extensions.ST_XMin(b) x0, extensions.ST_YMin(b) y0, extensions.ST_XMax(b) x1, extensions.ST_YMax(b) y1
       from (select extensions.Box3D($1::extensions.geometry) b) z`, [hex])).rows[0];
  return { hex, cleanup, metrics: cleanup.metrics, context, bbox: [bb.x0, bb.y0, bb.x1, bb.y1].map(Number) };
}

/**
 * A builder batch's guard (review 2026-10-04, F3). A place cleaned before its
 * neighbour exists (a first import) or before its neighbour's larger re-imported
 * raw is written could otherwise close onto that raw, and the later place keeps
 * its whole raw: a same-tier overlap with clean stamps on both. So:
 *   1. createBatchGuard(): every raw of the batch is computed up front;
 *   2. pendingFor(place): the OTHER places' raws near it, passed as the
 *      cleanGeomCte `pending` jsonb: they block like standing rows (a two-pass
 *      batch; CONTEXT_SQL);
 *   3. check(place, boundaryId): after the INSERT, before the commit, the
 *      independent check (footprint-sql.mjs independentCheckSql) of the row just
 *      written against its raw, every standing shape and the batch's raws; it
 *      throws on any failure, so the caller rolls that write back.
 * `items`: [{ placeId | placeKey, geojson }]; `rawSql` is the builder's own raw
 * expression over $1 = item.geojson (default rawFromGeoJson("$1")), so the raw
 * here is byte for byte the raw its INSERT cleans.
 */
export async function createBatchGuard(client, items, { rawSql = rawFromGeoJson("$1") } = {}) {
  const raws = new Map();
  const ids = new Map();
  for (const it of items) {
    const { rows } = await client.query(
      `select coalesce($2::uuid, (select id from public.wine_places where canonical_key = $3)) id,
              encode(extensions.ST_AsEWKB(g), 'hex') hex,
              extensions.ST_XMin(extensions.Box3D(g)) x0, extensions.ST_YMin(extensions.Box3D(g)) y0,
              extensions.ST_XMax(extensions.Box3D(g)) x1, extensions.ST_YMax(extensions.Box3D(g)) y1
         from (select ${rawSql} g) z`,
      [it.geojson, it.placeId ?? null, it.placeKey ?? null]);
    const r = rows[0];
    if (r?.id && r.hex) raws.set(r.id, { hex: r.hex, bbox: [r.x0, r.y0, r.x1, r.y1].map(Number) });
    if (r?.id && it.placeKey) ids.set(it.placeKey, r.id);
  }
  const pendingFor = (placeId, pad = 0.01) => {
    const me = raws.get(placeId);
    const out = {};
    for (const [id, v] of raws) {
      if (id !== placeId && (!me || bboxesMeet(me.bbox, v.bbox, pad))) out[id] = v.hex;
    }
    return out;
  };
  return {
    size: raws.size,
    /** The place id prepared for a canonical key (null when the place does not exist). */
    idFor: (key) => ids.get(key) ?? null,
    /** {"<uuid>": "<hex>"} of the other places' raws near `placeId`'s raw. */
    pendingFor,
    /** Throws unless the row just written for `placeId` passes the independent check. */
    async check(placeId, boundaryId) {
      const me = raws.get(placeId);
      if (!me) throw new Error(`fp-1 batch guard: no raw prepared for place ${placeId}`);
      const sql = independentFailuresSql({
        waveSql: `select $1::uuid place_id, (select display_geometry from public.wine_place_boundaries where id = $2::uuid) g_new,
                         extensions.ST_GeomFromEWKB(decode($3, 'hex')) g_old`,
        pendingSql: "$4::jsonb",
      });
      await client.query("set local search_path = public, extensions");
      const { rows } = await client.query(sql, [placeId, boundaryId, me.hex, JSON.stringify(pendingFor(placeId))]);
      if (rows.length) {
        const list = rows.map((x) => `${x.kind} ${x.key}${x.other_key ? ` / ${x.other_key}` : ""} ${Number(x.m2).toFixed(1)} m²`);
        throw new Error(`fp-1 batch guard refused place ${placeId}: ${list.join("; ")}`);
      }
    },
  };
}

/**
 * For an INSERT that writes one shared geometry to several places
 * (`... where p.canonical_key in (...)`): a per-place lateral clean, exposing
 * geom.g and geom.cleanup like cleanGeomCte. Use in FROM after the place table.
 */
export function cleanGeomLateral({ raw = "(select g from geom_raw)", placeId, pending = null }) {
  return `cross join lateral public.wine_footprint_clean(${raw}, (${placeId})::uuid, coalesce((${pending ?? "null"})::jsonb, '{}'::jsonb)) geom(g, cleanup)`;
}

/** Appended to a generation_parameters jsonb expression: the stamp (same as withCleanupStamp). */
export const STAMP_SUFFIX = " || jsonb_build_object('cleanup', geom.cleanup)";

/**
 * For a plpgsql DO block that holds its geometry in a variable (the generated
 * country-outline migrations): the statement that cleans it in place and
 * captures the stamp into `stampVar` (declare it jsonb).
 */
export function cleanVariableSql({ geomVar = "v_geom", placeIdVar = "v_place_id", stampVar = "v_cleanup" } = {}) {
  return `select c.geom, c.cleanup into ${geomVar}, ${stampVar}
    from public.wine_footprint_clean(${geomVar}, ${placeIdVar}, '{}'::jsonb) c;`;
}
