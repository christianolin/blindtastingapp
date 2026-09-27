import { describe, expect, it } from "vitest";
import type { MatchMediaLike } from "./use-is-phone";
import { WIDE_QUERY, wideStore } from "./use-is-wide";

// A matchMedia stand-in, as in use-is-phone.test.ts: records every query, holds
// the change listeners, and lets a test flip `matches` the way a resize would.
function fakeMedia(initial: boolean) {
  let matches = initial;
  const queries: string[] = [];
  const listeners = new Set<() => void>();
  const matchMedia: MatchMediaLike = (query) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
    };
  };
  const change = (next: boolean) => {
    matches = next;
    for (const listener of [...listeners]) listener();
  };
  return { matchMedia, queries, listeners, change };
}

describe("wideStore", () => {
  it("asks for exactly what Tailwind's xl: compiles to", () => {
    expect(WIDE_QUERY).toBe("(width >= 80rem)");
    const media = fakeMedia(true);
    wideStore(media.matchMedia).getSnapshot();
    expect(media.queries).toEqual([WIDE_QUERY]);
  });

  it("follows a fake matchMedia and its change events", () => {
    const media = fakeMedia(false);
    const store = wideStore(media.matchMedia);
    expect(store.getSnapshot()).toBe(false);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    media.change(true);
    expect(calls).toBe(1);
    expect(store.getSnapshot()).toBe(true);
    media.change(false);
    expect(calls).toBe(2);
    expect(store.getSnapshot()).toBe(false);
    unsubscribe();
    expect(media.listeners.size).toBe(0);
    media.change(true);
    expect(calls).toBe(2);
    expect(media.queries).toHaveLength(1);
  });

  it("without matchMedia it reads as wide, and subscribing is a no-op", () => {
    const store = wideStore(null);
    expect(store.getSnapshot()).toBe(true);
    const off = store.subscribe(() => {
      throw new Error("never called");
    });
    expect(() => off()).not.toThrow();
  });
});
