"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWineMapManifest,
  type WineMapManifest,
} from "@/lib/wine-map/manifest";
import {
  fetchWinePlaceContext,
  type WinePlaceContext,
} from "@/lib/wine-map/context";
import {
  fetchWinePlaceTree,
  type WinePlaceTreeNode,
} from "@/lib/wine-map/tree";
import { WineMapTree } from "./wine-map-tree";
import type { CameraTarget } from "./tile-wine-map";

// maplibre-gl touches `window` on import — must never be server-rendered.
const TileWineMap = dynamic(
  () => import("./tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[70vh] min-h-[420px] animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

const DEFAULT_PLACE_KEY = "france.bordeaux";

const KIND_LABELS: Record<string, string> = {
  COUNTRY: "Country",
  MACRO_REGION: "Macro region",
  REGION: "Region",
  SUBREGION: "Subregion",
  APPELLATION: "Appellation",
  SITE: "Site",
  VINEYARD: "Vineyard",
};

export function TileWineMapExplorer({
  initialPlaceKey,
}: {
  initialPlaceKey: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState(
    initialPlaceKey ?? DEFAULT_PLACE_KEY,
  );
  const [context, setContext] = useState<WinePlaceContext | null>(null);
  const [contextState, setContextState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [tree, setTree] = useState<WinePlaceTreeNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWinePlaceTree(supabase)
      .then((roots) => {
        if (!cancelled) setTree(roots);
      })
      .catch(() => {
        // The map and details still work without the sidebar.
        if (!cancelled) setTree([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Manifest loading is retriggered by bumping manifestAttempt from event
  // handlers; the effect body only starts async work so no setState runs
  // synchronously inside it (react-hooks/set-state-in-effect).
  const [manifestAttempt, setManifestAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchWineMapManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch((error: Error) => {
        if (!cancelled) setManifestError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestAttempt]);
  const retryManifest = useCallback(() => {
    setManifestError(null);
    setManifestAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWinePlaceContext(supabase, selectedKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        setContextState(ctx ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setContextState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);

  // Selection updates the URL in place (shareable deep links) while
  // preserving any other params — including ?map=tiles during the opt-in
  // phase — without a Next navigation round-trip.
  const select = useCallback(
    (key: string) => {
      // Same-key selection must be a no-op: the context effect only re-runs
      // when selectedKey changes, so setting "loading" here would never
      // resolve.
      if (key === selectedKey) return;
      setContextState("loading");
      setSelectedKey(key);
      const params = new URLSearchParams(window.location.search);
      params.set("place", key);
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    [selectedKey],
  );

  // Drill-down camera: selecting a place zooms far enough that ALL its
  // children's reveal zooms are reached (deepest child + headroom), so one
  // click on Vosne-Romanée shows its crus and climats immediately.
  const cameraTarget = useMemo<CameraTarget | null>(() => {
    if (!context?.boundary) return null;
    const childZooms = context.children.map((c) => c.min_zoom);
    const maxZoom = Math.min(
      childZooms.length > 0
        ? Math.max(...childZooms) + 0.5
        : context.place.min_zoom + 1.5,
      15.5,
    );
    return { bbox: context.boundary.bbox, maxZoom };
  }, [context]);

  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Card className="order-3 lg:order-1">
          <CardContent className="h-[70vh] min-h-[420px] pt-6">
            {tree === null ? (
              <div className="h-full animate-pulse rounded-md bg-muted" />
            ) : (
              <WineMapTree
                roots={tree}
                selectedKey={selectedKey}
                onSelect={select}
              />
            )}
          </CardContent>
        </Card>

        <Card className="order-1 overflow-hidden lg:order-2">
          <CardContent className="flex flex-col gap-4 pt-6">
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                cameraTarget={cameraTarget}
                onSelect={select}
              />
            ) : manifestError ? (
              <div className="flex h-[70vh] min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border text-center">
                <p className="text-sm text-muted-foreground">
                  The map tiles are unavailable right now — navigation below
                  still works.
                </p>
                <button
                  type="button"
                  onClick={retryManifest}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Retry map
                </button>
              </div>
            ) : (
              <div className="h-[70vh] min-h-[420px] animate-pulse rounded-lg border bg-muted" />
            )}

          </CardContent>
        </Card>

        <Card className="order-2 lg:order-3 lg:col-span-2 xl:col-span-1">
          <CardContent className="flex flex-col gap-3 pt-6">
            {contextState === "loading" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : contextState === "error" ? (
              <p className="text-sm text-muted-foreground">
                Details are unavailable right now. Try another place or reload.
              </p>
            ) : contextState === "missing" || !context ? (
              <p className="text-sm text-muted-foreground">
                That place isn&apos;t on the map yet.
              </p>
            ) : (
              <>
                <div>
                  <Badge variant="secondary" className="mb-1.5">
                    {KIND_LABELS[context.place.kind] ?? context.place.kind}
                  </Badge>
                  <h2 className="font-heading text-xl font-semibold">
                    {context.place.name}
                  </h2>
                </div>
                {article ? (
                  <>
                    {article.description ? (
                      <p className="text-sm text-muted-foreground">
                        {article.description}
                      </p>
                    ) : null}
                    <dl className="flex flex-col gap-2 text-sm">
                      {article.climate ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Climate
                          </dt>
                          <dd>{article.climate}</dd>
                        </div>
                      ) : null}
                      {article.grape_varieties ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Main grape varieties
                          </dt>
                          <dd>{article.grape_varieties}</dd>
                        </div>
                      ) : null}
                      {article.wine_styles ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Wine styles
                          </dt>
                          <dd>{article.wine_styles}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {article.key_facts.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Key facts
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                          {article.key_facts.map((fact, i) => (
                            <li key={i}>{fact}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Profile being curated — check back soon.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
