"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronUp,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Thermometer,
  Wine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
import { ReferenceCombobox } from "@/components/reference-combobox";
import {
  fetchGrapeOptions,
  fetchPlaceGrapeLinks,
  grapeVisibleKeys,
  type GrapeOption,
} from "@/lib/wine-map/grape-filter";
import type { CameraTarget } from "./tile-wine-map";
import {
  fetchArchetypesForPlace,
  type ArchetypeListItem,
} from "@/lib/wset/queries";
import { ArchetypeModal } from "@/components/wset/archetype-modal";

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

const KIND_LABELS: Record<string, string> = {
  COUNTRY: "Country",
  MACRO_REGION: "Macro region",
  REGION: "Region",
  SUBREGION: "Subregion",
  APPELLATION: "Appellation",
  SITE: "Site",
  VINEYARD: "Vineyard",
};

// The wine-glass tint per wine colour, so a typical-wine pill reads at a glance
// as red / white / rosé / orange.
const WINE_COLOUR_HEX: Record<string, string> = {
  RED: "#8E1F3B",
  WHITE: "#B78E42",
  ROSE: "#D98A9E",
  ORANGE: "#C0692E",
};

export function TileWineMapExplorer({
  initialPlaceKey,
}: {
  initialPlaceKey: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  // Default to no selection — the map opens on the whole wine world (all
  // regions from the world archive) rather than diving straight into one
  // region. A deep link (?place=) still selects its place.
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPlaceKey);
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

  // Map filters (grape today; styles/designations will share the plumbing):
  // one selected grape becomes a visible-key set via wine_place_grapes +
  // nearest-ancestor inheritance, and the map hides every other polygon.
  const [grapeOptions, setGrapeOptions] = useState<GrapeOption[]>([]);
  const [grapeLinks, setGrapeLinks] = useState<Map<string, Set<string>> | null>(
    null,
  );
  const [grapeFilterId, setGrapeFilterId] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGrapeOptions(supabase), fetchPlaceGrapeLinks(supabase)])
      .then(([options, links]) => {
        if (cancelled) return;
        setGrapeOptions(options);
        setGrapeLinks(links);
      })
      .catch(() => {
        // The filter control simply stays disabled; the map is unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  const visibleKeys = useMemo(
    () =>
      grapeFilterId && tree && grapeLinks
        ? grapeVisibleKeys(tree, grapeLinks, grapeFilterId)
        : null,
    [grapeFilterId, tree, grapeLinks],
  );

  // Expanded ("full view") keeps the tree and details visible but
  // collapsible; Escape exits.
  const [expanded, setExpanded] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    if (!selectedKey) return;
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

  // "A typical wine from here" — the archetypes hung off this place. Tagged
  // with the key they belong to so a stale set never flashes under a newly
  // selected place while the next fetch is in flight.
  const [archetypeData, setArchetypeData] = useState<{
    key: string;
    rows: ArchetypeListItem[];
  } | null>(null);
  const [openArchetype, setOpenArchetype] = useState<ArchetypeListItem | null>(
    null,
  );
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    fetchArchetypesForPlace(supabase, selectedKey)
      .then((rows) => {
        if (!cancelled) setArchetypeData({ key: selectedKey, rows });
      })
      .catch(() => {
        if (!cancelled) setArchetypeData({ key: selectedKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);
  const archetypes =
    archetypeData && archetypeData.key === selectedKey ? archetypeData.rows : [];

  // Selection updates the URL in place (shareable deep links) while
  // preserving any other params — including ?map=tiles during the opt-in
  // phase — without a Next navigation round-trip.
  // Rides along into cameraTarget: map taps never move the camera, only
  // tree/search/details navigation flies (deep links keep the "ui" default).
  const selectSourceRef = useRef<"map" | "ui">("ui");
  const select = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      selectSourceRef.current = source;
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
    // Parents zoom to a cap where their children appear. Leaves must end past
    // their OWN reveal zoom so the selected feature — and its gold ring —
    // actually renders instead of hiding under a coarser ancestor polygon
    // (a bbox-fit alone can land below a small climat/cru's min_zoom).
    const maxZoom = Math.min(
      childZooms.length > 0
        ? Math.max(...childZooms) + 0.5
        : context.place.min_zoom + 1.5,
      16,
    );
    const minZoom =
      childZooms.length > 0
        ? 0
        : Math.min(context.place.min_zoom + 0.35, maxZoom);
    return {
      bbox: context.boundary.bbox,
      minZoom,
      maxZoom,
      source: selectSourceRef.current,
    };
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
          // Height-lock the row on desktop only. On mobile the expanded view
          // is a normal scrolling column (map first, near-fullscreen), so the
          // flex algorithm can never crush the map card to zero height.
          expanded ? "lg:min-h-0 lg:flex-1" : ""
        }`}
      >
        {treeOpen ? (
          <Card
            className={`order-3 lg:order-1 lg:w-[280px] lg:shrink-0 ${
              expanded ? "" : "lg:sticky lg:top-6 lg:self-start"
            }`}
          >
            <CardContent
              className={`flex flex-col pt-4 ${
                expanded
                  ? "h-[70vh] min-h-0 lg:h-full"
                  : "h-[70vh] min-h-[420px]"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Explorer
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
                    filterKeys={visibleKeys}
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
            className={`order-3 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground lg:order-1 lg:flex lg:w-9 lg:items-start lg:justify-center ${
              expanded ? "" : "lg:sticky lg:top-6 lg:self-start"
            }`}
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}

        <Card
          className={
            // overflow-hidden gives this flex item a zero minimum size, so in
            // the mobile expanded column flex-1 would let it be crushed to
            // nothing (the "map disappears" bug): full view opts out of
            // shrinking below lg and sizes from the map's fixed height.
            expanded
              ? "order-1 min-w-0 shrink-0 overflow-hidden lg:order-2 lg:flex-1 lg:shrink"
              : "order-1 min-w-0 flex-1 overflow-hidden lg:order-2"
          }
        >
          <CardContent
            className={`pt-4 ${expanded ? "flex h-full min-h-0 flex-col" : ""}`}
          >
            {/* Map filters: pick a grape and only places using it stay on
                the map (France's outline remains as context). More filter
                kinds will join this bar. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Filter
              </span>
              <div className="w-64 max-w-full">
                <ReferenceCombobox
                  formFieldName="map_grape_filter"
                  options={grapeOptions}
                  value={grapeFilterId}
                  onValueChange={setGrapeFilterId}
                  placeholder={
                    grapeOptions.length === 0
                      ? "Loading grapes…"
                      : "Grape — only places using it"
                  }
                  disabled={grapeOptions.length === 0}
                  allowClear
                />
              </div>
              {visibleKeys ? (
                <Badge variant="secondary">
                  {visibleKeys.length} place{visibleKeys.length === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
            {/* Expanded on mobile needs a definite height: the lg full-view
                relies on a flex-1/min-h-0 chain that only exists in the
                lg:flex-row layout — in the phone column the hierarchy card's
                natural height swallowed it and the map collapsed to zero. */}
            <div
              className={
                expanded
                  ? "h-[calc(100dvh-7rem)] lg:h-auto lg:min-h-0 lg:flex-1"
                  : "h-[70vh] min-h-[420px]"
              }
            >
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                selectedId={context?.place.id ?? null}
                selectedParentId={context?.ancestors.at(-1)?.id ?? null}
                cameraTarget={cameraTarget}
                onSelect={select}
                visibleKeys={visibleKeys}
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
          className={cn(
            "lg:order-3 lg:w-[320px] lg:shrink-0",
            // On phones this panel detaches into a frozen sheet pinned to the
            // bottom of the screen; tapping its bar folds it open into a
            // near-fullscreen scrollable profile and back down again.
            "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:border-border max-lg:shadow-[0_-8px_24px_rgba(0,0,0,0.10)]",
            sheetOpen ? "max-lg:top-14 max-lg:flex max-lg:flex-col" : "",
            expanded ? "lg:overflow-y-auto" : "",
          )}
        >
          <CardContent
            className={cn(
              "flex flex-col gap-3 pt-4",
              sheetOpen ? "max-lg:h-full max-lg:min-h-0" : "",
            )}
          >
            <button
              type="button"
              onClick={() => setSheetOpen((open) => !open)}
              aria-expanded={sheetOpen}
              className="flex items-center justify-between gap-2 text-left lg:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </span>
                <span className="truncate text-sm font-medium">
                  {context ? context.place.name : "Click on areas to learn more"}
                </span>
              </span>
              <ChevronUp
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  sheetOpen ? "rotate-180" : "",
                )}
              />
            </button>
            <div className="hidden items-center justify-between lg:flex">
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
            <div
              className={cn(
                "flex flex-col gap-3",
                sheetOpen
                  ? "max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto"
                  : "max-lg:hidden",
              )}
            >
            {!selectedKey ? (
              <p className="text-sm text-muted-foreground">
                Pick a region on the map or in the hierarchy to explore it.
              </p>
            ) : contextState === "loading" ? (
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
                {archetypes.length > 0 ? (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Wine className="size-3.5" />
                      Typical wine
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {archetypes.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setOpenArchetype(a)}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/60"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Wine
                              className="size-4 shrink-0"
                              style={{ color: WINE_COLOUR_HEX[a.colour] ?? "#8A8A85" }}
                            />
                            <span className="truncate">{a.name}</span>
                          </span>
                          <span className="text-muted-foreground">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
            </div>
          </CardContent>
        </Card>
        ) : null}
        {!detailsOpen ? (
          <button
            type="button"
            aria-label="Show details"
            onClick={() => setDetailsOpen(true)}
            className="order-2 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground lg:order-3 lg:flex lg:w-9 lg:items-start lg:justify-center"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </div>
      {/* Reserve room so the frozen mobile sheet's bar never hides the last
          of the page content beneath it. */}
      <div aria-hidden className="h-20 lg:hidden" />
      {openArchetype ? (
        <ArchetypeModal
          id={openArchetype.id}
          name={openArchetype.name}
          onClose={() => setOpenArchetype(null)}
        />
      ) : null}
    </div>
  );
}
