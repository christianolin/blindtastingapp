// Cellar rows: dimensions, header stats, search, sort, filter, grouping,
// paging and footer copy (CC-P1). Pure: no `server-only`, no Supabase
// client, no React. Runtime imports come from ./format only — every type
// comes from ./types as `import type`.
import { bottleTitle, colourWord, plural, vintageLabel } from "./format";
import type {
  BottleRow,
  Dimension,
  FilterState,
  GroupKey,
  SortKey,
  WineColour,
} from "./types";

// ---------------------------------------------------------------------------
// Dimension strip (C1 tiles)
// ---------------------------------------------------------------------------

export type DimensionCounts = Record<Dimension, number>;

export const DIMENSIONS: readonly Dimension[] = [
  "countries",
  "regions",
  "producers",
  "grapes",
  "vintages",
];

export const DIMENSION_GROUP: Record<
  Dimension,
  "country" | "region" | "producer" | "grape" | "vintage"
> = {
  countries: "country",
  regions: "region",
  producers: "producer",
  grapes: "grape",
  vintages: "vintage",
};

export function dimensionCounts(rows: readonly BottleRow[]): DimensionCounts {
  const countries = new Set<string>();
  const regions = new Set<string>();
  const producers = new Set<string>();
  const grapes = new Set<string>();
  const vintages = new Set<string>();
  for (const r of rows) {
    if (r.wine.country != null) countries.add(r.wine.country);
    if (r.wine.region != null) regions.add(r.wine.region);
    if (r.wine.producer != null) producers.add(r.wine.producer);
    if (r.wine.primaryGrape != null) grapes.add(r.wine.primaryGrape);
    vintages.add(vintageLabel(r.wine));
  }
  return {
    countries: countries.size,
    regions: regions.size,
    producers: producers.size,
    grapes: grapes.size,
    vintages: vintages.size,
  };
}

// (plan copy) — the shipped hand-off draws this line without a "value" word,
// consistent with D4.
export const STRIP_CAPTION =
  "The shape of what you own, and the way into it — tapping one groups the list by that dimension. Nothing is grouped by default: the full list comes first.";

// ---------------------------------------------------------------------------
// Header stats and subtitle
// ---------------------------------------------------------------------------

export type HeaderStats = {
  bottles: number;
  wines: number;
  tasted: number;
  producers: number;
  countries: number;
};

export function headerStats(rows: readonly BottleRow[]): HeaderStats {
  const bottles = rows.reduce((sum, r) => sum + r.lot.quantity, 0);
  const wines = new Set(rows.map((r) => r.wine.catalogWineId));
  const tasted = new Set(
    rows.filter((r) => r.yours != null).map((r) => r.wine.catalogWineId),
  );
  const producers = new Set(
    rows.map((r) => r.wine.producer).filter((v): v is string => v != null),
  );
  const countries = new Set(
    rows.map((r) => r.wine.country).filter((v): v is string => v != null),
  );
  return {
    bottles,
    wines: wines.size,
    tasted: tasted.size,
    producers: producers.size,
    countries: countries.size,
  };
}

