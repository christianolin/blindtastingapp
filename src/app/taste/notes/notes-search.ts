// Pure rules for the Tasting notes archive (/taste/notes; Taste & Rate ledger
// R4, map NOTE-09..19, critic MISSED-13): the page's copy, the search haystack
// and matching, the filter chips and their counts, the newest-first order, the
// month groups, "Show N more", the header stats line and the row model's title
// rule. No Next, React or Supabase import: vitest's node environment loads it
// through relative imports, and notes-data.ts feeds it the author's own rows.
import { makeT, translateTerm, type WsetLang } from "../../../lib/wset/i18n";

// --- Copy --------------------------------------------------------------------
// Every new string on this page, EN + DA, shaped like i18n.ts's UI_EN / UI_DA
// (snake_case keys, `{var}` fills, no key UI_EN already has) so the two tables
// can be pasted into makeT's dictionaries once i18n.ts is free to edit. Keys
// this page shares with All tastings (filter_all, newest_first, show_n_more)
// carry the same words there. Anything not here, such as the section names on
// the bars, falls through to makeT itself.
type Dict = Record<string, string>;

const EN: Dict = {
  tasting_notes: "Tasting notes",
  taste_and_rate_a_wine: "Taste & rate a wine",
  new_note_short: "+ Note",
  notes_one: "1 note",
  notes_many: "{n} notes",
  complete_one: "1 complete",
  complete_many: "{n} complete",
  average_score: "average {avg}",
  since_when: "since {when}",
  no_notes_line: "No notes yet",
  search_notes_label: "Search your notes",
  search_notes_placeholder: "Search your notes — wine, grape, aroma, even a phrase you wrote",
  search_notes_placeholder_short: "Search wine, grape, aroma…",
  clear_search: "Clear search",
  notes_filters_label: "Filter notes",
  filter_all: "All",
  filter_complete: "Complete",
  filter_unfinished: "Unfinished",
  filter_from_tastings: "From tastings",
  newest_first: "Newest first",
  section_done: "section done",
  not_finished: "not finished",
  section_state: "{section} {state}",
  from_a_tasting: "from a tasting",
  glass_n: "Glass {n}",
  untitled_wine: "Untitled wine",
  show_n_more: "Show {n} more",
  open_note_on: "Open the note on {wine}",
  not_scored: "not scored",
  score_points: "{n} points",
  no_notes_title: "No tasting notes yet",
  no_notes_hint: "Every note you write lives here. Start with Taste & rate a wine.",
  no_notes_match: "No notes match “{q}”.",
  empty_complete: "No complete notes yet.",
  empty_unfinished: "Every note here is complete.",
  empty_from_tastings: "No notes from tastings yet.",
  loading_notes: "Gathering your notes…",
};

const DA: Dict = {
  tasting_notes: "Smagsnoter",
  taste_and_rate_a_wine: "Smag og bedøm en vin",
  new_note_short: "+ Note",
  notes_one: "1 note",
  notes_many: "{n} noter",
  complete_one: "1 færdig",
  complete_many: "{n} færdige",
  average_score: "gennemsnit {avg}",
  since_when: "siden {when}",
  no_notes_line: "Ingen noter endnu",
  search_notes_label: "Søg i dine noter",
  search_notes_placeholder: "Søg i dine noter — vin, drue, aroma, selv en sætning, du skrev",
  search_notes_placeholder_short: "Søg vin, drue, aroma…",
  clear_search: "Ryd søgningen",
  notes_filters_label: "Filtrér noter",
  filter_all: "Alle",
  filter_complete: "Færdige",
  filter_unfinished: "Ufærdige",
  filter_from_tastings: "Fra smagninger",
  newest_first: "Nyeste først",
  section_done: "afsnit færdigt",
  not_finished: "ikke færdigt",
  section_state: "{section}: {state}",
  from_a_tasting: "fra en smagning",
  glass_n: "Glas {n}",
  untitled_wine: "Unavngiven vin",
  show_n_more: "Vis {n} flere",
  open_note_on: "Åbn noten om {wine}",
  not_scored: "ingen point",
  score_points: "{n} point",
  no_notes_title: "Ingen smagsnoter endnu",
  no_notes_hint: "Alle noter, du skriver, samles her. Start med Smag og bedøm en vin.",
  no_notes_match: "Ingen noter matcher “{q}”.",
  empty_complete: "Ingen færdige noter endnu.",
  empty_unfinished: "Alle noter her er færdige.",
  empty_from_tastings: "Ingen noter fra smagninger endnu.",
  loading_notes: "Samler dine noter…",
};

export const NOTES_COPY: Record<WsetLang, Dict> = { en: EN, da: DA };

export type NotesT = (key: string, vars?: Record<string, string | number>) => string;

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

/** makeT's contract (English fallback, `{var}` fills) over this page's table, then makeT. */
export function makeNotesT(lang: WsetLang): NotesT {
  const page = NOTES_COPY[lang];
  const sheet = makeT(lang);
  return (key, vars) => {
    const own = page[key] ?? EN[key];
    return own === undefined ? sheet(key, vars) : fill(own, vars);
  };
}

