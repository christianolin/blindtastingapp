"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
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
import type { CameraTarget } from "./tile-wine-map";

// maplibre-gl touches `window` on import — must never be server-rendered.
const TileWineMap = dynamic(
  () => import("./tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
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
  const select = useCallback((key: string) => {
    setContextState("loading");
    setSelectedKey(key);
    const params = new URLSearchParams(window.location.search);
    params.set("place", key);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const cameraTarget = useMemo<CameraTarget | null>(() => {
    if (!context?.boundary) return null;
    const childZooms = context.children.map((c) => c.min_zoom);
    const maxZoom = Math.min(
      childZooms.length > 0
        ? Math.min(...childZooms) + 0.5
        : context.place.min_zoom + 1.5,
      11,
    );
    return { bbox: context.boundary.bbox, maxZoom };
  }, [context]);

  const breadcrumb = context ? [...context.ancestors, context.place] : [];
  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  return (
    <div className="flex flex-col gap-4">
      {breadcrumb.length > 0 ? (
        <nav
          aria-label="Wine map breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          {breadcrumb.map((entry, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={entry.id} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                ) : null}
                {isLast ? (
                  <span className="font-medium text-foreground">
                    {entry.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => select(entry.key)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {entry.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 pt-6">
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                cameraTarget={cameraTarget}
                onSelect={select}
              />
            ) : manifestError ? (
              <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-lg border text-center">
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
              <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
            )}

            {context && context.children.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Within {context.place.name}:
                </span>
                {context.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => select(child.key)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
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
