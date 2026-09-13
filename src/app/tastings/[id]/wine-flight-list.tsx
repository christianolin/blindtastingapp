"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import { cn } from "@/lib/utils";
import { RevealButton } from "./play/reveal-button";
import type { FlightDestination } from "./tasting-add-wine-button";
import { moveWine } from "./actions";

// The adder's two lines on their own glass (spec §C.5 A1; the D10 knowledge
// rule, §C.9). The page never sets them on anyone else's glass.
export type FlightWineLines = {
  /** A complete glass: "Vietti, Barolo Castiglione 2017". An incomplete one:
      the draft's "Brovia, Barolo Villero", or null when the draft has neither a
      producer nor a wine name. */
  title: string | null;
  /** A complete glass: "Barolo DOCG · Piedmont · Nebbiolo · scanned". An
      incomplete one: "needs a vintage — tap Edit to finish". */
  meta: string | null;
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
};

/** A JOINED bring-your-own participant who has not added a bottle yet. */
export type WaitingContributor = { participantId: string; name: string };

// At least 44 px tall on a phone or a tablet; a mouse device at md and up keeps
// the compact sizes.
const TOUCH_BUTTON = "min-h-11 md:pointer-fine:min-h-0";
const TOUCH_ICON = "size-11 md:pointer-fine:size-7";

// Swap a wine one step up/down — the client-side mirror of the server's
// position swap, so the optimistic list matches what moveWine will persist.
function reorder(
  list: FlightWine[],
  id: string,
  direction: "up" | "down",
): FlightWine[] {
  const idx = list.findIndex((w) => w.id === id);
  if (idx === -1) return list;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

// The flight list. Reordering is optimistic: the swap shows immediately,
// moveWine persists it in the background, and when its revalidate refreshes the
// server component the real (now-reordered) data seamlessly replaces the guess.
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
  // Serialise the persistence: rapid clicks stay instant on screen, but the
  // moveWine writes run one-at-a-time so two overlapping swaps can't collide on
  // the (tasting_id, position) unique constraint via the shared temp slot.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      setOptimistic((prev) => reorder(prev, id, direction));
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("wine_id", id);
      fd.set("direction", direction);
      const run = writeQueue.current.then(() => moveWine(fd));
      writeQueue.current = run.catch(() => {});
      await run;
    });
  }

  // Edit (the adder only) opens the sheet on the glass's by-hand form (spec
  // §C.8). The glass loads — its answer key or its draft — before the form can
  // take focus, so the sheet focuses the field on a mouse device and only flags
  // it on a touch device (§C.4 rule 9).
  function edit(wineId: string) {
    openAddWineSheet(destination, { start: "byhand", edit: { wineId } });
  }

  return (
    <ul className="flex flex-col gap-2">
      {optimistic.map((w, i) => (
        <li
          key={w.id}
          className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2.5 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">
              {w.contributorLabel ?? `Wine ${i + 1}`}
            </span>
            <Badge
              variant={w.isRevealed ? "default" : "outline"}
              className="shrink-0"
            >
              {w.isRevealed ? "Revealed" : w.isByo ? "Added" : "Hidden"}
            </Badge>
          </div>
          {w.lines && (w.lines.title || w.lines.meta) ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              {w.lines.title ? (
                <p className="truncate text-[13px] font-semibold">
                  {w.lines.title}
                </p>
              ) : null}
              {w.lines.meta ? (
                <p
                  className={cn(
                    "text-xs",
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
            </div>
          ) : null}
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
      ))}
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
  );
}
