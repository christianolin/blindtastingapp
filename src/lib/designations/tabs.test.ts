import { describe, expect, it } from "vitest";
import { glossaryTermTab, systemTab } from "./tabs";

describe("Cru Classé de Graves on the Bordeaux tab", () => {
  it("the glossary term and the classification system both open Bordeaux", () => {
    expect(glossaryTermTab("Cru Classé de Graves")).toBe("bordeaux");
    expect(systemTab("graves-cru-classe")).toBe("bordeaux");
  });
  it("Grand Cru Classé still opens Bordeaux", () => {
    expect(glossaryTermTab("Grand Cru Classé")).toBe("bordeaux");
  });
});
