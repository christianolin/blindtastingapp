"use client";

// The add-wine sheet's writes (spec §C.2 "After an add"; §C.4 rules 2, 5–7 and
// 11; §C.5 A3, A4b, D3 and E1). The shell (add-wine-sheet.tsx) owns the reducer,
// the read pipeline and every view. This hook owns everything that writes, or
// decides where a write goes: the add itself, "Add and scan the next", the
// chooser's adoption, D3's follow-ups, By hand's save and "Leave it for later",
// the lot step, Edit, and closing. It imports no view. With the server actions
// and sheet-state's pure dispatch helpers, it is the only add-wine code that
// branches on the destination (spec §C.2 grep gate).
//
// State. Every handler reads `stateRef.current` when it runs, never the
// render's state, so a pick that adopts a destination and then adds sees the
// adoption. Replies (plan amendment 23): every call that waits on the server
// takes a ticket when it starts (`ticketFor`), and its reply carries it. The
// reducer judges it (`replyIsCurrent`), so a reply that comes back after the
// user moved on is recorded but never navigates, closes the sheet, raises or
// ends a close-ask, or opens the note. The hook holds no still-here check of
// its own. Each dispatch made here (`send`) also runs
// `reduceSheet` on `stateRef.current` at once, so a handler reads its own
// dispatches back before React renders. The shell renders from
// `useReducer(reduceSheet, …)`, keeps the ref equal to the rendered state and
// dispatches through `send` too, so React's state takes the same step.
//
// Adoption (D12; spec §C.4 rules 5 and 6). A chooser pick, or D3's "Add it to
// my cellar", covers one add made through its own chain: the by-hand form and
// lot step opened on top of where it was made. `reduceSheet` gives the adoption
// back (`adoptionLeft`) as soon as a dispatch leaves that chain without the add
// (`leavesAdoption`): ←, going home, Search, Search instead, Rescan, a photo
// taking the screen. So the shell dispatches every action through `send`,
// never through the reducer's `dispatch`; otherwise a pick could outlive its
// wine and send the next one to its destination unasked.
//
// Ids (plan amendment 20). An add, a by-hand save, a chooser pick, a failure
// and a skip name the bottle in hand when they start: `addTargetId(state)`,
// meaning its confirm or a view opened from it, or its row's Fix chain.
//
// Focus (spec §C.4 rule 9). A handler that opens the by-hand form inside the
// tap returns the field to focus. The shell wraps the call in `flushSync` and
// focuses that field in the same handler. There is no confirm dialog and no
// nested dialog: closing with unfinished rows asks in the footer (rule 7).
//
// After an add (plan amendments 22 and 23). `addLanded` records the add and,
// while its ticket is current, lands it: a phone's single add closes the sheet
// only when `shouldCloseAfterSingleAdd` says nothing is left and no warning came
// back; otherwise the sheet stays on whatever the reducer opened, with any
// warning in `notice` until Done. A bottle whose add already landed is never
// written again: no add names it (`addTargetId`), so an add from a screen a
// stale reply left up is a wine of its own, and its confirm, chooser and Fix
// form refuse (`unaddedItem`). A stale reply spends the lot step, chooser and
// pick it started from, and ends the by-hand form whose save it was, edits
// made since included (`recordLanded`). A by-hand save refused for missing
// fields lands back on its form with the field flagged (`byHand.focusField`).
// A note pick (C1/C2, D3's "Taste & rate it now", E1's "Rate it now") closes
// the sheet the same way: `notePicked` closes only when nothing else is left,
// and otherwise holds the pick in the footer's close-ask. S5b's footer: Discard
// calls `discardAndClose()`, which hands the note on; Keep going sends
// `{ type: "cancelClose" }`, which keeps every bottle, and keeps the pick while
// its confirm, chooser or form is on screen.
import { useRef, useState, type Dispatch, type RefObject } from "react";
import { increaseCellarLotQuantity } from "@/app/cellar/new/actions";
import type { LabelPhotoRead } from "@/app/scan/actions";
import { emptyDraft, missingWineFields } from "@/lib/wine-identity/complete";
import { readDisplay } from "@/lib/wine-identity/describe";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import {
  addToCatalog,
  addToCellar,
  addToFlight,
  loadCatalogWineDraft,
  loadFlightGlassForEdit,
  saveFlightGlass,
  swapFlightGlass,
} from "./actions";
import { notePickPlan } from "./format";
import { sheetMatrix, type SheetMatrix } from "./matrix";
import {
  addTargetId,
  currentDestination,
  lotRowKey,
  reduceSheet,
  routeAdd,
  ticketFor,
  unaddedItem,
  wineRowKey,
  type ByHandSession,
  type ReplyTicket,
  type ScanItem,
  type SheetAction,
  type SheetState,
  type SheetView,
} from "./sheet-state";
import type {
  AddResult,
  AddSource,
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  NotePick,
} from "./types";

