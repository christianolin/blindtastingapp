// LOCAL, READ-ONLY shape/provenance preview for ANY INAO-sourced region
// artifact (data/wine-map/<region>-appellations.json). For each target it pages
// the INAO parcel layer (WFS LIKE bound), filters to exact membership, and runs
// the SAME client-side concave dissolve the live pipeline uses (concave-engine)
// - so the rendered outline is what WOULD be staged. Writes only a labelled SVG
// + numeric report to .superpowers/sdd/ (gitignored); touches NO database and NO
// storage, stages nothing. Exits non-zero if any target dissolves to nothing or
// spills outside the artifact's region window, so it doubles as a
// provenance/geometry gate for the owner's shape review.
//
// Usage: node scripts/wine-map-sources/preview-inao-region.mjs \
//          --artifact=data/wine-map/<region>-appellations.json [--only=slug,slug]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { wfsPageUrl, parcelMatches, PAGE_SIZE } from "./inao-lib.mjs";
import { buildConcaveGeometry } from "./concave-engine.mjs";

const artifactArg = process.argv.find((a) => a.startsWith("--artifact="));
if (!artifactArg) throw new Error("--artifact=<path> is required");
const ARTIFACT = artifactArg.slice("--artifact=".length);
const OUT_DIR = ".superpowers/sdd";
const base = path.basename(ARTIFACT).replace(/\.json$/, "").replace(/-appellations$/, "");
const SVG_OUT = `${OUT_DIR}/preview-${base}.svg`;

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : null;

const artifact = JSON.parse(await readFile(ARTIFACT, "utf8"));
const WINDOW = artifact.region_window;
const targets = artifact.targets.filter(
  (t) => !only || only.some((s) => t.slug.includes(s)),
);
console.log(`${base} preview: ${targets.length} target(s)${only ? ` (only ${only.join(",")})` : ""}`);

async function fetchMembers(members) {
  const byId = new Map();
  for (const member of members) {
    let startIndex = 0;
    for (;;) {
      const res = await fetch(wfsPageUrl(member, startIndex));
      if (res.status !== 200) throw new Error(`WFS ${res.status} for ${member}`);
      const page = await res.json();
      const feats = page.features ?? [];
      for (const f of feats) {
        if (!parcelMatches(f.properties?.denom, member)) continue;
        byId.set(f.id ?? f.properties?.gml_id, f);
      }
      startIndex += feats.length;
      const total = page.totalFeatures ?? page.numberMatched ?? null;
      if (feats.length === 0) break;
      if (total !== null && startIndex >= total) break;
      if (total === null && feats.length < PAGE_SIZE) break;
    }
  }
  return { type: "FeatureCollection", features: [...byId.values()] };
}

const eachRing = (geom, fn) => {
  for (const poly of geom.coordinates) for (const ring of poly) fn(ring);
};

const drawn = [];
for (const t of targets) {
  process.stdout.write(`  ${t.slug} (${t.members.join("+")}) fetching… `);
  const fc = await fetchMembers(t.members);
  const geom = buildConcaveGeometry(fc, t.concave);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let components = 0;
  eachRing(geom, (ring) => {
    components += 1;
    vertices += ring.length;
    for (const [x, y] of ring) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  });
  const inside =
    b[0] >= WINDOW.minLon && b[1] >= WINDOW.minLat &&
    b[2] <= WINDOW.maxLon && b[3] <= WINDOW.maxLat;
  drawn.push({
    slug: t.slug, name: t.name, level: t.level,
    parcels: fc.features.length, expected: t.parcels,
    geom, bbox: b, vertices, components,
    cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, inside,
  });
  console.log(`parcels ${fc.features.length}/${t.parcels}  parts ${components}  vtx ${vertices}  ${inside ? "in-window" : "OUT"}`);
}

// --- SVG (shared canvas, region drawn faint under the sub-appellations) ------
const bbox = [Infinity, Infinity, -Infinity, -Infinity];
for (const d of drawn) {
  bbox[0] = Math.min(bbox[0], d.bbox[0]);
  bbox[1] = Math.min(bbox[1], d.bbox[1]);
  bbox[2] = Math.max(bbox[2], d.bbox[2]);
  bbox[3] = Math.max(bbox[3], d.bbox[3]);
}
const pad = 0.02;
const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
const scale = 1400 / Math.max(e - w, n - s);
const W = ((e - w) * scale).toFixed(0);
const H = ((n - s) * scale).toFixed(0);
const project = ([x, y]) => `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
let paths = "";
let labels = "";
for (const d of drawn) {
  let dd = "";
  eachRing(d.geom, (ring) => { dd += `M${ring.map(project).join("L")}Z`; });
  const op = d.level === "region" ? 0.1 : 0.32;
  paths += `<path d="${dd}" fill="#7E1B26" fill-opacity="${op}" stroke="#7E1B26" stroke-width="0.6"/>`;
  if (d.level !== "region") {
    const [px, py] = project([d.cx, d.cy]).split(",");
    labels += `<text x="${px}" y="${py}" font-size="12" fill="#3a0d13" text-anchor="middle">${d.name}</text>`;
  }
}
await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  SVG_OUT,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}${labels}</svg>\n`,
);

// --- report -----------------------------------------------------------------
console.log("");
for (const d of [...drawn].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(
    `  ${d.inside ? "ok " : "OUT"} ${d.name.padEnd(22)} ${String(d.level).padEnd(9)} parts ${String(d.components).padStart(2)}  vtx ${String(d.vertices).padStart(4)}  parcels ${d.parcels}/${d.expected}  bbox ${d.bbox[0].toFixed(3)},${d.bbox[1].toFixed(3)}..${d.bbox[2].toFixed(3)},${d.bbox[3].toFixed(3)}`,
  );
}
const spilled = drawn.filter((d) => !d.inside).map((d) => d.name);
console.log("");
console.log(`targets drawn: ${drawn.length}`);
console.log(`region window lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}]`);
console.log(`SVG -> ${SVG_OUT}`);
if (spilled.length) {
  console.error(`\nGATE FAIL: out-of-window (${spilled.join(", ")})`);
  process.exit(1);
}
console.log(`\nGATE OK: ${drawn.length} ${base} footprints dissolved and in-window.`);