export function headerSubtitle(
  s: HeaderStats,
  opts: { phone: boolean; readOnly: boolean },
): string {
  const bottles = plural(s.bottles, "bottle", "bottles");
  const wines = plural(s.wines, "wine", "wines");
  if (opts.readOnly) return `${bottles} · ${wines}`;
  if (opts.phone) return `${bottles} · ${wines} · ${s.tasted} tasted`;
  return `${bottles} · ${wines} · you have tasted ${s.tasted} of them`;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function foldSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function searchHaystack(row: BottleRow): string {
  const w = row.wine;
  const parts = [
    w.title,
    w.producer,
    w.wineName,
    w.appellation,
    w.region,
    w.country,
    w.primaryGrape,
    w.designation,
    row.lot.storageLocation,
  ].filter((v): v is string => v != null && v !== "");
  return foldSearch(parts.join(" "));
}

/** `needle` is already folded (via `foldSearch`); `""` matches every row. */
export function matchesSearch(row: BottleRow, needle: string): boolean {
  if (needle === "") return true;
  return searchHaystack(row).includes(needle);
}

export function searchPlaceholder(
  bottles: number,
  opts: { phone: boolean },
): string {
  if (opts.phone) return `Search ${plural(bottles, "bottle", "bottles")}`;
  return "Wine, producer, grape or where it is";
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const EMPTY_FILTERS: FilterState = {
  country: null,
  region: null,
  colour: null,
  grape: null,
  vintage: null,
};

const FILTER_KEYS: readonly (keyof FilterState)[] = [
  "country",
  "region",
  "colour",
  "grape",
  "vintage",
];

export function applyFilters(
  rows: readonly BottleRow[],
  f: FilterState,
): BottleRow[] {
  return rows.filter((r) => {
    if (f.country != null && r.wine.country !== f.country) return false;
    if (f.region != null && r.wine.region !== f.region) return false;
    if (f.colour != null && r.wine.colour !== f.colour) return false;
    if (f.grape != null && r.wine.primaryGrape !== f.grape) return false;
    if (f.vintage != null && vintageLabel(r.wine) !== f.vintage) return false;
    return true;
  });
}

export function filterCount(f: FilterState): number {
  return FILTER_KEYS.filter((k) => f[k] != null).length;
}

export type FilterOption = { value: string; label: string; count: number };
export type FilterOptions = Record<keyof FilterState, FilterOption[]>;

function filterFieldValue(
  row: BottleRow,
  key: keyof FilterState,
): string | null {
  switch (key) {
    case "country":
      return row.wine.country;
    case "region":
      return row.wine.region;
    case "colour":
      return row.wine.colour;
    case "grape":
      return row.wine.primaryGrape;
    case "vintage":
      return vintageLabel(row.wine);
  }
}

function filterFieldLabel(key: keyof FilterState, value: string): string {
  if (key === "colour") return colourWord(value as WineColour) ?? value;
  return value;
}

function vintageSortKey(label: string): number {
  const n = parseInt(label, 10);
  return Number.isNaN(n) ? -Infinity : n;
}

function compareVintageOptionsDesc(a: FilterOption, b: FilterOption): number {
  const ka = vintageSortKey(a.value);
  const kb = vintageSortKey(b.value);
  if (ka !== kb) return kb - ka;
  return a.label.localeCompare(b.label);
}

export function filterOptions(
  rows: readonly BottleRow[],
  f: FilterState,
): FilterOptions {
  const result = {} as FilterOptions;
  for (const key of FILTER_KEYS) {
    const otherFilters: FilterState = { ...f, [key]: null };
    const subset = applyFilters(rows, otherFilters);
    const totals = new Map<string, number>();
    for (const row of subset) {
      const value = filterFieldValue(row, key);
      if (value == null || value === "") continue;
      totals.set(value, (totals.get(value) ?? 0) + row.lot.quantity);
    }
    const options: FilterOption[] = Array.from(totals.entries()).map(
      ([value, count]) => ({ value, label: filterFieldLabel(key, value), count }),
    );
    if (key === "vintage") {
      options.sort(compareVintageOptionsDesc);
    } else {
      options.sort((a, b) => a.label.localeCompare(b.label));
    }
    result[key] = options;
  }
  return result;
}

export type FilterChip = { key: keyof FilterState; label: string };

export function filterChips(f: FilterState): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of FILTER_KEYS) {
    const value = f[key];
    if (value != null) chips.push({ key, label: filterFieldLabel(key, value) });
  }
  return chips;
}

