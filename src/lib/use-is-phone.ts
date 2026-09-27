"use client";

// Phones are below Tailwind's md breakpoint (spec 2026-09-25 §1 D7). The wine
// map shapes its phone layout with `max-md:` classes and asks this hook only
// which elements should exist. PHONE_QUERY is the exact condition `max-md:`
// compiles to in Tailwind v4 (`@media (width < 48rem)`; globals.css overrides
// no breakpoint), so the CSS and this hook agree at every width, including a
// fractional one between 767 and 768 CSS px, where `(max-width: 767px)` would
// not.
//
// Same hydration shape as the map's Local/English and One|All stores:
// useSyncExternalStore with false as the server snapshot, so SSR and hydration
// render the md+ elements and a phone switches right after. `phoneStore` is
// pure and unit-tested with a fake matchMedia (use-is-phone.test.ts);
// `useIsPhone` is the browser half. Its core, `mediaStore`, knows no query of
// its own and is shared with useIsWide (use-is-wide.ts, spec 2026-09-27).
import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(width < 48rem)";

export type MediaQueryListLike = {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

export type MatchMediaLike = (query: string) => MediaQueryListLike;

export type MediaStore = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): boolean;
};

export type PhoneStore = MediaStore;

/** A store over one media query. The list is created on first use and kept,
    so every read and every subscription share one MediaQueryList. Without
    matchMedia it reads as `fallback` and never changes. */
export function mediaStore(
  query: string,
  matchMedia: MatchMediaLike | null,
  fallback: boolean,
): MediaStore {
  let list: MediaQueryListLike | null | undefined;
  const media = () => {
    if (list === undefined) list = matchMedia ? matchMedia(query) : null;
    return list;
  };
  return {
    subscribe(onChange) {
      const current = media();
      if (!current) return () => {};
      current.addEventListener("change", onChange);
      return () => current.removeEventListener("change", onChange);
    },
    getSnapshot: () => media()?.matches ?? fallback,
  };
}

/** A store over PHONE_QUERY. Without matchMedia it reads as not-a-phone and
    never changes. */
export function phoneStore(matchMedia: MatchMediaLike | null): PhoneStore {
  return mediaStore(PHONE_QUERY, matchMedia, false);
}

/** The browser's own matchMedia, bound to `window`; null on the server or in a
    browser without one. */
export function browserMatchMedia(): MatchMediaLike | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia.bind(window)
    : null;
}

// Built on the first client call, never during SSR (there is no window there).
let browserStore: PhoneStore | null = null;
function store(): PhoneStore {
  if (!browserStore) browserStore = phoneStore(browserMatchMedia());
  return browserStore;
}
const subscribe = (onChange: () => void) => store().subscribe(onChange);
const getSnapshot = () => store().getSnapshot();
const getServerSnapshot = () => false;

/** True below md. False on the server and during hydration. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
