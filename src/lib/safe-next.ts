// A `?next=` destination must be a same-site path: absolute URLs and the
// protocol-relative forms ("//host", "/\\host") are dropped so a crafted link
// can't bounce a fresh sign-in or sign-up off-site. The share link
// `/j/<code>` is the case this exists for.
export function safeNext(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  return v;
}
