import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import {
  catalogRowMeta,
  cellarSummary,
  clampFocus,
  effectiveFocus,
  enterHint,
  firstAddableIndex,
  flattenSearchGroups,
  focusAnchorAt,
  lotPreviewChips,
  pickImageFiles,
  resolveFocusAnchor,
  rowActionLabel,
} from "./desktop-format";
import { sheetMatrix } from "./matrix";
import { markAddedInFlight } from "./sheet-state";
import type { AddWineDestination, SearchGroups } from "./types";

const flight: AddWineDestination = {
  kind: "flight",
  tastingId: "t1",
  tastingName: "Nebbiolo vs Sangiovese",
  revealMode: "BLIND",
  wineSource: "HOST_PROVIDES",
  position: 4,
};

const now = new Date(Date.UTC(2026, 8, 12));

const identity = (id: string, vintageLabel = "2018") => ({
  producerId: `p-${id}`,
  wineName: "Barbaresco",
  appellationId: "a-barbaresco",
  vintageLabel,
});

function groups(over: Partial<SearchGroups> = {}): SearchGroups {
  return {
    cellar: [
      {
        lotId: "lot1",
        catalogWineId: "w1",
        title: "Produttori del Barbaresco, Barbaresco 2018",
        imageUrl: null,
        rack: "rack B",
        quantity: 2,
        drinkNow: true,
        inFlight: false,
      },
    ],
    catalog: [
      {
        catalogWineId: "w1",
        title: "Produttori del Barbaresco, Barbaresco 2018",
        subtitle: "Barbaresco DOCG · Piemonte · Nebbiolo",
        imageUrl: null,
        avgScore: 91.4,
        noteCount: 14,
        inFlight: false,
        ...identity("w1"),
      },
      {
        catalogWineId: "w2",
        title: "Gaja, Barbaresco 2018",
        subtitle: "Barbaresco DOCG · Piemonte · Nebbiolo",
        imageUrl: "https://x/gaja.jpg",
        avgScore: 95,
        noteCount: 22,
        inFlight: false,
        ...identity("w2"),
      },
      {
        catalogWineId: "w3",
        title: "Giacosa, Barbaresco Asili 2016",
        subtitle: "Barbaresco DOCG · Piemonte · Nebbiolo",
        imageUrl: null,
        avgScore: null,
        noteCount: 0,
        inFlight: false,
        ...identity("w3", "2016"),
      },
    ],
    tasted: [
      {
        catalogWineId: "w2",
        title: "Gaja, Barbaresco 2018",
        imageUrl: "https://x/gaja.jpg",
        myScore: 92,
        tastedOn: "2026-05-03",
        inFlight: false,
        ...identity("w2"),
      },
    ],
    ...over,
  };
}

