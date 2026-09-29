// Pure shaping behind the training room's server reads (training-room spec
// §4.6, §3.6, §6.1). pool.ts runs the queries as the viewer and hands the raw
// rows here; nothing in this file touches Supabase, React or server-only, so
// vitest pins every rule. Runtime imports are relative only (vitest has no
// `@/` alias).
import { catalogWineTitle } from "../wset/wine-title";
import { isRegionalAppellation, lineageForParts } from "./archetype-view";
import type { VintageKind } from "../supabase/database.types";
import type { WineColour, WineStyle } from "../wset/types";
import type { HistoryCursor } from "./action-types";
import type {
  AttemptRow,
  CapReason,
  Named,
  PointCategory,
  RankingSnapshot,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** Rows per history page (spec §3.6). */
export const HISTORY_PAGE = 20;
/** How far a merged catalog wine is followed — a cycle guard, not a real depth. */
export const MAX_MERGE_HOPS = 5;

// --- The candidate pool (spec §4.6) --------------------------------------------

export type ArchetypeRaw = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country_id: string;
  region_id: string;
  appellation_id: string;
  primary_grape_id: string;
  secondary_grape_id: string | null;
  typical_age_low: number | null;
  typical_age_high: number | null;
  /** jsonb — shaped defensively, a malformed entry is dropped. */
  sat: unknown;
  quality_low: number | null;
  quality_high: number | null;
  wine_place_id: string | null;
  sort_order: number;
};
export type ArchetypeAromaRaw = {
  archetype_id: string;
  term_id: string;
  kind: "NOSE" | "PALATE";
  signature: boolean;
};
export type AromaTermRaw = { id: string; term: string; group_name: string };
export type ArchetypeDesignationRaw = { archetype_id: string; type_designation_id: string };
export type PoolRaw = {
  archetypes: ArchetypeRaw[];
  aromas: ArchetypeAromaRaw[];
  terms: AromaTermRaw[];
  designations: ArchetypeDesignationRaw[];
  names: {
    countries: Named[];
    regions: Named[];
    appellations: Named[];
    grapes: Named[];
    /** In type_designations.sort_order — the order a candidate lists them. */
    typeDesignations: Named[];
  };
  /** By archetype id, from placeLinks(); an empty map (the RPC's fail-soft
      path, spec RM3a) leaves every candidate off the wine map. */
  placeLinks: ReadonlyMap<string, PlaceLink>;
  /** By archetype id, from displayPoints(); an empty map (the display-point
      read's fail-soft path, spec RM23) leaves no curated dot. */
  displayPoints: ReadonlyMap<string, DisplayPoint>;
};

/** One row of the room's display-point read (training-room-map spec RM23). */
export type DisplayPointRaw = { id: string; display_lon: number | null; display_lat: number | null };

/** A curated, display-only map point: never a map place (spec RM7, RM23). */
export type DisplayPoint = { lon: number; lat: number };

/**
 * The curated display points by archetype id (spec RM23). A half-set,
 * non-finite or out-of-range point is no point: the database's check refuses
 * one, and the room never trusts a row it did not check.
 */
export function displayPoints(rows: readonly DisplayPointRaw[]): Map<string, DisplayPoint> {
  const out = new Map<string, DisplayPoint>();
  for (const r of rows) {
    if (inRange(r.display_lon, 180) && inRange(r.display_lat, 90)) {
      out.set(r.id, { lon: r.display_lon, lat: r.display_lat });
    }
  }
  return out;
}

/** One row of training_archetype_places() (training-room-map spec §4.1, RM3). */
export type ArchetypePlaceRaw = {
  archetype_id: string;
  place_key: string | null;
  region_key: string | null;
  region_name: string | null;
  point_key: string | null;
  point_lon: number | null;
  point_lat: number | null;
};

/** A candidate's wine-map fields, as TrainingCandidate carries them. */
export type PlaceLink = Pick<TrainingCandidate, "placeCanonicalKey" | "mapRegion" | "mapPoint">;

export const UNPLACED: PlaceLink = { placeCanonicalKey: null, mapRegion: null, mapPoint: null };

function inRange(v: number | null, limit: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
}

/**
 * The RPC's rows by archetype id (spec §5). A row without a home key is
 * unplaced whatever else it carries; a region needs its key and its name; a
 * point needs its key and a finite, in-range lon/lat, and is the home's own
 * ("place") when its key is the home key, else an ancestor's.
 */
