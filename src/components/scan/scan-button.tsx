"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";

// App-wide entry point for the label scanner. The scan popup itself lives in
// AddWineProvider so it's shared with the Add-a-wine flow.
export function ScanButton() {
  const { openScan } = useAddWine();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Scan a wine label"
      onClick={() => openScan()}
    >
      <Camera />
    </Button>
  );
}
