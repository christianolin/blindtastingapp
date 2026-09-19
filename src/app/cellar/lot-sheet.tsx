"use client";

// The lot sheet (CC-U4, spec §5.5, D6; refinements 4, 12, 13): everything
// about one cellar lot in a client sheet over the Bottles page — the old
// /cellar/[lotId]/drink and /cellar/[lotId]/edit pages collapsed into one
// place that never loses the frame's filters, page or place behind it.
//
// Loading and failure copy match `NoteModal`'s own pattern (plan copy): while
// `data` hasn't resolved, the dialog shows only a centred line and an
// sr-only title, no header chrome — Escape and the backdrop still close it,
// the Dialog's own behaviour.
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Minus, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eyebrow } from "@/components/overview/eyebrow";
import { cn } from "@/lib/utils";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import {
  addBottles,
  deleteLot,
  loadLotSheet,
  type LotFields,
} from "@/app/cellar/lot-actions";
import {
  addedMonth,
  colourWord,
  dayMonthYear,
  fmtAvg,
  lotTitle,
  sizeLabel,
  sizeSub,
} from "@/lib/cellar/format";
import { friendsLine, spreadLine } from "@/lib/cellar/rating-spread";
import type {
  BottleLot,
  BottleRow,
  BottleWine,
  ConsumptionReason,
  LotSheetData,
} from "@/lib/cellar/types";
import { LotEditForm } from "./lot-edit-form";

export type LotSheetProps = {
  /** null = closed. */
  lotId: string | null;
  initialMode: "view" | "edit";
  onClose: () => void;
  /** The frame opens `DrinkSheet` over this sheet. */
  onDrink: (row: BottleRow) => void;
  /** `NewNoteModal`; `consumptionId` links a past drink's note. */
  onRate: (wineId: string, consumptionId: string | null) => void;
  /** `NoteModal`. */
  onOpenNote: (noteId: string, wineId: string) => void;
  /** After update / add / delete: the frame `router.refresh()`es. */
  onChanged: () => void;
  /** Bump to reload after a drink logged over this sheet. */
  reloadKey: number;
};

const ACTION_WORDS: Record<ConsumptionReason, string> = {
  DRANK: "Drank",
  GIFTED: "Gifted",
  LOST: "Lost",
  OTHER: "Removed",
};

/** The identity line under the title: grape · colour · appellation ·
 * "{region}, {country}" — each part dropped when it is absent. */
function identityLine(w: BottleWine): string {
  const regionCountry =
    w.region && w.country ? `${w.region}, ${w.country}` : (w.region ?? w.country ?? null);
  return [w.primaryGrape, colourWord(w.colour), w.appellation, regionCountry]
    .filter((v): v is string => Boolean(v))
    .join(" · ");
}

function drinkWindowText(from: number | null, to: number | null): string {
  // (plan copy)
  if (from == null && to == null) return "No window yet";
  return `${from ?? "?"}–${to ?? "?"}`;
}

function lotFieldsFrom(lot: BottleLot): LotFields {
  return {
    quantity: lot.quantity,
    bottleSizeMl: lot.bottleSizeMl,
    pricePerBottle: lot.pricePerBottle,
    currency: lot.currency,
    purchasedOn: lot.purchasedOn,
    purchaseSource: lot.purchaseSource,
    drinkFrom: lot.drinkFrom,
    drinkTo: lot.drinkTo,
    storageLocation: lot.storageLocation,
    lotNote: lot.lotNote,
  };
}

