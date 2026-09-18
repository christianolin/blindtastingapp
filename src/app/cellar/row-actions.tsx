"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BottleRow } from "@/lib/cellar/types";

// Shared row/card callbacks + section shape (CC-U2, spec §5.2–§5.4). Both
// BottleList and BottleGrid import these from here so the frame (CC-U3) hands
// them one definition, not two that could drift.
export type RowCallbacks = {
  /** Phone tap on a row/card; ⋯ "Open the lot" / "Edit lot". */
  onOpenLot: (lotId: string, mode?: "view" | "edit") => void;
  /** Drink / Drink one. */
  onDrink: (lotId: string) => void;
  /** Rate / Rate it / Note (NewNoteModal on the wine). */
  onRate: (wineId: string) => void;
  /** Your score → NoteModal. */
  onOpenNote: (noteId: string, wineId: string) => void;
};

export type SectionHeader = {
  label: string;
  sublabel: string | null;
  line: { phone: string; laptop: string };
};

export type Section = {
  key: string;
  header: SectionHeader | null;
  rows: BottleRow[];
};

// Row hover actions (laptop only — a phone tap opens the sheet instead).
// `compact` swaps the Drink label for the grid's shorter card real estate.
// Rating/noting already has its own always-visible entry point (the card
// foot's "Rate it"/score, the list's Ratings-column "Rate it"/score) so it
// is not duplicated here as a hover button — it lives in the ⋯ menu instead,
// labelled by whether the viewer already has a note on this wine.
export function RowActions({
  lotId,
  wineId,
  readOnly,
  compact,
  hasYours,
  cb,
}: {
  lotId: string;
  wineId: string;
  readOnly: boolean;
  compact?: boolean;
  hasYours: boolean;
  cb: RowCallbacks;
}): React.JSX.Element | null {
  if (readOnly) return null;
  return (
    <div className="flex items-center gap-1.5 opacity-0 transition-opacity max-md:hidden group-hover:opacity-100 focus-within:opacity-100">
      <Button size="sm" onClick={() => cb.onDrink(lotId)}>
        {compact ? "Drink one" : "Drink"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="icon-sm" variant="ghost" aria-label="More" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => cb.onOpenLot(lotId)}>
            Open the lot
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/catalog/${wineId}`} />}>
            Open in catalog
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => cb.onOpenLot(lotId, "edit")}>
            Edit lot
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => cb.onRate(wineId)}>
            {hasYours ? "Write another note" : "Rate it"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
