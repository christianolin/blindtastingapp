import { describe, expect, it, vi } from "vitest";
import type { LabelPhotoRead } from "@/app/scan/actions";
import { emptyDraft, missingWineFields } from "../../lib/wine-identity/complete";
import { notePickPlan } from "./format";
import { sheetMatrix } from "./matrix";
import {
  addTargetId, currentDestination, footerCount, initialSheetState, itemRowCopy, markAddedInFlight, reduceSheet, replyIsCurrent, routeAdd, sheetReducer, shouldCloseAfterSingleAdd, stackPartialRead, ticketFor, turnItemId, unaddedItem, unfinishedCount,
  type ReplyTicket,
  type ScanItem, type SheetAction, type SheetState,
} from "./sheet-state";
import type { AddSource, AddWineDestination, AddedWine, NotePick, SearchGroups } from "./types";

const flight: AddWineDestination = { kind: "flight", tastingId: "t1", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 4 };
const partial: LabelPhotoRead = {
  ok: true, readId: "r1",
  draft: { ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Cigliuti" }, colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "bbr", blend: [{ grape: { kind: "existing", id: "neb", name: "Nebbiolo" }, percentage: null }] },
  missing: ["vintage"], match: null, display: { title: "Cigliuti, Barbaresco", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false }, confidence: "high",
};
const run = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(sheetReducer, s);
const scanned = (destination: AddWineDestination | null, n = 1) =>
  run(initialSheetState({ destination, options: {}, canScan: true }),
    { type: "enqueue", items: Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, photoUrl: `blob:${i + 1}`, blob: new Blob() })) });

describe("sheetReducer (spec C.4)", () => {
  it("edits survive navigation (RC8)", () => {
    let s = run(scanned(flight), { type: "itemUploaded", id: "i1", imagePath: "catalog/staging/u/scan-1.jpg" }, { type: "itemRead", id: "i1", read: partial, stack: false });
    expect(s.view).toBe("confirm");
    s = run(s, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" });
    s = run(s, { type: "byHandChange", draft: { ...s.byHand!.draft, regionId: "pie2", appellationId: "bbr2", wineName: "Serraboella" } });
    s = run(s, { type: "back" });
    expect(s.view).toBe("confirm");
    s = run(s, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" });
    expect(s.view).toBe("byhand");
    expect(s.byHand!.draft).toMatchObject({ regionId: "pie2", appellationId: "bbr2", wineName: "Serraboella" });
  });
  it("a failed add keeps the item and its error", () => {
    const s = run(scanned({ kind: "cellar" }), { type: "setMulti", multi: true }, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemAddFailed", id: "i1", error: "This wine needs a vintage." });
    expect(s.items[0]).toMatchObject({ id: "i1", status: "pending", error: "This wine needs a vintage." });
  });
  it("a failed chooser add resets adopted and returns to choose (scan-4)", () => {
    let s = run(initialSheetState({ destination: null, options: {}, canScan: true }),
      { type: "choose", source: { kind: "catalog", catalogWineId: "c1", via: "scan" }, itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: flight });
    expect(currentDestination(s)).toEqual(flight);
    s = run(s, { type: "adoptFailed", error: "This tasting is finished — reopen it to add wines." });
    expect([s.adopted, s.view, s.error]).toEqual([null, "choose", "This tasting is finished — reopen it to add wines."]);
  });
  it("a failed read keeps its row while the queue drains (scan-8)", () => {
    const s = run(scanned({ kind: "catalog" }, 3), { type: "itemFailed", id: "i2" }, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemRead", id: "i3", read: partial, stack: true });
    expect(s.items.map((i) => i.status)).toEqual(["pending", "failed", "pending"]);
  });
  it("Done with unfinished rows asks first; an incomplete flight glass never counts (D7)", () => {
    let s = run(scanned({ kind: "cellar" }), { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "requestClose" });
    expect([s.closeAsk, s.closing]).toEqual([{ unfinished: 1 }, false]);
    s = run(scanned(flight), { type: "itemAdded", id: "i1", added: { label: "Cigliuti, Barbaresco", destination: "flight", catalogWineId: null, glass: 4, wineId: "w4", incomplete: { missing: ["vintage"] } } }, { type: "requestClose" });
    expect([unfinishedCount(s), s.closeAsk, s.closing]).toEqual([0, null, true]);
  });
  it("routeAdd never pours a lot without a destination (D12)", () => {
    const none = initialSheetState({ destination: null, options: {}, canScan: false });
    expect(routeAdd(none, { kind: "lot", lotId: "l1", consume: true })).toEqual({ next: "choose" });
    const cellar = initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false });
    expect(routeAdd(cellar, { kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ next: "lot" });
    expect(routeAdd(cellar, { kind: "identity", draft: partial.draft, via: "byhand", readId: null })).toEqual({ next: "catalog-then-lot" });
    expect(routeAdd(cellar, { kind: "plusOne", lotId: "l1" })).toEqual({ next: "write" });
    expect(routeAdd(initialSheetState({ destination: { kind: "note" }, options: {}, canScan: false }), { kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ next: "note" });
    expect(routeAdd(initialSheetState({ destination: flight, options: {}, canScan: false }), { kind: "lot", lotId: "l1", consume: true })).toEqual({ next: "write" });
  });
  it("resolves the first view once canScan is known (C.3)", () => {
    let s = initialSheetState({ destination: flight, options: { start: "camera" }, canScan: null });
    expect(s.view).toBe("resolving");
    s = run(s, { type: "canScanResolved", canScan: false });
    expect(s.view).toBe("desktop");
  });
  it("a laptop queue of partial cellar reads stacks as pending rows (C.4 rule 3)", () => {
    const cellarMatrix = sheetMatrix({ kind: "cellar" }, false);
    let s = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }),
      { type: "enqueue", items: [{ id: "i1", photoUrl: "blob:1", blob: new Blob() }, { id: "i2", photoUrl: "blob:2", blob: new Blob() }] });
    expect(s.multi).toBe(true);
    expect(stackPartialRead(s, partial.missing, cellarMatrix)).toBe(true);
    s = run(s, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemRead", id: "i2", read: partial, stack: true });
    expect(s.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    const single = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }), { type: "enqueue", items: [{ id: "i1", photoUrl: "blob:1", blob: new Blob() }] });
    expect(stackPartialRead(single, partial.missing, cellarMatrix)).toBe(false);
  });
  it("itemRowCopy covers every tone; footerCount counts incomplete flight glasses (A4)", () => {
    const item = (o: Partial<ScanItem>): ScanItem => ({ id: "i", photoUrl: "blob:x", blob: null, imagePath: null, status: "reading", read: null, draft: null, added: null, error: null, ...o });
    expect(itemRowCopy(item({ status: "added", added: { label: "Vietti, Barolo 2017", destination: "flight", catalogWineId: "c", glass: 3, wineId: "w" } }), flight)).toEqual({ tone: "added", label: "Vietti, Barolo 2017", detail: "glass 3", actions: [] });
    expect(itemRowCopy(item({ status: "incomplete", read: partial }), flight)).toMatchObject({ tone: "incomplete", label: "Cigliuti, Barbaresco · no vintage read", actions: ["fix"] });
    expect(itemRowCopy(item({ status: "pending", read: partial }), { kind: "cellar" })).toMatchObject({ tone: "pending", actions: ["fix", "remove"] });
    expect(itemRowCopy(item({ status: "failed" }), null)).toEqual({ tone: "failed", label: "Couldn't read this photo", detail: null, actions: ["retry", "remove"] });
    expect(itemRowCopy(item({ status: "uploading" }), null)).toMatchObject({ tone: "reading", label: "Reading the label…" });
    const s = run(scanned(flight, 2),
      { type: "itemAdded", id: "i1", added: { label: "Vietti", destination: "flight", catalogWineId: "c", glass: 4, wineId: "w4" } },
      { type: "itemAdded", id: "i2", added: { label: "Cigliuti", destination: "flight", catalogWineId: null, glass: 5, wineId: "w5", incomplete: { missing: ["vintage"] } } });
    expect(footerCount(s)).toBe(2);
  });
  it("a poured row is disabled at once; the position advances without touching requested (C.4 rule 11)", () => {
    const groups: SearchGroups = { cellar: [], tasted: [], catalog: [{ catalogWineId: "c1", title: "Vietti, Barolo 2017", subtitle: null, imageUrl: null, avgScore: null, noteCount: 0, inFlight: false, producerId: "p", wineName: "Castiglione", appellationId: "a", vintageLabel: "2017" }] };
    const s = run(initialSheetState({ destination: flight, options: {}, canScan: false }), { type: "rowAdded", key: "wine:c1" }, { type: "positionAdvanced", position: 5 });
    expect(markAddedInFlight(groups, s.addedRowKeys).catalog[0].inFlight).toBe(true);
    expect([currentDestination(s), s.requested]).toEqual([{ ...flight, position: 5 }, flight]);
  });
});

describe("sheetReducer — navigation, adoption and rows (C.4 rules 5, 7, 10, 11)", () => {
  const fromSearch: AddSource = { kind: "catalog", catalogWineId: "c1", via: "search" };

  it("back skips reading, lot and choose; an empty history goes home (rule 10)", () => {
    let s = run(scanned({ kind: "cellar" }), { type: "itemRead", id: "i1", read: partial, stack: false }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "scan" } });
    expect(s.view).toBe("lot");
    s = run(s, { type: "back" });
    expect(s.view).toBe("confirm");
    s = run(s, { type: "back" });
    expect([s.view, s.history]).toEqual(["camera", []]);
    expect(run(s, { type: "back" }).view).toBe("camera");
  });
  it("a read the user backed out of stays a row that can be fixed or removed (rule 7)", () => {
    const s = run(scanned({ kind: "catalog" }), { type: "itemRead", id: "i1", read: partial, stack: false }, { type: "back" });
    expect([s.view, unfinishedCount(s)]).toEqual(["camera", 1]);
    expect(itemRowCopy(s.items[0], { kind: "catalog" })).toMatchObject({ tone: "pending", label: "Cigliuti, Barbaresco · no vintage read", actions: ["fix", "remove"] });
  });
  it("a canScan change while open moves the camera views to the laptop view and back (C.3, D5)", () => {
    let s = run(scanned({ kind: "cellar" }), { type: "itemRead", id: "i1", read: partial, stack: false }, { type: "canScanResolved", canScan: false });
    expect([s.view, s.history]).toEqual(["confirm", ["desktop", "reading"]]);
    s = run(s, { type: "back" });
    expect(s.view).toBe("desktop");
    s = run(s, { type: "canScanResolved", canScan: true });
    expect(s.view).toBe("camera");
  });
  it("an edit open starts on the by-hand form, never the camera (C.5 A1 Edit)", () => {
    const s = run(initialSheetState({ destination: flight, options: { start: "camera", edit: { wineId: "w3" } }, canScan: null }), { type: "canScanResolved", canScan: true });
    expect(s.view).toBe("byhand");
  });
  it("an adoption covers one add: the next wine is chosen again, and the lot step keeps the last rack (D12, B1)", () => {
    let s = run(initialSheetState({ destination: null, options: {}, canScan: false }),
      { type: "choose", source: fromSearch, itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: { kind: "cellar" } },
      { type: "openLot", source: fromSearch },
      { type: "lotField", field: "rack", value: "B" },
      { type: "itemAdded", id: null, added: { label: "Vietti, Barolo 2017", destination: "cellar", catalogWineId: "c1", lotId: "l1" } });
    expect([currentDestination(s), s.view, s.lot, s.lastRack]).toEqual([null, "desktop", null, "B"]);
    expect(routeAdd(s, { kind: "catalog", catalogWineId: "c2", via: "search" })).toEqual({ next: "choose" });
    s = run(s, { type: "adopt", destination: { kind: "cellar" } }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c2", via: "search" } });
    expect(s.lot).toMatchObject({ quantity: 1, rack: "B", price: "" });
  });
  it("a note is one wine: Many never turns on (D4)", () => {
    const s = run(initialSheetState({ destination: { kind: "note" }, options: { multi: true }, canScan: true }),
      { type: "setMulti", multi: true },
      { type: "enqueue", items: [{ id: "i1", photoUrl: "blob:1", blob: new Blob() }, { id: "i2", photoUrl: "blob:2", blob: new Blob() }] });
    expect(s.multi).toBe(false);
  });
  it("a poured wine reads in flight in every group at once, as the refetch will (rule 11)", () => {
    const groups: SearchGroups = {
      cellar: [
        { lotId: "l1", catalogWineId: "c1", title: "Vietti, Barolo 2017", imageUrl: null, rack: "B", quantity: 2, drinkNow: true, inFlight: false },
        { lotId: "l2", catalogWineId: "c2", title: "Brovia, Barolo Villero 2016", imageUrl: null, rack: null, quantity: 1, drinkNow: false, inFlight: false },
      ],
      catalog: [{ catalogWineId: "c1", title: "Vietti, Barolo 2017", subtitle: null, imageUrl: null, avgScore: null, noteCount: 0, inFlight: false, producerId: "p", wineName: null, appellationId: "a", vintageLabel: "2017" }],
      tasted: [{ catalogWineId: "c1", title: "Vietti, Barolo 2017", imageUrl: null, myScore: 92, tastedOn: "2026-05-02", producerId: "p", wineName: null, appellationId: "a", vintageLabel: "2017", inFlight: false }],
    };
    const marked = markAddedInFlight(groups, ["lot:l1"]);
    expect([marked.cellar.map((r) => r.inFlight), marked.catalog[0].inFlight, marked.tasted[0].inFlight]).toEqual([[true, false], true, true]);
    expect(markAddedInFlight(groups, [])).toBe(groups);
  });
});

describe("Don't add it on the already-in-your-cellar card (amendment 18, D17)", () => {
  const matched: AddSource = { kind: "catalog", catalogWineId: "c1", via: "scan" };

  it("a single scan writes nothing and returns to the camera with the line", () => {
    let s = run(scanned({ kind: "cellar" }), { type: "itemRead", id: "i1", read: partial, stack: false }, { type: "openLot", source: matched });
    expect(s.view).toBe("lot");
    s = run(s, { type: "lotSkipped", itemId: "i1", lotId: "l9" });
    expect([s.view, s.history, s.lot, s.items, s.added, s.skippedLot, unfinishedCount(s)]).toEqual(["camera", [], null, [], [], { lotId: "l9" }, 0]);
  });
  it("a laptop search add returns to the desktop search", () => {
    const s = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }),
      { type: "desktopQuery", query: "vietti" },
      { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "search" } },
      { type: "lotSkipped", itemId: null, lotId: "l9" });
    expect([s.view, s.desktop.query, s.skippedLot, s.added, s.addedRowKeys]).toEqual(["desktop", "vietti", { lotId: "l9" }, [], []]);
  });
  it("in a multi stack only that bottle leaves; the next photo clears the line", () => {
    let s = run(scanned({ kind: "cellar" }, 2),
      { type: "itemRead", id: "i1", read: partial, stack: false },
      { type: "itemRead", id: "i2", read: partial, stack: true },
      { type: "openLot", source: matched },
      { type: "lotSkipped", itemId: "i1", lotId: "l9" });
    expect([s.items.map((i) => [i.id, i.status]), s.view, s.multi]).toEqual([[["i2", "pending"]], "camera", true]);
    s = run(s, { type: "enqueue", items: [{ id: "i3", photoUrl: "blob:3", blob: new Blob() }] });
    expect(s.skippedLot).toBeNull();
  });
});

describe("a read waits its turn for the confirm view (C.4 rule 3, C.5 A3)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r2", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true } },
    display: { title: "Vietti, Barolo 2017", meta: "Barolo DOCG · Piedmont · Italy · Nebbiolo", newProducer: false },
  };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  const glass = (id: string, n: number): SheetAction => ({ type: "itemAdded", id, added: { label: "Vietti, Barolo 2017", destination: "flight", catalogWineId: "c1", glass: n, wineId: `w${n}` } satisfies AddedWine });
  const many = () => initialSheetState({ destination: flight, options: { multi: true }, canScan: true });

  const single = () => initialSheetState({ destination: flight, options: {}, canScan: true });

  // Amendment 20 changed this pinned test: "in Many, reads stack". A read that
  // lands behind another bottle's confirm is a row in the multi stack; it no
  // longer waits in confirmQueue, so adding b1 returns to the camera.
  it("phone Many: a second read never replaces the confirm on screen; it stays a row in the stack", () => {
    let s = run(many(), photo("b1"), photo("b2"), read("b1"));
    expect([s.view, s.activeItemId]).toEqual(["confirm", "b1"]);
    s = run(s, read("b2"));
    expect([s.view, s.activeItemId, s.items.map((i) => i.status), s.confirmQueue]).toEqual(["confirm", "b1", ["read", "read"], []]);
    s = run(s, glass("b1", 4));
    expect([s.view, s.activeItemId, s.history]).toEqual(["camera", null, []]);
    s = run(s, glass("b2", 5));
    expect([s.view, s.activeItemId, unfinishedCount(s)]).toEqual(["camera", null, 0]);
  });
  it("laptop: a second drop waits behind the first; Rescan (remove) moves on to the next queued photo", () => {
    let s = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }), photo("p1"), photo("p2"));
    expect([s.multi, s.view, s.activeItemId, s.queue]).toEqual([false, "reading", "p1", ["p1", "p2"]]);
    s = run(s, read("p1"));
    expect([s.view, s.activeItemId]).toEqual(["confirm", "p1"]);
    s = run(s, read("p2"));
    expect([s.view, s.activeItemId]).toEqual(["confirm", "p1"]);
    s = run(s, { type: "itemRemove", id: "p1" });
    expect([s.view, s.activeItemId, s.items.map((i) => i.id)]).toEqual(["confirm", "p2", ["p2"]]);
    expect(run(s, { type: "back" }).view).toBe("desktop");
  });
  // Amendment 20 changed the next two pinned tests' setup from Many to a single
  // scan: the Waiting rule applies with Many off, and in Many reads stack.
  it("each read is offered once: ← moves on to the waiting read, never back to one already left", () => {
    let s = run(single(), photo("b1"), photo("b2"), read("b1"), read("b2"), { type: "back" });
    expect([s.view, s.activeItemId]).toEqual(["confirm", "b2"]);
    s = run(s, { type: "back" });
    expect([s.view, unfinishedCount(s)]).toEqual(["camera", 2]);
    s = run(s, photo("b3"), read("b3"), glass("b3", 4));
    expect([s.view, s.activeItemId]).toEqual(["camera", null]);
  });
  it("a read that lands on another view waits for the home view; a late add for another bottle keeps the screen", () => {
    let s = run(single(), photo("b1"), photo("b2"), { type: "go", view: "search" }, read("b1"));
    expect([s.view, s.confirmQueue]).toEqual(["search", ["b1"]]);
    s = run(s, { type: "back" });
    expect([s.view, s.activeItemId]).toEqual(["confirm", "b1"]);
    // b1's add is still on its way when ← has already opened b2's confirm.
    s = run(s, read("b2"), { type: "back" });
    expect([s.view, s.activeItemId]).toEqual(["confirm", "b2"]);
    s = run(s, glass("b1", 4));
    expect([s.view, s.activeItemId, s.items.map((i) => i.status)]).toEqual(["confirm", "b2", ["added", "read"]]);
  });
  it("a single scan's failure off screen waits too, then replaces the confirm body (rule 4)", () => {
    let s = run(scanned({ kind: "catalog" }), { type: "back" }, { type: "go", view: "search" }, { type: "itemFailed", id: "i1" });
    expect(s.view).toBe("search");
    s = run(s, { type: "back" });
    expect([s.view, s.activeItemId, s.items[0].status]).toEqual(["confirm", "i1", "failed"]);
  });
});

