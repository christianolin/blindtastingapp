"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronsUp, Sparkles, Trophy } from "lucide-react";
import { markXpSeen } from "@/lib/levels/actions";
import { EMPTY_VIEW, levelStore, type ShownToast } from "@/lib/levels/level-store";
import { splitXp } from "@/lib/levels/toasts";
import { cn } from "@/lib/utils";

/** Another tab's shown ids arrive here, so a card never repeats across tabs. */
const CHANNEL = "blindr-awards";
/** The exit fade before a dismissed card leaves the DOM. */
const EXIT_MS = 150;

type ChannelMessage = { userId: string; ids: number[]; welcome: boolean };

function parseMessage(data: unknown): ChannelMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.userId !== "string" || !Array.isArray(d.ids)) return null;
  return {
    userId: d.userId,
    ids: d.ids.filter((id): id is number => typeof id === "number"),
    welcome: d.welcome === true,
  };
}

/**
 * The small award cards in a bottom corner (spec §8.1, L7, L29), mounted once
 * in AppShell. It reads the tab's level store (AppHeader's AwardsFeed fills
 * it), shows at most three cards, holds them while the tab is hidden, and
 * marks each card's rows seen the first time it shows (markXpSeen, which never
 * revalidates). One polite live region reads each card once; the cards are not
 * focusable. No poller.
 */
export function AwardsToaster({ userId }: { userId: string }) {
  const view = useSyncExternalStore(levelStore.subscribe, levelStore.getView, () => EMPTY_VIEW);
  const marked = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);

  // The store starts hidden (level-store.ts): AwardsFeed publishes earlier in
  // this same commit, so this first sync is what lets a visible tab show the
  // cards that queued before it. Unmounting hands the store back to "unknown".
  useEffect(() => {
    const sync = () => levelStore.setActive(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      levelStore.setActive(false);
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (event: MessageEvent) => {
      const m = parseMessage(event.data);
      if (m) levelStore.markShownElsewhere(m.userId, m.ids, m.welcome);
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    // markXpSeen acts for whoever is signed in now: a view the store still
    // holds for someone else (it outlives a sign-out) is never marked, or the
    // new person's welcome would clear on a card they were never shown.
    if (view.userId !== userId) return;
    for (const card of view.visible) {
      // Keyed by user too: every welcome card's id is "welcome".
      const key = `${card.userId}:${card.id}`;
      if (marked.current.has(key)) continue;
      marked.current.add(key);
      if (card.eventIds.length === 0 && !card.welcome) continue;
      // A failure keeps the ids in this tab's shown set: no repeat here; a
      // later render may show them in another tab (spec §8.1).
      markXpSeen(card.eventIds, card.welcome).catch(() => {});
      const message: ChannelMessage = { userId: card.userId, ids: card.eventIds, welcome: card.welcome };
      channel.current?.postMessage(message);
    }
    if (view.silent.length > 0) {
      const ids = [...view.silent];
      levelStore.clearSilent(ids);
      markXpSeen(ids, false).catch(() => {});
    }
  }, [view, userId]);

  const mine = view.userId === userId;
  return (
    <>
      {/* Keyed child: a card whose text repeats the last one is still read. */}
      <div role="status" aria-live="polite" className="sr-only">
        {mine && view.announcement ? <span key={view.announcementKey}>{view.announcement}</span> : null}
      </div>
      <div className="pointer-events-none fixed z-[60] flex flex-col gap-2 max-md:inset-x-3 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:right-4 md:bottom-4 md:w-80">
        {mine ? view.visible.map((card) => <ToastCard key={card.id} card={card} />) : null}
      </div>
    </>
  );
}

const ICONS = { welcome: Sparkles, xp: Sparkles, achievement: Trophy, level: ChevronsUp } as const;

/** One card: 4 s (the welcome 6 s), paused while hovered, dismissed on click. */
function ToastCard({ card }: { card: ShownToast }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (card.leaving) {
      const t = window.setTimeout(() => levelStore.remove(card.id), EXIT_MS);
      return () => window.clearTimeout(t);
    }
    if (paused) return;
    const t = window.setTimeout(() => levelStore.dismiss(card.id), card.durationMs);
    return () => window.clearTimeout(t);
  }, [card.id, card.leaving, card.durationMs, paused]);

  const Icon = ICONS[card.kind];
  const gold = card.tone === "gold";
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onClick={() => levelStore.dismiss(card.id)}
      className={cn(
        "pointer-events-auto flex cursor-default items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:transition-opacity motion-safe:duration-150",
        gold ? "border-gold bg-gold text-on-accent" : "border-border bg-card text-card-foreground",
        card.leaving && "opacity-0",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", gold ? "text-on-accent" : "text-gold-dark")} />
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold">
          <XpText text={card.title} gold={gold} />
        </p>
        {card.detail ? (
          <p className={cn("mt-0.5 text-xs leading-snug", gold ? "text-on-accent" : "text-muted-foreground")}>
            <XpText text={card.detail} gold={gold} />
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The "+N XP" part in text-gold-dark (6.23:1 on the card, light and dark). */
function XpText({ text, gold }: { text: string; gold: boolean }) {
  const parts = gold ? null : splitXp(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      <span className="text-gold-dark tabular-nums">{parts.xp}</span>
      {parts.rest}
    </>
  );
}
