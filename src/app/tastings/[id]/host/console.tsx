"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { logClientTiming } from "@/lib/reveal-timing";
import { cn } from "@/lib/utils";
import type {
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { finishTasting, type LobbyActionState } from "../actions";
import {
  revealFull,
  revealNextCategory,
  type RevealActionState,
} from "../play/reveal-actions";

export type StepKey =
  | "country"
  | "region"
  | "appellation"
  | "grapes"
  | "producer"
  | "type_designation"
  | "vintage";

export type ConsoleStep = {
  key: StepKey;
  label: string;
  /** The answer key has no value for this step (producer/vintage are always
      steps; the RPC scores them 0). Only ever true once the host may know. */
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
  locked: number;
  eligible: number;
  notLockedNames: string[];
  facts: { label: string; value: string }[];
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
  wineCount: number;
  revealedCount: number;
  /** The lowest-position unrevealed glass; null once everything is revealed. */
  current: ConsoleGlass | null;
  /** The glass revealed just before the current one, if any. */
  previous: ConsoleGlass | null;
  standings: {
    participantId: string;
    name: string;
    total: number;
    totalWines: number;
    lastRoundPoints: number | null;
  }[];
  standingsAfter: string;
};

const FINISH_CONFIRM =
  "Finish this tasting? Guessing closes and it moves to History. This can't be undone.";

// The handoff's dark-room button pair: gold primary, outlined secondary.
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-background/25 p-[14px_20px] text-[14px] font-semibold text-background transition-colors hover:border-gold-light hover:text-gold-light disabled:opacity-50";
const HEADER_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-[7px] rounded-[9px] border p-[9px_14px] text-[13px] font-semibold transition-colors md:min-h-0";

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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
 * current glass. Nothing about which glass is current is ever chosen here.
 */
export function HostConsole({ data }: { data: ConsoleData }) {
  const router = useRouter();
  const { openAddWineSheet } = useAddWine();
  const mainRef = useRef<HTMLDivElement>(null);
  const nextFormId = useId();

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

  useEffect(() => {
    if (finishState && "success" in finishState) {
      router.push(`/tastings/${data.tastingId}`);
    }
  }, [finishState, router, data.tastingId]);

  const pending = nextPending || fullPending;
  const error =
    nextState?.error ??
    fullState?.error ??
    (finishState && "error" in finishState ? finishState.error : null);

  function openAddWine() {
    const isDesktop =
      typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    openAddWineSheet(
      {
        kind: "flight",
        tastingId: data.tastingId,
        tastingName: data.tastingName,
        revealMode: data.revealMode,
        wineSource: data.wineSource,
        position: data.wineCount + 1,
      },
      { start: isDesktop ? "search" : "camera" },
    );
  }

  function goToNextGlass() {
    setDwellOn(null);
    mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const canReveal = glass !== null && !glass.isRevealed && !data.finished;
  const showRevealAll =
    canReveal && data.guidedLive && glass !== null && glass.revealStep < glass.steps.length;

  return (
    <div className="flex flex-1 flex-col bg-console text-background">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-[14px] gap-y-3 border-b border-background/12 px-4 py-4 md:px-[26px]">
        <span className="flex items-center gap-2">
          {/* The pinging dot is the "live" signal; finished and self-paced
              tastings get a still one so the eyebrow keeps its alignment. */}
          {!data.finished && data.timingMode === "LIVE" ? (
            <LiveDot />
          ) : (
            <span className="size-[7px] shrink-0 rounded-full bg-console-ink" aria-hidden />
          )}
          <Eyebrow size="lg" className="tracking-[.15em] text-gold-light">
            {data.finished
              ? "Finished · you hosted"
              : data.timingMode === "LIVE"
                ? "Live · you are hosting"
                : "Self-paced · you are hosting"}
          </Eyebrow>
        </span>
        <h1 className="min-w-0 flex-1 truncate font-heading text-[22px] font-semibold md:text-[24px]">
          {data.tastingName}
        </h1>
        <div className="flex w-full items-center gap-[10px] md:ml-auto md:w-auto">
          {!data.finished ? (
            <button
              type="button"
              onClick={openAddWine}
              className={cn(
                HEADER_BUTTON,
                "flex-1 border-gold-light text-gold-light hover:bg-gold-light/10 md:flex-none",
              )}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Add a wine
            </button>
          ) : null}
          {data.finished ? (
            <Link
              href={`/tastings/${data.tastingId}`}
              className={cn(
                HEADER_BUTTON,
                "flex-1 border-background/25 text-background hover:border-gold-light hover:text-gold-light md:flex-none",
              )}
            >
              <ArrowLeft className="size-4" />
              Back to the tasting
            </Link>
          ) : (
            <form
              action={finishAction}
              className="flex flex-1 md:flex-none"
              onSubmit={(e) => {
                if (!window.confirm(FINISH_CONFIRM)) e.preventDefault();
              }}
            >
              <input type="hidden" name="tasting_id" value={data.tastingId} />
              <button
                type="submit"
                disabled={finishPending}
                className={cn(
                  HEADER_BUTTON,
                  "flex-1 border-background/25 text-background hover:border-gold-light hover:text-gold-light disabled:opacity-50 md:flex-none",
                )}
              >
                {finishPending ? "Ending…" : "End tasting"}
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
        {/* Main column */}
        <div
          ref={mainRef}
          className="flex min-w-0 flex-1 scroll-mt-4 flex-col gap-5 p-[22px_16px_28px] md:p-[26px_26px_30px]"
        >
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
                    {glass.isRevealed
                      ? `Revealed · glass ${glass.number} of ${data.wineCount} so far`
                      : `Pouring now · glass ${glass.number} of ${data.wineCount} so far`}
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
                            disabled={pending}
                            className="flex min-h-11 items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-gold-light p-[11px_15px] text-[13.5px] font-semibold text-gold-light transition-colors hover:bg-gold-light/10 disabled:opacity-50"
                          >
                            {step.label} · next
                          </button>
                        );
                      }
                      return (
                        <span
                          key={step.key}
                          className="flex items-center gap-2 rounded-[10px] border border-dashed border-background/25 p-[11px_15px] text-[13.5px] text-console-ink"
                        >
                          {step.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-[14px]">
                  {canReveal && data.guidedLive && glass.nextStep ? (
                    <form
                      id={nextFormId}
                      action={nextAction}
                      onSubmit={() => setDwellOn(glass.wineId)}
                      className="flex flex-col items-start gap-2"
                    >
                      <input type="hidden" name="wine_id" value={glass.wineId} />
                      <input type="hidden" name="expected_step" value={glass.revealStep} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="inline-flex min-h-11 items-center gap-[10px] rounded-[11px] bg-gold-light p-[15px_22px] text-[17px] font-bold text-console shadow-[0_2px_0_0_rgba(0,0,0,.25)] transition-colors hover:bg-gold-deep disabled:opacity-60 md:p-[17px_30px] md:text-[18px]"
                      >
                        {nextPending ? (
                          <>
                            <WineGlassLoader size={22} wineColor="var(--console)" />
                            Revealing…
                          </>
                        ) : (
                          `Reveal the ${glass.nextStep.label.toLowerCase()}`
                        )}
                      </button>
                      {glass.nextStep.missing ? (
                        <p className="max-w-[34ch] text-[12.5px] leading-[1.5] text-console-ink">
                          No {glass.nextStep.label.toLowerCase()} was recorded for this glass —
                          revealing scores it 0.
                        </p>
                      ) : null}
                    </form>
                  ) : null}

                  {canReveal && !(data.guidedLive && glass.nextStep) ? (
                    <form action={fullAction} onSubmit={() => setDwellOn(glass.wineId)}>
                      <input type="hidden" name="wine_id" value={glass.wineId} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="inline-flex min-h-11 items-center gap-[10px] rounded-[11px] bg-gold-light p-[15px_22px] text-[17px] font-bold text-console shadow-[0_2px_0_0_rgba(0,0,0,.25)] transition-colors hover:bg-gold-deep disabled:opacity-60 md:p-[17px_30px] md:text-[18px]"
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
                    </form>
                  ) : null}

                  {showRevealAll ? (
                    <form
                      action={fullAction}
                      onSubmit={(e) => {
                        if (!window.confirm("Reveal everything about this glass now?")) {
                          e.preventDefault();
                          return;
                        }
                        setDwellOn(glass.wineId);
                      }}
                    >
                      <input type="hidden" name="wine_id" value={glass.wineId} />
                      <button type="submit" disabled={pending} className={SECONDARY}>
                        {fullPending ? "Revealing…" : "Reveal everything"}
                      </button>
                    </form>
                  ) : null}

                  {glass.isRevealed && data.current !== null ? (
                    <button type="button" onClick={goToNextGlass} className={SECONDARY}>
                      Next glass →
                    </button>
                  ) : null}

                  {canReveal && glass.notLockedNames.length > 0 ? (
                    <p className="max-w-[30ch] text-[12.5px] leading-[1.5] text-console-ink">
                      {joinNames(glass.notLockedNames)}{" "}
                      {glass.notLockedNames.length === 1 ? "has" : "have"} not locked in.
                      Revealing now scores them on what they have.
                    </p>
                  ) : null}
                </div>

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
        <aside className="flex shrink-0 flex-col gap-[14px] border-t border-background/12 bg-console-card p-[22px_16px_26px] md:p-[24px_24px_28px] lg:w-[330px] lg:border-t-0 lg:border-l">
          <div className="flex items-baseline gap-[9px]">
            <Eyebrow size="md" className="text-console-ink">
              Standings
            </Eyebrow>
            <span className="ml-auto text-[11.5px] text-console-ink">{data.standingsAfter}</span>
          </div>
          {data.standings.length === 0 ? (
            <p className="text-[12.5px] text-console-ink">No competitors yet.</p>
          ) : (
            <ol className="flex flex-col gap-px">
              {data.standings.map((row, i) => (
                <li
                  key={row.participantId}
                  className="flex items-baseline gap-[10px] border-b border-background/10 py-[9px] last:border-b-0"
                >
                  <span
                    className={cn(
                      "w-4 font-heading text-[16px] lining-nums tabular-nums",
                      i === 0 ? "text-gold-light" : "text-console-ink",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14px]",
                      i === 0 && "font-semibold",
                    )}
                  >
                    {row.name}
                  </span>
                  {row.lastRoundPoints !== null ? (
                    <span className="text-[11.5px] text-console-ink tabular-nums">
                      {data.isSemiBlind
                        ? row.lastRoundPoints > 0
                          ? "✓"
                          : "✗"
                        : `+${row.lastRoundPoints}`}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "text-[14px] text-gold-light tabular-nums",
                      i === 0 ? "font-bold" : "font-semibold",
                    )}
                  >
                    {data.isSemiBlind ? `${row.total}/${row.totalWines}` : row.total}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {glass !== null ? (
            <div className="mt-auto flex flex-col gap-2 border-t border-background/12 pt-[14px]">
              <Eyebrow size="md" className="text-console-ink">
                This glass
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
        </aside>
      </div>
    </div>
  );
}
