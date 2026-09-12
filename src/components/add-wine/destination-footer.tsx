"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { actionButtonClass } from "@/components/overview/action-button";
import {
  findMyCellarLotsForWine,
  increaseCellarLotQuantity,
  listMyCellarLots,
} from "@/app/cellar/new/actions";
import { cn } from "@/lib/utils";
import { glassLabel } from "./format";
import { primaryAddLabel } from "./scan-copy";
import type { AddWineDestination } from "./types";

export type CellarLotFields = {
  quantity: number;
  storageLocation: string | null;
  pricePerBottle: number | null;
  currency: string | null;
};

type ExistingLot = { id: string; quantity: number; storageLocation: string | null };

/**
 * The per-destination footer: flight → "Add as glass N" (+ optional "Add and
 * scan the next"); cellar → quantity · rack · optional price → "Add to
 * cellar", with the duplicate-lot choice when the wine is already held;
 * catalog → "Add to the catalog"; rate → "Rate this wine" (the shell mounts
 * these fields only for the cellar today). Sits in the sheet's `shrink-0 border-t`
 * footer slot; `label` is the wine's display title shown as context.
 */
export function DestinationFooter({
  destination,
  label,
  onConfirm,
  onSecondary,
  secondaryLabel,
  busy,
  catalogWineIdForDuplicateCheck = null,
  currency = "DKK",
  onMergedIntoLot,
}: {
  destination: AddWineDestination;
  label: string;
  onConfirm: (lot?: CellarLotFields) => Promise<void>;
  onSecondary?: () => Promise<void>;
  secondaryLabel?: string;
  busy: boolean;
  catalogWineIdForDuplicateCheck?: string | null;
  /** Price currency for the cellar fields (the profile's preferred one). */
  currency?: string;
  /** Cellar only: called instead of `onConfirm` when the user chose to add
      the bottles to a lot they already hold (the footer has already
      increased it). Without it the merge choice is not offered. */
  onMergedIntoLot?: (info: { lotId: string; quantity: number }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-[8px] px-4 pt-[11px]">
      <p className="truncate text-[12.5px] text-ink-photo" title={label}>
        {label}
      </p>
      {destination.kind === "flight" ? (
        <FlightFooter
          position={destination.position}
          busy={busy}
          onConfirm={onConfirm}
          onSecondary={onSecondary}
          secondaryLabel={secondaryLabel}
        />
      ) : destination.kind === "cellar" ? (
        <CellarFooter
          busy={busy}
          currency={currency}
          catalogWineId={catalogWineIdForDuplicateCheck}
          onConfirm={onConfirm}
          onSecondary={onSecondary}
          secondaryLabel={secondaryLabel}
          onMergedIntoLot={onMergedIntoLot}
        />
      ) : (
        // Catalog, or rate: one action and no fields ("Add to the catalog" /
        // "Rate this wine").
        <button
          type="button"
          disabled={busy}
          onClick={() => void onConfirm()}
          className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
        >
          {busy ? <WineGlassLoader /> : null}
          {primaryAddLabel(destination)}
        </button>
      )}
    </div>
  );
}

function FlightFooter({
  position,
  busy,
  onConfirm,
  onSecondary,
  secondaryLabel,
}: {
  position: number;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onSecondary?: () => Promise<void>;
  secondaryLabel?: string;
}) {
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onConfirm()}
        className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
      >
        {busy ? <WineGlassLoader /> : null}
        Add as {glassLabel(position)}
      </button>
      {onSecondary ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSecondary()}
          className={actionButtonClass("outline", "text-[15px] disabled:opacity-60")}
        >
          {secondaryLabel ?? "Add and scan the next"}
        </button>
      ) : null}
    </>
  );
}

