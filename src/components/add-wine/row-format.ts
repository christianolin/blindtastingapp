// Pure row/meta helpers for the search (A5) and cellar (A6) views and the lot
// step, kept out of the "use server" modules so they can be unit-tested and
// shared with the client components. No React, no Supabase; type-only imports.
import type { SearchGroups } from "./types";

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

/** A5 cellar row: "rack B · 2 bottles · drink now". */
export function searchCellarMeta(row: {
  rack: string | null;
  quantity: number;
  drinkNow: boolean;
}): string {
  return [row.rack?.trim() || null, bottlesLabel(row.quantity), row.drinkNow ? "drink now" : null]
    .filter(Boolean)
    .join(" · ");
}

/** A5 catalog row: "★ 95 · 22 notes", else the origin line, else a stub. */
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

/** A5 tasted row: "you rated it 92 in May" (year added once it is not this
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

/** A6 row: "rack B · 2 bottles · in its window" / "… · already glass 1". The
    glass is named only when the caller may know it (C.9: `glass` is null
    otherwise), so a hidden glass's lot reads like any other. */
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

/** What A6's list area shows. A failed load replaces the spinner only while no
    sheet is in hand ("Couldn't load your cellar right now."); a cellar already
    listed stays listed if a later reload fails. With lots in hand, "empty"
    (none in stock) is told apart from "filteredEmpty" (a chip hides them all). */
export type CellarListState = "loading" | "failed" | "empty" | "filteredEmpty" | "list";

export function cellarListState(input: {
  sheet: CellarSheet | null;
  loadFailed: boolean;
  visibleCount: number;
}): CellarListState {
  if (!input.sheet) return input.loadFailed ? "failed" : "loading";
  if (input.sheet.lots.length === 0) return "empty";
  return input.visibleCount === 0 ? "filteredEmpty" : "list";
}

/** Glass numbers follow list order (sorted by position), not the raw stored
    position — the same rule the play/results pages use. */
export function glassNumbers(wines: { id: string; position: number }[]): Map<string, number> {
  const sorted = [...wines].sort((a, b) => a.position - b.position);
  return new Map(sorted.map((w, i) => [w.id, i + 1]));
}

// ---------------------------------------------------------------------------
// A5: the phone search list
// ---------------------------------------------------------------------------

export type SearchListGroup =
  | { kind: "cellar"; rows: SearchGroups["cellar"] }
  | { kind: "catalog"; rows: SearchGroups["catalog"] }
  | { kind: "tasted"; rows: SearchGroups["tasted"] };

/** The groups in the matrix's `searchGroups` order, empty ones left out. A
    wine you own is listed once, as its lot rows: whenever the cellar group is
    listed, that wine's catalog and tasted rows drop out (the laptop's
    `flattenSearchGroups` keeps the same rule). Without the cellar group (the
    catalog destination) nothing is dropped. */
export function searchListGroups(
  groups: SearchGroups,
  order: readonly ("cellar" | "catalog" | "tasted")[],
): SearchListGroup[] {
  const held = new Set(order.includes("cellar") ? groups.cellar.map((r) => r.catalogWineId) : []);
  const list: SearchListGroup[] = [];
  for (const kind of order) {
    if (kind === "cellar") {
      if (groups.cellar.length > 0) list.push({ kind, rows: groups.cellar });
    } else if (kind === "catalog") {
      const rows = groups.catalog.filter((r) => !held.has(r.catalogWineId));
      if (rows.length > 0) list.push({ kind, rows });
    } else {
      const rows = groups.tasted.filter((r) => !held.has(r.catalogWineId));
      if (rows.length > 0) list.push({ kind, rows });
    }
  }
  return list;
}

/** The n in "{n} bottles you can pour tonight": the bottles in lots whose
    drink window holds this year. */
export function pourableBottles(rows: readonly { quantity: number; drinkNow: boolean }[]): number {
  return rows.reduce((sum, r) => (r.drinkNow ? sum + r.quantity : sum), 0);
}

// ---------------------------------------------------------------------------
// The lot step's merge card (B1/B2) and its way out (plan amendment 18, D17)
// ---------------------------------------------------------------------------

export type MergeCardAction = { id: "merge" | "separate" | "skip"; label: string };

/** The merge card, top to bottom: the two adds, then the quieter "Don't add
    it", which writes nothing (the owner's way out when the bottle was already
    recorded). */
export function mergeCardCopy(quantity: number): {
  title: string;
  actions: [MergeCardAction, MergeCardAction, MergeCardAction];
} {
  return {
    title: "You already have this wine in your cellar.",
    actions: [
      { id: "merge", label: `Add ${quantity} to the existing lot` },
      { id: "separate", label: "Keep as a separate lot" },
      { id: "skip", label: "Don't add it" },
    ],
  };
}

/** "2 btl · Rack B": a lot you already hold, on the merge card. */
export function existingLotLabel(lot: { quantity: number; storageLocation: string | null }): string {
  return [`${lot.quantity} btl`, lot.storageLocation?.trim() || null].filter(Boolean).join(" · ");
}

/** After "Don't add it": the line the view the add started from shows, and a
    link to the lot you already have (its page is `/cellar/[lotId]/edit`). */
export function skippedLotNotice(lotId: string): { line: string; open: string; href: string } {
  return {
    line: "Not added — it's already in your cellar",
    open: "Open it",
    href: `/cellar/${encodeURIComponent(lotId)}/edit`,
  };
}
