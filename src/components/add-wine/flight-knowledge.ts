// The knowledge rule (spec §C.9, ledger D10; sources-3, create-3). In-flight
// markers and glass numbers are shown only for wines the caller already knows:
// the host of a host-provides tasting, the wine's contributor, or anyone once
// the glass is revealed. SEMI_BLIND and OPEN tastings get no exception; OPEN
// glasses are inserted revealed, so they already count as known.
//
// Pure: type-only imports. Unit-tested in flight-knowledge.test.ts.
import type { WineSourceMode } from "@/lib/supabase/database.types";

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
