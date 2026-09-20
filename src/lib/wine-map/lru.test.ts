import { describe, expect, it } from "vitest";
import { createLru } from "./lru";

describe("createLru", () => {
  it("reads back every key while under capacity", () => {
    const lru = createLru<number>(3);
    lru.set("a", 1);
    lru.set("b", 2);
    expect(lru.get("a")).toBe(1);
    expect(lru.get("b")).toBe(2);
    expect(lru.size).toBe(2);
  });

  it("evicts the least recently USED, not the oldest inserted", () => {
    const lru = createLru<string>(3);
    lru.set("a", "A");
    lru.set("b", "B");
    lru.set("c", "C");
    // Touching "a" makes "b" the least recently used.
    expect(lru.get("a")).toBe("A");
    lru.set("d", "D");
    expect(lru.has("b")).toBe(false);
    expect(lru.get("a")).toBe("A");
    expect(lru.get("c")).toBe("C");
    expect(lru.get("d")).toBe("D");
    expect(lru.size).toBe(3);
  });

  it("peek does not promote", () => {
    const lru = createLru<string>(3);
    lru.set("a", "A");
    lru.set("b", "B");
    lru.set("c", "C");
    expect(lru.peek("a")).toBe("A");
    lru.set("d", "D");
    // "a" was only peeked, so it is still the least recently used.
    expect(lru.has("a")).toBe(false);
    expect(lru.has("b")).toBe(true);
  });

  it("re-setting an existing key updates in place, promotes, and does not grow", () => {
    const lru = createLru<number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 11);
    expect(lru.size).toBe(2);
    expect(lru.peek("a")).toBe(11);
    // "a" was promoted by the re-set, so "b" goes first.
    lru.set("c", 3);
    expect(lru.has("b")).toBe(false);
    expect(lru.has("a")).toBe(true);
  });

  it("delete and clear empty as expected", () => {
    const lru = createLru<number>(3);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.delete("a");
    expect(lru.has("a")).toBe(false);
    expect(lru.size).toBe(1);
    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.has("b")).toBe(false);
  });

  it("distinguishes a missing key from a stored undefined via has()", () => {
    const lru = createLru<string | undefined>(3);
    lru.set("stored", undefined);
    expect(lru.get("stored")).toBeUndefined();
    expect(lru.has("stored")).toBe(true);
    expect(lru.get("missing")).toBeUndefined();
    expect(lru.has("missing")).toBe(false);
  });

  it("a capacity below one never stores anything", () => {
    const lru = createLru<number>(0);
    lru.set("a", 1);
    expect(lru.has("a")).toBe(false);
    expect(lru.size).toBe(0);
  });
});
