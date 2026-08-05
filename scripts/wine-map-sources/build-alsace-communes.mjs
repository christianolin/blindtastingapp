// Build the reviewed Alsace grand cru commune artifact.
//
// Two independent INAO sources, cross-checked against each other:
//
//   1. The commune list. INAO's "Aires géographiques des AOC/AOP" open dataset
//      carries all 51 "Alsace grand cru <name>" aires — but every one of them
//      lists the SAME 47 communes, because the file records the collective aire
//      géographique of the Alsace Grand Cru AOC, not a per-cru delimitation. It
//      bounds the commune set; it cannot assign crus to communes.
//   2. The delimited parcels. Each cru's parcels from the IGN AOC-VITICOLES
//      layer (the same source the live cru boundaries were built from) unioned
//      and intersected with IGN Admin Express commune polygons, which measures
//      how the delimited area actually splits across commune lines.
//
// Source 2 reproduces source 1 exactly: the communes holding >= 0.5% of some
// cru are precisely INAO's 47 (plus the Kaysersberg déléguée, which INAO omits
// — see CAVEATS). That agreement is asserted here, so a drift in either source
// fails the build rather than quietly changing the map's hierarchy.
//
// Commune NAMES come from IGN, not the CSV: INAO's export is Windows-1252 and
// drops the œ ligature (Vœgtlinshoffen).
//
// Env: DB_PASSWORD (the intersection runs in Postgres; it uses temp tables and
// rolls back, writing nothing).
// Usage: node scripts/wine-map-sources/build-alsace-communes.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const APPELLATIONS_JSON = "data/wine-map/alsace-appellations.json";
const OUT = "data/wine-map/alsace-communes.json";
const CSV_URL =
  "https://static.data.gouv.fr/resources/aires-geographiques-des-aoc-aop/20251009-122320/2025-10-09-comagri-communes-aires-ao.csv";
const DATASET_SLUG = "aires-geographiques-des-aoc-aop";
const AIRE_PREFIX = "Alsace grand cru ";
const WFS = "https://data.geopf.fr/wfs/ows";
const PARCEL_LAYER = "AOC-VITICOLES:aire_parcellaire";
const COMMUNE_LAYER = "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune";
const DELEGUEE_LAYER =
  "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune_associee_ou_deleguee";

// Below this a "share" is boundary-line digitisation noise, not membership:
// the real spills bottom out at 0.56% (Steingrubler in Wintzenheim) while the
// slivers top out at 0.019% (Praelatenberg in Orschwiller). Two orders of
// magnitude of daylight, so the exact cut is not load-bearing.
const MEMBERSHIP_THRESHOLD = 0.005;

// Kaysersberg Vignoble (68162) is the 2016 commune nouvelle CONTAINING the
// Kientzheim + Sigolsheim déléguées, so its intersection share double-counts
// theirs. It is fetched anyway, then reduced to the residual that lies in
// neither déléguée — i.e. land inside the Kaysersberg déléguée proper.
const COMMUNE_NOUVELLE = "68162";
// ...which is the Kaysersberg déléguée, so the residual is reported under that
// name rather than IGN's nom_officiel for the commune nouvelle.
const KAYSERSBERG_DELEGUEE = "Kaysersberg";

// denom is a comma-separated combination of every denomination the parcel
// belongs to; separator commas carry no trailing space, while comma+space
// occurs inside denomination names.
const splitDenominations = (combo) =>
  String(combo ?? "")
    .split(/,(?! )/)
    .map((s) => s.trim())
    .filter(Boolean);