describe("flattenSearchGroups", () => {
  it("puts cellar lots first, then the catalog in rank order, one row per wine", () => {
    const rows = flattenSearchGroups(groups(), { includeCellar: true, now });
    expect(rows.map((r) => r.key)).toEqual(["lot:lot1", "wine:w2", "wine:w3"]);
    expect(rows[0].source).toEqual({ kind: "lot", lotId: "lot1" });
    expect(rows[1].source).toEqual({ kind: "catalog", catalogWineId: "w2" });
    expect(rows.map((r) => r.listedAs)).toEqual(["lot", "catalog", "catalog"]);
  });

  it("states the source on every row", () => {
    const rows = flattenSearchGroups(groups(), { includeCellar: true, now });
    expect(rows[0].meta).toBe("In your cellar · rack B · 2 bottles · ★ 91");
    expect(rows[1].meta).toBe("You rated it 92 in May · ★ 95 · 22 notes");
    expect(rows[2].meta).toBe("Catalog · Barbaresco DOCG · Piemonte · Nebbiolo");
  });

  it("reads a plain catalog row with its rating", () => {
    const rows = flattenSearchGroups(groups({ cellar: [], tasted: [] }), {
      includeCellar: true,
      now,
    });
    expect(rows[0].meta).toBe("Catalog · ★ 91 · 14 notes");
    expect(rows[1].meta).toBe("Catalog · ★ 95 · 22 notes");
  });

  it("drops the rack and the rating when the lot has none", () => {
    const g = groups();
    g.cellar[0].rack = null;
    g.cellar[0].quantity = 1;
    g.catalog[0].avgScore = null;
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows[0].meta).toBe("In your cellar · 1 bottle");
  });

  it("hides cellar lots (and stops deduping against them) when the cellar group is not listed", () => {
    const rows = flattenSearchGroups(groups(), { includeCellar: false, now });
    expect(rows.map((r) => r.key)).toEqual(["wine:w1", "wine:w2", "wine:w3"]);
    expect(rows.every((r) => r.source.kind === "catalog")).toBe(true);
  });

  it("marks wines already in the flight", () => {
    const g = groups();
    g.cellar[0].inFlight = true;
    g.catalog[1].inFlight = true;
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows[0].inFlight).toBe(true);
    expect(rows[0].meta).toBe("In your cellar · rack B · 2 bottles · ★ 91 · in flight");
    expect(rows[1].inFlight).toBe(true);
    expect(rows[1].meta).toBe("You rated it 92 in May · ★ 95 · 22 notes · in flight");
    expect(rows[2].inFlight).toBe(false);
  });

  it("keeps two lots of the same wine as two rows", () => {
    const g = groups();
    g.cellar.push({ ...g.cellar[0], lotId: "lot2", rack: "rack A", quantity: 1 });
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows.map((r) => r.key)).toEqual(["lot:lot1", "lot:lot2", "wine:w2", "wine:w3"]);
  });

  it("lists a tasted wine beyond the catalog page after the catalog, once (sources-8)", () => {
    const g = groups();
    g.tasted.push(
      { catalogWineId: "w9", title: "Vietti, Barolo 2016", imageUrl: null, myScore: 88, tastedOn: "2025-11-02", inFlight: false, ...identity("w9", "2016") },
      // Held in the cellar: listed once, as its lot row.
      { catalogWineId: "w1", title: "Produttori del Barbaresco, Barbaresco 2018", imageUrl: null, myScore: 90, tastedOn: "2026-02-01", inFlight: false, ...identity("w1") },
    );
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows.map((r) => r.key)).toEqual(["lot:lot1", "wine:w2", "wine:w3", "wine:w9"]);
    expect(rows[3]).toMatchObject({
      listedAs: "tasted",
      source: { kind: "catalog", catalogWineId: "w9" },
      meta: "You rated it 88 in November 2025",
    });
  });

  it("carries D1's comparison fields on catalog and tasted rows, none on a lot row", () => {
    const g = groups();
    g.tasted.push({ catalogWineId: "w9", title: "Vietti, Barolo 2016", imageUrl: null, myScore: null, tastedOn: "2026-05-02", inFlight: false, ...identity("w9", "2016") });
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows[0].identity).toBeNull();
    expect(rows[1].identity).toEqual(identity("w2"));
    expect(rows[3].identity).toEqual(identity("w9", "2016"));
  });

  it("leads a lot row with “Already yours” where the lot is the destination (B1)", () => {
    const rows = flattenSearchGroups(groups(), { includeCellar: true, ownedLead: true, now });
    expect(rows[0].meta).toBe("Already yours · rack B · 2 bottles · ★ 91");
    expect(rows[1].meta).toBe("You rated it 92 in May · ★ 95 · 22 notes");
  });
});

it("a tasted-only row keeps its own inFlight (sources-8)", () => {
  const rows = flattenSearchGroups({ cellar: [], catalog: [], tasted: [{ catalogWineId: "c9", title: "Vietti, Barolo 2016", imageUrl: null, myScore: 92, tastedOn: "2026-05-02", inFlight: true, producerId: "p9", wineName: null, appellationId: "a9", vintageLabel: "2016" }] }, { includeCellar: false });
  expect(rows.find((r) => r.catalogWineId === "c9")?.inFlight).toBe(true);
});

