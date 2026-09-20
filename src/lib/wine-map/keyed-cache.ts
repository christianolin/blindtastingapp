// The wine map's per-key client cache (spec
// docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.1).
//
// Pure: no browser API, no React, no Supabase import — ./place-cache wires the
// real fetchers into it, and vitest exercises the whole contract here with fake
// loaders.
//
// Why a cache is safe and why it never expires. Everything it holds is the
// editorial place catalogue (wine_places, wine_place_articles,
// wine_place_styles, wine_place_grapes, wine_designations, wine_archetypes).
// Every policy behind those tables is content-level, not identity-level — none
// references auth.uid(), and get_wine_place_context is SECURITY INVOKER over
// the same tables — so two signed-in viewers receive identical payloads and
// there is nothing per-user to leak between them. The rows only ever change by
// a data migration plus a redeploy, so a **page load** is exactly the right
// refresh boundary: this module lives in the browser bundle, so a reload (which
// every deploy forces anyway) starts it empty. That is why there is no TTL.
// ./place-cache still clears the whole thing when the signed-in user changes,
// as a guard against a future policy that IS per-user.
//
// Two things are deliberately never cached: a rejected request (so the next
// selection retries) and a `null` context, which can mean "RLS hid it" rather
// than a stable fact. An EMPTY list, by contrast, is the true answer for most
// places and is cached like any other value.

import { createLru } from "./lru";

/** 50 entries per map. Context payloads measure 1.5–6.3 KB, so the context map
    peaks near 300 KB; archetypes and styles are an order of magnitude less. */
export const MAX_CACHE_ENTRIES = 50;

export type KeyedCache<C, V> = {
  /** Cached value, a shared in-flight promise, or a fresh request. */
  load(client: C, key: string): Promise<V>;
  /** The RESOLVED value only — `undefined` while a request is still out.
      Never starts a request. This is what lets a revisit paint in one render
      instead of committing a "Loading…" frame first. */
  peek(key: string): V | undefined;
  clear(): void;
};

export function createKeyedCache<C, V>(options: {
  capacity: number;
  load: (client: C, key: string) => Promise<V>;
  /** Defaults to "cache everything". Used to keep a null context out. */
  cacheable?: (value: V) => boolean;
}): KeyedCache<C, V> {
  const { capacity, load, cacheable } = options;
  const values = createLru<V>(capacity);
  const inFlight = new Map<string, Promise<V>>();
  // Bumped by clear(), so a request started before the clear resolves normally
  // for its caller but never writes into the emptied map.
  let generation = 0;

  return {
    load(client, key) {
      if (values.has(key)) return Promise.resolve(values.get(key) as V);
      const pending = inFlight.get(key);
      if (pending) return pending;
      const startedAt = generation;
      const request = load(client, key).then(
        (value) => {
          if (inFlight.get(key) === request) inFlight.delete(key);
          if (startedAt === generation && (cacheable?.(value) ?? true)) {
            values.set(key, value);
          }
          return value;
        },
        (error: unknown) => {
          if (inFlight.get(key) === request) inFlight.delete(key);
          values.delete(key);
          throw error;
        },
      );
      inFlight.set(key, request);
      return request;
    },
    peek(key) {
      return values.peek(key);
    },
    clear() {
      generation += 1;
      values.clear();
      inFlight.clear();
    },
  };
}

export type PlaceCacheGroup<C, Ctx, A, S> = {
  loadContext(client: C, key: string): Promise<Ctx | null>;
  loadArchetypes(client: C, key: string): Promise<A[]>;
  loadStyles(client: C, key: string): Promise<S[]>;
  peekContext(key: string): Ctx | null | undefined;
  peekArchetypes(key: string): A[] | undefined;
  peekStyles(key: string): S[] | undefined;
  /** Warms all three for one key. Resolves when they settle; never throws. */
  prefetch(client: C, key: string): Promise<void>;
  prefetchesInFlight(): number;
  clear(): void;
};

/** The three caches one place selection needs, plus the prefetch bookkeeping
    the hover rule reads (./prefetch-rule's `inFlight`). */
export function createPlaceCacheGroup<C, Ctx, A, S>(options: {
  capacity?: number;
  loadContext: (client: C, key: string) => Promise<Ctx | null>;
  loadArchetypes: (client: C, key: string) => Promise<A[]>;
  loadStyles: (client: C, key: string) => Promise<S[]>;
}): PlaceCacheGroup<C, Ctx, A, S> {
  const capacity = options.capacity ?? MAX_CACHE_ENTRIES;
  const context = createKeyedCache<C, Ctx | null>({
    capacity,
    load: options.loadContext,
    // A null context is "not on the map yet" OR "RLS hid it" — never cached.
    cacheable: (value) => value !== null,
  });
  const archetypes = createKeyedCache<C, A[]>({
    capacity,
    load: options.loadArchetypes,
  });
  const styles = createKeyedCache<C, S[]>({
    capacity,
    load: options.loadStyles,
  });
  let inFlight = 0;

  return {
    loadContext: (client, key) => context.load(client, key),
    loadArchetypes: (client, key) => archetypes.load(client, key),
    loadStyles: (client, key) => styles.load(client, key),
    peekContext: (key) => context.peek(key),
    peekArchetypes: (key) => archetypes.peek(key),
    peekStyles: (key) => styles.peek(key),
    prefetch(client, key) {
      inFlight += 1;
      return Promise.allSettled([
        context.load(client, key),
        archetypes.load(client, key),
        styles.load(client, key),
      ]).then(() => {
        inFlight -= 1;
      });
    },
    prefetchesInFlight: () => inFlight,
    clear() {
      context.clear();
      archetypes.clear();
      styles.clear();
    },
  };
}
