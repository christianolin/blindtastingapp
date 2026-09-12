// Build the Hessian wine footprints: ATKIS vineyard land clipped to the
// Gemeinden the Weinbauamt names.
//
// The division of labour is the whole point, and neither source is used for
// what the other governs:
//
//   the statute  decides WHICH Gemeinden carry the Rebflächen of each
//                Anbaugebiet and Bereich (hessen-weinbau-membership.json)
//   ATKIS        decides WHICH LAND inside them is actually vineyard
//                (AX_Landwirtschaft, vegetationsmerkmal 1040 Rebfläche)
//
// Taking the Gemeinden whole — the Spanish municipio-union and Italian
// comune-union pattern — is not available here. Rheingau's statutory list
// includes Frankfurt am Main, Wiesbaden and Felsberg; the union of those is a
// sprawl across half of Hessen for a region that is a strip along the Rhine
// plus two detached sites. Clipping to the vineyard class keeps Frankfurt's
// Lohrberger Hang and Felsberg's Böddiger Berg, which ARE members, without
// taking the cities and farmland around them, which are not.
//
// WHAT THIS FOOTPRINT IS, AND IS NOT. It is the vineyard land inside the
// statutory Gemeinden, as the survey authority records land use. It is NOT the
// Weinbergsrolle: a parcel planted with vines but not registered would be in,
// and a registered Lage lying fallow would be out. Rheinland-Pfalz publishes
// its Weinbergsrolle and so has the real thing; Hessen does not publish one at
// all, and this is the closest honest approximation from open data. The
// difference is recorded in the artifact's _provenance so nothing downstream
// mistakes one for the other.
//
// Usage: node scripts/wine-map-sources/build-hessen-weinbau.mjs [--write]
import { readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";

const SRC = path.resolve(".tiles-build", "sources", "hessen");
const MEMBERSHIP = "data/wine-map/hessen-weinbau-membership.json";
const OUT = "data/wine-map/hessen-weinbau-dissolved.geojson";
const REBFLAECHE = "1040";
const write = process.argv.includes("--write");

// The same morphological close build-germany-anbaugebiete.mjs applies to the
// six Rheinland-Pfalz Anbaugebiete, with the same constants, for the same
// reason and at the same cost.
//
// Vineyard parcels are scattered, and a raw union is unusable as a region
// outline: the Rheingau clip is 116 disconnected pieces. Left raw it would
// render as a scatter of specks at region zoom while Ahr — a SIXTH of the
// Rheingau's planted area, but closed — shows as one solid shape. Two regions
// built on different principles in the same country is the inconsistency the
// engine-label migration 20260913120000 existed to stop, and this is the same
// mistake in geometry rather than metadata.
//
// The cost is deliberate area inflation, recorded in _provenance. Precise
// vineyard extent is kept in the artifact's `hectares` property, which is
// measured BEFORE the close.
const CLOSE = 0.012;
const CLOSE_BACK = 0.008;

// ß is not a diacritic and NFD does not decompose it: the statute writes
// "Rossdorf" where ATKIS writes "Roßdorf", and without this rule that one
// Gemeinde silently fails to resolve. Same fix as src/lib/deaccent.ts.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ß/g, "ss").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");

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

// ---- 1. the statutory Gemeinden, resolved to AGS ---------------------------
const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const gemeindeGml = await readFile(path.join(SRC, "ax-gemeinde.gml"), "utf8");
const agsByName = new Map();
for (const m of gemeindeGml.matchAll(
  /<schluesselGesamt>(\d+)<\/schluesselGesamt>[\s\S]{0,400}?<bezeichnung>([^<]+)<\/bezeichnung>/g)) {
  const k = norm(m[2]);
  if (!agsByName.has(k)) agsByName.set(k, []);
  agsByName.get(k).push(m[1]);
}

const resolve = (names) => names.map((n) => {
  const hits = agsByName.get(norm(n)) ?? [];
  // Fail closed. A Gemeinde that silently drops out shrinks the footprint with
  // no other symptom, which is exactly how the Spanish lists went wrong.
  assert.equal(hits.length, 1, `"${n}": expected one ATKIS Gemeinde, got ${hits.length}`);
  return hits[0];
});

// ---- 2. load the geometry into Postgres ------------------------------------
// ST_GeomFromGML parses the AAA GML fragments directly, so the polygons never
// pass through a hand-written parser.
await client.query("begin");
await client.query(`create temp table gem (ags text, g extensions.geometry) on commit drop`);
await client.query(`create temp table vine (g extensions.geometry) on commit drop`);

const kg = await readFile(path.join(SRC, "ax-kommunalesgebiet.gml"), "utf8");
let nGem = 0;
for (const member of kg.split("<wfs:member>").slice(1)) {
  const ags = member.match(/<schluesselGesamt>(\d+)</)?.[1];
  const geom = member.match(/<position>([\s\S]*?)<\/position>/)?.[1];
  if (!ags || !geom) continue;
  await client.query(
    `insert into gem values ($1, extensions.ST_Transform(
       extensions.ST_SetSRID(extensions.ST_GeomFromGML($2), 25832), 4326))`, [ags, geom]);
  nGem++;
}

let nVine = 0;
for (const file of (await readdir(path.join(SRC, "rebflaeche"))).filter((f) => f.endsWith(".gml"))) {
  const body = await readFile(path.join(SRC, "rebflaeche", file), "utf8");
  for (const member of body.split("<wfs:member>").slice(1)) {
    if (!member.includes(`<vegetationsmerkmal>${REBFLAECHE}<`)) continue;
    const geom = member.match(/<position>([\s\S]*?)<\/position>/)?.[1];
    if (!geom) continue;
    await client.query(
      `insert into vine values (extensions.ST_Transform(
         extensions.ST_SetSRID(extensions.ST_GeomFromGML($1), 25832), 4326))`, [geom]);
    nVine++;
  }
}
console.log(`loaded ${nGem} Gemeinde polygons, ${nVine} Rebfläche parcels`);
assert.ok(nVine > 500, `only ${nVine} vineyard parcels — the cache looks incomplete`);

// ---- 3. clip vineyard land to each unit's Gemeinden ------------------------
const units = [
  ...Object.entries(membership.anbaugebiete).map(([slug, a]) => ({ slug, ...a, tier: "anbaugebiet" })),
  ...Object.entries(membership.bereiche).map(([slug, b]) => ({ slug, ...b, tier: "bereich" })),
];
const features = [];
for (const u of units) {
  const ags = resolve(u.gemeinden);
  const { rows } = await client.query(
    `with area as (select extensions.ST_Union(g) g from gem where ags = any($1::text[])),
          clipped as (select v.g from vine v, area a where extensions.ST_Intersects(v.g, a.g)),
          raw as (select extensions.ST_Union(g) g, count(*) parcels from clipped),
          closed as (
            select extensions.ST_Buffer(
                     extensions.ST_Buffer(g, $2::float8, 'quad_segs=2'),
                     -$3::float8, 'quad_segs=2') g
              from raw)
     select extensions.ST_AsGeoJSON(
              extensions.ST_Multi(extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(closed.g), 3)), 6) gj,
            raw.parcels,
            -- Planted extent, measured BEFORE the close: this is the honest
            -- vineyard area and the number the promotion migration bands.
            round((extensions.ST_Area(raw.g::extensions.geography) / 10000)::numeric, 1) hectares,
            round((extensions.ST_Area(closed.g::extensions.geography) / 10000)::numeric, 1) display_hectares,
            extensions.ST_NumGeometries(extensions.ST_Multi(extensions.ST_CollectionExtract(
              extensions.ST_MakeValid(raw.g), 3))) raw_parts
       from raw, closed`, [ags, CLOSE, CLOSE_BACK]);
  const r = rows[0];
  assert.ok(r.gj, `${u.slug}: no vineyard land found inside its Gemeinden`);
  const geometry = JSON.parse(r.gj);
  features.push({
    type: "Feature",
    properties: {
      slug: u.slug, name: u.name, tier: u.tier,
      statute_section: u.statute_section,
      gemeinden_count: ags.length, parcels: Number(r.parcels),
      hectares: Number(r.hectares),
      display_hectares: Number(r.display_hectares),
      raw_parts: Number(r.raw_parts),
      parts: geometry.coordinates.length,
    },
    geometry,
  });
  console.log(`  ${u.tier.padEnd(12)} ${u.name.padEnd(22)} ${String(ags.length).padStart(2)} Gem, `
    + `${String(r.parcels).padStart(4)} parcels, ${String(r.hectares).padStart(7)} ha planted, `
    + `${String(r.raw_parts).padStart(3)} -> ${String(geometry.coordinates.length).padStart(3)} parts after close (${r.display_hectares} ha shown)`);
}
await client.query("rollback");
await client.end();

if (!write) { console.log("\nnothing written (pass --write)"); process.exit(0); }
await writeFile(OUT, `${JSON.stringify({
  type: "FeatureCollection",
  _provenance: {
    authority: "Regierungspräsidium Darmstadt, Dezernat Weinbau Eltville (membership) / HVBG ATKIS Basis-DLM (geometry)",
    licence: "Free use without restriction or condition, § 24 HVGG",
    attribution: "© Hessische Verwaltung für Bodenmanagement und Geoinformation (HVBG), ATKIS Basis-DLM",
    method: "vineyard-clip+close: ATKIS AX_Landwirtschaft vegetationsmerkmal 1040 (Rebfläche) intersected with the "
      + "Gemeinden the Weinbauamt names for each Anbaugebiet and Bereich. NOT a Weinbergsrolle: this is recorded "
      + "land use, so an unregistered planted parcel is included and a registered Lage lying fallow is missed. "
      + "Rheinland-Pfalz's footprints come from its published Weinbergsrolle and are legal boundaries; these are not. "
      + "The clip is then closed morphologically (buffer +0.012°, then -0.008°) exactly as build-germany-anbaugebiete.mjs "
      + "closes the six RLP Anbaugebiete, because a raw union of scattered parcels is unusable as a region outline. That "
      + "INFLATES the displayed area; the 'hectares' property is the planted extent measured before the close, "
      + "'display_hectares' is what the geometry covers.",
    statute: membership._readme.source_url,
    generated_at: new Date().toISOString().slice(0, 10),
  },
  features,
}, null, 1)}\n`);
console.log(`\nwrote ${OUT}`);
