"use client";

import { useMemo, useState } from "react";
import { Wine } from "lucide-react";
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
      {/* No inner scroll area: the containing modal/page already scrolls, and a
          nested one gave two competing scrollbars (owner: "drop the double
          scroll wheel"). */}
      <ul className="flex flex-col gap-1">
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
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-muted/40"
                    : "border-border hover:bg-muted/40",
                )}
              >
                {/* The label photo makes a bottle recognisable at a glance;
                    lots without one keep the neutral glass placeholder. */}
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.imageUrl}
                    alt=""
                    width={32}
                    height={42}
                    loading="lazy"
                    decoding="async"
                    className="h-[42px] w-8 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-[42px] w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                    <Wine className="size-4" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{l.label}</span>
                  <span className="text-xs text-muted-foreground">{meta}</span>
                </span>
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
