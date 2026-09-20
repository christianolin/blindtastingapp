"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot, StillDot } from "@/components/overview/live-dot";
import { pollActiveTastings } from "@/lib/active-tasting/actions";
import {
  BANNER_LABEL,
  MORE_HREF,
  bannerCopy,
  moreAriaLabel,
  moreLabel,
} from "@/lib/active-tasting/copy";
import {
  bannerView,
  newerSnapshot,
  pollIntervalMs,
  shouldPoll,
  type ActiveTastingSnapshot,
} from "@/lib/active-tasting/select";
import { cn } from "@/lib/utils";

// 44px tap targets on phones, the desktop button height from md up.
const BUTTON_SIZE = "max-md:min-h-11 md:h-9 px-3.5 text-[13px] font-semibold";

// Theme tokens only. The running strip stays bordeaux in dark (.dark keeps
// --primary), and its gold CTA takes --on-accent ink there through the
// `:where(.dark) .bg-gold.text-foreground` rule in globals.css. The ghost and
// outline variants carry dark: overrides a plain class would not replace, so
// "+N more" on bordeaux restates its dark hover too.
const TONE = {
  running: {
    strip: "border-b border-primary bg-primary text-primary-foreground",
    eyebrow: "text-gold-light",
    cta: "bg-gold text-foreground hover:bg-gold-deep",
    moreVariant: "ghost",
    more:
      "border border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:hover:bg-primary-foreground/10 dark:hover:text-primary-foreground",
  },
  waiting: {
    strip: "border-b border-border bg-card text-foreground",
    eyebrow: "text-muted-foreground",
    cta: "hover:bg-primary-hover",
    moreVariant: "outline",
    more: "",
  },
} as const;

/**
 * The strip directly under the top bar naming the one tasting the viewer is
 * in right now, with a real button back to it (active-tasting banner spec,
 * 2026-09-19). Which tasting, and on which pages, is all in
 * src/lib/active-tasting/select.ts; this component only renders the chosen
 * item and keeps it fresh.
 *
 * Freshness (D7, D12, D14): `initial` is the server render's snapshot — a
 * navigation or router.refresh() re-renders it — and the component polls
 * pollActiveTastings on `pollIntervalMs`'s cadence while the tab is visible,
 * plus on focus and on returning to the tab. Whichever snapshot has the newer
 * server-clock `checkedAt` wins; there is no props-to-state effect and no
 * client clock. Polling pauses on the shown tasting's own pages (the strip is
 * hidden there) and checks once at once on leaving them. A failed poll keeps
 * what is shown (D13). Not sticky, no dismiss (D9, D15).
 *
 * The cadence itself is a rule in select.ts (D12b), not a constant here: 20 s
 * while there is a tasting to return to, 120 s when the last read found none.
 * Reading it from `snapshot.items` means the interval re-arms the moment a
 * poll turns an empty snapshot into a live one, or back.
 */
export function ActiveTastingBanner({ initial }: { initial: ActiveTastingSnapshot }) {
  const pathname = usePathname();
  const [polled, setPolled] = useState<ActiveTastingSnapshot | null>(null);
  const snapshot = newerSnapshot(initial, polled);
  const view = bannerView(snapshot.items, pathname);
  const polling = shouldPoll(snapshot.items, pathname);
  const intervalMs = pollIntervalMs(snapshot.items);

  const inFlight = useRef(false);
  // Set while polling is paused, so resuming checks at once. Never set on
  // first mount: the server snapshot is fresh.
  const wasPaused = useRef(false);

  useEffect(() => {
    if (!polling) {
      wasPaused.current = true;
      return;
    }
    const check = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = true;
      pollActiveTastings()
        .then((next) => {
          if (next) setPolled(next);
        })
        .catch(() => {
          // A transient failure just means the strip doesn't update this tick.
        })
        .finally(() => {
          inFlight.current = false;
        });
    };
    if (wasPaused.current) {
      wasPaused.current = false;
      check();
    }
    // A phone returning to the tab does not always fire `focus`.
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const id = window.setInterval(check, intervalMs);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [polling, intervalMs]);

  if (!view) return null;
  const { item, more } = view;
  const copy = bannerCopy(item.state);
  const tone = TONE[copy.tone];

  return (
    <section
      aria-label={BANNER_LABEL}
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6",
        tone.strip,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
        <p aria-live="polite" className="flex items-center gap-2">
          {copy.dot === "ping" ? <LiveDot /> : copy.dot === "still" ? <StillDot /> : null}
          <Eyebrow size="md" className={tone.eyebrow}>
            {copy.status}
          </Eyebrow>
        </p>
        <p className="truncate font-heading text-[17px] leading-tight font-semibold md:text-lg">
          {item.name}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {more > 0 ? (
          <Button
            nativeButton={false}
            variant={tone.moreVariant}
            render={<Link href={MORE_HREF} />}
            aria-label={moreAriaLabel(more)}
            className={cn(BUTTON_SIZE, tone.more)}
          >
            {moreLabel(more)}
          </Button>
        ) : null}
        <Button
          nativeButton={false}
          render={<Link href={item.href} />}
          className={cn(BUTTON_SIZE, tone.cta)}
        >
          {copy.cta}
        </Button>
      </div>
    </section>
  );
}
