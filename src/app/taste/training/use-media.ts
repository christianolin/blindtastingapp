"use client";

// The training room's media queries (training-room-map spec RM19, RM20): which
// of the laptop column and the phone sheet may mount the map (never both — one
// WebGL context), and whether the phone sheet is too short for one. Built on
// use-is-phone.ts's mediaStore, one store per query, created on first client
// use. The server snapshot is `serverValue`; nothing here matters before the
// viewer has opened the Map tab, which only happens after hydration.
import { useSyncExternalStore } from "react";
import { browserMatchMedia, mediaStore, type MediaStore } from "@/lib/use-is-phone";

/** Exactly what Tailwind's `lg:` compiles to (the aside is `hidden lg:block`). */
export const LG_QUERY = "(width >= 64rem)";
/** A phone on its side: 88dvh would leave a map under 200 px (RM20). */
export const SHORT_QUERY = "(max-height: 480px)";

const stores = new Map<string, MediaStore>();
function store(query: string, fallback: boolean): MediaStore {
  let s = stores.get(query);
  if (!s) {
    s = mediaStore(query, browserMatchMedia(), fallback);
    stores.set(query, s);
  }
  return s;
}

export function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => store(query, serverValue).subscribe(onChange),
    () => store(query, serverValue).getSnapshot(),
    () => serverValue,
  );
}

/** Read once, at the moment it matters (a tap, a fit); false without matchMedia. */
export function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
