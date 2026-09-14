// The add-wine sheet's state (spec §C.4). The view, the scanned items, the
// by-hand session and every field that must survive navigation live in one
// reducer, so leaving a view never loses what was read or typed (RC8). The
// shell renders from `useReducer(reduceSheet, initialSheetState(...))`, and its
// adds hook (use-sheet-adds.ts) performs the writes and reports back through
// these actions with `reduceSheet` too: one dispatch path, the reducer plus the
// adoption give-back (plan amendment 22). The rules the hook enforces live here
// as pure helpers (`routeAdd`, `addTargetId`, `shouldCloseAfterSingleAdd`,
// `ticketFor`, `replyIsCurrent`, `unaddedItem`) and actions (`addLanded`,
// `notePicked`: a note pick closes the sheet only when nothing else is left, or
// asks first), since vitest cannot load the hook. Amendment 23: every action
// that waits on the server carries the `ReplyTicket` it started with, and a
// stale one is recorded but never moves the sheet. S5a and S5b may add actions;
// never rename or remove one.
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
  AddSource, AddWineDestination, AddWineOpenOptions, AddWineStart, AddedWine, NotePick, SearchGroups,
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
  /** Plan amendment 23 (wave C3 re-review): the sheet's `flow` when this
      session opened. Reopening the same origin keeps the session and this
      stamp (rule 1), so a by-hand save whose ticket was taken at a later flow
      was made on this very session, and its landing ends it, edits made since
      included (`recordLanded`). A session opened afresh meanwhile (after
      Discard) is another wine, and stays. */
  opened: number;
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
  /** Rule 7's footer ask. `note` (plan amendment 23, accepted) is the pick a
      note waits on: Discard hands it on as the sheet closes, and every other
      answer ends the ask without handing it on (`notePicked`, `reduceSheet`).
      The pick itself stays while its own confirm, chooser or form is on
      screen, so Rate it now or the form's save asks again. */
  closeAsk: { unfinished: number; note?: NotePick } | null;
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
  /** Plan amendment 23: counts the user's steps that move or close the sheet —
      navigation, ←, opening by hand, the lot step or the chooser, a photo
      taking the screen, Rescan, Don't add it, `requestClose`, `cancelClose` and
      Discard. Background steps (uploads, reads, failures, position and row
      updates) and server replies leave it unchanged. A reply is current only
      while it still matches its `ReplyTicket` (`replyIsCurrent`). */
  flow: number;
  /** S5b review (spec §C.4 rule 1: a session ends only on a successful save, on
      Discard, or when the sheet closes): the by-hand forms with typing in them
      that another form's open set aside, oldest first. Never the form in
      `byHand`, and at most one per wine (`sessionToReopen`). Opening that wine
      again reopens it; rule 7's ask and a note pick's ask count it like the
      form on screen. It ends only when its own save lands (the reply's
      `ticket.form`), its glass is saved, its row is added or removed, or Discard
      closes the sheet. A form with nothing typed in it is not kept. */
  parkedByHand: ByHandSession[];
  /** BT-L3 (S4c): Swap in progress on this glass — `swapStarted` parks the edit
      form (as `openByHand`'s give-back does) and routes to the flight
      destination's start view; `swapCancelled` reopens it. `glass` is the
      glass's list-order number, known once the edit form has loaded it, or
      null when `options.swap` opened straight into swap mode before it did. */
  swap: { wineId: string; glass: number | null } | null;
};

/** Plan amendment 23: what an action that waits on the server started with —
    the sheet's `flow`, the bottle in hand (`addTargetId`) and the view. `form`
    (S5b review, spec §C.4 rule 1) is the `opened` stamp of the by-hand form the
    sheet held then, absent while it held none: a save's landing ends exactly
    that form, on screen or set aside (`parkedByHand`). */
