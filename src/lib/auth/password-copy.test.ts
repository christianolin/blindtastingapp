import { describe, expect, it } from "vitest";
import {
  PASSWORD_DEFAULT_NEXT,
  passwordCopy,
  passwordFormName,
  passwordMode,
  passwordNext,
  passwordUpdateData,
  setupNameSuggestion,
  signedOutRedirect,
} from "./password-copy";
import { RESET_NEXT, setPasswordHref } from "./paths";

describe("set-password mode", () => {
  it("is reset only for reason=reset", () => {
    expect(passwordMode("reset")).toBe("reset");
    expect(passwordMode(["reset", "x"])).toBe("reset");
    expect(passwordMode(null)).toBe("setup");
    expect(passwordMode(undefined)).toBe("setup");
    expect(passwordMode("")).toBe("setup");
    expect(passwordMode("RESET")).toBe("setup");
    expect(passwordMode("setup")).toBe("setup");
  });

  it("reads the mode off the reset link's own path", () => {
    const query = new URLSearchParams(RESET_NEXT.split("?")[1]);
    expect(passwordMode(query.get("reason"))).toBe("reset");
  });
});

describe("set-password next", () => {
  it("defaults to the overview", () => {
    expect(PASSWORD_DEFAULT_NEXT).toBe("/overview");
    expect(passwordNext(null)).toBe("/overview");
    expect(passwordNext(undefined)).toBe("/overview");
    expect(passwordNext("")).toBe("/overview");
    expect(passwordNext([])).toBe("/overview");
  });

  it("keeps a same-site path", () => {
    expect(passwordNext("/tastings/abc")).toBe("/tastings/abc");
    expect(passwordNext("/invite/ABCDEFGHJK/accept")).toBe("/invite/ABCDEFGHJK/accept");
    expect(passwordNext(["/taste?tab=history", "/evil"])).toBe("/taste?tab=history");
  });

  it("round-trips the middleware's own href", () => {
    const href = setPasswordHref("/invite/ABCDEFGHJK/accept?x=1");
    const query = new URLSearchParams(href.split("?")[1]);
    expect(passwordNext(query.get("next"))).toBe("/invite/ABCDEFGHJK/accept?x=1");
  });

  it("drops anything that could leave the site", () => {
    expect(passwordNext("https://evil.example")).toBe("/overview");
    expect(passwordNext("//evil.example")).toBe("/overview");
    expect(passwordNext("/\\evil.example")).toBe("/overview");
    expect(passwordNext("evil.example")).toBe("/overview");
    // A browser's URL parser strips tab and newline, so "/\t/evil" would
    // become the protocol-relative "//evil".
    expect(passwordNext("/\t/evil.example")).toBe("/overview");
    expect(passwordNext("/\n/evil.example")).toBe("/overview");
    expect(passwordNext("/\r/evil.example")).toBe("/overview");
    expect(passwordNext("/a\\b")).toBe("/overview");
  });

  it("drops every control character, both ends of the range and DEL", () => {
    // Built from char codes: an escape typed into this file can end up
    // written as the raw byte, which is how the guard itself once went binary.
    for (const code of [0x00, 0x01, 0x0b, 0x1f, 0x7f]) {
      expect(passwordNext(`/a${String.fromCharCode(code)}b`)).toBe("/overview");
    }
    // The printable characters either side of the range are ordinary paths.
    expect(passwordNext("/a b")).toBe("/a b");
    expect(passwordNext("/a~b")).toBe("/a~b");
  });

  it("never lands back on the set-password page", () => {
    expect(passwordNext("/auth/set-password")).toBe("/overview");
    expect(passwordNext("/auth/set-password?reason=reset")).toBe("/overview");
  });
});

describe("set-password copy (verbatim)", () => {
  it("setup mode", () => {
    expect(passwordCopy("setup")).toEqual({
      title: "Welcome to Blindr",
      lead: "Choose a password so you can sign in again on any device.",
      nameLabel: "Your name",
      nameHint: "How you'll appear to other tasters.",
      passwordLabel: "Choose a password",
      hint: "At least 6 characters.",
      submit: "Save and continue",
      pending: "Saving…",
      expired: "Your invite link has expired. Ask the person who invited you for a new one.",
    });
  });

  it("reset mode has no name field", () => {
    expect(passwordCopy("reset")).toEqual({
      title: "Choose a new password",
      lead: "Pick a new password for your Blindr account.",
      nameLabel: null,
      nameHint: null,
      passwordLabel: "New password",
      hint: "At least 6 characters.",
      submit: "Save password",
      pending: "Saving…",
      expired: "This link has expired. Ask for a new one from the sign-in page.",
    });
  });
});

