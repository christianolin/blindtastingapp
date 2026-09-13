// The add-wine sheet's state (spec §C.4). The view, the scanned items, the
// by-hand session and every field that must survive navigation live in one
// reducer, so leaving a view never loses what was read or typed (RC8). The
// shell renders from `useReducer(sheetReducer, initialSheetState(...))`; its
// adds hook (use-sheet-adds.ts) performs the writes and reports back through
// these actions. S5a and S5b may add actions; never rename or remove one.
//
// Pure: no Supabase and no browser API, and every runtime import is relative
// (vitest has no `@/` alias). Unit-tested in sheet-state.test.ts.
import type { LabelPhotoRead } from "@/app/scan/actions";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import { missingWineFields } from "../../lib/wine-identity/complete";
import { describeUnread, readDisplay } from "../../lib/wine-identity/describe";
import { glassLabel } from "./format";
import { sheetMatrix, type SheetMatrix } from "./matrix";
import type { CellarFilter } from "./row-format";
import type {
  AddSource, AddWineDestination, AddWineOpenOptions, AddWineStart, AddedWine, SearchGroups,
} from "./types";
import { homeViewFor, startViewFor } from "./use-camera";

// ---------------------------------------------------------------------------
// State (spec §C.4, verbatim, plus amendment 18's `skippedLot` and rule 3's `confirmQueue`)
// ---------------------------------------------------------------------------

export type SheetView =
  | "resolving" | "camera" | "desktop" | "reading" | "confirm" | "search"
  | "cellar" | "byhand" | "lot" | "choose" | "followup";

export type ScanItem = {
  id: string;
  photoUrl: string;                 // local blob URL for the thumbnail
  blob: Blob | null;                // kept until the read succeeds (Retry)
  imagePath: string | null;         // set once uploaded
  status: "uploading" | "reading" | "failed" | "read" | "pending" | "added" | "incomplete";
  read: LabelPhotoRead | null;      // A.5
  draft: WineIdentityDraft | null;  // owned by the sheet; edits land here
  added: AddedWine | null;
  error: string | null;             // a failed add's server message, kept on the row
};

export type ByHandSession = {
  draft: WineIdentityDraft;
  origin:
    | { kind: "new" }
    | { kind: "item"; itemId: string }                         // Fix / By hand from a read
    | { kind: "match"; itemId: string }                        // By hand from a matched read
    | { kind: "glass"; wineId: string; incomplete: boolean };  // Edit on the flight page
  unidentified: boolean;
  focusField: WineFieldKey | null;
  attempted: boolean;                                          // show the refusal line after a save with gaps
  dirty: boolean;
};

export type SheetState = {
  view: SheetView;
  history: SheetView[];
  requested: AddWineDestination | null;   // from the launcher; never changes
  positionOverride: number | null;        // a flight's next glass after adds (positionAdvanced); currentDestination applies it
  start: AddWineStart | undefined;        // the launcher's start, applied once canScan resolves
  adopted: AddWineDestination | null;     // a chooser pick or a D3 follow-up; reset when that add fails
  canScan: boolean | null;
  multi: boolean;
  items: ScanItem[];
  activeItemId: string | null;
  queue: string[];                        // item ids waiting to upload and read, one at a time
  byHand: ByHandSession | null;
  search: { query: string };
  desktop: { query: string; focusedRow: number; consume: boolean };
  cellar: { filter: CellarFilter; selectedLotId: string | null; consume: boolean };
  lot: { source: AddSource; quantity: number; rack: string; price: string } | null;
  chooseFor: { source: AddSource | null; itemId: string | null; title: string; missing: WineFieldKey[] } | null;
  followUp: { catalogWineId: string; title: string; written: boolean } | null;
  added: AddedWine[];
  addedRowKeys: string[];                 // "lot:<id>" / "wine:<catalogWineId>" poured this session (rule 11)
  lastRack: string | null;                // the B1 preview tile's rack chip
  closeAsk: { unfinished: number } | null;
  closing: boolean;
  error: string | null;
  /** Plan amendment 18 (D17): "Don't add it" on the lot step's merge card wrote
      nothing. The home view shows "Not added — it's already in your cellar"
      with "Open it" on this lot, until the next add starts. */
  skippedLot: { lotId: string } | null;
  /** Plan amendment 20 (rule 3, A3 "on to the next queued photo"): with Many
      off, finished reads and single-scan failures waiting for their confirm,
      oldest first. A read waits while anything but a home view no bottle holds,
      or its own reading view, is on screen, and opens instead of the home view.
      A turn ends only when the user acts on that bottle; a confirm covered or
      left without that goes back to the front. The confirm’s Search keeps the
      turn: on a laptop the laptop view it lands on is that bottle’s search,
      and an add started there names the bottle (`addTargetId`). In Many, reads
      stack instead. */
  confirmQueue: string[];
};