export type ReplyTicket = { flow: number; itemId: string | null; view: SheetView; form?: number };

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
  /** `ticket` (amendment 23): a form opened once a load returns (By hand on a matched read, Edit) opens only while its ticket is current. */
  | { type: "openByHand"; origin: ByHandSession["origin"]; draft: WineIdentityDraft; focusField: WineFieldKey | null; unidentified?: boolean; ticket?: ReplyTicket }
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
  /** `ticket` (amendment 23): catalog-then-lot's lot step opens only while the catalog write's ticket is current. */
  | { type: "openLot"; source: AddSource; ticket?: ReplyTicket }
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
  | { type: "lotSkipped"; itemId: string | null; lotId: string }
  /** S5a (spec §C.5 A4b, D7): "Leave it for later" where a partial read is a
      pending row (`matrix.partialRead.stacked === "pending-row"`: the cellar,
      the catalog, no destination, an OPEN flight). Nothing is written. A Fix
      session's row takes the form's draft and stays a pending row; a read not
      yet added becomes one, so its confirm is never offered again. A new
      session becomes a pending row of its own, `rowId`. The session ends, since
      its row now holds the draft, and the sheet returns to the stack. A chooser
      pick made for that bottle is given back (D12: an adoption covers one add),
      so the next wine is chosen again (rule 6). A glass session is never a
      row: its "Leave it for later" saves the glass. */
  | { type: "byHandLeftForLater"; rowId: string }
  /** S5a (spec §C.8): `saveFlightGlass` saved an existing glass: an Edit,
      finishing an incomplete glass, or leaving it for later once more. A row
      that added that glass this session follows it: added once complete,
      otherwise still incomplete with the new gaps. The glass's session ends,
      and the form, if it is on screen, gives way like ←. */
  | { type: "glassSaved"; added: AddedWine; ticket?: ReplyTicket; draft?: WineIdentityDraft; closeSheet?: boolean }
  /** S5a review (spec §C.4 rules 2 and 5; §C.5 E1): an add was refused — by
      the server, by a call that threw, or as a note pick that cannot open. The
      row it named keeps its place with the message (rule 2). A by-hand save's
      refusal (`byHand`: the form's save, directly or through the lot step or
      chooser it opened) flags the first `missing` field on the form. With no
      requested destination an adoption can only be a chooser pick, so every
      add made under one — the pick's own add, By hand opened for its gaps
      (E1), the lot step it opened — gives the pick back and returns to the
      chooser with the error (scan-4). Only a refusal the form on screen can
      fix keeps the pick. Plan amendment 22: a by-hand save refused for missing
      fields on the lot step or chooser its save opened returns to that form,
      where the gap can be fixed, still giving the pick back; without missing
      fields it returns to the chooser. D3's cellar follow-up (`requested`
      catalog) stays where it is, with the error. */
  | { type: "addRefused"; itemId: string | null; error: string; missing?: WineFieldKey[]; byHand: boolean; ticket?: ReplyTicket }
  /** S5a review, round 2 (spec §C.4 rules 5 and 6; D12; sources-2, entry-3): an
      adoption covers one add, made through its own chain: the by-hand form and
      lot step opened on top of where it was made (E1's rows on a read's
      confirm, the chooser, D3's follow-up). `reduceSheet`, which the shell's
      reducer and the adds hook's `send` both run, applies this once `leavesAdoption`
      says a dispatch left that chain without the add: ← to where it was made
      or below, going home, Search or Search instead, Rescan, Discard, another
      bottle or a photo taking the screen. The adoption is given back, so the
      next wine is chosen again and nothing goes into a hinted flight on its
      own. A chooser left behind goes with it; one still on screen keeps its
      wine. */
  | { type: "adoptionLeft" }
  /** S5a, plan amendment 23 on the note hand-off (spec §C.5 C1, C2, D3 and
      E1; §C.4 rules 3, 4 and 7): a note pick is ready to hand on. The note
      opens once the sheet has closed, and closing for it drops nothing unasked.
      A pick that waited on a catalog write carries its `ticket` and does
      nothing once stale.
      With nothing else in the sheet it closes (`closing`). Otherwise the footer
      asks first, as rule 7 does, holding the pick (`closeAsk.note`) and
      counting every row closing would drop, photos still uploading or being
      read included (`queue`, `confirmQueue`), and a dirty by-hand form for
      another wine. The pick's own bottle (`itemId`, its `addTargetId` when the
      pick started) and the by-hand form whose save made it (`fromForm`) never
      count. Discard hands the pick on; every other answer ends the ask, and the
      pick is given back only once its own chain is gone (`reduceSheet`). */
  | { type: "notePicked"; pick: NotePick; itemId: string | null; fromForm: boolean; ticket?: ReplyTicket }
  /** Plan amendment 23 (spec §C.2 "After an add"): an add came back ok. One
      step, so its ticket is judged once, before the add moves anything. It is
      always recorded, once (`itemAdded` for `id`; a wine of its own when `id`
      names a row already written). While the ticket is current it also
      lands as round 1's hook did: the saved by-hand session ends, then "Add and
      scan the next" (`scanNext`: Many on, then home), or D3 on a catalog sheet,
      and a phone's single add closes when `shouldCloseAfterSingleAdd` allows
      (`warning` keeps it open). A stale one moves nothing: see `recordLanded`. */
  | {
      type: "addLanded"; ticket: ReplyTicket; id: string | null; added: AddedWine; source: AddSource;
      /** The by-hand form's save, directly or through the lot step or chooser it opened. */
      byHand: boolean;
      /** That form's draft when the save started, or null. */
      draft: WineIdentityDraft | null;
      /** The pick the add was made under (`adopted` when it started), or null. */
      adopted: AddWineDestination | null;
      scanNext: boolean;
      warning: string | null;
    }
  /** BT-L3 (S4c): the by-hand form's Swap row — stores `swap` and routes to the
      flight destination's start view (the matrix's normal sources). Leaves the
      state unchanged while `items` or `confirmQueue` is non-empty (a read
      keeps its turn; the edit form never has one, so this only guards a stray
      dispatch); forces `multi` off. `glass` is the edit form's own header
      number, or null while it is still loading. */
  | { type: "swapStarted"; wineId: string; glass: number | null }
  /** BT-L3 (S4c): the swap start view's back/close — clears `swap` and returns
      to the edit form it parked, or lands home by the landing rule (opening
      the oldest waiting read, if there is one) when there is none. */
  | { type: "swapCancelled" };

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ItemStatus = ScanItem["status"];

