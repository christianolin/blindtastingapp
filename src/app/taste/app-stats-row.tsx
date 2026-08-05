import { Users, Wine, BookOpen, NotebookPen } from "lucide-react";
import type { AppStats } from "@/lib/app-stats";

// >=10k shows "12.4k"; below that shows the exact count.
function formatCount(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

// Compact app-wide headline numbers, sitting inside the hero under the actions:
// icon + number/label per item, separated by hairlines (no boxes).
export function AppStatsRow({ stats }: { stats: AppStats }) {
  const items = [
    { icon: Users, label: "Members", value: stats.members },
    { icon: Wine, label: "Tastings", value: stats.tastings },
    { icon: BookOpen, label: "Wines catalogued", value: stats.winesCatalogued },
    { icon: NotebookPen, label: "Notes created", value: stats.notesCreated },
  ];
  return (
    <div className="flex flex-wrap items-center gap-y-4">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`flex items-center gap-2.5 pr-6 sm:pr-8 ${
            i > 0 ? "border-l border-border pl-6 sm:pl-8" : ""
          }`}
        >
          <it.icon className="size-5 shrink-0 text-gold-deep" strokeWidth={1.5} />
          <div className="flex flex-col">
            <span className="font-heading text-xl font-semibold leading-none tracking-tight">
              {formatCount(it.value)}
            </span>
            <span className="text-xs text-muted-foreground">{it.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
