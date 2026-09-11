"use client";

import { useOptimistic, useTransition } from "react";
import { respondToInvite } from "@/app/tastings/[id]/actions";
import { LocalDateTime } from "@/components/local-date-time";
import { CardRow } from "@/components/overview/subject-card";
import type { TastingRow } from "@/lib/overview-types";
import { cn } from "@/lib/utils";

export type InviteRow = Extract<TastingRow, { kind: "invite" }>;

// The inline Accept / Decline pair. Visually 30px tall like the mockup; on
// phones an invisible ::after pad stretches the hit area to 44px so the tap
// target rule holds without making the row taller.
const BUTTON =
  "relative shrink-0 rounded-[7px] py-[7px] text-[12px] font-semibold transition-colors max-md:py-1.5 max-md:text-[11.5px] max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-['']";

/**
 * The pending-invitation rows of the Blind tastings card. Owns the optimistic
 * list: a click removes the row at once and calls respondToInvite (which
 * revalidates /overview, so the server re-renders the card with the tasting
 * moved to wherever it now belongs). Below `md` only the first row shows and
 * only Accept is offered, per the phone mockup.
 */
export function InvitationRows({ invites }: { invites: InviteRow[] }) {
  const [rows, dismiss] = useOptimistic(
    invites,
    (state: InviteRow[], tastingId: string) =>
      state.filter((row) => row.tastingId !== tastingId),
  );
  const [, startTransition] = useTransition();

  function respond(tastingId: string, response: "accept" | "decline") {
    startTransition(async () => {
      dismiss(tastingId);
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("response", response);
      await respondToInvite(fd);
    });
  }

  return (
    <>
      {rows.map((row, i) => (
        <CardRow
          key={row.tastingId}
          title={row.name}
          meta={
            <>
              {row.hostName} ·{" "}
              {row.scheduledAt ? (
                <LocalDateTime iso={row.scheduledAt} />
              ) : (
                "date to be set"
              )}
            </>
          }
          className={i > 0 ? "max-md:hidden" : undefined}
          actions={
            <>
              <button
                type="button"
                onClick={() => respond(row.tastingId, "accept")}
                className={cn(
                  BUTTON,
                  "bg-primary px-[13px] text-primary-foreground hover:bg-[#4A1523] max-md:px-[11px]",
                )}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => respond(row.tastingId, "decline")}
                className={cn(
                  BUTTON,
                  "border border-border px-[11px] text-muted-foreground hover:border-gold hover:text-foreground max-md:hidden",
                )}
              >
                Decline
              </button>
            </>
          }
        />
      ))}
    </>
  );
}
