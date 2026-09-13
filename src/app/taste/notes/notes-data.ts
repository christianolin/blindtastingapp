// Everything the Tasting notes archive (/taste/notes) reads: the signed-in
// author's own notes with their wine, their tasting glass and its tasting's
// name, and their aroma rows, shaped into NoteArchiveRow. The notes read
// policy is public (`using (true)`), so the author filter here is the privacy
// boundary, never RLS. Tasting names come through the author's own membership
// under the wines / tastings read policies; a glass the author can no longer
// read just loses its name. Not a server action: only the page calls it.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarizeNoteRow, type WsetNoteRow } from "@/lib/wset/note-summary";
import { catalogWineTitle } from "@/lib/wset/queries";
import { makeT } from "@/lib/wset/i18n";
import type { WineStyle } from "@/lib/wset/types";
import {
  NOTES_LANG,
  archiveRowTitle,
  glassNumbers,
  noteSearchText,
  sortNewestFirst,
  type NoteArchiveRow,
} from "./notes-search";

const t = makeT(NOTES_LANG);

// PostgREST answers at most 1000 rows per request, so the author's notes are
// read page by page in a stable order, and the glass lookup goes in id chunks.
// One page and one chunk for everyone today.
const ROW_PAGE = 1000;
const ID_CHUNK = 100;

type One<T> = T | T[] | null;

