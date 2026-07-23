"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HostControls } from "./host-controls";

// The running-tasting host menu: a cogwheel in the page header that opens a
// popover with the lean host actions (finish / delete). Setup-time controls
// (start / schedule / invite / flow) live inline in the draft lobby — once a
// tasting has started, invites are closed and settings are locked, so nothing
// else belongs here.
export function HostControlsMenu({
  tastingId,
  status,
}: {
  tastingId: string;
  status: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Host controls" />
        }
      >
        <Settings className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-1 font-heading text-sm font-semibold">Host controls</p>
        <HostControls tastingId={tastingId} status={status} surface="menu" />
      </PopoverContent>
    </Popover>
  );
}
