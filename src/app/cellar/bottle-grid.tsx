"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Star, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtAvg, fmtScore, isLastOne, monthYear, plural, sizeLabel } from "@/lib/cellar/format";
import { rowLines, type RowLines } from "@/lib/cellar/cellar-rows";
import type { BottleRow, GroupKey } from "@/lib/cellar/types";
import { RowActions, type RowCallbacks, type Section } from "./row-actions";

// "1.5 L" from sizeLabel's "1.5 L magnum" — format.ts's SIZE_NAMES suffix
// isn't exported, so the card's magnum meta line (which never wants the
// name, only the number) strips it back off here instead of duplicating
// SIZE_NAMES (CC-P0 owns format.ts; this file may not edit it).
function sizeNoName(ml: number): string {
  return sizeLabel(ml).replace(/ (half|magnum|double magnum)$/, "");
}

function cornerBadge(row: BottleRow): { phone: string; laptop: string } {
  if (row.inFlight > 0) return { phone: "Tonight", laptop: "Tonight" };
  if (isLastOne(row.lot.quantity)) {
    return { phone: String(row.lot.quantity), laptop: "last one" };
  }
  return {
    phone: String(row.lot.quantity),
    laptop: plural(row.lot.quantity, "bottle", "bottles"),
  };
}

// "{producer} · {storage}" — a magnum shows its size instead of the place
// (spec §5.3); storage/producer drop out entirely when either is null.
function laptopMeta(row: BottleRow, l: RowLines): string {
  const magnum = row.lot.bottleSizeMl !== 750;
  const second = magnum ? sizeNoName(row.lot.bottleSizeMl) : l.where;
  const parts = [l.producer, second].filter((v): v is string => v != null);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function SectionHeaderBlock({
  header,
}: {
  header: NonNullable<Section["header"]>;
}): React.JSX.Element {
  return (
    <div className="sticky top-0 z-10 bg-background/95 py-2 backdrop-blur">
      <p className="font-heading text-base font-semibold text-foreground">
        {header.label}
        {header.sublabel ? (
          <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
            · {header.sublabel}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">
        <span className="md:hidden">{header.line.phone}</span>
        <span className="hidden md:inline">{header.line.laptop}</span>
      </p>
    </div>
  );
}

function ImagePanel({
  row,
  badge,
}: {
  row: BottleRow;
  badge: { phone: string; laptop: string };
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "relative flex h-48 items-end justify-center p-3 sm:h-56",
        row.wine.imageUrl ? null : "hatch",
      )}
    >
      {row.wine.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.wine.imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-auto max-w-[80%] object-contain drop-shadow-md"
        />
      ) : (
        <Wine className="size-10 self-center text-muted-foreground/40" />
      )}
      <Badge
        variant="secondary"
        className={cn("absolute top-2 left-2", row.inFlight > 0 && "bg-gold/15 text-gold-dark")}
      >
        <span className="md:hidden">{badge.phone}</span>
        <span className="hidden md:inline">{badge.laptop}</span>
      </Badge>
    </div>
  );
}

function BottleCard({
  row,
  group,
  readOnly,
  cb,
}: {
  row: BottleRow;
  group: GroupKey;
  readOnly: boolean;
  cb: RowCallbacks;
}): React.JSX.Element {
  const l = rowLines(row, group);
  const badge = cornerBadge(row);
  const href = `/catalog/${row.wine.catalogWineId}`;

  // Community + (when not readOnly) Yours foot — shared by every width and
  // every mode; the phone/laptop split is CSS only (md:hidden / md:flex).
  const foot = (
    <>
      <div
        className={cn(
          "mt-1 hidden items-end border-t border-border pt-2 md:flex",
          readOnly ? "justify-end" : "justify-between",
        )}
      >
        {!readOnly ? (
          <div className="flex flex-col gap-0.5">
            {row.yours ? (
              <>
                <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                  Yours
                </span>
                <span className="font-semibold text-primary tabular-nums">
                  {fmtScore(row.yours.score)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {monthYear(row.yours.tastedOn)}
                </span>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => cb.onRate(row.wine.catalogWineId)}>
                Rate it
              </Button>
            )}
          </div>
        ) : null}
        <div className="flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-1 font-semibold text-gold-dark tabular-nums">
            <Star className="size-3.5 text-gold-deep" />
            {row.community.avg != null ? fmtAvg(row.community.avg) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            {plural(row.community.count, "note", "notes")}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground md:hidden">
        {!readOnly ? (
          <span className="font-semibold text-primary">
            {row.yours ? `${fmtScore(row.yours.score)} yours` : "Rate it"}
          </span>
        ) : null}
        {!readOnly ? " · " : null}
        <span className="font-semibold text-gold-dark">
          {row.community.avg != null ? fmtAvg(row.community.avg) : "—"}
        </span>
      </p>
    </>
  );
  const meta = (
    <p className="truncate text-xs text-muted-foreground">
      <span className="md:hidden">{l.producer ?? "—"}</span>
      <span className="hidden md:inline">{laptopMeta(row, l)}</span>
    </p>
  );

  if (readOnly) {
    // The whole card is the one anchor here — the image/title stay plain
    // so there is no nested `<a>`.
    return (
      <Link
        href={href}
        className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        <ImagePanel row={row} badge={badge} />
        <div className="flex min-w-0 flex-col gap-1 border-t border-border p-3">
          <p className="truncate font-medium leading-tight">{l.title}</p>
          {meta}
          {foot}
        </div>
      </Link>
    );
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* The whole card is the tap target on phones; laptop uses the inner
          image/title links below plus the hover action row instead (spec
          §5.3). Each pair below is display:none at the breakpoint it does
          not own, so only one is ever in the a11y tree or tab order. */}
      <button
        type="button"
        className="absolute inset-0 min-h-11 md:hidden"
        aria-label={l.title}
        onClick={() => cb.onOpenLot(row.lot.id)}
      />
      <div className="md:hidden">
        <ImagePanel row={row} badge={badge} />
      </div>
      <Link href={href} className="hidden md:block">
        <ImagePanel row={row} badge={badge} />
      </Link>
      <div className="flex min-w-0 flex-col gap-1 border-t border-border p-3">
        <p className="truncate font-medium leading-tight md:hidden">{l.title}</p>
        <Link href={href} className="hidden truncate font-medium leading-tight md:block">
          {l.title}
        </Link>
        {meta}
        {foot}
      </div>
      <div className="mt-auto hidden items-center justify-between border-t border-border p-2 opacity-0 transition-opacity md:flex group-hover:opacity-100 focus-within:opacity-100">
        <RowActions
          compact
          lotId={row.lot.id}
          wineId={row.wine.catalogWineId}
          readOnly={readOnly}
          hasYours={row.yours != null}
          cb={cb}
        />
      </div>
    </div>
  );
}

export function BottleGrid({
  sections,
  group,
  readOnly,
  cb,
}: {
  sections: Section[];
  group: GroupKey;
  readOnly: boolean;
  cb: RowCallbacks;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) =>
        section.rows.length === 0 ? null : (
          <Fragment key={section.key}>
            {section.header ? <SectionHeaderBlock header={section.header} /> : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {section.rows.map((row) => (
                <BottleCard key={row.lot.id} row={row} group={group} readOnly={readOnly} cb={cb} />
              ))}
            </div>
          </Fragment>
        ),
      )}
    </div>
  );
}
