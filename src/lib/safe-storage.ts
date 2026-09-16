// The one try/catch around browser storage (B5; plan refinement 20). With site
// data blocked the bare `localStorage` accessor throws SecurityError, and a
// full store throws QuotaExceededError on write — both read as "no flag" or
// "not saved", never as a crash. Callers pass a getter such as
// `() => window.localStorage`, so the lookup itself runs inside the try, and
// keep the flag in component state for the visit when a write returns false.
// Shared by live-theme.ts (the result-dismissed flag) and Taste & Rate's
// "Don't show this again".
// Pure: no imports and no browser globals at module level, so vitest loads it.

// `removeItem` is optional so the fakes that only need reads and writes stay
// valid; clearFlag falls back to overwriting when a storage does not have it.
export type StorageLike = Pick<Storage, "getItem" | "setItem"> & {
  removeItem?: Storage["removeItem"];
};

/** What a set flag holds. */
const FLAG_SET = "1";

/** True only when the flag was written; a missing or throwing storage reads as false. */
export function readFlag(getStorage: () => StorageLike | null, key: string): boolean {
  try {
    return getStorage()?.getItem(key) === FLAG_SET;
  } catch {
    return false;
  }
}

/** Sets the flag. False when there is no storage or the write throws. */
export function writeFlag(getStorage: () => StorageLike | null, key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, FLAG_SET);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unsets the flag. False when there is no storage or the removal throws.
 *
 * Every flag that can be set needs this or the choice is one-way: the result
 * screen's "dismissed" flag had only readFlag/writeFlag, so once a viewer
 * dismissed a finished tasting's result there was no route back to it for as
 * long as that browser kept the key.
 *
 * Overwrites when the storage has no `removeItem`, which readFlag treats as
 * unset just the same — it only counts an exact FLAG_SET.
 */
export function clearFlag(getStorage: () => StorageLike | null, key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, "");
    return true;
  } catch {
    return false;
  }
}

/** A stored choice, or null when there is none — or none that can be read. */
export function readValue(
  getStorage: () => StorageLike | null,
  key: string,
): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores a choice. False when there is no storage or the write throws. */
export function writeValue(
  getStorage: () => StorageLike | null,
  key: string,
  value: string,
): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
