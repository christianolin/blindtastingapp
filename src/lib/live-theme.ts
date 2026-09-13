// B5 "dark means live" (spec §6.3 item 3): which surface a viewer of
// /tastings/[id] gets, and the per-viewer flag that turns the dark result into
// the parchment record once dismissed. The flag lives in localStorage keyed by
// tasting; every storage error is safe-storage.ts's, so a blocked or missing
// storage reads as "not dismissed" and a failed write returns false (the caller
// then keeps the flag in component state for the visit).
// Pure: runtime imports by relative path only, so vitest loads it in node.

import type { TastingStatus } from "@/lib/supabase/database.types";
import { readFlag, writeFlag, type StorageLike } from "./safe-storage";

/** "lobby" = parchment, no shell; "live" = dark; "result" = the dark result (S12); "record" = the parchment record (S13). */
export type LiveSurface = "lobby" | "live" | "result" | "record";

export function liveSurface(input: { status: TastingStatus; dismissed: boolean }): LiveSurface {
  switch (input.status) {
    case "IN_PROGRESS":
      return "live";
    case "CLOSED":
      return input.dismissed ? "record" : "result";
    default:
      // DRAFT (lobby, invitation, guest lobby) and OPEN tastings get no shell.
      return "lobby";
  }
}

export function resultDismissKey(tastingId: string): string {
  return "blindr:result-dismissed:" + tastingId;
}

export function readDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  return readFlag(getStorage, resultDismissKey(tastingId));
}

export function writeDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  return writeFlag(getStorage, resultDismissKey(tastingId));
}
