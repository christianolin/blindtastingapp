"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";

// App-wide entry point for the label scanner: the header camera opens the
// universal add-wine sheet on its camera view. On a tasting page that has
// registered itself (TastingScanRegistrar) the scan goes straight into that
// flight; anywhere else the sheet opens with no destination and asks where
// the bottle goes after the read (7i).
export function ScanButton({ className }: { className?: string }) {
  const { openAddWineSheet, activeTasting } = useAddWine();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Scan a wine label"
      className={className}
      onClick={() =>
        activeTasting
          ? openAddWineSheet(
              {
                kind: "flight",
                tastingId: activeTasting.tastingId,
                tastingName: activeTasting.tastingName,
                revealMode: activeTasting.revealMode,
                wineSource: activeTasting.wineSource,
                position: activeTasting.position,
              },
              { start: "camera" },
            )
          : openAddWineSheet(null, { start: "camera" })
      }
    >
      <Camera />
    </Button>
  );
}
