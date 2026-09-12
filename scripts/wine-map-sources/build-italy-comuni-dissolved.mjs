// Rebuild a footprint in data/wine-map/<region>-comuni-dissolved.geojson from
// the committed comune membership in italy-doc-membership.json.
//
// This closes the gap recover-italy-comuni.mjs was written to expose. The
// configs that originally produced these footprints lived in .tiles-build/,
// which is git-ignored, so the shapes were in the repo but the lists that made
// them were not: you could look at a footprint and not check it. Recovery
// reconstructed the lists from the geometry; this script makes the round trip
// close, so the membership file is the build input rather than a record of one.
// Correct a comune list, re-run this, and the geometry follows.
//
// Method, matching what the artifacts record: union the whole ISTAT comune
// polygons, drop interior rings, round to 5dp. A comune the disciplinare admits
// only in part is included whole — a deliberate over-approximation at comune
// resolution, noted in each file's _provenance.
//
// ONLY THE NAMED FOOTPRINTS ARE REWRITTEN. Re-unioning every footprint would
// rewrite all 61 with a symmetric difference of about 0.005% against what is
// committed — pure floating-point noise from a different union order, spread
// over every file, burying the one real change. --verify is how the others are
// checked: it rebuilds each footprint in memory and compares areas, asserting
// the committed shape still follows from the committed list.
//
// Usage:
//   node scripts/wine-map-sources/build-italy-comuni-dissolved.mjs --verify
//   node scripts/wine-map-sources/build-italy-comuni-dissolved.mjs "sicily/Etna" "puglia/copertino"
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";

const COMUNI = ".tiles-build/sicily/it-comuni.geojson";
const MEMBERSHIP = "data/wine-map/italy-doc-membership.json";
// Union order and 5dp rounding move the area by a few parts in 100 000. Well
// above that noise, far below a whole comune: the smallest Italian comune is
// some 0.15% of the smallest footprint here.
const AREA_TOLERANCE = 0.001;
// Square degrees. About 12 square kilometres at these latitudes would be 1e-3;
// this is roughly a hectare — far above a rounding sliver, far below any comune.
const MIN_RING_AREA = 1e-6;
const shoelace = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return s / 2;
};

const argv = process.argv.slice(2);
const verify = argv.includes("--verify");
const targets = argv.filter((a) => !a.startsWith("--"));
assert.ok(verify || targets.length, "name the footprints to rebuild, or pass --verify");

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({
  connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const comuni = JSON.parse(await readFile(COMUNI, "utf8"));
const byIstat = new Map(comuni.features.map((f) => [f.properties.com_istat_code, f]));

const splitKey = (key) => [key.slice(0, key.indexOf("/")), key.slice(key.indexOf("/") + 1)];

async function union(key) {
  const geoms = membership.footprints[key].comuni.map((c) => {
    const f = byIstat.get(c.istat);
    assert.ok(f, `${key}: ISTAT code ${c.istat} (${c.name}) is not in the gazetteer`);
    return JSON.stringify(f.geometry);
  });
  const { rows } = await client.query(
    `select extensions.ST_AsGeoJSON(
              extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(
                  extensions.ST_Union(
                    array(select extensions.ST_MakeValid(extensions.ST_SetSRID(
                                   extensions.ST_GeomFromGeoJSON(g), 4326))
                          from unnest($1::text[]) g))), 3), 5) as gj`,
    [geoms],
  );
  let g = JSON.parse(rows[0].gj);
  if (g.type === "Polygon") g = { type: "MultiPolygon", coordinates: [g.coordinates] };
  // Interior rings are NOT dropped wholesale, which is what the artifacts
  // previously did. Two of these zones have a genuine hole: the Copertino
  // disciplinare excludes San Pietro in Lama and the Colline Teramane one
  // excludes Montefino, and each is entirely surrounded by comuni that ARE
  // members. Filling those rings back in puts the excluded comune inside the
  // zone on the map — the very error the audit found in the list.
  //
  // What does have to go is the sliver ring left by 5dp rounding along a shared
  // border. The two are not close: a sliver is around 1e-9 square degrees, an
  // excluded comune around 1e-3. The threshold sits in the empty space between.
  g.coordinates = g.coordinates.map((poly) =>
    [poly[0], ...poly.slice(1).filter((ring) => Math.abs(shoelace(ring)) >= MIN_RING_AREA)]);
  return g;
}

const areaOf = async (geom) => Number((await client.query(
  `select extensions.ST_Area(extensions.ST_MakeValid(extensions.ST_SetSRID(
            extensions.ST_GeomFromGeoJSON($1), 4326))) a`, [JSON.stringify(geom)])).rows[0].a);

if (verify) {
  let worst = { key: null, drift: 0 }, failed = 0;
  for (const key of Object.keys(membership.footprints)) {
    const [slug, name] = splitKey(key);
    const fc = JSON.parse(await readFile(`data/wine-map/${slug}-comuni-dissolved.geojson`, "utf8"));
    const prev = fc.features.find((f) => f.properties.name === name);
    assert.ok(prev, `${key}: no feature of that name in the artifact`);
    const [a, b] = [await areaOf(prev.geometry), await areaOf(await union(key))];
    const drift = Math.abs(a - b) / a;
    if (drift > worst.drift) worst = { key, drift };
    if (drift > AREA_TOLERANCE) {
      failed++;
      console.log(`  DRIFT ${key}: committed area differs from its comune list by ${(drift * 100).toFixed(3)}%`);
    }
  }
  console.log(`\n${Object.keys(membership.footprints).length} verified, ${failed} outside tolerance. `
    + `Worst: ${worst.key} at ${(worst.drift * 100).toFixed(4)}%.`);
} else {
  for (const key of targets) {
    assert.ok(membership.footprints[key], `no footprint "${key}" in ${MEMBERSHIP}`);
    const [slug, name] = splitKey(key);
    const file = `data/wine-map/${slug}-comuni-dissolved.geojson`;
    const fc = JSON.parse(await readFile(file, "utf8"));
    const feat = fc.features.find((f) => f.properties.name === name);
    assert.ok(feat, `${key}: no feature of that name in ${file}`);

    const before = { parts: feat.geometry.coordinates.length, area: await areaOf(feat.geometry) };
    feat.geometry = await union(key);
    feat.properties = { ...feat.properties, name, comuni_count: membership.footprints[key].comuni.length };
    const after = { parts: feat.geometry.coordinates.length, area: await areaOf(feat.geometry) };

    // The file's own method note has to change with it: these artifacts used to
    // say interior rings were dropped, and for a rebuilt footprint that is no
    // longer true.
    fc._provenance = {
      ...fc._provenance,
      method: "comune-union: ISTAT comuni dissolved per disciplinare comune lists (comune-level "
        + "approximation; 5dp). Partial-territory comuni are included whole. Interior rings are kept "
        + "where a comune the disciplinare excludes is surrounded by comuni it includes; rounding "
        + "slivers below 1e-6 square degrees are dropped.",
      reviewed_at: new Date().toISOString().slice(0, 10),
    };
    await writeFile(file, `${JSON.stringify(fc)}\n`);
    console.log(`${key}: ${membership.footprints[key].comuni.length} comuni, `
      + `${before.parts} -> ${after.parts} parts, area ${((after.area / before.area - 1) * 100).toFixed(2)}%`);
  }
}

await client.end();