const slugify = (name) =>
  name
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Minimal semicolon-CSV parser that respects double-quoted fields (the
// "Aire géographique" column is quoted and can contain commas).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- source 1: INAO's commune list ------------------------------------------
const csvRes = await fetch(CSV_URL);
if (!csvRes.ok) throw new Error(`fetch ${CSV_URL} -> ${csvRes.status}`);
const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
let csvText = new TextDecoder("utf-8", { fatal: false }).decode(csvBytes);
if (csvText.includes("\uFFFD")) {
  csvText = new TextDecoder("windows-1252").decode(csvBytes);
}
const csvRows = parseCsv(csvText);
const header = csvRows[0].map((h) => h.trim());
const iCI = header.indexOf("CI");
const iAire = header.findIndex(
  (h) => h.replace(/"/g, "").trim() === "Aire géographique",
);
assert.ok(iCI >= 0 && iAire >= 0, `unexpected header: ${header.join("|")}`);

const aireCommunes = new Map(); // aire -> Set<insee>
for (const r of csvRows.slice(1)) {
  const aire = (r[iAire] ?? "").trim();
  if (!aire.startsWith(AIRE_PREFIX)) continue;
  const insee = (r[iCI] ?? "").trim();
  if (!/^[0-9AB]{5}$/i.test(insee)) continue;
  if (!aireCommunes.has(aire)) aireCommunes.set(aire, new Set());
  aireCommunes.get(aire).add(insee);
}
assert.equal(aireCommunes.size, 51, `expected 51 grand cru aires, got ${aireCommunes.size}`);

const signatures = new Set(
  [...aireCommunes.values()].map((s) => [...s].sort().join(",")),
);
assert.equal(
  signatures.size,
  1,
  `expected one shared commune set across the 51 aires, got ${signatures.size}`,
);
const inaoAire = [...aireCommunes.values()][0];
console.log(`INAO aire géographique: ${inaoAire.size} communes, shared by all 51 crus`);

// --- source 2: the delimited parcels ----------------------------------------
const appellations = JSON.parse(await readFile(APPELLATIONS_JSON, "utf8"));
const crus = appellations.targets.filter((t) => t.level === "grand_cru");
assert.equal(crus.length, 51, `expected 51 crus in ${APPELLATIONS_JSON}`);

const cruKeys = [];
const cruGeoms = [];
const parcelCount = new Map();
for (const cru of crus) {
  const denom = cru.members[0];
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: PARCEL_LAYER,
    outputFormat: "application/json",
    count: "5000",
    startIndex: "0",
    srsName: "EPSG:4326",
    sortBy: "gml_id",
    // LIKE bounds the server-side transfer; exact membership is client-side.
    cql_filter: `denom LIKE '%${denom.replaceAll("'", "''")}%'`,
  });
  const res = await fetch(`${WFS}?${params}`);
  if (!res.ok) throw new Error(`WFS ${denom} -> ${res.status}`);
  const fc = await res.json();
  let n = 0;
  for (const f of fc.features ?? []) {
    if (!splitDenominations(f.properties?.denom).includes(denom)) continue;
    cruKeys.push(cru.slug);
    cruGeoms.push(JSON.stringify(f.geometry));
    n += 1;
  }
  assert.ok(n > 0, `${denom}: no parcels`);
  parcelCount.set(cru.slug, n);
  process.stdout.write(`\r  parcels ${cruKeys.length}`);
}
process.stdout.write("\n");

// --- commune polygons -------------------------------------------------------
const communes = new Map(); // insee -> { insee, name, layer, geometry }
async function fetchCommunes(codes, layer) {
  for (let i = 0; i < codes.length; i += 40) {
    const slice = codes.slice(i, i + 40);
    const params = new URLSearchParams({
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: layer,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      count: "500",
      cql_filter: `code_insee IN (${slice.map((c) => `'${c}'`).join(",")})`,
    });
    const res = await fetch(`${WFS}?${params}`);
    if (!res.ok) throw new Error(`WFS ${layer} -> ${res.status}`);
    const fc = await res.json();
    for (const f of fc.features ?? []) {
      const insee = f.properties?.code_insee;
      if (!insee || communes.has(insee)) continue;
      communes.set(insee, {
        insee,
        name: f.properties?.nom_officiel ?? "",
        layer: layer.split(":").at(-1),
        geometry: JSON.stringify(f.geometry),
      });
    }
  }
}
const wanted = [...inaoAire, COMMUNE_NOUVELLE];
await fetchCommunes(wanted, COMMUNE_LAYER);
const missing = wanted.filter((c) => !communes.has(c));
if (missing.length) await fetchCommunes(missing, DELEGUEE_LAYER);
const stillMissing = wanted.filter((c) => !communes.has(c));
assert.equal(stillMissing.length, 0, `no geometry for ${stillMissing.join(", ")}`);
console.log(`commune polygons: ${communes.size} (${wanted.length} requested)`);

// --- how each cru's delimited area splits across communes -------------------
const list = [...communes.values()];
const client = new pg.Client(pgConfig());
await client.connect();
let rows;
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  ({ rows } = await client.query(
    `with parcels as (
       select cru, extensions.ST_MakeValid(
                     extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326)) geom
         from unnest($1::text[], $2::text[]) as t(cru, g)
     ),
     cru_union as (
       select cru, extensions.ST_MakeValid(
                     extensions.ST_UnaryUnion(
                       extensions.ST_MakeValid(extensions.ST_Collect(geom)))) geom
         from parcels group by cru
     ),
     commune as (
       select insee, extensions.ST_MakeValid(
                       extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326)) geom
         from unnest($3::text[], $4::text[]) as t(insee, g)
     )
     select c.cru, m.insee,
            extensions.ST_Area(extensions.ST_Intersection(c.geom, m.geom))
              / nullif(extensions.ST_Area(c.geom), 0) as share
       from cru_union c
       join commune m on extensions.ST_Intersects(c.geom, m.geom)
      where extensions.ST_Area(extensions.ST_Intersection(c.geom, m.geom)) > 0
      order by c.cru, share desc`,
    [cruKeys, cruGeoms, list.map((c) => c.insee), list.map((c) => c.geometry)],
  ));
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

