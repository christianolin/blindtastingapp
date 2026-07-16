"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Trash2,
  Play,
  CalendarClock,
  UserPlus,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { InviteField } from "@/app/tastings/new/invite-field";
import {
  startTasting,
  updateSchedule,
  inviteToTasting,
  deleteTasting,
  setSequentialGuessing,
  type LobbyActionState,
} from "./actions";

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function StateMessage({ state }: { state: LobbyActionState }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="text-sm text-destructive">{state.error}</p>;
  return <p className="text-sm text-[#3f5b42]">{state.success}</p>;
}

export function HostControls({
  tastingId,
  status,
  scheduledAt,
  wineCount,
  friends,
  sequentialGuessing,
  showSequentialToggle,
}: {
  tastingId: string;
  status: string;
  scheduledAt: string | null;
  wineCount: number;
  friends: { id: string; display_name: string; email: string }[];
  sequentialGuessing: boolean;
  showSequentialToggle: boolean;
}) {
  const notStarted = status === "DRAFT";

  const [startState, startAction, startPending] = useActionState(
    startTasting,
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

  const scheduleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (scheduleRef.current && scheduledAt) {
      scheduleRef.current.value = isoToLocalInput(scheduledAt);
    }
  }, [scheduledAt]);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">Host controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {notStarted ? (
          <>
            <form action={startAction} className="flex flex-col gap-2">
              <input type="hidden" name="tasting_id" value={tastingId} />
              <p className="text-sm text-muted-foreground">
                The tasting hasn&apos;t started. Add wines and invite people,
                then start it to open guessing.
              </p>
              <Button
                type="submit"
                disabled={startPending || wineCount < 1}
                className="w-fit gap-1.5"
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
              {wineCount < 1 ? (
                <p className="text-xs text-muted-foreground">
                  Add at least one wine first.
                </p>
              ) : null}
              <StateMessage state={startState} />
            </form>

            <form action={scheduleAction} className="flex flex-col gap-2">
              <input type="hidden" name="tasting_id" value={tastingId} />
              <Label
                htmlFor="scheduled_at_edit"
                className="flex items-center gap-1.5"
              >
                <CalendarClock className="size-4" /> Date &amp; time
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={scheduleRef}
                  id="scheduled_at_edit"
                  name="scheduled_at"
                  type="datetime-local"
                />
                <Button type="submit" variant="outline" disabled={schedulePending}>
                  {schedulePending ? "Saving…" : "Save"}
                </Button>
              </div>
              <StateMessage state={scheduleState} />
            </form>

            <form action={inviteAction} className="flex flex-col gap-3">
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This tasting has started. Invitations are closed.
          </p>
        )}

        {showSequentialToggle ? (
          <form action={setSequentialGuessing} className="flex flex-col gap-2">
            <input type="hidden" name="tasting_id" value={tastingId} />
            <input
              type="hidden"
              name="enabled"
              value={String(!sequentialGuessing)}
            />
            <Label className="flex items-center gap-1.5">
              <ListOrdered className="size-4" /> One wine at a time
            </Label>
            <p className="text-sm text-muted-foreground">
              {sequentialGuessing
                ? "On — participants guess in the serving order; reveal a wine to open the next."
                : "Off — participants can guess any wine in any order."}
            </p>
            <Button type="submit" variant="outline" className="w-fit">
              {sequentialGuessing ? "Turn off" : "Turn on"}
            </Button>
          </form>
        ) : null}

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
          <Button type="submit" variant="destructive" className="gap-1.5">
            <Trash2 className="size-4" /> Delete tasting
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
