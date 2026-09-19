import { SET_PASSWORD_PATH, hasPasswordFlag, setPasswordHref } from "./paths";

// The password step. An account created by an email invite (platform or
// tasting) is signed in straight from the link and never picks a password,
// so after signing out, or on another device, it cannot get back in. The
// session middleware (src/lib/supabase/middleware.ts) sends such an account
// to the set-password page on every page it opens until the set-password
// action writes the `password_set` flag. Pure, so the whole rule is tested
// here; the middleware only feeds it the request and the user.

/** The two fields of a Supabase `User` the rule reads. */
export type PasswordGateUser = {
  invited_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** An invited account that has not yet chosen a password. */
export function needsPassword(user: PasswordGateUser | null | undefined): boolean {
  return user != null && Boolean(user.invited_at) && !hasPasswordFlag(user.user_metadata);
}

// Never gated, as a whole first segment ("/login" and "/login/forgot", not
// "/loginx"):
// - /auth: set-password itself, /auth/confirm, /auth/confirm-hash and
//   /auth/callback (the links that create the session in the first place);
// - /login, /signup: signing in as someone else must stay possible;
// - /api: no API route exists today; anything added there answers a script,
//   not a person, and must not get an HTML redirect;
// - /_next: framework requests the matcher in src/proxy.ts does not already
//   exclude (the dev HMR socket, for one).
const OPEN_SEGMENTS = ["auth", "login", "signup", "api", "_next"];

// Generated metadata images (src/app/apple-icon.tsx is served at
// /apple-icon, with no extension). A redirect would hand the icon fetch an
// HTML page.
const METADATA_IMAGE_SEGMENTS = new Set(["apple-icon", "icon", "opengraph-image", "twitter-image"]);

// A last segment like "calendar.ics" or "export.csv": a file download from a
// route handler (src/app/tastings/[id]/calendar.ics/route.ts,
// .../export.csv/route.ts) or a static file, never a page. At least one
// character before the dot, so "/.well-known" is not a file.
const FILE_EXTENSION = /[^/.]\.[A-Za-z0-9]+$/;

/**
 * True for a request the password step applies to: a GET or HEAD page
 * request outside the allowlist. Server actions POST, so they are never
 * gated (the set-password action itself is one).
 */
export function isPasswordGatedRequest(method: string, pathname: string): boolean {
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;

  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  if (OPEN_SEGMENTS.includes(first)) return false;

  const last = segments[segments.length - 1] ?? "";
  if (METADATA_IMAGE_SEGMENTS.has(last)) return false;
  if (FILE_EXTENSION.test(last)) return false;

  return true;
}

/**
 * Where the password step sends a gated request: the set-password page, with
 * the request's own path and query as `next` so the user lands back where
 * they were going. `next` goes through setPasswordHref's safeNext, so a
 * path that could leave the site is dropped rather than carried along.
 */
export function passwordStepTarget(
  pathname: string,
  search: string,
): { pathname: string; search: string } {
  const href = setPasswordHref(`${pathname}${search}`);
  const queryAt = href.indexOf("?");
  return queryAt === -1
    ? { pathname: SET_PASSWORD_PATH, search: "" }
    : { pathname: href.slice(0, queryAt), search: href.slice(queryAt) };
}

/**
 * The redirect target for this request, or null to let it through. The
 * middleware applies the target to a clone of `request.nextUrl`.
 */
export function passwordStepRedirect(
  user: PasswordGateUser | null | undefined,
  request: { method: string; pathname: string; search: string },
): { pathname: string; search: string } | null {
  if (!needsPassword(user)) return null;
  if (!isPasswordGatedRequest(request.method, request.pathname)) return null;
  return passwordStepTarget(request.pathname, request.search);
}
