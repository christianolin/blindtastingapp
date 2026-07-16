"use client";

import { useState } from "react";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * On phones the leaderboard aside is hidden (it would crowd out the guess
 * form), so surface it behind a floating "Leaderboard" button that opens a
 * drawer instead. The already-rendered LeaderboardSidebar server component is
 * passed in as `children`. Only mounts below `lg`.
 */
export function MobileLeaderboard({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 gap-2 rounded-full shadow-lg"
      >
        <Trophy className="size-4" strokeWidth={2} />
        Leaderboard
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close leaderboard"
            className="animate-in fade-in absolute inset-0 bg-black/40 duration-150"
            onClick={() => setOpen(false)}
          />
          <div className="animate-in slide-in-from-bottom absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl duration-200">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-heading text-lg font-semibold">
                Leaderboard
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close leaderboard"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
