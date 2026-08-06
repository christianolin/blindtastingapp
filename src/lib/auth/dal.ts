import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
// Extension-ful on purpose: the sibling modules under src/lib/auth are loaded
// directly by the scripts/*.test.mjs suites under `node --experimental-strip-types`,
// and Node's ESM resolver does not guess extensions the way a bundler does.
import { SESSION_COOKIE } from "./session.ts";
import { resolveUserFromToken, type AuthUser } from "./user.ts";

export type { AuthUser };

// THE security boundary. src/proxy.ts does an optimistic cookie-presence check
// for redirect UX only; every real authorization decision resolves here, as
// close to the data as we can get it.
//
// cache() memoises for one render pass, so a page whose layout, page and three
// server components all ask for the user performs exactly one query.
//
// The decision itself lives in ./user.ts: importing `next/headers` makes a
// module unloadable by Node's ESM resolver, and an unloadable security boundary
// is an untested one. What is left here is cookie plumbing.
export const getOptionalUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveUserFromToken(token);
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}
