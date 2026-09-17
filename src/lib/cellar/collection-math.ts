// Pure aggregation for The collection (CC-P5, spec §5.8). No money, no
// readiness — a value/spend panel is D4's explicit non-goal and stays out
// of this module entirely; the only currency-adjacent field anywhere in the
// cellar/catalog redesign (`Paid · … a bottle`) lives in the lot sheet, not
// here.
import { colourWord, fmtAvg, lotTitle, plural } from "./format";
import type { Bar, BottleRow, CollectionStats } from "./types";

export const COLLECTION_TOP = 8;

// (plan copy) — the mock stops at "What is in it, and how it has been
// rated. Your tasting record lives in"; the component appends the
// "Your numbers" link itself.
export const COLLECTION_CAPTION =
  "What is in it, and how it has been rated. Your tasting record lives in";

export const PANEL_TITLES: Record<
  "region" | "producer" | "grape" | "colour" | "decade",
  { laptop: string; phone: string }
> = {
  region: { laptop: "Where it comes from", phone: "Where it comes from" },
  producer: { laptop: "Producers you are deep in", phone: "Deep in" },
  grape: { laptop: "Grapes", phone: "Grapes" },
  colour: { laptop: "Colour", phone: "Colour" },
  decade: { laptop: "Vintages", phone: "Vintages" },
};

/** "2020s" from the vintage year; "No vintage" for NV, tawny, or a missing
 * year (refinement 10 — this is also what pins the bucket last: it is never
 * a real decade so it never wins the newest-first sort). */
export function decadeLabel(
  w: Pick<BottleRow["wine"], "vintageKind" | "vintageYear">,
): string {
  if (w.vintageKind === "YEAR" && w.vintageYear != null) {
    return `${Math.floor(w.vintageYear / 10) * 10}s`;
  }
  return "No vintage";
}

/** Sort key for `byDecade`: the decade's own year, or `-Infinity` for
 * "No vintage" so it always sorts after every real decade when read
 * newest-first (refinement 10). */
function decadeSortKey(label: string): number {
  const n = Number.parseInt(label, 10);
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
}

function bump(
  map: Map<string, number>,
  key: string | null | undefined,
  n: number,
): void {
  if (key == null) return;
  map.set(key, (map.get(key) ?? 0) + n);
}

/** Sorted by value desc, then label asc, capped at `COLLECTION_TOP`. */
function topBars(map: Map<string, number>): Bar[] {
  return [...map.entries()]
    .map(([label, value]): Bar => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, COLLECTION_TOP);
}

/** `fmtAvg`'s half-up rounding to one decimal, as a number rather than its
 * display string, so `CollectionStats.yourAverage`/`.communityAverage` and
 * the tiles built from them never disagree on the rounded value. */
function round1(n: number): number {
  return Number(fmtAvg(n));
}

type WineAgg = {
  yours: number | null;
  avg: number | null;
  title: string;
};

