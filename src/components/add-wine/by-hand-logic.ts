// The by-hand form's pure rules (spec §B.4, §B.7, §B.8; screens A7 and A4b):
// the field chips, the producer's region link, producer adoption, the grape
// suggestion note, the blend line and the header. Kept apart from the
// component so they are unit-tested without a DOM.
//
// No completeness logic of its own (D2): whether a field is missing comes only
// from `missingWineFields`. The appellation helpers (`justTheRegionOption`,
// `appellationPlaceholder`, `appellationHint`) live in self-named-appellation.ts.
//
// Pure: runtime imports are relative (vitest has no `@/` alias); the `@/` type
// imports are erased.
import { missingWineFields } from "../../lib/wine-identity/complete";
import { foldName } from "../../lib/wine-identity/fold";
import type { GrapeSuggestion } from "../../lib/wine-identity/grape-suggestion";
import type {
  FieldProvenance,
  RefChoice,
  WineColour,
  WineFieldKey,
  WineIdentityDraft,
  WineStyle,
} from "../../lib/wine-identity/types";
import type { SheetMatrix } from "./matrix";

// ---------------------------------------------------------------------------
// Field chips (spec §B.4)

/** A field the form draws a chip or note for: the complete-wine fields plus the optional wine name. */
export type ChipField = WineFieldKey | "wineName";

/** `chip` sits beside the field label; `note` is the line under the field. */
export type FieldChip = { chip: string | null; note: string | null };

export type FieldChipContext = {
  /** The primary was pressed with gaps (`ByHandSession.attempted`). */
  attempted: boolean;
  /** The field Fix, or that attempted save, focused (`ByHandSession.focusField`). */
  focusField: WineFieldKey | null;
  /** The draft came from a label read, so an empty field is one the read missed. */
  readAttempted: boolean;
  /** The chosen producer's region-link name, for "matched · Piedmont". */
  producerRegionName: string | null;
  /** "I can't identify this bottle" (byhand-7): only UNIDENTIFIED_WINE_FIELDS are required. */
  unidentified?: boolean;
};

const READ_FROM_LABEL = "read from the label";
const REQUIRED = "required";
const DID_NOT_READ = "did not read";
const DID_NOT_READ_REQUIRED = "did not read — required";
const YOU_CHOOSE = "you choose";
const YOU_CONFIRM = "you confirm";
const WINE_NAME_HINT = "Leave blank if the label has no cuvée name";

function chipOnly(chip: string | null): FieldChip {
  return { chip, note: null };
}

/** "Filled from Cigliuti's region link. …" — null when there is no producer to name. */
function producerLinkNote(producer: RefChoice | null): string | null {
  const name = producer?.name.trim();
  return name ? `Filled from ${name}'s region link. Change either if the bottle disagrees.` : null;
}

/**
 * The chip or note for one field (spec §B.4). Provenance is read only for copy.
 * - A required field still missing that Fix focused, or that a save with gaps
 *   left behind (`attempted`), reads "did not read — required" after a read and
 *   "required" otherwise.
 * - A draft from a matched catalog wine (provenance `catalog-match`) shows
 *   "matched" on its producer and no chip on its other fields.
 * - The grape reads its own provenance, falling back to the blend's: a read
 *   stamps only `blend` (spec §B.5 step 9).
 * - With `unidentified`, a field outside UNIDENTIFIED_WINE_FIELDS is never "required".
 */
