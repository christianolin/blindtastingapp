import fs from "node:fs";
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

describe("safeNext control characters", () => {
  // A URL parser drops tab, newline and carriage return inside a path, so
  // "/<TAB>/evil.example" passed the "//" check here but resolved to
  // https://evil.example/ in the browser. Every ASCII control character and
  // every backslash is refused anywhere in the value, not only at the start.
  const CONTROLS = [0x00, 0x01, 0x09, 0x0a, 0x0b, 0x0d, 0x1f, 0x7f];
  it("refuses a control character anywhere in the path", () => {
    for (const code of CONTROLS) {
      const ch = String.fromCharCode(code);
      expect(safeNext("/" + ch + "/evil.example"), "code " + code).toBeNull();
      // A trailing whitespace control is trimmed away, which is safe; what must
      // never happen is a control character surviving into the result.
      const tail = safeNext("/taste" + ch);
      expect(tail === null || [...tail].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127), "code " + code).toBe(true);
    }
  });
  it("refuses a backslash anywhere in the path", () => {
    expect(safeNext("/a" + String.fromCharCode(92) + "b")).toBeNull();
  });
  it("still resolves the refused tab case off-site, which is why it is refused", () => {
    const raw = "/" + String.fromCharCode(9) + "/evil.example";
    expect(new URL(raw, ORIGIN).host).toBe("evil.example");
  });
  it("keeps ordinary paths with spaces, tildes and query strings", () => {
    expect(safeNext("/a b")).toBe("/a b");
    expect(safeNext("/a~b?x=1&y=2")).toBe("/a~b?x=1&y=2");
  });
  it("stays a text file with no raw control bytes in its own source", () => {
    const src = fs.readFileSync("src/lib/safe-next.ts", "utf8");
    const bad = [...src].map((c) => c.charCodeAt(0)).filter((c) => (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127);
    expect(bad).toEqual([]);
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
