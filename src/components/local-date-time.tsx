"use client";

import { useSyncExternalStore } from "react";

import { formatTastingDate, type TastingDateFormat } from "@/lib/tasting-date-format";

const noopSubscribe = () => () => {};

function formatDefault(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Formats an ISO timestamp in the viewer's own locale + timezone. The server
// (and the hydration pass) render the neutral "Scheduled" placeholder and the
// client swaps in the local text right after hydrating — useSyncExternalStore
// with a separate server snapshot is React's sanctioned way to render a
// client-only value without a hydration mismatch and without a set-state-in-
// effect. (A lazy useState initialiser looked the same but never re-rendered
// after a hard load, so hard-loaded pages kept showing "Scheduled".)
//
// `format` (BT-D1, spec §6.3 item 3): "default" keeps the locale string
// above; "eyebrow" / "eyebrow-short" / "card" go through the pure
// `formatTastingDate` (English words, the viewer's zone, 24-hour clock).
export function LocalDateTime({
  iso,
  format = "default",
}: {
  iso: string;
  format?: TastingDateFormat;
}) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () => (format === "default" ? formatDefault(iso) : formatTastingDate(iso, format)),
    () => "",
  );
  return <span>{text || "Scheduled"}</span>;
}