const IN_PROGRESS: readonly ItemStatus[] = ["uploading", "reading"];

/** The row label when the account has spent its label reads (scan/actions.ts's "too-many"). */
const SCAN_QUOTA_LABEL = "No label scans left right now — add it by hand";
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
    // would keep the close-ask counting a wine the user removed or skipped —
    // on screen or set aside.
    byHand: sessionRow(s) === id ? null : s.byHand,
    parkedByHand: withoutRowForms(s.parkedByHand, id),
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
    add never names this; it names `addTargetId`, which also covers a row's Fix.
    After a stale add it can name a bottle already written whose screen stayed
    up (amendment 23): nothing started there names that bottle any more. */
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
    - Otherwise null: a search row, the laptop home view, D3's cellar add.
    Never a bottle already written (plan amendment 23, wave C3 re-review): a
    stale add leaves its screen up — the bottle's confirm, its search or laptop
    view, the lot step, the chooser — but that bottle is in, so an add started
    there is a wine of its own. It names no bottle, and lands, counts and spends
    its lot step, chooser and pick like a search row's add. */
export function addTargetId(s: SheetState): string | null {
  const id = turnHolder(s) ?? fixChainRow(s);
  return id !== null && unaddedItem(s, id) !== null ? id : null;
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

/** Rule 1 (S5b review): the same wine's form. A Fix and a By hand on one bottle
    are that bottle's form, whichever opened it. */
function sameForm(a: ByHandSession["origin"], b: ByHandSession["origin"]): boolean {
  if (sameOrigin(a, b)) return true;
  return (a.kind === "item" || a.kind === "match") && (b.kind === "item" || b.kind === "match") && a.itemId === b.itemId;
}

/** The row a form was opened for (Fix, or By hand on a read), or null. */
function formRow(form: ByHandSession): string | null {
  return form.origin.kind === "item" || form.origin.kind === "match" ? form.origin.itemId : null;
}

/** The forms set aside, without those for row `id`; the same list when there are none. */
function withoutRowForms(forms: ByHandSession[], id: string): ByHandSession[] {
  return forms.some((form) => formRow(form) === id) ? forms.filter((form) => formRow(form) !== id) : forms;
}

/** Every by-hand form with typing in it: the one in `byHand`, then those set aside (rule 1). */
function typedForms(s: SheetState): ByHandSession[] {
  const shown = s.byHand?.dirty ? [s.byHand] : [];
  return [...shown, ...s.parkedByHand.filter((form) => form.dirty)];
}

/** A glass saved again replaces what its add said about it. A glass saved
    complete carries no `incomplete`. */
function savedGlass(before: AddedWine, saved: AddedWine): AddedWine {
  const merged: AddedWine = { ...before, ...saved, glass: saved.glass ?? before.glass };
  if (!saved.incomplete) delete merged.incomplete;
  return merged;
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
  // camera, not even while its glass loads. BT-L3: `options.swap` opens
  // straight into swap mode instead, on the ordinary start view (the matrix's
  // normal sources) — never forced to "byhand", there is no edit form yet.
  const start: AddWineStart | undefined = p.options.edit ? "byhand" : p.options.swap ? undefined : p.options.start;
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
    flow: 0,
    parkedByHand: [],
    swap: p.options.swap ? { wineId: p.options.swap.wineId, glass: null } : null,
  };
}

export function sheetReducer(s: SheetState, a: SheetAction): SheetState {
  const next = step(s, a);
  if (next === s) return s;
  const settled = settle(s, next, a);
  // Amendment 23: a user step that moves or closes the sheet starts a new flow
  // (a nested step, like Discard's ←, has already counted it).
  return movesSheet(s, settled, a) && settled.flow === s.flow ? { ...settled, flow: s.flow + 1 } : settled;
}

/** Amendment 23: the user's steps that move or close the sheet whenever they change it. */
const USER_MOVES: readonly SheetAction["type"][] = [
  "go", "back", "openByHand", "openLot", "choose", "byHandDiscard", "byHandLeftForLater", "lotSkipped", "followUpDone",
  "requestClose", "cancelClose", "discardAndClose", "swapStarted", "swapCancelled",
];
/** Amendment 23: user steps that count only when they take the screen — a photo, a Retry or a Rescan of the bottle on it. */
const USER_MOVES_ON_SCREEN: readonly SheetAction["type"][] = ["enqueue", "itemRetry", "itemRemove"];

function movesSheet(prev: SheetState, next: SheetState, a: SheetAction): boolean {
  if (USER_MOVES.includes(a.type)) return true;
  if (!USER_MOVES_ON_SCREEN.includes(a.type)) return false;
  return next.view !== prev.view || next.activeItemId !== prev.activeItemId || !sameIds(next.history, prev.history);
}

