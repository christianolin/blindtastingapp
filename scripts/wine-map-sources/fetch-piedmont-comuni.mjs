// Task 2 (local-only pilot): merge the Barolo and Barbaresco member comuni'
// TRUE ISTAT polygons into two denomination footprints plus a combined
// Piemonte region outline, and render France-styled preview artifacts
// (SVG + a standalone MapLibre HTML) — entirely on disk. This script makes
// NO Supabase/database/bucket writes; a DB-writing mode is a later task's
// concern (YAGNI — do not build it here).
//
// Membership source of truth: data/wine-map/{barolo,barbaresco}-comuni.json
// (reviewed artifacts — see their `provenance`/`footprint_treatment` blocks
// for the whole-comune-union model and the Alba-exclusion rationale).
//
// Geometry source: ISTAT comuni boundaries. istat-lib.mjs's NAME_PROP/
// PRO_COM_PROP stay the canonical ISTAT names (COMUNE/PRO_COM) — the shared
// adapter is source-agnostic. This script's ACTUAL fetched mirror uses
// different property names (it's WGS84-reprojected; see PILOT_* below and
// the header note on why teamdigitale/confini-amministrativi-istat, which
// does use COMUNE/PRO_COM verbatim, was rejected — wrong CRS), so the pilot
// wiring — source URL, property keys, licence — lives here as PILOT_*
// constants, not in the shared adapter.
//
// Footprint method: for each denomination, merge every member comune's REAL
// ISTAT Polygon/MultiPolygon parts into one combined MultiPolygon (no hull,
// no simplification) — a true union of the whole-comune shapes, not an
// envelope over them. Region outline = the same merge across all comuni of
// both denominations. This is still a whole-comune over-approximation by
// design (documented in the *-comuni.json artifacts): partial comuni (e.g.
// Cherasco, Roddi, Diano d'Alba, Grinzane Cavour for Barolo) are included
// whole, not trimmed to their true vineyard-land sliver.
//
// Usage: node scripts/wine-map-sources/fetch-piedmont-comuni.mjs --local-only
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { matchComune } from "./istat-lib.mjs";

const hasFlag = (n) => process.argv.includes(`--${n}`);
if (!hasFlag("local-only")) {
  throw new Error(
    "fetch-piedmont-comuni.mjs only implements --local-only (Task 2). " +
      "A shared-DB write mode is a future task; run with --local-only.",
  );
}

const OUT_DIR = ".tiles-build/sources";
// Piedmont window used by the Task 2 brief's numeric sanity gate.
const WINDOW = { minLon: 7.0, minLat: 44.1, maxLon: 9.2, maxLat: 46.5 };

// --- pilot-local source wiring (NOT part of the shared istat-lib.mjs contract) --
// Pinned during the Task 2 source spike. guglielmo/geojson-italy (formerly
// openpolis/geojson-italy — GitHub redirects the old org/name to the new
// one) redistributes ISTAT's comuni boundaries as simplification-free WGS84
// GeoJSON under CC BY (same licence as the ISTAT original). Used the
// region-scoped file (Piemonte = ISTAT region code 1, ~4.3MB) rather than
// filtering the ~40MB national file.
//
// Rejected candidate: teamdigitale/confini-amministrativi-istat
// (20190101/geojson/comuni/comuni.json) DOES use the canonical ISTAT
// property names COMUNE/PRO_COM verbatim, but ships its geometry in
// EPSG:32632 (UTM zone 32N, metres) rather than EPSG:4326 (lon/lat) — this
// script's window/area assertions and SVG/HTML projections need WGS84, so
// that source was rejected without a reprojection step this task doesn't
// need. See .tiles-build/sources/piedmont-source-provenance.json.
const PILOT_SOURCE_URL =
  "https://raw.githubusercontent.com/guglielmo/geojson-italy/master/geojson/limits_R_1_municipalities.geojson";
const PILOT_NAME_PROP = "name";
const PILOT_PRO_COM_PROP = "com_istat_code_num";
const PILOT_LICENCE =
  "ISTAT — Confini delle unità amministrative a fini statistici (comuni). " +
  "Original boundaries © ISTAT, released under CC BY. Redistributed as " +
  "simplification-free WGS84 GeoJSON by guglielmo/geojson-italy " +
  "(https://github.com/guglielmo/geojson-italy, formerly openpolis/geojson-italy) " +
  "under the same CC BY licence. Attribute: ISTAT.";

