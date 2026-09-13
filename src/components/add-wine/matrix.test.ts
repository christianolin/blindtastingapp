import { describe, expect, it } from "vitest";
import { flightHintSubtitle, sheetMatrix } from "./matrix";
import type { AddWineDestination } from "./types";

const flight: AddWineDestination = { kind: "flight", tastingId: "t1", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 4 };
const dest = { flight, cellar: { kind: "cellar" }, note: { kind: "note" }, catalog: { kind: "catalog" }, none: null } as const;
type K = keyof typeof dest;
const all: K[] = ["flight", "cellar", "note", "catalog", "none"];
const m = (k: K, canScan: boolean) => sheetMatrix(dest[k] as AddWineDestination | null, canScan);

describe("header, camera, search field", () => {
  it.each([
    ["flight", true, "Barolo night", "Add wine · glass 4", "Add wine · glass 4", "Adding to the flight"],
    ["flight", false, "Barolo night · blind", "Add wine · glass 4", "Add wine · glass 4", "Adding to the flight"],
    ["cellar", true, "Cellar", "Add a bottle", "Add a bottle", "Adding to the cellar"],
    ["note", true, "Taste & rate", "Which wine?", "Which wine?", null],
    ["note", false, "Taste & rate", "Which wine are you tasting?", "Which wine are you tasting?", null],
    ["catalog", false, "Catalog", "Add a wine", "Add a wine", "Adding to the catalog"],
    ["none", true, null, "Scan", "Scanned", "Adding wines"],
    ["none", false, null, "Add wine", "Add wine", "Adding wines"],
  ] as const)("%s canScan=%s", (k, canScan, eyebrow, home, read, multiTitle) => {
    const x = m(k, canScan);
    expect([x.eyebrow, x.title("home"), x.title("read"), x.multiTitle, x.home]).toEqual([eyebrow, home, read, multiTitle, canScan ? "camera" : "desktop"]);
    expect(x.searchPlaceholder).toBe(canScan ? "Or search wine catalog" : "Search by producer, wine or appellation");
  });
  it("laptop eyebrow names the reveal mode", () => {
    expect(sheetMatrix({ ...flight, revealMode: "SEMI_BLIND" }, false).eyebrow).toBe("Barolo night · semi-blind");
    expect(sheetMatrix({ ...flight, revealMode: "OPEN" }, false).eyebrow).toBe("Barolo night · open");
  });
  it.each([
    ["flight", ["cellar", "byhand"], true, "↵ adds the first hit"],
    ["cellar", ["byhand"], true, "↵ adds the first hit"],
    ["note", ["cellar", "byhand"], false, "↵ opens a note on the first hit"],
    ["catalog", ["byhand"], true, "↵ opens the first hit"],
    ["none", ["cellar", "byhand"], true, "↵ adds the first hit"],
  ] as const)("%s chips, Many, Enter hint", (k, chips, showMany, hint) => {
    expect([m(k, true).chips, m(k, true).showMany, m(k, false).enterHint]).toEqual([chips, showMany, hint]);
  });
  it("flight hint subtitles (entry-4)", () => {
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "live" })).toBe("Barolo night, live now");
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "self-paced" })).toBe("Barolo night, in progress");
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "next" })).toBe("Barolo night, next up");
  });
});

