"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server for fresh data during a live tasting so participants see
 * new guesses / reveals without hitting refresh. `router.refresh()` re-fetches
 * server components while preserving client state (an open guess form keeps
 * its inputs), so it's safe to run while someone is mid-guess. Pauses while
 * the tab is hidden. This is deliberately polling, not Supabase Realtime —
 * no replication setup, and a few seconds of latency is fine for a tasting.
 */
export function AutoRefresh({ intervalMs = 6000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