export function LotSheet(props: LotSheetProps) {
  const {
    lotId,
    initialMode,
    onClose,
    onDrink,
    onRate,
    onOpenNote,
    onChanged,
    reloadKey,
  } = props;

  const [data, setData] = useState<LotSheetData | null | "loading" | "failed">(
    "loading",
  );
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [editFocus, setEditFocus] = useState<"drinkFrom" | null>(null);
  const [adding, setAdding] = useState(false);
  const [addCount, setAddCount] = useState("1");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [bump, setBump] = useState(0);
  const formId = useId();
  const addRowRef = useRef<HTMLDivElement | null>(null);

  // Two "adjust state when a prop changes" resets, done during render (React's
  // own pattern for this) rather than as synchronous setState calls inside an
  // effect body, which react-hooks/set-state-in-effect flags as a cascading-
  // render risk (the same technique `drink-sheet.tsx`'s `resetFor` uses).
  //
  // The sheet's own UI state (mode, the add row, menus, errors) resets only
  // when the lot itself changes — not when the frame merely bumps
  // `reloadKey`/`bump` to refresh the same lot's data.
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (lotId !== resetFor) {
    setResetFor(lotId);
    if (lotId !== null) {
      setMode(initialMode);
      setEditFocus(null);
      setAdding(false);
      setAddCount("1");
      setError(null);
      setMenuOpen(false);
      setArmedAt(null);
    }
  }

  // `data` drops to "loading" the moment the lot, or a reload signal, changes
  // — tracked separately, since a reload should not also reset the UI state
  // above.
  const requestKey = lotId === null ? null : `${lotId}:${reloadKey}:${bump}`;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (requestKey !== null && requestKey !== loadedFor) {
    setLoadedFor(requestKey);
    setData("loading");
  }

  useEffect(() => {
    if (lotId === null) return;
    let cancelled = false;
    loadLotSheet(lotId)
      .then((result) => {
        if (!cancelled) setData(result ?? "failed");
      })
      .catch(() => {
        if (!cancelled) setData("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [lotId, reloadKey, bump]);

  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  // Equivalent to twoTapState(armedAt, Date.now()) — the timeout above
  // already clears armedAt once the window elapses, so "armed" needs no
  // impure clock read during render.
  const tapState: TwoTapState = armedAt === null ? "idle" : "armed";

  useEffect(() => {
    if (adding) addRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [adding]);

  function triggerReload() {
    setBump((b) => b + 1);
  }

  function handleEditCancel() {
    setMode("view");
  }

  function handleEditSaved() {
    setMode("view");
    triggerReload();
    onChanged();
  }

  function handleEditDeleted() {
    onChanged();
    onClose();
  }

  async function handleAddBottles() {
    if (lotId === null) return;
    const n = Number(addCount);
    setPending(true);
    setError(null);
    const result = await addBottles(lotId, n);
    setPending(false);
    if (result) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setAddCount("1");
    triggerReload();
    onChanged();
  }

  async function handleDelete() {
    if (lotId === null) return;
    setPending(true);
    const result = await deleteLot(lotId);
    setPending(false);
    if (result) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  function stepAddCount(delta: number) {
    const current = Number(addCount) || 1;
    setAddCount(String(Math.min(999, Math.max(1, current + delta))));
  }

  const loaded = data !== "loading" && data !== "failed" && data !== null;

  return (
    <Dialog
      open={lotId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:max-w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "bg-card text-foreground",
        )}
      >
        {!loaded ? (
          <>
            <DialogTitle className="sr-only">Lot</DialogTitle>
            {/* (plan copy) */}
            <p className="py-10 text-center text-sm text-muted-foreground">
              {data === "loading" ? "Loading…" : "Couldn't load this lot right now."}
            </p>
          </>
        ) : (
          <LoadedLotSheet
            data={data}
            mode={mode}
            editFocus={editFocus}
            adding={adding}
            addCount={addCount}
            pending={pending}
            error={error}
            menuOpen={menuOpen}
            tapState={tapState}
            formId={formId}
            addRowRef={addRowRef}
            onClose={onClose}
            onDrink={onDrink}
            onRate={onRate}
            onOpenNote={onOpenNote}
            setMode={setMode}
            setEditFocus={setEditFocus}
            setAdding={setAdding}
            setMenuOpen={setMenuOpen}
            setArmedAt={setArmedAt}
            onStepAddCount={stepAddCount}
            onAddBottles={() => void handleAddBottles()}
            onArmOrDelete={() => {
              if (tapState !== "armed") {
                setArmedAt(Date.now());
                return;
              }
              setArmedAt(null);
              setMenuOpen(false);
              void handleDelete();
            }}
            onEditCancel={handleEditCancel}
            onEditSaved={handleEditSaved}
            onEditDeleted={handleEditDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Split out of `LotSheet` so the loading/failure branch above stays a plain,
// cheap render — everything below only runs once `data` is a real
// `LotSheetData`, so it can destructure `row`/`wine`/`lot` without repeating
// the loaded-guard on every field.
function LoadedLotSheet({
  data,
  mode,
  editFocus,
  adding,
  addCount,
  pending,
  error,
  menuOpen,
  tapState,
  formId,
  addRowRef,
  onClose,
  onDrink,
  onRate,
  onOpenNote,
  setMode,
  setEditFocus,
  setAdding,
  setMenuOpen,
  setArmedAt,
  onStepAddCount,
  onAddBottles,
  onArmOrDelete,
  onEditCancel,
  onEditSaved,
  onEditDeleted,
}: {
  data: LotSheetData;
  mode: "view" | "edit";
  editFocus: "drinkFrom" | null;
  adding: boolean;
  addCount: string;
  pending: boolean;
  error: string | null;
  menuOpen: boolean;
  tapState: TwoTapState;
  formId: string;
  addRowRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onDrink: (row: BottleRow) => void;
  onRate: (wineId: string, consumptionId: string | null) => void;
  onOpenNote: (noteId: string, wineId: string) => void;
  setMode: (m: "view" | "edit") => void;
  setEditFocus: (f: "drinkFrom" | null) => void;
  setAdding: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
  setArmedAt: (v: number | null) => void;
  onStepAddCount: (delta: number) => void;
  onAddBottles: () => void;
  onArmOrDelete: () => void;
  onEditCancel: () => void;
  onEditSaved: () => void;
  onEditDeleted: () => void;
}) {
  const { row, yours, community, history } = data;
  const { lot, wine } = row;

  function openEdit(focus: "drinkFrom" | null) {
    setEditFocus(focus);
    setMode("edit");
  }

  const header = (
    <header className="flex shrink-0 items-start gap-3 border-b border-border p-[12px_16px] md:p-[20px_24px_16px]">
      <div className="min-w-0 flex-1">
        <Eyebrow size="md">{mode === "edit" ? "Edit lot" : "In your cellar"}</Eyebrow>
        <DialogTitle className="font-heading text-[20px] md:text-[27px]">
          {lotTitle(wine)}
        </DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">{identityLine(wine)}</p>
        <Link
          href={`/catalog/${wine.catalogWineId}`}
          className="relative mt-1 inline-block text-sm font-medium text-primary hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3 max-md:after:content-['']"
        >
          Catalog →
        </Link>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <X className="size-5" />
      </button>
    </header>
  );

  const viewBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-[14px_16px] md:p-[18px_24px]">
      {error && !adding ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <Eyebrow>Your note</Eyebrow>
          {yours ? (
            <>
              <p className="font-heading text-3xl text-primary">{yours.score}</p>
              <p className="text-sm">{yours.band}</p>
              <p className="max-md:hidden text-xs text-muted-foreground">
                Written {dayMonthYear(yours.tastedOn)} · {yours.assessed.done} of{" "}
                {yours.assessed.total} assessed
              </p>
              <p className="text-xs text-muted-foreground md:hidden">
                {dayMonthYear(yours.tastedOn)} · {yours.assessed.done} of{" "}
                {yours.assessed.total}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-['']"
                  onClick={() => onOpenNote(yours.noteId, wine.catalogWineId)}
                >
                  Open the note
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="max-md:hidden"
                  onClick={() => onRate(wine.catalogWineId, null)}
                >
                  write another
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-muted-foreground">—</span>
              <Button size="sm" onClick={() => onRate(wine.catalogWineId, null)}>
                Rate it
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background p-3">
          <Eyebrow>Community rating</Eyebrow>
          <p className="font-heading text-3xl text-gold-dark">{fmtAvg(community.avg)}</p>
          <p className="max-md:hidden text-sm">{spreadLine(community, { phone: false })}</p>
          <p className="text-sm md:hidden">{spreadLine(community, { phone: true })}</p>
          <Link
            href={`/catalog/${wine.catalogWineId}`}
            className="relative text-sm font-medium text-primary hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3 max-md:after:content-['']"
          >
            Read them
          </Link>
          {friendsLine(community) ? (
            <p className="max-md:hidden text-xs text-muted-foreground">
              {friendsLine(community)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Eyebrow>Bottles</Eyebrow>
          <p className="font-medium">{lot.quantity} left</p>
          <p className="text-xs text-muted-foreground">of {lot.purchasedQuantity} bought</p>
        </div>
        <div>
          <Eyebrow>Size</Eyebrow>
          <p className="font-medium">{sizeLabel(lot.bottleSizeMl)}</p>
          {sizeSub(lot.bottleSizeMl) ? (
            <p className="text-xs text-muted-foreground">{sizeSub(lot.bottleSizeMl)}</p>
          ) : null}
        </div>
        <div>
          <Eyebrow>Where</Eyebrow>
          <p className="font-medium">{lot.storageLocation ?? "No place set"}</p>
          <p className="text-xs text-muted-foreground">free text — group by it</p>
        </div>
        <div>
          <Eyebrow>Added</Eyebrow>
          <p className="font-medium">{addedMonth(lot)}</p>
          {lot.purchaseSource ? (
            <p className="text-xs text-muted-foreground">from {lot.purchaseSource}</p>
          ) : null}
        </div>
        {lot.pricePerBottle != null ? (
          <div>
            <Eyebrow>Paid</Eyebrow>
            <p className="font-medium">
              {lot.pricePerBottle.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              {lot.currency} a bottle
            </p>
          </div>
        ) : null}
      </div>

      {adding ? (
        <div
          ref={addRowRef}
          className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
        >
          {/* (plan copy) */}
          <Eyebrow>How many to add</Eyebrow>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label="How many to add"
              className="flex h-11 items-center rounded-[10px] border border-border bg-card"
            >
              <button
                type="button"
                aria-label="One fewer"
                disabled={pending || Number(addCount) <= 1}
                onClick={() => onStepAddCount(-1)}
                className="flex h-full w-11 items-center justify-center text-primary disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-8 text-center font-heading text-[19px] font-semibold tabular-nums">
                {addCount}
              </span>
              <button
                type="button"
                aria-label="One more"
                disabled={pending || Number(addCount) >= 999}
                onClick={() => onStepAddCount(1)}
                className="flex h-full w-11 items-center justify-center text-primary disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button type="button" className="min-h-11" disabled={pending} onClick={onAddBottles}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <Eyebrow>This lot so far</Eyebrow>
        {/* (plan copy) */}
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing has left this lot yet.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {history.map((c) => {
              const note = c.note;
              return (
              <div key={c.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {dayMonthYear(c.consumedOn)}
                </span>
                <span>
                  {c.reason === "DRANK" && c.tasting ? (
                    <>
                      {ACTION_WORDS.DRANK} {c.quantity} at{" "}
                      <Link
                        href={`/tastings/${c.tasting.id}`}
                        className="relative font-medium text-primary hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3 max-md:after:content-['']"
                      >
                        {c.tasting.name}
                      </Link>
                    </>
                  ) : (
                    <>
                      {ACTION_WORDS[c.reason]} {c.quantity}
                      {c.occasion ? ` · ${c.occasion}` : ""}
                    </>
                  )}
                </span>
                <span className="text-muted-foreground">·</span>
                {note ? (
                  <button
                    type="button"
                    onClick={() => onOpenNote(note.id, wine.catalogWineId)}
                    className="relative font-medium text-primary underline-offset-2 hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3 max-md:after:content-['']"
                  >
                    {note.score != null ? `note ${note.score}` : "note"}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">no note</span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2.5 max-md:after:content-['']"
                      onClick={() => onRate(wine.catalogWineId, c.id)}
                    >
                      + Note
                    </Button>
                  </span>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Eyebrow>Your note on this lot.</Eyebrow>
        <p className="mt-1 whitespace-pre-line text-sm">{lot.lotNote ?? "—"}</p>
        <Button
          variant="ghost"
          size="sm"
          className="relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-['']"
          onClick={() => openEdit(null)}
        >
          Edit
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Eyebrow>Drink window</Eyebrow>
        <span>{drinkWindowText(lot.drinkFrom, lot.drinkTo)}</span>
        <span className="text-muted-foreground">· yours, and shown only here</span>
        <Button
          variant="ghost"
          size="sm"
          className="relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-['']"
          onClick={() => openEdit("drinkFrom")}
        >
          Edit
        </Button>
      </div>
    </div>
  );

  const viewFooter = (
    <footer className="shrink-0 border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] md:p-[16px_24px]">
      <div className="max-md:hidden flex justify-end gap-2">
        <Button variant="outline" onClick={() => openEdit(null)}>
          Edit lot
        </Button>
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add bottles
        </Button>
        <Button onClick={() => onDrink(row)} disabled={lot.quantity === 0}>
          Drink one
        </Button>
      </div>
      <div className="flex gap-2 md:hidden">
        <Button
          className="min-h-11 flex-1"
          onClick={() => onDrink(row)}
          disabled={lot.quantity === 0}
        >
          Drink one
        </Button>
        {yours ? (
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            onClick={() => onOpenNote(yours.noteId, wine.catalogWineId)}
          >
            Open the note
          </Button>
        ) : (
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            onClick={() => onRate(wine.catalogWineId, null)}
          >
            Rate it
          </Button>
        )}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setArmedAt(null);
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="More"
                className="relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 max-md:after:content-['']"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11" onClick={() => setAdding(true)}>
              Add bottles
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => openEdit(null)}>
              Edit lot
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              variant="destructive"
              closeOnClick={false}
              onClick={onArmOrDelete}
            >
              {/* (plan copy) */}
              {tapState === "armed" ? "Tap again to delete" : "Delete lot"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  );

  const editBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[14px_16px] md:p-[18px_24px]">
      <LotEditForm
        lotId={lot.id}
        initial={lotFieldsFrom(lot)}
        focus={editFocus}
        formId={formId}
        onSaved={onEditSaved}
        onCancel={onEditCancel}
        onDeleted={onEditDeleted}
      />
    </div>
  );

  const editFooter = (
    <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] md:p-[16px_24px]">
      {/* (plan copy) */}
      <Button type="button" variant="outline" onClick={onEditCancel}>
        Cancel
      </Button>
      <Button type="submit" form={formId}>
        Save changes
      </Button>
    </footer>
  );

  return (
    <>
      {header}
      {mode === "edit" ? editBody : viewBody}
      {mode === "edit" ? editFooter : viewFooter}
    </>
  );
}
