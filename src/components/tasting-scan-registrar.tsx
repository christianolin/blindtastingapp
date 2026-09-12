"use client";

import { useEffect } from "react";
import { useAddWine } from "@/components/add-wine-context";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// Rendered by a tasting page whenever the viewer may add wines to it (draft
// or running — adding mid-tasting is normal). It registers the tasting with
// the add-wine provider so the app-header camera adds a scanned bottle
// straight into this flight (and the 7i chooser can offer it as "Tonight's
// flight"), then clears the registration when you navigate away.
//
// `position` is the next glass number (existing wine count + 1); the page
// re-renders with a fresh count after every add, which re-registers.
export function TastingScanRegistrar({
  tastingId,
  tastingName,
  revealMode,
  wineSource,
  position,
}: {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  position: number;
}) {
  const { setActiveTasting } = useAddWine();
  useEffect(() => {
    setActiveTasting({ tastingId, tastingName, revealMode, wineSource, position });
    return () => setActiveTasting(null);
  }, [tastingId, tastingName, revealMode, wineSource, position, setActiveTasting]);
  return null;
}
