import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NOTES_FETCHED,
  NOTES_SHOWN,
  NOTE_CONTENT_COLUMNS,
  OTHERS_NOTE_SELECT,
  PROFILE_NOTE_SELECT,
  SHARED_NOTES_COPY,
  cappedFooter,
  contextBadge,
  noteHasContent,
  noteSummaryLine,
  orderNotes,
  scoreLine,
  showAllLabel,
  tastedLine,
  toOthersNoteRows,
  toProfileNoteRows,
  visibleNotes,
  type NoteContentRow,
  type RawOthersNote,
  type RawProfileNote,
} from "./shared-notes-view";

// Sharing defaults spec 2026-09-27 S16, §7.1-§7.3.

const EMPTY: NoteContentRow = {
  clarity: null,
  appearance_intensity: null,
  colour_hue: null,
  condition: null,
  nose_intensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  alcohol: null,
  body: null,
  mousse: null,
  flavour_intensity: null,
  finish: null,
  quality_score: null,
  price_category: null,
  readiness: null,
  taster_notes: "",
};

describe("noteHasContent", () => {
  it("is false for the empty placeholder 'Save all to ratings' writes", () => {
    expect(noteHasContent(EMPTY, 0)).toBe(false);
  });

  it("is true for an aroma alone", () => {
    expect(noteHasContent(EMPTY, 1)).toBe(true);
  });

  it("is true for free text alone, false for whitespace alone", () => {
    expect(noteHasContent({ ...EMPTY, taster_notes: "Lovely" }, 0)).toBe(true);
    expect(noteHasContent({ ...EMPTY, taster_notes: "  \n\t " }, 0)).toBe(false);
    expect(noteHasContent({ ...EMPTY, taster_notes: null }, 0)).toBe(false);
  });

  it("is true for a score alone, and for any one assessment alone", () => {
    expect(noteHasContent({ ...EMPTY, quality_score: 88 }, 0)).toBe(true);
    for (const column of NOTE_CONTENT_COLUMNS) {
      expect(noteHasContent({ ...EMPTY, [column]: "X" }, 0), column).toBe(true);
    }
  });

  it("counts mousse on any wine, as the SQL twin does (unlike the sheet's still-wine progress)", () => {
    expect(noteHasContent({ ...EMPTY, mousse: "CREAMY" }, 0)).toBe(true);
  });
});

describe("NOTE_CONTENT_COLUMNS is M2's noted rule, column for column", () => {
  const sql = readFileSync("supabase/migrations/20260927150000_sharing_defaults_flip.sql", "utf8").replace(
    /\r\n/g,
    "\n",
  );
  const noted = sql.slice(sql.indexOf("create temp table _sd_noted"), sql.indexOf("drop table if exists pg_temp._sd_counts_before"));

  it("lists the same 17 columns in the same order inside num_nonnulls", () => {
    const inner = noted.slice(noted.indexOf("num_nonnulls(") + "num_nonnulls(".length, noted.indexOf(") > 0"));
    const columns = inner.split(",").map((c) => c.trim().replace(/^n\./, ""));
    expect(columns).toEqual([...NOTE_CONTENT_COLUMNS]);
  });

  it("treats free text as content only with a non-space character, and any aroma row as content", () => {
    expect(noted).toContain("n.taster_notes ~ '\\S'");
    expect(noted).toContain("exists (select 1 from public.wset_note_aromas a where a.note_id = n.id)");
    expect(noted).toContain("not public.wset_note_held(n.id)");
    expect(noted).toContain("n.catalog_wine_id is not null");
  });
});

