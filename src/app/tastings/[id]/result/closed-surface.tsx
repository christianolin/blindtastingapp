"use client";

import * as React from "react";
import { clearDismissed, liveSurface, readDismissed, writeDismissed } from "@/lib/live-theme";

const noopSubscribe = () => () => {};

type DismissedFlag = "unknown" | "yes" | "no";

/**
 * Lets the record ask for the result screen back.
 *
 * `children` is `RecordView`, a SERVER component, so the button cannot be
 * handed a callback as a prop the way `result` is handed `onDismiss` below.
 * A client component nested anywhere inside those server children can read
 * this context, which is what `back-to-result.tsx` does.
 *
 * null outside the provider, so the button can render nothing rather than
 * throw if it is ever placed outside a CLOSED surface.
 */
export const ClosedSurfaceContext = React.createContext<{ showResult: () => void } | null>(null);

/**
 * B5 for a CLOSED tasting: the result screen (S12) until the viewer
 * dismisses it, then the record (S13, BT-R3's `children`).
 *
 * The server render always sees "unknown" and renders nothing here — the
 * page header a caller renders above this component is what a reload shows
 * first — so a reload of an already-dismissed tasting never flashes the
 * result screen; the client snapshot picks one the instant it hydrates.
 *
 * "See every wine" is wired onto `result` here, via `cloneElement`, rather
 * than threaded through `finished-view.tsx`'s props: `result` is built
 * there before the dismissed flag is known (it renders during SSR too, on
 * the "unknown" branch's account of nothing), so the click handler has to
 * be attached lower, once this component actually decides to show it.
 *
 * DISMISSAL GOES BOTH WAYS NOW. It used to be one-way: `writeDismissed` with
 * nothing to undo it, and a `forcedDismissed` flag that could only ever be
 * set. A viewer who pressed "See every wine" on a finished tasting lost the
 * scoreboard, the standings and the share link for as long as that browser
 * kept the key, because the record's "Back to tasting overview" link pointed
 * at /tastings/[id] — the very page the record is rendered on.
 *
 * `override` replaces that one-way flag and carries the same contract in both
 * directions: null means "believe storage", and a boolean is what this visit
 * shows when the storage write did not stick (blocked or full), per
 * safe-storage.ts.
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
  const [override, setOverride] = React.useState<boolean | null>(null);

  const handleDismiss = React.useCallback(() => {
    const persisted = writeDismissed(() => window.localStorage, tastingId);
    setOverride(persisted ? null : true);
  }, [tastingId]);

  const showResult = React.useCallback(() => {
    const persisted = clearDismissed(() => window.localStorage, tastingId);
    setOverride(persisted ? null : false);
  }, [tastingId]);

  const ctx = React.useMemo(() => ({ showResult }), [showResult]);

  if (stored === "unknown") return <></>;

  const dismissed = override ?? stored === "yes";
  const surface = liveSurface({ status: "CLOSED", dismissed });
  if (surface === "record") {
    return <ClosedSurfaceContext.Provider value={ctx}>{children}</ClosedSurfaceContext.Provider>;
  }

  return (
    <>
      {React.isValidElement(result)
        ? React.cloneElement(result as React.ReactElement<{ onDismiss?: () => void }>, {
            onDismiss: handleDismiss,
          })
        : result}
    </>
  );
}
