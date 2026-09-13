"use client";

import { Check, Plus } from "lucide-react";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { actionButtonClass } from "@/components/overview/action-button";
import { cn } from "@/lib/utils";
import {
  cellarListState,
  cellarLotMeta,
  filterLots,
  rackChips,
  type CellarFilter,
  type CellarSheetLot,
} from "./row-format";
import type { CellarViewProps } from "./types";

/**
 * The consume toggle, worded by the matrix's `consumeLabel` ("Take it out of
 * the cellar when we pour it", or "Take a bottle out of the cellar when I save
 * the note"): a gold-bordered card in the A5 / A6 footers, or a one-line row.
 * A button with the checkbox role, so the whole line is the tap target and no
 * native control has to be restyled.
 */
export function ConsumeCheckbox({
  checked,
  onChange,
  disabled = false,
  variant = "card",
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  variant?: "card" | "inline";
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-11 w-full items-center gap-[11px] text-left leading-[1.4] transition-colors",
        variant === "card"
          ? "rounded-[11px] border border-gold bg-card p-[12px_13px] text-[13px]"
          : "border-b border-border-light px-4 text-[12.5px] md:px-[22px]",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[5px]",
          checked
            ? "bg-primary text-primary-foreground"
            : "border border-border-strong bg-background",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function sameFilter(current: CellarFilter, next: NonNullable<CellarFilter>): boolean {
  if (!current || current.kind !== next.kind) return false;
  return current.kind === "drinkNow" || (next.kind === "rack" && current.rack === next.rack);
}

/**
 * A6 — the cellar as a source: racks, not a search box. Filter chips (Drink
 * now · one per rack), a lot per row with `cellarLotMeta` ("… · already glass
 * 1" only when the glass is known, C.9), a lot already in the flight disabled
 * with the matrix's "in flight", and a tap selects a row (✓). The footer
 * carries the consume checkbox and the matrix's primary: "Add as glass N",
 * "Start the note", or "Choose where it goes" with no destination.
 *
 * The shell loads the cellar, keeps filter, selection and consume in sheet
 * state, and draws the header (the matrix title as eyebrow, "From my cellar",
 * "{n} bottles"). A load that fails before any sheet is in hand says so in the
 * list area (`loadFailed`) instead of spinning on. Destinations without a cellar source (`matrix.cellarSource`
 * false: the cellar itself, the catalog) never open this view.
 */
export function CellarView({
  matrix,
  sheet,
  filter,
  onFilter,
  selectedLotId,
  onSelect,
  consume,
  onConsume,
  onAdd,
  onScanOrSearch,
  loadFailed = false,
  busy = false,
  error = null,
}: CellarViewProps) {
  const lots = sheet?.lots ?? [];
  const racks = rackChips(lots);
  const drinkNowCount = lots.filter((l) => l.drinkNow).length;
  const visible = filterLots(lots, filter);
  const listState = cellarListState({ sheet, loadFailed, visibleCount: visible.length });
  const unavailable = (lot: CellarSheetLot) =>
    lot.inFlight || matrix.row({ source: "lot", inFlight: lot.inFlight, owned: true }).disabled;
  // A selection that has since gone into the flight no longer counts.
  const selected = lots.find((l) => l.lotId === selectedLotId && !unavailable(l)) ?? null;

  const toggleFilter = (next: NonNullable<CellarFilter>) =>
    onFilter(sameFilter(filter, next) ? null : next);

  const tapRow = (lot: CellarSheetLot) => {
    if (busy || unavailable(lot)) return;
    onSelect(selected?.lotId === lot.lotId ? null : lot.lotId);
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* The filter chips stay put while the racks scroll under them. */}
      <div className="sticky top-0 z-10 shrink-0 bg-card">
        {lots.length > 0 && (drinkNowCount > 0 || racks.length > 0) ? (
          <div className="no-scrollbar flex gap-[7px] overflow-x-auto border-b border-border-light p-[11px_16px] md:px-[22px]">
            {drinkNowCount > 0 ? (
              <FilterChip
                active={filter?.kind === "drinkNow"}
                onClick={() => toggleFilter({ kind: "drinkNow" })}
              >
                Drink now {drinkNowCount}
              </FilterChip>
            ) : null}
            {racks.map((rack) => (
              <FilterChip
                key={rack}
                active={filter?.kind === "rack" && filter.rack === rack}
                onClick={() => toggleFilter({ kind: "rack", rack })}
              >
                {rack}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {/* The racks */}
      {listState === "loading" ? (
        <Centered>
          <WineGlassLoader className="text-primary" />
          <span>Opening your cellar…</span>
        </Centered>
      ) : listState === "failed" ? (
        <Centered>
          <span>Couldn&rsquo;t load your cellar right now.</span>
          <button
            type="button"
            onClick={onScanOrSearch}
            className="min-h-11 text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Scan or search instead
          </button>
        </Centered>
      ) : listState === "empty" ? (
        <Centered>
          <span>Your cellar has no bottles in stock.</span>
          <button
            type="button"
            onClick={onScanOrSearch}
            className="min-h-11 text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Scan or search instead
          </button>
        </Centered>
      ) : listState === "filteredEmpty" ? (
        <Centered>
          {filter?.kind === "drinkNow"
            ? "Nothing is in its drinking window this year."
            : `Nothing in ${filter?.kind === "rack" ? filter.rack : "this rack"}.`}
        </Centered>
      ) : (
        <ul className="flex flex-col">
          {visible.map((lot) => {
            const off = unavailable(lot);
            const isSelected = selected?.lotId === lot.lotId;
            return (
              <li key={lot.lotId}>
                <button
                  type="button"
                  disabled={off || busy}
                  aria-pressed={isSelected}
                  onClick={() => tapRow(lot)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-[11px] border-b border-border-light p-[13px_16px] text-left transition-colors md:px-[22px]",
                    isSelected && "bg-gold/10",
                    !off && !isSelected && "md:hover:bg-background",
                    off && "cursor-default",
                  )}
                >
                  <HatchThumb src={lot.imageUrl} width={30} height={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-semibold leading-[1.25] text-foreground">
                      {lot.title}
                    </span>
                    <span className="truncate text-[11.5px] text-muted-foreground">
                      {cellarLotMeta(lot)}
                    </span>
                  </span>
                  {off ? (
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">
                      {matrix.inFlightMeta}
                    </span>
                  ) : (
                    <Disc checked={isSelected} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer — pinned to the bottom of the sheet's scroll region; only
          once there are lots to pick from. */}
      {listState === "list" || listState === "filteredEmpty" ? (
        <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-[10px] border-t border-border bg-background p-[12px_16px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-3 md:px-[22px]">
          {matrix.consumeLabel ? (
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
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => {
              if (selected && !busy) onAdd();
            }}
            className={actionButtonClass(
              "primary",
              "rounded-[11px] py-[15px] text-[16.5px] disabled:opacity-60 max-md:py-[13px]",
            )}
          >
            {busy ? <WineGlassLoader /> : null}
            {matrix.footer.primary}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        // 32px pill as drawn; the pseudo-pad lifts the phone tap target to 44px.
        "relative shrink-0 rounded-full px-[14px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-[6px] max-md:after:content-['']",
        active
          ? "bg-primary font-semibold text-primary-foreground"
          : "border border-border text-muted-foreground md:hover:border-gold md:hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}

// The trailing disc: a gold-outlined "+" for a pickable row, a filled
// bordeaux check once selected. Only the selection changes it, never a row's
// place in the list — every unselected row carries the same disc (owner
// feedback 2026-09-12).
function Disc({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        checked
          ? "bg-primary text-primary-foreground"
          : "border-[1.5px] border-gold text-primary",
      )}
    >
      {checked ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : (
        <Plus className="size-4" strokeWidth={2.5} />
      )}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
