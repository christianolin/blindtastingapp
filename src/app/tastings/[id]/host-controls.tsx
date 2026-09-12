"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
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
      <p className="text-sm text-[#3f5b42]">{state.success}</p>
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
 *  - "start": just the prominent Start action, rendered inline in the draft
 *    lobby's main column (the one primary call-to-action pre-start).
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
  invitesStayOpen = false,
  timingMode,
  revealMode,
  wineSource,
  unrevealedGlasses = [],
  surface,
}: {
  tastingId: string;
  status: string;
  scheduledAt?: string | null;
  /** Not read: Start has no wine-count gate (blind-tasting ledger B0). Still
      accepted so existing callers type-check; they can stop passing it. */
  wineCount?: number;
  friends?: { id: string; display_name: string; email: string }[];
  sequentialGuessing?: boolean;
  showSequentialToggle?: boolean;
  leaderboardReveal?: string;
  showLeaderboardToggle?: boolean;
  /** OPEN tastings keep the invite field and the share link in the running
      menu too (`join_tasting_by_code` still accepts them). */
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
  // Wrapped rather than a `useEffect` on the returned state: the action's
  // `revalidatePath` swaps in the started lobby, which no longer renders this
  // "start" surface — an effect on an unmounting component may never run,
  // whereas pushing as soon as the action resolves always does.
  const [startState, startAction, startPending] = useActionState(
    async (prev: LobbyActionState, formData: FormData) => {
      const result = await startTasting(prev, formData);
      if (result && "success" in result && landsOnConsole) {
        router.push(`/tastings/${tastingId}/host`);
      }
      return result;
    },
    null,
  );
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

  // Draft lobby's one primary action, rendered inline in the main column.
  // Never gated on a wine count, and an incomplete glass never blocks it: the
  // server's error shows under the button, and so does a success's warning.
  if (surface === "start") {
    if (!notStarted) {
      // A started tasting has no Start; a warning from the Start that got it
      // there keeps showing for as long as this surface stays mounted.
      return startState && "success" in startState && startState.warning ? (
        <div className="flex flex-col gap-2">
          <StateMessage state={startState} />
        </div>
      ) : null;
    }
    return (
      <form action={startAction} className="flex flex-col gap-2">
        <input type="hidden" name="tasting_id" value={tastingId} />
        <Button
          type="submit"
          size="lg"
          disabled={startPending}
          className="w-full gap-1.5 sm:w-fit"
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
          {/* create-2: the share link beside "Invite more people". Only an
              OPEN tasting's link keeps working once it has started. */}
          <JoinLinkRow tastingId={tastingId} worksUntilStart={!invitesStayOpen} />

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
          {invitesStayOpen ? (
            <>
              {inviteForm}
              <JoinLinkRow tastingId={tastingId} worksUntilStart={false} />
            </>
          ) : null}
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
