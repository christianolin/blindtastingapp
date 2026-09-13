// Cache the open geobasis downloads the Saale-Unstrut footprint is built from.
//
// Saale-Unstrut is the only German Anbaugebiet whose product specification
// crosses three Länder, and no two of them publish the same thing, so this
// fetches from three services rather than one:
//
//   ST  LVermGeo Sachsen-Anhalt — Basis-DLM, statewide, one shapefile archive.
//   TH  TLBG Thüringen — Basis-DLM, published as thematic slices. Only "veg"
//       (vegetation, which carries the vineyard class) and "geb"
//       (Gebietseinheiten, which carries the Gemeinden and their Kreis) are
//       wanted; pulling the whole model would be ten times the bytes for
//       nothing.
//   TH  TLBG ALKIS, eight Flur archives. The specification names two Weimar
//       ORTSTEILE, and Basis-DLM has no Ortsteil layer at all — it stops at the
//       Gemeinde. The cadastre does hold them, as Gemarkungen Schöndorf (0504)
//       and Tiefurt (0505). Thüringen has a second Gemarkung also called
//       Schöndorf (4451) belonging to a Gemeinde of that name, which is NOT the
//       Weimar Ortsteil; the KatasterBezirk record's own `gemeinde` field is
//       what tells them apart, and the extractor checks it.
//   BB  LGB Brandenburg — ALKIS for Landkreis Potsdam-Mittelmark. Brandenburg
//       publishes no open Basis-DLM, but ALKIS is the better fit here anyway:
//       the specification names four GEMARKUNGEN of Stadt Werder (Havel), and
//       Gemarkungen are cadastral districts that Basis-DLM does not carry.
//
// LICENCES. All three are open government data, no registration and nobody to
// email: Sachsen-Anhalt and Thüringen publish under Datenlizenz Deutschland —
// Namensnennung 2.0, Brandenburg likewise (dl-de/by-2-0, stated in the header
// of its own directory listing). Attribution is carried through to the map.
//
// Usage: node scripts/wine-map-sources/fetch-saale-unstrut.mjs [--refresh]
import { mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT = path.resolve(".tiles-build", "sources", "saale-unstrut");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";

export const ATTRIBUTION = {
  ST: "© GeoBasis-DE / LVermGeo Sachsen-Anhalt, ATKIS Basis-DLM",
  TH: "© GDI-Th / TLBG Thüringen, ATKIS Basis-DLM und ALKIS",
  BB: "© GeoBasis-DE / LGB Brandenburg, ALKIS",
};
export const LICENCE = "Datenlizenz Deutschland — Namensnennung 2.0 (dl-de/by-2-0)";

// The eight Flur archives making up Gemarkung Schöndorf (0504) and Gemarkung
// Tiefurt (0505). Enumerated rather than derived: the ALKIS Atom feed's per-Flur
// entries pair titles and bounding boxes in a way that does not survive a naive
// read, and the archives themselves are the authority on which Gemeinde a Flur
// belongs to.
const WEIMAR_FLURE = [
  "0504-001", "0504-002", "0504-003", "0504-004",
  "0505-001", "0505-002", "0505-003", "0505-004",
];

const FILES = [
  ["th-veg.zip", "https://geoportal.geoportal-th.de/dlm/atkis.basis-dlm.veg.zip"],
  ["th-geb.zip", "https://geoportal.geoportal-th.de/dlm/atkis.basis-dlm.geb.zip"],
  ["st-bdlm.zip", "https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/download/"
    + "LVermGeo/Geodatenportal/externedaten/Basis-DLM_20260712_shp.zip"],
  ["bb-pm.zip", "https://data.geobasis-bb.de/geobasis/daten/alkis/Vektordaten/shape/alkis_shape_pm.zip"],
  ...WEIMAR_FLURE.map((f) => [`weimar-ot/${f}.zip`,
    `https://geoportal.geoportal-th.de/ALKIS/Shape/ALKIS_${f}_shp.zip`]),
];

const refresh = process.argv.includes("--refresh");
await mkdir(path.join(OUT, "weimar-ot"), { recursive: true });

for (const [name, url] of FILES) {
  const file = path.join(OUT, name);
  if (!refresh && existsSync(file)) {
    console.log(`  ${name}: cached (${(await stat(file)).size.toLocaleString()} bytes)`);
    continue;
  }
  execFileSync("curl", ["-sL", "-A", UA, "-m", "1800", url, "-o", file]);
  console.log(`  ${name}: fetched (${(await stat(file)).size.toLocaleString()} bytes)`);
}
console.log(`\ncached in ${OUT}`);