describe("noteSummaryLine", () => {
  it("joins up to four distinct aroma words, case-insensitively deduped, first spelling kept", () => {
    expect(
      noteSummaryLine({
        aromaWords: ["blackcurrant", "Blackcurrant", "cedar", " vanilla ", "", "violet", "leather"],
        tasterNotes: "ignored when there are aromas",
      }),
    ).toBe("blackcurrant, cedar, vanilla, violet");
  });

  it("falls back to the free text, whitespace collapsed", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: "  Firm,\n  long finish. " })).toBe("Firm, long finish.");
  });

  it("cuts long free text at a word boundary to at most 90 characters plus an ellipsis", () => {
    const text =
      "A deep ruby wine with a nose of dark cherries and a whisper of smoke that opens slowly into cedar and graphite";
    const line = noteSummaryLine({ aromaWords: [], tasterNotes: text });
    expect(line).toBe(
      "A deep ruby wine with a nose of dark cherries and a whisper of smoke that opens slowly…",
    );
    expect(line!.length).toBeLessThanOrEqual(91);
    expect(text.startsWith(line!.slice(0, -1))).toBe(true);
  });

  it("keeps free text of exactly 90 characters whole", () => {
    const text = "x".repeat(90);
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: text })).toBe(text);
  });

  it("hard-cuts one unbroken word longer than 90 characters", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: "y".repeat(120) })).toBe(`${"y".repeat(90)}…`);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    const text = `${"word ".repeat(16)}ending, more words after the cut here and beyond`;
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: text })).toBe(`${"word ".repeat(16)}ending…`);
  });

  it("is null with neither aromas nor text", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: null })).toBeNull();
    expect(noteSummaryLine({ aromaWords: ["  "], tasterNotes: "   " })).toBeNull();
  });
});