describe("a read keeps its turn (amendment 20: reviewer probes P1–P5 and the D3 paths)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r3", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2018, tawnyYears: null, read: true } },
    display: { title: "Cigliuti, Barbaresco 2018", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false },
  };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  const toCatalog = (id: string | null, written = true): SheetAction => ({ type: "itemAdded", id, added: { label: "Cigliuti, Barbaresco 2018", destination: "catalog", catalogWineId: "c9", written } });
  const toFlight = (id: string | null, glass: number): SheetAction => ({ type: "itemAdded", id, added: { label: "Cigliuti, Barbaresco 2018", destination: "flight", catalogWineId: "c9", glass, wineId: `w${glass}` } });
  const toCellar = (id: string | null): SheetAction => ({ type: "itemAdded", id, added: { label: "Cigliuti, Barbaresco 2018", destination: "cellar", catalogWineId: "c9", lotId: "l1" } });
  const followUp: SheetAction = { type: "followUp", catalogWineId: "c9", title: "Cigliuti, Barbaresco 2018", written: true };
  const open = (destination: AddWineDestination | null, canScan: boolean) => initialSheetState({ destination, options: {}, canScan });
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, waiting: s.confirmQueue });
  /** p1 finishes reading behind p2's reading view, so p1 waits; p2 is then read and on screen. */
  const p1WaitsBehindP2 = (destination: AddWineDestination | null, canScan: boolean) =>
    run(open(destination, canScan), photo("p1"), { type: "back" }, photo("p2"), read("p1"), read("p2"));

  it("P2: a catalog add opens the waiting read; D3 covers it, and Done — add another wine reopens it", () => {
    let s = p1WaitsBehindP2({ kind: "catalog" }, true);
    expect(screen(s)).toEqual({ view: "confirm", active: "p2", waiting: ["p1"] });
    s = run(s, toCatalog("p2"));
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
    s = run(s, followUp);
    expect([s.view, s.confirmQueue]).toEqual(["followup", ["p1"]]);
    s = run(s, { type: "followUpDone" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
  });
  it("P2b: a laptop by-hand catalog add, then D3 and Done, reopens the read that waited behind the form", () => {
    let s = run(open({ kind: "catalog" }, false), photo("p1"), { type: "back" },
      { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: "producer" }, read("p1"));
    expect(screen(s)).toEqual({ view: "byhand", active: null, waiting: ["p1"] });
    s = run(s, toCatalog(null), { type: "byHandSaved" }, followUp, { type: "followUpDone" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
  });
  it("D3's Add it to my cellar: the lot add lands home and reopens the covered read", () => {
    const s = run(p1WaitsBehindP2({ kind: "catalog" }, true), toCatalog("p2"), followUp,
      { type: "adopt", destination: { kind: "cellar" } },
      { type: "openLot", source: { kind: "catalog", catalogWineId: "c9", via: "search" } },
      toCellar(null));
    expect([screen(s), s.followUp, s.items.map((i) => [i.id, i.status])]).toEqual([{ view: "confirm", active: "p1", waiting: [] }, null, [["p1", "read"], ["p2", "added"]]]);
  });
  it("← from D3 returns to the covered confirm; ← from that confirm leaves it as a row, never offered again", () => {
    let s = run(p1WaitsBehindP2({ kind: "catalog" }, true), toCatalog("p2"), followUp, { type: "back" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
    s = run(s, { type: "back" });
    expect([s.view, s.confirmQueue, unfinishedCount(s)]).toEqual(["camera", [], 1]);
    s = run(s, photo("p3"), read("p3"), toCatalog("p3"), followUp, { type: "followUpDone" });
    expect(screen(s)).toEqual({ view: "camera", active: null, waiting: [] });
  });
  it("itemAdded resets followUp, so a follow-up never outlives its add", () => {
    expect(run(open({ kind: "catalog" }, false), followUp, toCatalog(null)).followUp).toBeNull();
  });
  it("P1: Add and scan the next (setMulti(true) plus go(home)) reopens the read the add just opened", () => {
    let s = run(open(flight, true), photo("b1"), photo("b2"), read("b1"), read("b2"));
    expect(screen(s)).toEqual({ view: "confirm", active: "b1", waiting: ["b2"] });
    s = run(s, toFlight("b1", 4), { type: "positionAdvanced", position: 5 }, { type: "setMulti", multi: true }, { type: "go", view: "camera" });
    expect([screen(s), s.multi]).toEqual([{ view: "confirm", active: "b2", waiting: [] }, true]);
  });
  it("Many: setMulti(true) moves every waiting read into the stack and clears confirmQueue", () => {
    let s = run(open(flight, true), photo("b1"), photo("b2"), read("b1"), read("b2"), { type: "setMulti", multi: true });
    expect([screen(s), s.items.map((i) => i.status)]).toEqual([{ view: "confirm", active: "b1", waiting: [] }, ["read", "read"]]);
    s = run(s, toFlight("b1", 4));
    expect([screen(s), itemRowCopy(s.items[1], flight).actions]).toEqual([{ view: "camera", active: null, waiting: [] }, ["fix", "remove"]]);
  });
  it("P3: a single scan's failure behind another bottle waits, then opens as the failed confirm body", () => {
    let s = run(open({ kind: "cellar" }, true), photo("p1"), { type: "back" }, photo("p2"), { type: "itemFailed", id: "p1" });
    expect(screen(s)).toEqual({ view: "reading", active: "p2", waiting: ["p1"] });
    s = run(s, read("p2"));
    expect(screen(s)).toEqual({ view: "confirm", active: "p2", waiting: ["p1"] });
    s = run(s, toCellar("p2"));
    expect([screen(s), s.items[0].status]).toEqual([{ view: "confirm", active: "p1", waiting: [] }, "failed"]);
  });
  it("P3 on Rescan: removing the bottle on screen opens the failure that waited", () => {
    const s = run(open({ kind: "cellar" }, true), photo("p1"), { type: "back" }, photo("p2"), { type: "itemFailed", id: "p1" }, read("p2"), { type: "itemRemove", id: "p2" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
  });
  it("P4: Don't add it from the phone search returns to the search view (D17)", () => {
    const s = run(open({ kind: "cellar" }, true), { type: "go", view: "search" }, { type: "searchQuery", query: "vietti" },
      { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "search" } }, { type: "lotSkipped", itemId: null, lotId: "l9" });
    expect([s.view, s.history, s.search.query, s.skippedLot]).toEqual(["search", ["camera"], "vietti", { lotId: "l9" }]);
  });
  it("Don't add it on a scanned bottle skips that bottle's confirm, and a waiting read opens on landing home", () => {
    const s = run(p1WaitsBehindP2({ kind: "cellar" }, true), { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "scan" } }, { type: "lotSkipped", itemId: "p2", lotId: "l9" });
    expect([screen(s), s.items.map((i) => i.id), s.skippedLot]).toEqual([{ view: "confirm", active: "p1", waiting: [] }, ["p1"], { lotId: "l9" }]);
  });
  it("by hand, the lot step or the chooser opened from a confirm keeps the turn; a read landing meanwhile waits behind it", () => {
    let s = run(open({ kind: "cellar" }, true), photo("p1"), photo("p2"), read("p1"),
      { type: "openByHand", origin: { kind: "item", itemId: "p1" }, draft: complete.draft, focusField: null }, read("p2"));
    expect(screen(s)).toEqual({ view: "byhand", active: "p1", waiting: ["p2"] });
    s = run(s, { type: "back" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: ["p2"] });
    s = run(s, { type: "choose", source: null, itemId: "p1", title: "Cigliuti", missing: [] }, { type: "setMulti", multi: true }, { type: "back" });
    expect(screen(s)).toEqual({ view: "confirm", active: "p1", waiting: [] });
  });
  it("P5: an itemAdded with a null id while a read's confirm is on screen warns and does not navigate", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const s = run(open(flight, true), photo("q1"), read("q1"), toFlight(null, 4));
      expect([screen(s), s.items[0].status, s.added.length]).toEqual([{ view: "confirm", active: "q1", waiting: [] }, "read", 1]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
  it("a second itemAdded for a bottle already written changes nothing (never added twice)", () => {
    const s = run(open(flight, true), photo("q1"), read("q1"), toFlight("q1", 4));
    expect(run(s, toFlight("q1", 5))).toBe(s);
  });
  it("itemRowCopy's added detail follows the row's own destination, never the sheet's", () => {
    const row = (added: AddedWine): ScanItem => ({ id: "i", photoUrl: "blob:x", blob: null, imagePath: null, status: "added", read: null, draft: null, added, error: null });
    expect(itemRowCopy(row({ label: "Vietti", destination: "flight", catalogWineId: "c", glass: 3, wineId: "w" }), { kind: "cellar" }).detail).toBe("glass 3");
    expect(itemRowCopy(row({ label: "Vietti", destination: "catalog", catalogWineId: "c", written: false }), flight).detail).toBe("Already in the catalog");
    expect(itemRowCopy(row({ label: "Vietti", destination: "cellar", catalogWineId: "c", lotId: "l" }), { kind: "catalog" }).detail).toBeNull();
  });
});

describe("Wrong bottle? Search keeps the bottle's turn, and an add from there names it (F12 re-review, round 3)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r4", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true } },
    display: { title: "Cigliuti, Barbaresco 2017", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false },
  };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  /** The confirm's Search: the phone search view, or on a device that cannot scan the laptop view. */
  const search = (query: string): SheetAction[] => [{ type: "go", view: "search" }, { type: "searchQuery", query }];
  const laptopSearch = (query: string): SheetAction[] => [{ type: "go", view: "desktop" }, { type: "desktopQuery", query }];
  const found = (destination: AddedWine["destination"]): AddedWine => ({
    label: "Cigliuti, Barbaresco Serraboella 2017", destination, catalogWineId: "c7",
    ...(destination === "flight" ? { glass: 4, wineId: "w4" } : destination === "cellar" ? { lotId: "l7" } : { written: false }),
  });
  /** S5a's side of the contract: an add names the bottle holding the turn when it starts. */
  const addFound = (s: SheetState, destination: AddedWine["destination"]) =>
    sheetReducer(s, { type: "itemAdded", id: turnItemId(s), added: found(destination) });
  const fromSearch: AddSource = { kind: "catalog", catalogWineId: "c7", via: "search" };
  const followUp: SheetAction = { type: "followUp", catalogWineId: "c7", title: "Cigliuti, Barbaresco Serraboella 2017", written: false };
  const open = (destination: AddWineDestination | null, canScan: boolean, multi = false) => initialSheetState({ destination, options: { multi }, canScan });
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, turn: turnItemId(s), waiting: s.confirmQueue });
  const noTurn = (view: SheetState["view"]) => ({ view, active: null, turn: null, waiting: [] });
  const turnOf = (view: SheetState["view"], id: string, waiting: string[] = []) => ({ view, active: id, turn: id, waiting });
  const rows = (s: SheetState) => s.items.map((i) => [i.id, i.status]);

  it("phone flight: the wine found becomes this bottle's glass, and closing has nothing left to ask about", () => {
    let s = run(open(flight, true), photo("p1"), read("p1"), ...search("Cigliuti Barbaresco"));
    expect([screen(s), s.search.query]).toEqual([turnOf("search", "p1"), "Cigliuti Barbaresco"]);
    s = addFound(s, "flight");
    expect([screen(s), rows(s), unfinishedCount(s)]).toEqual([noTurn("camera"), [["p1", "added"]], 0]);
    expect(itemRowCopy(s.items[0], flight)).toMatchObject({ tone: "added", label: "Cigliuti, Barbaresco Serraboella 2017", detail: "glass 4" });
    expect(run(s, { type: "requestClose" })).toMatchObject({ closeAsk: null, closing: true });
  });
  it("← from the search returns to the bottle's confirm, and the Scan pill (go home) reopens it (amendment 20)", () => {
    const s = run(open(flight, true), photo("p1"), read("p1"), ...search("Cigliuti"));
    expect([screen(run(s, { type: "back" })), screen(run(s, { type: "go", view: "camera" }))]).toEqual([turnOf("confirm", "p1"), turnOf("confirm", "p1")]);
  });
  it("catalog: the add names the bottle and D3 follows; Done lands home, or on the read that waited behind it", () => {
    let s = run(open({ kind: "catalog" }, true), photo("p1"), read("p1"), ...search("Cigliuti"));
    s = run(addFound(s, "catalog"), followUp);
    expect([screen(s), rows(s), unfinishedCount(s)]).toEqual([noTurn("followup"), [["p1", "added"]], 0]);
    expect(screen(run(s, { type: "followUpDone" }))).toEqual(noTurn("camera"));

    let t = run(open({ kind: "catalog" }, true), photo("p1"), { type: "back" }, photo("p2"), read("p1"), read("p2"), ...search("Cigliuti"));
    expect(screen(t)).toEqual(turnOf("search", "p2", ["p1"]));
    t = run(addFound(t, "catalog"), followUp, { type: "followUpDone" });
    expect([screen(t), rows(t)]).toEqual([turnOf("confirm", "p1"), [["p1", "read"], ["p2", "added"]]]);
  });
  it("cellar: the lot step's add names the bottle; Don't add it there drops the bottle and returns to the search (D17)", () => {
    const atLot = run(open({ kind: "cellar" }, true), photo("p1"), read("p1"), ...search("Cigliuti"),
      { type: "openLot", source: fromSearch }, { type: "lotField", field: "rack", value: "C" });
    expect(screen(atLot)).toEqual(turnOf("lot", "p1"));
    const s = addFound(atLot, "cellar");
    expect([screen(s), rows(s), s.lot, s.lastRack, unfinishedCount(s)]).toEqual([noTurn("camera"), [["p1", "added"]], null, "C", 0]);
    const skipped = run(atLot, { type: "lotSkipped", itemId: turnItemId(atLot), lotId: "l7" });
    expect([screen(skipped), skipped.history, skipped.items, skipped.skippedLot]).toEqual([noTurn("search"), ["camera"], [], { lotId: "l7" }]);
  });
  it("Many: the add names the bottle, and its row in the stack reads glass 4", () => {
    let s = run(open(flight, true, true), photo("p1"), read("p1"));
    expect(screen(s)).toEqual(turnOf("confirm", "p1"));
    s = addFound(run(s, ...search("Cigliuti")), "flight");
    expect([screen(s), rows(s), s.multi, itemRowCopy(s.items[0], flight).detail]).toEqual([noTurn("camera"), [["p1", "added"]], true, "glass 4"]);
  });
  it("by hand's Search instead: the add names the bottle and ends its by-hand session, so the close-ask counts nothing", () => {
    let s = run(open(flight, true), photo("p1"), read("p1"), { type: "openByHand", origin: { kind: "item", itemId: "p1" }, draft: complete.draft, focusField: null });
    s = run(s, { type: "byHandChange", draft: { ...s.byHand!.draft, wineName: "Serraboella" } }, ...search("Cigliuti Serraboella"));
    expect([screen(s), unfinishedCount(s), run(s, { type: "back" }).view]).toEqual([turnOf("search", "p1"), 1, "byhand"]);
    s = addFound(s, "flight");
    expect([screen(s), rows(s), s.byHand, unfinishedCount(s)]).toEqual([noTurn("camera"), [["p1", "added"]], null, 0]);
  });
  it("laptop: the confirm's Search shows the laptop view with the query and keeps the turn, also with another read waiting", () => {
    const one = run(open({ kind: "cellar" }, false), photo("p1"), read("p1"), ...laptopSearch("cigliuti"));
    expect([screen(one), one.desktop.query]).toEqual([turnOf("desktop", "p1"), "cigliuti"]);

    let s = run(open({ kind: "cellar" }, false), photo("p1"), photo("p2"), read("p1"), read("p2"), ...laptopSearch("cigliuti serraboella"));
    expect([screen(s), s.desktop.query]).toEqual([turnOf("desktop", "p1", ["p2"]), "cigliuti serraboella"]);
    // A photo dropped meanwhile only queues, and ← returns to the confirm.
    s = run(s, photo("p3"));
    expect([screen(s), s.queue, screen(run(s, { type: "back" }))]).toEqual([turnOf("desktop", "p1", ["p2"]), ["p3"], turnOf("confirm", "p1", ["p2"])]);
    // "Add to cellar" on a row opens the lot step; its add names p1, and p2's confirm opens next.
    s = addFound(run(s, { type: "openLot", source: fromSearch }), "cellar");
    expect([screen(s), rows(s), s.desktop.query]).toEqual([turnOf("confirm", "p2"), [["p1", "added"], ["p2", "read"], ["p3", "uploading"]], "cigliuti serraboella"]);
  });
  it("laptop: Fix on another bottle's row ends that search; its bottle waits again and reopens once the fix is saved or left", () => {
    let s = run(open({ kind: "cellar" }, false), photo("p1"), read("p1"), { type: "back" }, photo("p2"), read("p2"), ...laptopSearch("cigliuti"));
    expect([screen(s), rows(s)]).toEqual([turnOf("desktop", "p2"), [["p1", "read"], ["p2", "read"]]]);
    s = run(s, { type: "openByHand", origin: { kind: "item", itemId: "p1" }, draft: complete.draft, focusField: null });
    expect([screen(s), screen(run(s, { type: "back" }))]).toEqual([{ view: "byhand", active: "p1", turn: null, waiting: ["p2"] }, turnOf("confirm", "p2")]);
    s = run(s, { type: "itemAdded", id: "p1", added: found("cellar") }, { type: "byHandSaved" });
    expect([screen(s), rows(s)]).toEqual([turnOf("confirm", "p2"), [["p1", "added"], ["p2", "read"]]]);
  });
  it("a null-id add while the bottle's search holds the turn (a late reply) warns once, is recorded, and leaves the search as it was", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const s = run(open(flight, true), photo("p1"), read("p1"), ...search("Cigliuti"), { type: "itemAdded", id: null, added: found("flight") });
      expect([screen(s), rows(s), s.added.length, s.search.query]).toEqual([turnOf("search", "p1"), [["p1", "read"]], 1, "Cigliuti"]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(screen(run(s, { type: "back" }))).toEqual(turnOf("confirm", "p1"));
    } finally {
      warn.mockRestore();
    }
  });
});

describe("an add names the bottle in hand: addTargetId (F12 re-review, round 4)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r5", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2016, tawnyYears: null, read: true } },
    display: { title: "Cigliuti, Barbaresco 2016", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false },
  };
  const photos = (...ids: string[]): SheetAction => ({ type: "enqueue", items: ids.map((id) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() })) });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  /** A partial read in Many or a laptop queue: a pending row with Fix. */
  const stacked = (id: string): SheetAction => ({ type: "itemRead", id, read: partial, stack: true });
  /** "Nothing matches? · Add it by hand" (A5), the laptop tile (A8), "Neither of these" (D1): no bottle in the origin. */
  const byHandNew: SheetAction = { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: "producer" };
  const fix = (id: string): SheetAction => ({ type: "openByHand", origin: { kind: "item", itemId: id }, draft: partial.draft, focusField: "vintage" });
  const typed: SheetAction = { type: "byHandChange", draft: { ...complete.draft, wineName: "Serraboella" } };
  const saved: SheetAction = { type: "byHandSaved" };
  /** catalog-then-lot: the save wrote the catalog wine, and the lot step opens on it. */
  const lotStep: SheetAction = { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "search" } };
  const wine = (destination: AddedWine["destination"]): AddedWine => ({
    label: "Cigliuti, Barbaresco Serraboella 2016", destination, catalogWineId: "c5",
    ...(destination === "flight" ? { glass: 4, wineId: "w4" } : destination === "cellar" ? { lotId: "l5" } : { written: true }),
  });
  /** S5a's side of the contract: every add, by-hand save, chooser pick and skip names addTargetId(state) when it starts. */
  const addNamed = (s: SheetState, destination: AddedWine["destination"]) => sheetReducer(s, { type: "itemAdded", id: addTargetId(s), added: wine(destination) });
  const skipNamed = (s: SheetState) => sheetReducer(s, { type: "lotSkipped", itemId: addTargetId(s), lotId: "l1" });
  const open = (destination: AddWineDestination | null, canScan: boolean, multi = false) => initialSheetState({ destination, options: { multi }, canScan });
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, target: addTargetId(s), turn: turnItemId(s), waiting: s.confirmQueue });
  const home = (view: SheetState["view"]) => ({ view, active: null, target: null, turn: null, waiting: [] });
  const rows = (s: SheetState) => s.items.map((i) => [i.id, i.status]);

  // Issue 1: a by-hand save inside a turn names the bottle, whatever the session's origin.
  it("phone flight: Wrong bottle? Search → Add it by hand → the save names the bottle and lands home with it added", () => {
    const form = run(open(flight, true), photos("p1"), read("p1"), { type: "go", view: "search" }, { type: "searchQuery", query: "Cigliuti" }, byHandNew, typed);
    expect(screen(form)).toEqual({ view: "byhand", active: "p1", target: "p1", turn: "p1", waiting: [] });
    // byHandSaved may arrive before or after the add it started.
    for (const s of [run(addNamed(form, "flight"), saved), addNamed(run(form, saved), "flight")]) {
      expect([screen(s), rows(s), s.byHand, unfinishedCount(s)]).toEqual([home("camera"), [["p1", "added"]], null, 0]);
      expect(run(s, { type: "requestClose" })).toMatchObject({ closeAsk: null, closing: true });
    }
  });
  it("laptop catalog: the confirm's Search → Neither of these → the save names the bottle; D3's Done lands home without reopening it", () => {
    let s = run(open({ kind: "catalog" }, false), photos("p1"), read("p1"), { type: "go", view: "desktop" }, { type: "desktopQuery", query: "cigliuti" }, byHandNew, typed);
    expect(screen(s)).toEqual({ view: "byhand", active: "p1", target: "p1", turn: "p1", waiting: [] });
    s = run(addNamed(s, "catalog"), saved, { type: "followUp", catalogWineId: "c5", title: "Cigliuti, Barbaresco Serraboella 2016", written: true });
    expect([screen(s), rows(s)]).toEqual([home("followup"), [["p1", "added"]]]);
    s = run(s, { type: "followUpDone" });
    expect([screen(s), rows(s), unfinishedCount(s)]).toEqual([home("desktop"), [["p1", "added"]], 0]);
  });
  it("by hand from the confirm → Search instead → Add it by hand: the new session's save still names the bottle", () => {
    let s = run(open(flight, true), photos("p1"), read("p1"), fix("p1"), typed, { type: "go", view: "search" }, byHandNew, typed);
    expect(screen(s)).toEqual({ view: "byhand", active: "p1", target: "p1", turn: "p1", waiting: [] });
    s = run(addNamed(s, "flight"), saved);
    expect([screen(s), rows(s), s.byHand, unfinishedCount(s)]).toEqual([home("camera"), [["p1", "added"]], null, 0]);
  });

  // Issue 2: a row's Fix carries its bottle through the save's lot step and chooser.
  it("phone Many cellar: a stacked row's Fix → save → the lot step's add names the row, so only the other row is unfinished", () => {
    const base = run(open({ kind: "cellar" }, true), photos("p1", "p2"), stacked("p1"), stacked("p2"), fix("p1"), typed);
    expect(screen(base)).toEqual({ view: "byhand", active: "p1", target: "p1", turn: null, waiting: [] });
    // byHandSaved may arrive before or after the lot step opens.
    for (const order of [run(base, saved, lotStep), run(base, lotStep, saved)]) {
      const atLot = run(order, { type: "lotField", field: "rack", value: "C" });
      expect([screen(atLot), atLot.byHand]).toEqual([{ view: "lot", active: "p1", target: "p1", turn: null, waiting: [] }, null]);
      const s = addNamed(atLot, "cellar");
      expect([screen(s), rows(s), s.lot, s.lastRack, unfinishedCount(s)]).toEqual([home("camera"), [["p1", "added"], ["p2", "pending"]], null, "C", 1]);
    }
  });
  it("Don't add it on that lot step drops the row and returns to the stack, never to the dropped row's form (amendment 18)", () => {
    const base = run(open({ kind: "cellar" }, true), photos("p1", "p2"), stacked("p1"), stacked("p2"), fix("p1"), typed);
    // The second order: the save's byHandSaved has not arrived, so the session is still open.
    for (const atLot of [run(base, saved, lotStep), run(base, lotStep)]) {
      const s = skipNamed(atLot);
      expect([screen(s), s.history, rows(s), s.byHand, s.skippedLot, unfinishedCount(s)]).toEqual([home("camera"), [], [["p2", "pending"]], null, { lotId: "l1" }, 1]);
    }
  });
  it("Don't add it after a by-hand save from a confirm returns to the camera, not the by-hand form (D17)", () => {
    const s = skipNamed(run(open({ kind: "cellar" }, true), photos("p1"), read("p1"), fix("p1"), typed, saved, lotStep));
    expect([screen(s), s.history, s.items, s.byHand]).toEqual([home("camera"), [], [], null]);
  });
  it("laptop, two dropped photos: Fix on the first row → save → the lot add names that row", () => {
    const atLot = run(open({ kind: "cellar" }, false), photos("p1", "p2"), stacked("p1"), stacked("p2"), fix("p1"), typed, saved, lotStep);
    expect(screen(atLot)).toEqual({ view: "lot", active: "p1", target: "p1", turn: null, waiting: [] });
    const s = addNamed(atLot, "cellar");
    expect([screen(s), rows(s), unfinishedCount(s)]).toEqual([home("desktop"), [["p1", "added"], ["p2", "pending"]], 1]);
  });
  it("no destination (E1): a row's Fix → save → the chooser carries the row; a pick names it, and Don't add it drops it", () => {
    const form = run(open(null, true, true), photos("p1"), stacked("p1"), fix("p1"), typed, saved);
    const atChooser = run(form, { type: "choose", source: { kind: "identity", draft: complete.draft, via: "scan", readId: "r5" }, itemId: addTargetId(form), title: "Cigliuti, Barbaresco Serraboella 2016", missing: [] });
    expect([screen(atChooser), atChooser.chooseFor?.itemId]).toEqual([{ view: "choose", active: "p1", target: "p1", turn: null, waiting: [] }, "p1"]);
    const picked = addNamed(run(atChooser, { type: "adopt", destination: { kind: "catalog" } }), "catalog");
    expect([screen(picked), rows(picked), picked.adopted, unfinishedCount(picked)]).toEqual([home("camera"), [["p1", "added"]], null, 0]);
    const skipped = skipNamed(run(atChooser, { type: "adopt", destination: { kind: "cellar" } }, lotStep));
    expect([screen(skipped), skipped.items, unfinishedCount(skipped)]).toEqual([home("camera"), [], 0]);
  });
  it("an unnamed add during a row's Fix (a late reply) is recorded, warns once, and leaves the form on screen", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const form = run(open({ kind: "catalog" }, false), photos("p1", "p2"), stacked("p1"), stacked("p2"), fix("p1"), typed);
      const s = run(form, { type: "itemAdded", id: null, added: wine("catalog") });
      expect([screen(s), rows(s), s.added.length, s.byHand?.dirty]).toEqual([screen(form), [["p1", "pending"], ["p2", "pending"]], 1, true]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
  it("removing a row ends its by-hand session, so the close-ask never counts a wine that is gone", () => {
    const s = run(open({ kind: "cellar" }, true), photos("p1", "p2"), stacked("p1"), stacked("p2"), fix("p1"), typed, { type: "back" }, { type: "itemRemove", id: "p1" });
    expect([s.byHand, rows(s), unfinishedCount(s)]).toEqual([null, [["p2", "pending"]], 1]);
  });
});

