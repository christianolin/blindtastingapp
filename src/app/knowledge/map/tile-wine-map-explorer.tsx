"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Thermometer,
} from "lucide-react";
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
import { KnowledgeSections } from "./knowledge-sections";
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

  // Expanded ("full view") keeps the tree and details visible but
  // collapsible; Escape exits.
  const [expanded, setExpanded] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

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
  // children's reveal zooms are reached (deepest child + headroom). Leaf
  // places instead zoom to their own footprint — bbox fitting decides, with
  // a generous cap — so tiny appellations (Pomerol) fill the view rather
  // than showing the whole parent region.
  const cameraTarget = useMemo<CameraTarget | null>(() => {
    if (!context?.boundary) return null;
    const childZooms = context.children.map((c) => c.min_zoom);
    const maxZoom = Math.min(
      childZooms.length > 0 ? Math.max(...childZooms) + 0.5 : 14.5,
      15.5,
    );
    return { bbox: context.boundary.bbox, maxZoom };
  }, [context]);

  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4"
          : "flex flex-col gap-4"
      }
    >
      <div
        className={`flex flex-col gap-4 lg:flex-row lg:items-stretch ${
          expanded ? "min-h-0 flex-1" : ""
        }`}
      >
        {treeOpen ? (
          <Card className="order-3 lg:order-1 lg:w-[280px] lg:shrink-0">
            <CardContent
              className={`flex flex-col pt-4 ${
                expanded ? "h-full min-h-0" : "h-[70vh] min-h-[420px]"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Hierarchy
                </span>
                <button
                  type="button"
                  aria-label="Collapse hierarchy"
                  onClick={() => setTreeOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {tree === null ? (
                  <div className="h-full animate-pulse rounded-md bg-muted" />
                ) : (
                  <WineMapTree
                    roots={tree}
                    selectedKey={selectedKey}
                    onSelect={select}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            type="button"
            aria-label="Show hierarchy"
            onClick={() => setTreeOpen(true)}
            className="order-3 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground lg:order-1 lg:flex lg:w-9 lg:items-start lg:justify-center"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}

        <Card className="order-1 min-w-0 flex-1 overflow-hidden lg:order-2">
          <CardContent
            className={`pt-4 ${expanded ? "flex h-full min-h-0 flex-col" : ""}`}
          >
            <div className={expanded ? "min-h-0 flex-1" : "h-[70vh] min-h-[420px]"}>
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                cameraTarget={cameraTarget}
                onSelect={select}
                expanded={expanded}
                onToggleExpanded={() => setExpanded((value) => !value)}
              />
            ) : manifestError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border text-center">
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
              <div className="h-full animate-pulse rounded-lg border bg-muted" />
            )}
            </div>
          </CardContent>
        </Card>

        {detailsOpen ? (
        <Card
          className={`order-2 lg:order-3 lg:w-[320px] lg:shrink-0 ${
            expanded ? "lg:overflow-y-auto" : ""
          }`}
        >
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Details
              </span>
              <button
                type="button"
                aria-label="Collapse details"
                onClick={() => setDetailsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
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
                        <div className="flex gap-2">
                          <Thermometer className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">
                              Climate
                            </dt>
                            <dd>{article.climate}</dd>
                          </div>
                        </div>
                      ) : null}
                      {article.soils ? (
                        <div className="flex gap-2">
                          <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">
                              Soils
                            </dt>
                            <dd>{article.soils}</dd>
                          </div>
                        </div>
                      ) : null}
                      {article.grape_varieties && context.grapes.length === 0 ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Main grape varieties
                          </dt>
                          <dd>{article.grape_varieties}</dd>
                        </div>
                      ) : null}
                      {article.wine_styles && context.styles.length === 0 ? (
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
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Sparkles className="size-3.5" />
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
                <KnowledgeSections context={context} onSelect={select} />
              </>
            )}
          </CardContent>
        </Card>
        ) : (
          <button
            type="button"
            aria-label="Show details"
            onClick={() => setDetailsOpen(true)}
            className="order-2 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground lg:order-3 lg:flex lg:w-9 lg:items-start lg:justify-center"
          >
            <PanelRightOpen className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
