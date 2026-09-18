"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addedMonth,
  countTimes,
  drunkLine,
  fmtAvg,
  fmtScore,
  inFlightLine,
  isLastOne,
  sizeLabel,
} from "@/lib/cellar/format";
import { placeText, rowLines } from "@/lib/cellar/cellar-rows";
import type { BottleRow, GroupKey } from "@/lib/cellar/types";
import { RowActions, type RowCallbacks, type Section } from "./row-actions";

// The Bottles column's second line: purchased > held wins, then the
// last-one marker, and only otherwise does the bottle size itself show
// (spec §5.2 — "size shows when neither of the other two applies").
function bottleSecondLine(row: BottleRow): {
  text: string;
  className: string;
  isSize: boolean;
} {
  const drunk = drunkLine(row.lot);
  if (drunk) return { text: drunk, className: "text-muted-foreground", isSize: false };
  if (isLastOne(row.lot.quantity)) {
    return { text: "last one", className: "text-gold-dark", isSize: false };
  }
  return {
    text: sizeLabel(row.lot.bottleSizeMl),
    className: "text-muted-foreground",
    isSize: true,
  };
}

// A magnum (or any non-standard size) that lost its Bottles-column slot to
// a drunk/last-one marker gets its size surfaced here instead, so it is
// never lost entirely.
function whereSecondLine(row: BottleRow): string {
  const second = bottleSecondLine(row);
  const nonStandard = row.lot.bottleSizeMl !== 750;
  if (nonStandard && !second.isSize) return sizeLabel(row.lot.bottleSizeMl);
  return `added ${addedMonth(row.lot)}`;
}

// A small bottle thumbnail for the start of every list row — same rounded/
// bordered box the grid's HatchThumb uses, sized down for a table row/card,
// object-contain on a card ground so the label never crops, with the same
// hatch fallback for a wine with no image.
function BottleThumb({ src, className }: { src: string | null; className: string }): React.JSX.Element {
  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border",
    className,
  );
  if (!src) {
    return <span className={cn(box, "hatch")} aria-hidden />;
  }
  return (
    <span className={cn(box, "bg-card")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
    </span>
  );
}

