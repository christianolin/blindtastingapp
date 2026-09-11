import { Wine } from "lucide-react";
import { ActionButtonClient } from "@/components/overview/action-button-client";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { LinkPill } from "@/components/overview/link-pill";
import { StatTrio } from "@/components/overview/stat-trio";
import {
  CardEmptyRow,
  CardRow,
  SubjectCard,
} from "@/components/overview/subject-card";
import { relativeTime } from "@/lib/stats-math";
import type { OverviewRatings, RatingRow } from "@/lib/overview-types";
import { cn } from "@/lib/utils";

// Every rating here is a WSET note; the context is where it was written.
const CONTEXT_LABEL: Record<RatingRow["contextKind"], string> = {
  BLIND: "Blind tasting",
  TRAINING: "Training",
  OPEN: "WSET note",
};

/**
 * The Your ratings card: distinct wines rated / mean score / note count, the
 * five newest notes (thumb, wine, when + context, score), and the bordeaux
 * "Rate a wine" launcher. Below `md` only the newest note is visible.
 */
export function RatingsCard({ data }: { data: OverviewRatings }) {
  const now = new Date();
  return (
    <SubjectCard
      title="Your ratings"
      className="max-md:min-h-fit"
      pill={<LinkPill href="/cellar?tab=notes">All notes</LinkPill>}
      stats={
        <StatTrio
          stats={[
            { value: data.winesRated, label: "wines rated" },
            { value: data.averageScore ?? "—", label: "avg score" },
            { value: data.notes, label: "notes" },
          ]}
        />
      }
      action={
        <ActionButtonClient launch="taste-rate" variant="primary">
          <Wine />
          Rate a wine
        </ActionButtonClient>
      }
    >
      {data.rows.length === 0 ? (
        <CardEmptyRow>No notes yet — rate a wine below.</CardEmptyRow>
      ) : (
        data.rows.map((row, i) => (
          <CardRow
            key={row.noteId}
            href={`/catalog/${row.catalogWineId}`}
            className={cn("gap-[11px]", i > 0 && "max-md:hidden")}
            // 30×40 on desktop, 24×32 on phones — HatchThumb sizes by inline
            // style, so the two densities are two thumbs.
            thumb={
              <>
                <HatchThumb
                  src={row.imageUrl}
                  width={30}
                  height={40}
                  className="max-md:hidden"
                />
                <HatchThumb
                  src={row.imageUrl}
                  width={24}
                  height={32}
                  className="rounded-[3px] md:hidden"
                />
              </>
            }
            title={row.title}
            meta={`${relativeTime(row.tastedOn, now)} · ${CONTEXT_LABEL[row.contextKind]}`}
            value={
              row.score !== null ? (
                <span className="shrink-0 font-heading text-[20px] leading-none font-semibold text-primary lining-nums tabular-nums max-md:text-[17px]">
                  {row.score}
                </span>
              ) : null
            }
          />
        ))
      )}
    </SubjectCard>
  );
}
