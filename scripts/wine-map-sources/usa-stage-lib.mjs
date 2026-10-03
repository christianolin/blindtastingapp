import { cleanGeomCte, withCleanupStamp } from "./footprint-cleanup.mjs";
// Stage rules for the USA map (spec 2026-09-29 §8.2, D9, D10, D15, D25). The
// pure half is tested in usa-stage-lib.test.mjs; stageWave (below) is the
// database half, shared by stage-usa-ava.mjs and the rehearsal.
export const SIMPLIFY_TOLERANCE = 0.0002;
export const CONTAINMENT_BUFFER_DEG = 0.05;
export const CONTAINMENT_MIN = 0.995;
export const AREA_DRIFT_MAX = 0.15;
export const AREA_MATCH_MAX = 0.001;
export const UCD_NAMESPACE = "UCD_TTB_AVA";
export const NE_NAMESPACE = "NATURAL_EARTH";
const DATUM_SHIFT_M = 2;
const DATUM_FACTOR = 5;
const METRES_PER_DEGREE = 111320;
// Padded around the committed outlines. WA reaches 45.1°N because Columbia
// Valley, keyed under Washington, runs into Oregon.
export const STATE_WINDOWS = Object.freeze({
  CA: Object.freeze({ minLon: -124.6, minLat: 32.4, maxLon: -114.0, maxLat: 42.1 }),
  WA: Object.freeze({ minLon: -124.9, minLat: 45.1, maxLon: -116.8, maxLat: 49.1 }),
  OR: Object.freeze({ minLon: -124.7, minLat: 41.9, maxLon: -116.4, maxLat: 46.4 }),
  NY: Object.freeze({ minLon: -79.9, minLat: 40.4, maxLon: -71.7, maxLat: 45.1 }),
});
export const COUNTRY_WINDOW = Object.freeze({ minLon: -125, minLat: 24, maxLon: -66.5, maxLat: 49.5 });
export const COUNTRY_ARTIFACT = Object.freeze({
  path: "data/wine-map/united-states-lower48-ne50m.geojson",
  sha256: "CF02FF8E8B44CE08745CA75A1BE72F4F0654F81E7B5553502560E80E603BB0D4",
});
export const STATES_ARTIFACT_PATH = "data/wine-map/usa-states-ne50m.geojson";

/** D10: the tolerance, in metres of longitude at the northern edge, is >= 5 x the 2 m datum shift. */
export function datumCheck(toleranceDeg, northLat) {
  const metres = toleranceDeg * METRES_PER_DEGREE * Math.cos((northLat * Math.PI) / 180);
  const required = DATUM_SHIFT_M * DATUM_FACTOR;
  return { metres, required, ok: metres >= required };
}

export function insideWindow([minx, miny, maxx, maxy], w) {
  return minx >= w.minLon && miny >= w.minLat && maxx <= w.maxLon && maxy <= w.maxLat;
}

export function rawObjectPath(commit, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a commit sha: ${commit}`);
  if (!/^[A-Z]{2}_avas\.geojson$/.test(file)) throw new Error(`not a UC Davis state file: ${file}`);
  return `${UCD_NAMESPACE}/${commit}/${file}`;
}

/** Storage uploads are not transactional: same bytes skip, other bytes refuse. */
export function uploadDecision(existingSha, localSha) {
  if (existingSha === null) return "upload";
  if (existingSha.toUpperCase() === localSha.toUpperCase()) return "skip";
  throw new Error(`the stored object's sha256 ${existingSha} is not the pinned ${localSha}; refusing to overwrite`);
}

