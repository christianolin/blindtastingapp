import { describe, expect, it, vi } from "vitest";
import {
  MAX_CACHE_ENTRIES,
  createKeyedCache,
  createPlaceCacheGroup,
} from "./keyed-cache";

/** A deferred promise, so a test can hold a load open and inspect the cache. */
function deferred<V>() {
  let resolve!: (value: V) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<V>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Client = { name: string };
const client: Client = { name: "stub" };

describe("createKeyedCache", () => {
  it("loads once for two sequential loads of one key, and returns the same reference", async () => {
    const load = vi.fn(async (_c: Client, key: string) => ({ key }));
    const cache = createKeyedCache({ capacity: 5, load });
    const first = await cache.load(client, "france.savoie");
    const second = await cache.load(client, "france.savoie");
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("shares one in-flight request between concurrent loads", async () => {
    const gate = deferred<{ key: string }>();
    const load = vi.fn(() => gate.promise);
    const cache = createKeyedCache({ capacity: 5, load });
    const a = cache.load(client, "k");
    const b = cache.load(client, "k");
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve({ key: "k" });
    expect(await a).toBe(await b);
  });

  it("never caches a rejection: the rejection propagates and the next load retries", async () => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return { key: "k" };
    });
    const cache = createKeyedCache({ capacity: 5, load });
    await expect(cache.load(client, "k")).rejects.toThrow("network");
    expect(cache.peek("k")).toBeUndefined();
    await expect(cache.load(client, "k")).resolves.toEqual({ key: "k" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("honours the cacheable predicate: a null result is not cached", async () => {
    const load = vi.fn(async () => null as { key: string } | null);
    const cache = createKeyedCache({
      capacity: 5,
      load,
      cacheable: (value) => value !== null,
    });
    expect(await cache.load(client, "k")).toBeNull();
    expect(await cache.load(client, "k")).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.peek("k")).toBeUndefined();
  });

  it("caches an EMPTY array — an empty list is real data, not a miss", async () => {
    const load = vi.fn(async () => [] as string[]);
    const cache = createKeyedCache({ capacity: 5, load });
    const first = await cache.load(client, "k");
    await cache.load(client, "k");
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.peek("k")).toBe(first);
  });

  it("evicts past capacity and reloads an evicted key", async () => {
    const load = vi.fn(async (_c: Client, key: string) => ({ key }));
    const cache = createKeyedCache({ capacity: 3, load });
    await cache.load(client, "a");
    await cache.load(client, "b");
    await cache.load(client, "c");
    await cache.load(client, "d");
    expect(cache.peek("a")).toBeUndefined();
    await cache.load(client, "a");
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("peek is undefined while the promise is pending and the value once it resolves", async () => {
    const gate = deferred<{ key: string }>();
    const cache = createKeyedCache({ capacity: 5, load: () => gate.promise });
    const pending = cache.load(client, "k");
    expect(cache.peek("k")).toBeUndefined();
    gate.resolve({ key: "k" });
    const value = await pending;
    expect(cache.peek("k")).toBe(value);
  });

  it("clear() makes every later load call again", async () => {
    const load = vi.fn(async (_c: Client, key: string) => ({ key }));
    const cache = createKeyedCache({ capacity: 5, load });
    await cache.load(client, "k");
    cache.clear();
    expect(cache.peek("k")).toBeUndefined();
    await cache.load(client, "k");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load started before clear() still resolves, but is not cached afterwards", async () => {
    const gate = deferred<{ key: string }>();
    const load = vi.fn(() => gate.promise);
    const cache = createKeyedCache({ capacity: 5, load });
    const pending = cache.load(client, "k");
    cache.clear();
    gate.resolve({ key: "k" });
    await expect(pending).resolves.toEqual({ key: "k" });
    expect(cache.peek("k")).toBeUndefined();
  });
});

describe("createPlaceCacheGroup", () => {
  function group() {
    const calls = { context: 0, archetypes: 0, styles: 0 };
    const cache = createPlaceCacheGroup({
      loadContext: async (_c: Client, key: string) => {
        calls.context += 1;
        return { key };
      },
      loadArchetypes: async () => {
        calls.archetypes += 1;
        return [] as string[];
      },
      loadStyles: async () => {
        calls.styles += 1;
        return [] as string[];
      },
    });
    return { cache, calls };
  }

  it("defaults to MAX_CACHE_ENTRIES and pins it at 50", () => {
    expect(MAX_CACHE_ENTRIES).toBe(50);
  });

  it("prefetch warms all three, so a later load makes no further call", async () => {
    const { cache, calls } = group();
    await cache.prefetch(client, "france.savoie");
    expect(calls).toEqual({ context: 1, archetypes: 1, styles: 1 });
    await cache.loadContext(client, "france.savoie");
    await cache.loadArchetypes(client, "france.savoie");
    await cache.loadStyles(client, "france.savoie");
    expect(calls).toEqual({ context: 1, archetypes: 1, styles: 1 });
  });

  it("counts prefetches in flight and drops back to zero when they settle", async () => {
    const gate = deferred<{ key: string }>();
    const cache = createPlaceCacheGroup({
      loadContext: () => gate.promise,
      loadArchetypes: async () => [] as string[],
      loadStyles: async () => [] as string[],
    });
    expect(cache.prefetchesInFlight()).toBe(0);
    const pending = cache.prefetch(client, "k");
    expect(cache.prefetchesInFlight()).toBe(1);
    gate.resolve({ key: "k" });
    await pending;
    expect(cache.prefetchesInFlight()).toBe(0);
  });

  it("a failing prefetch never throws and still clears the in-flight count", async () => {
    const cache = createPlaceCacheGroup({
      loadContext: async () => {
        throw new Error("network");
      },
      loadArchetypes: async () => [] as string[],
      loadStyles: async () => [] as string[],
    });
    await expect(cache.prefetch(client, "k")).resolves.toBeUndefined();
    expect(cache.prefetchesInFlight()).toBe(0);
    expect(cache.peekContext("k")).toBeUndefined();
  });

  it("clear() empties all three maps at once", async () => {
    const { cache, calls } = group();
    await cache.prefetch(client, "k");
    cache.clear();
    expect(cache.peekContext("k")).toBeUndefined();
    expect(cache.peekArchetypes("k")).toBeUndefined();
    expect(cache.peekStyles("k")).toBeUndefined();
    await cache.prefetch(client, "k");
    expect(calls).toEqual({ context: 2, archetypes: 2, styles: 2 });
  });

  it("a context that resolves null is never cached, an empty list always is", async () => {
    let contextCalls = 0;
    let styleCalls = 0;
    const cache = createPlaceCacheGroup({
      loadContext: async () => {
        contextCalls += 1;
        return null as { key: string } | null;
      },
      loadArchetypes: async () => [] as string[],
      loadStyles: async () => {
        styleCalls += 1;
        return [] as string[];
      },
    });
    await cache.loadContext(client, "k");
    await cache.loadContext(client, "k");
    await cache.loadStyles(client, "k");
    await cache.loadStyles(client, "k");
    expect(contextCalls).toBe(2);
    expect(styleCalls).toBe(1);
  });
});

// A selection is a race by nature: the viewer clicks Savoie, then Bourgogne
// before Savoie has answered. The panel's own `cancelled` guards decide which
// RESPONSE is allowed on screen; what the cache must guarantee is that neither
// key's result is lost, swapped or dropped when they settle out of order.
describe("createKeyedCache under interleaved selections", () => {
  it("two keys in flight settling in REVERSE order each cache their own value", async () => {
    const first = deferred<{ key: string }>();
    const second = deferred<{ key: string }>();
    const pending = new Map([
      ["a", first],
      ["b", second],
    ]);
    const cache = createKeyedCache<Client, { key: string }>({
      capacity: 5,
      load: (_c, key) => pending.get(key)!.promise,
    });

    const a = cache.load(client, "a");
    const b = cache.load(client, "b");
    // The SECOND selection answers first — the common case when the first one
    // is a country and the second a small appellation.
    second.resolve({ key: "b" });
    expect(await b).toEqual({ key: "b" });
    first.resolve({ key: "a" });
    expect(await a).toEqual({ key: "a" });

    expect(cache.peek("a")).toEqual({ key: "a" });
    expect(cache.peek("b")).toEqual({ key: "b" });
  });

  it("one key failing never evicts or poisons another key's value", async () => {
    const good = deferred<{ key: string }>();
    const bad = deferred<{ key: string }>();
    const pending = new Map([
      ["good", good],
      ["bad", bad],
    ]);
    const cache = createKeyedCache<Client, { key: string }>({
      capacity: 5,
      load: (_c, key) => pending.get(key)!.promise,
    });

    const okPromise = cache.load(client, "good");
    const badPromise = cache.load(client, "bad");
    good.resolve({ key: "good" });
    await okPromise;
    bad.reject(new Error("boom"));
    await expect(badPromise).rejects.toThrow("boom");

    expect(cache.peek("good")).toEqual({ key: "good" });
    expect(cache.peek("bad")).toBeUndefined();
  });

  it("re-selecting a key whose request is still out joins it, and one settle serves both", async () => {
    const held = deferred<{ key: string }>();
    const load = vi.fn(() => held.promise);
    const cache = createKeyedCache<Client, { key: string }>({
      capacity: 5,
      load,
    });

    const a = cache.load(client, "k");
    const b = cache.load(client, "k");
    const c = cache.load(client, "k");
    expect(load).toHaveBeenCalledTimes(1);
    held.resolve({ key: "k" });

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(rb).toBe(ra);
    expect(rc).toBe(ra);
    expect(cache.peek("k")).toBe(ra);
  });

  it("clear() during two in-flight loads leaves neither cached and both resolving", async () => {
    const one = deferred<{ key: string }>();
    const two = deferred<{ key: string }>();
    const pending = new Map([
      ["one", one],
      ["two", two],
    ]);
    const cache = createKeyedCache<Client, { key: string }>({
      capacity: 5,
      load: (_c, key) => pending.get(key)!.promise,
    });

    const a = cache.load(client, "one");
    const b = cache.load(client, "two");
    cache.clear();
    one.resolve({ key: "one" });
    two.resolve({ key: "two" });

    // The callers still get their answers — an account change must not hang
    // a request that was already out.
    expect(await a).toEqual({ key: "one" });
    expect(await b).toEqual({ key: "two" });
    // But nothing from before the clear is served to the next account.
    expect(cache.peek("one")).toBeUndefined();
    expect(cache.peek("two")).toBeUndefined();
  });

  it("a retry after a failure caches normally", async () => {
    let attempt = 0;
    const cache = createKeyedCache<Client, { key: string }>({
      capacity: 5,
      load: async (_c, key) => {
        attempt += 1;
        if (attempt === 1) throw new Error("first attempt fails");
        return { key };
      },
    });

    await expect(cache.load(client, "k")).rejects.toThrow("first attempt fails");
    expect(cache.peek("k")).toBeUndefined();
    await expect(cache.load(client, "k")).resolves.toEqual({ key: "k" });
    expect(cache.peek("k")).toEqual({ key: "k" });
    expect(attempt).toBe(2);
  });
});
