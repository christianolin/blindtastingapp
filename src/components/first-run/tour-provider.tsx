"use client";

// First-run tour state (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D2, D4, D6, D7). AppShell mounts this once, around every signed-in page.
// AppShell lives in the ROOT layout, which a soft navigation does not
// re-render, so `tourSeen` is the value at the last full render and whether
// the sheet is open is decided here, from that prop, this visit's state and
// the current path (`tourShouldOpen`, pure and tested in
// src/lib/first-run/tour.ts):
// - "fresh": opens on the first allowed page while the account has not seen it
//   (a join-link newcomer lands in a tasting, excluded, and sees it on the
//   first page after);
// - "dismissed": shut for the rest of the visit, whatever the write did (D2);
// - "replay": /profile/edit's "Show the tour again" asked for it.
// Nothing renders before hydration (server snapshot false): no server flash,
// no hydration mismatch, and no setState in an effect. No polling (D6): the
// only request is the one dismissal write.
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { markTourSeen } from "@/lib/first-run/actions";
import { tourShouldOpen, type TourVisit } from "@/lib/first-run/tour";
import { TourSheet } from "./tour-sheet";

const TourReplayContext = createContext<() => void>(() => {});

/** Opens the tour again on the next allowed page; the caller navigates there.
    A no-op outside TourProvider (signed out, AppShell renders no provider). */
export function useTourReplay(): () => void {
  return useContext(TourReplayContext);
}

function subscribeNoop() {
  return () => {};
}

export function TourProvider({
  tourSeen,
  profileBare,
  children,
}: {
  tourSeen: boolean;
  profileBare: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const [visit, setVisit] = useState<TourVisit>("fresh");
  const open = tourShouldOpen({ hydrated, tourSeen, visit, pathname });

  const replay = useCallback(() => setVisit("replay"), []);
  const finish = useCallback(() => {
    setVisit("dismissed");
    // One write per dismissal (D2). A refused or failed write only means the
    // tour may show again on a later visit; this visit stays shut in state.
    void markTourSeen().catch(() => false);
  }, []);

  return (
    <TourReplayContext.Provider value={replay}>
      {children}
      {open ? <TourSheet profileBare={profileBare} onFinish={finish} /> : null}
    </TourReplayContext.Provider>
  );
}
