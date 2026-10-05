// What other people's notes look like wherever they show (sharing-defaults
// spec 2026-09-27 S16, §7.1-§7.3): which notes count as having content, the
// one-line summary, the order, the cap, the badges, the score line, and the
// raw PostgREST rows shaped into display rows. Pure: relative imports only,
// no React, no DB, so vitest loads it. The loaders are ./shared-notes.ts.
import { dayMonthYear } from "../cellar/format";
import { TRAINING_COPY } from "../training/copy";
import { scoreWord } from "../wset/note-summary";
import { DOSAGE_EMBED, catalogWineTitle } from "../wset/wine-title";

/** The fixed strings of the three surfaces (spec §7.2-§7.4). */
export const SHARED_NOTES_COPY = {
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
} as const;

/** Rows shown before "Show all". */
export const NOTES_SHOWN = 5;
/** Notes with content listed at most, newest first ("Showing the 50 most recent notes."). */
export const NOTES_CAP = 50;
/**
 * Rows read at most, newest first. The content rule runs after the read, so
 * the read overfetches: the empty rows "Save all to ratings" writes (6-7 per
 * flight) would otherwise fill a 50-row read and hide the notes behind them.
 * An aroma-only note is content too, which a PostgREST filter cannot say.
 */
export const NOTES_FETCHED = 200;
/** Aroma words in a summary line at most. */
export const SUMMARY_AROMAS = 4;
/** Characters of free text in a summary line at most, before the "…". */
export const SUMMARY_MAX = 90;

/**
 * The 17 assessment columns: a note with any of them set has content. The
 * SQL twin is M2's "noted" rule (supabase/migrations/20260927150000_sharing_defaults_flip.sql);
 * shared-notes-view.test.ts pins the two lists together.
 */
export const NOTE_CONTENT_COLUMNS = [
  "clarity",
  "appearance_intensity",
  "colour_hue",
  "condition",
  "nose_intensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "mousse",
  "flavour_intensity",
  "finish",
  "quality_score",
  "price_category",
  "readiness",
] as const;

export type NoteContentColumn = (typeof NOTE_CONTENT_COLUMNS)[number];
export type NoteContentRow = { [K in NoteContentColumn]: unknown } & { taster_notes: string | null };

/**
 * True when a note has something in it: an assessment, an aroma, or free
 * text with a non-space character. The empty rows "Save all to ratings"
 * writes have none of these and never show to others.
 */
export function noteHasContent(row: NoteContentRow, aromaCount: number): boolean {
  if (aromaCount > 0) return true;
  if (/\S/.test(row.taster_notes ?? "")) return true;
  return NOTE_CONTENT_COLUMNS.some((column) => row[column] !== null && row[column] !== undefined);
}

/**
 * The row's one quiet line: up to four distinct aroma words; else the free
 * text, cut at a word boundary to at most 90 characters plus "…"; else null.
 */
export function noteSummaryLine(input: { aromaWords: readonly string[]; tasterNotes: string | null }): string | null {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of input.aromaWords) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length === SUMMARY_AROMAS) break;
  }
  if (words.length > 0) return words.join(", ");

  const text = (input.tasterNotes ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= SUMMARY_MAX) return text;
  const window = text.slice(0, SUMMARY_MAX + 1);
  const space = window.lastIndexOf(" ");
  const head = (space > 0 ? window.slice(0, space) : text.slice(0, SUMMARY_MAX)).replace(/[\s,;:.]+$/, "");
  return `${head}…`;
}

type Orderable = { id: string; tasted_on: string; created_at: string };

function desc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/** tasted_on desc, created_at desc, id desc — the SQL order, again after filtering. */
export function orderNotes<T extends Orderable>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => desc(a.tasted_on, b.tasted_on) || desc(a.created_at, b.created_at) || desc(a.id, b.id),
  );
}

/** The rows on screen: the first five until "Show all" is pressed. */
export function visibleNotes<T>(rows: readonly T[], expanded: boolean): T[] {
  return expanded ? [...rows] : rows.slice(0, NOTES_SHOWN);
}

/** "Show all {n} notes" — only offered when more than five exist. */
export function showAllLabel(count: number): string | null {
  return count > NOTES_SHOWN ? `Show all ${count} notes` : null;
}

/**
 * The list a surface shows: the first NOTES_CAP rows with content (already
 * filtered and ordered), and whether it was cut there — more content rows
 * were read, or the read itself hit NOTES_FETCHED with the cap full, so older
 * notes may exist past it. A list shorter than the cap is never called cut:
 * the footer would claim 50 on screen.
 */
export function capNotes<T>(rows: readonly T[], fetched: number): { rows: T[]; capped: boolean } {
  return {
    rows: rows.slice(0, NOTES_CAP),
    capped: rows.length > NOTES_CAP || (rows.length === NOTES_CAP && fetched >= NOTES_FETCHED),
  };
}

/** The footer under a list that was cut at the cap. */
export function cappedFooter(capped: boolean): string | null {
  return capped ? `Showing the ${NOTES_CAP} most recent notes.` : null;
}

/** "Blind", "Training", or no badge (an OPEN note). */
export function contextBadge(kind: string | null): string | null {
  if (kind === "BLIND") return "Blind";
  if (kind === "TRAINING") return TRAINING_COPY.trainingBadge;
  return null;
}

/** "{n} · {band}", or "Not scored". */
export function scoreLine(score: number | null): string {
  const { value, band } = scoreParts(score);
  return band ? `${value} · ${band}` : value;
}

/** The score line in two parts, for a row that stacks the band under the
    number on a phone: "88" and "Very good", or "Not scored" and no band. */