const splitByCru = new Map();
for (const r of rows) {
  if (!splitByCru.has(r.cru)) splitByCru.set(r.cru, []);
  splitByCru.get(r.cru).push({ insee: r.insee, share: Number(r.share) });
}

const cruEntries = [];
const hosts = new Set();
for (const cru of crus) {
  const all = splitByCru.get(cru.slug) ?? [];
  const nouvelle = all.find((e) => e.insee === COMMUNE_NOUVELLE);
  const shares = all.filter((e) => e.insee !== COMMUNE_NOUVELLE);
  if (nouvelle) {
    // Residual = inside Kaysersberg Vignoble but in neither déléguée.
    const deleguees = shares
      .filter((e) => e.insee === "68164" || e.insee === "68310")
      .reduce((sum, e) => sum + e.share, 0);
    const residual = nouvelle.share - deleguees;
    if (residual >= MEMBERSHIP_THRESHOLD) {
      shares.push({ insee: COMMUNE_NOUVELLE, share: residual });
    }
  }
  const members = shares
    .filter((e) => e.share >= MEMBERSHIP_THRESHOLD)
    .sort((a, b) => b.share - a.share)
    .map((m) => ({
      insee: m.insee,
      // The 68162 entry is the residual, which lies in the Kaysersberg
      // déléguée — not the whole commune nouvelle that carries the code.
      name:
        m.insee === COMMUNE_NOUVELLE
          ? KAYSERSBERG_DELEGUEE
          : communes.get(m.insee).name,
      share: Math.round(m.share * 1e5) / 1e5,
    }));
  assert.ok(members.length > 0, `${cru.slug}: no commune above the threshold`);
  for (const m of members) hosts.add(m.insee);
  cruEntries.push({
    slug: cru.slug,
    name: cru.name,
    parcels: parcelCount.get(cru.slug),
    parent_insee: members[0].insee,
    parent: members[0].name,
    communes: members,
  });
}

// --- cross-check the two sources --------------------------------------------
// The Kaysersberg déléguée holds 1.3% of Schlossberg, but INAO's aire omits
// Kaysersberg while listing Kientzheim and Sigolsheim separately. We follow
// INAO and do not create it; recorded in CAVEATS.
const derived = new Set([...hosts].filter((c) => c !== COMMUNE_NOUVELLE));
const notInInao = [...derived].filter((c) => !inaoAire.has(c)).sort();
const notHosting = [...inaoAire].filter((c) => !derived.has(c)).sort();
assert.deepEqual(notInInao, [], `hold cru parcels but absent from INAO's aire: ${notInInao}`);
assert.deepEqual(notHosting, [], `in INAO's aire but hold no cru parcels: ${notHosting}`);

// Every parent must be a commune we actually create. Kaysersberg holds only a
// 1.3% sliver, so it can never win a majority — but if it ever did, that cru
// would be parented to a place that does not exist.
const orphanParents = cruEntries.filter((c) => !inaoAire.has(c.parent_insee));
assert.deepEqual(
  orphanParents.map((c) => `${c.slug} -> ${c.parent}`),
  [],
  "cru parented to a commune outside INAO's aire",
);
console.log(
  `cross-check OK: the ${derived.size} communes holding >= ${MEMBERSHIP_THRESHOLD * 100}% of a cru are exactly INAO's aire`,
);

// --- artifact ---------------------------------------------------------------
const cruSlugsByCommune = new Map();
for (const c of cruEntries) {
  if (!cruSlugsByCommune.has(c.parent_insee)) cruSlugsByCommune.set(c.parent_insee, []);
  cruSlugsByCommune.get(c.parent_insee).push(c.slug);
}

const MERGER_NOTE =
  "Merged into the commune nouvelle Kaysersberg Vignoble (68162) on 1 January 2016; " +
  "exists today only as a commune déléguée. INAO still lists it separately and the " +
  "wine name is what labels and textbooks use.";