/** §8.2 / §17: every reason --stage must not run now. Empty means go. */
export function sittingGate(f) {
  const r = [];
  if (!f.catalogRecorded) r.push(`catalog migration ${f.versions.catalog} is not recorded live`);
  if (!f.knowledgeRecorded) r.push(`knowledge migration ${f.versions.knowledge} is not recorded live`);
  if (!f.ownerApproval) r.push("the wave's knowledge file carries no owner approval (_provenance.owner_approval)");
  if (!f.treeMatches) r.push("the recomputed tree differs from the committed tree reports");
  if (f.priorPromote && !f.priorPromoted) r.push(`the previous wave's promote ${f.priorPromote} is not recorded live`);
  if (f.waveBoundaries > 0) r.push(`${f.waveBoundaries} boundaries already exist on this wave's places (promote, or run the unstage file, first)`);
  if (f.otherDraftBoundaries > 0) r.push(`${f.otherDraftBoundaries} DRAFT boundaries outside this wave: someone else is mid-batch`);
  if (f.buildingReleases > 0) r.push(`${f.buildingReleases} release(s) BUILDING in the last hour: a tiles run is in flight`);
  if (f.promoteRecorded) r.push("the promote is already recorded");
  return r;
}

/** The keys whose subtrees may hold no boundary outside this wave and the earlier ones (US-4 spans three states). */
export function scopesOf(wave) {
  return wave.scopeKeys ?? [wave.scopeKey ?? "united-states"];
}

// ---------------------------------------------------------------------------
// The database half. stageWave runs inside the caller's open transaction and
// never begins, commits or rolls back: the CLI's dry run and the rehearsal
// roll it back, and only the sitting's --stage commits it.

const GEOM = (p) => `extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(${p}), 4326)), 3)`;
const METRICS = (g) => `extensions.ST_AsGeoJSON(${g}, 6) geojson, extensions.ST_NPoints(${g}) npoints,
  extensions.ST_NumGeometries(${g}) nparts, extensions.ST_IsValid(${g}) valid, extensions.ST_IsEmpty(${g}) is_empty,
  extensions.ST_Covers(${g}, extensions.ST_PointOnSurface(${g})) covers_label,
  extensions.ST_XMin(extensions.Box3D(${g})) minx, extensions.ST_YMin(extensions.Box3D(${g})) miny,
  extensions.ST_XMax(extensions.Box3D(${g})) maxx, extensions.ST_YMax(extensions.Box3D(${g})) maxy,
  extensions.ST_Area(${g}::extensions.geography) / 1e6 km2`;

// $1 geometry json, $2 tolerance (0 = keep as is)
export const BUILD_SQL = `
with raw as (select extensions.ST_Multi(${GEOM("$1")}) g),
built as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(
            case when $2::float8 > 0 then extensions.ST_SimplifyPreserveTopology(raw.g, $2) else raw.g end), 3)) g from raw)
select ${METRICS("built.g")}, extensions.ST_Area(raw.g::extensions.geography) / 1e6 raw_km2 from raw, built`;

// $1 jsonb array of member geometries, $2 tolerance
export const DERIVED_SQL = `
with m as (select ${GEOM("x::text")} g from jsonb_array_elements($1::jsonb) x),
raw as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_UnaryUnion(extensions.ST_Collect(g)), 3)) g from m),
simp as (select extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(raw.g, $2)), 3) g from raw),
built as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_Union(simp.g, raw.g)), 3)) g from simp, raw)
select ${METRICS("built.g")}, extensions.ST_Area(raw.g::extensions.geography) / 1e6 raw_km2 from raw, built`;

// $1 jsonb [{key, legal:[codes], geometry}], $2 jsonb [{code, geometry}] (all 13 states), $3 buffer
export const CONTAINMENT_SQL = `
with a as (select x->>'key' key, x->'legal' legal, ${GEOM("(x->'geometry')::text")} g from jsonb_array_elements($1::jsonb) x),
s as (select f->>'code' code, extensions.ST_Buffer(${GEOM("(f->'geometry')::text")}, $3) bg from jsonb_array_elements($2::jsonb) f),
u as (select extensions.ST_Union(bg) bg from s)
select a.key,
  extensions.ST_Area(extensions.ST_Intersection(a.g,
    (select extensions.ST_Union(s.bg) from s where s.code in (select jsonb_array_elements_text(a.legal)))))
  / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, u.bg)), 0) as share
from a cross join u order by a.key`;

