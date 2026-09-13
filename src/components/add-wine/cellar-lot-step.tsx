"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { actionButtonClass } from "@/components/overview/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { findMyCellarLotsForWine, listMyCellarLots } from "@/app/cellar/new/actions";
import { cn } from "@/lib/utils";
import { existingLotLabel, mergeCardCopy, skippedLotNotice } from "./row-format";
import type { CellarLotStepProps } from "./types";

type ExistingLot = { id: string; quantity: number; storageLocation: string | null };
type Pressed = "add" | "merge" | "separate";

const MAX_BOTTLES = 999;

/**
 * The lot step (B1/B2, and D3's "Add it to my cellar") — round 1's
 * `DestinationFooter` cellar branch, renamed, with its copy unchanged: "Into
 * your cellar", a Bottles stepper, a Rack datalist, an optional price, and the
 * merge card when you already hold the wine. The fields are controlled from
 * `state.lot` through `onField`.
 *
 * Its source is always a catalog wine (the adds hook writes an identity to the
 * catalog first), so the duplicate check (`findMyCellarLotsForWine`) always
 * runs — and the primary waits for it, so a held wine never slips past the
 * merge card. The step writes nothing itself: the primary and "Keep as a
 * separate lot" call `onAdd`, "Add N to the existing lot" calls `onMerge`, and
 * the merge card's quieter "Don't add it" calls `onSkip`, which writes nothing
 * at all (plan amendment 18, D17). There is no secondary button: Many covers
 * repeated scans.
 */
