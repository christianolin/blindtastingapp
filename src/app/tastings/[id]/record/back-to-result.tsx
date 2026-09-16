"use client";

import * as React from "react";
import Link from "next/link";
import { clearDismissed } from "@/lib/live-theme";
import { ClosedSurfaceContext } from "../result/closed-surface";

/**
 * "Back to tasting overview", at the foot of the record.
 *
 * It was a plain <Link href={`/tastings/${tastingId}`}>, and the record is
 * reached by two routes that both made that link a dead end:
 *
 *   /tastings/[id]          the CLOSED page renders the record itself once the
 *                           result is dismissed, so the link pointed at the
 *                           page it was already on and did nothing at all.
 *   /tastings/[id]/results  for a CLOSED tasting this renders the record too,
 *                           so following the link only arrived at the record
 *                           again by the other route.
 *
 * What a viewer wants back is the result screen — the scoreboard, standings
 * and share link — which is a SURFACE of the CLOSED page rather than a route,
 * chosen by the per-viewer "dismissed" flag. So clearing that flag is the
 * whole job, and the navigation is only there for the route that has no
 * surface to flip.
 *
 * Kept as an <a> with a real href, so middle-click and "open in new tab"
 * still work and it survives a failed hydration.
 */
export function BackToResult({ tastingId }: { tastingId: string }): React.JSX.Element {
  const ctx = React.useContext(ClosedSurfaceContext);

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Let the browser handle a click that means "somewhere else, please".
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      clearDismissed(() => window.localStorage, tastingId);
      // Already on the CLOSED page: swap the surface rather than navigate to
      // the URL we are on. Elsewhere the flag is now clear, so letting the
      // link follow through lands on the result.
      if (ctx) {
        event.preventDefault();
        ctx.showResult();
      }
    },
    [ctx, tastingId],
  );

  return (
    <Link
      href={`/tastings/${tastingId}`}
      onClick={onClick}
      className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
    >
      ← Back to tasting overview
    </Link>
  );
}
