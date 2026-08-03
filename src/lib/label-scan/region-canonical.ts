// The label scanner (Claude vision) names wine regions in English, but the
// regions table stores them under canonical, mostly local-language names —
// Burgundy is "Bourgogne", Rhone is "Rhône", Tuscany is "Toscana", etc. This
// mirrors the synonym map the LWIN import used (see
// scripts/backfill-producer-regions.mjs) so a scanned region resolves to the
// row it was imported under. Accent-only differences (Rhône, Dão) are already
// bridged by the caller's accent-folding; the entries that matter here are the
// genuinely different words.
const REGION_SYNONYMS: Record<string, string> = {
  burgundy: "Bourgogne",
  rhone: "Rhône",
  "rhone valley": "Rhône",
  "rhône valley": "Rhône",
  piedmont: "Piemonte",
  tuscany: "Toscana",
  sicily: "Sicilia",
  dao: "Dão",
  catalunya: "Catalonia",
  "languedoc-roussillon": "Languedoc",
};

// Map a scanned region name onto the catalog's canonical spelling. Unknown
// names pass through unchanged (trimmed) so non-synonym regions still match.
export function canonicalRegionName(region: string): string {
  const key = region.trim().toLowerCase();
  return REGION_SYNONYMS[key] ?? region.trim();
}