export function CellarLotStep({
  matrix,
  catalogWineId,
  title,
  quantity,
  rack,
  price,
  onField,
  currency,
  busy,
  error,
  onAdd,
  onMerge,
  onSkip,
}: CellarLotStepProps) {
  const rackListId = useId();
  const bottlesId = useId();
  const [racks, setRacks] = useState<string[]>([]);
  // The duplicate check's answer, keyed by the wine it answers.
  const [check, setCheck] = useState<{ catalogWineId: string; lots: ExistingLot[] } | null>(null);
  const [pickedLotId, setPickedLotId] = useState<string | null>(null);
  // Which button started the running add, so only that one shows the loader.
  const [pressed, setPressed] = useState<Pressed | null>(null);

  // Rack suggestions come from the racks already in use.
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    findMyCellarLotsForWine(catalogWineId)
      .then((lots) => {
        if (cancelled) return;
        setCheck({
          catalogWineId,
          lots: lots.map((l) => ({ id: l.id, quantity: l.quantity, storageLocation: l.storageLocation })),
        });
      })
      .catch(() => {
        // A failed check offers a new lot, as round 1 did.
        if (!cancelled) setCheck({ catalogWineId, lots: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogWineId]);

  const existing = check?.catalogWineId === catalogWineId ? check.lots : null;
  const checking = existing === null;
  // The newest lot unless another was picked.
  const mergeLot = existing?.find((l) => l.id === pickedLotId) ?? existing?.[0] ?? null;
  const mergeCard = mergeCardCopy(quantity);
  const [merge, separate, skip] = mergeCard.actions;

  const press = (which: Pressed, run: () => void) => {
    if (busy) return;
    setPressed(which);
    run();
  };
  const loading = (which: Pressed) => busy && pressed === which;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3 p-4 md:p-[18px_22px]">
        <Eyebrow size="md">Into your cellar</Eyebrow>
        {title ? (
          <p className="font-heading text-[21px] font-semibold leading-[1.12]">{title}</p>
        ) : null}
        <p className="text-[12.5px] text-muted-foreground">
          How many bottles, and where do they live? Price is optional.
        </p>
      </div>

      {/* Pinned to the bottom of the sheet's scroll region. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-[10px] border-t border-border bg-background px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4 md:px-[22px]">
        <div className="grid grid-cols-[auto_1fr] items-end gap-[10px]">
          <div className="flex flex-col gap-1">
            <span id={bottlesId} className="text-[11px] font-semibold text-muted-foreground">
              Bottles
            </span>
            <div
              role="group"
              aria-labelledby={bottlesId}
              className="flex h-11 items-center rounded-[10px] border border-border bg-card"
            >
              <button
                type="button"
                aria-label="One bottle fewer"
                disabled={busy || quantity <= 1}
                onClick={() => onField("quantity", Math.max(1, quantity - 1))}
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
                disabled={busy || quantity >= MAX_BOTTLES}
                onClick={() => onField("quantity", Math.min(MAX_BOTTLES, quantity + 1))}
                className="flex h-full w-11 items-center justify-center text-primary disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Rack</span>
            <Input
              list={rackListId}
              value={rack}
              onChange={(e) => onField("rack", e.target.value)}
              placeholder="e.g. Rack B"
              disabled={busy}
              className="h-11 rounded-[10px]"
            />
            <datalist id={rackListId}>
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
            onChange={(e) => onField("price", e.target.value)}
            placeholder="—"
            disabled={busy}
            className="h-11 rounded-[10px]"
          />
        </label>

        {existing && mergeLot ? (
          <div className="flex flex-col gap-[8px] rounded-[11px] border border-gold bg-gold/15 p-[11px_13px]">
            <p className="text-[12.5px] font-semibold">{mergeCard.title}</p>
            {existing.length > 1 ? (
              <select
                aria-label="Which lot"
                value={mergeLot.id}
                onChange={(e) => setPickedLotId(e.target.value)}
                disabled={busy}
                className="h-11 rounded-[9px] border border-border bg-card px-2 text-sm"
              >
                {existing.map((l) => (
                  <option key={l.id} value={l.id}>
                    {existingLotLabel(l)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[12px] text-muted-foreground">{existingLotLabel(mergeLot)}</p>
            )}
            <div className="flex gap-[8px]">
              <button
                type="button"
                disabled={busy}
                onClick={() => press("merge", () => onMerge({ lotId: mergeLot.id, quantity }))}
                className={actionButtonClass("primary", "text-[13.5px] disabled:opacity-60")}
              >
                {loading("merge") ? <WineGlassLoader /> : null}
                {merge.label}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => press("separate", onAdd)}
                className={actionButtonClass("outline", "text-[13.5px] disabled:opacity-60")}
              >
                {loading("separate") ? <WineGlassLoader /> : null}
                {separate.label}
              </button>
            </div>
            {/* Quieter than the two adds: a text button under them, never a
                third outlined one competing with them. */}
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onSkip(mergeLot.id)}
              className="h-auto min-h-11 w-full rounded-[9px] text-[13px] font-semibold whitespace-normal text-muted-foreground hover:bg-gold/20 hover:text-foreground"
            >
              {skip.label}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || checking}
            onClick={() => press("add", onAdd)}
            className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
          >
            {checking || loading("add") ? <WineGlassLoader /> : null}
            {matrix.footer.primary}
          </button>
        )}
        {error ? (
          <p role="alert" className="text-[12.5px] text-rose">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * After "Don't add it" (plan amendment 18, D17): "Not added — it's already in
 * your cellar" with "Open it" on the lot you already have. The shell renders
 * it from `state.skippedLot` on the view the add started from; `onOpen` lets
 * it close the sheet as the link navigates.
 */
export function SkippedLotNotice({
  lotId,
  tone = "light",
  onOpen,
  className,
}: {
  lotId: string;
  tone?: "light" | "dark";
  onOpen?: () => void;
  className?: string;
}) {
  const notice = skippedLotNotice(lotId);
  return (
    <p
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 text-[12.5px]",
        tone === "dark" ? "text-console-ink" : "text-muted-foreground",
        className,
      )}
    >
      <span>{notice.line}</span>
      <Link
        href={notice.href}
        onClick={onOpen}
        className={cn(
          "inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline",
          tone === "dark" ? "text-gold-light" : "text-primary",
        )}
      >
        {notice.open}
      </Link>
    </p>
  );
}
