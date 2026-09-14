"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import type {
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import type { StartResult } from "@/lib/tasting-request-cache";
import { startLandsOnConsole } from "@/lib/tasting-lifecycle-copy";
import { startTasting, type LobbyActionState } from "./actions";

// A success can carry a warning that still needs the host (Start's incomplete
// glasses, a cellar bottle that couldn't be drawn down) — shown under it.
function StateMessage({ state }: { state: LobbyActionState }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="text-sm text-destructive">{state.error}</p>;
  return (
    <>
      <p className="text-sm text-chart-3">{state.success}</p>
      {state.warning ? (
        <p role="status" className="text-sm font-semibold text-gold-dark">
          {state.warning}
        </p>
      ) : null}
    </>
  );
}

/**
 * The lobby's Start, for the host: the one primary call-to-action before the
 * start, mounted by `StartBar` inside `LobbyView`, which `page.tsx` renders
 * only while the tasting is DRAFT. Never gated on a wine count, and an
 * incomplete glass never blocks it.
 *
 * Where Start lands (reveal-5, `startLandsOnConsole`): a clean success on a
 * LIVE blind host-provides tasting goes on to the console. Every other
 * success stays on the tasting page, where the status flip swaps `LobbyView`
 * for `RunningView` in the same round trip and unmounts this form, and its
 * action state, before the result could show. So the form sends
 * `carry_result`, `startTasting` leaves the success and any warning in a
 * one-shot cookie, and `RunningView` shows them once through
 * `StartResultNotice`, with a Host console link where Start would otherwise
 * have gone there (BT-V3 A-08; spec §C.7, amendment 2). An error leaves the
 * tasting DRAFT, so it shows here, under the button.
 */
export function HostControls({
  tastingId,
  status,
  timingMode,
  revealMode,
  wineSource,
}: {
  tastingId: string;
  status: string;
  /** Where Start lands (`startLandsOnConsole`). A caller that leaves one out
      keeps the host on the tasting page, which links to the console anyway. */
  timingMode?: TimingMode;
  revealMode?: RevealMode;
  wineSource?: WineSourceMode;
}) {
  const router = useRouter();
  // reveal-5: the one rule both Start surfaces share (the create sheet's step 3
  // uses it too) — only a LIVE blind host-provides host lands on the console.
  const landsOnConsole =
    timingMode !== undefined &&
    revealMode !== undefined &&
    wineSource !== undefined &&
    startLandsOnConsole({ timingMode, revealMode, wineSource });
  // Wrapped rather than a `useEffect` on the returned state, so the push goes
  // out the moment the action resolves. Only a clean success goes on to the
  // console: a success that carries a warning stays on the tasting page, where
  // StartResultNotice shows it with the Host console link.
  const [startState, startAction, startPending] = useActionState(
    async (prev: LobbyActionState, formData: FormData) => {
      const result = await startTasting(prev, formData);
      if (
        result &&
        "success" in result &&
        !result.warning &&
        landsOnConsole
      ) {
        router.push(`/tastings/${tastingId}/host`);
      }
      return result;
    },
    null,
  );

  if (status !== "DRAFT") return null;

  return (
    <form action={startAction} className="flex flex-col gap-2">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <input type="hidden" name="carry_result" value="1" />
      <Button
        type="submit"
        size="lg"
        disabled={startPending}
        className="min-h-11 w-full gap-1.5 sm:w-fit md:pointer-fine:min-h-0"
      >
        {startPending ? (
          <>
            <WineGlassLoader /> Starting…
          </>
        ) : (
          <>
            <Play className="size-4" /> Start tasting
          </>
        )}
      </Button>
      <StateMessage state={startState} />
    </form>
  );
}

/**
 * Start's result on the running page, shown to the host once (BT-V3 A-08):
 * what `startTasting` left in the one-shot cookie when the host started from
 * the lobby. The cookie is cleared as soon as this mounts, and the result is
 * held in state, so the page's AutoRefresh (whose re-renders no longer carry
 * the cookie) keeps it on screen until the host leaves the page, and a reload
 * does not bring it back. `RunningView` mounts this for the host on every
 * render, so that state survives the refreshes.
 */
export function StartResultNotice({
  tastingId,
  result,
  cookieName,
  cookiePath,
}: {
  tastingId: string;
  result: StartResult | null;
  cookieName: string;
  cookiePath: string;
}) {
  const [shown] = useState(result);

  useEffect(() => {
    if (!result) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${cookieName}=; Path=${cookiePath}; Max-Age=0; SameSite=Lax${secure}`;
  }, [result, cookieName, cookiePath]);

  if (!shown) return null;
  return (
    <div className="flex flex-col gap-2">
      <StateMessage
        state={
          shown.warning
            ? { success: shown.success, warning: shown.warning }
            : { success: shown.success }
        }
      />
      {shown.toConsole ? (
        <Button
          render={<Link href={`/tastings/${tastingId}/host`} />}
          nativeButton={false}
          size="lg"
          className="min-h-11 w-full sm:w-fit md:pointer-fine:min-h-0"
        >
          Host console
        </Button>
      ) : null}
    </div>
  );
}
