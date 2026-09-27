// Editing a low→high band on a scale: the rule the admin typical-wine editor's
// sliders follow (SnapSlider's and QualitySlider's editable range modes). A
// band is two positions, low first — stop indices on a SnapSlider, scores
// 50–100 on the QualitySlider. Pure, no imports, so vitest loads it.
//
// A tap (EditableRange's rule, which this replaces): outside the band extends
// the nearer end to it; inside moves the nearer end in (a tie goes to the low
// end); with no band it seeds a one-stop band. Tapping an end changes nothing
// — the row's "clear" empties a band. A press that slides on keeps the end it
// took and moves the other: the far end is the anchor.

/** Two positions on a scale, low first. */
export type Band = readonly [number, number];

/** A tap at `at`: the new band, and the anchor a drag from here holds still. */
export function tapBand(band: Band | null, at: number): { band: Band; anchor: number } {
  if (band === null) return { band: [at, at], anchor: at };
  const [lo, hi] = band;
  if (at < lo) return { band: [at, hi], anchor: hi };
  if (at > hi) return { band: [lo, at], anchor: lo };
  if (at - lo <= hi - at) return { band: [at, hi], anchor: hi };
  return { band: [lo, at], anchor: lo };
}

/** The band while a press holds `anchor` and the pointer is at `at`; crossing the anchor swaps the ends. */
export function dragBand(anchor: number, at: number): Band {
  return anchor <= at ? [anchor, at] : [at, anchor];
}

export function sameBand(a: Band | null, b: Band | null): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

/** A range's band on `stops`, low first; null when either bound is not a stop. */
export function bandOnStops<T>(stops: readonly T[], range: readonly [T, T] | null): Band | null {
  if (range === null) return null;
  const a = stops.indexOf(range[0]);
  const b = stops.indexOf(range[1]);
  if (a < 0 || b < 0) return null;
  return a <= b ? [a, b] : [b, a];
}

/** A score range as a band, low first. */
export function scoreBand(range: readonly [number, number] | null): Band | null {
  if (range === null) return null;
  return range[0] <= range[1] ? [range[0], range[1]] : [range[1], range[0]];
}
