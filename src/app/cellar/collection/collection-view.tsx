import { Card } from "@/components/ui/card";
import { DistributionBar } from "@/components/overview/distribution-bar";
import { Eyebrow } from "@/components/overview/eyebrow";
import { foldOther } from "@/lib/stats-math";
import type { DistributionItem } from "@/lib/overview-types";
import {
  PANEL_TITLES,
  averageTile,
  bestTile,
  bottlesTile,
  panelEyebrow,
  tastedTile,
} from "@/lib/cellar/collection-math";
import type { Bar, CollectionStats } from "@/lib/cellar/types";

// CC-U7, spec §5.8, D4, D5; refinements 10, 11, 17, 23. Server component: no
// hooks, no "use client" — the numbers come from the page's own
// `getCollectionStats` call and never change without a navigation.

const PANEL_ORDER = ["region", "producer", "grape", "colour", "decade"] as const;
type PanelKey = (typeof PANEL_ORDER)[number];

function panelBars(panel: PanelKey, stats: CollectionStats): readonly Bar[] {
  switch (panel) {
    case "region":
      return stats.byRegion;
    case "producer":
      return stats.byProducer;
    case "grape":
      return stats.byGrape;
    case "colour":
      return stats.byColour;
    case "decade":
      return stats.byDecade;
  }
}

/** The bar-chart items for one panel: top 3 + "Other" via `foldOther` for
 * region/producer/grape/colour (sorted by count), but decade is built by
 * hand from `byDecade`'s own newest-first order so the bar still reads
 * chronologically (refinement 10, refinement 11). */
function panelBarItems(panel: PanelKey, bars: readonly Bar[]): DistributionItem[] {
  if (panel === "decade") {
    const head = bars.slice(0, 3).map((b): DistributionItem => ({ label: b.label, count: b.value }));
    const rest = bars.slice(3).reduce((n, b) => n + b.value, 0);
    return rest > 0 ? [...head, { label: "Other", count: rest }] : head;
  }
  return foldOther(
    bars.map((b): DistributionItem => ({ label: b.label, count: b.value })),
    3,
  );
}

export function CollectionView({ stats }: { stats: CollectionStats }): React.JSX.Element {
  if (stats.bottles === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        {/* (plan copy) */}
        <p className="font-heading text-lg font-medium">Nothing to count yet.</p>
        <p className="text-sm text-muted-foreground">
          Add wines to your cellar to see where it comes from and how it has been rated.
        </p>
      </div>
    );
  }

  const bottlesLaptop = bottlesTile(stats, { phone: false });
  const bottlesPhone = bottlesTile(stats, { phone: true });
  const tastedLaptop = tastedTile(stats, { phone: false });
  const tastedPhone = tastedTile(stats, { phone: true });
  const averageLaptop = averageTile(stats, { phone: false });
  const averagePhone = averageTile(stats, { phone: true });
  const best = bestTile(stats);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="font-heading text-3xl font-semibold tabular-nums">
            {bottlesLaptop.value}
          </div>
          <p className="max-md:hidden text-xs text-muted-foreground">{bottlesLaptop.sub}</p>
          <p className="text-xs text-muted-foreground md:hidden">{bottlesPhone.sub}</p>
        </Card>
        <Card className="p-4">
          <Eyebrow className="max-md:hidden">{tastedLaptop.label}</Eyebrow>
          <Eyebrow className="md:hidden">{tastedPhone.label}</Eyebrow>
          <div className="font-heading text-3xl font-semibold tabular-nums">
            {tastedLaptop.value}
          </div>
          <p className="max-md:hidden text-xs text-muted-foreground">{tastedLaptop.sub}</p>
          <p className="text-xs text-muted-foreground md:hidden">{tastedPhone.sub}</p>
        </Card>
        <Card className="p-4">
          <Eyebrow className="max-md:hidden">{averageLaptop.label}</Eyebrow>
          <Eyebrow className="md:hidden">{averagePhone.label}</Eyebrow>
          <div className="font-heading text-3xl font-semibold tabular-nums">
            {averageLaptop.value}
          </div>
          <p className="max-md:hidden text-xs text-muted-foreground">{averageLaptop.sub}</p>
          <p className="text-xs text-muted-foreground md:hidden">{averagePhone.sub}</p>
        </Card>
        <Card className="p-4">
          <Eyebrow>{best.label}</Eyebrow>
          <div className="font-heading text-3xl font-semibold tabular-nums">{best.value}</div>
          <p className="truncate text-xs text-muted-foreground">{best.sub}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PANEL_ORDER.map((panel) => {
          const bars = panelBars(panel, stats);
          if (bars.length === 0) return null;
          const titles = PANEL_TITLES[panel];
          const eyebrow = panelEyebrow(panel, stats);
          return (
            <Card key={panel} className="flex flex-col gap-3 p-4">
              <h3 className="font-heading text-base font-semibold">
                <span className="max-md:hidden">{titles.laptop}</span>
                <span className="md:hidden">{titles.phone}</span>
              </h3>
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <DistributionBar items={panelBarItems(panel, bars)} />
              <div className="flex flex-col gap-1">
                {bars.map((b) => (
                  <div key={b.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{b.label}</span>
                    <span className="tabular-nums text-muted-foreground">{b.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