// $1 jsonb [{key, child, parent}]: the normalized artifact geometries, exactly
// as the tree report measured them (spec D7, §8.2): never the simplified shape.
export const PARENT_SQL = `
with x as (select e->>'key' key, ${GEOM("(e->'child')::text")} c, ${GEOM("(e->'parent')::text")} p
             from jsonb_array_elements($1::jsonb) e)
select key, extensions.ST_Area(extensions.ST_Intersection(c, p)) / nullif(extensions.ST_Area(c), 0) inside
  from x order by key`;

// One place's source + snapshot (reused if identical) + DRAFT boundary.
export const INSERT_SQL = `
with source as (
  insert into public.wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
  values ($1, $2, $3, 'United States')
  on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
  returning id),
ins as (
  insert into public.wine_boundary_source_snapshots (source_id, source_revision, retrieved_at, source_url, licence,
    raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256, provenance_note, importer_version)
  select source.id, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13 from source
  on conflict (source_id, source_revision, normalized_checksum_sha256) do nothing
  returning id),
snapshot as (
  select id from ins
  union all
  select s.id from public.wine_boundary_source_snapshots s, source
   where s.source_id = source.id and s.source_revision = $4 and s.normalized_checksum_sha256 = $11
     and not exists (select 1 from ins)),
geom_raw as (select extensions.ST_Multi(${GEOM("$14")}) g),
${cleanGeomCte({ placeKey: "$19" })}
insert into public.wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
select place.id, snapshot.id, $15::public.wine_boundary_method, 'DRAFT', geom.g, extensions.ST_PointOnSurface(geom.g),
       array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
             extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
       $16::jsonb, ${withCleanupStamp("$17")}, $18, false, null
  from public.wine_places place, snapshot, geom
 where place.canonical_key = $19
returning id`;

const UCD_AUTHORITY = "UC Davis Library AVA Digitizing Project (after 27 CFR Part 9)";
const NE_AUTHORITY = "Natural Earth";
const ARTIFACT_SLUGS = Object.freeze({ CA: "california", WA: "washington", OR: "oregon", NY: "new-york" });
const artifactForCode = (code) => `data/wine-map/usa-${ARTIFACT_SLUGS[code]}-ava.geojson`;
const round = (x, d) => Math.round(Number(x) * 10 ** d) / 10 ** d;

/** The stage role of a wave place (the promote renders the same roles). */
export function roleOf(place) {
  if (place.kind === "COUNTRY") return "ne-country";
  if (place.kind === "REGION") return "ne-state";
  if (place.navigation_node) return "derived";
  return "ucd";
}

