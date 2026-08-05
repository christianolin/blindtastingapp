// Stage DRAFT boundaries for the 47 Alsace grand cru communes — one polygon
// per commune, from IGN Admin Express, keyed by the INSEE codes in the reviewed
// artifact data/wine-map/alsace-communes.json.
//
// The Champagne model (fetch-champagne-communes.mjs) with the dissolve removed:
// there, 635 member communes collapse into ONE region footprint; here each
// commune is its own place at tier 2, so each keeps its own boundary. Same
// provenance discipline — raw fetch + normalized artifact to the
// wine-map-sources bucket with SHA-256 checksums, one wine_boundary_sources
// identity and snapshot per commune, boundaries staged DRAFT for the reviewed
// flip (20260829264200).
//
// A commune footprint is a deliberate over-approximation of the grand cru land
// inside it — the commune is the containment parent, not the appellation — so
// boundary_method = MANUAL, exactly as for Champagne's rated villages.
//
// Kientzheim (68164) and Sigolsheim (68310) were merged into Kaysersberg
// Vignoble in 2016 and live only in the commune_associee_ou_deleguee layer;
// their déléguée polygons are the correct pre-merger footprints.
//
// Also writes a labelled preview SVG for the owner's shape gate, and refuses to
// stage anything if a commune is missing or escapes the Alsace window.
//
// Env: DB_PASSWORD, SUPABASE_SERVICE_ROLE_KEY (+ optional DB_PORT).
// Usage: node scripts/wine-map-sources/fetch-alsace-communes.mjs [--tolerance 0.0004]
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? d : process.argv[i + 1];
};

const COMMUNES_JSON = "data/wine-map/alsace-communes.json";
const WFS = "https://data.geopf.fr/wfs/ows";
const LAYER = "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune";
const DELEGUEE_LAYER =
  "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune_associee_ou_deleguee";
const NAMESPACE = "IGN_ADMIN_EXPRESS";
const LICENCE = "Licence Ouverte / Open Licence (Etalab)";
// The region_window of data/wine-map/alsace-appellations.json, the same guard
// the Alsace boundary flip uses.
const WINDOW = { minLon: 6.9, minLat: 47.7, maxLon: 7.8, maxLat: 49.2 };
// Communes are two orders of magnitude smaller than the Champagne region
// dissolve (0.0012), so they need a correspondingly finer tolerance to keep
// their outlines honest at zoom 8.
const TOLERANCE = Number(arg("tolerance", "0.0004"));
const OUT_DIR = ".superpowers/sdd";
const BATCH = 40;
const revision = releaseVersion();

function batchUrl(codes, layer) {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: layer,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: "500",
    cql_filter: `code_insee IN (${codes.map((c) => `'${c}'`).join(",")})`,
  });
  return `${WFS}?${params.toString()}`;
}

const artifact = JSON.parse(await readFile(COMMUNES_JSON, "utf8"));
const communes = artifact.communes;
assert.equal(
  communes.length,
  artifact.commune_count,
  "artifact commune_count disagrees with its own list",
);
const byInsee = new Map(communes.map((c) => [c.insee, c]));
const wanted = communes.map((c) => c.insee);

// --- fetch (current layer, then déléguées for the 2016 merges) ---------------
const fetched = new Map(); // insee -> { properties, geometry }
async function fetchInto(codes, layer) {
  for (let i = 0; i < codes.length; i += BATCH) {
    const res = await fetch(batchUrl(codes.slice(i, i + BATCH), layer));
    if (!res.ok) throw new Error(`WFS ${layer} -> ${res.status}`);
    const fc = await res.json();
    for (const f of fc.features ?? []) {
      const insee = f.properties?.code_insee;
      if (!insee || !byInsee.has(insee) || fetched.has(insee)) continue;
      fetched.set(insee, {
        insee,
        layer: layer.split(":").at(-1),
        nom_officiel: f.properties?.nom_officiel ?? "",
        geometry: f.geometry,
      });
    }
    process.stdout.write(`\r  fetched ${fetched.size}/${wanted.length}`);
  }
}
await fetchInto(wanted, LAYER);
let missing = wanted.filter((c) => !fetched.has(c));
if (missing.length) await fetchInto(missing, DELEGUEE_LAYER);
process.stdout.write("\n");
missing = wanted.filter((c) => !fetched.has(c));
assert.equal(missing.length, 0, `missing commune geometries: ${missing.join(", ")}`);

// The artifact records which layer each commune came from; a drift there means
// a commune merged (or un-merged) since the artifact was reviewed.
for (const [insee, f] of fetched) {
  assert.equal(
    f.layer,
    byInsee.get(insee).layer,
    `${byInsee.get(insee).name} (${insee}) came from ${f.layer}, artifact says ${byInsee.get(insee).layer}`,
  );
}
console.log(`fetched ${fetched.size}/${wanted.length} communes`);

