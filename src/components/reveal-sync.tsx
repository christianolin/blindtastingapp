"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live reveal sync for a tasting. Subscribes to Postgres changes on `wines`
 * (reveal_step / is_revealed) and `guesses` for this tasting and refreshes the
 * server components on each change — so a host advancing the reveal, or another
 * taster submitting, shows up for everyone without a poll. Realtime honours RLS,
 * so only the safe reveal_step counter is broadcast; a reconnecting client
 * re-reads current state on the refresh. Replaces AutoRefresh on live tastings.
 */
export function RevealSync({ tastingId }: { tastingId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
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
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guesses" },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tastingId, router]);
  return null;
}
