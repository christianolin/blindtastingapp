"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
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
  const [fullState, fullAction, fullPending] = useActionState<
    RevealActionState,
    FormData
  >(revealFull, null);

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
        <form
          action={fullAction}
          onSubmit={(e) => {
            if (!window.confirm("Reveal the full answer now?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="wine_id" value={wineId} />
          <Button type="submit" size="sm" variant="outline" disabled={fullPending}>
            {fullPending ? "…" : "Reveal full answer"}
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
