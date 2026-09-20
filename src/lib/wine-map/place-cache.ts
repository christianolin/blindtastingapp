// The wine map's three per-key caches, wired to the real fetchers.
//
// Thin on purpose: every rule (eviction, in-flight sharing, what is and is not
// cacheable, the prefetch counter) lives in the pure ./keyed-cache, which is
// where the tests are. This file is only the wiring — it is the one place that
// knows which fetcher belongs to which cache.
//
// Clicking back up the hierarchy is the common move on this page, and today it
// pays the whole 614 ms waterfall again every time. With these three maps a
// revisit makes NO request at all.
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.1.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchWinePlaceContext, type WinePlaceContext } from "./context";
import { fetchPlaceStyles, type StyleRow } from "./place-styles";
// Relative, not "@/…", so vitest (node, no path alias) can load this module and
// test the wiring against a stub client.
import { fetchArchetypesForPlace } from "../wset/archetype-query";
import type { ArchetypeListItem } from "../wset/archetype-rows";
import { createKeyedCache, createPlaceCacheGroup } from "./keyed-cache";
import { fetchWinePlaceTree, type WinePlaceTreeNode } from "./tree";
import {
  fetchGrapeOptions,
  fetchPlaceGrapeLinks,
  type GrapeOption,
} from "./grape-filter";

type Client = SupabaseClient<Database>;

const caches = createPlaceCacheGroup<
  Client,
  WinePlaceContext,
  ArchetypeListItem,
  StyleRow
>({
  loadContext: fetchWinePlaceContext,
  loadArchetypes: fetchArchetypesForPlace,
  loadStyles: fetchPlaceStyles,
});

export function loadWinePlaceContext(
  supabase: Client,
  key: string,
): Promise<WinePlaceContext | null> {
  return caches.loadContext(supabase, key);
}

export function loadArchetypesForPlace(
  supabase: Client,
  key: string,
): Promise<ArchetypeListItem[]> {
  return caches.loadArchetypes(supabase, key);
}

export function loadPlaceStyles(
  supabase: Client,
  key: string,
): Promise<StyleRow[]> {
  return caches.loadStyles(supabase, key);
}

/** Synchronous reads for the one-render revisit: `undefined` means "not
    cached", and none of them ever starts a request. */
export function peekWinePlaceContext(
  key: string,
): WinePlaceContext | null | undefined {
  return caches.peekContext(key);
}

export function peekArchetypesForPlace(
  key: string,
): ArchetypeListItem[] | undefined {
  return caches.peekArchetypes(key);
}

export function peekPlaceStyles(key: string): StyleRow[] | undefined {
  return caches.peekStyles(key);
}

/** Warms all three for one key (the hover prefetch). Never throws. */
export function prefetchWinePlace(supabase: Client, key: string): Promise<void> {
  return caches.prefetch(supabase, key);
}

export function winePlacePrefetchesInFlight(): number {
  return caches.prefetchesInFlight();
}

/**
 * Starts a selection's three requests from the CLICK, instead of waiting for
 * React to flush the effects that ask for them.
 *
 * Those effects are passive: React runs them after the commit has painted, and
 * this commit repaints the map as well as the panel. On the production trace
 * the panel first changed at 60 ms while the first request left at 107 ms —
 * the click had everything it needed for ~45 ms before anything went over the
 * wire. Calling this in the handler closes that gap.
 *
 * It does NOT duplicate the effects: each cache hands back the in-flight
 * promise for a key, so the effect that runs a moment later joins the request
 * this started rather than making a second one. It deliberately does not touch
 * the prefetch counter either — that counter bounds *speculative* hover work,
 * and a real selection must never be rationed by it.
 *
 * Fire and forget: every rejection is swallowed here, because the effect is
 * what owns telling the viewer that the panel failed.
 */
export function warmWinePlace(supabase: Client, key: string): void {
  void caches.loadContext(supabase, key).catch(() => {});
  void caches.loadArchetypes(supabase, key).catch(() => {});
  void caches.loadStyles(supabase, key).catch(() => {});
}

// --- What the map asks for once, on mount -----------------------------------
//
// The place tree (get_wine_place_tree, 811 KB and 128 ms of database time
// measured live 2026-09-20), the grape list and the grape links are the same
// three answers for every viewer, and they change only by migration — the same
// reasoning that makes the per-place caches safe. Caching them here means a
// second mount of the explorer in one page view (leaving the map and coming
// back through client-side navigation, or React's development double-mount)
// makes no request at all, and two mounts racing share one request rather than
// issuing two.
//
// A capacity of one and a constant key: these are singletons, not keyed data,
// but going through the same createKeyedCache buys the in-flight sharing and
// the never-cache-a-rejection rule without a second implementation of either.
const ONE = "one";
const treeCache = createKeyedCache<Client, WinePlaceTreeNode[]>({
  capacity: 1,
  load: (client) => fetchWinePlaceTree(client),
});
const grapeOptionsCache = createKeyedCache<Client, GrapeOption[]>({
  capacity: 1,
  load: (client) => fetchGrapeOptions(client),
});
const grapeLinksCache = createKeyedCache<Client, Map<string, Set<string>>>({
  capacity: 1,
  load: (client) => fetchPlaceGrapeLinks(client),
});

export function loadWinePlaceTree(supabase: Client): Promise<WinePlaceTreeNode[]> {
  return treeCache.load(supabase, ONE);
}

export function loadGrapeOptions(supabase: Client): Promise<GrapeOption[]> {
  return grapeOptionsCache.load(supabase, ONE);
}

export function loadPlaceGrapeLinks(
  supabase: Client,
): Promise<Map<string, Set<string>>> {
  return grapeLinksCache.load(supabase, ONE);
}

/** Called when the signed-in user changes. Nothing cached here is per-user
    today (every policy behind it is content-level — see ./keyed-cache), so
    this is a guard against a future policy that is, not a fix for a leak. */
export function clearWinePlaceCaches(): void {
  caches.clear();
  treeCache.clear();
  grapeOptionsCache.clear();
  grapeLinksCache.clear();
}
