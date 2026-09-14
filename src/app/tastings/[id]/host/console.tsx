"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pause as PauseIcon, Plus } from "lucide-react";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logClientTiming } from "@/lib/reveal-timing";
import { cn } from "@/lib/utils";
import type {
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import {
  endTastingConfirm,
  notRevealedEyebrow,
  type UnrevealedGlass,
} from "@/lib/tasting-lifecycle-copy";
import {
  CONSOLE_PAUSED,
  TWO_TAP_WINDOW_MS,
  notLockedLine,
  pouringNowEyebrow,
  revealEverythingLabel,
  skipLabel,
  skippedEyebrow,
  type TwoTapState,
} from "@/lib/console-copy";
import { setTastingPaused, skipToGlass } from "../pacing-actions";
import { finishTasting, type LobbyActionState } from "../actions";
import {
  revealFull,
  revealNextCategory,
  type RevealActionState,
} from "../play/reveal-actions";
import { ConsoleStandings } from "./console-standings";

export type ConsoleStep = {
  key: string;
  label: string;
  /** False only for the dashed placeholder chip a competing bring-your-own
      host sees: the true category name must stay hidden until it is
      actually revealed (rule 1), so the chip and the button just read
      "Next" / "N to go" / "Reveal the next attribute" instead of naming it. */
  known: boolean;
  /** The answer key has nothing on record for this step. Producer and vintage
      are always steps, and live both columns are NOT NULL, so this is a
      defensive case. Only ever set on a known step. */
  missing: boolean;
  state: "revealed" | "next" | "pending";
};

/** One glass as the console shows it — the answer identity is only ever
    filled in server-side when the host is allowed to see it. */
export type ConsoleGlass = {
  wineId: string;
  number: number;
  isRevealed: boolean;
  revealStep: number;
  title: string;
  meta: string | null;
  /** True while the identity shown is still hidden from the table. */
  privateIdentity: boolean;
  steps: ConsoleStep[];
  nextStep: ConsoleStep | null;
  /** What the gold button reads, precomputed server-side so the client never
      has to decide between a named category and the hostGuesses placeholder
      text itself. Null when there's nothing left to reveal progressively. */
  revealButtonLabel: string | null;
  locked: number;
  eligible: number;
  notLockedNames: string[];
  facts: { label: string; value: string }[];
  /** Why this glass can't be revealed yet — its details are unfinished
      ("Finish glass 3's details before revealing"). Null when it can. */
  refusal: string | null;
  /** The pour pointer wrapped back to this (skipped) glass — only ever true
      for the current glass, reveal-driven (refinement 23): raised only once
      the pointer has actually looped back, never by the Skip action itself. */
  wrapped: boolean;
};

export type ConsoleData = {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  timingMode: TimingMode;
  guidedLive: boolean;
  isSemiBlind: boolean;
  finished: boolean;
  /** Q1: the host has paused reveals and Skip. Guessing and locking still work. */
  paused: boolean;
  wineCount: number;
  revealedCount: number;
  /** The lowest-position unrevealed glass; null once everything is revealed. */
  current: ConsoleGlass | null;
  /** The glass revealed just before the current one, if any. */
  previous: ConsoleGlass | null;
  /** Where "Skip to glass {N} →" would move the pointer; null hides Skip
      entirely (nothing to skip to, or the pacing rule already refuses it). */
  skipTo: { wineId: string; glass: number } | null;
  standings: {
    participantId: string;
    name: string;
    total: number;
    totalWines: number;
    lastRoundPoints: number | null;
  }[];
  standingsAfter: string;
  /** Glasses whose answers ending the tasting would leave hidden, in list
      order — the End confirm names them (reveal-4). */
  unrevealedGlasses: UnrevealedGlass[];
};

// The handoff's dark-room button pair: gold primary, outlined secondary.
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-console-foreground/25 p-[14px_20px] text-[14px] font-semibold text-console-foreground transition-colors hover:border-gold-light hover:text-gold-light disabled:opacity-50";
const HEADER_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-[7px] rounded-[9px] border p-[9px_14px] text-[13px] font-semibold transition-colors md:min-h-0";

/**
 * The host console (6i). One obvious action — the big gold reveal — with the
 * rest as status: the glass being poured, who has locked in, the reveal
 * order, the standings and the "this glass" facts. Reveal state is always
 * the server's: the reveal forms post the step the host is looking at as
 * expected_step, so the RPC's compare-and-set makes a double tap a no-op
 * rather than a skip, and a no-op just re-reads.
 *
 * The one piece of client state is a dwell: after a glass is fully
 * revealed the console keeps showing it (the table is looking at the
 * answer) until the host presses "Next glass →", which moves to the derived
 * current glass. Nothing about which glass is current is ever chosen here —
 * the pour pointer (BT-P3) decides that server-side.
 */
export function HostConsole({ data }: { data: ConsoleData }) {
  const { openAddWineSheet } = useAddWine();
  const mainRef = useRef<HTMLDivElement>(null);
  const nextFormId = useId();
  const fullFormId = useId();

  const [dwellOn, setDwellOn] = useState<string | null>(null);
  const dwelling =
    dwellOn !== null && data.previous !== null && data.previous.wineId === dwellOn;
  const glass = dwelling ? data.previous : (data.current ?? data.previous);
  const allRevealed = data.wineCount > 0 && data.current === null;

  const [nextState, nextAction, nextPending] = useActionState<
    RevealActionState,
    FormData
  >(revealNextCategory, null);
  const [fullState, fullAction, fullPending] = useActionState<
    RevealActionState,
    FormData
  >(revealFull, null);
  const [finishState, finishAction, finishPending] = useActionState<
    LobbyActionState,
    FormData
  >(finishTasting, null);

  // Pause and Skip aren't <form>-bound server actions (no FormData shape to
  // match useActionState) — called directly, same pattern as the lobby's
  // reorder arrows (wine-flight-list.tsx).
  const [pacingPending, startPacingTransition] = useTransition();
  const [pacingError, setPacingError] = useState<string | null>(null);
  function togglePause() {
    startPacingTransition(async () => {
      const result = await setTastingPaused(data.tastingId, !data.paused);
      setPacingError(result?.error ?? null);
    });
  }
  function doSkip(fromWineId: string) {
    startPacingTransition(async () => {
      const result = await skipToGlass(data.tastingId, fromWineId);
      setPacingError(result?.error ?? null);
    });
  }

  // The inline two-tap confirm that replaces window.confirm for "Reveal
  // everything" (refinement 7, XCUT-37): the first tap arms the button for
  // TWO_TAP_WINDOW_MS, relabelling it; a second tap inside that window lets
  // the form submit. The timeout itself reverts the label even with no
  // second tap.
  const [armedAt, setArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  // Equivalent to twoTapState(armedAt, Date.now()) — the timeout above already
  // clears armedAt once the window elapses, so "armed" needs no impure clock
  // read during render (react-hooks/purity).
  const tapState: TwoTapState = armedAt === null ? "idle" : "armed";

  // How long the host actually waits: the action plus the whole-route
  // re-render it triggers, which is what makes the click feel unseamless.
  const nextStartedAt = useRef<number | null>(null);
  useEffect(() => {
    if (nextPending) {
      nextStartedAt.current = performance.now();
      return;
    }
    if (nextStartedAt.current !== null) {
      logClientTiming("host: click -> settled", performance.now() - nextStartedAt.current);
      nextStartedAt.current = null;
    }
  }, [nextPending]);

  const router = useRouter();
  useEffect(() => {
    if (finishState && "success" in finishState) {
      router.push(`/tastings/${data.tastingId}`);
    }
  }, [finishState, router, data.tastingId]);

  const pending = nextPending || fullPending;
  const error =
    nextState?.error ??
    fullState?.error ??
    (finishState && "error" in finishState ? finishState.error : null) ??
    pacingError;

  // The sheet decides where a camera start actually lands (spec §C.6): a mouse
  // or trackpad gets the desktop view, a phone or tablet the camera. The
  // console never measures the viewport itself.
  function openAddWine() {
    openAddWineSheet(
      {
        kind: "flight",
        tastingId: data.tastingId,
        tastingName: data.tastingName,
        revealMode: data.revealMode,
        wineSource: data.wineSource,
        position: data.wineCount + 1,
      },
      { start: "camera" },
    );
  }

  // spec §7.3 item 8: an incomplete glass's reveal controls stay inert, with
  // the refusal sentence and an Edit link beside it, opening the sheet's
  // by-hand form on that exact glass so the host can finish it without
  // leaving the console.
  function editGlass(wineId: string) {
    openAddWineSheet(
      {
        kind: "flight",
        tastingId: data.tastingId,
        tastingName: data.tastingName,
        revealMode: data.revealMode,
        wineSource: data.wineSource,
        position: data.wineCount + 1,
      },
      { start: "byhand", edit: { wineId } },
    );
  }

  function goToNextGlass() {
    setDwellOn(null);
    mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const canReveal = glass !== null && !glass.isRevealed && !data.finished;
  // An unfinished glass (no answer key yet) can't be revealed at all: every
  // reveal control on it is inert, with the refusal under it. They stay on
  // screen rather than disappearing, so the host can see why (spec §C.8).
  const revealBlocked = glass?.refusal != null;
  const showRevealAll =
    canReveal && data.guidedLive && glass !== null && glass.revealStep < glass.steps.length;
  const canSkip = !dwelling && data.skipTo !== null;

  const eyebrowText = data.finished
    ? "Finished · you hosted"
    : data.timingMode === "LIVE"
      ? "Live · you are hosting"
      : "Self-paced · you are hosting";
  const liveDotNode = !data.finished && data.timingMode === "LIVE" ? (
    <LiveDot />
  ) : (
    <span className="size-[7px] shrink-0 rounded-full bg-console-ink" aria-hidden />
  );
  const backHref = `/tastings/${data.tastingId}`;

  return (
    <div className="flex flex-1 flex-col bg-console text-console-foreground">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-console-foreground/12 px-4 py-4 md:px-[26px]">
        {/* Phone (S7b): one line — back icon, eyebrow, Pause, + Wine; no name. */}
        <div className="flex w-full items-center gap-2 md:hidden">
          <Link
            href={backHref}
            aria-label={data.finished ? "Back to the tasting" : "Tasting page"}
            className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {liveDotNode}
            <Eyebrow size="lg" className="truncate tracking-[.15em] text-gold-light">
              {eyebrowText}
            </Eyebrow>
          </span>
          {!data.finished && data.timingMode === "LIVE" ? (
            <button
              type="button"
              onClick={togglePause}
              disabled={pacingPending}
              className={cn(HEADER_BUTTON, "shrink-0 border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light disabled:opacity-50")}
            >
              <PauseIcon className="size-4" strokeWidth={2.5} />
              {data.paused ? "Resume" : "Pause"}
            </button>
          ) : null}
          {!data.finished && !data.isSemiBlind ? (
            <button
              type="button"
              onClick={openAddWine}
              className={cn(HEADER_BUTTON, "shrink-0 border-gold-light text-gold-light hover:bg-gold-light/10")}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Wine
            </button>
          ) : null}
        </div>

        {/* Laptop (S7): live dot · eyebrow · name · Pause · Add a wine · Tasting page · End tasting. */}
        <div className="hidden w-full flex-wrap items-center gap-x-[14px] gap-y-3 md:flex">
          <span className="flex items-center gap-2">
            {liveDotNode}
            <Eyebrow size="lg" className="tracking-[.15em] text-gold-light">
              {eyebrowText}
            </Eyebrow>
          </span>
          <h1 className="min-w-0 flex-1 truncate font-heading text-[22px] font-semibold md:text-[24px]">
            {data.tastingName}
          </h1>
          <div className="flex flex-wrap items-center gap-[10px]">
            {!data.finished && data.timingMode === "LIVE" ? (
              <button
                type="button"
                onClick={togglePause}
                disabled={pacingPending}
                className={cn(HEADER_BUTTON, "border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light disabled:opacity-50")}
              >
                <PauseIcon className="size-4" strokeWidth={2.5} />
                {data.paused ? "Resume" : "Pause"}
              </button>
            ) : null}
            {!data.finished && !data.isSemiBlind ? (
              <button
                type="button"
                onClick={openAddWine}
                className={cn(HEADER_BUTTON, "border-gold-light text-gold-light hover:bg-gold-light/10")}
              >
                <Plus className="size-4" strokeWidth={2.5} />
                Add a wine
              </button>
            ) : null}
            {/* reveal-5: the way back is always here, not only once the tasting
                has finished — a host who opens the console straight from a link
                would otherwise be stuck on it. */}
            <Link
              href={backHref}
              className={cn(HEADER_BUTTON, "border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light")}
            >
              <ArrowLeft className="size-4" />
              {data.finished ? "Back to the tasting" : "Tasting page"}
            </Link>
            {!data.finished ? (
              <form
                action={finishAction}
                onSubmit={(e) => {
                  // reveal-4: ending is reversible, so the confirm never claims
                  // it is permanent — it names the glasses left hidden instead.
                  if (!window.confirm(endTastingConfirm(data.unrevealedGlasses))) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="tasting_id" value={data.tastingId} />
                <button
                  type="submit"
                  disabled={finishPending}
                  className={cn(HEADER_BUTTON, "border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light disabled:opacity-50")}
                >
                  {finishPending ? "Ending…" : "End tasting"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
        {/* Main column */}
        <div
          ref={mainRef}
          className="flex min-w-0 flex-1 scroll-mt-4 flex-col gap-5 p-[22px_16px_28px] md:p-[26px_26px_30px]"
        >
          {data.paused ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 rounded-[13px] border border-gold-light/50 bg-gold-light/12 px-4 py-3 text-[13.5px] font-medium text-gold-light"
            >
              <PauseIcon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{CONSOLE_PAUSED}</span>
              <button
                type="button"
                onClick={togglePause}
                disabled={pacingPending}
                className="inline-flex min-h-9 items-center justify-center rounded-[9px] border border-gold-light p-[8px_14px] text-[12.5px] font-semibold text-gold-light transition-colors hover:bg-gold-light/10 disabled:opacity-50"
              >
                {pacingPending ? "Resuming…" : "Resume"}
              </button>
            </div>
          ) : null}

          {glass === null ? (
            <div className="flex flex-col gap-[6px]">
              <Eyebrow size="lg" className="tracking-[.15em] text-console-ink">
                Nothing poured yet
              </Eyebrow>
              <p className="font-heading text-[30px] font-semibold leading-[1.05] md:text-[38px]">
                Add a wine to start pouring.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-5">
                <div className="flex min-w-0 flex-col gap-[6px]">
                  <Eyebrow size="lg" className="tracking-[.15em] text-console-ink">
                    {/* reveal-4: a finished tasting never says "pouring now" —
                        a glass left hidden is named as such. */}
                    {data.finished && !glass.isRevealed
                      ? notRevealedEyebrow(glass.number, data.wineCount)
                      : glass.isRevealed
                        ? `Revealed · glass ${glass.number} of ${data.wineCount} so far`
                        : glass.wrapped
                          ? skippedEyebrow(glass.number)
                          : pouringNowEyebrow(glass.number, data.wineCount)}
                  </Eyebrow>
                  <p className="font-heading text-[30px] font-semibold leading-[1.02] md:text-[38px]">
                    {glass.title}
                  </p>
                  {glass.meta || glass.privateIdentity ? (
                    <p className="text-[13px] text-console-ink">
                      {[glass.meta, glass.privateIdentity ? "only you can see this" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="ml-auto flex flex-col items-end gap-[3px]">
                  <span className="font-heading text-[34px] font-semibold leading-none text-gold-light lining-nums tabular-nums">
                    {glass.locked}/{glass.eligible}
                  </span>
                  <span className="text-[11.5px] text-console-ink">locked in</span>
                </div>
              </div>

              {glass.steps.length > 0 ? (
                <div className="flex flex-col gap-[11px]">
                  <Eyebrow size="md" className="text-console-ink">
                    {data.guidedLive
                      ? "Reveal in order · tap to go one step further"
                      : "Revealed all at once"}
                  </Eyebrow>
                  <div className="flex flex-wrap items-center gap-2">
                    {glass.steps.map((step) => {
                      if (step.state === "revealed") {
                        return (
                          <span
                            key={step.key}
                            className="flex items-center gap-2 rounded-[10px] border border-gold-light bg-gold-light/16 p-[11px_15px] text-[13.5px] font-semibold"
                          >
                            <span className="flex size-[17px] items-center justify-center rounded-full bg-gold-light text-console">
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                            {step.label}
                          </span>
                        );
                      }
                      if (step.state === "next" && data.guidedLive && canReveal) {
                        return (
                          <button
                            key={step.key}
                            type="submit"
                            form={nextFormId}
                            disabled={pending || data.paused}
                            className="flex min-h-11 items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-gold-light p-[11px_15px] text-[13.5px] font-semibold text-gold-light transition-colors hover:bg-gold-light/10 disabled:opacity-50"
                          >
                            {step.known ? `${step.label} · next` : step.label}
                          </button>
                        );
                      }
                      return (
                        <span
                          key={step.key}
                          className="flex items-center gap-2 rounded-[10px] border border-dashed border-console-foreground/25 p-[11px_15px] text-[13.5px] text-console-ink"
                        >
                          {step.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-[14px]",
                    // S7b: pinned to the bottom of the phone viewport (safe-area
                    // inset), so the one obvious action stays reachable without
                    // scrolling; the laptop rail keeps it in normal flow.
                    "max-lg:sticky max-lg:bottom-0 max-lg:z-30 max-lg:-mx-4 max-lg:border-t max-lg:border-console-foreground/12 max-lg:bg-console max-lg:px-4 max-lg:pb-[calc(12px+env(safe-area-inset-bottom))] max-lg:pt-3",
                  )}
                >
                  {canReveal && data.guidedLive && glass.nextStep ? (
                    <form
                      id={nextFormId}
                      action={nextAction}
                      onSubmit={() => setDwellOn(glass.wineId)}
                      className="flex flex-col items-start gap-2 max-lg:w-full"
                    >
                      <input type="hidden" name="wine_id" value={glass.wineId} />
                      <input type="hidden" name="expected_step" value={glass.revealStep} />
                      <button
                        type="submit"
                        disabled={pending || revealBlocked || data.paused}
                        className="inline-flex min-h-11 items-center gap-[10px] rounded-[11px] bg-gold-light p-[15px_22px] text-[17px] font-bold text-console shadow-[0_2px_0_0_rgba(0,0,0,.25)] transition-colors hover:bg-gold-deep disabled:opacity-60 max-lg:w-full max-lg:justify-center md:p-[17px_30px] md:text-[18px]"
                      >
                        {nextPending ? (
                          <>
                            <WineGlassLoader size={22} wineColor="var(--console)" />
                            Revealing…
                          </>
                        ) : (
                          glass.revealButtonLabel
                        )}
                      </button>
                      {glass.nextStep.known && glass.nextStep.missing ? (
                        <p className="max-w-[34ch] text-[12.5px] leading-[1.5] text-console-ink">
                          No {glass.nextStep.label.toLowerCase()} on record for this glass —
                          this step scores nobody.
                        </p>
                      ) : null}
                    </form>
                  ) : null}

                  {canReveal && !(data.guidedLive && glass.nextStep) ? (
                    <form
                      id={fullFormId}
                      action={fullAction}
                      onSubmit={() => setDwellOn(glass.wineId)}
                      className="flex flex-col items-start gap-2 max-lg:w-full"
                    >
                      <input type="hidden" name="wine_id" value={glass.wineId} />
                      {revealBlocked ? (
                        // An unfinished glass has no answer key, so a full
                        // reveal is not a primary action — the control stays on
                        // screen, inert, with the reason under it (spec §C.8).
                        <button type="submit" disabled className={cn(SECONDARY, "max-lg:w-full")}>
                          Reveal everything
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={pending || data.paused}
                          className="inline-flex min-h-11 items-center gap-[10px] rounded-[11px] bg-gold-light p-[15px_22px] text-[17px] font-bold text-console shadow-[0_2px_0_0_rgba(0,0,0,.25)] transition-colors hover:bg-gold-deep disabled:opacity-60 max-lg:w-full max-lg:justify-center md:p-[17px_30px] md:text-[18px]"
                        >
                          {fullPending ? (
                            <>
                              <WineGlassLoader size={22} wineColor="var(--console)" />
                              Revealing…
                            </>
                          ) : (
                            "Reveal the whole glass"
                          )}
                        </button>
                      )}
                      {glass.refusal ? (
                        <div className="flex max-w-[34ch] flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[12.5px] leading-[1.5] text-console-ink">
                            {glass.refusal}
                          </p>
                          <button
                            type="button"
                            onClick={() => editGlass(glass.wineId)}
                            className="flex min-h-11 items-center px-1 text-[12.5px] font-semibold text-gold-light hover:underline md:pointer-fine:min-h-0"
                          >
                            Edit
                          </button>
                        </div>
                      ) : null}
                    </form>
                  ) : null}

                  {showRevealAll || canSkip ? (
                    <div className="flex flex-wrap items-center gap-[10px] max-lg:grid max-lg:w-full max-lg:grid-cols-2">
                      {showRevealAll ? (
                        <button
                          type="submit"
                          form={fullFormId}
                          disabled={pending || revealBlocked || data.paused}
                          onClick={(e) => {
                            if (tapState !== "armed") {
                              e.preventDefault();
                              setArmedAt(Date.now());
                              return;
                            }
                            // The second tap lets the click through to submit
                            // fullFormId — that form's own onSubmit (below)
                            // sets the dwell, same as its nested button does.
                            setArmedAt(null);
                          }}
                          className={SECONDARY}
                        >
                          {fullPending ? "Revealing…" : revealEverythingLabel(tapState)}
                        </button>
                      ) : null}

                      {canSkip && data.skipTo ? (
                        <button
                          type="button"
                          onClick={() => doSkip(glass.wineId)}
                          disabled={pacingPending || data.paused}
                          className={SECONDARY}
                        >
                          {pacingPending ? "Skipping…" : skipLabel(data.skipTo.glass)}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {glass.isRevealed && data.current !== null ? (
                    <button type="button" onClick={goToNextGlass} className={SECONDARY}>
                      Next glass →
                    </button>
                  ) : null}
                </div>

                {canReveal && glass.notLockedNames.length > 0 ? (
                  <p className="max-w-[30ch] text-[12.5px] leading-[1.5] text-console-ink">
                    {/* S7b's short form folds "has not locked in" and what a
                        reveal does to them into one clause. */}
                    <span className="lg:hidden">
                      {notLockedLine(glass.notLockedNames, { phone: true })}
                    </span>
                    <span className="hidden lg:inline">
                      {notLockedLine(glass.notLockedNames, { phone: false })}
                    </span>
                  </p>
                ) : null}

                {allRevealed && glass.isRevealed ? (
                  <p className="text-[13px] text-console-ink">
                    All glasses revealed — end the tasting when you are done.
                  </p>
                ) : null}
                {data.finished ? (
                  <p className="text-[13px] text-console-ink">
                    This tasting is finished — reveals are closed.
                  </p>
                ) : null}
                {error ? <p className="text-[12.5px] text-miss">{error}</p> : null}
              </div>
            </>
          )}
        </div>

        {/* Right rail */}
        <aside className="flex shrink-0 flex-col gap-[14px] border-t border-console-foreground/12 bg-console-card p-[22px_16px_26px] md:p-[24px_24px_28px] lg:w-[330px] lg:border-t-0 lg:border-l">
          <div className="flex items-baseline gap-[9px]">
            <Eyebrow size="md" className="text-console-ink">
              Standings
            </Eyebrow>
            <span className="ml-auto text-[11.5px] text-console-ink">{data.standingsAfter}</span>
          </div>
          {data.standings.length === 0 ? (
            <p className="text-[12.5px] text-console-ink">No competitors yet.</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <ConsoleStandings rows={data.standings} isSemiBlind={data.isSemiBlind} />
              </div>
              <div className="flex flex-col gap-2 lg:hidden">
                <ConsoleStandings rows={data.standings} isSemiBlind={data.isSemiBlind} limit={2} />
                {data.standings.length > 2 ? (
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="self-start text-[12px] font-semibold text-gold-light"
                        />
                      }
                    >
                      All {data.standings.length} ›
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      className="w-72 border-console-foreground/20 bg-console-card p-3"
                    >
                      <ConsoleStandings rows={data.standings} isSemiBlind={data.isSemiBlind} />
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            </>
          )}

          {glass !== null ? (
            <div className="mt-auto flex flex-col gap-2 border-t border-console-foreground/12 pt-[14px]">
              <Eyebrow size="md" className="text-console-ink">
                {/* S7b: "This glass, so far" on phones. */}
                <span className="lg:hidden">This glass, so far</span>
                <span className="hidden lg:inline">This glass</span>
              </Eyebrow>
              {glass.facts.length === 0 ? (
                <p className="text-[12.5px] text-console-ink">
                  {glass.eligible === 0
                    ? "Nobody is guessing this glass."
                    : "Facts appear as the glass is revealed."}
                </p>
              ) : (
                glass.facts.map((fact) => (
                  <span key={fact.label} className="flex justify-between gap-3 text-[12.5px]">
                    <span className="text-console-ink">{fact.label}</span>
                    <span className="truncate tabular-nums">{fact.value}</span>
                  </span>
                ))
              )}
            </div>
          ) : null}

          {/* S7b: End tasting moves to the bottom of the page, under the
              facts card — the laptop header keeps it inline. Same md
              threshold as the header's own phone/laptop split, so the two
              End-tasting controls are never both on screen at once. */}
          {!data.finished ? (
            <form
              action={finishAction}
              className="md:hidden"
              onSubmit={(e) => {
                if (!window.confirm(endTastingConfirm(data.unrevealedGlasses))) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tasting_id" value={data.tastingId} />
              <button
                type="submit"
                disabled={finishPending}
                className={cn(HEADER_BUTTON, "w-full border-console-foreground/25 text-console-foreground hover:border-gold-light hover:text-gold-light disabled:opacity-50")}
              >
                {finishPending ? "Ending…" : "End tasting"}
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
