import { describe, expect, it } from "vitest";
import { readFlag, readValue, writeFlag, writeValue } from "./safe-storage";

describe("safe-storage", () => {
  it("reads and writes a flag, and survives a throwing or missing storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readFlag(() => storage, "k")).toBe(false);
    expect(writeFlag(() => storage, "k")).toBe(true);
    expect(readFlag(() => storage, "k")).toBe(true);
    const throwing = () => { throw new Error("SecurityError"); };
    expect(readFlag(throwing, "k")).toBe(false);
    expect(writeFlag(throwing, "k")).toBe(false);
    expect(readFlag(() => null, "k")).toBe(false);
    const quota = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(writeFlag(() => quota, "k")).toBe(false);
  });
});

describe("safe-storage: no store, a value it did not write, a read that throws", () => {
  it("a write with no storage returns false", () => {
    expect(writeFlag(() => null, "k")).toBe(false);
  });
  it("a leftover value such as \"true\" is not the flag and reads as false", () => {
    const leftover = { getItem: () => "true", setItem: () => undefined };
    expect(readFlag(() => leftover, "k")).toBe(false);
  });
  it("a getItem that throws reads as false", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    };
    expect(readFlag(() => blocked, "k")).toBe(false);
  });
});

// readValue/writeValue exist because two screens stored a *choice*, not a flag,
// and so reached for window.localStorage directly. The cellar's did it inside a
// useState initializer, where the SecurityError that a blocked store throws on
// the accessor takes the whole page to the error boundary instead of falling
// back to the default view.
describe("safe-storage values", () => {
  const fake = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  };
  const throwing = () => {
    throw new Error("SecurityError");
  };

  it("round-trips a value", () => {
    const storage = fake();
    expect(writeValue(() => storage, "view", "grid")).toBe(true);
    expect(readValue(() => storage, "view")).toBe("grid");
  });

  it("reads null when the key was never written", () => {
    expect(readValue(fake, "view")).toBeNull();
  });

  it("reads null and reports false rather than throwing", () => {
    expect(readValue(throwing, "view")).toBeNull();
    expect(writeValue(throwing, "view", "grid")).toBe(false);
    expect(readValue(() => null, "view")).toBeNull();
    expect(writeValue(() => null, "view", "grid")).toBe(false);
  });

  it("reports false when the store is full", () => {
    const quota = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(writeValue(() => quota, "view", "grid")).toBe(false);
  });
});
