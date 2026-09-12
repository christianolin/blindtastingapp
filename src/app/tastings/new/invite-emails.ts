// The create sheet's step-3 invite list (spec §D.1 #4, create-7): the friend
// chips plus every address typed into InviteField, as the one list both the
// "Ready to go" count and the invite call use. Pure, so vitest covers it.

/**
 * Trims and lowercases every address, drops blanks and the host's own address,
 * and dedupes while keeping first-seen order (friend chips before typed ones).
 */
export function collectInviteEmails(
  selected: readonly string[],
  typed: readonly string[],
  hostEmail: string | null,
): string[] {
  const host = hostEmail?.trim().toLowerCase() || null;
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of [...selected, ...typed]) {
    const email = raw.trim().toLowerCase();
    if (!email || email === host || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}
