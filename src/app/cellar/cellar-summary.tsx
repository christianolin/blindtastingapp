import { Wine, Boxes, Coins, MapPin, CalendarCheck } from "lucide-react";
import { StatTile } from "@/components/patterns/stat-tile";

// Summary strip at the top of a cellar — shared by the owner view and the
// read-only view of someone else's cellar. The owner view passes readyBottles
// (a fourth, actionable KPI); the public view still passes topRegions and
// keeps its three-tile + regions layout.
export function CellarSummary({
  uniqueWines,
  totalBottles,
  totalValue,
  hasValue,
  readyBottles,
  topRegions,
  currency,
}: {
  uniqueWines: number;
  totalBottles: number;
  totalValue: number;
  hasValue: boolean;
  /** Bottles whose drink window is open right now; omit to hide the tile. */
  readyBottles?: number;
  topRegions?: { name: string; bottles: number }[];
  currency: string;
}) {
  const kpis = [
    { value: uniqueWines, label: "unique wines" },
    { value: totalBottles, label: "total bottles" },
    {
      value: hasValue ? Math.round(totalValue).toLocaleString() : "\u2014",
      // "est." because the sum prefers per-wine market estimates over
      // purchase prices — it is a valuation, not a receipt.
      label: `${currency} est. value`,
    },
    ...(readyBottles != null
      ? [{ value: readyBottles, label: "ready to drink" }]
      : []),
  ];
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 sm:hidden">
        <div
          className={
            kpis.length === 4
              ? "grid grid-cols-2 gap-x-2 gap-y-3"
              : "grid grid-cols-3 gap-x-2 gap-y-3"
          }
        >
          {kpis.map((s) => (
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
        {topRegions && topRegions.length > 0 ? (
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
          label={`${currency} est. value`}
        />
        {readyBottles != null ? (
          <StatTile
            icon={CalendarCheck}
            tint="amber"
            value={readyBottles}
            label="ready to drink"
          />
        ) : null}
        {topRegions ? (
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
        ) : null}
      </div>
    </>
  );
}
