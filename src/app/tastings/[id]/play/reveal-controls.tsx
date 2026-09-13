"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logClientTiming } from "@/lib/reveal-timing";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import {
  TWO_TAP_WINDOW_MS,
  revealEverythingLabel,
  type TwoTapState,
} from "@/lib/console-copy";
import {
  revealNextCategory,
  revealFull,
  type RevealActionState,
} from "./reveal-actions";

// Host controls for a guided progressive reveal: reveal the next attribute
// (primary) or skip straight to the full answer (secondary). expected_step is
// the current shared reveal_step, so the RPC's compare-and-set makes a double
// tap idempotent.
export function RevealControls({
  wineId,
  revealStep,
  started,
}: {
  wineId: string;
  revealStep: number;
  started: boolean;
}) {
  const [nextState, nextAction, nextPending] = useActionState<
    RevealActionState,
    FormData
  >(revealNextCategory, null);

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
  const [fullState, fullAction, fullPending] = useActionState<
    RevealActionState,
    FormData
  >(revealFull, null);

  // The inline two-tap confirm that replaces window.confirm (refinement 7):
  // shared with the host console's own "Reveal everything" button, so both
  // read the same copy and arm for the same five seconds.
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={nextAction}>
          <input type="hidden" name="wine_id" value={wineId} />
          <input type="hidden" name="expected_step" value={revealStep} />
          <Button type="submit" size="sm" disabled={nextPending}>
            {nextPending ? (
              <>
                <WineGlassLoader /> Revealing…
              </>
            ) : started ? (
              "Reveal next"
            ) : (
              "Start reveal"
            )}
          </Button>
        </form>
        <form action={fullAction}>
          <input type="hidden" name="wine_id" value={wineId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={fullPending}
            onClick={(e) => {
              if (tapState !== "armed") {
                e.preventDefault();
                setArmedAt(Date.now());
                return;
              }
              setArmedAt(null);
            }}
          >
            {fullPending ? "…" : revealEverythingLabel(tapState)}
          </Button>
        </form>
      </div>
      {nextState?.error ? (
        <p className="text-xs text-destructive">{nextState.error}</p>
      ) : null}
      {fullState?.error ? (
        <p className="text-xs text-destructive">{fullState.error}</p>
      ) : null}
    </div>
  );
}
