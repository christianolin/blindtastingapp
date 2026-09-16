// B5: which surface a viewer of /tastings/[id] gets, and the per-viewer flag
// that turns the result screen into the record once dismissed. The flag
// lives in localStorage keyed by tasting; every storage error is
// safe-storage.ts's, so a blocked or missing storage reads as "not
// dismissed" and a failed write returns false (the caller then keeps the
// flag in component state for the visit).
// Pure: runtime imports by relative path only, so vitest loads it in node.

import type { TastingStatus } from "@/lib/supabase/database.types";
import { clearFlag, readFlag, writeFlag, type StorageLike } from "./safe-storage";

/** "lobby" = no shell; "live" = the running board; "result" = the result screen (S12); "record" = the record (S13). */
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

/**
 * Puts the result screen back. The record is the CLOSED board for good once
 * dismissed, so without this the scoreboard, the standings and the share link
 * are gone for that viewer permanently — "Back to tasting overview" pointed at
 * /tastings/[id], which IS the page the record is already on, so it did
 * nothing at all.
 */
export function clearDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  return clearFlag(getStorage, resultDismissKey(tastingId));
}
