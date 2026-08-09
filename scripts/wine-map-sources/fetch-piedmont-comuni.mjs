// Task 2 (local-only pilot): dissolve the Barolo and Barbaresco member
// comuni into two denomination footprints plus a combined Piemonte region
// outline, and render a France-styled labelled SVG preview — entirely on
// disk. This script makes NO Supabase/database/bucket writes; a DB-writing
// mode is a later task's concern (YAGNI — do not build it here).
//
// Membership source of truth: data/wine-map/{barolo,barbaresco}-comuni.json
// (reviewed artifacts — see their `provenance`/`footprint_treatment` blocks
// for the whole-comune-union model and the Alba-exclusion rationale).
// Geometry source: ISTAT comuni boundaries, pinned in istat-lib.mjs
// (ISTAT_COMUNI_URL) — see that file's header for why this source was
// chosen over teamdigitale/confini-amministrativi-istat (wrong CRS).
//
// Footprint method: collect every member comune's polygon vertices as
// [lon,lat] points and compute one concave hull per denomination with
// concaveman (the same engine class as concave-engine.mjs's client-side
// region generalizer). This is a hull over the member comuni, not a true
// polygon union — acceptable for a pilot preview; a later task can swap in
// PostGIS ST_Union once a DB mode exists.
//
// Usage: node scripts/wine-map-sources/fetch-piedmont-comuni.mjs --local-only
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import concaveman from "concaveman";
import {
  ISTAT_COMUNI_URL,
  ISTAT_LICENCE,
  NAME_PROP,
  PRO_COM_PROP,
  matchComune,
} from "./istat-lib.mjs";

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
function eachRing(geometry, cb) {
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) for (const ring of poly) cb(ring);
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

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

// Concave hull over a bag of [lon,lat] points -> a closed GeoJSON MultiPolygon
// (single part) footprint.
function hullFootprint(points, concavity = 2) {
  const hull = concaveman(points, concavity);
  const ring = hull.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: "MultiPolygon", coordinates: [[ring]] };
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
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    parts += 1;
    for (const ring of poly) vertices += ring.length;
  }
  return { vertices, parts };
}

function areaOf(geometry) {
  let total = 0;
  eachRing(geometry, (ring) => {
    total += ringArea(ring);
  });
  return total;
}

// --- 1. fetch the ISTAT comuni layer -------------------------------------
console.log(`fetching ISTAT comuni: ${ISTAT_COMUNI_URL}`);
const res = await fetch(ISTAT_COMUNI_URL);
if (!res.ok) throw new Error(`ISTAT comuni fetch -> ${res.status} ${res.statusText}`);
const istat = await res.json();
assert.ok(Array.isArray(istat.features) && istat.features.length > 0, "empty ISTAT comuni layer");
console.log(`fetched ${istat.features.length} ISTAT comuni features`);
console.log(`first feature properties: ${JSON.stringify(istat.features[0].properties)}`);
assert.ok(
  NAME_PROP in istat.features[0].properties,
  `NAME_PROP "${NAME_PROP}" not present on first ISTAT feature — property keys drifted`,
);
assert.ok(
  PRO_COM_PROP in istat.features[0].properties,
  `PRO_COM_PROP "${PRO_COM_PROP}" not present on first ISTAT feature — property keys drifted`,
);

// --- 2. match each denomination's expected comuni, fail-closed ----------
const resolved = {};
const denomData = [];
for (const denom of DENOMINATIONS) {
  const artifact = JSON.parse(await readFile(denom.artifact, "utf8"));
  const expected = artifact.comuni.filter((c) => c.in_footprint !== false);
  const matches = expected.map((c) => {
    const hits = istat.features.filter((f) => matchComune(f, c.name));
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
    pro_com: m.feature.properties[PRO_COM_PROP],
  }));
  denomData.push({ ...denom, artifact, matches });
}

assert.equal(resolved.barolo.length, 11, `expected 11 Barolo comuni, matched ${resolved.barolo.length}`);
assert.equal(
  resolved.barbaresco.length,
  3,
  `expected 3 Barbaresco-footprint comuni (Barbaresco+Neive+Treiso), matched ${resolved.barbaresco.length}`,
);

