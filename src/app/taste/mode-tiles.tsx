import Link from "next/link";
import { NotebookPen, EyeOff, ScanEye, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// The Taste launcher. Picking a tile *is* choosing the mode — the blind/
// semi-blind decision moved here from a selector inside the new-tasting form
// (P4). Open note and Training room are solo; Blind and Semi-blind start a
// session. The blindness tiles carry it as a `?mode=` param the new-tasting
// page reads and locks. Training room has no destination yet — it's a teaser
// so the pillar reads complete.
type Mode = {
  href: string;
  icon: typeof NotebookPen;
  title: string;
  body: string;
  tint: string;
};

const MODES: Mode[] = [
  {
    href: "/catalog",
    icon: NotebookPen,
    title: "Open note",
    body: "Bottle open, label in view. Capture a full WSET Level 4 note.",
    tint: "bg-primary/10 text-primary",
  },
  {
    href: "/tastings/new?mode=blind",
    icon: EyeOff,
    title: "Blind",
    body: "Nothing given away. Call every wine from the glass alone.",
    tint: "bg-gold/15 text-gold-deep",
  },
  {
    href: "/tastings/new?mode=semi-blind",
    icon: ScanEye,
    title: "Semi-blind",
    body: "The line-up's on the table. Match each pour to a bottle.",
    tint: "bg-primary/10 text-primary",
  },
];

export function ModeTiles() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MODES.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className="group flex flex-col gap-3 rounded-xl border border-border p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
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
        </Link>
      ))}
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-5 opacity-60">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Target className="size-5" strokeWidth={2} />
        </span>
        <span className="flex items-center gap-2 font-heading text-lg font-medium">
          Training room
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
