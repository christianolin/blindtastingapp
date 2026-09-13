import { describe, expect, it, vi } from "vitest";
import type { LabelPhotoRead } from "@/app/scan/actions";
import { emptyDraft } from "../../lib/wine-identity/complete";
import { sheetMatrix } from "./matrix";
import {
  addTargetId, currentDestination, footerCount, initialSheetState, itemRowCopy, markAddedInFlight, routeAdd, sheetReducer, stackPartialRead, turnItemId, unfinishedCount,
  type ScanItem, type SheetAction, type SheetState,
} from "./sheet-state";
import type { AddSource, AddWineDestination, AddedWine, SearchGroups } from "./types";

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
