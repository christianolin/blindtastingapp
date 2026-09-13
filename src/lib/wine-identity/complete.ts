// The one definition of a complete wine (D2, spec §B.3). No "is it complete"
// logic may exist outside src/lib/wine-identity/. Pure: relative imports only.
import { orderedBlend } from "../wine-blend";
import { foldName } from "./fold";
import type {
  BlendRow, CompleteVintage, CompleteWine, RefChoice, UnidentifiedWine,
  WineColour, WineFieldKey, WineIdentityDraft, WineStyle,
} from "./types";

/** The catalog_wines NOT NULL columns. Wine name is optional (D3); flipping
    that means adding "wineName" here and to WineFieldKey. */
export const COMPLETE_WINE_FIELDS = [
  "producer", "vintage", "colour", "style",
  "country", "region", "appellation", "primaryGrape",
] as const satisfies readonly WineFieldKey[];

/** byhand-7: an unidentified flight glass needs only these — the wine_answers
    NOT NULL columns (country, region, primary grape) plus a vintage. */
export const UNIDENTIFIED_WINE_FIELDS = [
  "vintage", "country", "region", "primaryGrape",
] as const satisfies readonly WineFieldKey[];

export const VINTAGE_YEAR_MIN = 1900;
const TAWNY_YEARS_MIN = 1;
const TAWNY_YEARS_MAX = 100;

