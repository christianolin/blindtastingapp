import { describe, expect, it } from "vitest";
import {
  cellarSummary,
  cellarTileSubtitle,
  flattenSearchGroups,
  footerSentence,
  pickImageFiles,
  rowActionLabel,
  uploadZoneCopy,
} from "./desktop-format";
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
      },
      {
        catalogWineId: "w2",
        title: "Gaja, Barbaresco 2018",
        subtitle: "Barbaresco DOCG · Piemonte · Nebbiolo",
        imageUrl: "https://x/gaja.jpg",
        avgScore: 95,
        noteCount: 22,
        inFlight: false,
      },
      {
        catalogWineId: "w3",
        title: "Giacosa, Barbaresco Asili 2016",
        subtitle: "Barbaresco DOCG · Piemonte · Nebbiolo",
        imageUrl: null,
        avgScore: null,
        noteCount: 0,
        inFlight: false,
      },
    ],
    tasted: [
      {
        catalogWineId: "w2",
        title: "Gaja, Barbaresco 2018",
        imageUrl: "https://x/gaja.jpg",
        myScore: 92,
        tastedOn: "2026-05-03",
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

  it("hides cellar lots (and stops deduping against them) outside the flight", () => {
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
});

describe("rowActionLabel", () => {
  it("names the destination on the primary row and says Add elsewhere", () => {
    expect(rowActionLabel(flight, { primary: true, inFlight: false })).toBe("Add as glass 4");
    expect(rowActionLabel({ kind: "cellar" }, { primary: true, inFlight: false })).toBe(
      "Add to cellar",
    );
    expect(rowActionLabel({ kind: "catalog" }, { primary: true, inFlight: false })).toBe(
      "Add to the catalog",
    );
    expect(rowActionLabel(null, { primary: true, inFlight: false })).toBe("Add");
    expect(rowActionLabel(flight, { primary: false, inFlight: false })).toBe("Add");
  });
  it("reads In flight for a wine already poured", () => {
    expect(rowActionLabel(flight, { primary: true, inFlight: true })).toBe("In flight");
    expect(rowActionLabel(flight, { primary: false, inFlight: true })).toBe("In flight");
  });
});

describe("footerSentence", () => {
  it("counts the glasses already set in the flight", () => {
    expect(footerSentence(flight, 3)).toBe(
      "Glasses 1–3 are set. Adding does not close this — keep going until the flight is full.",
    );
    expect(footerSentence({ ...flight, position: 2 }, 1)).toBe(
      "Glass 1 is set. Adding does not close this — keep going until the flight is full.",
    );
    expect(footerSentence({ ...flight, position: 1 }, 0)).toBe(
      "No glasses are set yet. Adding does not close this — keep going until the flight is full.",
    );
  });
  it("counts this session's adds for the cellar and the catalog", () => {
    expect(footerSentence({ kind: "cellar" }, 0)).toBe(
      "Nothing added to your cellar yet. Adding does not close this — keep going.",
    );
    expect(footerSentence({ kind: "cellar" }, 2)).toBe(
      "Added 2 to your cellar so far. Adding does not close this — keep going.",
    );
    expect(footerSentence({ kind: "catalog" }, 0)).toBe(
      "Nothing added to the catalog yet. Adding does not close this — keep going.",
    );
    expect(footerSentence({ kind: "catalog" }, 1)).toBe(
      "Added 1 to the catalog. Adding does not close this — keep going.",
    );
    expect(footerSentence(null, 0)).toBe("Nothing added yet. Adding does not close this — keep going.");
    expect(footerSentence(null, 3)).toBe("Added 3 so far. Adding does not close this — keep going.");
  });
});

describe("cellar tile", () => {
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
  it("captions the tile", () => {
    expect(cellarTileSubtitle(null)).toBe("Counting bottles…");
    expect(cellarTileSubtitle({ bottles: 0, readyToDrink: 0 })).toBe("No bottles in stock");
    expect(cellarTileSubtitle({ bottles: 38, readyToDrink: 6 })).toBe(
      "38 bottles · 6 ready to drink",
    );
    expect(cellarTileSubtitle({ bottles: 1, readyToDrink: 0 })).toBe(
      "1 bottle · 0 ready to drink",
    );
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
});

describe("uploadZoneCopy", () => {
  it("says where the photos land", () => {
    expect(uploadZoneCopy(flight)).toBe(
      "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and lands in this flight.",
    );
    expect(uploadZoneCopy({ kind: "cellar" })).toMatch(/and lands in your cellar\.$/);
    expect(uploadZoneCopy({ kind: "catalog" })).toMatch(/and lands in the catalog\.$/);
    expect(uploadZoneCopy(null)).toMatch(/and you choose where each one goes\.$/);
  });
});
