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
}): string {
  const vintage =
    wine.vintageKind === "YEAR" ? (wine.vintageYear ? String(wine.vintageYear) : null)
    : wine.vintageKind === "TAWNY" ? (wine.vintageTawnyYears ? `${wine.vintageTawnyYears}yo` : "Tawny")
    : "NV";
  const parts = [wine.producerName, wine.wineName, wine.appellationName, vintage].filter(
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
