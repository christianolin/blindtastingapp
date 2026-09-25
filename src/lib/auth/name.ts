// The one name a person goes by everywhere (profiles.display_name). Signup
// and the invited account's welcome step (/auth/set-password, setup mode)
// each ask for it in ONE field; Profile & settings edits the same value.
// There are no separate parts on purpose: from 2026-09-19 both forms asked
// for two and joined them, and a welcome step that pre-filled a whole
// invited name into the first box saved "Carsten Olin Olin"
// (docs/superpowers/specs/2026-09-25-account-name-step-design.md).
// Pure module with no imports at all, so vitest can load it and
// password-copy.ts can reuse it.

/** The longest name anyone can save, in characters (Unicode code points). */
export const NAME_MAX = 80;

// Owner copy (spec §4), verbatim.
export const NAME_LABEL = "Your name";
export const NAME_HINT = "How you'll appear to other tasters.";
export const NAME_REQUIRED = "Please enter your name.";
export const NAME_TOO_LONG = "Please use a shorter name (80 characters at most).";

/** Trims both ends and collapses every run of whitespace to one space. Never joins, adds or drops a word. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The server's rule for a submitted name (spec D2): normalised, then refused
 * when empty or longer than NAME_MAX. The length is counted in code points
 * after normalising, so an emoji or an accented letter is one character and
 * surrounding spaces never count.
 */
export function checkName(raw: string): { name: string } | { error: string } {
  const name = normalizeName(raw);
  if (!name) return { error: NAME_REQUIRED };
  if (Array.from(name).length > NAME_MAX) return { error: NAME_TOO_LONG };
  return { name };
}

function titleCase(part: string): string {
  const [head = "", ...rest] = Array.from(part);
  return head.toUpperCase() + rest.join("").toLowerCase();
}

/**
 * A readable name suggested from an email address (spec D3): the local part
 * split on ".", "_", "-" and digits, each part title-cased, joined with
 * spaces: "carsten.olin" gives "Carsten Olin", "cdo" gives "Cdo", "jens_h2"
 * gives "Jens H". Any other character stays inside its part. When nothing is
 * left (a local part of only digits or separators) it is the raw local part,
 * so it is empty only when the local part itself is.
 */
export function suggestNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const pretty = local
    .split(/[._0-9-]+/)
    .filter(Boolean)
    .map(titleCase)
    .join(" ");
  return pretty || local;
}
