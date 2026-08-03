"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Expandable, in-place list of a place-linked system's members grouped by
// sub-region — replaces the old separate "list" tab, so seeing the cru names is
// a client-side expand with no page navigation. First group open by default.
export function SubregionCrus({
  subregions,
}: {
  subregions: { subregion: string; count: number; members: string[] }[];
}) {
  const [open, setOpen] = useState<string | null>(
    subregions[0]?.subregion ?? null,
  );

  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {subregions.map((s) => {
        const isOpen = open === s.subregion;
        return (
          <div key={s.subregion}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : s.subregion)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="text-sm font-medium">{s.subregion}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {s.count} {s.count === 1 ? "cru" : "crus"}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
            {isOpen ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-3 text-sm text-muted-foreground">
                {s.members.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