function CellarFooter({
  busy,
  currency,
  catalogWineId,
  onConfirm,
  onSecondary,
  secondaryLabel,
  onMergedIntoLot,
}: {
  busy: boolean;
  currency: string;
  catalogWineId: string | null;
  onConfirm: (lot: CellarLotFields) => Promise<void>;
  onSecondary?: () => Promise<void>;
  secondaryLabel?: string;
  onMergedIntoLot?: (info: { lotId: string; quantity: number }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(1);
  const [rack, setRack] = useState("");
  const [price, setPrice] = useState("");
  const [racks, setRacks] = useState<string[]>([]);
  const [existing, setExisting] = useState<ExistingLot[]>([]);
  const [mergeLotId, setMergeLotId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rack suggestions come from the racks already in use; the duplicate check
  // only runs for a known catalog wine (a by-hand identity has no id yet).
  useEffect(() => {
    let cancelled = false;
    listMyCellarLots()
      .then((lots) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const l of lots) if (l.storageLocation) set.add(l.storageLocation);
        setRacks(Array.from(set).sort());
      })
      .catch(() => {});
    // A by-hand identity has no catalog id yet, so nothing to check against.
    if (catalogWineId) {
      findMyCellarLotsForWine(catalogWineId)
        .then((lots) => {
          if (cancelled) return;
          setExisting(lots.map((l) => ({ id: l.id, quantity: l.quantity, storageLocation: l.storageLocation })));
          setMergeLotId(lots[0]?.id ?? "");
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [catalogWineId]);

  const fields = (): CellarLotFields => {
    const p = Number.parseFloat(price.replace(",", "."));
    return {
      quantity,
      storageLocation: rack.trim() || null,
      pricePerBottle: Number.isFinite(p) && p >= 0 ? p : null,
      currency: currency || null,
    };
  };

  const merge = async () => {
    if (!mergeLotId || !onMergedIntoLot) return;
    setMerging(true);
    setError(null);
    try {
      await increaseCellarLotQuantity(mergeLotId, quantity);
      await onMergedIntoLot({ lotId: mergeLotId, quantity });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add to that lot.");
    } finally {
      setMerging(false);
    }
  };

  const disabled = busy || merging;
  const showMerge = existing.length > 0 && !!onMergedIntoLot;

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-[auto_1fr] items-end gap-[10px]">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Bottles</span>
          <div className="flex h-11 items-center rounded-[10px] border border-border bg-card">
            <button
              type="button"
              aria-label="One bottle fewer"
              disabled={disabled || quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-full w-11 items-center justify-center text-primary disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-8 text-center font-heading text-[19px] font-semibold lining-nums tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="One bottle more"
              disabled={disabled}
              onClick={() => setQuantity((q) => Math.min(999, q + 1))}
              className="flex h-full w-11 items-center justify-center text-primary disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Rack</span>
          <Input
            list="add-wine-racks"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="e.g. Rack B"
            disabled={disabled}
            className="h-11 rounded-[10px]"
          />
          <datalist id="add-wine-racks">
            {racks.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted-foreground">
          Price per bottle · {currency} (optional)
        </span>
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="—"
          disabled={disabled}
          className="h-11 rounded-[10px]"
        />
      </label>

      {showMerge ? (
        <div className="flex flex-col gap-[8px] rounded-[11px] border border-gold bg-gold/15 p-[11px_13px]">
          <p className="text-[12.5px] font-semibold">You already have this wine in your cellar.</p>
          {existing.length > 1 ? (
            <select
              value={mergeLotId}
              onChange={(e) => setMergeLotId(e.target.value)}
              disabled={disabled}
              className="h-10 rounded-[9px] border border-border bg-card px-2 text-sm"
            >
              {existing.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.quantity} btl{l.storageLocation ? ` · ${l.storageLocation}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {existing[0].quantity} btl
              {existing[0].storageLocation ? ` · ${existing[0].storageLocation}` : ""}
            </p>
          )}
          <div className="flex gap-[8px]">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void merge()}
              className={actionButtonClass("primary", "text-[13.5px] disabled:opacity-60")}
            >
              {merging ? <WineGlassLoader /> : null}
              Add {quantity} to the existing lot
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirm(fields())}
              className={actionButtonClass("outline", "text-[13.5px] disabled:opacity-60")}
            >
              Keep as a separate lot
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onConfirm(fields())}
          className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
        >
          {busy ? <WineGlassLoader /> : null}
          Add to cellar
        </button>
      )}
      {onSecondary ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onSecondary()}
          className={cn(actionButtonClass("outline", "text-[15px] disabled:opacity-60"))}
        >
          {secondaryLabel ?? "Add and scan the next"}
        </button>
      ) : null}
      {error ? <p className="text-[12.5px] text-rose">{error}</p> : null}
    </div>
  );
}