describe("model-based: random action sequences keep the turn rules (amendment 20)", () => {
  type Scenario = { destination: AddWineDestination | null; canScan: boolean; multi: boolean };
  type View = SheetState["view"];
  /** A pattern's later actions, each built against the state it runs on. */
  type Plan = ((s: SheetState) => SheetAction)[];
  const SEQUENCES = 500;
  const STEPS = 40;
  const KEEPS_TURN: readonly View[] = ["byhand", "lot", "choose", "search", "cellar"];
  /** A row's Fix chain runs through the by-hand form Fix opens, and the lot step or chooser its save opens. */
  const FIX_CHAIN: readonly View[] = ["byhand", "lot", "choose"];

  /** mulberry32: a small deterministic PRNG, so a failing seed replays exactly. */
  const prng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pickOne = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const statusOf = (s: SheetState, id: string) => s.items.find((i) => i.id === id)?.status;
  const offerable = (s: SheetState, id: string) => statusOf(s, id) === "read" || statusOf(s, id) === "failed";
  const written = (s: SheetState, id: string) => statusOf(s, id) === "added" || statusOf(s, id) === "incomplete";
  /** Listed and not written: what Fix, Retry and Remove act on. */
  const unfinished = (s: SheetState, id: string) => offerable(s, id) || statusOf(s, id) === "pending";
  const isHomeView = (view: View) => view === "camera" || view === "desktop";
  /** Opened from a bottle's confirm, these keep its turn: by hand, the lot step,
      the chooser, its search (on a device that cannot scan, the laptop view)
      and the cellar view opened from there. */
  const keepsTurn = (s: SheetState, view: View) => KEEPS_TURN.includes(view) || (view === "desktop" && s.canScan === false);
  /** The model's own "on screen": the bottle's reading or confirm view, or a
      view that keeps its turn, opened from its confirm. */
  const onScreen = (s: SheetState): string | null => {
    const id = s.activeItemId;
    if (id === null || statusOf(s, id) === undefined) return null;
    if (s.view === "reading" || s.view === "confirm") return id;
    if (!keepsTurn(s, s.view)) return null;
    return [...s.history].reverse().find((view) => !keepsTurn(s, view)) === "confirm" ? id : null;
  };
  /** The row a by-hand session was opened for (Fix, or By hand on a read), or null. */
  const sessionRow = (s: SheetState): string | null => {
    const origin = s.byHand?.origin;
    return origin?.kind === "item" || origin?.kind === "match" ? origin.itemId : null;
  };
  /** The model's Fix chain after a step, given the chain before it. With no
      bottle holding the turn, the by-hand form showing an unfinished row's
      session starts one; the lot step, the chooser and a saved form carry the
      row the chain already had; any other view, or a turn, ends it. */
  const fixAfter = (s: SheetState, before: string | null): string | null => {
    if (onScreen(s) !== null || !FIX_CHAIN.includes(s.view)) return null;
    if (s.view === "byhand" && s.byHand) {
      const row = sessionRow(s);
      return row !== null && unfinished(s, row) ? row : null;
    }
    return before !== null && unfinished(s, before) ? before : null;
  };
  /** The search (phone or laptop) lies between the bottle's confirm and the view on screen. */
  const searchedFromConfirm = (s: SheetState) =>
    s.history.includes("confirm")
    && [...s.history.slice(s.history.lastIndexOf("confirm") + 1), s.view].some((view) => view === "search" || view === "desktop");

  /** A UI-reachable action, biased toward the bottles the sheet holds. A
      pattern returns its first action and leaves the rest in `plan`. Every
      add, save, chooser pick and skip a pattern makes names addTargetId (S5a). */
  function nextAction(r: () => number, s: SheetState, fresh: () => string, plan: Plan): SheetAction {
    const ids = s.items.map((i) => i.id);
    const some = () => (ids.length > 0 && r() < 0.9 ? pickOne(r, ids) : "b0");
    const target = () => (s.activeItemId !== null && r() < 0.7 ? s.activeItemId : some());
    const added = (): AddedWine => ({
      label: "Vietti, Barolo 2017", destination: pickOne(r, ["flight", "cellar", "catalog"] as const),
      catalogWineId: "c1", glass: 4, wineId: "w4", lotId: "l1", written: r() < 0.5,
    });
    const home: View = s.canScan === false ? "desktop" : "camera";
    const searchView: View = s.canScan === false ? "desktop" : "search";
    const photoOf = (id: string) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() });
    const namedAdd = (st: SheetState): SheetAction => ({ type: "itemAdded", id: addTargetId(st), added: added() });
    const namedSkip = (st: SheetState): SheetAction => ({ type: "lotSkipped", itemId: addTargetId(st), lotId: "l9" });
    const lotStep = (): SheetAction => ({ type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "search" } });
    const lateReply = (): SheetAction => ({ type: "itemAdded", id: null, added: added() });
    /** Wrong bottle? Search (from a confirm, or by hand's Search instead): a
        query, maybe the lot step or by hand, then an add naming the bottle in
        hand when it starts — or a null-id reply, ←, or go home. */
    const searchThenAdd = (): SheetAction => {
      plan.push((st) => (st.canScan === false ? { type: "desktopQuery", query: "cigliuti" } : { type: "searchQuery", query: "cigliuti" }));
      const via = r();
      if (via < 0.25) plan.push(lotStep);
      else if (via < 0.55) plan.push(() => ({ type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: null }));
      const out = r();
      if (out < 0.7) plan.push(namedAdd);
      else if (out < 0.8) plan.push(lateReply);
      else if (out < 0.9) plan.push(() => ({ type: "back" }));
      else plan.push(() => ({ type: "go", view: home }));
      return { type: "go", view: searchView };
    };
    const fixable = ids.filter((id) => unfinished(s, id));
    /** Fix on a stack or laptop-list row: by hand for that row, then its save —
        straight to an add, or through the lot step or the chooser, with
        byHandSaved before or after — or Don't add it, a late reply, Search
        instead, or ← and Rescan. */
    const fixThenAdd = (): SheetAction => {
      const row = pickOne(r, fixable);
      plan.push(() => ({ type: "byHandChange", draft: partial.draft }));
      const via = r();
      if (via < 0.3) {
        const savedFirst = r() < 0.5;
        if (savedFirst) plan.push(() => ({ type: "byHandSaved" }));
        plan.push(lotStep);
        if (!savedFirst) plan.push(() => ({ type: "byHandSaved" }));
        const out = r();
        if (out < 0.5) plan.push(namedAdd);
        else if (out < 0.75) plan.push(namedSkip);
        else if (out < 0.85) plan.push(lateReply);
        else plan.push(() => ({ type: "back" }));
      } else if (via < 0.5) {
        plan.push(() => ({ type: "byHandSaved" }));
        plan.push((st) => ({ type: "choose", source: { kind: "identity", draft: partial.draft, via: "scan", readId: null }, itemId: addTargetId(st), title: "Vietti", missing: [] }));
        plan.push(() => ({ type: "adopt", destination: pickOne(r, [flight, { kind: "cellar" }, { kind: "catalog" }] as const) }));
        if (r() < 0.6) plan.push(namedAdd);
        else plan.push(lotStep, namedSkip);
      } else if (via < 0.7) {
        plan.push(namedAdd, () => ({ type: "byHandSaved" }));
      } else if (via < 0.8) {
        plan.push((st) => ({ type: "go", view: st.canScan === false ? "desktop" : "search" }), () => ({ type: "back" }));
      } else if (via < 0.9) {
        plan.push(() => ({ type: "back" }), () => ({ type: "itemRemove", id: row }));
      } else {
        plan.push(lateReply);
      }
      return { type: "openByHand", origin: r() < 0.8 ? { kind: "item", itemId: row } : { kind: "match", itemId: row }, draft: partial.draft, focusField: null };
    };
    const choices: (() => SheetAction)[] = [
      () => (s.view === "confirm" || s.view === "byhand" ? searchThenAdd() : { type: "go", view: searchView }),
      () => (s.view === "confirm" ? searchThenAdd() : { type: "back" }),
      () => (isHomeView(s.view) && fixable.length > 0 ? fixThenAdd() : namedAdd(s)),
      () => (isHomeView(s.view) && fixable.length > 0 ? fixThenAdd() : { type: "back" }),
      () => ({ type: "enqueue", items: [photoOf(fresh())] }),
      () => ({ type: "enqueue", items: [photoOf(fresh())] }),
      () => ({ type: "enqueue", items: [photoOf(fresh()), photoOf(fresh())] }),
      () => ({ type: "itemUploaded", id: some(), imagePath: "catalog/staging/u/scan.jpg" }),
      () => ({ type: "itemRead", id: some(), read: partial, stack: false }),
      () => ({ type: "itemRead", id: some(), read: partial, stack: false }),
      () => ({ type: "itemRead", id: some(), read: partial, stack: r() < 0.5 }),
      () => ({ type: "itemFailed", id: some() }),
      () => ({ type: "itemRetry", id: some() }),
      () => ({ type: "itemRemove", id: target() }),
      () => ({ type: "itemAdded", id: target(), added: added() }),
      () => ({ type: "itemAdded", id: r() < 0.5 ? null : some(), added: added() }),
      () => ({ type: "itemAddFailed", id: some(), error: "This wine needs a vintage." }),
      () => ({ type: "back" }),
      () => ({ type: "back" }),
      () => ({ type: "go", view: pickOne(r, [home, home, "search", "cellar"] as const) }),
      () => ({ type: "setMulti", multi: r() < 0.5 }),
      () => ({ type: "openByHand", origin: r() < 0.6 ? { kind: "item", itemId: target() } : { kind: "new" }, draft: partial.draft, focusField: null }),
      () => (r() < 0.5 ? { type: "byHandSaved" } : { type: "byHandDiscard" }),
      () => ({ type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: r() < 0.5 ? "scan" : "search" } }),
      () => ({ type: "lotSkipped", itemId: r() < 0.6 ? target() : null, lotId: "l9" }),
      () => ({ type: "choose", source: null, itemId: r() < 0.6 ? target() : null, title: "Vietti", missing: [] }),
      () => ({ type: "adopt", destination: pickOne(r, [flight, { kind: "cellar" }, { kind: "catalog" }] as const) }),
      () => ({ type: "adoptFailed", error: "This tasting is finished — reopen it to add wines." }),
      () => ({ type: "followUp", catalogWineId: "c1", title: "Vietti", written: true }),
      () => ({ type: "followUpDone" }),
      () => (r() < 0.5 ? { type: "requestClose" } : { type: "cancelClose" }),
      () => ({ type: "canScanResolved", canScan: r() < 0.5 }),
    ];
    return pickOne(r, choices)();
  }

  /** Replays `actions` and returns the first broken rule, or null. */
  function violation(sc: Scenario, actions: readonly SheetAction[]): string | null {
    let s = initialSheetState({ destination: sc.destination, options: { multi: sc.multi }, canScan: sc.canScan });
    let fix: string | null = null;
    const left = new Set<string>();   // left by ← from its confirm, or a Many row when Many turned off
    for (const [n, a] of actions.entries()) {
      const prev = s;
      const fixBefore = fix;
      s = sheetReducer(prev, a);
      fix = fixAfter(s, fixBefore);
      const at = `after action ${n + 1} (${a.type})`;
      if (a.type === "back" && prev.view === "confirm" && onScreen(prev) !== null && offerable(prev, onScreen(prev)!)) left.add(onScreen(prev)!);
      if (prev.multi && !s.multi) {
        for (const item of s.items) {
          if (offerable(s, item.id) && onScreen(s) !== item.id && !s.confirmQueue.includes(item.id)) left.add(item.id);
        }
      }
      for (const id of [...left]) if (!offerable(s, id)) left.delete(id);

      const shown = onScreen(s);
      /** The bottle an add starting now belongs to: the turn holder, or the row whose Fix chain is up. */
      const inHand = shown ?? fix;
      const hadInHand = onScreen(prev) ?? fixBefore;
      if (turnItemId(s) !== shown) return `${at}: turnItemId is ${turnItemId(s)}, but the bottle holding the turn is ${shown}`;
      if (addTargetId(s) !== inHand) return `${at}: addTargetId is ${addTargetId(s)}, but the bottle in hand is ${inHand}${shown === null && fix !== null ? " (its Fix chain)" : ""}`;
      if (!s.multi && isHomeView(s.view) && shown === null && s.confirmQueue.length > 0) return `${at}: the ${s.view} view shows while ${s.confirmQueue.join(", ")} wait with Many off and no bottle holding the turn`;
      if (shown !== null && s.confirmQueue.includes(shown)) return `${at}: ${shown} holds the turn and waits in confirmQueue too`;
      if (a.type === "itemAdded" && hadInHand !== null && !written(prev, hadInHand)) {
        if (a.id === hadInHand && (!written(s, hadInHand) || inHand === hadInHand)) return `${at}: the add named ${hadInHand}, the bottle in hand, yet ${hadInHand} is ${statusOf(s, hadInHand)} and ${inHand === hadInHand ? "is still" : "is no longer"} in hand`;
        if (a.id !== hadInHand && (s.view !== prev.view || inHand !== hadInHand)) return `${at}: an add for ${a.id ?? "no bottle"} moved the screen off ${hadInHand}, the bottle in hand (${prev.view} → ${s.view})`;
      }
      if (a.type === "lotSkipped" && hadInHand !== null && a.itemId === hadInHand && unfinished(prev, hadInHand)) {
        if (statusOf(s, hadInHand) !== undefined) return `${at}: Don't add it named ${hadInHand}, the bottle in hand, yet it is still listed (${statusOf(s, hadInHand)})`;
        if (s.view === "byhand") return `${at}: Don't add it dropped ${hadInHand} but landed on a by-hand form`;
      }
      const sessionFor = sessionRow(prev);
      if (sessionFor !== null && sessionRow(s) === sessionFor && statusOf(prev, sessionFor) !== undefined && !written(prev, sessionFor)
        && (statusOf(s, sessionFor) === undefined || written(s, sessionFor))) {
        return `${at}: the by-hand session for ${sessionFor} outlived its row (now ${statusOf(s, sessionFor) ?? "gone"})`;
      }
      if (new Set(s.confirmQueue).size !== s.confirmQueue.length) return `${at}: confirmQueue has duplicates: ${s.confirmQueue.join(", ")}`;
      const stray = s.confirmQueue.filter((id) => !offerable(s, id));
      if (stray.length > 0) return `${at}: confirmQueue holds ${stray.join(", ")}, not a read or failed bottle`;
      for (const item of s.items) {
        if (offerable(s, item.id) && shown !== item.id && !s.confirmQueue.includes(item.id) && !s.multi && !left.has(item.id)) {
          return `${at}: ${item.id} (${item.status}) is not on screen, not waiting, not in the Many stack, and was not left by ←`;
        }
      }
      if (a.type === "itemAdded" && a.id !== null && written(prev, a.id) && s.added.length !== prev.added.length) return `${at}: ${a.id} was added twice`;
      if ((s.view === "reading" || s.view === "confirm") && shown === null) return `${at}: the ${s.view} view shows no bottle`;
      if (s.view === "confirm" && shown !== null && written(s, shown)) return `${at}: the confirm shows ${shown}, already added`;
      const again = s.confirmQueue.filter((id) => left.has(id));
      if (again.length > 0 || (s.view === "confirm" && shown !== null && left.has(shown))) return `${at}: ${again[0] ?? shown}, left by ←, is offered again`;
    }
    return null;
  }

  /** Drops actions one at a time while the sequence still breaks a rule. */
  function shrink(sc: Scenario, actions: readonly SheetAction[]): readonly SheetAction[] {
    let current = actions;
    for (let changed = true; changed;) {
      changed = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const candidate = [...current.slice(0, i), ...current.slice(i + 1)];
        if (violation(sc, candidate) !== null) {
          current = candidate;
          changed = true;
        }
      }
    }
    return current;
  }

  it(`holds over ${SEQUENCES} seeded sequences of ${STEPS} actions`, () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coverage = {
      waiting: 0, reopened: 0, left: 0, stacked: 0, searchAdds: 0, laptopSearchWaiting: 0,
      searchByHandSaves: 0, fixAdds: 0, fixSkips: 0, fixChooser: 0,
    };
    try {
      for (let seed = 1; seed <= SEQUENCES; seed++) {
        const r = prng(seed);
        const sc: Scenario = {
          destination: pickOne(r, [flight, { kind: "cellar" }, { kind: "catalog" }, { kind: "note" }, null] as const),
          canScan: r() < 0.6,
          multi: r() < 0.25,
        };
        let s = initialSheetState({ destination: sc.destination, options: { multi: sc.multi }, canScan: sc.canScan });
        let fix: string | null = null;
        let photos = 0;
        const actions: SheetAction[] = [];
        const plan: Plan = [];
        for (let n = 0; n < STEPS; n++) {
          const a = plan.length > 0 ? plan.shift()!(s) : nextAction(r, s, () => `b${++photos}`, plan);
          const prev = s;
          const fixBefore = fix;
          actions.push(a);
          s = sheetReducer(prev, a);
          fix = fixAfter(s, fixBefore);
          if (s.confirmQueue.length > 0) coverage.waiting++;
          if (isHomeView(s.view) === false && s.view === "confirm" && prev.view !== "confirm" && (a.type === "followUpDone" || a.type === "go" || a.type === "itemAdded")) coverage.reopened++;
          if (a.type === "back" && prev.view === "confirm") coverage.left++;
          if (s.multi && s.items.some((i) => i.status === "read" && i.id !== onScreen(s))) coverage.stacked++;
          if (a.type === "itemAdded" && a.id !== null && a.id === onScreen(prev) && searchedFromConfirm(prev)) coverage.searchAdds++;
          if (s.view === "desktop" && onScreen(s) !== null && s.confirmQueue.length > 0) coverage.laptopSearchWaiting++;
          if (a.type === "itemAdded" && a.id !== null && a.id === onScreen(prev) && prev.view === "byhand" && prev.byHand?.origin.kind === "new") coverage.searchByHandSaves++;
          if (a.type === "itemAdded" && fixBefore !== null && a.id === fixBefore) coverage.fixAdds++;
          if (a.type === "lotSkipped" && fixBefore !== null && a.itemId === fixBefore) coverage.fixSkips++;
          if (s.view === "choose" && fix !== null) coverage.fixChooser++;
        }
        if (violation(sc, actions) !== null) {
          const minimal = shrink(sc, actions);
          const show = (a: SheetAction) => JSON.stringify(a, (key, value) => (key === "blob" ? "Blob" : key === "read" || key === "draft" ? "…" : value));
          throw new Error([
            `seed ${seed} · destination ${sc.destination?.kind ?? "none"} · canScan ${sc.canScan} · multi ${sc.multi}`,
            `violated: ${violation(sc, minimal)}`,
            `minimal replay (${minimal.length} of ${actions.length} actions):`,
            ...minimal.map(show),
          ].join("\n"));
        }
      }
    } finally {
      warn.mockRestore();
    }
    // The generator must actually reach the states the rules are about.
    expect(coverage.waiting, JSON.stringify(coverage)).toBeGreaterThan(200);
    expect(coverage.reopened, JSON.stringify(coverage)).toBeGreaterThan(20);
    expect(coverage.left, JSON.stringify(coverage)).toBeGreaterThan(50);
    expect(coverage.stacked, JSON.stringify(coverage)).toBeGreaterThan(50);
    expect(coverage.searchAdds, JSON.stringify(coverage)).toBeGreaterThan(40);
    expect(coverage.laptopSearchWaiting, JSON.stringify(coverage)).toBeGreaterThan(7);
    expect(coverage.searchByHandSaves, JSON.stringify(coverage)).toBeGreaterThan(5);
    expect(coverage.fixAdds, JSON.stringify(coverage)).toBeGreaterThan(25);
    expect(coverage.fixSkips, JSON.stringify(coverage)).toBeGreaterThan(8);
    expect(coverage.fixChooser, JSON.stringify(coverage)).toBeGreaterThan(35);
  });
});

it("an edit session opens the by-hand form with the glass origin", () => {
  const s = run(initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: true }),
    { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: true }, draft: partial.draft, focusField: "vintage" });
  expect([s.view, s.byHand?.origin]).toEqual(["byhand", { kind: "glass", wineId: "w3", incomplete: true }]);
});

