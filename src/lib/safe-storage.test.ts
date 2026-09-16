import { describe, expect, it } from "vitest";
import { clearFlag, readFlag, readValue, writeFlag, writeValue } from "./safe-storage";

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

describe("safe-storage: clearing a flag", () => {
  const withRemove = () => {
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

  it("unsets a flag it set, and leaves no key behind", () => {
    const { store, storage } = withRemove();
    expect(writeFlag(() => storage, "k")).toBe(true);
    expect(readFlag(() => storage, "k")).toBe(true);
    expect(clearFlag(() => storage, "k")).toBe(true);
    expect(readFlag(() => storage, "k")).toBe(false);
    expect([...store.keys()]).toEqual([]);
  });

  it("clears only the key asked for", () => {
    const { store, storage } = withRemove();
    writeFlag(() => storage, "a");
    writeFlag(() => storage, "b");
    expect(clearFlag(() => storage, "a")).toBe(true);
    expect(readFlag(() => storage, "a")).toBe(false);
    expect(readFlag(() => storage, "b")).toBe(true);
    expect([...store.keys()]).toEqual(["b"]);
  });

  // A storage without removeItem is overwritten instead. readFlag counts only
  // an exact "1", so the flag is unset either way.
  it("falls back to overwriting when the storage has no removeItem", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeFlag(() => storage, "k");
    expect(clearFlag(() => storage, "k")).toBe(true);
    expect(readFlag(() => storage, "k")).toBe(false);
  });

  it("is false, not a throw, when storage is missing or blocked", () => {
    expect(clearFlag(() => null, "k")).toBe(false);
    expect(clearFlag(() => { throw new Error("SecurityError"); }, "k")).toBe(false);
    const hostile = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(clearFlag(() => hostile, "k")).toBe(false);
  });
});
