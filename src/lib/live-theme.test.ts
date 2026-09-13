import { describe, expect, it } from "vitest";
import { liveSurface, readDismissed, resultDismissKey, writeDismissed } from "./live-theme";

describe("liveSurface (B5)", () => {
  it.each([
    [{ status: "DRAFT", dismissed: false }, "lobby"],
    [{ status: "OPEN", dismissed: false }, "lobby"],
    [{ status: "IN_PROGRESS", dismissed: true }, "live"],
    [{ status: "CLOSED", dismissed: false }, "result"],
    [{ status: "CLOSED", dismissed: true }, "record"],
  ] as const)("%j → %s", (input, surface) => expect(liveSurface(input)).toBe(surface));
});

describe("the dismissal flag", () => {
  it("is keyed by tasting", () => expect(resultDismissKey("t1")).toBe("blindr:result-dismissed:t1"));
  it("reads and writes through storage, and survives a throwing or missing storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readDismissed(() => storage, "t1")).toBe(false);
    expect(writeDismissed(() => storage, "t1")).toBe(true);
    expect(readDismissed(() => storage, "t1")).toBe(true);
    const throwing = () => { throw new Error("SecurityError"); };
    expect(readDismissed(throwing, "t1")).toBe(false);
    expect(writeDismissed(throwing, "t1")).toBe(false);
    expect(readDismissed(() => null, "t1")).toBe(false);
  });
});

describe("the dismissal flag, per tasting", () => {
  it("dismissing one tasting's result leaves another's undismissed, stored under the spec key", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(writeDismissed(() => storage, "t1")).toBe(true);
    expect(readDismissed(() => storage, "t1")).toBe(true);
    expect(readDismissed(() => storage, "t2")).toBe(false);
    expect([...store.keys()]).toEqual(["blindr:result-dismissed:t1"]);
  });
  it("a write with no storage returns false", () => {
    expect(writeDismissed(() => null, "t1")).toBe(false);
  });
});