export function placeLinks(rows: readonly ArchetypePlaceRaw[]): Map<string, PlaceLink> {
  const out = new Map<string, PlaceLink>();
  for (const r of rows) {
    if (!r.place_key) {
      out.set(r.archetype_id, UNPLACED);
      continue;
    }
    const mapRegion = r.region_key && r.region_name ? { key: r.region_key, name: r.region_name } : null;
    const source: "place" | "ancestor" = r.point_key === r.place_key ? "place" : "ancestor";
    const mapPoint =
      r.point_key && inRange(r.point_lon, 180) && inRange(r.point_lat, 90)
        ? { lon: r.point_lon, lat: r.point_lat, source }
        : null;
    out.set(r.archetype_id, { placeCanonicalKey: r.place_key, mapRegion, mapPoint });
  }
  return out;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function named(row: Named | undefined): Named | null {
  return row ? { id: row.id, name: row.name } : null;
}

function cleanSat(raw: unknown): Record<string, [string, string] | undefined> {
  const out: Record<string, [string, string] | undefined> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      out[key] = [value[0], value[1]];
    }
  }
  return out;
}

/**
 * The pool as TrainingCandidate[], in sort_order then name. An archetype whose
 * scoring identity the viewer cannot name (a reference row missing from the
 * reads) is left out rather than shown half-named (D8, D11).
 */
export function shapeCandidates(raw: PoolRaw): TrainingCandidate[] {
  const index = (rows: readonly Named[]) => new Map(rows.map((r) => [r.id, r] as const));
  const countries = index(raw.names.countries);
  const regions = index(raw.names.regions);
  const appellations = index(raw.names.appellations);
  const grapes = index(raw.names.grapes);
  const designationById = index(raw.names.typeDesignations);
  const designationRank = new Map(raw.names.typeDesignations.map((d, i) => [d.id, i] as const));
  const termById = new Map(raw.terms.map((t) => [t.id, t] as const));
  const aromasOf = groupBy(raw.aromas, (a) => a.archetype_id);
  const designationsOf = groupBy(raw.designations, (d) => d.archetype_id);

  const ordered = [...raw.archetypes].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const out: TrainingCandidate[] = [];
  for (const a of ordered) {
    const country = named(countries.get(a.country_id));
    const region = named(regions.get(a.region_id));
    const appellation = named(appellations.get(a.appellation_id));
    const primaryGrape = named(grapes.get(a.primary_grape_id));
    if (!country || !region || !appellation || !primaryGrape) continue;

    const aromas = (aromasOf.get(a.id) ?? []).flatMap((link) => {
      const term = termById.get(link.term_id);
      return term
        ? [{ termId: link.term_id, term: term.term, group: term.group_name, kind: link.kind, signature: link.signature }]
        : [];
    });
    const designations = (designationsOf.get(a.id) ?? [])
      .map((d) => named(designationById.get(d.type_designation_id)))
      .filter((d): d is Named => d !== null)
      .sort((x, y) => (designationRank.get(x.id) ?? 0) - (designationRank.get(y.id) ?? 0));

    // A dot's position, in order (spec RM12): the home's label point, the
    // nearest ancestor's (both from placeLinks), else the curated point.
    const place = raw.placeLinks.get(a.id) ?? UNPLACED;
    const curated = raw.displayPoints.get(a.id);
    out.push({
      id: a.id,
      name: a.name,
      description: a.description,
      colour: a.colour,
      style: a.style,
      country,
      region,
      appellation: { ...appellation, isRegional: isRegionalAppellation(region, appellation) },
      primaryGrape,
      secondaryGrape: a.secondary_grape_id ? named(grapes.get(a.secondary_grape_id)) : null,
      designations,
      typicalAge:
        a.typical_age_low !== null && a.typical_age_high !== null
          ? [a.typical_age_low, a.typical_age_high]
          : null,
      sat: cleanSat(a.sat),
      aromas,
      ...place,
      mapPoint: place.mapPoint ?? (curated ? { ...curated, source: "curated" } : null),
      qualityLow: a.quality_low,
      qualityHigh: a.quality_high,
    });
  }
  return out;
}

