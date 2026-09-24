// The One country | All countries choice and its crash-loop guard (spec
// 2026-09-23 §7.2, §7.5). The hook itself needs a DOM; everything it does is
// the store's, and the store takes its storage as an argument.
import { describe, expect, it, vi } from "vitest";
import type { StorageLike } from "../safe-storage";
import {
  allModeHealthy,
  createDetailModeStore,
  DETAIL_ALL_KEY,
  DETAIL_PENDING_KEY,
  initialDetailMode,
} from "./detail-mode";
import { SHARD_MIN_ZOOM } from "./mount-policy";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return { data, getStorage: () => storage };
}

describe("initialDetailMode", () => {
  const reader = (set: string[]) => (key: string) => set.includes(key);

  it("starts in One country when nothing was chosen", () => {
    expect(initialDetailMode(reader([]))).toEqual({ mode: "one", fellBack: false });
  });

  it("starts in All countries when that was chosen and the last visit confirmed it", () => {
    expect(initialDetailMode(reader([DETAIL_ALL_KEY]))).toEqual({ mode: "all", fellBack: false });
  });

  it("falls back to One country when the last All never confirmed", () => {
    expect(initialDetailMode(reader([DETAIL_ALL_KEY, DETAIL_PENDING_KEY]))).toEqual({
      mode: "one",
      fellBack: true,
    });
  });

  it("ignores a stale sentinel with no All choice", () => {
    expect(initialDetailMode(reader([DETAIL_PENDING_KEY]))).toEqual({
      mode: "one",
      fellBack: false,
    });
  });

  it("uses the exact persistence keys", () => {
    expect(DETAIL_ALL_KEY).toBe("wine-map-all-countries");
    expect(DETAIL_PENDING_KEY).toBe("wine-map-all-pending");
  });
});

describe("createDetailModeStore", () => {
  it("returns the same snapshot object until something changes", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const first = store.getSnapshot();
    expect(first).toEqual({ mode: "one", fellBack: false });
    expect(store.getSnapshot()).toBe(first);
  });

  it("setMode('all') remembers the choice, arms the sentinel and notifies once", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("confirmHealthy clears only the sentinel, and a new page load starts in All", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    store.setMode("all");
    const before = store.getSnapshot();
    store.confirmHealthy();
    expect(data.has(DETAIL_PENDING_KEY)).toBe(false);
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(store.getSnapshot()).toBe(before);
    expect(createDetailModeStore(getStorage).getSnapshot()).toEqual({
      mode: "all",
      fellBack: false,
    });
  });

  it("a page that never confirmed All starts the next one in One, and keeps the saved choice", () => {
    const { data, getStorage } = memoryStorage({
      [DETAIL_ALL_KEY]: "1",
      [DETAIL_PENDING_KEY]: "1",
    });
    const store = createDetailModeStore(getStorage);
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    // Nothing on this page may clear the evidence or re-drop.
    store.confirmHealthy();
    store.dropToOne();
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    // One tap on All tries again.
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
  });

  it("dropToOne switches this page only and leaves the saved choice alone", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    store.setMode("all");
    const listener = vi.fn();
    store.subscribe(listener);
    store.dropToOne();
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dropToOne does nothing in One country (a lost context there is not All's doing)", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const before = store.getSnapshot();
    store.dropToOne();
    expect(store.getSnapshot()).toBe(before);
  });

  it("setMode('one') forgets All and the sentinel, and clears a fallback", () => {
    const { data, getStorage } = memoryStorage({
      [DETAIL_ALL_KEY]: "1",
      [DETAIL_PENDING_KEY]: "1",
    });
    const store = createDetailModeStore(getStorage);
    store.setMode("one");
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: false });
    expect(data.has(DETAIL_ALL_KEY)).toBe(false);
    expect(data.has(DETAIL_PENDING_KEY)).toBe(false);
  });

  it("rapid switching lands on the last choice, notifying each change", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setMode("all");
    store.setMode("one");
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(3);
    store.setMode("all");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("armSentinel writes only in All countries", () => {
    const { data, getStorage } = memoryStorage({ [DETAIL_ALL_KEY]: "1" });
    const store = createDetailModeStore(getStorage);
    store.armSentinel();
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    const one = memoryStorage();
    createDetailModeStore(one.getStorage).armSentinel();
    expect(one.data.has(DETAIL_PENDING_KEY)).toBe(false);
  });

  it("unsubscribe stops notifications", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setMode("all");
    expect(listener).not.toHaveBeenCalled();
  });

  it("blocked storage reads as One country and still switches for this page view", () => {
    const store = createDetailModeStore(() => {
      throw new Error("SecurityError");
    });
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: false });
    expect(() => store.setMode("all")).not.toThrow();
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
  });
});

describe("allModeHealthy", () => {
  it("gives All its all-clear at the first idle at shard zoom with shards mounted", () => {
    expect(allModeHealthy({ pending: true, mountedCount: 12, zoom: SHARD_MIN_ZOOM })).toBe(true);
    expect(allModeHealthy({ pending: true, mountedCount: 1, zoom: 9.5 })).toBe(true);
  });

  it("does not clear the sentinel before All has really drawn", () => {
    // The idle right after load at the opening z4.4: nothing is mounted.
    expect(allModeHealthy({ pending: true, mountedCount: 0, zoom: 4.4 })).toBe(false);
    // A ?place= deep link mounts its own shard below z5. That is one shard,
    // not the 40+ the first zoom in All loads.
    expect(allModeHealthy({ pending: true, mountedCount: 1, zoom: 4.99 })).toBe(false);
    // Shard zoom, but the mount has not landed yet.
    expect(allModeHealthy({ pending: true, mountedCount: 0, zoom: 6 })).toBe(false);
  });

  it("fires once per switch to All: never after the all-clear, never in One country", () => {
    expect(allModeHealthy({ pending: false, mountedCount: 40, zoom: 6 })).toBe(false);
  });
});
