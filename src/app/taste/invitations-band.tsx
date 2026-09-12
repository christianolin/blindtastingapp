"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { Eyebrow } from "@/components/overview/eyebrow";
import {
  InvitationRow,
  useInvitationResponses,
  type InvitationRowData,
} from "@/components/tastings/invitation-row";
import { Avatar } from "@/components/ui/avatar";
import { calendarDaysBetween, invitationDayPhrase } from "@/lib/relative-day";
import { modeWord } from "@/lib/tasting-eyebrow";
import { makeT } from "@/lib/wset/i18n";
import {
  ARCHIVE_LANG,
  SEPARATOR,
  glassesPhrase,
  hostNameOf,
  invitationWhen,
  type ArchiveTasting,
} from "./taste-archive-math";

const t = makeT(ARCHIVE_LANG);

const noopSubscribe = () => () => {};

// The relative words for a schedule within a week of today ("tomorrow
// 20:00", "in 3 days"), or null when LocalDateTime should print the date.
// Local calendar and zone, so only ever evaluated on the client.
function relativeWhen(iso: string): string | null {
  const when = new Date(iso);
  const now = new Date();
  const { form, withTime } = invitationWhen(calendarDaysBetween(now, when));
  if (form === "full") return null;
  const phrase = invitationDayPhrase(when, now);
  if (!withTime) return phrase;
  return `${phrase} ${when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * An invitation's schedule (ledger R5: invitationDayPhrase | LocalDateTime).
 * The server and the hydration pass have no viewer zone, so they render
 * LocalDateTime (its neutral "Scheduled"); the client then swaps in the
 * relative words, or LocalDateTime's local date for anything further out.
 */
function InvitationWhen({ iso }: { iso: string }) {
  const phrase = useSyncExternalStore(noopSubscribe, () => relativeWhen(iso), () => null);
  return phrase ? <span>{phrase}</span> : <LocalDateTime iso={iso} />;
}

function joinNodes(parts: ReactNode[]): ReactNode {
  return parts
    .filter((part) => part !== "")
    .map((part, i) => (
      <Fragment key={i}>
        {i > 0 ? SEPARATOR : null}
        {part}
      </Fragment>
    ));
}

function toRow(row: ArchiveTasting): InvitationRowData {
  const when = row.scheduledAt ? <InvitationWhen iso={row.scheduledAt} /> : t("date_to_be_set");
  const host = hostNameOf(t, row);
  return {
    tastingId: row.id,
    name: row.name,
    href: `/tastings/${row.id}`,
    // The host's avatar, or its initial; the phone rows draw none.
    thumb: (
      <Avatar src={row.hostAvatarUrl} name={row.hostName} className="size-[34px] max-md:hidden" />
    ),
    meta: (
      <>
        <span className="max-md:hidden">
          {joinNodes([host, when, modeWord(row.revealMode), glassesPhrase(t, row.glassCount)])}
        </span>
        <span className="md:hidden">{joinNodes([host, when])}</span>
      </>
    ),
  };
}

/**
 * The band above the list (ledger R5, T1/T1b): every pending invitation,
 * soonest first, with the host's avatar, the name (the row leads to the
 * lobby), "{host} · {when} · {mode} · {glasses so far}" and inline Accept /
 * Decline — Accept only on phones, where Decline stays on the lobby's invite
 * card. The caption states the real rule: an invitation can be accepted until
 * the tasting ends (respondToInvite refuses CLOSED only), not "until it
 * starts". The band owns the optimistic list, so its count and the band itself
 * go the moment the last invitation is answered.
 *
 * Its gold border and gold-tinted header are what lift it out of the list
 * card below (T1/T1b). The caption shares the eyebrow's line, pushed right, on
 * desktop; T1b's phone band carries the eyebrow alone.
 */
export function InvitationsBand({ invitations }: { invitations: ArchiveTasting[] }) {
  const { rows, respond } = useInvitationResponses(invitations.map(toRow));
  const n = rows.length;
  if (n === 0) return null;

  return (
    <section
      aria-label={t("waiting_on_you_short", { n })}
      className="overflow-hidden rounded-[13px] border border-gold bg-card max-md:rounded-xl"
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border bg-gold/12 p-[10px_18px] max-md:p-[8px_14px]">
        <h2>
          <Eyebrow size="md" className="block text-gold-dark max-md:hidden">
            {n === 1 ? t("waiting_on_you_one") : t("waiting_on_you_many", { n })}
          </Eyebrow>
          <Eyebrow size="md" className="block text-gold-dark md:hidden">
            {t("waiting_on_you_short", { n })}
          </Eyebrow>
        </h2>
        <p className="text-[11.5px] text-muted-foreground max-md:hidden md:ml-auto">
          {t("invitations_close")}
        </p>
      </header>
      <div className="[&>*:last-child]:border-b-0">
        {rows.map((row) => (
          <InvitationRow
            key={row.tastingId}
            row={row}
            onRespond={respond}
            phoneAcceptOnly
            labels={{ accept: t("accept"), decline: t("decline") }}
          />
        ))}
      </div>
    </section>
  );
}