/**
 * The page's language. Pinned to English, like All tastings: the app header,
 * the sidebar and every neighbouring page are English-only, so following the
 * note sheet's own EN/DA toggle would render a half-translated page. Flip it
 * once the app grows an app-level language.
 */
export const NOTES_LANG: WsetLang = "en";

// --- Row model -----------------------------------------------------------------

export type NoteSectionFlag = {
  /** makeT key naming the section ("appearance", "nose", "palate", "conclusion_short"). */
  labelKey: string;
  /** Every assessment in the section done: the bar fills bordeaux. */
  complete: boolean;
};

/** One note in the archive, as the server hands it to the list. */
export type NoteArchiveRow = {
  id: string;
  /**
   * The catalog wine the note view opens on. Null for a note with no catalog
   * wine (an unidentified wine today, a hidden-glass note once blind B8 lands):
   * the row then has no note view to open and no catalog link.
   */
  catalogWineId: string | null;
  title: string;
  imageUrl: string | null;
  /** `tasted_on`, a plain YYYY-MM-DD date. */
  tastedOn: string;
  createdAt: string;
  /** The 100-point score; null while unscored (a minimal note). */
  score: number | null;
  /** Set when the note was written on a tasting's glass: "From tastings". */
  tastingWineId: string | null;
  /** That tasting's name, when the author can still read it. */
  tastingName: string | null;
  /** Four flags in sheet order: Appearance, Nose, Palate, Conclusion. */
  sections: NoteSectionFlag[];
  /** Every section complete (note-summary's strict rule, ledger Q6). */
  complete: boolean;
  /** `noteSearchText` of the wine title, grapes, aroma words and free text. */
  searchText: string;
};

/**
 * A row's title. The catalog (or unidentified) wine's own title when there is
 * one; otherwise the tasting's name and the glass number, which names a hidden
 * glass without leaking its answer; otherwise "Untitled wine".
 */
export function archiveRowTitle(
  input: { wineTitle: string | null; tastingName: string | null; glassNumber: number | null },
  t: NotesT,
): string {
  if (input.wineTitle) return input.wineTitle;
  if (input.tastingName) {
    return input.glassNumber !== null
      ? `${input.tastingName} · ${t("glass_n", { n: input.glassNumber })}`
      : input.tastingName;
  }
  return t("untitled_wine");
}

/** Each glass's 1-based number in its tasting's list order (position ascending). */
export function glassNumbers(
  wines: readonly { id: string; tasting_id: string; position: number }[],
): Map<string, number> {
  const byTasting = new Map<string, { id: string; position: number }[]>();
  for (const w of wines) {
    const list = byTasting.get(w.tasting_id) ?? [];
    list.push(w);
    byTasting.set(w.tasting_id, list);
  }
  const numbers = new Map<string, number>();
  for (const list of byTasting.values()) {
    list
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .forEach((w, i) => numbers.set(w.id, i + 1));
  }
  return numbers;
}

/** The four bars read out: "Appearance section done · Nose not finished · …". */
export function sectionsLabel(t: NotesT, sections: readonly NoteSectionFlag[]): string {
  return sections
    .map((s) =>
      t("section_state", {
        section: t(s.labelKey),
        state: t(s.complete ? "section_done" : "not_finished"),
      }),
    )
    .join(" · ");
}

// --- Search --------------------------------------------------------------------

/** Lower-cased, accent-folded, single-spaced: "Château" finds "chateau". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One searchable string per note: the wine title, its grapes, every aroma word
 * the note picked (uncapped, in English and in Danish) and the taster's own
 * words, each normalized.
 */
export function noteSearchText(parts: {
  title: string;
  grapes: readonly (string | null | undefined)[];
  aromas: readonly string[];
  tasterNotes: string | null | undefined;
}): string {
  const fields = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = s ? normalizeSearch(s) : "";
    if (n) fields.add(n);
  };
  add(parts.title);
  for (const grape of parts.grapes) add(grape);
  for (const aroma of parts.aromas) {
    add(aroma);
    add(translateTerm(aroma, "da"));
  }
  add(parts.tasterNotes);
  return [...fields].join(" | ");
}

/** Every word of the query appears somewhere in the note. */
export function matchesQuery(row: Pick<NoteArchiveRow, "searchText">, query: string): boolean {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  return tokens.every((token) => row.searchText.includes(token));
}

// --- Filters -------------------------------------------------------------------

export type NoteFilter = "all" | "complete" | "unfinished" | "from_tastings";

export const NOTE_FILTERS: readonly NoteFilter[] = [
  "all",
  "complete",
  "unfinished",
  "from_tastings",
];

/**
 * The chips overlap (a note can be Complete and From tastings at once).
 * From tastings keys on the tasting glass, never on `context_kind`: the group
 * Taste & Rate board writes tasting-linked notes as OPEN.
 */