/** The sheet's one dispatch path (plan amendments 22 and 23; D12; spec §C.4
    rules 5 and 6): `sheetReducer`, then the adoption give-back, then the end of
    a note pick's close-ask. A chooser pick, or D3's "Add it to my cellar",
    covers one add made through its own chain; once a step leaves that chain
    without the add (`leavesAdoption`), `adoptionLeft` gives the adoption back,
    so the next wine is chosen again and nothing goes to a destination unasked.
    That is the only way a pick is given back: a note pick's close-ask
    (`notePicked`) waits for Discard, and any other answer ends the ask
    (`endsNoteAsk`) while the pick stays for as long as its own confirm, chooser
    or form is on screen (amendment 23). A stale reply never ends an ask.
    The shell's `useReducer` and the adds hook's `send` both run it, so React's
    state and the hook's `stateRef` take the same step, and the tests run
    exactly what ships. */
export function reduceSheet(s: SheetState, a: SheetAction): SheetState {
  const stale = isStaleReply(s, a);
  let next = sheetReducer(s, a);
  if (leavesAdoption(s, next)) next = sheetReducer(next, { type: "adoptionLeft" });
  if (stale || !endsNoteAsk(s, next, a)) return next;
  // Rule 7's own ask (✕) may have replaced it; otherwise the ask goes.
  return next.closeAsk === s.closeAsk ? { ...next, closeAsk: null } : next;
}

/** Plan amendment 23: the ticket an action that waits on the server takes when
    it starts — read it from `stateRef.current` at that moment. */
export function ticketFor(s: SheetState): ReplyTicket {
  const ticket: ReplyTicket = { flow: s.flow, itemId: addTargetId(s), view: s.view };
  return s.byHand === null ? ticket : { ...ticket, form: s.byHand.opened };
}

/** Plan amendment 23: whether a server reply may still act — no user step has
    moved or closed the sheet since it started (`flow`), the same bottle is in
    hand and the same view is up. A reply started while the first view was
    still resolving only needs the first two: nothing but ✕ can be tapped
    there. A stale reply is still recorded, but never navigates, closes the
    sheet, raises or ends a close-ask, or opens the note. */
export function replyIsCurrent(s: SheetState, ticket: ReplyTicket): boolean {
  return ticket.flow === s.flow && ticket.itemId === addTargetId(s) && (ticket.view === s.view || ticket.view === "resolving");
}

function isStaleReply(s: SheetState, a: SheetAction): boolean {
  return "ticket" in a && a.ticket !== undefined && !replyIsCurrent(s, a.ticket);
}

/** The listed row `id`, unless it is already written (added, or an incomplete
    glass): the only rows an add, a save or a chooser pick may start from, so a
    confirm or form whose add landed while the user was away never writes it
    again (amendment 23). */
export function unaddedItem(s: SheetState, id: string): ScanItem | null {
  const item = findItem(s, id);
  return item !== undefined && !WRITTEN.includes(item.status) ? item : null;
}

/** Rule 1 (S5b review): the form an open of `origin` reopens — the one on
    screen, or one set aside — for the same wine (a Fix and a By hand on one
    bottle are that bottle's form), or null when the open starts a form of its
    own. The reducer's `openByHand` and the shell's By hand both ask it. */