export type SheetAction =
  | { type: "canScanResolved"; canScan: boolean }
  | { type: "go"; view: SheetView }
  | { type: "back" }
  | { type: "setMulti"; multi: boolean }
  | { type: "enqueue"; items: { id: string; photoUrl: string; blob: Blob }[] }
  | { type: "itemUploaded"; id: string; imagePath: string }
  | { type: "itemRead"; id: string; read: LabelPhotoRead; stack: boolean }   // stack → a pending row, no confirm view
  | { type: "itemFailed"; id: string; error?: string }
  | { type: "itemRetry"; id: string }
  | { type: "itemRemove"; id: string }
  | { type: "itemAdded"; id: string | null; added: AddedWine }
  | { type: "itemAddFailed"; id: string; error: string }
  | { type: "openByHand"; origin: ByHandSession["origin"]; draft: WineIdentityDraft; focusField: WineFieldKey | null; unidentified?: boolean }
  | { type: "byHandChange"; draft: WineIdentityDraft }
  | { type: "byHandUnidentified"; on: boolean }
  | { type: "byHandAttempted"; focusField: WineFieldKey | null }
  | { type: "byHandDiscard" }
  | { type: "byHandSaved" }
  | { type: "searchQuery"; query: string }
  | { type: "desktopQuery"; query: string }
  | { type: "desktopFocus"; row: number }
  | { type: "consume"; surface: "desktop" | "cellar"; consume: boolean }
  | { type: "cellarFilter"; filter: CellarFilter }
  | { type: "cellarSelect"; lotId: string | null }
  | { type: "openLot"; source: AddSource }
  | { type: "lotField"; field: "quantity" | "rack" | "price"; value: number | string }
  | { type: "choose"; source: AddSource | null; itemId: string | null; title: string; missing: WineFieldKey[] }
  | { type: "adopt"; destination: AddWineDestination }
  | { type: "adoptFailed"; error: string }
  | { type: "followUp"; catalogWineId: string; title: string; written: boolean }
  | { type: "followUpDone" }
  | { type: "requestClose" }
  | { type: "cancelClose" }
  | { type: "discardAndClose" }
  | { type: "positionAdvanced"; position: number }
  | { type: "rowAdded"; key: string }
  | { type: "error"; error: string | null }
  /** Plan amendment 18 (D17): "Don't add it" on the already-in-your-cellar
      card. Nothing is written. `itemId` is the scanned bottle the lot step was
      opened for (it leaves the stack as if removed), null for a search row;
      `lotId` is the existing lot that "Open it" links to. */
  | { type: "lotSkipped"; itemId: string | null; lotId: string };

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ItemStatus = ScanItem["status"];

const IN_PROGRESS: readonly ItemStatus[] = ["uploading", "reading"];
/** Written to a flight, a cellar or the catalog: these rows stay listed. */
const WRITTEN: readonly ItemStatus[] = ["added", "incomplete"];
/** Rule 7: what closing would throw away. */
const UNFINISHED: readonly ItemStatus[] = ["pending", "failed", "read"];
/** Rule 10: ← never lands on these; "resolving" is no place to return to either. */
const BACK_SKIPS: readonly SheetView[] = ["reading", "lot", "choose", "resolving"];
/** A row's Fix chain runs through these: the by-hand form, and the lot step or chooser its save opens. */
const FIX_CHAIN: readonly SheetView[] = ["byhand", "lot", "choose"];

const LOT_PREFIX = "lot:";
const WINE_PREFIX = "wine:";

const NO_NAMES = { producer: null, appellation: null, region: null, country: null, primaryGrape: null };

function homeView(canScan: boolean | null): SheetView {
  return canScan === null ? "resolving" : homeViewFor(canScan);
}

/** Moves to `view`, remembering where ← returns. */
function goTo(s: SheetState, view: SheetView): SheetState {
  if (s.view === view) return s;
  return { ...s, view, history: s.view === "resolving" ? s.history : [...s.history, s.view] };
}

/** After an add, a skip or a removal: the home view, nothing to go back to —
    or, once `settle` runs, on to the next read waiting its turn. */
function goHome(s: SheetState): SheetState {
  return { ...s, view: homeView(s.canScan), history: [], activeItemId: null };
}

/** D5: a mouse device never sees the camera or the phone search view (the
    laptop view's own field is its search), and a device that can scan never
    sees the laptop view. Applied when `canScan` changes while the sheet is open. */
function viewForCanScan(view: SheetView, canScan: boolean): SheetView {
  if (!canScan && (view === "camera" || view === "search")) return "desktop";
  if (canScan && view === "desktop") return "camera";
  return view;
}

/** Many is off for the single-wine destination (the matrix's `showMany`). */
function manyAllowed(destination: AddWineDestination | null): boolean {
  return destination === null || sheetMatrix(destination, false).showMany;
}

function findItem(s: SheetState, id: string): ScanItem | undefined {
  return s.items.find((item) => item.id === id);
}