describe("Leave it for later, and a glass saved again (S5a: the adds hook's actions)", () => {
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2015, tawnyYears: null, read: false } };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  const fix = (id: string): SheetAction => ({ type: "openByHand", origin: { kind: "item", itemId: id }, draft: partial.draft, focusField: "vintage" });
  const rows = (s: SheetState) => s.items.map((i) => [i.id, i.status]);
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, waiting: s.confirmQueue });
  const glass = (over: Partial<AddedWine> = {}): AddedWine => ({ label: "Cigliuti, Barbaresco 2015", destination: "flight", catalogWineId: "c4", glass: 4, wineId: "w4", ...over });

  it("on a stacked row's Fix, the row keeps the form's draft as a pending row, the session ends and the stack returns (A4b)", () => {
    const typed = { ...partial.draft, wineName: "Serraboella" };
    const s = run(initialSheetState({ destination: { kind: "cellar" }, options: { multi: true }, canScan: true }),
      photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: true }, fix("i1"),
      { type: "byHandChange", draft: typed }, { type: "byHandLeftForLater", rowId: "unused" });
    expect([screen(s), s.byHand, rows(s), s.items[0].draft, unfinishedCount(s)]).toEqual([{ view: "camera", active: null, waiting: [] }, null, [["i1", "pending"]], typed, 1]);
  });
  it("on a read's Fix from its confirm, the read becomes a pending row that is never offered again, and the read waiting behind it opens", () => {
    let s = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: true }),
      photo("p1"), { type: "back" }, photo("p2"),
      { type: "itemRead", id: "p1", read: partial, stack: false }, { type: "itemRead", id: "p2", read: partial, stack: false }, fix("p2"));
    expect(screen(s)).toEqual({ view: "byhand", active: "p2", waiting: ["p1"] });
    s = run(s, { type: "byHandLeftForLater", rowId: "unused" });
    expect([screen(s), rows(s), s.byHand, unfinishedCount(s)]).toEqual([{ view: "confirm", active: "p1", waiting: [] }, [["p1", "read"], ["p2", "pending"]], null, 2]);
    s = run(s, { type: "back" });
    expect([screen(s), itemRowCopy(s.items[1], { kind: "cellar" }).actions]).toEqual([{ view: "camera", active: null, waiting: [] }, ["fix", "remove"]]);
  });
  it("a new by-hand session left for later becomes a pending row of its own", () => {
    const draft = { ...partial.draft, imageUrl: "https://example.test/label.jpg" };
    const s = run(initialSheetState({ destination: { kind: "catalog" }, options: {}, canScan: false }),
      { type: "openByHand", origin: { kind: "new" }, draft, focusField: "vintage" }, { type: "byHandLeftForLater", rowId: "h1" });
    expect([screen(s), s.byHand, s.items]).toEqual([{ view: "desktop", active: null, waiting: [] }, null,
      [{ id: "h1", photoUrl: "https://example.test/label.jpg", blob: null, imagePath: null, status: "pending", read: null, draft, added: null, error: null }]]);
    expect([itemRowCopy(s.items[0], { kind: "catalog" }), unfinishedCount(s)]).toEqual([{ tone: "pending", label: "Cigliuti · no vintage read", detail: null, actions: ["fix", "remove"] }, 1]);
  });
  it("a glass session is never turned into a row", () => {
    const s = run(initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: true }),
      { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: true }, draft: partial.draft, focusField: "vintage" });
    expect(run(s, { type: "byHandLeftForLater", rowId: "h1" })).toBe(s);
  });
  it("finishing an incomplete glass from its row marks the row added; leaving it for later again keeps it incomplete with the new gaps (D7)", () => {
    const base = run(initialSheetState({ destination: flight, options: { multi: true }, canScan: true }),
      photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: false },
      { type: "itemAdded", id: "i1", added: glass({ label: "Cigliuti, Barbaresco", catalogWineId: null, incomplete: { missing: ["vintage"] } }) },
      { type: "openByHand", origin: { kind: "glass", wineId: "w4", incomplete: true }, draft: partial.draft, focusField: "vintage" },
      { type: "byHandChange", draft: finished });
    expect([base.view, base.history, rows(base)]).toEqual(["byhand", ["camera"], [["i1", "incomplete"]]]);
    const done = run(base, { type: "glassSaved", added: glass() });
    expect([done.view, done.byHand, rows(done), done.items[0].added, done.items[0].draft, done.added, footerCount(done), unfinishedCount(done)])
      .toEqual(["camera", null, [["i1", "added"]], glass(), finished, [glass()], 1, 0]);
    expect("incomplete" in done.items[0].added!).toBe(false);
    expect(itemRowCopy(done.items[0], flight)).toEqual({ tone: "added", label: "Cigliuti, Barbaresco 2015", detail: "glass 4", actions: [] });
    const later = run(base, { type: "glassSaved", added: glass({ label: "Cigliuti, Barbaresco", catalogWineId: null, incomplete: { missing: ["appellation"] } }) });
    expect([later.view, later.byHand, rows(later), itemRowCopy(later.items[0], flight).label]).toEqual(["camera", null, [["i1", "incomplete"]], "Cigliuti, Barbaresco · no appellation read"]);
  });
  it("an edit open's save ends its session and leaves the form, and adds nothing to this session's count", () => {
    const s = run(initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: false }),
      { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: false }, draft: finished, focusField: null },
      { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } },
      { type: "glassSaved", added: glass({ label: "Cigliuti, Barbaresco Serraboella 2015", catalogWineId: "c3", glass: 3, wineId: "w3" }) });
    expect([s.view, s.byHand, s.items, s.added, footerCount(s), unfinishedCount(s)]).toEqual(["desktop", null, [], [], 0, 0]);
  });
});

describe("a refused add under a chooser pick gives the pick back (S5a review: C.4 rule 5, scan-4, E1)", () => {
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2016, tawnyYears: null, read: false } };
  const complete: LabelPhotoRead = { ...partial, readId: "r7", missing: [], draft: finished, display: { ...partial.display, title: "Cigliuti, Barbaresco 2016" } };
  const closed = "This tasting is finished — reopen it to add wines.";
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  /** No destination, a partial read, and an E1 pick: what the hook's choose() dispatches for a draft with gaps (the pick, then By hand for it), then the user finishes the form. */
  const e1Form = (destination: AddWineDestination) => run(initialSheetState({ destination: null, options: {}, canScan: true }),
    photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: false },
    { type: "adopt", destination }, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" },
    { type: "byHandChange", draft: finished });
  const view = (s: SheetState) => ({ view: s.view, adopted: s.adopted, destination: currentDestination(s), error: s.error });

  it("E1 with gaps: the pick's By hand save is refused → the chooser returns with no destination; ← goes back through the form to the read's E1 footer", () => {
    const form = e1Form(flight);
    expect(view(form)).toEqual({ view: "byhand", adopted: flight, destination: flight, error: null });
    let s = run(form, { type: "addRefused", itemId: "i1", error: closed, byHand: true });
    expect([view(s), s.items[0].error, s.byHand?.draft, addTargetId(s)]).toEqual([{ view: "choose", adopted: null, destination: null, error: closed }, closed, finished, "i1"]);
    s = run(s, { type: "back" });
    expect([s.view, s.adopted, currentDestination(s)]).toEqual(["byhand", null, null]);
    s = run(s, { type: "back" });
    expect([s.view, s.activeItemId, currentDestination(s)]).toEqual(["confirm", "i1", null]);
  });
  it("a refusal the form on screen can fix keeps the pick and flags the field", () => {
    const s = run(e1Form({ kind: "cellar" }), { type: "addRefused", itemId: "i1", error: "This wine needs a vintage.", missing: ["vintage"], byHand: true });
    expect([view(s), s.byHand?.attempted, s.byHand?.focusField]).toEqual([{ view: "byhand", adopted: { kind: "cellar" }, destination: { kind: "cellar" }, error: "This wine needs a vintage." }, true, "vintage"]);
  });
  it("a by-hand save refused for missing fields on the chooser its save opened goes back to the form, still giving the pick back; without missing fields it stays on the chooser (plan amendment 22)", () => {
    const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
    const saved: AddSource = { kind: "identity", draft: finished, via: "scan", readId: "r1" };
    // No destination: Fix on the read, its save asks where the wine goes, a pick; catalog-then-lot's catalog write is then refused.
    const chooser = ship(initialSheetState({ destination: null, options: {}, canScan: true }),
      photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: false },
      { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: finished },
      { type: "choose", source: saved, itemId: "i1", title: "Cigliuti, Barbaresco 2016", missing: [] }, { type: "adopt", destination: { kind: "cellar" } });
    expect(view(chooser)).toEqual({ view: "choose", adopted: { kind: "cellar" }, destination: { kind: "cellar" }, error: null });
    const needs = "This wine needs an appellation.";
    let s = ship(chooser, { type: "addRefused", itemId: "i1", error: needs, missing: ["appellation"], byHand: true });
    expect([view(s), s.chooseFor, s.byHand?.draft, s.byHand?.attempted, s.byHand?.focusField, s.items[0].error, addTargetId(s), routeAdd(s, saved)])
      .toEqual([{ view: "byhand", adopted: null, destination: null, error: needs }, null, finished, true, "appellation", needs, "i1", { next: "choose" }]);
    s = ship(s, { type: "back" });
    expect([s.view, s.activeItemId, currentDestination(s)]).toEqual(["confirm", "i1", null]);
    const other = ship(chooser, { type: "addRefused", itemId: "i1", error: "Couldn't add the wine.", byHand: true });
    expect([view(other), other.chooseFor?.title, other.byHand?.attempted]).toEqual([{ view: "choose", adopted: null, destination: null, error: "Couldn't add the wine." }, "Cigliuti, Barbaresco 2016", false]);
  });
  it("an E1 pick made on the confirm: the lot step's refused add returns to the chooser too, never with an earlier wine's chooser", () => {
    let s = run(initialSheetState({ destination: null, options: {}, canScan: true }),
      { type: "choose", source: { kind: "catalog", catalogWineId: "c1", via: "search" }, itemId: null, title: "Vietti, Barolo 2017", missing: [] }, { type: "back" },
      photo("i1"), { type: "itemRead", id: "i1", read: complete, stack: false },
      { type: "adopt", destination: { kind: "cellar" } }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" } },
      { type: "addRefused", itemId: "i1", error: "Couldn't add the wine.", byHand: false });
    expect([view(s), s.chooseFor, addTargetId(s), s.items[0].error]).toEqual([{ view: "choose", adopted: null, destination: null, error: "Couldn't add the wine." }, null, "i1", "Couldn't add the wine."]);
    s = run(s, { type: "back" });
    expect([s.view, s.activeItemId, currentDestination(s)]).toEqual(["confirm", "i1", null]);
    // A pick made on the choose view keeps that chooser's wine.
    const onChooser = run(initialSheetState({ destination: null, options: {}, canScan: false }),
      { type: "choose", source: { kind: "catalog", catalogWineId: "c1", via: "search" }, itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: { kind: "cellar" } }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "search" } },
      { type: "addRefused", itemId: null, error: "Couldn't add the wine.", byHand: false });
    expect([view(onChooser), onChooser.chooseFor?.title]).toEqual([{ view: "choose", adopted: null, destination: null, error: "Couldn't add the wine." }, "Vietti, Barolo 2017"]);
  });
  it("D3's cellar follow-up is not a chooser pick: a refused lot add stays on the lot step with the error", () => {
    const s = run(initialSheetState({ destination: { kind: "catalog" }, options: {}, canScan: false }),
      { type: "itemAdded", id: null, added: { label: "Vietti, Barolo 2017", destination: "catalog", catalogWineId: "c1", written: true } },
      { type: "followUp", catalogWineId: "c1", title: "Vietti, Barolo 2017", written: true },
      { type: "adopt", destination: { kind: "cellar" } }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c1", via: "search" } },
      { type: "addRefused", itemId: null, error: "Couldn't add the wine.", byHand: false });
    expect(view(s)).toEqual({ view: "lot", adopted: { kind: "cellar" }, destination: { kind: "cellar" }, error: "Couldn't add the wine." });
  });
  it("with a requested destination a refusal stays where it is; only a by-hand save flags the missing field", () => {
    const form = run(initialSheetState({ destination: flight, options: {}, canScan: true }), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" });
    const saved = run(form, { type: "addRefused", itemId: null, error: "This wine needs a vintage.", missing: ["vintage"], byHand: true });
    expect([view(saved), saved.byHand?.attempted]).toEqual([{ view: "byhand", adopted: null, destination: flight, error: "This wine needs a vintage." }, true]);
    const other = run(form, { type: "addRefused", itemId: null, error: "Couldn't add the wine.", missing: ["vintage"], byHand: false });
    expect([view(other), other.byHand?.attempted]).toEqual([{ view: "byhand", adopted: null, destination: flight, error: "Couldn't add the wine." }, false]);
  });
  it("Leave it for later on an E1 pick gives the pick back, so the next bottle is chosen again (D12, rule 6)", () => {
    let s = run(e1Form({ kind: "cellar" }), { type: "byHandLeftForLater", rowId: "unused" });
    expect([s.view, s.adopted, currentDestination(s), s.items.map((i) => [i.id, i.status])]).toEqual(["camera", null, null, [["i1", "pending"]]]);
    s = run(s, photo("i2"), { type: "itemRead", id: "i2", read: complete, stack: false });
    expect([s.view, s.activeItemId, currentDestination(s)]).toEqual(["confirm", "i2", null]);
  });
});

