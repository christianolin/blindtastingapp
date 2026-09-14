"use client";

import { LocalDateTime } from "@/components/local-date-time";
import {
  InvitationRows as SharedInvitationRows,
  type InvitationRowData,
} from "@/components/tastings/invitation-row";
import type { TastingRow } from "@/lib/overview-types";

export type InviteRow = Extract<TastingRow, { kind: "invite" }>;

function toRow(row: InviteRow): InvitationRowData {
  return {
    tastingId: row.tastingId,
    name: row.name,
    // OD-6(a) / GUEST-16's phone clause: the row must lead somewhere on
    // phones, where Decline is hidden and Accept alone would mean accepting
    // blind — so the whole row (not just the buttons) is a stretched link to
    // the invitation's own page (S5), same as every other tasting row in
    // this card. Desktop keeps both buttons inline; a click that misses them
    // now also opens the tasting, which matches how this card's other rows
    // (hosting / self-paced / finished) already behave.
    href: `/tastings/${row.tastingId}`,
    meta: (
      <>
        {row.hostName} ·{" "}
        {row.scheduledAt ? <LocalDateTime iso={row.scheduledAt} /> : "date to be set"}
      </>
    ),
  };
}

/**
 * The pending-invitation rows of the Blind tastings card. Thin wrapper around
 * the shared InvitationRows (src/components/tastings/invitation-row.tsx,
 * already built for this exact shape by the /taste invitations band): it
 * owns the optimistic list itself, so a click removes the row at once and
 * calls respondToInvite (which revalidates /overview, moving the tasting to
 * wherever it now belongs). Below `md` only the first row shows and only
 * Accept is offered, per the phone mockup.
 */
export function InvitationRows({ invites }: { invites: InviteRow[] }) {
  return (
    <SharedInvitationRows
      invites={invites.map(toRow)}
      labels={{ accept: "Accept", decline: "Decline" }}
      phoneAcceptOnly
      phoneFirstRowOnly
    />
  );
}
