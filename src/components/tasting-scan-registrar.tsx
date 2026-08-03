"use client";

import { useEffect } from "react";
import { useAddWine } from "@/components/add-wine-context";

// Rendered by a tasting page only while the tasting is still open to new wines
// (DRAFT + the viewer may add). It registers the tasting with the add-wine
// provider so the app-header scan icon adds a scanned bottle straight to it,
// then clears the registration when you navigate away.
export function TastingScanRegistrar({ tastingId }: { tastingId: string }) {
  const { setActiveTasting } = useAddWine();
  useEffect(() => {
    setActiveTasting({ tastingId });
    return () => setActiveTasting(null);
  }, [tastingId, setActiveTasting]);
  return null;
}
