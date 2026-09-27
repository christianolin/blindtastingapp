"use client";

// Wide is Tailwind's xl breakpoint (spec 2026-09-27-desktop-map-layout-design
// §5.3). WIDE_QUERY is the exact condition `xl:` compiles to in Tailwind v4
// (`@media (width >= 80rem)`; globals.css overrides no breakpoint), so this
// hook and the CSS agree at every width.
//
// The wine map is laid out by CSS alone, so its first paint is right at every
// width. It asks this hook only which DOM slot the Details card takes (before
// the map below xl, after it from xl, so DOM order stays visual order) and
// which tree is the active one. The server snapshot is TRUE: SSR and hydration
// render the xl slot, and an md-xl window moves the Details card to its
// pre-map slot right after, which remounts only that subtree, before any
// interaction. Same store shape as useIsPhone (use-is-phone.ts's mediaStore);
// `wideStore` is pure and unit-tested (use-is-wide.test.ts).
import { useSyncExternalStore } from "react";
import {
  browserMatchMedia,
  mediaStore,
  type MatchMediaLike,
  type MediaStore,
} from "./use-is-phone";

export const WIDE_QUERY = "(width >= 80rem)";

/** A store over WIDE_QUERY. Without matchMedia it reads as wide and never
    changes. */
export function wideStore(matchMedia: MatchMediaLike | null): MediaStore {
  return mediaStore(WIDE_QUERY, matchMedia, true);
}

// Built on the first client call, never during SSR (there is no window there).
let browserStore: MediaStore | null = null;
function store(): MediaStore {
  if (!browserStore) browserStore = wideStore(browserMatchMedia());
  return browserStore;
}
const subscribe = (onChange: () => void) => store().subscribe(onChange);
const getSnapshot = () => store().getSnapshot();
const getServerSnapshot = () => true;

/** True from xl (80rem, 1280 px) up. True on the server and during
    hydration. */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
