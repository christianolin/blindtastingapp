// LOCAL, READ-ONLY shape-review preview for the 17 Champagne GRAND CRU villages.
// Fetches each Grand Cru commune footprint (by the INSEE codes in the reviewed
// champagne-grand-crus.json artifact) from IGN Admin Express, assembles them
// into one labelled GeoJSON + SVG, and prints a per-village numeric sanity
// report for the owner's shape gate. Writes only to .superpowers/sdd/
// (gitignored scratch); touches NO database and stages nothing. A Champagne
// Grand Cru is a COMMUNE rating, so each footprint is the whole village polygon
// (a documented over-approximation of the rated vineyard) — see artifact caveats.
// Exits non-zero if any village is missing or spills outside the Champagne
// window, so this doubles as a provenance/geometry gate.
//
// Usage: node scripts/wine-map-sources/preview-champagne-grand-crus.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const GC_JSON = "data/wine-map/champagne-grand-crus.json";
const OUT_DIR = ".superpowers/sdd";
const GEOJSON_OUT = `${OUT_DIR}/champagne-grand-crus.geojson`;
const SVG_OUT = `${OUT_DIR}/preview-champagne-grand-crus.svg`;

const WFS = "https://data.geopf.fr/wfs/ows";
const LAYER = "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune";
// Fallback for any historic code the current commune layer no longer carries
// (a commune nouvelle like Aÿ-Champagne / 51030 resolves in LAYER directly).
const DELEGUEE_LAYER =
  "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune_associee_ou_deleguee";
// Champagne's real extent with margin — same window the region preview uses.
const WINDOW = { minLon: 3.0, minLat: 47.8, maxLon: 5.05, maxLat: 49.6 };

function batchUrl(codes, layer) {
  const inList = codes.map((c) => `'${c}'`).join(",");
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: layer,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: "5000",
    cql_filter: `code_insee IN (${inList})`,
  });
  return `${WFS}?${params.toString()}`;
}

const artifact = JSON.parse(await readFile(GC_JSON, "utf8"));
const villages = artifact.villages;
const nameByInsee = new Map(villages.map((v) => [v.insee, v.name]));
const wanted = villages.map((v) => v.insee);
console.log(`grand cru villages: ${wanted.length} (${GC_JSON})`);

const featureByInsee = new Map();
async function fetchCodes(codes, layer) {
  const res = await fetch(batchUrl(codes, layer));
  if (!res.ok) throw new Error(`WFS ${layer} -> ${res.status}`);
  const fc = await res.json();
  for (const f of fc.features ?? []) {
    const insee = f.properties?.code_insee;
    if (insee && !featureByInsee.has(insee)) {
      featureByInsee.set(insee, {
        type: "Feature",
        properties: {
          code_insee: insee,
          name: nameByInsee.get(insee) ?? f.properties?.nom_officiel ?? "",
        },
        geometry: f.geometry,
      });
    }
  }
}

await fetchCodes(wanted, LAYER);
let missing = wanted.filter((c) => !featureByInsee.has(c));
if (missing.length) await fetchCodes(missing, DELEGUEE_LAYER);
missing = wanted.filter((c) => !featureByInsee.has(c));

const features = wanted
  .filter((c) => featureByInsee.has(c))
  .map((c) => featureByInsee.get(c));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  GEOJSON_OUT,
  `${JSON.stringify({ type: "FeatureCollection", features })}\n`,
);

// --- geometry helpers -------------------------------------------------------
const eachRing = (geom, fn) => {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) fn(ring);
};

const bbox = [Infinity, Infinity, -Infinity, -Infinity];
let vertices = 0;
const perVillage = [];
for (const f of features) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  let v = 0;
  eachRing(f.geometry, (ring) => {
    v += ring.length;
    for (const [x, y] of ring) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  });
  vertices += v;
  bbox[0] = Math.min(bbox[0], b[0]);
  bbox[1] = Math.min(bbox[1], b[1]);
  bbox[2] = Math.max(bbox[2], b[2]);
  bbox[3] = Math.max(bbox[3], b[3]);
  const inside =
    b[0] >= WINDOW.minLon &&
    b[1] >= WINDOW.minLat &&
    b[2] <= WINDOW.maxLon &&
    b[3] <= WINDOW.maxLat;
  perVillage.push({
    insee: f.properties.code_insee,
    name: f.properties.name,
    cx: (b[0] + b[2]) / 2,
    cy: (b[1] + b[3]) / 2,
    vertices: v,
    inside,
  });
}
const allInWindow =
  bbox[0] >= WINDOW.minLon &&
  bbox[1] >= WINDOW.minLat &&
  bbox[2] <= WINDOW.maxLon &&
  bbox[3] <= WINDOW.maxLat;

// --- SVG (labelled; display-simplified to 4 decimals) -----------------------
const pad = 0.03;
const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
const scale = 1400 / Math.max(e - w, n - s);
const W = ((e - w) * scale).toFixed(0);
const H = ((n - s) * scale).toFixed(0);
const project = ([x, y]) =>
  `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
const simplify = (ring) => {
  const out = [];
  for (const p of ring) {
    const r = [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== r[0] || prev[1] !== r[1]) out.push(r);
  }
  return out.length >= 4 ? out : ring;
};
let paths = "";
for (const f of features) {
  let d = "";
  eachRing(f.geometry, (ring) => {
    d += `M${simplify(ring).map(project).join("L")}Z`;
  });
  paths += `<path d="${d}" fill="#7E1B26" fill-opacity="0.18" stroke="#7E1B26" stroke-width="0.5"/>`;
}
let labels = "";
for (const v of perVillage) {
  const [px, py] = project([v.cx, v.cy]).split(",");
  const safe = v.name.replace(/&/g, "&amp;");
  labels += `<text x="${px}" y="${py}" font-size="11" fill="#3a0d13" text-anchor="middle">${safe}</text>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}${labels}</svg>\n`;
await writeFile(SVG_OUT, svg);

// --- report -----------------------------------------------------------------
console.log("");
for (const v of [...perVillage].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(
    `  ${v.inside ? "ok " : "OUT"} ${v.name.padEnd(20)} ${v.insee}  center ${v.cx.toFixed(3)},${v.cy.toFixed(3)}  ${v.vertices} pts`,
  );
}
console.log("");
console.log(`villages drawn : ${features.length}/${wanted.length}`);
if (missing.length) console.log(`MISSING INSEE (${missing.length}): ${missing.join(", ")}`);
console.log(`total ring vertices: ${vertices}`);
console.log(
  `bbox lon ${bbox[0].toFixed(3)}..${bbox[2].toFixed(3)} lat ${bbox[1].toFixed(3)}..${bbox[3].toFixed(3)}`,
);
console.log(
  `all inside window lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}]: ${allInWindow ? "yes" : "NO"}`,
);
console.log(`SVG  -> ${SVG_OUT}`);
console.log(`GEOJSON -> ${GEOJSON_OUT}`);

const spilled = perVillage.filter((v) => !v.inside).map((v) => v.name);
if (missing.length || spilled.length) {
  console.error(
    `\nGATE FAIL: ${missing.length} missing, ${spilled.length} out-of-window${spilled.length ? " (" + spilled.join(", ") + ")" : ""}`,
  );
  process.exit(1);
}
console.log("\nGATE OK: all 17 grand cru footprints present and in-window.");
