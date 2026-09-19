// Query parsing for /auth/confirm, the token-hash link route. An email
// template that links to
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=…
// is verified server-side with `verifyOtp({ type, token_hash })`, which works
// on any device — unlike a PKCE `?code=` (/auth/callback), which needs the
// code verifier cookie of the browser that asked.
//
// Pure: runtime imports are relative only (vitest has no `@/` alias).

import { LINK_FAILED_PATH, sameSiteNext } from "./login-copy";

/** The email-link OTP types `verifyOtp` takes with a token hash. */
export const CONFIRM_TYPES = [
  "recovery",
  "invite",
  "magiclink",
  "email",
  "signup",
  "email_change",
] as const;

export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export type ConfirmParams = {
  tokenHash: string;
  type: ConfirmType;
  /** Already sameSiteNext-checked; null when missing or off-site. */
  next: string | null;
};

function isConfirmType(raw: string | null): raw is ConfirmType {
  return raw !== null && (CONFIRM_TYPES as readonly string[]).includes(raw);
}

/** The link's token hash, type and destination, or null when unusable. */
export function parseConfirmParams(params: URLSearchParams): ConfirmParams | null {
  const tokenHash = (params.get("token_hash") ?? "").trim();
  const type = params.get("type");
  if (tokenHash === "" || !isConfirmType(type)) return null;
  return { tokenHash, type, next: sameSiteNext(params.get("next")) };
}

/** Where a missing, malformed, expired or used link lands. */
export function confirmFailedUrl(origin: string): string {
  return `${origin}${LINK_FAILED_PATH}`;
}
