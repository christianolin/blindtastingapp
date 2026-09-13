// Pure helpers for the laptop view (A8, B1, C1, D1): the search groups
// flattened into rows that state their source, D1's "Already in the catalog"
// metas, the B1 preview chips, keyboard focus, the cellar tile's counts and
// the upload zone's file filter. Every destination-dependent string lives in
// ./matrix (spec §C.2); nothing here tests the destination.
//
// No React, no Supabase, and only relative runtime imports (vitest has no
// `@/` alias). Unit-tested in desktop-format.test.ts.
import { vintageLabel as draftVintageLabel } from "../../lib/wine-identity/describe";
import { foldName } from "../../lib/wine-identity/fold";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { starLabel } from "./format";
import { sheetMatrix } from "./matrix";
import { bottlesLabel, tastedMeta, windowContains } from "./row-format";
import type { AddWineDestination, SearchGroups } from "./types";

/** Where a row's add comes from; the shell adds `consume` to a lot itself. */
export type DesktopRowSource =
  | { kind: "catalog"; catalogWineId: string }
  | { kind: "lot"; lotId: string };

/** The fields D1's metas compare with a draft (spec §C.1). */
export type CatalogRowIdentity = {
  producerId: string;
  wineName: string | null;
  appellationId: string;
  vintageLabel: string;
};

export type DesktopRow = {
  key: string;                 // "lot:<lotId>" / "wine:<catalogWineId>", the sheet's `rowAdded` keys
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  /** "In your cellar · rack B · 2 bottles · ★ 91" / "Catalog · ★ 95 · 22 notes"
      / "You rated it 92 in May · ★ 95 · 22 notes". */
  meta: string;
  source: DesktopRowSource;
  /** The search group that listed it — `matrix.row`'s `source`. */
  listedAs: "lot" | "catalog" | "tasted";
  inFlight: boolean;
  /** D1's comparison fields; null on a lot row. */
  identity: CatalogRowIdentity | null;
};

const IN_FLIGHT = "in flight";
const IN_CATALOG = "Already in the catalog";

/** "★ 95 · 22 notes" — the catalog's rating tail, null without a rating. */
function ratingTail(row: { avgScore: number | null; noteCount: number } | undefined): string | null {
  if (!row || row.avgScore == null) return null;
  const notes = `${row.noteCount} ${row.noteCount === 1 ? "note" : "notes"}`;
  return `${starLabel(row.avgScore)} · ${notes}`;
}

function identityOf(row: CatalogRowIdentity): CatalogRowIdentity {
  return {
    producerId: row.producerId,
    wineName: row.wineName,
    appellationId: row.appellationId,
    vintageLabel: row.vintageLabel,
  };
}

