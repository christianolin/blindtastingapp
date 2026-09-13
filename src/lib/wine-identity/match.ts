// The confident catalog match (spec §B.6, D6; scan-1, scan-2). Pure: relative
// imports only. The server half (`server/match.ts`) loads the candidates — the
// catalog_wines of the draft's existing producer with `merged_into is null` and
// `blind_pending = false` — and builds the card; this module only decides.
import { emptyDraft, missingWineFields, normaliseDraft } from "./complete";
import { foldName } from "./fold";
import type { VintageKind, WineColour, WineIdentityDraft } from "./types";

export type CatalogCandidate = {
  id: string;
  wineName: string | null;
  appellationId: string;
  colour: WineColour;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
};
export type CatalogMatch = {
  catalogWineId: string;
  title: string;   // "{appellation name} {vintage}" — "Barbaresco DOCG 2018"
  meta: string;    // "★ 91 · 14 notes · in 6 cellars"
};

// One wine identity, across vintages: the folded cuvée name plus the
// appellation. A folded name holds only [a-z0-9], so "|" cannot collide.
function identityKey(wineName: string | null, appellationId: string): string {
  return `${foldName(wineName ?? "")}|${appellationId}`;
}

// The same kind, and for YEAR the same year, for TAWNY the same age.
function sameVintage(vintage: WineIdentityDraft["vintage"], c: CatalogCandidate): boolean {
  if (c.vintageKind !== vintage.kind) return false;
  switch (vintage.kind) {
    case "YEAR": return c.vintageYear === vintage.year;
    case "TAWNY": return c.vintageTawnyYears === vintage.tawnyYears;
    default: return true;
  }
}

/**
 * The one catalog wine a draft certainly is, or null. All four must hold:
 * 1. the draft's vintage is complete and was read (an unread vintage is never a
 *    wildcard), and the candidate has the same vintage;
 * 2. the candidate's colour agrees whenever the draft has one;
 * 3. when the producer has more than one identity among ALL its candidates, the
 *    folded cuvée name matches, and so does the appellation whenever the draft
 *    has one;
 * 4. exactly one candidate survives.
 * A draft without an existing producer never matches: a pending name, or a
 * bare title word, can never anchor a match.
 */
export function pickConfidentMatch(
  draft: WineIdentityDraft,
  candidates: readonly CatalogCandidate[],
  opts: { now?: Date } = {},
): CatalogCandidate | null {
  const d = normaliseDraft(draft);
  if (d.producer?.kind !== "existing") return null;
  const vintageMissing = missingWineFields({ ...emptyDraft(), vintage: d.vintage }, { now: opts.now }).includes("vintage");
  if (!d.vintage.read || vintageMissing) return null;

  const severalWines = new Set(candidates.map((c) => identityKey(c.wineName, c.appellationId))).size > 1;
  const draftName = foldName(d.wineName ?? "");
  const draftAppellation = d.appellationId?.trim() ? d.appellationId : null;

  const survivors = candidates.filter((c) =>
    sameVintage(d.vintage, c)
    && (d.colour === null || c.colour === d.colour)
    && (!severalWines || (
      foldName(c.wineName ?? "") === draftName
      && (draftAppellation === null || c.appellationId === draftAppellation)
    )),
  );
  return survivors.length === 1 ? survivors[0] : null;
}
