import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BACK_TO_SIGN_IN,
  FORGOT_EMAIL_LABEL,
  FORGOT_LEAD,
  FORGOT_PASSWORD_LINK,
  FORGOT_PENDING,
  FORGOT_SUBMIT,
  FORGOT_TITLE,
  LINK_FAILED_ERROR,
  LINK_FAILED_LINE,
  LINK_FAILED_PATH,
  LOGIN_PATH,
  SEND_A_NEW_ONE,
  isLinkFailed,
  resetEmail,
  resetRedirectTo,
  resetSentLine,
  sameSiteNext,
  signInNext,
} from "./login-copy";
import { passwordNext } from "./password-copy";
import { RESET_NEXT, setPasswordHref } from "./paths";

const ORIGIN = "https://blindr.example";

// A browser's URL parser (and Next's server-action redirect, which resolves
// the Location with `new URL(location, base)`) strips tab, LF and CR anywhere
// in the input and reads "\" as "/", so each of these becomes the
// protocol-relative "//evil.example" — another host — although it starts
// with a single "/". The first three pass safeNext's prefix checks.
const PARSER_ESCAPES = [
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/\\evil.example",
  "\t//evil.example",
];

const HOSTILE = [
  ...PARSER_ESCAPES,
  "@evil.example",
  "https://evil.example",
  "//evil.example",
  "evil.example",
];