/** The source/snapshot/boundary parameters for one built shape (plan Task 8, "Row values per role"). */
function rowValues(b, place, ctx) {
  const { wave, artifactSha, statesFc, pins, importer } = ctx;
  if (b.role === "ne-country") {
    return {
      source: [NE_NAMESPACE, "ne_50m_admin_0_countries_lakes:USA", NE_AUTHORITY],
      snapshot: [pins.admin0.commit, pins.admin0.retrieved_at, pins.admin0.url, pins.admin0.licence, null, null,
        COUNTRY_ARTIFACT.path, COUNTRY_ARTIFACT.sha256,
        "Natural Earth 1:50m admin_0_countries_lakes, ADM0_A3=USA, filtered to the lower 48 (components whose outer ring lies fully inside lon [-125,-66.5], lat [24,49.5]; Alaska and Hawaii excluded), rounded to 4 decimals. The raw feature is committed as data/wine-map/united-states-ne50m-raw.geojson.",
        importer],
      method: "MANUAL",
      refs: { adm0_a3: "USA" },
      gp: { engine: "natural-earth-extract", ne_commit: pins.admin0.commit, variant: "50m_lakes", coordinate_precision: 4,
        component_filter: "outer ring fully inside lon [-125,-66.5], lat [24,49.5]" },
    };
  }
  if (b.role === "ne-state") {
    const f = statesFc.features.find((x) => x.properties.code === place.map_state);
    return {
      source: [NE_NAMESPACE, `ne_50m_admin_1_states_provinces_lakes:US-${place.map_state}`, NE_AUTHORITY],
      snapshot: [pins.admin1.commit, pins.admin1.retrieved_at, pins.admin1.url, pins.admin1.licence, null, null,
        STATES_ARTIFACT_PATH, artifactSha.get(STATES_ARTIFACT_PATH),
        `Natural Earth 1:50m admin_1_states_provinces_lakes, ${f.properties.name}, rounded to 4 decimals (the lakes variant, so the Great Lakes are not painted).`,
        importer],
      method: "MANUAL",
      refs: { postal: place.map_state, name: f.properties.name },
      gp: { engine: "natural-earth-extract", ne_commit: pins.admin1.commit, variant: "50m_lakes", coordinate_precision: 4 },
    };
  }
  if (b.role === "ucd") {
    const u = wave.ucd.find((x) => x.key === b.key);
    const file = `${u.state}_avas.geojson`;
    const pin = pins.ucd.get(file);
    const gp = { engine: "ucd-ava-digitization", ucd_commit: pin.commit, simplify_tolerance: SIMPLIFY_TOLERANCE,
      coordinate_precision: 6, crs_in: "EPSG:4269", crs_out: "EPSG:4326", transform: "identity",
      datum_check_m: b.datum_m, area_km2: round(b.km2, 3), area_drift: round(b.drift, 4) };
    if (wave.outlineKeys.includes(b.key)) gp.display = "outline";
    return {
      source: [UCD_NAMESPACE, u.ucd_ava_id, UCD_AUTHORITY],
      snapshot: [pin.commit, pin.retrieved_at, pin.url, pin.licence,
        `storage://wine-map-sources/${rawObjectPath(pin.commit, file)}`, pin.sha256,
        u.artifact, artifactSha.get(u.artifact),
        `UC Davis AVA Digitizing Project, ${u.name} (${u.cfr_section}), current boundary; normalized in ${u.artifact} (Douglas-Peucker 0.0001°, 5 decimals; see its _provenance). A generalized digitization of 27 CFR Part 9, not TTB's legal boundary (spec D9).`,
        importer],
      method: "GENERALIZED_FROM_OFFICIAL_SOURCE",
      refs: { ucd_ava_id: u.ucd_ava_id, name: u.name, cfr_section: u.cfr_section },
      gp,
    };
  }
  const d = wave.derived.find((x) => x.key === b.key);
  const file = `${d.state}_avas.geojson`;
  const pin = pins.ucd.get(file);
  const artifact = artifactForCode(d.state);
  return {
    source: [UCD_NAMESPACE, `derived:${b.key.split(".")[2]}`, UCD_AUTHORITY],
    snapshot: [pin.commit, pin.retrieved_at, pin.url, pin.licence,
      `storage://wine-map-sources/${rawObjectPath(pin.commit, file)}`, pin.sha256,
      artifact, artifactSha.get(artifact),
      `Central Valley is a navigation node on this map, not an AVA (spec D25). Its outline is the union of its ${d.members.length} member AVAs' UC Davis geometries (members in generation_parameters), simplified with a coverage union so no member is cut.`,
      importer],
    method: "DERIVED_FROM_DESCENDANTS",
    refs: { members: d.members },
    gp: { engine: "ucd-ava-derived-union", members: d.members, simplify_tolerance: SIMPLIFY_TOLERANCE, coverage_union: true,
      coordinate_precision: 6, crs_in: "EPSG:4269", crs_out: "EPSG:4326", transform: "identity", display: "outline" },
  };
}