function joinMeta(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/**
 * One list, the matrix's group order — cellar lots first (the bottles you can
 * pour), then the catalog in search rank, then wines you have tasted that the
 * catalog page did not list (sources-8, each with its own `inFlight`). A wine
 * held in the cellar is listed once, as its lot rows, and a catalog row is
 * never repeated as a tasted one. Every row states where it comes from, since
 * the laptop has no group headers; a catalog wine tasted before leads with
 * that fact instead of "Catalog".
 *
 * `ownedLead` (B1): where the cellar is the destination, a lot row is a wine
 * you already own and leads with "Already yours".
 */
export function flattenSearchGroups(
  groups: SearchGroups,
  opts: { includeCellar: boolean; ownedLead?: boolean; now?: Date },
): DesktopRow[] {
  const catalogById = new Map(groups.catalog.map((c) => [c.catalogWineId, c]));
  const tastedById = new Map(groups.tasted.map((t) => [t.catalogWineId, t]));
  const rows: DesktopRow[] = [];
  const listed = new Set<string>();

  if (opts.includeCellar) {
    const lead = opts.ownedLead ? "Already yours" : "In your cellar";
    for (const lot of groups.cellar) {
      listed.add(lot.catalogWineId);
      const c = catalogById.get(lot.catalogWineId);
      rows.push({
        key: `lot:${lot.lotId}`,
        catalogWineId: lot.catalogWineId,
        title: lot.title,
        imageUrl: lot.imageUrl ?? c?.imageUrl ?? null,
        meta: joinMeta([
          lead,
          lot.rack?.trim() || null,
          bottlesLabel(lot.quantity),
          starLabel(c?.avgScore ?? null),
          lot.inFlight ? IN_FLIGHT : null,
        ]),
        source: { kind: "lot", lotId: lot.lotId },
        listedAs: "lot",
        inFlight: lot.inFlight,
        identity: null,
      });
    }
  }

  for (const c of groups.catalog) {
    if (listed.has(c.catalogWineId)) continue;
    listed.add(c.catalogWineId);
    const t = tastedById.get(c.catalogWineId);
    const inFlight = c.inFlight || (t?.inFlight ?? false);
    const lead = t ? capitalize(tastedMeta(t, opts.now)) : "Catalog";
    rows.push({
      key: `wine:${c.catalogWineId}`,
      catalogWineId: c.catalogWineId,
      title: c.title,
      imageUrl: c.imageUrl,
      meta: joinMeta([lead, ratingTail(c) ?? (t ? null : c.subtitle), inFlight ? IN_FLIGHT : null]),
      source: { kind: "catalog", catalogWineId: c.catalogWineId },
      listedAs: "catalog",
      inFlight,
      identity: identityOf(c),
    });
  }

  for (const t of groups.tasted) {
    if (listed.has(t.catalogWineId)) continue;
    listed.add(t.catalogWineId);
    rows.push({
      key: `wine:${t.catalogWineId}`,
      catalogWineId: t.catalogWineId,
      title: t.title,
      imageUrl: t.imageUrl,
      meta: joinMeta([capitalize(tastedMeta(t, opts.now)), t.inFlight ? IN_FLIGHT : null]),
      source: { kind: "catalog", catalogWineId: t.catalogWineId },
      listedAs: "tasted",
      inFlight: t.inFlight,
      identity: identityOf(t),
    });
  }

  return rows;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * D1's row meta (spec §C.5 D1, §2.1 row 13). Compared with the latest draft
 * (an uploaded read, or the by-hand form):
 * - the same producer, name and appellation in another vintage →
 *   "Already in the catalog · different vintage";
 * - the same producer with another name or appellation →
 *   "Already in the catalog · different wine".
 * Anything the draft cannot compare — no draft (typed text only), a pending or
 * different producer, the same vintage, a vintage not known yet — reads
 * "Already in the catalog · {vintage}". A draft with no appellation yet
 * compares by name alone; wine names compare folded.
 */
export function catalogRowMeta(row: CatalogRowIdentity, draft: WineIdentityDraft | null): string {
  const producer = draft?.producer;
  if (draft && producer?.kind === "existing" && producer.id === row.producerId) {
    const sameName = foldName(draft.wineName ?? "") === foldName(row.wineName ?? "");
    const sameAppellation = draft.appellationId === null || draft.appellationId === row.appellationId;
    if (!sameName || !sameAppellation) return `${IN_CATALOG} · different wine`;
    const drafted = draftVintageLabel(draft.vintage);
    if (drafted && drafted !== row.vintageLabel) return `${IN_CATALOG} · different vintage`;
  }
  return joinMeta([IN_CATALOG, row.vintageLabel || null]);
}

/**
 * B1's non-interactive "Then: quantity, rack, price" tile: the lot step's
 * defaults — one bottle, the last rack used this session (or "Rack"), and the
 * price. A rack typed as "Rack B" is not doubled.
 */
export function lotPreviewChips(lastRack: string | null): string[] {
  const rack = (lastRack ?? "").trim().replace(/^rack\b\s*/i, "");
  return ["1 bottle", rack ? `Rack ${rack}` : "Rack", "Price"];
}

/** ↑/↓ move the focused row without wrapping; -1 when there are no rows. */
export function clampFocus(row: number, rowCount: number): number {
  if (rowCount <= 0) return -1;
  return Math.min(Math.max(row, 0), rowCount - 1);
}

/** The first row Enter can act on, or -1. */
export function firstAddableIndex(rows: readonly { disabled: boolean }[]): number {
  return rows.findIndex((row) => !row.disabled);
}

/**
 * The row ↑/↓ and Enter act on while nothing pins the focus (A8). A new query
 * stores 0, and that 0 is the default: the first addable row. A stored row
 * past 0 is read literally. Once ↑/↓ or an add chooses a row, the laptop view
 * pins the focus to that row by identity (`focusAnchorAt`,
 * `resolveFocusAnchor`), never by this index.
 */
export function effectiveFocus(focusedRow: number, rows: readonly { disabled: boolean }[]): number {
  const clamped = clampFocus(focusedRow, rows.length);
  if (clamped > 0) return clamped;
  const first = firstAddableIndex(rows);
  return first >= 0 ? first : clamped;
}

/** A pinned focus, by identity: the row's key (`lot:<id>` / `wine:<id>`) and its wine. */
export type FocusAnchor = { key: string; catalogWineId: string };

/**
 * The anchor for the row at `index`, or null past either end (no row
 * focused). It never clamps: a clamped index could name another wine.
 */
export function focusAnchorAt(
  rows: readonly { key: string; catalogWineId: string }[],
  index: number,
): FocusAnchor | null {
  const row = index >= 0 ? rows[index] : undefined;
  return row ? { key: row.key, catalogWineId: row.catalogWineId } : null;
}

/**
 * Where a pinned focus lands in the rows listed now (spec §C.4 rule 11, §C.5
 * A8). The refetch after an add can reorder the list or drop the row just
 * added (a lot whose last bottle was poured), so an index would hand the focus,
 * and the next Enter, to another wine. In order:
 * 1. the anchored row, wherever it is listed now;
 * 2. else the first row of the same wine: a drained lot's wine as its catalog
 *    row, or another lot of it. In a flight that row is in flight like every
 *    row of the wine; in the cellar it can be the lot a catalog add created;
 * 3. else -1: no row is focused, so Enter does nothing until ↑/↓ choose one.
 * A null anchor (nothing focused) stays -1.
 */
export function resolveFocusAnchor(
  anchor: FocusAnchor | null,
  rows: readonly { key: string; catalogWineId: string }[],
): number {
  if (!anchor) return -1;
  const own = rows.findIndex((row) => row.key === anchor.key);
  return own >= 0 ? own : rows.findIndex((row) => row.catalogWineId === anchor.catalogWineId);
}

/**
 * A result row's button label, from the matrix (a catalog row).
 * @deprecated removed in S6 — read `sheetMatrix(destination, canScan).row(...)`.
 */
export function rowActionLabel(
  destination: AddWineDestination | null,
  opts: { inFlight: boolean },
): string {
  return sheetMatrix(destination, false).row({ source: "catalog", inFlight: opts.inFlight, owned: false }).label;
}

/**
 * The search field's ↵ hint, from the matrix.
 * @deprecated removed in S6 — read `sheetMatrix(destination, canScan).enterHint`.
 */
export function enterHint(destination: AddWineDestination | null): string {
  return sheetMatrix(destination, false).enterHint;
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

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

export type SkippedFile = {
  name: string;
  reason: "not an image" | "over 5MB" | "one photo at a time";
};

/**
 * The upload zone's filter: images only (by MIME type, or by extension when
 * the OS reports none), up to the 5MB the zone's copy promises, and at most
 * `max` of them (a note reads one photo: one wine, one label read). Everything
 * else is named back so a dropped folder never fails silently.
 */
export function pickImageFiles<T extends { name: string; size: number; type: string }>(
  files: T[],
  opts: { max?: number } = {},
): { accepted: T[]; skipped: SkippedFile[] } {
  const accepted: T[] = [];
  const skipped: SkippedFile[] = [];
  for (const f of files) {
    const isImage = f.type ? f.type.startsWith("image/") : IMAGE_EXT.test(f.name);
    if (!isImage) skipped.push({ name: f.name, reason: "not an image" });
    else if (f.size > MAX_PHOTO_BYTES) skipped.push({ name: f.name, reason: "over 5MB" });
    else if (opts.max != null && accepted.length >= opts.max) {
      skipped.push({ name: f.name, reason: "one photo at a time" });
    } else accepted.push(f);
  }
  return { accepted, skipped };
}