export function fieldChip(field: ChipField, draft: WineIdentityDraft, ctx: FieldChipContext): FieldChip {
  if (field === "wineName") {
    return draft.provenance.wineName === "label" && draft.wineName?.trim()
      ? chipOnly(READ_FROM_LABEL)
      : { chip: null, note: WINE_NAME_HINT };
  }

  const absent = missingWineFields(draft).includes(field);
  const required = ctx.unidentified ? missingWineFields(draft, { unidentified: true }).includes(field) : absent;
  if (required && (ctx.attempted || ctx.focusField === field)) {
    return chipOnly(ctx.readAttempted ? DID_NOT_READ_REQUIRED : REQUIRED);
  }

  const source: FieldProvenance | undefined = draft.provenance[field];
  switch (field) {
    case "producer":
      // A pending name that folds to nothing counts as absent.
      if (absent || !draft.producer) return chipOnly(required ? REQUIRED : null);
      if (draft.producer.kind === "pending") return chipOnly("new producer");
      return chipOnly(ctx.producerRegionName ? `matched · ${ctx.producerRegionName}` : "matched");
    case "vintage":
      if (absent) return chipOnly(ctx.readAttempted ? DID_NOT_READ : REQUIRED);
      return chipOnly(draft.vintage.read ? READ_FROM_LABEL : null);
    case "colour":
    case "style":
    case "country":
    case "region":
      if (absent) return chipOnly(required ? REQUIRED : null);
      if (source === "label") return chipOnly(READ_FROM_LABEL);
      if (source === "producer-region" && (field === "country" || field === "region")) {
        return { chip: null, note: producerLinkNote(draft.producer) };
      }
      return chipOnly(null);
    case "appellation":
      if (absent) return chipOnly(ctx.readAttempted ? DID_NOT_READ : YOU_CHOOSE);
      if (source === "label") return chipOnly(READ_FROM_LABEL);
      return chipOnly(source === "catalog-match" ? null : YOU_CHOOSE);
    case "primaryGrape": {
      // A read stamps its grapes on `blend` only (resolve.ts step 9); a pick or a
      // tapped suggestion stamps the grape itself, and that wins.
      const grapeSource = draft.provenance.primaryGrape ?? draft.provenance.blend;
      if (!absent && grapeSource === "label") return chipOnly(READ_FROM_LABEL);
      return chipOnly(!absent && grapeSource === "catalog-match" ? null : YOU_CONFIRM);
    }
    default: {
      const unknown: never = field;
      throw new Error(`Unknown by-hand field: ${String(unknown)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The producer's region link (round 1's rule, kept; RC10)

/** A producer's region link: `producers.region_id` and that region's country. */
export type ProducerRegionLink = { regionId: string; countryId: string };

/** Nobody set it, or a previous producer's region link did. */
function linkMayWrite(source: FieldProvenance | undefined): boolean {
  return source === undefined || source === "none" || source === "producer-region";
}

/**
 * Fold the chosen producer's region link into the draft — the one thing a
 * producer says about a new wine (owner decision, 2026-09-12: a producer makes
 * wines from many appellations and grapes, so neither follows from it).
 * - Returns the draft unchanged once an appellation is chosen.
 * - Writes country or region only where that field's provenance is absent,
 *   `none` or `producer-region` — never over a manual or read value.
 * - A link sets each such field, with provenance `producer-region`. Beside a
 *   kept half it writes only when it agrees with it — the kept country is the
 *   link's country, or the kept region is the link's region (resolve.ts step 7).
 * - Every field still marked `producer-region` that the link does not write (no
 *   link, or a link that disagrees with the kept half) is cleared and its
 *   provenance key deleted, so the note never names the wrong producer.
 * - Never touches the appellation or a grape. Returns the same object when
 *   nothing changes.
 */
export function applyProducerRegion(draft: WineIdentityDraft, link: ProducerRegionLink | null): WineIdentityDraft {
  // A chosen appellation is never stranded under a different region.
  if (draft.appellationId) return draft;
  const { provenance } = draft;
  const countryFree = linkMayWrite(provenance.country);
  const regionFree = linkMayWrite(provenance.region);

  // Field by field. Beside a half someone else set, the link writes only when it
  // agrees with that half (resolve.ts step 7), so a region never lands under
  // another country.
  const writeCountry = link !== null && countryFree && (regionFree || draft.regionId === link.regionId);
  const writeRegion = link !== null && regionFree && (countryFree || draft.countryId === link.countryId);
  // A field an earlier producer's link filled that this link does not write has
  // lost its source (a pending producer, one with no region, a failed lookup, or
  // a link that disagrees with the kept half). Kept, its note would name a
  // producer whose link never supplied it.
  const clearCountry = !writeCountry && provenance.country === "producer-region";
  const clearRegion = !writeRegion && provenance.region === "producer-region";

  const countryId = link && writeCountry ? link.countryId : clearCountry ? null : draft.countryId;
  const regionId = link && writeRegion ? link.regionId : clearRegion ? null : draft.regionId;
  const unchanged =
    !clearCountry && !clearRegion &&
    countryId === draft.countryId && regionId === draft.regionId &&
    (!writeCountry || provenance.country === "producer-region") &&
    (!writeRegion || provenance.region === "producer-region");
  if (unchanged) return draft;

  const next = { ...provenance };
  if (writeCountry) next.country = "producer-region";
  else if (clearCountry) delete next.country;
  if (writeRegion) next.region = "producer-region";
  else if (clearRegion) delete next.region;
  return { ...draft, countryId, regionId, provenance: next };
}

// ---------------------------------------------------------------------------
// Producer adoption (spec §B.7, byhand-1)

export type ProducerAdoption<H> = { adopt: H } | { suggest: H } | { pending: string };

/**
 * What a typed producer name becomes after a search:
 * - `adopt`: a hit whose folded name equals the typed one — used at once, so no duplicate is created;
 * - `suggest`: otherwise the top hit, offered as "Did you mean {name}? · Use", never chosen;
 * - `pending`: no hits — the trimmed name, created only when the wine is saved.
 */
export function pickProducerAdoption<H extends { id: string; name: string }>(
  typed: string,
  hits: readonly H[],
): ProducerAdoption<H> {
  const key = foldName(typed);
  const equal = key === "" ? undefined : hits.find((hit) => foldName(hit.name) === key);
  if (equal) return { adopt: equal };
  if (hits.length > 0) return { suggest: hits[0] };
  return { pending: typed.trim() };
}

// ---------------------------------------------------------------------------
// Grape, blend, header and appellation copy

const CHANGE_IT = "Change it if the bottle disagrees.";

/** The note under the Grape field's "suggested" chip (spec §B.8). */
export function grapeSuggestionNote(s: {
  grape: string;
  appellation: string;
  source: GrapeSuggestion["source"];
}): string {
  return s.source === "place"
    ? `${s.appellation} is ${s.grape} by law — that is the appellation talking, not the producer. ${CHANGE_IT}`
    : `Most ${s.appellation} wines in the catalog are ${s.grape}. ${CHANGE_IT}`;
}

/**
 * "Scored as Merlot (primary) · Cabernet Franc (secondary)" — grape names
 * already in `orderedBlend` order; only the first two are scored. Blank names
 * are skipped; null with no grape.
 */
export function blendScoredLine(orderedNames: readonly string[]): string | null {
  const [primary, secondary] = orderedNames.map((name) => name.trim()).filter((name) => name !== "");
  if (!primary) return null;
  return secondary ? `Scored as ${primary} (primary) · ${secondary} (secondary)` : `Scored as ${primary} (primary)`;
}

export type ByHandHeader = { eyebrow: string; title: string; badge: string | null; intro: string | null };

/**
 * A7's header for a new wine; A4b's while finishing one (Fix on a partial
 * read, or an incomplete glass): "Glass {n} · already added" for a flight
 * glass, otherwise the matrix's by-hand eyebrow, and a "{k} GAP(S)" badge
 * while gaps remain.
 */
export function byHandHeader(args: {
  matrix: Pick<SheetMatrix, "byHand">;
  finishing: { glass: number | null } | null;
  gaps: number;
}): ByHandHeader {
  const { matrix, finishing, gaps } = args;
  if (!finishing) {
    return { eyebrow: matrix.byHand.eyebrow, title: "A wine we have never seen", badge: null, intro: null };
  }
  return {
    eyebrow: finishing.glass === null ? matrix.byHand.eyebrow : `Glass ${finishing.glass} · already added`,
    title: "Finish this wine",
    badge: gaps > 0 ? `${gaps} ${gaps === 1 ? "GAP" : "GAPS"}` : null,
    intro: "Filled in from your scan. Correct anything the camera got wrong.",
  };
}

/** The appellation list's section label with a region set (canvas A7: "Piedmont first ▾"). */
export function regionFirstLabel(regionName: string): string {
  return `${regionName} first`;
}

/** The hint under Country and Region (byhand-5, adapted to spec §B.5's no-GI rule). */
export const NO_GI_HINT =
  "No geographic indication on the label? In France pick Vin de France; elsewhere pick No geographic indication.";

// ---------------------------------------------------------------------------
// Alcohol and the producer summary

/** A typed alcohol percentage ("13,5" reads as 13.5); null when blank, not a
    number, or outside 0–100. The draft keeps it only inside (0, 100) (normaliseDraft). */
export function parseAlcohol(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** What by-hand-actions.ts's `producerSummary` returns about a producer. */
export type ProducerSummary = {
  regionName: string | null;
  countryName: string | null;
  wineCount: number;
};

// ---------------------------------------------------------------------------
// Common-in-region grape chips (owner report 2026-09-15: a scanned L.A. Cetto
// Brut came back with no grape, and fixing it by hand meant searching). While
// the primary grape is empty and a region is chosen, the form offers that
// region's common grapes (`shortlistGrapesForRegion`'s own PRINCIPAL-first
// order — the wine map first, then the `region_grapes` fallback) as
// tap-to-fill chips. Never applied on its own.

const MAX_REGION_GRAPE_CHIPS = 5;

/** "Common in Baja California" — the chip row's heading. */
export function commonGrapesHeading(regionLabel: string): string {
  return `Common in ${regionLabel}`;
}

/**
 * The region's shortlisted grape ids, filtered to the wine's chosen colour and
 * capped at five. WHITE keeps white grapes only, RED keeps red only — except a
 * SPARKLING wine keeps red grapes too (blanc de noirs). ROSE, ORANGE, no colour
 * chosen yet, and a grape with no colour on file are never filtered out —
 * under-labeling beats mislabeling.
 */
export function regionGrapeChipIds(
  grapeIds: readonly string[],
  grapeColours: Readonly<Record<string, "RED" | "WHITE" | null>>,
  colour: WineColour | null,
  style: WineStyle | null,
): string[] {
  const filtered =
    colour === "WHITE" || colour === "RED"
      ? grapeIds.filter((id) => {
          const grapeColour = grapeColours[id] ?? null;
          if (grapeColour === null || grapeColour === colour) return true;
          return colour === "WHITE" && grapeColour === "RED" && style === "SPARKLING";
        })
      : [...grapeIds];
  return filtered.slice(0, MAX_REGION_GRAPE_CHIPS);
}
