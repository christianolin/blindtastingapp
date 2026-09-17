// Display strings shared by every cellar and catalog surface (CC-P0). Pure:
// no `server-only`, no Supabase client, no browser API. Dates are formatted
// from raw strings with a fixed month table — never a locale-aware date
// formatter, whose short-month spelling ("Sept" vs "Sep") differs by ICU
// version.
import type { BottleLot, BottleWine, VintageKind, WineColour } from "./types";

export const MONTHS_SHORT: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const MONTHS_LONG: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const COLOUR_WORDS: Record<WineColour, string> = {
  RED: "Red",
  WHITE: "White",
  ROSE: "Rosé",
  ORANGE: "Orange",
};

/** Named bottle sizes (ml) beyond the plain "{ml} ml" / "{L} L" form. */
const SIZE_NAMES: Record<number, string> = {
  375: "half",
  1500: "magnum",
  3000: "double magnum",
};

export function vintageLabel(
  w: Pick<BottleWine, "vintageKind" | "vintageYear" | "vintageTawnyYears">,
): string {
  const kind: VintageKind = w.vintageKind;
  if (kind === "YEAR") return w.vintageYear != null ? String(w.vintageYear) : "";
  if (kind === "NV") return "NV";
  return w.vintageTawnyYears != null ? `${w.vintageTawnyYears}yo` : "Tawny";
}

/** true when wineName, appellation and producer are all null — nothing to
 * name the wine by besides "Untitled wine", and no vintage is appended even
 * when one is set. */
function isUntitled(w: BottleWine): boolean {
  return w.wineName == null && w.appellation == null && w.producer == null;
}

function baseName(w: BottleWine): string {
  return w.wineName ?? w.appellation ?? w.producer ?? "Untitled wine";
}

export function bottleTitle(
  w: BottleWine,
  opts?: { dropVintage?: boolean },
): string {
  if (isUntitled(w)) return "Untitled wine";
  const base = baseName(w);
  const vintage = opts?.dropVintage ? "" : vintageLabel(w);
  return `${base} ${vintage}`.trim();
}

export function lotTitle(w: BottleWine): string {
  const base = baseName(w);
  if (w.producer == null || w.producer === base) return bottleTitle(w);
  return `${w.producer}, ${bottleTitle(w)}`;
}

export function sizeLabel(ml: number): string {
  const name = SIZE_NAMES[ml];
  if (ml >= 1000) {
    const liters = ml / 1000;
    const litersStr = Number.isInteger(liters) ? String(liters) : liters.toFixed(1);
    const base = `${litersStr} L`;
    return name ? `${base} ${name}` : base;
  }
  const base = `${ml} ml`;
  return name ? `${base} ${name}` : base;
}

export function sizeSub(ml: number): string | null {
  return ml === 750 ? "standard" : null;
}

export function countTimes(quantity: number): string {
  return `${quantity} ×`;
}

export function drunkLine(
  lot: Pick<BottleLot, "quantity" | "purchasedQuantity">,
): string | null {
  if (lot.purchasedQuantity > lot.quantity) {
    return `${lot.quantity} of ${lot.purchasedQuantity} drunk`;
  }
  return null;
}

export function isLastOne(quantity: number): boolean {
  return quantity === 1;
}

export function inFlightLine(
  n: number,
  opts?: { phone?: boolean },
): string | null {
  if (n <= 0) return null;
  if (opts?.phone) return `${n} in tonight’s flight`;
  return `${plural(n, "bottle", "bottles")} in tonight’s flight`;
}

export function colourWord(c: WineColour | null): string | null {
  return c ? COLOUR_WORDS[c] : null;
}

type DateParts = { year: number; month: number; day: number };

/** Parses a `date` string (`YYYY-MM-DD`, no zone) from its own digits, or —
 * when the string carries a time part — reads UTC getters off `new Date(s)`
 * instead, per CC-P0's rule. */
function parseDateParts(s: string): DateParts {
  if (s.includes("T")) {
    const d = new Date(s);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
  }
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

export function monthYear(dateOrIso: string): string {
  const { year, month } = parseDateParts(dateOrIso);
  return `${MONTHS_SHORT[month]} ${year}`;
}

export function dayMonthYear(date: string): string {
  const { year, month, day } = parseDateParts(date);
  return `${day} ${MONTHS_SHORT[month]} ${year}`;
}

export function dayMonth(date: string): string {
  const { month, day } = parseDateParts(date);
  return `${day} ${MONTHS_SHORT[month]}`;
}

export function monthLabel(date: string): string {
  const { year, month } = parseDateParts(date);
  return `${MONTHS_LONG[month]} ${year}`;
}

export function addedMonth(
  lot: Pick<BottleLot, "purchasedOn" | "createdAt">,
): string {
  return monthYear(lot.purchasedOn ?? lot.createdAt);
}

export function fmtAvg(n: number | null): string {
  if (n == null) return "—";
  // `toFixed` rounds against the binary float representation of `n`, not
  // decimal half-up — it silently rounds *down* at exact one-decimal
  // midpoints (e.g. `(91.85).toFixed(1) === "91.8"`). Nudge by
  // `Number.EPSILON` before rounding to the nearest tenth so a value that is
  // truly a decimal `.x5` rounds half up, matching the documented rule.
  const rounded = Math.round((n + Number.EPSILON) * 10) / 10;
  return rounded.toFixed(1);
}

export function fmtScore(n: number | null): string {
  return n == null ? "—" : String(Math.round(n));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
