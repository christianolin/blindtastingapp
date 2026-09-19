// The set-password page's two modes, its `?next=` rule and its copy. Pure
// module: no Supabase client, no React, no framework import. Imports stay
// relative so vitest (no "@/" alias) can load it.
//
// setup — an account made by an email invite (platform or tasting) that has
//         never chosen a password; the session middleware sends it here.
// reset — the "Forgot password?" email's link, which lands here with
//         `?reason=reset` (RESET_NEXT) once /auth/confirm has made a session.
import { sameSiteNext } from "./login-copy";
import { PASSWORD_SET_FLAG, SET_PASSWORD_PATH } from "./paths";

export type PasswordMode = "setup" | "reset";

/** Where the page sends you when the link carried no destination. */
export const PASSWORD_DEFAULT_NEXT = "/overview";

type Param = string | readonly string[] | null | undefined;

function first(raw: Param): string | null {
  if (typeof raw === "string") return raw;
  return raw?.[0] ?? null;
}

/** `?reason=reset` is reset mode; anything else, or nothing, is setup. */
export function passwordMode(reason: Param): PasswordMode {
  return first(reason) === "reset" ? "reset" : "setup";
}

/**
 * The page's destination once the password is saved: a same-site path from
 * `?next=` (sameSiteNext: safeNext plus the control-character and backslash
 * rule), never the set-password page itself, else PASSWORD_DEFAULT_NEXT.
 * The page and the action both run it — the action never trusts the hidden
 * field the page rendered.
 */
export function passwordNext(raw: Param): string {
  const safe = sameSiteNext(first(raw));
  if (!safe || safe.startsWith(SET_PASSWORD_PATH)) return PASSWORD_DEFAULT_NEXT;
  return safe;
}

export type PasswordCopy = {
  title: string;
  lead: string;
  /** null in reset mode: the name field is not shown. */
  nameLabel: string | null;
  passwordLabel: string;
  hint: string;
  submit: string;
  pending: string;
  /** The action's line when the session is gone by the time it runs. */
  expired: string;
};

const HINT = "At least 6 characters.";
const PENDING = "Saving…";

const COPY: Record<PasswordMode, PasswordCopy> = {
  setup: {
    title: "Welcome to Blindr",
    lead: "Choose a password so you can sign in again on any device.",
    nameLabel: "Your name",
    passwordLabel: "Choose a password",
    hint: HINT,
    submit: "Save and continue",
    pending: PENDING,
    expired: "Your invite link has expired. Ask the person who invited you for a new one.",
  },
  reset: {
    title: "Choose a new password",
    lead: "Pick a new password for your Blindr account.",
    nameLabel: null,
    passwordLabel: "New password",
    hint: HINT,
    submit: "Save password",
    pending: PENDING,
    expired: "This link has expired. Ask for a new one from the sign-in page.",
  },
};

export function passwordCopy(mode: PasswordMode): PasswordCopy {
  return COPY[mode];
}

/**
 * Where the page sends a visitor with no session. A reset link that made no
 * session failed, so it lands on the sign-in page's failed-link line (with
 * its "Send a new one"); setup has nothing better than plain sign-in.
 */
export function signedOutRedirect(mode: PasswordMode): string {
  return mode === "reset" ? "/login?error=auth_callback_failed" : "/login";
}

/**
 * The `user_metadata` the action writes together with the password: always
 * the password_set flag (which ends the middleware's password step), and in
 * setup mode the name — only when there is one, so an empty field never
 * blanks a name the account already has.
 */
export function passwordUpdateData(
  mode: PasswordMode,
  displayName: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = { [PASSWORD_SET_FLAG]: true };
  if (mode === "setup" && displayName.trim()) data.display_name = displayName;
  return data;
}
