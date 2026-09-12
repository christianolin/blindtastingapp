"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AddWineStart } from "./types";

export type CameraStatus = "idle" | "starting" | "live" | "unavailable" | "denied";

const MAX_SIDE = 1600;
const noopSubscribe = () => () => {};

/** True when this browser can even ask for a camera (SSR-safe). */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

// ---------------------------------------------------------------------------
// The device rule (owner feedback, 2026-09-12): the live camera is for phones
// and tablets only. The add-wine sheet routes by INPUT TYPE, never by width —
// a PC with a webcam gets the 7h desktop view (upload label photos, search,
// cellar, by hand) at any window width, and a tablet wider than `md` still
// gets the camera. Only the sheet's frame (full-screen below `sm`, a centred
// card above) stays width-based, and that lives in CSS.
// ---------------------------------------------------------------------------

/** Touch-primary: the device's primary pointer is a finger (phone, tablet). */
export const TOUCH_PRIMARY_QUERY = "(pointer: coarse)";

/** The device rule as a plain, SSR-safe read — for a `useState` initialiser,
    which has to pick the opening view before any subscription exists. */
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

/** The device rule as a hook: true on a phone or tablet, false on a mouse /
    trackpad device — and on the server (see `useMediaQuery`). */
export function useTouchPrimary(): boolean {
  return useMediaQuery(TOUCH_PRIMARY_QUERY);
}

/** The sheet views the device rule decides between. */
export type DeviceRoutedView = "camera" | "search" | "cellar" | "byhand" | "desktop";

/** The view a `start` opens on. Touch: the phone views, as they always were.
    Mouse / trackpad: "camera", "search" and no start all open the desktop
    view; cellar and by hand are the same branch on either device. */
export function startViewFor(
  start: AddWineStart | undefined,
  touch: boolean,
): DeviceRoutedView {
  if (start === "cellar") return "cellar";
  if (start === "byhand") return "byhand";
  if (!touch) return "desktop";
  return start === "search" ? "search" : "camera";
}

/** Where the sheet goes back to after a read, a confirm or an add. */
export function homeViewFor(touch: boolean): "camera" | "desktop" {
  return touch ? "camera" : "desktop";
}

/** A mouse device never shows the camera, nor the phone search view (which
    it could only leave by a Scan control it does not get): either becomes
    the desktop view, whose own field is the search. Applied at render, so it
    also covers a pointer type that changes while the sheet is open. */
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