// Copy the app already uses for these failures (round 1's sheet, and the
// server's own refusals), for a server call that throws instead of refusing.
const ADD_FAILED = "Couldn't add the wine.";
const SAVE_FAILED = "Couldn't save this wine. Please try again.";
const LOAD_FAILED = "Couldn't read this wine's details. Please try again.";
const UNTITLED = "Untitled wine";

const NO_NAMES = { producer: null, appellation: null, region: null, country: null, primaryGrape: null };

/** On the way back from the lot step or the chooser, ← passes over these. */
const CHAIN_SKIPS: readonly SheetView[] = ["lot", "choose", "reading"];

/** E1's "Where does it go?" rows (`ReadConfirmProps["onChoose"]`). */
export type ChooserChoice = "flight" | "cellar" | "note" | "catalog";

/** The glass an Edit open loaded: the A4b header's number, and whether its save can go through. */
export type EditingGlass = { wineId: string; glass: number; incomplete: boolean; canEdit: boolean };

export type SheetAddsInput = {
  /** The shell keeps `current` equal to the rendered state. */
  stateRef: RefObject<SheetState>;
  /** The dispatch of the shell's `useReducer(reduceSheet, …)`, so React's state takes the step `send` takes on `stateRef`. Only `send` calls it. */
  dispatch: Dispatch<SheetAction>;
  /** The tasting a chooser's "Tonight's flight" adopts. */
  flightHint: FlightHint | null;
  /** The launcher's options: `onAdded` hears every add and glass save, and an
      `edit` open closes once its glass is saved. */
  options: AddWineOpenOptions;
  /** The profile's currency, for a new lot's price. */
  currency: string;
  /** A note pick. The provider opens `NewNoteModal` once the sheet closes. */
  onNote: (pick: NotePick) => void;
  onClose: () => void;
  /** `router.refresh`. */
  refresh: () => void;
  /** Re-runs `searchAddWine` for the current query with the current tasting id (rule 11). */
  refreshSearch: () => void;
};

export type SheetAdds = {
  /** Dispatch through `reduceSheet`, with `stateRef.current` advanced at once. A dispatch that leaves an adoption's chain gives the adoption back (D12). The shell dispatches every action through it, never through `dispatch`. */
  send: (action: SheetAction) => void;
  /** A server call is running. Every write waits for it (rule 11). */
  busy: boolean;
  /** The last add's warning, a complete sentence shown as it is ("Added — but …"). A phone's single add that returns one does not close the sheet, so it stays until Done (plan amendment 22). */
  notice: string | null;
  editing: EditingGlass | null;
  /** A row, a lot, a +1 bottle, the cellar view's add. `title` names the wine for the chooser. */
  performAdd: (source: AddSource, opts?: { title?: string }) => Promise<void>;
  /** The confirm's primary, or with `scanNext` "Add and scan the next". Returns the field to focus when a partial read opens By hand. */
  primaryFromConfirm: (item: ScanItem, opts?: { scanNext?: boolean }) => WineFieldKey | null;
  /** Fix on a row or on the confirm's chip: By hand on that bottle, or on its incomplete glass. */
  fixItem: (itemId: string) => WineFieldKey | null;
  /** The confirm's By hand. A matched read loads the catalog wine first, so nothing is focused. */
  byHandFromConfirm: (item: ScanItem) => WineFieldKey | null;
  /** A chooser row, on the confirm (E1) or the `choose` view. */
  choose: (choice: ChooserChoice) => WineFieldKey | null;
  followUpCellar: () => void;
  /** D3's "Taste & rate it now": a note pick, handed on as the sheet closes, or held in the close-ask while anything else is left (plan amendment 22). */
  followUpNote: () => void;
  followUpDone: () => void;
  /** The lot step's primary, and the merge card's "Keep as a separate lot". */
  lotAdd: () => Promise<void>;
  /** The merge card's "Add N to the existing lot". */
  lotMerge: (target: { lotId: string; quantity: number }) => Promise<void>;
  /** The merge card's "Don't add it" (amendment 18): nothing is written, and nothing is reported as added. */
  lotSkip: (lotId: string) => void;
  /** Returns the first missing field while gaps remain. */
  saveByHand: () => WineFieldKey | null;
  leaveForLater: () => void;
  /** An Edit open. Resolves with the first missing field: focus it on a mouse device, flag it on a touch device. */
  openEdit: (wineId: string) => Promise<WineFieldKey | null>;
  /** ✕ and Done: closes, or asks first while work is unfinished (rule 7). */
  requestClose: () => void;
  /** The close-ask's Discard: drops the unfinished rows and closes, handing on the note pick a `notePicked` ask holds. Keep going is `send({ type: "cancelClose" })`. */
  discardAndClose: () => void;
};

