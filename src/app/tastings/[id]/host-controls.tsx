"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trash2,
  Play,
  Flag,
  CalendarClock,
  UserPlus,
  ListOrdered,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { InviteField } from "@/app/tastings/new/invite-field";
import { JoinLinkRow } from "@/app/tastings/new/join-link-row";
import { isoToLocal, localToIso } from "@/app/tastings/new/setup-copy";
import type {
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import {
  endTastingConfirm,
  startLandsOnConsole,
  type UnrevealedGlass,
} from "@/lib/tasting-lifecycle-copy";
import {
  startTasting,
  updateSchedule,
  inviteToTasting,
  deleteTasting,
  finishTasting,
  reopenTasting,
  setSequentialGuessing,
  setLeaderboardReveal,
  type LobbyActionState,
} from "./actions";

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
 * Host-only controls with two surfaces:
 *  - "start": the prominent Start action (the one primary call-to-action
 *    pre-start). The lobby mounts it once, inline above its columns, at a slot
 *    its draft and running trees share, so what Start returned (its warning
 *    above all) is still shown after the page re-renders into the running
 *    board.
 *  - "menu": the settings the header cogwheel opens, branched by status —
 *    draft gets schedule / invite + share link / flow / delete; a running
 *    tasting gets finish / delete (an OPEN one keeps invite + share link).
 *
 * Setup props are optional so the cogwheel can render either state.
 */
export function HostControls({
  tastingId,
  status,
  scheduledAt = null,
  friends = [],
  sequentialGuessing = false,
  showSequentialToggle = false,
  leaderboardReveal = "PER_ATTRIBUTE",
  showLeaderboardToggle = false,
  timingMode,
  revealMode,
  wineSource,
  unrevealedGlasses = [],
  shareLinkActive = true,
  surface,
}: {
  tastingId: string;
  status: string;
  scheduledAt?: string | null;
  friends?: { id: string; display_name: string; email: string }[];
  sequentialGuessing?: boolean;
  showSequentialToggle?: boolean;
  leaderboardReveal?: string;
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
  /** Glasses whose answers ending the tasting would leave hidden, in list
      order — the End confirm names them (reveal-4). */
  unrevealedGlasses?: readonly UnrevealedGlass[];
  /** The menu's share link fetches only once this is true. HostControlsMenu
      passes whether its keep-mounted popover has been opened, so a page view
      that never opens the menu never calls `ensure_join_code`. */
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
  // A Start result belongs to the run it started. Finish (in the menu)
  // re-renders this same mounted surface as CLOSED; from then on the result
  // stays hidden, so a later Reopen doesn't bring back a stale warning.
  const [startResultRetired, setStartResultRetired] = useState(false);
  const [finishState, finishAction, finishPending] = useActionState(
    finishTasting,
    null,
  );
  const [reopenState, reopenAction, reopenPending] = useActionState(
    reopenTasting,
    null,
  );
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    updateSchedule,
    null,
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteToTasting,
    null,
  );

  // Controlled, like the create sheet's setup step: the datetime-local value
  // is the host's wall-clock time, converted to ISO on the client so the
  // server never guesses the zone (updateSchedule prefers `scheduled_at_iso`).
  const [schedule, setSchedule] = useState(() => isoToLocal(scheduledAt ?? null));
  // Re-seed from the prop when the server value changes (after a save), the
  // adjust-state-during-render way rather than a setState in an effect.
  const [seenScheduledAt, setSeenScheduledAt] = useState(scheduledAt ?? null);
  if ((scheduledAt ?? null) !== seenScheduledAt) {
    setSeenScheduledAt(scheduledAt ?? null);
    setSchedule(isoToLocal(scheduledAt ?? null));
  }

  if (status === "CLOSED" && startState !== null && !startResultRetired) {
    setStartResultRetired(true);
  }

  const notStarted = status === "DRAFT";

  const deleteForm = (
    <form
      action={deleteTasting}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Delete this tasting for everyone? This can't be undone.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tasting_id" value={tastingId} />
      <Button
        type="submit"
        variant="destructive"
        className="w-full justify-start gap-1.5"
      >
        <Trash2 className="size-4" /> Delete tasting
      </Button>
    </form>
  );

  const inviteForm = (
    <form action={inviteAction} className="flex flex-col gap-2">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <Label className="flex items-center gap-1.5">
        <UserPlus className="size-4" /> Invite more people
      </Label>
      <InviteField friends={friends} />
      <Button
        type="submit"
        variant="outline"
        disabled={invitePending}
        className="w-fit"
      >
        {invitePending ? "Sending…" : "Send invites"}
      </Button>
      <StateMessage state={inviteState} />
    </form>
  );

  // Draft lobby's one primary action, inline above the lobby's columns. Never
  // gated on a wine count, and an incomplete glass never blocks it: the
  // server's error shows under the button, and so does a success's warning.
  if (surface === "start") {
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

  // surface === "menu": the header cogwheel's settings, branched by status.
  return (
    <div className="flex flex-col gap-4">
      {notStarted ? (
        <>
          <form action={scheduleAction} className="flex flex-col gap-2">
            <input type="hidden" name="tasting_id" value={tastingId} />
            <Label
              htmlFor="scheduled_at_edit"
              className="flex items-center gap-1.5"
            >
              <CalendarClock className="size-4" /> Date &amp; time
            </Label>
            <div className="flex gap-2">
              <input
                type="hidden"
                name="scheduled_at_iso"
                value={localToIso(schedule) ?? ""}
              />
              <Input
                id="scheduled_at_edit"
                name="scheduled_at"
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={schedulePending}>
                {schedulePending ? "Saving…" : "Save"}
              </Button>
            </div>
            <StateMessage state={scheduleState} />
          </form>

          {inviteForm}
          {/* create-2: the share link beside "Invite more people". B4/Q6:
              it works until the tasting ends. */}
          <JoinLinkRow tastingId={tastingId} active={shareLinkActive} />

          {showSequentialToggle ? (
            <form action={setSequentialGuessing} className="flex flex-col gap-2">
              <input type="hidden" name="tasting_id" value={tastingId} />
              <input
                type="hidden"
                name="enabled"
                value={String(!sequentialGuessing)}
              />
              <Label className="flex items-center gap-1.5">
                <ListOrdered className="size-4" /> Flow —{" "}
                {sequentialGuessing ? "Guided" : "Free"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {sequentialGuessing
                  ? "Guided — everyone tastes the same wine together; reveal a wine to open the next."
                  : "Free — participants can guess any wine in any order."}
              </p>
              <Button type="submit" variant="outline" className="w-fit">
                {sequentialGuessing ? "Switch to Free" : "Switch to Guided"}
              </Button>
            </form>
          ) : null}

          {showLeaderboardToggle ? (
            <form action={setLeaderboardReveal} className="flex flex-col gap-2">
              <input type="hidden" name="tasting_id" value={tastingId} />
              <input
                type="hidden"
                name="value"
                value={
                  leaderboardReveal === "PER_WINE"
                    ? "PER_ATTRIBUTE"
                    : "PER_WINE"
                }
              />
              <Label className="flex items-center gap-1.5">
                <Trophy className="size-4" /> Leaderboard —{" "}
                {leaderboardReveal === "PER_WINE"
                  ? "After the full wine"
                  : "After each attribute"}
              </Label>
              <p className="text-xs text-muted-foreground">
                When the standings move during a progressive reveal — after
                every attribute, or only once the whole wine is revealed.
              </p>
              <Button type="submit" variant="outline" className="w-fit">
                {leaderboardReveal === "PER_WINE"
                  ? "Switch to after each attribute"
                  : "Switch to after the full wine"}
              </Button>
            </form>
          ) : null}
        </>
      ) : status === "IN_PROGRESS" ? (
        <>
          {/* B4/Q6: invites and the share link stay open for every tasting
              that is not CLOSED — a running tasting keeps both here too. */}
          {inviteForm}
          <JoinLinkRow tastingId={tastingId} active={shareLinkActive} />
          <form
            action={finishAction}
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              // reveal-4: ending is reversible, so the confirm never says it
              // can't be undone — it names the glasses left hidden instead.
              if (!window.confirm(endTastingConfirm(unrevealedGlasses))) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="tasting_id" value={tastingId} />
            <p className="text-sm text-muted-foreground">
              Finish when you&apos;re done to close guessing and move it to
              History.
            </p>
            <Button
              type="submit"
              variant="outline"
              disabled={finishPending}
              className="w-full justify-start gap-1.5"
            >
              {finishPending ? (
                <>
                  <WineGlassLoader /> Finishing…
                </>
              ) : (
                <>
                  <Flag className="size-4" /> Finish tasting
                </>
              )}
            </Button>
            <StateMessage state={finishState} />
          </form>
        </>
      ) : (
        <form action={reopenAction} className="flex flex-col gap-2">
          <input type="hidden" name="tasting_id" value={tastingId} />
          <p className="text-sm text-muted-foreground">
            This tasting is finished. Reopen it to add wines or keep tasting —
            all guesses and scores stay intact.
          </p>
          <Button
            type="submit"
            variant="outline"
            disabled={reopenPending}
            className="w-full justify-start gap-1.5"
          >
            {reopenPending ? (
              <>
                <WineGlassLoader /> Reopening…
              </>
            ) : (
              <>
                <Play className="size-4" /> Reopen tasting
              </>
            )}
          </Button>
          <StateMessage state={reopenState} />
        </form>
      )}
      {deleteForm}
    </div>
  );
}
