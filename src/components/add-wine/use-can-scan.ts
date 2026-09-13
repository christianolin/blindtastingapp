"use client";

// canScan (spec §C.3, ledger D5). The add-wine sheet offers the live camera
// only on a device whose primary pointer is coarse AND that has a video input.
// When enumerateDevices is unavailable, getUserMedia's presence stands in for
// the device check. It is never a user-agent sniff. When it is false, Upload
// replaces Scan, and the sheet never shows both.
//
// `detectCanScan` and `forcedCanScan` are pure and unit-tested with fakes
// (use-can-scan.test.ts); `useCanScan` is the browser half.
import { useSyncExternalStore } from "react";

export async function detectCanScan(env: {
  matchMedia: (query: string) => { matches: boolean };
  mediaDevices: MediaDevices | undefined;
}): Promise<boolean> {
  if (!env.matchMedia("(pointer: coarse)").matches) return false;
  const md = env.mediaDevices;
  if (!md) return false;
  if (typeof md.enumerateDevices === "function") {
    try {
      return (await md.enumerateDevices()).some((d) => d.kind === "videoinput");
    } catch {
      // unavailable → fall through to getUserMedia presence
    }
  }
  return typeof md.getUserMedia === "function";
}

/** The development override. The Browser pane's phone emulation has no camera
    (spec §G.4), so `NEXT_PUBLIC_FORCE_CAN_SCAN=1` resolves to true, but only
    outside production. */
export function forcedCanScan(env: { NODE_ENV?: string; NEXT_PUBLIC_FORCE_CAN_SCAN?: string }): boolean {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_FORCE_CAN_SCAN === "1";
}

// Literal `process.env.*` references, so Next inlines both at build time; a
// dynamic lookup would not be inlined.
const FORCED = forcedCanScan({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_FORCE_CAN_SCAN: process.env.NEXT_PUBLIC_FORCE_CAN_SCAN,
});

const COARSE_POINTER = "(pointer: coarse)";

// The resolved value lives at module level, so a reopened sheet paints the
// right view straight away instead of passing through "resolving" again.
let cached: boolean | null = null;
let latestRun = 0;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function redetect(): void {
  const run = ++latestRun;
  let pending: Promise<boolean>;
  try {
    pending = detectCanScan({
      matchMedia: window.matchMedia.bind(window),
      mediaDevices: navigator.mediaDevices,
    });
  } catch {
    // No matchMedia at all: nothing to scan with.
    pending = Promise.resolve(false);
  }
  void pending
    .catch(() => false)
    .then((value) => {
      // A newer detection (a pointer or device change mid-flight) wins.
      if (run !== latestRun || value === cached) return;
      cached = value;
      listeners.forEach((notify) => notify());
    });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!stopWatching) {
    const onEnvironmentChange = () => redetect();
    const pointer = typeof window.matchMedia === "function" ? window.matchMedia(COARSE_POINTER) : null;
    const devices = navigator.mediaDevices;
    pointer?.addEventListener?.("change", onEnvironmentChange);
    devices?.addEventListener?.("devicechange", onEnvironmentChange);
    stopWatching = () => {
      pointer?.removeEventListener?.("change", onEnvironmentChange);
      devices?.removeEventListener?.("devicechange", onEnvironmentChange);
    };
    // Checked again whenever the first subscriber arrives: a camera plugged in
    // while no sheet was open still counts. The cached value paints meanwhile.
    redetect();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

const readCached = (): boolean | null => cached;
const unresolvedOnServer = (): boolean | null => null;
const noSubscription = () => () => {};
const forcedTrue = (): boolean | null => true;

/** `null` until resolved; the server snapshot is always unresolved. Re-runs on
    a `(pointer: coarse)` change and on the mediaDevices `devicechange` event. */
export function useCanScan(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    FORCED ? noSubscription : subscribe,
    FORCED ? forcedTrue : readCached,
    FORCED ? forcedTrue : unresolvedOnServer,
  );
}
