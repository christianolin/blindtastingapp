// Pure aggregation for the Cellar Stats tab. Value/holdings use live `quantity`;
// spend uses frozen `purchased_quantity` so drinking bottles never erases spend
// history. Money sums only lots priced in the preferred currency (no conversion).

export type StatLotRow = {
  quantity: number;
  purchasedQuantity: number;
  pricePerBottle: number | null;
  currency: string;
  purchasedOn: string | null;
  drinkFrom: number | null;
  drinkTo: number | null;
  catalogWineId: string;
  colour: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: number | null;
  regionName: string | null;
  countryName: string | null;
};

export type Bar = { label: string; value: number };

export type CellarStats = {
  totalBottles: number;
  distinctWines: number;
  value: number;
  spend: number;
  currency: string;
  mixedCurrency: boolean;
  readiness: Bar[];
  byColour: Bar[];
  byRegion: Bar[];
  byDecade: Bar[];
  spendByYear: Bar[];
};

const COLOUR_ORDER = ["RED", "WHITE", "ROSE", "ORANGE"] as const;
const COLOUR_LABEL: Record<string, string> = {
  RED: "Red",
  WHITE: "White",
  ROSE: "Rosé",
  ORANGE: "Orange",
};

export function computeCellarStats(
  rows: StatLotRow[],
  preferredCurrency: string,
  currentYear: number,
): CellarStats {
  let totalBottles = 0;
  let value = 0;
  let spend = 0;
  let mixedCurrency = false;
  const wines = new Set<string>();

  let readyNow = 0;
  let tooYoung = 0;
  let pastWindow = 0;
  let noWindow = 0;
  const colourCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const spendYear = new Map<number, number>();

  for (const r of rows) {
    const inPref = r.currency === preferredCurrency;
    totalBottles += r.quantity;
    if (r.quantity > 0) wines.add(r.catalogWineId);

    if (r.pricePerBottle != null) {
      if (inPref) {
        value += r.quantity * r.pricePerBottle;
        spend += r.purchasedQuantity * r.pricePerBottle;
      } else {
        mixedCurrency = true;
      }
    }

    if (r.quantity > 0) {
      if (r.drinkFrom == null && r.drinkTo == null) noWindow += r.quantity;
      else if (r.drinkFrom != null && currentYear < r.drinkFrom)
        tooYoung += r.quantity;
      else if (r.drinkTo != null && currentYear > r.drinkTo)
        pastWindow += r.quantity;
      else readyNow += r.quantity;

      const col = r.colour ?? "OTHER";
      colourCounts.set(col, (colourCounts.get(col) ?? 0) + r.quantity);

      const reg = r.regionName ?? r.countryName ?? "Unknown";
      regionCounts.set(reg, (regionCounts.get(reg) ?? 0) + r.quantity);

      const dec =
        r.vintageKind === "YEAR" && r.vintageYear
          ? `${Math.floor(r.vintageYear / 10) * 10}s`
          : "NV";
      decadeCounts.set(dec, (decadeCounts.get(dec) ?? 0) + r.quantity);
    }

    if (r.purchasedOn && r.pricePerBottle != null && inPref) {
      const y = new Date(r.purchasedOn).getUTCFullYear();
      if (!Number.isNaN(y)) {
        spendYear.set(y, (spendYear.get(y) ?? 0) + r.purchasedQuantity * r.pricePerBottle);
      }
    }
  }

  const readiness: Bar[] = [
    { label: "Ready now", value: readyNow },
    { label: "Too young", value: tooYoung },
    { label: "Past window", value: pastWindow },
    { label: "No window", value: noWindow },
  ].filter((b) => b.value > 0);

  const byColour: Bar[] = [];
  for (const c of COLOUR_ORDER) {
    const n = colourCounts.get(c);
    if (n) byColour.push({ label: COLOUR_LABEL[c] ?? c, value: n });
  }
  const other = colourCounts.get("OTHER");
  if (other) byColour.push({ label: "Other", value: other });

  const byRegion: Bar[] = [...regionCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const byDecade: Bar[] = [...decadeCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) =>
      a.label === "NV" ? 1 : b.label === "NV" ? -1 : a.label.localeCompare(b.label),
    );

  const spendByYear: Bar[] = [...spendYear.entries()]
    .map(([y, value]) => ({ label: String(y), value: Math.round(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    totalBottles,
    distinctWines: wines.size,
    value: Math.round(value),
    spend: Math.round(spend),
    currency: preferredCurrency,
    mixedCurrency,
    readiness,
    byColour,
    byRegion,
    byDecade,
    spendByYear,
  };
}
