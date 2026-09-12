// Pure row/meta helpers for the search (7e) and cellar (7f) views, kept out of
// the "use server" module so they can be unit-tested and shared with the
// client components. No React, no Supabase.

/** One in-stock lot as the cellar view lists it (`listCellarForSheet`). */
export type CellarSheetLot = {
  lotId: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  rack: string | null;
  quantity: number;
  /** The lot's drink window contains the current year. */
  drinkNow: boolean;
  /** The wine is already poured into the tasting the sheet is adding to. */
  inFlight: boolean;
  /** The glass it fills — only when the caller may know (host, own bottle
      or a revealed wine); null keeps a hidden glass's number private. */
  glass: number | null;
};

export type CellarSheet = { lots: CellarSheetLot[]; totalBottles: number };

export type CellarFilter = { kind: "drinkNow" } | { kind: "rack"; rack: string } | null;

// A drink window "contains" the year when both known bounds allow it; a lot
// with no window at all is not claimed as "drink now" (same rule as the
// search action).
export function windowContains(
  from: number | null,
  to: number | null,
  year: number,
): boolean {
  if (from == null && to == null) return false;
  if (from != null && year < from) return false;
  if (to != null && year > to) return false;
  return true;
}

export function bottlesLabel(n: number): string {
  return `${n} ${n === 1 ? "bottle" : "bottles"}`;
}

/** 7e cellar row: "rack B · 2 bottles · drink now". */
export function searchCellarMeta(row: {
  rack: string | null;
  quantity: number;
  drinkNow: boolean;
}): string {
  return [row.rack?.trim() || null, bottlesLabel(row.quantity), row.drinkNow ? "drink now" : null]
    .filter(Boolean)
    .join(" · ");
}

/** 7e catalog row: "★ 95 · 22 notes", else the origin line, else a stub. */
export function catalogMeta(row: {
  avgScore: number | null;
  noteCount: number;
  subtitle: string | null;
}): string {
  if (row.avgScore != null) {
    const notes = `${row.noteCount} ${row.noteCount === 1 ? "note" : "notes"}`;
    return `★ ${Math.round(row.avgScore)} · ${notes}`;
  }
  return row.subtitle || "No notes yet";
}

const MONTH = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });

/** 7e tasted row: "you rated it 92 in May" (year added once it is not this
    year). `tastedOn` is a date-only string, so it is read as UTC parts —
    no timezone shift can move it a day. */
export function tastedMeta(
  row: { myScore: number | null; tastedOn: string },
  now: Date = new Date(),
): string {
  const head = row.myScore == null ? "you tasted it" : `you rated it ${row.myScore}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(row.tastedOn);
  if (!m) return head;
  const year = Number(m[1]);
  const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return head;
  const month = MONTH.format(date);
  const when = year === now.getUTCFullYear() ? month : `${month} ${year}`;
  return `${head} in ${when}`;
}

/** 7f row: "rack B · 2 bottles · in its window" / "… · already glass 1". */
export function cellarLotMeta(lot: CellarSheetLot): string {
  const tail =
    lot.inFlight && lot.glass != null
      ? `already glass ${lot.glass}`
      : lot.drinkNow
        ? "in its window"
        : null;
  return [lot.rack?.trim() || null, bottlesLabel(lot.quantity), tail]
    .filter(Boolean)
    .join(" · ");
}

/** Distinct racks (storage locations), sorted, blanks skipped. */
export function rackChips(lots: CellarSheetLot[]): string[] {
  const set = new Set<string>();
  for (const l of lots) {
    const r = l.rack?.trim();
    if (r) set.add(r);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterLots(lots: CellarSheetLot[], filter: CellarFilter): CellarSheetLot[] {
  if (!filter) return lots;
  if (filter.kind === "drinkNow") return lots.filter((l) => l.drinkNow);
  return lots.filter((l) => l.rack?.trim() === filter.rack);
}

/** Glass numbers follow list order (sorted by position), not the raw stored
    position — the same rule the play/results pages use. */
export function glassNumbers(wines: { id: string; position: number }[]): Map<string, number> {
  const sorted = [...wines].sort((a, b) => a.position - b.position);
  return new Map(sorted.map((w, i) => [w.id, i + 1]));
}
