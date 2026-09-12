// The by-hand form's state and the pure rules over it (7g). Kept apart from
// the component so the seeding-from-a-scan, inference and validation rules
// are unit-tested without a DOM. Type-only imports keep this file safe on
// both sides.
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
// Relative on purpose: vitest here has no `@/` alias for runtime imports.
import { deaccent } from "../../lib/deaccent";
import { glassLabel } from "./format";
import type { ProducerInference } from "./actions";
import type { AddWineDestination, ByHandIdentity } from "./types";

export type Colour = "RED" | "WHITE" | "ROSE" | "ORANGE";
/** The three-way segmented control; "Other" opens the Rosé / Orange pair. */
export type ColourGroup = "RED" | "WHITE" | "OTHER";
export type Style = "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";
export type VintageKind = "YEAR" | "NV" | "TAWNY";

/**
 * Where the origin (country / region / appellation / grape) came from:
 * `inferred` values are replaced wholesale on the next producer pick,
 * `prefill` (a label read) and `manual` values are only ever topped up.
 */
export type OriginSource = "none" | "inferred" | "prefill" | "manual";

export type OriginLabels = {
  country: string | null;
  region: string | null;
  appellation: string | null;
  grape: string | null;
};

export type ByHandState = {
  producerId: string;
  /** The chosen producer's name, or a pending (not yet created) one. */
  producerName: string;
  wineName: string;
  vintageKind: VintageKind;
  vintageYear: string;
  tawnyYears: string;
  colourGroup: ColourGroup | null;
  colour: Colour | null;
  style: Style;
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  /** A scanned grape name not yet matched to a row; created on submit. */
  primaryGrapePending: string;
  secondaryGrapeId: string;
  secondaryGrapePending: string;
  typeDesignationId: string;
  alcohol: string;
  description: string;
  imageUrl: string | null;
  originSource: OriginSource;
  /** Display names for the origin chips before (or without) the reference
      lists — the inference and the prefill both know the names already. */
  labels: OriginLabels;
};

const NO_LABELS: OriginLabels = { country: null, region: null, appellation: null, grape: null };

export function colourGroupOf(colour: Colour | null): ColourGroup | null {
  if (colour === "RED" || colour === "WHITE") return colour;
  if (colour === "ROSE" || colour === "ORANGE") return "OTHER";
  return null;
}

export function stateFromPrefill(p: WineFormInitial | null): ByHandState {
  if (!p) {
    return {
      producerId: "",
      producerName: "",
      wineName: "",
      vintageKind: "YEAR",
      vintageYear: "",
      tawnyYears: "",
      colourGroup: null,
      colour: null,
      style: "STILL",
      countryId: "",
      regionId: "",
      appellationId: "",
      primaryGrapeId: "",
      primaryGrapePending: "",
      secondaryGrapeId: "",
      secondaryGrapePending: "",
      typeDesignationId: "",
      alcohol: "",
      description: "",
      imageUrl: null,
      originSource: "none",
      labels: NO_LABELS,
    };
  }
  const primary = p.blend[0];
  const secondary = p.blend[1];
  const hasOrigin = Boolean(p.countryId || p.regionId || p.appellationId);
  return {
    producerId: p.producerId ?? "",
    producerName: p.producerLabel ?? "",
    wineName: p.wineName ?? "",
    // "No vintage read" is a year still to type — never NV by default
    // (NV is a claim about the wine, not a fallback).
    vintageKind: p.vintagePrompt ? "YEAR" : p.vintageKind,
    vintageYear: p.vintagePrompt ? "" : p.vintageYear ?? "",
    tawnyYears: p.tawnyYears ?? "",
    colourGroup: colourGroupOf(p.colour),
    colour: p.colour,
    style: p.style ?? "STILL",
    countryId: p.countryId ?? "",
    regionId: p.regionId ?? "",
    appellationId: p.appellationId ?? "",
    primaryGrapeId: primary?.grapeId ?? "",
    primaryGrapePending: primary?.grapeId ? "" : primary?.pendingName ?? "",
    secondaryGrapeId: secondary?.grapeId ?? "",
    secondaryGrapePending: secondary?.grapeId ? "" : secondary?.pendingName ?? "",
    typeDesignationId: p.typeDesignationId ?? "",
    alcohol: p.profile?.alcoholPercent != null ? String(p.profile.alcoholPercent) : "",
    description: p.description ?? "",
    imageUrl: p.imageUrl ?? null,
    originSource: hasOrigin ? "prefill" : "none",
    labels: {
      ...NO_LABELS,
      appellation:
        p.appellations.find((a) => a.id === p.appellationId)?.name ?? null,
    },
  };
}

/**
 * Fold a producer's inference into the state. An origin nobody has touched
 * (or that came from a previous inference) is replaced; a label-read or
 * hand-picked origin keeps its values and only gets its gaps filled where
 * the inference agrees with it. A grape is not region-bound, so an empty
 * grape always takes the suggestion.
 */