function patchItem(s: SheetState, id: string, patch: Partial<ScanItem>): SheetState {
  return { ...s, items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
}

function unqueue(queue: string[], id: string): string[] {
  return queue.filter((queued) => queued !== id);
}

function dropItem(s: SheetState, id: string): SheetState {
  return {
    ...s,
    items: s.items.filter((item) => item.id !== id),
    queue: unqueue(s.queue, id),
    confirmQueue: unqueue(s.confirmQueue, id),
    activeItemId: s.activeItemId === id ? null : s.activeItemId,
    // A session for a row that is gone has nowhere left to go, and a dirty one
    // would keep the close-ask counting a wine the user removed or skipped.
    byHand: sessionRow(s) === id ? null : s.byHand,
  };
}

function isHome(view: SheetView): boolean {
  return view === "camera" || view === "desktop";
}

/** A bottle whose confirm can be offered: a finished read, or a failed one. */
function isOfferable(item: ScanItem | undefined): boolean {
  return item?.status === "read" || item?.status === "failed";
}

/** Listed and not written: what a row's Fix, Retry and Remove act on (rule 7). */
function isUnfinished(item: ScanItem | undefined): boolean {
  return item !== undefined && UNFINISHED.includes(item.status);
}

/** The row a by-hand session was opened for (Fix, or By hand on a read), or null. */
function sessionRow(s: SheetState): string | null {
  const origin = s.byHand?.origin;
  return origin?.kind === "item" || origin?.kind === "match" ? origin.itemId : null;
}

/** Amendment 20, plus the confirm's Search (F12 re-review round 3): opened from
    a bottle's confirm, these keep its turn — by hand, the lot step, the
    chooser, the bottle's search and the cellar view opened from there. The
    search is the phone search view, or on a device that cannot scan the laptop
    view, whose field is the search (D5, `DesktopViewProps`). The camera never
    keeps a turn: going there leaves it. */
function keepsTurn(s: SheetState, view: SheetView): boolean {
  switch (view) {
    case "byhand":
    case "lot":
    case "choose":
    case "search":
    case "cellar":
      return true;
    case "desktop":
      return s.canScan === false;
    default:
      return false;
  }
}

/** The bottle holding the turn: its reading or confirm view is on screen, or a
    view that keeps its turn was opened from its confirm. A `confirm` in
    `history` always names `activeItemId` (`settle` strips those entries when
    the active bottle changes). */
function turnHolder(s: SheetState): string | null {
  const id = s.activeItemId;
  if (id === null || !findItem(s, id)) return null;
  if (s.view === "reading" || s.view === "confirm") return id;
  if (!keepsTurn(s, s.view)) return null;
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i] === "confirm") return id;
    if (!keepsTurn(s, s.history[i])) return null;
  }
  return null;
}

/** The bottle holding the turn — its reading or confirm view is on screen, or
    a view opened from its confirm — or null. For views: which bottle the
    laptop view is the search of, and whether a dropped photo only queues. An
    add never names this; it names `addTargetId`, which also covers a row's Fix. */
export function turnItemId(s: SheetState): string | null {
  return turnHolder(s);
}

/** A row's Fix chain (F12 re-review round 4): with no bottle holding the turn,
    Fix on a row (the Many stack, the laptop list) opens the by-hand form for
    that row, and its save carries on through the lot step (catalog-then-lot)
    or the chooser (E1). `settle` keeps `activeItemId` on that row for the whole
    chain, and clears it on every other view that holds no turn. */
function fixChainRow(s: SheetState): string | null {
  const id = s.activeItemId;
  if (id === null || !FIX_CHAIN.includes(s.view) || turnHolder(s) !== null) return null;
  return isUnfinished(findItem(s, id)) ? id : null;
}

/** The bottle an add, a by-hand save, a chooser pick, "Leave it for later" or
    a skip starting now belongs to. It is the only id the adds hook dispatches:
    read it from `stateRef.current` when the add starts (amendment 20 "Ids";
    F12 re-review rounds 3 and 4).
    - The bottle holding the turn: its confirm, or anything opened from it — its
      search, the laptop view its Search lands on, by hand of any origin (A5's
      "Add it by hand", D1's "Neither of these"), the lot step, the chooser.
    - Otherwise the row whose Fix chain is up: the by-hand form Fix opened for
      it, and the lot step or chooser its save opened, before or after
      `byHandSaved` arrives.
    - Otherwise null: a search row, the laptop home view, D3's cellar add. */
export function addTargetId(s: SheetState): string | null {
  return turnHolder(s) ?? fixChainRow(s);
}

/** Shows `id`'s confirm. From a home view ← has nothing behind it but home. */
function openConfirm(s: SheetState, id: string): SheetState {
  const next = { ...s, activeItemId: id, confirmQueue: unqueue(s.confirmQueue, id) };
  return isHome(s.view) ? { ...next, view: "confirm", history: [s.view] } : goTo(next, "confirm");
}

/** Amendment 20 "Waiting": `id`'s confirm (its read, or a single scan's failed
    body) opens only over a home view no bottle holds (a laptop view that is
    another bottle's search is not free) or this bottle's own reading view.
    Otherwise it waits in `confirmQueue` — or, in Many, stays a row (§C.4). */
