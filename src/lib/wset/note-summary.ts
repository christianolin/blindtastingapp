// One note-summary helper (Taste & Rate ledger R3). Per-section done/total,
// "complete", the "{d} of {t}" line and the score word for a saved note or a
// live sheet — the single source for the notes-archive header stats (T7), the
// four row bars, the after-save line (T6) and later the Overview / Your
// numbers cards. Pure: relative imports only, no React, no DB.
//
// Counting is NOT re-implemented here: it is `sectionProgress` in ./vocab
// (Appearance 3, Nose 4, Palate 8 — 9 with mousse for SPARKLING — Conclusion
// 3; observations, faults, tannin nature and free text never count) over a
// state rehydrated by `noteStateFromRow` in ./note-state. "Complete" is the
// strict rule (ledger Q6 default): every section done — 18 assessments, 19
// for a sparkling wine. The score word is quality-curve's band, translated.
import { makeT, translateBand, type WsetLang } from "./i18n";
import { emptyNoteState, noteStateFromRow } from "./note-state";
import { qualityBand } from "./quality-curve.mjs";
import type { WineStyle, WsetNoteState } from "./types";
import { sectionProgress, type SectionProgress } from "./vocab";

/** A wset_notes row as ./note-state reads it (kept in lockstep by type). */
export type WsetNoteRow = Parameters<typeof noteStateFromRow>[0];
/** One wset_note_aromas row: the term plus where it was sensed. */
export type WsetNoteAromaRow = Parameters<typeof noteStateFromRow>[1][number];

export type SectionKey = keyof SectionProgress;

/** The four sections in sheet order: Appearance, Nose, Palate, Conclusion. */
export const SECTION_KEYS: readonly SectionKey[] = [
  "appearance",
  "nose",
  "palate",
  "conclusions",
];

// The i18n chrome key that names each section (EN + DA via makeT). The
// archive's bars and the after-save line call the last one "Conclusion".
const SECTION_LABEL_KEYS: Record<SectionKey, string> = {
  appearance: "appearance",
  nose: "nose",
  palate: "palate",
  conclusions: "conclusion_short",
};

export type SectionSummary = {
  key: SectionKey;
  /** i18n key for the section's name — render with `makeT(lang)(labelKey)`. */
  labelKey: string;
  done: number;
  total: number;
  /** done >= total — the bar fills bordeaux in the archive. */
  complete: boolean;
};

export type NoteSummary = {
  /** Always four, in SECTION_KEYS order. */
  sections: SectionSummary[];
  /** Assessments done across all four sections. */
  done: number;
  /** 18, or 19 for a sparkling wine (mousse). */
  total: number;
  /** Every section done. */
  complete: boolean;
  /** The 100-point score, or null while unrated. */
  score: number | null;
};

/** Every section done. An empty section list is never complete. */
export function isComplete(sections: readonly Pick<SectionSummary, "complete">[]): boolean {
  return sections.length > 0 && sections.every((s) => s.complete);
}

// Callers pass the catalog wine's style, else the unidentified wine's style.
// null means the wine is genuinely unknown (a hidden glass before its reveal):
// mousse only counts once the wine is known to be sparkling, so an unknown
// style counts as still.
function styleOrStill(style: WineStyle | null | undefined): WineStyle {
  return style ?? "STILL";
}

/** How many assessments a note of this style has: 18, or 19 for sparkling. */
export function noteTotal(style: WineStyle | null | undefined): number {
  return summarizeNoteState(emptyNoteState(), style).total;
}

/** The summary of a live sheet (the after-save line reads the open state). */
export function summarizeNoteState(
  state: WsetNoteState,
  style: WineStyle | null | undefined,
): NoteSummary {
  const progress = sectionProgress(state, styleOrStill(style));
  const sections = SECTION_KEYS.map((key): SectionSummary => {
    const [done, total] = progress[key];
    return {
      key,
      labelKey: SECTION_LABEL_KEYS[key],
      done,
      total,
      complete: total > 0 && done >= total,
    };
  });
  return {
    sections,
    done: sections.reduce((n, s) => n + s.done, 0),
    total: sections.reduce((n, s) => n + s.total, 0),
    complete: isComplete(sections),
    score: state.qualityScore,
  };
}

/** The summary of a saved note: its wset_notes row plus its aroma rows. */
export function summarizeNoteRow(
  row: WsetNoteRow,
  aromas: readonly WsetNoteAromaRow[],
  style: WineStyle | null | undefined,
): NoteSummary {
  return summarizeNoteState(noteStateFromRow(row, [...aromas]), style);
}

/**
 * "{d} of {t}" (short — the phone header) or "{d} of {t} assessed" (long —
 * desktop and the after-save line), in the sheet's language.
 */
export function assessedOf(
  summary: Pick<NoteSummary, "done" | "total">,
  lang: WsetLang,
  form: "short" | "long" = "short",
): string {
  const t = makeT(lang);
  if (form === "long") return t("assessed_of", { done: summary.done, total: summary.total });
  return `${summary.done} ${t("of")} ${summary.total}`;
}

/**
 * The quality-band word for a score ("Very good" for 85–89), translated; null
 * while unrated. A non-integer (an average) is rounded first so the word
 * always agrees with the whole number shown beside it.
 */
export function scoreWord(score: number | null | undefined, lang: WsetLang): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return translateBand(qualityBand(Math.round(score)), lang);
}
