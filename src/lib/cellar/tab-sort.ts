// The sort a cellar list opens with in THIS tab (cellar-sort spec
// docs/superpowers/specs/2026-09-27-cellar-sort-memory.md C5, review round 1).
//
// The saved `user_preferences.cellar_sort` reaches the list as a server prop,
// and saveCellarSort deliberately never revalidates or refreshes (C6). Without
// Cache Components a page unmounts when you leave it, and browser Back/Forward
// remounts it from the router's cached payload however stale it is (Next's
// bfcache: "it doesn't matter how stale the data might be") — so /cellar →
// pick "Name" → a wine → Back reopened the list on the sort the payload was
// fetched with, not the one just picked. A Link fired while the save is still
// in flight can also render the old row. This module keeps the tab's own last
// pick, in memory, and a remount prefers it over the prop.
//
// Hydration stays safe: `rememberTabSort` runs only from the Sort select's
// change handler, never on the server (and refuses to, below — module state
// there is shared by every request), and a full page load starts a fresh
// client module, so the server render and hydration both use the prop. Only a
// client-side remount (Back/Forward, a soft navigation) uses the newer pick.
//
// Keyed by the viewer: signing out and in as someone else is a soft
// navigation, so module state outlives it, and the next person must never
// inherit the previous one's pick. Accepted residual: a pick made on another
// device after this tab's own last pick shows in this tab only after a full
// reload (the tab's pick is the newest it knows of).
import { resolveCellarSort } from "./cellar-rows";
import type { SortKey } from "./types";

let tabPick: { viewerId: string; sort: SortKey } | null = null;

/** Records the viewer's Sort pick for this tab. A no-op on the server. */
export function rememberTabSort(viewerId: string, sort: SortKey): void {
  if (typeof window === "undefined") return;
  tabPick = { viewerId, sort };
}

/** The sort a cellar list opens with: this tab's last pick by the same viewer
 *  when there is one, else the server's saved value — through
 *  resolveCellarSort either way (anything invalid → newest added; "yours" in a
 *  read-only list → newest added). */
export function openingCellarSort(saved: unknown, readOnly: boolean, viewerId: string): SortKey {
  const picked = tabPick !== null && tabPick.viewerId === viewerId ? tabPick.sort : null;
  return resolveCellarSort(picked ?? saved, readOnly);
}
