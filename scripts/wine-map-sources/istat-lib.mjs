// ISTAT comuni adapter. Geometry source: ISTAT "Confini delle unità
// amministrative a fini statistici" (comuni). URL + property names are
// pinned during the source spike (Task 2, step 1) and asserted there.
export const PRO_COM_PROP = "PRO_COM";
export const NAME_PROP = "COMUNE";

export function normalizeComuneName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchComune(feature, targetName, nameProp = NAME_PROP) {
  return normalizeComuneName(feature?.properties?.[nameProp]) ===
    normalizeComuneName(targetName);
}