// --- raw artifact (unmodified fetch) -> bucket ------------------------------
const rawFeatures = wanted.map((insee) => {
  const f = fetched.get(insee);
  return {
    type: "Feature",
    properties: { code_insee: insee, nom: f.nom_officiel, layer: f.layer },
    geometry: f.geometry,
  };
});
const rawBody = Buffer.from(
  `${JSON.stringify({ type: "FeatureCollection", features: rawFeatures })}\n`,
);
const rawPath = `${NAMESPACE}/${revision}/alsace-communes/raw-communes.geojson`;
await uploadRawObject(rawPath, rawBody, { upsert: false });
console.log(`raw artifact -> storage://wine-map-sources/${rawPath}`);

// --- normalize each commune independently ------------------------------------
const client = new pg.Client(pgConfig());
await client.connect();
let normalized;
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  const { rows } = await client.query(
    `with raw as (
       select insee, extensions.ST_MakeValid(
                       extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326)) geom
         from unnest($1::text[], $2::text[]) as t(insee, g)
     ),
     simplified as (
       select insee,
              extensions.ST_Multi(extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(
                  extensions.ST_SimplifyPreserveTopology(geom, $3)
                ), 3)) geom
         from raw
     )
     select insee,
            extensions.ST_AsGeoJSON(geom, 6) geojson,
            extensions.ST_NPoints(geom) npoints,
            extensions.ST_NumGeometries(geom) nparts,
            extensions.ST_IsValid(geom) valid,
            extensions.ST_Area(geom) area,
            extensions.ST_XMin(extensions.Box3D(geom)) minx,
            extensions.ST_YMin(extensions.Box3D(geom)) miny,
            extensions.ST_XMax(extensions.Box3D(geom)) maxx,
            extensions.ST_YMax(extensions.Box3D(geom)) maxy
       from simplified
      order by insee`,
    [wanted, wanted.map((c) => JSON.stringify(fetched.get(c).geometry)), TOLERANCE],
  );
  normalized = rows;
  await client.query("rollback"); // read-only shaping; nothing to keep yet
} catch (e) {
  await client.query("rollback").catch(() => {});
  await client.end();
  throw e;
}

assert.equal(normalized.length, wanted.length, "normalize dropped a commune");
const outOfWindow = [];
for (const r of normalized) {
  assert.ok(r.geojson, `${r.insee}: no geometry`);
  assert.ok(r.valid, `${byInsee.get(r.insee).name}: invalid geometry`);
  if (
    r.minx < WINDOW.minLon ||
    r.miny < WINDOW.minLat ||
    r.maxx > WINDOW.maxLon ||
    r.maxy > WINDOW.maxLat
  ) {
    outOfWindow.push(byInsee.get(r.insee).name);
  }
}
assert.deepEqual(
  outOfWindow,
  [],
  `communes outside the Alsace window: ${outOfWindow.join(", ")}`,
);
const vertices = normalized.reduce((s, r) => s + Number(r.npoints), 0);
console.log(
  `normalized: ${normalized.length} communes, ${vertices} vertices, tolerance ${TOLERANCE}`,
);

// --- normalized artifact -> bucket ------------------------------------------
const generation = {
  engine: "commune-footprint",
  commune_count: normalized.length,
  source_commune_list: COMMUNES_JSON,
  commune_geometry: `IGN Admin Express (${LAYER}; ${DELEGUEE_LAYER} for the 2016 Kaysersberg Vignoble merges)`,
  membership_source:
    "INAO — Aires géographiques des AOC/AOP (Licence Ouverte), cross-checked against the INAO delimited parcels (IGN AOC-VITICOLES)",
  simplify_tolerance: TOLERANCE,
  coordinate_precision: 6,
  note: "Over-approximation by design: the whole commune, not the grand cru land inside it. The commune is the containment parent; the cru appellations that sit under it carry the delimited areas.",
};
const normalizedBody = Buffer.from(
  `${JSON.stringify({
    type: "FeatureCollection",
    properties: { generation },
    features: normalized.map((r) => ({
      type: "Feature",
      properties: {
        target_key: `france.alsace.${byInsee.get(r.insee).slug}`,
        code_insee: r.insee,
        name: byInsee.get(r.insee).name,
      },
      geometry: JSON.parse(r.geojson),
    })),
  })}\n`,
);
const normalizedPath = `${NAMESPACE}/${revision}/alsace-communes/normalized.geojson`;
await uploadRawObject(normalizedPath, normalizedBody, { upsert: true });
console.log(`normalized artifact -> storage://wine-map-sources/${normalizedPath}`);

