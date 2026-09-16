import { describe, expect, it } from "vitest";
import { clearDismissed, liveSurface, readDismissed, resultDismissKey, writeDismissed } from "./live-theme";

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

describe("undismissing a result", () => {
  const make = () => {
    const store = new Map<string, string>();
    return {
      store,
      storage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  };

  // The bug this exists for: dismissing was one-way, so a viewer who pressed
  // "See every wine" could never get the scoreboard back — the record's only
  // way out linked to the page the record is rendered on.
  it("puts the result surface back", () => {
    const { storage } = make();
    expect(liveSurface({ status: "CLOSED", dismissed: readDismissed(() => storage, "t1") })).toBe("result");
    writeDismissed(() => storage, "t1");
    expect(liveSurface({ status: "CLOSED", dismissed: readDismissed(() => storage, "t1") })).toBe("record");
    expect(clearDismissed(() => storage, "t1")).toBe(true);
    expect(liveSurface({ status: "CLOSED", dismissed: readDismissed(() => storage, "t1") })).toBe("result");
  });

  it("clears only that tasting", () => {
    const { store, storage } = make();
    writeDismissed(() => storage, "t1");
    writeDismissed(() => storage, "t2");
    clearDismissed(() => storage, "t1");
    expect(readDismissed(() => storage, "t1")).toBe(false);
    expect(readDismissed(() => storage, "t2")).toBe(true);
    expect([...store.keys()]).toEqual(["blindr:result-dismissed:t2"]);
  });

  it("is false, not a throw, when storage is missing or blocked", () => {
    expect(clearDismissed(() => null, "t1")).toBe(false);
    expect(clearDismissed(() => { throw new Error("SecurityError"); }, "t1")).toBe(false);
  });
});
