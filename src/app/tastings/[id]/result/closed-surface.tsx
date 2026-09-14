"use client";

import * as React from "react";
import { LiveShell } from "@/components/live-shell";
import { liveSurface, readDismissed, writeDismissed } from "@/lib/live-theme";

const noopSubscribe = () => () => {};

type DismissedFlag = "unknown" | "yes" | "no";

/**
 * B5 "dark means live" for a CLOSED tasting (spec §6.3 item 3): the dark
 * result (S12) until the viewer dismisses it, then the parchment record
 * (S13, BT-R3's `children`).
 *
 * The server render always sees "unknown" and renders nothing here — the
 * page header a caller renders above this component is what a reload shows
 * first — so a reload of an already-dismissed tasting never flashes the
 * dark result; the client snapshot picks one the instant it hydrates.
 *
 * "See every wine" is wired onto `result` here, via `cloneElement`, rather
 * than threaded through `finished-view.tsx`'s props: `result` is built
 * there before the dismissed flag is known (it renders during SSR too, on
 * the "unknown" branch's account of nothing), so the click handler has to
 * be attached lower, once this component actually decides to show it.
 * `writeDismissed` persists the flag; when the write fails (storage
 * blocked or full) `forcedDismissed` still flips the view for the rest of
 * this visit, per safe-storage.ts's contract.
 */
export function ClosedSurface({
  tastingId,
  result,
  children,
}: {
  tastingId: string;
  result: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const stored = React.useSyncExternalStore<DismissedFlag>(
    noopSubscribe,
    () => (readDismissed(() => window.localStorage, tastingId) ? "yes" : "no"),
    () => "unknown",
  );
  const [forcedDismissed, setForcedDismissed] = React.useState(false);

  const handleDismiss = React.useCallback(() => {
    writeDismissed(() => window.localStorage, tastingId);
    setForcedDismissed(true);
  }, [tastingId]);

  if (stored === "unknown") return <></>;

  const surface = liveSurface({ status: "CLOSED", dismissed: stored === "yes" || forcedDismissed });
  if (surface === "record") return <>{children}</>;

  return (
    <LiveShell active>
      {React.isValidElement(result)
        ? React.cloneElement(result as React.ReactElement<{ onDismiss?: () => void }>, {
            onDismiss: handleDismiss,
          })
        : result}
    </LiveShell>
  );
}
