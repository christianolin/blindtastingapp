"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Wine } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { useMediaQuery } from "@/components/add-wine/use-camera";
import type { AsyncRevealPolicy, TimingMode } from "@/lib/supabase/database.types";
import { ordinal } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import { scoreLockedGuess, unlockGuess } from "./actions";
import { GuessLadder } from "./guess-ladder";
import { lockedInRosterHeading, waitingTail } from "./ladder-copy";
import type { GuessLadderProps, RankChip } from "./ladder-types";
import { NoteThisGlass, type NoteThisGlassData } from "./note-this-glass";

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
  /** The host's name — named in the laptop waiting sentence ("… or when
   *  {host} moves on."); phones never name anyone (spec §8.3 item 9-10). */
  hostName: string;
  /** The glass's `reveal_step` (0 = not started). "Change it" hides once
   *  this is above 0 — the reveal has begun, so unlocking would fight it
   *  (PLAY-37). A combined semi-blind card (several glasses at once, no
   *  per-attribute reveal, Q8) always passes 0. */
  revealStep: number;
  /** With `asyncRevealPolicy`, picks the waiting sentence: LIVE keeps
   *  `waitingTail`'s "the reveal starts when everyone is in" line; ASYNC
   *  never reveals on a host action, so it gets the matching-results
   *  sentence instead (PLAY-34). */
  timingMode: TimingMode;
  asyncRevealPolicy: AsyncRevealPolicy;
  /** "Note this glass" (BT-N2; spec §9.3 item 1) — null (or omitted, which
   *  the render treats the same) when the viewer may not note this glass
   *  (`canNoteHiddenGlass`, computed by play-experience.tsx: never the
   *  host-provides host or the bottle's own contributor, and only while the
   *  glass is unrevealed). Optional so the semi-blind combined card (whose
   *  own "Note this glass" mount is BT-S3's, matching several glasses at
   *  once) keeps compiling untouched. */
  noteThisGlass?: NoteThisGlassData | null;
};

