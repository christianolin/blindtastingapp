// Pure helpers for the desktop layout (7h): the search leads flattened into
// rows that state their source, the per-row action label, the footer
// sentence, the cellar tile caption and the drop-zone file filter. No React,
// no Supabase — unit-tested in desktop-format.test.ts.
import { starLabel } from "./format";
import { bottlesLabel, tastedMeta, windowContains } from "./row-format";
import { primaryAddLabel } from "./scan-copy";
import type { AddWineDestination, SearchGroups } from "./types";

/** Where a row's add comes from; the view adds `consume` to a lot itself. */
export type DesktopRowSource =
  | { kind: "catalog"; catalogWineId: string }
  | { kind: "lot"; lotId: string };

export type DesktopRow = {
  key: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  /** "In your cellar · rack B · 2 bottles · ★ 91" / "Catalog · ★ 95 · 22 notes"
      / "You rated it 92 in May · ★ 95 · 22 notes". */
  meta: string;
  source: DesktopRowSource;
  inFlight: boolean;
};

const IN_FLIGHT = "in flight";

/** "★ 95 · 22 notes" — the catalog's rating tail, null without a rating. */
function ratingTail(row: { avgScore: number | null; noteCount: number } | undefined): string | null {
  if (!row || row.avgScore == null) return null;
  const notes = `${row.noteCount} ${row.noteCount === 1 ? "note" : "notes"}`;
  return `${starLabel(row.avgScore)} · ${notes}`;
}

/**
 * One list, the handoff's order — cellar lots first (the bottles you can
 * pour), then the catalog in search rank. A wine already held in the cellar
 * is not repeated as a catalog row; a wine tasted before leads with that
 * fact instead of "Catalog". Every row states where it comes from, since
 * the desktop has no group headers.
 */