/**
 * Build, assert and insert the wave's DRAFT boundaries (plan Task 8). Throws,
 * with the key in the message, on the first check that fails. Returns one
 * report row per place.
 * ctx = { wave, artifacts: Map<path, FeatureCollection>, artifactSha: Map<path, sha>,
 *         statesFc, countryFc, pins: { ucd: Map<file, pin>, admin0, admin1 },
 *         revision, importer, log?, label? }
 */
export async function stageWave(client, ctx) {
  const { wave, artifacts, statesFc, countryFc, revision } = ctx;
  const log = ctx.log ?? console.log;
  const label = ctx.label ?? "STAGED-DRY";

  const waveKeys = wave.places.map((p) => p.key);
  const priorKeys = wave.priorKeys ?? [];
  const scopes = scopesOf(wave);

  // 1. Nothing staged on this wave's places; every earlier wave live; no other
  //    boundary under the wave's scope (a half-staged neighbour batch).
  const existing = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where p.canonical_key = any($1::text[])`, [waveKeys]);
  if (existing.rows[0].n > 0) throw new Error(`${existing.rows[0].n} united-states boundaries already exist on this wave's places`);
  if (priorKeys.length) {
    const { rows } = await client.query(
      `select k.key, p.publication_status::text status,
              (select count(*)::int from public.wine_place_boundaries b
                where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') cur
         from unnest($1::text[]) k(key) left join public.wine_places p on p.canonical_key = k.key`, [priorKeys]);
    const notLive = rows.filter((r) => r.status !== "VERIFIED" || r.cur !== 1).map((r) => r.key);
    if (notLive.length) throw new Error(`an earlier wave is not live (VERIFIED with one current boundary): ${notLive.join(", ")}`);
  }
  const stray = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where exists (select 1 from unnest($1::text[]) s(k) where p.canonical_key = s.k or p.canonical_key like s.k || '.%')
        and not (p.canonical_key = any($2::text[]) or p.canonical_key = any($3::text[]))`, [scopes, waveKeys, priorKeys]);
  if (stray.rows[0].n > 0) throw new Error(`${stray.rows[0].n} boundaries on other places under ${scopes.join(", ")}`);

  // 2. Catalog fidelity, for this wave's places.
  const { rows: live } = await client.query(
    `select p.canonical_key key, p.kind::text kind, p.name, p.slug, p.display_tier, p.min_zoom, p.label_min_zoom,
            p.sort_order, p.is_appellation, p.appellation_system, p.appellation_level, p.publication_status::text status,
            pp.canonical_key parent_key
       from public.wine_places p left join public.wine_places pp on pp.id = p.primary_parent_id
      where p.canonical_key = any($1::text[])`, [waveKeys]);
  const liveByKey = new Map(live.map((r) => [r.key, r]));
  const differ = [];
  for (const p of wave.places) {
    const r = liveByKey.get(p.key);
    if (!r || r.kind !== p.kind || r.name !== p.name || r.slug !== p.slug || r.display_tier !== p.display_tier
      || Number(r.min_zoom) !== Number(p.min_zoom) || Number(r.label_min_zoom) !== Number(p.label_min_zoom)
      || r.sort_order !== p.sort_order || r.is_appellation !== p.is_appellation
      || r.appellation_system !== p.appellation_system || r.appellation_level !== p.appellation_level
      || r.parent_key !== p.parent_key || r.status !== "DRAFT") differ.push(p.key);
  }
  if (differ.length) throw new Error(`catalog differs from the wave: ${differ.join(", ")}`);

  // 3-5. Build and check each shape.
  const ucdByKey = new Map(wave.ucd.map((u) => [u.key, u]));
  const derivedByKey = new Map(wave.derived.map((d) => [d.key, d]));
  const stateFeature = (code) => {
    const f = statesFc.features.find((x) => x.properties.code === code);
    if (!f) throw new Error(`no ${code} feature in ${STATES_ARTIFACT_PATH}`);
    return f;
  };
  const avaFeature = (code, avaId) => {
    const f = artifacts.get(artifactForCode(code))?.features.find((x) => x.properties.ava_id === avaId);
    if (!f) throw new Error(`${avaId}: not in ${artifactForCode(code)}`);
    return f;
  };
  const built = [];
  for (const place of wave.places) {
    const role = roleOf(place);
    const k = place.key;
    let r;
    let window;
    if (role === "ne-country") {
      r = (await client.query(BUILD_SQL, [JSON.stringify(countryFc.geometry), 0])).rows[0];
      window = COUNTRY_WINDOW;
    } else if (role === "ne-state") {
      r = (await client.query(BUILD_SQL, [JSON.stringify(stateFeature(place.map_state).geometry), 0])).rows[0];
      window = STATE_WINDOWS[place.map_state];
    } else if (role === "ucd") {
      const u = ucdByKey.get(k);
      r = (await client.query(BUILD_SQL, [JSON.stringify(avaFeature(u.state, u.ucd_ava_id).geometry), SIMPLIFY_TOLERANCE])).rows[0];
      window = STATE_WINDOWS[u.state];
    } else {
      const d = derivedByKey.get(k);
      const members = d.members.map((id) => avaFeature(d.state, id).geometry);
      r = (await client.query(DERIVED_SQL, [JSON.stringify(members), SIMPLIFY_TOLERANCE])).rows[0];
      window = STATE_WINDOWS[d.state];
    }
    if (!r.valid || r.is_empty) throw new Error(`${k}: geometry invalid or empty`);
    if (!r.covers_label) throw new Error(`${k}: label point falls outside the geometry`);
    const bbox = [r.minx, r.miny, r.maxx, r.maxy].map(Number);
    if (!insideWindow(bbox, window)) throw new Error(`${k}: bbox ${bbox.join(",")} escapes its window`);
    const row = { key: k, role, npoints: r.npoints, nparts: r.nparts, km2: round(r.km2, 3), raw_km2: round(r.raw_km2, 3),
      drift: null, containment: null, datum_m: null, parent_inside: null, bbox: bbox.map((x) => round(x, 6)), geojson: r.geojson };
    if (role === "ucd" || role === "derived") {
      row.drift = round(Math.abs(Number(r.km2) - Number(r.raw_km2)) / Number(r.raw_km2), 5);
      if (!(row.drift < AREA_DRIFT_MAX)) throw new Error(`${k}: simplification moved the area ${(row.drift * 100).toFixed(2)}%`);
      const datum = datumCheck(SIMPLIFY_TOLERANCE, window.maxLat);
      if (!datum.ok) throw new Error(`${k}: D10 datum check ${datum.metres.toFixed(1)} m < ${datum.required} m`);
      row.datum_m = round(datum.metres, 1);
    }
    if (role === "ucd") {
      const want = ucdByKey.get(k).area_km2;
      const off = Math.abs(Number(r.raw_km2) - want) / want;
      if (!(off < AREA_MATCH_MAX)) throw new Error(`${k}: unsimplified area ${round(r.raw_km2, 3)} km² is not the tree report's ${want} km²`);
    }
    built.push(row);
  }

  // 5b. Parent containment (§8.2, D7), on the normalized source geometry, at
  //     the spec's thresholds, and equal to the tree report's measurement.
  const checks = wave.parentChecks ?? [];
  if (checks.length) {
    const input = checks.map((c) => {
      const u = ucdByKey.get(c.key);
      return { key: c.key, child: avaFeature(u.state, u.ucd_ava_id).geometry, parent: avaFeature(u.state, c.parent_ucd_ava_id).geometry };
    });
    const { rows } = await client.query(PARENT_SQL, [JSON.stringify(input)]);
    if (rows.length !== checks.length) throw new Error(`parent containment measured ${rows.length} of ${checks.length} places`);
    for (const r of rows) {
      const c = checks.find((x) => x.key === r.key);
      const b = built.find((x) => x.key === r.key);
      b.parent_inside = round(r.inside, 6);
      if (!(Number(r.inside) >= c.min)) throw new Error(`${r.key}: only ${b.parent_inside} inside its parent ${c.parent_key} (needs ${c.min}, ${c.basis})`);
      if (Math.abs(Number(r.inside) - c.tree_inside) > 1e-4) throw new Error(`${r.key}: parent share ${b.parent_inside} is not the tree report's ${c.tree_inside}`);
    }
  }

  // 6. Containment, on land and buffered (§8.2).
  const containmentInput = built.filter((b) => b.role === "ucd" || b.role === "derived").map((b) => ({
    key: b.key,
    legal: b.role === "ucd" ? ucdByKey.get(b.key).legal_states : [derivedByKey.get(b.key).state],
    geometry: JSON.parse(b.geojson),
  }));
  const statesInput = statesFc.features.map((f) => ({ code: f.properties.code, geometry: f.geometry }));
  const { rows: shares } = await client.query(CONTAINMENT_SQL,
    [JSON.stringify(containmentInput), JSON.stringify(statesInput), CONTAINMENT_BUFFER_DEG]);
  if (shares.length !== containmentInput.length) throw new Error(`containment measured ${shares.length} of ${containmentInput.length} places`);
  for (const s of shares) {
    const b = built.find((x) => x.key === s.key);
    b.containment = s.share === null ? null : round(s.share, 5);
    if (b.containment === null || b.containment < CONTAINMENT_MIN) {
      throw new Error(`${s.key}: only ${b.containment} of its land lies in its legal states (needs ${CONTAINMENT_MIN})`);
    }
  }

  // 7. Insert.
  for (const b of built) {
    const place = wave.places.find((p) => p.key === b.key);
    const v = rowValues(b, place, ctx);
    const ins = await client.query(INSERT_SQL, [
      ...v.source, ...v.snapshot, b.geojson, v.method, JSON.stringify(v.refs), JSON.stringify(v.gp), revision, b.key]);
    if (ins.rows.length !== 1) throw new Error(`${b.key}: expected one staged boundary, got ${ins.rows.length}`);
    log(`${label} ${b.key} ${b.role} ${b.npoints} pts ${b.nparts} parts ${b.km2} km² drift ${b.drift ?? "-"} share ${b.containment ?? "-"} parent ${b.parent_inside ?? "-"}`);
  }

  // 8. Final assert.
  const final = await client.query(
    `select count(*)::int n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where p.canonical_key = any($1::text[]) and b.quality_status = 'DRAFT' and not b.is_current`, [waveKeys]);
  if (final.rows[0].n !== wave.places.length) {
    throw new Error(`expected ${wave.places.length} DRAFT, non-current boundaries on this wave's places, found ${final.rows[0].n}`);
  }
  return built.map((b) => {
    const { geojson, ...rest } = b;
    void geojson;
    return rest;
  });
}