describe("search and rows", () => {
  const row = (k: K, source: "lot" | "catalog" | "tasted", o: { inFlight?: boolean; owned?: boolean } = {}) =>
    m(k, false).row({ source, inFlight: o.inFlight ?? false, owned: o.owned ?? false });
  it("groups", () => all.forEach((k) => expect(m(k, true).searchGroups).toEqual(k === "catalog" ? ["catalog", "tasted"] : ["cellar", "catalog", "tasted"])));
  it("row labels and actions (D9)", () => {
    expect(row("flight", "lot")).toEqual({ label: "Add as glass 4", action: "add", disabled: false, affordance: "plus" });
    expect(row("flight", "catalog", { inFlight: true })).toEqual({ label: "In flight", action: "add", disabled: true, affordance: "plus" });
    expect(row("cellar", "lot", { owned: true })).toEqual({ label: "+1 bottle", action: "plusOne", disabled: false, affordance: "plus" });
    expect(row("cellar", "catalog")).toEqual({ label: "Add to cellar", action: "add", disabled: false, affordance: "plus" });
    expect(row("note", "tasted")).toEqual({ label: "Start the note", action: "pick", disabled: false, affordance: "chevron" });
    expect(row("catalog", "catalog")).toEqual({ label: "Open", action: "open", disabled: false, affordance: "chevron" });
    expect(row("none", "lot")).toEqual({ label: "Add", action: "choose", disabled: false, affordance: "plus" });
  });
  it("cellar rows decide by source alone: only a lot row is +1 bottle (C.2, C.5 B3)", () => {
    expect(row("cellar", "lot")).toEqual({ label: "+1 bottle", action: "plusOne", disabled: false, affordance: "plus" });
    expect(row("cellar", "catalog", { owned: true })).toEqual({ label: "Add to cellar", action: "add", disabled: false, affordance: "plus" });
    expect(row("cellar", "tasted", { owned: true })).toEqual({ label: "Add to cellar", action: "add", disabled: false, affordance: "plus" });
  });
  it("subtitles, consume, cellar source, counts", () => {
    expect(m("flight", true).cellarGroupSubtitle?.(6)).toBe("6 bottles you can pour tonight");
    expect(m("cellar", true).cellarGroupSubtitle).toBeNull();
    expect(all.map((k) => m(k, true).consumeLabel)).toEqual(["Take it out of the cellar when we pour it", null, "Take a bottle out of the cellar when I save the note", null, "Take it out of the cellar when we pour it"]);
    expect(all.map((k) => m(k, true).cellarSource)).toEqual([true, false, true, false, true]);
    expect([m("catalog", false).resultCount(3), m("flight", false).resultCount(31), m("flight", false).inFlightMeta]).toEqual(["3 near matches", "31 found", "in flight"]);
  });
});

