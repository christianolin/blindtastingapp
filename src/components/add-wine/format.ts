// Small runtime helpers shared by the add-wine views, and the note pick's rule.
// Pure: no React, no Supabase, and every runtime import is relative (vitest has
// no `@/` alias). Unit-tested in format.test.ts.
import { missingWineFields } from "../../lib/wine-identity/complete";
import type { WineFieldKey, WineIdentityDraft } from "../../lib/wine-identity/types";
import type { AddSource, NotePick } from "./types";

type VintageKind = "YEAR" | "NV" | "TAWNY";

/** "2018" · "NV" · "20yo" / "Tawny"; null for a YEAR with no year. */
export function vintageLabel(
  kind: VintageKind,
  year: number | null,
  tawnyYears: number | null,
): string | null {
  if (kind === "YEAR") return year ? String(year) : null;
  if (kind === "TAWNY") return tawnyYears ? `${tawnyYears}yo` : "Tawny";
  return "NV";
}

/** "glass 4" — the handoff's lowercase glass reference. */
export function glassLabel(position: number): string {
  return `glass ${position}`;
}

/** "★ 91" for a rating average, null when there is none. */
export function starLabel(avg: number | null): string | null {
  return avg == null ? null : `★ ${Math.round(avg)}`;
}

const NO_WINE_FOR_BOTTLE = "Couldn't tell which wine that bottle is — search for it instead.";

type IdentitySource = Extract<AddSource, { kind: "identity" }>;

/** How a note pick reaches its catalog wine (the adds hook runs any write). */
export type NotePickPlan =
  | { kind: "pick"; pick: NotePick }
  | { kind: "catalog-first"; source: IdentitySource }
  | { kind: "by-hand-first"; draft: WineIdentityDraft; missing: WineFieldKey[] }
  | { kind: "error"; error: string };

/**
 * Taste & rate's single pick (D4; spec §C.5 C1, C2). A pick never writes to a
 * flight or a cellar: it only needs the catalog wine whose note opens.
 * - A catalog row or a matched scan already is that wine.
 * - A cellar lot carries its wine from the list, and whether to draw the bottle
 *   down once the note saves. A lot without its wine, or a +1 bottle, is refused
 *   rather than guessed.
 * - A complete identity (by hand, or an unmatched scan) is found or created in
 *   the catalog first.
 * - A draft with gaps opens By hand first (D7), naming its missing fields in
 *   completeness order. An incomplete or unidentified draft is finished the same
 *   way, since a note needs an identified wine in the catalog.
 */
export function notePickPlan(source: AddSource): NotePickPlan {
  switch (source.kind) {
    case "catalog":
      return { kind: "pick", pick: { catalogWineId: source.catalogWineId } };
    case "lot":
      return source.catalogWineId
        ? { kind: "pick", pick: { catalogWineId: source.catalogWineId, lotId: source.lotId, consume: source.consume } }
        : { kind: "error", error: NO_WINE_FOR_BOTTLE };
    case "plusOne":
      return { kind: "error", error: NO_WINE_FOR_BOTTLE };
    case "identity":
      return draftPlan(source.draft, source);
    case "incomplete":
      return draftPlan(source.draft, { kind: "identity", draft: source.draft, via: source.via, readId: null });
    case "unidentified":
      return draftPlan(source.draft, { kind: "identity", draft: source.draft, via: "byhand", readId: null });
    default: {
      const unknown: never = source;
      throw new Error(`Unknown add source: ${JSON.stringify(unknown)}`);
    }
  }
}

function draftPlan(draft: WineIdentityDraft, identity: IdentitySource): NotePickPlan {
  const missing = missingWineFields(draft);
  return missing.length > 0 ? { kind: "by-hand-first", draft, missing } : { kind: "catalog-first", source: identity };
}