describe("catalogRowMeta (D1, spec §2.1 row 13)", () => {
  const draft: WineIdentityDraft = { ...emptyDraft(), producer: { kind: "existing", id: "p1", name: "Cigliuti" }, wineName: "Serraboella", appellationId: "a1", vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true } };
  it("typed text only", () => expect(catalogRowMeta({ producerId: "p1", wineName: "Serraboella", appellationId: "a1", vintageLabel: "2016" }, null)).toBe("Already in the catalog · 2016"));
  it("same wine, other vintage", () => expect(catalogRowMeta({ producerId: "p1", wineName: "serraboella", appellationId: "a1", vintageLabel: "2016" }, draft)).toBe("Already in the catalog · different vintage"));
  it("same producer, other wine", () => expect(catalogRowMeta({ producerId: "p1", wineName: null, appellationId: "a2", vintageLabel: "2017" }, draft)).toBe("Already in the catalog · different wine"));

  it("the same wine and vintage, another producer, or a pending producer read like typed text", () => {
    const row = { producerId: "p1", wineName: "Serraboella", appellationId: "a1", vintageLabel: "2017" };
    expect(catalogRowMeta(row, draft)).toBe("Already in the catalog · 2017");
    expect(catalogRowMeta({ ...row, producerId: "p2", wineName: "Vie Erte" }, draft)).toBe("Already in the catalog · 2017");
    expect(catalogRowMeta(row, { ...draft, producer: { kind: "pending", name: "Cigliuti" } })).toBe("Already in the catalog · 2017");
  });
  it("a draft with no appellation or no vintage yet claims only what it can compare", () => {
    const row = { producerId: "p1", wineName: "Serraboella", appellationId: "a1", vintageLabel: "2016" };
    expect(catalogRowMeta(row, { ...draft, appellationId: null })).toBe("Already in the catalog · different vintage");
    expect(catalogRowMeta(row, { ...draft, vintage: { kind: null, year: null, tawnyYears: null, read: false } })).toBe("Already in the catalog · 2016");
    expect(catalogRowMeta({ ...row, wineName: "Vie Erte" }, { ...draft, appellationId: null })).toBe("Already in the catalog · different wine");
  });
  it("a row with no vintage label", () =>
    expect(catalogRowMeta({ producerId: "p1", wineName: null, appellationId: "a1", vintageLabel: "" }, null)).toBe("Already in the catalog"));
});

it("lotPreviewChips (B1)", () => {
  expect(lotPreviewChips(null)).toEqual(["1 bottle", "Rack", "Price"]);
  expect(lotPreviewChips("B")).toEqual(["1 bottle", "Rack B", "Price"]);
});

it("lotPreviewChips never doubles a typed “Rack”", () => {
  expect(lotPreviewChips("Rack B")).toEqual(["1 bottle", "Rack B", "Price"]);
  expect(lotPreviewChips(" rack c ")).toEqual(["1 bottle", "Rack c", "Price"]);
  expect(lotPreviewChips("  ")).toEqual(["1 bottle", "Rack", "Price"]);
  expect(lotPreviewChips("Rackham shelf")).toEqual(["1 bottle", "Rack Rackham shelf", "Price"]);
});

it("keyboard focus never wraps (D9)", () => {
  expect([clampFocus(-1, 5), clampFocus(7, 5), clampFocus(2, 5), clampFocus(0, 0)]).toEqual([0, 4, 2, -1]);
  expect([firstAddableIndex([{ disabled: true }, { disabled: false }]), firstAddableIndex([{ disabled: true }])]).toEqual([1, -1]);
});

describe("effectiveFocus (A8: Enter defaults to the first addable row)", () => {
  const on = { disabled: false };
  const off = { disabled: true };
  it("a stored 0 (a new query) is the default: the first addable row", () => {
    expect(effectiveFocus(0, [off, on, on])).toBe(1);
    expect(effectiveFocus(0, [on, on])).toBe(0);
  });
  it("a stored row past 0 is read literally, within the list", () => {
    expect(effectiveFocus(2, [on, on, off])).toBe(2);
    expect(effectiveFocus(9, [on, on, off])).toBe(2);
  });
  it("no addable rows keeps the first row; no rows is -1", () => {
    expect(effectiveFocus(0, [off, off])).toBe(0);
    expect(effectiveFocus(0, [])).toBe(-1);
    expect(effectiveFocus(3, [])).toBe(-1);
  });
});

