// ISTAT comuni adapter. Geometry source: ISTAT "Confini delle unità
// amministrative a fini statistici" (comuni), redistributed as WGS84
// GeoJSON by guglielmo/geojson-italy (formerly openpolis/geojson-italy —
// GitHub redirects the old org/name to the new one) under CC BY, same
// licence as the ISTAT original. Pinned during the Task 2 source spike:
// the region-scoped file (Piemonte = ISTAT region code 1) is small enough
// (~4.3MB) to fetch whole rather than filtering the ~40MB national file.
//
// The other candidate, teamdigitale/confini-amministrativi-istat
// (20190101/geojson/comuni/comuni.json), DOES use the canonical ISTAT
// property names COMUNE/PRO_COM verbatim, but ships its geometry in
// EPSG:32632 (UTM zone 32N, metres) rather than EPSG:4326 (lon/lat) — the
// script's window/area assertions and SVG projection need WGS84, so that
// source was rejected without a reprojection step this task doesn't need.
// See .tiles-build/sources/piedmont-source-provenance.json for the record.
export const ISTAT_COMUNI_URL =
  "https://raw.githubusercontent.com/guglielmo/geojson-italy/master/geojson/limits_R_1_municipalities.geojson";
export const ISTAT_LICENCE =
  "ISTAT — Confini delle unità amministrative a fini statistici (comuni). " +
  "Original boundaries © ISTAT, released under CC BY. Redistributed as " +
  "simplification-free WGS84 GeoJSON by guglielmo/geojson-italy " +
  "(https://github.com/guglielmo/geojson-italy, formerly openpolis/geojson-italy) " +
  "under the same CC BY licence. Attribute: ISTAT.";
export const PRO_COM_PROP = "com_istat_code_num";
export const NAME_PROP = "name";

export function normalizeComuneName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['\u2019`]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchComune(feature, targetName, nameProp = NAME_PROP) {
  return normalizeComuneName(feature?.properties?.[nameProp]) ===
    normalizeComuneName(targetName);
}