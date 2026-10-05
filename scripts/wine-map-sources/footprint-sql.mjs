// Footprint cleanup fp-1: the SQL. ONE definition of the step, used three ways:
//   1. Migration W (renderMigrationW below; the committed migration must equal it,
//      footprint-sql.test.mjs fails otherwise) installs it as
//      public.wine_footprint_clean_core (CORE_SQL as a SQL function body) and
//      public.wine_footprint_clean (plpgsql: context, ladder, stamp — it EXECUTEs
//      the very same CONTEXT_SQL / PROTECTED_SQL / STAMP_SQL texts), over Migration A
//      (MIGRATION_A: the pre-water step, the trigger and the grants, FROZEN by its
//      sha256 because track A may apply it first; review 2026-10-05). A database runs
//      this module's step only once A AND W are applied: footprint-cleanup.mjs
//      footprintStepState compares the live function bodies and sea rows with these;
//   2. every builder's INSERT calls public.wine_footprint_clean through
//      footprint-cleanup.mjs's cleanGeomCte();
//   3. before Migration W is live, footprint-cleanup.mjs's cleanFootprint() runs the
//      same texts inline (a read-only transaction cannot create a function), so the
//      dry run computes what the function will.
// Design: scratchpad footprints/design-final.md (2026-10-04). Footprints are
// cartographic, never claims of legal boundary accuracy.
//
// The rule, per place (R = the raw input):
//   prepare  -> local UTM, MakeValid, UnaryUnion, 1 mm grid
//   cluster  -> ST_ClusterDBSCAN(eps gap_m): parts farther apart are never merged
//   per cluster: close (buffer +gap/2, -gap/2, mitre, then ∪ raw: never loses raw
//     ground), keep water out (below), fill holes < clamp(hole_share·A, hole_min, hole_max), open arms
//     narrower than arm_m (kept whole when the opening would gut or split the part),
//     de-noise 1 cm; a cluster that moved < noop_share keeps every raw vertex
//     (only its small holes are dropped)
//   back to 4326 on the 1e-6° grid; every overlay from here passes gridSize
//   constrain -> S − (B − R), S ∩ (P ∪ R), S ∪ (R ∩ K)
//   crumbs   -> drop parts < clamp(crumb_share·A, crumb_min, crumb_max) (never the
//     largest, never one holding descendant ground, none if together > crumb_cap_share)
//   whole-place pass-through -> same parts and holes, moved < noop_share: R byte for byte
//   ladder (in the caller) -> full, then close-only (arm_m 0), then R unchanged.
//
// Keep water out (owner 2026-10-03, "Keep water out (Recommended)": "Never fill
// across water: gap-closing only bridges land. ... a few coastal outlines stay a
// bit more jagged"; the trigger was Porto Ercole's marina, filled between jetties
// under 20 m apart). The closing's new ground, piece by piece (each connected
// piece of close(cluster) − cluster), is "wet" when it is OPEN (not inside a hole
// of the raw: an enclosed hole is the place's own ground's lake or yard, filled as
// before) and COASTAL: within water_reach_m of the sea (Natural Earth 1:50m,
// public.wine_footprint_water: coarse, so a wide reach), or within coast_reach_m of
// the outside of the place's national outline (the shore at ~150 m, built from
// the same communes / comuni / municipios as the coastal places) while within
// coast_band_m of that sea (so a land border far from the sea, or an inland lake
// the outline leaves out, never counts). A piece that DAMS a basin (borders a
// hole the closing made, one not inside a raw hole) within coast_band_m of the
// sea is wet too: there we cannot tell a bay from a field, so the closing never
// cuts one off (the coastal recompute found Long Island, the Hamptons and San
// Francisco Bay creeks dammed 3+ km from the coarse sea). Wet pieces are left out
// of the closing, so a marina basin whose mouth the closing bridged stays open to
// the sea and is never then filled as a hole; every other piece bridges as
// before. There is no
// water data finer than this in the repo or the database (2026-10-05): inland
// lakes and rivers are land to this rule, exactly as before. Far from the sea
// (every German place) no water is in the context and the step is byte for byte
// what it was. The sea covers the band WATER_COVERAGE (|lat| <= 57, every
// longitude); a place whose box plus WATER_BOX_DEG leaves it is REFUSED
// (water_covered, review 2026-10-05): outside the sea data the rule would switch
// itself off with a stamp that reads like "no water nearby".
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const FOOTPRINT_VERSION = "fp-1";

/** The fp-1 parameters (design §3.3). Frozen: a change is a new version. */
export const PARAMS = Object.freeze({
  version: FOOTPRINT_VERSION,
  gap_m: 20,             // parts closer than this are one cluster; closing radius gap_m / 2
  arm_m: 10,             // arms narrower than this are opened away (radius arm_m / 2); 0 = the close-only rung
  arm_keep_share: 0.5,   // a part the opening would cut below this share is genuinely narrow: kept whole
  hole_min_m2: 2000,     // holes below clamp(hole_share x A, hole_min, hole_max) are filled
  hole_share: 0.001,
  hole_max_m2: 250000,
  crumb_min_m2: 1000,    // parts below clamp(crumb_share x A, crumb_min, crumb_max) are dropped
  crumb_share: 0.005,    //   (never the largest, never one holding a descendant's ground,
  crumb_max_m2: 1000,    //    none at all if together they exceed crumb_cap_share of A). Owner
                         //    2026-10-04, "Keep parcels over 0.1 ha" (5,000 m² dropped 636 real
                         //    parcels in 285 Einzellagen): with min = max the floor is 1,000 m²
                         //    for every place, so every part of 0.1 ha or more survives.
  crumb_cap_share: 0.02,
  noop_share: 0.005,     // moved < 0.5 % with the same parts and holes: the input comes back byte for byte
  buffer_style: "join=mitre mitre_limit=3",
  grid_deg: 0.000001,    // the 6-decimal grid of the stored data and of export.mjs
  denoise_m: 0.01,       // buffer noise only (vertices within 1 cm of a straight line); not a simplification
  grow_max: 0.10,        // ladder bounds: area change within [-shrink_max, +grow_max], parts never increase
  shrink_max: 0.03,
  near_m: 50,            // a same-tier place this close to the input is a blocker
  protect_min_m2: 1,     // lost raw ground below this (grid noise) never resolves protected ground
  // keep water out (owner 2026-10-03): see the header. The sea is Natural Earth 1:50m
  // (public.wine_footprint_water); against the national outlines' shores (Italy, Spain,
  // France) its p90 offset is 1.7-3.6 km (scratchpad footprints/water/report.md).
  water_reach_m: 3000,   // a closing piece this close to the 1:50m sea is coastal
  coast_reach_m: 300,    // ... or this close to the outside of the national outline (simplified 0.0015°, ~170 m) ...
  coast_band_m: 15000,   //     ... while within this of the 1:50m sea (a land border inland never counts)
});

/** The coarse sea the keep-water-out rule reads (Migration W loads it; build-footprint-water.mjs makes it). */
export const WATER_TABLE = "public.wine_footprint_water";
export const WATER_FILE = "data/wine-map/footprint-water-ne50m.json";
// The context reads the sea within this of the raw's box (≥ coast_band_m everywhere the sea covers: 0.25°
// of longitude is 15.2 km at 57°N, the edge of WATER_COVERAGE).
export const WATER_BOX_DEG = 0.25;

/** The committed sea pieces (build-footprint-water.mjs); Migration W loads them. */
const WATER_TEXT = readFileSync(new URL("../../data/wine-map/footprint-water-ne50m.json", import.meta.url), "utf8");
export const WATER_DOC = JSON.parse(WATER_TEXT);
export const WATER_ROWS = Object.freeze(WATER_DOC.rows.map((r) => Object.freeze({ ...r, bbox: ewkbBbox(r.hex) })));
/** The band the sea covers, [x0, y0, x1, y1]: a place must lie in it with WATER_BOX_DEG to spare (water_covered). */
export const WATER_COVERAGE = Object.freeze([...(WATER_DOC._provenance.coverage ?? [])]);
if (WATER_COVERAGE.length !== 4 || WATER_COVERAGE.some((v) => !Number.isFinite(v))) throw new Error(`${WATER_FILE}: no coverage box`);

