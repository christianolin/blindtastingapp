// A `?next=` destination must be a same-site path: absolute URLs and the
// protocol-relative forms ("//host", "/\\host") are dropped so a crafted link
// can't bounce a fresh sign-in or sign-up off-site. The share link
// `/j/<code>` is the case this exists for.
export function safeNext(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  return v;
}

/** Where sign-in lands when the link carried no destination of its own. */
export const DEFAULT_NEXT = "/taste";

/**
 * The absolute URL an auth exchange redirects to. `${origin}${next}` is not a
 * same-origin guarantee on its own: a `next` of "@evil.com" makes the origin
 * into userinfo and evil.com into the host, so the string has to be built from
 * a checked path, never from the raw query param. Both auth entry points run
 * after the session exists, which is what makes the difference matter.
 */
export function authRedirect(origin: string, raw: string | null | undefined): string {
  return `${origin}${safeNext(raw) ?? DEFAULT_NEXT}`;
}
