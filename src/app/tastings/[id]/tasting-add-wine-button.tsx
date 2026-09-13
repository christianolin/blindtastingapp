"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import type { AddWineDestination } from "@/components/add-wine/types";

/** The lobby's flight: this tasting, the next glass being the live count + 1. */
export type FlightDestination = Extract<AddWineDestination, { kind: "flight" }>;

// The Wines card's Add button (spec §C.5 A1): "Add wine" when the host provides
// the wines, otherwise "Add a wine". It opens the universal add-wine sheet on
// this flight with no `start`, so the sheet routes by canScan (§C.3). The sheet
// lives in AddWineProvider, so nothing is rendered here beyond the button, and
// the page renders it only for a viewer who may add (canAddWine). At least 44 px
// tall on a phone or a tablet; a mouse device at md and up keeps the compact size.
export function AddToFlightButton({ destination }: { destination: FlightDestination }) {
  const { openAddWineSheet } = useAddWine();
  return (
    <Button
      size="sm"
      className="min-h-11 md:pointer-fine:min-h-0"
      onClick={() => openAddWineSheet(destination)}
    >
      <Plus />
      {destination.wineSource === "HOST_PROVIDES" ? "Add wine" : "Add a wine"}
    </Button>
  );
}
