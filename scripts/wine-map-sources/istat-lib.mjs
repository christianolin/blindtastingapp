// ISTAT comuni adapter — the shared, source-agnostic contract. Geometry
// source: ISTAT "Confini delle unità amministrative a fini statistici"
// (comuni). NAME_PROP/PRO_COM_PROP are the canonical ISTAT property names
// used by ISTAT's own distributions (and by at least one direct mirror,
// teamdigitale/confini-amministrativi-istat) — callers whose actual fetched
// source uses different property names (e.g. a WGS84-reprojected mirror)
// should pass their own `nameProp` to matchComune() and read their own
// PRO_COM-equivalent property directly, rather than overriding these
// shared defaults. See fetch-piedmont-comuni.mjs for the pilot mirror URL
// and property keys pinned during the Task 2 source spike — that pilot
// wiring intentionally does not live here, so this adapter stays reusable
// across sources.
export const PRO_COM_PROP = "PRO_COM";
export const NAME_PROP = "COMUNE";

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