function showOrWait(s: SheetState, id: string): SheetState {
  const own = (s.view === "reading" || s.view === "confirm") && s.activeItemId === id;
  if (own || (isHome(s.view) && turnHolder(s) === null)) return openConfirm(s, id);
  if (s.multi) return s;
  return s.confirmQueue.includes(id) ? s : { ...s, confirmQueue: [...s.confirmQueue, id] };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Runs after every transition, so the turn rules hold whichever action moved
    the sheet (amendment 20):
    1. a reading or confirm view with no bottle falls back to the home view,
       and when the active bottle changes the history loses the reading and
       confirm entries of the bottle before it;
    2. a turn covered or left without the user acting on its bottle (← from its
       confirm is acting on it) puts that bottle back at the front of the queue;
    3. outside a turn, `activeItemId` names only the row whose Fix chain is up
       (`fixChainRow`), and is null on every other view;
    4. a home view no bottle holds has nothing behind it and shows no bottle
       (the laptop view reached by a confirm's Search is that bottle's search);
    5. the queue holds each offerable bottle once, never the turn holder;
    6. landing on a home view no bottle holds opens the oldest waiting confirm. */
function settle(prev: SheetState, next: SheetState, a: SheetAction): SheetState {
  let s = next;
  if ((s.view === "reading" || s.view === "confirm") && (s.activeItemId === null || !findItem(s, s.activeItemId))) {
    s = { ...s, view: homeView(s.canScan) };
  }
  if (s.activeItemId !== prev.activeItemId) s = withoutConfirmHistory(s);
  const held = turnHolder(prev);
  const leftByBack = a.type === "back" && prev.view === "confirm";
  if (held !== null && !leftByBack && isOfferable(findItem(s, held)) && turnHolder(s) !== held) {
    s = { ...s, confirmQueue: [held, ...unqueue(s.confirmQueue, held)] };
  }
  if (turnHolder(s) === null) {
    const row = fixRowAfter(prev, s);
    if (row !== s.activeItemId) s = withoutConfirmHistory({ ...s, activeItemId: row });
  }
  if (isHome(s.view) && turnHolder(s) === null && (s.history.length > 0 || s.activeItemId !== null)) {
    s = { ...s, history: [], activeItemId: null };
  }
  const holder = turnHolder(s);
  const waiting = [...new Set(s.confirmQueue)].filter((id) => id !== holder && isOfferable(findItem(s, id)));
  if (!sameIds(waiting, s.confirmQueue)) s = { ...s, confirmQueue: waiting };
  if (isHome(s.view) && holder === null && s.confirmQueue.length > 0) s = openConfirm(s, s.confirmQueue[0]);
  return s;
}

/** A `confirm` in `history` always names `activeItemId`: once the active bottle
    changes, the reading and confirm entries of the one before it go. */
function withoutConfirmHistory(s: SheetState): SheetState {
  const history = s.history.filter((view) => view !== "reading" && view !== "confirm");
  return history.length === s.history.length ? s : { ...s, history };
}

/** Outside a turn, the row whose Fix chain is up once `prev` became `s`, or
    null: the by-hand form showing an unfinished row's session starts one, and
    the lot step, the chooser and a saved form carry the row the chain had. */
function fixRowAfter(prev: SheetState, s: SheetState): string | null {
  if (!FIX_CHAIN.includes(s.view)) return null;
  if (s.view === "byhand" && s.byHand) {
    const row = sessionRow(s);
    return row !== null && isUnfinished(findItem(s, row)) ? row : null;
  }
  const carried = fixChainRow(prev);
  return carried !== null && carried === s.activeItemId && isUnfinished(findItem(s, carried)) ? carried : null;
}

/** Amendment 20 "Ids": a development-only signal for a mis-wired dispatch. */
function warnInDevelopment(message: string): void {
  if (process.env.NODE_ENV !== "production") console.warn(message);
}

function sameOrigin(a: ByHandSession["origin"], b: ByHandSession["origin"]): boolean {
  switch (a.kind) {
    case "new":
      return b.kind === "new";
    case "item":
      return b.kind === "item" && b.itemId === a.itemId;
    case "match":
      return b.kind === "match" && b.itemId === a.itemId;
    case "glass":
      return b.kind === "glass" && b.wineId === a.wineId;
    default:
      return false;
  }
}

function sameSource(a: AddSource, b: AddSource): boolean {
  if (a === b) return true;
  if (a.kind === "catalog" && b.kind === "catalog") return a.catalogWineId === b.catalogWineId;
  if (a.kind === "lot" && b.kind === "lot") return a.lotId === b.lotId;
  if (a.kind === "plusOne" && b.kind === "plusOne") return a.lotId === b.lotId;
  return false;
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function initialSheetState(p: {
  destination: AddWineDestination | null;
  options: AddWineOpenOptions;
  canScan: boolean | null;
  initialLot?: AddSource | null;
}): SheetState {
  // An edit opens on the by-hand form (spec §C.5 A1 "Edit"), never on the
  // camera, not even while its glass loads.
  const start: AddWineStart | undefined = p.options.edit ? "byhand" : p.options.start;
  const lot = p.initialLot ? { source: p.initialLot, quantity: 1, rack: "", price: "" } : null;
  return {
    view: lot ? "lot" : p.canScan === null ? "resolving" : startViewFor(start, p.canScan),
    history: [],
    requested: p.destination,
    positionOverride: null,
    start,
    adopted: null,
    canScan: p.canScan,
    multi: Boolean(p.options.multi) && manyAllowed(p.destination),
    items: [],
    activeItemId: null,
    queue: [],
    byHand: null,
    search: { query: "" },
    desktop: { query: "", focusedRow: 0, consume: true },
    cellar: { filter: null, selectedLotId: null, consume: true },
    lot,
    chooseFor: null,
    followUp: null,
    added: [],
    addedRowKeys: [],
    lastRack: null,
    closeAsk: null,
    closing: false,
    error: null,
    skippedLot: null,
    confirmQueue: [],
  };
}

export function sheetReducer(s: SheetState, a: SheetAction): SheetState {
  const next = step(s, a);
  return next === s ? s : settle(s, next, a);
}

function step(s: SheetState, a: SheetAction): SheetState {
  switch (a.type) {
    case "canScanResolved": {
      if (s.view === "resolving") return { ...s, canScan: a.canScan, view: startViewFor(s.start, a.canScan) };
      if (s.canScan === a.canScan) return s;
      return {
        ...s,
        canScan: a.canScan,
        view: viewForCanScan(s.view, a.canScan),
        history: s.history.map((view) => viewForCanScan(view, a.canScan)),
      };
    }

    case "go":
      return goTo({ ...s, skippedLot: null }, a.view);

    case "back":
      return popHistory(s, () => false);

    case "setMulti": {
      // Amendment 20: turning Many on moves every waiting read into the stack.
      const multi = a.multi && manyAllowed(currentDestination(s));
      return { ...s, multi, confirmQueue: multi ? [] : s.confirmQueue };
    }

    case "enqueue": {
      const known = new Set(s.items.map((item) => item.id));
      const fresh = a.items
        .filter((item) => !known.has(item.id))
        .map((item): ScanItem => ({
          id: item.id, photoUrl: item.photoUrl, blob: item.blob, imagePath: null,
          status: "uploading", read: null, draft: null, added: null, error: null,
        }));
      if (fresh.length === 0) return s;
      // Several photos at once turn Many on (rule 3); a single one opens the
      // reading view and then its own confirm.
      const multi = s.multi || (fresh.length > 1 && manyAllowed(currentDestination(s)));
      const next: SheetState = {
        ...s,
        items: [...s.items, ...fresh],
        queue: [...s.queue, ...fresh.map((item) => item.id)],
        multi,
        skippedLot: null,
      };
      // A photo added while a bottle holds the turn waits instead of taking
      // its view over.
      if (multi || turnHolder(next) !== null) return next;
      return goTo({ ...next, activeItemId: fresh[0].id }, "reading");
    }

    case "itemUploaded": {
      const item = findItem(s, a.id);
      if (!item || !IN_PROGRESS.includes(item.status)) return s;
      return patchItem(s, a.id, { imagePath: a.imagePath, status: "reading" });
    }

    case "itemRead": {
      const item = findItem(s, a.id);
      if (!item || !IN_PROGRESS.includes(item.status)) return s;
      const next: SheetState = {
        ...patchItem(s, a.id, {
          status: a.stack ? "pending" : "read",
          read: a.read,
          draft: a.read.draft,
          blob: null,
          error: null,
        }),
        queue: unqueue(s.queue, a.id),
      };
      // One confirm at a time: never over another bottle's reading or confirm
      // view, nor over a view the user is working in (rule 3, A3).
      if (!a.stack) return showOrWait(next, a.id);
      // A stacked partial read is a pending row with no confirm view (rule 3).
      return next.view === "reading" && next.activeItemId === a.id ? goHome(next) : next;
    }

    case "itemFailed": {
      const item = findItem(s, a.id);
      if (!item || !IN_PROGRESS.includes(item.status)) return s;
      const next: SheetState = {
        ...patchItem(s, a.id, { status: "failed", error: a.error ?? null }),
        queue: unqueue(s.queue, a.id),
      };
      // A single scan's failure replaces the confirm body (rule 4) and waits
      // its turn like a read, whichever bottle is active (amendment 20). In
      // Many it stays a row and the queue carries on (scan-8), unless its own
      // reading view is up.
      if (!next.multi) return showOrWait(next, a.id);
      return next.view === "reading" && next.activeItemId === a.id ? openConfirm(next, a.id) : next;
    }

    case "itemRetry": {
      const item = findItem(s, a.id);
      if (!item || item.status !== "failed") return s;
      // Re-read the uploaded path, or upload the kept blob again.
      const next: SheetState = {
        ...patchItem(s, a.id, { status: item.imagePath ? "reading" : "uploading", error: null }),
        queue: s.queue.includes(a.id) ? s.queue : [...s.queue, a.id],
        skippedLot: null,
      };
      // Retrying another bottle's row never takes over the bottle holding the turn.
      const holder = turnHolder(s);
      if (next.multi || (holder !== null && holder !== a.id)) return next;
      return goTo({ ...next, activeItemId: a.id }, "reading");
    }

    case "itemRemove": {
      const item = findItem(s, a.id);
      // A glass or bottle already written stays listed; only unfinished rows go.
      if (!item || WRITTEN.includes(item.status)) return s;
      const next = dropItem(s, a.id);
      // Rescan ends the turn: home, or on to the next waiting read.
      return turnHolder(s) === a.id ? goHome(next) : next;
    }

    case "itemAdded": {
      const item = a.id === null ? undefined : findItem(s, a.id);
      // A bottle already written is never added twice (rule 11).
      if (item && WRITTEN.includes(item.status)) return s;
      const holder = addTargetId(s);
      if (a.id === null && holder !== null) {
        warnInDevelopment(
          `add-wine sheet: itemAdded without an item id while ${holder} is in hand (its confirm or a view opened from it, or the by-hand form, lot step or chooser of its Fix). An add started there must name that bottle with addTargetId(state); a late reply to an add started before that also lands here (plan amendment 20).`,
        );
      }
      // Rule 2: the only way out of `read` or `pending`.
      const base = item
        ? patchItem(s, item.id, { status: a.added.incomplete ? "incomplete" : "added", added: a.added, blob: null, error: null })
        : s;
      // A by-hand session for this bottle ends with its add (say the wine was
      // found through Search instead): its edits have nowhere left to go, and a
      // dirty one would keep the close-ask counting a wine already added.
      const origin = base.byHand?.origin;
      const endsSession = item !== undefined && (origin?.kind === "item" || origin?.kind === "match") && origin.itemId === item.id;
      const recorded: SheetState = {
        ...base,
        queue: item ? unqueue(base.queue, item.id) : base.queue,
        confirmQueue: item ? unqueue(base.confirmQueue, item.id) : base.confirmQueue,
        added: [...base.added, a.added],
        byHand: endsSession ? null : base.byHand,
        closeAsk: null,
      };
      // While a bottle is in hand (its turn, or its Fix chain), an add that does
      // not name it — a late reply for another bottle, or one without an id — is
      // recorded and leaves the screen and the flow on it untouched (amendment 20 "Ids").
      if (holder !== null && holder !== a.id) return recorded;
      const rack = s.lot?.rack.trim();
      return goHome({
        ...recorded,
        // An adoption covers exactly one add (D12): the next wine is chosen
        // again, and a catalog sheet's D3 cellar follow-up hands back to it.
        adopted: null,
        lot: null,
        chooseFor: null,
        followUp: null,
        lastRack: a.added.destination === "cellar" && rack ? rack : s.lastRack,
        error: null,
        skippedLot: null,
      });
    }

    case "itemAddFailed":
      // Rule 2: the item stays as it was, with the server's message on it.
      return findItem(s, a.id) ? patchItem(s, a.id, { error: a.error }) : s;

    case "openByHand": {
      const session = s.byHand;
      // Rule 1: the same origin reuses its session, and the passed draft is ignored.
      const byHand: ByHandSession = session && sameOrigin(session.origin, a.origin)
        ? { ...session, focusField: a.focusField }
        : {
          draft: a.draft,
          origin: a.origin,
          unidentified: a.unidentified ?? false,
          focusField: a.focusField,
          attempted: false,
          dirty: false,
        };
      // Fix on a bottle's row makes that bottle the active one. If another
      // bottle held the turn (on a laptop, its search lists every row), that
      // turn is covered and its bottle waits again (amendment 20).
      const row = a.origin.kind === "item" || a.origin.kind === "match" ? findItem(s, a.origin.itemId) : undefined;
      return goTo({ ...s, byHand, skippedLot: null, activeItemId: row ? row.id : s.activeItemId }, "byhand");
    }

    case "byHandChange": {
      const session = s.byHand;
      if (!session) return s;
      const next: SheetState = { ...s, byHand: { ...session, draft: a.draft, dirty: true } };
      // A read's edits land on its item too, so its row keeps them even after
      // another session replaces this one.
      return session.origin.kind === "item" ? patchItem(next, session.origin.itemId, { draft: a.draft }) : next;
    }

    case "byHandUnidentified":
      return s.byHand ? { ...s, byHand: { ...s.byHand, unidentified: a.on, dirty: true } } : s;

    case "byHandAttempted":
      return s.byHand ? { ...s, byHand: { ...s.byHand, attempted: true, focusField: a.focusField } } : s;

    case "byHandDiscard": {
      const session = s.byHand;
      let next: SheetState = { ...s, byHand: null };
      if (session?.origin.kind === "item") {
        // Discarding a read's edits returns its row to what the label read.
        const item = findItem(next, session.origin.itemId);
        if (item?.read) next = patchItem(next, item.id, { draft: item.read.draft });
      }
      return s.view === "byhand" ? sheetReducer(next, { type: "back" }) : next;
    }

    case "byHandSaved":
      return { ...s, byHand: null };

    case "searchQuery":
      return { ...s, search: { query: a.query } };

    case "desktopQuery":
      return a.query === s.desktop.query ? s : { ...s, desktop: { ...s.desktop, query: a.query, focusedRow: 0 } };

    case "desktopFocus":
      return { ...s, desktop: { ...s.desktop, focusedRow: a.row } };

    case "consume":
      return a.surface === "desktop"
        ? { ...s, desktop: { ...s.desktop, consume: a.consume } }
        : { ...s, cellar: { ...s.cellar, consume: a.consume } };

    case "cellarFilter":
      return { ...s, cellar: { ...s.cellar, filter: a.filter } };

    case "cellarSelect":
      return { ...s, cellar: { ...s.cellar, selectedLotId: a.lotId } };

    case "openLot": {
      // Reopening the same wine keeps what was typed (rule 1); another wine
      // starts from one bottle on the last rack used this session (B1).
      const lot = s.lot && sameSource(s.lot.source, a.source)
        ? s.lot
        : { source: a.source, quantity: 1, rack: s.lastRack ?? "", price: "" };
      return goTo({ ...s, lot, skippedLot: null }, "lot");
    }

    case "lotField": {
      const lot = s.lot;
      if (!lot) return s;
      if (a.field === "quantity") {
        const quantity = Math.round(Number(a.value));
        return Number.isFinite(quantity) && quantity >= 1 ? { ...s, lot: { ...lot, quantity } } : s;
      }
      return a.field === "rack"
        ? { ...s, lot: { ...lot, rack: String(a.value) } }
        : { ...s, lot: { ...lot, price: String(a.value) } };
    }

    case "choose":
      return goTo(
        {
          ...s,
          chooseFor: { source: a.source, itemId: a.itemId, title: a.title, missing: a.missing },
          error: null,
          skippedLot: null,
        },
        "choose",
      );

    case "adopt":
      return { ...s, adopted: a.destination, multi: s.multi && manyAllowed(a.destination), error: null };

    case "adoptFailed":
      // Rule 5: the chooser can be revisited, with the error on it (scan-4).
      return { ...goTo(s, "choose"), adopted: null, error: a.error };

    case "followUp":
      return goTo(
        { ...s, followUp: { catalogWineId: a.catalogWineId, title: a.title, written: a.written } },
        "followup",
      );

    case "followUpDone":
      // D3 "Done — add another wine": the catalog home view with fresh state.
      return goHome({
        ...s,
        followUp: null,
        adopted: null,
        lot: null,
        chooseFor: null,
        error: null,
        skippedLot: null,
        search: { query: "" },
        desktop: { ...s.desktop, query: "", focusedRow: 0 },
      });

    case "requestClose": {
      // Rule 7 (D7): ask before throwing unfinished work away.
      const unfinished = unfinishedCount(s);
      return unfinished > 0 ? { ...s, closeAsk: { unfinished } } : { ...s, closeAsk: null, closing: true };
    }

    case "cancelClose":
      return { ...s, closeAsk: null };

    case "discardAndClose":
      return {
        ...s,
        items: s.items.filter((item) => WRITTEN.includes(item.status)),
        queue: [],
        confirmQueue: [],
        byHand: null,
        closeAsk: null,
        closing: true,
      };

    case "positionAdvanced":
      // `requested` never changes; currentDestination applies the override.
      return { ...s, positionOverride: a.position };

    case "rowAdded":
      return s.addedRowKeys.includes(a.key) ? s : { ...s, addedRowKeys: [...s.addedRowKeys, a.key] };

    case "error":
      return { ...s, error: a.error };

    case "lotSkipped": {
      // Amendments 18 and 20 (D17): nothing is written. The bottle the lot step
      // was opened for leaves the stack as if removed, and the sheet returns to
      // where the add started, like ←, skipping that bottle's confirm and its
      // by-hand form (nothing is left to save there): the camera or the Many
      // stack for a scan, the search view for a phone search add, the laptop
      // view on a laptop.
      const item = a.itemId === null ? undefined : findItem(s, a.itemId);
      const dropped = item && !WRITTEN.includes(item.status) ? item.id : null;
      const next: SheetState = {
        ...(dropped ? dropItem(s, dropped) : s),
        lot: null,
        chooseFor: null,
        adopted: null,
        error: null,
        skippedLot: { lotId: a.lotId },
      };
      const droppedInHand = dropped !== null && addTargetId(s) === dropped;
      return popHistory(next, (view) => droppedInHand && (view === "confirm" || view === "reading" || view === "byhand"));
    }

    default: {
      const unknown: never = a;
      throw new Error(`Unknown add-wine sheet action: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Rule 10: ← pops the history, skipping `reading`, `lot` and `choose` (and
    whatever `skip` names); an empty history goes to the home view. */
function popHistory(s: SheetState, skip: (view: SheetView) => boolean): SheetState {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const view = s.history[i];
    if (!BACK_SKIPS.includes(view) && view !== s.view && !skip(view)) {
      return { ...s, view, history: s.history.slice(0, i) };
    }
  }
  return { ...s, view: homeView(s.canScan), history: [] };
}

// ---------------------------------------------------------------------------
// Selectors and dispatch helpers
// ---------------------------------------------------------------------------

/** `adopted ?? requested`, with a flight's position replaced by
    `positionOverride` once adds have moved it on. */
export function currentDestination(s: SheetState): AddWineDestination | null {
  const destination = s.adopted ?? s.requested;
  if (destination?.kind !== "flight") return destination;
  if (s.positionOverride === null || destination.position === s.positionOverride) return destination;
  return { ...destination, position: s.positionOverride };
}

/** Rule 7: rows that are pending, failed, or read but not added, plus a dirty
    by-hand session. Incomplete flight glasses are already added (D7). */
export function unfinishedCount(s: SheetState): number {
  const unfinished = s.items.filter((item) => UNFINISHED.includes(item.status));
  const session = s.byHand;
  if (!session?.dirty) return unfinished.length;
  // A dirty session on a row that already counts is the same wine.
  const origin = session.origin;
  const onCountedRow =
    (origin.kind === "item" || origin.kind === "match") && unfinished.some((item) => item.id === origin.itemId);
  return unfinished.length + (onCountedRow ? 0 : 1);
}

/** "Done · N wines added": every add this session, incomplete flight glasses included (A4). */
export function footerCount(s: SheetState): number {
  return s.added.length;
}

export type ItemRowCopy = {
  tone: "added" | "incomplete" | "pending" | "failed" | "reading";
  label: string;
  detail: string | null;
  actions: ("fix" | "remove" | "retry")[];
};

function itemTitle(item: ScanItem): string {
  if (item.read?.display.title) return item.read.display.title;
  if (item.added?.label) return item.added.label;
  return item.draft ? readDisplay(item.draft, NO_NAMES).title : "";
}

/** The sheet's draft once it holds one (edits land there), else the read's gaps. */
function itemGaps(item: ScanItem): readonly WineFieldKey[] {
  if (item.draft) return missingWineFields(item.draft);
  return item.read?.missing ?? [];
}

/** "{title} · {describeUnread(missing)}" (A4). */
function gapsLabel(item: ScanItem, missing: readonly WineFieldKey[]): string {
  return [itemTitle(item), describeUnread(missing)].filter(Boolean).join(" · ");
}

function addedDetail(added: AddedWine): string | null {
  // Amendment 20: a row always knows where it went. The sheet's destination
  // can differ (an adoption, a D3 follow-up), so it is never consulted.
  switch (added.destination) {
    case "flight":
      return added.glass != null ? glassLabel(added.glass) : null;
    case "catalog":
      return added.written ? "Added to the catalog" : "Already in the catalog";
    default:
      return null;
  }
}

/** One A4 row (spec §C.5): the phone's multi stack and the laptop list both
    render it. `destination` keeps the spec's signature; every row's copy comes
    from the row itself (amendment 20). */
export function itemRowCopy(item: ScanItem, destination: AddWineDestination | null): ItemRowCopy {
  void destination;
  switch (item.status) {
    case "added":
      return {
        tone: "added",
        label: item.added?.label ?? itemTitle(item),
        detail: item.added ? addedDetail(item.added) : null,
        actions: [],
      };
    case "incomplete":
      return {
        tone: "incomplete",
        label: gapsLabel(item, item.added?.incomplete?.missing ?? itemGaps(item)),
        detail: null,
        actions: ["fix"],
      };
    case "pending":
    case "read":
      // A read the user backed out of is unfinished just like a pending row:
      // nothing is written, and it can be fixed or removed (rule 7).
      return { tone: "pending", label: gapsLabel(item, itemGaps(item)), detail: item.error, actions: ["fix", "remove"] };
    case "failed":
      return { tone: "failed", label: "Couldn't read this photo", detail: null, actions: ["retry", "remove"] };
    case "uploading":
    case "reading":
      return { tone: "reading", label: "Reading the label…", detail: null, actions: [] };
    default: {
      const unknown: never = item.status;
      throw new Error(`Unknown scan item status: ${String(unknown)}`);
    }
  }
}

/** Where an add goes next (D12). With no destination it always asks first, so
    a cellar lot is never poured into a hinted flight on its own (rule 6). */
export function routeAdd(
  s: SheetState,
  source: AddSource,
): { next: "choose" | "lot" | "catalog-then-lot" | "note" | "write" } {
  const destination = currentDestination(s);
  if (destination === null) return { next: "choose" };
  switch (destination.kind) {
    case "note":
      return { next: "note" };
    case "cellar":
      // Quantity, rack and price come first. An identity is written to the
      // catalog before that, so the lot step's duplicate check always runs (B1).
      if (source.kind === "catalog") return { next: "lot" };
      if (source.kind === "identity") return { next: "catalog-then-lot" };
      return { next: "write" };
    case "flight":
    case "catalog":
      return { next: "write" };
    default: {
      const unknown: never = destination;
      throw new Error(`Unknown add-wine destination: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Rule 3: in Many, or a laptop queue, a partial read the matrix stacks becomes
    a pending row instead of a confirm view. */
export function stackPartialRead(s: SheetState, missing: readonly WineFieldKey[], matrix: SheetMatrix): boolean {
  return s.multi && missing.length > 0 && matrix.partialRead.stacked === "pending-row";
}

/** The `rowAdded` key for a cellar lot row. */
export function lotRowKey(lotId: string): string {
  return `${LOT_PREFIX}${lotId}`;
}

/** The `rowAdded` key for a catalog or tasted row. */
export function wineRowKey(catalogWineId: string): string {
  return `${WINE_PREFIX}${catalogWineId}`;
}

/** Rule 11: a row just poured reads "in flight" before any refetch. The search
    marks rows by catalog wine, so a poured lot also puts its wine's catalog and
    tasted rows (and its other lots) in flight, and the refetch agrees. */
export function markAddedInFlight(groups: SearchGroups, keys: readonly string[]): SearchGroups {
  if (keys.length === 0) return groups;
  const poured = new Set(keys);
  const wines = new Set(
    keys.filter((key) => key.startsWith(WINE_PREFIX)).map((key) => key.slice(WINE_PREFIX.length)),
  );
  for (const lot of groups.cellar) {
    if (poured.has(lotRowKey(lot.lotId))) wines.add(lot.catalogWineId);
  }
  const mark = <R extends { inFlight: boolean }>(row: R, hit: boolean): R =>
    hit && !row.inFlight ? { ...row, inFlight: true } : row;
  return {
    cellar: groups.cellar.map((row) => mark(row, poured.has(lotRowKey(row.lotId)) || wines.has(row.catalogWineId))),
    catalog: groups.catalog.map((row) => mark(row, wines.has(row.catalogWineId))),
    tasted: groups.tasted.map((row) => mark(row, wines.has(row.catalogWineId))),
  };
}