export function clearFilter(
  f: FilterState,
  key: keyof FilterState,
): FilterState {
  if (key === "country") return { ...f, country: null, region: null };
  return { ...f, [key]: null };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

export const SORT_ORDER: readonly SortKey[] = [
  "bottles",
  "name",
  "added",
  "yours",
  "community",
];

export const SORT_LABELS: Record<SortKey, string> = {
  bottles: "Most bottles",
  name: "Name",
  added: "Added",
  yours: "Your score",
  community: "Community",
};

/** `null`/unset always sorts after every real value, whichever side it is on. */
function compareNullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function sortRows(
  rows: readonly BottleRow[],
  key: SortKey,
): BottleRow[] {
  const arr = rows.slice();
  switch (key) {
    case "bottles":
      arr.sort(
        (a, b) =>
          b.lot.quantity - a.lot.quantity ||
          bottleTitle(a.wine).localeCompare(bottleTitle(b.wine)),
      );
      break;
    case "name":
      arr.sort((a, b) => bottleTitle(a.wine).localeCompare(bottleTitle(b.wine)));
      break;
    case "added":
      arr.sort(
        (a, b) =>
          new Date(b.lot.createdAt).getTime() - new Date(a.lot.createdAt).getTime(),
      );
      break;
    case "yours":
      arr.sort((a, b) =>
        compareNullsLast(a.yours?.score ?? null, b.yours?.score ?? null),
      );
      break;
    case "community":
      arr.sort((a, b) => compareNullsLast(a.community.avg, b.community.avg));
      break;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export const GROUP_ORDER: readonly GroupKey[] = [
  "none",
  "where",
  "country",
  "region",
  "appellation",
  "producer",
  "grape",
  "vintage",
  "colour",
];

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: "None",
  where: "Where it is",
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  producer: "Producer",
  grape: "Grape",
  vintage: "Vintage",
  colour: "Colour",
};

type GroupWords = { singular: string; plural: string };
const GROUP_WORDS: Record<Exclude<GroupKey, "none">, GroupWords> = {
  where: { singular: "place", plural: "places" },
  country: { singular: "country", plural: "countries" },
  region: { singular: "region", plural: "regions" },
  appellation: { singular: "appellation", plural: "appellations" },
  producer: { singular: "producer", plural: "producers" },
  grape: { singular: "grape", plural: "grapes" },
  vintage: { singular: "vintage", plural: "vintages" },
  colour: { singular: "colour", plural: "colours" },
};

export function groupWord(g: Exclude<GroupKey, "none">, n: number): string {
  const words = GROUP_WORDS[g];
  return n === 1 ? words.singular : words.plural;
}

export const NO_PLACE = "No place set";

export type GroupStats = {
  bottles: number;
  wines: number;
  tasted: number;
  regions: number;
  appellations: number;
  producers: number;
};

export type RowGroup = {
  key: string;
  label: string;
  sublabel: string | null;
  rows: BottleRow[];
  stats: GroupStats;
};

function groupValue(row: BottleRow, g: GroupKey): string | null {
  switch (g) {
    case "none":
      return null;
    case "where":
      return row.lot.storageLocation;
    case "country":
      return row.wine.country;
    case "region":
      return row.wine.region;
    case "appellation":
      return row.wine.appellation;
    case "producer":
      return row.wine.producer;
    case "grape":
      return row.wine.primaryGrape;
    case "vintage":
      return vintageLabel(row.wine);
    case "colour":
      return colourWord(row.wine.colour);
  }
}

function computeGroupStats(rows: readonly BottleRow[]): GroupStats {
  const bottles = rows.reduce((sum, r) => sum + r.lot.quantity, 0);
  const wines = new Set(rows.map((r) => r.wine.catalogWineId));
  const tasted = new Set(
    rows.filter((r) => r.yours != null).map((r) => r.wine.catalogWineId),
  );
  const regions = new Set(
    rows.map((r) => r.wine.region).filter((v): v is string => v != null),
  );
  const appellations = new Set(
    rows.map((r) => r.wine.appellation).filter((v): v is string => v != null),
  );
  const producers = new Set(
    rows.map((r) => r.wine.producer).filter((v): v is string => v != null),
  );
  return {
    bottles,
    wines: wines.size,
    tasted: tasted.size,
    regions: regions.size,
    appellations: appellations.size,
    producers: producers.size,
  };
}

export function groupRows(
  rows: readonly BottleRow[],
  g: GroupKey,
): RowGroup[] {
  if (g === "none") return [];
  const buckets = new Map<string, BottleRow[]>();
  for (const row of rows) {
    const raw = groupValue(row, g);
    const blank = raw == null || raw.trim() === "";
    // D10: only "where" (free-text storage_location) can be genuinely
    // unset — region/appellation are NOT NULL on catalog_wines, so no
    // other dimension gets a fallback bucket.
    if (g !== "where" && blank) continue;
    const key = g === "where" && blank ? NO_PLACE : (raw as string);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const groups: RowGroup[] = Array.from(buckets.entries()).map(
    ([key, groupedRows]) => ({
      key,
      label: key,
      sublabel: g === "region" ? (groupedRows[0].wine.country ?? null) : null,
      rows: groupedRows,
      stats: computeGroupStats(groupedRows),
    }),
  );
  groups.sort((a, b) => {
    if (a.label === NO_PLACE) return 1;
    if (b.label === NO_PLACE) return -1;
    if (b.stats.bottles !== a.stats.bottles) return b.stats.bottles - a.stats.bottles;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export function groupHeaderLine(
  g: GroupKey,
  s: GroupStats,
  opts: { phone: boolean; readOnly: boolean },
): string {
  const bottles = plural(s.bottles, "bottle", "bottles");
  if (opts.phone) {
    return opts.readOnly ? bottles : `${bottles} · ${s.tasted} tasted`;
  }
  const wines = plural(s.wines, "wine", "wines");
  let sub: string | null = null;
  if (g === "country") {
    sub = `${plural(s.regions, "region", "regions")} · ${plural(s.producers, "producer", "producers")}`;
  } else if (g === "region") {
    sub = `${plural(s.appellations, "appellation", "appellations")} · ${plural(s.producers, "producer", "producers")}`;
  } else if (g !== "producer") {
    sub = plural(s.producers, "producer", "producers");
  }
  const withSub = sub ? `${bottles} · ${wines} · ${sub}` : `${bottles} · ${wines}`;
  return opts.readOnly ? withSub : `${withSub} · you have tasted ${s.tasted}`;
}

export const GROUP_CAP = 8;

export function visibleGroups(
  groups: readonly RowGroup[],
  expanded: boolean,
): { shown: RowGroup[]; hidden: number } {
  if (expanded) return { shown: groups.slice(), hidden: 0 };
  return {
    shown: groups.slice(0, GROUP_CAP),
    hidden: Math.max(0, groups.length - GROUP_CAP),
  };
}

export function showMoreLabel(
  hidden: number,
  g: Exclude<GroupKey, "none">,
): string {
  return `Show ${hidden} more ${groupWord(g, hidden)}`;
}

// ---------------------------------------------------------------------------
// Row lines (what a row keeps under a grouping)
// ---------------------------------------------------------------------------

export type RowLines = {
  producer: string | null;
  title: string;
  facts: string | null;
  place: { appellation: string | null; region: string | null; country: string | null };
  where: string | null;
};

export function rowLines(row: BottleRow, g: GroupKey): RowLines {
  const w = row.wine;
  const title = bottleTitle(w, { dropVintage: g === "vintage" });
  const producer = g === "producer" ? null : w.producer;
  const facts = [
    g === "grape" ? null : w.primaryGrape,
    g === "colour" ? null : colourWord(w.colour),
    w.designation,
  ]
    .filter((v): v is string => v != null && v !== "")
    .join(" · ");
  const place = {
    appellation: g === "appellation" ? null : w.appellation,
    region: g === "region" ? null : w.region,
    country: g === "country" || g === "region" ? null : w.country,
  };
  const where = g === "where" ? null : row.lot.storageLocation;
  return { producer, title, facts: facts === "" ? null : facts, place, where };
}

/** Drops an appellation that folds equal to the region (a self-named
 * regional appellation, CLAUDE.md), so it is never said twice. */
export function placeText(p: RowLines["place"]): string | null {
  const appellationIsRegion =
    p.appellation != null &&
    p.region != null &&
    foldSearch(p.appellation) === foldSearch(p.region);
  const appellation = appellationIsRegion ? null : p.appellation;
  const locality = [p.region, p.country].filter((v): v is string => v != null);
  const localityText = locality.length > 0 ? locality.join(", ") : null;
  const parts = [appellation, localityText].filter((v): v is string => v != null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Paging and footer
// ---------------------------------------------------------------------------

export const LIST_PAGE = 25;
export const GRID_PAGE = 24;

export function pageSlice<T>(
  rows: readonly T[],
  page: number,
  per: number,
): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const clamped = Math.min(Math.max(1, page), pages);
  const start = (clamped - 1) * per;
  return { rows: rows.slice(start, start + per), page: clamped, pages };
}

export function pageLabel(page: number, pages: number): string {
  return `Page ${page} of ${pages}`;
}

export function rangeLabel(page: number, per: number, total: number): string {
  const start = (page - 1) * per + 1;
  const end = Math.min(page * per, total);
  return `${start}–${end} of ${total}`;
}

export function footerLine(opts: {
  chips: readonly FilterChip[];
  group: GroupKey;
  stats: HeaderStats;
  readOnly: boolean;
}): string {
  const { chips, group, stats } = opts;
  const chipPart = chips.length > 0 ? chips.map((c) => c.label).join(" · ") : "All";
  const acrossPart = `across ${plural(stats.wines, "wine", "wines")}, ${plural(
    stats.producers,
    "producer",
    "producers",
  )} and ${plural(stats.countries, "country", "countries")}`;
  const filterWord =
    chips.length === 0
      ? "nothing filtered"
      : `${chips.length} ${chips.length === 1 ? "filter" : "filters"}`;
  const groupWordPart =
    group === "none" ? "nothing grouped" : `grouped by ${GROUP_LABELS[group].toLowerCase()}`;
  return `${chipPart} · ${acrossPart} · ${filterWord}, ${groupWordPart}`;
}
