import { describe, expect, it } from "vitest";
import { chooserEyebrow, flightNote } from "./scan-copy";

describe("flightNote", () => {
  const flight = {
    kind: "flight" as const,
    tastingId: "t",
    tastingName: "Nebbiolo vs Sangiovese",
    revealMode: "BLIND" as const,
    wineSource: "HOST_PROVIDES" as const,
    position: 4,
  };
  it("tells the host who sees the answer, with the glass number", () => {
    expect(flightNote(flight)).toBe(
      "Only you see this until the reveal. Tasters see “glass 4”.",
    );
  });
  it("drops the glass clause for a bring-your-own bottle", () => {
    expect(flightNote({ ...flight, wineSource: "PARTICIPANT_CONTRIBUTED" })).toBe(
      "Only you see this until the reveal.",
    );
  });
  it("tells the truth for semi-blind: the candidate list is public, the glass is not", () => {
    const semi = "Tasters see this wine on the candidate list, but not which glass it is.";
    expect(flightNote({ ...flight, revealMode: "SEMI_BLIND" })).toBe(semi);
    expect(
      flightNote({
        ...flight,
        revealMode: "SEMI_BLIND",
        wineSource: "PARTICIPANT_CONTRIBUTED",
      }),
    ).toBe(semi);
  });
  it("says nothing when the wine is not hidden, or the destination is not a flight", () => {
    expect(flightNote({ ...flight, revealMode: "OPEN" })).toBeNull();
    expect(flightNote({ kind: "cellar" })).toBeNull();
    expect(flightNote({ kind: "catalog" })).toBeNull();
    expect(flightNote({ kind: "note" })).toBeNull();
    expect(flightNote(null)).toBeNull();
  });
});

describe("chooserEyebrow", () => {
  it("names the source of the read", () => {
    expect(chooserEyebrow(1)).toBe("Found in the catalog");
    expect(chooserEyebrow(0)).toBe("Read from the label");
  });
});