describe("sameSiteNext", () => {
  it("keeps a same-site path with its query", () => {
    expect(sameSiteNext("/taste")).toBe("/taste");
    expect(sameSiteNext("/tastings/abc?glass=2")).toBe("/tastings/abc?glass=2");
    expect(sameSiteNext("/j/ABCDEFGHJK")).toBe("/j/ABCDEFGHJK");
    // Still percent-encoded at this layer, so an on-site path.
    expect(sameSiteNext("/login?next=%2F%09%2Fevil.example")).toBe(
      "/login?next=%2F%09%2Fevil.example",
    );
  });

  it("refuses everything that can leave the site", () => {
    for (const raw of HOSTILE) expect(sameSiteNext(raw), JSON.stringify(raw)).toBeNull();
  });

  it("refuses what the URL parser would turn into another host", () => {
    for (const raw of PARSER_ESCAPES) {
      // The premise: this string really does escape once parsed.
      expect(new URL(raw.trim(), ORIGIN).host, JSON.stringify(raw)).toBe("evil.example");
      expect(sameSiteNext(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("refuses every control character, both ends of the range and DEL, and a backslash", () => {
    // Built from char codes: an escape typed into this file can end up
    // written as the raw byte, which is how the guard itself once went binary.
    for (const code of [0x00, 0x01, 0x09, 0x0a, 0x0b, 0x0d, 0x1f, 0x7f]) {
      expect(sameSiteNext(`/a${String.fromCharCode(code)}b`), `0x${code.toString(16)}`).toBeNull();
    }
    expect(sameSiteNext("/a\\b")).toBeNull();
    // The printable characters either side of the range are ordinary paths.
    expect(sameSiteNext("/a b")).toBe("/a b");
    expect(sameSiteNext("/a~b")).toBe("/a~b");
  });

  it("refuses nothing at all, and anything that is not a string", () => {
    expect(sameSiteNext(null)).toBeNull();
    expect(sameSiteNext(undefined)).toBeNull();
    expect(sameSiteNext("")).toBeNull();
    expect(sameSiteNext("   ")).toBeNull();
    expect(sameSiteNext(["/taste"])).toBeNull();
    expect(sameSiteNext(42)).toBeNull();
  });

  it("never hands back a path that resolves to another host", () => {
    for (const raw of HOSTILE) {
      const safe = sameSiteNext(raw);
      if (safe !== null) expect(new URL(safe, ORIGIN).host).toBe("blindr.example");
    }
  });

  it("keeps the guard's source text-only, so git diffs and reviews it", () => {
    // Raw control bytes in the regex made git treat a whole file as binary
    // ("Binary files ... differ"), hiding every change to this redirect guard.
    // Tab, LF and CR are ordinary text (CR for a CRLF checkout).
    const source = readFileSync(new URL("./login-copy.ts", import.meta.url), "utf8");
    const raw = [...source]
      .map((ch) => ch.charCodeAt(0))
      .filter((n) => (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0x7f);
    expect(raw).toEqual([]);
  });
});

describe("signInNext", () => {
  it("lands on the requested same-site path", () => {
    expect(signInNext("/j/ABCDEFGHJK")).toBe("/j/ABCDEFGHJK");
  });

  it("falls back to /overview", () => {
    expect(signInNext(null)).toBe("/overview");
    expect(signInNext("")).toBe("/overview");
    expect(signInNext("https://evil.example")).toBe("/overview");
  });

  // The review's repro: /login?next=%2F%09%2Fevil.example, then a valid
  // sign-in, used to redirect the action to "/\t/evil.example".
  it("does not follow a tab-split path off the site", () => {
    const next = new URL("/login?next=%2F%09%2Fevil.example", ORIGIN).searchParams.get("next");
    expect(next).toBe("/\t/evil.example");
    expect(signInNext(next)).toBe("/overview");
  });

  // The same path relayed through the password step: the middleware's href
  // keeps it percent-encoded (on-site), the set-password page sends the user
  // to /login with it, and the sign-in is where it would finally be decoded.
  it("stops the path the set-password page relays", () => {
    const href = setPasswordHref("/login?next=%2F%09%2Fevil.example");
    const done = passwordNext(new URL(href, ORIGIN).searchParams.get("next"));
    expect(done).toBe("/login?next=%2F%09%2Fevil.example");
    const loginNext = new URL(done, ORIGIN).searchParams.get("next");
    expect(signInNext(loginNext)).toBe("/overview");
  });
});

describe("login copy", () => {
  it("spells the login page's link and the failed-link line verbatim", () => {
    expect(FORGOT_PASSWORD_LINK).toBe("Forgot password?");
    expect(LINK_FAILED_LINE).toBe(
      "That link didn't work. It may have expired or already been used.",
    );
    expect(SEND_A_NEW_ONE).toBe("Send a new one");
  });

  it("spells the forgot page verbatim", () => {
    expect(FORGOT_TITLE).toBe("Forgot your password?");
    expect(FORGOT_LEAD).toBe(
      "Enter your email and we'll send you a link to choose a new one.",
    );
    expect(FORGOT_EMAIL_LABEL).toBe("Email");
    expect(FORGOT_SUBMIT).toBe("Send the link");
    expect(FORGOT_PENDING).toBe("Sending…");
    expect(BACK_TO_SIGN_IN).toBe("Back to sign in");
  });

  it("names the address without saying whether an account exists", () => {
    expect(resetSentLine("ana@example.com")).toBe(
      "If ana@example.com has a Blindr account, a link is on its way. Open it on any device to choose a new password.",
    );
  });
});

describe("the failed-link error", () => {
  it("is the one the auth routes already send", () => {
    expect(LOGIN_PATH).toBe("/login");
    expect(LINK_FAILED_ERROR).toBe("auth_callback_failed");
    expect(LINK_FAILED_PATH).toBe("/login?error=auth_callback_failed");
  });

  it("shows only for that exact value", () => {
    expect(isLinkFailed("auth_callback_failed")).toBe(true);
    expect(isLinkFailed(undefined)).toBe(false);
    expect(isLinkFailed("")).toBe(false);
    expect(isLinkFailed("something_else")).toBe(false);
    expect(isLinkFailed(["auth_callback_failed"])).toBe(false);
  });
});

describe("the reset request", () => {
  it("trims the typed email", () => {
    expect(resetEmail("  ana@example.com \n")).toBe("ana@example.com");
    expect(resetEmail(null)).toBe("");
  });

  it("falls back to the callback with the reset page as next", () => {
    expect(resetRedirectTo("https://blindrapp.vercel.app")).toBe(
      "https://blindrapp.vercel.app/auth/callback?next=%2Fauth%2Fset-password%3Freason%3Dreset",
    );
  });

  it("does not double a trailing slash on the site URL", () => {
    expect(resetRedirectTo("https://blindrapp.vercel.app/")).toBe(
      "https://blindrapp.vercel.app/auth/callback?next=%2Fauth%2Fset-password%3Freason%3Dreset",
    );
  });

  it("carries next that decodes back to the reset page", () => {
    const url = new URL(resetRedirectTo("http://localhost:3000"));
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe(RESET_NEXT);
  });
});
