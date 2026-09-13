"use client";

import { useId, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { actionButtonClass } from "@/components/overview/action-button";
import { cn } from "@/lib/utils";
import { ConsumeCheckbox } from "./cellar-view";
import {
  catalogMeta,
  pourableBottles,
  searchCellarMeta,
  searchListGroups,
  tastedMeta,
  type SearchListGroup,
} from "./row-format";
import type { SearchViewProps, SheetRowAction } from "./types";

const EMPTY_HINT = "Search by producer, wine or appellation";

const GROUP_TITLE: Record<SearchListGroup["kind"], string> = {
  cellar: "In your cellar",
  catalog: "In the catalog",
  tasted: "You have tasted before",
};

type ListRow = {
  key: string;
  source: "lot" | "catalog" | "tasted";
  catalogWineId: string;
  lotId?: string;
  title: string;
  meta: string;
  imageUrl: string | null;
  inFlight: boolean;
};

/** A group's rows with their metas; every row carries its own `inFlight`
    (tasted rows included, sources-8). */
function rowsOf(group: SearchListGroup): ListRow[] {
  switch (group.kind) {
    case "cellar":
      return group.rows.map((r): ListRow => ({
        key: `lot:${r.lotId}`,
        source: "lot",
        catalogWineId: r.catalogWineId,
        lotId: r.lotId,
        title: r.title,
        meta: searchCellarMeta(r),
        imageUrl: r.imageUrl,
        inFlight: r.inFlight,
      }));
    case "catalog":
      return group.rows.map((r): ListRow => ({
        key: `catalog:${r.catalogWineId}`,
        source: "catalog",
        catalogWineId: r.catalogWineId,
        title: r.title,
        meta: catalogMeta(r),
        imageUrl: r.imageUrl,
        inFlight: r.inFlight,
      }));
    case "tasted":
      return group.rows.map((r): ListRow => ({
        key: `tasted:${r.catalogWineId}`,
        source: "tasted",
        catalogWineId: r.catalogWineId,
        title: r.title,
        meta: tastedMeta(r),
        imageUrl: r.imageUrl,
        inFlight: r.inFlight,
      }));
  }
}

/**
 * A5 — search instead of scanning. One list, grouped in the matrix's order
 * (your cellar → the catalog → wines you have tasted), a wine you own listed
 * once as its lot rows. Every row's action and affordance come from
 * `matrix.row`: the + disc adds on tap, the chevron opens the note or the
 * catalog page, and a disabled row reads `matrix.inFlightMeta`. The footer
 * strip carries the consume checkbox whenever lot rows are listed and the
 * matrix words one, then "Nothing matches?" · "Add it by hand".
 *
 * The shell draws the header (✕, the matrix's eyebrow and title, and the Scan
 * pill when the device can scan), holds the query in sheet state, runs the
 * search and keeps this view mounted while hidden — so `inputRef` exists
 * before "Or search wine catalog" is tapped and is focused inside that tap
 * (CLAUDE.md's combobox rule). There is no autofocus here on purpose.
 */
export function SearchView({
  matrix,
  query,
  onQuery,
  inputRef,
  groups,
  loading,
  consume,
  onConsume,
  onRow,
  onByHand,
  busy = false,
  error = null,
}: SearchViewProps) {
  const inputId = useId();
  // The row whose add is running shows its loader until `busy` settles.
  const [tappedKey, setTappedKey] = useState<string | null>(null);

  const q = query.trim();
  const list = q && groups ? searchListGroups(groups, matrix.searchGroups) : [];
  const count = list.reduce((n, group) => n + group.rows.length, 0);
  const lotsListed = list.some((group) => group.kind === "cellar");

  const tap = (row: ListRow, action: SheetRowAction) => {
    if (busy) return;
    setTappedKey(row.key);
    onRow(
      row.lotId === undefined
        ? { source: row.source, catalogWineId: row.catalogWineId }
        : { source: row.source, catalogWineId: row.catalogWineId, lotId: row.lotId },
      action,
    );
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* Search row — stays put while the list scrolls under it. */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-[9px] bg-card p-[11px_16px] md:px-[22px]">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-[9px] rounded-[11px] border-[1.5px] border-primary bg-white px-[13px]">
          <label htmlFor={inputId} className="flex shrink-0 items-center">
            <Search className="size-4 text-primary" aria-hidden />
            <span className="sr-only">Search wines</span>
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={matrix.searchPlaceholder}
            autoComplete="off"
            enterKeyHint="search"
            className="h-auto flex-1 rounded-none border-0 bg-transparent px-0 py-[9px] text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-[15px]"
          />
          {q ? (
            <span className="shrink-0 text-[11.5px] text-muted-foreground" aria-live="polite">
              {loading || !groups ? "Searching…" : matrix.resultCount(count)}
            </span>
          ) : null}
        </div>
      </div>

      {/* The list */}
      {!q ? (
        <Centered>{EMPTY_HINT}</Centered>
      ) : !groups || (loading && count === 0) ? (
        <Centered>
          <WineGlassLoader className="text-primary" />
          <span>Searching…</span>
        </Centered>
      ) : count === 0 ? (
        <Centered>No matches</Centered>
      ) : (
        <div className="flex flex-col">
          {list.map((group) => {
            const pourable = group.kind === "cellar" ? pourableBottles(group.rows) : 0;
            return (
              <section key={group.kind}>
                <GroupHeader
                  title={GROUP_TITLE[group.kind]}
                  note={
                    group.kind === "cellar" && matrix.cellarGroupSubtitle && pourable > 0
                      ? matrix.cellarGroupSubtitle(pourable)
                      : undefined
                  }
                />
                {rowsOf(group).map((row) => {
                  const cell = matrix.row({
                    source: row.source,
                    inFlight: row.inFlight,
                    owned: row.source === "lot",
                  });
                  return (
                    <ResultRow
                      key={row.key}
                      title={row.title}
                      meta={row.meta}
                      imageUrl={row.imageUrl}
                      label={cell.label}
                      affordance={cell.affordance}
                      disabled={cell.disabled}
                      disabledMeta={matrix.inFlightMeta}
                      pending={busy && tappedKey === row.key}
                      locked={busy}
                      onClick={() => tap(row, cell.action)}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* Footer strip — pinned to the bottom of the sheet's scroll region. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-[10px] border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[11px] md:px-[22px]">
        {lotsListed && matrix.consumeLabel ? (
          <ConsumeCheckbox
            checked={consume}
            onChange={onConsume}
            disabled={busy}
            label={matrix.consumeLabel}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-rose">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-[10px]">
          <span className="flex-1 text-[12.5px] text-muted-foreground">Nothing matches?</span>
          <button
            type="button"
            disabled={busy}
            onClick={onByHand}
            className={actionButtonClass(
              "outline",
              "w-auto px-[18px] py-[12px] text-[14px] disabled:opacity-60 max-md:rounded-[10px] max-md:py-[12px]",
            )}
          >
            Add it by hand
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-border-light bg-background p-[9px_16px_6px] md:px-[22px]">
      <Eyebrow size="sm">{title}</Eyebrow>
      {note ? <span className="text-[11px] text-muted-foreground">{note}</span> : null}
    </div>
  );
}

// One result: 28×38 thumb, title, meta, and the trailing disc — the same
// gold-outlined disc on every row (owner feedback 2026-09-12), holding a "+"
// for an add or a chevron for a pick or an open, as `matrix.row` says. A
// disabled row (a wine already in the flight) is not tappable and reads the
// matrix's "in flight" instead.
function ResultRow({
  title,
  meta,
  imageUrl,
  label,
  affordance,
  disabled,
  disabledMeta,
  pending,
  locked,
  onClick,
}: {
  title: string;
  meta: string;
  imageUrl: string | null;
  /** What the tap does ("Add as glass 4", "+1 bottle", "Start the note"), for screen readers. */
  label: string;
  affordance: "plus" | "chevron";
  disabled: boolean;
  disabledMeta: string;
  pending: boolean;
  /** Another add is running: nothing takes a tap. */
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || locked}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-[11px] border-b border-border-light p-[12px_16px] text-left transition-colors md:px-[22px]",
        !disabled && "md:hover:bg-background",
        disabled && "cursor-default",
      )}
    >
      <HatchThumb src={imageUrl} width={28} height={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[14.5px] font-semibold leading-[1.25] text-foreground">
          {title}
        </span>
        <span className="truncate text-[11.5px] text-muted-foreground">{meta}</span>
      </span>
      {disabled ? (
        <span className="shrink-0 text-[11.5px] text-muted-foreground">{disabledMeta}</span>
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold text-primary"
          >
            {pending ? (
              <WineGlassLoader size={16} />
            ) : affordance === "chevron" ? (
              <ChevronRight className="size-4" strokeWidth={2.5} />
            ) : (
              <Plus className="size-4" strokeWidth={2.5} />
            )}
          </span>
          <span className="sr-only">{label}</span>
        </>
      )}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
