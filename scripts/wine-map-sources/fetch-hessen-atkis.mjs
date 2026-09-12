// Cache the two ATKIS Basis-DLM layers the Hessian wine footprints are built
// from: the vineyard land-use class, and the municipal areas the statute names.
//
// WHY ATKIS AND NOT A WEINBERGSROLLE. Rheinland-Pfalz publishes its
// Weinbergsrolle — the legal Einzellage boundaries — as an open WFS, which is
// why six Anbaugebiete cost one adapter. No other German state does. Hessen's
// Weinbergsrolle is kept by the Weinbauamt Eltville and is not published in any
// machine-readable form; Baden-Württemberg's LGRB service is "zum Teil
// kostenpflichtig" under its AGB; Saxony serves WMS whose GetFeatureInfo
// returns attributes with no geometry at all. Checked 2026-09-12.
//
// So the Hessian footprint is built from two sources that each govern only what
// they are authoritative for:
//
//   WHICH Gemeinden   the Regierungspräsidium Darmstadt Info-Blatt
//                     "Geographische Angaben", recorded in
//                     data/wine-map/hessen-weinbau-membership.json
//   WHICH LAND        ATKIS Basis-DLM, AX_Landwirtschaft with
//                     vegetationsmerkmal 1040 ("Rebflaeche")
//
// The statute says "mit den Rebflächen in den Städten und Gemeinden" — the
// vineyard areas WITHIN those municipalities. Taking the municipalities whole
// would put all of Frankfurt am Main and Wiesbaden inside the Rheingau, and a
// block near Kassel besides. That is the Spanish and Italian failure mode at a
// larger scale, and this adapter exists to avoid it rather than to repeat it.
//
// LICENCE. Hessen opened its Geobasisdaten on 01.02.2022. The service states it
// itself, in GetCapabilities: automated retrieval is free of charge under § 24
// Hessisches Vermessungs- und Geoinformationsgesetz, and "Jede Nutzung der
// Geobasisdaten und zugehörigen Metadaten ist ohne Einschränkung oder Bedingung
// erlaubt". No registration, no key, no email.
//
// Usage: node scripts/wine-map-sources/fetch-hessen-atkis.mjs [--refresh]
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WFS = "https://www.gds.hessen.de/wfs2/aaa-suite/cgi-bin/atkis-bdlm/sf/wfs";
const OUT = path.resolve(".tiles-build", "sources", "hessen");
const MEMBERSHIP = "data/wine-map/hessen-weinbau-membership.json";
export const ATTRIBUTION =
  "© Hessische Verwaltung für Bodenmanagement und Geoinformation (HVBG), ATKIS Basis-DLM";
export const LICENCE =
  "Free use without restriction or condition, § 24 HVGG (Hessisches Vermessungs- und Geoinformationsgesetz); "
  + "stated in the service's own GetCapabilities";
// ATKIS AX_Landwirtschaft.vegetationsmerkmal: 1040 is Rebflaeche, "eine mit
// speziellen Vorrichtungen ausgestattete Agrarflaeche, auf der Weinstoecke
// angepflanzt sind" — Nutzungsartkennung 31040000 in the Hessen
// Objektartenkatalog, which is the unambiguous key. Do NOT read the code column
// off the PDF's layout: it interleaves codes and definitions, and doing so gives
// 1020, which is Gruenland. That mistake returns 135,763 "vineyard" parcels for
// a state with about 3,600 ha of vines; the correct code returns 1,980.
const REBFLAECHE = "1040";
// ETRS89 / UTM zone 32N, the CRS the service serves and Hessen is surveyed in.
const CRS = "urn:ogc:def:crs:EPSG::25832";
// Hessen's full extent in that CRS, comfortably padded. Requested in tiles
// because the service caps a single GetFeature response.
const EXTENT = { minx: 410000, miny: 5460000, maxx: 590000, maxy: 5720000 };
const TILE = 20000;

const refresh = process.argv.includes("--refresh");
const get = (params) =>
  execFileSync("curl", ["-sL", "--compressed", "-m", "300", `${WFS}?${params}`],
    { maxBuffer: 512 << 20 }).toString("utf8");

await mkdir(OUT, { recursive: true });

const cached = async (name, build) => {
  const file = path.join(OUT, name);
  if (!refresh && existsSync(file)) {
    console.log(`  ${name}: cached (${(await stat(file)).size.toLocaleString()} bytes)`);
    return readFile(file, "utf8");
  }
  const body = await build();
  await writeFile(file, body);
  console.log(`  ${name}: fetched (${body.length.toLocaleString()} bytes)`);
  return body;
};

// AX_Gemeinde carries the name and the AGS but NO geometry — it is the
// catalogue object. AX_KommunalesGebiet carries the polygon and the same AGS.
// The two are joined on schluesselGesamt; neither alone is enough.
console.log("Hessen ATKIS Basis-DLM:");
await cached("ax-gemeinde.gml", () =>
  get(`SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:AX_Gemeinde&COUNT=1000`));

await cached("ax-kommunalesgebiet.gml", () =>
  get(`SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:AX_KommunalesGebiet&COUNT=1000&SRSNAME=${CRS}`));

// The vineyard class, tiled. One request for all of Hessen is refused, and a
// tiled sweep is also far smaller than it looks: AX_Landwirtschaft is dense,
// but only the tiles that actually contain vines contribute anything.
const tiles = [];
for (let x = EXTENT.minx; x < EXTENT.maxx; x += TILE) {
  for (let y = EXTENT.miny; y < EXTENT.maxy; y += TILE) tiles.push([x, y]);
}
console.log(`\nRebflaeche (vegetationsmerkmal ${REBFLAECHE}) over ${tiles.length} tiles:`);
let kept = 0;
for (const [i, [x, y]] of tiles.entries()) {
  const name = `rebflaeche/${x}_${y}.gml`;
  await mkdir(path.join(OUT, "rebflaeche"), { recursive: true });
  const file = path.join(OUT, name);
  if (!refresh && existsSync(file)) { kept++; continue; }
  const bbox = [x, y, Math.min(x + TILE, EXTENT.maxx), Math.min(y + TILE, EXTENT.maxy)].join(",");
  const body = get(
    `SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:AX_Landwirtschaft`
    + `&COUNT=20000&SRSNAME=${CRS}&BBOX=${bbox},${CRS}`);
  await writeFile(file, body);
  const n = Number(body.match(/numberReturned="(\d+)"/)?.[1] ?? 0);
  const vines = (body.match(new RegExp(`<vegetationsmerkmal>${REBFLAECHE}<`, "g")) ?? []).length;
  if (vines) kept++;
  process.stdout.write(`\r  tile ${i + 1}/${tiles.length}  ${n} parcels, ${vines} Rebflaeche   `);
}
console.log(`\n  ${kept} tile(s) on disk.`);

const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const wanted = new Set(Object.values(membership.anbaugebiete).flatMap((a) => a.gemeinden));
await writeFile(path.join(OUT, "provenance.json"), `${JSON.stringify({
  service: WFS,
  layers: ["adv:AX_Gemeinde", "adv:AX_KommunalesGebiet", "adv:AX_Landwirtschaft"],
  vegetationsmerkmal: REBFLAECHE,
  crs: "EPSG:25832",
  attribution: ATTRIBUTION,
  licence: LICENCE,
  statute: membership._readme.source_url,
  gemeinden_required: [...wanted].sort(),
  retrieved: new Date().toISOString().slice(0, 10),
}, null, 2)}\n`);
console.log(`\nwrote ${path.join(OUT, "provenance.json")} (${wanted.size} statutory Gemeinden to resolve)`);
