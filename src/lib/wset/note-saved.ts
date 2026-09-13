// After saving (Taste & Rate ledger R6; handoff T6 desktop, T6b phone): the
// confirmation that follows the first save of a new note on every
// NewNoteModal path — what was saved, its score and completeness, where it
// went — with See all notes, Done and "Don't show this again".
//
// Everything that decides something lives here: when the confirmation shows,
// the per-device flag and its key, the copy, and what each action does. The
// flag is stored only through ../safe-storage (readFlag / writeFlag, the one
// try/catch around browser storage): a missing or throwing storage reads as
// "not dismissed", so the confirmation still shows, and a failed write
// returns false while the visit keeps the flag (NoteSavedVisit, held by the
// provider).
// Pure: relative imports only, no React, no browser globals at module level.
import { readFlag, writeFlag, type StorageLike } from "../safe-storage";
import { makeT } from "./i18n";
import { assessedOf, summarizeNoteState, type NoteSummary } from "./note-summary";
import type { WineStyle, WsetNoteState } from "./types";

/** localStorage key for "Don't show this again" — per device, not per account. */
export const NOTE_SAVED_DISMISSED_KEY = "blindr:note-saved-dismissed";

/** Tasting notes, under Taste (ledger R4) — where See all notes goes. */
export const NOTES_ARCHIVE_HREF = "/taste/notes";

/**
 * What the saved note is attached to, which picks the second sentence:
 * a catalog wine; an unidentified bottle; or neither yet — a note on a hidden
 * glass (blind-tasting B8), which attaches when the glass is revealed.
 */
export type NoteAttachment = "catalog" | "bottle" | "pending-reveal";

/** What NewNoteModal hands the provider after a save. */
export type NoteSavedReport = {
  savedId: string;
  summary: NoteSummary;
  /** The wine's name as the sheet showed it. */
  title: string;
  /** The first save of a new note (the saved state had no id yet). */
  isNewNote: boolean;
  attachment: NoteAttachment;
};

/** "Don't show this again" as the running visit remembers it. */
export type NoteSavedVisit = { readonly dismissed: boolean };

/** A visit where nothing was dismissed yet. */
export const FRESH_VISIT: NoteSavedVisit = { dismissed: false };

export function noteAttachment(ids: {
  catalogWineId: string | null;
  unidentifiedWineId: string | null;
}): NoteAttachment {
  if (ids.catalogWineId) return "catalog";
  if (ids.unidentifiedWineId) return "bottle";
  return "pending-reveal";
}

/**
 * The report for a save. `saved` is the state the sheet sent to the save — its
 * id is the note's id BEFORE the save, so null means this save created it.
 * `style` is the wine's (null when unknown; counted as still, 18 assessments).
 */
export function noteSavedReport(input: {
  savedId: string;
  saved: WsetNoteState;
  style: WineStyle | null;
  title: string;
  catalogWineId: string | null;
  unidentifiedWineId?: string | null;
}): NoteSavedReport {
  return {
    savedId: input.savedId,
    summary: summarizeNoteState(input.saved, input.style),
    title: input.title,
    isNewNote: input.saved.id === null,
    attachment: noteAttachment({
      catalogWineId: input.catalogWineId,
      unidentifiedWineId: input.unidentifiedWineId ?? null,
    }),
  };
}

/**
 * Whether the confirmation shows: only after the first save of a new note
 * (never after an edit, never without a saved id), and only while neither
 * this visit nor the device's flag says "Don't show this again". An edit
 * never touches storage.
 */
export function shouldShowNoteSaved(
  report: Pick<NoteSavedReport, "savedId" | "isNewNote">,
  visit: NoteSavedVisit,
  getStorage: () => StorageLike | null,
): boolean {
  if (!report.isNewNote || !report.savedId) return false;
  if (visit.dismissed) return false;
  return !readFlag(getStorage, NOTE_SAVED_DISMISSED_KEY);
}

/**
 * "Don't show this again": write the device flag. The visit keeps the flag
 * whether or not the write stuck; `persisted` is false when it did not (no
 * storage, blocked site data, a full store), so the next visit asks again.
 */
export function dismissNoteSaved(getStorage: () => StorageLike | null): {
  visit: NoteSavedVisit;
  persisted: boolean;
} {
  return {
    visit: { dismissed: true },
    persisted: writeFlag(getStorage, NOTE_SAVED_DISMISSED_KEY),
  };
}

/** The fixed words, as drawn in T6 / T6b. "Tasting notes" is bold, not a link. */
export const NOTE_SAVED_COPY = {
  heading: "Note saved",
  whereLead: "It is in ",
  whereStrong: "Tasting notes",
  whereTail: ", under Taste — every note you write lives there.",
  seeAll: "See all notes",
  done: "Done",
  dontShow: "Don’t show this again",
} as const;

// The after-save line reads in the archive's language (R4: English), so its
// "not scored" and "{d} of {t} assessed" are the words the archive row uses.
const COPY_LANG = "en" as const;

/** "{wine} · scored {n} · {d} of {t} assessed"; an unscored note says "not scored". */
export function noteSavedLine(report: Pick<NoteSavedReport, "title" | "summary">): string {
  const { score } = report.summary;
  return [
    report.title.trim(),
    score === null ? makeT(COPY_LANG)("not_scored") : `scored ${score}`,
    assessedOf(report.summary, COPY_LANG, "long"),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

/** The second sentence of the where-it-went box. */
export function noteSavedAttachSentence(attachment: NoteAttachment): string {
  switch (attachment) {
    case "catalog":
      return "It is also attached to this wine in the catalog, so you will see it next time you look the wine up.";
    case "bottle":
      return "It is also attached to this bottle.";
    case "pending-reveal":
      return "It will attach to the wine when the glass is revealed.";
  }
}

/**
 * The confirmation's actions. "done" and "see-all" are the buttons; "dismiss"
 * is Escape or the backdrop; "dont-show" is the phone's text action.
 */
export type NoteSavedAction = "done" | "see-all" | "dismiss" | "dont-show";

/** Every action closes. `href` is where it goes (null stays put); `remember` writes the flag. */
export type NoteSavedOutcome = { href: string | null; remember: boolean };

/**
 * What an action does. `dontShowAgain` is the desktop checkbox: Done, See all
 * notes, Escape and the backdrop honour it as they close; the phone's
 * "Don't show this again" is itself the choice.
 */
export function noteSavedOutcome(action: NoteSavedAction, dontShowAgain: boolean): NoteSavedOutcome {
  switch (action) {
    case "see-all":
      return { href: NOTES_ARCHIVE_HREF, remember: dontShowAgain };
    case "dont-show":
      return { href: null, remember: true };
    case "done":
    case "dismiss":
      return { href: null, remember: dontShowAgain };
  }
}
