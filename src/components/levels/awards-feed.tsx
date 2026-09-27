"use client";

import { useEffect } from "react";
import { levelStore } from "@/lib/levels/level-store";
import type { LevelSnapshot } from "@/lib/levels/types";

/**
 * Rendered by AppHeader with that render's level snapshot (spec §8.1, L28).
 * It draws nothing: it hands the snapshot to the tab's level store, which the
 * one AwardsToaster (in AppShell) and the viewer's own rings read. Every
 * server render of an AppHeader — a navigation, a revalidating action, a
 * router.refresh(), RevealSync, AutoRefresh — brings a new snapshot; the store
 * ignores rows it has already queued or shown.
 */
export function AwardsFeed({ snapshot }: { snapshot: LevelSnapshot | null }) {
  useEffect(() => {
    if (snapshot) levelStore.publish(snapshot);
  }, [snapshot]);
  return null;
}
