// The live-note section keys in the order the note reads, paired with the
// UI-dict key that names each one (./i18n's makeT). Shared by the WSET sheet's
// live note and the read-only note view (sharing-defaults spec §7.4), so the
// two can never order or name a section differently. Pure: a type-only import.
import type { composeLiveNote } from "./live-note.mjs";

export type NoteSectionKey = keyof ReturnType<typeof composeLiveNote>;

export const NOTE_CAPTIONS: readonly { key: NoteSectionKey; uiKey: string }[] = [
  { key: "appearance", uiKey: "appearance" },
  { key: "nose", uiKey: "nose" },
  { key: "palate", uiKey: "palate" },
  { key: "conclusions", uiKey: "conclusions" },
  { key: "taster", uiKey: "taster" },
];