export function collectionStats(rows: readonly BottleRow[]): CollectionStats {
  let bottles = 0;
  const countries = new Set<string>();
  const regions = new Set<string>();
  const producers = new Set<string>();
  const grapes = new Set<string>();
  const years = new Set<number>();

  const regionBottles = new Map<string, number>();
  const producerBottles = new Map<string, number>();
  const grapeBottles = new Map<string, number>();
  const colourBottles = new Map<string, number>();
  const decadeBottles = new Map<string, number>();

  // Every value/panel dimension is counted by bottles across every row, but
  // "tasted"/"toGo"/`yourAverage`/`communityAverage`/`best` are per DISTINCT
  // wine — the same catalog wine can own more than one lot/row. `wineOrder`
  // keeps first-appearance order so ties in `best` go to the first row.
  const wineOrder: string[] = [];
  const wineAggs = new Map<string, WineAgg>();

  for (const row of rows) {
    bottles += row.lot.quantity;

    if (row.wine.country != null) countries.add(row.wine.country);
    if (row.wine.region != null) regions.add(row.wine.region);
    if (row.wine.producer != null) producers.add(row.wine.producer);
    if (row.wine.primaryGrape != null) grapes.add(row.wine.primaryGrape);
    if (row.wine.vintageKind === "YEAR" && row.wine.vintageYear != null) {
      years.add(row.wine.vintageYear);
    }

    bump(regionBottles, row.wine.region, row.lot.quantity);
    bump(producerBottles, row.wine.producer, row.lot.quantity);
    bump(grapeBottles, row.wine.primaryGrape, row.lot.quantity);
    bump(colourBottles, colourWord(row.wine.colour), row.lot.quantity);
    bump(decadeBottles, decadeLabel(row.wine), row.lot.quantity);

    const id = row.wine.catalogWineId;
    if (!wineAggs.has(id)) {
      wineOrder.push(id);
      wineAggs.set(id, {
        yours: row.yours?.score ?? null,
        avg: row.community.avg,
        title: lotTitle(row.wine),
      });
    }
  }

  let tasted = 0;
  let yourSum = 0;
  let commSum = 0;
  let comparable = 0;
  let best: { score: number; title: string } | null = null;

  for (const id of wineOrder) {
    const w = wineAggs.get(id);
    if (!w) continue;
    if (w.yours != null) tasted += 1;
    if (w.yours != null && w.avg != null) {
      yourSum += w.yours;
      commSum += w.avg;
      comparable += 1;
    }
    if (w.avg != null && (best == null || w.avg > best.score)) {
      best = { score: w.avg, title: w.title };
    }
  }

  const wineCount = wineOrder.length;
  const byDecade = [...decadeBottles.entries()]
    .map(([label, value]): Bar => ({ label, value }))
    .sort((a, b) => decadeSortKey(b.label) - decadeSortKey(a.label));

  return {
    bottles,
    wines: wineCount,
    tasted,
    toGo: wineCount - tasted,
    yourAverage: comparable > 0 ? round1(yourSum / comparable) : null,
    communityAverage: comparable > 0 ? round1(commSum / comparable) : null,
    best,
    countries: countries.size,
    regions: regions.size,
    producers: producers.size,
    grapes: grapes.size,
    years: years.size,
    byRegion: topBars(regionBottles),
    byProducer: topBars(producerBottles),
    byGrape: topBars(grapeBottles),
    byColour: topBars(colourBottles),
    byDecade,
  };
}

export function bottlesTile(
  s: CollectionStats,
  opts: { phone: boolean },
): { value: string; sub: string } {
  const wineWord = plural(s.wines, "wine", "wines");
  return {
    value: String(s.bottles),
    sub: opts.phone ? `bottles · ${wineWord}` : `across ${wineWord}`,
  };
}

export function tastedTile(
  s: CollectionStats,
  opts: { phone: boolean },
): { label: string; value: string; sub: string } {
  if (opts.phone) {
    return { label: "tasted", value: String(s.tasted), sub: `${s.toGo} to go` };
  }
  return {
    label: "You have tasted",
    value: String(s.tasted),
    sub: `of the ${s.wines} · ${s.toGo} to go`,
  };
}

export function averageTile(
  s: CollectionStats,
  opts: { phone: boolean },
): { label: string; value: string; sub: string } {
  const label = opts.phone ? "your average" : "Your average";
  if (s.yourAverage == null || s.communityAverage == null) {
    // (plan copy)
    return { label, value: "—", sub: "no wine with both scores yet" };
  }
  const yourAvg = fmtAvg(s.yourAverage);
  const commAvg = fmtAvg(s.communityAverage);
  return {
    label,
    value: yourAvg,
    sub: opts.phone ? `community: ${commAvg}` : `community ${commAvg} on the same wines`,
  };
}

export function bestTile(
  s: CollectionStats,
): { label: string; value: string; sub: string } {
  const label = "Best you own";
  if (s.best == null) {
    // (plan copy)
    return { label, value: "—", sub: "nothing rated yet" };
  }
  return { label, value: fmtAvg(s.best.score), sub: s.best.title };
}

export function panelEyebrow(
  panel: "region" | "producer" | "grape" | "colour" | "decade",
  s: CollectionStats,
): string | null {
  switch (panel) {
    case "region":
      return `${plural(s.countries, "country", "countries")} · ${plural(s.regions, "region", "regions")}`;
    case "producer":
      return plural(s.producers, "producer", "producers");
    case "grape":
      return plural(s.grapes, "grape", "grapes");
    case "colour":
      return null;
    case "decade":
      return plural(s.years, "year", "years");
    default:
      return null;
  }
}
