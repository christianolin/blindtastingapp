import { describe, expect, it } from "vitest";
import { dropRepeatedHits, glossaryTermTab, systemTab } from "./tabs";

describe("Cru Classé de Graves on the Bordeaux tab", () => {
  it("the glossary term and the classification system both open Bordeaux", () => {
    expect(glossaryTermTab("Cru Classé de Graves")).toBe("bordeaux");
    expect(systemTab("graves-cru-classe")).toBe("bordeaux");
  });
  it("Grand Cru Classé still opens Bordeaux", () => {
    expect(glossaryTermTab("Grand Cru Classé")).toBe("bordeaux");
  });
});

describe("dropRepeatedHits", () => {
  const href = (h: { label: string; to: string }) => h.to;
  it("keeps the first of a label and destination pair (the Graves system and term)", () => {
    const hits = [
      { id: "system", label: "Cru Classé de Graves", to: "/knowledge/designations?tab=bordeaux" },
      { id: "term", label: "Cru Classé de Graves", to: "/knowledge/designations?tab=bordeaux" },
      { id: "gcc", label: "Grand Cru Classé", to: "/knowledge/designations?tab=bordeaux" },
    ];
    expect(dropRepeatedHits(hits, href).map((h) => h.id)).toEqual(["system", "gcc"]);
  });
  it("keeps same-named hits that lead to different pages", () => {
    const hits = [
      { id: "a", label: "Classico", to: "/x" },
      { id: "b", label: "Classico", to: "/y" },
    ];
    expect(dropRepeatedHits(hits, href).map((h) => h.id)).toEqual(["a", "b"]);
  });
});
