// The catalog wine title, shared by the catalog, cellar, notes and Overview
// pages. Pure — type-only imports, no runtime `@/` imports — so vitest (node,
// no alias) can load it. ./queries re-exports it, and every page imports it
// from there.
import type { VintageKind } from "@/lib/supabase/database.types";

// Combining marks: what NFD splits off an accented letter (base block, extended,
// supplement, for symbols, half marks). Escaped ranges and no `u` flag — the
// tsconfig target is ES2017.
const COMBINING_MARKS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

// The repeat key: fold with NFD, drop the combining marks, then lowercase. Only
// accents and case fold away — spaces, hyphens and the letters themselves still
// count, so "Domaine La Roche" never repeats "Domaine Laroche".
function repeatKey(part: string): string {
  return part.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

// Whether `text` holds `phrase` as whole words, up to accents and case.
function hasWords(text: string | null, phrase: string): boolean {
  const words = (s: string) => ` ${repeatKey(s).replace(/[^a-z0-9]+/g, " ").trim()} `;
  return text !== null && words(phrase).trim() !== "" && words(text).includes(words(phrase));
}

/** `name` with a sparkling wine's dosage after it ("Cava DO" → "Cava DO Brut
    Nature"), unless the name already carries it as whole words. */
export function withDosage(name: string, dosage: string | null | undefined): string {
  const d = dosage?.trim();
  return d && !hasWords(name, d) ? `${name} ${d}` : name;
}

/** The catalog wine embed of the dosage's name, for any `catalog_wines` select
    that builds a title (`dosageName`). Names its FK: catalog_wines has two to
    type_designations (PGRST201 otherwise). */
export const DOSAGE_EMBED = "dosage:type_designations!catalog_wines_dosage_designation_id_fkey(name)";

// Builds a readable title, collapsing a part that repeats an earlier one up to
// accents and case — a wine whose name is its producer's ("Château Lascombes",
// or a plain "Chateau Lascombes") renders once, in the first spelling.
export function catalogWineTitle(wine: {
  producerName: string | null;
  wineName: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  appellationName: string | null;
  /** A sparkling wine's dosage ("Brut Nature"; 20261003101000), part of its
      identity: two dosages of one Cava are two wines and must not share a title. */
  dosageName?: string | null;
}): string {
  const vintage =
    wine.vintageKind === "YEAR" ? (wine.vintageYear ? String(wine.vintageYear) : null)
    : wine.vintageKind === "TAWNY" ? (wine.vintageTawnyYears ? `${wine.vintageTawnyYears}yo` : "Tawny")
    : "NV";
  // The dosage goes before the vintage, as labels and shops write it ("Cava Brut
  // Nature 2019"), and is left out when the wine name already carries it as whole
  // words (an older "Brut Yellow Label").
  const dosage = wine.dosageName?.trim() || null;
  const dosagePart = dosage && !hasWords(wine.wineName, dosage) ? dosage : null;
  const parts = [wine.producerName, wine.wineName, wine.appellationName, dosagePart, vintage].filter(
    Boolean,
  ) as string[];
  const seen = new Set<string>();
  const deduped = parts.filter((p) => {
    const key = repeatKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.join(" ") || "Untitled wine";
}
