// Extract mainland Portugal (Portugal Continental) from Natural Earth 1:50m
// admin-0 countries into raw + normalized repo artifacts. Mirrors
// scripts/wine-map-tiles/extract-italy-ne.mjs.
//
// Madeira and the Azores are deliberately outside the window. The Azores carry
// no wine place in the tree, and Madeira gets its own region boundary from
// CAOP 2025 (RAM) at far higher resolution than Natural Earth 1:50m, which
// resolves the island in twelve points and omits Porto Santo entirely. The
// consequence is that the country fill covers the mainland only and the
// Madeira region blob stands alone in the Atlantic, which is what the country
// key means here ("Portugal Continental" in every Portuguese source).
//
// Usage: node scripts/wine-map-tiles/extract-portugal-ne.mjs extract <ne_geojson>
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const RAW_PATH = "data/wine-map/portugal-ne50m-raw.geojson";
const NORM_PATH = "data/wine-map/portugal-mainland-ne50m.geojson";
const BOX = { minLon: -9.6, minLat: 36.9, maxLon: -6.1, maxLat: 42.2 };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex").toUpperCase();

if (process.argv[2] !== "extract") throw new Error("mode must be extract");

const collection = JSON.parse(await readFile(process.argv[3], "utf8"));
const portugal = collection.features.find((f) => f.properties?.ADM0_A3 === "PRT");
if (!portugal) throw new Error("Portugal (ADM0_A3=PRT) not found");

const inBox = ([lon, lat]) =>
  lon >= BOX.minLon && lon <= BOX.maxLon && lat >= BOX.minLat && lat <= BOX.maxLat;
const polygons =
  portugal.geometry.type === "Polygon"
    ? [portugal.geometry.coordinates]
    : portugal.geometry.coordinates;
const kept = polygons.filter((poly) => poly[0].every(inBox));

const round = (n) => Math.round(n * 1e4) / 1e4;
const cleanRing = (ring) => {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon), round(lat)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  const [first] = out;
  const last = out[out.length - 1];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out;
};
const cleaned = kept
  .map((poly) => poly.map(cleanRing).filter((ring) => ring.length >= 4))
  .filter((poly) => poly.length > 0);
if (cleaned.length === 0) throw new Error("no Portugal components survived the window");

await mkdir("data/wine-map", { recursive: true });
await writeFile(RAW_PATH, `${JSON.stringify(portugal)}\n`);
const normalized = {
  type: "Feature",
  properties: {
    source: "Natural Earth 1:50m admin_0_countries ADM0_A3=PRT",
    filter: "components fully inside lon [-9.6,-6.1], lat [36.9,42.2] (mainland only; Madeira and the Azores excluded)",
    precision: 4,
  },
  geometry: { type: "MultiPolygon", coordinates: cleaned },
};
await writeFile(NORM_PATH, `${JSON.stringify(normalized)}\n`);

console.log("COMPONENTS total=" + polygons.length + " kept=" + cleaned.length);
console.log("POINTS", cleaned.flat(2).length);
console.log("RAW-SHA256", sha256(await readFile(RAW_PATH)));
console.log("NORM-SHA256", sha256(await readFile(NORM_PATH)));
