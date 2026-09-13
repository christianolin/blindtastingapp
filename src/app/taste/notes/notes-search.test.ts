import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeT, uiStrings } from "../../../lib/wset/i18n";
import {
  NOTE_FILTERS,
  PAGE_SIZE,
  archiveRowTitle,
  dayLabel,
  filterCounts,
  glassNumbers,
  groupByMonth,
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

const t = makeT("en");
const tDa = makeT("da");

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

// Every key the Tasting notes page reads from makeT's dictionaries (the
// sheet's own words, such as the section names, are the sheet's to cover).
const NOTES_KEYS = [
  "tasting_notes", "taste_and_rate_a_wine", "new_note_short", "notes_one", "notes_many",
  "complete_one", "complete_many", "average_score", "since_when", "no_notes_line",
  "search_notes_label", "search_notes_placeholder", "search_notes_placeholder_short",
  "clear_search", "notes_filters_label", "filter_all", "filter_complete", "filter_unfinished",
  "filter_from_tastings", "newest_first", "section_done", "not_finished", "section_state",
  "from_a_tasting", "glass_n", "untitled_wine", "show_n_more", "open_note_on", "not_scored",
  "score_points", "no_notes_title", "no_notes_hint", "no_notes_match", "empty_complete",
  "empty_unfinished", "empty_from_tastings", "loading_notes",
];

// The page's own files: every literal t("…") in them must be a real key,
// because makeT prints a missing key verbatim instead of failing.
const PAGE_FILES = [
  "./page.tsx",
  "./loading.tsx",
  "./notes-list.tsx",
  "./notes-filters.tsx",
  "./notes-search.ts",
  "./notes-data.ts",
];

const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort();

describe("copy — through makeT", () => {
  const en = uiStrings("en");
  const da = uiStrings("da");

  it("every key the page uses has a non-empty English and Danish entry with the same placeholders", () => {
    for (const key of NOTES_KEYS) {
      expect(en[key]?.trim(), key).toBeTruthy();
      expect(da[key]?.trim(), key).toBeTruthy();
      expect(placeholders(da[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("every literal t(\"…\") in the page's files is a key in both dictionaries", () => {
    let checked = 0;
    for (const file of PAGE_FILES) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      const keys = [...source.matchAll(/\bt\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
      checked += keys.length;
      for (const key of keys) {
        expect(en[key], `${file}: ${key}`).toBeTruthy();
        expect(da[key], `${file}: ${key}`).toBeTruthy();
      }
    }
    // A file may only hand `t` on (notes-data.ts does), but the scan as a
    // whole must find the page's calls, or the pattern itself has broken.
    expect(checked).toBeGreaterThan(20);
  });

  it("fills vars, and the sheet's section names come from the same dictionary", () => {
    expect(t("notes_many", { n: 34 })).toBe("34 notes");
    expect(t("appearance")).toBe("Appearance");
    expect(t("conclusion_short")).toBe("Conclusion");
    expect(tDa("conclusion_short")).toBe("Konklusion");
    expect(tDa("tasting_notes")).toBe("Smagsnoter");
  });

  it("shares one entry with All tastings for the chip and paging words", () => {
    expect(t("filter_all")).toBe("All");
    expect(t("newest_first")).toBe("Newest first");
    expect(tDa("show_n_more", { n: 20 })).toBe("Vis 20 flere");
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
