import { describe, expect, it } from "vitest";
import {
  decodeStartResult,
  encodeStartResult,
  startResultCookieName,
  startResultCookiePath,
  type StartResult,
} from "./start-result-cookie";

// Start's one-shot result cookie (BT-V3 A-08): startTasting encodes it,
// RunningView decodes it for the host. Anything malformed reads as no result.

const raw = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

describe("startResultCookieName / startResultCookiePath", () => {
  it("scopes the cookie to one tasting's page", () => {
    expect(startResultCookieName("t1")).toBe("bt_start_result_t1");
    expect(startResultCookiePath("t1")).toBe("/tastings/t1");
  });
});

describe("encodeStartResult / decodeStartResult", () => {
  const cases: StartResult[] = [
    { success: "Tasting started — guessing is open.", warning: null, toConsole: false },
    { success: "Tasting started — guessing is open.", warning: null, toConsole: true },
    {
      success: "Tasting started — guessing is open.",
      warning: "Glass 3 still needs a vintage — finish it before you reveal it.",
      toConsole: true,
    },
  ];

  it.each(cases)("round-trips %o", (result) => {
    expect(decodeStartResult(encodeStartResult(result))).toEqual(result);
  });

  it("encodes to base64url only, so no cookie delimiter can appear", () => {
    const encoded = encodeStartResult({
      success: "a; b, c = d",
      warning: "quotes \" and ; and non-ASCII — é",
      toConsole: false,
    });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("reads a missing or empty cookie as no result", () => {
    expect(decodeStartResult(undefined)).toBeNull();
    expect(decodeStartResult(null)).toBeNull();
    expect(decodeStartResult("")).toBeNull();
  });

  it("reads a value that is not base64url JSON as no result", () => {
    expect(decodeStartResult("not json at all")).toBeNull();
    expect(decodeStartResult(Buffer.from("{oops", "utf8").toString("base64url"))).toBeNull();
  });

  it("reads JSON that is not an object as no result", () => {
    expect(decodeStartResult(raw(null))).toBeNull();
    expect(decodeStartResult(raw("Tasting started"))).toBeNull();
    expect(decodeStartResult(raw(42))).toBeNull();
  });

  it("needs a non-empty success of at most 200 characters", () => {
    const ok = { warning: null, toConsole: false };
    expect(decodeStartResult(raw({ ...ok }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, success: "" }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, success: 7 }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, success: "x".repeat(201) }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, success: "x".repeat(200) }))).toEqual({
      ...ok,
      success: "x".repeat(200),
    });
  });

  it("needs toConsole to be a boolean", () => {
    const ok = { success: "Started", warning: null };
    expect(decodeStartResult(raw({ ...ok }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, toConsole: "true" }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, toConsole: 1 }))).toBeNull();
  });

  it("needs warning to be null or a string of at most 2000 characters", () => {
    const ok = { success: "Started", toConsole: false };
    expect(decodeStartResult(raw({ ...ok }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, warning: 3 }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, warning: "w".repeat(2001) }))).toBeNull();
    expect(decodeStartResult(raw({ ...ok, warning: "w".repeat(2000) }))).toEqual({
      ...ok,
      warning: "w".repeat(2000),
    });
    expect(decodeStartResult(raw({ ...ok, warning: "" }))).toEqual({ ...ok, warning: "" });
  });

  it("drops keys it does not know", () => {
    expect(
      decodeStartResult(raw({ success: "Started", warning: null, toConsole: true, extra: "x" })),
    ).toEqual({ success: "Started", warning: null, toConsole: true });
  });
});
