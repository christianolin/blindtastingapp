"use client";

// The phone's Map options sheet (spec 2026-09-25 §1 D2). Below md the map's
// toolbar is one row, so the One country | All countries switch and its status
// line move here, behind the toolbar's "Map options" button. MapDetailControls
// comes as is: the radiogroup, the All radio's aria-describedby and the one
// role="status" region, which exists only while this sheet is open, so the
// All warning is read next to the switch that causes it. The copy is
// detail-status.ts's, untouched.
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DetailMode } from "@/lib/wine-map/detail-mode";
import type { DetailStatus } from "@/lib/wine-map/detail-status";
import { MapDetailControls } from "./map-detail-controls";

export function MapOptionsSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  status,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DetailMode;
  onModeChange: (mode: DetailMode) => void;
  status: DetailStatus;
  /** Re-requests the place tree when the status offers a Retry. */
  onRetry: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-x-0 top-auto bottom-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-t-2xl rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-2">
          <DialogTitle>Map options</DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-lg" className="size-11" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <MapDetailControls
          mode={mode}
          onModeChange={onModeChange}
          status={status}
          onRetry={onRetry}
        />
      </DialogContent>
    </Dialog>
  );
}
