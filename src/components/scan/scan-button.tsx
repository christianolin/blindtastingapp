"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";

// App-wide entry point for the label scanner. The scan popup itself lives in
// AddWineProvider so it's shared with the Add-a-wine flow. Uses the "choose"
// target: nothing is added automatically — after scanning you actively pick
// (rate / add to cellar / view a match, or add a new wine to your cellar or the
// catalog).
export function ScanButton() {
  const { openScan, activeTasting, openTastingScan } = useAddWine();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Scan a wine label"
      onClick={() => (activeTasting ? openTastingScan() : openScan("choose"))}
    >
      <Camera />
    </Button>
  );
}
