"use client";

// The browser half of prefetch-on-intent. The rule itself is pure and tested in
// ./prefetch-rule; this owns the dwell timer and the media query.
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.4.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  peekWinePlaceContext,
  prefetchWinePlace,
  winePlacePrefetchesInFlight,
} from "./place-cache";
import {
  PREFETCH_DWELL_MS,
  shouldPrefetch,
} from "./prefetch-rule";

export type PlacePrefetchHandlers = {
  onEnter: (key: string) => void;
  onLeave: () => void;
};

// `(hover: hover) and (pointer: fine)` as an external store, the same
// media-query approach useCanScan takes — never a user-agent sniff. The server
// snapshot is false, so nothing is ever prefetched before hydration either.
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

function subscribePointer(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

function readPointerFine(): boolean {
  try {
    return window.matchMedia(FINE_POINTER).matches;
  } catch {
    return false;
  }
}

const pointerFineOnServer = () => false;

/**
 * Hover or focus a place row for PREFETCH_DWELL_MS and its context, archetypes
 * and styles start loading, so the click that follows renders from cache.
 * Leaving cancels a pending dwell; a request already out is left to finish —
 * it is one small GET and its result is worth keeping.
 */
export function useWinePlacePrefetch(
  supabase: SupabaseClient<Database>,
  selectedKey: string | null,
): PlacePrefetchHandlers {
  const pointerFine = useSyncExternalStore(
    subscribePointer,
    readPointerFine,
    pointerFineOnServer,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read through a ref, not the closure: a timer armed before a click still
  // holds the old selection, and clicking a row focuses it — which is itself an
  // onEnter. Without this the dwell that fires just after the click would judge
  // against a stale selectedKey and spend an in-flight slot on the place the
  // selection already loaded.
  const selected = useRef(selectedKey);
  useEffect(() => {
    selected.current = selectedKey;
  }, [selectedKey]);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const onEnter = useCallback(
    (key: string) => {
      cancel();
      // Judged before the dwell, so a hopeless hover never even arms a timer,
      // and again when it fires, because the selection, the cache and the
      // in-flight count can all have moved in between.
      const env = () => ({
        key,
        selectedKey: selected.current,
        pointerFine,
        cached: peekWinePlaceContext(key) !== undefined,
        inFlight: winePlacePrefetchesInFlight(),
      });
      if (!shouldPrefetch(env())) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!shouldPrefetch(env())) return;
        void prefetchWinePlace(supabase, key);
      }, PREFETCH_DWELL_MS);
    },
    [cancel, pointerFine, supabase],
  );

  return useMemo(() => ({ onEnter, onLeave: cancel }), [onEnter, cancel]);
}
