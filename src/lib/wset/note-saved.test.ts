import { describe, expect, it } from "vitest";
import type { StorageLike } from "../safe-storage";
import { emptyNoteState } from "./note-state";
import type { NoteSummary } from "./note-summary";
import {
  FRESH_VISIT,
  NOTES_ARCHIVE_HREF,
  NOTE_SAVED_COPY,
  NOTE_SAVED_DISMISSED_KEY,
  dismissNoteSaved,
  noteAttachment,
  noteSavedAttachSentence,
  noteSavedLine,
  noteSavedOutcome,
  noteSavedReport,
  shouldShowNoteSaved,
  type NoteSavedReport,
} from "./note-saved";

// A working localStorage stand-in that exposes what was written.
function memoryStorage() {
  const store = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
  return { store, get: () => storage };
}

// Site data blocked: the accessor itself throws.
const throwing = (): StorageLike => {
  throw new Error("SecurityError");
};
// A full store: reads work, writes throw.
const quota = (): StorageLike => ({
  getItem: () => null,
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
});

function summary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return { sections: [], done: 16, total: 18, complete: false, score: 85, ...overrides };
}

function report(overrides: Partial<NoteSavedReport> = {}): NoteSavedReport {
  return {
    savedId: "note-1",
    summary: summary(),
    title: "Château Cabrières, Châteauneuf-du-Pape AOC 1992",
    isNewNote: true,
    attachment: "catalog",
    ...overrides,
  };
}

describe("the flag (R6 'Don't show this again', stored through safe-storage)", () => {
  it("has one per-device key", () => {
    expect(NOTE_SAVED_DISMISSED_KEY).toBe("blindr:note-saved-dismissed");
  });

  it("dismissing writes that key through safe-storage and persists", () => {
    const mem = memoryStorage();
    const result = dismissNoteSaved(mem.get);
    expect(result.persisted).toBe(true);
    expect(result.visit.dismissed).toBe(true);
    expect(mem.store.get(NOTE_SAVED_DISMISSED_KEY)).toBe("1");
  });

  it("a failed write returns false but the visit still keeps the flag", () => {
    for (const getStorage of [throwing, quota, () => null]) {
      const result = dismissNoteSaved(getStorage);
      expect(result.persisted).toBe(false);
      expect(result.visit.dismissed).toBe(true);
    }
  });
});

describe("when the confirmation shows", () => {
  it("after the first save of a new note, with nothing dismissed", () => {
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, memoryStorage().get)).toBe(true);
  });

  it("never after an edit", () => {
    expect(shouldShowNoteSaved(report({ isNewNote: false }), FRESH_VISIT, memoryStorage().get)).toBe(false);
  });

  it("never without a saved note id", () => {
    expect(shouldShowNoteSaved(report({ savedId: "" }), FRESH_VISIT, memoryStorage().get)).toBe(false);
  });

  it("a missing or throwing storage reads as not dismissed, so it still shows", () => {
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, throwing)).toBe(true);
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, () => null)).toBe(true);
  });

  it("a leftover value it did not write is not the flag", () => {
    const leftover: StorageLike = { getItem: () => "true", setItem: () => undefined };
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, () => leftover)).toBe(true);
  });

  it("once dismissed with a working storage, it stays hidden on the next visit too", () => {
    const mem = memoryStorage();
    const { visit } = dismissNoteSaved(mem.get);
    expect(shouldShowNoteSaved(report(), visit, mem.get)).toBe(false);
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, mem.get)).toBe(false);
  });

  it("once dismissed with a failing storage, it stays hidden for the visit and returns on a new one", () => {
    const { visit } = dismissNoteSaved(quota);
    expect(shouldShowNoteSaved(report(), visit, quota)).toBe(false);
    expect(shouldShowNoteSaved(report(), FRESH_VISIT, quota)).toBe(true);
  });

  it("an edit never reads the storage", () => {
    let reads = 0;
    const counting: StorageLike = {
      getItem: () => {
        reads += 1;
        return null;
      },
      setItem: () => undefined,
    };
    shouldShowNoteSaved(report({ isNewNote: false }), FRESH_VISIT, () => counting);
    expect(reads).toBe(0);
  });
});

