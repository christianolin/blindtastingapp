// A bounded least-recently-used map. Pure — no browser API, no React — so the
// wine-map place cache (./keyed-cache) can be unit-tested in vitest's node
// environment without a DOM or a Supabase client.
//
// Insertion-ordered `Map` does the ordering for free: a hit deletes and re-sets
// the key so it moves to the end, and a set past capacity drops the first key,
// which is by construction the least recently used.

export type Lru<V> = {
  /** Reads and PROMOTES the key to most-recently-used. */
  get(key: string): V | undefined;
  /** Reads WITHOUT promoting — for "can I render this right now" checks. */
  peek(key: string): V | undefined;
  /** True even when the stored value is itself `undefined`. */
  has(key: string): boolean;
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};

export function createLru<V>(capacity: number): Lru<V> {
  const entries = new Map<string, V>();

  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    peek(key) {
      return entries.get(key);
    },
    has(key) {
      return entries.has(key);
    },
    set(key, value) {
      if (capacity < 1) return;
      // Delete first so a re-set of an existing key moves to the end rather
      // than keeping its original position.
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > capacity) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