// A pinned focus is a row, not an index: the refetch after an add can reorder
// the list or drop the row just poured (a drained lot), and an index would then
// name another wine.
describe("focus anchors (A8: a pinned focus follows its row, then its wine)", () => {
  const row = (key: string, catalogWineId: string) => ({ key, catalogWineId });
  const listed = [row("lot:lot1", "w1"), row("wine:w2", "w2"), row("wine:w3", "w3")];

  it("focusAnchorAt names the row at an index, and nothing past either end", () => {
    expect(focusAnchorAt(listed, 1)).toEqual({ key: "wine:w2", catalogWineId: "w2" });
    expect(focusAnchorAt(listed, -1)).toBeNull();
    expect(focusAnchorAt(listed, 3)).toBeNull();
    expect(focusAnchorAt([], 0)).toBeNull();
  });
  it("follows its row wherever a refetch puts it", () => {
    const anchor = focusAnchorAt(listed, 2);
    expect(resolveFocusAnchor(anchor, [row("wine:w3", "w3"), row("wine:w2", "w2")])).toBe(0);
  });
  it("falls back to a row of the same wine once its own row has left", () => {
    const anchor = focusAnchorAt(listed, 0);
    // The lot drained: its wine is now listed as its catalog row.
    expect(resolveFocusAnchor(anchor, [row("wine:w2", "w2"), row("wine:w1", "w1"), row("wine:w3", "w3")])).toBe(1);
    // Another lot of the same wine is still in stock.
    expect(resolveFocusAnchor(anchor, [row("lot:lot2", "w1"), row("wine:w2", "w2")])).toBe(0);
  });
  it("focuses nothing once its wine has left the list, until ↑/↓ choose a row", () => {
    const rows = [row("wine:w2", "w2"), row("wine:w3", "w3")];
    expect(resolveFocusAnchor(focusAnchorAt(listed, 0), rows)).toBe(-1);
    expect(resolveFocusAnchor(null, rows)).toBe(-1);
    // From no row, ↓ and ↑ both land on the first row.
    expect([clampFocus(-1 + 1, rows.length), clampFocus(-1 - 1, rows.length)]).toEqual([0, 0]);
  });
  it("↑ onto a disabled row 0 keeps the focus there", () => {
    const rows = [row("wine:w1", "w1"), row("wine:w2", "w2")];
    const start = effectiveFocus(0, [{ disabled: true }, { disabled: false }]);
    expect(start).toBe(1);
    const up = clampFocus(start - 1, rows.length);
    expect(resolveFocusAnchor(focusAnchorAt(rows, up), rows)).toBe(0);
  });
});