describe("an adoption is given back once the view leaves its chain without its add (S5a review, round 2: C.4 rules 5–6, D12, sources-2, entry-3)", () => {
  type View = SheetState["view"];
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2016, tawnyYears: null, read: false } };
  const complete: LabelPhotoRead = { ...partial, readId: "r8", missing: [], draft: finished, display: { ...partial.display, title: "Cigliuti, Barbaresco 2016" } };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  /** The shipped path (plan amendment 22): use-sheet-adds.ts's `send` and the shell's `useReducer` both run `reduceSheet`, the reducer plus the adoption give-back. */
  const send = reduceSheet;
  const sendAll = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, adopted: s.adopted, destination: currentDestination(s) });
  const cellar: AddWineDestination = { kind: "cellar" };
  const scanMatch: AddSource = { kind: "catalog", catalogWineId: "c8", via: "scan" };
  const row = (catalogWineId: string): AddSource => ({ kind: "catalog", catalogWineId, via: "search" });
  const lotRow: AddSource = { kind: "lot", lotId: "l2", consume: true };
  const byHandWine: AddSource = { kind: "identity", draft: finished, via: "scan", readId: "r1" };
  /** No destination, a partial read on its confirm, and an E1 pick: what the hook's choose() sends for a draft with gaps (the pick, then By hand for it). */
  const e1Form = (destination: AddWineDestination) => sendAll(initialSheetState({ destination: null, options: {}, canScan: true }),
    photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: false },
    { type: "adopt", destination }, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" });

  it("reduceSheet is the reducer plus the give-back: back from an E1 pick's form keeps the pick in sheetReducer alone and hands it back in reduceSheet; a step inside the chain is the reducer's own", () => {
    const form = e1Form(flight);
    const back: SheetAction = { type: "back" };
    expect([sheetReducer(form, back).view, sheetReducer(form, back).adopted, reduceSheet(form, back).view, reduceSheet(form, back).adopted]).toEqual(["confirm", flight, "confirm", null]);
    const typed: SheetAction = { type: "byHandChange", draft: finished };
    expect([reduceSheet(form, typed), reduceSheet(form, typed).adopted]).toEqual([sheetReducer(form, typed), flight]);
  });

  it("P1: ← from the form an E1 pick opened gives the pick back; the read's E1 rows return, and Rescan's next bottle is chosen again", () => {
    const form = send(e1Form(flight), { type: "byHandChange", draft: { ...partial.draft, wineName: "Serraboella" } });
    expect(screen(form)).toEqual({ view: "byhand", active: "i1", adopted: flight, destination: flight });
    let s = send(form, { type: "back" });
    expect([screen(s), s.byHand?.draft.wineName, routeAdd(s, scanMatch)]).toEqual([{ view: "confirm", active: "i1", adopted: null, destination: null }, "Serraboella", { next: "choose" }]);
    s = sendAll(s, { type: "itemRemove", id: "i1" }, photo("i2"), { type: "itemRead", id: "i2", read: complete, stack: false });
    expect([screen(s), routeAdd(s, scanMatch)]).toEqual([{ view: "confirm", active: "i2", adopted: null, destination: null }, { next: "choose" }]);
  });
  it("Rescan on the confirm while an E1 pick's add runs gives the pick back, and a waiting read's confirm never inherits it; until then the pick stays", () => {
    let s = sendAll(initialSheetState({ destination: null, options: {}, canScan: true }), photo("i1"), { type: "itemRead", id: "i1", read: complete, stack: false },
      { type: "adopt", destination: flight });
    // Its add runs on the confirm: a photo taken meanwhile only queues, and clearing the error line keeps the pick.
    s = sendAll(s, photo("i2"), { type: "error", error: null });
    expect([screen(s), s.queue]).toEqual([{ view: "confirm", active: "i1", adopted: flight, destination: flight }, ["i2"]]);
    expect(screen(send(s, { type: "itemRemove", id: "i1" }))).toEqual({ view: "camera", active: null, adopted: null, destination: null });
    const waiting = send(s, { type: "itemRead", id: "i2", read: complete, stack: false });
    expect([screen(waiting), waiting.confirmQueue]).toEqual([{ view: "confirm", active: "i1", adopted: flight, destination: flight }, ["i2"]]);
    expect(screen(send(waiting, { type: "itemRemove", id: "i1" }))).toEqual({ view: "confirm", active: "i2", adopted: null, destination: null });
  });
  it("P2: ← from a laptop chooser pick's lot step gives the pick back, so the next row asks again and a lot never pours on its own", () => {
    const atLot = sendAll(initialSheetState({ destination: null, options: {}, canScan: false }), { type: "desktopQuery", query: "vietti" },
      { type: "choose", source: row("c1"), itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: cellar }, { type: "openLot", source: row("c1") }, { type: "lotField", field: "rack", value: "B" });
    expect(screen(atLot)).toEqual({ view: "lot", active: null, adopted: cellar, destination: cellar });
    const s = send(atLot, { type: "back" });
    expect([screen(s), s.chooseFor, s.desktop.query, routeAdd(s, row("c2")), routeAdd(s, lotRow)])
      .toEqual([{ view: "desktop", active: null, adopted: null, destination: null }, null, "vietti", { next: "choose" }, { next: "choose" }]);
    // ← from the chooser itself while its pick's add runs gives the pick back too.
    const left = sendAll(initialSheetState({ destination: null, options: {}, canScan: false }),
      { type: "choose", source: lotRow, itemId: null, title: "Vietti, Barolo 2017", missing: [] }, { type: "adopt", destination: flight }, { type: "back" });
    expect([screen(left), left.chooseFor]).toEqual([{ view: "desktop", active: null, adopted: null, destination: null }, null]);
  });
  it("By hand's save with no destination: ← from its chooser pick's lot step returns to the form with no destination, so the save asks again", () => {
    const atLot = sendAll(initialSheetState({ destination: null, options: {}, canScan: true }),
      photo("i1"), { type: "itemRead", id: "i1", read: partial, stack: false },
      { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: finished },
      { type: "choose", source: byHandWine, itemId: "i1", title: "Cigliuti, Barbaresco 2016", missing: [] },
      { type: "adopt", destination: cellar }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" } });
    expect(screen(atLot)).toEqual({ view: "lot", active: "i1", adopted: cellar, destination: cellar });
    const s = send(atLot, { type: "back" });
    expect([screen(s), s.byHand?.draft, routeAdd(s, byHandWine)]).toEqual([{ view: "byhand", active: "i1", adopted: null, destination: null }, finished, { next: "choose" }]);
  });
  it("P4: going home from the form an E1 pick opened reopens the read's confirm with no destination, and so does Discard", () => {
    const home = send(e1Form({ kind: "note" }), { type: "go", view: "camera" });
    expect([screen(home), routeAdd(home, scanMatch)]).toEqual([{ view: "confirm", active: "i1", adopted: null, destination: null }, { next: "choose" }]);
    const discarded = send(e1Form(cellar), { type: "byHandDiscard" });
    expect([screen(discarded), discarded.byHand]).toEqual([{ view: "confirm", active: "i1", adopted: null, destination: null }, null]);
  });
  it("D3's Add it to my cellar: ← from its lot step gives the cellar back, so the catalog sheet's next add is a catalog add again", () => {
    const atLot = sendAll(initialSheetState({ destination: { kind: "catalog" }, options: {}, canScan: false }),
      { type: "itemAdded", id: null, added: { label: "Vietti, Barolo 2017", destination: "catalog", catalogWineId: "c1", written: true } },
      { type: "followUp", catalogWineId: "c1", title: "Vietti, Barolo 2017", written: true },
      { type: "adopt", destination: cellar }, { type: "openLot", source: row("c1") });
    expect(screen(atLot)).toEqual({ view: "lot", active: null, adopted: cellar, destination: cellar });
    const followUp = send(atLot, { type: "back" });
    expect([screen(followUp), followUp.followUp?.catalogWineId]).toEqual([{ view: "followup", active: null, adopted: null, destination: { kind: "catalog" } }, "c1"]);
    const s = send(followUp, { type: "back" });
    expect([screen(s), routeAdd(s, row("c2"))]).toEqual([{ view: "desktop", active: null, adopted: null, destination: { kind: "catalog" } }, { next: "write" }]);
    // Add it to my cellar again adopts the cellar again, on the lot step it left.
    expect(screen(sendAll(followUp, { type: "adopt", destination: cellar }, { type: "openLot", source: row("c1") }))).toEqual(screen(atLot));
  });
  it("Search instead from the form a chooser pick opened gives the pick back: another row asks again, and a refusal there keeps that row's chooser", () => {
    const form = sendAll(initialSheetState({ destination: null, options: {}, canScan: true }), { type: "go", view: "search" },
      { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" },
      { type: "choose", source: { kind: "identity", draft: partial.draft, via: "byhand", readId: null }, itemId: null, title: "Cigliuti, Barbaresco", missing: ["vintage"] },
      { type: "adopt", destination: cellar }, { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" });
    expect(screen(form)).toEqual({ view: "byhand", active: null, adopted: cellar, destination: cellar });
    let s = send(form, { type: "go", view: "search" });
    expect([screen(s), s.chooseFor, routeAdd(s, row("cB"))]).toEqual([{ view: "search", active: null, adopted: null, destination: null }, null, { next: "choose" }]);
    s = sendAll(s, { type: "choose", source: row("cB"), itemId: null, title: "Brovia, Barolo Villero 2016", missing: [] },
      { type: "adopt", destination: { kind: "catalog" } }, { type: "addRefused", itemId: null, error: "Couldn't add the wine.", byHand: false });
    expect([screen(s), s.chooseFor?.title, s.error]).toEqual([{ view: "choose", active: null, adopted: null, destination: null }, "Brovia, Barolo Villero 2016", "Couldn't add the wine."]);
  });
  it("a photo dropped on a chooser pick's lot step takes the screen, so its read is chosen again instead of following the pick", () => {
    let s = sendAll(initialSheetState({ destination: null, options: {}, canScan: false }),
      { type: "choose", source: row("c1"), itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: cellar }, { type: "openLot", source: row("c1") }, photo("p1"));
    expect(screen(s)).toEqual({ view: "reading", active: "p1", adopted: null, destination: null });
    s = send(s, { type: "itemRead", id: "p1", read: complete, stack: false });
    expect([screen(s), routeAdd(s, scanMatch)]).toEqual([{ view: "confirm", active: "p1", adopted: null, destination: null }, { next: "choose" }]);
  });
  it("the adoption's own chain keeps it: its form, the lot step its save opens and ← between them, until its add lands", () => {
    let s = sendAll(e1Form(cellar), { type: "byHandChange", draft: finished },
      // The save wrote the catalog wine, and the lot step opens on it (catalog-then-lot).
      { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" } }, { type: "lotField", field: "quantity", value: 2 });
    expect(screen(s)).toEqual({ view: "lot", active: "i1", adopted: cellar, destination: cellar });
    s = send(s, { type: "back" });
    expect(screen(s)).toEqual({ view: "byhand", active: "i1", adopted: cellar, destination: cellar });
    s = sendAll(s, { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" } },
      { type: "itemAdded", id: "i1", added: { label: "Cigliuti, Barbaresco 2016", destination: "cellar", catalogWineId: "c5", lotId: "l5" } }, { type: "byHandSaved" });
    expect([screen(s), s.items.map((i) => [i.id, i.status])]).toEqual([{ view: "camera", active: null, adopted: null, destination: null }, [["i1", "added"]]]);
  });

  it("over seeded taps shaped like the hook's, an adoption never outlives its chain", () => {
    const ORIGINS: readonly View[] = ["confirm", "choose", "followup"];
    const CHAIN: readonly View[] = ["byhand", "lot"];
    /** Views whose rows, camera or read can start another wine's add. */
    const ANOTHER_WINE: readonly View[] = ["camera", "desktop", "search", "cellar", "reading"];
    type Plan = ((s: SheetState) => SheetAction)[];
    /** mulberry32, as in the model-based test, so a failing seed replays exactly. */
    const prng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pickOne = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

    /** One tap, turned into actions the way the hook and the shell do; the rest of the tap waits in `plan`. */
    function tap(r: () => number, s: SheetState, fresh: () => string, plan: Plan): SheetAction {
      const inHand = addTargetId(s);
      const destination = currentDestination(s);
      const ids = s.items.map((i) => i.id);
      const fixable = s.items.filter((i) => i.status === "read" || i.status === "pending").map((i) => i.id);
      const searchView: View = s.canScan === false ? "desktop" : "search";
      /** An add that lands, naming the bottle in hand; D3 follows a catalog add on a catalog sheet. */
      const lands = (): SheetAction => {
        const kind = destination === null || destination.kind === "note" ? "catalog" : destination.kind;
        if (kind === "catalog" && s.requested?.kind === "catalog" && r() < 0.6) plan.push(() => ({ type: "followUp", catalogWineId: "c1", title: "Vietti, Barolo 2017", written: true }));
        return { type: "itemAdded", id: inHand, added: { label: "Vietti, Barolo 2017", destination: kind, catalogWineId: "c1", glass: 4, wineId: "w4", lotId: "l1", written: true } };
      };
      const refused = (byHand: boolean): SheetAction => ({ type: "addRefused", itemId: inHand, error: "Couldn't add the wine.", missing: byHand && r() < 0.5 ? ["vintage"] : undefined, byHand });
      /** performAdd, or By hand's save: what the hook does with routeAdd's answer. */
      const add = (source: AddSource, byHand: boolean): SheetAction => {
        switch (routeAdd(s, source).next) {
          case "choose":
            return { type: "choose", source, itemId: inHand, title: "Vietti, Barolo 2017", missing: [] };
          case "lot":
            return { type: "openLot", source };
          case "catalog-then-lot":
            return { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "search" } };
          case "note":
            return { type: "discardAndClose" };   // the note opens once the sheet has closed
          case "write":
            if (r() < 0.25) return refused(byHand);
            if (byHand) plan.push(() => ({ type: "byHandSaved" }));
            return lands();
        }
      };
      /** choose(): an E1 row on a read's confirm, or a row of the chooser. */
      const pick = (): SheetAction => {
        const chosen = pickOne(r, [flight, cellar, { kind: "note" }, { kind: "catalog" }] as const);
        const roll = r();
        if (roll < 0.35) {
          plan.push((st) => {
            const id = addTargetId(st);
            return { type: "openByHand", origin: id === null ? { kind: "new" } : { kind: "item", itemId: id }, draft: partial.draft, focusField: "vintage" };
          });
        } else if (chosen.kind === "cellar") {
          plan.push(() => ({ type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" } }));
        } else if (chosen.kind === "note") {
          plan.push(() => ({ type: "discardAndClose" }));
        }
        // Otherwise its add runs on this view, and a later tap lands it, refuses it, or leaves.
        return { type: "adopt", destination: chosen };
      };
      let here: (() => SheetAction)[] = [];
      switch (s.view) {
        case "camera":
        case "desktop":
        case "search":
        case "cellar":
          here = [
            () => add(pickOne(r, [row("c2"), lotRow]), false),
            () => ({ type: "go", view: s.canScan === false ? "cellar" : pickOne(r, ["search", "cellar"] as const) }),
            () => ({ type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "producer" }),
            () => (fixable.length > 0 ? { type: "openByHand", origin: { kind: "item", itemId: pickOne(r, fixable) }, draft: partial.draft, focusField: "vintage" } : { type: "back" }),
          ];
          break;
        case "reading":
          here = [
            () => ({ type: "itemRead", id: s.activeItemId ?? "p0", read: r() < 0.5 ? complete : partial, stack: false }),
            () => ({ type: "itemFailed", id: s.activeItemId ?? "p0" }),
          ];
          break;
        case "confirm":
          here = [
            () => (s.adopted !== null ? (r() < 0.7 ? lands() : refused(false)) : s.requested === null ? pick() : add(scanMatch, false)),
            () => (s.adopted === null && s.requested === null ? pick() : { type: "error", error: null }),
            () => ({ type: "go", view: searchView }),
            () => ({ type: "openByHand", origin: { kind: "item", itemId: s.activeItemId ?? "p0" }, draft: partial.draft, focusField: "vintage" }),
            () => ({ type: "itemRemove", id: s.activeItemId ?? "p0" }),
          ];
          break;
        case "choose":
          here = [() => (s.adopted === null ? pick() : r() < 0.7 ? lands() : refused(false))];
          break;
        case "byhand":
          here = [
            () => add(byHandWine, true),
            () => ({ type: "byHandChange", draft: finished }),
            () => ({ type: "go", view: searchView }),
            () => ({ type: "byHandDiscard" }),
            () => ({ type: "byHandLeftForLater", rowId: fresh() }),
          ];
          break;
        case "lot":
          here = [
            () => (destination?.kind === "cellar" ? (r() < 0.7 ? lands() : refused(false)) : { type: "back" }),
            () => ({ type: "lotSkipped", itemId: inHand, lotId: "l9" }),
            () => ({ type: "lotField", field: "rack", value: "B" }),
          ];
          break;
        case "followup":
          here = [
            () => {
              plan.push(() => ({ type: "openLot", source: row("c1") }));
              return { type: "adopt", destination: cellar };
            },
            () => ({ type: "followUpDone" }),
          ];
          break;
      }
      const anywhere: (() => SheetAction)[] = [
        () => ({ type: "back" }),
        () => ({ type: "go", view: s.canScan === false ? "desktop" : "camera" }),
        () => ({ type: "enqueue", items: [{ id: fresh(), photoUrl: "blob:p", blob: new Blob() }] }),
        () => ({ type: "itemRead", id: ids.length > 0 ? pickOne(r, ids) : "p0", read: r() < 0.5 ? complete : partial, stack: false }),
        () => ({ type: "setMulti", multi: r() < 0.3 }),
        () => ({ type: "canScanResolved", canScan: r() < 0.5 }),
      ];
      return pickOne(r, [...here, ...here, ...anywhere])();
    }

    /** An adoption lives only on the view it was made on, with the same bottle in hand, or on a by-hand form or lot step opened on top of it. */
    const outlived = (prev: SheetState, next: SheetState): string | null => {
      if (next.adopted === null) return null;
      const move = `${prev.view} → ${next.view} (history ${next.history.join(" · ") || "empty"})`;
      if (ANOTHER_WINE.includes(next.view)) return `survived onto a view that starts another wine's add: ${move}`;
      if (ORIGINS.includes(next.view) && (next.view !== prev.view || next.activeItemId !== prev.activeItemId)) return `survived a move onto another ${next.view}: ${move}`;
      if (CHAIN.includes(next.view) && !CHAIN.includes(prev.view) && !ORIGINS.includes(prev.view)) return `survived onto a ${next.view} it did not open: ${move}`;
      if (CHAIN.includes(next.view) && !next.history.some((view) => ORIGINS.includes(view))) return `survived below where it was made: ${move}`;
      return null;
    };

    const coverage = { adoptions: 0, keptOnItsChain: 0, givenBack: 0, endedOtherwise: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const r = prng(seed);
      const requested = pickOne(r, [null, null, null, { kind: "catalog" }] as const);
      const canScan = r() < 0.5;
      let s = initialSheetState({ destination: requested, options: {}, canScan });
      let photos = 0;
      const plan: Plan = [];
      const trail: SheetAction[] = [];
      for (let n = 0; n < 40 && !s.closing; n++) {
        const a = plan.length > 0 ? plan.shift()!(s) : tap(r, s, () => `p${++photos}`, plan);
        trail.push(a);
        const prev = s;
        s = send(prev, a);
        if (a.type === "adopt") coverage.adoptions++;
        if (prev.adopted !== null && s.adopted !== null && s.view !== prev.view) coverage.keptOnItsChain++;
        if (prev.adopted !== null && s.adopted === null) {
          if (sheetReducer(prev, a).adopted !== null) coverage.givenBack++;
          else coverage.endedOtherwise++;
        }
        const broken = outlived(prev, s);
        if (broken !== null) {
          const show = (x: SheetAction) => JSON.stringify(x, (key, value) => (key === "blob" ? "Blob" : key === "read" || key === "draft" ? "…" : value));
          throw new Error([`seed ${seed} · requested ${requested?.kind ?? "none"} · canScan ${canScan}`, `after action ${n + 1} (${a.type}) the adoption ${broken}`, ...trail.map(show)].join("\n"));
        }
      }
    }
    expect(coverage.adoptions, JSON.stringify(coverage)).toBeGreaterThan(300);
    expect(coverage.keptOnItsChain, JSON.stringify(coverage)).toBeGreaterThan(180);
    expect(coverage.givenBack, JSON.stringify(coverage)).toBeGreaterThan(170);
    expect(coverage.endedOtherwise, JSON.stringify(coverage)).toBeGreaterThan(100);
  });
});

describe("a phone's single add closes the sheet only when nothing is left (plan amendment 22; C.2 After an add, C.4 rule 3, amendment 20)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r9", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2019, tawnyYears: null, read: true } },
    display: { ...partial.display, title: "Cigliuti, Barbaresco 2019" },
  };
  const photo = (id: string): SheetAction => ({ type: "enqueue", items: [{ id, photoUrl: `blob:${id}`, blob: new Blob() }] });
  const read = (id: string, label: LabelPhotoRead = complete): SheetAction => ({ type: "itemRead", id, read: label, stack: false });
  const glass = (id: string | null, n: number, over: Partial<AddedWine> = {}): SheetAction =>
    ({ type: "itemAdded", id, added: { label: "Cigliuti, Barbaresco 2019", destination: "flight", catalogWineId: "c9", glass: n, wineId: `w${n}`, ...over } });
  const bottle = (id: string | null): SheetAction => ({ type: "itemAdded", id, added: { label: "Cigliuti, Barbaresco 2019", destination: "cellar", catalogWineId: "c9", lotId: "l1" } });
  /** A search row's bottle on a phone: the search view, then the lot step for it. */
  const searchRowLot: SheetAction[] = [{ type: "go", view: "search" }, { type: "openLot", source: { kind: "catalog", catalogWineId: "c9", via: "search" } }];
  /** Every action through the shipped path, as the adds hook sends them. */
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  const open = (destination: AddWineDestination, canScan = true, multi = false) => initialSheetState({ destination, options: { multi }, canScan });
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, queue: s.queue, waiting: s.confirmQueue, rows: s.items.map((i) => [i.id, i.status]) });
  const empty = (view: SheetState["view"], rows: string[][]) => ({ view, active: null, queue: [], waiting: [], rows });

  it("the plain single add closes: a scanned glass, a search row's bottle, or an incomplete glass (written, D7), with nothing else in the sheet", () => {
    const scannedGlass = ship(open(flight), photo("q1"), read("q1"), glass("q1", 4), { type: "positionAdvanced", position: 5 });
    expect([screen(scannedGlass), shouldCloseAfterSingleAdd(scannedGlass)]).toEqual([empty("camera", [["q1", "added"]]), true]);
    expect(ship(scannedGlass, { type: "requestClose" })).toMatchObject({ closeAsk: null, closing: true });
    const searchRow = ship(open({ kind: "cellar" }), ...searchRowLot, bottle(null));
    expect([screen(searchRow), shouldCloseAfterSingleAdd(searchRow)]).toEqual([empty("camera", []), true]);
    const incomplete = ship(open(flight), photo("q2"), read("q2", partial), glass("q2", 4, { catalogWineId: null, incomplete: { missing: ["vintage"] } }));
    expect([screen(incomplete), shouldCloseAfterSingleAdd(incomplete)]).toEqual([empty("camera", [["q2", "incomplete"]]), true]);
  });
  it("a photo still reading keeps it open (review probe 3): back while it reads, then a search row's glass; its read then opens its confirm, as the drain continues", () => {
    const s = ship(open(flight), photo("i1"), { type: "itemUploaded", id: "i1", imagePath: "catalog/staging/u/i1.jpg" }, { type: "back" }, { type: "go", view: "search" },
      glass(null, 4), { type: "positionAdvanced", position: 5 }, { type: "rowAdded", key: "wine:c9" });
    // requestClose alone would close here: a photo still reading is not unfinished (rule 7).
    expect([screen(s), unfinishedCount(s), shouldCloseAfterSingleAdd(s)]).toEqual([{ ...empty("camera", [["i1", "reading"]]), queue: ["i1"] }, 0, false]);
    expect(screen(ship(s, read("i1")))).toEqual({ view: "confirm", active: "i1", queue: [], waiting: [], rows: [["i1", "read"]] });
  });
  it("a read that waited its turn keeps it open (review probe 1, P3): the add lands home, which opens that read's confirm, and no close-ask covers it", () => {
    let s = ship(open({ kind: "cellar" }), photo("p1"), { type: "back" }, photo("p2"), read("p1"), read("p2"));
    expect(screen(s)).toEqual({ view: "confirm", active: "p2", queue: [], waiting: ["p1"], rows: [["p1", "read"], ["p2", "read"]] });
    s = ship(s, { type: "openLot", source: { kind: "catalog", catalogWineId: "c9", via: "scan" } }, bottle("p2"));
    expect([screen(s), shouldCloseAfterSingleAdd(s), s.closeAsk]).toEqual([{ view: "confirm", active: "p1", queue: [], waiting: [], rows: [["p1", "read"], ["p2", "added"]] }, false, null]);
  });
  it("a read left by back, a pending row or a failed photo keeps it open: its row stays listed", () => {
    const leftRead = ship(open({ kind: "cellar" }), photo("p1"), read("p1"), { type: "back" }, ...searchRowLot, bottle(null));
    expect([screen(leftRead), shouldCloseAfterSingleAdd(leftRead)]).toEqual([empty("camera", [["p1", "read"]]), false]);
    const pendingRow = ship(open({ kind: "cellar" }), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" },
      { type: "byHandLeftForLater", rowId: "h1" }, ...searchRowLot, bottle(null));
    expect([screen(pendingRow), shouldCloseAfterSingleAdd(pendingRow)]).toEqual([empty("camera", [["h1", "pending"]]), false]);
    const failedPhoto = ship(open(flight), photo("p1"), { type: "back" }, { type: "itemFailed", id: "p1" }, { type: "back" }, { type: "go", view: "search" }, glass(null, 4));
    expect([screen(failedPhoto), shouldCloseAfterSingleAdd(failedPhoto)]).toEqual([empty("camera", [["p1", "failed"]]), false]);
  });
  it("a warning keeps it open, so its notice stays until Done (plan amendment 22)", () => {
    const s = ship(open(flight), photo("q1"), read("q1"), glass("q1", 4));
    expect([shouldCloseAfterSingleAdd(s), shouldCloseAfterSingleAdd(s, { warning: "Added - but the bottle is still counted in your cellar." }), shouldCloseAfterSingleAdd(s, { warning: null })])
      .toEqual([true, false, true]);
  });
  it("D3's follow-up, Many and the laptop keep it open (C.2 After an add)", () => {
    const d3 = ship(initialSheetState({ destination: { kind: "catalog" }, options: {}, canScan: true }), photo("q1"), read("q1"),
      { type: "itemAdded", id: "q1", added: { label: "Cigliuti, Barbaresco 2019", destination: "catalog", catalogWineId: "c9", written: true } },
      { type: "followUp", catalogWineId: "c9", title: "Cigliuti, Barbaresco 2019", written: true });
    expect([d3.view, shouldCloseAfterSingleAdd(d3)]).toEqual(["followup", false]);
    const many = ship(open(flight, true, true), photo("q1"), read("q1"), glass("q1", 4));
    expect([screen(many), many.multi, shouldCloseAfterSingleAdd(many)]).toEqual([empty("camera", [["q1", "added"]]), true, false]);
    const laptop = ship(open(flight, false), photo("q1"), read("q1"), glass("q1", 4));
    expect([screen(laptop), shouldCloseAfterSingleAdd(laptop)]).toEqual([empty("desktop", [["q1", "added"]]), false]);
  });
});

describe("a note pick closes the sheet only when nothing else is left (plan amendment 22 on the note hand-off: C.5 C1, C2, D3, E1; C.4 rules 3, 4 and 7)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r10", missing: [],
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2020, tawnyYears: null, read: true } },
    display: { ...partial.display, title: "Cigliuti, Barbaresco 2020" },
  };
  const photos = (...ids: string[]): SheetAction => ({ type: "enqueue", items: ids.map((id) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() })) });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  const note: AddWineDestination = { kind: "note" };
  const pick: NotePick = { catalogWineId: "c9" };
  const fromScan: AddSource = { kind: "catalog", catalogWineId: "c9", via: "scan" };
  /** Every action through the shipped path, as the adds hook sends them. */
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  /** What the adds hook's handOff sends once a pick is ready: the bottle in hand when it started, and whether the by-hand form's save made it. */
  const handOff = (s: SheetState, fromForm = false) => reduceSheet(s, { type: "notePicked", pick, itemId: addTargetId(s), fromForm });
  const open = (destination: AddWineDestination | null, canScan = true) => initialSheetState({ destination, options: {}, canScan });
  const screen = (s: SheetState) => ({ view: s.view, active: s.activeItemId, waiting: s.confirmQueue, rows: s.items.map((i) => [i.id, i.status]) });
  const outcome = (s: SheetState) => ({ closing: s.closing, closeAsk: s.closeAsk });
  const asked = (unfinished: number) => ({ closing: false, closeAsk: { unfinished, note: pick } });
  const closes = { closing: true, closeAsk: null };
  /** Review probe 1: no destination on a phone; i1 finished reading behind i2's reading view and waits; Rate it now (E1) on i2's confirm. */
  const probe1 = () => ship(open(null), photos("i1"), { type: "back" }, photos("i2"), read("i1"), read("i2"), { type: "adopt", destination: note });

  it("with nothing else in the sheet it closes at once: the picked bottle, and the by-hand form whose save made the pick, never count", () => {
    const atConfirm = ship(open(note), photos("q1"), read("q1"));
    // requestClose would ask here: the bottle being rated is a read not added (rule 7).
    expect([screen(atConfirm), unfinishedCount(atConfirm), outcome(handOff(atConfirm))]).toEqual([{ view: "confirm", active: "q1", waiting: [], rows: [["q1", "read"]] }, 1, closes]);
    expect(outcome(handOff(open(note, false)))).toEqual(closes);
    const itemForm = ship(open(note), photos("q2"), { type: "itemRead", id: "q2", read: partial, stack: false },
      { type: "openByHand", origin: { kind: "item", itemId: "q2" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: complete.draft });
    expect(outcome(handOff(itemForm, true))).toEqual(closes);
    const newForm = ship(open(note, false), { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: "producer" }, { type: "byHandChange", draft: complete.draft });
    expect([unfinishedCount(newForm), outcome(handOff(newForm, true))]).toEqual([1, closes]);
    const d3 = ship(open({ kind: "catalog" }), { type: "go", view: "search" },
      { type: "itemAdded", id: null, added: { label: "Cigliuti, Barbaresco 2020", destination: "catalog", catalogWineId: "c9", written: true } },
      { type: "followUp", catalogWineId: "c9", title: "Cigliuti, Barbaresco 2020", written: true });
    expect([d3.view, outcome(handOff(d3))]).toEqual(["followup", closes]);
  });
  it("review probe 1: Rate it now (E1) while another read waits its turn asks first; the ask holds the pick and the waiting read stays", () => {
    const s = probe1();
    expect([screen(s), routeAdd(s, fromScan)]).toEqual([{ view: "confirm", active: "i2", waiting: ["i1"], rows: [["i1", "read"], ["i2", "read"]] }, { next: "note" }]);
    const ask = handOff(s);
    expect([screen(ask), outcome(ask), ask.adopted]).toEqual([screen(s), asked(1), note]);
  });
  it("review probe 2: three photos at once, all read: Rate it now on the first asks about the other two", () => {
    const s = ship(open(null), photos("a", "b", "c"), read("a"), read("b"), read("c"), { type: "adopt", destination: note });
    expect([screen(s), s.multi, routeAdd(s, fromScan)]).toEqual([{ view: "confirm", active: "a", waiting: [], rows: [["a", "read"], ["b", "read"], ["c", "read"]] }, false, { next: "note" }]);
    expect(outcome(handOff(s))).toEqual(asked(2));
  });
  it("review probe 3: D3's Taste & rate it now over a read that waited behind the follow-up asks first; Keep going, then Done — add another wine opens that read", () => {
    const s = ship(open({ kind: "catalog" }), photos("i1"), { type: "back" }, { type: "go", view: "search" },
      { type: "itemAdded", id: null, added: { label: "Vietti, Barolo 2017", destination: "catalog", catalogWineId: "c1", written: true } },
      { type: "followUp", catalogWineId: "c1", title: "Vietti, Barolo 2017", written: true }, read("i1"));
    expect(screen(s)).toEqual({ view: "followup", active: null, waiting: ["i1"], rows: [["i1", "read"]] });
    const ask = handOff(s);
    expect(outcome(ask)).toEqual(asked(1));
    const kept = ship(ask, { type: "cancelClose" });
    expect([screen(kept), outcome(kept)]).toEqual([screen(s), { closing: false, closeAsk: null }]);
    expect(screen(ship(kept, { type: "followUpDone" }))).toEqual({ view: "confirm", active: "i1", waiting: [], rows: [["i1", "read"]] });
  });
  it("counts what closing would drop besides the pick: a photo still uploading or being read (rule 7's own ask does not), a pending row, a failed photo, another wine's dirty by-hand form", () => {
    const reading = ship(open(note), photos("p1"), { type: "itemUploaded", id: "p1", imagePath: "catalog/staging/u/p1.jpg" }, { type: "back" }, { type: "go", view: "search" });
    expect([screen(reading), reading.queue, unfinishedCount(reading), outcome(handOff(reading))]).toEqual([{ view: "search", active: null, waiting: [], rows: [["p1", "reading"]] }, ["p1"], 0, asked(1)]);
    const uploading = ship(open(note), photos("p1"), { type: "back" }, { type: "go", view: "search" });
    expect([screen(uploading), outcome(handOff(uploading))]).toEqual([{ view: "search", active: null, waiting: [], rows: [["p1", "uploading"]] }, asked(1)]);
    const pending = ship(open(null, false), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandLeftForLater", rowId: "h1" },
      { type: "choose", source: { kind: "catalog", catalogWineId: "c9", via: "search" }, itemId: null, title: "Cigliuti, Barbaresco 2020", missing: [] }, { type: "adopt", destination: note });
    expect([screen(pending), outcome(handOff(pending))]).toEqual([{ view: "choose", active: null, waiting: [], rows: [["h1", "pending"]] }, asked(1)]);
    const failed = ship(open(note), photos("p1"), { type: "back" }, { type: "itemFailed", id: "p1" }, { type: "back" }, { type: "go", view: "search" });
    expect([screen(failed), outcome(handOff(failed))]).toEqual([{ view: "search", active: null, waiting: [], rows: [["p1", "failed"]] }, asked(1)]);
    const typing = ship(open(note, false), { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: "producer" }, { type: "byHandChange", draft: partial.draft }, { type: "go", view: "desktop" });
    expect([typing.view, outcome(handOff(typing))]).toEqual(["desktop", asked(1)]);
  });
  it("Discard hands the pick on: the ask holds it, and discardAndClose drops the other rows as the sheet closes", () => {
    const ask = handOff(probe1());
    expect(ask.closeAsk?.note).toEqual(pick);
    const s = ship(ask, { type: "discardAndClose" });
    expect([s.closing, s.closeAsk, s.items, s.confirmQueue]).toEqual([true, null, [], []]);
  });
  // Plan amendment 23 changed this pinned test: ending a note ask keeps the pick
  // while its own chain (here E1's confirm) is on screen, so Rate it now asks again.
  it("Keep going keeps every bottle and keeps the pick while its confirm is on screen; ✕ afterwards asks rule 7's own question, with no note in it", () => {
    const before = probe1();
    const s = ship(handOff(before), { type: "cancelClose" });
    expect([screen(s), outcome(s), s.adopted, currentDestination(s), routeAdd(s, fromScan)]).toEqual([screen(before), { closing: false, closeAsk: null }, note, note, { next: "note" }]);
    const closing = ship(s, { type: "requestClose" });
    expect([closing.closeAsk, closing.closeAsk?.note]).toEqual([{ unfinished: 2 }, undefined]);
  });
  // Plan amendment 23 changed this pinned test: ✕ ends the note ask but keeps the
  // pick, since E1's confirm is still on screen; ← leaves the confirm and gives it back.
  it("the ask ends without handing on its pick when anything else happens (←, ✕, another row); ← gives the pick back, ✕ keeps it on its confirm; a read landing behind it keeps the ask", () => {
    const ask = handOff(probe1());
    // ← leaves i2 as a row and opens the read that waited: no Discard can open the note for it any more.
    const back = ship(ask, { type: "back" });
    expect([screen(back), outcome(back), back.adopted]).toEqual([{ view: "confirm", active: "i1", waiting: [], rows: [["i1", "read"], ["i2", "read"]] }, { closing: false, closeAsk: null }, null]);
    // ✕ asks rule 7's own question instead, with no note in it.
    const cross = ship(ask, { type: "requestClose" });
    expect([cross.closeAsk, cross.closeAsk?.note, cross.adopted]).toEqual([{ unfinished: 2 }, undefined, note]);
    // Another row answers it: that pick stands, on its own lot step.
    const cellar = ship(ask, { type: "adopt", destination: { kind: "cellar" } }, { type: "openLot", source: fromScan });
    expect([cellar.view, outcome(cellar), cellar.adopted]).toEqual(["lot", { closing: false, closeAsk: null }, { kind: "cellar" }]);
    // A read landing behind the ask changes nothing on screen, so the ask and its pick stay.
    const waiting = handOff(ship(open(note), photos("p1"), { type: "back" }, { type: "go", view: "search" }));
    const landed = ship(waiting, read("p1"));
    expect([screen(landed), landed.closeAsk, landed.closeAsk?.note]).toEqual([{ view: "search", active: null, waiting: ["p1"], rows: [["p1", "read"]] }, waiting.closeAsk, pick]);
  });
  it("Rate it now tapped again under the ask asks again with the pick kept, on E1's confirm and on the chooser; By hand from that pick keeps it; My cellar still stands (S5a re-review)", () => {
    // E1 (review probe 1): the note did not open, so a second tap is likely. The hook sends adopt, then routes the add at once.
    const ask = handOff(probe1());
    const again = ship(ask, { type: "adopt", destination: { kind: "note" } });
    expect([screen(again), outcome(again), again.adopted, routeAdd(again, fromScan)]).toEqual([screen(ask), { closing: false, closeAsk: null }, note, { next: "note" }]);
    const asksAgain = handOff(again);
    expect([screen(asksAgain), outcome(asksAgain), asksAgain.adopted]).toEqual([screen(ask), asked(1), note]);
    // The rule is the step, not the object: the first pick's own destination sent again stands too.
    const sameObject = ship(ask, { type: "adopt", destination: note });
    expect([sameObject.adopted, routeAdd(sameObject, fromScan)]).toEqual([note, { next: "note" }]);
    // Plan amendment 23 changed this pinned line: the ask made again ends like any
    // other, and Keep going keeps its pick while E1's confirm is on screen.
    expect(ship(asksAgain, { type: "cancelClose" }).adopted).toEqual(note);
    // By hand opened from that pick keeps it, so the form's save routes to the note and asks again.
    const form = ship(again, { type: "openByHand", origin: { kind: "item", itemId: "i2" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: complete.draft });
    expect([form.view, form.adopted, form.closeAsk, routeAdd(form, fromScan)]).toEqual(["byhand", note, null, { next: "note" }]);
    const formAsks = handOff(form, true);
    expect([outcome(formAsks), formAsks.adopted]).toEqual([asked(1), note]);
    // The chooser, with a row left for later: a second tap asks again rather than toggling the ask off.
    const chooser = handOff(ship(open(null, false), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandLeftForLater", rowId: "h1" },
      { type: "choose", source: { kind: "catalog", catalogWineId: "c9", via: "search" }, itemId: null, title: "Cigliuti, Barbaresco 2020", missing: [] }, { type: "adopt", destination: note }));
    expect([screen(chooser), outcome(chooser)]).toEqual([{ view: "choose", active: null, waiting: [], rows: [["h1", "pending"]] }, asked(1)]);
    const chooserAgain = ship(chooser, { type: "adopt", destination: { kind: "note" } });
    expect([screen(chooserAgain), outcome(chooserAgain), chooserAgain.chooseFor, chooserAgain.adopted, routeAdd(chooserAgain, fromScan)])
      .toEqual([screen(chooser), { closing: false, closeAsk: null }, chooser.chooseFor, note, { next: "note" }]);
    const chooserAsks = handOff(chooserAgain);
    expect([screen(chooserAsks), outcome(chooserAsks), chooserAsks.adopted]).toEqual([screen(chooser), asked(1), note]);
    // My cellar under the ask still stands, on the chooser as on E1.
    const cellar = ship(chooser, { type: "adopt", destination: { kind: "cellar" } });
    expect([cellar.view, outcome(cellar), cellar.adopted, routeAdd(cellar, fromScan)]).toEqual(["choose", { closing: false, closeAsk: null }, { kind: "cellar" }, { next: "lot" }]);
  });
});

