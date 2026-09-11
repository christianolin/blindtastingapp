import { EyeOff } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { ActionButtonClient } from "@/components/overview/action-button-client";
import { LinkPill } from "@/components/overview/link-pill";
import { StatTrio } from "@/components/overview/stat-trio";
import {
  CardEmptyRow,
  CardRow,
  SubjectCard,
} from "@/components/overview/subject-card";
import { ordinal } from "@/lib/stats-math";
import type { OverviewTastings, TastingRow } from "@/lib/overview-types";
import { InvitationRows, type InviteRow } from "./invitation-row";

type OtherRow = Exclude<TastingRow, InviteRow>;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "{d Mon}" for a finished tasting. Day granularity, so the viewer's
// timezone barely matters and a fixed UTC render keeps server and client
// text identical (LocalDateTime is for the scheduled timestamps).
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const isInvite = (row: TastingRow): row is InviteRow => row.kind === "invite";
const isOther = (row: TastingRow): row is OtherRow => row.kind !== "invite";

/**
 * The Blind tastings card: headline stats from the profile, then the rows in
 * the data module's order (invitations → drafts I host → self-paced →
 * finished, at most five), then the gold "Start a blind tasting" launcher.
 * Below `md` only the first row is visible.
 */
export function TastingsCard({ data }: { data: OverviewTastings }) {
  const invites = data.rows.filter(isInvite);
  const others = data.rows.filter(isOther);

  // StatTrio takes plain-string labels, so the phone's shorter "region hits"
  // label needs its own trio rather than a responsive span.
  const stats = (regionLabel: string) => [
    { value: data.tastings, label: "tastings" },
    { value: data.averagePoints.toFixed(1), label: "avg points" },
    {
      value: data.regionHitPct === null ? "—" : `${data.regionHitPct}%`,
      label: regionLabel,
    },
  ];

  return (
    <SubjectCard
      title="Blind tastings"
      // Never compress below the header + one row + action on phones: the
      // page root scrolls instead of the card clipping its button.
      className="max-md:min-h-fit"
      pill={<LinkPill href="/taste?tab=history">History</LinkPill>}
      stats={
        <>
          <StatTrio stats={stats("region hit rate")} className="max-md:hidden" />
          <StatTrio stats={stats("region hits")} className="md:hidden" />
        </>
      }
      action={
        <ActionButtonClient launch="taste-blind" variant="gold">
          <EyeOff />
          Start a blind tasting
        </ActionButtonClient>
      }
    >
      {data.rows.length === 0 ? (
        <CardEmptyRow>No tastings yet — start one below.</CardEmptyRow>
      ) : (
        <>
          <InvitationRows invites={invites} />
          {others.map((row, i) => (
            <TastingRowView
              key={row.tastingId}
              row={row}
              className={invites.length > 0 || i > 0 ? "max-md:hidden" : undefined}
            />
          ))}
        </>
      )}
    </SubjectCard>
  );
}

function TastingRowView({ row, className }: { row: OtherRow; className?: string }) {
  const href = `/tastings/${row.tastingId}`;
  switch (row.kind) {
    case "hosting":
      return (
        <CardRow
          href={href}
          title={row.name}
          className={className}
          meta={
            <>
              Hosting ·{" "}
              {row.scheduledAt ? (
                <>
                  <LocalDateTime iso={row.scheduledAt} /> ·{" "}
                </>
              ) : null}
              {row.detail}
            </>
          }
        />
      );
    case "self-paced":
      return (
        <CardRow href={href} title={row.name} meta={row.detail} className={className} />
      );
    case "finished":
      return (
        <CardRow
          href={href}
          title={row.name}
          className={className}
          meta={`${shortDate(row.finishedAt)} · finished`}
          value={
            row.placement ? (
              <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">
                {ordinal(row.placement.rank)} · {row.placement.points}
              </span>
            ) : null
          }
        />
      );
  }
}
