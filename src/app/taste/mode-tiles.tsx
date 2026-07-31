"use client";

import { NotebookPen, EyeOff, ScanEye, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTasteLauncher, type TasteKind } from "@/components/taste-launcher-context";

// The Taste launcher. Each tile opens a popup: Taste Blind / Taste Semi-Blind
// start a session; Taste & Rate finds a wine to note. Training Room is a teaser
// so the pillar reads complete.
type Mode = {
  kind: TasteKind;
  icon: typeof NotebookPen;
  title: string;
  body: string;
  tint: string;
};

const MODES: Mode[] = [
  {
    kind: "blind",
    icon: EyeOff,
    title: "Taste Blind",
    body: "Nothing given away. Call every wine from the glass alone.",
    tint: "bg-gold/15 text-gold-deep",
  },
  {
    kind: "semi-blind",
    icon: ScanEye,
    title: "Taste Semi-Blind",
    body: "The line-up's on the table. Match each pour to a bottle.",
    tint: "bg-primary/10 text-primary",
  },
  {
    kind: "rate",
    icon: NotebookPen,
    title: "Taste & Rate",
    body: "Bottle open, label in view. Capture a full WSET Level 4 note.",
    tint: "bg-primary/10 text-primary",
  },
];

export function ModeTiles() {
  const { openTaste } = useTasteLauncher();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MODES.map((m) => (
        <button
          key={m.kind}
          type="button"
          onClick={() => openTaste(m.kind)}
          className="group flex flex-col gap-3 rounded-xl border border-border p-5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              m.tint,
            )}
          >
            <m.icon className="size-5" strokeWidth={2} />
          </span>
          <span className="font-heading text-lg font-medium">{m.title}</span>
          <span className="text-sm text-muted-foreground">{m.body}</span>
        </button>
      ))}
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-5 opacity-60">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Target className="size-5" strokeWidth={2} />
        </span>
        <span className="flex items-center gap-2 font-heading text-lg font-medium">
          Training Room
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        </span>
        <span className="text-sm text-muted-foreground">
          Drill against typical-wine profiles and track your accuracy.
        </span>
      </div>
    </div>
  );
}
