"use client";

// The theme <html> is actually RENDERING — its `dark` class — as opposed to the
// stored choice useTheme() reads. Today the two agree, but the class is what
// the page's CSS paints from, so anything that has to match the page pixel for
// pixel (the wine map's basemap and palette) follows the class, however it got
// there.
//
// A MutationObserver on <html>'s class attribute feeds useSyncExternalStore.
// It is filtered to `class`, so applyTheme's style.colorScheme write never
// wakes it, and classList.toggle with an unchanged value makes no mutation.
// When React overwrites <html>'s class and ThemeSync puts `dark` back in the
// same commit, the observer's callback runs as a microtask after both, reads
// the corrected class, and the snapshot has not changed: no re-render.
import { useSyncExternalStore } from "react";
import type { Theme } from "./theme";

/** The theme a root element is rendering. Pure, so it can be tested with a
    fake root. */
export function themeOfRoot(root: { classList: { contains(token: string): boolean } }): Theme {
  return root.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const snapshot = (): Theme => themeOfRoot(document.documentElement);
// The server cannot see <html>'s class; light is the app's default.
const serverSnapshot = (): Theme => "light";

export function useRenderedTheme(): Theme {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
