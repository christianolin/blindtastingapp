// The one vocabulary of the two sharing settings (sharing-defaults spec
// 2026-09-27 S6, §7.1, §7.6): who can see your cellar and who can see your
// tasting notes, each Everyone / Friends / Only me — the database's PUBLIC /
// FRIENDS / PRIVATE. Pure: a type-only import, relative paths, so vitest
// loads it.
import type { SharingAudience } from "../supabase/database.types";

export type { SharingAudience };

/** The three audiences, widest first, as every control lists them. */
export const AUDIENCE_OPTIONS: readonly { value: SharingAudience; label: string }[] = [
  { value: "PUBLIC", label: "Everyone" },
  { value: "FRIENDS", label: "Friends" },
  { value: "PRIVATE", label: "Only me" },
];

/** True for exactly the three stored values. */
export function isSharingAudience(value: unknown): value is SharingAudience {
  return value === "PUBLIC" || value === "FRIENDS" || value === "PRIVATE";
}

/** "Everyone", "Friends" or "Only me". */
export function audienceLabel(value: SharingAudience): string {
  const option = AUDIENCE_OPTIONS.find((o) => o.value === value);
  if (!option) throw new Error(`not a sharing audience: ${String(value)}`);
  return option.label;
}

/** A refused save: the control snapped back and says what is still stored. */
export function notSavedLine(value: SharingAudience): string {
  return `Not saved. Still set to ${audienceLabel(value)}.`;
}

/** A profile write counts only when it changed exactly the viewer's one row:
    RLS answers a write to a row that is not yours with no error and no row. */
export function profileWriteSaved(result: { data: readonly unknown[] | null; error: unknown }): boolean {
  return !result.error && result.data?.length === 1;
}

/** The line under "Your tasting notes" on your own profile. */
export function ownNotesLine(value: SharingAudience): string {
  switch (value) {
    case "PUBLIC":
      return "Everyone can see these";
    case "FRIENDS":
      return "Your friends can see these";
    case "PRIVATE":
      return "Only you can see these";
  }
}

/** Every fixed string of the settings surfaces (spec §7.6), owner-approved as drafted (C3). */
export const SHARING_COPY = {
  cardTitle: "Sharing",
  sectionId: "sharing",
  settingsHref: "/profile/edit#sharing",
  cellarLabel: "Who can see your cellar",
  cellarHelp:
    "Your bottles and where you keep them. What you paid, where you bought them and your private notes stay yours.",
  notesLabel: "Who can see your tasting notes",
  notesHelp:
    "Applies to every note you write. A note on a wine in your own unrevealed flight stays hidden until the reveal.",
  cellarControlLabel: "Visible to",
} as const;
