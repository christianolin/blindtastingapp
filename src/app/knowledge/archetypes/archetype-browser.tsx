"use client";

import { useState } from "react";
import { Wine } from "lucide-react";
import { ArchetypeModal } from "@/components/wset/archetype-modal";

export type ArchetypeCard = {
  id: string;
  name: string;
  colour: string;
  style: string;
  placeName: string;
};

const COLOUR_HEX: Record<string, string> = {
  RED: "#8E1F3B",
  WHITE: "#B78E42",
  ROSE: "#D98A9E",
  ORANGE: "#C0692E",
};
const cap = (s: string) => (s ? s.slice(0, 1) + s.slice(1).toLowerCase() : s);

// Browse all typical wines; a card opens the same read-only reference sheet the
// map popup uses.
export function ArchetypeBrowser({ items }: { items: ArchetypeCard[] }) {
  const [open, setOpen] = useState<ArchetypeCard | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(a)}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex items-center gap-2">
              <Wine
                className="size-5 shrink-0"
                style={{ color: COLOUR_HEX[a.colour] ?? "#8A8A85" }}
              />
              <span className="font-medium">{a.name}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {[a.placeName, cap(a.colour), cap(a.style)].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
      </div>
      {open ? (
        <ArchetypeModal
          id={open.id}
          name={open.name}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
