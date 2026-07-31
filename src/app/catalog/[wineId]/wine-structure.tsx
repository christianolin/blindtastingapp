import type { WineStructureDimension } from "@/lib/wset/queries";

// Display name per SAT dimension (RPC returns them in WSET order nose -> finish).
const DIM_LABEL: Record<string, string> = {
  nose_intensity: "Nose",
  sweetness: "Sweetness",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol: "Alcohol",
  body: "Body",
  flavour_intensity: "Flavour",
  finish: "Finish",
};

// Ordinal labels index-aligned (1-based) to each enum, to caption the averaged
// bar with the nearest level. All the 5-point scales share the middle three.
const five = (low: string, high: string) => [low, "Medium-", "Medium", "Medium+", high];
const DIM_STOPS: Record<string, string[]> = {
  nose_intensity: five("Light", "Pronounced"),
  flavour_intensity: five("Light", "Pronounced"),
  acidity: five("Low", "High"),
  tannin: five("Low", "High"),
  alcohol: five("Low", "High"),
  body: five("Light", "Full"),
  finish: five("Short", "Long"),
  sweetness: ["Dry", "Off-dry", "Medium-dry", "Medium", "Medium-sweet", "Sweet", "Luscious"],
};

// Read-only community structure profile: one labelled bar per SAT dimension,
// filled to the average ordinal position and captioned with the nearest level.
// Nothing renders until a wine has notes carrying structure (rows is empty).
export function WineStructure({ rows }: { rows: WineStructureDimension[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Nose &amp; palate structure</p>
      <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
        {rows.map((r) => {
          const pct = Math.round((r.avgIndex / r.maxIndex) * 100);
          const stops = DIM_STOPS[r.dimension] ?? [];
          const word =
            stops[Math.min(stops.length - 1, Math.max(0, Math.round(r.avgIndex) - 1))] ?? "";
          return (
            <div key={r.dimension} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground">
                {DIM_LABEL[r.dimension] ?? r.dimension}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-medium">{word}</span>
            </div>
          );
        })}
        <p className="mt-1 text-xs text-muted-foreground">
          Averaged from the community&apos;s tasting notes.
        </p>
      </div>
    </div>
  );
}