/**
 * The sea rows' fingerprint: sha256 over "<id>|<aoi>|<hex EWKB>" lines in id order. The live
 * table hashes to it through WATER_ROWS_SHA256_SQL; a review records it (_provenance.water) and
 * --stage compares the three (review 2026-10-05: the data file decides which closing pieces are
 * wet, so a run, the module and the live table must agree on it).
 */
export const WATER_ROWS_SHA256 = createHash("sha256")
  .update(WATER_ROWS.map((r) => `${r.id}|${r.aoi}|${r.hex}`).join("\n")).digest("hex");
export const WATER_ROWS_SHA256_SQL = `select count(*)::int n, encode(sha256(convert_to(coalesce(string_agg(w.id::text || '|' || w.aoi || '|'
    || encode(extensions.st_asewkb(w.geom), 'hex'), E'\\n' order by w.id), ''), 'UTF8')), 'hex') sha
  from ${WATER_TABLE} w`;
/** What a run records of the sea it computed with (_provenance.water). The file hash is over LF line ends. */
export const WATER_PROVENANCE = Object.freeze({
  file: WATER_FILE,
  file_sha256: createHash("sha256").update(WATER_TEXT.replace(/\r\n/g, "\n")).digest("hex"),
  rows: WATER_ROWS.length,
  rows_sha256: WATER_ROWS_SHA256,
  coverage: WATER_COVERAGE,
});

/** The sea pieces whose box meets `bbox` ([x0, y0, x1, y1]) grown by `pad` degrees: [{ id, hex }]. */
export function waterRowsNear(bbox, pad = 0.3) {
  return WATER_ROWS.filter((r) => !bbox || (r.bbox[0] - pad <= bbox[2] && bbox[0] - pad <= r.bbox[2]
    && r.bbox[1] - pad <= bbox[3] && bbox[1] - pad <= r.bbox[3])).map((r) => ({ id: r.id, hex: r.hex }));
}

/** Whether a place with box `bbox` lies in the sea's coverage with WATER_BOX_DEG to spare (CONTEXT_SQL's water_covered). */
export function waterCovered(bbox) {
  const [x0, y0, x1, y1] = WATER_COVERAGE;
  return bbox[0] - WATER_BOX_DEG >= x0 && bbox[1] - WATER_BOX_DEG >= y0 && bbox[2] + WATER_BOX_DEG <= x1 && bbox[3] + WATER_BOX_DEG <= y1;
}

/** The box of a hex EWKB polygon or multipolygon (little-endian, with or without SRID, 2D). */
export function ewkbBbox(hex) {
  const buf = Buffer.from(hex, "hex");
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  let o = 0;
  const header = () => {
    if (buf[o] !== 1) throw new Error("ewkbBbox: big-endian EWKB");
    const type = buf.readUInt32LE(o + 1);
    if (type & 0xc0000000) throw new Error(`ewkbBbox: not 2D (${type})`);
    o += 5 + (type & 0x20000000 ? 4 : 0);
    return type & 0xff;
  };
  const polygon = () => {
    const rings = buf.readUInt32LE(o);
    o += 4;
    for (let k = 0; k < rings; k += 1) {
      const n = buf.readUInt32LE(o);
      o += 4;
      for (let j = 0; j < n; j += 1, o += 16) {
        const x = buf.readDoubleLE(o);
        const y = buf.readDoubleLE(o + 8);
        b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
      }
    }
  };
  const t = header();
  if (t === 3) polygon();
  else if (t === 6) {
    const n = buf.readUInt32LE(o);
    o += 4;
    for (let k = 0; k < n; k += 1) {
      if (header() !== 3) throw new Error("ewkbBbox: a multipolygon member is not a polygon");
      polygon();
    }
  } else throw new Error(`ewkbBbox: not a polygon or multipolygon (${t})`);
  return b;
}

/** Relationship types whose two places may overlap by law (read from the table, never inferred). */
export const PARTNER_TYPES = Object.freeze(["DUAL_LABEL", "OVERLAPS", "REPLACES_WITHIN"]);

const GRID = PARAMS.grid_deg;
const NEAR_DEG = 0.002; // bbox prefilter (>= 140 m at 50°N; the exact test is near_m on geography)

// Pending outputs: {"<place uuid>": "<hex EWKB>"}.
const PENDING_CTE = `pend as (
  select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
    from jsonb_each_text(coalesce($3::jsonb, '{}'::jsonb)) e)`;

// A boundary that stands for its place: the current VALIDATED one, and any staged
// fp-1 DRAFT (a batch in progress: blocking both states can never create an overlap
// with whichever of them ends up current).
const STANDING = (b) => `((${b}.is_current and ${b}.quality_status = 'VALIDATED')
          or (not ${b}.is_current and ${b}.quality_status = 'DRAFT'
              and ${b}.generation_parameters->'cleanup'->>'version' = '${FOOTPRINT_VERSION}'))`;

/**
 * Every shape a place stands with, near `box` (SQL of a geometry), as rows (id, g):
 * its standing rows (a staged fp-1 DRAFT is skipped when the place's pending entry
 * is that very geometry: the one-off stage carries each staged output as pending,
 * so it is not counted twice; a builder's pending raw is a different shape and
 * both stand), plus the recorded input of a current fp-1 pass
 * row (cleanup.input_boundary_id): ground a promoted wave's cleanup gave up is still
 * that place's raw ground for every later wave, exactly as the dry run saw it (the
 * input was still current there). Needs the PENDING_CTE `pend` in scope.
 */
const STANDING_SHAPES = (box) => `  select b.wine_place_id id, b.display_geometry g
    from public.wine_place_boundaries b
   where b.display_geometry && ${box}
     and ${STANDING("b")}
     and (b.is_current or not exists (select 1 from pend where pend.id = b.wine_place_id and pend.g = b.display_geometry))
  union all
  select b.wine_place_id id, i.display_geometry g
    from public.wine_place_boundaries b
    join public.wine_place_boundaries i
      on i.id = (b.generation_parameters->'cleanup'->>'input_boundary_id')::uuid
     and i.wine_place_id = b.wine_place_id and i.id <> b.id
   where i.display_geometry && ${box}
     and b.is_current and b.quality_status = 'VALIDATED'`;

/**
 * Context of one write. $1 place id (uuid), $2 raw input (geometry, 4326),
 * $3 pending jsonb. One row: tier, key, partner keys, the union of the blockers
 * (same display_tier, not this place, no DUAL_LABEL/OVERLAPS/REPLACES_WITHIN edge,
 * within near_m of the input), their keys, and the containment parent (nearest
 * ancestor along primary_parent_id whose current boundary is not
 * DERIVED_FROM_DESCENDANTS; a pending output replaces the parent's stored row).
 * A neighbour with a pending output blocks with its stored current row AND that
 * output (review 2026-10-04, F2): ground the neighbour's own cleanup gave up (an
 * opened arm, a dropped crumb) is still its raw ground, never painted onto this
 * place. Its staged fp-1 DRAFT is that same output, so it is not counted twice
 * (dry run and --stage then see the same blockers). Builders pass the raws of a
 * batch's not-yet-written places as pending the same way (createBatchGuard).
 * Keep water out: `sea`, the 1:50m sea pieces within WATER_BOX_DEG of the input
 * (clipped to that box; null inland), and `outside`, the outside of the place's
 * national outline (the COUNTRY among itself and its ancestors, stored current row)
 * within 0.01° of the input, null unless there is sea. Both are read only as gates
 * (distances), never as ground. `sea` collects its pieces in id order (its stamp hash
 * is then the same whichever way the rows were read). `water_covered`: the input's box
 * plus WATER_BOX_DEG lies inside WATER_COVERAGE; the step refuses the place otherwise.
 * `waterRows` is the SQL of the sea rows (columns id, g): the table Migration W loads,
 * or, for a read-only rehearsal before it exists, WATER_ROWS_PARAM ($4, the
 * committed pieces as a jsonb array of {id, hex}).
 */
