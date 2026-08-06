import "server-only";
import type { UserRole } from "@/lib/supabase/database.types";
// Extension-ful on purpose: scripts/auth-dal.test.mjs loads this module under
// `node --experimental-strip-types`, and Node's ESM resolver does not guess
// extensions the way a bundler does.
import { query } from "./db.ts";
import { resolveSession } from "./session.ts";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
};

// The whole of "who is this request?", minus the cookie. It lives here rather
// than inside dal.ts because `next` publishes no "exports" map, so Node's ESM
// resolver cannot load a module that imports `next/headers` — and a security
// boundary that no test can import is a security boundary nobody has checked.
// dal.ts keeps the Next-facing wrapper; this keeps the decision.
//
// The join is an inner join on purpose: a profile with no auth_credentials row
// has no way to have authenticated, so it must not resolve to a user. That is
// the state every not-yet-migrated Supabase account is in.
export async function resolveUserFromToken(
  token: string,
): Promise<AuthUser | null> {
  const session = await resolveSession(token);
  if (!session) return null;

  const rows = await query<{
    id: string;
    display_name: string;
    role: UserRole;
    email: string;
    email_verified_at: Date | null;
  }>(
    `select p.id, p.display_name, p.role, c.email, c.email_verified_at
       from profiles p
       join auth_credentials c on c.user_id = p.id
      where p.id = $1`,
    [session.userId],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    // auth_credentials is the identity of record. profiles.email is a stale
    // copy that Phase 2 removes.
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
  };
}