describe("a stale reply never acts (plan amendment 23: wave C3 probes A, A4, F, G, B3, B4)", () => {
  const complete: LabelPhotoRead = {
    ...partial, readId: "r11", missing: [], match: null,
    draft: { ...partial.draft, vintage: { kind: "YEAR", year: 2021, tawnyYears: null, read: true } },
    display: { ...partial.display, title: "Cigliuti, Barbaresco 2021" },
  };
  const photos = (...ids: string[]): SheetAction => ({ type: "enqueue", items: ids.map((id) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() })) });
  const note: AddWineDestination = { kind: "note" };
  const pick: NotePick = { catalogWineId: "c9" };
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  /** The ticket an add takes when it starts (amendment 23): built by hand so the probes fail on behaviour, not on a missing export. */
  const ticketOf = (s: SheetState) => ({ flow: (s as SheetState & { flow: number }).flow, itemId: addTargetId(s), view: s.view });
  /** The catalog-first note reply as the adds hook sends it, carrying the ticket its call started with. */
  const lateNote = (ticket: ReturnType<typeof ticketOf>, fromForm = false): SheetAction =>
    ({ type: "notePicked", pick, itemId: ticket.itemId, fromForm, ticket } as SheetAction);
  /** Probe setup: no destination on a phone, i1 a complete unmatched read on its confirm, Rate it now (adopt note); the catalog write starts. */
  const started = () => {
    const s = ship(initialSheetState({ destination: null, options: {}, canScan: true }), photos("i1"), { type: "itemRead", id: "i1", read: complete, stack: false }, { type: "adopt", destination: note });
    expect([s.view, s.activeItemId, routeAdd(s, { kind: "identity", draft: complete.draft, via: "scan", readId: "r11" })]).toEqual(["confirm", "i1", { next: "note" }]);
    return { s, ticket: ticketOf(s) };
  };

  it("A: ← during the write, then the reply: the late pick neither closes the sheet nor opens the note", () => {
    const { s, ticket } = started();
    const back = ship(s, { type: "back" });
    expect([back.view, back.adopted]).toEqual(["camera", null]);
    const late = ship(back, lateNote(ticket));
    expect([late.closing, late.closeAsk, late]).toEqual([false, null, back]);
  });
  it("A4: ← and a new photo during the write: the late pick raises no ask over the new photo", () => {
    const { s, ticket } = started();
    const moved = ship(s, { type: "back" }, photos("i2"));
    expect([moved.view, moved.activeItemId]).toEqual(["reading", "i2"]);
    const late = ship(moved, lateNote(ticket));
    expect([late.closing, late.closeAsk, late]).toEqual([false, null, moved]);
  });
  it("F: ←, Fix on the bottle and typing during the write: the late pick never closes over the dirty form", () => {
    const { s, ticket } = started();
    const form = ship(s, { type: "back" }, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: complete.draft, focusField: null },
      { type: "byHandChange", draft: { ...complete.draft, wineName: "Serraboella" } });
    expect([form.view, form.byHand?.dirty]).toEqual(["byhand", true]);
    const late = ship(form, lateNote(ticket));
    expect([late.closing, late.closeAsk, late.byHand?.draft.wineName, late]).toEqual([false, null, "Serraboella", form]);
  });
  it("G: ✕ during the write puts rule 7's ask up; the late pick never closes under it or changes it", () => {
    const { s, ticket } = started();
    const asking = ship(s, { type: "requestClose" });
    expect([asking.view, asking.closeAsk]).toEqual(["confirm", { unfinished: 1 }]);
    const late = ship(asking, lateNote(ticket));
    expect([late.closing, late.closeAsk, late]).toEqual([false, { unfinished: 1 }, asking]);
  });

  /** B3/B4 setup: no destination on a phone; i1 waits behind i2, a partial read on its confirm; Rate it now opens By hand for its gaps (E1), the user types, and the form's save asks. */
  const noteForm = () => {
    const s = ship(initialSheetState({ destination: null, options: {}, canScan: true }), photos("i1"), { type: "back" }, photos("i2"),
      { type: "itemRead", id: "i1", read: complete, stack: false }, { type: "itemRead", id: "i2", read: partial, stack: false },
      { type: "adopt", destination: note }, { type: "openByHand", origin: { kind: "item", itemId: "i2" }, draft: partial.draft, focusField: "vintage" },
      { type: "byHandChange", draft: complete.draft });
    const ask = reduceSheet(s, { type: "notePicked", pick, itemId: addTargetId(s), fromForm: true });
    expect([ask.view, ask.confirmQueue, ask.closeAsk, ask.adopted]).toEqual(["byhand", ["i1"], { unfinished: 1, note: pick }, note]);
    return ask;
  };
  const kept = (s: SheetState) => [s.view, s.closeAsk, s.adopted, currentDestination(s), routeAdd(s, { kind: "identity", draft: complete.draft, via: "scan", readId: "r1" })];

  it("B3: typing on the note pick's own form ends the ask and keeps the pick, so the form still starts the note", () => {
    const typed = ship(noteForm(), { type: "byHandChange", draft: { ...complete.draft, wineName: "Serraboella" } });
    expect(kept(typed)).toEqual(["byhand", null, note, note, { next: "note" }]);
  });
  it("B4: Keep going on the note pick's own form ends the ask and keeps the pick", () => {
    const going = ship(noteForm(), { type: "cancelClose" });
    expect(kept(going)).toEqual(["byhand", null, note, note, { next: "note" }]);
  });
});

describe("one ticket rule for server replies (plan amendment 23)", () => {
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2017, tawnyYears: null, read: true } };
  const complete: LabelPhotoRead = { ...partial, readId: "r14", missing: [], match: null, draft: finished, display: { ...partial.display, title: "Cigliuti, Barbaresco 2017" } };
  const photos = (...ids: string[]): SheetAction => ({ type: "enqueue", items: ids.map((id) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() })) });
  const read = (id: string, label: LabelPhotoRead = complete): SheetAction => ({ type: "itemRead", id, read: label, stack: false });
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  const open = (destination: AddWineDestination | null, canScan = true) => initialSheetState({ destination, options: {}, canScan });
  const glass = (n = 4): AddedWine => ({ label: "Cigliuti, Barbaresco 2017", destination: "flight", catalogWineId: "c4", glass: n, wineId: `w${n}` });
  type Landed = Extract<SheetAction, { type: "addLanded" }>;
  /** The adds hook's reply to an add started on `s`: its ticket and the bottle in hand are taken there. */
  const landed = (s: SheetState, over: Partial<Landed> = {}): Landed => ({
    type: "addLanded", ticket: ticketFor(s), id: addTargetId(s), added: glass(),
    source: { kind: "identity", draft: finished, via: "scan", readId: "r14" },
    byHand: false, draft: null, adopted: s.adopted, scanNext: false, warning: null, ...over,
  });

  it("flow counts the user's moves and closes, never background steps or a photo that only queues", () => {
    let s = ship(open(flight), photos("i1"));
    expect([s.view, s.flow]).toEqual(["reading", 1]);
    s = ship(s, { type: "itemUploaded", id: "i1", imagePath: "catalog/staging/u/i1.jpg" }, read("i1"), { type: "positionAdvanced", position: 5 },
      { type: "rowAdded", key: "wine:c1" }, { type: "error", error: "x" }, { type: "setMulti", multi: false }, { type: "adopt", destination: { kind: "cellar" } });
    expect([s.view, s.flow]).toEqual(["confirm", 1]);
    s = ship(s, { type: "go", view: "search" }, { type: "searchQuery", query: "cigliuti" }, { type: "back" });
    expect([s.view, s.flow]).toEqual(["confirm", 3]);
    s = ship(s, { type: "requestClose" }, { type: "cancelClose" });
    expect([s.closeAsk, s.flow]).toEqual([null, 5]);
    s = ship(s, photos("i2"), { type: "itemRemove", id: "i2" });
    expect([s.view, s.queue, s.flow]).toEqual(["confirm", [], 5]);
    s = ship(s, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: finished, focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    expect([s.view, s.flow]).toEqual(["byhand", 6]);
    expect(ship(s, { type: "back" }, { type: "itemRemove", id: "i1" })).toMatchObject({ view: "camera", flow: 8 });
  });
  it("replyIsCurrent: same flow, bottle and view; a step away and back, or a read opening a confirm over the laptop view, makes it stale; a reply started while resolving survives the first view", () => {
    const s = ship(open(flight), photos("i1"), read("i1"));
    const t: ReplyTicket = ticketFor(s);
    expect([t, replyIsCurrent(s, t)]).toEqual([{ flow: 1, itemId: "i1", view: "confirm" }, true]);
    expect(replyIsCurrent(ship(s, { type: "go", view: "search" }, { type: "back" }), t)).toBe(false);
    expect(replyIsCurrent(ship(s, photos("i2"), { type: "itemUploaded", id: "i2", imagePath: "catalog/staging/u/i2.jpg" }), t)).toBe(true);
    const laptop = ship(open({ kind: "cellar" }, false), photos("p1"), { type: "back" }, { type: "desktopQuery", query: "vietti" });
    const lt = ticketFor(laptop);
    const readOver = ship(laptop, read("p1"));
    expect([lt, readOver.view, readOver.flow, replyIsCurrent(readOver, lt)]).toEqual([{ flow: 2, itemId: null, view: "desktop" }, "confirm", 2, false]);
    const resolving = initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: null });
    const rt = ticketFor(resolving);
    expect([replyIsCurrent(ship(resolving, { type: "canScanResolved", canScan: true }), rt), replyIsCurrent(ship(resolving, { type: "requestClose" }), rt)]).toEqual([true, false]);
  });
  it("a current addLanded lands as the hook did: a phone's single add closes, a warning keeps it open, Add and scan the next opens the next read, D3 follows on a catalog sheet", () => {
    const one = ship(open(flight), photos("q1"), read("q1"));
    expect(ship(one, landed(one))).toMatchObject({ view: "camera", closing: true });
    expect(ship(one, landed(one, { warning: "Added — but the bottle is still counted in your cellar." }))).toMatchObject({ view: "camera", closing: false, closeAsk: null });
    const two = ship(open(flight), photos("b1"), photos("b2"), read("b1"), read("b2"));
    expect([two.view, two.activeItemId, two.confirmQueue]).toEqual(["confirm", "b1", ["b2"]]);
    const next = ship(two, landed(two, { scanNext: true }));
    expect([next.view, next.activeItemId, next.multi, next.closing, next.items.map((i) => i.status)]).toEqual(["confirm", "b2", true, false, ["added", "read"]]);
    const cat = ship(open({ kind: "catalog" }), photos("c1"), read("c1"));
    const d3 = ship(cat, landed(cat, { added: { label: "Cigliuti, Barbaresco 2017", destination: "catalog", catalogWineId: "c4", written: true } }));
    expect([d3.view, d3.followUp, d3.closing]).toEqual(["followup", { catalogWineId: "c4", title: "Cigliuti, Barbaresco 2017", written: true }, false]);
  });
  it("a stale add is recorded but never moves the sheet: the close button during it keeps rule 7's ask on the confirm; after Keep going nothing is left and closing closes", () => {
    const s = ship(open(flight), photos("q1"), read("q1"));
    const reply = landed(s);
    const asking = ship(s, { type: "requestClose" });
    expect(asking.closeAsk).toEqual({ unfinished: 1 });
    const late = ship(asking, reply);
    expect([late.view, late.activeItemId, late.closeAsk, late.closing, late.items[0].status, late.added.length, unaddedItem(late, "q1")])
      .toEqual(["confirm", "q1", { unfinished: 1 }, false, "added", 1, null]);
    const going = ship(late, { type: "cancelClose" });
    expect([going.view, unfinishedCount(going)]).toEqual(["confirm", 0]);
    expect(ship(going, { type: "requestClose" })).toMatchObject({ closing: true, closeAsk: null });
    // Search and back to the same confirm makes it stale too: no home, no close.
    const searched = ship(s, { type: "go", view: "search" }, { type: "back" }, reply);
    expect([searched.view, searched.closing, searched.items[0].status]).toEqual(["confirm", false, "added"]);
  });
  it("a stale add spends what it started from: the E1 pick it was made under, the lot step's lot, and the by-hand form whose save it was, edits made since included (wave C3 re-review P3)", () => {
    const e1 = ship(open(null), photos("i1"), read("i1"), { type: "adopt", destination: flight });
    const kept = ship(e1, { type: "requestClose" }, { type: "cancelClose" });
    expect([kept.view, kept.adopted]).toEqual(["confirm", flight]);
    const spent = ship(kept, landed(e1));
    expect([spent.view, spent.adopted, spent.items[0].status, spent.closing]).toEqual(["confirm", null, "added", false]);

    const row: AddSource = { kind: "catalog", catalogWineId: "c1", via: "search" };
    const atLot = ship(open({ kind: "cellar" }), { type: "go", view: "search" }, { type: "openLot", source: row });
    const lotReply = landed(atLot, { added: { label: "Vietti, Barolo 2017", destination: "cellar", catalogWineId: "c1", lotId: "l1" }, source: atLot.lot!.source });
    const again = ship(atLot, { type: "back" }, { type: "openLot", source: row });
    expect([again.view, again.lot === atLot.lot]).toEqual(["lot", true]);
    const lotLate = ship(again, lotReply);
    expect([lotLate.view, lotLate.lot, lotLate.added.length, lotLate.closing]).toEqual(["lot", null, 1, false]);

    const form = ship(open(flight), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: null }, { type: "byHandChange", draft: finished });
    const save = landed(form, { byHand: true, draft: form.byHand!.draft, source: { kind: "identity", draft: form.byHand!.draft, via: "byhand", readId: null } });
    const away = ship(form, { type: "back" });
    expect([away.view, away.byHand?.dirty]).toEqual(["camera", true]);
    expect(ship(away, save)).toMatchObject({ view: "camera", byHand: null, closing: false });
    // Back into the same form and typing during the save: that form saved its wine, so it ends too, rather than saving it twice.
    const edited = ship(away, { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    const lateEdit = ship(edited, save);
    expect([lateEdit.view, lateEdit.byHand, lateEdit.added.length, lateEdit.closing]).toEqual(["byhand", null, 1, false]);
  });
  it("a stale catalog write never opens the lot step, a stale load never opens By hand, and a stale refusal only records its message; current ones act", () => {
    const conf = ship(open({ kind: "cellar" }), photos("i1"), read("i1"));
    const lotReply: SheetAction = { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "scan" }, ticket: ticketFor(conf) };
    const formReply: SheetAction = { type: "openByHand", origin: { kind: "match", itemId: "i1" }, draft: finished, focusField: null, ticket: ticketFor(conf) };
    const refusal: SheetAction = { type: "addRefused", itemId: "i1", error: "Couldn't add the wine.", byHand: false, ticket: ticketFor(conf) };
    const moved = ship(conf, { type: "go", view: "search" });
    expect(ship(moved, lotReply)).toBe(moved);
    expect(ship(moved, formReply)).toBe(moved);
    expect([ship(conf, lotReply).view, ship(conf, formReply).view]).toEqual(["lot", "byhand"]);
    const refused = ship(moved, refusal);
    expect([refused.view, refused.items[0].error, refused.error]).toEqual(["search", "Couldn't add the wine.", "Couldn't add the wine."]);

    const closed = "This tasting is finished — reopen it to add wines.";
    const e1 = ship(open(null), photos("i1"), read("i1"), { type: "adopt", destination: flight });
    const refuse: SheetAction = { type: "addRefused", itemId: "i1", error: closed, byHand: false, ticket: ticketFor(e1) };
    const asked = ship(e1, { type: "requestClose" }, refuse);
    expect([asked.view, asked.adopted, asked.closeAsk, asked.items[0].error]).toEqual(["confirm", flight, { unfinished: 1 }, closed]);
    expect(ship(e1, refuse)).toMatchObject({ view: "choose", adopted: null, error: closed });
  });
  it("a glass save: current closes the Edit open (asking first while rows are unfinished); stale is recorded but never leaves the form or closes", () => {
    const edit = ship(initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: true }),
      { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: false }, draft: finished, focusField: null },
      { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    const saved = (s: SheetState): SheetAction => ({ type: "glassSaved", added: glass(3), ticket: ticketFor(s), draft: s.byHand!.draft, closeSheet: true });
    expect(ship(edit, saved(edit))).toMatchObject({ closing: true, byHand: null });
    const asking = ship(edit, { type: "requestClose" });
    expect(asking.closeAsk).toEqual({ unfinished: 1 });
    const late = ship(asking, saved(edit));
    expect([late.view, late.closing, late.closeAsk, late.byHand]).toEqual(["byhand", false, { unfinished: 1 }, null]);
    const withRow = ship(edit, { type: "back" }, photos("p1"), read("p1"), { type: "back" },
      { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: false }, draft: finished, focusField: null });
    expect([withRow.view, withRow.byHand?.draft.wineName, unfinishedCount(withRow)]).toEqual(["byhand", "Serraboella", 2]);
    expect(ship(withRow, saved(withRow))).toMatchObject({ closing: false, closeAsk: { unfinished: 1 }, byHand: null });
  });
  it("unaddedItem: a row an add may still start from, never a written or missing one", () => {
    const s = ship(open(flight), photos("q1"), read("q1"), { type: "back" }, photos("q2"), read("q2"), { type: "itemAdded", id: "q2", added: glass() });
    expect([unaddedItem(s, "q1")?.status, unaddedItem(s, "q2"), unaddedItem(s, "nope")]).toEqual(["read", null, null]);
  });
});

