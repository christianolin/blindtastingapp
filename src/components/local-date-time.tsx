"use client";

import { useState } from "react";

// Formats an ISO timestamp in the viewer's own locale + timezone. Computed via
// a lazy initializer (guarded on window) rather than useEffect+setState, so it
// doesn't trip the set-state-in-effect lint; the SSR/client text differ by
// timezone, hence suppressHydrationWarning.
export function LocalDateTime({ iso }: { iso: string }) {
  const [text] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new Date(iso).toLocaleString(undefined, {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
  );
  return <span suppressHydrationWarning>{text || "Scheduled"}</span>;
}