export function contextSql({ waterRows = WATER_ROWS_TABLE } = {}) {
  return `
with recursive me as (
  select p.id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid
    from public.wine_places p where p.id = $1::uuid),
${PENDING_CTE},
partner as (
  select case when r.source_place_id = me.id then r.target_place_id else r.source_place_id end pid
    from public.wine_place_relationships r, me
   where (r.source_place_id = me.id or r.target_place_id = me.id)
     and r.relationship_type::text in (${PARTNER_TYPES.map((t) => `'${t}'`).join(", ")})),
near as (
${STANDING_SHAPES("st_expand($2::geometry, " + NEAR_DEG + ")")}
  union all
  select pend.id, pend.g from pend where pend.g && st_expand($2::geometry, ${NEAR_DEG})),
blk as (
  select q.canonical_key k, near.g
    from near join public.wine_places q on q.id = near.id, me
   where q.display_tier = me.tier and q.id <> me.id
     and q.id not in (select pid from partner)
     and st_dwithin(near.g::geography, $2::geometry::geography, ${PARAMS.near_m})),
anc as (
  select q.id, q.primary_parent_id, 1 depth from public.wine_places q, me where q.id = me.ppid
  union all
  select q.id, q.primary_parent_id, anc.depth + 1 from public.wine_places q join anc on q.id = anc.primary_parent_id
   where anc.depth < 20),
par as (
  select q.canonical_key k, coalesce(pend.g, b.display_geometry) g
    from anc join public.wine_places q on q.id = anc.id
    left join pend on pend.id = anc.id
    left join public.wine_place_boundaries b
      on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
   where (pend.id is not null or b.id is not null)
     and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
   order by anc.depth limit 1),
wat as (
  select w.id, st_clipbybox2d(w.g, st_expand($2::geometry, ${WATER_BOX_DEG})::box2d) g
    from (${waterRows}) w
   where w.g && st_expand($2::geometry, ${WATER_BOX_DEG})),
sea as (select st_collectionextract(st_collect(wat.g order by wat.id), 3) g from wat where not st_isempty(wat.g)),
cty as (
  select b.display_geometry g
    from public.wine_places q join public.wine_place_boundaries b
      on b.wine_place_id = q.id and b.is_current and b.quality_status = 'VALIDATED'
   where q.kind::text = 'COUNTRY' and (q.id = (select id from me) or q.id in (select id from anc))
   order by (q.id = (select id from me)) desc limit 1),
outs as (
  select st_collectionextract(st_difference(st_expand($2::geometry, 0.01),
           st_clipbybox2d(cty.g, st_expand($2::geometry, 0.02)::box2d)), 3) g
    from cty where exists (select 1 from sea where sea.g is not null))
select me.tier, me.k,
  coalesce((select array_agg(q.canonical_key order by q.canonical_key)
              from (select distinct pid from partner) x join public.wine_places q on q.id = x.pid), '{}'::text[]) partner_keys,
  (select st_unaryunion(st_collect(blk.g)) from blk) blockers,
  coalesce((select array_agg(distinct blk.k order by blk.k) from blk), '{}'::text[]) blocker_keys,
  (select par.k from par) parent_key,
  (select par.g from par) parent,
  (select sea.g from sea) sea,
  (select case when st_isempty(outs.g) then null else outs.g end from outs) outside,
  st_coveredby(st_expand($2::geometry, ${WATER_BOX_DEG}), st_makeenvelope(${WATER_COVERAGE.join(", ")}, 4326)) water_covered
from me`;
}

/** The sea rows: the table Migration W loads. */
const WATER_ROWS_TABLE = `select w.id, w.geom g from ${WATER_TABLE} w`;
/** The same rows passed as $4 (jsonb array of {id, hex}): a read-only rehearsal before Migration W. */
export const WATER_ROWS_PARAM = "select (x->>'id')::int id, st_geomfromewkb(decode(x->>'hex', 'hex')) g from jsonb_array_elements($4::jsonb) x";

/** The context as Migration W's wrapper runs it (the sea from the table). */
export const CONTEXT_SQL = contextSql();

/**
 * Protected ground, resolved lazily: $1 place id, $2 raw input, $3 the result,
 * $4 pending. The union of this place's descendants (current, staged or pending)
 * that touch raw ground the result lost (parts of at least protect_min_m2; smaller
 * is grid noise), or null.
 */
export const PROTECTED_SQL = `
with recursive des as (
  select q.id, 1 depth from public.wine_places q where q.primary_parent_id = $1::uuid
  union all
  select q.id, des.depth + 1 from public.wine_places q join des on q.primary_parent_id = des.id where des.depth < 20),
${PENDING_CTE.replace("$3::jsonb", "$4::jsonb")},
lost as (
  select st_collect(d.geom) g
    from st_dump(st_collectionextract(st_difference(
           st_reduceprecision($2::geometry, ${GRID}), st_reduceprecision($3::geometry, ${GRID}), ${GRID}), 3)) d
   where st_area(d.geom::geography) >= ${PARAMS.protect_min_m2}),
dg as (
  select coalesce(pend.g, b.display_geometry) g
    from des
    left join pend on pend.id = des.id
    left join public.wine_place_boundaries b on b.wine_place_id = des.id and pend.id is null and ${STANDING("b")})
select st_unaryunion(st_collect(dg.g)) prot
  from dg, lost
 where dg.g is not null and lost.g is not null and dg.g && lost.g and st_intersects(dg.g, lost.g)`;

const CORE_OUT = [
  ["clean4", "extensions.geometry"], ["unchanged", "boolean"],
  ["area_m2_before", "double precision"], ["area_m2_after", "double precision"],
  ["parts_before", "integer"], ["parts_after", "integer"],
  ["holes_before", "integer"], ["holes_after", "integer"],
  ["vertices_before", "integer"], ["vertices_after", "integer"],
  ["perimeter_m_before", "double precision"], ["perimeter_m_after", "double precision"],
  ["clusters", "integer"], ["passthrough_clusters", "integer"], ["dropped_parts", "integer"],
  ["water_pieces", "integer"], ["water_left_m2", "double precision"],
  ["hole_floor_m2", "double precision"], ["crumb_floor_m2", "double precision"],
  ["grown_m2", "double precision"], ["lost_m2", "double precision"],
  ["raw_overlap_m2", "double precision"], ["new_overlap_m2", "double precision"], ["new_overlap_sliver_m2", "double precision"],
  ["outside_parent_raw_m2", "double precision"], ["outside_parent_new_m2", "double precision"],
  ["protected_lost_m2", "double precision"], ["valid", "boolean"],
];
export const CORE_COLUMNS = Object.freeze(CORE_OUT.map(([name]) => name));

/**
 * The keys the step reads from its params ($5). A params jsonb that lacks any of them is
 * REFUSED (the cast of `d` raises 22P02 "... params lack <keys>"), never read as NULL:
 * a missing water key made every st_dwithin NULL, and bool_or ignores NULLs, so the
 * keep-water-out rule switched itself off without an error (review 2026-10-05; e.g. a
 * review3/review4 provenance's params passed to reproduce a run).
 */
export const CORE_PARAM_KEYS = Object.freeze([
  "gap_m", "arm_m", "arm_keep_share", "hole_min_m2", "hole_share", "hole_max_m2", "crumb_min_m2", "crumb_share", "crumb_max_m2",
  "crumb_cap_share", "noop_share", "buffer_style", "grid_deg", "water_reach_m", "coast_reach_m", "coast_band_m",
]);

/** The keys of CORE_PARAM_KEYS (plus the ladder's grow_max / shrink_max) `params` lacks. */
export function missingParams(params) {
  return [...CORE_PARAM_KEYS, "grow_max", "shrink_max"].filter((k) => params?.[k] === undefined || params[k] === null);
}

/**
 * The step itself. Pure: reads no table. $1 raw (4326), $2 blockers (4326 | null),
 * $3 containment parent (4326 | null), $4 protected descendant ground (4326 | null),
 * $5 params jsonb (every CORE_PARAM_KEYS key, else it raises), $6 sea (4326 | null),
 * $7 outside of the national outline (4326 | null; both from CONTEXT_SQL, gates only).
 * One row (CORE_COLUMNS). Areas in m² (local UTM; the grid-exact checks in geography m²),
 * rounded to 0.01.
 */