/** Read the live facts sittingGate needs. Reads only; safe inside a read-only transaction. */
export async function readGateFacts(client, { versions, ownerApproval, treeMatches, waveKeys, priorPromote = null }) {
  const recorded = async (v) => (await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const n = async (sql, params = []) => (await client.query(sql, params)).rows[0].n;
  return {
    versions,
    catalogRecorded: await recorded(versions.catalog),
    knowledgeRecorded: await recorded(versions.knowledge),
    promoteRecorded: await recorded(versions.promote),
    ownerApproval,
    treeMatches,
    priorPromote,
    priorPromoted: priorPromote ? await recorded(priorPromote) : true,
    waveBoundaries: await n(`select count(*)::int n from public.wine_place_boundaries b
      join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])`, [waveKeys]),
    otherDraftBoundaries: await n(`select count(*)::int n from public.wine_place_boundaries b
      join public.wine_places p on p.id = b.wine_place_id
      where not (p.canonical_key = any($1::text[])) and b.quality_status = 'DRAFT'`, [waveKeys]),
    buildingReleases: await n(`select count(*)::int n from public.wine_map_releases
      where status = 'BUILDING' and created_at > now() - interval '1 hour'`),
  };
}

/**
 * Load and pin-check every committed input the stage reads (plan Task 8 steps
 * 5-6). Offline; throws on any sha mismatch. `checkRaw` also hashes the four
 * raw UC Davis files under .tiles-build/ (only --stage uploads them, but the
 * dry run checks them too so the sitting holds no surprise).
 */
export async function loadStageInputs({ wave, readFileFn, sha256hexFn, checkRaw = true }) {
  const measurements = JSON.parse(await readFileFn("data/wine-map/usa-measurements.json", "utf8"));
  const pinned = measurements._inputs;
  const artifacts = new Map();
  const artifactSha = new Map();
  for (const code of Object.keys(ARTIFACT_SLUGS)) {
    const path = artifactForCode(code);
    const buf = await readFileFn(path);
    const sha = sha256hexFn(buf);
    if (sha !== pinned[path]) throw new Error(`${path}: sha256 ${sha} is not the measured ${pinned[path]}`);
    artifacts.set(path, JSON.parse(buf.toString("utf8")));
    artifactSha.set(path, sha);
  }
  const statesBuf = await readFileFn(STATES_ARTIFACT_PATH);
  const statesSha = sha256hexFn(statesBuf);
  if (statesSha !== pinned[STATES_ARTIFACT_PATH]) throw new Error(`${STATES_ARTIFACT_PATH}: sha256 ${statesSha} is not the measured one`);
  artifactSha.set(STATES_ARTIFACT_PATH, statesSha);
  const countryBuf = await readFileFn(COUNTRY_ARTIFACT.path);
  const countrySha = sha256hexFn(countryBuf);
  if (countrySha !== COUNTRY_ARTIFACT.sha256) throw new Error(`${COUNTRY_ARTIFACT.path}: sha256 ${countrySha} is not the pinned one`);
  artifactSha.set(COUNTRY_ARTIFACT.path, countrySha);

  const sources = JSON.parse(await readFileFn("data/wine-map/usa-sources.json", "utf8")).sources;
  const ucd = new Map(sources.filter((s) => s.set === "ucd").map((s) => [s.name, s]));
  const admin0 = sources.find((s) => s.name === "ne_50m_admin_0_countries_lakes.geojson");
  const admin1 = sources.find((s) => s.name === "ne_50m_admin_1_states_provinces_lakes.geojson");
  if (!admin0 || !admin1) throw new Error("usa-sources.json lacks the Natural Earth pins");
  const files = [...new Set([...wave.ucd.map((u) => u.state), ...wave.derived.map((d) => d.state)])]
    .sort().map((code) => `${code}_avas.geojson`);
  const raw = [];
  for (const file of files) {
    const pin = ucd.get(file);
    if (!pin) throw new Error(`usa-sources.json has no pin for ${file}`);
    const localPath = `.tiles-build/usa/ucd/${pin.commit}/${file}`;
    if (checkRaw) {
      const sha = sha256hexFn(await readFileFn(localPath));
      if (sha !== pin.sha256) throw new Error(`${localPath}: sha256 ${sha} is not the pinned ${pin.sha256}`);
    }
    raw.push({ file, localPath, objectPath: rawObjectPath(pin.commit, file), sha256: pin.sha256 });
  }
  return {
    artifacts, artifactSha,
    statesFc: JSON.parse(statesBuf.toString("utf8")),
    countryFc: JSON.parse(countryBuf.toString("utf8")),
    pins: { ucd, admin0, admin1 },
    raw,
    measurementsInputs: pinned,
  };
}