const communeEntries = [...inaoAire]
  .map((insee) => {
    const c = communes.get(insee);
    return {
      insee,
      slug: slugify(c.name),
      name: c.name,
      department: insee.slice(0, 2),
      layer: c.layer,
      crus: (cruSlugsByCommune.get(insee) ?? []).sort(),
      note: c.layer === "commune_associee_ou_deleguee" ? MERGER_NOTE : null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

const byDepartment = {};
for (const c of communeEntries) {
  byDepartment[c.department] = (byDepartment[c.department] ?? 0) + 1;
}

const slugs = new Set(communeEntries.map((c) => c.slug));
assert.equal(slugs.size, communeEntries.length, "duplicate commune slug");
const cruSlugs = new Set(crus.map((c) => c.slug));
const collisions = [...slugs].filter((s) => cruSlugs.has(s));
assert.deepEqual(collisions, [], `commune slug collides with a cru key: ${collisions}`);

const artifact = {
  aire_geographique: "Alsace grand cru",
  provenance: {
    authority: "INAO (Institut national de l'origine et de la qualité) / IGN",
    commune_membership: {
      dataset: "Aires géographiques des AOC/AOP",
      dataset_slug: DATASET_SLUG,
      resource_url: CSV_URL,
      licence: "Licence Ouverte / Open Licence (fr-lo)",
      note: `All 51 "Alsace grand cru <name>" aires list the same ${inaoAire.size} communes: the file records the collective aire géographique of the AOC, not a per-cru delimitation.`,
    },
    cru_delimitation: {
      layer: `IGN Geoplateforme WFS ${PARCEL_LAYER} (INAO delimited AOC parcels)`,
      licence: "Licence Ouverte Etalab",
      note: "Per-cru parcels unioned, then intersected with the commune polygons to measure how each delimited area splits across commune lines. Same layer the live cru boundaries were built from.",
    },
    commune_geometry: {
      layers: [COMMUNE_LAYER, DELEGUEE_LAYER],
      licence: "Licence Ouverte / Open Licence (Etalab)",
      note: "Commune names are taken from IGN nom_officiel, not from the INAO CSV: that export is Windows-1252 and drops the œ ligature (Vœgtlinshoffen).",
    },
    retrieved_at: new Date().toISOString().slice(0, 10),
    cross_check: `The communes holding >= ${MEMBERSHIP_THRESHOLD * 100}% of some cru's delimited area are exactly the ${inaoAire.size} of INAO's aire géographique — two independent sources, identical answer. Asserted by this script.`,
  },
  modeling_decision:
    "Communes become kind=SITE, is_appellation=false, display_tier 2, min_zoom/label_min_zoom 8, parented to france.alsace — the Champagne village model (a commune is a place, not an appellation). The 51 grands crus move from tier 2 to tier 3, each parented to the commune holding the largest share of its delimited area. A cru still crosses commune lines; the full split is recorded per cru so the approximation stays auditable.",
  caveats: [
    "Kientzheim (68164) and Sigolsheim (68310) were merged into Kaysersberg Vignoble (68162) in 2016 and exist only in the commune_associee_ou_deleguee layer. Their déléguée polygons are the correct pre-merger footprints; imported under their wine names.",
    "Kaysersberg is NOT created: 1.3% of Schlossberg falls inside the Kaysersberg déléguée, but INAO's aire omits Kaysersberg while listing Kientzheim and Sigolsheim. We follow INAO.",
    `Shares below ${MEMBERSHIP_THRESHOLD * 100}% are boundary-line digitisation noise, not membership: the real spills bottom out at 0.56% while the slivers top out at 0.019%.`,
    "5 of the 47 communes (Saint-Hippolyte, Scharrachbergheim-Irmstett, Soultzmatt, Vieux-Thann, Vœgtlinshoffen) host cru land whose majority lies in a neighbouring commune, so they are childless places. They really do contain grand cru vines.",
  ],
  membership_threshold: MEMBERSHIP_THRESHOLD,
  commune_count: communeEntries.length,
  department_breakdown: byDepartment,
  parent_commune_count: new Set(cruEntries.map((c) => c.parent_insee)).size,
  communes: communeEntries,
  crus: cruEntries.sort((a, b) => a.slug.localeCompare(b.slug)),
};

await writeFile(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`WROTE ${OUT}`);
console.log(
  `  communes=${artifact.commune_count} parents=${artifact.parent_commune_count} crus=${cruEntries.length}`,
);
console.log(`  by department ${JSON.stringify(byDepartment)}`);
const multi = cruEntries.filter((c) => c.communes.length > 1);
console.log(`  crus spanning more than one commune: ${multi.length}`);
for (const c of multi) {
  console.log(
    `    ${c.name.padEnd(24)} ${c.communes.map((m) => `${m.name} ${(m.share * 100).toFixed(1)}%`).join("  +  ")}`,
  );
}