export const CORE_SQL = `
with prm as (
  select (case when p ?& array[${CORE_PARAM_KEYS.map((k) => `'${k}'`).join(", ")}] then p->>'gap_m'
               else 'wine_footprint_clean_core: params lack ' || array_to_string(array(
                 select k from unnest(array[${CORE_PARAM_KEYS.map((k) => `'${k}'`).join(", ")}]) k where not p ? k), ', ') end)::float8 d,
         (p->>'arm_m')::float8 e, (p->>'arm_keep_share')::float8 ks,
         (p->>'hole_min_m2')::float8 hmin, (p->>'hole_share')::float8 hsh, (p->>'hole_max_m2')::float8 hmax,
         (p->>'crumb_min_m2')::float8 cmin, (p->>'crumb_share')::float8 csh, (p->>'crumb_max_m2')::float8 cmax,
         (p->>'crumb_cap_share')::float8 ccap, (p->>'noop_share')::float8 noop, p->>'buffer_style' sty,
         (p->>'grid_deg')::float8 grid, coalesce((p->>'denoise_m')::float8, 0) dn,
         (p->>'water_reach_m')::float8 wr, (p->>'coast_reach_m')::float8 cr, (p->>'coast_band_m')::float8 cb
    from (select $5::jsonb p) z),
i0 as (select st_multi(st_collectionextract(st_makevalid($1::geometry), 3)) r4),
i as (select i0.r4, $2::geometry blk4, $3::geometry par4, $4::geometry prot4,
             (case when st_y(st_centroid(i0.r4)) >= 0 then 32600 else 32700 end)
               + least(60, greatest(1, floor((st_x(st_centroid(i0.r4)) + 180) / 6)::int + 1)) srid
        from i0),
-- keep water out: the sea and the outside of the national outline, in the local UTM (gates only)
w as (select case when $6::geometry is null then null else st_transform($6::geometry, i.srid) end sea,
             case when $6::geometry is null or $7::geometry is null then null else st_transform($7::geometry, i.srid) end outc
        from i),
g as (select st_collectionextract(st_reduceprecision(i.r4, prm.grid), 3) r4g,
             case when i.blk4 is null then null else st_collectionextract(st_reduceprecision(i.blk4, prm.grid), 3) end blk,
             case when i.par4 is null then null else st_collectionextract(st_reduceprecision(i.par4, prm.grid), 3) end par,
             case when i.prot4 is null then null else st_collectionextract(st_reduceprecision(i.prot4, prm.grid), 3) end prot
        from i, prm),
u as (select st_unaryunion(st_reduceprecision(st_transform(i.r4, i.srid), 0.001)) r from i),
a as (select st_area(r) area from u),
fl as (select least(greatest(prm.hsh * a.area, prm.hmin), prm.hmax) hfloor,
              least(greatest(prm.csh * a.area, prm.cmin), prm.cmax) cfloor from a, prm),
parts as (select (st_dump(r)).geom pg from u),
cl as (select pg, st_clusterdbscan(pg, eps := (select d from prm), minpoints := 1) over () cid from parts),
clusters as (select cid, st_unaryunion(st_collect(pg)) g from cl group by cid),
proc as (
  select c.cid, c.g raw, o.g cleaned, hr.g hraw, clo.wet_m2, clo.wet_n
    from clusters c cross join prm cross join fl cross join w
    -- close: radius gap_m/2, mitre joins, never losing raw ground
    cross join lateral (select st_union(st_buffer(st_buffer(c.g, prm.d / 2, prm.sty), -prm.d / 2, prm.sty), c.g) g) clo0
    -- keep water out (near the sea only: every lateral below is empty when the cluster is farther than
    -- coast_band_m from it). rh: the raw cluster's holes; nh: the holes the closing made (not inside a
    -- raw hole), i.e. a basin it cut off from the outside
    cross join lateral (
      select st_collect(st_makepolygon(st_interiorringn(q.geom, k))) h
        from st_dump(c.g) q, generate_series(1, st_numinteriorrings(q.geom)) k
       where w.sea is not null and st_dwithin(c.g, w.sea, prm.cb)) rh
    cross join lateral (
      select st_collect(st_makepolygon(st_interiorringn(q.geom, k))) h
        from st_dump(clo0.g) q, generate_series(1, st_numinteriorrings(q.geom)) k
       where w.sea is not null and st_dwithin(c.g, w.sea, prm.cb)
         and not coalesce(st_intersects(rh.h, st_pointonsurface(st_makepolygon(st_interiorringn(q.geom, k)))), false)) nh
    -- a piece of the closing's new ground that is open (not in a hole of the raw) and coastal, or that
    -- dams a basin (borders a hole the closing made) within coast_band_m of the sea, is left out; with no
    -- wet piece (always, far from the sea) clo0 itself
    cross join lateral (
      select case when not coalesce(bool_or(z.wet), false) then clo0.g
                  else st_collectionextract(st_difference(clo0.g, st_collect(z.pg) filter (where z.wet)), 3) end g,
             coalesce(sum(st_area(z.pg)) filter (where z.wet), 0) wet_m2, count(*) filter (where z.wet) wet_n
        from (select f.geom pg,
                     (not coalesce(st_intersects(rh.h, st_pointonsurface(f.geom)), false)
                      and (st_dwithin(f.geom, w.sea, prm.wr)
                           or (w.outc is not null and st_dwithin(f.geom, w.outc, prm.cr) and st_dwithin(f.geom, w.sea, prm.cb))
                           or (coalesce(st_dwithin(f.geom, nh.h, 0.01), false) and st_dwithin(f.geom, w.sea, prm.cb)))) wet
                from st_dump(st_collectionextract(st_difference(clo0.g, c.g), 3)) f
               where w.sea is not null and st_dwithin(c.g, w.sea, prm.cb)) z) clo
    -- the raw cluster with only its small holes filled (raw vertices kept)
    cross join lateral (
      select st_unaryunion(st_collect(case when st_numinteriorrings(q) = 0 then q else st_makepolygon(st_exteriorring(q),
        coalesce((select array_agg(st_interiorringn(q, k)) from generate_series(1, st_numinteriorrings(q)) k
                   where st_area(st_makepolygon(st_interiorringn(q, k))) >= fl.hfloor), array[]::geometry[])) end)) g
        from (select (st_dump(c.g)).geom q) z) hr
    -- fill holes under the hole floor
    cross join lateral (
      select st_unaryunion(st_collect(case when st_numinteriorrings(q) = 0 then q else st_makepolygon(st_exteriorring(q),
        coalesce((select array_agg(st_interiorringn(q, k)) from generate_series(1, st_numinteriorrings(q)) k
                   where st_area(st_makepolygon(st_interiorringn(q, k))) >= fl.hfloor), array[]::geometry[])) end)) g
        from (select (st_dump(st_collectionextract(clo.g, 3))).geom q) z) hf
    -- open arms under arm_m; a part the opening would gut or split is kept whole
    cross join lateral (
      select st_unaryunion(st_collect(case when keep then q else oq end)) g
        from (select q, oq, (prm.e <= 0 or st_isempty(oq) or st_area(oq) < prm.ks * st_area(q)
                  or (select count(*) from st_dump(oq) dd where st_area(dd.geom) >= prm.cmin) > 1) keep
                from (select q, case when prm.e > 0 then st_buffer(st_buffer(q, -prm.e / 2, prm.sty), prm.e / 2, prm.sty) else q end oq
                        from (select (st_dump(hf.g)).geom q) z) z2) z3) o),
sel as (select cid, raw, cleaned, hraw,
          (st_area(st_symdifference(hraw, cleaned)) < (select noop from prm) * st_area(raw)
           and st_numgeometries(hraw) = st_numgeometries(cleaned)) passthru
          from proc),
s_utm as (select st_unaryunion(st_collect(case when passthru then hraw else st_simplifypreservetopology(cleaned, (select dn from prm)) end)) g from sel),
-- back to 4326 on the shared grid; from here on every operation is exact against neighbours
s4 as (select st_collectionextract(st_reduceprecision(st_transform(s_utm.g, 4326), prm.grid), 3) g from s_utm, prm),
-- constrain: no new ground on a non-partner same-tier place, none outside the containment
-- parent, and never remove ground a descendant holds
c1 as (select case when g.blk is null then s4.g else st_collectionextract(st_difference(s4.g, st_collectionextract(st_difference(g.blk, g.r4g, prm.grid), 3), prm.grid), 3) end cg from s4, g, prm),
c2 as (select case when g.par is null then c1.cg else st_collectionextract(st_intersection(c1.cg, st_collectionextract(st_union(g.par, g.r4g, prm.grid), 3), prm.grid), 3) end cg from c1, g, prm),
c3 as (select case when g.prot is null then c2.cg else st_collectionextract(st_union(c2.cg, st_collectionextract(st_intersection(g.r4g, g.prot, prm.grid), 3), prm.grid), 3) end cg from c2, g, prm),
-- crumbs, after the constraint (so its slivers go too)
cparts as (select (st_dump(st_collectionextract(c3.cg, 3))).geom pg from c3),
ranked as (select pg, st_area(pg::geography) ar, row_number() over (order by st_area(pg::geography) desc) rk,
                  sum(st_area(pg::geography)) over () tot,
                  coalesce((select g.prot is not null and st_relate(pg, g.prot, 'T********') from g), false) holds
             from cparts),
cr as (select coalesce(sum(ar) filter (where ar < (select cfloor from fl) and rk > 1 and not holds), 0) dropped,
              count(*) filter (where ar < (select cfloor from fl) and rk > 1 and not holds) ndropped, max(tot) total from ranked),
kept as (select pg from ranked, cr, fl, prm
          where not (ranked.ar < fl.cfloor and ranked.rk > 1 and not ranked.holds and cr.dropped <= prm.ccap * cr.total)),
out0 as (select st_multi(st_collectionextract(st_makevalid(st_unaryunion(st_collect(pg), (select grid from prm))), 3)) g from kept),
-- whole-place pass-through: same parts, same holes, moved < noop of the area -> the input byte for byte
same as (select coalesce(st_area(st_symdifference(st_transform(i.r4, i.srid), st_transform(out0.g, i.srid))) < prm.noop * a.area
                 and st_numgeometries(i.r4) = st_numgeometries(out0.g) and st_nrings(i.r4) = st_nrings(out0.g), false) v
           from i, out0, prm, a),
fin as (select case when same.v then $1::geometry else out0.g end g from same, out0),
m as (select st_transform(i.r4, i.srid) rm, st_transform(fin.g, i.srid) fm from i, fin),
-- new ground on a non-partner, piece by piece: a piece whose mean width (2A/P) is under 0.1 m is
-- overlay noise on the 1e-6 degree grid (~0.07-0.11 m), never real ground; it is counted apart
wet as (select coalesce(sum(wet_m2), 0) m2, coalesce(sum(wet_n), 0)::int n from proc),
ov as (select st_area(d.geom::geography) a, coalesce(2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0), 0) w
         from g, fin, prm, lateral st_dump(st_collectionextract(st_intersection(st_collectionextract(st_difference(st_reduceprecision(fin.g, prm.grid), g.r4g, prm.grid), 3), g.blk, prm.grid), 3)) d
        where g.blk is not null)
select (select g from fin) clean4, (select v from same) unchanged,
  (select round(area::numeric, 2)::float8 from a) area_m2_before, (select round(st_area(fm)::numeric, 2)::float8 from m) area_m2_after,
  (select st_numgeometries(r4) from i) parts_before, (select st_numgeometries(g) from fin) parts_after,
  (select st_nrings(r4) - st_numgeometries(r4) from i) holes_before, (select st_nrings(g) - st_numgeometries(g) from fin) holes_after,
  (select st_npoints(r4) from i) vertices_before, (select st_npoints(g) from fin) vertices_after,
  (select round(st_perimeter(rm)::numeric, 2)::float8 from m) perimeter_m_before, (select round(st_perimeter(fm)::numeric, 2)::float8 from m) perimeter_m_after,
  (select count(*)::int from clusters) clusters, (select count(*)::int from sel where passthru) passthrough_clusters,
  (select ndropped::int from cr) dropped_parts,
  (select n from wet) water_pieces, (select round(m2::numeric, 2)::float8 from wet) water_left_m2,
  (select round(hfloor::numeric, 2)::float8 from fl) hole_floor_m2, (select round(cfloor::numeric, 2)::float8 from fl) crumb_floor_m2,
  (select round(st_area(st_difference(fm, rm))::numeric, 2)::float8 from m) grown_m2,
  (select round(st_area(st_difference(rm, fm))::numeric, 2)::float8 from m) lost_m2,
  (select case when g.blk is null then 0 else round(st_area(st_collectionextract(st_intersection(g.r4g, g.blk, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g) raw_overlap_m2,
  (select coalesce(round(sum(a) filter (where w >= 0.1)::numeric, 2)::float8, 0) from ov) new_overlap_m2,
  (select coalesce(round(sum(a) filter (where w < 0.1)::numeric, 2)::float8, 0) from ov) new_overlap_sliver_m2,
  (select case when g.par is null then 0 else round(st_area(st_collectionextract(st_difference(g.r4g, g.par, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g) outside_parent_raw_m2,
  (select case when g.par is null then 0 else round(st_area(st_collectionextract(st_difference(st_collectionextract(st_difference(st_reduceprecision(fin.g, (select grid from prm)), g.r4g, (select grid from prm)), 3), g.par, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g, fin) outside_parent_new_m2,
  (select case when g.prot is null then 0 else round(st_area(st_collectionextract(st_difference(st_collectionextract(st_intersection(g.r4g, g.prot, (select grid from prm)), 3), st_reduceprecision(fin.g, (select grid from prm)), (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g, fin) protected_lost_m2,
  (select st_isvalid(g) from fin) valid`;

