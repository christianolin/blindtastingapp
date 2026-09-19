import { safeNext } from "../safe-next";

// The one place the password pages' paths and the "has chosen a password"
// flag are spelled. An account created by an email invite (platform or
// tasting) is signed in straight from the link and never picks a password;
// the session middleware sends it to SET_PASSWORD_PATH until the flag below
// is set, and the login page's "Forgot password?" leads to
// FORGOT_PASSWORD_PATH, whose emailed link comes back through RESET_NEXT.

export const SET_PASSWORD_PATH = "/auth/set-password";
export const FORGOT_PASSWORD_PATH = "/login/forgot";

/** Where a password-reset link lands once the session exists. */
export const RESET_NEXT = `${SET_PASSWORD_PATH}?reason=reset`;

/**
 * `user_metadata` key the set-password action writes as `true` together
 * with the password. Only `true` counts; a user can write their own
 * metadata, but setting it only ever skips their own password step.
 */
export const PASSWORD_SET_FLAG = "password_set";

export function hasPasswordFlag(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.[PASSWORD_SET_FLAG] === true;
}

/**
 * The set-password page's href. `next` goes through safeNext, and a `next`
 * that is itself the set-password page is dropped so the page never chains
 * onto itself.
 */
export function setPasswordHref(next: string | null, reason?: "reset"): string {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  const safe = safeNext(next);
  if (safe && !safe.startsWith(SET_PASSWORD_PATH)) params.set("next", safe);
  const query = params.toString();
  return query ? `${SET_PASSWORD_PATH}?${query}` : SET_PASSWORD_PATH;
}