export function sessionToReopen(s: SheetState, origin: ByHandSession["origin"]): ByHandSession | null {
  if (s.byHand !== null && sameForm(s.byHand.origin, origin)) return s.byHand;
  return s.parkedByHand.find((form) => sameForm(form.origin, origin)) ?? null;
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
      // A by-hand session for this bottle — on screen or set aside — ends with its
      // add (say the wine was found through Search instead): its edits have
      // nowhere left to go, and a dirty one would keep the close-ask counting a
      // wine already added.
      const origin = base.byHand?.origin;
      const endsSession = item !== undefined && (origin?.kind === "item" || origin?.kind === "match") && origin.itemId === item.id;
      const recorded: SheetState = {
        ...base,
        queue: item ? unqueue(base.queue, item.id) : base.queue,
        confirmQueue: item ? unqueue(base.confirmQueue, item.id) : base.confirmQueue,
        added: [...base.added, a.added],
        byHand: endsSession ? null : base.byHand,
        parkedByHand: item ? withoutRowForms(base.parkedByHand, item.id) : base.parkedByHand,
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
      // Amendment 23: a form a load opens waits on the server, so a stale one never opens.
      if (a.ticket && !replyIsCurrent(s, a.ticket)) return s;
      const session = s.byHand;
      // Rule 1: the same wine reuses its form — the one on screen, or one set
      // aside — and the passed draft is ignored.
      const kept = sessionToReopen(s, a.origin);
      const byHand: ByHandSession = kept !== null
        ? { ...kept, focusField: a.focusField }
        : {
          draft: a.draft,
          origin: a.origin,
          unidentified: a.unidentified ?? false,
          focusField: a.focusField,
          attempted: false,
          dirty: false,
          opened: s.flow,
        };
      // Rule 1 (S5b review): another form's open never drops typing. A form with
      // typing in it is set aside, still counted by rule 7, until its wine opens
      // it again; one with nothing typed in it has nothing to keep.
      const others = kept === null ? s.parkedByHand : s.parkedByHand.filter((form) => form !== kept);
      const parkedByHand = session !== null && session !== kept && session.dirty ? [...others, session] : others;
      // Fix on a bottle's row makes that bottle the active one. If another
      // bottle held the turn (on a laptop, its search lists every row), that
      // turn is covered and its bottle waits again (amendment 20).
      const row = a.origin.kind === "item" || a.origin.kind === "match" ? findItem(s, a.origin.itemId) : undefined;
      return goTo({ ...s, byHand, parkedByHand, skippedLot: null, activeItemId: row ? row.id : s.activeItemId }, "byhand");
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
      // Amendment 23: catalog-then-lot's lot step waits on the catalog write, so
      // a stale one never opens (the write happened; the user can add again).
      if (a.ticket && !replyIsCurrent(s, a.ticket)) return s;
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
        parkedByHand: [],
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

    case "addRefused": {
      // Rule 2: the row stays as it was, with the server's message on it.
      let next = a.itemId === null ? s : step(s, { type: "itemAddFailed", id: a.itemId, error: a.error });
      // Amendment 23: a stale refusal is recorded (the row's error and the error
      // line), but flags no field, gives no pick back and moves nothing.
      if (a.ticket && !replyIsCurrent(s, a.ticket)) return { ...next, error: a.error };
      const field = a.byHand && next.byHand !== null ? (a.missing?.[0] ?? null) : null;
      if (field !== null) next = step(next, { type: "byHandAttempted", focusField: field });
      const chooserPick = next.requested === null && next.adopted !== null;
      if (!chooserPick || (field !== null && next.view === "byhand")) return step(next, { type: "error", error: a.error });
      // Amendment 22: a by-hand save refused for what it is missing goes back to
      // its form, where the gap can be fixed. The pick is given back all the
      // same (its chooser or lot step is left behind), so the save asks again.
      const form = field !== null ? backToForm(next) : null;
      if (form !== null) return { ...form, adopted: null, chooseFor: null, error: a.error };
      // Rule 5: back to the chooser the pick came from. One left behind by an
      // earlier wine (← from it) is dropped, so its rows act on the bottle in
      // hand: an E1 pick is made on that bottle's confirm, not the choose view.
      const ownChooser = next.view === "choose" || next.history.includes("choose");
      return step({ ...next, chooseFor: ownChooser ? next.chooseFor : null }, { type: "adoptFailed", error: a.error });
    }

    case "byHandLeftForLater": {
      // S5a (A4b, D7): nothing is written. The row holds the form's draft from
      // here on, so the session ends and the sheet returns to the stack. A read
      // that becomes a pending row is no longer offerable, so `settle` never
      // offers its confirm again, and moves on to a read waiting its turn. A
      // chooser pick for that bottle covered no add, so it is given back (D12).
      const session = s.byHand;
      if (!session || session.origin.kind === "glass") return s;
      const origin = session.origin;
      let next: SheetState = s;
      if (origin.kind === "new") {
        if (findItem(s, a.rowId)) return s;
        const row: ScanItem = {
          id: a.rowId, photoUrl: session.draft.imageUrl ?? "", blob: null, imagePath: null,
          status: "pending", read: null, draft: session.draft, added: null, error: null,
        };
        next = { ...s, items: [...s.items, row] };
      } else {
        const item = findItem(s, origin.itemId);
        if (item && (item.status === "read" || item.status === "pending")) {
          next = patchItem(s, item.id, { status: "pending", draft: session.draft });
        }
      }
      return goHome({ ...next, byHand: null, skippedLot: null, adopted: null });
    }

    case "glassSaved": {
      // S5a (§C.8): the glass was saved, not added again, so `added` keeps its
      // count; only what it says about this glass changes.
      const wineId = a.added.wineId;
      if (!wineId) return s;
      const session = s.byHand;
      const glassSession = session?.origin.kind === "glass" && session.origin.wineId === wineId ? session : null;
      // Amendment 23: a stale save is recorded on its rows, but never leaves the
      // form or closes an Edit open. Its session ends only while it still holds
      // the draft that was saved; edits made since stay.
      const current = !a.ticket || replyIsCurrent(s, a.ticket);
      const own = glassSession !== null && (current || glassSession.draft === a.draft) ? glassSession : null;
      // The same holds for its form set aside (rule 1, S5b review).
      const parked = s.parkedByHand.find((form) => form.origin.kind === "glass" && form.origin.wineId === wineId) ?? null;
      const ownParked = parked !== null && (current || parked.draft === a.draft) ? parked : null;
      const saved = own ?? ownParked;
      const next: SheetState = {
        ...s,
        items: s.items.map((item): ScanItem => {
          if (!item.added || item.added.wineId !== wineId) return item;
          return {
            ...item,
            status: a.added.incomplete ? "incomplete" : "added",
            added: savedGlass(item.added, a.added),
            draft: saved ? saved.draft : (a.draft ?? item.draft),
            error: null,
          };
        }),
        added: s.added.map((entry) => (entry.wineId === wineId ? savedGlass(entry, a.added) : entry)),
        byHand: own ? null : s.byHand,
        parkedByHand: ownParked ? s.parkedByHand.filter((form) => form !== ownParked) : s.parkedByHand,
        error: current ? null : s.error,
      };
      const shown = current && own && s.view === "byhand" ? popHistory(next, () => false) : next;
      // An Edit open is for this one glass, so its save ends the sheet — asking
      // first, like ✕, while other rows are unfinished (rule 7).
      return current && a.closeSheet === true ? sheetReducer(shown, { type: "requestClose" }) : shown;
    }

    case "adoptionLeft":
      // S5a review, round 2 (D12, rule 6): the adoption covered no add, so it is
      // given back. A chooser on screen keeps its wine. One left behind is
      // dropped, so a later refusal's return to the chooser acts on the wine in
      // hand, never on it.
      return s.adopted === null ? s : { ...s, adopted: null, chooseFor: s.view === "choose" ? s.chooseFor : null };

    case "notePicked": {
      // Amendment 23: a stale pick does nothing — its catalog write already
      // happened, and the user can pick again. A current one closes only when
      // nothing else is left; otherwise it asks first, holding the pick for
      // Discard (rule 7).
      if (a.ticket && !replyIsCurrent(s, a.ticket)) return s;
      const left = leftForNote(s, a.itemId, a.fromForm);
      return left > 0 ? { ...s, closeAsk: { unfinished: left, note: a.pick } } : { ...s, closeAsk: null, closing: true };
    }

    case "addLanded": {
      if (!replyIsCurrent(s, a.ticket)) return recordLanded(s, a);
      // Every write that came back ok is recorded once. A reply naming a row
      // already written is a wine of its own, never that row again (rule 11).
      const id = a.id !== null && findItem(s, a.id) !== undefined && unaddedItem(s, a.id) === null ? null : a.id;
      let next = sheetReducer(s, { type: "itemAdded", id, added: a.added });
      if (a.byHand) next = sheetReducer(next, { type: "byHandSaved" });
      if (a.scanNext) {
        next = sheetReducer(next, { type: "setMulti", multi: true });
        return sheetReducer(next, { type: "go", view: next.canScan === false ? "desktop" : "camera" });
      }
      // D3 follows a single add on a catalog sheet. In Many, or a laptop queue,
      // the row reads "Added to the catalog" instead; a chooser's "save to the
      // catalog only" is terminal.
      const { catalogWineId } = a.added;
      if (a.added.destination === "catalog" && s.requested?.kind === "catalog" && !s.multi && catalogWineId !== null) {
        next = sheetReducer(next, { type: "followUp", catalogWineId, title: a.added.label, written: a.added.written === true });
      }
      // Amendment 22: a phone's single add closes only when nothing is left.
      return shouldCloseAfterSingleAdd(next, { warning: a.warning }) ? sheetReducer(next, { type: "requestClose" }) : next;
    }

    case "swapStarted": {
      // Amendment 20: a read keeps its turn; the edit form never has one, so
      // this only guards a stray dispatch made while one is on screen.
      if (s.items.length > 0 || s.confirmQueue.length > 0) return s;
      // BT-A0: give the edit form back exactly as `openByHand`'s own give-back
      // does (sheet-state.ts:880-901), so `swapCancelled` can reopen it through
      // `sessionToReopen` — whether or not it holds unsaved typing, since the
      // form itself (not just its typing) must come back on Cancel.
      const parkedByHand = s.byHand !== null ? [...s.parkedByHand, s.byHand] : s.parkedByHand;
      const canScan = s.canScan ?? true;
      return goTo(
        { ...s, byHand: null, parkedByHand, multi: false, swap: { wineId: a.wineId, glass: a.glass } },
        homeViewFor(canScan),
      );
    }

    case "swapCancelled": {
      if (s.swap === null) return s;
      const origin: ByHandSession["origin"] = { kind: "glass", wineId: s.swap.wineId, incomplete: false };
      const session = s.byHand;
      const kept = sessionToReopen(s, origin);
      // Rule 1 (S5b review): a dirty form opened during the swap pick (e.g. a
      // fresh "new" wine typed while searching) is given back, not dropped —
      // the same rule `openByHand`'s own give-back applies.
      const others = kept === null ? s.parkedByHand : s.parkedByHand.filter((form) => form !== kept);
      const parkedByHand = session !== null && session !== kept && session.dirty ? [...others, session] : others;
      if (kept === null) return goHome({ ...s, swap: null, byHand: null, parkedByHand });
      return goTo({ ...s, swap: null, byHand: kept, parkedByHand }, "byhand");
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

/** Amendment 22: the by-hand form under the lot step or chooser on screen,
    shown again as ← would reach it, or null when the view on screen was not
    opened by that form's save. */
function backToForm(s: SheetState): SheetState | null {
  if (s.view !== "lot" && s.view !== "choose") return null;
  for (let i = s.history.length - 1; i >= 0; i--) {
    const view = s.history[i];
    if (view === "byhand") return { ...s, view, history: s.history.slice(0, i) };
    if (!BACK_SKIPS.includes(view)) return null;
  }
  return null;
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

/** Where an adoption is made: E1's rows on a read's confirm, the chooser, D3's follow-up. */
const ADOPTION_ORIGINS: readonly SheetView[] = ["confirm", "choose", "followup"];
/** An adoption's own add runs through these, opened on top of where it was made. */
const ADOPTION_CHAIN: readonly SheetView[] = ["byhand", "lot"];

/** S5a review, round 2 (D12; spec §C.4 rules 5 and 6): whether the move from
    `prev` to `next` left a live adoption's chain without its add, so
    `reduceSheet` gives the adoption back (`adoptionLeft`). The chain is where
    the adoption was made (the top-most confirm, chooser or follow-up of
    `prev`'s view stack), with the by-hand form and lot step opened on top of
    it. It is left when:
    - the bottle in hand changes: Rescan, another bottle's confirm, a dropped
      photo's reading view;
    - the stack drops from the form or lot step back to where it was made, or
      below it: ←, going home, Discard. While the add runs on the view where it
      was made, the adoption stays;
    - any other view opens on top: Search, Search instead, a reading view;
    - the view where it was made is gone from the stack.
    Its add landing (`itemAdded`) or being refused (`addRefused`) settles the
    adoption on its own. */
function leavesAdoption(prev: SheetState, next: SheetState): boolean {
  if (prev.adopted === null || next.adopted === null) return false;
  if (addTargetId(next) !== addTargetId(prev)) return true;
  const before = [...prev.history, prev.view];
  let origin = before.length - 1;
  while (origin >= 0 && !ADOPTION_ORIGINS.includes(before[origin])) origin--;
  if (origin < 0) return true;
  const after = [...next.history, next.view];
  if (after.length <= origin || after[origin] !== before[origin]) return true;
  const above = after.slice(origin + 1);
  if (above.some((view) => !ADOPTION_CHAIN.includes(view))) return true;
  // Back down onto the view it was made on, from the form or lot step opened for it.
  return above.length === 0 && origin < before.length - 1;
}

/** Rule 7: rows that are pending, failed, or read but not added, plus every
    by-hand form with typing in it — the one on screen and those set aside
    (rule 1, S5b review). Incomplete flight glasses are already added (D7). */
export function unfinishedCount(s: SheetState): number {
  const unfinished = s.items.filter((item) => UNFINISHED.includes(item.status));
  const counted = new Set(unfinished.map((item) => item.id));
  // A typed form on a row that already counts is the same wine.
  const forms = typedForms(s).filter((form) => {
    const row = formRow(form);
    return row === null || !counted.has(row);
  });
  return unfinished.length + forms.length;
}

/** Plan amendment 22: what keeps a phone's sheet open after a single add — a
    photo still uploading or being read, and every row rule 7 would ask about. */
const KEEPS_SHEET_OPEN: readonly ItemStatus[] = [...IN_PROGRESS, ...UNFINISHED];

/** Plan amendment 22: the rows closing now would drop, by id — every row
    uploading, reading, read, pending or failed, and whatever `queue` and
    `confirmQueue` hold — besides `besides`, the bottle a note pick hands on. */
function rowsLeft(s: SheetState, besides: string | null): Set<string> {
  const ids = new Set([...s.queue, ...s.confirmQueue]);
  for (const item of s.items) if (KEEPS_SHEET_OPEN.includes(item.status)) ids.add(item.id);
  if (besides !== null) ids.delete(besides);
  return ids;
}

/** Plan amendment 22 on the note hand-off: how many wines closing for a note
    pick would drop. The rows `rowsLeft` finds besides the pick's own bottle,
    plus every dirty by-hand form for another wine, on screen or set aside
    (rule 1, S5b review): never the form whose save made the pick (`fromForm`,
    the one on screen), nor one on the pick's bottle or on a row already
    counted, which is the same wine. */
function leftForNote(s: SheetState, itemId: string | null, fromForm: boolean): number {
  const rows = rowsLeft(s, itemId);
  const forms = typedForms(s).filter((form) => {
    if (fromForm && form === s.byHand) return false;
    const row = formRow(form);
    return row === null || (row !== itemId && !rows.has(row));
  });
  return rows.size + forms.length;
}

/** What a note pick's close-ask survives (plan amendment 22): reports from the
    background — an upload, a read or a failure landing, the glass position
    moving on, a row marked in flight, the error line — that leave the screen
    as it was. */
const KEEPS_NOTE_ASK: readonly SheetAction["type"][] = ["itemUploaded", "itemRead", "itemFailed", "positionAdvanced", "rowAdded", "error"];

/** Whether the step from `prev` to `next` ended a note pick's close-ask
    without Discard: Keep going, ✕ asking rule 7's own question, ←, another
    row, a tap anywhere, or the screen moving on under it. A step that changes
    nothing, closes the sheet, or asks again for a new note pick does not. */
function endsNoteAsk(prev: SheetState, next: SheetState, a: SheetAction): boolean {
  const ask = prev.closeAsk;
  if (ask?.note === undefined || next === prev || next.closing) return false;
  if (next.closeAsk !== ask) return next.closeAsk?.note === undefined;
  const sameScreen = next.view === prev.view && next.activeItemId === prev.activeItemId && sameIds(next.history, prev.history);
  return !(sameScreen && KEEPS_NOTE_ASK.includes(a.type));
}

/** Plan amendment 23: a stale `addLanded`. The add is recorded — its bottle is
    marked added and leaves both queues, and `added` counts it once, whatever
    it names (a row already written is not marked again: the reply is a wine of
    its own, rule 11) — and what the add started from is spent, so nothing
    still on screen can write it again:
    - the lot step's lot and the chooser's wine for that same source, and the
      pick it was made under;
    - the sessions a current landing ends too (`byHandSaved`, `itemAdded`): the
      by-hand form whose save it was — the form the reply's ticket names
      (`ticket.form`, its `ByHandSession.opened`), on screen or set aside, edits
      made since included, so it can never save the wine twice (wave C3
      re-review; S5b review) — and a Fix or By hand session on the added bottle,
      set aside or not, whose edits have nowhere left to go. A form opened
      afresh meanwhile, or one set aside before the save, is another wine and
      stays.
    The view, its history, a close-ask, `closing` and D3 are never touched. */
function recordLanded(s: SheetState, a: Extract<SheetAction, { type: "addLanded" }>): SheetState {
  const named = a.id === null ? undefined : findItem(s, a.id);
  const item = named && !WRITTEN.includes(named.status) ? named : undefined;
  const base = item
    ? patchItem(s, item.id, { status: a.added.incomplete ? "incomplete" : "added", added: a.added, blob: null, error: null })
    : s;
  const session = base.byHand;
  // A ticket without `form` names the form on screen that was open before it started.
  const savedForm = (form: ByHandSession): boolean =>
    a.byHand && form.origin.kind !== "glass"
    && (a.ticket.form !== undefined ? form.opened === a.ticket.form : form === session && form.opened < a.ticket.flow);
  const ends = (form: ByHandSession): boolean => savedForm(form) || (item !== undefined && formRow(form) === item.id);
  return {
    ...base,
    queue: item ? unqueue(base.queue, item.id) : base.queue,
    confirmQueue: item ? unqueue(base.confirmQueue, item.id) : base.confirmQueue,
    added: [...base.added, a.added],
    byHand: session !== null && ends(session) ? null : session,
    parkedByHand: base.parkedByHand.some(ends) ? base.parkedByHand.filter((form) => !ends(form)) : base.parkedByHand,
    lot: base.lot !== null && base.lot.source === a.source ? null : base.lot,
    chooseFor: base.chooseFor !== null && base.chooseFor.source === a.source ? null : base.chooseFor,
    adopted: a.adopted !== null && base.adopted === a.adopted ? null : base.adopted,
  };
}

/** Plan amendment 22 (spec §C.2 "After an add"; §C.4 rule 3; amendment 20):
    whether a phone's single add closes the sheet. The adds hook asks once the
    add's own actions have run (`itemAdded`, `byHandSaved`, and D3's
    `followUp`), and calls `requestClose` only on true, which is only when
    nothing is left:
    - a phone (`canScan`) with Many off; in Many and on the laptop the sheet
      stays open;
    - on the home view: not D3's follow-up, and not the confirm that landing
      home just opened for a read waiting its turn (amendment 20);
    - `queue` and `confirmQueue` empty, and no row uploading, reading, read,
      pending or failed: a photo still being read is never dropped, and the
      drain continues (rule 3);
    - the add returned no warning ("Added — but …"): its notice stays until the
      user taps Done.
    Otherwise the sheet stays on whatever the reducer opened. A dirty by-hand
    session is left to `requestClose`, which asks first (rule 7). */
export function shouldCloseAfterSingleAdd(s: SheetState, add: { warning?: string | null } = {}): boolean {
  if (add.warning) return false;
  if (s.canScan !== true || s.multi || !isHome(s.view)) return false;
  return rowsLeft(s, null).size === 0;
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
      // "too-many" is the account's own quota, not a bad photo or a busy model:
      // Retry cannot succeed until the window moves, so it is not offered and
      // the copy says what will work instead (quota.ts).
      if (item.error === "too-many") {
        return { tone: "failed", label: SCAN_QUOTA_LABEL, detail: null, actions: ["remove"] };
      }
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