type AddedResult = Extract<AddResult, { ok: true }>;
type Refusal = Extract<AddResult, { error: string }>;

/** What an add remembers from the moment it started. */
type AddContext = {
  source: AddSource;
  /** `addTargetId` when it started, which never names a bottle already written (amendment 23). Every dispatch for this add names it. */
  itemId: string | null;
  /** Plan amendment 23: the ticket it started with. Its reply carries it, and the reducer judges it (`replyIsCurrent`): a stale reply is recorded and moves nothing. */
  ticket: ReplyTicket;
  /** The pick it was made under, spent when its reply lands stale. */
  adopted: AddWineDestination | null;
  /** The by-hand form's save, directly or through the lot step or chooser it opened. Its session ends with the add. */
  byHand: boolean;
  /** That form's draft when the save started, or null. */
  draft: WineIdentityDraft | null;
  /** "Add and scan the next". */
  scanNext: boolean;
};

type AddExtra = { title?: string; byHand?: boolean; scanNext?: boolean };

export function useSheetAdds({
  stateRef,
  dispatch,
  flightHint,
  options,
  currency,
  onNote,
  onClose,
  refresh,
  refreshSearch,
}: SheetAddsInput): SheetAdds {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingGlass | null>(null);
  const busyRef = useRef(false);
  const rowCount = useRef(0);

  function send(action: SheetAction): void {
    // One step, the same one React's reducer takes: the reducer, then the D12
    // give-back once a dispatch leaves an adoption's chain without its add, so
    // the next wine is chosen again (rule 6).
    stateRef.current = reduceSheet(stateRef.current, action);
    dispatch(action);
  }

  // --- server calls: one at a time --------------------------------------------

  function begin(): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    if (stateRef.current.error !== null) send({ type: "error", error: null });
    return true;
  }

  function end(): void {
    busyRef.current = false;
    setBusy(false);
  }

  /** Runs one server call. A throw becomes `fallback`. Null means another call was already running. */
  async function call<T>(run: () => Promise<T>, fallback: string): Promise<T | { error: string } | null> {
    if (!begin()) return null;
    try {
      return await run();
    } catch (error) {
      console.error("add-wine sheet: a server call failed", error);
      return { error: fallback };
    } finally {
      end();
    }
  }

  // --- closing (rule 7) ------------------------------------------------------

  function closeNow(): void {
    const poured = stateRef.current.added.some((a) => a.destination === "flight" || a.destination === "cellar");
    onClose();
    if (poured) refresh();
  }

  function requestClose(): void {
    send({ type: "requestClose" });
    if (stateRef.current.closing) closeNow();
  }

  function discardAndClose(): void {
    // A note pick's close-ask holds its pick: Discard hands it on as the sheet
    // closes (plan amendment 22). Read it first; the discard ends the ask.
    const note = stateRef.current.closeAsk?.note ?? null;
    send({ type: "discardAndClose" });
    if (note !== null) onNote(note);
    closeNow();
  }

  // --- the add pipeline ------------------------------------------------------

  function contextFor(s: SheetState, source: AddSource, extra: AddExtra = {}): AddContext {
    const byHand = extra.byHand === true || continuesByHand(s);
    return {
      source,
      itemId: addTargetId(s),
      ticket: ticketFor(s),
      adopted: s.adopted,
      byHand,
      draft: byHand ? (s.byHand?.draft ?? null) : null,
      scanNext: extra.scanNext === true,
    };
  }

  /** Rules 2 and 5 are the reducer's (`addRefused`): the row keeps the message,
      a by-hand save flags what is missing, and an add made under a chooser pick
      — its own add, By hand for its gaps (E1), the lot step it opened — gives
      the pick back, unless the form on screen can fix the refusal. A stale
      refusal only records its message (amendment 23). */
  function fail(ctx: AddContext, refusal: Refusal): void {
    send({ type: "addRefused", itemId: ctx.itemId, error: refusal.error, missing: refusal.missing, byHand: ctx.byHand, ticket: ctx.ticket });
  }

  /** spec §C.2 "After an add"; plan amendments 22 and 23. One `addLanded`: the
      reducer records the add and, only while its ticket is current, lands it —
      the saved by-hand session ends, then Add and scan the next, D3 on a
      catalog sheet, or a phone's single add closing when nothing is left and
      no warning came back. */
  function landed(ctx: AddContext, result: AddedResult): void {
    const wasClosing = stateRef.current.closing;
    const { added, warning } = result;
    send({
      type: "addLanded", ticket: ctx.ticket, id: ctx.itemId, added, source: ctx.source,
      byHand: ctx.byHand, draft: ctx.draft, adopted: ctx.adopted, scanNext: ctx.scanNext, warning: warning ?? null,
    });
    if (added.destination === "flight") {
      if (added.glass != null) send({ type: "positionAdvanced", position: added.glass + 1 });
      const key = rowKeyOf(ctx.source);
      if (key !== null) {
        send({ type: "rowAdded", key });
        refreshSearch();
      }
    }
    options.onAdded?.(added);
    if (warning) setNotice(warning);
    if (!wasClosing && stateRef.current.closing) closeNow();
  }

  async function execute(
    ctx: AddContext,
    run: () => Promise<AddResult>,
    then: (result: AddedResult) => void = (result) => landed(ctx, result),
  ): Promise<void> {
    const result = await call(run, ADD_FAILED);
    if (result === null) return;
    if ("error" in result) fail(ctx, result);
    else then(result);
  }

  async function runAdd(source: AddSource, extra: AddExtra = {}): Promise<void> {
    const s = stateRef.current;
    const ctx = contextFor(s, source, extra);
    switch (routeAdd(s, source).next) {
      case "choose":
        send({ type: "choose", source, itemId: ctx.itemId, title: extra.title ?? titleFor(s, source), missing: gapsOf(source) });
        return;
      case "lot":
        send({ type: "openLot", source });
        return;
      case "catalog-then-lot":
        await catalogThenLot(ctx);
        return;
      case "note":
        await pickForNote(ctx);
        return;
      case "write":
        await write(ctx, currentDestination(s));
        return;
    }
  }

  /** BT-L3 (S4c): the swap start view's add re-points the glass `swap` names
      instead of adding a new one — `swapFlightGlass`, landed the way an
      existing-glass save lands (`glassSaved`, closing the sheet like Edit's
      own save), not through the row-adding `addLanded` path. */
  async function writeSwap(ctx: AddContext, tastingId: string, wineId: string): Promise<void> {
    const result = await call(() => swapFlightGlass(tastingId, wineId, ctx.source), SAVE_FAILED);
    if (result === null) return;
    if ("error" in result) {
      fail(ctx, result);
      return;
    }
    const wasClosing = stateRef.current.closing;
    send({
      type: "glassSaved",
      added: result.added,
      ticket: ctx.ticket,
      draft: ctx.draft ?? undefined,
      closeSheet: true,
    });
    options.onAdded?.(result.added);
    if (result.warning) setNotice(result.warning);
    if (!wasClosing && stateRef.current.closing) {
      onClose();
      refresh();
    }
  }

  async function write(ctx: AddContext, destination: AddWineDestination | null): Promise<void> {
    if (destination?.kind === "flight") {
      const swap = stateRef.current.swap;
      if (swap !== null) {
        await writeSwap(ctx, destination.tastingId, swap.wineId);
        return;
      }
      await execute(ctx, () => addToFlight(destination, ctx.source));
    } else if (destination?.kind === "cellar") {
      // The lot step's add is lotAdd; a cellar write from here is +1 bottle.
      await execute(ctx, () => addToCellar(ctx.source, null));
    } else if (destination?.kind === "catalog") {
      await execute(ctx, () => addToCatalog(ctx.source));
    }
  }

  /** B1: an identity for the cellar is written to the catalog first, so the lot step's duplicate check always runs. */
  async function catalogThenLot(ctx: AddContext): Promise<void> {
    await execute(ctx, () => addToCatalog(ctx.source), (result) => {
      const { catalogWineId } = result.added;
      if (catalogWineId === null) return;
      const via = ctx.source.kind === "identity" && ctx.source.via === "scan" ? "scan" : "search";
      // Amendment 23: the reducer opens the lot step only while the ticket is current.
      send({ type: "openLot", source: { kind: "catalog", catalogWineId, via }, ticket: ctx.ticket });
    });
  }

  async function pickForNote(ctx: AddContext): Promise<void> {
    const plan = notePickPlan(ctx.source);
    switch (plan.kind) {
      case "pick":
        handOff(plan.pick, ctx);
        return;
      case "error":
        fail(ctx, { error: plan.error });
        return;
      case "by-hand-first":
        openForm(ctx.itemId !== null ? { kind: "item", itemId: ctx.itemId } : { kind: "new" }, plan.draft);
        return;
      case "catalog-first":
        await execute(ctx, () => addToCatalog(plan.source), (result) => {
          if (result.added.catalogWineId !== null) handOff({ catalogWineId: result.added.catalogWineId }, ctx);
        });
        return;
    }
  }

  /** C1/C2, D3 and E1: the note opens once the sheet has closed. Closing for it
      drops nothing unasked (plan amendment 23): with other bottles, photos or
      typing still in the sheet, `notePicked` holds the pick in the footer's
      close-ask instead (rule 7), and Discard hands it on (`discardAndClose`).
      The pick's own bottle, and the by-hand form whose save made it, never count.
      A pick that waited on a catalog write carries that write's ticket, so a
      stale one does nothing. */
  function handOff(pick: NotePick, from: Pick<AddContext, "itemId" | "byHand" | "ticket">): void {
    const wasClosing = stateRef.current.closing;
    send({ type: "notePicked", pick, itemId: from.itemId, fromForm: from.byHand, ticket: from.ticket });
    if (wasClosing || !stateRef.current.closing) return;
    onNote(pick);
    closeNow();
  }

  /** Opens By hand and returns the field to focus, or null when a stale `ticket` kept it shut. The same origin reopens its session (rule 1). */
  function openForm(origin: ByHandSession["origin"], draft: WineIdentityDraft, unidentified = false, ticket?: ReplyTicket): WineFieldKey | null {
    const before = stateRef.current;
    const session = before.byHand;
    const shown = session !== null && sameOrigin(session.origin, origin) ? session : { draft, unidentified };
    const focusField = missingWineFields(shown.draft, { unidentified: shown.unidentified })[0] ?? null;
    send({ type: "openByHand", origin, draft, focusField, unidentified, ticket });
    return stateRef.current === before ? null : focusField;
  }

  // --- handlers --------------------------------------------------------------

  async function performAdd(source: AddSource, opts: { title?: string } = {}): Promise<void> {
    if (busyRef.current) return;
    await runAdd(source, { title: opts.title });
  }

  function primaryFromConfirm(shown: ScanItem, opts: { scanNext?: boolean } = {}): WineFieldKey | null {
    const s = stateRef.current;
    // A bottle whose add already landed (a late reply, amendment 23) is never added again.
    const item = unaddedItem(s, shown.id);
    const read = item?.read ?? null;
    if (busyRef.current || item === null || read === null) return null;
    const draft = item.draft ?? read.draft;
    if (missingWineFields(draft).length > 0) {
      // A partial read: an incomplete glass where the matrix says so (a flight
      // that is not OPEN), otherwise By hand on the gap (A3, A4b).
      if (matrixOf(s).partialRead.single === "incomplete-glass") {
        void runAdd({ kind: "incomplete", draft, via: "scan" }, { scanNext: opts.scanNext });
        return null;
      }
      return openForm({ kind: "item", itemId: item.id }, draft);
    }
    void runAdd(readSource(item, read), { title: read.display.title, scanNext: opts.scanNext });
    return null;
  }

  function fixItem(itemId: string): WineFieldKey | null {
    const item = stateRef.current.items.find((row) => row.id === itemId);
    if (!item) return null;
    if (item.status === "incomplete" && item.added?.wineId) {
      return openForm({ kind: "glass", wineId: item.added.wineId, incomplete: true }, item.draft ?? item.read?.draft ?? emptyDraft());
    }
    const draft = item.draft ?? item.read?.draft ?? null;
    if ((item.status !== "read" && item.status !== "pending") || draft === null) return null;
    return openForm({ kind: "item", itemId }, draft);
  }

  function byHandFromConfirm(shown: ScanItem): WineFieldKey | null {
    const s = stateRef.current;
    const item = unaddedItem(s, shown.id);
    if (item === null) return null;
    const read = item.read;
    if (read === null) return fixItem(item.id);
    const session = s.byHand;
    if (session !== null && (session.origin.kind === "item" || session.origin.kind === "match") && session.origin.itemId === item.id) {
      return openForm(session.origin, session.draft);
    }
    const draft = item.draft ?? read.draft;
    const match = read.match;
    if (match === null || draft !== read.draft || missingWineFields(draft).length > 0) {
      return openForm({ kind: "item", itemId: item.id }, draft);
    }
    // A matched read: the catalog wine's own details, with this read's photo (A3).
    // A wine that is gone, or a load that fails, falls back to By hand on the read itself.
    // Amendment 23: the form opens once the wine loads, and only while the ticket taken now is current.
    const ticket = ticketFor(s);
    void (async () => {
      const loaded = await call(async () => ({ draft: await loadCatalogWineDraft(match.catalogWineId) }), LOAD_FAILED);
      if (loaded === null) return;
      if ("error" in loaded || loaded.draft === null) openForm({ kind: "item", itemId: item.id }, draft, false, ticket);
      else openForm({ kind: "match", itemId: item.id }, withReadPhoto(loaded.draft, read.draft), false, ticket);
    })();
    return null;
  }

  function choose(choice: ChooserChoice): WineFieldKey | null {
    if (busyRef.current) return null;
    const s = stateRef.current;
    const destination = chosenDestination(choice, flightHint);
    const source = chooserSource(s);
    if (destination === null || source === null) return null;
    send({ type: "adopt", destination });
    const draft = draftOf(source);
    if (draft !== null && gapsOf(source).length > 0) {
      // An incomplete draft opens By hand for that destination first (E1).
      const itemId = addTargetId(s);
      return openForm(itemId !== null ? { kind: "item", itemId } : { kind: "new" }, draft);
    }
    void runAdd(source);
    return null;
  }

  function followUpCellar(): void {
    const followUp = stateRef.current.followUp;
    if (busyRef.current || followUp === null) return;
    send({ type: "adopt", destination: { kind: "cellar" } });
    send({ type: "openLot", source: { kind: "catalog", catalogWineId: followUp.catalogWineId, via: "search" } });
  }

  function followUpNote(): void {
    const s = stateRef.current;
    // D3's bottle is already added, so only what else the sheet holds can make it ask.
    if (s.followUp !== null) handOff({ catalogWineId: s.followUp.catalogWineId }, { itemId: addTargetId(s), byHand: false, ticket: ticketFor(s) });
  }

  function followUpDone(): void {
    send({ type: "followUpDone" });
  }

  async function lotAdd(): Promise<void> {
    const s = stateRef.current;
    const lot = s.lot;
    if (busyRef.current || lot === null || currentDestination(s)?.kind !== "cellar") return;
    const ctx = contextFor(s, lot.source);
    await execute(ctx, () => addToCellar(lot.source, { quantity: lot.quantity, rack: lot.rack, price: lot.price, currency }));
  }

  async function lotMerge(target: { lotId: string; quantity: number }): Promise<void> {
    const s = stateRef.current;
    const lot = s.lot;
    if (busyRef.current || lot === null || lot.source.kind !== "catalog" || currentDestination(s)?.kind !== "cellar") return;
    const { catalogWineId } = lot.source;
    const ctx = contextFor(s, lot.source);
    const known = knownTitle(s, catalogWineId);
    await execute(ctx, async () => {
      await increaseCellarLotQuantity(target.lotId, target.quantity);
      const label = known ?? (await catalogLabel(catalogWineId));
      return { ok: true, added: { label, destination: "cellar", catalogWineId, lotId: target.lotId } };
    });
  }

  function lotSkip(lotId: string): void {
    const s = stateRef.current;
    if (busyRef.current || s.lot === null) return;
    const chain = continuesByHand(s);
    send({ type: "lotSkipped", itemId: addTargetId(s), lotId });
    // The form's save already wrote its wine to the catalog, so nothing is left
    // to save there. Its session ends, and the skip lands where the form was
    // opened (D17).
    if (chain && stateRef.current.view === "byhand") {
      send({ type: "byHandSaved" });
      send({ type: "back" });
    }
  }

  function saveByHand(): WineFieldKey | null {
    const s = stateRef.current;
    const session = s.byHand;
    if (busyRef.current || session === null) return null;
    const missing = missingWineFields(session.draft, { unidentified: session.unidentified });
    if (missing.length > 0) {
      send({ type: "byHandAttempted", focusField: missing[0] });
      return missing[0];
    }
    const { origin } = session;
    if (origin.kind === "glass") {
      void saveGlass(origin.wineId, false);
      return null;
    }
    // A Fix form's bottle already written saves nothing: that wine is in. (The reducer ends such a form, and the form whose save landed, when the add lands: amendment 23.)
    if (origin.kind !== "new" && unaddedItem(s, origin.itemId) === null) return null;
    const readId = origin.kind === "new" ? null : (s.items.find((row) => row.id === origin.itemId)?.read?.readId ?? null);
    const source: AddSource = session.unidentified
      ? { kind: "unidentified", draft: session.draft }
      : { kind: "identity", draft: session.draft, via: origin.kind === "new" ? "byhand" : "scan", readId };
    void runAdd(source, { byHand: true });
    return null;
  }

  function leaveForLater(): void {
    const s = stateRef.current;
    const session = s.byHand;
    if (busyRef.current || session === null) return;
    const { origin } = session;
    if (origin.kind === "glass") {
      if (origin.incomplete) void saveGlass(origin.wineId, true);
      return;
    }
    switch (matrixOf(s).partialRead.stacked) {
      case "pending-row":
        // The cellar, the catalog, no destination, an OPEN flight: nothing is written.
        send({ type: "byHandLeftForLater", rowId: `byhand-${Date.now().toString(36)}-${++rowCount.current}` });
        return;
      case "incomplete-glass":
        void runAdd({ kind: "incomplete", draft: session.draft, via: origin.kind === "new" ? "byhand" : "scan" }, { byHand: true });
        return;
      default:
        // A note is a single pick, with nothing to leave for later (A4b).
        return;
    }
  }

  async function saveGlass(wineId: string, leaveGlassForLater: boolean): Promise<void> {
    const s = stateRef.current;
    const session = s.byHand;
    if (session === null || session.origin.kind !== "glass" || session.origin.wineId !== wineId) return;
    // Amendment 23: the reply carries the ticket taken now. A stale one is recorded on its rows and moves nothing.
    const ticket = ticketFor(s);
    const result = await call(
      () => saveFlightGlass({ wineId, draft: session.draft, unidentified: session.unidentified, leaveForLater: leaveGlassForLater }),
      SAVE_FAILED,
    );
    if (result === null) return;
    if ("error" in result) {
      // The form flags the first missing field and shows the message (addRefused, with no row and no pick).
      const missing = "missing" in result ? result.missing : undefined;
      send({ type: "addRefused", itemId: null, error: result.error, missing, byHand: true, ticket });
      return;
    }
    const wasClosing = stateRef.current.closing;
    // An Edit open is for this one glass, so its save ends the sheet: the
    // reducer closes it while the ticket is current, asking first while other
    // rows are unfinished (rule 7).
    send({ type: "glassSaved", added: result.added, ticket, draft: session.draft, closeSheet: options.edit?.wineId === wineId });
    options.onAdded?.(result.added);
    if (result.warning) setNotice(result.warning);
    if (!wasClosing && stateRef.current.closing) {
      onClose();
      refresh();
    }
  }

  async function openEdit(wineId: string): Promise<WineFieldKey | null> {
    // Amendment 23: the form opens once the glass loads, and only while the ticket taken now is current.
    const ticket = ticketFor(stateRef.current);
    const loaded = await call(() => loadFlightGlassForEdit(wineId), LOAD_FAILED);
    if (loaded === null) return null;
    if ("error" in loaded) {
      send({ type: "error", error: loaded.error });
      return null;
    }
    const focus = openForm({ kind: "glass", wineId, incomplete: loaded.incomplete }, loaded.draft, loaded.unidentified, ticket);
    const session = stateRef.current.byHand;
    if (session?.origin.kind === "glass" && session.origin.wineId === wineId) {
      setEditing({ wineId, glass: loaded.glass, incomplete: loaded.incomplete, canEdit: loaded.canEdit });
    }
    return focus;
  }

  return {
    send,
    busy,
    notice,
    editing,
    performAdd,
    primaryFromConfirm,
    fixItem,
    byHandFromConfirm,
    choose,
    followUpCellar,
    followUpNote,
    followUpDone,
    lotAdd,
    lotMerge,
    lotSkip,
    saveByHand,
    leaveForLater,
    openEdit,
    requestClose,
    discardAndClose,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function matrixOf(s: SheetState): SheetMatrix {
  return sheetMatrix(currentDestination(s), s.canScan === true);
}

/** The lot step or the chooser on screen was opened by the by-hand form's save. */
function continuesByHand(s: SheetState): boolean {
  if (s.byHand === null || (s.view !== "lot" && s.view !== "choose")) return false;
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (!CHAIN_SKIPS.includes(s.history[i])) return s.history[i] === "byhand";
  }
  return false;
}

