"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { countWord } from "@/lib/count-words";
import { saveAllToRatings } from "../record-actions";

// The record's footer actions (S13, S13b; spec §11.3 item 16; Q5).
//
// Laptop: Export outlined (secondary), Save primary — first in DOM order so
// a screen reader meets Save first regardless of viewport, then reordered
// visually with `lg:order-*`. Phone: Save first, Export second (the default
// DOM order, unchanged below `lg`).
//
// "Save all {n} to my ratings" always names the full fully-revealed count
// (spec item 16: "count = fully revealed glasses"), not how many are still
// unsaved — only the disabled state ("All saved to your ratings") depends on
// whether anything is left. `saveAllToRatings` (`record-actions.ts`, BT-R4)
// does the actual write and re-checks CLOSED + host-or-JOINED itself; this
// component only renders its result.
export function RecordActionsBar({
  tastingId,
  revealedCount,
  alreadySaved,
}: {
  tastingId: string;
  revealedCount: number;
  alreadySaved: number;
}): React.JSX.Element {
  const [pending, startTransition] = React.useTransition();
  const [outcome, setOutcome] = React.useState<
    { kind: "saved"; saved: number } | { kind: "error"; message: string } | null
  >(null);

  const everythingSaved = revealedCount > 0 && (outcome?.kind === "saved" || alreadySaved >= revealedCount);

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveAllToRatings(tastingId);
      if ("error" in result) {
        setOutcome({ kind: "error", message: result.error });
      } else {
        setOutcome({ kind: "saved", saved: result.saved });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={handleSave}
          disabled={pending || everythingSaved}
          className="lg:order-2"
        >
          {everythingSaved ? "All saved to your ratings" : `Save all ${countWord(revealedCount)} to my ratings`}
        </Button>
        <Button
          variant="outline"
          render={<a href={`/tastings/${tastingId}/export.csv`} />}
          nativeButton={false}
          className="lg:order-1"
        >
          Export the flight
        </Button>
      </div>
      {outcome?.kind === "saved" ? (
        <p className="text-sm text-muted-foreground">
          Saved {countWord(outcome.saved)} {outcome.saved === 1 ? "note" : "notes"} to{" "}
          <Link href="/taste/notes" className="text-primary transition-colors hover:text-primary/80">
            Tasting notes
          </Link>
        </p>
      ) : null}
      {outcome?.kind === "error" ? (
        <p className="text-sm text-destructive">{outcome.message}</p>
      ) : null}
    </div>
  );
}
