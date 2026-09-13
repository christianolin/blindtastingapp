"use client";

import { useEffect } from "react";
import { useAddWine } from "@/components/add-wine-context";
import type { FlightHint } from "@/components/add-wine/types";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// The Overview's running / next-up tasting, handed to the add-wine provider so
// a destination-less scan from the header camera (7i) can offer "Tonight's
// flight · glass N". The banner renders this only when the viewer may add to
// that flight (D12) and passes the tasting's phase — "live", "self-paced"
// (the sheet reads it "in progress") or "next" — so a self-paced tasting is
// never called live (entry-4). The banner contract carries the reveal mode
// and wine source, so the hint registers synchronously — no client round
// trip. Cleared on unmount (leaving the Overview drops the hint).
export function FlightHintRegistrar({
  tastingId,
  tastingName,
  position,
  phase,
  revealMode,
  wineSource,
}: {
  tastingId: string;
  tastingName: string;
  /** Next glass number = the flight's wine count + 1. */
  position: number;
  phase: NonNullable<FlightHint["phase"]>;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
}) {
  const { registerFlightHint } = useAddWine();

  useEffect(() => {
    registerFlightHint({ tastingId, tastingName, position, phase, revealMode, wineSource });
    return () => registerFlightHint(null);
  }, [registerFlightHint, tastingId, tastingName, position, phase, revealMode, wineSource]);

  return null;
}
