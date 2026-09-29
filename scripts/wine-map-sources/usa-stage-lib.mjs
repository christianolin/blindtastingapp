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
  if (!f.ownerApproval) r.push("place-profiles-usa.json carries no owner approval (_provenance.owner_approval)");
  if (!f.treeMatches) r.push("the recomputed tree differs from the committed tree reports");
  if (f.usBoundaries > 0) r.push(`${f.usBoundaries} united-states boundaries already exist (promote, or run the unstage file, first)`);
  if (f.otherDraftBoundaries > 0) r.push(`${f.otherDraftBoundaries} DRAFT boundaries outside united-states: someone else is mid-batch`);
  if (f.buildingReleases > 0) r.push(`${f.buildingReleases} release(s) BUILDING in the last hour: a tiles run is in flight`);
  if (f.promoteRecorded) r.push("the promote is already recorded");
  return r;
}
