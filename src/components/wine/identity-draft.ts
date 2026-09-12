// The legacy catalog and cellar forms' value (`WineIdentityInput`) as a
// wine-identity draft (D2, spec §B.9 "Client consumers"). The forms check the
// draft with `missingWineFields` and send it to the one server write path, so
// they carry no completeness rule of their own.
//
// Pure: runtime imports by relative path only (vitest has no `@/` alias);
// `import type` from `@/` is erased.
import { normaliseDraft } from "../../lib/wine-identity/complete";
import type {
  BlendRow, ProvenanceKey, RefChoice, VintageKind, WineColour, WineIdentityDraft, WineStyle,
} from "@/lib/wine-identity/types";
import type { WineIdentityInput } from "./wine-identity-types";

// Records, not arrays, so the compiler checks each list against its union.
const VINTAGE_KINDS: Record<VintageKind, true> = { YEAR: true, NV: true, TAWNY: true };
const COLOURS: Record<WineColour, true> = { RED: true, WHITE: true, ROSE: true, ORANGE: true };
const STYLES: Record<WineStyle, true> = { STILL: true, SPARKLING: true, SWEET: true, FORTIFIED: true };

function oneOf<K extends string>(set: Record<K, true>, value: unknown): K | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(set, value) ? (value as K) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/** "" and anything non-numeric mean "not set"; 0 stays a number. */
function numberOrNull(value: string | null | undefined): number | null {
  const trimmed = blankToNull(value);
  if (trimmed === null) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** A picked producer id is `existing`; otherwise a typed or read name is `pending`
    and is found or created only by the write. */
function producerChoice(v: WineIdentityInput): RefChoice | null {
  const id = blankToNull(v.producerId);
  if (id !== null) return { kind: "existing", id, name: v.producerLabel ?? "" };
  const name = blankToNull(v.producerLabel);
  return name === null ? null : { kind: "pending", name };
}

/** Editor rows with a grape id are `existing`, rows with only a pending name are
    `pending`, and empty rows are dropped. */
function blendRows(rows: WineIdentityInput["blend"], grapeNames: Record<string, string>): BlendRow[] {
  const out: BlendRow[] = [];
  for (const row of rows) {
    const percentage = numberOrNull(row.percentage);
    const id = blankToNull(row.grapeId);
    if (id !== null) {
      out.push({ grape: { kind: "existing", id, name: grapeNames[id] ?? "" }, percentage });
      continue;
    }
    const pendingName = blankToNull(row.pendingName);
    if (pendingName !== null) out.push({ grape: { kind: "pending", name: pendingName }, percentage });
  }
  return out;
}

/** Every field the user filled is "manual". */
function manualProvenance(d: WineIdentityDraft): WineIdentityDraft["provenance"] {
  const { kind, year, tawnyYears } = d.vintage;
  const present: Record<ProvenanceKey, boolean> = {
    producer: d.producer !== null,
    wineName: d.wineName !== null,
    vintage: kind === "NV" || (kind === "YEAR" && year !== null) || (kind === "TAWNY" && tawnyYears !== null),
    colour: d.colour !== null,
    style: d.style !== null,
    country: d.countryId !== null,
    region: d.regionId !== null,
    appellation: d.appellationId !== null,
    primaryGrape: d.blend.length > 0,
    blend: d.blend.length > 0,
    typeDesignation: d.typeDesignationId !== null,
    alcohol: d.alcohol !== null,
    description: d.description !== null,
    imageUrl: d.imageUrl !== null,
  };
  const provenance: WineIdentityDraft["provenance"] = {};
  for (const key of Object.keys(present) as ProvenanceKey[]) {
    if (present[key]) provenance[key] = "manual";
  }
  return provenance;
}

/**
 * The form value as a normalised draft. `names.grapes` maps a grape id to its
 * name, so an existing blend row carries it (the write verifies ids, not names).
 * The form has no alcohol or description input of its own here; a caller that
 * has them spreads them onto the result.
 */
export function draftFromIdentityInput(
  v: WineIdentityInput,
  names?: { grapes?: Record<string, string> },
): WineIdentityDraft {
  const draft = normaliseDraft({
    producer: producerChoice(v),
    wineName: v.wineName,
    vintage: {
      kind: oneOf(VINTAGE_KINDS, v.vintageKind),
      year: numberOrNull(v.vintageYear),
      tawnyYears: numberOrNull(v.vintageTawnyYears),
      read: false,
    },
    colour: oneOf(COLOURS, v.colour),
    style: oneOf(STYLES, v.style),
    countryId: blankToNull(v.countryId),
    regionId: blankToNull(v.regionId),
    appellationId: blankToNull(v.appellationId),
    blend: blendRows(v.blend, names?.grapes ?? {}),
    typeDesignationId: blankToNull(v.typeDesignationId),
    alcohol: null,
    description: null,
    imageUrl: blankToNull(v.imageUrl),
    provenance: {},
  });
  return normaliseDraft({ ...draft, provenance: manualProvenance(draft) });
}
