"use client";

import { useActionState, useState } from "react";
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
import { startLandsOnConsole, type UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";
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
 * Host-only controls. Used to have two surfaces; since BT-L4 only "start"
 * remains here — the prominent Start action (the one primary call-to-action
 * pre-start). The lobby mounts it once, inline above its columns, at a slot
 * its draft and running trees share, so what Start returned (its warning
 * above all) is still shown after the page re-renders into the running
 * board.
 *
 * The old "menu" surface (schedule / invite + share link / pacing and
 * leaderboard toggles / Finish / Reopen / Delete — what the header cogwheel's
 * popover, `HostControlsMenu`, used to open) is gone: every one of those
 * controls now lives in `TastingSettingsSheet`. `surface: "menu"` is kept in
 * the prop type, and this component still renders nothing for it, only so
 * `host-controls-menu.tsx` (deleted, along with the header's cogwheel, by
 * BT-L2) keeps type-checking in the meantime.
 */
export function HostControls({
  tastingId,
  status,
  timingMode,
  revealMode,
  wineSource,
  surface,
}: {
  tastingId: string;
  status: string;
  /** @deprecated unused since BT-L4 — kept only for host-controls-menu.tsx's
      still-compiling call until BT-L2 deletes it. */
  scheduledAt?: string | null;
  /** @deprecated unused since BT-L4 (Manage invitations moved to the sheet). */
  friends?: { id: string; display_name: string; email: string }[];
  /** @deprecated unused since BT-L4 (the pacing toggle moved to the sheet). */
  sequentialGuessing?: boolean;
  /** @deprecated unused since BT-L4. */
  showSequentialToggle?: boolean;
  /** @deprecated unused since BT-L4 (the rules card now covers this). */
  leaderboardReveal?: string;
  /** @deprecated unused since BT-L4. */
  showLeaderboardToggle?: boolean;
  /** @deprecated removed in BT-L2. B4/Q6: invites and the share link now
      stay open in the running menu for every tasting that is not CLOSED, so
      this no longer gates anything here — its last passer lives in the
      header BT-L2 rewrites. */
  invitesStayOpen?: boolean;
  /** Only the "start" surface reads these three: where Start lands
      (`startLandsOnConsole`). A caller that leaves one out keeps the host on
      the lobby, which links to the console anyway. */
  timingMode?: TimingMode;
  revealMode?: RevealMode;
  wineSource?: WineSourceMode;
  /** @deprecated unused since BT-L4 (End's confirm now reads it inside the
      sheet). */
  unrevealedGlasses?: readonly UnrevealedGlass[];
  /** @deprecated unused since BT-L4 (the share link now lives in the
      sheet's Manage invitations view). */
  shareLinkActive?: boolean;
  surface: "start" | "menu";
}) {
  const router = useRouter();
  // reveal-5: the one rule both Start surfaces share (the create sheet's step 3
  // uses it too) — only a LIVE blind host-provides host lands on the console.
  // A bring-your-own host, semi-blind and Taste & Rate (OPEN) stay on the lobby.
  const landsOnConsole =
    timingMode !== undefined &&
    revealMode !== undefined &&
    wineSource !== undefined &&
    startLandsOnConsole({ timingMode, revealMode, wineSource });
  // Wrapped rather than a `useEffect` on the returned state, so the push goes
  // out the moment the action resolves. Only a clean success goes on to the
  // console: a success that carries a warning (an incomplete glass, a bottle
  // that couldn't leave the cellar) keeps the host on the lobby, where this
  // surface shows the warning with a Host console link, as the create sheet's
  // step 3 does (spec §C.7, amendment 2).
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
  // A Start result belongs to the run it started. Finish (now in the
  // settings sheet) re-renders this same mounted surface as CLOSED; from
  // then on the result stays hidden, so a later Reopen doesn't bring back a
  // stale warning.
  const [startResultRetired, setStartResultRetired] = useState(false);

  if (status === "CLOSED" && startState !== null && !startResultRetired) {
    setStartResultRetired(true);
  }

  const notStarted = status === "DRAFT";

  if (surface === "menu") return null;

  // Draft lobby's one primary action, inline above the lobby's columns. Never
  // gated on a wine count, and an incomplete glass never blocks it: the
  // server's error shows under the button, and so does a success's warning.
  if (!notStarted) {
    // A started tasting has no Start. What shows is the result of the Start
    // that got it here: startTasting revalidates the lobby, which re-renders
    // into the running board in the same commit that delivers { success,
    // warning }, and this surface (mounted at a slot both trees share) keeps
    // that state. It shows the success, any warning and, when Start stayed
    // here instead of going on to the console, the way on. Nothing on a
    // plain page load, and nothing once the tasting has ended.
    if (
      !startState ||
      !("success" in startState) ||
      startResultRetired ||
      status !== "IN_PROGRESS"
    ) {
      return null;
    }
    return (
      <div className="flex flex-col gap-2">
        <StateMessage state={startState} />
        {landsOnConsole ? (
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
  return (
    <form action={startAction} className="flex flex-col gap-2">
      <input type="hidden" name="tasting_id" value={tastingId} />
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