/**
 * The stamp. $1 raw input, $2 output, $3 blockers, $4 parent, $5 protected,
 * $6 meta jsonb {version, params, rung, status, partners, parent_key, metrics},
 * $7 sea, $8 outside of the national outline (the keep-water-out gates).
 * Every hash is encode(sha256(ST_AsEWKB(·)),'hex'). Returns stamp + out_hex.
 */
export const STAMP_SQL = `
select jsonb_build_object(
  'version', $6::jsonb->>'version',
  'params', $6::jsonb->'params',
  'rung', $6::jsonb->>'rung',
  'status', $6::jsonb->>'status',
  'input_sha256', encode(sha256(st_asewkb($1::geometry)), 'hex'),
  'input_boundary_id', $6::jsonb->'input_boundary_id',
  'context', jsonb_build_object(
    'partners', $6::jsonb->'partners',
    'blockers_sha256', case when $3::geometry is null then null else encode(sha256(st_asewkb($3::geometry)), 'hex') end,
    'parent_key', $6::jsonb->'parent_key',
    'parent_sha256', case when $4::geometry is null then null else encode(sha256(st_asewkb($4::geometry)), 'hex') end,
    'protected_sha256', case when $5::geometry is null then null else encode(sha256(st_asewkb($5::geometry)), 'hex') end,
    'sea_sha256', case when $7::geometry is null then null else encode(sha256(st_asewkb($7::geometry)), 'hex') end,
    'outside_sha256', case when $8::geometry is null then null else encode(sha256(st_asewkb($8::geometry)), 'hex') end),
  'output_sha256', encode(sha256(st_asewkb($2::geometry)), 'hex'),
  'metrics', $6::jsonb->'metrics',
  'postgis', postgis_lib_version(),
  'geos', postgis_geos_version()) stamp,
  encode(st_asewkb($2::geometry), 'hex') out_hex`;

/** Real ground of a polygonal geometry SQL `x`, in m²: pieces at least 0.1 m wide (2A/P), as CORE_SQL's ov. */
const REAL_M2 = (x) => `(select coalesce(sum(st_area(d.geom::geography)) filter (
    where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
   from st_dump(st_collectionextract(${x}, 3)) d)`;

