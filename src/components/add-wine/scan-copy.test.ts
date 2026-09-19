import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { FieldProvenance, WineIdentityDraft } from "../../lib/wine-identity/types";
import { appellationSourceNote, chooserEyebrow, flightNote, readOkChip } from "./scan-copy";

// Owner fixes B and C (2026-09-19, spec §8): where a scanned appellation came from.
const withAppellation = (source: FieldProvenance | undefined): WineIdentityDraft => ({
  ...emptyDraft(), countryId: "es", regionId: "cyl", appellationId: "cyl-a",
  provenance: source === undefined ? {} : { appellation: source },
});

describe("appellationSourceNote", () => {
  it("names the two sources that are not the label", () => {
    expect(appellationSourceNote(withAppellation("catalog-sibling"))).toBe("Appellation from other vintages of this wine");
    expect(appellationSourceNote(withAppellation("lookup"))).toBe("Appellation looked up — it is not on the label");
  });
  it.each(["label", "producer-region", "manual", "catalog-match", undefined] as const)("says nothing for %s", (source) =>
    expect(appellationSourceNote(withAppellation(source))).toBeNull());
  it("says nothing once the appellation is gone", () =>
    expect(appellationSourceNote({ ...withAppellation("lookup"), appellationId: null })).toBeNull());
});

describe("readOkChip", () => {
  it("a complete read is READ OK, unless the model rated it low", () => {
    expect(readOkChip("high", withAppellation("label"))).toEqual({ label: "READ OK", tone: "ok" });
    expect(readOkChip("medium", withAppellation("label"))).toEqual({ label: "READ OK", tone: "ok" });
    expect(readOkChip("low", withAppellation("label"))).toEqual({ label: "CHECK THE READ", tone: "check" });
  });
  it("a looked-up appellation asks for a check; other vintages are our own data and do not", () => {
    expect(readOkChip("high", withAppellation("lookup"))).toEqual({ label: "CHECK THE READ", tone: "check" });
    expect(readOkChip("high", withAppellation("catalog-sibling"))).toEqual({ label: "READ OK", tone: "ok" });
  });
});

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
