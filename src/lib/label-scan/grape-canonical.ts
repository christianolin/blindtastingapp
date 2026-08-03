// Canonical-only grape naming for label scans: the catalog keeps ONE row per
// variety, so a scan must never introduce a local synonym / clone / translation
// as a separate grape. This maps well-known local names to the canonical
// international variety and strips parenthetical clone qualifiers, so scanned
// grapes match an existing row instead of being proposed as new. Extend the map
// as more synonyms surface. (Not a display feature — purely scan-time matching.)

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Folded local name -> canonical display name the catalog stores.
const GRAPE_SYNONYMS: Record<string, string> = {
  // Sangiovese (Tuscan / Corsican local names + clones)
  brunello: "Sangiovese",
  "sangiovese grosso": "Sangiovese",
  "prugnolo gentile": "Sangiovese",
  morellino: "Sangiovese",
  nielluccio: "Sangiovese",
  // Tempranillo
  "tinta roriz": "Tempranillo",
  "tinto fino": "Tempranillo",
  "tinta del pais": "Tempranillo",
  "tinta de toro": "Tempranillo",
  aragonez: "Tempranillo",
  cencibel: "Tempranillo",
  // Grenache
  garnacha: "Grenache",
  "garnacha tinta": "Grenache",
  cannonau: "Grenache",
  "grenache noir": "Grenache",
  // Syrah
  shiraz: "Syrah",
  // Pinot family
  "pinot nero": "Pinot Noir",
  spatburgunder: "Pinot Noir",
  blauburgunder: "Pinot Noir",
  "pinot grigio": "Pinot Gris",
  grauburgunder: "Pinot Gris",
  "pinot bianco": "Pinot Blanc",
  weissburgunder: "Pinot Blanc",
  // Mourvèdre
  monastrell: "Mourvèdre",
  mataro: "Mourvèdre",
  // Others
  primitivo: "Zinfandel",
  mazuelo: "Carignan",
  carignano: "Carignan",
  carinena: "Carignan",
};

// Strip clone/qualifier parentheticals ("Sangiovese Grosso (Brunello)") and map
// a known local name to its canonical variety. Returns a clean display name;
// callers fold() it to match catalog grapes and reuse it as the pending name.
export function canonicalGrapeName(raw: string): string {
  const stripped = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return GRAPE_SYNONYMS[fold(stripped)] ?? stripped;
}
