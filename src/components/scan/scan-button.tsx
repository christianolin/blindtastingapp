"use client";

import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import { useTouchPrimary } from "@/components/add-wine/use-camera";

// App-wide entry point for adding a wine from its label. It always opens the
// universal add-wine sheet with `start: "camera"` and lets the sheet apply
// the device rule (use-camera.ts): a phone or tablet lands on the live camera,
// a mouse / trackpad device on the desktop view with "Upload label photos" —
// the live camera is touch-only (owner, 2026-09-12). On a tasting page that
// has registered itself (TastingScanRegistrar) the wine goes straight into
// that flight; anywhere else the sheet opens with no destination and asks
// where the bottle goes after the read (7i).
//
// The glyph is picked in CSS by the same `(pointer: coarse)` query, so the
// server HTML already paints the right icon on every device and nothing
// swaps after hydration. Only the aria-label needs the hook: its server
// snapshot is false, so SSR and hydration agree on the mouse label and a
// touch device corrects it straight after — an attribute, nothing visible.
export function ScanButton({ className }: { className?: string }) {
  const { openAddWineSheet, activeTasting } = useAddWine();
  const touch = useTouchPrimary();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={touch ? "Scan a wine label" : "Add a wine from label photos"}
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
      <Camera aria-hidden className="hidden pointer-coarse:block" />
      <ImagePlus aria-hidden className="pointer-coarse:hidden" />
    </Button>
  );
}
