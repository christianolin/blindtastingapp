"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScanModal } from "./scan-modal";

// The app-wide entry point for the label scanner (mounted in AppHeader).
export function ScanButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Scan a wine label"
        onClick={() => setOpen(true)}
      >
        <Camera />
      </Button>
      {open ? <ScanModal userId={userId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