export function matchesFilter(
  row: Pick<NoteArchiveRow, "complete" | "tastingWineId">,
  filter: NoteFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "complete":
      return row.complete;
    case "unfinished":
      return !row.complete;
    case "from_tastings":
      return row.tastingWineId !== null;
  }
}

export function filterCounts(
  rows: readonly Pick<NoteArchiveRow, "complete" | "tastingWineId">[],
): Record<NoteFilter, number> {
  const counts: Record<NoteFilter, number> = {
    all: 0,
    complete: 0,
    unfinished: 0,
    from_tastings: 0,
  };
  for (const row of rows) {
    for (const filter of NOTE_FILTERS) if (matchesFilter(row, filter)) counts[filter] += 1;
  }
  return counts;
}

// --- Order, months, paging -------------------------------------------------------

/** Rows revealed per "Show N more". */
export const PAGE_SIZE = 20;

export function showMoreCount(total: number, shown: number): number {
  return Math.max(0, Math.min(PAGE_SIZE, total - shown));
}

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** Newest tasted first; the same day, newest written first. */
export function sortNewestFirst<T extends Pick<NoteArchiveRow, "tastedOn" | "createdAt" | "id">>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => desc(a.tastedOn, b.tastedOn) || desc(a.createdAt, b.createdAt) || desc(a.id, b.id),
  );
}

// Fixed month tables rather than Intl: Node's and the browser's ICU disagree
// ("Sept" vs "Sep"), and the list renders on both sides of hydration.
const MONTHS: Record<WsetLang, { long: string[]; short: string[] }> = {
  en: {
    long: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  da: {
    long: [
      "januar", "februar", "marts", "april", "maj", "juni",
      "juli", "august", "september", "oktober", "november", "december",
    ],
    short: [
      "jan.", "feb.", "mar.", "apr.", "maj", "jun.",
      "jul.", "aug.", "sep.", "okt.", "nov.", "dec.",
    ],
  },
};

function dateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

/** "11 Sep" / "11. sep." — a `tasted_on` date needs no time zone. */
export function dayLabel(isoDate: string, lang: WsetLang): string {
  const { month, day } = dateParts(isoDate);
  const name = MONTHS[lang].short[month - 1];
  return lang === "da" ? `${day}. ${name}` : `${day} ${name}`;
}

/** "March 2024" / "marts 2024". */
export function monthYearLabel(isoDate: string, lang: WsetLang): string {
  const { year, month } = dateParts(isoDate);
  return `${MONTHS[lang].long[month - 1]} ${year}`;
}

export type MonthGroup<T> = { key: string; label: string; rows: T[] };

/** Consecutive-or-not rows grouped by month in first-seen order; the year shows outside `currentYear`. */
export function groupByMonth<T extends Pick<NoteArchiveRow, "tastedOn">>(
  rows: readonly T[],
  lang: WsetLang,
  currentYear: number,
): MonthGroup<T>[] {
  const groups = new Map<string, MonthGroup<T>>();
  for (const row of rows) {
    const key = row.tastedOn.slice(0, 7);
    let group = groups.get(key);
    if (!group) {
      const { year, month } = dateParts(row.tastedOn);
      const label =
        year === currentYear ? MONTHS[lang].long[month - 1] : monthYearLabel(row.tastedOn, lang);
      group = { key, label, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

// --- Header stats ------------------------------------------------------------------

export type NotesStats = {
  notes: number;
  complete: number;
  /** Mean of the scored notes, rounded as the Overview rounds; null when none is scored. */
  average: number | null;
  /** The earliest `tasted_on`. */
  since: string | null;
};

export function notesStats(
  rows: readonly Pick<NoteArchiveRow, "complete" | "score" | "tastedOn">[],
): NotesStats {
  let complete = 0;
  let scored = 0;
  let sum = 0;
  let since: string | null = null;
  for (const row of rows) {
    if (row.complete) complete += 1;
    if (row.score !== null) {
      scored += 1;
      sum += row.score;
    }
    if (since === null || row.tastedOn < since) since = row.tastedOn;
  }
  return {
    notes: rows.length,
    complete,
    average: scored > 0 ? Math.round(sum / scored) : null,
    since,
  };
}

/**
 * "{n} notes · {c} complete · average {avg} · since {Month YYYY}" (long,
 * desktop) or "{n} notes · average {avg}" (short, phones). Parts with nothing
 * to say drop out.
 */
export function statsLine(
  t: NotesT,
  stats: NotesStats,
  lang: WsetLang,
  form: "long" | "short",
): string {
  if (stats.notes === 0) return t("no_notes_line");
  const parts = [stats.notes === 1 ? t("notes_one") : t("notes_many", { n: stats.notes })];
  if (form === "long") {
    parts.push(
      stats.complete === 1 ? t("complete_one") : t("complete_many", { n: stats.complete }),
    );
  }
  if (stats.average !== null) parts.push(t("average_score", { avg: stats.average }));
  if (form === "long" && stats.since) {
    parts.push(t("since_when", { when: monthYearLabel(stats.since, lang) }));
  }
  return parts.join(" · ");
}