/** The row a flight add came from, which reads "in flight" at once (rule 11). */
function rowKeyOf(source: AddSource): string | null {
  if (source.kind === "lot") return lotRowKey(source.lotId);
  if (source.kind === "catalog" && source.via === "search") return wineRowKey(source.catalogWineId);
  return null;
}

function draftOf(source: AddSource): WineIdentityDraft | null {
  return source.kind === "identity" || source.kind === "incomplete" || source.kind === "unidentified" ? source.draft : null;
}

function gapsOf(source: AddSource): WineFieldKey[] {
  const draft = draftOf(source);
  return draft === null ? [] : missingWineFields(draft, { unidentified: source.kind === "unidentified" });
}

/** The chooser's title when the caller named none: the bottle's read, or the draft's own title. */
function titleFor(s: SheetState, source: AddSource): string {
  const id = addTargetId(s);
  const read = id === null ? null : (s.items.find((row) => row.id === id)?.read ?? null);
  if (read?.display.title) return read.display.title;
  const draft = draftOf(source);
  return draft === null ? "" : readDisplay(draft, NO_NAMES).title;
}

/** What a read adds: its match while the read is as it came, otherwise its identity. */
function readSource(item: ScanItem, read: LabelPhotoRead): AddSource {
  const draft = item.draft ?? read.draft;
  return read.match !== null && draft === read.draft
    ? { kind: "catalog", catalogWineId: read.match.catalogWineId, via: "scan" }
    : { kind: "identity", draft, via: "scan", readId: read.readId };
}