export function scoreParts(score: number | null): { value: string; band: string | null } {
  if (score === null) return { value: SHARED_NOTES_COPY.notScored, band: null };
  return { value: String(score), band: scoreWord(score, "en") };
}

/** "Tasted 27 Sep 2026", for the read view's author line. */
export function tastedLine(tastedOn: string): string {
  return `Tasted ${dayMonthYear(tastedOn)}`;
}

// --- Raw rows (PostgREST) -> display rows ---------------------------------

type One<T> = T | T[] | null;

function one<T>(rel: One<T> | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

const CONTENT_SELECT = [...NOTE_CONTENT_COLUMNS, "taster_notes"].join(", ");
const AROMA_EMBED = "aromas:wset_note_aromas(term:wset_aroma_terms(term))";

/** "Notes from others" on a wine page: the note, its author, its aroma words. */
export const OTHERS_NOTE_SELECT = [
  "id, author_id, catalog_wine_id, context_kind, tasted_on, created_at",
  CONTENT_SELECT,
  "author:profiles!wset_notes_author_id_fkey(id, display_name, avatar_url)",
  AROMA_EMBED,
].join(", ");

/** A profile's notes: the note, its wine (inner: a wine the reader cannot read drops the row). */
export const PROFILE_NOTE_SELECT = [
  "id, author_id, catalog_wine_id, context_kind, tasted_on, created_at",
  CONTENT_SELECT,
  "catalog_wine:catalog_wines!inner(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
    `producer:producers(name), appellation:appellations(name), ${DOSAGE_EMBED})`,
  AROMA_EMBED,
].join(", ");

type RawAroma = { term: One<{ term: string }> };

export type RawSharedNote = NoteContentRow & {
  id: string;
  author_id: string;
  catalog_wine_id: string | null;
  context_kind: string | null;
  tasted_on: string;
  created_at: string;
  aromas: RawAroma[] | null;
};

export type RawOthersNote = RawSharedNote & {
  author: One<{ id: string; display_name: string; avatar_url: string | null }>;
};

export type RawProfileNote = RawSharedNote & {
  catalog_wine: One<{
    wine_name: string | null;
    vintage_kind: "YEAR" | "NV" | "TAWNY";
    vintage_year: number | null;
    vintage_tawny_years: number | null;
    image_url: string | null;
    producer: One<{ name: string }>;
    appellation: One<{ name: string }>;
    dosage?: One<{ name: string }>;
  }>;
};

export type SharedNoteRow = {
  id: string;
  href: string;
  tastedOn: string;
  dateLabel: string;
  badge: string | null;
  score: string;
  summary: string | null;
};

export type OthersNoteRow = SharedNoteRow & {
  author: { id: string; name: string; avatarUrl: string | null; href: string };
};

export type ProfileNoteRow = SharedNoteRow & {
  wineTitle: string;
  imageUrl: string | null;
  held: boolean;
  /** `score` in two parts: the number (or "Not scored") and the band under it. */
  scoreValue: string;
  scoreBand: string | null;
};

function aromaWords(raw: RawSharedNote): string[] {
  return (raw.aromas ?? []).map((a) => one(a.term)?.term ?? "").filter(Boolean);
}

function sharedRow(raw: RawSharedNote, wineId: string): SharedNoteRow {
  return {
    id: raw.id,
    href: `/catalog/${wineId}/notes/${raw.id}`,
    tastedOn: raw.tasted_on,
    dateLabel: dayMonthYear(raw.tasted_on),
    badge: contextBadge(raw.context_kind),
    score: scoreLine(typeof raw.quality_score === "number" ? raw.quality_score : null),
    summary: noteSummaryLine({ aromaWords: aromaWords(raw), tasterNotes: raw.taster_notes }),
  };
}

/** The wine page's rows: notes with content and a readable author, newest first. */
export function toOthersNoteRows(raws: readonly RawOthersNote[], wineId: string): OthersNoteRow[] {
  return orderNotes(raws)
    .filter((raw) => noteHasContent(raw, raw.aromas?.length ?? 0))
    .flatMap((raw) => {
      const author = one(raw.author);
      if (!author) return [];
      return [
        {
          ...sharedRow(raw, wineId),
          author: {
            id: author.id,
            name: author.display_name,
            avatarUrl: author.avatar_url,
            href: `/u/${author.id}`,
          },
        },
      ];
    });
}

/** A profile's rows: notes with content on a wine the reader can read, newest first. */
export function toProfileNoteRows(raws: readonly RawProfileNote[], held: ReadonlySet<string>): ProfileNoteRow[] {
  return orderNotes(raws)
    .filter((raw) => noteHasContent(raw, raw.aromas?.length ?? 0))
    .flatMap((raw) => {
      const wine = one(raw.catalog_wine);
      if (!wine || !raw.catalog_wine_id) return [];
      const score = scoreParts(typeof raw.quality_score === "number" ? raw.quality_score : null);
      return [
        {
          ...sharedRow(raw, raw.catalog_wine_id),
          scoreValue: score.value,
          scoreBand: score.band,
          wineTitle: catalogWineTitle({
            producerName: one(wine.producer)?.name ?? null,
            wineName: wine.wine_name,
            vintageKind: wine.vintage_kind,
            vintageYear: wine.vintage_year,
            vintageTawnyYears: wine.vintage_tawny_years,
            appellationName: one(wine.appellation)?.name ?? null,
            dosageName: one(wine.dosage ?? null)?.name ?? null,
          }),
          imageUrl: wine.image_url,
          held: held.has(raw.id),
        },
      ];
    });
}
