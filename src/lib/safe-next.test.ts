import { describe, expect, it } from "vitest";
import { authRedirect, safeNext } from "./safe-next";

const ORIGIN = "https://blindr.example";

// Every string here was checked against the real URL parser before it was
// written down: `${origin}${next}` is not a same-origin guarantee, because a
// `next` starting with "@" turns the origin into userinfo and the attacker's
// host into the host. `//evil.com` and `/\evil.com` stay on-origin through
// concatenation but not through `router.replace`, which takes an absolute URL
// as one. safeNext refuses all four shapes, which is why the fix is to call it
// rather than to harden the concatenation.
const HOSTILE = [
  "@evil.com",
  "https://evil.com",
  "//evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "http://evil.com/taste",
];

describe("safeNext", () => {
  it("keeps a same-site path", () => {
    expect(safeNext("/taste")).toBe("/taste");
    expect(safeNext("/tastings/abc?glass=2")).toBe("/tastings/abc?glass=2");
  });

  it("refuses everything that can leave the site", () => {
    for (const raw of HOSTILE) expect(safeNext(raw), raw).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext("   ")).toBeNull();
  });
});

describe("authRedirect", () => {
  it("lands on the requested path", () => {
    expect(authRedirect(ORIGIN, "/cellar")).toBe(`${ORIGIN}/cellar`);
  });

  it("falls back to /taste when there is no destination", () => {
    expect(authRedirect(ORIGIN, null)).toBe(`${ORIGIN}/taste`);
    expect(authRedirect(ORIGIN, "")).toBe(`${ORIGIN}/taste`);
  });

  // The assertion that matters: not "the string looks right" but "the browser
  // resolves it to our own host". /auth/callback builds this string after the
  // session cookie is set, so an off-origin result hands a logged-in user to
  // whoever crafted the link.
  it("never resolves to another host", () => {
    for (const raw of HOSTILE) {
      const url = new URL(authRedirect(ORIGIN, raw));
      expect(url.host, `${raw} escaped to ${url.host}`).toBe("blindr.example");
    }
  });
});