/**
 * The independent check (review 2026-10-04, F1/F3): measured on the shapes
 * themselves, trusting no stamp and no re-derived input. `waveSql` yields rows
 * (place_id uuid, g_new geometry, g_old geometry): each written place's new shape
 * and the shape it replaces (the promote: the staged row and the current input
 * row; a builder: the row it just wrote and its raw input). `pendingSql` (SQL of
 * a {"<uuid>": "<hex EWKB>"} jsonb) adds shapes that stand for not-yet-written
 * places (a builder batch's raws). Every other place stands with STANDING_SHAPES.
 * One row per failure (kind, key, other_key, m2), only above 1 m² of real ground:
 *   new_ground_on_neighbour: a place's new ground (g_new − g_old) on any shape of a
 *     same-tier place without a DUAL_LABEL/OVERLAPS/REPLACES_WITHIN edge, its old
 *     shape included (catches both a new overlap and painting a neighbour's
 *     given-up raw parcels);
 *   outside_parent: new ground outside the containment parent (nearest ancestor
 *     whose current boundary is not DERIVED_FROM_DESCENDANTS; its new shape when
 *     it is written too);
 *   descendant_ground_lost: ground a place gave up (g_old − g_new) that one of its
 *     descendants still holds.
 */
export function independentCheckSql({ waveSql, pendingSql = "'{}'::jsonb" }) {
  const G = GRID;
  const partners = PARTNER_TYPES.map((t) => `'${t}'`).join(", ");
  return `
with recursive
pend as (
  select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
    from jsonb_each_text(coalesce((${pendingSql})::jsonb, '{}'::jsonb)) e),
w as (${waveSql}),
wp as (
  select w.place_id id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid, w.g_new,
         st_collectionextract(st_difference(st_reduceprecision(w.g_new, ${G}), st_reduceprecision(w.g_old, ${G}), ${G}), 3) grown,
         st_collectionextract(st_difference(st_reduceprecision(w.g_old, ${G}), st_reduceprecision(w.g_new, ${G}), ${G}), 3) lost
    from w join public.wine_places p on p.id = w.place_id),
nb as (
  select a.id aid, o.id bid, st_unaryunion(st_collect(st_reduceprecision(o.g, ${G}))) g
    from wp a
    cross join lateral (
${STANDING_SHAPES("a.grown").replaceAll("\n", "\n    ")}
      union all select w2.place_id, w2.g_new from w w2 where w2.g_new && a.grown
      union all select w2.place_id, w2.g_old from w w2 where w2.g_old && a.grown
      union all select pend.id, pend.g from pend where pend.g && a.grown) o
    join public.wine_places q on q.id = o.id
   where not st_isempty(a.grown) and o.id <> a.id and q.display_tier = a.tier
     and not exists (select 1 from public.wine_place_relationships r
                      where r.relationship_type::text in (${partners})
                        and ((r.source_place_id = a.id and r.target_place_id = o.id)
                          or (r.source_place_id = o.id and r.target_place_id = a.id)))
   group by a.id, o.id),
anc as (
  select a.id aid, q.id, q.primary_parent_id ppid, 1 depth from wp a join public.wine_places q on q.id = a.ppid
  union all
  select anc.aid, q.id, q.primary_parent_id, anc.depth + 1 from anc join public.wine_places q on q.id = anc.ppid
   where anc.depth < 20),
par as (
  select distinct on (anc.aid) anc.aid, q.canonical_key k, coalesce(w.g_new, pend.g, b.display_geometry) g
    from anc join public.wine_places q on q.id = anc.id
    left join w on w.place_id = anc.id
    left join pend on pend.id = anc.id
    left join public.wine_place_boundaries b
      on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
   where (w.place_id is not null or pend.id is not null or b.id is not null)
     and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
   order by anc.aid, anc.depth),
des as (
  select a.id pid, q.id, 1 depth from wp a join public.wine_places q on q.primary_parent_id = a.id
   where not st_isempty(a.lost)
  union all
  select des.pid, q.id, des.depth + 1 from des join public.wine_places q on q.primary_parent_id = des.id
   where des.depth < 20),
dg as (
  select des.pid, st_unaryunion(st_collect(st_reduceprecision(x.g, ${G}))) g
    from des join wp a on a.id = des.pid
    cross join lateral (
      select w.g_new g from w where w.place_id = des.id
      union all
      select b.display_geometry from public.wine_place_boundaries b
       where b.wine_place_id = des.id and not exists (select 1 from w where w.place_id = des.id)
         and ${STANDING("b")}) x
   where x.g && a.lost
   group by des.pid)
select 'new_ground_on_neighbour' kind, a.k key, q.canonical_key other_key,
       ${REAL_M2(`st_intersection(a.grown, nb.g, ${G})`)} m2
  from nb join wp a on a.id = nb.aid join public.wine_places q on q.id = nb.bid
union all
select 'outside_parent', a.k, par.k, ${REAL_M2(`st_difference(a.grown, st_reduceprecision(par.g, ${G}), ${G})`)}
  from wp a join par on par.aid = a.id
 where not st_isempty(a.grown)
union all
select 'descendant_ground_lost', a.k, null, ${REAL_M2(`st_intersection(a.lost, dg.g, ${G})`)}
  from wp a join dg on dg.pid = a.id`;
}

/** The independent check, failures only (> 1 m² of real ground), ordered. */
export function independentFailuresSql(opts) {
  return `select * from (${independentCheckSql(opts)}) x where x.m2 > 1 order by x.kind, x.key, x.other_key`;
}

/** The ladder (design §3.2 step 8): null when the attempt is acceptable, else the reason. */
export function ladderReason(r, params = PARAMS) {
  if (!r || r.valid !== true) return "invalid";
  const before = Number(r.area_m2_before);
  const after = Number(r.area_m2_after);
  if (!(before > 0)) return "invalid";
  const delta = (after - before) / before;
  if (delta > params.grow_max) return "grow";
  if (delta < -params.shrink_max) return "shrink";
  if (Number(r.parts_after) > Number(r.parts_before)) return "parts";
  return null;
}

/** The rungs, in order: [name, params]. */
export function rungs(params = PARAMS) {
  return [["full", params], ["close-only", { ...params, arm_m: 0 }]];
}

/** A core row as stamp metrics: every column but the geometry, as JSON scalars. */
export function metricsOf(r) {
  const out = {};
  for (const name of CORE_COLUMNS) {
    if (name === "clean4") continue;
    const v = r[name];
    out[name] = v === null || v === undefined || typeof v === "boolean" ? (v ?? null) : Number(v);
  }
  return out;
}

const dq = (tag, body) => {
  if (body.includes(`$${tag}$`)) throw new Error(`body contains its own quote tag $${tag}$`);
  return `$${tag}$${body}$${tag}$`;
};

/** How the wrapper calls the step: the installed SQL function (Migration W). */
const CORE_CALL_FUNCTION = (prot) => `select * into v_r from public.wine_footprint_clean_core(p_raw, v_ctx.blockers, v_ctx.parent, ${prot}, v_try, v_ctx.sea, v_ctx.outside);`;
/** The same step run as its own text (the read-only rehearsal; no function exists yet). */
const CORE_CALL_EXECUTE = (prot) => `execute ${dq("core", CORE_SQL)} into v_r using p_raw, v_ctx.blockers, v_ctx.parent, ${prot}::extensions.geometry, v_try, v_ctx.sea, v_ctx.outside;`;

/**
 * public.wine_footprint_clean's plpgsql body (declare ... end). `core` renders the
 * call of the step; the migration and the read-only rehearsal (renderWrapperRehearsal)
 * share every other byte.
 */
