"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Wine } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { ordinal } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import { scoreLockedGuess, unlockGuess } from "./actions";
import { GuessLadder } from "./guess-ladder";
import type { GuessLadderProps, RankChip } from "./ladder-types";

/** One person at the table, as the "N of M locked in" chips show them. */
export type LockedInPerson = {
  id: string;
  name: string;
  isMe: boolean;
  /** locked = ✓ chip; deciding = dashed "Name…" chip (no row, or a draft). */
  state: "locked" | "deciding";
};

/** One "What you said" chip; muted = "no producer". */
export type LockedInChip = { text: string; muted?: boolean };

/**
 * Everything the 6g state needs, computed server-side from MY rows,
 * tasting_guess_status (locked flags only) and the leaderboard RPC — no
 * other person's answer is ever part of this.
 */
export type LockedInData = {
  tastingId: string;
  /** The glasses "Change it" unlocks — one for a blind glass, every matched
   *  glass for semi-blind. */
  wineIds: string[];
  /** Header eyebrow (the tasting name). */
  eyebrow: string;
  /** "Glass 3 · locked in" / "Locked in". */
  title: string;
  rankChip: RankChip | null;
  people: LockedInPerson[];
  lockedCount: number;
  eligibleCount: number;
  chips: LockedInChip[];
  /** "20 pts at stake" / "4 glasses matched · 1 pt each". */
  stakeLine: string;
  /** "Standings after glass 2" / "See the standings". */
  standingsLabel: string;
  /** Where that row goes: "#standings" when the surface renders the
   *  standings (the tasting page's rail, the standalone leaderboard), else
   *  the results page. */
  standingsHref: string;
  /** Whether "Change it" shows. Defaults to true, and nothing produces false
   *  in this wave: the semi-blind freeze was its only producer and the
   *  blind-tasting ledger drops it (D14 play-2). Unlocking is allowed until
   *  the guess is scored, which is what `unlockGuess` enforces. */
  canChange?: boolean;
  /** "Your answer shows once glass 3's details are finished." — in ASYNC +
   *  IMMEDIATE an incomplete glass defers scoring until its adder finishes
   *  it (spec §C.8). Null (the default) when nothing is waiting. */
  pendingNotice?: string | null;
  /** ASYNC + IMMEDIATE only: the glass is complete now, but my locked guess
   *  is still unscored, so the deferred score is due (spec §C.8). */
  needsScoring?: boolean;
};

const LOCKED_CARD =
  "flex flex-col gap-[10px] rounded-[14px] border border-background/14 bg-console-card p-[14px]";

/** "Maja is still deciding." / "Maja and Gustav are still deciding." /
 *  "Maja, Gustav and 2 others are still deciding." */
function decidingLine(names: string[]): string {
  if (names.length === 0) return "Everyone is in — the host can reveal.";
  if (names.length === 1) return `${names[0]} is still deciding.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are still deciding.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? "other" : "others"} are still deciding.`;
}

/**
 * The 6g waiting state, on the dark palette: who has locked in, what I
 * said and the points it is worth, "Change it" (→ unlockGuess for every
 * glass in `wineIds`, then `onUnlocked` so the parent reopens the ladder),
 * and the standings link for the wait. A scored guess cannot be unlocked —
 * the action says so and the line stays on screen.
 *
 * In ASYNC + IMMEDIATE it also carries the deferred score (spec §C.8): while
 * the glass is unfinished it says so — "Change it" stays available throughout —
 * and the moment the glass is complete it runs scoreLockedGuess once, after
 * which AutoRefresh brings back the answer.
 */
