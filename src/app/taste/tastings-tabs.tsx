"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CardEmptyRow } from "@/components/overview/subject-card";
import { cn } from "@/lib/utils";
import { makeT } from "@/lib/wset/i18n";
import { loadPlacements } from "./taste-archive-actions";
import {
  ARCHIVE_FILTERS,
  ARCHIVE_LANG,
  PAGE_SIZE,
  emptyLineKey,
  filterHref,
  listRows,
  missingPlacementIds,
  parseFilter,
  showMoreCount,
  type ArchiveFilter,
  type ArchivePlacement,
  type ArchiveTasting,
} from "./taste-archive-math";
import { TastingRowView } from "./tasting-row";

const t = makeT(ARCHIVE_LANG);

const LABEL: Record<ArchiveFilter, string> = {
  all: t("filter_all"),
  hosting: t("filter_hosting"),
  attending: t("filter_attending"),
  finished: t("filter_finished"),
};

const FIRST_PAGE: Record<ArchiveFilter, number> = {
  all: PAGE_SIZE,
  hosting: PAGE_SIZE,
  attending: PAGE_SIZE,
  finished: PAGE_SIZE,
};

type Placements = Record<string, ArchivePlacement | null>;

const NO_PENDING: ReadonlySet<string> = new Set();

/**
 * The filter chips and the one list under them (ledger R5, TASTE-07/14).
 * The chips are non-exclusive filters over the same memberships — All ·
 * Hosting · Attending · Finished with counts — and the active one is
 * URL-addressable (`/taste?tab=finished`; `?tab=history` is kept as an alias
 * so the Overview and Your-numbers History pills still land on Finished).
 * Clicking pushes a history entry with `window.history.pushState`, which the
 * Next router keeps in sync with `useSearchParams` without a server round
 * trip, so back / forward walk the chips.
 *
 * The page fetches every membership (a personal list) but a finished row's
 * placing costs a leaderboard RPC, so placings load only for the rows on
 * screen: the server sends the first page's (unless the page is polling), and
 * this component asks the `loadPlacements` action for whatever is still
 * missing once "Show N more" or a chip change reveals it — one page per call.
 * "Show N more" is remembered per chip, and is the list card's last row.
 */
export function TastingsTabs({
  tastings,
  counts,
  invitationCount,
  initialPlacements,
}: {
  tastings: ArchiveTasting[];
  counts: Record<ArchiveFilter, number>;
  /** Pending invitations in the band above, for the empty All line. */
  invitationCount: number;
  initialPlacements: Placements;
}) {
  const searchParams = useSearchParams();
  const active = parseFilter(searchParams.get("tab"));
  const [shown, setShown] = useState(FIRST_PAGE);
  const [loaded, setLoaded] = useState<Placements>({});
  const [, startTransition] = useTransition();
  const inFlight = useRef(new Set<string>());
  // The server's placings win: a router.refresh brings them fresh.
  const placements: Placements = { ...loaded, ...initialPlacements };

  const rows = listRows(tastings, active);
  const visible = rows.slice(0, shown[active]);
  const more = showMoreCount(rows.length, visible.length);
  // A string key, so the effect re-runs only when the set to load changes.
  const missingKey = missingPlacementIds(visible, placements, NO_PENDING).join(",");

  useEffect(() => {
    const pending = inFlight.current;
    const ids = missingKey.split(",").filter((id) => id !== "" && !pending.has(id));
    if (ids.length === 0) return;
    // An id stays marked once asked for. Its answer settles into `loaded`
    // (a failure settles to null), so it is never missing again, and never
    // unmarking it means a render that lands between the answer and its
    // commit cannot ask for the same id twice.
    for (const id of ids) pending.add(id);
    startTransition(async () => {
      let got: Placements = {};
      try {
        got = await loadPlacements(ids);
      } catch (error) {
        console.error("loadPlacements failed", error);
      }
      // Every requested id settles — a failure or an unreadable tasting reads
      // as "no placing" rather than a spinner that never ends.
      const settled: Placements = Object.fromEntries(ids.map((id) => [id, got[id] ?? null]));
      startTransition(() => setLoaded((prev) => ({ ...prev, ...settled })));
    });
  }, [missingKey]);

  const select = (filter: ArchiveFilter) => {
    if (filter === active) return;
    window.history.pushState(null, "", filterHref(filter));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* Chips scroll horizontally on phones. A horizontal scroller clips
            vertically too (overflow-x: auto computes overflow-y to auto), and
            the clip falls at its padding box: the 30px chips plus 7px above
            and below, 44px. Each chip's invisible ::after pad is positioned
            from the chip's padding edge, which sits inside its 1px border, so
            -8px each way spans 28 + 8 + 8 = 44px and ends exactly on that
            padding box: a 44px tap target, nothing clipped, no vertical
            overflow to scroll. The -3px margins keep the row's layout height
            at 38px. */}
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 max-md:-my-[3px] max-md:py-[7px] md:gap-2">
          {ARCHIVE_FILTERS.map((filter) => {
            const isActive = active === filter;
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={isActive}
                onClick={() => select(filter)}
                className={cn(
                  "relative flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold whitespace-nowrap transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-[''] md:h-[33px] md:gap-[7px] md:px-[14px] md:text-[12.5px]",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-gold",
                )}
              >
                {LABEL[filter]}
                <span className="font-mono text-[10.5px] tabular-nums opacity-75">
                  {counts[filter]}
                </span>
              </button>
            );
          })}
        </div>
        <span className="shrink-0 text-[11.5px] text-muted-foreground max-md:hidden">
          {t("newest_first")}
        </span>
      </div>

      <div className="overflow-hidden rounded-[13px] border border-border-strong bg-card max-md:rounded-xl [&>*:last-child]:border-b-0">
        {visible.length === 0 ? (
          <CardEmptyRow>{t(emptyLineKey(active, invitationCount))}</CardEmptyRow>
        ) : (
          visible.map((row) => (
            <TastingRowView key={row.id} row={row} placement={placements[row.id]} />
          ))
        )}
        {more > 0 ? (
          <button
            type="button"
            onClick={() => setShown((s) => ({ ...s, [active]: s[active] + PAGE_SIZE }))}
            className="flex min-h-11 w-full items-center justify-center p-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            {t("show_n_more", { n: more })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
