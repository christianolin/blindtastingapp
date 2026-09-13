"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";
import { HostControls } from "./host-controls";

// The host settings menu: a cogwheel in the page header that opens a popover
// with the status-appropriate controls (draft: schedule / invite + share link /
// flow / delete; running: finish / delete). Keeps administrative actions out
// of the result content. The prominent Start action stays inline in the draft
// lobby.
export function HostControlsMenu({
  tastingId,
  status,
  scheduledAt = null,
  friends = [],
  sequentialGuessing = false,
  showSequentialToggle = false,
  leaderboardReveal = "PER_ATTRIBUTE",
  showLeaderboardToggle = false,
  invitesStayOpen = false,
  unrevealedGlasses = [],
}: {
  tastingId: string;
  status: string;
  scheduledAt?: string | null;
  friends?: { id: string; display_name: string; email: string }[];
  sequentialGuessing?: boolean;
  showSequentialToggle?: boolean;
  leaderboardReveal?: string;
  showLeaderboardToggle?: boolean;
  invitesStayOpen?: boolean;
  /** Forwarded to the End confirm, which lives in this menu (reveal-4). */
  unrevealedGlasses?: readonly UnrevealedGlass[];
}) {
  // Sticky: false until the menu first opens. The popover is keep-mounted, so
  // without this its share link would call ensure_join_code on every host
  // page view, including the ones that never open the menu.
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setOpened(true);
      }}
    >
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
          friends={friends}
          sequentialGuessing={sequentialGuessing}
          showSequentialToggle={showSequentialToggle}
          leaderboardReveal={leaderboardReveal}
          showLeaderboardToggle={showLeaderboardToggle}
          invitesStayOpen={invitesStayOpen}
          unrevealedGlasses={unrevealedGlasses}
          shareLinkActive={opened}
          surface="menu"
        />
      </PopoverContent>
    </Popover>
  );
}
