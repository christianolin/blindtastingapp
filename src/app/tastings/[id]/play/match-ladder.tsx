"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";
import { lockGuesses, submitAllMatchGuesses } from "./actions";
import { FieldPicker } from "./field-picker";
import { LockedIn, type LockedInData } from "./locked-in";
import type { PickerGroup } from "./ladder-types";

/** One still-hidden glass I can match. */
export type MatchGlass = {
  wineId: string;
  /** "Glass 3" / "Gustav's wine". */
  label: string;
  existingGuessedWineId: string | null;
};

/** A candidate wine from the tasting's list (visible up front in semi-blind). */
export type MatchCandidate = {
  /** wines.id of the candidate. */
  id: string;
  /** "Produttori del Barbaresco · 2018" */
  name: string;
  /** "Italy · Piedmont · Barbaresco DOCG — Nebbiolo" */
  sub: string;
};

/** Semi-blind scores one point per matched glass. */
const POINTS_PER_GLASS = 1;

/**
 * The semi-blind ladder: the 6e shell with one row per still-hidden glass,
 * each opening the 6f picker over the candidate list. Matching stays
 * all-at-once — partial submission makes no sense here (a half-finished
 * matching pass just means glasses without a guess row), so the footer
 * "Lock in all glasses" enables once every row is matched, writes the batch
 * (submitAllMatchGuesses) and then locks every glass (lockGuesses); the 6g
 * state follows, and "Change it" unlocks them all again.
 */
