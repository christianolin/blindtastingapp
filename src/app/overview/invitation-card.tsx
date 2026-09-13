"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { useInvitationResponses } from "@/components/tastings/invitation-row";
import {
  CANT_MAKE_IT,
  I_AM_IN,
  hostRecordLine,
  invitationCardEyebrow,
  invitedYouLine,
  joinedNamesLine,
  modeChip,
  overviewScoringLine,
} from "@/lib/invitation-copy";
import type { InvitationData } from "@/lib/invitation-data";
import { eyebrowDayPhrase } from "@/lib/relative-day";
import { glassesSoFarPhrase } from "@/lib/tasting-eyebrow";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

// The inline Accept / Decline pair, sized like every other Overview
// action-row button (invitation-row.tsx, overview/invitation-row.tsx carry
// the same small constant under their own names — this card is a fourth,
// standalone surface, not a row inside one of those lists).
const BUTTON =
  "flex min-h-11 flex-1 items-center justify-center rounded-[9px] py-[9px] text-[12.5px] font-semibold transition-colors md:min-h-0";

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="truncate rounded-full border border-border bg-background px-[10px] py-[4px] text-[11px] font-semibold text-foreground">
      {children}
    </span>
  );
}

/**
 * The card's own eyebrow, "Invitation · 2 days away" (S5b) — local-calendar
 * arithmetic against `new Date()`, so it renders the day-less "Invitation"
 * until the client hydrates (LocalDateTime's own neutral-first-paint shape).
 */
function CardEyebrow({ scheduledAt }: { scheduledAt: string | null }) {
  const phrase = useSyncExternalStore(
    noopSubscribe,
    () => (scheduledAt ? eyebrowDayPhrase(new Date(scheduledAt), new Date()) : null),
    () => null,
  );
  return <>{invitationCardEyebrow(phrase)}</>;
}

/**
 * The laptop Overview card (S5b, spec §4.3 item 3; ledger B3): the same
 * invitation as invitation-view.tsx's page, laid wide as a card above the
 * banner instead. Fully client — `invitation` arrives already resolved from
 * the server (getOverviewInvitation, called once in page.tsx) as a plain
 * prop, so the day phrase and the optimistic Accept/Decline both just work
 * without a nested server/client split of their own. `useInvitationResponses`
 * is the same hook the Blind tastings card's own invitation rows use
 * (src/components/tastings/invitation-row.tsx): a click dismisses this card
 * at once and calls the existing `respondToInvite`, which revalidates
 * /overview so the real re-render either drops the card (declined) or moves
 * the tasting to the guest lobby (accepted).
 */
export function OverviewInvitationCard({ invitation }: { invitation: InvitationData }) {
  const { rows, respond } = useInvitationResponses([{ tastingId: invitation.tastingId }]);
  if (rows.length === 0) return null;

  const joined = joinedNamesLine(invitation.joinedNames);
  const scoring = overviewScoringLine(invitation.revealMode);
  const metaLine = [joined, scoring].filter((part): part is string => Boolean(part)).join(" · ");

  return (
    <section className="flex flex-col gap-3 rounded-[13px] border border-gold bg-card p-[16px_18px]">
      <Eyebrow size="sm" className="text-gold-dark">
        <CardEyebrow scheduledAt={invitation.scheduledAt} />
      </Eyebrow>

      <div className="flex items-start gap-3">
        <HatchThumb src={invitation.imageUrl} width={52} height={52} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[12px] text-muted-foreground">
            {invitedYouLine(invitation.host.name)} ·{" "}
            {hostRecordLine(invitation.host.hostedCount, null)}
          </p>
          <h3 className="truncate font-heading text-[21px] leading-tight font-semibold">
            {invitation.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip>{modeChip(invitation.revealMode)}</Chip>
        <Chip>{glassesSoFarPhrase(invitation.glassCount)}</Chip>
        <Chip>{invitation.flow}</Chip>
        {invitation.scheduledAt ? (
          <Chip>
            <LocalDateTime iso={invitation.scheduledAt} format="eyebrow-short" />
          </Chip>
        ) : null}
        {invitation.place ? <Chip>{invitation.place}</Chip> : null}
      </div>

      {metaLine ? <p className="text-[12px] text-muted-foreground">{metaLine}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond(invitation.tastingId, "accept")}
          className={cn(BUTTON, "bg-primary text-primary-foreground hover:bg-primary-hover")}
        >
          {I_AM_IN}
        </button>
        <button
          type="button"
          onClick={() => respond(invitation.tastingId, "decline")}
          className={cn(
            BUTTON,
            "border border-border bg-background text-muted-foreground hover:border-gold hover:text-foreground",
          )}
        >
          {CANT_MAKE_IT}
        </button>
      </div>
    </section>
  );
}
