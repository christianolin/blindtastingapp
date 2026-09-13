"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { READ_MAX_SIDE } from "./downscale-image";
import type { AddWineStart } from "./types";

export type CameraStatus = "idle" | "starting" | "live" | "unavailable" | "denied";

// A capture is already sized for the label reader (spec §A.4).
const MAX_SIDE = READ_MAX_SIDE;
const noopSubscribe = () => () => {};

/** True when this browser can even ask for a camera (SSR-safe). */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

// ---------------------------------------------------------------------------
// Routing (spec §C.3, ledger D5). The add-wine sheet opens on the live camera
// only when `canScan` (use-can-scan.ts): a coarse pointer AND a video input.
// Otherwise the laptop view takes its place and Upload replaces Scan — never
// both, never by width and never by user agent. Only the sheet's frame
// (full-screen below `sm`, a centred card above) stays width-based, in CSS.
// ---------------------------------------------------------------------------

/** @deprecated removed in S6 — route by `canScan` (use-can-scan.ts). */
export const TOUCH_PRIMARY_QUERY = "(pointer: coarse)";

/** @deprecated removed in S6 — route by `canScan` (use-can-scan.ts). */
export function isTouchPrimary(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(TOUCH_PRIMARY_QUERY).matches
  );
}

/**
 * A live media query. The server snapshot is `false`, so a server render and
 * its hydration agree on "no match" and the client value follows right after
 * (no hydration mismatch); a client-only mount reads the real value at once.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** @deprecated removed in S6 — use `useCanScan()` (use-can-scan.ts). */
export function useTouchPrimary(): boolean {
  return useMediaQuery(TOUCH_PRIMARY_QUERY);
}

/** @deprecated removed in S6 — `startViewFor` no longer opens a phone search view. */
export type DeviceRoutedView = "camera" | "search" | "cellar" | "byhand" | "desktop";

/** The view a launcher's `start` opens on. `cellar` and `byhand` open those
    views on every device; `camera`, `search` and no start open the camera when
    `canScan`, otherwise the laptop view, whose own field is the search. */
export function startViewFor(
  start: AddWineStart | undefined,
  canScan: boolean,
): "camera" | "cellar" | "byhand" | "desktop" {
  if (start === "cellar") return "cellar";
  if (start === "byhand") return "byhand";
  return homeViewFor(canScan);
}

/** Where the sheet goes back to after a read, a confirm or an add. */
export function homeViewFor(canScan: boolean): "camera" | "desktop" {
  return canScan ? "camera" : "desktop";
}

/** @deprecated removed in S6 — sheet-state.ts moves the views when `canScan` changes. */
export function viewForDevice<V extends string>(view: V, touch: boolean): V | "desktop" {
  return !touch && (view === "camera" || view === "search") ? "desktop" : view;
}

/**
 * Live environment camera into a <video>, with a JPEG capture. Starts on
 * mount (when `enabled`), stops its tracks on unmount and whenever `enabled`
 * turns false — the sheet flips it off as soon as it leaves the camera view
 * so the light on the phone goes out.
 *
 * `unavailable` covers "no getUserMedia" and "no camera / in use";
 * `denied` is the permission refusal. Both are recoverable through the
 * Library picker, which the camera view promotes to primary.
 */
export function useCamera(enabled = true): {
  status: CameraStatus;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  capture: () => Promise<Blob | null>;
  stop: () => void;
  restart: () => void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const supported = useSyncExternalStore(noopSubscribe, cameraSupported, () => false);
  // The async outcome of the last getUserMedia attempt; everything else is
  // derived so the effect never sets state synchronously.
  const [outcome, setOutcome] = useState<"pending" | "live" | "unavailable" | "denied">(
    "pending",
  );
  const [attempt, setAttempt] = useState(0);
  const [stopped, setStopped] = useState(false);

  const releaseTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !supported || stopped) {
      releaseTracks();
      return;
    }
    let cancelled = false;
    const video = videoRef.current;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const target = videoRef.current ?? video;
        if (target) {
          target.srcObject = stream;
          // play() can reject on an already-playing or detached element;
          // the stream is still attached either way.
          target.play().catch(() => {});
        }
        setOutcome("live");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setOutcome(
          name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
        );
      });
    return () => {
      cancelled = true;
      releaseTracks();
      if (video) video.srcObject = null;
    };
  }, [enabled, supported, stopped, attempt, releaseTracks]);

  // The <video> may mount after the stream arrived (a view that renders it
  // conditionally) — reattach whenever we are live and it has no source.
  useEffect(() => {
    const video = videoRef.current;
    if (outcome === "live" && video && streamRef.current && !video.srcObject) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  });

  const status: CameraStatus = !enabled || stopped
    ? "idle"
    : !supported
      ? "unavailable"
      : outcome === "pending"
        ? "starting"
        : outcome;

  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || status !== "live" || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85),
    );
  }, [status]);

  const stop = useCallback(() => {
    releaseTracks();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStopped(true);
  }, [releaseTracks]);

  const restart = useCallback(() => {
    setStopped(false);
    setOutcome("pending");
    setAttempt((n) => n + 1);
  }, []);

  return { status, videoRef, capture, stop, restart };
}