// The laptop view's turn: Enter acts on the focused row and anchors the focus
// to it; the add marks that row in flight at once (markAddedInFlight), and the
// rule-11 refetch may then reorder the list or drop rows.
describe("Enter twice pours one glass (spec §C.4 rule 11, §C.5 A8, V1 18)", () => {
  const view = (destination: AddWineDestination, g: SearchGroups, addedKeys: string[] = []) => {
    const matrix = sheetMatrix(destination, false);
    const ownedLead = matrix.row({ source: "lot", inFlight: false, owned: true }).action === "plusOne";
    const rows = flattenSearchGroups(markAddedInFlight(g, addedKeys), { includeCellar: true, ownedLead, now });
    const cells = rows.map((r) => matrix.row({ source: r.listedAs, inFlight: r.inFlight, owned: r.source.kind === "lot" }));
    return { rows, cells };
  };

  it("the default row just added keeps the focus once it reads In flight, so the second Enter does nothing", () => {
    const g = groups({ cellar: [], tasted: [] });
    const before = view(flight, g);
    const first = effectiveFocus(0, before.cells);
    expect(before.rows[first].key).toBe("wine:w1");
    const anchor = focusAnchorAt(before.rows, first);
    const after = view(flight, g, [before.rows[first].key]);
    const second = resolveFocusAnchor(anchor, after.rows);
    expect(after.rows[second].key).toBe("wine:w1");
    expect(after.cells[second]).toMatchObject({ label: "In flight", disabled: true });
  });

  it("the same holds when the default was a later row (row 0 already in the flight)", () => {
    const g = groups({ cellar: [], tasted: [] });
    g.catalog[0].inFlight = true;
    const before = view(flight, g);
    const first = effectiveFocus(0, before.cells);
    expect(before.rows[first].key).toBe("wine:w2");
    const anchor = focusAnchorAt(before.rows, first);
    const after = view(flight, g, [before.rows[first].key]);
    const second = resolveFocusAnchor(anchor, after.rows);
    expect(after.rows[second].key).toBe("wine:w2");
    expect(after.cells[second].disabled).toBe(true);
  });

  // Review round 1: a pour into a running flight draws the bottle down at add
  // time, and the search lists only lots with bottles left.
  it("a drained lot: the refetch drops it and the focus moves to its wine's row, in flight, never to the next hit", () => {
    const [w1, w2, w3] = groups().catalog;
    const lot = { ...groups().cellar[0], quantity: 1 };
    // One bottle of w1 in the cellar; the catalog ranks Gaja (w2) above w1.
    const g = groups({ cellar: [lot], catalog: [w2, w1, w3], tasted: [] });
    const before = view(flight, g);
    const first = effectiveFocus(0, before.cells);
    expect([before.rows[first].key, before.cells[first].label]).toEqual(["lot:lot1", "Add as glass 4"]);
    const anchor = focusAnchorAt(before.rows, first);
    const added = [before.rows[first].key];

    // At once: the lot row reads In flight.
    const marked = view(flight, g, added);
    expect(marked.cells[resolveFocusAnchor(anchor, marked.rows)]).toMatchObject({ label: "In flight", disabled: true });

    // The refetch: the last bottle was poured, so the lot is gone, and the
    // server marks w1 in flight.
    const refetched = view(flight, groups({ cellar: [], catalog: [w2, { ...w1, inFlight: true }, w3], tasted: [] }), added);
    expect(refetched.rows.map((r) => r.key)).toEqual(["wine:w2", "wine:w1", "wine:w3"]);
    // The index the first Enter used now names Gaja, still addable.
    expect(refetched.cells[first]).toMatchObject({ label: "Add as glass 4", disabled: false });
    const second = resolveFocusAnchor(anchor, refetched.rows);
    expect(refetched.rows[second].key).toBe("wine:w1");
    expect(refetched.cells[second]).toMatchObject({ label: "In flight", disabled: true });
  });

  it("a drained lot whose wine the refetch no longer lists leaves nothing focused", () => {
    const [w1, w2, w3] = groups().catalog;
    const lot = { ...groups().cellar[0], quantity: 1 };
    const g = groups({ cellar: [lot], catalog: [w2, w1, w3], tasted: [] });
    const before = view(flight, g);
    const first = effectiveFocus(0, before.cells);
    const anchor = focusAnchorAt(before.rows, first);
    const refetched = view(flight, groups({ cellar: [], catalog: [w2, w3], tasted: [] }), [before.rows[first].key]);
    expect(resolveFocusAnchor(anchor, refetched.rows)).toBe(-1);
  });

  it("in the cellar, a catalog add the refetch lists as a new lot keeps the focus on that wine, not on the lot before it", () => {
    const cellar: AddWineDestination = { kind: "cellar" };
    const [, w2, w3] = groups().catalog;
    const lotOf = (lotId: string, catalogWineId: string, title: string) => ({
      lotId, catalogWineId, title, imageUrl: null, rack: null, quantity: 1, drinkNow: true, inFlight: false,
    });
    const vietti = lotOf("lotZ", "w9", "Vietti, Barolo 2016");
    const before = view(cellar, groups({ cellar: [vietti], catalog: [w2, w3], tasted: [] }));
    expect(before.rows.map((r) => r.key)).toEqual(["lot:lotZ", "wine:w2", "wine:w3"]);
    // ↓ to Gaja, then Enter: the lot step saves a new lot of it.
    const anchor = focusAnchorAt(before.rows, 1);
    const gaja = lotOf("lotNew", "w2", "Gaja, Barbaresco 2018");
    const refetched = view(cellar, groups({ cellar: [gaja, vietti], catalog: [w2, w3], tasted: [] }));
    expect(refetched.rows.map((r) => r.key)).toEqual(["lot:lotNew", "lot:lotZ", "wine:w3"]);
    // Index 1 now names Vietti's "+1 bottle": a write on another wine.
    expect(refetched.cells[1]).toMatchObject({ label: "+1 bottle", action: "plusOne" });
    const second = resolveFocusAnchor(anchor, refetched.rows);
    expect(refetched.rows[second].catalogWineId).toBe("w2");
  });
});

