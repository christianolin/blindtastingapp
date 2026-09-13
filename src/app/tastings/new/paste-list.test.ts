import { describe, expect, it } from "vitest";
import { MAX_PASTE_LINES, couldntMatchHeading, pickPasteMatch, splitPastedLines } from "./paste-list";

describe("splitPastedLines (S2 'Paste a list')", () => {
  it("trims, drops blanks and list markers, collapses spaces", () => {
    expect(splitPastedLines("1. Vietti Barolo 2017\n- Produttori  Barbaresco 2018\n\n  • Montevertine   Le Pergole Torte \r\n2) Fèlsina\n* Poggio di Sotto"))
      .toEqual(["Vietti Barolo 2017", "Produttori Barbaresco 2018", "Montevertine Le Pergole Torte", "Fèlsina", "Poggio di Sotto"]);
  });
  it("keeps a year that only looks like a marker", () => {
    expect(splitPastedLines("2016 Barolo")).toEqual(["2016 Barolo"]);
  });
  it("caps at 24 lines", () => {
    expect(MAX_PASTE_LINES).toBe(24);
    expect(splitPastedLines(Array.from({ length: 30 }, (_, i) => `Wine ${i}`).join("\n"))).toHaveLength(24);
  });
});

describe("pickPasteMatch", () => {
  const rows = [
    { id: "w1", title: "Vietti, Barolo Castiglione 2017" },
    { id: "w2", title: "Vietti, Barolo Rocche di Castiglione 2015" },
    { id: "w3", title: "Château Palmer 2010" },
  ];
  it("one row holding every folded token → its id", () => {
    expect(pickPasteMatch("Vietti Barolo 2017", rows)).toBe("w1");
    expect(pickPasteMatch("chateau palmer", rows)).toBe("w3");
  });
  it("two candidates, none, or an empty line → null", () => {
    expect(pickPasteMatch("Vietti Barolo", rows)).toBeNull();
    expect(pickPasteMatch("Giacosa", rows)).toBeNull();
    expect(pickPasteMatch("   ", rows)).toBeNull();
  });
  it("the unmatched heading", () => {
    expect(couldntMatchHeading(2)).toBe("Couldn't match 2 lines");
    expect(couldntMatchHeading(1)).toBe("Couldn't match 1 line");
  });
});

// Beyond the plan's cases.
describe("splitPastedLines edges", () => {
  it("a marker with no space after it, a marker-only line, old Mac line breaks", () => {
    expect(splitPastedLines("1.Vietti Barolo\r-\r•Fèlsina\r\n3)\n  *  ")).toEqual(["Vietti Barolo", "Fèlsina"]);
  });
  it("a number that belongs to the name stays", () => {
    expect(splitPastedLines("1.5 L Magnum Palmer\n12.5% Barolo")).toEqual(["1.5 L Magnum Palmer", "12.5% Barolo"]);
  });
  it("tabs and no-break spaces collapse like spaces", () => {
    expect(splitPastedLines("Vietti\t  Barolo")).toEqual(["Vietti Barolo"]);
  });
  it("the cap counts kept lines, not blank or marker-only ones", () => {
    const text = Array.from({ length: 24 }, (_, i) => `Wine ${i}\n\n- `).join("\n");
    expect(splitPastedLines(text)).toEqual(Array.from({ length: 24 }, (_, i) => `Wine ${i}`));
  });
  it("nothing pasted → no lines", () => {
    expect(splitPastedLines("")).toEqual([]);
    expect(splitPastedLines(" \n\t\n")).toEqual([]);
  });
});

describe("pickPasteMatch edges", () => {
  const palmer = { id: "w3", title: "Château Palmer 2010" };
  it("an empty or punctuation-only line never matches, even a lone candidate", () => {
    expect(pickPasteMatch("", [palmer])).toBeNull();
    expect(pickPasteMatch(" - ", [palmer])).toBeNull();
  });
  it("a token must equal a whole word of the title, not part of one", () => {
    expect(pickPasteMatch("Palm 2010", [palmer])).toBeNull();
  });
  it("accents and punctuation fold on both sides", () => {
    expect(pickPasteMatch("Château Palmer, 2010!", [{ id: "w9", title: "Chateau-Palmer 2010" }])).toBe("w9");
  });
  it("the same catalog row listed twice is still one match", () => {
    expect(pickPasteMatch("Palmer", [palmer, { ...palmer }])).toBe("w3");
  });
  it("no candidates → null", () => {
    expect(pickPasteMatch("Palmer", [])).toBeNull();
  });
  it("numerals above one", () => {
    expect(couldntMatchHeading(12)).toBe("Couldn't match 12 lines");
  });
});
