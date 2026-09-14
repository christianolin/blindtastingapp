// Escapes the characters PostgREST's `ilike` filter treats specially — `%`,
// `_` and the backslash escape character itself — so a typed name search
// (create step 3's "Name or email" field, spec §2.3 item 10) matches the
// text literally instead of doubling as a wildcard. One pass over the
// string, same shape as `escapeLike` in `src/app/catalog/new/actions.ts:46`
// (CLAUDE.md keeps that a private copy of the identical rule); this is the
// shared version for anything new.
export function escapeIlike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
