import { describe, expect, it } from "vitest";
import { nearMatchCopy } from "./near-match-copy";

describe("near-match copy (provisional, owner approves)", () => {
  it("names the producer and counts its wines", () => {
    expect(nearMatchCopy.didYouMean("Marc Esteve Vives")).toBe("Did you mean Marc Esteve Vives?");
    expect(nearMatchCopy.producerMeta("Cava", 1)).toBe("Cava · 1 wine in the catalog");
    expect(nearMatchCopy.producerMeta(null, 5)).toBe("5 wines in the catalog");
  });
  it("lists what differs and offers the bottle's own vintage", () => {
    expect(nearMatchCopy.differs(["2019, yours is 2021", "Rosé, yours is white"])).toBe("Differs: 2019, yours is 2021 · Rosé, yours is white");
    expect(nearMatchCopy.addAsVintage("2021")).toBe("Add it as 2021");
  });
});
