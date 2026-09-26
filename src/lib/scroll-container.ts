// Back to the top of the page. The window never scrolls in this app: the app
// shell's content column (`overflow-y-auto` inside `h-dvh overflow-hidden`,
// src/components/app-shell.tsx) is the scroll container, so a
// `window.scrollTo` does nothing there. These walk up from an element to the
// first ancestor that scrolls. The predicate and the walk take their DOM
// reads as arguments, so vitest runs them on plain objects.

/** An `overflow-y` value that makes an element a scroll container. */
export function isScrollableOverflow(overflowY: string): boolean {
  return overflowY === "auto" || overflowY === "scroll";
}

/** The nearest ancestor of `el` (never `el` itself) whose overflow-y scrolls,
    or null when none does. */
export function nearestScrollContainer<T extends { parentElement: T | null }>(
  el: T | null,
  overflowYOf: (node: T) => string,
): T | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    if (isScrollableOverflow(overflowYOf(node))) return node;
  }
  return null;
}

/** Scrolls whatever holds `el` back to its top: the nearest scrolling
    ancestor, or the window when there is none (a page outside the shell). */
export function scrollContainerToTop(el: HTMLElement | null): void {
  if (typeof window === "undefined") return;
  const container = nearestScrollContainer(el, (node) => window.getComputedStyle(node).overflowY);
  if (container) container.scrollTo({ top: 0 });
  else window.scrollTo({ top: 0 });
}