function wrapperBody(core, ctx = { sql: CONTEXT_SQL, using: "p_place_id, p_raw, v_pending" }) {
  const P = JSON.stringify(PARAMS);
  return `declare
  v_params jsonb := coalesce(p_params, ${dq("p", P)}::jsonb);
  v_pending jsonb := coalesce(p_pending, '{}'::jsonb);
  v_ctx record;
  v_r record;
  v_prot extensions.geometry;
  v_try jsonb;
  v_rung text;
  v_reason text;
  v_status text;
  v_out extensions.geometry;
  v_before numeric;
  v_delta numeric;
  v_stamp jsonb;
begin
  if p_raw is null then
    raise exception 'wine_footprint_clean: no geometry for place %', p_place_id using errcode = '22004';
  end if;
  if not (v_params ?& array[${[...CORE_PARAM_KEYS, "grow_max", "shrink_max"].map((k) => `'${k}'`).join(", ")}]) then
    raise exception 'wine_footprint_clean: p_params lacks a key of %', v_params using errcode = '22023';
  end if;
  execute ${dq("ctx", ctx.sql)} into v_ctx using ${ctx.using};
  if v_ctx.k is null then
    raise exception 'wine_footprint_clean: no wine_places row %', p_place_id using errcode = '23503';
  end if;
  if v_ctx.water_covered is not true then
    raise exception 'wine_footprint_clean: place % (%) is outside the sea data (${WATER_COVERAGE.join(", ")} less ${WATER_BOX_DEG} deg): extend build-footprint-water.mjs and Migration W first',
      v_ctx.k, p_place_id using errcode = '22023';
  end if;
  foreach v_rung in array array['full', 'close-only'] loop
    v_try := case when v_rung = 'full' then v_params else v_params || '{"arm_m": 0}'::jsonb end;
    v_prot := null;
    ${core("null")}
    if not v_r.unchanged then
      execute ${dq("prot", PROTECTED_SQL)} into v_prot using p_place_id, p_raw, v_r.clean4, v_pending;
      if v_prot is not null then
        ${core("v_prot")}
      end if;
    end if;
    -- the ladder (footprint-sql.mjs ladderReason)
    v_before := v_r.area_m2_before;
    if v_r.valid is not true or v_before is null or v_before <= 0 then v_reason := 'invalid';
    else
      v_delta := (v_r.area_m2_after - v_before) / v_before;
      if v_delta > (v_try->>'grow_max')::numeric then v_reason := 'grow';
      elsif v_delta < -(v_try->>'shrink_max')::numeric then v_reason := 'shrink';
      elsif v_r.parts_after > v_r.parts_before then v_reason := 'parts';
      else v_reason := null;
      end if;
    end if;
    exit when v_reason is null;
  end loop;
  if v_reason is null then
    v_out := v_r.clean4;
    v_status := case when v_r.unchanged then 'unchanged' else 'cleaned' end;
  else
    v_out := p_raw;
    v_rung := 'none';
    v_status := 'skipped:' || v_reason;
  end if;
  execute ${dq("stamp", STAMP_SQL)} into v_stamp
    using p_raw, v_out, v_ctx.blockers, v_ctx.parent, v_prot,
          jsonb_build_object('version', '${FOOTPRINT_VERSION}', 'params', v_try, 'rung', v_rung, 'status', v_status,
                             'input_boundary_id', null, 'partners', to_jsonb(v_ctx.partner_keys),
                             'parent_key', v_ctx.parent_key, 'metrics', to_jsonb(v_r) - 'clean4'),
          v_ctx.sea, v_ctx.outside;
  return query select v_out, v_stamp;
end`;
}

/**
 * The live function sources (pg_proc.prosrc) Migration W installs: the core is CORE_SQL
 * verbatim, the wrapper its rendered body between the newlines of `as $fn$ ... $fn$`.
 * footprint-cleanup.mjs footprintStepState compares the live prosrc with these
 * (line ends aside), so a database still on Migration A's pre-water step is never
 * taken for this one.
 */
export const STEP_SOURCES = Object.freeze({ core: CORE_SQL, wrapper: `\n${wrapperBody(CORE_CALL_FUNCTION)}\n` });

/** The require-cleanup trigger's plpgsql body (begin ... end), on the row variable `row`. */
function triggerBody(row) {
  return `begin
  if coalesce(${row}.generation_parameters->'cleanup'->>'version', '') <> '${FOOTPRINT_VERSION}'
     or ${row}.display_geometry is null
     or coalesce(${row}.generation_parameters->'cleanup'->>'output_sha256', '')
        <> encode(sha256(st_asewkb(${row}.display_geometry)), 'hex') then
    raise exception 'wine_place_boundaries: display_geometry must come from public.wine_footprint_clean (${FOOTPRINT_VERSION})'
      using errcode = '23514',
            hint = 'Build the INSERT with cleanGeomCte() and withCleanupStamp() from scripts/wine-map-sources/footprint-cleanup.mjs (or footprint-pass.mjs for the one-off pass); generation_parameters.cleanup.output_sha256 must equal sha256(ST_AsEWKB(display_geometry)).';
  end if;
  return new;
end`;
}

/**
 * The wrapper run as a DO block in a READ-ONLY transaction (review 2026-10-04, F4):
 * every byte of public.wine_footprint_clean's body except the call of the step
 * (EXECUTEd as CORE_SQL instead of the not-yet-installed function), with its
 * arguments as literals. Raises NOTICE 'fp1-rehearsal <json>' with
 * {out_hex, cleanup}. $1-free: run it as a plain statement. The sea comes from the
 * committed pieces (`water`: [{id, hex}], default the pieces near the raw, or every
 * piece when its box cannot be read), passed as the table Migration W loads would
 * give it (the context filters them by box again).
 */
export function renderWrapperRehearsal({ rawHex, placeId, pending = {}, params = null, water = null }) {
  const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
  let near = null;
  try { near = waterRowsNear(ewkbBbox(rawHex)); } catch { near = waterRowsNear(null); }
  const args = [
    `  p_raw extensions.geometry := ${lit(rawHex)}::extensions.geometry;`,
    `  p_place_id uuid := ${lit(placeId)}::uuid;`,
    `  p_pending jsonb := ${lit(JSON.stringify(pending))}::jsonb;`,
    `  p_params jsonb := ${params ? `${lit(JSON.stringify(params))}::jsonb` : "null"};`,
    `  p_water jsonb := ${lit(JSON.stringify(water ?? near))}::jsonb;`,
  ].join("\n");
  const body = wrapperBody(CORE_CALL_EXECUTE, { sql: contextSql({ waterRows: WATER_ROWS_PARAM }), using: "p_place_id, p_raw, v_pending, p_water" })
    .replace(/^declare\n/, `declare\n${args}\n`)
    .replace(/\nbegin\n/, "\nbegin\n  perform set_config('search_path', 'public, extensions', true);\n")
    .replace("  return query select v_out, v_stamp;",
      "  raise notice 'fp1-rehearsal %', jsonb_build_object('out_hex', encode(st_asewkb(v_out), 'hex'), 'cleanup', v_stamp);");
  if (!body.includes("fp1-rehearsal") || !body.includes("p_place_id uuid :=")) {
    throw new Error("renderWrapperRehearsal: the wrapper's shape moved");
  }
  return `do ${dq("rehearse", `\n${body}\n`)};`;
}

/**
 * The trigger body run as a DO block on a literal row (geometry hex + generation
 * parameters jsonb): raises 23514 exactly when the trigger would refuse it.
 */
export function renderTriggerRehearsal({ geomHex, generationParameters }) {
  const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const row = `  select ${lit(geomHex)}::extensions.geometry display_geometry, ${lit(JSON.stringify(generationParameters))}::jsonb generation_parameters into v_new;`;
  const body = triggerBody("v_new")
    .replace("  return new;\n", "")
    .replace(/^begin\n/, `begin\n  perform set_config('search_path', 'public, extensions', true);\n${row}\n`);
  return `do ${dq("rehearse", `\ndeclare\n  v_new record;\n${body}\n`)};`;
}

/**
 * Migration A (design §5.1), FROZEN: the pre-water step (5-argument core, the
 * wrapper without a sea), the require-cleanup trigger and the grants, exactly as
 * 851c21c rendered it and as track A (map-footprints) applies it. Never re-rendered:
 * a version already recorded live is never re-run, so an edit of A in place would
 * never reach a database that applied it first (review 2026-10-05). Its sha256 (line
 * ends aside) is pinned; every later change of the step is a new migration (W).
 */
export const MIGRATION_A = "supabase/migrations/20261004090000_wine_footprint_clean.sql";
export const MIGRATION_A_VERSION = "20261004090000";
export const MIGRATION_A_SHA256 = "4be37028c383168fb05704b930c38637a440887829c0dc44b8317a31bb481cb8";

