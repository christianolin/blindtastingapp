"use client";

import Link from "next/link";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { respondToInvite } from "@/app/tastings/[id]/actions";
import { CardRow } from "@/components/overview/subject-card";
import { cn } from "@/lib/utils";

/**
 * One pending invitation as a compact row: data plus two ReactNode slots
 * (the leading thumb and the meta line), so the caller decides the words —
 * the All tastings band and, later, B3's Overview card.
 */
export type InvitationRowData = {
  tastingId: string;
  name: string;
  /** Where the row leads (the lobby, whose invite card also offers Decline). */
  href?: string;
  /** Leading thumb, e.g. the host's avatar. */
  thumb?: ReactNode;
  /** The meta line under the name. */
  meta?: ReactNode;
};

export type InvitationResponse = "accept" | "decline";

/**
 * The button words, always from the caller's dictionary (EN + DA through
 * makeT) — the component carries no copy of its own. Compact rows say Accept
 * / Decline (ledger Q5).
 */
export type InvitationLabels = { accept: string; decline: string };

// The inline Accept / Decline pair. Visually 30px tall like the mockup; on
// phones an invisible ::after pad stretches the hit area to 44px so the tap
// target rule holds without making the row taller. `relative` also lifts the
// buttons above the row's stretched link.
const BUTTON =
  "relative shrink-0 rounded-[7px] py-[7px] text-[12px] font-semibold transition-colors max-md:py-1.5 max-md:text-[11.5px] max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-['']";

/**
 * The Overview card's respond() pattern as a hook (ledger R5 / blind B3): a
 * click removes the invitation from `rows` at once and calls the existing
 * respondToInvite action, which revalidates /taste, /overview and the lobby,
 * so the server re-renders with the tasting wherever it now belongs. A
 * refused response (a CLOSED tasting) simply comes back on that re-render.
 * The caller renders `rows`, so anything derived from them — a band's
 * "{n} invitations" header — shrinks in the same frame.
 */
export function useInvitationResponses<T extends { tastingId: string }>(invites: T[]) {
  const [rows, dismiss] = useOptimistic(invites, (state: T[], tastingId: string) =>
    state.filter((row) => row.tastingId !== tastingId),
  );
  const [, startTransition] = useTransition();

  function respond(tastingId: string, response: InvitationResponse) {
    startTransition(async () => {
      dismiss(tastingId);
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("response", response);
      await respondToInvite(fd);
    });
  }

  return { rows, respond };
}

/**
 * One invitation on the Overview's CardRow: thumb, name, meta, Accept and
 * Decline. With an `href` the whole row leads there through a stretched link
 * (the buttons sit above it), which also gives the name a full-row tap target
 * on phones. `phoneAcceptOnly` hides Decline below `md`; the lobby behind the
 * row still offers it.
 */
export function InvitationRow({
  row,
  onRespond,
  labels,
  phoneAcceptOnly = false,
  className,
}: {
  row: InvitationRowData;
  onRespond: (tastingId: string, response: InvitationResponse) => void;
  labels: InvitationLabels;
  phoneAcceptOnly?: boolean;
  className?: string;
}) {
  return (
    <CardRow
      thumb={row.thumb}
      title={
        row.href ? (
          <Link
            href={row.href}
            className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-primary"
          >
            {row.name}
          </Link>
        ) : (
          row.name
        )
      }
      meta={row.meta}
      className={cn(row.href && "relative transition-colors hover:bg-background", className)}
      actions={
        <>
          <button
            type="button"
            onClick={() => onRespond(row.tastingId, "accept")}
            className={cn(
              BUTTON,
              "bg-primary px-[13px] text-primary-foreground hover:bg-[#4A1523] max-md:px-[11px]",
            )}
          >
            {labels.accept}
          </button>
          <button
            type="button"
            onClick={() => onRespond(row.tastingId, "decline")}
            className={cn(
              BUTTON,
              "border border-border bg-card px-[11px] text-muted-foreground hover:border-gold hover:text-foreground",
              phoneAcceptOnly && "max-md:hidden",
            )}
          >
            {labels.decline}
          </button>
        </>
      }
    />
  );
}

/**
 * A plain list of invitation rows owning its own optimistic state — for a
 * surface that has nothing else to update when a row goes. `phoneFirstRowOnly`
 * is the Overview card's "exactly one row on phones" rule.
 */
export function InvitationRows({
  invites,
  labels,
  phoneAcceptOnly = false,
  phoneFirstRowOnly = false,
  className,
}: {
  invites: InvitationRowData[];
  labels: InvitationLabels;
  phoneAcceptOnly?: boolean;
  phoneFirstRowOnly?: boolean;
  className?: string;
}) {
  const { rows, respond } = useInvitationResponses(invites);
  return (
    <>
      {rows.map((row, i) => (
        <InvitationRow
          key={row.tastingId}
          row={row}
          onRespond={respond}
          labels={labels}
          phoneAcceptOnly={phoneAcceptOnly}
          className={cn(phoneFirstRowOnly && i > 0 && "max-md:hidden", className)}
        />
      ))}
    </>
  );
}
