import { describe, expect, it } from "vitest";
import { PHONE_QUERY, phoneStore, type MatchMediaLike } from "./use-is-phone";

// A matchMedia stand-in: records every query, holds the change listeners, and
// lets a test flip `matches` the way a resize or a rotation would.
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

describe("phoneStore", () => {
  it("asks for exactly what Tailwind's max-md: compiles to", () => {
    expect(PHONE_QUERY).toBe("(width < 48rem)");
    const media = fakeMedia(true);
    phoneStore(media.matchMedia).getSnapshot();
    expect(media.queries).toEqual([PHONE_QUERY]);
  });

  it("reads the list's matches and follows a change", () => {
    const media = fakeMedia(true);
    const store = phoneStore(media.matchMedia);
    expect(store.getSnapshot()).toBe(true);
    media.change(false);
    expect(store.getSnapshot()).toBe(false);
  });

  it("notifies a subscriber on change until it unsubscribes", () => {
    const media = fakeMedia(false);
    const store = phoneStore(media.matchMedia);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    expect(media.listeners.size).toBe(1);
    media.change(true);
    expect(calls).toBe(1);
    unsubscribe();
    expect(media.listeners.size).toBe(0);
    media.change(false);
    expect(calls).toBe(1);
  });

  it("creates one MediaQueryList for every read and subscription", () => {
    const media = fakeMedia(false);
    const store = phoneStore(media.matchMedia);
    store.getSnapshot();
    const off = store.subscribe(() => {});
    store.getSnapshot();
    off();
    expect(media.queries).toHaveLength(1);
  });

  it("without matchMedia it is never a phone, and subscribing is a no-op", () => {
    const store = phoneStore(null);
    expect(store.getSnapshot()).toBe(false);
    const off = store.subscribe(() => {
      throw new Error("never called");
    });
    expect(() => off()).not.toThrow();
  });
});