/** Migration W: the sea, the 7-argument core and the water wrapper (renderMigrationW). Applied after A. */
export const MIGRATION_W = "supabase/migrations/20261005122000_wine_footprint_water.sql";
export const MIGRATION_W_VERSION = "20261005122000";

const CORE_SIG = "public.wine_footprint_clean_core(extensions.geometry, extensions.geometry, extensions.geometry, extensions.geometry, jsonb, extensions.geometry, extensions.geometry)";
const CORE_SIG_A = "public.wine_footprint_clean_core(extensions.geometry, extensions.geometry, extensions.geometry, extensions.geometry, jsonb)";
const WRAPPER_SIG = "public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb)";
export const STEP_SIGNATURES = Object.freeze({ core: CORE_SIG, coreA: CORE_SIG_A, wrapper: WRAPPER_SIG });

/** md5 of a function source with its line ends normalised (a CRLF checkout applies \r\n bodies). */
export const md5Lf = (s) => createHash("md5").update(String(s).replace(/\r\n/g, "\n")).digest("hex");

/**
 * Migration W (keep water out, owner 2026-10-03; review 2026-10-05): applied AFTER
 * Migration A, never instead of it. Creates and loads the owner-only sea table,
 * installs the 7-argument core, replaces the wrapper (same 4-argument signature:
 * every builder's call is unchanged) and drops A's 5-argument core. The trigger and
 * its grants stay A's. Changes no existing data. Rendered from this module;
 * footprint-sql.test.mjs fails if the committed migration drifts from it.
 */
export function renderMigrationW() {
  const coreOut = CORE_OUT.map(([n, t]) => `${n} ${t}`).join(", ");
  const partnerList = PARTNER_TYPES.join(", ");
  return `-- Footprint cleanup fp-1, keep water out (Migration W). RENDERED by
-- scripts/wine-map-sources/footprint-sql.mjs renderMigrationW() — do not hand-edit;
-- footprint-sql.test.mjs fails if this file and the module drift apart.
--
-- Applied AFTER Migration A (${MIGRATION_A_VERSION}: the pre-water step, the
-- require-cleanup trigger and its grants), never instead of it. Owner 2026-10-03,
-- "Keep water out (Recommended)": "Never fill across water: gap-closing only
-- bridges land." Changes no existing data. Installs:
--   ${WATER_TABLE} (new, owner-only): the coarse sea the keep-water-out rule
--     reads, ${WATER_ROWS.length} pieces from ${WATER_FILE}
--     (Natural Earth 1:50m, lakes are land; build-footprint-water.mjs), covering
--     ${WATER_COVERAGE.join(", ")} (lon/lat); rows sha256 ${WATER_ROWS_SHA256};
--   public.wine_footprint_clean_core(raw, blockers, parent, protected, params, sea, outside)
--     the step itself (pure, STABLE, reads no table; refuses params missing a key);
--     A's 5-argument core is dropped;
--   public.wine_footprint_clean(p_raw, p_place_id, p_pending, p_params), replaced
--     (same signature): resolves the context (same-tier blockers without a
--     ${partnerList} edge, the containment parent, the sea and the outside of the
--     national outline, lazily the protected descendant ground), REFUSES a place
--     outside the sea's coverage, runs the ladder (full -> close-only -> unchanged)
--     and returns (geom, cleanup stamp).
-- EXECUTE on both functions is the owner's alone: revoked from PUBLIC, anon,
-- authenticated AND service_role (Supabase's default privileges would otherwise
-- grant a new function to service_role; the trap refresh_wine_place_neighbours
-- and transfer_tasting_host document).
-- footprint-cleanup.mjs footprintStepState checks the live function sources and sea
-- rows against the module before any --stage (md5 ${md5Lf(STEP_SOURCES.wrapper)} wrapper,
-- ${md5Lf(STEP_SOURCES.core)} core).

do $pre$
begin
  if to_regprocedure('public.wine_place_boundaries_require_cleanup()') is null
     or to_regprocedure('${WRAPPER_SIG}') is null then
    raise exception 'Migration W needs Migration A (${MIGRATION_A_VERSION}) applied first';
  end if;
end
$pre$;

create table if not exists ${WATER_TABLE} (
  id integer primary key,
  aoi text not null,
  geom extensions.geometry(Polygon, 4326) not null
);
create index if not exists wine_footprint_water_geom_idx on ${WATER_TABLE} using gist (geom);
alter table ${WATER_TABLE} enable row level security;
revoke all on table ${WATER_TABLE} from public, anon, authenticated, service_role;
comment on table ${WATER_TABLE} is 'Sea (lakes are land), Natural Earth 1:50m admin_0_countries_lakes, ne_commit ${WATER_DOC._provenance.ne_commit}, covering ${WATER_COVERAGE.join(", ")}: the gate of wine_footprint_clean''s keep-water-out rule (owner 2026-10-03). Loaded by Migration W from ${WATER_FILE}.';
${WATER_ROWS.map((r) => `insert into ${WATER_TABLE} (id, aoi, geom) values (${r.id}, '${r.aoi}', '${r.hex}'::extensions.geometry) on conflict (id) do update set aoi = excluded.aoi, geom = excluded.geom;`).join("\n")}

create or replace function ${CORE_SIG.replace(/\(.*$/, "")}(
  p_raw extensions.geometry, p_blockers extensions.geometry, p_parent extensions.geometry,
  p_protected extensions.geometry, p_params jsonb, p_sea extensions.geometry, p_outside extensions.geometry)
returns table (${coreOut})
language sql stable
set search_path = public, extensions
as ${dq("core", STEP_SOURCES.core)};

create or replace function public.wine_footprint_clean(
  p_raw extensions.geometry, p_place_id uuid, p_pending jsonb default '{}'::jsonb, p_params jsonb default null)
returns table (geom extensions.geometry, cleanup jsonb)
language plpgsql stable security invoker
set search_path = public, extensions
as $fn$${STEP_SOURCES.wrapper}$fn$;

drop function if exists ${CORE_SIG_A};

revoke all on function ${CORE_SIG} from public, anon, authenticated, service_role;
revoke all on function ${WRAPPER_SIG} from public, anon, authenticated, service_role;

do $check$
begin
  if (select count(*) from ${WATER_TABLE}) <> ${WATER_ROWS.length} or (select max(id) from ${WATER_TABLE}) <> ${WATER_ROWS.length}
     or exists (select 1 from ${WATER_TABLE} where not extensions.st_isvalid(geom)) then
    raise exception 'wine_footprint_water does not hold the ${WATER_ROWS.length} valid pieces of ${WATER_FILE}';
  end if;
  if (${WATER_ROWS_SHA256_SQL.replace(/^select count\(\*\)::int n, /, "select ").replace(/\n/g, "\n      ")}) <> '${WATER_ROWS_SHA256}' then
    raise exception 'wine_footprint_water rows do not hash to ${WATER_ROWS_SHA256}';
  end if;
  if to_regprocedure('${CORE_SIG}') is null or to_regprocedure('${CORE_SIG_A}') is not null then
    raise exception 'wine_footprint_clean_core is not the 7-argument water core alone';
  end if;
  if (select md5(replace(prosrc, E'\\r\\n', E'\\n')) from pg_proc where oid = '${WRAPPER_SIG}'::regprocedure) <> '${md5Lf(STEP_SOURCES.wrapper)}'
     or (select md5(replace(prosrc, E'\\r\\n', E'\\n')) from pg_proc where oid = '${CORE_SIG}'::regprocedure) <> '${md5Lf(STEP_SOURCES.core)}' then
    raise exception 'wine_footprint_clean or its core is not the rendered water step';
  end if;
  if has_function_privilege('service_role', '${WRAPPER_SIG}', 'execute')
     or has_function_privilege('authenticated', '${WRAPPER_SIG}', 'execute')
     or has_function_privilege('service_role', '${CORE_SIG}', 'execute')
     or has_function_privilege('authenticated', '${CORE_SIG}', 'execute') then
    raise exception 'wine_footprint_clean is executable by a client role';
  end if;
end
$check$;
`;
}
