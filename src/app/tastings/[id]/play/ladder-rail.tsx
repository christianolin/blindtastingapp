"use client";

import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { rankLabel } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import {
  lockButtonText,
  lockFooterText,
  lockedInRosterHeading,
  stakeLine,
  standingsAfterHeading,
} from "./ladder-copy";
import type { GuessLadderProps } from "./ladder-types";

/**
 * The sticky right rail the guess ladder swaps in from `md` (S8b; spec §8.3
 * item 7): the stake card, who else is locked in ({name} ✓ / {name}…),
 * "Standings after glass {N-1}" (hidden before any glass is revealed) and
 * the lock button itself — on a laptop the button lives HERE, not in the
 * phone's bottom footer, so it stays in view while the rows scroll.
 */
export function LadderRail({
  stake,
  roster,
  standings,
  glass,
  onLock,
  locking,
}: {
  stake: number;
  roster: GuessLadderProps["roster"];
  standings: GuessLadderProps["standingsAfterPrevious"];
  glass: number;
  onLock: () => void;
  locking: boolean;
}) {
  const lockedCount = roster.filter((p) => p.locked).length;

  return (
    <div className="sticky top-4 flex w-[272px] shrink-0 flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-[13px] border border-border bg-card p-[13px_14px]">
        <span className="text-[12.5px] text-muted-foreground">Your guess so far</span>
        <span className="font-heading text-[19px] font-semibold text-primary lining-nums tabular-nums">
          {stakeLine(stake, { phone: false })}
        </span>
      </div>

      <div className="flex flex-col gap-[9px] rounded-[13px] border border-border bg-card p-[13px_14px]">
        <Eyebrow size="sm">{lockedInRosterHeading(lockedCount, roster.length)}</Eyebrow>
        <div className="flex flex-wrap gap-[6px]">
          {roster.map((p, i) => (
            <span
              key={i}
              className={cn(
                "max-w-full truncate rounded-full px-[10px] py-[4px] text-[12px]",
                p.locked
                  ? "bg-primary/10 font-semibold text-primary"
                  : "border border-dashed border-border text-muted-foreground",
              )}
            >
              {p.isMe ? "You" : p.name} {p.locked ? "✓" : "…"}
            </span>
          ))}
        </div>
      </div>

      {standings && standings.length > 0 ? (
        <div className="flex flex-col gap-[9px] rounded-[13px] border border-border bg-card p-[13px_14px]">
          <Eyebrow size="sm">{standingsAfterHeading(glass - 1)}</Eyebrow>
          <div className="flex flex-col gap-[6px]">
            {standings.map((s, i) => (
              <span key={i} className="flex items-baseline gap-[9px] text-[13px]">
                <span
                  className={cn(
                    "w-5 shrink-0 font-heading lining-nums tabular-nums",
                    i === 0 && "text-gold-deep",
                  )}
                >
                  {rankLabel(s)}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="tabular-nums text-muted-foreground">{s.total}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onLock}
        disabled={locking}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-primary p-[15px] text-[15px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {locking ? (
          <>
            <WineGlassLoader size={18} /> Locking…
          </>
        ) : (
          lockButtonText(glass)
        )}
      </button>
      <span className="text-center text-[11.5px] text-muted-foreground">
        {lockFooterText({ phone: false })}
      </span>
    </div>
  );
}
