"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HostControls } from "./host-controls";

// The host settings menu: a cogwheel in the page header that opens a popover
// with the status-appropriate controls (draft: schedule / invite / flow /
// delete; running: finish / delete). Keeps administrative actions out of the
// result content. The prominent Start action stays inline in the draft lobby.
export function HostControlsMenu({
  tastingId,
  status,
  scheduledAt = null,
  wineCount = 0,
  friends = [],
  sequentialGuessing = false,
  showSequentialToggle = false,
  leaderboardReveal = "PER_ATTRIBUTE",
  showLeaderboardToggle = false,
}: {
  tastingId: string;
  status: string;
  scheduledAt?: string | null;
  wineCount?: number;
  friends?: { id: string; display_name: string; email: string }[];
  sequentialGuessing?: boolean;
  showSequentialToggle?: boolean;
  leaderboardReveal?: string;
  showLeaderboardToggle?: boolean;
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
      <PopoverContent align="end" className="w-80">
        <p className="mb-1 font-heading text-sm font-semibold">Host controls</p>
        <HostControls
          tastingId={tastingId}
          status={status}
          scheduledAt={scheduledAt}
          wineCount={wineCount}
          friends={friends}
          sequentialGuessing={sequentialGuessing}
          showSequentialToggle={showSequentialToggle}
          leaderboardReveal={leaderboardReveal}
          showLeaderboardToggle={showLeaderboardToggle}
          surface="menu"
        />
      </PopoverContent>
    </Popover>
  );
}
