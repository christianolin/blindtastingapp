// The knowledge rule (spec §C.9, ledger D10; sources-3, create-3). In-flight
// markers and glass numbers are shown only for wines the caller already knows:
// the host of a host-provides tasting, the wine's contributor, or anyone once
// the glass is revealed. SEMI_BLIND and OPEN tastings get no exception; OPEN
// glasses are inserted revealed, so they already count as known.
//
// Pure: type-only imports. Unit-tested in flight-knowledge.test.ts.
import type { WineSourceMode } from "@/lib/supabase/database.types";

/**
 * Whether the add-wine search may list a catalog wine. A `blind_pending` wine is a flight's hidden
 * wine (born hidden, spec 2026-09-19-rule1-older-leaks D1): listed only for the person who created
 * it, who reads the row already, so listing it tells no one anything. Its creator needs it: a wine
 * they keyed for a flight and then removed, or whose tasting they deleted, stays hidden until a glass
 * that pours it is revealed (D16), and they must still be able to add it again, to a flight, their
 * cellar or a note.
 */
export function searchShowsCatalogWine(
  w: { blindPending: boolean; createdBy: string | null },
  userId: string,
): boolean {
  return !w.blindPending || w.createdBy === userId;
}

export function callerKnowsWine(
  w: { hostId: string; wineSource: WineSourceMode; isRevealed: boolean; contributorUserId: string | null },
  userId: string,
): boolean {
  return (
    (w.wineSource === "HOST_PROVIDES" && w.hostId === userId) ||
    w.contributorUserId === userId ||
    w.isRevealed
  );
}