/** The wine a chooser row is for: the `choose` view's source, or the bottle in hand's read (E1). */
function chooserSource(s: SheetState): AddSource | null {
  if (s.view === "choose" && s.chooseFor?.source) return s.chooseFor.source;
  const id = (s.view === "choose" ? s.chooseFor?.itemId : null) ?? addTargetId(s);
  // A bottle whose add already landed is never offered again (amendment 23).
  const item = id === null ? null : unaddedItem(s, id);
  return item?.read ? readSource(item, item.read) : null;
}

/** D12: a chooser row names its destination. Tonight's flight exists only with a hint. */
function chosenDestination(choice: ChooserChoice, hint: FlightHint | null): AddWineDestination | null {
  switch (choice) {
    case "flight":
      return hint === null
        ? null
        : {
            kind: "flight",
            tastingId: hint.tastingId,
            tastingName: hint.tastingName,
            revealMode: hint.revealMode,
            wineSource: hint.wineSource,
            position: hint.position,
          };
    case "cellar":
      return { kind: "cellar" };
    case "note":
      return { kind: "note" };
    case "catalog":
      return { kind: "catalog" };
    default: {
      const unknown: never = choice;
      throw new Error(`Unknown chooser row: ${String(unknown)}`);
    }
  }
}

function withReadPhoto(draft: WineIdentityDraft, read: WineIdentityDraft): WineIdentityDraft {
  if (!read.imageUrl) return draft;
  return { ...draft, imageUrl: read.imageUrl, provenance: { ...draft.provenance, imageUrl: "label" } };
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

/** The merged lot's wine title, from what the sheet already shows for that wine. */
function knownTitle(s: SheetState, catalogWineId: string): string | null {
  if (s.followUp?.catalogWineId === catalogWineId && s.followUp.title) return s.followUp.title;
  const chosen = s.chooseFor?.source;
  if (chosen?.kind === "catalog" && chosen.catalogWineId === catalogWineId && s.chooseFor?.title) return s.chooseFor.title;
  const id = addTargetId(s);
  const read = id === null ? null : (s.items.find((row) => row.id === id)?.read ?? null);
  if (read?.match?.catalogWineId === catalogWineId && read.display.title) return read.display.title;
  return null;
}

/** A catalog wine's label, read through `addToCatalog`, which writes nothing for a catalog source. */
async function catalogLabel(catalogWineId: string): Promise<string> {
  const result = await addToCatalog({ kind: "catalog", catalogWineId, via: "search" });
  return "ok" in result ? result.added.label : UNTITLED;
}
