import { Wine, Boxes, Coins, MapPin } from "lucide-react";
import { StatTile } from "@/components/patterns/stat-tile";

// Summary strip at the top of a cellar — shared by the owner view and the
// read-only view of someone else's cellar so the two stay identical. Phones get
// a compact 3-up card; desktop gets roomy tiles. Both finish with a Top-regions
// list (bottle count per region).
export function CellarSummary({
  uniqueWines,
  totalBottles,
  totalValue,
  hasValue,
  topRegions,
  currency,
}: {
  uniqueWines: number;
  totalBottles: number;
  totalValue: number;
  hasValue: boolean;
  topRegions: { name: string; bottles: number }[];
  currency: string;
}) {
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 sm:hidden">
        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          {[
            { value: uniqueWines, label: "unique wines" },
            { value: totalBottles, label: "total bottles" },
            {
              value: hasValue ? Math.round(totalValue).toLocaleString() : "\u2014",
              label: `${currency} value`,
            },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center text-center">
              <span className="font-heading text-lg font-semibold leading-none tabular-nums">
                {s.value}
              </span>
              <span className="mt-1 text-[11px] leading-tight text-muted-foreground">
                {s.label}
              </span>
            </div>
          ))}
        </div>
        {topRegions.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Top regions
            </p>
            <ul className="flex flex-col gap-1">
              {topRegions.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.bottles}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-4 lg:items-start">
        <StatTile icon={Boxes} tint="amber" value={uniqueWines} label="unique wines" />
        <StatTile icon={Wine} tint="rose" value={totalBottles} label="total bottles" />
        <StatTile
          icon={Coins}
          tint="gold"
          value={hasValue ? Math.round(totalValue).toLocaleString() : "\u2014"}
          label={`${currency} value`}
        />
        <div className="rounded-xl border border-border bg-card p-4 sm:col-span-3 lg:col-span-1">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="size-3.5" />
            Top regions
          </p>
          {topRegions.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {topRegions.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {r.bottles}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No regions yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
