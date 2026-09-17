// The catalog list's row shape and every pure derivation over it (CC-C1,
// spec §4 "catalog/page.tsx adds…", §6.1, D3). Every import — value or
// type-only — is a relative path (no `@/` alias at all, runtime or erased),
// so vitest (node, no `@/` alias) can load it directly.
import { colourWord, fmtAvg } from "../../lib/cellar/format";
import type { WineColour, WineStyle } from "../../lib/cellar/types";

export type CatalogRow = {
  id: string;
  producer: string | null;
  /** bottleTitle: the name and its vintage */
  name: string;
  /** catalogWineTitle: search haystack and the note modal's title */
  title: string;
  colour: WineColour | null;
  style: WineStyle | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string[];
  designation: string | null;
  vintage: string;
  imageUrl: string | null;
  avgScore: number | null;
  noteCount: number;
  appearances: number;
  /** community holdings (catalog_wine_holdings) — kept for the "bottles" sort */
  cellarBottles: number;
  /** D3: the viewer's most recent score */
  yours: number | null;
  /** the viewer's bottles of it */
  owned: number;
  addedAt: string;
};

export type CatalogFilter = "all" | "cellar" | "tasted";
export const CATALOG_FILTERS: readonly CatalogFilter[] = ["all", "cellar", "tasted"];

export type CatalogSortKey =
  | "title"
  | "region"
  | "country"
  | "vintage"
  | "avgScore"
  | "noteCount"
  | "appearances"
  | "bottles"
  | "added";
export type CatalogSort = { key: CatalogSortKey; dir: "asc" | "desc" };
export const DEFAULT_SORT: CatalogSort = { key: "added", dir: "desc" };
export const CATALOG_PAGE = 25;

export function applyCatalogFilter(
  rows: readonly CatalogRow[],
  f: CatalogFilter,
): CatalogRow[] {
  if (f === "all") return [...rows];
  if (f === "cellar") return rows.filter((r) => r.owned > 0);
  return rows.filter((r) => r.yours != null);
}

export function catalogFilterCounts(
  rows: readonly CatalogRow[],
): Record<CatalogFilter, number> {
  return {
    all: rows.length,
    cellar: rows.filter((r) => r.owned > 0).length,
    tasted: rows.filter((r) => r.yours != null).length,
  };
}

export function catalogFilterLabel(
  f: CatalogFilter,
  count: number,
  opts: { phone: boolean },
): string {
  if (f === "all") return "Everything";
  if (f === "cellar") return `In my cellar ${count}`;
  return opts.phone ? `Tasted ${count}` : `I have tasted ${count}`;
}

/** Case- and accent-insensitive fold, matched by both the haystack and the
 * needle so a caller may pass either a raw or an already-folded query. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export const CATALOG_SEARCH_PLACEHOLDER = "Wine, producer, appellation or grape";
export const CATALOG_SEARCH_PLACEHOLDER_PHONE = "Wine, producer, appellation, grape";

export function matchesCatalogSearch(row: CatalogRow, needle: string): boolean {
  const n = fold(needle);
  if (!n) return true;
  const hay = fold(
    [row.title, row.producer, row.appellation, row.region, row.country, ...row.grapes]
      .filter(Boolean)
      .join(" "),
  );
  return hay.includes(n);
}

/** Numeric compare with a null operand always sorted last, in either
 * direction (D3's neighbour rule: an unrated wine never outranks a rated
 * one just because the sort flipped to ascending). */