export function LockedIn({
  data,
  onUnlocked,
}: {
  data: LockedInData;
  onUnlocked: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deciding = data.people.filter((p) => p.state === "deciding").map((p) => p.name);
  const resultsHref = `/tastings/${data.tastingId}/results`;
  const canChange = data.canChange !== false;

  // The deferred score, exactly once per set of glasses: the action is
  // idempotent (it scores only my own locked, unscored guess on a complete
  // glass), and the ref stops a re-render from firing a second call while the
  // first is still in flight. It revalidates, so the server props come back
  // resolved.
  //
  // `data.wineIds` is a fresh array on every server render, so the key — not
  // the array — is the dependency; otherwise each AutoRefresh poll re-ran the
  // effect. And no `cancelled` flag: the ref already guarantees a single run,
  // while a teardown mid-flight would swallow the failure this card exists to
  // show.
  const wineKey = data.wineIds.join(",");
  const scoreRequested = useRef<string | null>(null);
  useEffect(() => {
    if (!data.needsScoring || scoreRequested.current === wineKey) return;
    scoreRequested.current = wineKey;
    void (async () => {
      for (const wineId of wineKey.split(",").filter(Boolean)) {
        const result = await scoreLockedGuess(data.tastingId, wineId);
        if ("error" in result) {
          setError(result.error);
          return;
        }
      }
    })();
  }, [data.needsScoring, data.tastingId, wineKey]);

  // A hash link only scrolls when its target exists on this surface; when
  // it does not (a rail that has not mounted its anchor), the dedicated
  // results page is the standings — never a dead tap.
  function onStandingsClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!data.standingsHref.startsWith("#")) return;
    const id = data.standingsHref.slice(1);
    if (!document.getElementById(id)) {
      e.preventDefault();
      router.push(resultsHref);
    }
  }

  async function change() {
    setBusy(true);
    setError(null);
    try {
      for (const wineId of data.wineIds) {
        const result = await unlockGuess(data.tastingId, wineId);
        if ("error" in result) {
          setError(result.error);
          return;
        }
      }
      onUnlocked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col bg-console text-background">
      {/* Header */}
      <div className="flex items-center gap-[11px] border-b border-background/12 px-4 pt-3 pb-[11px]">
        <span className="flex min-w-0 flex-1 flex-col">
          <Eyebrow size="md" className="truncate text-console-ink">
            {data.eyebrow}
          </Eyebrow>
          <span className="font-heading text-[19px] font-semibold lining-nums tabular-nums">
            {data.title}
          </span>
        </span>
        {data.rankChip ? (
          <span className="shrink-0 rounded-full border border-background/25 px-[10px] py-[5px] text-[11px] font-semibold text-gold-light lining-nums tabular-nums">
            {ordinal(data.rankChip.rank)} · {data.rankChip.points} pts
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 p-[18px_16px]">
        {/* Waiting for the table */}
        <div className="flex flex-col items-center gap-[10px] pt-2 pb-0.5 text-center">
          <Wine className="size-10 text-gold-light" strokeWidth={1.6} aria-hidden />
          <span className="font-heading text-[26px] font-semibold leading-[1.1]">
            Waiting for the table
          </span>
          <span className="max-w-[26ch] text-[13px] leading-[1.5] text-console-ink">
            {decidingLine(deciding)}
            {deciding.length > 0
              ? " The reveal starts when everyone is in — or when the host moves on."
              : ""}
          </span>
        </div>

        {/* Who is in */}
        <div className={LOCKED_CARD}>
          <Eyebrow size="md" className="text-console-ink">
            {data.lockedCount} of {data.eligibleCount} locked in
          </Eyebrow>
          <div className="flex flex-wrap gap-[7px]">
            {data.people.map((p) =>
              p.isMe ? (
                <span
                  key={p.id}
                  className="flex items-center gap-[6px] rounded-full bg-gold-light/16 p-[5px_11px_5px_6px] text-[12.5px] font-semibold"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-gold-light text-console">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  You
                </span>
              ) : p.state === "locked" ? (
                <span
                  key={p.id}
                  className="flex items-center gap-[6px] rounded-full bg-background/10 px-[11px] py-[5px] text-[12.5px]"
                >
                  {p.name} ✓
                </span>
              ) : (
                <span
                  key={p.id}
                  className="flex items-center gap-[6px] rounded-full border border-dashed border-background/30 px-[11px] py-[5px] text-[12.5px] text-console-ink"
                >
                  {p.name}…
                </span>
              ),
            )}
          </div>
        </div>

        {/* What you said */}
        <div className={cn(LOCKED_CARD, "gap-[9px]")}>
          <Eyebrow size="md" className="text-console-ink">
            What you said
          </Eyebrow>
          <div className="flex flex-wrap gap-[6px]">
            {data.chips.map((chip, i) => (
              <span
                key={i}
                className={cn(
                  "max-w-full truncate rounded-full border border-background/20 px-[11px] py-[5px] text-[12.5px]",
                  chip.muted && "text-console-ink",
                )}
              >
                {chip.text}
              </span>
            ))}
          </div>
          <span className="mt-[3px] flex items-center gap-[9px]">
            <span className="text-[13px] text-console-ink">{data.stakeLine}</span>
            {canChange ? (
              <button
                type="button"
                onClick={change}
                disabled={busy}
                className="ml-auto flex min-h-11 items-center gap-2 rounded-[9px] border border-background/28 px-[14px] py-[9px] text-[13px] font-semibold transition-colors hover:border-gold-light hover:text-gold-light disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <WineGlassLoader size={16} /> Unlocking…
                  </>
                ) : (
                  "Change it"
                )}
              </button>
            ) : null}
          </span>
          {data.pendingNotice ? (
            <p className="text-[12.5px] text-gold-light">{data.pendingNotice}</p>
          ) : null}
          {error ? <p className="text-[12.5px] text-miss">{error}</p> : null}
        </div>

        {/* While you wait */}
        <div className="flex flex-col gap-[9px]">
          <Eyebrow size="md" className="text-console-ink">
            While you wait
          </Eyebrow>
          <a
            href={data.standingsHref}
            onClick={onStandingsClick}
            className="flex min-h-11 items-center gap-[10px] rounded-[12px] border border-background/14 bg-console-card p-[13px_14px] text-[13.5px] transition-colors hover:border-gold-light/60"
          >
            <span className="flex-1">{data.standingsLabel}</span>
            <ChevronRight className="size-4 text-gold-light" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * The blind glass's two live states in one client boundary: the 6e ladder
 * until "Lock in", the 6g waiting state after it. The flip is optimistic —
 * lockGuess/unlockGuess have already succeeded when the callbacks fire, and
 * the actions revalidate the page so the server-fed props catch up on the
 * same response. `initialLocked` is re-adopted whenever the server changes
 * its mind (a poll after a lock from another device, say) — React's
 * "reset state when a prop changes" pattern, not an effect.
 */
export function GlassStage({
  ladder,
  lockedIn,
  initialLocked,
}: {
  ladder: Omit<GuessLadderProps, "onLocked">;
  lockedIn: LockedInData;
  initialLocked: boolean;
}) {
  const [locked, setLocked] = useState(initialLocked);
  const [seenInitial, setSeenInitial] = useState(initialLocked);
  if (seenInitial !== initialLocked) {
    setSeenInitial(initialLocked);
    setLocked(initialLocked);
  }

  if (locked) {
    return <LockedIn data={lockedIn} onUnlocked={() => setLocked(false)} />;
  }
  return <GuessLadder {...ladder} onLocked={() => setLocked(true)} />;
}
