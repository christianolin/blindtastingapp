"use client";

// The training room's media queries (training-room-map spec RM19, RM20): which
// of the laptop column and the phone sheet may mount the map (never both — one
// WebGL context), and whether the phone sheet is too short for one. A bare
// useSyncExternalStore over matchMedia, one MediaQueryList per query kept for
// the page's life; deliberately not use-is-phone.ts's mediaStore, whose module
// (the phone store and hook with it) cost the room's first load more than this
// does (spec §12's budget). The server snapshot is `serverValue`; nothing here
// matters before the viewer has opened the Map tab, which only happens after
// hydration. Without matchMedia a query reads as `serverValue` and never changes.
import { useSyncExternalStore } from "react";

/** Exactly what Tailwind's `lg:` compiles to (the aside is `hidden lg:block`). */
export const LG_QUERY = "(width >= 64rem)";
/** A phone on its side: 88dvh would leave a map under 200 px (RM20). */
export const SHORT_QUERY = "(max-height: 480px)";

const lists = new Map<string, MediaQueryList | null>();
function list(query: string): MediaQueryList | null {
  let l = lists.get(query);
  if (l === undefined) {
    l = typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
    lists.set(query, l);
  }
  return l;
}

export function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const l = list(query);
      l?.addEventListener("change", onChange);
      return () => l?.removeEventListener("change", onChange);
    },
    () => list(query)?.matches ?? serverValue,
    () => serverValue,
  );
}
