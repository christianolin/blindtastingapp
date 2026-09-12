import { Fragment, type ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { LiveDot } from "@/components/overview/live-dot";
import { CardRow } from "@/components/overview/subject-card";
import { cn } from "@/lib/utils";
import { makeT } from "@/lib/wset/i18n";
import {
  ARCHIVE_LANG,
  SEPARATOR,
  placementCopy,
  rowCopy,
  wantsPlacement,
  type ArchivePlacement,
  type ArchiveTasting,
  type MetaPart,
  type PlacementCopy,
} from "./taste-archive-math";

const t = makeT(ARCHIVE_LANG);

// Desktop sets every tasting name in Cormorant 19px (T1); phones keep
// CardRow's 12.5px sans (T1b). The weight is CardRow's 600.
const NAME = "md:font-heading md:text-[19px] md:leading-[1.15]";

// Meta parts joined with " · "; a schedule renders in the viewer's zone.
function MetaLine({ parts }: { parts: MetaPart[] }) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? SEPARATOR : null}
      {typeof part === "string" ? part : <LocalDateTime iso={part.date} />}
    </Fragment>
  ));
}

// The status chip on a running row (map MISSED-12): monospace uppercase at
// the 10px floor; the --live colour with the pulsing dot while a live tasting
// runs, dark gold for a self-paced one in progress. It never shrinks — the
// name beside it truncates instead.
function StatusChip({ live, children }: { live: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px] font-semibold tracking-[.12em] whitespace-nowrap uppercase",
        live ? "border-live/40 bg-live/10 text-live" : "border-gold/60 bg-accent text-gold-dark",
      )}
    >
      {live ? <LiveDot size={6} /> : null}
      {children}
    </span>
  );
}

// A finished row's right-hand value, stacked at every width (T1/T1b): the
// rank in Cormorant — bordeaux, gold-deep for first place — over a 10.5px
// muted points line. "You hosted" is a label rather than a numeral, so it
// stays a quiet sans line.
function PlacingValue({ placing }: { placing: PlacementCopy }) {
  if (placing.tone === "hosted") {
    return (
      <span className="shrink-0 text-[11.5px] font-semibold whitespace-nowrap text-muted-foreground max-md:text-[11px]">
        {placing.rank}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-px text-right lining-nums tabular-nums max-md:gap-0">
      <span
        className={cn(
          "font-heading text-[20px] leading-none font-semibold whitespace-nowrap max-md:text-[17px]",
          placing.tone === "first" ? "text-gold-deep" : "text-primary",
        )}
      >
        {placing.rank}
      </span>
      {placing.detail ? (
        <span className="text-[10.5px] leading-tight whitespace-nowrap text-muted-foreground">
          <span className="max-md:hidden">{placing.detail}</span>
          <span className="md:hidden">{placing.phoneDetail ?? placing.detail}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * One tasting in the All tastings list, on the Overview's CardRow (ledger R5;
 * `tasting-card.tsx` is untouched and unused). A running tasting carries its
 * status chip, a bordeaux tint and a gold action pill; a finished one my
 * placing on the right (`placement` undefined = still loading, null = I did
 * not compete); a draft just its meta line. The whole row is the link — the
 * pill is its label, not a second control — and it goes where the action says.
 */
export function TastingRowView({
  row,
  placement,
}: {
  row: ArchiveTasting;
  placement: ArchivePlacement | null | undefined;
}) {
  const copy = rowCopy(t, row);
  // CardRow truncates its title as one clipped line, which would cut a chip
  // placed after a long name off with the name's end. A chip row lays the
  // two out as a flex row instead (T1/T1b), where only the name shrinks.
  const title = copy.chip ? (
    <span className="flex min-w-0 items-center gap-2 max-md:gap-[7px]">
      <span className={cn("min-w-0 truncate", NAME)}>{row.name}</span>
      <StatusChip live={row.timingMode === "LIVE" && row.status === "IN_PROGRESS"}>
        <span className="max-md:hidden">{copy.chip}</span>
        <span className="md:hidden">{copy.phoneChip ?? copy.chip}</span>
      </StatusChip>
    </span>
  ) : (
    <span className={cn("block truncate", NAME)}>{row.name}</span>
  );
  const meta = (
    <>
      <span className="max-md:hidden">
        <MetaLine parts={copy.meta} />
      </span>
      <span className="md:hidden">
        <MetaLine parts={copy.phoneMeta} />
      </span>
    </>
  );
  // The cover thumb: the tasting's image, or the parchment hatch. T1 draws a
  // 40×52 one on every desktop row; T1b a 30×40 one on the phone's finished
  // rows and none on the running row, whose action pill needs the width.
  const desktopThumb = (
    <HatchThumb src={row.imageUrl} width={40} height={52} className="rounded-[5px] max-md:hidden" />
  );

  if (copy.kind === "running" && copy.action) {
    return (
      <CardRow
        href={copy.href}
        thumb={desktopThumb}
        title={title}
        meta={meta}
        // The pinned row's bordeaux wash (T1/T1b), deepened on hover rather
        // than swapped for the plain rows' parchment hover.
        className="group bg-primary/5 hover:bg-primary/10"
        actions={
          <span className="flex shrink-0 items-center rounded-[9px] bg-gold px-[14px] py-[8px] text-[12.5px] font-bold whitespace-nowrap text-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors group-hover:bg-gold-deep max-md:px-3 max-md:py-[7px] max-md:text-[12px]">
            <span className="max-md:hidden">{copy.action.label}</span>
            <span className="md:hidden">{copy.action.phoneLabel}</span>
          </span>
        }
      />
    );
  }

  const placing = copy.kind === "finished" ? placementCopy(t, row, placement ?? null) : null;
  // Only a row whose placing is actually requested waits for one; a finished
  // tasting with no leaderboard (OPEN) never shows the ellipsis.
  const loading = wantsPlacement(row) && placement === undefined;

  return (
    <CardRow
      href={copy.href}
      thumb={
        <>
          {desktopThumb}
          <HatchThumb src={row.imageUrl} width={30} height={40} className="md:hidden" />
        </>
      }
      title={title}
      meta={meta}
      value={
        placing ? (
          <PlacingValue placing={placing} />
        ) : loading ? (
          <span className="shrink-0 text-[12.5px] text-placeholder" aria-hidden>
            …
          </span>
        ) : null
      }
    />
  );
}