function one<T>(rel: One<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function nameOf(rel: One<{ name: string }> | undefined): string | null {
  return one(rel ?? null)?.name ?? null;
}

type WineEmbed = {
  wine_name: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY" | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  style: WineStyle | null;
  producer: One<{ name: string }>;
  appellation: One<{ name: string }>;
  primary_grape: One<{ name: string }>;
  secondary_grape: One<{ name: string }>;
};

type AromaEmbed = {
  term_id: string;
  sensed_on_nose: boolean;
  sensed_on_palate: boolean;
  term: One<{ term: string }>;
};

type RawNote = Omit<WsetNoteRow, "catalog_wine_id"> & {
  // Nullable in the live schema (a note on an unidentified wine); the
  // hand-written database types still say string.
  catalog_wine_id: string | null;
  catalog_wine: One<WineEmbed & { image_url: string | null }>;
  unidentified_wine: One<WineEmbed>;
  tasting_wine: One<{
    id: string;
    tasting_id: string;
    position: number;
    tasting: One<{ name: string }>;
  }>;
  aromas: AromaEmbed[] | null;
};

const WINE_FIELDS =
  "wine_name, vintage_kind, vintage_year, vintage_tawny_years, style, " +
  "producer:producers(name), appellation:appellations(name)";

// One read per page: the note, its wine (catalog or unidentified) with its
// grapes, its tasting glass with the tasting's name, and its aroma rows with
// their words. wines → tastings needs the FK hint: tastings.current_wine_id is
// a second relationship between the two tables, and without the hint
// PostgREST refuses the whole query (PGRST201).
const NOTE_SELECT = [
  "*",
  `catalog_wine:catalog_wines(${WINE_FIELDS}, image_url, ` +
    "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
    "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
  `unidentified_wine:catalog_wines_unidentified(${WINE_FIELDS}, ` +
    "primary_grape:grapes!catalog_wines_unidentified_primary_grape_id_fkey(name), " +
    "secondary_grape:grapes!catalog_wines_unidentified_secondary_grape_id_fkey(name))",
  "tasting_wine:wines(id, tasting_id, position, tasting:tastings!wines_tasting_id_fkey(name))",
  "aromas:wset_note_aromas(term_id, sensed_on_nose, sensed_on_palate, term:wset_aroma_terms(term))",
].join(", ");

// The wine's display title, or null when the wine has nothing to be named by
// (then the tasting and glass name the row).
function wineTitle(wine: WineEmbed | null): string | null {
  if (!wine) return null;
  const producerName = nameOf(wine.producer);
  if (!producerName && !wine.wine_name) return null;
  return catalogWineTitle({
    producerName,
    wineName: wine.wine_name,
    vintageKind: wine.vintage_kind ?? "YEAR",
    vintageYear: wine.vintage_year,
    vintageTawnyYears: wine.vintage_tawny_years,
    appellationName: nameOf(wine.appellation),
  });
}

async function readNotes(authorId: string): Promise<RawNote[]> {
  const supabase = await createClient();
  const notes: RawNote[] = [];
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .from("wset_notes")
      .select(NOTE_SELECT)
      .eq("author_id", authorId)
      .order("tasted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ROW_PAGE - 1);
    // An empty archive would be a lie here, so a failed read fails the page.
    if (error) throw new Error(`Tasting notes: the notes read failed (${error.message})`);
    const page = (data ?? []) as unknown as RawNote[];
    notes.push(...page);
    if (page.length < ROW_PAGE) break;
  }
  return notes;
}

// Glass numbers for the tastings whose glasses have no wine to name them by.
async function readGlassNumbers(tastingIds: string[]): Promise<Map<string, number>> {
  const numbers = new Map<string, number>();
  if (tastingIds.length === 0) return numbers;
  const supabase = await createClient();
  for (let i = 0; i < tastingIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("wines")
      .select("id, tasting_id, position")
      .in("tasting_id", tastingIds.slice(i, i + ID_CHUNK));
    if (error) {
      // The rows still render, titled by the tasting name alone.
      console.error("Tasting notes: the glass read failed", error);
      break;
    }
    for (const [id, n] of glassNumbers(data ?? [])) numbers.set(id, n);
  }
  return numbers;
}

/** The author's notes as archive rows, newest first. */
export async function getNotesArchive(authorId: string): Promise<NoteArchiveRow[]> {
  const notes = await readNotes(authorId);

  const wines = notes.map((note) => one(note.catalog_wine) ?? one(note.unidentified_wine));
  const wineTitles = wines.map(wineTitle);
  const namelessTastingIds = new Set<string>();
  notes.forEach((note, i) => {
    const glass = one(note.tasting_wine);
    if (wineTitles[i] === null && glass) namelessTastingIds.add(glass.tasting_id);
  });
  const glassNo = await readGlassNumbers([...namelessTastingIds]);

  const rows = notes.map((note, i): NoteArchiveRow => {
    const wine = wines[i];
    const glass = one(note.tasting_wine);
    const tastingName = one(glass?.tasting ?? null)?.name ?? null;
    const aromaRows = note.aromas ?? [];
    // noteStateFromRow reads the assessment columns only; the embeds ride along.
    const summary = summarizeNoteRow(
      note as unknown as WsetNoteRow,
      aromaRows,
      wine?.style ?? null,
    );
    const title = archiveRowTitle(
      {
        wineTitle: wineTitles[i],
        tastingName,
        glassNumber: glass ? (glassNo.get(glass.id) ?? null) : null,
      },
      t,
    );
    const aromaWords = [
      ...new Set(
        aromaRows
          .map((a) => one(a.term)?.term)
          .filter((term): term is string => Boolean(term)),
      ),
    ];
    return {
      id: note.id,
      catalogWineId: note.catalog_wine_id,
      title,
      imageUrl: one(note.catalog_wine)?.image_url ?? null,
      tastedOn: note.tasted_on,
      createdAt: note.created_at,
      score: note.quality_score,
      tastingWineId: note.tasting_wine_id,
      tastingName,
      sections: summary.sections.map((s) => ({ labelKey: s.labelKey, complete: s.complete })),
      complete: summary.complete,
      searchText: noteSearchText({
        title,
        grapes: [nameOf(wine?.primary_grape), nameOf(wine?.secondary_grape)],
        aromas: aromaWords,
        tasterNotes: note.taster_notes,
      }),
    };
  });

  return sortNewestFirst(rows);
}