describe("what each action does (every action closes the confirmation)", () => {
  it("Done stays where you are, and remembers only a ticked box", () => {
    expect(noteSavedOutcome("done", false)).toEqual({ href: null, remember: false });
    expect(noteSavedOutcome("done", true)).toEqual({ href: null, remember: true });
  });

  it("See all notes goes to Tasting notes, and remembers only a ticked box", () => {
    expect(NOTES_ARCHIVE_HREF).toBe("/taste/notes");
    expect(noteSavedOutcome("see-all", false)).toEqual({ href: "/taste/notes", remember: false });
    expect(noteSavedOutcome("see-all", true)).toEqual({ href: "/taste/notes", remember: true });
  });

  it("Escape or the backdrop is Done", () => {
    expect(noteSavedOutcome("dismiss", false)).toEqual(noteSavedOutcome("done", false));
    expect(noteSavedOutcome("dismiss", true)).toEqual(noteSavedOutcome("done", true));
  });

  it("the phone's text action closes and remembers", () => {
    expect(noteSavedOutcome("dont-show", false)).toEqual({ href: null, remember: true });
  });
});

describe("where the note went", () => {
  it("a catalog wine, an unidentified bottle, or a hidden glass not yet revealed", () => {
    expect(noteAttachment({ catalogWineId: "w1", unidentifiedWineId: null })).toBe("catalog");
    expect(noteAttachment({ catalogWineId: null, unidentifiedWineId: "u1" })).toBe("bottle");
    expect(noteAttachment({ catalogWineId: null, unidentifiedWineId: null })).toBe("pending-reveal");
  });

  it("the second sentence branches on it, verbatim", () => {
    expect(noteSavedAttachSentence("catalog")).toBe(
      "It is also attached to this wine in the catalog, so you will see it next time you look the wine up.",
    );
    expect(noteSavedAttachSentence("bottle")).toBe("It is also attached to this bottle.");
    expect(noteSavedAttachSentence("pending-reveal")).toBe(
      "It will attach to the wine when the glass is revealed.",
    );
  });
});

describe("the copy (T6 / T6b)", () => {
  it("the fixed words", () => {
    expect(NOTE_SAVED_COPY.heading).toBe("Note saved");
    expect(
      NOTE_SAVED_COPY.whereLead + NOTE_SAVED_COPY.whereStrong + NOTE_SAVED_COPY.whereTail,
    ).toBe("It is in Tasting notes, under Taste — every note you write lives there.");
    expect(NOTE_SAVED_COPY.whereStrong).toBe("Tasting notes");
    expect(NOTE_SAVED_COPY.seeAll).toBe("See all notes");
    expect(NOTE_SAVED_COPY.done).toBe("Done");
    expect(NOTE_SAVED_COPY.dontShow).toBe("Don’t show this again");
  });

  it("the line under the heading", () => {
    expect(noteSavedLine(report())).toBe(
      "Château Cabrières, Châteauneuf-du-Pape AOC 1992 · scored 85 · 16 of 18 assessed",
    );
  });

  it("an unscored note says so, as the archive does", () => {
    expect(noteSavedLine(report({ summary: summary({ score: null, done: 3 }) }))).toBe(
      "Château Cabrières, Châteauneuf-du-Pape AOC 1992 · not scored · 3 of 18 assessed",
    );
  });

  it("a nameless wine drops the title rather than printing an empty segment", () => {
    expect(noteSavedLine(report({ title: "  " }))).toBe("scored 85 · 16 of 18 assessed");
  });
});

describe("the report NewNoteModal hands on after a save", () => {
  it("a first save of a new note, summarised with the wine's style", () => {
    const saved = { ...emptyNoteState(), qualityScore: 91 };
    const r = noteSavedReport({
      savedId: "note-9",
      saved,
      style: "SPARKLING",
      title: "Krug Grande Cuvée",
      catalogWineId: "w1",
    });
    expect(r.savedId).toBe("note-9");
    expect(r.isNewNote).toBe(true);
    expect(r.attachment).toBe("catalog");
    expect(r.title).toBe("Krug Grande Cuvée");
    expect(r.summary.total).toBe(19);
    // The score is one of the Conclusion's three assessments.
    expect(r.summary.done).toBe(1);
    expect(r.summary.score).toBe(91);
    expect(noteSavedLine(r)).toBe("Krug Grande Cuvée · scored 91 · 1 of 19 assessed");
  });

  it("a note that already had an id is an edit", () => {
    const r = noteSavedReport({
      savedId: "note-9",
      saved: { ...emptyNoteState(), id: "note-9" },
      style: "STILL",
      title: "Any wine",
      catalogWineId: "w1",
    });
    expect(r.isNewNote).toBe(false);
    expect(shouldShowNoteSaved(r, FRESH_VISIT, memoryStorage().get)).toBe(false);
  });

  it("an unknown style counts as still, and the identity picks the sentence", () => {
    const r = noteSavedReport({
      savedId: "note-2",
      saved: emptyNoteState(),
      style: null,
      title: "Tasting · Glass 2",
      catalogWineId: null,
      unidentifiedWineId: null,
    });
    expect(r.summary.total).toBe(18);
    expect(r.attachment).toBe("pending-reveal");
  });
});