// --- 3. dissolve: one concave-hull footprint per denomination, + region -
const footprints = {};
const allPoints = [];
for (const denom of denomData) {
  const points = denom.matches.flatMap((m) => flattenPoints(m.feature.geometry));
  allPoints.push(...points);
  const geometry = hullFootprint(points);
  footprints[denom.key] = geometry;
}
const piemonteOutline = hullFootprint(allPoints);

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
  `area sanity: barolo=${baroloArea.toFixed(6)} > barbaresco=${barbarescoArea.toFixed(6)} (deg^2, planar)`,
);

// --- write outputs --------------------------------------------------------
await mkdir(OUT_DIR, { recursive: true });
const generatedAt = new Date().toISOString();

async function writeFootprintGeoJSON(fileSlug, key, label, geometry, comuneCount) {
  const fc = {
    type: "FeatureCollection",
    properties: {
      generation: {
        engine: "concaveman-footprint (local dissolve, Task 2 pilot)",
        denomination: label,
        comune_count: comuneCount,
        source: ISTAT_COMUNI_URL,
        licence: ISTAT_LICENCE,
        generated_at: generatedAt,
        note:
          "Concave hull over member-comune vertices, not a true polygon union " +
          "(no DB in this task). See task-2-report.md for caveats.",
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
    url: ISTAT_COMUNI_URL,
    crs: "EPSG:4326 (WGS84 lon/lat, per repo README)",
    licence: ISTAT_LICENCE,
    detected_properties: {
      name_prop: NAME_PROP,
      pro_com_prop: PRO_COM_PROP,
      sample: istat.features[0].properties,
    },
    feature_count: istat.features.length,
  },
  rejected_candidates: [
    {
      id: "teamdigitale/confini-amministrativi-istat (20190101/geojson/comuni/comuni.json)",
      url: "https://raw.githubusercontent.com/teamdigitale/confini-amministrativi-istat/develop/20190101/geojson/comuni/comuni.json",
      verified_properties: { COMUNE: "Caresanablot", PRO_COM: 2031, PRO_COM_T: "002031" },
      rejected_reason:
        "geometry CRS is EPSG:32632 (UTM zone 32N, metres), not EPSG:4326 (lon/lat) — " +
        "incompatible with this script's lon/lat window assertions and SVG projection " +
        "without adding a reprojection step this task doesn't need. Property names " +
        "(COMUNE/PRO_COM) DID match the istat-lib.mjs defaults verbatim, unlike the chosen source.",
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
  const centroidPx = (geometry) => {
    const b = bboxOfPoints(flattenPoints(geometry));
    return [((b[0] + b[2]) / 2 - w) * scale, (n - (b[1] + b[3]) / 2) * scale];
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
      const [cx, cy] = centroidPx(g);
      labels += haloText(cx, cy, 8.5, m.name, { ink: "#5a4a40", halo: PARCHMENT, haloWidth: 2.2, weight: "normal" });
    }
  }

  let footprintPaths = "";
  let footprintLabels = "";
  for (const denom of denomData) {
    const geometry = footprints[denom.key];
    let d = "";
    for (const poly of geometry.coordinates) {
      for (const ring of poly) d += `M${ring.map(project).join("L")}Z`;
    }
    footprintPaths += `<path d="${d}" fill="${denom.fill}" fill-opacity="0.55" stroke="${CASING}" stroke-width="2.2"/>`;
    const [cx, cy] = centroidPx(geometry);
    footprintLabels += haloText(cx, cy, 15, denom.label.toUpperCase(), { haloWidth: 3.5, weight: "bold" });
  }

  const title = haloText(W / 2, 28, 20, "Piemonte — Barolo & Barbaresco (pilot)", {
    haloWidth: 4,
    weight: "bold",
  });
  const subtitle = haloText(
    W / 2,
    46,
    10.5,
    "Whole-comune concave-hull footprints, pilot preview — not a delimited-parcel boundary",
    { ink: "#5a4a40", haloWidth: 2.5 },
  );

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

console.log("DONE: local Piedmont footprints + preview written, no DB/bucket writes.");