export function MatchLadder({
  tastingId,
  tastingName,
  glasses,
  candidates,
  initialLocked,
  lockedIn,
}: {
  tastingId: string;
  tastingName: string;
  glasses: MatchGlass[];
  candidates: MatchCandidate[];
  /** Every glass already carries a locked row. */
  initialLocked: boolean;
  /** The 6g data minus what this component knows better (my matches). */
  lockedIn: Omit<LockedInData, "chips" | "stakeLine" | "wineIds">;
}) {
  const [matches, setMatches] = useState<Record<string, string>>(() =>
    Object.fromEntries(glasses.map((g) => [g.wineId, g.existingGuessedWineId ?? ""])),
  );
  const [locked, setLocked] = useState(initialLocked);
  const [seenInitial, setSeenInitial] = useState(initialLocked);
  if (seenInitial !== initialLocked) {
    setSeenInitial(initialLocked);
    setLocked(initialLocked);
  }
  const [picker, setPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The glass rows by index, so closing the picker hands focus back to the
  // row it was opened for (keyboard users otherwise land on <body>).
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());
  const openIndexRef = useRef(0);

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const matchedCount = glasses.filter((g) => matches[g.wineId]).length;
  const allMatched = glasses.length > 0 && matchedCount === glasses.length;

  function openPicker(index: number) {
    openIndexRef.current = index;
    setPicker({ open: true, index });
    // Focus synchronously, in the same tap that opens the sheet — see the
    // combobox rule; the picker stays mounted so the input already exists.
    inputRef.current?.focus();
  }
  const closePicker = useCallback(() => {
    setPicker((p) => ({ ...p, open: false }));
    // Back to the row the sheet was opened for — this also takes focus (and
    // the keyboard) off the search input; the picker blurs it as a fallback.
    rowRefs.current.get(openIndexRef.current)?.focus({ preventScroll: true });
  }, []);

  function nextUnmatched(after: number, state: Record<string, string>): number | null {
    for (let i = after + 1; i < glasses.length; i++) {
      if (!state[glasses[i].wineId]) return i;
    }
    return null;
  }

  function advanceFrom(index: number, state = matches) {
    const next = nextUnmatched(index, state);
    if (next !== null) openPicker(next);
    else closePicker();
  }

  function onPick(id: string | null) {
    const glass = glasses[picker.index];
    if (!glass) return;
    const next = { ...matches, [glass.wineId]: id ?? "" };
    setMatches(next);
    setError(null);
    if (id === null) advanceFrom(picker.index, next);
  }

  async function lockAll() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("guesses", JSON.stringify(matches));
      const saved = await submitAllMatchGuesses(null, fd);
      if (saved && "error" in saved) {
        setError(saved.error);
        return;
      }
      const lockedResult = await lockGuesses(
        tastingId,
        glasses.map((g) => g.wineId),
      );
      if ("error" in lockedResult) {
        setError(lockedResult.error);
        return;
      }
      setLocked(true);
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <LockedIn
        data={{
          ...lockedIn,
          wineIds: glasses.map((g) => g.wineId),
          chips: glasses.map((g) => {
            const c = candidateById.get(matches[g.wineId]);
            return c
              ? { text: `${g.label} · ${c.name}` }
              : { text: `${g.label} · no match`, muted: true };
          }),
          stakeLine: `${matchedCount} ${matchedCount === 1 ? "glass" : "glasses"} matched · ${POINTS_PER_GLASS} pt each`,
        }}
        onUnlocked={() => setLocked(false)}
      />
    );
  }

  const current = glasses[picker.index];
  const nextIndex = nextUnmatched(picker.index, matches);
  const nextLabel = nextIndex !== null ? `Next: ${glasses[nextIndex].label.toLowerCase()} →` : "Back to the glasses";
  const groups: PickerGroup[] = [
    {
      heading: "The wines in this tasting",
      options: candidates.map((c) => ({ id: c.id, name: c.name, sub: c.sub })),
    },
  ];

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-[11px] border-b border-border px-4 pt-2 pb-[11px]">
        <Link
          href={`/tastings/${tastingId}`}
          aria-label="Back to the tasting"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground before:absolute before:-inset-1.5 before:content-['']"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex min-w-0 flex-1 flex-col">
          <Eyebrow size="md" className="truncate">
            {tastingName} · semi-blind
          </Eyebrow>
          <span className="font-heading text-[19px] font-semibold lining-nums tabular-nums">
            Match the glasses
          </span>
        </span>
        <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
          {matchedCount} of {glasses.length} matched
        </span>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3">
        <div className="flex items-center gap-[10px] rounded-[11px] border border-border bg-card p-[11px_13px]">
          <span className="flex-1 text-[12.5px] text-muted-foreground">Your matches so far</span>
          <span className="font-heading text-[20px] font-semibold text-primary lining-nums tabular-nums">
            {matchedCount * POINTS_PER_GLASS}
            <span className="text-[13px] text-muted-foreground">
              {" "}/ {glasses.length * POINTS_PER_GLASS} pts at stake
            </span>
          </span>
        </div>
        {error ? <p className="px-1 text-[12.5px] text-rose">{error}</p> : null}

        {glasses.map((g, i) => {
          const c = candidateById.get(matches[g.wineId]);
          const answered = Boolean(c);
          return (
            <button
              key={g.wineId}
              ref={(el) => {
                if (el) rowRefs.current.set(i, el);
                else rowRefs.current.delete(i);
              }}
              type="button"
              onClick={() => openPicker(i)}
              className={cn(
                "flex min-h-[56px] w-full items-center gap-[11px] rounded-[11px] px-[13px] py-3 text-left transition-colors",
                answered
                  ? "border border-border bg-white md:hover:bg-background"
                  : "border border-dashed border-border bg-card md:hover:bg-background",
              )}
            >
              <span
                className={cn(
                  "w-[22px] shrink-0 text-center font-heading text-[15px] font-semibold lining-nums tabular-nums",
                  answered ? "text-gold-deep" : "text-placeholder-soft",
                )}
              >
                {POINTS_PER_GLASS}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-[11px] text-muted-foreground">{g.label}</span>
                {c ? (
                  <>
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="truncate text-[11.5px] text-muted-foreground">{c.sub}</span>
                  </>
                ) : (
                  <span className="text-[14px] text-muted-foreground">Skip, or pick a wine</span>
                )}
              </span>
              <ChevronRight className="size-4 shrink-0 text-placeholder" aria-hidden />
            </button>
          );
        })}

        <p className="px-1 pt-0.5 text-[11px] text-muted-foreground">
          One point per glass you match to the right wine. The same wine can be picked for more than
          one glass.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border bg-card px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] md:pb-4">
        <button
          type="button"
          onClick={lockAll}
          disabled={busy || !allMatched}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-primary p-[15px] text-[16px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-[#4A1523] disabled:opacity-60"
        >
          {busy ? (
            <>
              <WineGlassLoader size={18} /> Locking…
            </>
          ) : allMatched ? (
            "Lock in all glasses"
          ) : (
            "Match every glass to lock in"
          )}
        </button>
        <span className="text-center text-[11.5px] text-muted-foreground">
          Locking saves every match at once and shows the others you are ready.
        </span>
      </div>

      <FieldPicker
        open={picker.open}
        // Every glass picks from the same candidate list, so `field` is a
        // constant; the glass index is what resets the search per glass.
        field="country"
        resetKey={picker.index}
        points={POINTS_PER_GLASS}
        title={current ? `Which wine is ${current.label.replace(/^Glass /, "glass ")}?` : "Which wine?"}
        groups={groups}
        value={current ? matches[current.wineId] : ""}
        onPick={onPick}
        onNext={() => advanceFrom(picker.index)}
        nextLabel={nextLabel}
        search="client"
        onClose={closePicker}
        inputRef={inputRef}
        searchPlaceholder={`Search ${candidates.length} wines`}
      />
    </div>
  );
}
