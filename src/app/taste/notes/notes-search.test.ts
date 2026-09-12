import { describe, expect, it } from "vitest";
import { makeT } from "../../../lib/wset/i18n";
import {
  NOTES_COPY,
  NOTE_FILTERS,
  PAGE_SIZE,
  archiveRowTitle,
  dayLabel,
  filterCounts,
  glassNumbers,
  groupByMonth,
  makeNotesT,
  matchesFilter,
  matchesQuery,
  monthYearLabel,
  normalizeSearch,
  noteSearchText,
  notesStats,
  sectionsLabel,
  showMoreCount,
  sortNewestFirst,
  statsLine,
  type NoteArchiveRow,
} from "./notes-search";

const t = makeNotesT("en");
const tDa = makeNotesT("da");

function flags(done: boolean[]) {
  const keys = ["appearance", "nose", "palate", "conclusion_short"];
  return done.map((complete, i) => ({ labelKey: keys[i], complete }));
}

function row(overrides: Partial<NoteArchiveRow> = {}): NoteArchiveRow {
  return {
    id: "n1",
    catalogWineId: "w1",
    title: "Château Cabrières, Châteauneuf-du-Pape AOC 1992",
    imageUrl: null,
    tastedOn: "2026-09-11",
    createdAt: "2026-09-11T18:00:00Z",
    score: 85,
    tastingWineId: null,
    tastingName: null,
    sections: flags([true, true, false, true]),
    complete: false,
    searchText: "",
    ...overrides,
  };
}

describe("copy", () => {
  it("has a Danish entry for every English key", () => {
    expect(Object.keys(NOTES_COPY.da).sort()).toEqual(Object.keys(NOTES_COPY.en).sort());
  });

  it("adds no key the WSET sheet's chrome table already defines", () => {
    const sheet = makeT("en");
    for (const key of Object.keys(NOTES_COPY.en)) expect(sheet(key)).toBe(key);
  });

  it("fills vars and falls back to makeT for the sheet's section names", () => {
    expect(t("notes_many", { n: 34 })).toBe("34 notes");
    expect(t("appearance")).toBe("Appearance");
    expect(t("conclusion_short")).toBe("Conclusion");
    expect(tDa("conclusion_short")).toBe("Konklusion");
    expect(tDa("tasting_notes")).toBe("Smagsnoter");
  });
});

describe("search", () => {
  it("folds case and accents", () => {
    expect(normalizeSearch("  Château  PÉTRUS ")).toBe("chateau petrus");
  });

  it("finds a note by wine title, grape, aroma (English or Danish) or its free text", () => {
    const searchText = noteSearchText({
      title: "Château Cabrières, Châteauneuf-du-Pape AOC 1992",
      grapes: ["Grenache", null],
      // Real lexicon words: "Red cherry" is "rød kirsebær", "Leather" is "læder".
      aromas: ["Red cherry", "Leather"],
      tasterNotes: "Ate it with lamb shoulder.",
    });
    const r = row({ searchText });
    expect(matchesQuery(r, "chateauneuf")).toBe(true);
    expect(matchesQuery(r, "grenache")).toBe(true);
    expect(matchesQuery(r, "LEATHER")).toBe(true);
    expect(matchesQuery(r, "kirsebær")).toBe(true);
    expect(matchesQuery(r, "læder")).toBe(true);
    expect(matchesQuery(r, "lamb shoulder")).toBe(true);
    expect(matchesQuery(r, "cherry lamb")).toBe(true);
    expect(matchesQuery(r, "cherry riesling")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesQuery(row({ searchText: "" }), "   ")).toBe(true);
  });
});

describe("filters", () => {
  const rows = [
    row({ id: "a", complete: true }),
    row({ id: "b", complete: false, tastingWineId: "g1" }),
    row({ id: "c", complete: true, tastingWineId: "g2" }),
    row({ id: "d", complete: false }),
  ];

  it("lists the four chips in order", () => {
    expect(NOTE_FILTERS).toEqual(["all", "complete", "unfinished", "from_tastings"]);
  });

  it("keys From tastings on the tasting glass, whatever the context", () => {
    expect(matchesFilter(row({ tastingWineId: "g1" }), "from_tastings")).toBe(true);
    expect(matchesFilter(row({ tastingWineId: null }), "from_tastings")).toBe(false);
  });

  it("counts every chip over the same rows (a note can sit under several)", () => {
    expect(filterCounts(rows)).toEqual({
      all: 4,
      complete: 2,
      unfinished: 2,
      from_tastings: 2,
    });
    expect(rows.filter((r) => matchesFilter(r, "unfinished")).map((r) => r.id)).toEqual([
      "b",
      "d",
    ]);
  });
});

