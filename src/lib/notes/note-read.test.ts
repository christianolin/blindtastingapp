import { describe, expect, it } from "vitest";
import { labelsFor, noteConnectors } from "../wset/i18n";
import { composeLiveNote } from "../wset/live-note.mjs";
import { emptyNoteState } from "../wset/note-state";
import { noteReadSections, noteRouteMode } from "./note-read";

// The read-only note view's prose (sharing-defaults spec 2026-09-27 S17, §7.4).

const TERMS = new Map([
  ["t-cedar", "cedar"],
  ["t-cherry", "black cherry"],
]);

describe("noteReadSections", () => {
  it("is empty for a note with nothing recorded", () => {
    expect(noteReadSections(emptyNoteState(), TERMS)).toEqual([]);
  });

  it("names and orders the sections as the live note does, skipping empty ones", () => {
    const state = {
      ...emptyNoteState(),
      clarity: "CLEAR" as const,
      noseTermIds: ["t-cedar"],
      qualityScore: 91,
      tasterNotes: "Firm and long.",
    };
    const sections = noteReadSections(state, TERMS);
    expect(sections.map((s) => s.caption)).toEqual(["Appearance", "Nose", "Conclusions", "Taster"]);
    const composed = composeLiveNote(state, TERMS, labelsFor("en"), noteConnectors("en"));
    expect(sections.map((s) => s.prose)).toEqual([
      composed.appearance,
      composed.nose,
      composed.conclusions,
      composed.taster,
    ]);
    expect(sections[1].prose).toContain("cedar");
    expect(sections[3].prose).toContain("Firm and long.");
  });
});

describe("noteRouteMode", () => {
  const note = { author_id: "author", catalog_wine_id: "w1" };
  const base = { wineFound: true, note, wineId: "w1", viewerId: "author" };

  it("gives the author the editor and anyone else the read view", () => {
    expect(noteRouteMode(base)).toBe("editor");
    expect(noteRouteMode({ ...base, viewerId: "someone" })).toBe("read");
  });

  it("answers not found alike for a hidden or missing note, another wine's note, and an unreadable wine", () => {
    expect(noteRouteMode({ ...base, note: null, viewerId: "someone" })).toBe("not-found");
    expect(noteRouteMode({ ...base, note: { ...note, catalog_wine_id: "w2" } })).toBe("not-found");
    expect(noteRouteMode({ ...base, note: { ...note, catalog_wine_id: null } })).toBe("not-found");
    expect(noteRouteMode({ ...base, wineFound: false })).toBe("not-found");
  });
});
