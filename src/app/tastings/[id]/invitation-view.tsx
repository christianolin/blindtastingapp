import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocalDateTime } from "@/components/local-date-time";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Avatar } from "@/components/ui/avatar";
import { getInvitation } from "@/lib/invitation-data";
import {
  BRING_A_GLASS,
  HOW_IT_IS_SCORED,
  INVITATION_TITLE,
  SCORING_ROWS,
  hostRecordLine,
  invitedYouLine,
  joinedNamesLine,
  modeChip,
  scoringSentence,
} from "@/lib/invitation-copy";
import { glassesSoFarPhrase } from "@/lib/tasting-eyebrow";
import { InvitationActionsBar, InvitationDayPhrase } from "./invitation-actions-bar";

// The phone invitation (S5) — and, at wider widths, the same page as a
// 560px centred column rather than a second layout (spec §4.3 item 2). Reached
// through page.tsx → routeTastingView for an INVITED, non-host viewer of a
// DRAFT or IN_PROGRESS tasting (a CLOSED one's INVITED viewer lands on
// finished-view.tsx's "has finished" card instead, unchanged by this task).
// AutoRefresh mounts here too (refinement 17): Start, or a new arrival's
// joined-names line, should show up without a manual reload, the same as the
// guest lobby it leads to.
export async function InvitationView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const invitation = await getInvitation(tastingId);
  if (!invitation) return null;

  const scoring = scoringSentence(invitation.revealMode, invitation.host.name);
  const joined = joinedNamesLine(invitation.joinedNames);

  return (
    <div className="flex flex-1 justify-center bg-background">
      <AutoRefresh />
      <div className="flex w-full flex-col gap-6 p-4 pb-8 md:max-w-[560px] md:gap-7 md:p-10">
        <header className="flex items-center gap-3">
          <Link
            href="/overview"
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </Link>
          <Eyebrow size="md">{INVITATION_TITLE}</Eyebrow>
        </header>

        <div className="flex items-center gap-3">
          <Avatar src={invitation.host.avatarUrl} name={invitation.host.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {invitedYouLine(invitation.host.name)}
            </p>
            <p className="truncate text-[12.5px] text-muted-foreground">
              {hostRecordLine(invitation.host.hostedCount, invitation.host.averagePoints)}
            </p>
          </div>
        </div>

        <h1 className="font-heading text-[30px] leading-[1.08] font-semibold md:text-[36px]">
          {invitation.name}
        </h1>

        <div className="flex flex-wrap gap-2">
          <Chip>{modeChip(invitation.revealMode)}</Chip>
          <Chip>{glassesSoFarPhrase(invitation.glassCount)}</Chip>
          <Chip>{invitation.flow}</Chip>
        </div>

        <div className="flex flex-col gap-3 rounded-[13px] border border-border-strong bg-card p-[16px_18px]">
          <p className="text-[14px] font-semibold">
            {invitation.scheduledAt ? (
              <>
                <LocalDateTime iso={invitation.scheduledAt} format="card" />
                {" · "}
                <InvitationDayPhrase iso={invitation.scheduledAt} />
              </>
            ) : (
              "Not scheduled yet"
            )}
          </p>
          {invitation.place ? (
            <p className="text-[13px] text-muted-foreground">{invitation.place}</p>
          ) : null}
          {joined ? (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {invitation.joinedNames.slice(0, 5).map((name, i) => (
                  <Avatar
                    key={`${name}-${i}`}
                    name={name}
                    size="sm"
                    className="ring-2 ring-card"
                  />
                ))}
              </div>
              <span className="text-[12.5px] text-muted-foreground">{joined}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 rounded-[13px] border border-border p-[16px_18px]">
          <span className="text-[13px] font-semibold">{HOW_IT_IS_SCORED}</span>
          {invitation.revealMode === "BLIND" ? (
            <ul className="flex flex-col gap-1">
              {SCORING_ROWS.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between text-[13px] text-foreground"
                >
                  <span>{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.points}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {scoring ? <p className="text-[12.5px] text-muted-foreground">{scoring}</p> : null}
        </div>

        <p className="text-[13px] text-muted-foreground">{BRING_A_GLASS}</p>

        <InvitationActionsBar tastingId={tastingId} />
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-card px-[11px] py-[5px] text-[11.5px] font-semibold text-foreground">
      {children}
    </span>
  );
}
