// A saved note as prose, for the read-only note view (sharing-defaults spec
// 2026-09-27 S17, §7.4): composeLiveNote over the note's state, in English,
// section by section in NOTE_CAPTIONS order, the same words and order as the
// live note its author saw while writing it. Empty sections are left out.
// Pure: relative imports only, so vitest loads it.
import { labelsFor, makeT, noteConnectors, translateBand } from "../wset/i18n";
import { composeLiveNote } from "../wset/live-note.mjs";
import { NOTE_CAPTIONS } from "../wset/note-captions";
import { qualityBand } from "../wset/quality-curve.mjs";
import type { WsetNoteState } from "../wset/types";

export type NoteReadSection = { caption: string; prose: string };

export function noteReadSections(
  state: WsetNoteState,
  termLabels: ReadonlyMap<string, string>,
): NoteReadSection[] {
  const t = makeT("en");
  const composed = composeLiveNote(state, termLabels, labelsFor("en"), {
    ...noteConnectors("en"),
    band: (score: number) => translateBand(qualityBand(score), "en"),
  });
  return NOTE_CAPTIONS.flatMap(({ key, uiKey }) => {
    const prose = composed[key];
    return typeof prose === "string" && prose ? [{ caption: t(uiKey), prose }] : [];
  });
}

export type NoteRouteMode = "not-found" | "editor" | "read";

/**
 * What `/catalog/[wineId]/notes/[noteId]` renders (spec S17, §7.4). The note
 * row comes back only when the "wset notes read" policy admits the viewer,
 * so a hidden note, a missing id, a note on another wine and a wine the
 * viewer cannot read all get the same answer: not found. The author gets the
 * editor; anyone else the read view.
 */
export function noteRouteMode(input: {
  wineFound: boolean;
  note: { author_id: string; catalog_wine_id: string | null } | null;
  wineId: string;
  viewerId: string;
}): NoteRouteMode {
  if (!input.wineFound || !input.note || input.note.catalog_wine_id !== input.wineId) return "not-found";
  return input.note.author_id === input.viewerId ? "editor" : "read";
}