/** The coverage line's countries: how many candidates each, most first, then by name. */
export function coverageCountries(pool: readonly TrainingCandidate[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(c.country.name, (counts.get(c.country.name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// --- Attempts (spec §6.1, §3.6) -----------------------------------------------------

export function vintageFromColumns(
  kind: VintageKind | null,
  year: number | null,
  tawnyYears: number | null,
): VintageGuess {
  if (kind === "YEAR" && year !== null) return { kind: "YEAR", year };
  if (kind === "NV") return { kind: "NV" };
  if (kind === "TAWNY" && tawnyYears !== null) return { kind: "TAWNY", years: tawnyYears };
  return null;
}

export function vintageColumns(v: VintageGuess): {
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
} {
  return {
    guessed_vintage_kind: v ? v.kind : null,
    guessed_vintage_year: v && v.kind === "YEAR" ? v.year : null,
    guessed_vintage_tawny_years: v && v.kind === "TAWNY" ? v.years : null,
  };
}

const CAPS: readonly CapReason[] = ["colour", "bubbles", "fortified"];

/** The stored ranking (candidates_snapshot jsonb), keeping only well-formed entries. */
export function parseSnapshot(raw: unknown): RankingSnapshot {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const { archetypeId, name, closeness, rank, capped } = e;
    if (typeof archetypeId !== "string" || typeof name !== "string") return [];
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) return [];
    if (closeness !== null && (typeof closeness !== "number" || closeness < 0 || closeness > 100)) return [];
    if (capped !== null && !CAPS.includes(capped as CapReason)) return [];
    return [
      {
        archetypeId,
        name,
        closeness: closeness as number | null,
        rank,
        capped: capped as CapReason | null,
      },
    ];
  });
}

/** Follows catalog_wines.merged_into from `start` (spec §6.1: merges are followed on read). */
export function finalWineId(start: string, mergedInto: ReadonlyMap<string, string | null>): string {
  let id = start;
  const seen = new Set([id]);
  for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
    const next = mergedInto.get(id);
    if (!next || seen.has(next)) return id;
    seen.add(next);
    id = next;
  }
  return id;
}

/**
 * "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé".
 * The place and grapes are the candidate lineage itself (lineageForParts →
 * copy.ts's lineageLine, so a region's self-named appellation is left out the
 * same way and the two can never format differently); only the designation is
 * appended here. Null when the viewer cannot name a region, country,
 * appellation or primary grape — catalog_wines holds all four (NOT NULL), so a
 * missing one is an unreadable reference, not a wine without one.
 */
export function actualWineLineage(p: {
  appellation: string | null;
  region: string | null;
  country: string | null;
  primaryGrape: string | null;
  secondaryGrape: string | null;
  designation: string | null;
}): string | null {
  if (!p.region || !p.country || !p.appellation || !p.primaryGrape) return null;
  const base = lineageForParts({
    country: { id: "", name: p.country },
    region: { id: "", name: p.region },
    appellation: { id: "", name: p.appellation },
    primaryGrape: { id: "", name: p.primaryGrape },
    secondaryGrape: p.secondaryGrape ? { id: "", name: p.secondaryGrape } : null,
  });
  return p.designation ? `${base} · ${p.designation}` : base;
}

type One<T> = T | T[] | null;
function nameOf(rel: One<{ name: string }> | undefined): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

/** The revealed wine's display read. Embeds need the FK hints (two grape FKs). */
export const CATALOG_DISPLAY_COLUMNS: string =
  "id, colour, wine_name, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), country:countries(name), region:regions(name), " +
  "appellation:appellations(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
  "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name), " +
  "type_designation:type_designations(name)";

export type CatalogDisplayRaw = {
  id: string;
  colour: WineColour | null;
  wine_name: string | null;
  vintage_kind: VintageKind | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: One<{ name: string }>;
  country: One<{ name: string }>;
  region: One<{ name: string }>;
  appellation: One<{ name: string }>;
  primary_grape: One<{ name: string }>;
  secondary_grape: One<{ name: string }>;
  type_designation: One<{ name: string }>;
};

export type WineDisplay = { label: string; lineage: string | null; colour: WineColour | null };

export function wineDisplay(row: CatalogDisplayRaw): WineDisplay {
  return {
    label: catalogWineTitle({
      producerName: nameOf(row.producer),
      wineName: row.wine_name,
      vintageKind: row.vintage_kind ?? "YEAR",
      vintageYear: row.vintage_year,
      vintageTawnyYears: row.vintage_tawny_years,
      appellationName: nameOf(row.appellation),
    }),
    lineage: actualWineLineage({
      appellation: nameOf(row.appellation),
      region: nameOf(row.region),
      country: nameOf(row.country),
      primaryGrape: nameOf(row.primary_grape),
      secondaryGrape: nameOf(row.secondary_grape),
      designation: nameOf(row.type_designation),
    }),
    colour: row.colour,
  };
}

/** Every training_attempts column the room reads (spec §6.1). */
export const ATTEMPT_COLUMNS: string =
  "id, created_at, note_id, picked_archetype_id, picked_region_id, picked_grape_id, " +
  "guessed_vintage_kind, guessed_vintage_year, " +
  "guessed_vintage_tawny_years, actual_catalog_wine_id, actual_archetype_id, note_colour_hue, " +
  "hue_cleared, candidates_snapshot, country_points, region_points, appellation_points, " +
  "primary_grape_points, secondary_grape_points, type_designation_points, vintage_points, " +
  "total_points, possible_points";

export type AttemptRaw = {
  id: string;
  created_at: string;
  note_id: string;
  picked_archetype_id: string | null;
  picked_region_id: string | null;
  picked_grape_id: string | null;
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
  actual_catalog_wine_id: string | null;
  actual_archetype_id: string | null;
  note_colour_hue: string | null;
  hue_cleared: boolean;
  candidates_snapshot: unknown;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
  possible_points: number | null;
};

type PointColumns = Partial<
  Pick<
    AttemptRaw,
    | "country_points"
    | "region_points"
    | "appellation_points"
    | "primary_grape_points"
    | "secondary_grape_points"
    | "type_designation_points"
    | "vintage_points"
  >
>;

function pointsOf(raw: PointColumns): Record<PointCategory, number | null> {
  return {
    country: raw.country_points ?? null,
    region: raw.region_points ?? null,
    appellation: raw.appellation_points ?? null,
    primaryGrape: raw.primary_grape_points ?? null,
    secondaryGrape: raw.secondary_grape_points ?? null,
    typeDesignation: raw.type_designation_points ?? null,
    vintage: raw.vintage_points ?? null,
  };
}

// An id with its name, or null when there is no id or no name was read for it.
function namedFrom(names: ReadonlyMap<string, string>, id: string | null): Named | null {
  const name = id ? names.get(id) : undefined;
  return id && name !== undefined ? { id, name } : null;
}

export function shapeAttemptRow(
  raw: AttemptRaw,
  ctx: {
    archetypeNames: ReadonlyMap<string, string>;
    /** The picked regions' and grapes' names (region-guess addendum R8). */
    regionNames: ReadonlyMap<string, string>;
    grapeNames: ReadonlyMap<string, string>;
    mergedInto: ReadonlyMap<string, string | null>;
    wines: ReadonlyMap<string, WineDisplay>;
  },
): AttemptRow {
  const archetype = (id: string | null) => namedFrom(ctx.archetypeNames, id);
  let actual: AttemptRow["actual"] = null;
  if (raw.actual_catalog_wine_id) {
    const catalogWineId = finalWineId(raw.actual_catalog_wine_id, ctx.mergedInto);
    const wine = ctx.wines.get(catalogWineId);
    actual = { catalogWineId, label: wine?.label ?? null, lineage: wine?.lineage ?? null };
  }
  return {
    id: raw.id,
    createdAt: raw.created_at,
    picked: archetype(raw.picked_archetype_id),
    pickedRegion: namedFrom(ctx.regionNames, raw.picked_region_id),
    pickedGrape: namedFrom(ctx.grapeNames, raw.picked_grape_id),
    vintage: vintageFromColumns(
      raw.guessed_vintage_kind,
      raw.guessed_vintage_year,
      raw.guessed_vintage_tawny_years,
    ),
    actual,
    actualArchetype: archetype(raw.actual_archetype_id),
    hueCleared: raw.hue_cleared,
    noteColourHue: raw.note_colour_hue,
    points: pointsOf(raw),
    total: raw.total_points,
    possible: raw.possible_points,
    snapshot: parseSnapshot(raw.candidates_snapshot),
  };
}

/** PostgREST `or=` for "older than the cursor": (created_at, id) < (cursor). The
    raw timestamp keeps its microseconds (a JS Date would drop them). */
export function historyOrFilter(cursor: HistoryCursor): string {
  return (
    `created_at.lt."${cursor.createdAt}",` +
    `and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
  );
}

/** A page read with limit HISTORY_PAGE + 1: the extra row only says "there is more". */
export function pageOf<T>(
  rows: readonly T[],
  cursorOf: (row: T) => HistoryCursor,
): { rows: T[]; nextCursor: HistoryCursor | null } {
  if (rows.length <= HISTORY_PAGE) return { rows: [...rows], nextCursor: null };
  const page = rows.slice(0, HISTORY_PAGE);
  return { rows: page, nextCursor: cursorOf(page[page.length - 1]) };
}

/** The tally's one light select, shaped for history-math's tally(). */
export function tallyRows(
  raw: readonly { primary_grape_points: number | null; appellation_points: number | null; total_points: number | null }[],
): Pick<AttemptRow, "points" | "total">[] {
  return raw.map((r) => ({
    points: pointsOf({ primary_grape_points: r.primary_grape_points, appellation_points: r.appellation_points }),
    total: r.total_points,
  }));
}
