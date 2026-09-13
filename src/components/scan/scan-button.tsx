"use client";

import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import { useCanScan } from "@/components/add-wine/use-can-scan";

// App-wide entry point for adding a wine from its label. It always opens the
// universal add-wine sheet with `start: "camera"` and lets the sheet route by
// `canScan` (spec §C.3, D5): a device with a coarse pointer and a camera lands
// on the live camera, every other device on the laptop view with "Upload label
// photos". On a tasting page that has registered itself (TastingScanRegistrar)
// the wine goes straight into that flight; anywhere else the sheet opens with
// no destination and asks where the bottle goes after the read (E1).
//
// The icon and label follow `useCanScan()`. While it is unresolved (the server
// render and hydration) the glyph is picked in CSS by `(pointer: coarse)`, so a
// mouse device paints ImagePlus from the server HTML and keeps it; only a
// coarse-pointer device without a camera swaps its glyph once resolved.
export function ScanButton({ className }: { className?: string }) {
  const { openAddWineSheet, activeTasting } = useAddWine();
  const canScan = useCanScan();
  const label =
    canScan === null ? "Scan or upload a label" : canScan ? "Scan a label" : "Upload a label photo";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
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
      {canScan === true ? (
        <Camera aria-hidden />
      ) : canScan === false ? (
        <ImagePlus aria-hidden />
      ) : (
        <>
          <Camera aria-hidden className="hidden pointer-coarse:block" />
          <ImagePlus aria-hidden className="pointer-coarse:hidden" />
        </>
      )}
    </Button>
  );
}