describe("order, months and paging", () => {
  it("sorts newest tasted first, then newest written", () => {
    const sorted = sortNewestFirst([
      row({ id: "old", tastedOn: "2026-08-01", createdAt: "2026-08-01T10:00:00Z" }),
      row({ id: "same-early", tastedOn: "2026-09-04", createdAt: "2026-09-04T09:00:00Z" }),
      row({ id: "same-late", tastedOn: "2026-09-04", createdAt: "2026-09-04T21:00:00Z" }),
      row({ id: "new", tastedOn: "2026-09-11", createdAt: "2026-09-01T10:00:00Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "same-late", "same-early", "old"]);
  });

  it("groups by month, naming the year only outside the current one", () => {
    const groups = groupByMonth(
      [
        row({ id: "a", tastedOn: "2026-09-11" }),
        row({ id: "b", tastedOn: "2026-09-01" }),
        row({ id: "c", tastedOn: "2026-08-21" }),
        row({ id: "d", tastedOn: "2024-03-05" }),
      ],
      "en",
      2026,
    );
    expect(groups.map((g) => [g.key, g.label, g.rows.map((r) => r.id)])).toEqual([
      ["2026-09", "September", ["a", "b"]],
      ["2026-08", "August", ["c"]],
      ["2024-03", "March 2024", ["d"]],
    ]);
    expect(groupByMonth([row({ tastedOn: "2026-03-05" })], "da", 2026)[0].label).toBe("marts");
  });

  it("prints the day as the handoff does, in both languages", () => {
    expect(dayLabel("2026-09-11", "en")).toBe("11 Sep");
    expect(dayLabel("2026-05-01", "en")).toBe("1 May");
    expect(dayLabel("2026-09-11", "da")).toBe("11. sep.");
    expect(monthYearLabel("2024-03-05", "en")).toBe("March 2024");
    expect(monthYearLabel("2024-03-05", "da")).toBe("marts 2024");
  });

  it("offers the next page, never more than what is left", () => {
    expect(showMoreCount(34, PAGE_SIZE)).toBe(Math.min(PAGE_SIZE, 34 - PAGE_SIZE));
    expect(showMoreCount(PAGE_SIZE + 3, PAGE_SIZE)).toBe(3);
    expect(showMoreCount(5, 20)).toBe(0);
  });
});

describe("header stats", () => {
  const rows = [
    row({ id: "a", complete: true, score: 91, tastedOn: "2026-09-09" }),
    row({ id: "b", complete: false, score: 86, tastedOn: "2024-03-05" }),
    row({ id: "c", complete: false, score: null, tastedOn: "2026-09-11" }),
  ];

  it("counts notes and complete ones, averages the scored ones, dates the first", () => {
    expect(notesStats(rows)).toEqual({
      notes: 3,
      complete: 1,
      average: 89,
      since: "2024-03-05",
    });
    expect(notesStats([])).toEqual({ notes: 0, complete: 0, average: null, since: null });
  });

  it("writes the long desktop line and the short phone line", () => {
    const stats = notesStats(rows);
    expect(statsLine(t, stats, "en", "long")).toBe(
      "3 notes · 1 complete · average 89 · since March 2024",
    );
    expect(statsLine(t, stats, "en", "short")).toBe("3 notes · average 89");
    expect(statsLine(tDa, stats, "da", "long")).toBe(
      "3 noter · 1 færdig · gennemsnit 89 · siden marts 2024",
    );
  });

  it("drops the average when nothing is scored, and says so when there are no notes", () => {
    const unscored = notesStats([row({ score: null, complete: false, tastedOn: "2026-09-11" })]);
    expect(statsLine(t, unscored, "en", "long")).toBe(
      "1 note · 0 complete · since September 2026",
    );
    expect(statsLine(t, unscored, "en", "short")).toBe("1 note");
    expect(statsLine(t, notesStats([]), "en", "long")).toBe("No notes yet");
  });
});

describe("row model", () => {
  it("titles a catalog note by its wine", () => {
    expect(
      archiveRowTitle({ wineTitle: "Casa Raia 2018", tastingName: "Tuscany", glassNumber: 2 }, t),
    ).toBe("Casa Raia 2018");
  });

  it("titles a note with no wine yet by its tasting and glass", () => {
    expect(
      archiveRowTitle(
        { wineTitle: null, tastingName: "Nebbiolo vs Sangiovese", glassNumber: 3 },
        t,
      ),
    ).toBe("Nebbiolo vs Sangiovese · Glass 3");
    expect(
      archiveRowTitle({ wineTitle: null, tastingName: "Nebbiolo vs Sangiovese", glassNumber: null }, t),
    ).toBe("Nebbiolo vs Sangiovese");
    expect(archiveRowTitle({ wineTitle: null, tastingName: null, glassNumber: null }, t)).toBe(
      "Untitled wine",
    );
  });

  it("numbers glasses in list order within each tasting", () => {
    const numbers = glassNumbers([
      { id: "g3", tasting_id: "t1", position: 5 },
      { id: "g1", tasting_id: "t1", position: 1 },
      { id: "g2", tasting_id: "t1", position: 2 },
      { id: "h1", tasting_id: "t2", position: 4 },
    ]);
    expect([...numbers.entries()].sort()).toEqual([
      ["g1", 1],
      ["g2", 2],
      ["g3", 3],
      ["h1", 1],
    ]);
  });

  it("reads the four bars out for a screen reader", () => {
    expect(sectionsLabel(t, flags([true, true, false, true]))).toBe(
      "Appearance section done · Nose section done · Palate not finished · Conclusion section done",
    );
  });
});