describe("a written bottle is never in hand, and a landed by-hand save ends its own form (plan amendment 23; wave C3 re-review P1–P3)", () => {
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2017, tawnyYears: null, read: true } };
  const complete: LabelPhotoRead = { ...partial, readId: "r16", missing: [], match: null, draft: finished, display: { ...partial.display, title: "Cigliuti, Barbaresco 2017" } };
  const photos = (...ids: string[]): SheetAction => ({ type: "enqueue", items: ids.map((id) => ({ id, photoUrl: `blob:${id}`, blob: new Blob() })) });
  const read = (id: string): SheetAction => ({ type: "itemRead", id, read: complete, stack: false });
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  const open = (destination: AddWineDestination | null, canScan = true) => initialSheetState({ destination, options: {}, canScan });
  const row = (catalogWineId: string): AddSource => ({ kind: "catalog", catalogWineId, via: "search" });
  const lotAdded = (catalogWineId: string, lotId: string): AddedWine => ({ label: "Vietti, Barolo 2017", destination: "cellar", catalogWineId, lotId });
  const glassAdded = (n: number, catalogWineId: string): AddedWine => ({ label: "Vietti, Barolo 2017", destination: "flight", catalogWineId, glass: n, wineId: `w${n}` });
  type Landed = Extract<SheetAction, { type: "addLanded" }>;
  /** The adds hook's reply to a call started on `at` (its contextFor): the ticket, the bottle in hand, the pick and the form's draft are all taken there. */
  const reply = (at: SheetState, added: AddedWine, source: AddSource, byHand = false): Landed => ({
    type: "addLanded", ticket: ticketFor(at), id: addTargetId(at), added, source, byHand,
    draft: byHand ? (at.byHand?.draft ?? null) : null, adopted: at.adopted, scanNext: false, warning: null,
  });

  it("P1 (phone cellar): after a stale lot add for the bottle, a row added from its search is a wine of its own — counted, its lot step spent, and the sheet lands", () => {
    const atLot = ship(open({ kind: "cellar" }), photos("i1"), read("i1"), { type: "go", view: "search" }, { type: "openLot", source: row("c2") });
    const first = reply(atLot, lotAdded("c2", "l1"), atLot.lot!.source);
    expect([atLot.view, first.ticket]).toEqual(["lot", { flow: 3, itemId: "i1", view: "lot" }]);
    const late = ship(atLot, { type: "requestClose" }, { type: "cancelClose" }, first);
    expect([late.view, late.lot, late.items[0].status, late.added.length]).toEqual(["lot", null, "added", 1]);
    // ← to the bottle's search: it still holds the screen, but it is written, so nothing started here names it.
    const search = ship(late, { type: "back" });
    expect([search.view, turnItemId(search), addTargetId(search)]).toEqual(["search", "i1", null]);
    const atLot2 = ship(search, { type: "openLot", source: row("c3") });
    const second = reply(atLot2, lotAdded("c3", "l2"), atLot2.lot!.source);
    expect([second.id, replyIsCurrent(atLot2, second.ticket)]).toEqual([null, true]);
    const landed = ship(atLot2, second);
    expect([landed.added.map((a) => a.lotId), footerCount(landed), landed.lot, landed.view, landed.closing]).toEqual([["l1", "l2"], 2, null, "camera", true]);
  });

  it("P2 (laptop flight): after a stale glass for the bottle, the laptop view it searched from adds the next row as a glass of its own, counted and landed home", () => {
    const searching = ship(open(flight, false), photos("i1"), read("i1"), { type: "go", view: "desktop" });
    expect([searching.view, addTargetId(searching)]).toEqual(["desktop", "i1"]);
    const first = reply(searching, glassAdded(4, "c2"), row("c2"));
    const late = ship(searching, { type: "back" }, { type: "go", view: "desktop" }, first);
    expect([late.view, late.items[0].status, late.added.length, addTargetId(late)]).toEqual(["desktop", "added", 1, null]);
    const landed = ship(late, reply(late, glassAdded(5, "c3"), row("c3")));
    expect([landed.added.map((a) => a.glass), footerCount(landed), landed.view, landed.history, landed.activeItemId, landed.closing]).toEqual([[4, 5], 2, "desktop", [], null, false]);
  });

  it("P3 (phone flight): a stale landing of a by-hand save ends the form it saved, edits made since included, so it cannot save the wine twice; a form opened afresh after Discard keeps its typing", () => {
    const form = ship(open(flight), { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: finished });
    const save = reply(form, glassAdded(4, "c9"), { kind: "identity", draft: form.byHand!.draft, via: "byhand", readId: null }, true);
    const edited = ship(form, { type: "back" }, { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    expect([edited.view, edited.byHand?.draft.wineName, edited.byHand?.dirty]).toEqual(["byhand", "Serraboella", true]);
    const late = ship(edited, save);
    expect([late.view, late.byHand, late.added.length, late.closing, late.closeAsk]).toEqual(["byhand", null, 1, false, null]);
    // Discard during the save, then By hand again: a new form for another wine, which the late landing leaves alone.
    const other = ship(form, { type: "byHandDiscard" }, { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Giacosa" } });
    const kept = ship(other, save);
    expect([kept.view, kept.byHand?.draft.wineName, kept.byHand?.dirty, kept.added.length, kept.closing]).toEqual(["byhand", "Giacosa", true, 1, false]);
  });

  it("P3 on a scanned bottle: Search → Add it by hand → save; ← and back into that form to edit during the write; the late landing adds the bottle and ends the form", () => {
    const at = ship(open(flight), photos("i1"), read("i1"), { type: "go", view: "search" },
      { type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "vintage" }, { type: "byHandChange", draft: finished });
    const save = reply(at, glassAdded(4, "c9"), { kind: "identity", draft: at.byHand!.draft, via: "byhand", readId: null }, true);
    expect(save.id).toBe("i1");
    const edited = ship(at, { type: "back" }, { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    const late = ship(edited, save);
    expect([late.view, late.byHand, late.items[0].status, addTargetId(late), late.added.length, late.closing]).toEqual(["byhand", null, "added", null, 1, false]);
  });

  it("a Fix form on the added bottle ends with a stale add of that bottle even when edited, as a current add ends it (itemAdded)", () => {
    const s = ship(open(flight), photos("i1"), read("i1"), { type: "go", view: "search" });
    const add = reply(s, glassAdded(4, "c2"), row("c2"));
    const fixing = ship(s, { type: "back" }, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: finished, focusField: null }, { type: "byHandChange", draft: { ...finished, wineName: "Serraboella" } });
    expect([fixing.view, fixing.byHand?.dirty, unfinishedCount(fixing)]).toEqual(["byhand", true, 1]);
    const late = ship(fixing, add);
    expect([late.view, late.byHand, late.items[0].status, unfinishedCount(late), late.closing]).toEqual(["byhand", null, "added", 0, false]);
  });

  it("an add reply naming a row already written is still recorded once, as a wine of its own, and never re-marks that row", () => {
    const s = ship(open(flight), photos("q1"), read("q1"), { type: "back" }, { type: "itemAdded", id: "q1", added: glassAdded(4, "c1") });
    expect(s.items[0].status).toBe("added");
    const stray: Landed = { ...reply(s, glassAdded(5, "c2"), row("c2")), id: "q1" };
    for (const next of [ship(s, stray), ship(s, { ...stray, ticket: { ...stray.ticket, flow: stray.ticket.flow - 1 } })]) {
      expect([next.added.map((a) => a.glass), next.items[0].added?.glass]).toEqual([[4, 5], 4]);
    }
  });
});

describe("model-based: late replies never act (plan amendment 23)", () => {
  type View = SheetState["view"];
  type Scenario = { destination: AddWineDestination | null; canScan: boolean; multi: boolean };
  /** One step of a tap: an action sent now, a server call starting (its reply is built, with its ticket, from the state it starts on), or more steps decided on the state reached. */
  type Entry =
    | { send: (s: SheetState) => SheetAction }
    | { issue: (s: SheetState, ticket: ReplyTicket) => SheetAction }
    | { expand: (s: SheetState) => Entry[] };
  const SEQUENCES = 1200;
  const STEPS = 50;
  const finished = { ...partial.draft, vintage: { kind: "YEAR" as const, year: 2016, tawnyYears: null, read: true } };
  const complete: LabelPhotoRead = { ...partial, readId: "r15", missing: [], match: null, draft: finished, display: { ...partial.display, title: "Cigliuti, Barbaresco 2016" } };
  const ORIGINS: readonly View[] = ["confirm", "choose", "followup"];
  const CHAIN: readonly View[] = ["byhand", "lot"];
  const ANOTHER_WINE: readonly View[] = ["camera", "desktop", "search", "cellar", "reading"];
  const RULE_7: readonly ScanItem["status"][] = ["pending", "failed", "read"];
  const STILL_READING: readonly ScanItem["status"][] = ["uploading", "reading"];

  /** mulberry32, as in the other model-based tests, so a failing seed replays exactly. */
  const prng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pickOne = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const ticketOf = (a: SheetAction): ReplyTicket | undefined => ("ticket" in a ? a.ticket : undefined);
  const isStale = (s: SheetState, a: SheetAction) => {
    const ticket = ticketOf(a);
    return ticket !== undefined && !replyIsCurrent(s, ticket);
  };
  const statusOf = (s: SheetState, id: string) => s.items.find((i) => i.id === id)?.status;
  const isWritten = (s: SheetState, id: string) => statusOf(s, id) === "added" || statusOf(s, id) === "incomplete";
  const sessionRowOf = (s: SheetState): string | null => {
    const origin = s.byHand?.origin;
    return origin?.kind === "item" || origin?.kind === "match" ? origin.itemId : null;
  };
  const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  /** Where each server call starts: a marker action (the hook's begin() clears the error line the same way) → the reply the call will send. Object identity survives shrinking. */
  const issuedReply = new WeakMap<SheetAction, SheetAction>();
  /** Replies to calls a by-hand form's save started: saveByHand, and the lot step or chooser that save opened (the hook's continuesByHand). Object identity survives shrinking. */
  const formSaves = new WeakSet<SheetAction>();
  /** The model's own by-hand form identity key: the reducer reuses a form of the same origin (rule 1). */
  const originKey = (o: NonNullable<SheetState["byHand"]>["origin"]) =>
    o.kind === "glass" ? `glass:${o.wineId}` : o.kind === "new" ? "new" : `${o.kind}:${o.itemId}`;
  /** What a sequence's first replay also counts: the shapes the wave C3 re-review found (P1, P2: a call started over a written bottle; P3: a stale form save). */
  type FormCoverage = { writtenHolderCalls: number; staleFormLandings: number; staleFormEditedSince: number; freshFormKept: number };
  /** The amendment's user steps, counted by the model on its own rather than through `flow`: these types whenever they change the sheet, and a photo, Retry or Rescan only when it takes the screen. */
  const MODEL_MOVES: readonly SheetAction["type"][] = ["go", "back", "openByHand", "openLot", "choose", "byHandDiscard", "byHandLeftForLater", "lotSkipped", "followUpDone", "requestClose", "cancelClose", "discardAndClose"];
  const MODEL_MOVES_ON_SCREEN: readonly SheetAction["type"][] = ["enqueue", "itemRetry", "itemRemove"];
  const userMoved = (prev: SheetState, next: SheetState, a: SheetAction) =>
    next !== prev && ticketOf(a) === undefined && (MODEL_MOVES.includes(a.type)
      || (MODEL_MOVES_ON_SCREEN.includes(a.type) && (next.view !== prev.view || next.activeItemId !== prev.activeItemId || !sameList(next.history, prev.history))));
  /** The lot step or chooser on screen was opened by the by-hand form's save (the hook's continuesByHand). */
  const continuesByHand = (s: SheetState) => {
    if (s.byHand === null || (s.view !== "lot" && s.view !== "choose")) return false;
    return [...s.history].reverse().find((v) => v !== "lot" && v !== "choose" && v !== "reading") === "byhand";
  };
  const readSourceOf = (r: () => number, item: ScanItem): AddSource =>
    r() < 0.3
      ? { kind: "catalog", catalogWineId: "c8", via: "scan" }
      : { kind: "identity", draft: item.draft ?? item.read?.draft ?? partial.draft, via: "scan", readId: item.read?.readId ?? null };

  /** One tap, turned into steps the way the adds hook and the shell do. `busy`: a server call is running, so every write waits (the hook's busyRef). */
  function tap(r: () => number, s: SheetState, fresh: () => string, busy: boolean): Entry[] {
    const inHand = addTargetId(s);
    const destination = currentDestination(s);
    const home: View = s.canScan === false ? "desktop" : "camera";
    const searchView: View = s.canScan === false ? "desktop" : "search";
    const now = (a: SheetAction): Entry => ({ send: () => a });
    const refusal = (ticket: ReplyTicket, byHand: boolean): SheetAction =>
      ({ type: "addRefused", itemId: ticket.itemId, error: "Couldn't add the wine.", missing: byHand && r() < 0.5 ? ["vintage"] : undefined, byHand, ticket });
    const landed = (at: SheetState, ticket: ReplyTicket, source: AddSource, byHand: boolean, scanNext: boolean): SheetAction => {
      const d = currentDestination(at);
      const kind = d === null || d.kind === "note" ? "catalog" : d.kind;
      const added: AddedWine = { label: "Vietti, Barolo 2017", destination: kind, catalogWineId: "c1", ...(kind === "flight" ? { glass: 4, wineId: "w4" } : kind === "cellar" ? { lotId: "l1" } : { written: r() < 0.5 }) };
      return {
        type: "addLanded", ticket, id: ticket.itemId, added, source, byHand, draft: byHand ? (at.byHand?.draft ?? null) : null,
        adopted: at.adopted, scanNext, warning: r() < 0.15 ? "Added — but the bottle is still counted in your cellar." : null,
      };
    };
    /** runAdd: what the hook does with routeAdd's answer on the state `at` the add starts on. */
    const add = (at: SheetState, source: AddSource, byHand = false, scanNext = false): Entry[] => {
      if (busy) return [];
      const saved = (reply: SheetAction): SheetAction => {
        if (byHand) formSaves.add(reply);
        return reply;
      };
      switch (routeAdd(at, source).next) {
        case "choose":
          return [now({ type: "choose", source, itemId: addTargetId(at), title: "Vietti, Barolo 2017", missing: [] })];
        case "lot":
          return [now({ type: "openLot", source })];
        case "catalog-then-lot":
          return [{ issue: (_st, ticket) => saved(r() < 0.8 ? { type: "openLot", source: { kind: "catalog", catalogWineId: "c5", via: "search" }, ticket } : refusal(ticket, byHand)) }];
        case "note": {
          const plan = notePickPlan(source);
          switch (plan.kind) {
            case "pick":
              return [{ send: (st) => ({ type: "notePicked", pick: plan.pick, itemId: addTargetId(st), fromForm: byHand, ticket: ticketFor(st) }) }];
            case "by-hand-first": {
              const id = addTargetId(at);
              return [now({ type: "openByHand", origin: id !== null ? { kind: "item", itemId: id } : { kind: "new" }, draft: plan.draft, focusField: null })];
            }
            case "error":
              return [{ send: (st) => ({ type: "addRefused", itemId: addTargetId(st), error: plan.error, byHand, ticket: ticketFor(st) }) }];
            case "catalog-first":
              return [{ issue: (_st, ticket) => saved(r() < 0.8 ? { type: "notePicked", pick: { catalogWineId: "c6" }, itemId: ticket.itemId, fromForm: byHand, ticket } : refusal(ticket, byHand)) }];
          }
          return [];
        }
        case "write":
          return [{ issue: (st, ticket) => saved(r() < 0.75 ? landed(st, ticket, source, byHand, scanNext) : refusal(ticket, byHand)) }];
      }
    };
    /** choose(): the pick, then By hand for a draft with gaps (E1), or the add on the state the pick reached. */
    const pickFor = (source: AddSource | null): Entry[] => {
      if (busy || source === null) return [];
      const chosen = pickOne(r, [flight, { kind: "cellar" }, { kind: "catalog" }, { kind: "note" }] as const);
      const draft = source.kind === "identity" ? source.draft : null;
      return [
        now({ type: "adopt", destination: chosen }),
        {
          expand: (at) => {
            // The hook's contextFor: a pick on the chooser a form's save opened continues that save.
            if (draft === null || missingWineFields(draft).length === 0) return add(at, source, continuesByHand(at));
            const id = addTargetId(at);
            return [now({ type: "openByHand", origin: id !== null ? { kind: "item", itemId: id } : { kind: "new" }, draft, focusField: null })];
          },
        },
      ];
    };
    const active = s.activeItemId === null ? null : unaddedItem(s, s.activeItemId);
    const fixable = s.items.filter((i) => i.status === "read" || i.status === "pending").map((i) => i.id);
    const ids = s.items.map((i) => i.id);
    let here: (() => Entry[])[] = [];
    switch (s.view) {
      case "camera":
      case "desktop":
      case "search":
      case "cellar":
        here = [
          () => add(s, pickOne<AddSource>(r, [{ kind: "catalog", catalogWineId: "c2", via: "search" }, { kind: "lot", lotId: "l2", consume: true, catalogWineId: "c2" }])),
          () => [now({ type: "go", view: s.canScan === false ? "cellar" : pickOne(r, ["search", "cellar"] as const) })],
          () => [now({ type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: "producer" })],
          () => (fixable.length > 0 ? [now({ type: "openByHand", origin: { kind: "item", itemId: pickOne(r, fixable) }, draft: partial.draft, focusField: "vintage" })] : []),
          // openEdit's form, once its glass loads.
          () => (s.requested?.kind === "flight" ? [now({ type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: r() < 0.5 }, draft: finished, focusField: null })] : []),
        ];
        break;
      case "reading":
        here = [
          () => [now({ type: "itemRead", id: s.activeItemId ?? "p0", read: r() < 0.5 ? complete : partial, stack: false })],
          () => [now({ type: "itemFailed", id: s.activeItemId ?? "p0" })],
        ];
        break;
      case "confirm":
        here = [
          () => {
            // The primary, or E1's rows with no destination.
            if (busy || active === null || active.read === null) return [];
            const draft = active.draft ?? active.read.draft;
            if (s.requested === null && s.adopted === null) return pickFor(readSourceOf(r, active));
            if (missingWineFields(draft).length > 0) return [now({ type: "openByHand", origin: { kind: "item", itemId: active.id }, draft, focusField: null })];
            return add(s, readSourceOf(r, active), false, r() < 0.2);
          },
          () => [now({ type: "go", view: searchView })],
          () => {
            // By hand: on a matched read the form opens once the catalog wine loads.
            if (active === null) return [];
            if (busy || r() < 0.5) return [now({ type: "openByHand", origin: { kind: "item", itemId: active.id }, draft: active.draft ?? partial.draft, focusField: null })];
            return [{ issue: (_st, ticket) => ({ type: "openByHand", origin: { kind: "match", itemId: active.id }, draft: finished, focusField: null, ticket }) }];
          },
          () => (s.activeItemId !== null ? [now({ type: "itemRemove", id: s.activeItemId })] : []),
        ];
        break;
      case "choose":
        here = [() => (s.adopted === null ? pickFor(s.chooseFor?.source ?? (active !== null && active.read !== null ? readSourceOf(r, active) : null)) : [])];
        break;
      case "byhand":
        here = [
          () => {
            // saveByHand, or a glass's save.
            const session = s.byHand;
            if (busy || session === null) return [];
            if (session.origin.kind === "glass") {
              const wineId = session.origin.wineId;
              const closeSheet = r() < 0.5;
              return [{
                issue: (st, ticket) => (r() < 0.8
                  ? { type: "glassSaved", added: { label: "Vietti, Barolo 2017", destination: "flight", catalogWineId: "c3", glass: 3, wineId }, ticket, draft: st.byHand?.draft, closeSheet }
                  : refusal({ ...ticket, itemId: null }, true)),
              }];
            }
            const row = sessionRowOf(s);
            if (row !== null && unaddedItem(s, row) === null) return [];
            const gaps = missingWineFields(session.draft);
            if (gaps.length > 0) return [now({ type: "byHandAttempted", focusField: gaps[0] })];
            const saves = add(s, { kind: "identity", draft: session.draft, via: session.origin.kind === "new" ? "byhand" : "scan", readId: null }, true);
            if (saves.length === 0 || r() < 0.3) return saves;
            // While the save runs (wave C3 re-review P3): ← and straight back into the same form, or Discard and By hand for
            // another wine — then typing there, before the reply comes.
            const meanwhile: Entry[] = r() < 0.6
              ? [now({ type: "back" }), { expand: (at) => (at.view === "byhand" || at.byHand === null ? [] : [now({ type: "openByHand", origin: at.byHand.origin, draft: partial.draft, focusField: null })]) }]
              : [now({ type: "byHandDiscard" }), { expand: (at) => (at.view === "byhand" ? [] : [now({ type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: null })]) }];
            return [...saves, ...meanwhile, { expand: (at) => (at.view === "byhand" && at.byHand !== null ? [now({ type: "byHandChange", draft: { ...finished, wineName: `wine ${fresh()}` } })] : []) }];
          },
          () => [now({ type: "byHandChange", draft: { ...finished, wineName: `wine ${fresh()}` } })],
          () => [now({ type: "go", view: searchView })],
          () => [now({ type: "byHandDiscard" })],
          () => (s.byHand !== null && s.byHand.origin.kind !== "glass" ? [now({ type: "byHandLeftForLater", rowId: fresh() })] : []),
          // ← and straight back into the same form (its origin reopens the same session, rule 1).
          () => {
            const origin = s.byHand?.origin;
            if (origin === undefined) return [];
            return [now({ type: "back" }), { expand: (at) => (at.view === "byhand" ? [] : [now({ type: "openByHand", origin, draft: partial.draft, focusField: null })]) }];
          },
          // Discard, then By hand again: a new form, for another wine.
          () => [now({ type: "byHandDiscard" }), { expand: (at) => (at.view === "byhand" ? [] : [now({ type: "openByHand", origin: { kind: "new" }, draft: partial.draft, focusField: null })]) }],
        ];
        break;
      case "lot":
        here = [
          () => {
            // lotAdd.
            const lot = s.lot;
            if (busy || lot === null || destination?.kind !== "cellar") return [];
            const byHand = continuesByHand(s);
            return [{
              issue: (st, ticket) => {
                const reply = r() < 0.75 ? landed(st, ticket, lot.source, byHand, false) : refusal(ticket, byHand);
                if (byHand) formSaves.add(reply);
                return reply;
              },
            }];
          },
          () => (busy || s.lot === null ? [] : [now({ type: "lotSkipped", itemId: inHand, lotId: "l9" })]),
          () => [now({ type: "lotField", field: "rack", value: "B" })],
        ];
        break;
      case "followup": {
        const followUp = s.followUp;
        here = [
          () => (busy || followUp === null ? [] : [now({ type: "adopt", destination: { kind: "cellar" } }), now({ type: "openLot", source: { kind: "catalog", catalogWineId: followUp.catalogWineId, via: "search" } })]),
          () => [now({ type: "followUpDone" })],
          () => (followUp === null ? [] : [{ send: (st) => ({ type: "notePicked", pick: { catalogWineId: followUp.catalogWineId }, itemId: addTargetId(st), fromForm: false, ticket: ticketFor(st) }) }]),
        ];
        break;
      }
    }
    const anywhere: (() => Entry[])[] = [
      () => [now({ type: "back" })],
      () => [now({ type: "back" })],
      () => [now({ type: "go", view: home })],
      () => [now({ type: "enqueue", items: [{ id: fresh(), photoUrl: "blob:p", blob: new Blob() }] })],
      () => [now({ type: "itemUploaded", id: ids.length > 0 ? pickOne(r, ids) : "p0", imagePath: "catalog/staging/u/p.jpg" })],
      () => [now({ type: "itemRead", id: ids.length > 0 ? pickOne(r, ids) : "p0", read: r() < 0.5 ? complete : partial, stack: s.multi && r() < 0.5 })],
      () => [now({ type: "itemFailed", id: ids.length > 0 ? pickOne(r, ids) : "p0" })],
      () => [now({ type: "setMulti", multi: r() < 0.3 })],
      () => (r() < 0.2 ? [now({ type: "canScanResolved", canScan: r() < 0.5 })] : []),
      () => (r() < 0.5 ? [now({ type: "requestClose" })] : []),
      () => (s.closeAsk !== null ? [now({ type: "cancelClose" })] : []),
      () => (s.closeAsk !== null ? [now({ type: "cancelClose" })] : []),
      () => (s.closeAsk !== null && r() < 0.15 ? [now({ type: "discardAndClose" })] : []),
    ];
    return pickOne(r, [...here, ...here, ...anywhere])();
  }

  /** An adoption lives only on the view it was made on, with the same bottle in hand, or on a by-hand form or lot step opened on top of it. */
  const outlived = (prev: SheetState, next: SheetState): string | null => {
    if (next.adopted === null) return null;
    const move = `${prev.view} → ${next.view} (history ${next.history.join(" · ") || "empty"})`;
    if (ANOTHER_WINE.includes(next.view)) return `the pick survived onto a view that starts another wine's add: ${move}`;
    if (ORIGINS.includes(next.view) && (next.view !== prev.view || next.activeItemId !== prev.activeItemId)) return `the pick survived a move onto another ${next.view}: ${move}`;
    if (CHAIN.includes(next.view) && !CHAIN.includes(prev.view) && !ORIGINS.includes(prev.view)) return `the pick survived onto a ${next.view} it did not open: ${move}`;
    if (CHAIN.includes(next.view) && !next.history.some((view) => ORIGINS.includes(view))) return `the pick survived below where it was made: ${move}`;
    return null;
  };

  /** Replays `actions` through reduceSheet and returns the first broken rule, or null. */
  function violation(sc: Scenario, actions: readonly SheetAction[], seen?: FormCoverage): string | null {
    let s = initialSheetState({ destination: sc.destination, options: { multi: sc.multi }, canScan: sc.canScan });
    /** Each open call's reply → the user steps that moved or closed the sheet since its call started, counted by the model. */
    const since = new Map<SheetAction, number>();
    /** The model's by-hand form identity: a form starts when one appears or its origin changes, and ends when none is open. */
    let formSeq = 0;
    let form: number | null = null;
    /** Each form save's reply → the form it was made on; and the forms whose save landed. */
    const savedOn = new Map<SheetAction, number | null>();
    const landedForms = new Set<number>();
    for (const [n, a] of actions.entries()) {
      const prev = s;
      s = reduceSheet(prev, a);
      const formBefore: number | null = form;
      if (s.byHand === null) form = null;
      else if (prev.byHand === null || form === null || originKey(prev.byHand.origin) !== originKey(s.byHand.origin)) form = ++formSeq;
      const ticket = ticketOf(a);
      const steps = since.get(a);
      // The model's own verdict; a reply whose call-start marker was shrunk away has none, and the reducer's is used.
      const modelStale = ticket === undefined || steps === undefined
        ? undefined
        : steps > 0 || (ticket.view !== prev.view && ticket.view !== "resolving") || ticket.itemId !== addTargetId(prev);
      const stale = modelStale ?? isStale(prev, a);
      const at = `after action ${n + 1} (${a.type}${ticket ? (stale ? ", stale" : ", current") : ""})`;
      if (modelStale !== undefined && modelStale !== isStale(prev, a)) {
        return `${at}: replyIsCurrent says ${modelStale ? "current" : "stale"}, but ${steps} user step(s) moved or closed the sheet since its call started, and ${prev.view} is up with ${addTargetId(prev) ?? "no bottle"} in hand (ticket ${JSON.stringify(ticket)})`;
      }
      if (stale) {
        if (s.view !== prev.view || !sameList(s.history, prev.history)) return `${at}: a stale reply moved the sheet (${prev.view} → ${s.view})`;
        if (s.closing !== prev.closing) return `${at}: a stale reply closed the sheet`;
        if (s.closeAsk !== prev.closeAsk) return `${at}: a stale reply changed the close-ask (${JSON.stringify(prev.closeAsk)} → ${JSON.stringify(s.closeAsk)})`;
        if ((prev.lot === null && s.lot !== null) || (prev.chooseFor === null && s.chooseFor !== null) || s.followUp !== prev.followUp) return `${at}: a stale reply opened a lot step, a chooser or D3`;
        if ((a.type === "notePicked" || a.type === "openLot" || a.type === "openByHand") && s !== prev) return `${at}: a stale ${a.type} changed the sheet`;
      }
      const inHand = addTargetId(s);
      if (inHand !== null && isWritten(s, inHand)) return `${at}: ${inHand} is already written (${statusOf(s, inHand)}), yet an add starting now would name it (${s.view})`;
      if (a.type === "addLanded") {
        const was = a.id === null ? undefined : prev.items.find((i) => i.id === a.id);
        if (was !== undefined && !isWritten(prev, was.id) && !isWritten(s, was.id)) return `${at}: ${was.id}'s add landed, but its row is ${statusOf(s, was.id) ?? "gone"}`;
        // Every write that came back ok is one wine on the server: the sheet records exactly one (amendment 23).
        if (s.added.length !== prev.added.length + 1) {
          return `${at}: a${stale ? " stale" : " current"} add for ${a.id ?? "no bottle"}${was !== undefined && isWritten(prev, was.id) ? ", already written," : ""} wrote on the server, but the sheet counted it ${s.added.length - prev.added.length} time(s) (added ${prev.added.length} → ${s.added.length}, view ${prev.view} → ${s.view})`;
        }
        if (!stale && (s.lot !== null || s.chooseFor !== null || s.adopted !== null)) {
          return `${at}: a current add left what it started from live (lot ${s.lot ? "open" : "none"}, chooser ${s.chooseFor ? "open" : "none"}, pick ${s.adopted?.kind ?? "none"})`;
        }
        // An add ends only the form whose save it was, or a form for the bottle it added: never another wine's typing.
        if (formBefore !== null && form !== formBefore) {
          const own = formSaves.has(a) && (savedOn.get(a) === undefined || savedOn.get(a) === formBefore);
          if (!own && !(a.id !== null && sessionRowOf(prev) === a.id)) {
            return `${at}: the add ended by-hand form #${formBefore} (${originKey(prev.byHand!.origin)}${prev.byHand!.dirty ? ", typed in" : ""}), which is neither the form whose save it was${formSaves.has(a) ? ` (#${savedOn.get(a)})` : ""} nor a form for the bottle it added`;
          }
        }
        if (formSaves.has(a)) {
          const on = savedOn.get(a);
          if (on !== undefined && on !== null) {
            landedForms.add(on);
            if (form === on) return `${at}: by-hand form #${on} saved its wine (its add landed ${stale ? "stale" : "current"}), yet it is still open on ${s.view}`;
          }
          if (seen !== undefined && stale) {
            seen.staleFormLandings++;
            if (on !== undefined && on === formBefore && prev.byHand !== null && prev.byHand.draft !== a.draft) seen.staleFormEditedSince++;
            if (on !== undefined && formBefore !== null && formBefore !== on && form === formBefore) seen.freshFormKept++;
          }
        }
      }
      if (a.type === "addRefused") {
        if (s.error !== a.error) return `${at}: the refusal's message is not shown`;
        if (a.itemId !== null && statusOf(prev, a.itemId) !== undefined && s.items.find((i) => i.id === a.itemId)?.error !== a.error) return `${at}: the refusal's message is not on ${a.itemId}`;
      }
      if (!prev.closing && s.closing && a.type !== "discardAndClose") {
        const left = (statuses: readonly ScanItem["status"][]) => s.items.filter((i) => statuses.includes(i.status));
        if (a.type === "notePicked") {
          const others = left([...RULE_7, ...STILL_READING]).filter((i) => i.id !== a.itemId);
          if (others.length > 0) return `${at}: the note pick closed the sheet over ${others.map((i) => `${i.id} (${i.status})`).join(", ")}`;
          if (prev.byHand?.dirty && !a.fromForm && sessionRowOf(prev) !== a.itemId) return `${at}: the note pick closed the sheet over a dirty form`;
        } else {
          const over = left(a.type === "addLanded" ? [...RULE_7, ...STILL_READING] : RULE_7);
          if (over.length > 0) return `${at}: the sheet closed over ${over.map((i) => `${i.id} (${i.status})`).join(", ")}`;
          if (unfinishedCount(s) > 0) return `${at}: the sheet closed over a dirty form`;
        }
      }
      const broken = outlived(prev, s);
      if (broken !== null) return `${at}: ${broken}`;
      if (userMoved(prev, s, a)) for (const [reply, count] of since) since.set(reply, count + 1);
      const issued = issuedReply.get(a);
      if (issued !== undefined) {
        // The model counts from here only while the reply's ticket matches the sheet here. A shrunk replay can keep a
        // marker whose earlier steps are gone; its reply then falls back on the reducer's verdict, so shrinking stays
        // on the rule that broke instead of drifting into a ticket that no longer fits the replay.
        const issuedTicket = ticketOf(issued);
        if (issuedTicket === undefined || (issuedTicket.flow === s.flow && issuedTicket.view === s.view)) since.set(issued, 0);
        if (formSaves.has(issued)) {
          if (form !== null && landedForms.has(form)) return `${at}: by-hand form #${form} already saved its wine, yet it started another save`;
          savedOn.set(issued, form);
        }
        const holder = turnItemId(s);
        if (seen !== undefined && holder !== null && isWritten(s, holder)) seen.writtenHolderCalls++;
      }
      since.delete(a);
    }
    return null;
  }

  /** Drops actions one at a time while the sequence still breaks a rule. */
  function shrink(sc: Scenario, actions: readonly SheetAction[]): readonly SheetAction[] {
    let current = actions;
    for (let changed = true; changed;) {
      changed = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const candidate = [...current.slice(0, i), ...current.slice(i + 1)];
        if (violation(sc, candidate) !== null) {
          current = candidate;
          changed = true;
        }
      }
    }
    return current;
  }

  /** The replay, one action per line, each reply marked stale or current where it is delivered. */
  function replay(sc: Scenario, actions: readonly SheetAction[]): string[] {
    const show = (a: SheetAction) => JSON.stringify(a, (key, value) => (key === "blob" ? "Blob" : key === "read" || key === "draft" ? "…" : value));
    let s = initialSheetState({ destination: sc.destination, options: { multi: sc.multi }, canScan: sc.canScan });
    return actions.map((a) => {
      const tag = issuedReply.has(a) ? "   ← a server call starts (its reply comes later)" : ticketOf(a) ? (isStale(s, a) ? "   ← stale reply" : "   ← current reply") : "";
      s = reduceSheet(s, a);
      return `${show(a)}${tag}`;
    });
  }

  it(`holds over ${SEQUENCES} seeded sequences, each reply delivered at a random later step`, () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coverage = {
      replies: 0, stale: 0, staleLanded: 0, staleRefused: 0, staleNote: 0, staleLot: 0, staleForm: 0, staleGlass: 0,
      staleUnderAsk: 0, staleOnSameScreen: 0, noteAsks: 0, noteAskEndedPickKept: 0, closes: 0,
    };
    const forms: FormCoverage = { writtenHolderCalls: 0, staleFormLandings: 0, staleFormEditedSince: 0, freshFormKept: 0 };
    try {
      for (let seed = 1; seed <= SEQUENCES; seed++) {
        const r = prng(seed);
        const sc: Scenario = {
          destination: pickOne(r, [null, null, flight, flight, { kind: "cellar" }, { kind: "cellar" }, { kind: "catalog" }, { kind: "note" }, { kind: "note" }] as const),
          canScan: r() < 0.55,
          multi: r() < 0.2,
        };
        let s = initialSheetState({ destination: sc.destination, options: { multi: sc.multi }, canScan: sc.canScan });
        let photos = 0;
        let pending: SheetAction | null = null;
        const trail: SheetAction[] = [];
        const apply = (a: SheetAction) => {
          const prev = s;
          trail.push(a);
          s = reduceSheet(prev, a);
          if (ticketOf(a)) {
            coverage.replies++;
            if (isStale(prev, a)) {
              coverage.stale++;
              if (a.type === "addLanded") coverage.staleLanded++;
              if (a.type === "addRefused") coverage.staleRefused++;
              if (a.type === "notePicked") coverage.staleNote++;
              if (a.type === "openLot") coverage.staleLot++;
              if (a.type === "openByHand") coverage.staleForm++;
              if (a.type === "glassSaved") coverage.staleGlass++;
              if (prev.closeAsk !== null) coverage.staleUnderAsk++;
              const ticket = ticketOf(a)!;
              if (ticket.view === prev.view && ticket.itemId === addTargetId(prev)) coverage.staleOnSameScreen++;
            }
          }
          if (s.closeAsk?.note !== undefined && prev.closeAsk?.note === undefined) coverage.noteAsks++;
          if (prev.closeAsk?.note !== undefined && s.closeAsk === null && !s.closing && s.adopted?.kind === "note") coverage.noteAskEndedPickKept++;
          if (s.closing && !prev.closing) coverage.closes++;
        };
        for (let n = 0; n < STEPS && !s.closing; n++) {
          if (pending !== null && r() < 0.2) {
            const reply: SheetAction = pending;
            pending = null;
            apply(reply);
            continue;
          }
          let entries = tap(r, s, () => `p${++photos}`, pending !== null);
          while (entries.length > 0 && !s.closing) {
            const entry = entries.shift()!;
            if ("expand" in entry) entries = [...entry.expand(s), ...entries];
            else if ("issue" in entry) {
              if (pending === null) {
                // The call starts here; the model marks where, so its oracle can count the steps since.
                const marker: SheetAction = { type: "error", error: s.error };
                apply(marker);
                pending = entry.issue(s, ticketFor(s));
                issuedReply.set(marker, pending);
              }
            }
            else apply(entry.send(s));
          }
        }
        if (pending !== null && !s.closing) apply(pending);
        if (violation(sc, trail, forms) !== null) {
          const minimal = shrink(sc, trail);
          throw new Error([
            `seed ${seed} · destination ${sc.destination?.kind ?? "none"} · canScan ${sc.canScan} · multi ${sc.multi}`,
            `violated: ${violation(sc, minimal)}`,
            `minimal replay (${minimal.length} of ${trail.length} actions):`,
            ...replay(sc, minimal),
          ].join("\n"));
        }
      }
    } finally {
      warn.mockRestore();
    }
    // The generator must actually deliver late replies where the rules are about.
    const seen = JSON.stringify({ ...coverage, ...forms });
    expect(coverage.stale, seen).toBeGreaterThan(250);
    expect(coverage.staleLanded, seen).toBeGreaterThan(150);
    expect(coverage.staleRefused, seen).toBeGreaterThan(50);
    expect(coverage.staleNote, seen).toBeGreaterThan(6);
    expect(coverage.staleLot, seen).toBeGreaterThan(8);
    expect(coverage.staleForm, seen).toBeGreaterThan(25);
    expect(coverage.staleGlass, seen).toBeGreaterThan(10);
    expect(coverage.staleUnderAsk, seen).toBeGreaterThan(25);
    expect(coverage.staleOnSameScreen, seen).toBeGreaterThan(60);
    expect(coverage.noteAsks, seen).toBeGreaterThan(55);
    expect(coverage.noteAskEndedPickKept, seen).toBeGreaterThan(2);
    expect(coverage.closes, seen).toBeGreaterThan(200);
    // Wave C3 re-review: calls started over a bottle a stale reply already wrote (P1, P2), stale form saves landing on
    // their own form edited since (P3), and on a form opened afresh after Discard, which stays.
    expect(forms.writtenHolderCalls, seen).toBeGreaterThan(9);
    expect(forms.staleFormLandings, seen).toBeGreaterThan(9);
    expect(forms.staleFormEditedSince, seen).toBeGreaterThan(2);
    expect(forms.freshFormKept, seen).toBeGreaterThan(4);
  });
});