describe("rowActionLabel / enterHint (deprecated wrappers over the matrix)", () => {
  it("name the destination's row action", () => {
    expect(rowActionLabel(flight, { inFlight: false })).toBe("Add as glass 4");
    expect(rowActionLabel({ kind: "cellar" }, { inFlight: false })).toBe("Add to cellar");
    expect(rowActionLabel({ kind: "note" }, { inFlight: false })).toBe("Start the note");
    expect(rowActionLabel(null, { inFlight: false })).toBe("Add");
  });
  it("read In flight for a wine already poured", () => {
    expect(rowActionLabel(flight, { inFlight: true })).toBe("In flight");
  });
  // Owner feedback 2026-09-12: a first row reading "Add to cellar" over
  // others reading "Add" looked like two different actions. The ↵ target is
  // shown by the row's tint and the ↵ mark, never by its button.
  it("give every addable row in a result list the same label", () => {
    const g = groups();
    g.catalog[2].inFlight = true;
    const rows = flattenSearchGroups(g, { includeCellar: true, now });
    expect(rows.map((r) => rowActionLabel(flight, r))).toEqual([
      "Add as glass 4",
      "Add as glass 4",
      "In flight",
    ]);
  });
  it("say what ↵ does", () => {
    expect(enterHint(flight)).toBe("↵ adds the first hit");
    expect(enterHint({ kind: "note" })).toBe("↵ opens a note on the first hit");
  });
});

describe("cellarSummary", () => {
  it("sums bottles and the ones whose window is open this year", () => {
    expect(
      cellarSummary(
        [
          { quantity: 2, drink_from: 2020, drink_to: 2030 },
          { quantity: 3, drink_from: 2028, drink_to: null },
          { quantity: 1, drink_from: null, drink_to: 2026 },
          { quantity: 4, drink_from: null, drink_to: null },
        ],
        2026,
      ),
    ).toEqual({ bottles: 10, readyToDrink: 3 });
    expect(cellarSummary([], 2026)).toEqual({ bottles: 0, readyToDrink: 0 });
  });
});

describe("pickImageFiles", () => {
  const mb = 1024 * 1024;
  it("keeps images under the limit and names what it skipped", () => {
    const r = pickImageFiles([
      { name: "a.jpg", size: 2 * mb, type: "image/jpeg" },
      { name: "b.png", size: 6 * mb, type: "image/png" },
      { name: "notes.pdf", size: 1 * mb, type: "application/pdf" },
      { name: "c.HEIC", size: 1 * mb, type: "" },
      { name: "d", size: 1 * mb, type: "" },
    ]);
    expect(r.accepted.map((f) => f.name)).toEqual(["a.jpg", "c.HEIC"]);
    expect(r.skipped).toEqual([
      { name: "b.png", reason: "over 5MB" },
      { name: "notes.pdf", reason: "not an image" },
      { name: "d", reason: "not an image" },
    ]);
  });
  it("accepts exactly 5MB", () => {
    expect(
      pickImageFiles([{ name: "a.jpg", size: 5 * mb, type: "image/jpeg" }]).accepted,
    ).toHaveLength(1);
  });
  it("keeps only the first usable photo when capped, naming the rest", () => {
    const r = pickImageFiles(
      [
        { name: "notes.pdf", size: 1 * mb, type: "application/pdf" },
        { name: "a.jpg", size: 1 * mb, type: "image/jpeg" },
        { name: "b.jpg", size: 1 * mb, type: "image/jpeg" },
      ],
      { max: 1 },
    );
    expect(r.accepted.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(r.skipped).toEqual([
      { name: "notes.pdf", reason: "not an image" },
      { name: "b.jpg", reason: "one photo at a time" },
    ]);
  });
});
