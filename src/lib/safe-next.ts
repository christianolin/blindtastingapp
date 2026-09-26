// A `?next=` destination must be a same-site path: absolute URLs and the
// protocol-relative forms ("//host", "/\\host") are dropped so a crafted link
// can't bounce a fresh sign-in or sign-up off-site. The share link
// `/j/<code>` is the case this exists for.
// A URL parser drops tab, newline and carriage return inside a path, so
// "/<TAB>/evil.example" would pass a "//" prefix check yet resolve off-site.
// Every ASCII control character and every backslash is refused anywhere in
// the value; the backslash class also covers the old "/\\" prefix check.
const UNSAFE_PATH_CHARS = /[\x00-\x1f\x7f\\]/;

export function safeNext(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || UNSAFE_PATH_CHARS.test(v)) return null;
  return v;
}

/** Where sign-in lands when the link carried no destination of its own: the
    Overview, the logged-in front page (owner, 2026-09-26; it was /taste). */
export const DEFAULT_NEXT = "/overview";

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
