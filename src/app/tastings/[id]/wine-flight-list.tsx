"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevealButton } from "./play/reveal-button";
import { moveWine } from "./actions";

// One wine row's display state — all serialisable, computed on the server so the
// client only owns the *order*. `contributorLabel` is the BYO "{name}'s wine"
// label; when null the row is numbered positionally ("Wine {n}") from its live
// index, so numbering updates the instant the list is reordered.
export type FlightWine = {
  id: string;
  contributorLabel: string | null;
  isRevealed: boolean;
  isByo: boolean;
  identity: string | null;
  editable: boolean;
  canReorder: boolean;
  canReveal: boolean;
};

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

// The draft flight list. Reordering is optimistic: the swap shows immediately,
// moveWine persists it in the background, and when its revalidate refreshes the
// server component the real (now-reordered) data seamlessly replaces the guess.
export function WineFlightList({
  tastingId,
  wines,
}: {
  tastingId: string;
  wines: FlightWine[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(wines);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      setOptimistic((prev) => reorder(prev, id, direction));
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("wine_id", id);
      fd.set("direction", direction);
      await moveWine(fd);
    });
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
          {w.identity ? (
            <p className="truncate text-xs text-muted-foreground">
              {w.identity}
            </p>
          ) : null}
          {w.editable || w.canReorder || w.canReveal ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {w.editable ? (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link href={`/tastings/${tastingId}/wines/${w.id}/edit`} />
                  }
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
                    aria-label="Move up"
                    disabled={pending || i === 0}
                    onClick={() => move(w.id, "up")}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={pending || i === optimistic.length - 1}
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
    </ul>
  );
}
