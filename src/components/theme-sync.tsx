"use client";

// Keeps the theme applied to <html>, against two different things that undo it.
//
// 1. REACT OVERWRITING IT. The inline script in layout.tsx sets the class before
//    first paint, which is what stops the flash. But <html> carries a className
//    prop in that layout, so React owns the class attribute and writes its own
//    value back when it renders the root -- dropping "dark" and clearing
//    colorScheme. suppressHydrationWarning suppresses the WARNING about that,
//    not the write. It is route-dependent: measured with the theme pinned dark
//    and the script confirmed to have run, /overview kept the class and /cellar
//    lost it.
//
// 2. THE THEME CHANGING WHILE THE PAGE IS OPEN. The store already notices both
//    ways this happens -- another tab writing the key, and the OS flipping for
//    someone on Match system -- but noticing is not applying. This
//    component subscribes so that a change re-renders it, and the layout effect
//    below is what actually puts it on the element.
//
//    Without the subscription the store reported the new theme to whoever asked
//    while the page stayed in the old one. Measured, back when an empty choice
//    followed the OS: with the OS flipped to dark, the page stayed parchment;
//    and a second tab told to go dark read back stored="dark" with the class
//    still absent.
//
// useLayoutEffect, not useEffect: layout effects run after React's DOM mutations
// but BEFORE the browser paints, so the correction lands in the same frame and
// nothing flashes. useEffect would paint the wrong theme first.
//
// No dependency array, deliberately. Any render is a render that might have
// rewritten the attribute, and the fix costs two DOM property writes.
import { useLayoutEffect } from "react";
import { applyTheme, useTheme } from "@/lib/theme";

export function ThemeSync() {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    applyTheme(theme);
  });
  return null;
}