// Distinct fills for the two denominations. tile-wine-map.tsx (the live
// France map) has no literal `CHILD_RAMP` export; the closest equivalent is
// its DISTRICT_PALETTE (src/app/knowledge/map/tile-wine-map.tsx:100-103),
// the curated 12-colour set used to give sibling child areas distinct hues.
// Picked two entries from that exact array that read as clearly distinct
// (rather than hashing "barolo"/"barbaresco" through districtColor(), whose
// hash lands both on adjacent amber/brown tones that are hard to tell apart
// in a small preview).
const DISTRICT_PALETTE = [
  "#8C2D3C", "#3E6B54", "#4A5D8C", "#9A6A2F", "#5C7A3B", "#7A4E8C",
  "#2F7A78", "#A34D2B", "#5B4A8C", "#3B6E8C", "#8C6D3B", "#6B4430",
];
const CASING = "#FFFDF7";
const LABEL_INK = "#2b0f18";
const LABEL_HALO = "#FFFDF7";
const PARCHMENT = "#F4F0E4"; // approximates the Positron basemap's paper tone
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"; // same as tile-wine-map.tsx

const DENOMINATIONS = [
  {
    key: "barolo",
    label: "Barolo",
    artifact: "data/wine-map/barolo-comuni.json",
    fill: DISTRICT_PALETTE[0], // deep claret
  },
  {
    key: "barbaresco",
    label: "Barbaresco",
    artifact: "data/wine-map/barbaresco-comuni.json",
    fill: DISTRICT_PALETTE[6], // teal
  },
];

// --- geometry helpers --------------------------------------------------
// Every Polygon/MultiPolygon geometry, reduced to a flat array of "parts"
// (each part = [exteriorRing, ...holeRings]) — the shape a MultiPolygon's
// `coordinates` already is, so merging N geometries is just concatenation.
function toParts(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

// True union (no hull, no simplification): concatenate every input
// geometry's real polygon parts into one combined MultiPolygon.
function mergeFootprint(geometries) {
  return { type: "MultiPolygon", coordinates: geometries.flatMap(toParts) };
}

function eachRing(geometry, cb) {
  for (const part of toParts(geometry)) for (const ring of part) cb(ring);
}

function flattenPoints(geometry) {
  const pts = [];
  eachRing(geometry, (ring) => {
    for (const [lon, lat] of ring) pts.push([lon, lat]);
  });
  return pts;
}

function bboxOfPoints(points) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  }
  return b;
}

