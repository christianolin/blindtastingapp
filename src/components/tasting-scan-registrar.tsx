"use client";

import { useEffect } from "react";
import { tastingPhase, useAddWine } from "@/components/add-wine-context";
import type {
  RevealMode,
  TastingStatus,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";

// Rendered by a tasting page whenever the viewer may add wines to it (draft
// or running — adding mid-tasting is normal). It registers the tasting with
// the add-wine provider so the app-header camera adds a scanned bottle
// straight into this flight (and the E1 chooser can offer it as "Tonight's
// flight"), then clears the registration when you navigate away.
//
// `position` is the next glass number (existing wine count + 1); the page
// re-renders with a fresh count after every add, which re-registers. The
// registration carries the tasting's phase (spec §D.4 #2): a DRAFT is "next",
// a running ASYNC tasting "self-paced", anything else "live".
export function TastingScanRegistrar({
  tastingId,
  tastingName,
  revealMode,
  wineSource,
  position,
  timingMode,
  status,
}: {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  position: number;
  timingMode?: TimingMode;
  status?: TastingStatus;
}) {
  const { setActiveTasting } = useAddWine();
  const phase = tastingPhase(status, timingMode);
  useEffect(() => {
    setActiveTasting({ tastingId, tastingName, revealMode, wineSource, position, phase });
    return () => setActiveTasting(null);
  }, [tastingId, tastingName, revealMode, wineSource, position, phase, setActiveTasting]);
  return null;
}
