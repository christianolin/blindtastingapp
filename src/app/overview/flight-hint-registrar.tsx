"use client";

import { useEffect } from "react";
import { useAddWine } from "@/components/add-wine-context";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// The Overview's live / next-up tasting, handed to the add-wine provider so a
// destination-less scan from the header camera (7i) can offer "Tonight's
// flight · glass N". The banner contract carries the reveal mode and wine
// source, so the hint registers synchronously — no client round trip.
// Cleared on unmount (leaving the Overview drops the hint).
export function FlightHintRegistrar({
  tastingId,
  tastingName,
  position,
  live,
  revealMode,
  wineSource,
}: {
  tastingId: string;
  tastingName: string;
  /** Next glass number = the flight's wine count + 1. */
  position: number;
  live: boolean;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
}) {
  const { registerFlightHint } = useAddWine();

  useEffect(() => {
    registerFlightHint({ tastingId, tastingName, position, live, revealMode, wineSource });
    return () => registerFlightHint(null);
  }, [registerFlightHint, tastingId, tastingName, position, live, revealMode, wineSource]);

  return null;
}
