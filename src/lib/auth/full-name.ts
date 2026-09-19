// The one place a first and last name become the name shown everywhere
// (profiles.display_name). Signup and the invited-account set-password step
// ask for the two parts; Profile & settings edits the combined name.

export const FIRST_NAME_REQUIRED = "Please enter your first name.";

function clean(part: string): string {
  return part.trim().replace(/\s+/g, " ");
}

/** "First Last", the last name left out when blank; whitespace trimmed and collapsed. */
export function fullName(first: string, last: string): string {
  return [clean(first), clean(last)].filter(Boolean).join(" ");
}
