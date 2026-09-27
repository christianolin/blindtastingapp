"use client";

import { useEffect } from "react";

/**
 * Brings `#id` into view once the page has mounted, when the URL's hash names
 * it. The window never scrolls in this app (AppShell's content column does),
 * and a hash link that lands while the page is still streaming in may find no
 * element yet; scrollIntoView moves whichever ancestor scrolls. The target
 * carries a scroll-margin for the sticky app header.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