const LOCKED_CARD =
  "flex flex-col gap-[10px] rounded-[14px] border border-console-foreground/14 bg-console-card p-[14px]";

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
 * The waiting tail: LIVE keeps `waitingTail`'s "the reveal starts when
 * everyone is in" line (phones name no one, laptops name the host); ASYNC
 * never reveals on a host action — AFTER_ALL waits for the table, IMMEDIATE
 * scores each guess the moment it locks — so it gets the matching-results
 * sentence instead (PLAY-34; the same two sentences `tonightLines` shows on
 * S6's Tonight card, `src/lib/invitation-copy.ts`).
 */
function waitingSentence(
  timingMode: TimingMode,
  asyncRevealPolicy: AsyncRevealPolicy,
  host: string | null,
): string {
  if (timingMode === "ASYNC") {
    return asyncRevealPolicy === "IMMEDIATE"
      ? "You see each answer as soon as you submit."
      : "Answers show once everyone has guessed.";
  }
  return waitingTail(host);
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
  // PLAY-37: hidden once the reveal has started — unlocking would fight it.
  const canChange = data.canChange !== false && data.revealStep <= 0;
  // The S8b two-column layout, ladder closed (S10b; spec §8.3 item 10) —
  // the same md breakpoint and JS-computed switch guess-ladder.tsx uses for
  // its own laptop rail (a layout choice, not device routing).
  const isDesktop = useMediaQuery("(min-width: 768px)");

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

  // Roster chips (PLAY-35): mine gold with a check badge, a locked person a
  // filled "Name ✓" chip, a still-deciding one a dashed "Name…" chip. Shared
  // by the phone "Who is in" card and the laptop rail's roster card.
  function roster() {
    return (
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
              className="flex items-center gap-[6px] rounded-full bg-console-foreground/10 px-[11px] py-[5px] text-[12.5px]"
            >
              {p.name} ✓
            </span>
          ) : (
            <span
              key={p.id}
              className="flex items-center gap-[6px] rounded-full border border-dashed border-console-foreground/30 px-[11px] py-[5px] text-[12.5px] text-console-ink"
            >
              {p.name}…
            </span>
          ),
        )}
      </div>
    );
  }

  // "Change it" (PLAY-37): shared by both layouts, hidden once `canChange`
  // is false. `className` only ever varies the button's own placement.
  function changeButton(className: string) {
    if (!canChange) return null;
    return (
      <button
        type="button"
        onClick={change}
        disabled={busy}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-[9px] border border-console-foreground/28 px-[14px] py-[9px] text-[13px] font-semibold transition-colors hover:border-gold-light hover:text-gold-light disabled:opacity-60",
          className,
        )}
      >
        {busy ? (
          <>
            <WineGlassLoader size={16} /> Unlocking…
          </>
        ) : (
          "Change it"
        )}
      </button>
    );
  }

  const chips = (
    <div className="flex flex-wrap gap-[6px]">
      {data.chips.map((chip, i) => (
        <span
          key={i}
          className={cn(
            "max-w-full truncate rounded-full border border-console-foreground/20 px-[11px] py-[5px] text-[12.5px]",
            chip.muted && "text-console-ink",
          )}
        >
          {chip.text}
        </span>
      ))}
    </div>
  );

  const notices = (
    <>
      {data.pendingNotice ? <p className="text-[12.5px] text-gold-light">{data.pendingNotice}</p> : null}
      {error ? <p className="text-[12.5px] text-miss">{error}</p> : null}
    </>
  );

  return (
    <div className="flex flex-col bg-console text-console-foreground">
      {/* Header */}
      <div className="flex items-center gap-[11px] border-b border-console-foreground/12 px-4 pt-3 pb-[11px]">
        <span className="flex min-w-0 flex-1 flex-col">
          <Eyebrow size="md" className="truncate text-console-ink">
            {data.eyebrow}
          </Eyebrow>
          <span className="font-heading text-[19px] font-semibold lining-nums tabular-nums">
            {data.title}
          </span>
        </span>
        {data.rankChip ? (
          <span className="shrink-0 rounded-full border border-console-foreground/25 px-[10px] py-[5px] text-[11px] font-semibold text-gold-light lining-nums tabular-nums">
            {ordinal(data.rankChip.rank)} · {data.rankChip.points} pts
          </span>
        ) : null}
      </div>

      {isDesktop ? (
        // Laptop (S10b): the S8b layout with the ladder closed. Left: what
        // you said, Change it, standings. Right rail: the roster and the
        // waiting sentence, naming the host (PLAY-40). "Note this glass"
        // mounts in the left column — that row is BT-N2's.
        <div className="flex items-start gap-6 p-[18px_20px]">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className={cn(LOCKED_CARD, "gap-[9px]")}>
              <Eyebrow size="md" className="text-console-ink">
                What you said · {data.stakeLine}
              </Eyebrow>
              {chips}
              {changeButton("w-fit")}
              {notices}
            </div>

            {/* "Note this glass" (BT-N2; S10b left column, spec §8.3 item 10). */}
            {data.noteThisGlass ? (
              <NoteThisGlass {...data.noteThisGlass} layout="laptop" />
            ) : null}

            <a
              href={data.standingsHref}
              onClick={onStandingsClick}
              className="flex min-h-11 items-center gap-[10px] rounded-[12px] border border-console-foreground/14 bg-console-card p-[13px_14px] text-[13.5px] transition-colors hover:border-gold-light/60"
            >
              <span className="flex-1">Standings</span>
              <ChevronRight className="size-4 text-gold-light" aria-hidden />
            </a>
          </div>

          <div className="sticky top-4 flex w-[272px] shrink-0 flex-col gap-3">
            <div className={LOCKED_CARD}>
              <Eyebrow size="md" className="text-console-ink">
                {lockedInRosterHeading(data.lockedCount, data.eligibleCount)}
              </Eyebrow>
              {roster()}
            </div>
            <p className="text-[12.5px] leading-[1.5] text-console-ink">
              {waitingSentence(data.timingMode, data.asyncRevealPolicy, data.hostName)}
            </p>
          </div>
        </div>
      ) : (
        // Phone (S10).
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
                ? ` ${waitingSentence(data.timingMode, data.asyncRevealPolicy, null)}`
                : ""}
            </span>
          </div>

          {/* Who is in */}
          <div className={LOCKED_CARD}>
            <Eyebrow size="md" className="text-console-ink">
              {lockedInRosterHeading(data.lockedCount, data.eligibleCount)}
            </Eyebrow>
            {roster()}
          </div>

          {/* What you said */}
          <div className={cn(LOCKED_CARD, "gap-[9px]")}>
            <Eyebrow size="md" className="text-console-ink">
              What you said
            </Eyebrow>
            {chips}
            <span className="mt-[3px] flex items-center gap-[9px]">
              <span className="text-[13px] text-console-ink">{data.stakeLine}</span>
              {changeButton("ml-auto")}
            </span>
            {notices}
          </div>

          {/* While you wait */}
          <div className="flex flex-col gap-[9px]">
            <Eyebrow size="md" className="text-console-ink">
              While you wait
            </Eyebrow>
            {/* "Note this glass" (BT-N2; S10, spec §8.3 item 9). */}
            {data.noteThisGlass ? (
              <NoteThisGlass {...data.noteThisGlass} layout="phone" />
            ) : null}
            <a
              href={data.standingsHref}
              onClick={onStandingsClick}
              className="flex min-h-11 items-center gap-[10px] rounded-[12px] border border-console-foreground/14 bg-console-card p-[13px_14px] text-[13.5px] transition-colors hover:border-gold-light/60"
            >
              <span className="flex-1">{data.standingsLabel}</span>
              <ChevronRight className="size-4 text-gold-light" aria-hidden />
            </a>
          </div>
        </div>
      )}
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
  // BT-N2's noteThisGlass isn't part of GuessLadderProps (ladder-types.ts
  // belongs to another task's OWNS) — GuessLadder accepts it as an extra
  // prop alongside that type, so this composed prop carries it too.
  ladder: Omit<GuessLadderProps, "onLocked"> & { noteThisGlass: NoteThisGlassData | null };
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