export function vintageYearMax(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

export function emptyDraft(): WineIdentityDraft {
  return {
    producer: null,
    wineName: null,
    vintage: { kind: null, year: null, tawnyYears: null, read: false },
    colour: null,
    style: null,
    countryId: null,
    regionId: null,
    appellationId: null,
    blend: [],
    typeDesignationId: null,
    alcohol: null,
    description: null,
    imageUrl: null,
    provenance: {},
  };
}

function blankToNull(s: string | null): string | null {
  const trimmed = s?.trim();
  return trimmed ? trimmed : null;
}

function refPresent(ref: RefChoice | null): ref is RefChoice {
  if (!ref) return false;
  return ref.kind === "existing" || foldName(ref.name) !== "";
}

function idPresent(id: string | null): id is string {
  return typeof id === "string" && id.trim() !== "";
}

function isVintageYear(year: number | null, now: Date): year is number {
  return typeof year === "number" && Number.isInteger(year)
    && year >= VINTAGE_YEAR_MIN && year <= vintageYearMax(now);
}

function isTawnyAge(years: number | null): years is number {
  return typeof years === "number" && Number.isInteger(years)
    && years >= TAWNY_YEARS_MIN && years <= TAWNY_YEARS_MAX;
}

function normaliseVintage(v: WineIdentityDraft["vintage"]): WineIdentityDraft["vintage"] {
  switch (v.kind) {
    case "YEAR": return { kind: "YEAR", year: v.year, tawnyYears: null, read: v.read };
    case "NV": return { kind: "NV", year: null, tawnyYears: null, read: v.read };
    case "TAWNY": return { kind: "TAWNY", year: null, tawnyYears: v.tawnyYears, read: v.read };
    default: return { ...v };
  }
}

// Kept only in (0, 100), rounded to one decimal. The rounded value is checked
// too: 99.96 rounds to 100.0, which catalog_wines_alcohol_percent_ck refuses.
function normaliseAlcohol(alcohol: number | null): number | null {
  if (typeof alcohol !== "number" || !Number.isFinite(alcohol)) return null;
  if (alcohol <= 0 || alcohol >= 100) return null;
  const rounded = Math.round(alcohol * 10) / 10;
  return rounded > 0 && rounded < 100 ? rounded : null;
}

function normaliseBlend(rows: BlendRow[]): BlendRow[] {
  // 1. Drop pending rows whose folded name is empty.
  const named = rows.filter((row) => row.grape.kind === "existing" || foldName(row.grape.name) !== "");
  // 2. Dedupe: existing rows by id, pending rows by folded name; the first wins.
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const unique = named.filter(({ grape }) => {
    const seen = grape.kind === "existing" ? seenIds : seenNames;
    const key = grape.kind === "existing" ? grape.id : foldName(grape.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 3. Order with orderedBlend — the catalog_wine_grapes trigger's rule.
  const ordered = orderedBlend(unique.map((row, index) => ({
    grapeId: String(index),
    percentage: row.percentage == null ? "" : String(row.percentage),
  })));
  return ordered.map(({ grapeId }) => {
    const row = unique[Number(grapeId)];
    return { grape: row.grape, percentage: row.percentage };
  });
}

export function normaliseDraft(draft: WineIdentityDraft): WineIdentityDraft {
  const vintage = normaliseVintage(draft.vintage);
  return {
    ...draft,
    wineName: blankToNull(draft.wineName),
    vintage,
    style: vintage.kind === "TAWNY" ? "FORTIFIED" : draft.style,
    blend: normaliseBlend(draft.blend),
    alcohol: normaliseAlcohol(draft.alcohol),
    description: blankToNull(draft.description),
    provenance: { ...draft.provenance },
  };
}

type PresentValues = {
  producer: RefChoice | null;
  vintage: CompleteVintage | null;
  colour: WineColour | null;
  style: WineStyle | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  primaryGrape: RefChoice | null;
};

function toCompleteVintage(v: WineIdentityDraft["vintage"], now: Date): CompleteVintage | null {
  switch (v.kind) {
    case "YEAR": return isVintageYear(v.year, now) ? { kind: "YEAR", year: v.year, tawnyYears: null } : null;
    case "NV": return { kind: "NV", year: null, tawnyYears: null };
    case "TAWNY": return isTawnyAge(v.tawnyYears) ? { kind: "TAWNY", year: null, tawnyYears: v.tawnyYears } : null;
    default: return null;
  }
}

// Each field's value when it counts as present (the §B.3 table), else null.
// Expects a normalised draft.
function presentValues(d: WineIdentityDraft, now: Date): PresentValues {
  return {
    producer: refPresent(d.producer) ? d.producer : null,
    vintage: toCompleteVintage(d.vintage, now),
    colour: d.colour ?? null,
    style: d.style ?? null,
    country: idPresent(d.countryId) ? d.countryId : null,
    region: idPresent(d.regionId) ? d.regionId : null,
    appellation: idPresent(d.appellationId) ? d.appellationId : null,
    primaryGrape: d.blend.find((row) => refPresent(row.grape))?.grape ?? null,
  };
}

function missingIn(values: PresentValues, order: readonly WineFieldKey[]): WineFieldKey[] {
  return order.filter((field) => values[field] == null);
}

export function missingWineFields(
  draft: WineIdentityDraft,
  opts: { unidentified?: boolean; now?: Date } = {},
): WineFieldKey[] {
  const values = presentValues(normaliseDraft(draft), opts.now ?? new Date());
  return missingIn(values, opts.unidentified ? UNIDENTIFIED_WINE_FIELDS : COMPLETE_WINE_FIELDS);
}

export function toCompleteWine(
  draft: WineIdentityDraft,
  opts: { now?: Date } = {},
): { wine: CompleteWine } | { missing: WineFieldKey[] } {
  const d = normaliseDraft(draft);
  const values = presentValues(d, opts.now ?? new Date());
  const { producer, vintage, colour, style, country, region, appellation, primaryGrape } = values;
  if (!producer || !vintage || !colour || !style || !country || !region || !appellation || !primaryGrape) {
    return { missing: missingIn(values, COMPLETE_WINE_FIELDS) };
  }
  return {
    wine: {
      producer,
      wineName: d.wineName,
      vintage,
      colour,
      style,
      countryId: country,
      regionId: region,
      appellationId: appellation,
      blend: d.blend,
      primaryGrape,
      secondaryGrape: d.blend[1]?.grape ?? null,
      typeDesignationId: blankToNull(d.typeDesignationId),
      alcohol: d.alcohol,
      description: d.description,
      imageUrl: blankToNull(d.imageUrl),
    },
  };
}

export function toUnidentifiedWine(
  draft: WineIdentityDraft,
  opts: { now?: Date } = {},
): { wine: UnidentifiedWine } | { missing: WineFieldKey[] } {
  const d = normaliseDraft(draft);
  const values = presentValues(d, opts.now ?? new Date());
  const { vintage, country, region, primaryGrape } = values;
  if (!vintage || !country || !region || !primaryGrape) {
    return { missing: missingIn(values, UNIDENTIFIED_WINE_FIELDS) };
  }
  return {
    wine: {
      producer: values.producer,
      wineName: d.wineName,
      vintage,
      colour: values.colour,
      style: values.style,
      countryId: country,
      regionId: region,
      appellationId: values.appellation,
      blend: d.blend,
      primaryGrape,
      secondaryGrape: d.blend[1]?.grape ?? null,
      typeDesignationId: blankToNull(d.typeDesignationId),
      alcohol: d.alcohol,
      description: d.description,
      imageUrl: blankToNull(d.imageUrl),
    },
  };
}
