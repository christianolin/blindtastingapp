"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { consumeLot } from "@/app/cellar/[lotId]/drink/actions";
import { getLiveTastingName } from "@/app/cellar/lot-actions";
import {
  CANCEL,
  HOW_MANY,
  LOGGED_NOTE,
  NOTE_AFTER,
  NOTE_AFTER_SUB,
  OPTIONAL,
  REASONS,
  REASON_LABELS,
  TITLE,
  WHAT_FOR,
  WHAT_FOR_PLACEHOLDER,
  WHAT_HAPPENED,
  WHEN,
  WHEN_LABELS,
  confirmLabel,
  dateFor,
  isoDate,
  leftLine,
  liveChipLabel,
  subtitleLine,
  type DrinkReason,
  type WhenChoice,
} from "./drink-copy";

export type DrinkLot = {
  lotId: string;
  wineId: string;
  title: string;
  quantity: number;
  place: string | null;
  community: { avg: number | null; count: number };
};

const WHEN_CHOICES: readonly WhenChoice[] = ["today", "yesterday", "date"];

const CHIP_CLASS =
  "min-h-11 flex-1 rounded-[9px] border text-sm font-medium transition-colors";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";
const CHIP_OFF = "border-border bg-background hover:bg-muted";

// "Take it out of the cellar" — a bottom sheet on phones, a centred dialog
// on laptop (CC-U5, spec §5.6, D2). Every field is `consume_cellar_lot`'s
// own shape; the reason drives the confirm button's word and, for Drank,
// whether the note checkbox shows at all (refinement 14).
export function DrinkSheet({
  lot,
  onClose,
  onDone,
}: {
  /** null = closed. */
  lot: DrinkLot | null;
  onClose: () => void;
  onDone: (r: { consumptionId: string; openNote: boolean; wineId: string }) => void;
}) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<DrinkReason>("DRANK");
  const [when, setWhen] = useState<WhenChoice>("today");
  const [picked, setPicked] = useState(() => isoDate(new Date()));
  const [occasion, setOccasion] = useState("");
  const [alsoNote, setAlsoNote] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ id: string; name: string } | null>(null);

  // Resets on every distinct lot the sheet is opened for (not on every
  // re-render of the same lot, which would wipe what the taster is typing).
  // The reset itself runs during render — React's "adjusting state when a
  // prop changes" pattern — rather than as synchronous setState calls inside
  // an effect body, which react-hooks/set-state-in-effect flags as a
  // cascading-render risk.
  const lotId = lot?.lotId ?? null;
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (lotId !== null && lotId !== resetFor) {
    setResetFor(lotId);
    setQty(1);
    setReason("DRANK");
    setWhen("today");
    setPicked(isoDate(new Date()));
    setOccasion("");
    setAlsoNote(true);
    setPending(false);
    setError(null);
    setLive(null);
  }

  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    getLiveTastingName()
      .then((r) => {
        if (!cancelled) setLive(r);
      })
      .catch(() => {
        if (!cancelled) setLive(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  if (!lot) return null;

  const left = leftLine(lot.quantity, qty);

  async function submit() {
    if (!lot) return;
    setPending(true);
    setError(null);
    try {
      const { id } = await consumeLot({
        lotId: lot.lotId,
        quantity: qty,
        consumedOn: dateFor(when, picked, new Date()),
        reason,
        occasion: occasion.trim() || null,
      });
      onDone({
        consumptionId: id,
        openNote: alsoNote && reason === "DRANK",
        wineId: lot.wineId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="inset-x-0 top-auto bottom-0 flex max-h-[92vh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <div className="flex flex-col gap-4 overflow-y-auto p-4 md:p-6">
          <div>
            <DialogTitle>{TITLE}</DialogTitle>
            <p className="font-medium">{lot.title}</p>
            <p className="text-sm text-muted-foreground">{subtitleLine(lot)}</p>
          </div>

          <div>
            <Eyebrow>{HOW_MANY}</Eyebrow>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="min-h-11 min-w-11"
                aria-label="Fewer"
                disabled={qty <= 1 || pending}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus />
              </Button>
              <span className="w-10 text-center font-heading text-2xl tabular-nums">
                {qty}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="min-h-11 min-w-11"
                aria-label="More"
                disabled={qty >= lot.quantity || pending}
                onClick={() => setQty((q) => Math.min(lot.quantity, q + 1))}
              >
                <Plus />
              </Button>
              <span className="text-sm text-muted-foreground">{left.of}</span>
              <span className="text-sm font-medium">{left.left}</span>
              <span className="text-sm text-muted-foreground">{left.after}</span>
            </div>
          </div>

          <div>
            <Eyebrow>{WHAT_HAPPENED}</Eyebrow>
            <div className="mt-2 flex gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  disabled={pending}
                  onClick={() => setReason(r)}
                  className={cn(CHIP_CLASS, reason === r ? CHIP_ON : CHIP_OFF)}
                >
                  {REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Eyebrow>{WHEN}</Eyebrow>
            <div className="mt-2 flex gap-2">
              {WHEN_CHOICES.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={when === w}
                  disabled={pending}
                  onClick={() => setWhen(w)}
                  className={cn(CHIP_CLASS, when === w ? CHIP_ON : CHIP_OFF)}
                >
                  {WHEN_LABELS[w]}
                </button>
              ))}
            </div>
            {when === "date" ? (
              <Input
                type="date"
                value={picked}
                aria-label="Date"
                disabled={pending}
                onChange={(e) => setPicked(e.target.value)}
                className="mt-2 min-h-11"
              />
            ) : null}
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <Eyebrow>{WHAT_FOR}</Eyebrow>
              <span className="text-xs text-muted-foreground">{OPTIONAL}</span>
            </div>
            <Input
              value={occasion}
              placeholder={WHAT_FOR_PLACEHOLDER}
              disabled={pending}
              onChange={(e) => setOccasion(e.target.value)}
              className="mt-2 min-h-11"
            />
            {live ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setOccasion(live.name)}
                className="mt-2 min-h-11 rounded-full border border-gold bg-gold/10 px-3 text-sm text-gold-dark md:pointer-fine:min-h-8"
              >
                {liveChipLabel(live.name)}
              </button>
            ) : null}
          </div>

          {reason === "DRANK" ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoNote}
                disabled={pending}
                onChange={(e) => setAlsoNote(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{NOTE_AFTER}</span>
                <span className="text-muted-foreground">{NOTE_AFTER_SUB}</span>
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <p className="text-xs text-muted-foreground max-md:hidden">{LOGGED_NOTE}</p>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {CANCEL}
            </Button>
            <Button type="button" className="min-h-11" onClick={submit} disabled={pending}>
              {confirmLabel(reason, qty)}
            </Button>
          </div>
          <p className="order-last basis-full text-xs text-muted-foreground md:hidden">
            {LOGGED_NOTE}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
