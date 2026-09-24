"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import type { WinePlaceContext } from "@/lib/wine-map/context";
import type { StyleRow } from "@/lib/wine-map/place-styles";
import {
  clearWinePlaceCaches,
  loadArchetypesForPlace,
  loadGrapeOptions,
  loadPlaceGrapeLinks,
  loadPlaceStyles,
  loadWinePlaceContext,
  loadWinePlaceTree,
  peekArchetypesForPlace,
  peekPlaceStyles,
  peekWinePlaceContext,
  warmWinePlace,
} from "@/lib/wine-map/place-cache";
import { useWinePlacePrefetch } from "@/lib/wine-map/use-place-prefetch";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";
import { englishName } from "@/lib/wine-map/localize-names";
import { deepLinkAction } from "@/lib/wine-map/deep-link";
import { fallbackFromContext } from "@/lib/wine-map/selection-state";
import { areaSlugsByShard } from "@/lib/wine-map/shard-specs";
import {
  INITIAL_TREE_LOAD,
  treeFetchDelay,
  treeLoadReducer,
} from "@/lib/wine-map/tree-load";
import { MapErrorBoundary, MapUnavailableCard } from "./map-error-boundary";
import { WineMapTree } from "./wine-map-tree";
import { MapDetailControls } from "./map-detail-controls";
import { CountryChips } from "./country-chips";
import { useDetailMode } from "@/lib/wine-map/detail-mode";
import { detailStatus } from "@/lib/wine-map/detail-status";
import { countryChips } from "@/lib/wine-map/country-chips";
import {
  bboxesForCountry,
  CHIP_MIN_ZOOM,
  countryCameraBox,
  type CameraRequest,
} from "@/lib/wine-map/camera-fit";
import {
  chipAfterReport,
  chipOnTap,
  type ChipFocus,
  type DetailReport,
} from "@/lib/wine-map/focus";
import { KnowledgeSections } from "./knowledge-sections";
import { ReferenceCombobox } from "@/components/reference-combobox";
import {
  grapeVisibleKeys,
  type GrapeOption,
} from "@/lib/wine-map/grape-filter";
import type { CameraTarget } from "./tile-wine-map";
import type { ArchetypeListItem } from "@/lib/wset/queries";
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

