// LOCAL, READ-ONLY shape-review preview for the Champagne region. Fetches the
// member-commune polygons (from the reviewed champagne-communes.json artifact)
// out of IGN Admin Express, assembles them into one GeoJSON, and renders a
// filled SVG + numeric sanity report for the owner's shape gate. Writes only
// to .superpowers/sdd/ (gitignored scratch); touches NO database and stages
// nothing. The union/generalize/stage step happens only after shape approval.
//
// Usage: node scripts/wine-map-sources/preview-champagne.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const COMMUNES_JSON = "data/wine-map/champagne-communes.json";
const OUT_DIR = ".superpowers/sdd";
const GEOJSON_OUT = `${OUT_DIR}/champagne-communes.geojson`;
const SVG_OUT = `${OUT_DIR}/preview-champagne.svg`;

const WFS = "https://data.geopf.fr/wfs/ows";
const LAYER = "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune";
// Communes déléguées: former communes absorbed into a commune nouvelle since
// the INAO export still list under their old INSEE code (real Champagne cases:
// Oger, Mareuil-sur-Aÿ, Bisseuil…). Their historical footprints live here.
const DELEGUEE_LAYER =
  "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune_associee_ou_deleguee";
const BATCH = 80;
// Champagne's real extent (Aisne west ~3.14, Aube/Haute-Marne south ~47.92,
// Marne core), with margin — a sane guard that still rejects gross spill.
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

const artifact = JSON.parse(await readFile(COMMUNES_JSON, "utf8"));
const wanted = artifact.communes.map((c) => c.insee);
console.log(`commune list: ${wanted.length} INSEE codes (${COMMUNES_JSON})`);

const features = [];
const gotInsee = new Set();

async function fetchCodes(codes, layer) {
  const res = await fetch(batchUrl(codes, layer));
  if (!res.ok) throw new Error(`WFS ${layer} -> ${res.status}`);
  const fc = await res.json();
  for (const f of fc.features ?? []) {
    const insee = f.properties?.code_insee;
    if (insee && !gotInsee.has(insee)) {
      gotInsee.add(insee);
      features.push({
        type: "Feature",
        properties: { code_insee: insee, nom: f.properties?.nom_officiel ?? "" },
        geometry: f.geometry,
      });
    }
  }
}

// Pass 1: current communes.
for (let i = 0; i < wanted.length; i += BATCH) {
  await fetchCodes(wanted.slice(i, i + BATCH), LAYER);
  process.stdout.write(`\r  fetched ${gotInsee.size}/${wanted.length}`);
}
// Pass 2: INSEE codes still missing are commune-nouvelle merges — the INAO
// list still names the historic communes, whose footprints live in the
// communes-déléguées layer. Fetching those keeps the footprint complete.
let missing = wanted.filter((c) => !gotInsee.has(c));
if (missing.length > 0) {
  for (let i = 0; i < missing.length; i += BATCH) {
    await fetchCodes(missing.slice(i, i + BATCH), DELEGUEE_LAYER);
  }
  process.stdout.write(
    `\r  fetched ${gotInsee.size}/${wanted.length} (incl. déléguées)`,
  );
}
process.stdout.write("\n");

missing = wanted.filter((c) => !gotInsee.has(c));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  GEOJSON_OUT,
  `${JSON.stringify({ type: "FeatureCollection", features })}\n`,
);

// --- numeric sanity ---------------------------------------------------------
const bbox = [Infinity, Infinity, -Infinity, -Infinity];
const eachRing = (geom, fn) => {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) fn(ring);
};
let vertices = 0;
for (const f of features)
  eachRing(f.geometry, (ring) => {
    vertices += ring.length;
    for (const [x, y] of ring) {
      bbox[0] = Math.min(bbox[0], x);
      bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x);
      bbox[3] = Math.max(bbox[3], y);
    }
  });

const inWindow =
  bbox[0] >= WINDOW.minLon &&
  bbox[1] >= WINDOW.minLat &&
  bbox[2] <= WINDOW.maxLon &&
  bbox[3] <= WINDOW.maxLat;

// --- SVG (display-simplified: round to 4 decimals, drop repeats) -------------
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
  // Chalk-white fill, Bordeaux hairline — overlapping communes read as one
  // dissolved footprint; the staged boundary will be their generalized union.
  paths += `<path d="${d}" fill="#7E1B26" fill-opacity="0.16" stroke="#7E1B26" stroke-width="0.4"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}</svg>\n`;
await writeFile(SVG_OUT, svg);

// --- report -----------------------------------------------------------------
console.log("");
console.log(`fetched communes : ${gotInsee.size}/${wanted.length}`);
if (missing.length) {
  console.log(`MISSING INSEE (${missing.length}): ${missing.join(", ")}`);
  console.log("  (likely commune-nouvelle merges since the INAO export — review)");
}
console.log(`components (communes drawn): ${features.length}`);
console.log(`total ring vertices: ${vertices}`);
console.log(
  `bbox lon ${bbox[0].toFixed(3)}..${bbox[2].toFixed(3)} lat ${bbox[1].toFixed(3)}..${bbox[3].toFixed(3)}`,
);
console.log(
  `inside display window lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}]: ${inWindow ? "yes" : "NO"}`,
);
console.log(`SVG  -> ${SVG_OUT}`);
console.log(`GEOJSON -> ${GEOJSON_OUT}`);
