import { Users, Wine, BookOpen, NotebookPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AppStats } from "@/lib/app-stats";

// >=10k shows "12.4k"; below that shows the exact count.
function formatCount(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

export function AppStatsCards({ stats }: { stats: AppStats }) {
  const tiles = [
    { icon: Users, label: "Members", value: stats.members },
    { icon: Wine, label: "Tastings", value: stats.tastings },
    { icon: BookOpen, label: "Wines catalogued", value: stats.winesCatalogued },
    { icon: NotebookPen, label: "Notes created", value: stats.notesCreated },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t, i) => (
        <Card
          key={t.label}
          className="animate-rise-in gap-2 overflow-hidden py-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <CardContent className="flex flex-col gap-1.5 px-4">
            <t.icon className="size-4 text-gold-deep" strokeWidth={2} />
            <span className="font-heading text-3xl font-semibold tracking-tight">
              {formatCount(t.value)}
            </span>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