function nullsLast(a: number | null, b: number | null, dir: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function sortCatalog(
  rows: readonly CatalogRow[],
  s: CatalogSort,
): CatalogRow[] {
  const dir = s.dir === "asc" ? 1 : -1;
  const cmp = (a: CatalogRow, b: CatalogRow): number => {
    switch (s.key) {
      case "avgScore":
        return nullsLast(a.avgScore, b.avgScore, dir);
      case "noteCount":
        return (a.noteCount - b.noteCount) * dir;
      case "appearances":
        return (a.appearances - b.appearances) * dir;
      case "bottles":
        return (a.cellarBottles - b.cellarBottles) * dir;
      case "vintage":
        return a.vintage.localeCompare(b.vintage) * dir;
      case "region":
        return (a.region ?? "").localeCompare(b.region ?? "") * dir;
      case "country":
        return (a.country ?? "").localeCompare(b.country ?? "") * dir;
      case "added":
        return a.addedAt.localeCompare(b.addedAt) * dir;
      default:
        return a.title.localeCompare(b.title) * dir;
    }
  };
  return [...rows].sort(cmp);
}

export const CATALOG_SORT_OPTIONS: readonly {
  value: string;
  label: string;
  sort: CatalogSort;
}[] = [
  { value: "title:asc", label: "Wine A–Z", sort: { key: "title", dir: "asc" } },
  { value: "added:desc", label: "Added (newest)", sort: { key: "added", dir: "desc" } },
  { value: "added:asc", label: "Added (oldest)", sort: { key: "added", dir: "asc" } },
  { value: "avgScore:desc", label: "Community rating", sort: { key: "avgScore", dir: "desc" } },
  { value: "noteCount:desc", label: "Notes", sort: { key: "noteCount", dir: "desc" } },
  { value: "appearances:desc", label: "Blind tastings", sort: { key: "appearances", dir: "desc" } },
  { value: "bottles:desc", label: "Bottles in cellars", sort: { key: "bottles", dir: "desc" } },
];

// (plan copy): every "sorted by …" word but "community rating".
export function sortedByWord(s: CatalogSort): string {
  switch (s.key) {
    case "avgScore":
      return "community rating";
    case "added":
      return s.dir === "asc" ? "oldest added" : "newest added";
    case "title":
      return "name";
    case "noteCount":
      return "notes";
    case "appearances":
      return "blind tastings";
    case "bottles":
      return "bottles in cellars";
    case "region":
      return "region";
    case "country":
      return "country";
    case "vintage":
      return "vintage";
  }
}

export function catalogPageLine(
  page: number,
  per: number,
  total: number,
  s: CatalogSort,
): string {
  const start = total === 0 ? 0 : (page - 1) * per + 1;
  const end = Math.min(page * per, total);
  return `${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} · sorted by ${sortedByWord(s)}`;
}

export type CatalogBand = {
  wines: number;
  notes: number;
  average: number | null;
  yourNotes: number;
  owned: number;
};

export function bandAverage(
  ratings: readonly { avg: number | null; count: number }[],
): number | null {
  let weighted = 0;
  let total = 0;
  for (const r of ratings) {
    if (r.avg == null || r.count <= 0) continue;
    weighted += r.avg * r.count;
    total += r.count;
  }
  if (total === 0) return null;
  // Half-up at one decimal, matching `fmtAvg`'s own rounding rule.
  return Math.round((weighted / total + Number.EPSILON) * 10) / 10;
}

export function bandParts(
  b: CatalogBand,
): { wines: string; notes: string; average: string | null } {
  return {
    wines: b.wines.toLocaleString("en-US"),
    notes: b.notes.toLocaleString("en-US"),
    average: b.average == null ? null : fmtAvg(b.average),
  };
}

export function bandLinePhone(b: CatalogBand): string {
  return `${b.wines.toLocaleString("en-US")} wines · ${b.notes.toLocaleString("en-US")} notes shared`;
}

export function yourLine(b: CatalogBand): { notes: string; owned: string } {
  return {
    notes: b.yourNotes.toLocaleString("en-US"),
    owned: b.owned.toLocaleString("en-US"),
  };
}

export function ownedBadge(n: number): string | null {
  return n > 0 ? `${n} owned` : null;
}

export function factsLine(r: CatalogRow): string | null {
  const parts = [r.grapes[0] ?? null, colourWord(r.colour), r.designation].filter(
    Boolean,
  ) as string[];
  return parts.length ? parts.join(" · ") : null;
}

export function phoneFactsLine(r: CatalogRow): string | null {
  const grape = r.grapes[0] ?? null;
  // The self-named regional appellation folds equal to its region — showing
  // both would just repeat the word, so the country takes the appellation's
  // place instead ("Riesling · Rheinhessen, Germany").
  if (r.appellation && r.region && fold(r.appellation) === fold(r.region)) {
    const place = [r.region, r.country].filter(Boolean).join(", ") || null;
    const parts = [grape, place].filter(Boolean) as string[];
    return parts.length ? parts.join(" · ") : null;
  }
  const parts = [grape, r.appellation, r.region].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}
