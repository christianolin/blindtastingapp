import { describe, expect, it } from "vitest";
import { CONFIRM_TYPES, confirmFailedUrl, parseConfirmParams } from "./confirm-params";
import { RESET_NEXT } from "./paths";

function parse(query: string) {
  return parseConfirmParams(new URLSearchParams(query));
}

describe("parseConfirmParams", () => {
  it("reads the reset email's own link", () => {
    expect(
      parse("token_hash=abc123&type=recovery&next=%2Fauth%2Fset-password%3Freason%3Dreset"),
    ).toEqual({ tokenHash: "abc123", type: "recovery", next: RESET_NEXT });
  });

  it("accepts every email link type verifyOtp takes", () => {
    expect([...CONFIRM_TYPES]).toEqual([
      "recovery",
      "invite",
      "magiclink",
      "email",
      "signup",
      "email_change",
    ]);
    for (const type of CONFIRM_TYPES) {
      expect(parse(`token_hash=abc&type=${type}`)).toEqual({
        tokenHash: "abc",
        type,
        next: null,
      });
    }
  });

  it("refuses an unknown or missing type", () => {
    expect(parse("token_hash=abc&type=sms")).toBeNull();
    expect(parse("token_hash=abc&type=RECOVERY")).toBeNull();
    expect(parse("token_hash=abc&type=")).toBeNull();
    expect(parse("token_hash=abc")).toBeNull();
  });

  it("refuses a missing or blank token hash", () => {
    expect(parse("type=recovery")).toBeNull();
    expect(parse("token_hash=&type=recovery")).toBeNull();
    expect(parse("token_hash=%20%20&type=recovery")).toBeNull();
  });

  it("drops a next that leaves the site", () => {
    expect(parse("token_hash=abc&type=recovery&next=https%3A%2F%2Fevil.example")?.next).toBeNull();
    expect(parse("token_hash=abc&type=recovery&next=%2F%2Fevil.example")?.next).toBeNull();
    expect(parse("token_hash=abc&type=recovery&next=%40evil.example")?.next).toBeNull();
    expect(parse("token_hash=abc&type=recovery&next=%2F%5Cevil.example")?.next).toBeNull();
  });

  // A URL parser strips tab, LF and CR, so "/\t/evil.example" is read as
  // "//evil.example" — safeNext's prefix checks alone let these through.
  it("drops a next the URL parser would turn into another host", () => {
    for (const encoded of ["%2F%09%2Fevil.example", "%2F%0A%2Fevil.example", "%2F%0D%2Fevil.example"]) {
      expect(parse(`token_hash=abc&type=recovery&next=${encoded}`)?.next, encoded).toBeNull();
    }
  });

  it("keeps a same-site next with its own query", () => {
    expect(parse("token_hash=abc&type=invite&next=%2Finvite%2FABCDEFGHJK%2Faccept")?.next).toBe(
      "/invite/ABCDEFGHJK/accept",
    );
  });
});

describe("confirmFailedUrl", () => {
  it("sends a failed link to the login page's failed-link line", () => {
    expect(confirmFailedUrl("https://blindrapp.vercel.app")).toBe(
      "https://blindrapp.vercel.app/login?error=auth_callback_failed",
    );
  });
});
