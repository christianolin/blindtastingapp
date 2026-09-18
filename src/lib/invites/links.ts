// Platform invites — every path and URL the feature uses (spec §3, D12,
// D13). The one builder: nothing else in this feature composes a path or a
// `next` by hand. Pure module: no Supabase client, no React, no framework
// import, no environment read at the top level (callers pass `siteUrl` in).

/** 10 characters of `generate_join_code()`'s alphabet (spec D1, D7). */
export const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{10}$/;

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isCodeShape(code: string): boolean {
  return CODE_SHAPE.test(code);
}

export function landingPath(code: string): string {
  return `/invite/${code}`;
}

export function acceptPath(code: string): string {
  return `${landingPath(code)}/accept`;
}

export function signupHref(code: string): string {
  return `/signup?next=${encodeURIComponent(acceptPath(code))}`;
}

export function loginHref(code: string): string {
  return `/login?next=${encodeURIComponent(acceptPath(code))}`;
}

function stripTrailingSlash(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

/** Absolute link the inviter copies/shares/emails. */
export function inviteUrl(siteUrl: string, code: string): string {
  return `${stripTrailingSlash(siteUrl)}${landingPath(code)}`;
}

/**
 * D13: the email's `redirectTo`, landing on the accept route — the `next`
 * is unencoded here, as the tasting actions' own `redirectTo` writes it
 * (`src/app/tastings/[id]/actions.ts`'s `inviteToTasting`).
 */
export function confirmHashRedirect(siteUrl: string, code: string): string {
  return `${stripTrailingSlash(siteUrl)}/auth/confirm-hash?next=${acceptPath(code)}`;
}

/** D12: the intent cookie that gates the auto-accept on `/invite/<code>/accept`. */
export const INVITE_INTENT_COOKIE = "blindr-invite-intent";
