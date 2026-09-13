"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import { cn } from "@/lib/utils";
import { crossesSeenGlass, dropIndex, reorderIds } from "@/lib/flight-glass-rules";
import { RevealButton } from "./play/reveal-button";
import type { FlightDestination } from "./tasting-add-wine-button";
import { moveFlightGlass } from "./flight-actions";

// The adder's two lines on their own glass (spec §C.5 A1; the D10 knowledge
// rule, §C.9). The page never sets them on anyone else's glass.
export type FlightWineLines = {
  /** A complete glass: "Vietti, Barolo Castiglione 2017". An incomplete one:
      the draft's "Brovia, Barolo Villero", or null when the draft has neither a
      producer nor a wine name. */
  title: string | null;
  /** Laptop form. A complete glass: "Barolo DOCG · Piedmont · Nebbiolo ·
      scanned". An incomplete one: `flightRowNeeds` — "needs a vintage — tap
      Edit to finish" (spec §3.3 item 4, LOBBY-13). */
  meta: string | null;
  /** Phone's compact form (LOBBY-24: no region, no provenance). A complete
      glass: "Barolo DOCG · Nebbiolo". An incomplete one: `describeMissing`'s
      shorter "needs a vintage" (LOBBY-13). */
  metaPhone: string | null;
  /** No answer key yet (D7): the meta line reads in dark gold. */
  incomplete: boolean;
};

// One wine row's display state — all serialisable, computed on the server so the
// client only owns the *order*. `contributorLabel` is the BYO "{name}'s wine"
// label; when null the row is numbered positionally ("Wine {n}") from its live
// index, so numbering updates the instant the list is reordered.
export type FlightWine = {
  id: string;
  contributorLabel: string | null;
  isRevealed: boolean;
  isByo: boolean;
  /** The create sheet's step-2 snapshot (`listFlight`) carries a short identity;
      the lobby renders `lines` instead. */
  identity?: string | null;
  /** Only on the viewer's own glasses. */
  lines?: FlightWineLines | null;
  editable: boolean;
  canReorder: boolean;
  canReveal: boolean;
  /** The table has already seen this glass — revealed, or its reveal has
      started (`is_revealed || reveal_step > 0`). Mirrors `move_flight_glass`'s
      own rule (M6) so a reorder that would renumber it is refused locally,
      before any round trip, by `crossesSeenGlass` (BT-L2). Optional: the
      create sheet's step-2 snapshot never sets it (that flight is always
      DRAFT, so nothing is ever seen there). */
  seen?: boolean;
};

/** A JOINED bring-your-own participant who has not added a bottle yet. */
export type WaitingContributor = { participantId: string; name: string };

// At least 44 px tall on a phone or a tablet; a mouse device at md and up keeps
// the compact sizes.
const TOUCH_BUTTON = "min-h-11 md:pointer-fine:min-h-0";
const TOUCH_ICON = "size-11 md:pointer-fine:size-7";

// `move_flight_glass`'s own sentence for the check `crossesSeenGlass` mirrors
// (M6, 20260914095500_flight_edits_until_first_step.sql): "a glass the table
// has already seen cannot change its number", made presentable the same way
// flight-actions.ts's `asSentence` would.
const SEEN_GLASS_REORDER_REFUSAL =
  "A glass the table has already seen cannot change its number.";

type DragState = {
  pointerId: number;
  id: string;
  startY: number;
  rowIds: string[];
  rowRects: { top: number; height: number }[];
};

