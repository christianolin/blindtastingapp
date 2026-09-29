// Which classification a rendered feature contributes to the map legend (and
// to the ramp latch, fill-palette latchRampedRegions). Only the three classes
// the legend has rows for count: Burgundy's village/premier/grand, Champagne's
// rated villages, Alsace's grand-cru vineyards. Every other level (Bordeaux's
// regional/subregional, the US AVA levels of spec 2026-09-29 D4) is ignored,
// so no region shows an empty "Classification" heading.
export type LegendClass = "grand_cru" | "premier_cru" | "communal";

const LEGEND_CLASSES: ReadonlySet<string> = new Set(["grand_cru", "premier_cru", "communal"]);

export function legendClassOf(p: Record<string, unknown>): LegendClass | null {
  const cls =
    typeof p.classification === "string" && p.classification
      ? p.classification
      : typeof p.level === "string"
        ? p.level
        : null;
  return cls !== null && LEGEND_CLASSES.has(cls) ? (cls as LegendClass) : null;
}
