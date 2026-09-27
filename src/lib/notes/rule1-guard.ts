// The notes Rule 1 guard's refusal (sharing-defaults spec 2026-09-27 S12,
// §5.3; supabase/migrations/20260927140000_sharing_defaults.sql:
// wset_notes_rule1_guard). Pure, relative imports only (the
// src/lib/catalog/rule1-guard.ts pattern), so vitest loads it.

/** The exact message the guard raises; rule1-guard.test.ts pins it to the migration file. */
export const NOTE_RULE1_MESSAGE =
  "This wine is in one of your flights that hasn't been revealed yet. Change or delete this note after the reveal.";

/** The guard's refusal of the author's own write: 42501 with exactly that
    message. RLS's own 42501s ("new row violates row-level security policy …") are not this. */
export function isNoteRule1Refusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return error?.code === "42501" && error?.message === NOTE_RULE1_MESSAGE;
}

/** The name that marks a save error the note sheet shows word for word. */
export const NOTE_SAVE_REFUSAL = "NoteSaveRefusal";

/** A save error the sheet shows as a sentence (every other error keeps the
    bare "Retry save"). */
export function noteSaveRefusal(message: string): Error {
  const error = new Error(message);
  error.name = NOTE_SAVE_REFUSAL;
  return error;
}

/** The sentence to show under the sheet's Save for a thrown save error, or null. */
export function saveRefusalMessage(error: unknown): string | null {
  return error instanceof Error && error.name === NOTE_SAVE_REFUSAL ? error.message : null;
}
