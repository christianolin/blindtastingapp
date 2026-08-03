"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWineMapManifest,
  type WineMapManifest,
} from "@/lib/wine-map/manifest";
import { fetchWinePlaceContext } from "@/lib/wine-map/context";
import type { CameraTarget } from "@/app/knowledge/map/tile-wine-map";

// maplibre-gl touches `window` on import — never server-render it.
const TileWineMap = dynamic(
  () => import("@/app/knowledge/map/tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

// Read-only, scoped map for a designation deep-dive: only the system's member
// sites (+ their region/sub-region context) render, framed on the region.
// Clicking a place opens it in the full explorer.
export function DesignationMap({
  visibleKeys,
  regionKey,
}: {
  visibleKeys: string[];
  regionKey: string;
}) {
  const router = useRouter();
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [camera, setCamera] = useState<CameraTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWineMapManifest()
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    fetchWinePlaceContext(supabase, regionKey)
      .then((ctx) => {
        if (!cancelled && ctx?.boundary) {
          setCamera({
            bbox: ctx.boundary.bbox,
            minZoom: 0,
            maxZoom: 10,
            source: "ui",
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [regionKey]);

  if (!manifest) {
    return (
      <div className="h-[60vh] min-h-[420px] animate-pulse rounded-lg border bg-muted" />
    );
  }

  return (
    <div className="h-[60vh] min-h-[420px]">
      <TileWineMap
        manifest={manifest}
        selectedKey={null}
        selectedId={null}
        selectedParentId={null}
        cameraTarget={camera}
        onSelect={(key) => router.push(`/knowledge/map?place=${key}`)}
        visibleKeys={visibleKeys}
        expanded={false}
        onToggleExpanded={() => {}}
      />
    </div>
  );
}
