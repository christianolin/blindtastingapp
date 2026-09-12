"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { actionButtonClass } from "@/components/overview/action-button";
import { cn } from "@/lib/utils";
import { listCellarForSheet } from "./cellar-actions";
import { glassLabel } from "./format";
import {
  cellarLotMeta,
  filterLots,
  rackChips,
  type CellarFilter,
  type CellarSheet,
  type CellarSheetLot,
} from "./row-format";
import type { CellarViewProps } from "./types";

const CONSUME_COPY = "Take it out of the cellar when we pour it";

/**
 * "Take it out of the cellar when we pour it" — the consume toggle drawn in
 * the 7f footer (gold-bordered card) and as a one-line row inside the 7e
 * search list. A button with the checkbox role, so the whole line is the tap
 * target and no native control has to be restyled.
 */
export function ConsumeCheckbox({
  checked,
  onChange,
  disabled = false,
  variant = "card",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  variant?: "card" | "inline";
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
      <span className="flex-1">{CONSUME_COPY}</span>
    </button>
  );
}

type Mode = "flight" | "catalog" | "cellar" | "none";

/**
 * 7f — the cellar as a source: racks, not a search box. Filter chips (Drink
 * now · one per rack), a lot per row, the selected one with a check disc,
 * bottles already in the flight disabled, and a footer with the consume
 * checkbox + "Add as glass N". For a catalog destination the rows are
 * informational (every cellar bottle is already a catalog wine).
 */
export function CellarView({ ctx, onAdd, onBack, busy, onLoaded }: CellarViewProps) {
  const [data, setData] = useState<CellarSheet | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<CellarFilter>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [consume, setConsume] = useState(true);
  // The lot whose add is in flight, so its row (or the footer) shows the loader.
  const [addingLotId, setAddingLotId] = useState<string | null>(null);
  const adding = addingLotId !== null;

  const flight = ctx.destination?.kind === "flight" ? ctx.destination : null;
  // A destination-less sheet can still pour into tonight's flight (the shell
  // adopts `flightHint` for a lot add), so the flight lookup follows it too.
  const tastingId = flight?.tastingId ?? ctx.flightHint?.tastingId;
  const glass = flight?.position ?? ctx.flightHint?.position ?? null;
  const mode: Mode = ctx.destination?.kind ?? (ctx.flightHint ? "flight" : "none");

  useEffect(() => {
    let cancelled = false;
    listCellarForSheet(tastingId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onLoaded?.(d.totalBottles);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tastingId, onLoaded]);

  const lots = data?.lots ?? [];
  const racks = rackChips(lots);
  const drinkNowCount = lots.filter((l) => l.drinkNow).length;
  const visible = filterLots(lots, filter);
  const selected = lots.find((l) => l.lotId === selectedLotId) ?? null;
  const selectable = mode === "flight";
  const pending = busy || adding;

  const toggleFilter = (next: NonNullable<CellarFilter>) => {
    setFilter((cur) =>
      cur &&
      cur.kind === next.kind &&
      (cur.kind !== "rack" || next.kind !== "rack" || cur.rack === next.rack)
        ? null
        : next,
    );
  };

  const tapRow = (lot: CellarSheetLot) => {
    if (pending || lot.inFlight) return;
    if (mode === "catalog") {
      // Informational: the wine is a catalog row already; the add is a no-op
      // that still hands the sheet a labelled result.
      setAddingLotId(lot.lotId);
      void onAdd({ kind: "catalog", catalogWineId: lot.catalogWineId }).finally(() =>
        setAddingLotId(null),
      );
      return;
    }
    if (!selectable) return;
    setSelectedLotId((cur) => (cur === lot.lotId ? null : lot.lotId));
  };

  const add = async () => {
    if (!selected || pending || glass == null) return;
    setAddingLotId(selected.lotId);
    try {
      await onAdd({ kind: "lot", lotId: selected.lotId, consume });
    } finally {
      setAddingLotId(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* The sheet's header carries ← · "Add wine · glass N" · "From my
          cellar" · "38 bottles" (7f, via `onLoaded`); the filter chips stay
          put here while the racks scroll under them. */}
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
      {!data && !failed ? (
        <Centered>
          <WineGlassLoader className="text-primary" />
          <span>Opening your cellar…</span>
        </Centered>
      ) : failed ? (
        <Centered>Couldn&rsquo;t load your cellar right now.</Centered>
      ) : lots.length === 0 ? (
        <Centered>
          <span>Your cellar has no bottles in stock.</span>
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Scan or search instead
          </button>
        </Centered>
      ) : visible.length === 0 ? (
        <Centered>
          {filter?.kind === "drinkNow"
            ? "Nothing is in its drinking window this year."
            : `Nothing in ${filter?.kind === "rack" ? filter.rack : "this rack"}.`}
        </Centered>
      ) : (
        <ul className="flex flex-col">
          {visible.map((lot) => {
            const isSelected = selectable && lot.lotId === selectedLotId;
            const disabled = lot.inFlight || mode === "cellar" || mode === "none";
            return (
              <li key={lot.lotId}>
                <button
                  type="button"
                  disabled={disabled || pending}
                  aria-pressed={selectable ? isSelected : undefined}
                  onClick={() => tapRow(lot)}
                  className={cn(
                    "flex w-full items-center gap-[11px] border-b border-border-light p-[13px_16px] text-left transition-colors md:px-[22px]",
                    isSelected && "bg-gold/10",
                    !disabled && !isSelected && "md:hover:bg-background",
                    disabled && "cursor-default",
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
                  {lot.inFlight ? (
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">in flight</span>
                  ) : mode === "cellar" || mode === "none" ? null : (
                    <Disc checked={isSelected} pending={addingLotId === lot.lotId} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer — pinned to the bottom of the sheet's scroll region. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-[10px] border-t border-border bg-background p-[12px_16px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-3 md:px-[22px]">
        {mode === "flight" ? (
          <>
            <ConsumeCheckbox checked={consume} onChange={setConsume} disabled={pending} />
            <button
              type="button"
              disabled={!selected || pending || glass == null}
              onClick={() => void add()}
              className={actionButtonClass(
                "primary",
                "rounded-[11px] py-[15px] text-[16.5px] disabled:opacity-60 max-md:py-[13px]",
              )}
            >
              {adding ? <WineGlassLoader /> : null}
              {glass == null ? "Add to the flight" : `Add as ${glassLabel(glass)}`}
            </button>
          </>
        ) : (
          <p className="text-center text-[12.5px] text-muted-foreground">
            {mode === "catalog"
              ? "Already in the catalog"
              : mode === "cellar"
                ? "Already in your cellar"
                : "No tasting tonight to pour a bottle into — scan or search instead."}
          </p>
        )}
      </div>
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
// bordeaux check once selected.
function Disc({ checked, pending }: { checked: boolean; pending: boolean }) {
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
      {pending ? (
        <WineGlassLoader size={16} />
      ) : checked ? (
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