describe("orderNotes", () => {
  it("orders tasted_on desc, then created_at desc, then id desc", () => {
    const rows = [
      { id: "a", tasted_on: "2026-09-01", created_at: "2026-09-01T10:00:00+00:00" },
      { id: "c", tasted_on: "2026-09-02", created_at: "2026-09-02T09:00:00+00:00" },
      { id: "b", tasted_on: "2026-09-02", created_at: "2026-09-02T09:00:00+00:00" },
      { id: "d", tasted_on: "2026-09-02", created_at: "2026-09-02T11:00:00+00:00" },
    ];
    expect(orderNotes(rows).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      { id: "a", tasted_on: "2026-09-01", created_at: "x" },
      { id: "b", tasted_on: "2026-09-02", created_at: "x" },
    ];
    orderNotes(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the cap", () => {
  const rows = Array.from({ length: 7 }, (_, i) => i);

  it("shows five until expanded, then all", () => {
    expect(NOTES_SHOWN).toBe(5);
    expect(visibleNotes(rows, false)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleNotes(rows, true)).toEqual(rows);
  });

  it("offers Show all only past five", () => {
    expect(showAllLabel(5)).toBeNull();
    expect(showAllLabel(6)).toBe("Show all 6 notes");
  });

  it("says the list is cut only when the fetch hit its cap of 50", () => {
    expect(NOTES_FETCHED).toBe(50);
    expect(cappedFooter(49)).toBeNull();
    expect(cappedFooter(50)).toBe("Showing the 50 most recent notes.");
  });
});

describe("badges, score and date lines", () => {
  it("badges Blind and Training, and nothing else", () => {
    expect(contextBadge("BLIND")).toBe("Blind");
    expect(contextBadge("TRAINING")).toBe("Training");
    expect(contextBadge("OPEN")).toBeNull();
    expect(contextBadge(null)).toBeNull();
  });

  it("shows the score with its band word, or Not scored", () => {
    expect(scoreLine(92)).toBe("92 · Outstanding");
    expect(scoreLine(null)).toBe("Not scored");
  });

  it("dates the read view's author line", () => {
    expect(tastedLine("2026-09-27")).toBe("Tasted 27 Sep 2026");
  });

  it("carries the spec's fixed strings", () => {
    expect(SHARED_NOTES_COPY).toEqual({
      othersHeading: "Notes from others",
      profileHeading: "Tasting notes",
      profileHeadingOwn: "Your tasting notes",
      profileEmptyOwn: "No tasting notes yet.",
      change: "Change",
      showFewer: "Show fewer",
      notScored: "Not scored",
      heldTag: "Hidden from others",
      readEyebrow: "Tasting note",
      nothingRecorded: "Nothing recorded yet.",
    });
  });
});

describe("the selects", () => {
  it("read every content column, so noteHasContent never sees a missing one as empty", () => {
    for (const select of [OTHERS_NOTE_SELECT, PROFILE_NOTE_SELECT]) {
      for (const column of [...NOTE_CONTENT_COLUMNS, "taster_notes"]) {
        expect(select.split(/[\s,()]+/)).toContain(column);
      }
    }
  });

  it("embed the author by its foreign key, and the profile's wine as an inner join", () => {
    expect(OTHERS_NOTE_SELECT).toContain("author:profiles!wset_notes_author_id_fkey(id, display_name, avatar_url)");
    expect(PROFILE_NOTE_SELECT).toContain("catalog_wine:catalog_wines!inner(");
  });
});

const raw = (over: Partial<RawOthersNote> = {}): RawOthersNote => ({
  ...EMPTY,
  id: "n1",
  author_id: "u2",
  catalog_wine_id: "w1",
  context_kind: "OPEN",
  tasted_on: "2026-09-20",
  created_at: "2026-09-20T10:00:00+00:00",
  quality_score: 90,
  aromas: [{ term: { term: "cedar" } }],
  author: { id: "u2", display_name: "Gustav", avatar_url: null },
  ...over,
});

describe("toOthersNoteRows", () => {
  it("shapes a note into a row with two separate destinations", () => {
    expect(toOthersNoteRows([raw()], "w1")).toEqual([
      {
        id: "n1",
        href: "/catalog/w1/notes/n1",
        tastedOn: "2026-09-20",
        dateLabel: "20 Sep 2026",
        badge: null,
        score: "90 · Outstanding",
        summary: "cedar",
        author: { id: "u2", name: "Gustav", avatarUrl: null, href: "/u/u2" },
      },
    ]);
  });

  it("drops empty placeholders and rows without an author, and orders newest first", () => {
    const rows = toOthersNoteRows(
      [
        raw({ id: "old", tasted_on: "2026-09-01" }),
        raw({ id: "empty", quality_score: null, aromas: [] }),
        raw({ id: "orphan", author: null }),
        raw({ id: "new", tasted_on: "2026-09-25", author: [{ id: "u3", display_name: "Ida", avatar_url: "a.png" }] }),
      ],
      "w1",
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0].author).toEqual({ id: "u3", name: "Ida", avatarUrl: "a.png", href: "/u/u3" });
  });
});

describe("toProfileNoteRows", () => {
  const wine = {
    wine_name: "Grand Vin",
    vintage_kind: "YEAR" as const,
    vintage_year: 2015,
    vintage_tawny_years: null,
    image_url: "wine.jpg",
    producer: { name: "Château Margaux" },
    appellation: [{ name: "Margaux AOC" }],
  };
  const profileRaw = (over: Partial<RawProfileNote> = {}): RawProfileNote => {
    const { author: _author, ...rest } = raw();
    void _author;
    return { ...rest, catalog_wine: wine, ...over };
  };

  it("titles each row by its wine, links to the note and marks held ones", () => {
    expect(toProfileNoteRows([profileRaw({ context_kind: "BLIND" })], new Set(["n1"]))).toEqual([
      {
        id: "n1",
        href: "/catalog/w1/notes/n1",
        tastedOn: "2026-09-20",
        dateLabel: "20 Sep 2026",
        badge: "Blind",
        score: "90 · Outstanding",
        summary: "cedar",
        wineTitle: "Château Margaux Grand Vin Margaux AOC 2015",
        imageUrl: "wine.jpg",
        held: true,
      },
    ]);
  });

  it("drops a row whose wine did not come back, and empty placeholders", () => {
    const rows = toProfileNoteRows(
      [
        profileRaw({ id: "gone", catalog_wine: null }),
        profileRaw({ id: "empty", quality_score: null, aromas: null }),
        profileRaw({ id: "kept" }),
      ],
      new Set(),
    );
    expect(rows.map((r) => [r.id, r.held])).toEqual([["kept", false]]);
  });
});