// --- labelled preview SVG for the owner's shape gate -------------------------
await mkdir(OUT_DIR, { recursive: true });
{
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of normalized) {
    bbox[0] = Math.min(bbox[0], Number(r.minx));
    bbox[1] = Math.min(bbox[1], Number(r.miny));
    bbox[2] = Math.max(bbox[2], Number(r.maxx));
    bbox[3] = Math.max(bbox[3], Number(r.maxy));
  }
  const pad = 0.02;
  const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
  // Alsace is a tall narrow strip, so scale to height or the label text
  // overwhelms the shapes.
  const scale = 1600 / (n - s);
  const W = ((e - w) * scale).toFixed(0);
  const H = ((n - s) * scale).toFixed(0);
  const project = ([x, y]) =>
    `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
  let paths = "";
  let labels = "";
  const parents = new Set(artifact.crus.map((c) => c.parent_insee));
  for (const r of normalized) {
    const g = JSON.parse(r.geojson);
    let d = "";
    for (const poly of g.coordinates) {
      for (const ring of poly) d += `M${ring.map(project).join("L")}Z`;
    }
    const commune = byInsee.get(r.insee);
    // Childless communes (host cru land but never a parent) in a lighter tone,
    // so the 5 of them are easy to pick out during review.
    const childless = !parents.has(r.insee);
    paths += `<path d="${d}" fill="${childless ? "#8C8378" : "#7E1B26"}" fill-opacity="${childless ? 0.12 : 0.22}" stroke="${childless ? "#8C8378" : "#7E1B26"}" stroke-width="0.6"/>`;
    const [px, py] = project([
      (Number(r.minx) + Number(r.maxx)) / 2,
      (Number(r.miny) + Number(r.maxy)) / 2,
    ]).split(",");
    const safe = commune.name.replace(/&/g, "&amp;");
    const crus = commune.crus.length;
    labels += `<text x="${px}" y="${py}" font-size="9" fill="#3a0d13" text-anchor="middle">${safe}${crus ? ` (${crus})` : ""}</text>`;
  }
  await writeFile(
    `${OUT_DIR}/preview-alsace-communes.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}${labels}</svg>\n`,
  );
  console.log(`preview -> ${OUT_DIR}/preview-alsace-communes.svg`);
}

// --- stage 47 DRAFT boundaries (one source + snapshot + boundary each) -------
const importer = `scripts/wine-map-sources/fetch-alsace-communes.mjs@${
  process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()
}`;
const rawUri = `storage://wine-map-sources/${rawPath}`;
const rawSum = sha256hex(rawBody);
const normalizedUri = `storage://wine-map-sources/${normalizedPath}`;
const normalizedSum = sha256hex(normalizedBody);

await client.query("begin");
try {
  let staged = 0;
  for (const r of normalized) {
    const commune = byInsee.get(r.insee);
    const targetKey = `france.alsace.${commune.slug}`;
    const provenanceNote =
      `Commune footprint for ${commune.name} (INSEE ${r.insee}) from IGN Admin Express` +
      `${commune.layer === "commune" ? "" : ", commune déléguée layer — merged into Kaysersberg Vignoble (68162) in 2016"}` +
      ". Whole-commune over-approximation: this is the containment parent of the grand cru appellations inside it, not a delimited area." +
      ` Membership from INAO's aire géographique, cross-checked against the delimited parcels (holds ${commune.crus.length} grand cru${commune.crus.length === 1 ? "" : "s"} as parent).`;

    const result = await client.query(
      `with place as (
         select id from wine_places where canonical_key = $1
       ),
       source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($2, $3, 'IGN / INAO', 'France')
         on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
         returning id
       ),
       snapshot as (
         insert into wine_boundary_source_snapshots (
           source_id, source_revision, retrieved_at, source_url, licence,
           raw_snapshot_uri, raw_checksum_sha256,
           normalized_artifact_uri, normalized_checksum_sha256,
           provenance_note, importer_version
         )
         select source.id, $4, now(), $5, $6, $7, $8, $9, $10, $11, $12
         from source
         returning id
       ),
       geom as (
         select extensions.ST_Multi(extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(
                    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($13), 4326)
                  ), 3)) g
       )
       insert into wine_place_boundaries (
         wine_place_id, source_snapshot_id, boundary_method, quality_status,
         display_geometry, label_point, bbox, source_feature_refs,
         generation_parameters, revision, is_current, reviewed_at
       )
       select place.id, snapshot.id, 'MANUAL', 'DRAFT',
              geom.g, extensions.ST_PointOnSurface(geom.g),
              array[
                extensions.ST_XMin(extensions.Box3D(geom.g)),
                extensions.ST_YMin(extensions.Box3D(geom.g)),
                extensions.ST_XMax(extensions.Box3D(geom.g)),
                extensions.ST_YMax(extensions.Box3D(geom.g))
              ]::double precision[],
              jsonb_build_object(
                'code_insee', $14::text,
                'ign_layer', $15::text,
                'grand_crus', $16::jsonb
              ),
              $17::jsonb,
              $4, false, null
       from place, source, snapshot, geom
       returning id`,
      [
        targetKey,
        NAMESPACE,
        `commune:${r.insee}`,
        revision,
        WFS,
        LICENCE,
        rawUri,
        rawSum,
        normalizedUri,
        normalizedSum,
        provenanceNote,
        importer,
        r.geojson,
        r.insee,
        commune.layer,
        JSON.stringify(commune.crus),
        JSON.stringify(generation),
      ],
    );
    assert.equal(
      result.rows.length,
      1,
      `expected one staged boundary for ${targetKey} — is the place catalogued?`,
    );
    staged += 1;
  }
  assert.equal(staged, communes.length, "staged count mismatch");
  await client.query("commit");
  console.log(`BOUNDARY-STAGED ${staged} alsace commune DRAFT boundaries`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