describe("laptop surfaces", () => {
  it("upload zone", () => {
    expect(m("flight", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and lands in this flight.", drop: "Drop photos here", choose: "or choose files · JPG, PNG, up to 5MB each" });
    expect(m("cellar", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Several at once — a delivery of six is one drop. Each lands in your cellar.", drop: "Drop photos here", choose: "or choose files" });
    expect(m("note", false).upload).toEqual({ multiple: false, title: "Upload a label photo", body: "Read and matched exactly as it is on the phone, then the note opens.", drop: "Drop a photo here", choose: "or choose a file" });
    expect(m("catalog", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Read a label and it fills the form below — still checked against the catalog before it is written.", drop: "Drop photos here", choose: "or choose files" });
  });
  it("tiles, lead line, neither-of-these", () => {
    const s = { bottles: 38, readyToDrink: 6 };
    expect([m("flight", false).cellarTileSubtitle?.(s), m("note", false).cellarTileSubtitle?.(s), m("cellar", false).cellarTileSubtitle]).toEqual(["38 bottles · 6 ready to drink", "38 bottles · rating one you own is the common case", null]);
    expect(all.map((k) => m(k, false).byHandTileSubtitle)).toEqual(Array(5).fill("Producer, name, vintage, colour"));
    expect(all.map((k) => m(k, false).lotPreviewTile)).toEqual([false, true, false, false, false]);
    expect(m("note", false).leadLine).toBe("Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here.");
    expect(m("catalog", false).leadLine).toBe("First, check it is not already here");
    expect(all.map((k) => m(k, false).neitherOfThese)).toEqual([false, false, false, true, false]);
  });
});

describe("footers, confirm, by hand, afterwards", () => {
  it("footer", () => {
    expect(m("flight", true).footer).toMatchObject({ primary: "Add as glass 4", secondary: "Add and scan the next", button: "Done" });
    expect(m("flight", false).footer.secondary).toBeNull();
    expect(m("flight", false).footer.sentence(0)).toBe("Glasses 1–3 are set. Adding does not close this — keep going until the flight is full.");
    expect([m("cellar", false).footer.primary, m("cellar", false).footer.sentence(0), m("cellar", false).footer.sentence(2)]).toEqual(["Add to cellar", "Nothing added to your cellar yet. Adding does not close this — keep going.", "Added 2 to your cellar so far. Adding does not close this — keep going."]);
    expect(m("note", false).footer).toMatchObject({ primary: "Start the note", button: "Close" });
    expect(m("note", false).footer.sentence(0)).toBe(m("note", false).leadLine);
    expect(m("catalog", false).footer).toMatchObject({ primary: "Add to the catalog", button: "Done" });
    expect(m("catalog", false).footer.sentence(0)).toBe("Adding here only records the wine. The sheet then asks what you want to do with it.");
    expect(m("none", false).footer).toMatchObject({ primary: "Choose where it goes", button: "Done" });
  });
  it("confirm", () => {
    expect(m("flight", true).confirm).toEqual({ eyebrowMatch: "Matched in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Add as glass 4", primaryNoMatch: "Add as glass 4", note: "Only you see this until the reveal. Tasters see “glass 4”." });
    expect(m("catalog", true).confirm).toEqual({ eyebrowMatch: "Already in the catalog · nothing new will be written", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Yes, that is the wine", primaryNoMatch: "Add it", note: "Confirming only tells us we have the right wine. What happens to it comes next." });
    expect([m("note", true).confirm.primaryMatch, m("cellar", true).confirm.primaryNoMatch, m("none", true).confirm.eyebrowMatch]).toEqual(["Start the note", "Add to cellar", "Found in the catalog"]);
  });
  it("by hand (D8, byhand-8)", () => {
    expect([m("flight", true).byHand.eyebrow, m("flight", true).byHand.primary(false), m("flight", true).byHand.primary(true), m("flight", true).byHand.unidentifiedToggle]).toEqual(["Add wine · glass 4 · by hand", "Add as glass 4", "Save · glass 4", true]);
    expect(m("flight", true).byHand.footerNote).toBe("Only you see this until the reveal. It joins the catalog once this glass is revealed.");
    const rest = ["cellar", "note", "catalog", "none"] as const;
    expect(rest.map((k) => m(k, true).byHand.eyebrow)).toEqual(["Cellar · by hand", "Taste & rate · by hand", "Catalog · by hand", "Add wine · by hand"]);
    expect(rest.map((k) => m(k, true).byHand.primary(false))).toEqual(["Add to cellar", "Start the note", "Add to the catalog", "Choose where it goes"]);
    rest.forEach((k) => expect([m(k, true).byHand.footerNote, m(k, true).byHand.unidentifiedToggle]).toEqual(["Saved to the catalog too, so nobody types it again.", false]));
  });
  it("partial reads and follow-ups (D7, D3)", () => {
    expect(all.map((k) => m(k, true).partialRead)).toEqual([
      { single: "incomplete-glass", stacked: "incomplete-glass", skipConfirm: false }, { single: "by-hand", stacked: "pending-row", skipConfirm: false },
      { single: "by-hand", stacked: "by-hand", skipConfirm: true }, { single: "by-hand", stacked: "pending-row", skipConfirm: false }, { single: "by-hand", stacked: "pending-row", skipConfirm: false },
    ]);
    expect(sheetMatrix({ ...flight, revealMode: "OPEN" }, true).partialRead).toEqual({ single: "by-hand", stacked: "pending-row", skipConfirm: false });
    expect(all.map((k) => m(k, true).followUps)).toEqual([[], [], [], ["cellar", "note"], []]);
  });
});

// Spec §G.1: every C.2 cell, for each destination, with canScan true and false.
// Function cells are read at the inputs their tables name: both title phases;
// one and several bottles, results and adds; the cellar tile's loading and
// empty states (round 1's, kept); a new and a finishing by-hand save. A cell
// the tables mark Scan-only or Upload-only returns the same value on both
// devices; only the cells that name both devices change with canScan.
describe("every C.2 cell, for each destination with canScan true and false (spec §G.1)", () => {
  const tileStates = [null, { bottles: 0, readyToDrink: 0 }, { bottles: 1, readyToDrink: 1 }, { bottles: 38, readyToDrink: 6 }];
  const cells = (x: ReturnType<typeof sheetMatrix>) => {
    const group = x.cellarGroupSubtitle;
    const tile = x.cellarTileSubtitle;
    return {
      kind: x.kind, home: x.home, eyebrow: x.eyebrow, title: [x.title("home"), x.title("read")], multiTitle: x.multiTitle,
      searchPlaceholder: x.searchPlaceholder, enterHint: x.enterHint, chips: x.chips, showMany: x.showMany,
      searchGroups: x.searchGroups, cellarGroupSubtitle: group && [group(1), group(6)], consumeLabel: x.consumeLabel,
      inFlightMeta: x.inFlightMeta, cellarSource: x.cellarSource, upload: x.upload,
      cellarTileSubtitle: tile && tileStates.map((s) => tile(s)), byHandTileSubtitle: x.byHandTileSubtitle,
      lotPreviewTile: x.lotPreviewTile, leadLine: x.leadLine, neitherOfThese: x.neitherOfThese,
      resultCount: [x.resultCount(1), x.resultCount(31)],
      footer: { ...x.footer, sentence: [0, 1, 3].map((n) => x.footer.sentence(n)) },
      confirm: x.confirm,
      byHand: { ...x.byHand, primary: [x.byHand.primary(false), x.byHand.primary(true)] },
      partialRead: x.partialRead, followUps: x.followUps,
    };
  };
  const device = (canScan: boolean) => ({
    home: canScan ? "camera" : "desktop",
    searchPlaceholder: canScan ? "Or search wine catalog" : "Search by producer, wine or appellation",
  });
  const KEEP = "Adding does not close this — keep going.";
  const LEAD = "Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here.";
  const TOO = "Saved to the catalog too, so nobody types it again.";
  const CHOOSE = "Choose where it goes";
  const expected = {
    flight: (canScan: boolean) => ({
      kind: "flight", ...device(canScan), eyebrow: canScan ? "Barolo night" : "Barolo night · blind",
      title: ["Add wine · glass 4", "Add wine · glass 4"], multiTitle: "Adding to the flight",
      enterHint: "↵ adds the first hit", chips: ["cellar", "byhand"], showMany: true,
      searchGroups: ["cellar", "catalog", "tasted"], cellarGroupSubtitle: ["1 bottle you can pour tonight", "6 bottles you can pour tonight"],
      consumeLabel: "Take it out of the cellar when we pour it", inFlightMeta: "in flight", cellarSource: true,
      upload: { multiple: true, title: "Upload label photos", body: "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and lands in this flight.", drop: "Drop photos here", choose: "or choose files · JPG, PNG, up to 5MB each" },
      cellarTileSubtitle: ["Counting bottles…", "No bottles in stock", "1 bottle · 1 ready to drink", "38 bottles · 6 ready to drink"],
      byHandTileSubtitle: "Producer, name, vintage, colour", lotPreviewTile: false, leadLine: null, neitherOfThese: false,
      resultCount: ["1 found", "31 found"],
      footer: { primary: "Add as glass 4", secondary: canScan ? "Add and scan the next" : null, button: "Done", sentence: Array(3).fill("Glasses 1–3 are set. Adding does not close this — keep going until the flight is full.") },
      confirm: { eyebrowMatch: "Matched in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Add as glass 4", primaryNoMatch: "Add as glass 4", note: "Only you see this until the reveal. Tasters see “glass 4”." },
      byHand: { eyebrow: "Add wine · glass 4 · by hand", footerNote: "Only you see this until the reveal. It joins the catalog once this glass is revealed.", primary: ["Add as glass 4", "Save · glass 4"], unidentifiedToggle: true },
      partialRead: { single: "incomplete-glass", stacked: "incomplete-glass", skipConfirm: false },
      followUps: [],
    }),
    cellar: (canScan: boolean) => ({
      kind: "cellar", ...device(canScan), eyebrow: "Cellar", title: ["Add a bottle", "Add a bottle"], multiTitle: "Adding to the cellar",
      enterHint: "↵ adds the first hit", chips: ["byhand"], showMany: true,
      searchGroups: ["cellar", "catalog", "tasted"], cellarGroupSubtitle: null, consumeLabel: null, inFlightMeta: "in flight", cellarSource: false,
      upload: { multiple: true, title: "Upload label photos", body: "Several at once — a delivery of six is one drop. Each lands in your cellar.", drop: "Drop photos here", choose: "or choose files" },
      cellarTileSubtitle: null, byHandTileSubtitle: "Producer, name, vintage, colour", lotPreviewTile: true, leadLine: null, neitherOfThese: false,
      resultCount: ["1 found", "31 found"],
      footer: { primary: "Add to cellar", secondary: null, button: "Done", sentence: [`Nothing added to your cellar yet. ${KEEP}`, `Added 1 to your cellar so far. ${KEEP}`, `Added 3 to your cellar so far. ${KEEP}`] },
      confirm: { eyebrowMatch: "Matched in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Add to cellar", primaryNoMatch: "Add to cellar", note: null },
      byHand: { eyebrow: "Cellar · by hand", footerNote: TOO, primary: ["Add to cellar", "Add to cellar"], unidentifiedToggle: false },
      partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
      followUps: [],
    }),
    note: (canScan: boolean) => ({
      kind: "note", ...device(canScan), eyebrow: "Taste & rate",
      title: Array(2).fill(canScan ? "Which wine?" : "Which wine are you tasting?"), multiTitle: null,
      enterHint: "↵ opens a note on the first hit", chips: ["cellar", "byhand"], showMany: false,
      searchGroups: ["cellar", "catalog", "tasted"], cellarGroupSubtitle: null, consumeLabel: "Take a bottle out of the cellar when I save the note", inFlightMeta: "in flight", cellarSource: true,
      upload: { multiple: false, title: "Upload a label photo", body: "Read and matched exactly as it is on the phone, then the note opens.", drop: "Drop a photo here", choose: "or choose a file" },
      cellarTileSubtitle: ["Counting bottles…", "No bottles in stock", "1 bottle · rating one you own is the common case", "38 bottles · rating one you own is the common case"],
      byHandTileSubtitle: "Producer, name, vintage, colour", lotPreviewTile: false, leadLine: LEAD, neitherOfThese: false,
      resultCount: ["1 found", "31 found"],
      footer: { primary: "Start the note", secondary: null, button: "Close", sentence: Array(3).fill(LEAD) },
      confirm: { eyebrowMatch: "Matched in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Start the note", primaryNoMatch: "Start the note", note: null },
      byHand: { eyebrow: "Taste & rate · by hand", footerNote: TOO, primary: ["Start the note", "Start the note"], unidentifiedToggle: false },
      partialRead: { single: "by-hand", stacked: "by-hand", skipConfirm: true },
      followUps: [],
    }),
    catalog: (canScan: boolean) => ({
      kind: "catalog", ...device(canScan), eyebrow: "Catalog", title: ["Add a wine", "Add a wine"], multiTitle: "Adding to the catalog",
      enterHint: "↵ opens the first hit", chips: ["byhand"], showMany: true,
      searchGroups: ["catalog", "tasted"], cellarGroupSubtitle: null, consumeLabel: null, inFlightMeta: "in flight", cellarSource: false,
      upload: { multiple: true, title: "Upload label photos", body: "Read a label and it fills the form below — still checked against the catalog before it is written.", drop: "Drop photos here", choose: "or choose files" },
      cellarTileSubtitle: null, byHandTileSubtitle: "Producer, name, vintage, colour", lotPreviewTile: false, leadLine: "First, check it is not already here", neitherOfThese: true,
      resultCount: ["1 near match", "31 near matches"],
      footer: { primary: "Add to the catalog", secondary: null, button: "Done", sentence: Array(3).fill("Adding here only records the wine. The sheet then asks what you want to do with it.") },
      confirm: { eyebrowMatch: "Already in the catalog · nothing new will be written", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Yes, that is the wine", primaryNoMatch: "Add it", note: "Confirming only tells us we have the right wine. What happens to it comes next." },
      byHand: { eyebrow: "Catalog · by hand", footerNote: TOO, primary: ["Add to the catalog", "Add to the catalog"], unidentifiedToggle: false },
      partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
      followUps: ["cellar", "note"],
    }),
    none: (canScan: boolean) => ({
      kind: "none", ...device(canScan), eyebrow: null, title: canScan ? ["Scan", "Scanned"] : ["Add wine", "Add wine"], multiTitle: "Adding wines",
      enterHint: "↵ adds the first hit", chips: ["cellar", "byhand"], showMany: true,
      searchGroups: ["cellar", "catalog", "tasted"], cellarGroupSubtitle: null, consumeLabel: "Take it out of the cellar when we pour it", inFlightMeta: "in flight", cellarSource: true,
      upload: { multiple: true, title: "Upload label photos", body: "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and you choose where each one goes.", drop: "Drop photos here", choose: "or choose files · JPG, PNG, up to 5MB each" },
      cellarTileSubtitle: ["Counting bottles…", "No bottles in stock", "1 bottle · 1 ready to drink", "38 bottles · 6 ready to drink"],
      byHandTileSubtitle: "Producer, name, vintage, colour", lotPreviewTile: false, leadLine: null, neitherOfThese: false,
      resultCount: ["1 found", "31 found"],
      footer: { primary: CHOOSE, secondary: null, button: "Done", sentence: [`Nothing added yet. ${KEEP}`, `Added 1 so far. ${KEEP}`, `Added 3 so far. ${KEEP}`] },
      confirm: { eyebrowMatch: "Found in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: CHOOSE, primaryNoMatch: CHOOSE, note: null },
      byHand: { eyebrow: "Add wine · by hand", footerNote: TOO, primary: [CHOOSE, CHOOSE], unidentifiedToggle: false },
      partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
      followUps: [],
    }),
  };
  it.each(all.flatMap((k) => [true, false].map((canScan) => [k, canScan] as const)))("%s canScan=%s", (k, canScan) => {
    const x = m(k, canScan);
    // Every SheetMatrix key is read above (row has its own describe below).
    expect(Object.keys(x).sort()).toEqual([...Object.keys(cells(x)), "row"].sort());
    expect(cells(x)).toEqual(expected[k](canScan));
  });
});

describe("every row, for each destination with canScan true and false (C.2 rows, C.9, D9)", () => {
  const rows = (k: K, canScan: boolean, inFlight = false) =>
    (["lot", "catalog", "tasted"] as const).map((source) => m(k, canScan).row({ source, inFlight, owned: false }));
  const plus = (label: string, action: string) => ({ label, action, disabled: false, affordance: "plus" });
  const chevron = (label: string, action: string) => ({ label, action, disabled: false, affordance: "chevron" });
  it.each([true, false])("canScan=%s", (canScan) => {
    expect(rows("flight", canScan)).toEqual(Array(3).fill(plus("Add as glass 4", "add")));
    // C.9: a wine the caller knows is in the flight is disabled in every group, its lot rows included.
    expect(rows("flight", canScan, true)).toEqual(Array(3).fill({ label: "In flight", action: "add", disabled: true, affordance: "plus" }));
    expect(rows("cellar", canScan)).toEqual([plus("+1 bottle", "plusOne"), plus("Add to cellar", "add"), plus("Add to cellar", "add")]);
    expect(rows("note", canScan)).toEqual(Array(3).fill(chevron("Start the note", "pick")));
    // The catalog destination lists no cellar group, so it has no lot row to pin.
    expect(rows("catalog", canScan).slice(1)).toEqual(Array(2).fill(chevron("Open", "open")));
    expect(rows("none", canScan)).toEqual(Array(3).fill(plus("Add", "choose")));
  });
});

describe("a flight's cells follow its destination: position, reveal mode, who brings the wines", () => {
  it("every glass number is the destination's position", () => {
    for (const canScan of [true, false]) {
      const x = sheetMatrix({ ...flight, position: 7 }, canScan);
      expect([
        x.title("home"), x.title("read"), x.row({ source: "tasted", inFlight: false, owned: false }).label, x.footer.primary,
        x.confirm.primaryMatch, x.confirm.primaryNoMatch, x.confirm.note, x.byHand.eyebrow, x.byHand.primary(false), x.byHand.primary(true),
      ]).toEqual([
        "Add wine · glass 7", "Add wine · glass 7", "Add as glass 7", "Add as glass 7",
        "Add as glass 7", "Add as glass 7", "Only you see this until the reveal. Tasters see “glass 7”.", "Add wine · glass 7 · by hand", "Add as glass 7", "Save · glass 7",
      ]);
    }
  });
  it.each([
    [1, "No glasses are set yet. Adding does not close this — keep going until the flight is full."],
    [2, "Glass 1 is set. Adding does not close this — keep going until the flight is full."],
    [3, "Glasses 1–2 are set. Adding does not close this — keep going until the flight is full."],
  ] as const)("the footer sentence at position %i describes the flight, not this session's adds", (position, sentence) => {
    const x = sheetMatrix({ ...flight, position }, false);
    expect([0, 1, 4].map((n) => x.footer.sentence(n))).toEqual([sentence, sentence, sentence]);
  });
  const incompleteGlass = { single: "incomplete-glass", stacked: "incomplete-glass", skipConfirm: false };
  const byHandInOpen = { single: "by-hand", stacked: "pending-row", skipConfirm: false };
  it.each([
    ["BLIND", "HOST_PROVIDES", "blind", "Only you see this until the reveal. Tasters see “glass 4”.", incompleteGlass],
    ["BLIND", "PARTICIPANT_CONTRIBUTED", "blind", "Only you see this until the reveal.", incompleteGlass],
    ["SEMI_BLIND", "HOST_PROVIDES", "semi-blind", "Tasters see this wine on the candidate list, but not which glass it is.", incompleteGlass],
    ["SEMI_BLIND", "PARTICIPANT_CONTRIBUTED", "semi-blind", "Tasters see this wine on the candidate list, but not which glass it is.", incompleteGlass],
    ["OPEN", "HOST_PROVIDES", "open", null, byHandInOpen],
    ["OPEN", "PARTICIPANT_CONTRIBUTED", "open", null, byHandInOpen],
  ] as const)("%s, %s: eyebrow, confirm note (flightNote) and partial reads (C.8)", (revealMode, wineSource, word, note, partialRead) => {
    for (const canScan of [true, false]) {
      const x = sheetMatrix({ ...flight, revealMode, wineSource }, canScan);
      expect([x.eyebrow, x.confirm.note, x.partialRead]).toEqual([canScan ? "Barolo night" : `Barolo night · ${word}`, note, partialRead]);
    }
  });
});
