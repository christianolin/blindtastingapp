// The country chip row under the Map detail switch (spec 2026-09-23 §7.1).
// The rule and the arithmetic are here, and the component only renders. Chips
// come from the place tree's roots, but only those of kind COUNTRY. A
// verified place whose parent is unpublished is a root too.
import type { WinePlaceTreeNode } from "./tree";
import { englishName } from "./localize-names";

export type CountryChip = {
  key: string;
  label: string;
  /** Set on a local name, so a screen reader says "Deutschland" in German. */
  lang: string | undefined;
  /** Visible places in this country under the active filter; null = no filter. */
  count: number | null;
};

// The language of each country's local name, by canonical key.
const LOCAL_LANG: Record<string, string> = {
  france: "fr",
  germany: "de",
  italy: "it",
  portugal: "pt",
  spain: "es",
};

/** The chips in the order the viewer reads them: collated on the DISPLAYED
    name in the active label language. The tree sorts by key (france, germany,
    …), which in local mode reads "France, Deutschland, Italia, …", alphabetical
    in neither language. */
export function countryChips(
  roots: readonly WinePlaceTreeNode[],
  opts: { english: boolean; visibleKeys: readonly string[] | null },
): CountryChip[] {
  let counts: Map<string, number> | null = null;
  if (opts.visibleKeys) {
    counts = new Map();
    for (const key of opts.visibleKeys) {
      const country = key.split(".", 1)[0];
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  const collator = new Intl.Collator(opts.english ? "en" : undefined);
  return roots
    .filter((root) => root.kind === "COUNTRY")
    .map((root) => ({
      key: root.key,
      label: opts.english ? englishName(root.name) : root.name,
      lang: opts.english ? undefined : LOCAL_LANG[root.key],
      count: counts ? (counts.get(root.key) ?? 0) : null,
    }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

/** Roving-tabindex keys. In a horizontal row (the chips), Left/Right move and
    Up/Down are left to the page. In a radio group, all four arrows move, per
    the WAI-ARIA radio pattern. Both wrap, and both take Home/End. Null = not
    ours. */
export function rovingIndex(
  key: string,
  index: number,
  count: number,
  orientation: "horizontal" | "both",
): number | null {
  if (count <= 0) return null;
  const vertical = orientation === "both";
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "ArrowDown":
      return vertical ? (index + 1) % count : null;
    case "ArrowUp":
      return vertical ? (index - 1 + count) % count : null;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Width of the chip row's faded edges (its mask gradient). A chip under a
    fade counts as out of view. */
export const CHIP_FADE_PX = 12;

/** Where to scroll the chip row so a chip sits clear of the faded edges:
    centred, clamped at the start. Null = leave the row alone. */
export function chipScrollLeft(input: {
  chipLeft: number;
  chipWidth: number;
  scrollLeft: number;
  viewWidth: number;
}): number | null {
  const { chipLeft, chipWidth, scrollLeft, viewWidth } = input;
  const visible =
    chipLeft - CHIP_FADE_PX >= scrollLeft &&
    chipLeft + chipWidth + CHIP_FADE_PX <= scrollLeft + viewWidth;
  if (visible) return null;
  const target = Math.max(0, Math.round(chipLeft - (viewWidth - chipWidth) / 2));
  return target === Math.round(scrollLeft) ? null : target;
}
