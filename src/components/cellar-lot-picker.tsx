"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CellarLotOption } from "@/app/cellar/new/actions";

// Shared "pick a bottle from my cellar" list: a search box over the caller's
// in-stock lots, each shown as a two-line row (wine label + size · location ·
// qty). Used by the tasting Add-wine form and Taste & Rate.
export function CellarLotPicker({
  lots,
  onPick,
  selectedLotId,
}: {
  lots: CellarLotOption[] | null;
  onPick: (lot: CellarLotOption) => void;
  /** Highlight the chosen lot (pick-then-confirm flows). */
  selectedLotId?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = lots ?? [];
    return needle
      ? list.filter((l) => l.label.toLowerCase().includes(needle))
      : list;
  }, [lots, q]);

  if (lots === null) {
    return (
      <p className="py-2 text-sm text-muted-foreground">Loading your cellar…</p>
    );
  }
  if (lots.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Your cellar has no bottles in stock.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your cellar…"
      />
      <ul className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
        {filtered.map((l) => {
          const meta = [
            l.bottleSizeMl !== 750 ? `${l.bottleSizeMl} ml` : null,
            l.storageLocation,
            `${l.quantity} btl`,
          ]
            .filter(Boolean)
            .join(" · ");
          const active = l.lotId === selectedLotId;
          return (
            <li key={l.lotId}>
              <button
                type="button"
                onClick={() => onPick(l)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-muted/40"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-xs text-muted-foreground">{meta}</span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">
            No matches in your cellar.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
