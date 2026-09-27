import { describe, expect, it } from "vitest";
import {
  AUDIENCE_OPTIONS,
  SHARING_COPY,
  audienceLabel,
  initialWrites,
  isSharingAudience,
  notSavedLine,
  ownNotesLine,
  profileWriteSaved,
  writeAnswered,
  writeStarted,
  type SelectWrites,
  type SharingAudience,
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

describe("the select's writes (it stays enabled while it saves)", () => {
  // Starts one write per value, in order; answers them as `answers` lists
  // them ([write index, saved]); returns what each answer settled (null
  // while other writes are still in flight).
  function run(stored: SharingAudience, values: SharingAudience[], answers: [number, boolean][]) {
    let writes: SelectWrites = initialWrites(stored);
    const seqs: number[] = [];
    for (let i = 0; i < values.length; i += 1) {
      const started = writeStarted(writes);
      writes = started.writes;
      seqs.push(started.seq);
    }
    const settled: ({ value: SharingAudience; failed: boolean } | null)[] = [];
    for (const [index, saved] of answers) {
      const answered = writeAnswered(writes, seqs[index], values[index], saved);
      writes = answered.writes;
      settled.push(answered.settled);
    }
    return settled;
  }

  it("one saved write keeps the new value and says nothing", () => {
    expect(run("PUBLIC", ["FRIENDS"], [[0, true]])).toEqual([{ value: "FRIENDS", failed: false }]);
  });

  it("one failed write snaps back to the stored value and says Not saved", () => {
    expect(run("PUBLIC", ["FRIENDS"], [[0, false]])).toEqual([{ value: "PUBLIC", failed: true }]);
  });

  it("changes nothing on screen until the last write in flight answers", () => {
    const settled = run(
      "PUBLIC",
      ["FRIENDS", "PRIVATE"],
      [
        [0, true],
        [1, true],
      ],
    );
    expect(settled[0]).toBeNull();
    expect(settled[1]).toEqual({ value: "PRIVATE", failed: false });
  });

  it("two failed writes land on the stored value, never the first write's unsaved choice", () => {
    expect(
      run(
        "PUBLIC",
        ["FRIENDS", "PRIVATE"],
        [
          [0, false],
          [1, false],
        ],
      ).at(-1),
    ).toEqual({ value: "PUBLIC", failed: true });
  });

  it("a failed newest write lands on what the older write saved", () => {
    for (const answers of [
      [
        [0, true],
        [1, false],
      ],
      [
        [1, false],
        [0, true],
      ],
    ] as [number, boolean][][]) {
      expect(run("PUBLIC", ["FRIENDS", "PRIVATE"], answers).at(-1)).toEqual({ value: "FRIENDS", failed: true });
    }
  });

  it("a stale failed answer neither snaps the select back nor says Not saved", () => {
    for (const answers of [
      [
        [0, false],
        [1, true],
      ],
      [
        [1, true],
        [0, false],
      ],
    ] as [number, boolean][][]) {
      expect(run("PUBLIC", ["FRIENDS", "PRIVATE"], answers).at(-1)).toEqual({ value: "PRIVATE", failed: false });
    }
  });

  it("a later write starts clean: an earlier failure does not stick to it", () => {
    let writes = initialWrites("PUBLIC");
    const first = writeStarted(writes);
    writes = writeAnswered(first.writes, first.seq, "FRIENDS", false).writes;
    const second = writeStarted(writes);
    expect(writeAnswered(second.writes, second.seq, "PRIVATE", true).settled).toEqual({
      value: "PRIVATE",
      failed: false,
    });
  });
});
