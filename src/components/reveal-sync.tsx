"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientTiming } from "@/lib/reveal-timing";

/**
 * Live reveal sync for a tasting. Subscribes to Postgres changes on `wines`
 * (reveal_step / is_revealed) and `guesses` for this tasting and refreshes the
 * server components on each change — so a host advancing the reveal, or another
 * taster submitting, shows up for everyone without a poll. Realtime honours RLS,
 * so only the safe reveal_step counter is broadcast; a reconnecting client
 * re-reads current state on the refresh. Replaces AutoRefresh on live tastings.
 *
 * The two event sources are debounced differently on purpose. Advancing the
 * reveal updates `wines` once and every `guesses` row for that wine, so a
 * single tap produces a burst; a flat debounce across both meant the reveal —
 * the thing everyone is waiting for — paid a delay that only existed to
 * coalesce the guess rows behind it. A `wines` change now refreshes almost
 * immediately, while `guesses` chatter keeps the longer window.
 *
 * `watermark` should change whenever the reveal advances (the current wine's
 * reveal_step). It is how this measures event-to-on-screen latency: the
 * refresh is requested on the event, and the watermark changing is the proof
 * that the new content actually committed.
 */
export function RevealSync({
  tastingId,
  watermark,
}: {
  tastingId: string;
  watermark?: number;
}) {
  const router = useRouter();
  const pendingSince = useRef<number | null>(null);

  // A watermark change means the refresh landed — close the timing.
  useEffect(() => {
    if (pendingSince.current === null) return;
    logClientTiming(
      "participant: reveal event -> on screen",
      performance.now() - pendingSince.current,
    );
    pendingSince.current = null;
  }, [watermark]);

  useEffect(() => {
    const supabase = createClient();
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let guessTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshSoon = (delay: number, isReveal: boolean) => {
      if (isReveal && pendingSince.current === null) {
        pendingSince.current = performance.now();
      }
      const timer = isReveal ? revealTimer : guessTimer;
      if (timer) clearTimeout(timer);
      const handle = setTimeout(() => router.refresh(), delay);
      if (isReveal) revealTimer = handle;
      else guessTimer = handle;
    };

    const channel = supabase
      .channel(`reveal:${tastingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wines",
          filter: `tasting_id=eq.${tastingId}`,
        },
        () => refreshSoon(20, true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guesses" },
        () => refreshSoon(250, false),
      )
      .subscribe();
    return () => {
      if (revealTimer) clearTimeout(revealTimer);
      if (guessTimer) clearTimeout(guessTimer);
      supabase.removeChannel(channel);
    };
  }, [tastingId, router]);
  return null;
}
