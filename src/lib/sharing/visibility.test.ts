import { describe, expect, it } from "vitest";
import {
  AUDIENCE_OPTIONS,
  SHARING_COPY,
  audienceLabel,
  isSharingAudience,
  notSavedLine,
  ownNotesLine,
  profileWriteSaved,
} from "./visibility";

// Sharing defaults spec 2026-09-27 S6, §7.1, §7.6.

describe("AUDIENCE_OPTIONS", () => {
  it("lists Everyone, Friends, Only me — widest first — over the stored values", () => {
    expect(AUDIENCE_OPTIONS).toEqual([
      { value: "PUBLIC", label: "Everyone" },
      { value: "FRIENDS", label: "Friends" },
      { value: "PRIVATE", label: "Only me" },
    ]);
  });
});

describe("audienceLabel", () => {
  it("names each stored value in the owner's words", () => {
    expect(audienceLabel("PUBLIC")).toBe("Everyone");
    expect(audienceLabel("FRIENDS")).toBe("Friends");
    expect(audienceLabel("PRIVATE")).toBe("Only me");
  });

  it("throws on anything else rather than inventing a label", () => {
    expect(() => audienceLabel("SECRET" as never)).toThrow("not a sharing audience");
  });
});

describe("isSharingAudience", () => {
  it("accepts exactly the three stored values", () => {
    for (const v of ["PUBLIC", "FRIENDS", "PRIVATE"]) expect(isSharingAudience(v)).toBe(true);
    for (const v of ["public", "Everyone", "", null, undefined, 1]) expect(isSharingAudience(v)).toBe(false);
  });
});

describe("notSavedLine", () => {
  it("says the save failed and names what is still stored", () => {
    expect(notSavedLine("PUBLIC")).toBe("Not saved. Still set to Everyone.");
    expect(notSavedLine("FRIENDS")).toBe("Not saved. Still set to Friends.");
    expect(notSavedLine("PRIVATE")).toBe("Not saved. Still set to Only me.");
  });
});

describe("profileWriteSaved", () => {
  it("is true only when exactly one row came back with no error", () => {
    expect(profileWriteSaved({ data: [{ id: "u1" }], error: null })).toBe(true);
  });

  it("is false for a refused write, a write that matched no row, or no data", () => {
    expect(profileWriteSaved({ data: null, error: { message: "permission denied" } })).toBe(false);
    expect(profileWriteSaved({ data: [], error: null })).toBe(false);
    expect(profileWriteSaved({ data: null, error: null })).toBe(false);
  });
});

describe("ownNotesLine", () => {
  it("tells the author who can see their notes", () => {
    expect(ownNotesLine("PUBLIC")).toBe("Everyone can see these");
    expect(ownNotesLine("FRIENDS")).toBe("Your friends can see these");
    expect(ownNotesLine("PRIVATE")).toBe("Only you can see these");
  });
});

describe("SHARING_COPY", () => {
  it("carries the spec's §7.6 strings and the settings anchor", () => {
    expect(SHARING_COPY).toEqual({
      cardTitle: "Sharing",
      sectionId: "sharing",
      settingsHref: "/profile/edit#sharing",
      cellarLabel: "Who can see your cellar",
      cellarHelp:
        "Your bottles and where you keep them. What you paid, where you bought them and your private notes stay yours.",
      notesLabel: "Who can see your tasting notes",
      notesHelp:
        "Applies to every note you write. A note on a wine in your own unrevealed flight stays hidden until the reveal.",
      cellarControlLabel: "Visible to",
    });
  });

  it("links to the card's own id", () => {
    expect(SHARING_COPY.settingsHref.endsWith(`#${SHARING_COPY.sectionId}`)).toBe(true);
  });
});
