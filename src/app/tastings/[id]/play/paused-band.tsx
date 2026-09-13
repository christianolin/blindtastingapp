import { Pause } from "lucide-react";
import { pausedBand } from "@/lib/console-copy";

/**
 * The band every participant sees on a live screen while the host has
 * paused the tasting (Q1). Reveals and Skip wait, but guessing and locking
 * still work, so the copy says so rather than reading like a hard stop.
 */
export function PausedBand({ hostName }: { hostName: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-[13px] border border-gold bg-gold/12 px-4 py-3 text-[13.5px] font-medium text-gold-dark"
    >
      <Pause className="size-4 shrink-0" aria-hidden />
      <span>{pausedBand(hostName)}</span>
    </div>
  );
}
