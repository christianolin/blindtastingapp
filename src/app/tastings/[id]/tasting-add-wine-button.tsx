"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// The Wines card's "Add wine" / "Add a wine" button (7a): opens the universal
// add-wine sheet with this tasting as the flight destination. The sheet lives
// in AddWineProvider, so nothing is rendered here beyond the button. The
// label rule (host-provides → "Add wine", bring-your-own → "Add a wine") is
// the caller's, unchanged.
export function AddToFlightButton({
  tastingId,
  label,
  tastingName,
  revealMode,
  wineSource,
  position,
}: {
  tastingId: string;
  label: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  /** Next glass number = existing wine count + 1. */
  position: number;
}) {
  const { openAddWineSheet } = useAddWine();
  return (
    <Button
      size="sm"
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
    >
      <Plus />
      {label}
    </Button>
  );
}