// The flight list (spec §3.3 items 4–5; LOBBY-07, LOBBY-21). Reordering is
// optimistic: a drag or a ▲▼ tap shows the swap immediately, moveFlightGlass
// persists it in the background, and useOptimistic falls back to the real
// (server) order the instant the transition settles — on a refusal that is
// simply the order it always was, so nothing needs to be undone by hand.
// Drag handles pointer events directly (not HTML5 dnd, for touch parity),
// mirroring the create sheet's flight step (flight-step.tsx): rects are
// measured once at pointerdown and never re-measured mid-drag, per
// `dropIndex`'s own recipe; only the dragged row's own rect is swapped out at
// drop time, and only the dragged row moves visually (a translateY) while
// dragging — the rest of the list reorders once, at drop.
export function WineFlightList({
  tastingId,
  wines,
  waitingFor,
  destination,
}: {
  tastingId: string;
  wines: FlightWine[];
  /** Bring-your-own: one "waiting for {name} to add it" row each, after the glasses. */
  waitingFor: WaitingContributor[];
  /** This flight: Edit opens the sheet on it. */
  destination: FlightDestination;
}) {
  const { openAddWineSheet } = useAddWine();
  const [optimistic, setOptimistic] = useOptimistic(wines);
  const [, startTransition] = useTransition();
  // Serialise the persistence: rapid clicks and drags stay instant on screen,
  // but the moveFlightGlass writes run one-at-a-time so two overlapping moves
  // can't collide on the (tasting_id, position) unique constraint.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);

  // Drag handles (laptop only, LOBBY-07): every row's DOM node, kept for
  // getBoundingClientRect() at pointerdown.
  const rowElsRef = useRef(new Map<string, HTMLLIElement>());
  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);

  // Both the drag drop and the ▲▼ fallback land here (spec §3.3 item 5): the
  // list reorders optimistically with `reorderIds`, refusing locally with
  // `crossesSeenGlass` before any round trip if the move would renumber a
  // glass the table has already seen — the same rule `move_flight_glass`
  // itself is the floor for.
  function attemptMove(id: string, toIndex: number) {
    const ids = optimistic.map((w) => w.id);
    const after = reorderIds(ids, id, toIndex);
    if (!after || after.every((rid, i) => rid === ids[i])) return;
    const seen = new Set(
      optimistic.filter((w) => w.isRevealed || w.seen).map((w) => w.id),
    );
    if (crossesSeenGlass(ids, after, seen)) {
      setError(SEEN_GLASS_REORDER_REFUSAL);
      return;
    }
    setError(null);
    startTransition(async () => {
      const byId = new Map(optimistic.map((w) => [w.id, w]));
      setOptimistic(after.map((rid) => byId.get(rid)!));
      const run = writeQueue.current.then(() => moveFlightGlass(tastingId, id, toIndex));
      writeQueue.current = run.catch(() => {});
      const result = await run;
      if ("error" in result) setError(result.error);
    });
  }

  function move(id: string, direction: "up" | "down") {
    const idx = optimistic.findIndex((w) => w.id === id);
    if (idx === -1) return;
    attemptMove(id, direction === "up" ? idx : idx + 2);
  }

  function endDrag() {
    dragRef.current = null;
    setDragId(null);
    setDragDy(0);
  }

  function onGripPointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowIds = optimistic.map((w) => w.id);
    const rowRects = rowIds.map((rid) => {
      const rect = rowElsRef.current.get(rid)?.getBoundingClientRect();
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 };
    });
    dragRef.current = { pointerId: e.pointerId, id, startY: e.clientY, rowIds, rowRects };
    setDragId(id);
    setDragDy(0);
  }

  function onGripPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragDy(e.clientY - d.startY);
  }

  function onGripPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      endDrag();
      return;
    }
    const idx = d.rowIds.indexOf(d.id);
    endDrag();
    if (idx === -1) return;
    const rects = d.rowRects.map((r, i) => (i === idx ? { top: e.clientY, height: 0 } : r));
    attemptMove(d.id, dropIndex(rects, e.clientY));
  }

  function onGripPointerCancel(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    endDrag();
  }

  // Edit (the adder only) opens the sheet on the glass's by-hand form (spec
  // §C.8). The glass loads — its answer key or its draft — before the form can
  // take focus, so the sheet focuses the field on a mouse device and only flags
  // it on a touch device (§C.4 rule 9).
  function edit(wineId: string) {
    openAddWineSheet(destination, { start: "byhand", edit: { wineId } });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {optimistic.map((w, i) => {
          const label = w.contributorLabel ?? `Wine ${i + 1}`;
          return (
            <li
              key={w.id}
              ref={(el) => {
                if (el) rowElsRef.current.set(w.id, el);
                else rowElsRef.current.delete(w.id);
              }}
              style={dragId === w.id ? { transform: `translateY(${dragDy}px)` } : undefined}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 text-sm lg:flex-row lg:items-center lg:gap-3",
                dragId === w.id && "relative z-10 border-gold shadow-lg",
              )}
            >
              {/* Drag handle (laptop only, LOBBY-07): the phone row has no
                  handle and relies on ▲▼ instead (LOBBY-24). */}
              {w.canReorder ? (
                <button
                  type="button"
                  aria-label={`Drag to reorder ${label}`}
                  onPointerDown={(e) => onGripPointerDown(e, w.id)}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerCancel}
                  onLostPointerCapture={onGripPointerCancel}
                  className="hidden size-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing lg:flex"
                >
                  <GripVertical className="size-4" />
                </button>
              ) : null}

              <div className="flex min-w-0 items-center justify-between gap-2 lg:w-[104px] lg:shrink-0">
                <span className="min-w-0 truncate font-medium">{label}</span>
                <Badge variant={w.isRevealed ? "default" : "outline"} className="shrink-0 lg:hidden">
                  {w.isRevealed ? "Revealed" : w.isByo ? "Added" : "Hidden"}
                </Badge>
              </div>

              {w.lines && (w.lines.title || w.lines.meta || w.lines.metaPhone) ? (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {w.lines.title ? (
                    <p className="truncate text-[13px] font-semibold">{w.lines.title}</p>
                  ) : null}
                  {w.lines.meta ? (
                    <p
                      className={cn(
                        "hidden text-xs lg:block",
                        // An unfinished glass's needs line wraps rather than
                        // hiding what is missing.
                        w.lines.incomplete
                          ? "font-semibold text-gold-dark"
                          : "truncate text-muted-foreground",
                      )}
                    >
                      {w.lines.meta}
                    </p>
                  ) : null}
                  {w.lines.metaPhone ? (
                    <p
                      className={cn(
                        "text-xs lg:hidden",
                        w.lines.incomplete
                          ? "font-semibold text-gold-dark"
                          : "truncate text-muted-foreground",
                      )}
                    >
                      {w.lines.metaPhone}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Badge
                variant={w.isRevealed ? "default" : "outline"}
                className="hidden shrink-0 lg:inline-flex"
              >
                {w.isRevealed ? "Revealed" : w.isByo ? "Added" : "Hidden"}
              </Badge>

              {w.editable || w.canReorder || w.canReveal ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {w.editable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={TOUCH_BUTTON}
                      onClick={() => edit(w.id)}
                    >
                      Edit
                    </Button>
                  ) : null}
                  {w.canReorder ? (
                    <span className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={TOUCH_ICON}
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(w.id, "up")}
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={TOUCH_ICON}
                        aria-label="Move down"
                        disabled={i === optimistic.length - 1}
                        onClick={() => move(w.id, "down")}
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </span>
                  ) : null}
                  {w.canReveal ? (
                    <RevealButton tastingId={tastingId} wineId={w.id} />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {/* No bring-your-own slots: a JOINED participant without a bottle is a
            waiting row, even while the flight is empty. */}
        {waitingFor.map((p) => (
          <li
            key={`waiting-${p.participantId}`}
            className="rounded-lg border border-dashed border-border p-2.5 text-sm italic text-muted-foreground"
          >
            waiting for {p.name} to add it
          </li>
        ))}
      </ul>
    </div>
  );
}