// Label-language preference as an external store. useState + a localStorage
// lazy initializer produced a hydration mismatch: the tree and map render no
// labels server-side, but the Local/English toggle itself does, so a viewer who
// had chosen "local" hydrated with the opposite button highlighted. This is the
// case useSyncExternalStore exists for — the server snapshot is the default and
// the stored preference is adopted after hydration, with no setState in an
// effect. Reads/writes are guarded: with site data blocked the bare accessor
// throws SecurityError, which used to take the whole explorer down.
const LANG_STORAGE_KEY = "wine-map-lang";
const langListeners = new Set<() => void>();
// Fallback for profiles where localStorage throws (site data blocked, private
// windows). Without it readEnglish always answered "english" and the toggle was
// inert rather than merely non-persistent.
let langMemory: boolean | null = null;
function readEnglish() {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) !== "local";
  } catch {
    return langMemory ?? true;
  }
}
function subscribeLang(onChange: () => void) {
  langListeners.add(onChange);
  return () => {
    langListeners.delete(onChange);
  };
}
function writeEnglish(value: boolean) {
  langMemory = value;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, value ? "en" : "local");
  } catch {
    // Preference just will not persist beyond this page view.
  }
  for (const listener of langListeners) listener();
}

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
  // Loading, ready or failed, kept apart from `tree` itself (null both while
  // loading and after a failure). A failure used to set tree=[], which the
  // tree card and every map prop derived from the tree could not tell from
  // "still loading", and nothing on screen said anything had gone wrong.
  const [treeLoad, dispatchTree] = useReducer(treeLoadReducer, INITIAL_TREE_LOAD);
  // Label language for the map + tree: English exonyms (Italia->Italy,
  // Toscana->Tuscany) from the curated dictionary by default, or native local
  // names when the viewer has explicitly chosen "local". Persisted per browser.
  // Must start at the SERVER value and only adopt the stored preference after
  // mount. The tree and map render no labels server-side, but the Local/English
  // toggle itself does, so reading localStorage during the first client render
  // made a viewer who had chosen "local" hydrate with the opposite button
  // highlighted. localStorage is also wrapped: in a profile with site data
  // blocked the bare getter throws SecurityError and took the explorer down.
  const english = useSyncExternalStore(subscribeLang, readEnglish, () => true);
  const chooseLang = (value: boolean) => writeEnglish(value);

  // Map detail (spec 2026-09-23 §7). One country by default and All countries
  // one tap away, remembered per browser. It is never in the URL, so a shared
  // ?place= link cannot put a phone into All. `fellBack` means this page was
  // put back in One country after All went wrong (lib/wine-map/detail-mode).
  const {
    mode: detail,
    fellBack,
    setMode: setDetail,
    dropToOne,
    confirmHealthy,
  } = useDetailMode();
  // What the map says it is showing, reported on change.
  const [report, setReport] = useState<DetailReport>(() => ({
    focusCountry: null,
    depthCountries: [],
    countriesInView: [],
    pastDepthZoom: false,
  }));
  // A tapped country chip: focus without selection. The next real selection
  // clears it, and so does its country leaving the view after being on it.
  const [chipFocus, setChipFocus] = useState<ChipFocus | null>(null);
  // A chip's camera move. The nonce lets the same chip fly again.
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const handleDetailReport = useCallback((next: DetailReport) => {
    setReport(next);
    setChipFocus((prev) => chipAfterReport(prev, next.countriesInView));
  }, []);

  // One request per attempt: the first at once, the single automatic retry
  // after TREE_AUTO_RETRY_MS, a manual Retry at once. The place cache never
  // keeps a rejected tree (mount-cache.test.ts pins that), so every attempt
  // really goes back to the server.
  const treeLoading = treeLoad.state === "loading";
  const treeAttempt = treeLoad.attempt;
  useEffect(() => {
    if (!treeLoading) return;
    let cancelled = false;
    const start = () => {
      loadWinePlaceTree(supabase).then(
        (roots) => {
          if (cancelled) return;
          setTree(roots);
          dispatchTree({ type: "resolved" });
        },
        () => {
          // The map and details still work without the tree; the tree card
          // says so, with a Retry, once the automatic retry has failed too.
          if (!cancelled) dispatchTree({ type: "rejected" });
        },
      );
    };
    const delay = treeFetchDelay(treeAttempt);
    const timer = delay > 0 ? window.setTimeout(start, delay) : null;
    if (timer === null) start();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [supabase, treeLoading, treeAttempt]);

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
    Promise.all([loadGrapeOptions(supabase), loadPlaceGrapeLinks(supabase)])
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

  // Tile shards are keyed by canonical_key segment 1 (a region slug), which
  // carries no country. The tree roots are the countries and their children the
  // regions, so it gives us shard -> country for free — no tile rebuild needed
  // to let the map show subregion depth one country at a time.
  const shardCountries = useMemo(() => {
    const byShard: Record<string, string> = {};
    for (const country of tree ?? []) {
      const countrySlug = country.key.split(".")[0];
      for (const region of country.children ?? []) {
        const shard = region.key.split(".")[1];
        if (shard) byShard[shard] = countrySlug;
      }
    }
    return byShard;
  }, [tree]);

  // Each shard's own area slugs, for that shard's fixed fill palette — built
  // once from the same tree, so the colour table never depends on what the
  // viewport has happened to scan, and a shard's colour expression carries only
  // its own areas. Empty until the tree lands (region hues only, as before).
  const slugsByShard = useMemo(() => areaSlugsByShard(tree ?? []), [tree]);

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
  // Bumped by the error boundary's Retry: a new key remounts TileWineMap from
  // scratch (a fresh MapLibre instance) and clears the boundary's error.
  const [mapKey, setMapKey] = useState(0);
  const remountMap = useCallback(() => setMapKey((key) => key + 1), []);

  // The three selection requests all go through the per-key cache
  // (@/lib/wine-map/place-cache), so clicking back to a place already visited
  // makes NO request at all. Each effect keeps its own `cancelled` guard
  // exactly as before: the cache only changes whether a request goes out, never
  // which response is allowed to win.
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    loadWinePlaceContext(supabase, selectedKey)
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
    loadArchetypesForPlace(supabase, selectedKey)
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

  // Wine styles carry a colour dimension the context RPC does not return
  // ("White sparkling" / "Rosé sparkling"), so they stay their own request —
  // but keyed by the canonical key, it can start WITH the context RPC instead
  // of ~400 ms behind it, which is where it used to sit when KnowledgeSections
  // owned the fetch. Key-tagged for the same reason the archetypes are.
  const [styleData, setStyleData] = useState<{
    key: string;
    rows: StyleRow[];
  } | null>(null);
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    loadPlaceStyles(supabase, selectedKey)
      .then((rows) => {
        if (!cancelled) setStyleData({ key: selectedKey, rows });
      })
      .catch(() => {
        if (!cancelled) setStyleData({ key: selectedKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);
  const styleRows =
    styleData && styleData.key === selectedKey ? styleData.rows : [];

  // A cache hit applied SYNCHRONOUSLY with the selection. Without this a
  // revisit still commits one "Loading…" frame, because a resolved promise
  // lands in a microtask after the commit. The cached values are the same
  // object references the effects will resolve to, so React bails out of the
  // second pass rather than rendering twice.
  const applyCachedSelection = useCallback((key: string) => {
    const cachedContext = peekWinePlaceContext(key);
    if (cachedContext) {
      setContext(cachedContext);
      setContextState("ready");
    } else {
      setContextState("loading");
    }
    const cachedArchetypes = peekArchetypesForPlace(key);
    if (cachedArchetypes) setArchetypeData({ key, rows: cachedArchetypes });
    const cachedStyles = peekPlaceStyles(key);
    if (cachedStyles) setStyleData({ key, rows: cachedStyles });
  }, []);

  // Nothing cached here is per-user — every policy behind the place catalogue
  // is content-level and get_wine_place_context is SECURITY INVOKER over the
  // same tables, so two signed-in viewers get identical payloads. This is the
  // guard against a future policy that IS per-user: swapping accounts empties
  // the maps rather than serving the previous account's reads.
  useEffect(() => {
    let currentUserId: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (currentUserId === undefined) {
        currentUserId = nextUserId;
        return;
      }
      if (nextUserId !== currentUserId) {
        currentUserId = nextUserId;
        clearWinePlaceCaches();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // Hovering or focusing a place row for a moment warms its details, so the
  // click that follows renders from cache. Desktop only — the rule refuses
  // every call on a coarse/hoverless pointer.
  const prefetch = useWinePlacePrefetch(supabase, selectedKey);

  // Selection updates the URL in place (shareable deep links) while
  // preserving any other params — including ?map=tiles during the opt-in
  // phase — without a Next navigation round-trip.
  // Rides along into cameraTarget: map taps never move the camera, only
  // tree/search/details navigation flies (deep links keep the "ui" default).
  const selectSourceRef = useRef<"map" | "ui">("ui");
  const select = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      // Same-key selection must be a no-op: the context effect only re-runs
      // when selectedKey changes, so setting "loading" here would never
      // resolve. The early return comes FIRST — writing the source ref before
      // it let a map tap on an already-pending tree selection flip that
      // selection's source to "map", which cancels its fly-to with no later
      // commit able to recover it.
      if (key === selectedKey) return;
      selectSourceRef.current = source;
      setChipFocus(null);
      applyCachedSelection(key);
      // Start the three requests here rather than leaving them to the effects
      // below, which React only flushes after this commit has painted the map
      // as well as the panel. The effects then join the in-flight request
      // instead of making a second one.
      warmWinePlace(supabase, key);
      setSelectedKey(key);
      const params = new URLSearchParams(window.location.search);
      params.set("place", key);
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    [applyCachedSelection, selectedKey, supabase],
  );

  // Respond to a new ?place from a SAME-route navigation (e.g. the global search
  // while already on the map): the map page re-renders with a new
  // initialPlaceKey, so select it. Guarded so the initial mount (selectedKey
  // already equals initialPlaceKey) and same-key pushes are no-ops.
  //
  // Adjusted during render rather than in an effect. This is state derived from
  // a prop, which is React's documented case for the pattern, and it avoids the
  // extra commit-then-rerender pass an effect would cost. No history write is
  // needed on this path either: the router has ALREADY put the new key in the
  // URL, so select()'s replaceState would only rewrite what is there.
  // This fires ONLY when the prop CHANGES between renders, which is the only
  // real signal that a navigation happened. Nothing else may move the
  // watermark.
  //
  // Two previous attempts both broke every click, because both made the
  // watermark diverge from the prop while the prop cannot move on its own —
  // select() uses history.replaceState, which deliberately avoids a server
  // round-trip, so initialPlaceKey keeps whatever the last real navigation
  // rendered:
  //   - Comparing the prop against selectedKey: any selection differs from the
  //     prop, so it fired and set the selection straight back.
  //   - Advancing the watermark inside select(): the watermark then differed
  //     from the prop, so it fired and set the selection straight back.
  // Both reverted the selection during the same render pass, for every blob on
  // the map, whenever the page had been loaded with a ?place= (i.e. after any
  // refresh, since select() writes one into the URL).
  //
  // Known limitation, deliberately accepted: re-navigating to the SAME ?place=
  // after selecting something else does not re-select it, because the prop is
  // unchanged and is therefore indistinguishable from no navigation at all.
  // That is a rare no-op; the alternatives above are a map you cannot click.
  const [lastInitialKey, setLastInitialKey] = useState(initialPlaceKey);
  const deepLink = deepLinkAction({ initialPlaceKey, lastInitialKey, selectedKey });
  if (deepLink) {
    setLastInitialKey(deepLink.nextWatermark);
    if (deepLink.select) {
      // Navigation-driven selection flies the camera, exactly as select() does
      // for tree/search clicks; only map taps hold it still.
      selectSourceRef.current = "ui";
      applyCachedSelection(deepLink.select);
      setSelectedKey(deepLink.select);
      setChipFocus(null);
    }
  }

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

  // The map's selection emphasis while the tree is missing (loading, failed,
  // or older than the tiles): the context's children and parent — and only
  // once the context describes the current selection, not the previous one.
  const selectionFallback = useMemo(
    () => fallbackFromContext(context, selectedKey),
    [context, selectedKey],
  );

  // The tree's countries, in the label language's order, with per-country
  // counts while a grape filter is on.
  const chips = useMemo(
    () => countryChips(tree ?? [], { english, visibleKeys }),
    [tree, english, visibleKeys],
  );
  // One country: focus the country (no selection), and fly only if it is off
  // screen or the map is below shard zoom. TileWineMap judges that at apply
  // time from its live zoom. All countries: every country already has
  // subregions, so a chip is a plain jump and always flies.
  const chooseChip = useCallback(
    (country: string) => {
      if (detail === "one") {
        setChipFocus((prev) => chipOnTap(prev, country, report.countriesInView));
      }
      const bbox = manifest
        ? countryCameraBox(bboxesForCountry(manifest.shards, shardCountries, country))
        : null;
      if (!bbox) return;
      setCameraRequest((prev) => ({
        bbox,
        minZoom: CHIP_MIN_ZOOM,
        nonce: (prev?.nonce ?? 0) + 1,
        stayIfVisible: detail === "one" ? country : null,
      }));
    },
    [detail, manifest, report.countriesInView, shardCountries],
  );
  const focusName = useMemo(() => {
    const root = report.focusCountry
      ? (tree ?? []).find((node) => node.key === report.focusCountry)
      : undefined;
    if (!root) return null;
    return english ? englishName(root.name) : root.name;
  }, [report.focusCountry, tree, english]);
  // "Subregions shown" is claimed only once they are drawn, meaning the map's
  // scan saw tier >= 2 features of the focus country on screen.
  const depthShown =
    report.focusCountry !== null && report.depthCountries.includes(report.focusCountry);
  const detailLine = detailStatus({
    tree: treeLoad.state,
    detail,
    fellBack,
    focusName,
    depthVisible: depthShown,
    otherCountriesInView: report.countriesInView.some(
      (country) => country !== report.focusCountry,
    ),
    // Past NEIGHBOUR_MIN_ZOOM with nothing drawn, "zoom in" is no longer
    // honest advice (controller ruling R3); the map judges it from the same
    // idle scan that measured depth.
    pastDepthZoom: report.pastDepthZoom,
  });
  const markedChip = detail === "one" && depthShown ? report.focusCountry : null;

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
        className={`flex flex-col gap-4 xl:flex-row xl:items-stretch ${
          // Height-lock the row on desktop only. On mobile the expanded view
          // is a normal scrolling column (map first, near-fullscreen), so the
          // flex algorithm can never crush the map card to zero height.
          expanded ? "xl:min-h-0 xl:flex-1" : ""
        }`}
      >
        {treeOpen ? (
          <Card
            className={`order-3 xl:order-1 xl:w-[280px] xl:shrink-0 ${
              expanded ? "" : "xl:sticky xl:top-6 xl:self-start"
            }`}
          >
            <CardContent
              className={`flex flex-col pt-4 ${
                expanded
                  ? "h-[70vh] min-h-0 xl:h-full"
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
                  // No collapse on phones: the reopen tab is desktop-only, so
                  // collapsing there left the hierarchy gone with no way back.
                  className="text-muted-foreground hover:text-foreground max-xl:hidden"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {treeLoad.state === "failed" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center">
                    <p className="text-sm text-muted-foreground">
                      Couldn&apos;t load the place list.
                    </p>
                    <button
                      type="button"
                      onClick={() => dispatchTree({ type: "retry" })}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Retry
                    </button>
                  </div>
                ) : tree === null ? (
                  <div className="h-full animate-pulse rounded-md bg-muted" />
                ) : (
                  <WineMapTree
                    roots={tree}
                    selectedKey={selectedKey}
                    onSelect={select}
                    filterKeys={visibleKeys}
                    english={english}
                    onPrefetch={prefetch}
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
            className={`order-3 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-1 xl:flex xl:w-9 xl:items-start xl:justify-center ${
              expanded ? "" : "xl:sticky xl:top-6 xl:self-start"
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
              ? "order-1 min-w-0 shrink-0 overflow-hidden xl:order-2 xl:flex-1 xl:shrink"
              : "order-1 min-w-0 flex-1 overflow-hidden xl:order-2"
          }
        >
          <CardContent
            className={`pt-4 ${expanded ? "flex h-full min-h-0 flex-col" : ""}`}
          >
            {/* Map filters: pick a grape and only places using it stay on
                the map (France's outline remains as context). More filter
                kinds will join this bar. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
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
              {/* Label language: native local names vs English exonyms
                  (Italia->Italy, Toscana->Tuscany), across the map + tree. */}
              <div className="ml-auto flex items-center rounded-md border border-border p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => chooseLang(false)}
                  aria-pressed={!english}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors",
                    !english
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => chooseLang(true)}
                  aria-pressed={english}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors",
                    english
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  English
                </button>
              </div>
            </div>
            {/* Map detail (spec 2026-09-23 §7.1): the One | All switch with its
                status line, then the country chips. Both rows hold a fixed
                height from first paint, so the map below never moves when the
                status text or the chip list changes. */}
            <div className="mb-3 flex shrink-0 flex-col gap-2">
              <MapDetailControls
                mode={detail}
                onModeChange={setDetail}
                status={detailLine}
                onRetry={() => dispatchTree({ type: "retry" })}
              />
              <CountryChips
                chips={chips}
                markedKey={markedChip}
                loading={treeLoad.state === "loading"}
                onChoose={chooseChip}
              />
            </div>
            {/* Expanded on mobile needs a definite height: the lg full-view
                relies on a flex-1/min-h-0 chain that only exists in the
                xl:flex-row layout — in the phone column the hierarchy card's
                natural height swallowed it and the map collapsed to zero. */}
            <div
              className={
                expanded
                  ? "h-[calc(100dvh-12rem)] xl:h-auto xl:min-h-0 xl:flex-1"
                  : "h-[70vh] min-h-[420px]"
              }
            >
            {manifest ? (
              // Any render or effect error inside the map (or a failed
              // next/dynamic chunk after a deploy) lands here instead of
              // replacing the whole page.
              <MapErrorBoundary resetKey={mapKey} onRetry={remountMap}>
                <TileWineMap
                  key={mapKey}
                  manifest={manifest}
                  selectedKey={selectedKey}
                  tree={tree}
                  selectionFallback={selectionFallback}
                  selectedContextKey={context?.place.key ?? null}
                  cameraTarget={cameraTarget}
                  onSelect={select}
                  visibleKeys={visibleKeys}
                  shardCountries={shardCountries}
                  areaSlugsByShard={slugsByShard}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((value) => !value)}
                  detail={detail}
                  chipCountry={chipFocus?.country ?? null}
                  cameraRequest={cameraRequest}
                  onDetailReport={handleDetailReport}
                  onContextLost={dropToOne}
                  onHealthy={confirmHealthy}
                  english={english}
                />
              </MapErrorBoundary>
            ) : manifestError ? (
              <MapUnavailableCard onRetry={retryManifest} />
            ) : (
              <div className="h-full animate-pulse rounded-lg border bg-muted" />
            )}
            </div>
          </CardContent>
        </Card>

        {detailsOpen ? (
        <Card
          className={cn(
            "xl:order-3 xl:w-[320px] xl:shrink-0",
            // On phones this panel detaches into a frozen sheet pinned to the
            // bottom of the screen; tapping its bar folds it open into a
            // near-fullscreen scrollable profile and back down again.
            "max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-40 max-xl:border-t max-xl:border-border max-xl:shadow-[0_-8px_24px_rgba(0,0,0,0.10)]",
            sheetOpen ? "max-xl:top-14 max-xl:flex max-xl:flex-col" : "",
            expanded ? "xl:overflow-y-auto" : "",
          )}
        >
          <CardContent
            className={cn(
              "flex flex-col gap-3 pt-4",
              sheetOpen ? "max-xl:h-full max-xl:min-h-0" : "",
            )}
          >
            <button
              type="button"
              onClick={() => setSheetOpen((open) => !open)}
              aria-expanded={sheetOpen}
              className="flex items-center justify-between gap-2 text-left xl:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </span>
                <span className="truncate text-sm font-medium">
                  {context
                    ? english
                      ? englishName(context.place.name)
                      : context.place.name
                    : "Click on areas to learn more"}
                </span>
              </span>
              <ChevronUp
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  sheetOpen ? "rotate-180" : "",
                )}
              />
            </button>
            <div className="hidden items-center justify-between xl:flex">
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
                  ? "max-xl:min-h-0 max-xl:flex-1 max-xl:overflow-y-auto"
                  : "max-xl:hidden",
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
                    {english ? englishName(context.place.name) : context.place.name}
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
                <KnowledgeSections
                  context={context}
                  onSelect={select}
                  styleRows={styleRows}
                  onPrefetch={prefetch}
                />
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
            className="order-2 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-3 xl:flex xl:w-9 xl:items-start xl:justify-center"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </div>
      {/* Reserve room so the frozen mobile sheet's bar never hides the last
          of the page content beneath it. */}
      <div aria-hidden className="h-20 xl:hidden" />
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
