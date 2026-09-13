"use client";

import { useAddWine } from "@/components/add-wine-context";
import { actionButtonClass } from "@/components/overview/action-button";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// The next-up banner's "Add a wine": opens the universal add-wine sheet with
// this tasting as the flight destination — the same entry point as the Wines
// card, the host console and the header camera — instead of navigating to
// the retained legacy /wines/new page. The label carries no glass number (it
// used to read "Add wine 3"); `position` still tells the sheet which glass it
// adds. Rendered with the outline action classes so it sits next to "Open the
// tasting" exactly as before.
export function AddWineBannerButton({
  tastingId,
  tastingName,
  revealMode,
  wineSource,
  position,
  className,
}: {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  /** Next glass number = the flight's wine count + 1. */
  position: number;
  className?: string;
}) {
  const { openAddWineSheet } = useAddWine();
  return (
    <button
      type="button"
      onClick={() =>
        openAddWineSheet({
          kind: "flight",
          tastingId,
          tastingName,
          revealMode,
          wineSource,
          position,
        })
      }
      className={actionButtonClass("outline", className)}
    >
      Add a wine
    </button>
  );
}
