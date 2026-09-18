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

// SOMETHING HAS TO TELL REACT THE FLAG MOVED.
//
// localStorage fires no event in the tab that wrote it, so a component reading
// this flag through useSyncExternalStore needs a subscription of its own.
// ClosedSurface had `noopSubscribe` and leaned on a useState call to force the
// re-render -- but that state was already null on the path that mattered, and
// setting a useState to the value it already holds is a no-op React bails out
// of. The write reached localStorage and nothing re-read it, so "See every wine"
// and "Back to tasting overview" both looked dead until the page was reloaded.
// It was intermittent rather than dead because React sometimes renders a
// component once before bailing out, and that stray render happened to pick up
// the new snapshot.
const listeners = new Set<() => void>();

export function subscribeDismissed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Copied first: a listener that unsubscribes while this runs must not skip another. */
function notifyDismissed(): void {
  for (const listener of [...listeners]) listener();
}

export function readDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  return readFlag(getStorage, resultDismissKey(tastingId));
}

// Both of these notify on success, rather than leaving it to the caller: the
// bug this fixes was exactly a caller that did not.
export function writeDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  const ok = writeFlag(getStorage, resultDismissKey(tastingId));
  if (ok) notifyDismissed();
  return ok;
}

/**
 * Puts the result screen back. The record is the CLOSED board for good once
 * dismissed, so without this the scoreboard, the standings and the share link
 * are gone for that viewer permanently — "Back to tasting overview" pointed at
 * /tastings/[id], which IS the page the record is already on, so it did
 * nothing at all.
 */
export function clearDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean {
  const ok = clearFlag(getStorage, resultDismissKey(tastingId));
  if (ok) notifyDismissed();
  return ok;
}
