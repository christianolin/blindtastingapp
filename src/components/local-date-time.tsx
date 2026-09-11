"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// Formats an ISO timestamp in the viewer's own locale + timezone. The server
// (and the hydration pass) render the neutral "Scheduled" placeholder and the
// client swaps in the local text right after hydrating — useSyncExternalStore
// with a separate server snapshot is React's sanctioned way to render a
// client-only value without a hydration mismatch and without a set-state-in-
// effect. (A lazy useState initialiser looked the same but never re-rendered
// after a hard load, so hard-loaded pages kept showing "Scheduled".)
export function LocalDateTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () =>
      new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    () => "",
  );
  return <span>{text || "Scheduled"}</span>;
}