export function applyInference(
  s: ByHandState,
  inf: ProducerInference | null,
): ByHandState {
  if (!inf) return s;
  const hasPrimary = Boolean(s.primaryGrapeId || s.primaryGrapePending.trim());
  if (s.originSource === "none" || s.originSource === "inferred") {
    return {
      ...s,
      countryId: inf.countryId,
      regionId: inf.regionId,
      appellationId: inf.appellationId,
      primaryGrapeId: inf.primaryGrapeId ?? (hasPrimary ? s.primaryGrapeId : ""),
      primaryGrapePending: inf.primaryGrapeId ? "" : s.primaryGrapePending,
      originSource: "inferred",
      labels: {
        country: inf.countryName,
        region: inf.regionName,
        appellation: inf.appellationName,
        grape:
          inf.primaryGrapeName ?? (hasPrimary && !inf.primaryGrapeId ? s.labels.grape : null),
      },
    };
  }
  let next = s;
  const countryAgrees = !s.countryId || s.countryId === inf.countryId;
  if (countryAgrees && !s.regionId) {
    next = {
      ...next,
      countryId: inf.countryId,
      regionId: inf.regionId,
      appellationId: s.appellationId || inf.appellationId,
      labels: {
        ...next.labels,
        country: inf.countryName,
        region: inf.regionName,
        appellation: s.appellationId ? next.labels.appellation : inf.appellationName,
      },
    };
  } else if (s.regionId === inf.regionId && !s.appellationId) {
    next = {
      ...next,
      appellationId: inf.appellationId,
      labels: { ...next.labels, appellation: inf.appellationName },
    };
  }
  if (!hasPrimary && inf.primaryGrapeId) {
    next = {
      ...next,
      primaryGrapeId: inf.primaryGrapeId,
      primaryGrapePending: "",
      labels: { ...next.labels, grape: inf.primaryGrapeName },
    };
  }
  return next;
}

export function parseYear(v: string): number | null {
  const t = v.trim();
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1900 && n <= 2100 ? n : null;
}

export function parseAlcohol(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function vintageOk(s: ByHandState): boolean {
  if (s.vintageKind === "YEAR") return parseYear(s.vintageYear) != null;
  if (s.vintageKind === "TAWNY") return Number.isFinite(Number.parseInt(s.tawnyYears, 10));
  return true;
}

/** The required fields still blank, in the order the form shows them. */
export function missingFields(s: ByHandState): string[] {
  const missing: string[] = [];
  if (!s.producerId && !s.producerName.trim()) missing.push("producer");
  if (!s.wineName.trim()) missing.push("wine name");
  if (!vintageOk(s)) missing.push("vintage");
  if (!s.colour) missing.push("colour");
  if (!s.countryId) missing.push("country");
  if (!s.regionId) missing.push("region");
  if (!s.appellationId) missing.push("appellation");
  if (!s.primaryGrapeId && !s.primaryGrapePending.trim()) missing.push("grape");
  return missing;
}

/** Returns the origin-side names (for auto-expanding the pickers). */
export const ORIGIN_FIELDS = ["country", "region", "appellation", "grape"] as const;

/**
 * Map the state onto the identity contract. Pending grapes must already be
 * resolved to ids by the caller (createGrape on submit); a pending producer
 * stays a name with a null id — the server creates it. Null when a required
 * value is still missing.
 */
export function buildIdentity(
  s: ByHandState,
  grapes: { primaryGrapeId: string; secondaryGrapeId: string | null },
): ByHandIdentity | null {
  const producerName = s.producerName.trim();
  const wineName = s.wineName.trim();
  if (
    !s.colour || !wineName || (!s.producerId && !producerName) ||
    !s.countryId || !s.regionId || !s.appellationId || !grapes.primaryGrapeId ||
    !vintageOk(s)
  ) {
    return null;
  }
  return {
    producerId: s.producerId || null,
    producerName,
    wineName,
    vintageKind: s.vintageKind,
    vintageYear: s.vintageKind === "YEAR" ? parseYear(s.vintageYear) : null,
    vintageTawnyYears:
      s.vintageKind === "TAWNY" ? Number.parseInt(s.tawnyYears, 10) : null,
    colour: s.colour,
    style: s.style,
    countryId: s.countryId,
    regionId: s.regionId,
    appellationId: s.appellationId,
    primaryGrapeId: grapes.primaryGrapeId,
    secondaryGrapeId: grapes.secondaryGrapeId,
    typeDesignationId: s.typeDesignationId || null,
    imageUrl: s.imageUrl,
    description: s.description.trim() || null,
    alcoholPercent: parseAlcohol(s.alcohol),
  };
}

export function actionLabel(d: AddWineDestination | null): string {
  // No destination yet (7i): the footer opens the chooser, it does not add.
  if (!d) return "Choose where it goes";
  if (d.kind === "flight") return `Add as ${glassLabel(d.position)}`;
  if (d.kind === "cellar") return "Add to cellar";
  return "Add to the catalog";
}

export type ProducerSummary = {
  regionName: string | null;
  countryName: string | null;
  wineCount: number;
};

/** "Cigliuti · Piemonte, Italy · 4 wines" — the gold suggestion row. */
export function producerRowLabel(name: string, summary: ProducerSummary): string {
  const place = [summary.regionName, summary.countryName].filter(Boolean).join(", ");
  const count =
    summary.wineCount === 0
      ? "no wines yet"
      : summary.wineCount === 1
        ? "1 wine"
        : `${summary.wineCount} wines`;
  return [name, place || null, count].filter(Boolean).join(" · ");
}

const fold = (s: string) => deaccent(s).toLowerCase().trim();

/** The existing producer to offer for a pending name: an exact
    accent-insensitive match first, else the search's top hit. */
export function pickProducerSuggestion(
  name: string,
  hits: { id: string; name: string }[],
): { id: string; name: string } | null {
  const wanted = fold(name);
  const exact = hits.find((h) => fold(h.name) === wanted);
  const pick = exact ?? hits[0];
  return pick ? { id: pick.id, name: pick.name } : null;
}
