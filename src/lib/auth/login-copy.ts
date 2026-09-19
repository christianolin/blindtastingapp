// Copy and small rules for the sign-in page and "Forgot password?"
// (/login/forgot). Pure: no React, Next or Supabase; runtime imports are
// relative only (vitest has no `@/` alias).
//
// The forgot flow never says whether an account exists: the sent line is
// conditional ("If {email} has a Blindr account…") and Supabase answers a
// reset request for an unknown address the same way as for a known one.

import { DEFAULT_NEXT, safeNext } from "../safe-next";
import { RESET_NEXT } from "./paths";

export const LOGIN_PATH = "/login";

// ── `?next=` ────────────────────────────────────────────────────────────────

// safeNext keeps the leading "/" rule; this also refuses what a URL parser
// would rewrite into another host. The parser strips tab, CR and LF anywhere
// in the input (so "/\t/evil.example" reads as "//evil.example") and treats
// "\" as "/"; any other control character goes too. Next resolves a server
// action's redirect with `new URL(location, base)` in the browser, so a bare
// path redirect is exactly where this matters.
// Escapes, never the raw bytes: a raw control character here makes git treat
// the file as binary and hides this guard from every diff and review.
const UNSAFE_PATH_CHARS = /[\x00-\x1f\x7f\\]/;

/**
 * A same-site path from an untrusted `next`, or null. Every `next` this
 * build's auth pages and routes take goes through here (sign-in, the
 * set-password page, /auth/confirm). Anything that is not a string (a
 * repeated query param, a File from a form) is null.
 */
export function sameSiteNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const safe = safeNext(raw);
  if (safe === null || UNSAFE_PATH_CHARS.test(safe)) return null;
  return safe;
}

/** Where a successful sign-in redirects: `next` if it is same-site, else /taste. */
export function signInNext(raw: unknown): string {
  return sameSiteNext(raw) ?? DEFAULT_NEXT;
}

// ── Sign-in page ────────────────────────────────────────────────────────────

export const FORGOT_PASSWORD_LINK = "Forgot password?";

/**
 * The `?error=` value every auth link route sends a failed link back with
 * (/auth/callback, /auth/confirm, and the reset-mode set-password page).
 */
export const LINK_FAILED_ERROR = "auth_callback_failed";
export const LINK_FAILED_PATH = `${LOGIN_PATH}?error=${LINK_FAILED_ERROR}`;
export const LINK_FAILED_LINE = "That link didn't work. It may have expired or already been used.";
export const SEND_A_NEW_ONE = "Send a new one";

/** Whether the login page's `?error=` is the failed-link one (exactly). */
export function isLinkFailed(error: unknown): boolean {
  return error === LINK_FAILED_ERROR;
}

// ── Forgot page ─────────────────────────────────────────────────────────────

export const FORGOT_TITLE = "Forgot your password?";
export const FORGOT_LEAD = "Enter your email and we'll send you a link to choose a new one.";
export const FORGOT_EMAIL_LABEL = "Email";
export const FORGOT_SUBMIT = "Send the link";
export const FORGOT_PENDING = "Sending…";
export const BACK_TO_SIGN_IN = "Back to sign in";

/** The line that replaces the form once the request went through. */
export function resetSentLine(email: string): string {
  return `If ${email} has a Blindr account, a link is on its way. Open it on any device to choose a new password.`;
}

/** The address as typed, trimmed. */
export function resetEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * `redirectTo` for `resetPasswordForEmail`. Only Supabase's DEFAULT reset
 * template uses it (a PKCE `?code=` exchanged at /auth/callback, so it works
 * only in the browser that asked); the custom template
 * (docs/email/supabase-reset-password-template.md) links to /auth/confirm
 * with a token hash instead, which works on any device.
 */
export function resetRedirectTo(siteUrl: string | undefined): string {
  const base = (siteUrl ?? "").replace(/\/+$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(RESET_NEXT)}`;
}