describe("set-password signed out", () => {
  it("setup goes to sign-in, reset to the failed-link line", () => {
    expect(signedOutRedirect("setup")).toBe("/login");
    expect(signedOutRedirect("reset")).toBe("/login?error=auth_callback_failed");
  });
});

describe("set-password metadata write", () => {
  it("always sets the flag; the name only in setup mode", () => {
    expect(passwordUpdateData("setup", "Gustav")).toEqual({
      password_set: true,
      display_name: "Gustav",
    });
    expect(passwordUpdateData("reset", "Gustav")).toEqual({ password_set: true });
  });

  it("never blanks a name with an empty one", () => {
    expect(passwordUpdateData("setup", "")).toEqual({ password_set: true });
    expect(passwordUpdateData("setup", "   ")).toEqual({ password_set: true });
  });
});

describe("setup name pre-fill (spec D3)", () => {
  it("uses the name the inviter typed, normalised", () => {
    expect(setupNameSuggestion("Carsten", "carsten.olin@example.com")).toBe("Carsten");
    expect(setupNameSuggestion("  Carsten   Olin ", "x@example.com")).toBe("Carsten Olin");
  });

  it("pre-fills a full name as itself, with nothing added", () => {
    // 2026-09-19: a whole name pre-filled into the first of two boxes, plus a
    // surname in the second, was saved as "Carsten Olin Olin".
    expect(setupNameSuggestion("Carsten Olin", "carsten.olin@example.com")).toBe("Carsten Olin");
  });

  it("falls back to a readable email local part when no name was typed", () => {
    expect(setupNameSuggestion(undefined, "carsten.olin@example.com")).toBe("Carsten Olin");
    expect(setupNameSuggestion(undefined, "jens_h2@example.com")).toBe("Jens H");
  });

  it("treats a blank or non-string metadata name as no name", () => {
    for (const unusable of ["", "   ", null, 42, {}, ["Carsten"]]) {
      expect(setupNameSuggestion(unusable, "cdo@example.com")).toBe("Cdo");
    }
  });

  it("is empty only with neither a name nor an email", () => {
    expect(setupNameSuggestion(undefined, undefined)).toBe("");
    expect(setupNameSuggestion(undefined, null)).toBe("");
  });

  it("never shortens a suggestion over the limit; the save refuses it instead", () => {
    const long = "a".repeat(81);
    expect(setupNameSuggestion(long, "x@example.com")).toBe(long);
    expect(passwordFormName("setup", long)).toEqual({
      error: "Please use a shorter name (80 characters at most).",
    });
  });
});

describe("set-password name field (the action's rule)", () => {
  it("setup mode saves the normalised name", () => {
    expect(passwordFormName("setup", "  Carsten   Olin ")).toEqual({ name: "Carsten Olin" });
  });

  it("setup mode refuses a blank name, and a form that sent no name field at all", () => {
    // The action reads a missing field as "": a form rendered by the previous
    // deploy posts its two old fields and none called "name".
    expect(passwordFormName("setup", "")).toEqual({ error: "Please enter your name." });
    expect(passwordFormName("setup", "   ")).toEqual({ error: "Please enter your name." });
  });

  it("reset mode never has a name, whatever the form sent", () => {
    expect(passwordFormName("reset", "")).toEqual({ name: "" });
    expect(passwordFormName("reset", "Mallory")).toEqual({ name: "" });
  });

  it("a pre-filled full name saved unchanged is written once, with the flag, in one data object", () => {
    const named = passwordFormName(
      "setup",
      setupNameSuggestion("Carsten Olin", "carsten.olin@example.com"),
    );
    expect(named).toEqual({ name: "Carsten Olin" });
    if ("name" in named) {
      expect(passwordUpdateData("setup", named.name)).toEqual({
        password_set: true,
        display_name: "Carsten Olin",
      });
    }
  });
});