// Bbox-centre of a geometry, used as a stable label anchor for both the SVG
// and the HTML preview (not a true centroid, but a fine label point for a
// compact, roughly-convex denomination footprint).
function centroidOf(geometry) {
  const b = bboxOfPoints(flattenPoints(geometry));
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

// Planar area of one polygon part: exterior ring minus any holes.
function partArea(part) {
  let area = ringArea(part[0]);
  for (let i = 1; i < part.length; i += 1) area -= ringArea(part[i]);
  return area;
}

function areaOf(geometry) {
  return toParts(geometry).reduce((sum, part) => sum + partArea(part), 0);
}

function assertWithinWindow(geometry, label) {
  const escapes = [];
  eachRing(geometry, (ring) => {
    for (const [lon, lat] of ring) {
      if (
        lon < WINDOW.minLon ||
        lon > WINDOW.maxLon ||
        lat < WINDOW.minLat ||
        lat > WINDOW.maxLat
      ) {
        escapes.push([lon, lat]);
      }
    }
  });
  assert.equal(
    escapes.length,
    0,
    `${label}: ${escapes.length} vertex(es) escape the Piedmont window ` +
      `lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}] ` +
      `e.g. ${JSON.stringify(escapes.slice(0, 3))}`,
  );
}

function vertexPartCounts(geometry) {
  let vertices = 0;
  let parts = 0;
  for (const part of toParts(geometry)) {
    parts += 1;
    for (const ring of part) vertices += ring.length;
  }
  return { vertices, parts };
}

// --- 1. fetch the ISTAT comuni layer -------------------------------------
console.log(`fetching ISTAT comuni: ${PILOT_SOURCE_URL}`);
const res = await fetch(PILOT_SOURCE_URL);
if (!res.ok) throw new Error(`ISTAT comuni fetch -> ${res.status} ${res.statusText}`);
const istat = await res.json();
assert.ok(Array.isArray(istat.features) && istat.features.length > 0, "empty ISTAT comuni layer");
console.log(`fetched ${istat.features.length} ISTAT comuni features`);
console.log(`first feature properties: ${JSON.stringify(istat.features[0].properties)}`);
assert.ok(
  PILOT_NAME_PROP in istat.features[0].properties,
  `PILOT_NAME_PROP "${PILOT_NAME_PROP}" not present on first ISTAT feature — property keys drifted`,
);
assert.ok(
  PILOT_PRO_COM_PROP in istat.features[0].properties,
  `PILOT_PRO_COM_PROP "${PILOT_PRO_COM_PROP}" not present on first ISTAT feature — property keys drifted`,
);

// --- 2. match each denomination's expected comuni, fail-closed ----------
const resolved = {};
const denomData = [];
for (const denom of DENOMINATIONS) {
  const artifact = JSON.parse(await readFile(denom.artifact, "utf8"));
  const expected = artifact.comuni.filter((c) => c.in_footprint !== false);
  const matches = expected.map((c) => {
    const hits = istat.features.filter((f) => matchComune(f, c.name, PILOT_NAME_PROP));
    assert.equal(
      hits.length,
      1,
      `${denom.label}: comune "${c.name}" matched ${hits.length} ISTAT features (need exactly 1)`,
    );
    return { name: c.name, feature: hits[0] };
  });
  console.log(`${denom.label}: matched ${matches.length}/${expected.length} expected comuni`);
  resolved[denom.key] = matches.map((m) => ({
    name: m.name,
    pro_com: m.feature.properties[PILOT_PRO_COM_PROP],
  }));
  denomData.push({ ...denom, artifact, matches });
}

assert.equal(resolved.barolo.length, 11, `expected 11 Barolo comuni, matched ${resolved.barolo.length}`);
assert.equal(
  resolved.barbaresco.length,
  3,
  `expected 3 Barbaresco-footprint comuni (Barbaresco+Neive+Treiso), matched ${resolved.barbaresco.length}`,
);

// --- 3. merge: TRUE member-comune shapes, per denomination + region -----
const footprints = {};
const allPoints = [];
for (const denom of denomData) {
  const geometries = denom.matches.map((m) => m.feature.geometry);
  allPoints.push(...geometries.flatMap(flattenPoints));
  footprints[denom.key] = mergeFootprint(geometries);
}
const piemonteOutline = mergeFootprint(denomData.flatMap((d) => d.matches.map((m) => m.feature.geometry)));

// --- 5. numeric assertions (fail-closed) ---------------------------------
for (const [key, geometry] of [
  ["barolo", footprints.barolo],
  ["barbaresco", footprints.barbaresco],
  ["piemonte", piemonteOutline],
]) {
  assertWithinWindow(geometry, key);
  const { vertices, parts } = vertexPartCounts(geometry);
  assert.ok(parts >= 1, `${key}: expected >=1 part, got ${parts}`);
  console.log(`${key}: ${vertices} vertices, ${parts} part(s)`);
}
const baroloArea = areaOf(footprints.barolo);
const barbarescoArea = areaOf(footprints.barbaresco);
assert.ok(
  baroloArea > barbarescoArea,
  `Barolo footprint area (${baroloArea}) should exceed Barbaresco's (${barbarescoArea})`,
);
console.log(
  `area sanity: barolo=${baroloArea.toFixed(6)} > barbaresco=${barbarescoArea.toFixed(6)} (deg^2, planar, sum of member-comune polygon areas)`,
);

// --- write outputs --------------------------------------------------------
await mkdir(OUT_DIR, { recursive: true });
const generatedAt = new Date().toISOString();

async function writeFootprintGeoJSON(fileSlug, key, label, geometry, comuneCount) {
  const fc = {
    type: "FeatureCollection",
    properties: {
      generation: {
        engine: "true-shape merge (real member-comune polygons, Task 2 pilot)",
        denomination: label,
        comune_count: comuneCount,
        source: PILOT_SOURCE_URL,
        licence: PILOT_LICENCE,
        generated_at: generatedAt,
        note:
          "MultiPolygon union of the real ISTAT comune polygons (no hull, no simplification). " +
          "Whole-comune over-approximation by design: partial comuni (e.g. Cherasco, Roddi) are " +
          "included whole, not trimmed to their true vineyard-land sliver. See task-2-report.md.",
      },
    },
    features: [
      {
        type: "Feature",
        properties: { key: `italy.piemonte.${key}`, denomination: label, comune_count: comuneCount },
        geometry,
      },
    ],
  };
  const path = `${OUT_DIR}/${fileSlug}.geojson`;
  await writeFile(path, `${JSON.stringify(fc)}\n`);
  console.log(`wrote ${path}`);
}

await writeFootprintGeoJSON("barolo-footprint", "barolo", "Barolo", footprints.barolo, resolved.barolo.length);
await writeFootprintGeoJSON(
  "barbaresco-footprint",
  "barbaresco",
  "Barbaresco",
  footprints.barbaresco,
  resolved.barbaresco.length,
);
await writeFootprintGeoJSON(
  "piemonte-outline",
  "piemonte",
  "Piemonte (Barolo + Barbaresco pilot)",
  piemonteOutline,
  resolved.barolo.length + resolved.barbaresco.length,
);

// Provenance record: exact source URL + licence pinned, plus the rejected
// alternative and why, so this spike doesn't need re-doing.
const provenance = {
  chosen_source: {
    id: "guglielmo/geojson-italy (region-scoped file; formerly openpolis/geojson-italy — GitHub redirects)",
    url: PILOT_SOURCE_URL,
    crs: "EPSG:4326 (WGS84 lon/lat, per repo README)",
    licence: PILOT_LICENCE,
    detected_properties: {
      name_prop: PILOT_NAME_PROP,
      pro_com_prop: PILOT_PRO_COM_PROP,
      sample: istat.features[0].properties,
    },
    feature_count: istat.features.length,
    note:
      "These PILOT_* property names are local to this script, not istat-lib.mjs — the shared " +
      "adapter's NAME_PROP/PRO_COM_PROP stay the canonical ISTAT COMUNE/PRO_COM.",
  },
  rejected_candidates: [
    {
      id: "teamdigitale/confini-amministrativi-istat (20190101/geojson/comuni/comuni.json)",
      url: "https://raw.githubusercontent.com/teamdigitale/confini-amministrativi-istat/develop/20190101/geojson/comuni/comuni.json",
      verified_properties: { COMUNE: "Caresanablot", PRO_COM: 2031, PRO_COM_T: "002031" },
      rejected_reason:
        "geometry CRS is EPSG:32632 (UTM zone 32N, metres), not EPSG:4326 (lon/lat) — " +
        "incompatible with this script's lon/lat window assertions and SVG/HTML projections " +
        "without adding a reprojection step this task doesn't need. Property names are the " +
        "canonical ISTAT COMUNE/PRO_COM (matching istat-lib.mjs's shared defaults verbatim), " +
        "unlike the chosen source's reprojected mirror property names.",
    },
  ],
  retrieved_at: generatedAt,
};
await writeFile(`${OUT_DIR}/piedmont-source-provenance.json`, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`wrote ${OUT_DIR}/piedmont-source-provenance.json`);

await writeFile(
  `${OUT_DIR}/piedmont-resolved.json`,
  `${JSON.stringify(
    {
      note:
        "Matched PRO_COM per comune, for the record. The committed data/wine-map/*-comuni.json " +
        "artifacts are NOT mutated by this script — their istat_pro_com fields stay null.",
      barolo: resolved.barolo,
      barbaresco: resolved.barbaresco,
      generated_at: generatedAt,
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${OUT_DIR}/piedmont-resolved.json`);

const SUBTITLE =
  "Whole-comune over-approximation: partial comuni are included whole — pilot preview, not a delimited-parcel boundary";

// --- France-styled labelled SVG preview -----------------------------------
{
  const bbox = bboxOfPoints(allPoints);
  const pad = 0.03;
  const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
  const TARGET = 1100;
  const scale = TARGET / Math.max(e - w, n - s);
  const W = ((e - w) * scale).toFixed(0);
  const H = ((n - s) * scale).toFixed(0);
  const project = ([x, y]) => `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
  const projectCentroid = (geometry) => {
    const [cx, cy] = centroidOf(geometry);
    return [(cx - w) * scale, (n - cy) * scale];
  };
  const haloText = (x, y, size, text, opts = {}) => {
    const { ink = LABEL_INK, halo = LABEL_HALO, haloWidth = 3, weight = "normal", anchor = "middle" } = opts;
    const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return (
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${weight}" ` +
      `text-anchor="${anchor}" paint-order="stroke" stroke="${halo}" stroke-width="${haloWidth}" ` +
      `stroke-linejoin="round" fill="${ink}">${safe}</text>`
    );
  };

  let outlines = "";
  let labels = "";
  for (const denom of denomData) {
    for (const m of denom.matches) {
      const g = m.feature.geometry;
      let d = "";
      eachRing(g, (ring) => {
        d += `M${ring.map(project).join("L")}Z`;
      });
      outlines += `<path d="${d}" fill="#8C8378" fill-opacity="0.06" stroke="#8C8378" stroke-opacity="0.5" stroke-width="0.6"/>`;
      const [cx, cy] = projectCentroid(g);
      labels += haloText(cx, cy, 8.5, m.name, { ink: "#5a4a40", halo: PARCHMENT, haloWidth: 2.2, weight: "normal" });
    }
  }

  let footprintPaths = "";
  let footprintLabels = "";
  for (const denom of denomData) {
    const geometry = footprints[denom.key];
    let d = "";
    for (const part of toParts(geometry)) {
      for (const ring of part) d += `M${ring.map(project).join("L")}Z`;
    }
    footprintPaths += `<path d="${d}" fill="${denom.fill}" fill-opacity="0.55" stroke="${CASING}" stroke-width="2.2"/>`;
    const [cx, cy] = projectCentroid(geometry);
    footprintLabels += haloText(cx, cy, 15, denom.label.toUpperCase(), { haloWidth: 3.5, weight: "bold" });
  }

  const title = haloText(W / 2, 28, 20, "Piemonte — Barolo & Barbaresco (pilot)", {
    haloWidth: 4,
    weight: "bold",
  });
  const subtitle = haloText(W / 2, 46, 10.5, SUBTITLE, { ink: "#5a4a40", haloWidth: 2.5 });

  // Legend: swatches bottom-left.
  const legendX = 24;
  const legendYStart = Number(H) - 24 - DENOMINATIONS.length * 22;
  let legend = `<rect x="${legendX - 12}" y="${legendYStart - 20}" width="220" height="${DENOMINATIONS.length * 22 + 32}" fill="${PARCHMENT}" fill-opacity="0.88" stroke="#8C8378" stroke-width="0.6"/>`;
  legend += haloText(legendX, legendYStart - 4, 11, "Legend", { anchor: "start", weight: "bold", haloWidth: 2 });
  denomData.forEach((denom, i) => {
    const y = legendYStart + 22 * i + 14;
    legend += `<rect x="${legendX}" y="${y - 10}" width="14" height="14" fill="${denom.fill}" fill-opacity="0.85" stroke="${CASING}" stroke-width="1"/>`;
    legend += haloText(legendX + 20, y + 1, 11, denom.label, { anchor: "start", haloWidth: 2 });
  });

  // North arrow: north-up equirectangular projection needs no rotation.
  const naX = Number(W) - 46;
  const naY = 54;
  const northArrow =
    `<g>` +
    `<line x1="${naX}" y1="${naY + 22}" x2="${naX}" y2="${naY - 10}" stroke="${LABEL_INK}" stroke-width="2"/>` +
    `<polygon points="${naX},${naY - 20} ${naX - 7},${naY - 8} ${naX + 7},${naY - 8}" fill="${LABEL_INK}" stroke="${CASING}" stroke-width="0.8"/>` +
    haloText(naX, naY + 36, 12, "N", { weight: "bold", haloWidth: 2.5 }) +
    `</g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
    `<rect width="${W}" height="${H}" fill="${PARCHMENT}"/>` +
    outlines +
    footprintPaths +
    labels +
    footprintLabels +
    title +
    subtitle +
    legend +
    northArrow +
    `</svg>\n`;
  await writeFile(`${OUT_DIR}/piedmont-preview.svg`, svg);
  console.log(`wrote ${OUT_DIR}/piedmont-preview.svg (${W}x${H})`);
}

// --- France-styled standalone MapLibre HTML preview -----------------------
{
  // Read back the just-written footprint GeoJSONs (not the in-memory
  // objects) so the HTML demonstrably reflects the files actually on disk.
  const baroloFC = JSON.parse(await readFile(`${OUT_DIR}/barolo-footprint.geojson`, "utf8"));
  const barbarescoFC = JSON.parse(await readFile(`${OUT_DIR}/barbaresco-footprint.geojson`, "utf8"));
  const baroloGeom = baroloFC.features[0].geometry;
  const barbarescoGeom = barbarescoFC.features[0].geometry;

  const combinedBbox = bboxOfPoints([...flattenPoints(baroloGeom), ...flattenPoints(barbarescoGeom)]);
  const [minLon, minLat, maxLon, maxLat] = combinedBbox;
  const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

  const labelsFC = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "BAROLO" }, geometry: { type: "Point", coordinates: centroidOf(baroloGeom) } },
      { type: "Feature", properties: { name: "BARBARESCO" }, geometry: { type: "Point", coordinates: centroidOf(barbarescoGeom) } },
    ],
  };

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Piemonte — Barolo &amp; Barbaresco (pilot)</title>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  html, body, #map { height: 100%; margin: 0; }
  body { font-family: sans-serif; }
  .title {
    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(244, 240, 228, 0.92); border: 1px solid #8C8378; border-radius: 4px;
    padding: 6px 16px; font-weight: bold; font-size: 16px; color: ${LABEL_INK};
  }
  .legend {
    position: absolute; bottom: 24px; left: 24px;
    background: rgba(244, 240, 228, 0.92); border: 1px solid #8C8378; border-radius: 4px;
    padding: 10px 14px; font-size: 13px; color: ${LABEL_INK};
  }
  .legend .row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .legend .swatch { display: inline-block; width: 13px; height: 13px; border: 1px solid ${CASING}; }
</style>
</head>
<body>
<div id="map"></div>
<div class="title">Piemonte — Barolo &amp; Barbaresco (pilot)</div>
<div class="legend">
  <div class="row"><span class="swatch" style="background:${DENOMINATIONS[0].fill}"></span>Barolo</div>
  <div class="row"><span class="swatch" style="background:${DENOMINATIONS[1].fill}"></span>Barbaresco</div>
</div>
<script>
const BAROLO_FOOTPRINT = ${JSON.stringify(baroloFC)};
const BARBARESCO_FOOTPRINT = ${JSON.stringify(barbarescoFC)};
const LABELS = ${JSON.stringify(labelsFC)};
const BOUNDS = [[${minLon}, ${minLat}], [${maxLon}, ${maxLat}]];

const map = new maplibregl.Map({
  container: "map",
  style: ${JSON.stringify(BASEMAP_STYLE)},
  center: [${center[0]}, ${center[1]}],
  zoom: 10,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

map.on("load", () => {
  map.addSource("barolo-footprint", { type: "geojson", data: BAROLO_FOOTPRINT });
  map.addSource("barbaresco-footprint", { type: "geojson", data: BARBARESCO_FOOTPRINT });
  map.addSource("denomination-labels", { type: "geojson", data: LABELS });

  map.addLayer({
    id: "barolo-fill", type: "fill", source: "barolo-footprint",
    paint: { "fill-color": ${JSON.stringify(DENOMINATIONS[0].fill)}, "fill-opacity": 0.5 },
  });
  map.addLayer({
    id: "barolo-casing", type: "line", source: "barolo-footprint",
    paint: { "line-color": ${JSON.stringify(CASING)}, "line-width": 2 },
  });
  map.addLayer({
    id: "barbaresco-fill", type: "fill", source: "barbaresco-footprint",
    paint: { "fill-color": ${JSON.stringify(DENOMINATIONS[1].fill)}, "fill-opacity": 0.5 },
  });
  map.addLayer({
    id: "barbaresco-casing", type: "line", source: "barbaresco-footprint",
    paint: { "line-color": ${JSON.stringify(CASING)}, "line-width": 2 },
  });
  map.addLayer({
    id: "denomination-labels", type: "symbol", source: "denomination-labels",
    layout: {
      "text-field": ["get", "name"],
      "text-size": 14,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
    },
    paint: {
      "text-color": ${JSON.stringify(LABEL_INK)},
      "text-halo-color": ${JSON.stringify(LABEL_HALO)},
      "text-halo-width": 1.7,
    },
  });

  map.fitBounds(BOUNDS, { padding: 48, duration: 0 });
});
</script>
</body>
</html>
`;
  await writeFile(`${OUT_DIR}/piedmont-preview.html`, html);
  console.log(`wrote ${OUT_DIR}/piedmont-preview.html`);
}

console.log("DONE: local Piedmont footprints + preview written, no DB/bucket writes.");
