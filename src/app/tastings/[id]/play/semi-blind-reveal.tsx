import { Check } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import type { CandidateCard } from "@/lib/semi-blind-candidates";
import {
  HOW_THE_TABLE_SPLIT,
  STANDINGS_ONE_POINT,
  YOUR_BOTTLE,
  glassWas,
  poolNoteLines,
  revealResult,
  revealedSoFar,
  revealingGlassEyebrow,
} from "@/lib/semi-blind-copy";
import { rankLabel } from "@/lib/stats-math";
import { cn } from "@/lib/utils";

export type SemiBlindRevealProps = {
  /** The glass's list-order number ("Glass 3"), never the stored position. */
  glass: number;
  /** How many glasses this tasting has revealed so far, this one included. */
  revealedCount: number;
  /** The flight's total glass count. */
  total: number;
  /** The wine is revealed, so its `wine_answers` row is readable. */
  identity: { producer: string; vintage: string; meta: string };
  /** The viewer's own outcome on this glass, from `getSemiBlindRevealedPicks`.
   *  Null when the glass is the viewer's own bottle: it was never theirs to
   *  match (spec §10.3), so the row reads "Your bottle", never a miss. */
  result: { hit: boolean; pickLabel: string | null; mine: number } | null;
  /** One row per candidate the table picked for this glass, from
   *  `get_semi_blind_board`'s `split` — the right one marked `correct`. */
  split: { label: string; count: number; correct: boolean }[];
  /** Candidates not yet revealed — feeds the pool note's shared-grape line. */
  poolCards: CandidateCard[];
  standings: { rank: number; tied: boolean; name: string; matches: number }[];
};

/**
 * The semi-blind reveal (SB4; spec §10.3 item 3, §7.3 item 6), dark. Renders
 * once — for the glass a `reveal_wine` call just finished revealing (the
 * console's "Reveal glass {N}", or the ASYNC auto-reveal) — while every other
 * glass (open, locked, not-poured, revealed earlier) stays inside the
 * persistent `MatchBoard` (BT-S3), which already draws a compact "Glass N
 * was …" row for it. Never the blind flow's parchment answer card: this is
 * the only surface a semi-blind reveal ever gets.
 *
 * Laptop (`MISSED-04`, the S11b layout with one row): the hero and the single
 * result row sit on the left; the split and the standings sit in a right
 * rail. Phone: the same content, stacked in one column.
 */
export function SemiBlindReveal({
  glass,
  revealedCount,
  total,
  identity,
  result,
  split,
  poolCards,
  standings,
}: SemiBlindRevealProps) {
  const resultCopy = result
    ? revealResult({
        hit: result.hit,
        pickLabel: result.pickLabel,
        mine: result.mine,
        revealed: revealedCount,
      })
    : null;
  const maxSplit = split.reduce((n, s) => Math.max(n, s.count), 0);
  const poolLines = poolNoteLines(poolCards);

  return (
    <div className="flex flex-col bg-console text-background">
      {/* Header */}
      <div className="flex items-center gap-[9px] px-4 pt-3 pb-[11px]">
        <span className="flex items-center gap-[7px]">
          <LiveDot size={6} />
          <Eyebrow size="lg" className="tracking-[.15em] text-gold-light">
            {revealingGlassEyebrow(glass)}
          </Eyebrow>
        </span>
        <span className="ml-auto text-[11.5px] tabular-nums text-console-ink">
          {revealedSoFar(revealedCount, total)}
        </span>
      </div>

      <div className="flex flex-col gap-[14px] px-4 pb-4 md:flex-row md:items-start md:gap-6">
        {/* Left: the wine that was under this glass, and the viewer's own result */}
        <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
          <div className="flex flex-col items-center gap-[9px] pt-[10px] pb-1 text-center">
            <Eyebrow size="lg" className="text-console-ink">
              {glassWas(glass)}
            </Eyebrow>
            <span className="font-heading text-[38px] font-semibold leading-none text-gold-light md:text-[46px]">
              {identity.producer} {identity.vintage}
            </span>
            {identity.meta ? (
              <span className="text-[12.5px] text-console-ink">{identity.meta}</span>
            ) : null}
          </div>

          {result && resultCopy ? (
            <div
              className={cn(
                "flex items-center gap-[10px] rounded-[13px] p-[14px_16px]",
                result.hit
                  ? "border-[1.5px] border-gold-light bg-gold-light/14"
                  : "border border-rose/50 bg-console-card",
              )}
            >
              {result.hit ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold-light text-console">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14.5px] font-bold">{resultCopy.title}</span>
                <span
                  className={cn(
                    "text-[12.5px] tabular-nums",
                    result.hit ? "text-gold-light" : "text-console-ink",
                  )}
                >
                  {resultCopy.detail}
                </span>
              </span>
            </div>
          ) : (
            // The viewer's own bottle: not matchable, so neither a hit nor a
            // miss — the same "Your bottle" the board shows on its row.
            <div className="flex items-center gap-[10px] rounded-[13px] border border-background/14 bg-console-card p-[14px_16px]">
              <span className="truncate text-[14.5px] font-bold">{YOUR_BOTTLE}</span>
            </div>
          )}
        </div>

        {/* Right rail: how the table split, the pool note, standings */}
        <div className="flex shrink-0 flex-col gap-[16px] md:w-[300px]">
          {split.length > 0 ? (
            <div className="flex flex-col gap-[9px]">
              <Eyebrow size="md" className="text-console-ink">
                {HOW_THE_TABLE_SPLIT}
              </Eyebrow>
              <div className="flex flex-col gap-[7px]">
                {split.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="flex flex-col gap-[3px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] font-medium">
                        {s.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[12px] font-bold tabular-nums",
                          s.correct ? "text-gold-light" : "text-rose",
                        )}
                      >
                        {s.count}
                      </span>
                    </div>
                    <div className="h-[6px] w-full overflow-hidden rounded-full bg-background/12">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          s.correct ? "bg-gold-light" : "bg-rose",
                        )}
                        style={{ width: `${maxSplit > 0 ? (s.count / maxSplit) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {poolLines.length > 0 ? (
            <div className="flex flex-col gap-1">
              {poolLines.map((line) => (
                <p key={line} className="text-[11.5px] text-console-ink">
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {standings.length > 0 ? (
            <div className="flex flex-col gap-[9px] rounded-[14px] border border-background/14 bg-console-card p-[13px_14px]">
              <Eyebrow size="md" className="text-console-ink">
                {STANDINGS_ONE_POINT}
              </Eyebrow>
              <div className="flex flex-col">
                {standings.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className={cn(
                      "flex items-baseline gap-[10px] py-1.5",
                      i < standings.length - 1 && "border-b border-background/12",
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 shrink-0 font-heading text-[15px] lining-nums tabular-nums",
                        s.rank === 1 ? "text-gold-light" : "text-console-ink",
                      )}
                    >
                      {rankLabel({ rank: s.rank, tied: s.tied })}
                    </span>
                    <span className="flex-1 truncate text-[13.5px]">{s.name}</span>
                    <span className="text-[13.5px] tabular-nums text-gold-light">
                      {s.matches}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