function GroupHeaderLaptop({
  header,
  cols,
}: {
  header: NonNullable<Section["header"]>;
  cols: number;
}): React.JSX.Element {
  return (
    <tr className="bg-muted/40">
      <td colSpan={cols} className="px-4 py-2">
        <p className="font-heading text-base font-semibold text-foreground">
          {header.label}
          {header.sublabel ? (
            <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
              · {header.sublabel}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">{header.line.laptop}</p>
      </td>
    </tr>
  );
}

function GroupHeaderPhone({
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
      <p className="text-xs text-muted-foreground">{header.line.phone}</p>
    </div>
  );
}

function PhoneRowWrapper({
  readOnly,
  wineId,
  onOpen,
  children,
}: {
  readOnly: boolean;
  wineId: string;
  onOpen: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const className =
    "group flex min-h-11 w-full items-start gap-3 rounded-xl border border-border p-3 text-left";
  if (readOnly) {
    return (
      <Link href={`/catalog/${wineId}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onOpen}>
      {children}
    </button>
  );
}

export function BottleList({
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
    <>
      {/* Laptop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[7rem]" />
            <col className="w-[11rem]" />
            <col className="w-[9rem]" />
            {!readOnly ? <col className="w-[7.5rem]" /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Wine</th>
              <th className="px-4 py-3 font-medium">Bottles</th>
              <th className="px-4 py-3 font-medium">Where</th>
              <th className="px-4 py-3 font-medium">
                {readOnly ? (
                  "Community"
                ) : (
                  <>
                    <span className="text-primary">Yours</span> ·{" "}
                    <span className="text-gold-dark">Community</span>
                  </>
                )}
              </th>
              {!readOnly ? (
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) =>
              section.rows.length === 0 ? null : (
                <Fragment key={section.key}>
                  {section.header ? (
                    <GroupHeaderLaptop header={section.header} cols={readOnly ? 4 : 5} />
                  ) : null}
                  {section.rows.map((row) => {
                    const l = rowLines(row, group);
                    const second = bottleSecondLine(row);
                    const text = placeText(l.place);
                    const showFlag = l.place.region != null;
                    return (
                      <tr
                        key={row.lot.id}
                        className="group border-b border-border align-top hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <BottleThumb src={row.wine.imageUrl} className="h-14 w-10" />
                            <div className="min-w-0 flex-1">
                              {l.producer ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {l.producer}
                                </span>
                              ) : null}
                              <Link
                                href={`/catalog/${row.wine.catalogWineId}`}
                                className="block truncate font-medium text-foreground"
                              >
                                {l.title}
                              </Link>
                              {l.facts ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {l.facts}
                                </span>
                              ) : null}
                              {text ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {showFlag ? (
                                    <CountryFlag
                                      name={l.place.country ?? row.wine.country}
                                      className="mr-1"
                                    />
                                  ) : null}
                                  {text}
                                </span>
                              ) : null}
                              {row.inFlight > 0 ? (
                                <span className="block text-xs font-medium text-gold-dark">
                                  {inFlightLine(row.inFlight)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {countTimes(row.lot.quantity)}
                          <span className={cn("block text-xs", second.className)}>
                            {second.text}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block truncate">
                            {l.where ?? (group === "where" ? null : "—")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {whereSecondLine(row)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {!readOnly ? (
                              row.yours ? (
                                <button
                                  type="button"
                                  className="font-semibold text-primary tabular-nums"
                                  onClick={() =>
                                    cb.onOpenNote(row.yours!.noteId, row.wine.catalogWineId)
                                  }
                                >
                                  {fmtScore(row.yours.score)}
                                </button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cb.onRate(row.wine.catalogWineId)}
                                >
                                  Rate it
                                </Button>
                              )
                            ) : null}
                            <span className="inline-flex items-center gap-1 font-semibold text-gold-dark tabular-nums">
                              <Star className="size-3.5 text-gold-deep" />
                              {row.community.avg != null ? (
                                fmtAvg(row.community.avg)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                          </div>
                        </td>
                        {!readOnly ? (
                          <td className="px-4 py-3">
                            <RowActions
                              lotId={row.lot.id}
                              wineId={row.wine.catalogWineId}
                              readOnly={readOnly}
                              hasYours={row.yours != null}
                              cb={cb}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </Fragment>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* Phone rows */}
      <div className="flex flex-col gap-2 lg:hidden">
        {sections.map((section) =>
          section.rows.length === 0 ? null : (
            <Fragment key={section.key}>
              {section.header ? <GroupHeaderPhone header={section.header} /> : null}
              {section.rows.map((row) => {
                const l = rowLines(row, group);
                const second = bottleSecondLine(row);
                const text = placeText(l.place);
                const showFlag = l.place.region != null;
                const grouped = group !== "none";
                return (
                  <PhoneRowWrapper
                    key={row.lot.id}
                    readOnly={readOnly}
                    wineId={row.wine.catalogWineId}
                    onOpen={() => cb.onOpenLot(row.lot.id)}
                  >
                    <BottleThumb src={row.wine.imageUrl} className="h-12 w-9" />
                    {grouped ? (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {(l.producer ?? row.wine.producer) ?? "—"} ·{" "}
                            {countTimes(row.lot.quantity)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          {!readOnly ? (
                            row.yours ? (
                              <span className="block font-semibold text-primary">
                                {fmtScore(row.yours.score)}
                              </span>
                            ) : (
                              <span className="block text-xs text-muted-foreground">Rate</span>
                            )
                          ) : null}
                          <span className="block font-semibold text-gold-dark">
                            {row.community.avg != null ? fmtAvg(row.community.avg) : "—"}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1">
                          {l.producer ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {l.producer}
                            </span>
                          ) : null}
                          <span className="block truncate font-medium">{l.title}</span>
                          {l.facts ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {l.facts}
                            </span>
                          ) : null}
                          {text ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {showFlag ? (
                                <CountryFlag
                                  name={l.place.country ?? row.wine.country}
                                  className="mr-1"
                                />
                              ) : null}
                              {text}
                            </span>
                          ) : null}
                          <span className="block text-xs text-muted-foreground">
                            {countTimes(row.lot.quantity)} {second.text}
                            {l.where ? ` · ${l.where}` : ""}
                          </span>
                          {row.inFlight > 0 ? (
                            <span className="block text-xs font-medium text-gold-dark">
                              {inFlightLine(row.inFlight, { phone: true })}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          {!readOnly ? (
                            <span className="block font-semibold text-primary">
                              {row.yours ? fmtScore(row.yours.score) : "—"}
                            </span>
                          ) : null}
                          <span className="block font-semibold text-gold-dark">
                            {row.community.avg != null ? fmtAvg(row.community.avg) : "—"}
                          </span>
                        </span>
                      </>
                    )}
                  </PhoneRowWrapper>
                );
              })}
            </Fragment>
          ),
        )}
      </div>
    </>
  );
}
