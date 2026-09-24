"use client";

// Map detail: One country | All countries (spec 2026-09-23 §7.2, §7.5).
// One country is the default for everyone. The choice is remembered per
// browser through safe-storage flags and never put in the URL, so a shared
// ?place= link cannot put a phone into All countries.
//
// All countries is guarded against a crash loop. A phone that runs out of
// graphics memory in All kills the tab, and a remembered All would reopen
// straight into the same crash on every visit. So DETAIL_PENDING_KEY is set
// before All draws. It is cleared once All has drawn and gone idle (the map
// reports that through onHealthy) or the page is left normally (pagehide, which
// a killed tab never fires). A load that finds the sentinel still set starts
// in One country and says why. The saved choice stays All until the viewer
// changes it.
//
// Same hydration shape as the Local/English toggle: useSyncExternalStore with
// "one" as the server snapshot, so the first client render matches the server
// and the stored choice lands after hydration with no setState in an effect.
import { useEffect, useSyncExternalStore } from "react";
import { clearFlag, readFlag, writeFlag, type StorageLike } from "../safe-storage";
import { SHARD_MIN_ZOOM } from "./mount-policy";

export type DetailMode = "one" | "all";

/** Set = All countries. Only setMode writes it, so a fallback never erases the
    viewer's choice. */
export const DETAIL_ALL_KEY = "wine-map-all-countries";

/** The crash-loop sentinel (see the top of this file). */
export const DETAIL_PENDING_KEY = "wine-map-all-pending";

export type DetailSnapshot = { mode: DetailMode; fellBack: boolean };

/** The mode a page load starts in. `fellBack` means All was chosen, but the
    last page that drew it never confirmed it. */
export function initialDetailMode(read: (key: string) => boolean): DetailSnapshot {
  if (!read(DETAIL_ALL_KEY)) return { mode: "one", fellBack: false };
  if (read(DETAIL_PENDING_KEY)) return { mode: "one", fellBack: true };
  return { mode: "all", fellBack: false };
}

export type DetailModeStore = {
  getSnapshot(): DetailSnapshot;
  subscribe(listener: () => void): () => void;
  /** The viewer's choice: persisted, and it clears any fallback. A call that
      names the mode already shown, with no fallback notice up, is a no-op —
      it writes no storage and notifies nobody. */
  setMode(mode: DetailMode): void;
  /** A lost WebGL context in All: One for this page only, with the reason
      shown. The saved choice is untouched. A no-op outside All. */
  dropToOne(): void;
  /** Set the sentinel before All draws. A no-op outside All. */
  armSentinel(): void;
  /** All drew and went idle, or the page was left normally. A no-op outside
      All, so a fallback page can never erase the evidence that sent it there. */
  confirmHealthy(): void;
};

/** The store behind useDetailMode, with its storage passed in so it can be
    tested with a fake. Storage is read once, lazily, on the first snapshot, and
    the snapshot object only changes when the mode or the fallback does, as
    useSyncExternalStore requires. A write that fails (site data blocked, full
    store) still switches the page. The choice just is not remembered. */
export function createDetailModeStore(
  getStorage: () => StorageLike | null,
): DetailModeStore {
  let snapshot: DetailSnapshot | null = null;
  const listeners = new Set<() => void>();
  const current = (): DetailSnapshot =>
    (snapshot ??= initialDetailMode((key) => readFlag(getStorage, key)));
  const publish = (next: DetailSnapshot) => {
    const prev = current();
    if (prev.mode === next.mode && prev.fellBack === next.fellBack) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setMode(mode) {
      if (current().mode === mode && !current().fellBack) return;
      if (mode === "all") {
        writeFlag(getStorage, DETAIL_ALL_KEY);
        writeFlag(getStorage, DETAIL_PENDING_KEY);
      } else {
        clearFlag(getStorage, DETAIL_ALL_KEY);
        clearFlag(getStorage, DETAIL_PENDING_KEY);
      }
      publish({ mode, fellBack: false });
    },
    dropToOne() {
      if (current().mode !== "all") return;
      publish({ mode: "one", fellBack: true });
    },
    armSentinel() {
      if (current().mode === "all") writeFlag(getStorage, DETAIL_PENDING_KEY);
    },
    confirmHealthy() {
      if (current().mode === "all") clearFlag(getStorage, DETAIL_PENDING_KEY);
    },
  };
}

/** Whether a map idle is All countries' all-clear. "All has drawn" means an
    idle at shard zoom with shards mounted. The idle right after load at the
    opening z4.4 mounts nothing, and a ?place= deep link mounts only its own
    shard below z5. Clearing the sentinel at either would leave the zoom that
    really loads 40+ shards unguarded. The map keeps `pending` true only while
    All has not yet proved itself on this page, so this fires once per switch
    to All. */
export function allModeHealthy(input: {
  pending: boolean;
  mountedCount: number;
  zoom: number;
}): boolean {
  return input.pending && input.mountedCount > 0 && input.zoom >= SHARD_MIN_ZOOM;
}

// The page's one store. The getter runs inside readFlag/writeFlag's
// try/catch, so a server import or blocked site data never throws.
const detailStore = createDetailModeStore(() => window.localStorage);
const SERVER_SNAPSHOT: DetailSnapshot = { mode: "one", fellBack: false };
const serverSnapshot = () => SERVER_SNAPSHOT;

export function useDetailMode(): {
  mode: DetailMode;
  fellBack: boolean;
  setMode(mode: DetailMode): void;
  dropToOne(): void;
  confirmHealthy(): void;
} {
  const snapshot = useSyncExternalStore(
    detailStore.subscribe,
    detailStore.getSnapshot,
    serverSnapshot,
  );
  // Arm the sentinel whenever All is live on this page, which covers a page
  // load that starts in All as well as a tap. The map chunk loads after
  // hydration, so this always runs before All draws a single shard. A normal
  // exit clears it, and a page restored from the back-forward cache re-arms.
  useEffect(() => {
    if (snapshot.mode !== "all") return;
    detailStore.armSentinel();
    const onPageHide = () => detailStore.confirmHealthy();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) detailStore.armSentinel();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [snapshot.mode]);
  return {
    mode: snapshot.mode,
    fellBack: snapshot.fellBack,
    setMode: detailStore.setMode,
    dropToOne: detailStore.dropToOne,
    confirmHealthy: detailStore.confirmHealthy,
  };
}