export function flattenSearchGroups(
  groups: SearchGroups,
  opts: { includeCellar: boolean; now?: Date },
): DesktopRow[] {
  const catalogById = new Map(groups.catalog.map((c) => [c.catalogWineId, c]));
  const tastedById = new Map(groups.tasted.map((t) => [t.catalogWineId, t]));
  const rows: DesktopRow[] = [];
  const held = new Set<string>();

  if (opts.includeCellar) {
    for (const lot of groups.cellar) {
      held.add(lot.catalogWineId);
      const c = catalogById.get(lot.catalogWineId);
      const meta = [
        "In your cellar",
        lot.rack?.trim() || null,
        bottlesLabel(lot.quantity),
        starLabel(c?.avgScore ?? null),
        lot.inFlight ? IN_FLIGHT : null,
      ]
        .filter(Boolean)
        .join(" · ");
      rows.push({
        key: `lot:${lot.lotId}`,
        catalogWineId: lot.catalogWineId,
        title: lot.title,
        imageUrl: lot.imageUrl ?? c?.imageUrl ?? null,
        meta,
        source: { kind: "lot", lotId: lot.lotId },
        inFlight: lot.inFlight,
      });
    }
  }

  for (const c of groups.catalog) {
    if (held.has(c.catalogWineId)) continue;
    const t = tastedById.get(c.catalogWineId);
    const rating = ratingTail(c);
    const lead = t ? capitalize(tastedMeta(t, opts.now)) : "Catalog";
    const meta = [lead, rating ?? (t ? null : c.subtitle), c.inFlight ? IN_FLIGHT : null]
      .filter(Boolean)
      .join(" · ");
    rows.push({
      key: `wine:${c.catalogWineId}`,
      catalogWineId: c.catalogWineId,
      title: c.title,
      imageUrl: c.imageUrl,
      meta,
      source: { kind: "catalog", catalogWineId: c.catalogWineId },
      inFlight: c.inFlight,
    });
  }

  return rows;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The inline button: the destination action on the first addable row,
    "Add" on the rest, "In flight" on a wine already poured. */
export function rowActionLabel(
  destination: AddWineDestination | null,
  opts: { primary: boolean; inFlight: boolean },
): string {
  if (opts.inFlight) return "In flight";
  if (!opts.primary || !destination) return "Add";
  return primaryAddLabel(destination);
}

const KEEP_GOING = "Adding does not close this — keep going.";
const FLIGHT_KEEP_GOING = "Adding does not close this — keep going until the flight is full.";

/**
 * The footer line. For the flight it describes the flight itself (glasses
 * set = the next position minus one — the sheet re-reads position after
 * every add, so this stays true when the flight already had glasses before
 * the sheet opened); for the cellar and the catalog it counts this session's
 * adds (`added`).
 */
export function footerSentence(destination: AddWineDestination | null, added: number): string {
  if (destination?.kind === "flight") {
    const set = Math.max(0, destination.position - 1);
    if (set === 0) return `No glasses are set yet. ${FLIGHT_KEEP_GOING}`;
    if (set === 1) return `Glass 1 is set. ${FLIGHT_KEEP_GOING}`;
    return `Glasses 1–${set} are set. ${FLIGHT_KEEP_GOING}`;
  }
  if (destination?.kind === "cellar") {
    return added === 0
      ? `Nothing added to your cellar yet. ${KEEP_GOING}`
      : `Added ${added} to your cellar so far. ${KEEP_GOING}`;
  }
  if (destination?.kind === "catalog") {
    return added === 0
      ? `Nothing added to the catalog yet. ${KEEP_GOING}`
      : `Added ${added} to the catalog. ${KEEP_GOING}`;
  }
  return added === 0 ? `Nothing added yet. ${KEEP_GOING}` : `Added ${added} so far. ${KEEP_GOING}`;
}

export type CellarSummary = { bottles: number; readyToDrink: number };

/** Bottles in stock, and how many of them sit in an open drink window. */
export function cellarSummary(
  lots: { quantity: number; drink_from: number | null; drink_to: number | null }[],
  year: number,
): CellarSummary {
  let bottles = 0;
  let readyToDrink = 0;
  for (const l of lots) {
    bottles += l.quantity;
    if (windowContains(l.drink_from, l.drink_to, year)) readyToDrink += l.quantity;
  }
  return { bottles, readyToDrink };
}

/** "38 bottles · 6 ready to drink" (7h tile), with loading / empty states. */
export function cellarTileSubtitle(summary: CellarSummary | null): string {
  if (!summary) return "Counting bottles…";
  if (summary.bottles === 0) return "No bottles in stock";
  return `${bottlesLabel(summary.bottles)} · ${summary.readyToDrink} ready to drink`;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

export type SkippedFile = { name: string; reason: "not an image" | "over 5MB" };

/**
 * The drop zone's filter: images only (by MIME type, or by extension when the
 * OS reports none), up to the 5MB the zone's copy promises. Everything else
 * is named back so a dropped folder never fails silently.
 */
export function pickImageFiles<T extends { name: string; size: number; type: string }>(
  files: T[],
): { accepted: T[]; skipped: SkippedFile[] } {
  const accepted: T[] = [];
  const skipped: SkippedFile[] = [];
  for (const f of files) {
    const isImage = f.type ? f.type.startsWith("image/") : IMAGE_EXT.test(f.name);
    if (!isImage) skipped.push({ name: f.name, reason: "not an image" });
    else if (f.size > MAX_PHOTO_BYTES) skipped.push({ name: f.name, reason: "over 5MB" });
    else accepted.push(f);
  }
  return { accepted, skipped };
}

/** The drop zone's sentence, ending where the photos land. */
export function uploadZoneCopy(destination: AddWineDestination | null): string {
  const head =
    "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and ";
  if (destination?.kind === "flight") return `${head}lands in this flight.`;
  if (destination?.kind === "cellar") return `${head}lands in your cellar.`;
  if (destination?.kind === "catalog") return `${head}lands in the catalog.`;
  return `${head}you choose where each one goes.`;
}
