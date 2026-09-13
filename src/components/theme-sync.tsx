"use client";

// Keeps the theme on <html> after React has had its say.
//
// WHY THIS EXISTS. The inline script in layout.tsx sets the class before the
// first paint, which is what stops the flash. But <html> carries a className
// prop in that layout, so React OWNS the class attribute, and when it renders
// the root it writes its own value back -- dropping "dark" and clearing
// colorScheme. suppressHydrationWarning suppresses the WARNING about that, not
// the write itself.
//
// It is route-dependent, which is what makes it nasty. Measured on this app
// with the theme pinned to dark and the script confirmed to have run:
//
//   /overview   class kept "dark",  colorScheme "dark"
//   /cellar     class lost "dark",  colorScheme ""
//
// So the user picks dark, walks from one page to another, and the app is
// suddenly parchment again with nothing to explain it.
//
// useLayoutEffect, not useEffect: layout effects run after React's DOM
// mutations but BEFORE the browser paints, so the correction lands in the same
// frame and nothing flashes. useEffect would paint the wrong theme first.
//
// No dependency array on the re-apply, deliberately. Any render of this
// component is a render that might have rewritten the attribute, and the fix
// costs two DOM property writes.
import { useLayoutEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme";

export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readTheme());
  });
  return null;
}
